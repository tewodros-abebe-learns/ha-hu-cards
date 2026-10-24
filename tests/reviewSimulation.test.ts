import test from 'node:test';
import assert from 'node:assert/strict';
import type { FlashcardData } from '../src/models';
import {
  initialReview, localDay, reviewQueue, scheduleReview, snapshot, validateReviewData, revision
} from '../src/reviewEngine';
import { applyReviewAction } from '../src/dataStore';
import { readLocalLibrary } from '../src/localLibrary';
import type { User } from '../src/firebase';

const START = Date.UTC(2026, 9, 23, 9);
const HOUR = 3600000;
const DAY = 86400000;
const limits = { newCards: 20, reviews: 200, spaceRelated: false };

const card = (id: string, folder: string, extras: Partial<FlashcardData> = {}): FlashcardData => ({
  id, unitId: folder, ownerId: 'guest_sim', cardName: id, frontText: `Q ${id}`,
  backText: `A ${id}`, nextReview: 0, ...extras
} as FlashcardData);

/** Deterministic PRNG so a failure is reproducible. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function assertSane(c: FlashcardData, at: number, context: string) {
  const review = c.review!;
  assertSaneReview(review, at, context);
  assert.equal(c.nextReview, review.memory.due, `${context}: legacy due must equal memory due`);
  assert.ok(c.nextReview! > at, `${context}: a rating must schedule the future`);
  assert.ok(c.interval! >= 0 && c.interval! <= 36500, `${context}: legacy interval bounds`);
}

function assertSaneReview(review: FlashcardData['review'], at: number, context: string) {
  assert.ok(review, `${context}: review metadata present`);
  validateReviewData(review);
  assert.ok(review.memory.due > at, `${context}: memory due must be in the future`);
  assert.ok(review.memory.due <= 8.64e15, `${context}: due stays in range`);
  assert.ok(review.history.length <= 100, `${context}: history bound`);
  assert.equal(review.history.at(-1)?.rating !== 0, true, `${context}: undo rating is never stored as a rating`);
  assert.ok(!Number.isNaN(review.memory.stability) && review.memory.stability < Infinity, `${context}: stability finite`);
}

test('easy → forgotten → easy on one card keeps a sane, ordered schedule', () => {
  let c = card('mixed', 'deck-a');
  let at = START;
  const steps: { rating: number; delay: number }[] = [];
  for (const rating of [4, 1, 4, 1, 3, 2, 4]) {
    const before = c.review?.memory.reps || 0;
    const next = scheduleReview(c, rating, `mixed-${rating}-${at}`, at);
    steps.push({ rating, delay: next.nextReview! - at });
    c = { ...c, ...next };
    assertSane(c, at, `mixed step ${steps.length}`);
    assert.equal(c.review!.memory.reps, before + 1, 'every rating counts exactly one repetition');
    assert.equal(c.review!.failures, steps.filter(s => s.rating === 1).length, 'only Forgot counts a failure');
    at = c.nextReview!;
  }
  // A new card starts at the requested values, and every answer stays positive.
  assert.deepEqual(steps.slice(0, 3).map(s => s.delay), [3 * DAY, 2 * HOUR, 3 * DAY]);
  assert.ok(steps.every(s => s.delay > 0));
  // Easy is never scheduled sooner than Remembered for the same card state.
  const preview = (rating: number) => scheduleReview(c, rating, `order-${rating}`, at).nextReview! - at;
  assert.ok(preview(1) < preview(3));
  assert.ok(preview(2) <= preview(3));
  assert.ok(preview(3) <= preview(4));
});

test('every rating pair on fresh and mature cards stays ordered and in range', () => {
  const fresh = card('fresh', 'deck-a');
  const freshStable = { ...fresh, ...scheduleReview(fresh, 3, 'seed', START) };
  const mature = {
    ...fresh,
    review: {
      ...freshStable.review!,
      memory: { ...freshStable.review!.memory, stability: 120, difficulty: 6, scheduled_days: 120, reps: 9, due: START },
      history: []
    },
    nextReview: START,
    interval: 120
  } as FlashcardData;
  for (const base of [fresh, freshStable, mature]) {
    // A seeded card becomes due at its own scheduled time, not at the origin.
    const baseAt = Math.max(START, base.review?.memory.due || 0);
    for (const first of [1, 2, 3, 4]) {
      const after = { ...base, ...scheduleReview(base, first, `pair-${first}`, baseAt) };
      assertSane(after, baseAt, `pair seed ${first}`);
      for (const second of [1, 2, 3, 4]) {
        const at = after.nextReview!;
        const next = scheduleReview(after, second, `pair-${first}-${second}`, at);
        const result = { ...after, ...next };
        assertSane(result, at, `pair ${first}->${second}`);
        // Forgetting always comes back first, and Easy never before Remembered.
        if (second === 1) assert.equal(next.nextReview! - at, 2 * HOUR);
        if (second === 3) assert.ok(next.nextReview! - at > 4 * HOUR);
      }
    }
  }
});

test('random mixed reviews across several decks keep every invariant', () => {
  const random = rng(20261023);
  const folders = ['deck-a', 'deck-b', 'deck-c'];
  let cards: FlashcardData[] = [];
  for (let i = 0; i < 18; i++) cards.push(card(`c${i}`, folders[i % folders.length]));
  let at = START;
  const ids = new Set<string>();
  for (let step = 0; step < 900; step++) {
    at += Math.floor(random() * 10 * HOUR);
    const scope = random() < 0.25 ? folders[Math.floor(random() * 3)] : null;
    const queue = reviewQueue(cards, scope, limits, at);
    const idsInQueue = queue.eligible.map(c => c.id);
    assert.equal(new Set(idsInQueue).size, idsInQueue.length, 'queue never repeats a card');
    assert.ok(queue.eligible.every(c => !c.review?.paused), 'paused cards never enter the queue');
    assert.ok(queue.eligible.every(c => !scope || c.unitId === scope), 'queue respects folder scope');
    assert.ok(queue.eligible.every(c => (c.nextReview || 0) <= at), 'only due cards are offered');
    if (!queue.eligible.length) continue;
    // Prefer a mixed pattern: sometimes rate the same card repeatedly as it returns.
    const target = queue.eligible[Math.floor(random() * Math.min(queue.eligible.length, 3))];
    const rating = 1 + Math.floor(random() * 4);
    const id = `op-${step}-${rating}`;
    ids.add(id);
    const next = scheduleReview(target, rating, id, at);
    const updated = { ...target, ...next } as FlashcardData;
    assertSane(updated, at, `sim step ${step}`);
    assert.equal(updated.review!.memory.reps, (target.review?.memory.reps || 0) + 1);
    assert.equal(updated.review!.revision, id);
    // The rated card is not immediately offered again.
    assert.ok(!reviewQueue([updated, ...cards.filter(c => c.id !== target.id)], scope, limits, at).eligible.some(c => c.id === target.id));
    cards = cards.map(c => c.id === target.id ? updated : c);
  }
  assert.ok(ids.size > 200, `simulation should review many cards, reviewed ${ids.size}`);
  assert.equal(ids.size, new Set(ids).size, 'operation ids stay unique');
  assert.ok(cards.every(c => !c.review || validateReviewData(c.review) === undefined));
  assert.ok(cards.some(c => c.review));
});

test('queue counts add up and never depend on card order', () => {
  const at = START;
  const cards = [
    card('due-1', 'folder'), card('due-2', 'folder'), card('future', 'folder', { nextReview: at + DAY })
  ];
  const pausedBase = { ...card('paused', 'folder'), ...scheduleReview(card('paused', 'folder'), 1, 'paused-seed', at - 3 * HOUR) };
  const paused = { ...pausedBase, review: { ...pausedBase.review!, paused: true } } as FlashcardData;
  const all = [...cards, paused];
  const a = reviewQueue(all, null, limits, at);
  const b = reviewQueue([...all].reverse(), null, limits, at);
  assert.equal(a.ready, b.ready);
  assert.deepEqual(a.eligible.map(c => c.id).sort(), b.eligible.map(c => c.id).sort());
  assert.ok(!a.eligible.some(c => c.id === 'paused'));
  assert.equal(a.ready, 2);
  assert.equal(a.later, 1);
});

test('undo restores every schedule field after a mixed sequence', async () => {
  const data = new Map<string, string>();
  Object.assign(globalThis, {
    localStorage: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); }, key: (i: number) => [...data.keys()][i] ?? null, get length() { return data.size; } },
    window: { dispatchEvent: () => true }
  });
  const user = { uid: 'guest_sim' } as User;
  localStorage.setItem('hahu_library_guest_sim', JSON.stringify({
    folders: [{ id: 'deck-a', name: 'Deck A', ownerId: 'guest_sim', level: 1, parentId: null }],
    cards: [card('c1', 'deck-a')]
  }));
  let at = START;
  for (const rating of [4, 1, 4, 1]) {
    const [before] = readLocalLibrary(user.uid).cards;
    const expected = revision(before);
    const undoSnapshot = snapshot(before);
    const id = `undo-op-${rating}-${at}`;
    await applyReviewAction(user, 'c1', { kind: 'rate', rating, id, expected, at });
    const [after] = readLocalLibrary(user.uid).cards;
    assertSane(after, at, 'saved card');
    await applyReviewAction(user, 'c1', { kind: 'undo', id: `undo-${id}`, expected: id, before: undoSnapshot, at: at + 1000 });
    const [restored] = readLocalLibrary(user.uid).cards;
    // Undo restores the schedule but intentionally keeps an audit trail.
    const baseline = before.review || initialReview(before, at);
    const { history: beforeHistory, revision: beforeRevision, ...beforeSchedule } = baseline;
    const { history: afterHistory, revision: afterRevision, ...restoredSchedule } = restored.review!;
    assert.deepEqual(restoredSchedule, beforeSchedule);
    assert.deepEqual(afterHistory.slice(0, beforeHistory.length), beforeHistory);
    assert.deepEqual(afterHistory.at(-1), { at: at + 1000, rating: 0, id: `undo-undo-op-${rating}-${at}` });
    assert.ok(beforeRevision !== afterRevision);
    assert.equal(restored.nextReview, before.nextReview);
    assert.equal(restored.interval || 0, before.interval || 0);
    at = after.nextReview!;
  }
});

test('the daily review limit is library-wide and enforced as reviews happen', () => {
  const at = START;
  const seeded = (id: string, folder: string, reviewedDay: string) => {
    const base = card(id, folder);
    const next = scheduleReview(base, 3, `${id}-seen`, at - DAY);
    return {
      ...base,
      ...next,
      nextReview: at - HOUR,
      review: { ...next.review!, reviewedDay, introducedDay: '', memory: { ...next.review!.memory, due: at - HOUR } }
    } as FlashcardData;
  };
  const yesterday = localDay(at - DAY);
  let decks = [
    seeded('a1', 'deck-a', yesterday), seeded('a2', 'deck-a', yesterday),
    seeded('b1', 'deck-b', yesterday), seeded('b2', 'deck-b', yesterday)
  ];
  // One review already happened today in another deck: only one slot is left.
  const quota = seeded('c1', 'deck-c', localDay(at));
  quota.nextReview = at + DAY;
  quota.review = { ...quota.review!, memory: { ...quota.review!.memory, due: at + DAY } };
  decks.push(quota);

  const exhausted = reviewQueue(decks, null, { ...limits, reviews: 1, newCards: 0 }, at);
  assert.equal(exhausted.eligible.length, 0, 'an exhausted limit holds back every deck');

  // With two slots, one review may still happen — then the cap closes again,
  // proving the limit is library-wide rather than one quota per deck.
  let reviewed: string[] = [];
  let now = at;
  for (let guard = 0; guard < 10; guard++) {
    const queue = reviewQueue(decks, null, { ...limits, reviews: 2, newCards: 0 }, now);
    if (!queue.eligible.length) break;
    const target = queue.eligible[0];
    reviewed.push(target.id);
    const next = scheduleReview(target, 4, `cap-${guard}`, now);
    decks = decks.map(c => c.id === target.id ? { ...c, ...next } : c);
    now += 1000;
  }
  assert.equal(reviewed.length, 1, `expected exactly one remaining review, did ${reviewed.join(',')}`);
  assert.equal(new Set(reviewed).size, reviewed.length);

  // A deck scope narrows the candidates without resetting the shared limit.
  const scoped = reviewQueue(decks, 'deck-a', { ...limits, reviews: 2, newCards: 0 }, at);
  assert.equal(scoped.eligible.length, 0);

  // Learning steps bypass the quota entirely, so a forgotten card is never
  // starved by a review limit that was used up in another deck.
  const forgotten = card('learning', 'deck-c');
  const relearning = {
    ...forgotten,
    ...scheduleReview(forgotten, 1, 'forgot-today', at - 3 * HOUR),
    review: { ...scheduleReview(forgotten, 1, 'forgot-today', at - 3 * HOUR).review!, reviewedDay: localDay(at) }
  } as FlashcardData;
  assert.ok(relearning.nextReview! <= at, 'the forgotten card is due again');
  assert.ok(reviewQueue([relearning], null, { ...limits, reviews: 0, newCards: 0 }, at)
    .eligible.some(c => c.id === 'learning'), 'learning steps must bypass the review limit');
});
