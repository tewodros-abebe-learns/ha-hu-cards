import { orphanReferences, recoverOrphans } from './libraryRecovery';
import { assertExpectedFields, sampleFolderFields, migrationRecordId } from './dataIntegrity';
import { parseImportJob, importFingerprint, pruneImportReceipts } from './importRecovery';
import { parseImportDeckFile } from './deckArchive';
import { protectedOperation, assertOperationIdentity } from './operationSafety';
import { assertUnchangedCard } from './cardConflicts';
import { validateStoredCard, validateStoredFolders } from './storedData';
import { calculateReview } from './studyUtils';
import { validateCardUpdates } from './dataValidation';
import { readLocalLibrary, writeLocalLibrary } from './localLibrary';
import { 
  getFirebaseDb,
  runTransaction,
  getDoc,
  writeBatch,
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  serverTimestamp, 
  addDoc, 
  getDocs,
  User,
  getFirebaseAuth
} from './firebase';
import { FolderData, FlashcardData, getTimestampMillis } from './models';
import { getSampleCardsData, resolveCardImageUrl } from './sampleCardsData';

export const isGuestSession = (user: User | null): boolean => !!user?.uid.startsWith('guest_');

function assertCurrentAccount(user: User) {
  assertOperationIdentity(user.uid);
  if (!isGuestSession(user) && typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('You are offline. Reconnect before saving to your cloud library.');
  if (!user?.uid || (!isGuestSession(user) && getFirebaseAuth()?.currentUser?.uid !== user.uid)) {
    throw new Error('Your account changed. Reopen this library before trying again.');
  }
}

export const createLocalGuestUser = (): User => {
  let guestUid = localStorage.getItem('hahu_guest_uid');
  if (guestUid && !/^guest_[\w-]{1,110}$/.test(guestUid)) throw new Error('Invalid guest identity. Your saved data has not been changed.');
  if (!guestUid) {
    guestUid = 'guest_' + crypto.randomUUID();
    localStorage.setItem('hahu_guest_uid', guestUid);
  }
  return {
    uid: guestUid,
    isAnonymous: true,
    displayName: 'Guest Student',
    email: null,
    emailVerified: false,
    phoneNumber: null,
    photoURL: null,
    providerId: 'anonymous',
    providerData: [],
    tenantId: null,
    metadata: {},
    refreshToken: '',
    delete: async () => {},
    getIdToken: async () => '',
    getIdTokenResult: async () => ({} as any),
    reload: async () => {},
    toJSON: () => ({}),
  } as unknown as User;
};

// --- Local Storage Helpers for Guest Mode ---
const getLocalStorageFolders = (uid: string) => readLocalLibrary(uid).folders;
const getLocalStorageCards = (uid: string) => readLocalLibrary(uid).cards;
const setLocalStorageFolders = (uid: string, folders: FolderData[]) => {
  writeLocalLibrary(uid, { ...readLocalLibrary(uid), folders });
};
const setLocalStorageCards = (uid: string, cards: FlashcardData[]) => {
  writeLocalLibrary(uid, { ...readLocalLibrary(uid), cards });
};

// --- Unified Data API ---

export const isSampleFolder = (folder: FolderData): boolean =>
  folder.isSample === true || folder.id.startsWith('folder_sample_') || folder.id.startsWith('sample_');

const seedSampleDataImpl = async (user: User): Promise<string> => {
  const uid = user.uid;
  const folderId = `sample_${uid}`;
  if (isGuestSession(user)) {
    const library = readLocalLibrary(uid);
    const existing = library.folders.find(isSampleFolder);
    if (existing) return existing.id;
    const folder: FolderData = { id: folderId, name: 'Try sample', parentId: null, level: 1, ownerId: uid, createdAt: Date.now(), isSample: true };
    const cards = getSampleCardsData(folderId, uid).map((card, index) => ({
      ...card, verticalAlign: 'center' as const, id: `${folderId}_${index}`, createdAt: Date.now()
    }));
    writeLocalLibrary(uid, { folders: [...library.folders, folder], cards: [...library.cards, ...cards] });
    return folderId;
  }
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase DB not initialized');
  const ref = doc(db, 'folders', folderId);
  // A single transaction prevents duplicate seeding and never overwrites edited cards.
  await runTransaction(db, async transaction => {
    assertCurrentAccount(user);
    if ((await transaction.get(ref)).exists()) return;
    transaction.set(ref, { ...sampleFolderFields(uid), createdAt: serverTimestamp() });
    getSampleCardsData(folderId, uid).forEach((card, index) => {
      transaction.set(doc(db, 'flashcards', `${folderId}_${index}`), { ...card, createdAt: serverTimestamp() });
    });
  });
  return folderId;
};

export const subscribeFolders = (
  user: User,
  onData: (folders: FolderData[]) => void,
  onError?: (err: any) => void
): (() => void) => {
  const uid = user.uid;
  const isGuest = isGuestSession(user);

  if (isGuest) {
    const sendData = () => {
      try {
      const folders = getLocalStorageFolders(uid).sort((a, b) => getTimestampMillis(a.createdAt) - getTimestampMillis(b.createdAt));
      onData(folders);
      } catch (error) { onError?.(error); }
    };

    sendData();

    const handler = () => sendData();
    const storageHandler = (event: StorageEvent) => { if (event.key === `hahu_folders_${uid}` || event.key === `hahu_library_${uid}` || event.key === null) sendData(); };
    window.addEventListener('storage', storageHandler);
    window.addEventListener(`hahu_folders_update_${uid}`, handler);
    return () => {
      window.removeEventListener('storage', storageHandler);
      window.removeEventListener(`hahu_folders_update_${uid}`, handler);
    };
  }

  const db = getFirebaseDb();
  if (!db) {
    onError?.(new Error('Database is unavailable. Please reload and retry.'));
    return () => {};
  }

  const q = query(collection(db, 'folders'), where('ownerId', '==', user.uid));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => {
      try {
      if (snapshot.empty && snapshot.metadata.fromCache) return;
      const data = validateStoredFolders(snapshot.docs
        .map(doc => ({ ...doc.data(), id: doc.id })))
        .sort((a, b) => getTimestampMillis(a.createdAt) - getTimestampMillis(b.createdAt));
      onData(data);
      } catch (error) { onError?.(error); }
    },
    (error) => {
      console.warn("Folders snapshot error, retaining last known data:", error);

      if (onError) onError(error);
    }
  );
};

export const subscribeFlashcards = (
  user: User,
  onData: (cards: FlashcardData[]) => void,
  unitId?: string | null,
  isGlobal?: boolean,
  onError?: (err: any) => void
): (() => void) => {
  const uid = user.uid;
  const isGuest = isGuestSession(user);

  if (isGuest) {
    const sendData = () => {
      try {
      const all = getLocalStorageCards(uid).map(c => ({
        ...c,
        frontImageUrl: resolveCardImageUrl(c.frontImageUrl),
        backImageUrl: resolveCardImageUrl(c.backImageUrl)
      }));
      const filtered = all
        .filter(c => isGlobal || !unitId || c.unitId === unitId)
        .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
      onData(filtered);
      } catch (error) { onError?.(error); }
    };

    sendData();
    const handler = () => sendData();
    const storageHandler = (event: StorageEvent) => { if (event.key === `hahu_cards_${uid}` || event.key === `hahu_library_${uid}` || event.key === null) sendData(); };
    window.addEventListener('storage', storageHandler);
    window.addEventListener(`hahu_cards_update_${uid}`, handler);
    return () => {
      window.removeEventListener('storage', storageHandler);
      window.removeEventListener(`hahu_cards_update_${uid}`, handler);
    };
  }

  const db = getFirebaseDb();
  if (!db) {
    onError?.(new Error('Database is unavailable. Please reload and retry.'));
    return () => {};
  }

  const q = query(collection(db, 'flashcards'), where('ownerId', '==', user.uid),
    ...(!isGlobal && unitId ? [where('unitId', '==', unitId)] : []));
  return onSnapshot(
    q,
    (snapshot) => {
      try {
      const rejected: string[] = [];
      const data = snapshot.docs
        .flatMap(doc => {
          let raw: FlashcardData;
          try { raw = validateStoredCard({ ...doc.data(), id: doc.id }); }
          catch { rejected.push(doc.id); return []; }
          return {
            ...raw,
            frontImageUrl: resolveCardImageUrl(raw.frontImageUrl),
            backImageUrl: resolveCardImageUrl(raw.backImageUrl)
          };
        })
        .filter(card => isGlobal || !unitId || card.unitId === unitId)
        .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
      onData(data);
      if (rejected.length) onError?.(new Error(`${rejected.length} invalid saved card(s) could not be displayed. The records have not been deleted. Contact support to recover them. IDs: ${rejected.slice(0, 5).join(', ')}`));
      } catch (error) { onError?.(error); }
    },
    (error) => {
      console.warn("Cards snapshot error, retaining last known data:", error);

      if (onError) onError(error);
    }
  );
};

async function requireFolder(user: User, folderId: string): Promise<FolderData> {
  if (!folderId || folderId.startsWith('global_')) throw new Error('Choose a real destination folder.');
  if (isGuestSession(user)) {
    const folder = getLocalStorageFolders(user.uid).find(folder => folder.id === folderId);
    if (!folder) throw new Error('The destination folder no longer exists.');
    return folder;
  }
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase DB not initialized');
  const snapshot = await getDoc(doc(db, 'folders', folderId));
  if (!snapshot.exists() || snapshot.data().ownerId !== user.uid) throw new Error('The destination folder no longer exists or is not yours.');
  let ancestor = snapshot.data();
  for (let depth = 0; depth < 3; depth++) {
    if (ancestor.deleting) throw new Error('This folder or its parent is being deleted. Choose another destination.');
    if (!ancestor.parentId) break;
    const parent = await getDoc(doc(db, 'folders', ancestor.parentId));
    if (!parent.exists() || parent.data().ownerId !== user.uid) throw new Error('The parent folder is unavailable.');
    ancestor = parent.data();
  }
  return { ...snapshot.data(), id: snapshot.id } as FolderData;
}

const createFolderImpl = async (
  user: User,
  folder: { name: string; parentId: string | null; level: number }
): Promise<string> => {
  if (!Number.isInteger(folder.level) || folder.level < 1 || folder.level > 3) throw new Error('Invalid folder level.');
  if (folder.parentId) {
    const parent = await requireFolder(user, folder.parentId);
    if (folder.level !== parent.level + 1) throw new Error('Invalid folder hierarchy.');
  } else if (folder.level !== 1) throw new Error('Root folders must be level 1.');
  if (!folder.name.trim() || folder.name.trim().length > 100) throw new Error('Folder name must contain 1–100 characters.');
  const uid = user.uid;
  if (isGuestSession(user)) {
    const current = getLocalStorageFolders(uid);
    const newFolder: FolderData = {
      id: 'folder_' + crypto.randomUUID(),
      name: folder.name.trim(),
      parentId: folder.parentId,
      level: folder.level,
      ownerId: uid,
      createdAt: Date.now()
    };
    setLocalStorageFolders(uid, [...current, newFolder]);
    return newFolder.id;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase DB not initialized");
  const folderRef = doc(collection(db, 'folders'));
  await setDoc(folderRef, {
    name: folder.name.trim(),
    parentId: folder.parentId,
    level: folder.level,
    ownerId: user.uid,
    createdAt: serverTimestamp()
  });
  return folderRef.id;
};

const updateFolderImpl = async (
  user: User,
  folderId: string,
  name: string,
  expectedName?: string
): Promise<void> => {
  if (!name.trim() || name.trim().length > 100) throw new Error('Folder name must contain 1–100 characters.');
  const original = await requireFolder(user, folderId);
  assertExpectedFields(original as unknown as Record<string, unknown>, expectedName === undefined ? undefined : { name: expectedName });
  const uid = user.uid;
  if (isGuestSession(user)) {
    const current = getLocalStorageFolders(uid);
    const updated = current.map(f => f.id === folderId ? { ...f, name: name.trim() } : f);
    setLocalStorageFolders(uid, updated);
    return;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase DB not initialized");
  await runTransaction(db, async transaction => {
    assertCurrentAccount(user);
    const ref = doc(db, 'folders', folderId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists() || snapshot.data().ownerId !== uid || snapshot.data().deleting) throw new Error('This folder is no longer available.');
    assertExpectedFields(snapshot.data(), expectedName === undefined ? undefined : { name: expectedName });
    transaction.update(ref, { name: name.trim() });
  });
};

const deleteFolderImpl = async (
  user: User,
  folderId: string
): Promise<void> => {
  const uid = user.uid;
  if (isGuestSession(user)) {
    const currentFolders = getLocalStorageFolders(uid);
    // Find all descendant folders to clean up
    const folderIdsToDelete = new Set<string>([folderId]);
    let addedMore = true;
    while (addedMore) {
      addedMore = false;
      for (const f of currentFolders) {
        if (f.parentId && folderIdsToDelete.has(f.parentId) && !folderIdsToDelete.has(f.id)) {
          folderIdsToDelete.add(f.id);
          addedMore = true;
        }
      }
    }
    const remainingFolders = currentFolders.filter(f => !folderIdsToDelete.has(f.id));

    // Delete associated cards
    const currentCards = getLocalStorageCards(uid);
    const remainingCards = currentCards.filter(c => !folderIdsToDelete.has(c.unitId));
    writeLocalLibrary(uid, { folders: remainingFolders, cards: remainingCards });
    return;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase DB not initialized");
  // Freeze the subtree before enumerating it. Deployed rules must reject writes
  // into a deleting folder OR any descendant of one, including older clients.
  const rootRef = doc(db, 'folders', folderId);
  const exists = await runTransaction(db, async transaction => {
    assertCurrentAccount(user);
    const snapshot = await transaction.get(rootRef);
    if (!snapshot.exists()) return false;
    if (snapshot.data().ownerId !== uid) throw new Error('This folder is not yours.');
    transaction.update(rootRef, { deleting: true });
    return true;
  });
  if (!exists) return;
  const [folderSnapshot, cardSnapshot] = await Promise.all([
    getDocs(query(collection(db, 'folders'), where('ownerId', '==', uid))),
    getDocs(query(collection(db, 'flashcards'), where('ownerId', '==', uid)))
  ]);
  const ids = new Set([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folderSnapshot.docs) {
      if (ids.has(folder.data().parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  const descendants = folderSnapshot.docs.filter(folder => ids.has(folder.id) && folder.id !== folderId);
  for (let i = 0; i < descendants.length; i += 5) {
    assertCurrentAccount(user);
    const batch = writeBatch(db);
    descendants.slice(i, i + 5).forEach(folder => batch.update(folder.ref, { deleting: true }));
    await batch.commit();
  }
  // Delete cards before folders so failed cleanup leaves the hierarchy accessible.
  const refs = [
    ...cardSnapshot.docs.filter(card => ids.has(card.data().unitId)).map(card => card.ref),
    ...folderSnapshot.docs.filter(folder => ids.has(folder.id) && folder.id !== folderId).sort((a, b) => b.data().level - a.data().level).map(folder => folder.ref),
    doc(db, 'folders', folderId)
  ];
  for (let i = 0; i < refs.length; i += 5) {
    const batch = writeBatch(db);
    refs.slice(i, i + 5).forEach(ref => batch.delete(ref));
    try {
      assertCurrentAccount(user);
      await batch.commit();
    } catch (error) {
      throw new Error(`Folder deletion stopped after ${i} of ${refs.length} confirmed records. Check the library before retrying; earlier batches were not rolled back. ${error instanceof Error ? error.message : ''}`);
    }
  }
};

const saveFlashcardImpl = async (
  user: User,
  cardData: any,
  editingCardId?: string,
  openedCard?: FlashcardData
): Promise<string> => {
  cardData = validateCardUpdates(cardData);
  if (!editingCardId || cardData.unitId) await requireFolder(user, cardData.unitId);
  const uid = user.uid;
  if (isGuestSession(user)) {
    const current = getLocalStorageCards(uid);
    if (editingCardId) {
      const existing = current.find(c => c.id === editingCardId);
      if (!existing) throw new Error('This card was deleted. Reopen the folder before editing.');
      assertUnchangedCard(existing, openedCard);
      const updated = current.map(c => c.id === editingCardId ? { ...c, ...cardData, updatedAt: Date.now() } : c);
      setLocalStorageCards(uid, updated);
      return editingCardId;
    } else {
      const newCard: FlashcardData = {
        ...cardData,
        id: 'card_' + crypto.randomUUID(),
        ownerId: uid,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        easeFactor: cardData.easeFactor || 2.5,
        interval: cardData.interval || 0,
        nextReview: cardData.nextReview || Date.now()
      };
      setLocalStorageCards(uid, [newCard, ...current]);
      return newCard.id;
    }
  }

  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase DB not initialized");
  if (editingCardId) {
    await runTransaction(db, async transaction => {
    assertCurrentAccount(user);
      const ref = doc(db, 'flashcards', editingCardId);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists() || snapshot.data().ownerId !== uid) throw new Error('This card is no longer available.');
      assertUnchangedCard(snapshot.data(), openedCard);
      transaction.update(ref, { ...cardData, updatedAt: serverTimestamp() });
    });
    return editingCardId;
  } else {
    const docRef = await addDoc(collection(db, 'flashcards'), {
      ...cardData,
      ownerId: uid,
      createdAt: serverTimestamp(),
      easeFactor: 2.5,
      interval: 0,
      nextReview: Date.now()
    });
    return docRef.id;
  }
};

const updateFlashcardImpl = async (
  user: User,
  cardId: string,
  updates: Partial<FlashcardData>,
  expected?: Partial<FlashcardData>
): Promise<void> => {
  updates = validateCardUpdates(updates as Record<string, unknown>);
  if (updates.unitId) await requireFolder(user, updates.unitId);
  const uid = user.uid;
  if (isGuestSession(user)) {
    const current = getLocalStorageCards(uid);
    const existing = current.find(c => c.id === cardId);
    if (!existing) throw new Error('This card was deleted.');
    assertExpectedFields(existing as unknown as Record<string, unknown>, expected as Record<string, unknown>);
    const updated = current.map(c => c.id === cardId ? { ...c, ...updates, updatedAt: Date.now() } : c);
    setLocalStorageCards(uid, updated);
    return;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase DB not initialized");
  await runTransaction(db, async transaction => {
    assertCurrentAccount(user);
    const ref = doc(db, 'flashcards', cardId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists() || snapshot.data().ownerId !== uid) throw new Error('This card is no longer available.');
    assertExpectedFields(snapshot.data(), expected as Record<string, unknown>);
    transaction.update(ref, { ...updates, updatedAt: serverTimestamp() });
  });
};

const deleteFlashcardImpl = async (
  user: User,
  cardId: string
): Promise<void> => {
  const uid = user.uid;
  if (isGuestSession(user)) {
    const current = getLocalStorageCards(uid);
    setLocalStorageCards(uid, current.filter(c => c.id !== cardId));
    return;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase DB not initialized");
  await deleteDoc(doc(db, 'flashcards', cardId));
};

const bulkDeleteFlashcardsImpl = async (
  user: User,
  cardIds: string[]
): Promise<void> => {
  const uid = user.uid;
  if (isGuestSession(user)) {
    const idSet = new Set(cardIds);
    const current = getLocalStorageCards(uid);
    setLocalStorageCards(uid, current.filter(c => !idSet.has(c.id)));
    return;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase DB not initialized");
  for (let i = 0; i < cardIds.length; i += 5) {
    const batch = writeBatch(db);
    cardIds.slice(i, i + 5).forEach(id => batch.delete(doc(db, 'flashcards', id)));
    try {
      assertCurrentAccount(user);
      await batch.commit();
    } catch (error) {
      throw new Error(`Card deletion stopped after ${i} of ${cardIds.length} confirmed records. Check the library before retrying; earlier batches were not rolled back. ${error instanceof Error ? error.message : ''}`);
    }
  }
};

const bulkMoveFlashcardsImpl = async (
  user: User,
  cardIds: string[],
  targetUnitId: string,
  expectedOrigins?: Record<string, string>
): Promise<void> => {
  await requireFolder(user, targetUnitId);
  const uid = user.uid;
  if (isGuestSession(user)) {
    const idSet = new Set(cardIds);
    const current = getLocalStorageCards(uid);
    const byId = new Map(current.map(card => [card.id, card]));
    for (const id of cardIds) {
      const card = byId.get(id);
      if (!card) throw new Error('Some selected cards were deleted. Refresh your selection before moving.');
      if (card.unitId !== targetUnitId && expectedOrigins?.[id] !== undefined) assertExpectedFields({ unitId: card.unitId }, { unitId: expectedOrigins[id] });
    }
    const updated = current.map(c => idSet.has(c.id) ? { ...c, unitId: targetUnitId, updatedAt: Date.now() } : c);
    setLocalStorageCards(uid, updated);
    return;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase DB not initialized");
  for (let i = 0; i < cardIds.length; i += 5) {
    try {
      assertCurrentAccount(user);
      await runTransaction(db, async transaction => {
        assertCurrentAccount(user);
        const refs = cardIds.slice(i, i + 5).map(id => doc(db, 'flashcards', id));
        const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
        snapshots.forEach((snapshot, index) => {
          if (!snapshot.exists() || snapshot.data().ownerId !== uid) throw new Error('A selected card is no longer available.');
          if (snapshot.data().unitId === targetUnitId) return;
          const expected = expectedOrigins?.[snapshot.id];
          if (expected !== undefined) assertExpectedFields(snapshot.data(), { unitId: expected });
          transaction.update(refs[index], { unitId: targetUnitId, updatedAt: serverTimestamp() });
        });
      });
    } catch (error) {
      throw new Error(`Card move stopped after ${i} of ${cardIds.length} confirmed records. Check the library before retrying; earlier batches were not rolled back. ${error instanceof Error ? error.message : ''}`);
    }
  }
};

const importBatchCardsImpl = async (
  user: User,
  unitId: string,
  cards: any[],
  onProgress?: (saved: number, total: number) => void,
  importToken?: string,
  confirmed = 0
): Promise<void> => {
  if (!Array.isArray(cards) || cards.length > 1000) throw new Error('Import at most 1000 cards at a time.');
  await requireFolder(user, unitId);
  cards = cards.map(card => validateCardUpdates(card));
  const uid = user.uid;
  const total = cards.length;

  if (isGuestSession(user)) {
    const current = getLocalStorageCards(uid);
    const newCards: FlashcardData[] = cards.map((c, index) => ({
      ...c,
      id: importToken ? `import_${importToken}_${index}` : 'card_' + crypto.randomUUID(),
      unitId,
      ownerId: uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      easeFactor: c.easeFactor || 2.5,
      interval: c.interval || 0,
      nextReview: c.nextReview || Date.now()
    }));
    const existingIds = new Set(current.map(card => card.id));
    if (newCards.slice(0, confirmed).some(card => !existingIds.has(card.id))) throw new Error('Previously imported cards were deleted. Resume stopped to avoid restoring deleted content.');
    setLocalStorageCards(uid, [...newCards.filter(card => !existingIds.has(card.id)), ...current]);
    if (onProgress) onProgress(total, total);
    return;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase DB not initialized");

  let saved = 0;
  try {
    for (let i = 0; i < total; i += 5) {
      const group = cards.slice(i, i + 5);
      const refs = group.map((_, index) => importToken ? doc(db, 'flashcards', `import_${importToken}_${i + index}`) : doc(collection(db, 'flashcards')));
      await runTransaction(db, async transaction => {
        assertCurrentAccount(user);
        const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
        group.forEach((cardData, index) => {
          if (i + index < confirmed && !snapshots[index].exists()) throw new Error('Previously imported cards were deleted. Resume stopped to avoid restoring deleted content.');
          if (snapshots[index].exists()) {
            if (snapshots[index].data()?.ownerId !== uid) throw new Error('Import identity belongs to another account.');
            return; // An interrupted retry must not overwrite edits or reviews.
          }
          transaction.set(refs[index], {
            ...cardData, unitId, ownerId: uid, createdAt: serverTimestamp(),
            easeFactor: cardData.easeFactor ?? 2.5, interval: cardData.interval ?? 0, nextReview: cardData.nextReview ?? Date.now()
          });
        });
      });
      saved += group.length;
      onProgress?.(saved, total);
    }
  } catch (error) {
    throw new Error(`Import stopped after ${saved} of ${total} confirmed cards. Check the destination before retrying to avoid duplicates. ${error instanceof Error ? error.message : ''}`);
  }
};

/** Copy (never delete) a local library. Deterministic IDs make interrupted retries safe. */
async function migrateLocalGuestLibraryImpl(guestUid: string, user: User): Promise<void> {
  if (!guestUid.startsWith('guest_') || isGuestSession(user)) throw new Error('Invalid library migration');
  const library = readLocalLibrary(guestUid);
  if (orphanReferences(library).size) throw new Error('Recover missing-folder items in the guest library before copying it to Google.');
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase DB not initialized');
  const resolveId = async (collectionName: string, sourceId: string) => {
    const legacy = `${guestUid}_${sourceId}`;
    if (legacy.length <= 128) {
      try {
        const old = await getDoc(doc(db, collectionName, legacy));
        if (old.exists() && old.data().ownerId === user.uid) return legacy;
      } catch (error) {
        if ((error as { code?: string }).code !== 'permission-denied') throw error;
      }
    }
    return migrationRecordId(user.uid, guestUid, sourceId);
  };
  const folderIds = new Map<string, string>();
  for (const folder of library.folders) folderIds.set(folder.id, await resolveId('folders', folder.id));
  const entries = [
    ...([...library.folders].sort((a, b) => a.level - b.level)).map(folder => ({ collection: 'folders', id: folderIds.get(folder.id)!, data: {
      name: folder.name, level: folder.level, parentId: folder.parentId ? folderIds.get(folder.parentId) || null : null,
      ownerId: user.uid, createdAt: serverTimestamp(), ...(folder.isSample ? { isSample: true } : {})
    }})),
    ...library.cards.map(card => {
      const { id, createdAt, ...data } = card;
      const unitId = folderIds.get(card.unitId);
      if (!unitId) throw new Error('A guest card has no folder. Repair or export the guest library before migrating.');
      return { collection: 'flashcards', id: `${guestUid}_${id}`, data: { ...validateCardUpdates(data), unitId, ownerId: user.uid, createdAt: serverTimestamp() } };
    })
  ];
  for (const entry of entries) {
    const id = entry.collection === 'flashcards' ? await resolveId('flashcards', entry.id.slice(guestUid.length + 1)) : entry.id;
    await runTransaction(db, async transaction => {
      assertCurrentAccount(user);
      const ref = doc(db, entry.collection, id);
      if (!(await transaction.get(ref)).exists()) transaction.set(ref, entry.data);
    });
  }
}

async function reviewFlashcardImpl(user: User, cardId: string, rating: 'hard' | 'good' | 'easy'): Promise<void> {
  if (isGuestSession(user)) {
    const library = readLocalLibrary(user.uid);
    const card = library.cards.find(card => card.id === cardId);
    if (!card) throw new Error('This card was deleted.');
    writeLocalLibrary(user.uid, { ...library, cards: library.cards.map(c => c.id === cardId ? { ...c, ...calculateReview(card, rating) } : c) });
    return;
  }
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase DB not initialized');
  await runTransaction(db, async transaction => {
    assertCurrentAccount(user);
    const ref = doc(db, 'flashcards', cardId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists() || snapshot.data().ownerId !== user.uid) throw new Error('This card is no longer available.');
    transaction.update(ref, { ...calculateReview(snapshot.data(), rating), updatedAt: serverTimestamp() });
  });
}

export const seedSampleData = (...args: Parameters<typeof seedSampleDataImpl>): ReturnType<typeof seedSampleDataImpl> => {
  const user = args[0];
  return protectedOperation(user.uid, isGuestSession(user), async () => { assertCurrentAccount(user); return seedSampleDataImpl(...args); }, false);
};

export const createFolder = (...args: Parameters<typeof createFolderImpl>): ReturnType<typeof createFolderImpl> => {
  const user = args[0];
  return protectedOperation(user.uid, isGuestSession(user), async () => { assertCurrentAccount(user); return createFolderImpl(...args); }, false);
};

export const updateFolder = (...args: Parameters<typeof updateFolderImpl>): ReturnType<typeof updateFolderImpl> => {
  const user = args[0];
  return protectedOperation(user.uid, isGuestSession(user), async () => { assertCurrentAccount(user); return updateFolderImpl(...args); }, false);
};

export const deleteFolder = (...args: Parameters<typeof deleteFolderImpl>): ReturnType<typeof deleteFolderImpl> => {
  const user = args[0];
  return protectedOperation(user.uid, isGuestSession(user), async () => { assertCurrentAccount(user); return deleteFolderImpl(...args); }, false);
};

export const saveFlashcard = (...args: Parameters<typeof saveFlashcardImpl>): ReturnType<typeof saveFlashcardImpl> => {
  const user = args[0];
  return protectedOperation(user.uid, isGuestSession(user), async () => { assertCurrentAccount(user); return saveFlashcardImpl(...args); }, false);
};

export const updateFlashcard = (...args: Parameters<typeof updateFlashcardImpl>): ReturnType<typeof updateFlashcardImpl> => {
  const user = args[0];
  return protectedOperation(user.uid, isGuestSession(user), async () => { assertCurrentAccount(user); return updateFlashcardImpl(...args); }, false);
};

export const deleteFlashcard = (...args: Parameters<typeof deleteFlashcardImpl>): ReturnType<typeof deleteFlashcardImpl> => {
  const user = args[0];
  return protectedOperation(user.uid, isGuestSession(user), async () => { assertCurrentAccount(user); return deleteFlashcardImpl(...args); }, false);
};

export const bulkDeleteFlashcards = (...args: Parameters<typeof bulkDeleteFlashcardsImpl>): ReturnType<typeof bulkDeleteFlashcardsImpl> => {
  const user = args[0];
  return protectedOperation(user.uid, isGuestSession(user), async () => { assertCurrentAccount(user); return bulkDeleteFlashcardsImpl(...args); }, false);
};

export const bulkMoveFlashcards = (...args: Parameters<typeof bulkMoveFlashcardsImpl>): ReturnType<typeof bulkMoveFlashcardsImpl> => {
  const user = args[0];
  return protectedOperation(user.uid, isGuestSession(user), async () => { assertCurrentAccount(user); return bulkMoveFlashcardsImpl(...args); }, false);
};

export const importBatchCards = (...args: Parameters<typeof importBatchCardsImpl>): ReturnType<typeof importBatchCardsImpl> => {
  const user = args[0];
  return protectedOperation(user.uid, isGuestSession(user), async () => { assertCurrentAccount(user); return importBatchCardsImpl(...args); }, false);
};

export const migrateLocalGuestLibrary = (...args: Parameters<typeof migrateLocalGuestLibraryImpl>): ReturnType<typeof migrateLocalGuestLibraryImpl> => {
  const user = args[1];
  return protectedOperation(user.uid, isGuestSession(user), async () => { assertCurrentAccount(user); return migrateLocalGuestLibraryImpl(...args); }, true);
};

export const reviewFlashcard = (...args: Parameters<typeof reviewFlashcardImpl>): ReturnType<typeof reviewFlashcardImpl> => {
  const user = args[0];
  return protectedOperation(user.uid, isGuestSession(user), async () => { assertCurrentAccount(user); return reviewFlashcardImpl(...args); }, false);
};

/** Validate before mutation, retain stable IDs across interrupted retries, never replay automatically. */
export async function importDeckFile(user: User, file: File, destination?: string, onProgress?: (percent: number, status: string) => void, onResume?: (confirmed: number) => boolean | 'resume' | 'copy' | 'cancel'): Promise<string> {
  const startedAt = Date.now();
  return protectedOperation(user.uid, false, async () => {
    assertCurrentAccount(user);
    const parsed = await parseImportDeckFile(file, (percent, status) => onProgress?.(Math.round(percent * 0.7), status));
    if (!parsed.cards.length) throw new Error('The selected archive contains no flashcards. Nothing was imported.');
    const fingerprint = await importFingerprint(await file.arrayBuffer());
    pruneImportReceipts(localStorage, user.uid);
    const key = `hahu_import_${user.uid}_${destination || 'new'}_${fingerprint}`;
    const perform = async () => {
      let job = parseImportJob(localStorage.getItem(key));
      if (job?.status === 'complete') {
        if ((job.updatedAt || 0) >= startedAt) return job.folderId; // Same concurrent submission, not an intentional later import.
        job = null;
      } else if (job && onResume) {
        const decision = onResume(job.confirmed || 0);
        if (decision === false || decision === 'cancel') throw new Error('Import cancelled. Previous progress was kept.');
        if (decision === 'copy') job = null; // Explicit choice; previously imported content is never deleted.
      }
      if (!job) {
        job = { version: 2, status: 'active', confirmed: 0, updatedAt: Date.now(), token: crypto.randomUUID(), folderId: destination || 'folder_' + crypto.randomUUID() };
        try { localStorage.setItem(key, JSON.stringify(job)); }
        catch { throw new Error('Import recovery needs available browser storage. Free some space and retry. No cards were imported.'); }
      }
      const active = job;
      const checkpoint = (confirmed: number) => {
        active.confirmed = Math.max(active.confirmed || 0, confirmed); active.updatedAt = Date.now(); active.version = 2; active.status = 'active';
        try { localStorage.setItem(key, JSON.stringify(active)); }
        catch { throw new Error('Import paused because recovery storage is full. Confirmed cards remain saved. Do not clear browser storage; free unrelated space and retry.'); }
      };
      await protectedOperation(user.uid, isGuestSession(user), async () => {
        assertCurrentAccount(user);
        if (isGuestSession(user) && !destination) {
          const library = readLocalLibrary(user.uid);
          if (active.folderCreated && !library.folders.some(folder => folder.id === active.folderId)) throw new Error('The imported folder was deleted. Resume will not recreate it.');
          const folders = library.folders.some(folder => folder.id === active.folderId) ? library.folders : [...library.folders, {
            id: active.folderId, name: parsed.deckName, parentId: null, level: 1, ownerId: user.uid, createdAt: Date.now()
          }];
          const cards = parsed.cards.map((card, index) => ({ ...card, id: `import_${active.token}_${index}`, unitId: active.folderId, ownerId: user.uid, createdAt: Date.now() } as FlashcardData));
          const existingIds = new Set(library.cards.map(card => card.id));
          if (cards.slice(0, active.confirmed || 0).some(card => !existingIds.has(card.id))) throw new Error('Previously imported cards were deleted. Resume will not restore them.');
          writeLocalLibrary(user.uid, { folders, cards: [...cards.filter(card => !existingIds.has(card.id)), ...library.cards] });
        } else {
          if (!destination) {
            const db = getFirebaseDb();
            if (!db) throw new Error('Database unavailable.');
            await runTransaction(db, async transaction => {
              assertCurrentAccount(user);
              const ref = doc(db, 'folders', active.folderId);
              const existing = await transaction.get(ref);
              if (existing.exists()) {
                if (existing.data().ownerId !== user.uid) throw new Error('Destination belongs to another account.');
              } else {
                if (active.folderCreated) throw new Error('The imported folder was deleted. Resume will not recreate it.');
                transaction.set(ref, { name: parsed.deckName, parentId: null, level: 1, ownerId: user.uid, createdAt: serverTimestamp() });
              }
            });
          }
          active.folderCreated = true; checkpoint(active.confirmed || 0);
          await importBatchCardsImpl(user, active.folderId, parsed.cards, (saved, total) => {
            checkpoint(saved);
            onProgress?.(70 + Math.round(saved / total * 30), `Imported ${saved} of ${total} cards...`);
          }, active.token, active.confirmed || 0);
        }
      });
      active.folderCreated = true; active.confirmed = parsed.cards.length; active.status = 'complete'; active.updatedAt = Date.now(); active.version = 2;
      try { localStorage.setItem(key, JSON.stringify(active)); } catch { /* Existing active checkpoint is retained for safe retry. */ }
      onProgress?.(100, 'Import complete.');
      return active.folderId;
    };
    // Two tabs selecting the same file share one recovery record.
    if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(key, perform);
    return perform();
  });
}


export async function recoverLocalOrphans(user: User): Promise<void> {
  if (!isGuestSession(user)) throw new Error('Local recovery is only available for a local guest library.');
  return protectedOperation(user.uid, true, async () => {
    assertCurrentAccount(user);
    const before = readLocalLibrary(user.uid);
    if (!orphanReferences(before).size) return;
    const after = recoverOrphans(before, user.uid, 'folder_' + crypto.randomUUID());
    try { localStorage.setItem(`hahu_repair_backup_${user.uid}`, JSON.stringify(before)); }
    catch { throw new Error('Could not preserve a recovery backup. Free browser storage and retry. The library is unchanged.'); }
    writeLocalLibrary(user.uid, after);
  });
}
