import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithCredential, linkWithCredential, linkWithPopup, signInAnonymously, signOut, onAuthStateChanged, User, Auth } from 'firebase/auth';
import { 
  getFirestore,
  runTransaction,
  getDoc,
  writeBatch,
  initializeFirestore,
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  serverTimestamp, 
  Timestamp, 
  addDoc, 
  getDocs,
  getDocFromServer, 
  Firestore 
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let googleProviderInstance: GoogleAuthProvider | null = null;

export const getFirebaseApp = () => {
  if (!app) {
    try {
      app = initializeApp(firebaseConfig);
    } catch (e) {
      console.error("Firebase initialization error", e);
    }
  }
  return app;
};

export const getFirebaseAuth = () => {
  if (!authInstance) {
    const a = getFirebaseApp();
    if (a) {
      try {
        authInstance = getAuth(a);
      } catch (e) {
        console.error("Firebase Auth initialization error", e);
      }
    }
  }
  return authInstance;
};

export const getFirebaseDb = () => {
  if (!dbInstance) {
    const a = getFirebaseApp();
    if (a) {
      try {
        dbInstance = getFirestore(a, firebaseConfig.firestoreDatabaseId);
      } catch (e) {
        console.error("Firestore initialization error", e);
      }
    }
  }
  return dbInstance;
};

export const getGoogleProvider = () => {
  if (!googleProviderInstance) {
    googleProviderInstance = new GoogleAuthProvider();
    googleProviderInstance.setCustomParameters({
      prompt: 'select_account'
    });
  }
  return googleProviderInstance;
};

export async function testFirestoreConnection(): Promise<boolean> {
  const db = getFirebaseDb();
  if (!db) return false;
  try {
    await getDocFromServer(doc(db, 'folders', '__connection_health_check__'));
    return true;
  } catch (error) {
    if (error instanceof Error && (error.message.includes('offline') || error.message.includes('unavailable'))) {
      console.warn("Firestore connection check: client is offline or reconnecting.");
      return false;
    }
    return false;
  }
}

export {
  runTransaction,
  getDoc,
  writeBatch,
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithCredential,
  linkWithCredential,
  linkWithPopup,
  signInAnonymously, 
  signOut, 
  onAuthStateChanged, 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  serverTimestamp, 
  Timestamp, 
  addDoc, 
  getDocs,
  getDocFromServer 
};
export type { User };

export const oAuthClientId = firebaseConfig.oAuthClientId;
