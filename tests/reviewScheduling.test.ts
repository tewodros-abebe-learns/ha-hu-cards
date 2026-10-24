import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateReview, type ReviewRating } from '../src/studyUtils';
import { validateCardUpdates } from '../src/dataValidation';
import { profilePhotoCandidates } from '../src/profilePhoto';
const day = 86400000;
const start = Date.UTC(2026, 9, 23);

test('forgotten cards relearn after two hours, not an immediately-due loop', () => {
  const again = calculateReview({ interval: 120, easeFactor: 3, nextReview: start }, 'again', start);
  assert.equal(again.nextReview, start + 2 * 3600000);
  assert.equal(again.easeFactor, 2.8);
  const recovered = calculateReview(again, 'good', again.nextReview);
  assert.equal(recovered.interval, 1);
});
test('Hard means difficult recall rather than a forgotten answer', () => {
  const card = { interval: 10, easeFactor: 2.5, nextReview: start };
  const again = calculateReview(card, 'again', start);
  const hard = calculateReview(card, 'hard', start);
  const good = calculateReview(card, 'good', start);
  const easy = calculateReview(card, 'easy', start);
  assert.ok(again.interval < hard.interval && hard.interval < good.interval && good.interval < easy.interval);
  assert.ok(hard.easeFactor < card.easeFactor);
});
test('all mixed rating sequences through seven reviews remain finite and schema-safe', () => {
  const ratings: ReviewRating[] = ['again', 'hard', 'good', 'easy'];
  function walk(card: { interval?: number; easeFactor?: number; nextReview?: number }, now: number, depth: number) {
    if (!depth) return;
    for (const rating of ratings) {
      const next = calculateReview(card, rating, now);
      assert.ok(Number.isFinite(next.nextReview) && next.nextReview > now);
      assert.ok(next.interval > 0 && next.interval <= 36500);
      assert.ok(next.easeFactor >= 1.3 && next.easeFactor <= 3.5);
      assert.doesNotThrow(() => validateCardUpdates(next));
      walk(next, next.nextReview, depth - 1);
    }
  }
  walk({}, start, 7);
});
test('early successful reviews cannot repeatedly inflate intervals; forgetting still takes effect', () => {
  const card = { interval: 10, easeFactor: 2.5, nextReview: start + 5 * day };
  assert.deepEqual(calculateReview(card, 'good', start), card);
  assert.deepEqual(calculateReview(card, 'easy', start), card);
  assert.ok(calculateReview(card, 'hard', start).nextReview <= card.nextReview);
  assert.equal(calculateReview(card, 'again', start).nextReview, start + 2 * 3600000);
});
test('late reviews are bounded and invalid ratings are rejected before saving', () => {
  const card = { interval: 10, easeFactor: 2.5, nextReview: start };
  assert.equal(calculateReview(card, 'good', start + 10000 * day).interval, 38);
  assert.ok(calculateReview({ interval: 36500, easeFactor: 3.5 }, 'easy', start).interval <= 36500);
  assert.throws(() => calculateReview(card, 'bogus' as ReviewRating, start));
  assert.throws(() => calculateReview(card, 'good', NaN));
});
test('linked Google photo is used even when the top-level Firebase photo is missing', () => {
  assert.deepEqual(profilePhotoCandidates({ photoURL: null, providerData: [{ providerId: 'google.com', photoURL: 'https://lh3.googleusercontent.com/photo' }] }), ['https://lh3.googleusercontent.com/photo']);
  assert.deepEqual(profilePhotoCandidates({ photoURL: 'javascript:bad' }), []);
});
test('sign-in screen does not load the separate origin-sensitive Google Identity button', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.ok(!app.includes('accounts.google.com/gsi/client'));
  assert.ok(!app.includes('googleSignInButton'));
  assert.ok(!app.includes('login(response.credential)'));
});
