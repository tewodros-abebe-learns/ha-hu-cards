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

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';
const DAY = 86400000;
const MAX_INTERVAL = 36500;

/** Transparent SM-2-inspired scheduling, not Anki's FSRS algorithm.
 * Fractional-day intervals encode learning steps without changing the stored schema.
 * Again = forgotten; Hard = recalled with difficulty. Early successful reviews do
 * not compound intervals. Transactions in dataStore supply the latest card state.
 */
export function calculateReview(card: { easeFactor?: number; interval?: number; nextReview?: number }, rating: ReviewRating, now = Date.now()) {
  if (!['again', 'hard', 'good', 'easy'].includes(rating)) throw new Error('Invalid review rating.');
  if (!Number.isFinite(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - MAX_INTERVAL * DAY) throw new Error('Invalid review time.');
  let easeFactor = Number.isFinite(card.easeFactor) ? Math.max(1.3, Math.min(3.5, card.easeFactor!)) : 2.5;
  const previous = Number.isFinite(card.interval) ? Math.max(0, Math.min(MAX_INTERVAL, card.interval!)) : 0;
  const due = Number.isFinite(card.nextReview) && card.nextReview! > 0 && card.nextReview! <= Number.MAX_SAFE_INTEGER ? card.nextReview! : 0;
  const learning = previous < 1;
  const early = !learning && due > now;
  // Cap overdue credit so a years-old card does not immediately get a huge interval.
  const overdue = due && !learning ? Math.min(previous, Math.max(0, (now - due) / DAY)) : 0;
  let interval: number;
  let nextReview: number | undefined;
  if (rating === 'again') {
    interval = 1 / 1440; // Relearn after one minute, never immediately due in a loop.
    easeFactor -= 0.2;
  } else if (rating === 'hard') {
    easeFactor -= 0.15;
    interval = learning ? 6 / 1440 : early ? Math.max(1, Math.round(previous * 0.5)) : Math.max(previous + 1, Math.round(previous * 1.2));
    if (early) nextReview = Math.min(due, now + interval * DAY);
  } else if (early) {
    interval = previous;
    nextReview = due; // Reopening and rating repeatedly must not inflate the schedule.
  } else if (rating === 'good') {
    interval = learning ? 1 : Math.max(previous + 1, Math.round((previous + overdue * 0.5) * easeFactor));
  } else {
    interval = learning ? 4 : Math.max(previous + 2, Math.round((previous + overdue) * easeFactor * 1.3));
    easeFactor += 0.15;
  }
  easeFactor = Math.max(1.3, Math.min(3.5, Number(easeFactor.toFixed(2))));
  interval = Math.min(MAX_INTERVAL, interval);
  return { easeFactor, interval, nextReview: nextReview ?? now + Math.round(interval * DAY) };
}

export function formatReviewDelay(days: number, language: 'English' | 'Amharic' = 'English'): string {
  const am = language === 'Amharic';
  if (days < 1 / 24) return `${Math.max(1, Math.ceil(days * 1440))} ${am ? 'ደቂቃ' : 'min'}`;
  if (days < 1) return `${Math.ceil(days * 24)} ${am ? 'ሰዓት' : 'h'}`;
  return `${Math.ceil(days)} ${am ? 'ቀን' : 'd'}`;
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
