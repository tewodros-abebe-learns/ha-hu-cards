export function remainingSeconds(deadline: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function dateBoundaries(now = new Date()) {
  return {
    startOfToday: new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(),
    startOfTomorrow: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime(),
    startOfDayAfter: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).getTime()
  };
}

const states = ['COUNTDOWN', 'ALARM', 'REVEAL_DELAY', 'READY_TO_REVEAL', 'ANSWER_SHOWN', 'SESSION_COMPLETE'];
export function parseStoredSession(raw: string | null): { state: string; timeLeft: number; revealDelayLeft: number; cyclesLeft: number; timestamp: number } | null {
  try {
    const data = JSON.parse(raw || 'null');
    if (!data || !states.includes(data.state) ||
      ![data.timeLeft, data.revealDelayLeft, data.cyclesLeft, data.timestamp].every(Number.isFinite) ||
      data.timeLeft < 0 || data.timeLeft > 86400 || data.revealDelayLeft < 0 || data.revealDelayLeft > 86400 || !Number.isInteger(data.cyclesLeft) || data.cyclesLeft < 1 || data.cyclesLeft > 100 || data.timestamp < 0 || data.timestamp > Date.now() + 60000) return null;
    return data;
  } catch { return null; }
}

export function validSessionConfig(config: unknown): config is { cycles: number; revealDelay: number; notifications?: boolean } {
  if (!config || typeof config !== 'object') return false;
  const value = config as Record<string, unknown>;
  return typeof value.cycles === 'number' && Number.isInteger(value.cycles) && value.cycles >= 1 && value.cycles <= 100 &&
    typeof value.revealDelay === 'number' && Number.isFinite(value.revealDelay) && value.revealDelay >= 0 && value.revealDelay <= 86400 &&
    (value.notifications === undefined || typeof value.notifications === 'boolean');
}

export function calculateReview(card: { easeFactor?: number; interval?: number }, rating: 'hard' | 'good' | 'easy', now = Date.now()) {
  let easeFactor = Number.isFinite(card.easeFactor) && card.easeFactor! >= 1.3 ? card.easeFactor! : 2.5;
  let interval = Number.isFinite(card.interval) && card.interval! >= 0 ? card.interval! : 0;
  if (rating === 'hard') { interval = 0; easeFactor -= 0.15; }
  else if (rating === 'good') interval = interval === 0 ? 1 : Math.round(interval * easeFactor);
  else { interval = interval === 0 ? 4 : Math.round(interval * easeFactor * 1.3); easeFactor += 0.15; }
  easeFactor = Math.max(1.3, Math.min(3.5, Number(easeFactor.toFixed(2))));
  interval = Math.max(0, Math.min(36500, Math.round(interval)));
  return { easeFactor, interval, nextReview: now + interval * 86400000 };
}

/** A mode must never clear another mode's (or tab's) recovery record. */
export function clearOwnedRecovery(storage: { getItem(key: string): string | null; removeItem(key: string): unknown }, recordKey: string, indexKey: string, sessionId: string) {
  for (const key of [recordKey, indexKey]) {
    try {
      if (JSON.parse(storage.getItem(key) || 'null')?.sessionId === sessionId) storage.removeItem(key);
    } catch { /* Unrelated malformed state is not ours to erase. */ }
  }
}

/** Deterministic tie-breaker for simultaneous Lock-In starts in different tabs. */
export function newerSession(other: { sessionId?: unknown; startedAt?: unknown }, current: { sessionId: string; startedAt: number }): boolean {
  return typeof other.sessionId === 'string' && typeof other.startedAt === 'number' && Number.isFinite(other.startedAt) &&
    (other.startedAt > current.startedAt || (other.startedAt === current.startedAt && other.sessionId > current.sessionId));
}
