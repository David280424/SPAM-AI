export async function withExponentialBackoff<T>(
  operation: () => Promise<T>,
  description: string,
  maxAttempts = 4,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxAttempts) {
        throw new Error(`${description} failed after ${attempt} attempts`, {
          cause: error,
        });
      }
      const delayMs = Math.min(1000 * 2 ** (attempt - 1), 8000);
      console.warn(`${description} failed; retrying in ${delayMs}ms (${attempt}/${maxAttempts - 1})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}