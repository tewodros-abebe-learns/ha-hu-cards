import { orphanReferences } from './libraryRecovery';
import { validateStoredCards, validateStoredFolders } from './storedData';
import type { FolderData, FlashcardData } from './models';
export interface LocalLibrary { folders: FolderData[]; cards: FlashcardData[] }

// One envelope makes folder/card changes atomic. Legacy keys are retained as a backup.
export function readLocalLibrary(uid: string): LocalLibrary {
  try {
    const envelope = localStorage.getItem(`hahu_library_${uid}`);
    const library: LocalLibrary = envelope ? JSON.parse(envelope) : {
      folders: JSON.parse(localStorage.getItem(`hahu_folders_${uid}`) || '[]'),
      cards: JSON.parse(localStorage.getItem(`hahu_cards_${uid}`) || '[]')
    };
    if (!library) throw new Error('Invalid library schema');
    validateStoredFolders(library.folders);
    validateStoredCards(library.cards);
    return library;
  } catch {
    throw new Error('Cannot read the saved library. Your original data has not been overwritten. Restore a backup or contact support.');
  }
}

export function writeLocalLibrary(uid: string, library: LocalLibrary): void {
  validateStoredFolders(library.folders);
  validateStoredCards(library.cards);
  const proposedOrphans = orphanReferences(library);
  if (proposedOrphans.size) {
    // Legacy damage must not block unrelated edits, but new damage is never accepted.
    const previousOrphans = orphanReferences(readLocalLibrary(uid));
    if ([...proposedOrphans].some(reference => !previousOrphans.has(reference))) throw new Error('A destination or parent folder no longer exists. Nothing was saved. Reopen the library and retry.');
  }
  try {
    localStorage.setItem(`hahu_library_${uid}`, JSON.stringify(library));
  } catch {
    throw new Error('Could not save your library. Browser storage may be full or disabled. Your previous library is unchanged.');
  }
  window.dispatchEvent(new CustomEvent(`hahu_folders_update_${uid}`));
  window.dispatchEvent(new CustomEvent(`hahu_cards_update_${uid}`));
}
