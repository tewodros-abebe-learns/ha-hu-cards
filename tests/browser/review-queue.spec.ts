import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    if (localStorage.getItem('hahu_library_guest_review')) return;
    localStorage.setItem('hahu_local_guest_session','true');
    localStorage.setItem('hahu_guest_uid','guest_review');
    localStorage.setItem('hahu_library_guest_review', JSON.stringify({folders:[{id:'folder',name:'Review folder',ownerId:'guest_review',level:1,parentId:null}],cards:['a','b'].map(id=>({id,unitId:'folder',ownerId:'guest_review',cardName:`Card ${id}`,frontText:`Question ${id}`,backText:`Answer ${id}`,nextReview:0}))}));
    localStorage.setItem('hahu_review_session_guest_review',JSON.stringify({version:1,owner:'fixture',scope:null,duration:2,limits:{newCards:20,reviews:200,spaceRelated:true},completed:0,current:null,pending:null,undo:null}));
  });
  await page.goto('/');
  await page.clock.install();
  await page.getByRole('button',{name:'Start / resume reviews',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Card a',exact:true})).toBeVisible();
});
async function reveal(page: Page) {
  await page.clock.fastForward(2100);
  await page.getByRole('button',{name:'Reveal Answer',exact:true}).click();
}
async function openOptions(page: Page) {
  await page.getByRole('button',{name:'Review options',exact:true}).click();
}
async function stored(page: Page) {
  return page.evaluate(()=>JSON.parse(localStorage.getItem('hahu_library_guest_review')!).cards);
}
test('ratings advance automatically and forgotten cards return after the learning delay', async ({page}) => {
  await reveal(page);
  await page.getByRole('button',{name:/^Forgot/}).click();
  await expect(page.getByRole('heading',{name:'Card b',exact:true})).toBeVisible();
  await reveal(page);
  await page.getByRole('button',{name:/^Easy/}).click();
  await expect(page.getByText('All done for now',{exact:true})).toBeVisible();
  await page.clock.fastForward(61000);
  await expect(page.getByRole('heading',{name:'Card a',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Reveal Answer',exact:true})).toBeDisabled();
  expect((await stored(page))[0].review.memory.reps).toBe(1);
});
test('refresh resumes the current card and does not replay a completed rating', async ({page}) => {
  await reveal(page);
  await page.getByRole('button',{name:/^Easy/}).click();
  await expect(page.getByRole('heading',{name:'Card b',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close review',exact:true}).click();
  await page.reload();
  await page.getByRole('button',{name:'Start / resume reviews',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Card b',exact:true})).toBeVisible();
  expect((await stored(page))[0].review.memory.reps).toBe(1);
  await openOptions(page);
  await page.getByRole('button',{name:'Undo last rating',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Card a',exact:true})).toBeVisible();
  expect((await stored(page))[0].review.memory.reps).toBe(0);
});
test('daily limits disclose remaining work instead of silently hiding it', async ({page}) => {
  await openOptions(page);
  await page.getByLabel('New cards per day',{exact:true}).fill('1');
  await page.getByRole('button',{name:'Back to review',exact:true}).click();
  await reveal(page);
  await page.getByRole('button',{name:/^Easy/}).click();
  await expect(page.getByText(/1 ready cards remain beyond today/)).toBeVisible();
  await expect(page.getByText('All done for now',{exact:true})).toBeVisible();
  await openOptions(page);
  await page.getByLabel('New cards per day',{exact:true}).fill('2');
  await page.getByRole('button',{name:'Back to review',exact:true}).click();
  await page.clock.fastForward(1000);
  await expect(page.getByRole('heading',{name:'Card b',exact:true})).toBeVisible();
});
test('paused cards stay out of the queue and can be resumed without losing content', async ({page}) => {
  await openOptions(page);
  await page.getByRole('button',{name:'Manage cards',exact:true}).click();
  const a=page.getByRole('group',{name:'Card a',exact:true});
  await a.getByLabel('Pause card',{exact:true}).check();
  await a.getByRole('button',{name:'Save card settings',exact:true}).click();
  await expect(a.getByLabel('Pause card',{exact:true})).toBeChecked();
  await page.getByRole('button',{name:'Back to review',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Card b',exact:true})).toBeVisible();
  expect((await stored(page))[0].frontText).toBe('Question a');
  await openOptions(page);
  await page.getByRole('button',{name:'Manage cards',exact:true}).click();
  await a.getByLabel('Pause card',{exact:true}).uncheck();
  await a.getByRole('button',{name:'Save card settings',exact:true}).click();
  await page.getByRole('button',{name:'Back to review',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Card a',exact:true})).toBeVisible();
});
test('related cards are hidden after their sibling is reviewed', async ({page}) => {
  await openOptions(page);
  await page.getByRole('button',{name:'Manage cards',exact:true}).click();
  for (const id of ['a','b']) {
    const group=page.getByRole('group',{name:`Card ${id}`,exact:true});
    await group.getByLabel('Related group (same label for related cards)',{exact:true}).fill('topic');
    await group.getByRole('button',{name:'Save card settings',exact:true}).click();
    await expect.poll(async()=>(await stored(page)).find((c:any)=>c.id===id).review.group).toBe('topic');
  }
  await page.getByRole('button',{name:'Back to review',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Card a',exact:true})).toBeVisible();
  await reveal(page);
  await page.getByRole('button',{name:/^Easy/}).click();
  await expect(page.getByText('1 related cards hidden until tomorrow.',{exact:true})).toBeVisible();
});
test('a lost session checkpoint can be retried without rating twice', async ({page}) => {
  await reveal(page);
  await page.evaluate(()=>{
    const set=Storage.prototype.setItem; let failed=false;
    Storage.prototype.setItem=function(key,value) {
      if (!failed && key==='hahu_review_session_guest_review' && JSON.parse(value).pending===null && JSON.parse(localStorage.getItem(key)!).pending) { failed=true; throw new DOMException('Checkpoint failed','QuotaExceededError'); }
      return set.call(this,key,value);
    };
  });
  await page.getByRole('button',{name:/^Easy/}).click();
  await expect(page.getByRole('alert')).toContainText('Checkpoint failed');
  expect((await stored(page))[0].review.memory.reps).toBe(1);
  await page.getByRole('button',{name:'Retry save',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Card b',exact:true})).toBeVisible();
  expect((await stored(page))[0].review.memory.reps).toBe(1);
});
test('another tab taking ownership disables stale review controls', async ({page}) => {
  await page.evaluate(()=>{
    const key='hahu_review_session_guest_review';
    const data=JSON.parse(localStorage.getItem(key)!);data.owner='other-tab';
    localStorage.setItem(key,JSON.stringify(data));
    window.dispatchEvent(new StorageEvent('storage',{key,newValue:JSON.stringify(data)}));
  });
  await expect(page.getByRole('alert')).toContainText('another tab');
  await page.clock.fastForward(5000);
  await expect(page.getByRole('button',{name:'Reveal Answer',exact:true})).toBeDisabled();
});

test('editing a question during review hides its answer and restarts thinking time', async ({page}) => {
  await reveal(page);
  await expect(page.getByText('Answer a',{exact:true})).toBeVisible();
  await page.evaluate(()=>{
    const key='hahu_library_guest_review';const data=JSON.parse(localStorage.getItem(key)!);
    data.cards[0].frontText='Updated question';localStorage.setItem(key,JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('hahu_cards_update_guest_review'));
  });
  await expect(page.getByText('Updated question',{exact:true})).toBeVisible();
  await expect(page.getByText('Answer a',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Reveal Answer',exact:true})).toBeDisabled();
});

test('a newer schedule prevents undo from overwriting another session', async ({page}) => {
  await reveal(page);
  await page.getByRole('button',{name:/^Easy/}).click();
  await expect(page.getByRole('heading',{name:'Card b',exact:true})).toBeVisible();
  await page.evaluate(()=>{
    const key='hahu_library_guest_review'; const data=JSON.parse(localStorage.getItem(key)!);
    data.cards[0].review.revision='newer-review'; data.cards[0].review.paused=true;
    localStorage.setItem(key,JSON.stringify(data));window.dispatchEvent(new CustomEvent('hahu_cards_update_guest_review'));
  });
  await openOptions(page);
  await page.getByRole('button',{name:'Undo last rating',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('changed in another session');
  expect((await stored(page))[0].review.paused).toBe(true);
});

test('an explicit new Anki session uses the newly selected timer instead of silently resuming', async ({page}) => {
  await page.getByRole('button',{name:'Close review',exact:true}).click();
  await page.getByText('Review folder',{exact:true}).click();
  await page.getByRole('button',{name:'Study Card a',exact:true}).click();
  const settings=page.getByRole('dialog',{name:'Study Mode Settings',exact:true});
  await settings.getByRole('button',{name:'Spaced Review',exact:true}).click();
  await settings.getByRole('spinbutton',{name:'MM',exact:true}).fill('0');
  await settings.getByRole('spinbutton',{name:'SS',exact:true}).fill('3');
  await settings.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.getByRole('button',{name:'Resume saved review',exact:true})).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button',{name:'Start a new session',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Card a',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('hahu_review_session_guest_review')!).duration)).toBe(3);
  await expect(page.getByRole('button',{name:'Reveal Answer',exact:true})).toBeDisabled();
});

test('unsaved card settings need confirmation and remote updates cannot overwrite the draft', async ({page}) => {
  await openOptions(page);
  await page.getByRole('button',{name:'Manage cards',exact:true}).click();
  const a=page.getByRole('group',{name:'Card a',exact:true});
  const field=a.getByLabel('Related group (same label for related cards)',{exact:true});
  await field.fill('My unsaved group');
  page.once('dialog',d=>d.dismiss());
  await page.getByRole('button',{name:'Close review',exact:true}).click();
  await expect(field).toHaveValue('My unsaved group');
  await page.evaluate(async()=>{
    const storePath='/src/dataStore.ts'; const enginePath='/src/reviewEngine.ts';
    const {applyReviewAction}=await import(storePath);
    const {revision}=await import(enginePath);
    const data=JSON.parse(localStorage.getItem('hahu_library_guest_review')!);
    await applyReviewAction({uid:'guest_review'} as any,'a',{kind:'settings',id:'other-settings',expected:revision(data.cards[0]),at:Date.now(),paused:true,group:'Remote group'});
  });
  await expect(field).toHaveValue('My unsaved group');
  await a.getByRole('button',{name:'Save card settings',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('changed in another session');
  expect((await stored(page))[0].review.group).toBe('Remote group');
});
test('starting a new session preserves chosen daily workload limits', async ({page}) => {
  await openOptions(page);
  await page.getByLabel('New cards per day',{exact:true}).fill('3');
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Start a new session',exact:true}).click();
  await openOptions(page);
  await expect(page.getByLabel('New cards per day',{exact:true})).toHaveValue('3');
});

test('a deleting folder removes its cards from the active review queue', async ({page}) => {
  await page.evaluate(()=>{
    const key='hahu_library_guest_review'; const data=JSON.parse(localStorage.getItem(key)!);
    data.folders[0].deleting=true; localStorage.setItem(key,JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('hahu_folders_update_guest_review'));
  });
  await expect(page.getByRole('status')).toContainText('missing or deleting folders');
  await expect(page.getByRole('heading',{name:'Card a',exact:true})).toHaveCount(0);
  await expect(page.getByText('All done for now',{exact:true})).toBeVisible();
});

test('the answer flips into place without mirrored text, and is not rendered before reveal', async ({page}) => {
  const stage = page.locator('[data-flip-stage]');
  await expect(stage).toHaveAttribute('data-flipped','false');
  await expect(page.getByText('Answer a',{exact:true})).toHaveCount(0);
  await reveal(page);
  await expect(stage).toHaveAttribute('data-flipped','true');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('[data-flip-stage]')!).transform)).toMatch(/^matrix3d\(-1/);
  const transforms = await page.evaluate(() => ({
    stage: getComputedStyle(document.querySelector('[data-flip-stage]')!).transform,
    back: getComputedStyle(document.querySelector('[data-card-face="back"]')!).transform,
    backface: getComputedStyle(document.querySelector('[data-card-face="back"]')!).backfaceVisibility
  }));
  // The stage turns 180 degrees while the back face turns another 180, so the
  // answer reads normally rather than mirrored. Both faces hide their reverse.
  expect(transforms.stage).toMatch(/^matrix3d\(-1/);
  expect(transforms.back).toMatch(/^matrix3d\(-1/);
  expect(transforms.backface).toBe('hidden');
  await expect(page.getByText('Answer a',{exact:true})).toBeVisible();
});

test('image cards from imported decks keep their layout in Spaced Review', async ({page}) => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
  await page.evaluate((image) => {
    localStorage.setItem('hahu_library_guest_review', JSON.stringify({folders:[{id:'folder',name:'Review folder',ownerId:'guest_review',level:1,parentId:null}],cards:[{id:'image',unitId:'folder',ownerId:'guest_review',cardName:'Imported image',frontText:'',backText:'',frontImageUrl:image,backImageUrl:image,aspectRatio:1.5}]}));
    const session=JSON.parse(localStorage.getItem('hahu_review_session_guest_review')!);
    localStorage.setItem('hahu_review_session_guest_review',JSON.stringify({...session,current:null}));
  }, png);
  await page.reload();
  await page.getByRole('button',{name:'Start / resume reviews',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Imported image',exact:true})).toBeVisible();
  const image = page.locator('[data-card-face="front"] img');
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', png);
  const ratio = await page.locator('[data-card-face="front"]').evaluate(el => getComputedStyle(el).aspectRatio);
  expect(parseFloat(ratio)).toBeCloseTo(1.5, 1);
  await page.clock.fastForward(2100);
  await page.getByRole('button',{name:'Reveal Answer',exact:true}).click();
  await expect(page.locator('[data-card-face="back"] img')).toBeVisible();
});

test('opening options pauses the thinking countdown instead of revealing early', async ({page}) => {
  await page.getByRole('button',{name:'Review options',exact:true}).click();
  await page.clock.fastForward(4000);
  await page.getByRole('button',{name:'Back to review',exact:true}).click();
  await expect(page.getByRole('button',{name:'Reveal Answer',exact:true})).toBeDisabled();
  await page.clock.fastForward(1000);
  await expect(page.getByRole('button',{name:'Reveal Answer',exact:true})).toBeEnabled();
});
