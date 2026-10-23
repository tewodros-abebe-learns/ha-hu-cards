import type { FlashcardData, FolderData } from './models';

export function assertExpectedFields(current: Record<string, unknown>, expected?: Record<string, unknown>) {
  if (expected && Object.entries(expected).some(([key, value]) => (current[key] ?? '') !== (value ?? ''))) {
    throw new Error('This item changed elsewhere. Reopen it before trying again. Nothing was overwritten.');
  }
}
export function exportScope(cards: FlashcardData[], visible: FlashcardData[], global: boolean, selected?: Set<string>): FlashcardData[] {
  return selected ? visible.filter(card => selected.has(card.id)) : global ? visible : cards;
}
export function sampleFolderFields(uid: string) {
  return { name: 'Try sample', parentId: null, level: 1, ownerId: uid, isSample: true };
}
export async function migrationRecordId(uid: string, guestUid: string, sourceId: string): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([uid, guestUid, sourceId]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return 'migration_' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function folderIsDeleting(folders: FolderData[], id: string): boolean {
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const seen = new Set<string>();
  let folder = byId.get(id);
  while (folder && !seen.has(folder.id)) {
    if (folder.deleting) return true;
    seen.add(folder.id); folder = folder.parentId ? byId.get(folder.parentId) : undefined;
  }
  return false;
}
