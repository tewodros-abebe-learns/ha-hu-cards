import { 
  getFirebaseDb, 
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
import { FolderData, FlashcardData, getTimestampMillis } from './App';
import { getSampleCardsData, resolveCardImageUrl } from './sampleCardsData';

export const isGuestSession = (user: User | null): boolean => {
  if (!user) return true;
  if (user.uid.startsWith('guest_')) return true;
  const auth = getFirebaseAuth();
  if (user.isAnonymous && (!auth || !auth.currentUser)) return true;
  return false;
};

export const createLocalGuestUser = (): User => {
  let guestUid = localStorage.getItem('hahu_guest_uid');
  if (!guestUid) {
    guestUid = 'guest_' + Math.random().toString(36).substring(2, 10);
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
const getLocalStorageFolders = (uid: string): FolderData[] => {
  try {
    const raw = localStorage.getItem(`hahu_folders_${uid}`);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error("Error reading local folders:", e);
    return [];
  }
};

const setLocalStorageFolders = (uid: string, folders: FolderData[]) => {
  try {
    localStorage.setItem(`hahu_folders_${uid}`, JSON.stringify(folders));
    window.dispatchEvent(new CustomEvent(`hahu_folders_update_${uid}`, { detail: folders }));
  } catch (e) {
    console.error("Error writing local folders:", e);
  }
};

const getLocalStorageCards = (uid: string): FlashcardData[] => {
  try {
    const raw = localStorage.getItem(`hahu_cards_${uid}`);
    if (!raw) return [];
    const list: FlashcardData[] = JSON.parse(raw);
    return list.map(c => ({
      ...c,
      frontImageUrl: resolveCardImageUrl(c.frontImageUrl),
      backImageUrl: resolveCardImageUrl(c.backImageUrl)
    }));
  } catch (e) {
    console.error("Error reading local cards:", e);
    return [];
  }
};

const setLocalStorageCards = (uid: string, cards: FlashcardData[]) => {
  try {
    localStorage.setItem(`hahu_cards_${uid}`, JSON.stringify(cards));
    window.dispatchEvent(new CustomEvent(`hahu_cards_update_${uid}`, { detail: cards }));
  } catch (e) {
    console.error("Error writing local cards:", e);
  }
};

// --- Unified Data API ---

export const seedSampleData = async (user: User): Promise<string | null> => {
  const uid = user.uid;
  const isGuest = isGuestSession(user);

  if (isGuest) {
    const existingFolders = getLocalStorageFolders(uid);
    let sampleFolder = existingFolders.find(f => 
      f.name.toLowerCase().includes('sample') || 
      f.name.toLowerCase().includes('try now') ||
      f.name.toLowerCase().includes('try sample')
    );

    let folderId = sampleFolder?.id;
    if (!sampleFolder) {
      folderId = 'folder_sample_' + Math.random().toString(36).substring(2, 8);
      const newFolder: FolderData = {
        id: folderId,
        name: 'Try sample',
        parentId: null,
        level: 1,
        ownerId: uid,
        createdAt: Date.now()
      };
      existingFolders.push(newFolder);
      setLocalStorageFolders(uid, existingFolders);
    }

    if (folderId) {
      const existingCards = getLocalStorageCards(uid);
      const cardsInFolder = existingCards.filter(c => c.unitId === folderId);
      if (cardsInFolder.length === 0) {
        const sampleCardsRaw = getSampleCardsData(folderId, uid);
        const sampleCards: FlashcardData[] = sampleCardsRaw.map(c => ({
          ...c,
          verticalAlign: (c.verticalAlign || 'center') as 'top' | 'center' | 'bottom',
          id: 'card_' + Math.random().toString(36).substring(2, 8),
          createdAt: Date.now()
        }));
        setLocalStorageCards(uid, [...existingCards, ...sampleCards]);
      }
    }
    return folderId || null;
  } else {
    try {
      const db = getFirebaseDb();
      if (!db) return null;
      const folderRef = doc(collection(db, 'folders'));
      const folderId = folderRef.id;

      await setDoc(folderRef, {
        name: "Try sample",
        parentId: null,
        level: 1,
        ownerId: user.uid,
        createdAt: serverTimestamp()
      });

      const sampleCards = getSampleCardsData(folderId, user.uid);
      for (const card of sampleCards) {
        await addDoc(collection(db, 'flashcards'), {
          ...card,
          createdAt: serverTimestamp()
        });
      }
      return folderId;
    } catch (e: any) {
      console.warn("Firestore sample seed fallback to local:", e);
      if (e.message && e.message.includes('permission')) {
          alert('Firestore Error: ' + e.message);
      }
      return null;
    }
  }
};

export const ensureCardsInFolder = async (user: User, folderId: string) => {
  const uid = user.uid;
  const isGuest = isGuestSession(user);

  if (isGuest) {
    const existingCards = getLocalStorageCards(uid);
    const inFolder = existingCards.filter(c => c.unitId === folderId);
    if (inFolder.length === 0) {
      const sampleCardsRaw = getSampleCardsData(folderId, uid);
      const sampleCards: FlashcardData[] = sampleCardsRaw.map(c => ({
        ...c,
        verticalAlign: (c.verticalAlign || 'center') as 'top' | 'center' | 'bottom',
        id: 'card_' + Math.random().toString(36).substring(2, 8),
        createdAt: Date.now()
      }));
      setLocalStorageCards(uid, [...existingCards, ...sampleCards]);
    }
  } else {
    try {
      const db = getFirebaseDb();
      if (!db) return;
      const q = query(
        collection(db, 'flashcards'),
        where('ownerId', '==', user.uid),
        where('unitId', '==', folderId)
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        const sampleCards = getSampleCardsData(folderId, user.uid);
        for (const card of sampleCards) {
          await addDoc(collection(db, 'flashcards'), {
            ...card,
            createdAt: serverTimestamp()
          });
        }
      }
    } catch (e) {
      console.error("Error ensuring cards:", e);
    }
  }
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
      const folders = getLocalStorageFolders(uid).sort((a, b) => getTimestampMillis(a.createdAt) - getTimestampMillis(b.createdAt));
      onData(folders);
    };

    // Auto seed sample if empty
    const current = getLocalStorageFolders(uid);
    if (current.length === 0) {
      seedSampleData(user).then(() => sendData());
    } else {
      sendData();
    }

    const handler = () => sendData();
    window.addEventListener(`hahu_folders_update_${uid}`, handler);
    return () => {
      window.removeEventListener(`hahu_folders_update_${uid}`, handler);
    };
  }

  const db = getFirebaseDb();
  if (!db) {
    onData([]);
    return () => {};
  }

  const q = query(collection(db, 'folders'), where('ownerId', '==', user.uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as FolderData))
        .sort((a, b) => getTimestampMillis(a.createdAt) - getTimestampMillis(b.createdAt));
      onData(data);
    },
    (error) => {
      console.warn("Folders snapshot error, falling back to local:", error);
      const local = getLocalStorageFolders(uid);
      onData(local);
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
      const all = getLocalStorageCards(uid).map(c => ({
        ...c,
        frontImageUrl: resolveCardImageUrl(c.frontImageUrl),
        backImageUrl: resolveCardImageUrl(c.backImageUrl)
      }));
      const filtered = all
        .filter(c => isGlobal || !unitId || c.unitId === unitId)
        .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
      onData(filtered);
    };

    sendData();
    const handler = () => sendData();
    window.addEventListener(`hahu_cards_update_${uid}`, handler);
    return () => {
      window.removeEventListener(`hahu_cards_update_${uid}`, handler);
    };
  }

  const db = getFirebaseDb();
  if (!db) {
    onData([]);
    return () => {};
  }

  const q = query(collection(db, 'flashcards'), where('ownerId', '==', user.uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs
        .map(doc => {
          const raw = { id: doc.id, ...doc.data() } as FlashcardData;
          return {
            ...raw,
            frontImageUrl: resolveCardImageUrl(raw.frontImageUrl),
            backImageUrl: resolveCardImageUrl(raw.backImageUrl)
          };
        })
        .filter(card => isGlobal || !unitId || card.unitId === unitId)
        .sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
      onData(data);
    },
    (error) => {
      console.warn("Cards snapshot error, falling back to local:", error);
      const local = getLocalStorageCards(uid).filter(c => isGlobal || !unitId || c.unitId === unitId);
      onData(local);
      if (onError) onError(error);
    }
  );
};

export const createFolder = async (
  user: User,
  folder: { name: string; parentId: string | null; level: number }
): Promise<string> => {
  const uid = user.uid;
  if (isGuestSession(user)) {
    const current = getLocalStorageFolders(uid);
    const newFolder: FolderData = {
      id: 'folder_' + Math.random().toString(36).substring(2, 10),
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

export const updateFolder = async (
  user: User,
  folderId: string,
  name: string
): Promise<void> => {
  const uid = user.uid;
  if (isGuestSession(user)) {
    const current = getLocalStorageFolders(uid);
    const updated = current.map(f => f.id === folderId ? { ...f, name: name.trim() } : f);
    setLocalStorageFolders(uid, updated);
    return;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase DB not initialized");
  await updateDoc(doc(db, 'folders', folderId), { name: name.trim() });
};

export const deleteFolder = async (
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
    setLocalStorageFolders(uid, remainingFolders);

    // Delete associated cards
    const currentCards = getLocalStorageCards(uid);
    const remainingCards = currentCards.filter(c => !folderIdsToDelete.has(c.unitId));
    setLocalStorageCards(uid, remainingCards);
    return;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase DB not initialized");
  await deleteDoc(doc(db, 'folders', folderId));
};

export const saveFlashcard = async (
  user: User,
  cardData: any,
  editingCardId?: string
): Promise<string> => {
  const uid = user.uid;
  if (isGuestSession(user)) {
    const current = getLocalStorageCards(uid);
    if (editingCardId) {
      const updated = current.map(c => c.id === editingCardId ? { ...c, ...cardData, updatedAt: Date.now() } : c);
      setLocalStorageCards(uid, updated);
      return editingCardId;
    } else {
      const newCard: FlashcardData = {
        ...cardData,
        id: 'card_' + Math.random().toString(36).substring(2, 10),
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
    await updateDoc(doc(db, 'flashcards', editingCardId), {
      ...cardData,
      updatedAt: serverTimestamp()
    });
    return editingCardId;
  } else {
    const docRef = await addDoc(collection(db, 'flashcards'), {
      ...cardData,
      createdAt: serverTimestamp(),
      easeFactor: 2.5,
      interval: 0,
      nextReview: Date.now()
    });
    return docRef.id;
  }
};

export const updateFlashcard = async (
  user: User,
  cardId: string,
  updates: Partial<FlashcardData>
): Promise<void> => {
  const uid = user.uid;
  if (isGuestSession(user)) {
    const current = getLocalStorageCards(uid);
    const updated = current.map(c => c.id === cardId ? { ...c, ...updates, updatedAt: Date.now() } : c);
    setLocalStorageCards(uid, updated);
    return;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase DB not initialized");
  await updateDoc(doc(db, 'flashcards', cardId), {
    ...updates,
    updatedAt: serverTimestamp()
  });
};

export const deleteFlashcard = async (
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

export const bulkDeleteFlashcards = async (
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
  await Promise.all(cardIds.map(id => deleteDoc(doc(db, 'flashcards', id))));
};

export const bulkMoveFlashcards = async (
  user: User,
  cardIds: string[],
  targetUnitId: string
): Promise<void> => {
  const uid = user.uid;
  if (isGuestSession(user)) {
    const idSet = new Set(cardIds);
    const current = getLocalStorageCards(uid);
    const updated = current.map(c => idSet.has(c.id) ? { ...c, unitId: targetUnitId, updatedAt: Date.now() } : c);
    setLocalStorageCards(uid, updated);
    return;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase DB not initialized");
  await Promise.all(cardIds.map(id => updateDoc(doc(db, 'flashcards', id), { unitId: targetUnitId })));
};

export const importBatchCards = async (
  user: User,
  unitId: string,
  cards: any[],
  onProgress?: (saved: number, total: number) => void
): Promise<void> => {
  const uid = user.uid;
  const total = cards.length;

  if (isGuestSession(user)) {
    const current = getLocalStorageCards(uid);
    const newCards: FlashcardData[] = cards.map(c => ({
      ...c,
      id: 'card_' + Math.random().toString(36).substring(2, 10),
      unitId,
      ownerId: uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      easeFactor: c.easeFactor || 2.5,
      interval: c.interval || 0,
      nextReview: c.nextReview || Date.now()
    }));
    setLocalStorageCards(uid, [...newCards, ...current]);
    if (onProgress) onProgress(total, total);
    return;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase DB not initialized");

  for (let i = 0; i < total; i += 5) {
    const batch = cards.slice(i, i + 5);
    await Promise.all(
      batch.map(cardData => {
        const newCard = {
          ...cardData,
          unitId,
          ownerId: user.uid,
          createdAt: serverTimestamp(),
        };
        return addDoc(collection(db, 'flashcards'), newCard);
      })
    );
    const currentSaved = Math.min(i + 5, total);
    if (onProgress) onProgress(currentSaved, total);
  }
};
