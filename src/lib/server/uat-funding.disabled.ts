import { NextResponse } from "next/server";

export async function fundUatWallet() {
  return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
}
