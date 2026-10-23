import test from 'node:test';
import assert from 'node:assert/strict';
import { assertExpectedFields, exportScope, folderIsDeleting, migrationRecordId, sampleFolderFields } from '../src/dataIntegrity';
import { recoverOrphans, orphanReferences } from '../src/libraryRecovery';
import { validateStoredFolders } from '../src/storedData';
import { newerSession } from '../src/studyUtils';
import { validateRasterSignature } from '../src/rasterValidation';
import { parseImportJob } from '../src/importRecovery';

test('sample folder constructor satisfies stored schema for cloud and guest', () => {
  assert.doesNotThrow(() => validateStoredFolders([{ ...sampleFolderFields('user'), id: 'sample_user' }]));
});
test('migration IDs are account-specific, deterministic and below rule limits', async () => {
  const first = await migrationRecordId('google-a', 'guest_one', 'x'.repeat(128));
  assert.equal(first, await migrationRecordId('google-a', 'guest_one', 'x'.repeat(128)));
  assert.notEqual(first, await migrationRecordId('google-b', 'guest_one', 'x'.repeat(128)));
  assert.ok(first.length <= 128);
});
test('export scope distinguishes global dates, whole folder and visible selections', () => {
  const all = [{ id: 'due' }, { id: 'future' }] as any;
  assert.deepEqual(exportScope(all, [all[0]], true), [all[0]]);
  assert.deepEqual(exportScope(all, [all[0]], false), all);
  assert.deepEqual(exportScope(all, [all[0]], false, new Set(['due', 'future'])), [all[0]]);
});
test('quick action conflicts compare relevant fields only', () => {
  assert.doesNotThrow(() => assertExpectedFields({ cardName: 'Old', interval: 7 }, { cardName: 'Old' }));
  assert.throws(() => assertExpectedFields({ cardName: 'New' }, { cardName: 'Old' }), /changed elsewhere/);
  assert.throws(() => assertExpectedFields({ unitId: 'moved' }, { unitId: 'original' }), /changed elsewhere/);
});
test('deletion status propagates through all supported ancestor levels', () => {
  const folders = [{ id: 'root', deleting: true }, { id: 'child', parentId: 'root' }, { id: 'leaf', parentId: 'child' }] as any;
  assert.equal(folderIsDeleting(folders, 'leaf'), true);
  assert.equal(folderIsDeleting(folders, 'other'), false);
});
test('orphan recovery preserves all content and rebases descendant levels', () => {
  const before = { folders: [
    { id: 'orphan', parentId: 'missing', level: 2, name: 'Orphan', ownerId: 'guest' },
    { id: 'child', parentId: 'orphan', level: 3, name: 'Child', ownerId: 'guest' }
  ], cards: [{ id: 'card', unitId: 'missing', frontText: 'Keep', interval: 8 }] } as any;
  const after = recoverOrphans(before, 'guest', 'recovered');
  assert.equal(orphanReferences(after).size, 0);
  assert.equal(after.folders[0].level, 1);
  assert.equal(after.folders[1].level, 2);
  assert.equal(after.cards[0].frontText, 'Keep');
  assert.equal(after.cards[0].interval, 8);
  assert.equal(before.cards[0].unitId, 'missing');
  assert.doesNotThrow(() => validateStoredFolders(after.folders));
});
test('simultaneous study starts have exactly one deterministic winner', () => {
  const a = { sessionId: 'a', startedAt: 10 }, b = { sessionId: 'b', startedAt: 10 };
  assert.equal(newerSession(b, a), true);
  assert.equal(newerSession(a, b), false);
  assert.equal(newerSession(a, a), false);
});
test('archive signature validation rejects mislabeled or empty images', () => {
  assert.throws(() => validateRasterSignature(new Uint8Array(), 'image/png'));
  assert.throws(() => validateRasterSignature(new Uint8Array([255, 216, 255]), 'image/png'));
  assert.doesNotThrow(() => validateRasterSignature(new Uint8Array([255, 216, 255]), 'image/jpeg'));
});
test('import recovery validates progress and status instead of silently discarding it', () => {
  assert.throws(() => parseImportJob(JSON.stringify({ token: 'x', folderId: 'y', confirmed: -1 })));
  assert.throws(() => parseImportJob(JSON.stringify({ token: 'x', folderId: 'y', status: 'unexpected' })));
  assert.equal(parseImportJob(JSON.stringify({ token: 'x', folderId: 'y', confirmed: 5, status: 'active' }))?.confirmed, 5);
});
