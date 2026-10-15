const transientNetworkCodes = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
]);

function isRetryable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const details = error as {
    status?: unknown;
    response?: { status?: unknown };
    code?: unknown;
    cause?: unknown;
  };
  const status = details.status ?? details.response?.status;

  if (typeof status === "number") {
    return status === 408 || status === 429 || status >= 500;
  }
  if (typeof details.code === "string" && transientNetworkCodes.has(details.code)) {
    return true;
  }
  return isRetryable(details.cause);
}

function getServerRetryDelayMs(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;

  const details = error as {
    message?: unknown;
    details?: unknown;
    response?: { data?: unknown };
    cause?: unknown;
  };
  const serialized = [details.message, details.details, details.response?.data]
    .map((value) => typeof value === "string" ? value : JSON.stringify(value ?? ""))
    .join(" ");
  const match = serialized.match(/"?retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s"?/i);
  if (match) return Math.ceil(Number(match[1]) * 1000);

  return getServerRetryDelayMs(details.cause);
}

export async function withExponentialBackoff<T>(
  operation: () => Promise<T>,
  description: string,
  maxAttempts = 4,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryable(error)) throw error;
      if (attempt >= maxAttempts) {
        throw new Error(`${description} failed after ${attempt} attempts`, {
          cause: error,
        });
      }
      const delayMs = getServerRetryDelayMs(error) ?? Math.min(1000 * 2 ** (attempt - 1), 8000);
      console.warn(`${description} failed; retrying in ${delayMs}ms (${attempt}/${maxAttempts - 1})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}