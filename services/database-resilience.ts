export function isTransientDatabaseError(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const message = error instanceof Error ? error.message : String(error);
  return (
    [
      "57P01",
      "57P02",
      "57P03",
      "ECONNREFUSED",
      "ECONNRESET",
      "ENOENT",
    ].includes(code) ||
    /connection terminated|database system is (?:shutting down|starting up)|connect ECONNREFUSED|socket .* does not exist/i.test(
      message,
    )
  );
}

export async function waitForDatabaseRecovery(
  probe: () => Promise<unknown>,
  label: string,
  retryDelayMs = 1_000,
) {
  for (;;) {
    try {
      await probe();
      return;
    } catch (error) {
      if (!isTransientDatabaseError(error)) throw error;
      process.stderr.write(
        `${new Date().toISOString()} ${label}: waiting for PostgreSQL recovery\n`,
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}
