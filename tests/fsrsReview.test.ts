import test from 'node:test';
import assert from 'node:assert/strict';
import type { FlashcardData } from '../src/models';
import { cardKind, initialReview, scheduleReview, revision, snapshot, localDay, reviewQueue, validateReviewData } from '../src/reviewEngine';
import { parseReviewSession, freshReviewSession } from '../src/reviewSession';
import { applyReviewAction } from '../src/dataStore';
import { readLocalLibrary } from '../src/localLibrary';
import type { User } from '../src/firebase';
const now = Date.UTC(2026,9,23,10);
const card = (id: string, extras = {}): FlashcardData => ({ id, unitId: 'folder', ownerId: 'guest_fsrs', cardName: id, frontText: id, backText: 'answer', nextReview: 0, ...extras } as FlashcardData);
const limits = { newCards: 20, reviews: 200, spaceRelated: true };

test('FSRS safely handles every rating sequence through six due reviews', () => {
  function walk(c: FlashcardData, at: number, depth: number) {
    if (!depth) return;
    for (const rating of [1,2,3,4]) {
      const next = scheduleReview(c, rating, `review-${depth}-${rating}`, at);
      validateReviewData(next.review);
      assert.ok(next.nextReview! > at);
      assert.equal(next.review.memory.reps, (c.review?.memory.reps || 0)+1);
      walk({ ...c, ...next }, next.nextReview!, depth-1);
    }
  }
  walk(card('one'), now, 6);
});
test('new cards follow the requested first intervals: 2 h, 4 h, 1 day and 3 days', () => {
  const hours = 3600000;
  assert.deepEqual(
    [1, 2, 3, 4].map(rating => scheduleReview(card('one'), rating, `first-${rating}`, now).nextReview! - now),
    [2 * hours, 4 * hours, 24 * hours, 72 * hours]
  );
  // A day or more graduates the card to a normal review, so it obeys the daily
  // review limit and is no longer labelled as an in-session practice step.
  assert.deepEqual([1, 2, 3, 4].map(rating => cardKind({ ...card('one'), ...scheduleReview(card('one'), rating, `kind-${rating}`, now) })), ['learning','learning','review','review']);
  for (const rating of [3, 4]) {
    const next = scheduleReview(card('one'), rating, `graduate-${rating}`, now);
    assert.equal(next.review.memory.state, 2);
    assert.equal(next.review.memory.learning_steps, 0);
  }
});
test('stored memory agrees with the chosen interval and keeps a valid state', () => {
  for (const rating of [1, 2, 3, 4]) {
    const next = scheduleReview(card('one'), rating, `stored-${rating}`, now);
    assert.equal(next.review.memory.due, next.nextReview);
    assert.equal(next.interval, (next.nextReview! - now) / 86400000);
    assert.ok(next.review.memory.scheduled_days <= 36500);
    assert.doesNotThrow(() => validateReviewData(next.review));
  }
});
test('graduated cards keep their longer FSRS interval and are never scheduled sooner than the rating minimum', () => {
  const mature = card('mature', { review: { ...initialReview({ interval: 60, nextReview: now }, now), memory: { ...initialReview({ interval: 60, nextReview: now }, now).memory, state: 2 } } });
  const good = scheduleReview(mature, 3, 'mature-good', now);
  assert.ok(good.nextReview! - now >= 60 * 86400000, 'a mature interval must not shrink to one day');
  assert.ok(scheduleReview(mature, 4, 'mature-easy', now).nextReview! >= good.nextReview!);
  // Forgetting a graduated card returns it after two hours, not immediately.
  const forgot = scheduleReview(mature, 1, 'mature-forgot', now);
  assert.equal(forgot.nextReview, now + 2 * 3600000);
  assert.ok(forgot.review.memory.due === forgot.nextReview);
});
test('legacy schedules are conservatively initialized without changing their due date', () => {
  const c = card('old', { interval: 8, nextReview: now });
  const r = initialReview(c, now);
  assert.equal(r.memory.due, now); assert.equal(r.memory.state, 2); assert.equal(r.memory.stability, 8);
  assert.ok(scheduleReview(c, 3, 'legacy', now).nextReview! > now);
});
test('queue distinguishes ready, new, learning, later, paused, and daily limits', () => {
  const learning = { ...card('learning'), ...scheduleReview(card('learning'),1,'first',now-2*3600000-60000) };
  const paused = card('paused', { review: { ...initialReview({}, now), paused: true } });
  const old = card('old', { interval: 2, nextReview: now-1000 });
  const all = [card('new'), learning, old, paused, card('later', { nextReview: now+5000 })];
  const q = reviewQueue(all, null, { ...limits, newCards: 0, reviews: 0 }, now);
  assert.deepEqual(q.eligible.map(c => c.id), ['learning']);
  assert.equal(q.ready, 3); assert.equal(q.limited, 2); assert.equal(q.later, 1);
  assert.deepEqual(reviewQueue(all,null,limits,now).eligible.map(c=>c.id), ['learning','old','new']);
});
test('related cards are hidden until the next day but the same learning card can return', () => {
  const a = { ...card('a'), ...scheduleReview(card('a'),1,'first',now-2*3600000-60000) };
  a.review.group = 'topic';
  const b = card('b', { review: { ...initialReview({}, now), group: 'topic' } });
  assert.deepEqual(reviewQueue([a,b],null,limits,now).eligible.map(c=>c.id), ['a']);
  assert.equal(reviewQueue([a,b],null,limits,now+86400000).hidden,0);
});
test('daily new limit counts introductions throughout the library, not only the current folder', () => {
  const seen = { ...card('seen', {unitId:'other'}), ...scheduleReview(card('seen'),4,'seen',now) };
  assert.equal(seen.review.introducedDay, localDay(now));
  assert.equal(reviewQueue([seen,card('new')],'folder',{...limits,newCards:1},now).eligible.length,0);
});
test('review state validation rejects NaN, unknown memory keys and oversized history', () => {
  const r = initialReview({}, now);
  assert.throws(()=>validateReviewData({...r,memory:{...r.memory,stability:NaN}}));
  assert.throws(()=>validateReviewData({...r,memory:{...r.memory,extra:1}}));
  assert.throws(()=>validateReviewData({...r,history:Array(101).fill({at:now,rating:1,id:'x'})}));
});
test('resume validation rejects corrupt timers and preserves pending write intents', () => {
  const s = freshReviewSession('owner',null,2);
  s.pending = {cardId:'one',before:snapshot(card('one')),action:{kind:'rate',rating:1,id:'op',expected:revision(card('one')),at:now}};
  assert.deepEqual(parseReviewSession(JSON.stringify(s)),s);
  assert.throws(()=>parseReviewSession(JSON.stringify({...s,duration:0})));
});
function fixture() {
  const map = new Map<string,string>();
  Object.assign(globalThis, {localStorage:{getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>map.set(k,v)},window:{dispatchEvent:()=>true}});
  localStorage.setItem('hahu_library_guest_fsrs',JSON.stringify({folders:[{id:'folder',name:'Folder',ownerId:'guest_fsrs',parentId:null,level:1}],cards:[card('one')]}));
  return {uid:'guest_fsrs'} as User;
}
test('atomic ratings are idempotent, and undo restores scheduling without touching edited content', async () => {
  const user=fixture(); const c=card('one');
  const action = {kind:'rate' as const,rating:1,id:'once',expected:revision(c),at:now};
  const first=await applyReviewAction(user,c.id,action);
  const second=await applyReviewAction(user,c.id,action);
  assert.deepEqual(first,second);
  assert.equal(readLocalLibrary(user.uid).cards[0].review?.memory.reps,1);
  const saved=readLocalLibrary(user.uid); saved.cards[0].frontText='Edited safely';
  localStorage.setItem('hahu_library_guest_fsrs',JSON.stringify(saved));
  await applyReviewAction(user,c.id,{kind:'undo',before:snapshot(c),id:'undo',expected:'once',at:now+1000});
  const restored=readLocalLibrary(user.uid).cards[0];
  assert.equal(restored.frontText,'Edited safely'); assert.equal(restored.nextReview,0); assert.equal(restored.review?.memory.reps,0);
});
test('undo refuses newer changes and retries cannot repeat a stale operation', async () => {
  const user=fixture(); const c=card('one');
  await applyReviewAction(user,c.id,{kind:'rate',rating:1,id:'first',expected:revision(c),at:now});
  await applyReviewAction(user,c.id,{kind:'settings',paused:true,group:'topic',id:'newer',expected:'first',at:now+1});
  await assert.rejects(applyReviewAction(user,c.id,{kind:'undo',before:snapshot(c),id:'undo',expected:'first',at:now+2}),/changed/);
  await assert.rejects(applyReviewAction(user,c.id,{kind:'rate',rating:1,id:'first',expected:revision(c),at:now}),/changed/);
  assert.equal(readLocalLibrary(user.uid).cards[0].review?.paused,true);
});

test('content changes reject stale ratings, but do not block safe schedule-only undo', async () => {
  const { cardContentVersion } = await import('../src/cardConflicts');
  const user=fixture(); const before=card('one');
  const saved=readLocalLibrary(user.uid); saved.cards[0].frontText='New question';
  localStorage.setItem('hahu_library_guest_fsrs',JSON.stringify(saved));
  await assert.rejects(applyReviewAction(user,'one',{kind:'rate',rating:3,id:'stale',expected:revision(before),content:cardContentVersion(before),at:now}),/question changed/);
  assert.equal(readLocalLibrary(user.uid).cards[0].review,undefined);
});
test('review history is bounded while lifetime repetition and failure counts persist', () => {
  let c=card('one'); let at=now;
  for(let i=0;i<150;i++) { c={...c,...scheduleReview(c,1,`op-${i}`,at)}; at=c.nextReview!; }
  assert.equal(c.review?.history.length,100); assert.equal(c.review?.memory.reps,150); assert.equal(c.review?.failures,150);
});
test('content-only deck archives exclude FSRS state, history, pause status, and groups', async () => {
  const { exportDeckAsZip }=await import('../src/deckArchive');
  const JSZip=(await import('jszip')).default;
  const c={...card('one'),...scheduleReview(card('one'),1,'private-operation',now)};
  const blob=await exportDeckAsZip('Deck',[c]);
  const zip=await JSZip.loadAsync(await blob.arrayBuffer());
  const manifest=JSON.parse(await zip.file('deck.json')!.async('string'));
  assert.equal(manifest.cards[0].review,undefined); assert.equal(manifest.cards[0].nextReview,undefined);
  assert.equal(manifest.cards[0].frontText,'one');
});

test('legacy zero due dates and large intervals migrate consistently and can be undone', async () => {
  const user=fixture(); const c=card('one',{interval:100000,nextReview:0});
  const library=readLocalLibrary(user.uid);library.cards[0]=c;
  localStorage.setItem('hahu_library_guest_fsrs',JSON.stringify(library));
  const memory=initialReview(c,now).memory;
  assert.equal(memory.due,0); assert.equal(memory.scheduled_days,36500);
  await applyReviewAction(user,'one',{kind:'rate',rating:1,id:'rate-legacy',expected:revision(c),at:now});
  await applyReviewAction(user,'one',{kind:'undo',id:'undo-legacy',expected:'rate-legacy',before:snapshot(c),at:now+1000});
  const restored=readLocalLibrary(user.uid).cards[0];
  assert.equal(restored.nextReview,0);assert.equal(restored.review?.memory.due,0);assert.equal(restored.interval,100000);
});
test('learning cards remain eligible even when their sibling was reviewed today', () => {
  const a={...card('a'),...scheduleReview(card('a'),1,'a',now-2*3600000-60000)};
  const b={...card('b'),...scheduleReview(card('b'),4,'b',now-60000)};
  a.review.group=b.review.group='same topic';
  assert.deepEqual(reviewQueue([a,b],null,limits,now).eligible.map(c=>c.id),['a']);
});
test('even an unintroduced new card cannot be graded ahead of its due date', () => {
  assert.throws(()=>scheduleReview(card('future',{nextReview:now+60000}),3,'early',now),/not ready/);
});
test('malformed recovery slots and mismatched undo schedules fail closed', () => {
  const session=freshReviewSession('owner',null,2);
  for(const value of [false,0,'',[],undefined]) assert.throws(()=>parseReviewSession(JSON.stringify({...session,pending:value})));
  for(const before of [{interval:100001},{easeFactor:0},{unitId:'elsewhere'},{review:initialReview({},now),nextReview:0}]) {
    assert.throws(()=>parseReviewSession(JSON.stringify({...session,undo:{cardId:'one',expected:'revision',before}})));
  }
});
test('inconsistent memory states are rejected before invoking the scheduler', () => {
  const state=initialReview({},now);
  assert.throws(()=>validateReviewData({...state,memory:{...state.memory,state:2}}));
  assert.throws(()=>validateReviewData({...state,memory:{...state.memory,learning_steps:100}}));
});

test('review writes cannot mutate cards under a deleting ancestor', async () => {
  const user=fixture();const library=readLocalLibrary(user.uid);
  library.folders[0].deleting=true;
  localStorage.setItem('hahu_library_guest_fsrs',JSON.stringify(library));
  await assert.rejects(applyReviewAction(user,'one',{kind:'rate',rating:1,id:'blocked',expected:revision(library.cards[0]),at:now}),/being deleted/);
  assert.equal(readLocalLibrary(user.uid).cards[0].review,undefined);
});
