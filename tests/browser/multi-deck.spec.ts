import { test, expect, type Page } from '@playwright/test';

/**
 * Multi-deck and mixed-rating coverage for the simplified Spaced Review.
 * Deck Alpha has three cards, Deck Beta has three more, and one card in
 * Deck Alpha is paused in the last test.
 */
const LIBRARY = 'hahu_library_guest_multi';
const SESSION = 'hahu_review_session_guest_multi';

type Scope = 'deck-a' | 'deck-b' | null;

async function openReview(page: Page, scope: Scope = null) {
  await page.addInitScript(([libraryKey, sessionKey, chosen]) => {
    localStorage.setItem('hahu_local_guest_session', 'true');
    localStorage.setItem('hahu_guest_uid', 'guest_multi');
    if (!localStorage.getItem(libraryKey)) {
      const folders = [
        { id: 'deck-a', name: 'Deck Alpha', ownerId: 'guest_multi', level: 1, parentId: null },
        { id: 'deck-b', name: 'Deck Beta', ownerId: 'guest_multi', level: 1, parentId: null }
      ];
      const make = (id: string, unitId: string) => ({
        id, unitId, ownerId: 'guest_multi', cardName: `Card ${id}`,
        frontText: `Question ${id}`, backText: `Answer ${id}`, nextReview: 0
      });
      const cards = [
        make('a1', 'deck-a'), make('a2', 'deck-a'), make('a3', 'deck-a'),
        make('b1', 'deck-b'), make('b2', 'deck-b'), make('b3', 'deck-b')
      ];
      localStorage.setItem(libraryKey, JSON.stringify({ folders, cards }));
    }
    localStorage.setItem(sessionKey, JSON.stringify({
      version: 1, owner: 'fixture', scope: chosen, duration: 15,
      limits: { newCards: 20, reviews: 200, spaceRelated: true },
      completed: 0, current: null, pending: null, undo: null
    }));
  }, [LIBRARY, SESSION, scope] as const);
  await page.route('**/*', route =>
    new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort());
  await page.goto('/');
  await page.clock.install();
  await page.getByRole('button', { name: 'Start / resume reviews', exact: true }).click();
}

const cards = (page: Page) =>
  page.evaluate(key => JSON.parse(localStorage.getItem(key)!).cards, LIBRARY);
const session = (page: Page) =>
  page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), SESSION);

async function reveal(page: Page) {
  await page.clock.fastForward(2100);
  await page.getByRole('button', { name: 'Reveal Answer', exact: true }).click();
}

const review = (page: Page) => page.getByRole('dialog');
const doneScreen = (page: Page) => page.getByRole('heading', { name: 'All done for now', exact: true });

/** Rate a known card order and confirm the run ends on the done screen. */
async function rate(page: Page, ids: string[], rating = /^Easy/) {
  for (const id of ids) {
    await expect(page.getByRole('heading', { name: `Card ${id}`, exact: true })).toBeVisible();
    await reveal(page);
    await page.getByRole('button', { name: rating }).click();
  }
  await expect(doneScreen(page)).toBeVisible();
}

test.beforeEach(() => test.setTimeout(120_000));

test('a folder review serves that deck only and leaves the other deck untouched', async ({ page }) => {
  await openReview(page, 'deck-a');
  await rate(page, ['a1', 'a2', 'a3']);
  const saved = await cards(page);
  expect(saved.filter(c => c.unitId === 'deck-b').every(c => !c.review)).toBe(true);
  expect(saved.filter(c => c.unitId === 'deck-a').every(c => c.review)).toBe(true);
  expect((await session(page)).scope).toBe('deck-a');
});

test('a library-wide review covers every deck without repeating a card', async ({ page }) => {
  await openReview(page, null);
  await rate(page, ['a1', 'a2', 'a3', 'b1', 'b2', 'b3']);
  expect((await cards(page)).every(c => c.review?.memory.reps === 1)).toBe(true);
});

test('easy then forgotten then easy keeps one card rotating without breaking its schedule', async ({ page }) => {
  await openReview(page, 'deck-a');
  // Clear deck-a apart from a1 so the day jumps stay readable.
  await page.evaluate(key => {
    const data = JSON.parse(localStorage.getItem(key)!);
    data.cards = data.cards.filter((c: any) => c.id !== 'a2' && c.id !== 'a3');
    localStorage.setItem(key, JSON.stringify(data));
  }, LIBRARY);
  await page.getByRole('button', { name: 'Close review', exact: true }).click();
  await page.getByRole('button', { name: 'Start / resume reviews', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Card a1', exact: true })).toBeVisible();
  await reveal(page);
  await page.getByRole('button', { name: /^Easy/ }).click();
  await expect(page.getByText('All done for now', { exact: true })).toBeVisible();

  // Easy = 3 days.
  await page.clock.fastForward(3 * 86400000);
  await expect(page.getByRole('heading', { name: 'Card a1', exact: true })).toBeVisible();
  await reveal(page);
  await page.getByRole('button', { name: /^Forgot/ }).click();
  await expect(page.getByText('All done for now', { exact: true })).toBeVisible();
  await expect(page.getByText(/Next practice card in 2 h/)).toBeVisible();

  let saved = (await cards(page)).find((c: any) => c.id === 'a1');
  expect(saved.review.failures).toBe(1);
  expect(saved.review.memory.reps).toBe(2);

  // Forgot = 2 hours.
  await page.clock.fastForward(2 * 3600000);
  await expect(page.getByRole('heading', { name: 'Card a1', exact: true })).toBeVisible();
  await reveal(page);
  await page.getByRole('button', { name: /^Easy/ }).click();
  await expect(page.getByText('All done for now', { exact: true })).toBeVisible();

  saved = (await cards(page)).find((c: any) => c.id === 'a1');
  expect(saved.review.memory.reps).toBe(3);
  expect(saved.review.memory.lapses).toBe(1);
  expect(saved.review.history.map((h: any) => h.rating)).toEqual([4, 1, 4]);
  const gap = saved.nextReview - (await page.evaluate(() => Date.now()));
  expect(gap).toBeGreaterThan(70 * 3600000); // 3 days again
});

test('switching to another deck reviews that deck, not the old one', async ({ page }) => {
  await openReview(page, 'deck-a');
  await reveal(page);
  await page.getByRole('button', { name: /^Easy/ }).click();
  await page.getByRole('button', { name: 'Close review', exact: true }).click();

  await page.evaluate(([key, sessionKey]) => {
    const data = JSON.parse(localStorage.getItem(sessionKey)!);
    data.scope = 'deck-b';
    data.current = null;
    localStorage.setItem(sessionKey, JSON.stringify(data));
  }, [LIBRARY, SESSION] as const);
  await page.getByRole('button', { name: 'Start / resume reviews', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Card b1', exact: true })).toBeVisible();
  expect((await session(page)).scope).toBe('deck-b');
  await reveal(page);
  await page.getByRole('button', { name: /^Easy/ }).click();
  await expect(page.getByRole('heading', { name: 'Card b2', exact: true })).toBeVisible();
});

test('a finished deck never pulls cards in from another deck', async ({ page }) => {
  await openReview(page, 'deck-a');
  await rate(page, ['a1', 'a2', 'a3']);
  await page.clock.fastForward(60000);
  await expect(page.getByRole('heading', { name: 'Card b1', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close review', exact: true }).click();
  expect((await cards(page)).filter(c => c.unitId === 'deck-b').every(c => !c.review)).toBe(true);

  // The saved folder scope still resumes, but it now surfaces the other deck.
  await page.getByRole('button', { name: 'Start / resume reviews', exact: true }).click();
  await expect(page.getByText('3 more cards are due in other folders.', { exact: true })).toBeVisible();
  await expect(page.getByText('Nothing else is due right now.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Review all folders', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Card b1', exact: true })).toBeVisible();
  expect((await session(page)).scope).toBe(null);
  await reveal(page);
  await page.getByRole('button', { name: /^Easy/ }).click();
  await expect(page.getByRole('heading', { name: 'Card b2', exact: true })).toBeVisible();
});

test('a library-wide review does not offer a folder switch', async ({ page }) => {
  await openReview(page, null);
  await rate(page, ['a1', 'a2', 'a3', 'b1', 'b2', 'b3']);
  await expect(page.getByText('Nothing else is due right now.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review all folders', exact: true })).toHaveCount(0);
});

test('paused cards in one deck do not block the other deck', async ({ page }) => {
  await openReview(page, null);
  await page.evaluate(key => {
    const data = JSON.parse(localStorage.getItem(key)!);
    const target = data.cards.find((c: any) => c.id === 'a1');
    target.review = {
      version: 1, revision: 'seed-a1', paused: true, group: '',
      introducedDay: '', reviewedDay: '', failures: 0, history: [],
      memory: {
        due: 0, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0,
        learning_steps: 0, reps: 0, lapses: 0, state: 0, last_review: null
      }
    };
    localStorage.setItem(key, JSON.stringify(data));
  }, LIBRARY);
  await page.getByRole('button', { name: 'Close review', exact: true }).click();
  await page.getByRole('button', { name: 'Start / resume reviews', exact: true }).click();

  await rate(page, ['a2', 'a3', 'b1', 'b2', 'b3']);
  expect((await cards(page)).find(c => c.id === 'a1').review.paused).toBe(true);
  await expect(page.getByText(/1 paused cards are hidden/)).toBeVisible();
  await page.getByRole('button', { name: 'Resume paused cards', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Card a1', exact: true })).toBeVisible();
});
