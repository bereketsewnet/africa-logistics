interface WindowCounter {
  count: number
  windowStart: number
}

interface OtpFailureState {
  count: number
  firstFailedAt: number
  lockedUntil: number
}

const counters = new Map<string, WindowCounter>()
const otpFailures = new Map<string, OtpFailureState>()

export function consumeWindowLimit(
  key: string,
  maxHits: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds: number; remaining: number } {
  const now = Date.now()
  const current = counters.get(key)

  if (!current || now - current.windowStart >= windowMs) {
    counters.set(key, { count: 1, windowStart: now })
    return { allowed: true, retryAfterSeconds: 0, remaining: Math.max(0, maxHits - 1) }
  }

  if (current.count >= maxHits) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.windowStart + windowMs - now) / 1000))
    return { allowed: false, retryAfterSeconds, remaining: 0 }
  }

  current.count += 1
  counters.set(key, current)

  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: Math.max(0, maxHits - current.count),
  }
}

export function getOtpLockState(key: string): { locked: boolean; retryAfterSeconds: number } {
  const now = Date.now()
  const state = otpFailures.get(key)
  if (!state) return { locked: false, retryAfterSeconds: 0 }

  if (state.lockedUntil > now) {
    return {
      locked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((state.lockedUntil - now) / 1000)),
    }
  }

  if (state.lockedUntil > 0 && state.lockedUntil <= now) {
    otpFailures.delete(key)
  }

  return { locked: false, retryAfterSeconds: 0 }
}

export function recordOtpFailure(
  key: string,
  maxFailures: number,
  windowMs: number,
  lockMs: number
): { locked: boolean; retryAfterSeconds: number; remaining: number } {
  const now = Date.now()
  const current = otpFailures.get(key)

  let next: OtpFailureState
  if (!current || now - current.firstFailedAt >= windowMs || current.lockedUntil <= now && current.lockedUntil !== 0) {
    next = { count: 1, firstFailedAt: now, lockedUntil: 0 }
  } else {
    next = { ...current, count: current.count + 1 }
  }

  if (next.count >= maxFailures) {
    next.lockedUntil = now + lockMs
    otpFailures.set(key, next)
    return {
      locked: true,
      retryAfterSeconds: Math.max(1, Math.ceil(lockMs / 1000)),
      remaining: 0,
    }
  }

  otpFailures.set(key, next)
  return {
    locked: false,
    retryAfterSeconds: 0,
    remaining: Math.max(0, maxFailures - next.count),
  }
}

export function clearOtpFailures(key: string): void {
  otpFailures.delete(key)
}
