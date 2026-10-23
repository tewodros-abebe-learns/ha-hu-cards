import { createEmptyCard, fsrs, State, type Card, type Grade } from 'ts-fsrs';
import type { FlashcardData } from './models';

export type StoredMemory = Omit<Card, 'due' | 'last_review'> & { due: number; last_review: number | null };
export interface ReviewData {
  version: 1;
  revision: string;
  memory: StoredMemory;
  paused: boolean;
  group: string;
  introducedDay: string;
  reviewedDay: string;
  failures: number;
  history: { at: number; rating: number; id: string }[];
}
export type ScheduleSnapshot = Pick<FlashcardData, 'review' | 'interval' | 'nextReview' | 'easeFactor'>;
export const scheduler = fsrs({ request_retention: 0.9, maximum_interval: 36500, enable_fuzz: false, learning_steps: ['1m', '10m'], relearning_steps: ['1m', '10m'] });
export function localDay(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function storeMemory(card: Card): StoredMemory {
  return { ...card, due: card.due.getTime(), last_review: card.last_review?.getTime() ?? null };
}
export function initialReview(card: ScheduleSnapshot, now: number): ReviewData {
  const memory = createEmptyCard(now);
  memory.due = new Date(card.nextReview ?? now);
  // Old schedules have no review history: retain the due date, and initialize a
  // conservative approximation only when the card first enters this workflow.
  if ((card.interval || 0) > 0) {
    memory.state = State.Review;
    memory.stability = Math.max(0.1, Math.min(36500, card.interval!));
    memory.difficulty = 5;
    memory.reps = 1;
    memory.scheduled_days = Math.max(1, Math.min(36500, Math.round(card.interval!)));
    memory.due = new Date(card.nextReview ?? now);
    memory.last_review = new Date(Math.max(0, (card.nextReview ?? now) - card.interval! * 86400000));
  }
  return { version: 1, revision: '', memory: storeMemory(memory), paused: false, group: '', introducedDay: '', reviewedDay: '', failures: 0, history: [] };
}
export function revision(card: ScheduleSnapshot): string {
  return card.review?.revision || JSON.stringify([card.interval || 0, card.nextReview || 0, card.easeFactor || 2.5]);
}
export function snapshot(card: ScheduleSnapshot): ScheduleSnapshot {
  return { ...(card.review ? { review: structuredClone(card.review) } : {}), interval: card.interval || 0, nextReview: card.nextReview || 0, easeFactor: card.easeFactor || 2.5 };
}
export function scheduleReview(card: ScheduleSnapshot, rating: number, id: string, now: number): ScheduleSnapshot & { review: ReviewData } {
  if (![1, 2, 3, 4].includes(rating) || !Number.isFinite(now) || now < 0 || now > 8e15) throw new Error('Invalid review.');
  const prior = card.review || initialReview(card, now);
  validateReviewData(prior);
  if (prior.paused) throw new Error('This card is paused.');
  const memory: Card = { ...prior.memory, due: new Date(prior.memory.due), ...(prior.memory.last_review === null ? { last_review: undefined } : { last_review: new Date(prior.memory.last_review) }) };
  // No early-review interval inflation: the queue only admits cards when due.
  if (memory.due.getTime() > now) throw new Error('This card is not ready for review yet.');
  const next = scheduler.next(memory, now, rating as Grade).card;
  const day = localDay(now);
  const review: ReviewData = {
    ...prior, revision: id, memory: storeMemory(next),
    introducedDay: prior.introducedDay || (memory.reps === 0 ? day : ''), reviewedDay: day,
    failures: prior.failures + (rating === 1 ? 1 : 0),
    history: [...prior.history, { at: now, rating, id }].slice(-100)
  };
  validateReviewData(review);
  return { review, interval: Math.max(0, (next.due.getTime() - now) / 86400000), nextReview: next.due.getTime() };
}
export function validateReviewData(value: unknown): asserts value is ReviewData {
  const r = value as ReviewData;
  const numeric = (v: unknown, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
  const keys = ['version','revision','memory','paused','group','introducedDay','reviewedDay','failures','history'];
  if (!r || typeof r !== 'object' || Object.keys(r).some(k => !keys.includes(k)) || r.version !== 1 || typeof r.revision !== 'string' || r.revision.length > 128 || typeof r.paused !== 'boolean' || typeof r.group !== 'string' || r.group.length > 80 || ![r.introducedDay, r.reviewedDay].every(v => typeof v === 'string' && (v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v))) || !Number.isInteger(r.failures) || !numeric(r.failures, 1000000)) throw new Error('Invalid saved review settings.');
  const m = r.memory;
  if (!m || typeof m !== 'object' || Object.keys(m).some(k => !['due','stability','difficulty','elapsed_days','scheduled_days','learning_steps','reps','lapses','state','last_review'].includes(k)) || !numeric(m.due, 8.64e15) || !(m.last_review === null || numeric(m.last_review, 8.64e15)) || !numeric(m.stability, 100000) || !numeric(m.difficulty, 10) || !numeric(m.elapsed_days, 100000000) || !numeric(m.scheduled_days, 36500) || ![0,1,2,3].includes(m.state) || ![m.reps, m.lapses, m.learning_steps].every(v => Number.isInteger(v) && numeric(v, 1000000))) throw new Error('Invalid saved memory schedule.');
  if (m.learning_steps > 2 || m.lapses > m.reps || (m.state !== 0 && (m.reps < 1 || m.stability <= 0 || m.difficulty < 1 || m.last_review === null))) throw new Error('Inconsistent saved memory state.');
  if (!Array.isArray(r.history) || r.history.length > 100 || r.history.some(h => !h || !numeric(h.at, 8.64e15) || ![0,1,2,3,4].includes(h.rating) || typeof h.id !== 'string' || h.id.length > 128 || Object.keys(h).some(k => !['at','rating','id'].includes(k)))) throw new Error('Invalid review history.');
}
export function cardKind(card: FlashcardData): 'new' | 'learning' | 'review' {
  if (card.review) return card.review.memory.state === 0 ? 'new' : [1,3].includes(card.review.memory.state) ? 'learning' : 'review';
  return (card.interval || 0) > 0 ? 'review' : 'new';
}
export function relatedKey(card: FlashcardData): string {
  return card.review?.group ? `group:${card.review.group.trim().toLocaleLowerCase()}` : card.frontText?.trim() ? `front:${card.unitId}:${card.frontText.trim().toLocaleLowerCase()}` : `card:${card.id}`;
}
export interface ReviewLimits { newCards: number; reviews: number; spaceRelated: boolean }
export function reviewQueue(all: FlashcardData[], scope: string | null, limits: ReviewLimits, now = Date.now()) {
  const day = localDay(now);
  const introduced = all.filter(c => c.review?.introducedDay === day).length;
  const reviewed = all.filter(c => c.review?.reviewedDay === day && c.review.introducedDay !== day).length;
  const scoped = all.filter(c => (!scope || c.unitId === scope) && !c.review?.paused);
  const seenGroups = new Map<string, Set<string>>();
  if (limits.spaceRelated) for (const c of all) if (c.review?.reviewedDay === day) {
    const key = relatedKey(c); const ids = seenGroups.get(key) || new Set<string>();
    ids.add(c.id); seenGroups.set(key, ids);
  }
  const related = (c: FlashcardData) => {
    // Never bury a learning step already in progress, even if a sibling was
    // reviewed elsewhere or spacing was enabled halfway through the session.
    if (cardKind(c) === 'learning') return false;
    const ids = limits.spaceRelated ? seenGroups.get(relatedKey(c)) : undefined;
    return !!ids && (ids.size > 1 || !ids.has(c.id));
  };
  const ready = scoped.filter(c => (c.nextReview || 0) <= now && !related(c));
  const eligible = ready.filter(c => cardKind(c) === 'learning' || (cardKind(c) === 'new' ? introduced < limits.newCards : c.review?.reviewedDay === day || reviewed < limits.reviews));
  const priority = (c: FlashcardData) => cardKind(c) === 'learning' ? 0 : cardKind(c) === 'review' ? 1 : 2;
  eligible.sort((a,b) => priority(a)-priority(b) || (a.nextReview || 0)-(b.nextReview || 0) || a.id.localeCompare(b.id));
  const waiting = scoped.filter(c => cardKind(c) === 'learning' && !related(c) && (c.nextReview || 0) > now);
  return { eligible, ready: ready.length, limited: ready.length - eligible.length, newCount: scoped.filter(c => cardKind(c) === 'new').length, learningCount: scoped.filter(c => cardKind(c) === 'learning').length, later: scoped.filter(c => (c.nextReview || 0) > now).length, hidden: scoped.filter(related).length, nextLearning: waiting.length ? waiting.reduce((earliest, c) => Math.min(earliest, c.nextReview!), Infinity) : null };
}

/** Shared by saved-session recovery and the mutation boundary. */
export function validateScheduleSnapshot(value: unknown): asserts value is ScheduleSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid saved review snapshot.');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(key => !['review', 'interval', 'nextReview', 'easeFactor'].includes(key))) throw new Error('Invalid saved review snapshot fields.');
  for (const [key, min, max] of [['interval', 0, 100000], ['nextReview', 0, Number.MAX_SAFE_INTEGER], ['easeFactor', 1, 10]] as const) {
    if (key in v && (typeof v[key] !== 'number' || !Number.isFinite(v[key]) || v[key] < min || v[key] > max)) throw new Error('Invalid saved schedule.');
  }
  if ('review' in v) {
    validateReviewData(v.review);
    if (v.nextReview !== v.review.memory.due) throw new Error('Saved review dates disagree.');
  }
}
