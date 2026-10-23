import { validateCardUpdates } from './dataValidation';
import type { FlashcardData, FolderData } from './models';

const validId = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid saved record.');
  return value as Record<string, unknown>;
}

export function validateStoredCard(value: unknown): FlashcardData {
  const card = record(value);
  if (!validId(card.id) || !validId(card.unitId)) throw new Error('Invalid saved card identity.');
  // Reject malformed optional fields instead of allowing React or image handling to crash.
  validateCardUpdates(card);
  if (card.review && (card.review as FlashcardData['review'])!.memory.due !== card.nextReview) throw new Error('Saved review dates disagree.');
  return card as unknown as FlashcardData;
}

export function validateStoredFolders(value: unknown): FolderData[] {
  if (!Array.isArray(value)) throw new Error('Invalid saved folders.');
  const ids = new Map<string, FolderData>();
  for (const item of value) {
    const folder = record(item);
    if (!validId(folder.id) || typeof folder.name !== 'string' || !folder.name.trim() || folder.name.length > 100 ||
      !Number.isInteger(folder.level) || Number(folder.level) < 1 || Number(folder.level) > 3 ||
      (folder.parentId != null && !validId(folder.parentId)) || ids.has(folder.id)) throw new Error('Invalid or duplicate saved folder.');
    ids.set(folder.id, folder as unknown as FolderData);
  }
  for (const folder of ids.values()) {
    const parent = folder.parentId ? ids.get(folder.parentId) : null;
    // Strictly increasing levels prevent cycles and unbounded recursive rendering.
    // Missing parents remain readable so legacy orphan data can be recovered.
    if (parent && folder.level !== parent.level + 1) throw new Error('Invalid saved folder hierarchy.');
  }
  return [...ids.values()];
}

export function validateStoredCards(value: unknown): FlashcardData[] {
  if (!Array.isArray(value)) throw new Error('Invalid saved cards.');
  const cards = value.map(validateStoredCard);
  if (new Set(cards.map(c => c.id)).size !== cards.length) throw new Error('Duplicate saved card IDs.');
  return cards;
}
