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
async function stored(page: Page) {
  return page.evaluate(()=>JSON.parse(localStorage.getItem('hahu_library_guest_review')!).cards);
}
/** Empty save/scheduling screens must not creep back into study. */
async function expectStudyOnly(page: Page) {
  for (const name of ['Review options','Back to review','Manage cards','Undo last rating','Start a new session','Daily limits','Pause card','Related group']) {
    await expect(page.getByText(name,{exact:true})).toHaveCount(0);
  }
}
test('ratings advance automatically and forgotten cards return after two hours', async ({page}) => {
  await expectStudyOnly(page);
  await reveal(page);
  await page.getByRole('button',{name:/^Forgot/}).click();
  await expect(page.getByRole('heading',{name:'Card b',exact:true})).toBeVisible();
  await reveal(page);
  await page.getByRole('button',{name:/^Easy/}).click();
  await expect(page.getByText('All done for now',{exact:true})).toBeVisible();
  // Forgot returns after two hours, not one minute.
  await expect(page.getByText(/Next practice card in 2 h/)).toBeVisible();
  await page.clock.fastForward(1000);
  await expect(page.getByRole('heading',{name:'Card a',exact:true})).toHaveCount(0);
  await page.clock.fastForward(2*3600000);
  await expect(page.getByRole('heading',{name:'Card a',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Reveal Answer',exact:true})).toBeDisabled();
  expect((await stored(page))[0].review.memory.reps).toBe(1);
});
test('closing and reopening silently resumes without replaying a completed rating', async ({page}) => {
  await reveal(page);
  await page.getByRole('button',{name:/^Easy/}).click();
  await expect(page.getByRole('heading',{name:'Card b',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close review',exact:true}).click();
  await page.reload();
  await page.getByRole('button',{name:'Start / resume reviews',exact:true}).click();
  // No resume/start-new prompt exists: the saved session simply continues.
  await expect(page.getByText('Continue where you left off?',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Resume saved review',exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Card b',exact:true})).toBeVisible();
  expect((await stored(page))[0].review.memory.reps).toBe(1);
});
test('ready cards held back by the daily limit can be studied in one tap', async ({page}) => {
  await page.getByRole('button',{name:'Close review',exact:true}).click();
  await page.evaluate(()=>{
    const key='hahu_review_session_guest_review';
    const data=JSON.parse(localStorage.getItem(key)!);
    data.limits={newCards:1,reviews:200,spaceRelated:true};
    localStorage.setItem(key,JSON.stringify(data));
  });
  await page.getByRole('button',{name:'Start / resume reviews',exact:true}).click();
  await reveal(page);
  await page.getByRole('button',{name:/^Easy/}).click();
  await expect(page.getByText(/1 more ready cards are waiting/)).toBeVisible();
  await page.getByRole('button',{name:'Study them now',exact:true}).click();
  await page.clock.fastForward(1000);
  await expect(page.getByRole('heading',{name:'Card b',exact:true})).toBeVisible();
});
test('paused cards are hidden but can be resumed from the done screen', async ({page}) => {
  await page.getByRole('button',{name:'Close review',exact:true}).click();
  await page.evaluate(()=>{
    const key='hahu_library_guest_review'; const data=JSON.parse(localStorage.getItem(key)!);
    data.cards[0].review={version:1,revision:'seed-a',memory:{due:0,stability:0,difficulty:0,elapsed_days:0,scheduled_days:0,learning_steps:0,reps:0,lapses:0,state:0,last_review:null},paused:true,group:'',introducedDay:'',reviewedDay:'',failures:0,history:[]};
    localStorage.setItem(key,JSON.stringify(data));
  });
  await page.getByRole('button',{name:'Start / resume reviews',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Card b',exact:true})).toBeVisible();
  await reveal(page);
  await page.getByRole('button',{name:/^Easy/}).click();
  await expect(page.getByText(/1 paused cards are hidden/)).toBeVisible();
  await page.getByRole('button',{name:'Resume paused cards',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Card a',exact:true})).toBeVisible();
  expect((await stored(page))[0].review.paused).toBe(false);
  expect((await stored(page))[0].frontText).toBe('Question a');
});
test('identical questions in the same folder are hidden until tomorrow', async ({page}) => {
  await page.getByRole('button',{name:'Close review',exact:true}).click();
  await page.evaluate(()=>{
    const key='hahu_library_guest_review'; const data=JSON.parse(localStorage.getItem(key)!);
    data.cards.forEach((card:any)=>{ card.frontText='Same question'; });
    localStorage.setItem(key,JSON.stringify(data));
  });
  await page.getByRole('button',{name:'Start / resume reviews',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Card a',exact:true})).toBeVisible();
  await reveal(page);
  await page.getByRole('button',{name:/^Easy/}).click();
  await expect(page.getByText('1 related cards hidden until tomorrow.',{exact:true})).toBeVisible();
});
test('several cards are reviewed in order without skipping or repeating', async ({page}) => {
  await page.getByRole('button',{name:'Close review',exact:true}).click();
  await page.evaluate(()=>{
    const key='hahu_library_guest_review'; const data=JSON.parse(localStorage.getItem(key)!);
    data.cards.push(...['c','d','e'].map(id=>({id,unitId:'folder',ownerId:'guest_review',cardName:`Card ${id}`,frontText:`Question ${id}`,backText:`Answer ${id}`,nextReview:0})));
    localStorage.setItem(key,JSON.stringify(data));
  });
  await page.getByRole('button',{name:'Start / resume reviews',exact:true}).click();
  for (const id of ['a','b','c','d','e']) {
    await expect(page.getByRole('heading',{name:`Card ${id}`,exact:true})).toBeVisible();
    await reveal(page);
    await page.getByRole('button',{name:/^Remembered/}).click();
  }
  await expect(page.getByText('All done for now',{exact:true})).toBeVisible();
  const reviews = (await stored(page)).filter((card:any)=>card.review);
  expect(reviews.map((card:any)=>card.id).sort()).toEqual(['a','b','c','d','e']);
  expect(new Set(reviews.map((card:any)=>card.review.revision)).size).toBe(5);
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
test('starting from a card adopts the chosen timer without a resume prompt', async ({page}) => {
  await page.getByRole('button',{name:'Close review',exact:true}).click();
  await page.getByText('Review folder',{exact:true}).click();
  await page.getByRole('button',{name:'Study Card a',exact:true}).click();
  const settings=page.getByRole('dialog',{name:'Study Mode Settings',exact:true});
  await settings.getByRole('button',{name:'Spaced Review',exact:true}).click();
  await settings.getByRole('spinbutton',{name:'MM',exact:true}).fill('0');
  await settings.getByRole('spinbutton',{name:'SS',exact:true}).fill('3');
  await settings.getByRole('button',{name:'Play',exact:true}).click();
  await expectStudyOnly(page);
  await expect(page.getByRole('heading',{name:'Card a',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('hahu_review_session_guest_review')!).duration)).toBe(3);
  await expect(page.getByRole('button',{name:'Reveal Answer',exact:true})).toBeDisabled();
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
    back: getComputedStyle(document.querySelector('[data-card-face="back"]')!).transform,
    backface: getComputedStyle(document.querySelector('[data-card-face="back"]')!).backfaceVisibility
  }));
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
test('rating buttons show the requested 2 h / 4 h / 1 d / 3 d spacing', async ({page}) => {
  await reveal(page);
  for (const [label, delay] of [['Forgot','2 h'],['Difficult','4 h'],['Remembered','1 d'],['Easy','3 d']]) {
    await expect(page.getByRole('button', { name: new RegExp(`^${label}`) })).toContainText(`~${delay}`);
  }
  await page.getByRole('button',{name:/^Difficult/}).click();
  await expect.poll(async()=>{
    const [card] = await stored(page);
    return card.nextReview - Date.now();
  }).toBeGreaterThanOrEqual(4 * 3600000 - 60000);
  const [saved] = await stored(page);
  expect(saved.review.memory.due).toBe(saved.nextReview);
});
