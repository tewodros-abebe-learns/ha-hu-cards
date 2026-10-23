import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeImportedCard, parseImportDeckFile, exportDeckAsZip } from '../src/deckArchive';
import { remainingSeconds, dateBoundaries } from '../src/studyUtils';
import { translations } from '../src/translations';
import { createFolder, saveFlashcard, deleteFolder } from '../src/dataStore';
import type { User } from '../src/firebase';

test('only English and Amharic are shipped', () => {
  assert.deepEqual(Object.keys(translations), ['English', 'Amharic']);
  assert.deepEqual(Object.keys(translations.English), Object.keys(translations.Amharic));
});
test('minimal imported card is Firestore-safe and whitelisted', () => {
  const card = sanitizeImportedCard({ frontText: 'Hello', id: 'spoof', ownerId: 'other', unknown: true });
  assert.equal(card.frontText, 'Hello');
  assert.equal(card.backImageUrl, '');
  assert.ok(Object.values(card).every(value => value !== undefined));
  assert.ok(!('ownerId' in card));
  assert.ok(!('id' in card));
});
test('invalid or over-limit data is rejected rather than silently lost', () => {
  assert.throws(() => sanitizeImportedCard(null));
  assert.throws(() => sanitizeImportedCard({ frontText: 'a'.repeat(2001) }));
  assert.throws(() => sanitizeImportedCard({ frontImageUrl: 'a'.repeat(500001) }));
  assert.throws(() => sanitizeImportedCard({ frontImageUrl: 'javascript:alert(1)' }));
});
test('JSON import supplies optional defaults and caps folder names', async () => {
  const file = new File([JSON.stringify({deckName: 'a'.repeat(150), cards: [{frontText: 'ሰላም'}]})], 'deck.json');
  const result = await parseImportDeckFile(file);
  assert.equal(result.deckName.length, 100);
  assert.equal(result.cards[0].frontText, 'ሰላም');
  assert.ok(Object.values(result.cards[0]).every(value => value !== undefined));
});
test('large decks fail explicitly on import and export', async () => {
  const cards = Array.from({length: 1001}, () => ({}));
  await assert.rejects(parseImportDeckFile(new File([JSON.stringify({cards})], 'deck.json')), /1000/);
  await assert.rejects(exportDeckAsZip('large', cards as any), /1000/);
});
test('wall-clock countdown catches up after suspension', () => {
  assert.equal(remainingSeconds(60000, 15000), 45);
  assert.equal(remainingSeconds(60000, 90000), 0);
});
test('calendar boundaries roll into next month', () => {
  const bounds = dateBoundaries(new Date(2026, 9, 31, 23, 59));
  assert.equal(bounds.startOfTomorrow, new Date(2026, 10, 1).getTime());
  assert.equal(bounds.startOfDayAfter, new Date(2026, 10, 2).getTime());
});
test('guest persistence propagates quota errors and deletes descendants', async () => {
  const data = new Map<string, string>();
  let fail = false;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { if (fail) throw new Error('quota'); data.set(key, value); }
  }});
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  const user = { uid: 'guest_test' } as User;
  const root = await createFolder(user, { name: 'root', parentId: null, level: 1 });
  const child = await createFolder(user, { name: 'child', parentId: root, level: 2 });
  await saveFlashcard(user, { unitId: child, frontText: 'hello' });
  fail = true;
  await assert.rejects(saveFlashcard(user, { unitId: child }), /Could not save/);
  await assert.rejects(createFolder(user, { name: 'fail', parentId: null, level: 1 }), /Could not save/);
  fail = false;
  await deleteFolder(user, root);
  assert.deepEqual(JSON.parse(data.get('hahu_library_guest_test')!), { folders: [], cards: [] });
});
test('ZIP round-trip preserves text and images without undefined fields', async () => {
  const card = { ...sanitizeImportedCard({cardName: 'Example', frontText: 'hello', frontImageUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}), id: 'one', ownerId: 'test', unitId: 'folder' };
  const blob = await exportDeckAsZip('Example', [card as any]);
  const result = await parseImportDeckFile(new File([blob], 'example.zip'));
  assert.equal(result.cards[0].frontText, 'hello');
  assert.equal(result.cards[0].frontImageUrl, card.frontImageUrl);
  assert.ok(Object.values(result.cards[0]).every(value => value !== undefined));
});

import { readLocalLibrary, writeLocalLibrary } from '../src/localLibrary';
import { getCropBounds } from '../src/cropUtils';
import { parseStoredSession, validSessionConfig } from '../src/studyUtils';
import { validateCardUpdates } from '../src/dataValidation';
import { seedSampleData, subscribeFolders, updateFlashcard, importBatchCards, bulkMoveFlashcards } from '../src/dataStore';
import { getTimestampMillis } from '../src/models';

function storageFixture() {
  const data = new Map<string, string>();
  let fail = false;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { if (fail) throw new Error('quota'); data.set(key, value); },
    removeItem: (key: string) => data.delete(key)
  }});
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  return { data, setFailure: (value: boolean) => { fail = value; } };
}

test('legacy local data is read without modification; next write uses atomic envelope', () => {
  const { data } = storageFixture();
  const legacy = [{id:'root', name:'Root', ownerId:'guest_a', parentId:null, level:1}];
  data.set('hahu_folders_guest_a', JSON.stringify(legacy));
  const library = readLocalLibrary('guest_a');
  assert.equal(library.folders.length, 1);
  writeLocalLibrary('guest_a', library);
  assert.equal(data.get('hahu_folders_guest_a'), JSON.stringify(legacy));
  assert.deepEqual(readLocalLibrary('guest_a'), library);
});
test('corrupt storage is never interpreted as an empty library or overwritten', async () => {
  const { data } = storageFixture();
  data.set('hahu_folders_guest_bad', '{broken');
  const user = { uid:'guest_bad' } as User;
  await assert.rejects(createFolder(user, { name:'New', parentId:null, level:1 }), /not been overwritten/);
  assert.equal(data.get('hahu_folders_guest_bad'), '{broken');
  let error: unknown;
  const unsubscribe = subscribeFolders(user, () => assert.fail('must not emit empty data'), e => { error = e; });
  assert.ok(error);
  unsubscribe();
});
test('failed local deletion leaves both folders and cards unchanged', async () => {
  const fixture = storageFixture();
  const user = {uid:'guest_atomic'} as User;
  const root = await createFolder(user, {name:'Root', parentId:null, level:1});
  await saveFlashcard(user, {unitId:root, frontText:'Keep me'});
  const before = fixture.data.get('hahu_library_guest_atomic');
  fixture.setFailure(true);
  await assert.rejects(deleteFolder(user, root), /previous library is unchanged/);
  assert.equal(fixture.data.get('hahu_library_guest_atomic'), before);
});
test('sample creation is idempotent and never repopulates intentionally emptied decks', async () => {
  storageFixture();
  const user = {uid:'guest_sample'} as User;
  const id = await seedSampleData(user);
  const original = readLocalLibrary(user.uid);
  assert.equal(original.cards.length, 4);
  writeLocalLibrary(user.uid, { ...original, cards:[] });
  assert.equal(await seedSampleData(user), id);
  assert.equal(readLocalLibrary(user.uid).cards.length, 0);
});
test('sample-named user folders are not mistaken for demonstration decks', async () => {
  storageFixture();
  const user = {uid:'guest_names'} as User;
  const id = await createFolder(user, {name:'Biology samples', parentId:null, level:1});
  assert.notEqual(await seedSampleData(user), id);
  assert.equal(readLocalLibrary(user.uid).cards.some(c => c.unitId === id), false);
});
test('invalid destinations, hierarchy, and edits to deleted cards are rejected', async () => {
  storageFixture();
  const user = {uid:'guest_validation'} as User;
  await assert.rejects(createFolder(user, {name:'Root', parentId:null, level:2}), /Root folders/);
  await assert.rejects(saveFlashcard(user, {unitId:'missing'}), /no longer exists/);
  await assert.rejects(importBatchCards(user, 'global_today', []), /real destination/);
  await assert.rejects(bulkMoveFlashcards(user, [], 'missing'), /no longer exists/);
  await assert.rejects(updateFlashcard(user, 'deleted', {frontText:'lost'}), /deleted/);
});
test('card validator protects identity and rejects NaN, infinity, and invalid fields', () => {
  assert.deepEqual(validateCardUpdates({id:'spoof', ownerId:'other', createdAt:1, frontText:'OK'}), {frontText:'OK'});
  for (const value of [NaN, Infinity, -1]) assert.throws(() => validateCardUpdates({interval:value}));
  assert.throws(() => validateCardUpdates({verticalAlign:'unknown'}));
  assert.throws(() => validateCardUpdates({cardName:'a'.repeat(201)}));
});
test('crop bounds stay within tiny and edge images, rejecting zero-size crops', () => {
  const image = {naturalWidth:5,naturalHeight:5,width:5,height:5};
  assert.deepEqual(getCropBounds(image, {unit:'px',x:4,y:4,width:5,height:5}), {x:4,y:4,width:1,height:1});
  assert.throws(() => getCropBounds(image, {unit:'%',x:0,y:0,width:0,height:20}));
  assert.deepEqual(getCropBounds({naturalWidth:1000,naturalHeight:500,width:100,height:50}, {unit:'px',x:10,y:5,width:20,height:10}), {x:100,y:50,width:200,height:100});
});
test('invalid persisted sessions and configs cannot put the player into impossible states', () => {
  assert.equal(parseStoredSession('{invalid'), null);
  assert.equal(parseStoredSession(JSON.stringify({state:'UNKNOWN', timeLeft:1, revealDelayLeft:0, cyclesLeft:1,timestamp:1})), null);
  assert.equal(validSessionConfig({cycles:0,revealDelay:1}), false);
  assert.equal(validSessionConfig({cycles:1,revealDelay:-1}), false);
  assert.equal(validSessionConfig({cycles:2,revealDelay:0,notifications:false}), true);
});
test('numeric timestamps are not misinterpreted as calendar years', () => {
  assert.equal(getTimestampMillis('123'),123);
  assert.equal(getTimestampMillis(NaN),0);
});

import { reviewFlashcard } from '../src/dataStore';
import { calculateReview } from '../src/studyUtils';
import JSZip from 'jszip';
test('successive reviews use the latest stored interval, not the opened card snapshot', async () => {
  storageFixture();
  const user = {uid:'guest_reviews'} as User;
  const folder = await createFolder(user, {name:'Reviews',parentId:null,level:1});
  const card = await saveFlashcard(user, {unitId:folder});
  await reviewFlashcard(user, card, 'good');
  assert.equal(readLocalLibrary(user.uid).cards[0].interval,1);
  await reviewFlashcard(user, card, 'good');
  assert.equal(readLocalLibrary(user.uid).cards[0].interval,1); // Early retries do not inflate the schedule.
  await updateFlashcard(user, card, { nextReview: 0 });
  await reviewFlashcard(user, card, 'good');
  assert.equal(readLocalLibrary(user.uid).cards[0].interval,3);
  assert.equal(calculateReview({easeFactor:NaN,interval:Infinity},'good',100).nextReview,86400100);
});
test('archive missing referenced image fails instead of silently discarding it', async () => {
  const zip = new JSZip();
  zip.file('deck.json',JSON.stringify({cards:[{frontImageFile:'images/missing.png'}]}));
  const file = new File([await zip.generateAsync({type:'uint8array'}) as BlobPart],'broken.zip');
  await assert.rejects(parseImportDeckFile(file),/missing a referenced/);
});
test('export never silently truncates legacy oversized card text', async () => {
  await assert.rejects(exportDeckAsZip('Legacy',[{frontText:'a'.repeat(2001)} as any]),/at most 2000/);
});

import { optionalStorage } from '../src/browserStorage';
import { validateImageSource } from '../src/imageSources';
import { validateStoredCard, validateStoredCards, validateStoredFolders } from '../src/storedData';
import { resolveCardImageUrl } from '../src/sampleCardsData';
import { readFileSync } from 'node:fs';

test('blocked browser storage cannot crash optional preferences or recovery controls', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {configurable:true, get(){ throw new Error('SecurityError'); }});
  try {
    assert.equal(optionalStorage.getItem('hahu_language'), null);
    assert.equal(optionalStorage.setItem('hahu_theme','light'), false);
    assert.equal(optionalStorage.removeItem('lockin_session'), false);
    assert.throws(() => readLocalLibrary('guest_blocked'), /not been overwritten/);
  } finally { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); }
});

test('malformed saved cards cannot reach React rendering or string image methods', () => {
  for (const fields of [{frontText:{}}, {cardName:[]}, {frontImageUrl:123}, {textColor:{}}, {textSize:Infinity}]) {
    assert.throws(() => validateStoredCard({id:'card',unitId:'folder',...fields}));
  }
  assert.throws(() => validateStoredCards([{id:'a',unitId:'f'},{id:'a',unitId:'f'}]),/Duplicate/);
  assert.throws(() => validateCardUpdates(null as any),/Invalid card data/);
});

test('recursive, self-referencing, and duplicate folder structures are rejected', () => {
  assert.throws(() => validateStoredFolders([{id:'a',name:'A',level:1,parentId:'a'}]),/hierarchy/);
  assert.throws(() => validateStoredFolders([{id:'a',name:'A',level:1,parentId:'b'}, {id:'b',name:'B',level:2,parentId:'a'}]),/hierarchy/);
  assert.throws(() => validateStoredFolders([{id:'a',name:'A',level:1},{id:'a',name:'B',level:1}]),/duplicate/);
});

test('unsafe image URL forms are rejected at both import and write boundaries', () => {
  for (const source of ['javascript:alert(1)','data:text/html;base64,aGVsbG8=','data:image/svg+xml;base64,aGVsbG8=','//example.com/pixel','/\\example.com/pixel','https://user:password@example.com/image','https:\n//example.com/image']) {
    assert.throws(() => validateImageSource(source));
    assert.throws(() => sanitizeImportedCard({frontImageUrl:source}));
    assert.throws(() => validateCardUpdates({frontImageUrl:source}));
  }
  assert.equal(validateImageSource('/images/example.jpg'),'/images/example.jpg');
  assert.equal(validateImageSource('https://example.com/image.png'),'https://example.com/image.png');
});

test('sample resolution never substitutes images based on unrelated URL substrings', () => {
  const url = 'https://example.com/image?name=physics_1_front';
  assert.equal(resolveCardImageUrl(url),url);
  assert.ok(resolveCardImageUrl('physics_1_front').startsWith('data:image/jpeg;'));
  assert.equal(resolveCardImageUrl(123 as any),'');
});

test('corrupt sessions cannot restore unbounded timers, future timestamps or cycles', () => {
  const state = {state:'COUNTDOWN',timeLeft:30,revealDelayLeft:0,cyclesLeft:1,timestamp:Date.now()};
  for (const values of [{timeLeft:1e12},{cyclesLeft:101},{timestamp:Date.now()+3600000},{revealDelayLeft:86401}]) {
    assert.equal(parseStoredSession(JSON.stringify({...state,...values})),null);
  }
});

test('malformed imported text is rejected rather than silently discarded', () => {
  assert.throws(() => sanitizeImportedCard({frontText:{nested:'answer'}}), /expected text/);
});

test('footer does not include removed developer or Telegram attribution', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url),'utf8');
  assert.doesNotMatch(source,/Tewodros|hahu_Ai|t\.me\/|Developed by/);
});

import { folderPath, visibleSelection } from '../src/interactionUtils';
import { interactionCopy } from '../src/interactionCopy';
test('bulk selection cannot include cards outside the visible view', () => {
  expectSet(visibleSelection(new Set(['due','hidden']), [{id:'due'}]), ['due']);
  function expectSet(actual: Set<string>, expected: string[]) { assert.deepEqual([...actual], expected); }
});
test('move destinations include ancestors and tolerate malformed cycles', () => {
  const folders = [{id:'root', name:'Science', parentId:null}, {id:'child', name:'Unit 1', parentId:'root'}] as any;
  assert.equal(folderPath(folders[1], folders), 'Science / Unit 1');
  assert.equal(folderPath({id:'loop',name:'Loop',parentId:'loop'} as any,[{id:'loop',name:'Loop',parentId:'loop'}] as any), 'Loop');
});
test('critical interaction copy is available in both supported languages', () => {
  assert.deepEqual(Object.keys(interactionCopy.English),Object.keys(interactionCopy.Amharic));
});

import { clearOwnedRecovery } from '../src/studyUtils';
import { sameCardContent, assertUnchangedCard } from '../src/cardConflicts';
import { boundedImageSize, validateEditorImage } from '../src/imageProcessing';
test('recovery cleanup preserves records owned by a different session', () => {
  const records = new Map([['card', JSON.stringify({ sessionId: 'old' })], ['index', JSON.stringify({ sessionId: 'new' })]]);
  const storage = { getItem: (key: string) => records.get(key) || null, removeItem: (key: string) => records.delete(key) };
  clearOwnedRecovery(storage, 'card', 'index', 'old');
  assert.equal(records.has('card'), false);
  assert.equal(records.has('index'), true);
});
test('editor conflict detection ignores scheduling and moves but protects content and styles', () => {
  const card = { cardName: 'Name', frontText: 'Q' };
  assert.equal(sameCardContent(card, { ...card, unitId: 'moved', interval: 20, textSize: 24 }), true);
  assert.throws(() => assertUnchangedCard({ ...card, frontText: 'Other draft' }, card), /changed elsewhere/);
  assert.throws(() => assertUnchangedCard({ ...card, verticalAlign: 'bottom' }, card), /changed elsewhere/);
});
test('editor image inputs are bounded and unsupported formats fail before decoding', () => {
  assert.deepEqual(boundedImageSize(4000, 2000), { width: 1600, height: 800 });
  assert.deepEqual(boundedImageSize(1, 1), { width: 1, height: 1 });
  assert.throws(() => boundedImageSize(10000, 10000));
  assert.throws(() => boundedImageSize(NaN, 20));
  assert.throws(() => validateEditorImage({ type: 'image/svg+xml', size: 100 }));
  assert.throws(() => validateEditorImage({ type: 'image/png', size: 21 * 1024 * 1024 }));
  assert.doesNotThrow(() => validateEditorImage({ type: 'image/png', size: 100 }));
});

import { beginAuthTransition, protectedOperation, pendingOperations } from '../src/operationSafety';
import { parseEditorDraft } from '../src/editorDraft';
test('account changes and writes cannot begin over one another', async () => {
  let release!: () => void;
  const running = protectedOperation('guest_test', false, () => new Promise<void>(resolve => { release = resolve; }));
  assert.equal(pendingOperations(), 1);
  assert.throws(beginAuthTransition, /current save/);
  release(); await running;
  const finish = beginAuthTransition();
  assert.throws(beginAuthTransition, /already in progress/);
  await assert.rejects(protectedOperation('guest_test', false, async () => {}), /account change/);
  finish();
  await assert.rejects(protectedOperation('guest_test', false, async () => { throw new Error('offline'); }), /offline/);
  assert.equal(pendingOperations(), 0);
});
test('local mutations are serialized even without Web Locks and failures do not poison the queue', async () => {
  const events: string[] = [];
  await Promise.all([
    protectedOperation('guest_test', true, async () => { events.push('first start'); await Promise.resolve(); events.push('first finish'); }),
    protectedOperation('guest_test', true, async () => { events.push('second'); })
  ]);
  assert.deepEqual(events, ['first start', 'first finish', 'second']);
});
test('draft recovery rejects malformed, oversized and expired drafts', () => {
  assert.equal(parseEditorDraft('{'), null);
  assert.equal(parseEditorDraft(JSON.stringify({ fields: { frontText: {} }, timestamp: Date.now() })), null);
  assert.equal(parseEditorDraft(JSON.stringify({ fields: {}, timestamp: 0 })), null);
  assert.equal(parseEditorDraft(JSON.stringify({ fields: { frontText: 'Keep me' }, timestamp: Date.now() }))?.fields.frontText, 'Keep me');
});
test('signed-out cloud anonymous users are never reclassified as local guests', async () => {
  const { isGuestSession } = await import('../src/dataStore');
  assert.equal(isGuestSession({ uid: 'cloud-anonymous', isAnonymous: true } as User), false);
  assert.equal(isGuestSession({ uid: 'guest_local', isAnonymous: true } as User), true);
});

import { authErrorMessage } from '../src/authErrors';
test('Google provider errors explain popup, connectivity and domain configuration failures', () => {
  assert.match(authErrorMessage({ code: 'auth/popup-blocked' }), /Allow popups/);
  assert.match(authErrorMessage({ code: 'auth/unauthorized-domain' }), /administrator/);
  assert.match(authErrorMessage({ code: 'auth/network-request-failed' }), /connection/);
});

test('transfer rejects unknown versions, contradictory counts and standalone manifests with image references', async () => {
  for (const data of [ { version: 99, cards: [] }, { cardCount: 2, cards: [{}] }, { cards: [{ frontImageFile: 'images/a.png' }] } ]) {
    await assert.rejects(parseImportDeckFile(new File([JSON.stringify(data)], 'deck.json')));
  }
  assert.throws(() => sanitizeImportedCard({ cardName: 'x'.repeat(201) }));
  assert.throws(() => sanitizeImportedCard({ textSize: Infinity }));
});
test('maximum accepted embedded images round trip through ZIP', async () => {
  const payload = Buffer.alloc(374982, 1); payload.set([255, 216, 255]);
  const image = 'data:image/jpeg;base64,' + payload.toString('base64');
  assert.ok(image.length <= 500000);
  const blob = await exportDeckAsZip('Boundary', [{ frontImageUrl: image } as any]);
  const result = await parseImportDeckFile(new File([blob], 'boundary.zip'));
  assert.equal(result.cards[0].frontImageUrl, image);
});
test('full guest import failure is atomic and retry reuses recovery IDs without overwriting cards', async () => {
  const { importDeckFile } = await import('../src/dataStore');
  const entries = new Map<string, string>();
  let fail = true;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { if (fail && key.startsWith('hahu_library_')) throw new Error('quota'); entries.set(key, value); },
    removeItem: (key: string) => entries.delete(key)
  }});
  const user = { uid: 'guest_import' } as User;
  const file = new File([JSON.stringify({ deckName: 'Recovered', cards: [{ cardName: 'One', frontText: 'Original' }] })], 'deck.json');
  await assert.rejects(importDeckFile(user, file), /Could not save/);
  assert.equal(entries.has('hahu_library_guest_import'), false);
  const key = [...entries.keys()].find(key => key.startsWith('hahu_import_'))!;
  const journal = entries.get(key)!;
  fail = false;
  const folderId = await importDeckFile(user, file);
  assert.equal(folderId, JSON.parse(journal).folderId);
  const library = JSON.parse(entries.get('hahu_library_guest_import')!);
  library.cards[0].frontText = 'Edited after import';
  entries.set('hahu_library_guest_import', JSON.stringify(library));
  entries.set(key, journal); // Simulate refresh after commit but before journal cleanup.
  await importDeckFile(user, file);
  const result = JSON.parse(entries.get('hahu_library_guest_import')!);
  assert.equal(result.cards.length, 1);
  assert.equal(result.folders.length, 1);
  assert.equal(result.cards[0].frontText, 'Edited after import');
});

test('resume refuses to recreate confirmed deleted imports; an explicit separate copy is allowed', async () => {
  const { importDeckFile } = await import('../src/dataStore');
  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key)
  }});
  const user = { uid: 'guest_resume' } as User;
  const file = new File([JSON.stringify({ cards: [{ cardName: 'Keep deleted', frontText: 'Q' }] })], 'retry.json');
  await importDeckFile(user, file);
  const key = [...entries.keys()].find(key => key.startsWith('hahu_import_'))!;
  const checkpoint = JSON.parse(entries.get(key)!);
  checkpoint.status = 'active';
  entries.set(key, JSON.stringify(checkpoint));
  entries.set('hahu_library_guest_resume', JSON.stringify({ folders: [], cards: [] }));
  await assert.rejects(importDeckFile(user, file), /folder was deleted/);
  assert.deepEqual(JSON.parse(entries.get('hahu_library_guest_resume')!), { folders: [], cards: [] });
  const newFolder = await importDeckFile(user, file, undefined, undefined, () => 'copy');
  assert.notEqual(newFolder, checkpoint.folderId);
});
