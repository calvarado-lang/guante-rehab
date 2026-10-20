export const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000] as const

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds))
}

export async function retryWithBackoff(
  operation: () => Promise<void>,
  onAttempt: (attempt: number) => void,
): Promise<void> {
  let lastError: unknown

  for (let index = 0; index < RECONNECT_DELAYS_MS.length; index += 1) {
    const attempt = index + 1
    onAttempt(attempt)
    await wait(RECONNECT_DELAYS_MS[index])

    try {
      await operation()
      return
    } catch (error) {
      lastError = error
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }
  throw new Error('No fue posible reconectar el guante después de 5 intentos.')
}
