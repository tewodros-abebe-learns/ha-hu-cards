import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // These are local-guest interaction tests; never contact production Firebase.
  await page.route('**/*', route => new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('hahu_local_guest_session', 'true');
    localStorage.setItem('hahu_guest_uid', 'guest_ux');
    localStorage.setItem('hahu_library_guest_ux', JSON.stringify({
      folders: [{ id: 'a', name: 'Alpha', parentId: null, level: 1, ownerId: 'guest_ux' }, { id: 'b', name: 'Beta', parentId: null, level: 1, ownerId: 'guest_ux' }],
      cards: [{ id: 'due', unitId: 'a', cardName: 'Due card', frontText: 'Q', backText: 'A', nextReview: 0, ownerId: 'guest_ux' }, { id: 'future', unitId: 'a', cardName: 'Future card', frontText: 'Q2', backText: 'A2', nextReview: Date.now() + 7 * 86400000, ownerId: 'guest_ux' }]
    }));
  });
  await page.goto('/');
  await page.getByText('Alpha', { exact: true }).click();
});

test('unsaved edits, nested Escape and focus recovery', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'Create Card', exact: true }).click();
  const name = page.getByRole('textbox', { name: 'Card name', exact: true });
  await expect(name).toBeFocused();
  await name.fill('Unsaved card');
  await page.keyboard.press('Escape');
  const discard = page.getByRole('alertdialog', { name: 'Unsaved changes' });
  await expect(discard.getByRole('button', { name: 'Keep editing' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(discard).toBeHidden();
  await expect(name).toHaveValue('Unsaved card');
  await page.keyboard.press('Escape');
  await discard.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create Card', exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});

test('visible-only bulk selection and explicit move destination confirmation', async ({ page }) => {
  await page.getByRole('button', { name: 'Review Today', exact: true }).click();
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('button', { name: 'Select All', exact: true }).click();
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  const move = page.getByRole('dialog', { name: 'Move', exact: true });
  await expect(move.getByRole('button', { name: 'Move here' })).toBeDisabled();
  await move.getByRole('button', { name: 'Beta', exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hahu_library_guest_ux')!).cards[0].unitId)).toBe('a');
  await move.getByRole('button', { name: 'Move here' }).click();
  await expect(move).toBeHidden();
  const cards = await page.evaluate(() => JSON.parse(localStorage.getItem('hahu_library_guest_ux')!).cards);
  expect(cards.find((c: any) => c.id === 'due').unitId).toBe('b');
  expect(cards.find((c: any) => c.id === 'future').unitId).toBe('a');
});

test('failed deletion remains actionable without losing the selection', async ({ page }) => {
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as any).failWrite = true;
    Storage.prototype.setItem = function (key, value) { if ((window as any).failWrite && key.startsWith('hahu_library_')) throw new Error('quota'); original.call(this, key, value); };
  });
  await page.getByRole('button', { name: 'Review Today', exact: true }).click();
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('button', { name: 'Select All', exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('previous library is unchanged');
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
  await page.evaluate(() => { (window as any).failWrite = false; });
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(dialog).toBeHidden();
  const cards = await page.evaluate(() => JSON.parse(localStorage.getItem('hahu_library_guest_ux')!).cards);
  expect(cards.map((c: any) => c.id)).toEqual(['future']);
});

test('removing a newly cropped image really removes it on save', async ({ page }) => {
  await page.getByRole('button', { name: 'Create Card', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Create Card', exact: true });
  await editor.getByRole('textbox', { name: 'Card name' }).fill('Image test');
  await editor.locator('input[type=file]').setInputFiles({ name: 'pixel.gif', mimeType: 'image/gif', buffer: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') });
  const crop = page.getByRole('dialog', { name: 'Crop Image', exact: true });
  await crop.getByRole('button', { name: 'Apply Crop', exact: true }).click();
  await expect(crop).toBeHidden();
  await editor.getByRole('button', { name: 'Remove image', exact: true }).click();
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).toBeHidden();
  const card = await page.evaluate(() => JSON.parse(localStorage.getItem('hahu_library_guest_ux')!).cards.find((c: any) => c.cardName === 'Image test'));
  expect(card.frontImageUrl).toBe('');
});

test('repeated folder submissions create only one folder', async ({ page }) => {
  await page.getByRole('button', { name: 'Back to Folders', exact: true }).click();
  await page.getByRole('button', { name: 'New Folder', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill('One folder');
  await dialog.getByRole('button', { name: 'Create Folder', exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(dialog).toBeHidden();
  const count = await page.evaluate(() => JSON.parse(localStorage.getItem('hahu_library_guest_ux')!).folders.filter((f: any) => f.name === 'One folder').length);
  expect(count).toBe(1);
});

test('active study sessions require an explicit end action', async ({ page }) => {
  await page.getByRole('button', { name: 'Study Due card', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Study Mode Settings', exact: true });
  await settings.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Quit study session', exact: true }).click();
  const confirmation = page.getByRole('alertdialog', { name: 'End this session?' });
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Quit study session' })).toBeVisible();
  await page.keyboard.press('Escape');
  await confirmation.getByRole('button', { name: 'End session', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('editor controls fit a narrow phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByRole('button', { name: 'Create Card', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Create Card', exact: true });
  const save = await editor.getByRole('button', { name: 'Save', exact: true }).boundingBox();
  expect(save).not.toBeNull();
  expect(save!.x + save!.width).toBeLessThanOrEqual(320);
  expect(await editor.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test('releasing a long press does not immediately deselect the card', async ({ page }) => {
  const name = page.getByText('Due card', { exact: true });
  const bounds = await name.boundingBox();
  await page.mouse.move(bounds!.x + 3, bounds!.y + 3);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Select Due card', exact: true }).last()).toHaveAttribute('aria-pressed', 'true');
});

test('quitting Speed Recall does not delete unrelated Lock-In recovery', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('interrupted_lockin_session_guest_ux', '{"sessionId":"other-session"}');
  });
  await page.getByRole('button', { name: 'Study Due card', exact: true }).click();
  await page.getByRole('dialog', { name: 'Study Mode Settings', exact: true }).getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Quit study session', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'End session', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('interrupted_lockin_session_guest_ux'))).toContain('other-session');
});

test('stale editor draft cannot overwrite a newer card', async ({ page }) => {
  await page.getByRole('button', { name: 'Study Due card', exact: true }).getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('textbox', { name: 'Card name', exact: true }).fill('My draft');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('hahu_library_guest_ux')!);
    data.cards[0].frontText = 'Newer content';
    localStorage.setItem('hahu_library_guest_ux', JSON.stringify(data));
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed elsewhere');
  await expect(page.getByRole('textbox', { name: 'Card name', exact: true })).toHaveValue('My draft');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hahu_library_guest_ux')!).cards[0].frontText)).toBe('Newer content');
});

test('fresh Lock-In ignores stale recovery and yields to a newer tab', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('lockin_session_guest_ux_due', JSON.stringify({ state: 'ANSWER_SHOWN', cyclesLeft: 1, timeLeft: 0, revealDelayLeft: 0, timestamp: Date.now() })));
  await page.getByRole('button', { name: 'Study Due card', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Study Mode Settings', exact: true });
  await settings.getByRole('button', { name: 'Lock-In Mode', exact: true }).click();
  await settings.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lockin_session_guest_ux_due')!).state)).toBe('COUNTDOWN');
  await page.evaluate(() => {
    const key = 'interrupted_lockin_session_guest_ux';
    const newValue = JSON.stringify({ sessionId: 'new-tab' });
    localStorage.setItem(key, newValue);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
  });
  await expect(page.getByRole('alert')).toContainText('another tab');
  await page.getByRole('button', { name: 'Quit study session', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('interrupted_lockin_session_guest_ux'))).toContain('new-tab');
});

test('Anki enforces the countdown, advances the queue and guards duplicate saves', async ({ page }) => {
  await page.getByRole('button', { name: 'Study Due card', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Study Mode Settings', exact: true });
  await settings.getByRole('button', { name: 'Spaced Review', exact: true }).click();
  await settings.getByRole('spinbutton', { name: 'MM', exact: true }).fill('0');
  await settings.getByRole('spinbutton', { name: 'SS', exact: true }).fill('2');
  await settings.getByRole('button', { name: 'Play', exact: true }).click();
  const reveal = page.getByRole('button', { name: 'Reveal Answer', exact: true });
  await expect(reveal).toBeDisabled();
  await expect(reveal).toBeEnabled({ timeout: 5000 });
  await reveal.click();
  await page.getByRole('button', { name: /^Remembered/ }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(page.getByText('All done for now', {exact:true})).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hahu_library_guest_ux')!).cards[0].review.memory.reps)).toBe(1);
  // The second click of the double-click must not create a second review, and the
  // retired options/manage/undo panel must not come back.
  for (const name of ['Review options','Manage cards','Undo last rating','Start a new session','Daily limits']) {
    await expect(page.getByText(name,{exact:true})).toHaveCount(0);
  }
  await expect(page.getByText('All done for now', {exact:true})).toBeVisible();
});

test('refresh preserves an unsaved editor draft, and explicit discard clears it', async ({ page }) => {
  await page.getByRole('button', { name: 'Create Card', exact: true }).click();
  await page.getByRole('textbox', { name: 'Card name', exact: true }).fill('Recover after refresh');
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('hahu_editor_guest_ux_a_new'))).toContain('Recover after refresh');
  page.on('dialog', dialog => dialog.accept());
  await page.reload();
  await page.getByText('Alpha', { exact: true }).click();
  await page.getByRole('button', { name: 'Create Card', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Card name', exact: true })).toHaveValue('Recover after refresh');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await page.getByRole('button', { name: 'Create Card', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Card name', exact: true })).toHaveValue('');
});

test('cross-tab guest sign-out unmounts private editor and keeps its isolated draft', async ({ page }) => {
  await page.getByRole('button', { name: 'Create Card', exact: true }).click();
  await page.getByRole('textbox', { name: 'Card name', exact: true }).fill('Private draft');
  await page.evaluate(() => {
    localStorage.removeItem('hahu_local_guest_session');
    window.dispatchEvent(new StorageEvent('storage', { key: 'hahu_local_guest_session', newValue: null }));
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/login/);
  expect(await page.evaluate(() => sessionStorage.getItem('hahu_editor_guest_ux_a_new'))).toContain('Private draft');
});

test('simultaneous local writes across two tabs preserve both folders', async ({ page, context }) => {
  const other = await context.newPage();
  await other.route('**/*', route => new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort());
  await other.goto('/');
  await expect(other.getByRole('button', { name: 'Profile & Settings', exact: true })).toBeVisible();
  expect(await other.evaluate(() => !!navigator.locks)).toBe(true);
  await Promise.all([page, other].map((tab, index) => tab.evaluate(async index => {
    const store = await import(/* @vite-ignore */ '/src/' + 'dataStore.ts');
    await store.createFolder(store.createLocalGuestUser(), { name: `Concurrent ${index}`, parentId: null, level: 1 });
  }, index)));
  const names = await page.evaluate(() => JSON.parse(localStorage.getItem('hahu_library_guest_ux')!).folders.map((folder: any) => folder.name));
  expect(names).toContain('Concurrent 0');
  expect(names).toContain('Concurrent 1');
  await other.close();
});

test('deck export ignores date filters and the resulting ZIP can be imported', async ({ page }) => {
  await page.getByRole('button', { name: 'Review Today', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Deck', exact: true }).first().click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await page.locator('input[type=file]').first().setInputFiles({ name: download.suggestedFilename(), mimeType: 'application/zip', buffer: await readFile(path!) });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hahu_library_guest_ux')!).cards.length)).toBe(4);
});

test('a stale quick rename cannot replace a newer name', async ({ page }) => {
  await page.getByRole('button', { name: 'Study Due card', exact: true }).getByRole('button', { name: 'Rename card', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill('My stale rename');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('hahu_library_guest_ux')!);
    data.cards[0].cardName = 'New name elsewhere';
    localStorage.setItem('hahu_library_guest_ux', JSON.stringify(data));
  });
  await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('changed elsewhere');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hahu_library_guest_ux')!).cards[0].cardName)).toBe('New name elsewhere');
});

test('orphan recovery is explicit, backed up and preserves card contents', async ({ page }) => {
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('hahu_library_guest_ux')!);
    data.cards[0].unitId = 'missing';
    localStorage.setItem('hahu_library_guest_ux', JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('hahu_cards_update_guest_ux'));
  });
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Recover items', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Recover items', exact: true })).toBeHidden();
  const result = await page.evaluate(() => ({
    library: JSON.parse(localStorage.getItem('hahu_library_guest_ux')!),
    backup: JSON.parse(localStorage.getItem('hahu_repair_backup_guest_ux')!)
  }));
  expect(result.backup.cards[0].unitId).toBe('missing');
  expect(result.library.cards[0].frontText).toBe('Q');
  expect(result.library.folders.find((folder: any) => folder.id === result.library.cards[0].unitId).name).toBe('Recovered cards');
});

test('simultaneous import submissions share the completed operation', async ({ page }) => {
  const counts = await page.evaluate(async () => {
    const store = await import(/* @vite-ignore */ '/src/' + 'dataStore.ts');
    const user = store.createLocalGuestUser();
    const file = new File([JSON.stringify({ cards: [{ cardName: 'Concurrent import', frontText: 'Q' }] })], 'same.json');
    await Promise.all([store.importDeckFile(user, file, 'a'), store.importDeckFile(user, file, 'a')]);
    return JSON.parse(localStorage.getItem('hahu_library_guest_ux')!).cards.filter((card: any) => card.cardName === 'Concurrent import').length;
  });
  expect(counts).toBe(1);
});

test('guest profile offers Google linking without signing out first', async ({ page }) => {
  await page.getByRole('button', { name: 'Profile & Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Link Google account', exact: true })).toBeVisible();
});

test('an empty saved library stays empty after refresh', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hahu_library_guest_ux', JSON.stringify({ folders: [], cards: [] })));
  await page.reload();
  await expect(page.getByRole('button', { name: 'New Folder', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hahu_library_guest_ux')!))).toEqual({ folders: [], cards: [] });
});

test('Speed Recall cannot reveal early and restart re-locks the answer', async ({ page }) => {
  await page.getByRole('button', { name: 'Study Due card', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Study Mode Settings', exact: true });
  await settings.getByRole('spinbutton', { name: 'MM', exact: true }).fill('0');
  await settings.getByRole('spinbutton', { name: 'SS', exact: true }).fill('2');
  await settings.getByRole('button', { name: 'Play', exact: true }).click();
  const reveal = page.getByRole('button', { name: 'Reveal Answer', exact: true });
  await expect(reveal).toBeDisabled();
  await reveal.evaluate(button => (button as HTMLButtonElement).click());
  await expect(reveal).toBeVisible();
  await expect(reveal).toBeEnabled({ timeout: 5000 });
  await reveal.click();
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(reveal).toBeDisabled();
});

test('home-page Import uses a white background', async ({ page }) => {
  await page.getByRole('button', { name: 'Back to Folders', exact: true }).click();
  const button = page.getByRole('button', { name: 'Import Deck', exact: true });
  await expect(button).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('sign-in page offers the shared Firebase button without a Google Identity script', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.removeItem('hahu_local_guest_session');
    window.dispatchEvent(new StorageEvent('storage', { key: 'hahu_local_guest_session', newValue: null }));
  });
  await expect(page).toHaveURL(/login/);
  await expect(page.getByRole('button', { name: 'Sign in with Google', exact: true })).toBeVisible();
  await expect(page.locator('script[src*="accounts.google.com/gsi"]')).toHaveCount(0);
});

test('card notes save, open from the list without starting study, and stay out of study', async ({page}) => {
  await page.getByRole('button',{name:'Study Due card',exact:true}).getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByRole('textbox',{name:'Card note (optional)',exact:true}).fill('Exam could target this topic.');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  const card=page.getByRole('button',{name:'Study Due card',exact:true});
  await card.getByText('Note',{exact:true}).click();
  await expect(card.getByText('Exam could target this topic.',{exact:true})).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('hahu_library_guest_ux')!).cards.find((c:any)=>c.id==='due').note)).toBe('Exam could target this topic.');
  await card.getByRole('button',{name:'Study Now',exact:true}).click();
  const settings=page.getByRole('dialog',{name:'Study Mode Settings',exact:true});
  await settings.getByRole('button',{name:'Spaced Review',exact:true}).click();
  await settings.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Spaced Review',exact:true}).getByText('Exam could target this topic.',{exact:true})).toHaveCount(0);
});

test('note-only unsaved edits still require an explicit discard', async ({page}) => {
  await page.getByRole('button',{name:'Study Due card',exact:true}).getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByRole('textbox',{name:'Card note (optional)',exact:true}).fill('Remember for exam');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog',{name:'Unsaved changes'})).toBeVisible();
  await page.getByRole('button',{name:'Keep editing',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Card note (optional)',exact:true})).toHaveValue('Remember for exam');
});

test('Lock-In keeps running across a refresh without a manual resume', async ({ page }) => {
  await page.getByRole('button', { name: 'Study Due card', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Study Mode Settings', exact: true });
  await settings.getByRole('button', { name: /^Lock-In/ }).click();
  await settings.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Quit study session', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!localStorage.getItem('interrupted_lockin_session_guest_ux'))).toBe(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Quit study session', exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Cycle 1 \/ 1/)).toBeVisible();
  expect(await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('lockin_session_guest_ux_due')!);
    return saved.state;
  })).toBe('COUNTDOWN');
});

test('a deck imported through the app opens correctly in Spaced Review', async ({ page }) => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
  const deck = { deckName: 'Image deck', cards: [{ cardName: 'Imported diagram', frontText: '', backText: '', frontImageUrl: png, backImageUrl: png, aspectRatio: 1.5 }] };
  await page.locator('input[type=file]').first().setInputFiles({ name: 'images.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(deck)) });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hahu_library_guest_ux')!).cards.length)).toBe(3);
  await page.evaluate(() => {
    const key = 'hahu_library_guest_ux'; const data = JSON.parse(localStorage.getItem(key)!);
    data.cards.forEach((card: any) => { if (!String(card.id).startsWith('import_')) card.nextReview = Date.now() + 86400000; });
    localStorage.setItem(key, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('hahu_cards_update_guest_ux'));
  });
  await page.getByRole('button', { name: 'Start / resume reviews', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Imported diagram', exact: true })).toBeVisible();
  await expect(page.locator('[data-card-face="front"] img')).toBeVisible();
  await expect(page.locator('[data-card-face="front"] img')).toHaveAttribute('src', png);
});
