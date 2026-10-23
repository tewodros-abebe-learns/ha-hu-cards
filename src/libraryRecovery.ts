import type { LocalLibrary } from './localLibrary';
export function orphanReferences(library: LocalLibrary): Set<string> {
  const ids = new Set(library.folders.map(folder => folder.id));
  return new Set([
    ...library.folders.filter(folder => folder.parentId && !ids.has(folder.parentId)).map(folder => `folder:${folder.id}:${folder.parentId}`),
    ...library.cards.filter(card => !ids.has(card.unitId)).map(card => `card:${card.id}:${card.unitId}`)
  ]);
}
/** Explicit, non-destructive recovery: keep identities, text, images and review metadata. */
export function recoverOrphans(library: LocalLibrary, uid: string, recoveryId: string): LocalLibrary {
  const ids = new Set(library.folders.map(folder => folder.id));
  const folders = library.folders.map(folder => ({ ...folder }));
  for (const folder of folders) if (folder.parentId && !ids.has(folder.parentId)) { folder.parentId = null; folder.level = 1; }
  for (let depth = 1; depth <= 3; depth++) {
    for (const folder of folders) {
      const parent = folders.find(candidate => candidate.id === folder.parentId);
      if (parent?.level === depth) folder.level = depth + 1;
    }
  }
  const orphanCards = library.cards.filter(card => !ids.has(card.unitId));
  if (orphanCards.length) folders.push({ id: recoveryId, name: 'Recovered cards', level: 1, parentId: null, ownerId: uid, createdAt: Date.now() });
  return { folders, cards: library.cards.map(card => ids.has(card.unitId) ? { ...card } : { ...card, unitId: recoveryId }) };
}
