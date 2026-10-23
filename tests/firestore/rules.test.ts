import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, writeBatch } from 'firebase/firestore';
import { sampleFolderFields } from '../../src/dataIntegrity';

let env: RulesTestEnvironment;
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run this suite through npm run test:rules; production connections are prohibited.');
  env = await initializeTestEnvironment({ projectId: 'demo-hahu-cards', firestore: { rules: await readFile('firestore.rules', 'utf8') } });
});
beforeEach(async () => { await env.clearFirestore(); });
after(async () => { await env?.cleanup(); });
const db = () => env.authenticatedContext('alice').firestore();
async function hierarchy() {
  const store = db();
  await setDoc(doc(store, 'folders/root'), sampleFolderFields('alice'));
  await setDoc(doc(store, 'folders/child'), { name: 'Child', level: 2, parentId: 'root', ownerId: 'alice' });
  await setDoc(doc(store, 'folders/leaf'), { name: 'Leaf', level: 3, parentId: 'child', ownerId: 'alice' });
  await setDoc(doc(store, 'folders/other'), { ...sampleFolderFields('alice'), name: 'Other' });
  await setDoc(doc(store, 'flashcards/card'), { ownerId: 'alice', unitId: 'leaf', frontText: 'Q' });
  return store;
}

test('sample records satisfy rules; cross-account access and owner changes fail', async () => {
  const store = await hierarchy();
  await assertSucceeds(getDoc(doc(store, 'folders/root')));
  await assertFails(getDoc(doc(env.authenticatedContext('bob').firestore(), 'flashcards/card')));
  await assertFails(updateDoc(doc(store, 'flashcards/card'), { ownerId: 'bob' }));
});

test('deleting root freezes all descendants, including moves out and reviews', async () => {
  const store = await hierarchy();
  await assertFails(deleteDoc(doc(store, 'folders/root')));
  await assertSucceeds(updateDoc(doc(store, 'folders/root'), { deleting: true }));
  await assertFails(setDoc(doc(store, 'flashcards/new'), { ownerId: 'alice', unitId: 'leaf' }));
  await assertFails(setDoc(doc(store, 'folders/new'), { name: 'New', parentId: 'child', level: 3, ownerId: 'alice' }));
  await assertFails(updateDoc(doc(store, 'flashcards/card'), { unitId: 'other' }));
  await assertFails(updateDoc(doc(store, 'flashcards/card'), { interval: 5 }));
  await assertFails(updateDoc(doc(store, 'folders/leaf'), { name: 'Changed' }));
  await assertFails(updateDoc(doc(store, 'folders/root'), { deleting: false }));
  await assertSucceeds(updateDoc(doc(store, 'folders/leaf'), { deleting: true }));
  await assertSucceeds(updateDoc(doc(store, 'folders/child'), { deleting: true }));
  await assertSucceeds(deleteDoc(doc(store, 'flashcards/card')));
  await assertSucceeds(deleteDoc(doc(store, 'folders/leaf')));
  await assertSucceeds(deleteDoc(doc(store, 'folders/child')));
  await assertSucceeds(deleteDoc(doc(store, 'folders/root')));
});

test('normal rename and move work and missing destinations fail', async () => {
  const store = await hierarchy();
  await assertSucceeds(updateDoc(doc(store, 'folders/child'), { name: 'Renamed' }));
  await assertSucceeds(updateDoc(doc(store, 'flashcards/card'), { cardName: 'Renamed', unitId: 'other' }));
  await assertFails(updateDoc(doc(store, 'flashcards/card'), { unitId: 'missing' }));
});

test('five-card import batches fit rule access limits at deepest supported level', async () => {
  const store = await hierarchy();
  const batch = writeBatch(store);
  for (let i = 0; i < 5; i++) batch.set(doc(store, `flashcards/import_${i}`), { ownerId: 'alice', unitId: 'leaf', frontText: 'Q' });
  await assertSucceeds(batch.commit());
});

test('rules reject unsafe image schemes and out-of-range metadata', async () => {
  const store = await hierarchy();
  for (const value of ['javascript:alert(1)', '//other.test/pixel', 'https://user:pass@example.com/pixel', 'https://example.com/a b']) {
    await assertFails(updateDoc(doc(store, 'flashcards/card'), { frontImageUrl: value }));
  }
  await assertSucceeds(updateDoc(doc(store, 'flashcards/card'), { frontImageUrl: '/image.png' }));
  await assertSucceeds(updateDoc(doc(store, 'flashcards/card'), { frontImageUrl: 'https://example.com/image.png' }));
  await assertFails(updateDoc(doc(store, 'flashcards/card'), { nextReview: 1e20 }));
  await assertFails(updateDoc(doc(store, 'flashcards/card'), { aspectRatio: 0.00001 }));
});
