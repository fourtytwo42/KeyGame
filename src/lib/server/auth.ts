import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { getAddress, isAddress } from "viem";
import { verifyMessage } from "ethers";
import { cookies } from "next/headers";
import { database } from "./db";

const SESSION_COOKIE = "last_bell_session";
const NONCE_TTL_SECONDS = 5 * 60;
const SESSION_TTL_SECONDS = 24 * 60 * 60;

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function expectedOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return new URL(configured).origin;
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const protocol =
    request.headers.get("x-forwarded-proto") ??
    (new URL(request.url).protocol.replace(":", "") || "http");
  return host ? `${protocol}://${host}` : new URL(request.url).origin;
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = expectedOrigin(request);
  if (origin && origin !== expected) {
    throw new Error(
      "Request origin does not match this Saved by the Bell station.",
    );
  }
  return expected;
}

export async function rateLimit(
  bucket: string,
  subject: string,
  limit: number,
  windowSeconds: number,
) {
  const result = await database.query<{ request_count: number }>(
    `INSERT INTO request_rate_limits(bucket,subject,window_started_at,request_count)
     VALUES($1,$2,now(),1)
     ON CONFLICT(bucket,subject) DO UPDATE SET
       request_count = CASE
         WHEN request_rate_limits.window_started_at <
              now() - ($3::text || ' seconds')::interval THEN 1
         ELSE request_rate_limits.request_count + 1
       END,
       window_started_at = CASE
         WHEN request_rate_limits.window_started_at <
              now() - ($3::text || ' seconds')::interval THEN now()
         ELSE request_rate_limits.window_started_at
       END
     RETURNING request_count`,
    [bucket, subject, windowSeconds],
  );
  if (result.rows[0].request_count > limit) {
    throw new Error("Too many requests. Let the line cool down and try again.");
  }
}

export async function createSiweChallenge(input: {
  request: Request;
  address: string;
  chainId: number;
}) {
  if (!isAddress(input.address)) throw new Error("Wallet address is invalid.");
  const origin = requireSameOrigin(input.request);
  const domain = new URL(origin).host;
  const address = getAddress(input.address);
  const nonce = randomBytes(16).toString("base64url");
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_SECONDS * 1_000);
  const message = `${domain} wants you to sign in with your Ethereum account:
${address}

Tune your wallet to Saved by the Bell. This does not authorize a transaction or token spend.

URI: ${origin}
Version: 1
Chain ID: ${input.chainId}
Nonce: ${nonce}
Issued At: ${issuedAt.toISOString()}
Expiration Time: ${expiresAt.toISOString()}`;
  await database.query(
    `INSERT INTO auth_nonces(
       nonce_hash,address,chain_id,domain,origin,message,expires_at)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [
      sha256(nonce),
      address.toLowerCase(),
      input.chainId,
      domain,
      origin,
      message,
      expiresAt,
    ],
  );
  return { message, expiresAt: expiresAt.toISOString() };
}

export async function verifySiweChallenge(input: {
  request: Request;
  message: string;
  signature: string;
}) {
  const nonce = input.message.match(/^Nonce: ([A-Za-z0-9_-]+)$/m)?.[1];
  if (!nonce) throw new Error("The sign-in message has no valid nonce.");
  const result = await database.query<{
    address: string;
    chain_id: string;
    domain: string;
    origin: string;
    message: string;
  }>(
    `UPDATE auth_nonces SET consumed_at=now()
     WHERE nonce_hash=$1 AND consumed_at IS NULL AND expires_at>now()
       AND message=$2
     RETURNING address,chain_id,domain,origin,message`,
    [sha256(nonce), input.message],
  );
  const challenge = result.rows[0];
  if (!challenge) throw new Error("This sign-in request expired or was used.");
  const origin = requireSameOrigin(input.request);
  if (
    challenge.origin !== origin ||
    challenge.domain !== new URL(origin).host
  ) {
    throw new Error("The sign-in domain or origin does not match.");
  }
  const recovered = getAddress(verifyMessage(input.message, input.signature));
  if (recovered.toLowerCase() !== challenge.address) {
    throw new Error("The signature does not match the requested wallet.");
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1_000);
  await database.query(
    `INSERT INTO auth_sessions(
       token_hash,address,chain_id,domain,origin,expires_at)
     VALUES($1,$2,$3,$4,$5,$6)`,
    [
      sha256(token),
      challenge.address,
      challenge.chain_id,
      challenge.domain,
      challenge.origin,
      expiresAt,
    ],
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: origin.startsWith("https://"),
    path: "/",
    expires: expiresAt,
  });
  return {
    address: getAddress(challenge.address),
    chainId: Number(challenge.chain_id),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function getSession(request?: Request) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const result = await database.query<{
    address: `0x${string}`;
    chain_id: string;
    origin: string;
    expires_at: Date;
  }>(
    `SELECT address,chain_id,origin,expires_at FROM auth_sessions
     WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()`,
    [sha256(token)],
  );
  const session = result.rows[0];
  if (!session) return null;
  if (request && session.origin !== expectedOrigin(request)) return null;
  return {
    address: getAddress(session.address),
    chainId: Number(session.chain_id),
    expiresAt: session.expires_at.toISOString(),
  };
}

export async function requireSession(request: Request) {
  requireSameOrigin(request);
  const session = await getSession(request);
  if (!session) throw new Error("Sign in with your wallet first.");
  return session;
}

export async function revokeSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await database.query(
      "UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1",
      [sha256(token)],
    );
  }
  jar.delete(SESSION_COOKIE);
}
