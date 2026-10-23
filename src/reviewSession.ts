import type { ReviewAction } from './dataStore';
import { validateScheduleSnapshot, type ScheduleSnapshot, type ReviewLimits } from './reviewEngine';
export interface ReviewSessionData {
  version: 1;
  owner: string;
  scope: string | null;
  duration: number;
  limits: ReviewLimits;
  completed: number;
  current: { id: string; revision: string; content?: string; deadline: number; shown: boolean } | null;
  pending: { cardId: string; action: ReviewAction; before: ScheduleSnapshot } | null;
  undo: { cardId: string; expected: string; before: ScheduleSnapshot } | null;
}
export function freshReviewSession(owner: string, scope: string | null, duration = 60): ReviewSessionData {
  return { version: 1, owner, scope, duration, limits: { newCards: 20, reviews: 200, spaceRelated: true }, completed: 0, current: null, pending: null, undo: null };
}
export function parseReviewSession(raw: string): ReviewSessionData {
  if (raw.length > 250000) throw new Error('Saved session is too large.');
  const s = JSON.parse(raw) as ReviewSessionData;
  const id = (v: unknown) => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
  const bounded = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
  const snap: typeof validateScheduleSnapshot = validateScheduleSnapshot;
  const object = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
  const expected = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 256;
  if (!object(s) || !object(s.limits) || ![s.current, s.pending, s.undo].every(v => v === null || object(v))) throw new Error('Invalid saved review structure.');
  if (!s || s.version !== 1 || !id(s.owner) || !(s.scope === null || id(s.scope)) || !bounded(s.duration, 1, 86400) || !bounded(s.completed, 0, 1000000) || !s.limits || !bounded(s.limits.newCards, 0, 1000) || !bounded(s.limits.reviews, 0, 10000) || typeof s.limits.spaceRelated !== 'boolean') throw new Error('Invalid saved review session.');
  if (s.current && (!id(s.current.id) || !expected(s.current.revision) || !bounded(s.current.deadline, 0, 8.64e15) || typeof s.current.shown !== 'boolean' || (s.current.content !== undefined && (typeof s.current.content !== 'string' || s.current.content.length > 128)))) throw new Error('Invalid saved timer.');
  if (s.undo) { if (!id(s.undo.cardId) || !expected(s.undo.expected)) throw new Error('Invalid saved undo.'); snap(s.undo.before); }
  if (s.pending) {
    const { action: a } = s.pending;
    if (!id(s.pending.cardId) || !a || !id(a.id) || !expected(a.expected) || !bounded(a.at, 0, 8e15) || !['rate','settings','undo'].includes(a.kind)) throw new Error('Invalid pending review.');
    if (a.kind === 'rate' && (![1,2,3,4].includes(a.rating) || (a.content !== undefined && (typeof a.content !== 'string' || a.content.length > 128)))) throw new Error('Invalid rating.');
    if (a.kind === 'settings' && (typeof a.paused !== 'boolean' || typeof a.group !== 'string' || a.group.length > 80)) throw new Error('Invalid card settings.');
    if (a.kind === 'undo') snap(a.before);
    snap(s.pending.before);
  }
  return s;
}
