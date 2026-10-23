import { ReviewHub } from './components/ReviewHub';
import { ProfileAvatar } from './components/ProfileAvatar';
import { orphanReferences } from './libraryRecovery';
import { exportScope, folderIsDeleting } from './dataIntegrity';
import { authErrorMessage } from './authErrors';
import { readEditorDraft } from './editorDraft';
import { beginAuthTransition, pendingOperations, subscribeOperations, protectedOperation, setOperationIdentity } from './operationSafety';
import { prepareEditorImage, imageDataUrl } from './imageProcessing';
import { useDialog, useBeforeUnload } from './hooks/useDialog';
import { usePendingAction } from './hooks/usePendingAction';
import { interactionCopy } from './interactionCopy';
import { folderPath, visibleSelection } from './interactionUtils';
import { optionalStorage } from './browserStorage';
import { calculateReview, formatReviewDelay, type ReviewRating, newerSession, clearOwnedRecovery, remainingSeconds, parseStoredSession, validSessionConfig, dateBoundaries as getDateBoundaries } from './studyUtils';
import React, { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback, useSyncExternalStore, Component } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Settings,
  LogOut,
  User as UserIcon,
  Plus,
  Search,
  ChevronRight,
  ChevronDown,
  Layers,
  GraduationCap,
  Folder,
  FolderPlus,
  Edit2,
  Trash2,
  MoreVertical,
  X,
  Check,
  Play,
  FolderInput,
  Maximize,
  Minimize,
  Timer,
  BrainCircuit,
  Lock,
  Download,
  Upload,
  AlertCircle,
  FileArchive,
  Loader2,
  Sparkles,
  Lightbulb,
  HelpCircle,
  ArrowRight,
  CheckCircle2,
  Globe,
  Sun,
  Moon,
  Info,
  Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactCrop, { type Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { getCroppedImg, getCropBounds } from './cropUtils';
import { translations } from './translations';
import { SAMPLE_CARD_IMAGES, resolveCardImageUrl, getSampleCardsData } from './sampleCardsData';

export type Language = 'English' | 'Amharic';

import { exportDeckAsZip } from './deckArchive';
import {
  getFirebaseAuth,
  getFirebaseDb,
  getGoogleProvider,
  signInWithPopup,
  linkWithPopup,
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
  signInAnonymously,
  User
} from './firebase';
import {
  isGuestSession,
  createLocalGuestUser,
  subscribeFolders,
  subscribeFlashcards,
  createFolder,
  updateFolder,
  deleteFolder,
  saveFlashcard,
  updateFlashcard,
  reviewFlashcard,
  deleteFlashcard,
  bulkDeleteFlashcards,
  bulkMoveFlashcards,
  importDeckFile,
  seedSampleData,
  recoverLocalOrphans,
  isSampleFolder,
  migrateLocalGuestLibrary
} from './dataStore';

function useCalendarDay() {
  const [day, setDay] = useState(() => new Date().toDateString());
  useEffect(() => {
    const refresh = () => setDay(new Date().toDateString());
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  return day;
}

// --- Types ---

import { getTimestampMillis, type FolderData, type FlashcardData } from './models';
export { getTimestampMillis, type FolderData, type FlashcardData } from './models';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: getFirebaseAuth()?.currentUser?.uid,
      email: getFirebaseAuth()?.currentUser?.email,
      emailVerified: getFirebaseAuth()?.currentUser?.emailVerified,
      isAnonymous: getFirebaseAuth()?.currentUser?.isAnonymous,
      tenantId: getFirebaseAuth()?.currentUser?.tenantId,
      providerInfo: getFirebaseAuth()?.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Data operation failed:', errInfo.error);
  alert(`Could not ${operationType}: ${errInfo.error}`);
};

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('ErrorBoundary caught an error', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let message = 'Something went wrong.';
      try {
        const errInfo = JSON.parse(this.state.error.message);
        message = `Firestore Error: ${errInfo.error} during ${errInfo.operationType} on ${errInfo.path}`;
      } catch (e) {
        message = this.state.error.message || message;
      }

      return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-8 text-center">
          <div className="p-4 rounded-full bg-red-500/10 text-red-500 mb-6">
            <X size={48} />
          </div>
          <h1 className="text-2xl font-bold mb-4 tracking-tight">Application Error</h1>
          <p className="text-zinc-400 max-w-md mb-8">{message}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 rounded-lg bg-white text-zinc-950 hover:bg-zinc-200 transition-colors font-medium"
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

class ImageErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-zinc-900 text-zinc-600 text-[10px] text-center p-2 rounded-lg border border-zinc-800 border-dashed">
          Image failed to load
        </div>
      );
    }
    return this.props.children;
  }
}

function chooseImportRecovery(count: number, language: Language): 'resume' | 'copy' | 'cancel' {
  const amharic = language === 'Amharic';
  if (confirm(amharic ? `${count} ካርዶች ተቀምጠዋል። የተቋረጠውን ማስገባት ይቀጥሉ?` : `Resume the interrupted import (${count} confirmed cards)? Existing cards will not be overwritten.`)) return 'resume';
  if (confirm(amharic ? 'በምትኩ አዲስ ቅጂ ይፍጠሩ? ከዚህ በፊት የገቡ ካርዶች አይሰረዙም፤ ድግግሞሽ ሊኖር ይችላል።' : 'Start a separate copy instead? Previously imported cards will remain and may be duplicated. Cancel keeps the old checkpoint and imports nothing.')) return 'copy';
  return 'cancel';
}

// --- Auth Context ---
interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  loginAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function restoreLocalGuest(): User | null {
  try { return optionalStorage.getItem('hahu_local_guest_session') === 'true' ? createLocalGuestUser() : null; }
  catch { return null; }
}

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUserState] = useState<User | null>(restoreLocalGuest);
  const setUser = (next: User | null) => { setOperationIdentity(next?.uid || null); setUserState(next); };
  useEffect(() => { setOperationIdentity(user?.uid || null); }, [user]);
  const [loading, setLoading] = useState(true);
  const loginInProgress = useRef(false);
  const pendingWrites = useSyncExternalStore(subscribeOperations, pendingOperations);
  useBeforeUnload(pendingWrites > 0);
  const [slowOperation, setSlowOperation] = useState(false);
  useEffect(() => {
    if (!pendingWrites) { setSlowOperation(false); return; }
    const timer = setTimeout(() => setSlowOperation(true), 20000);
    return () => clearTimeout(timer);
  }, [pendingWrites]);
  const [authBusy, setAuthBusy] = useState(false);
  useBeforeUnload(authBusy);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      if (optionalStorage.getItem('hahu_local_guest_session') === 'true') {
        setUser(restoreLocalGuest());
      }
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (loginInProgress.current) return;
      if (currentUser) {
        optionalStorage.removeItem('hahu_local_guest_session');
        setUser(currentUser);
      } else {
        if (optionalStorage.getItem('hahu_local_guest_session') === 'true') {
          setUser(restoreLocalGuest());
        } else {
          setUser(null);
        }
      }
      setLoading(false);
    }, () => { setUser(restoreLocalGuest()); setLoading(false); });
    const syncGuest = (event: StorageEvent) => {
      if (loginInProgress.current || auth.currentUser) return;
      if (event.key === 'hahu_local_guest_session' || event.key === 'hahu_guest_uid' || event.key === null) setUser(restoreLocalGuest());
    };
    window.addEventListener('storage', syncGuest);
    return () => { unsubscribe(); window.removeEventListener('storage', syncGuest); };
  }, []);

  const login = useCallback(async () => {
    if (loginInProgress.current) return;
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('Firebase Auth not initialized');
    const guestUid = optionalStorage.getItem('hahu_local_guest_session') === 'true' ? optionalStorage.getItem('hahu_guest_uid') : null;
    const endTransition = beginAuthTransition();
    loginInProgress.current = true; setAuthBusy(true);
    try {
      const anonymous = auth.currentUser?.isAnonymous ? auth.currentUser : null;
      const result = anonymous ? await linkWithPopup(anonymous, getGoogleProvider()) : await signInWithPopup(auth, getGoogleProvider());
      setOperationIdentity(result.user.uid);
      if (guestUid && confirm('Copy this device’s guest library to your Google account? The local backup will be kept.')) {
        setLoading(true);
        try { await migrateLocalGuestLibrary(guestUid, result.user); }
        catch (error) { alert(`Guest library migration did not finish. Your local library is preserved; sign out, return as a guest, and retry. ${error instanceof Error ? error.message : ''}`); }
      }
      if (auth.currentUser?.uid !== result.user.uid) throw new Error('Your account changed during sign-in. Please retry.');
      optionalStorage.removeItem('hahu_local_guest_session');
      setUser(result.user);
    } catch (error: any) {
      if (error?.code === 'auth/credential-already-in-use' || error?.code === 'auth/email-already-in-use') {
        throw new Error('This Google account already exists. Your guest account is unchanged. Export your guest decks before signing out and signing into that account.');
      }
      if (error?.code !== 'auth/popup-closed-by-user' && error?.code !== 'auth/cancelled-popup-request') throw new Error(authErrorMessage(error));
    } finally {
      setUser(auth.currentUser || restoreLocalGuest());
      loginInProgress.current = false; setAuthBusy(false); endTransition();
      setLoading(false);
    }
  }, []);

  const loginAsGuest = async () => {
    if (loginInProgress.current) return;
    const endTransition = beginAuthTransition();
    loginInProgress.current = true; setAuthBusy(true);
    try {
      const auth = getFirebaseAuth();
      // Never overlay a local identity on a live cloud account.
      if (auth?.currentUser && !auth.currentUser.isAnonymous) throw new Error('Sign out of your current account before continuing as a guest.');
      if (auth?.currentUser?.isAnonymous) { setUser(auth.currentUser); return; }
      if (!optionalStorage.getItem('hahu_guest_uid') && auth) {
        try {
          const result = await signInAnonymously(auth);
          optionalStorage.removeItem('hahu_local_guest_session');
          setUser(result.user); return;
        } catch { /* Local guest fallback retains a separate identity. */ }
      }
      const guest = createLocalGuestUser();
      if (!optionalStorage.setItem('hahu_local_guest_session', 'true')) throw new Error('Guest mode needs browser storage. Enable it or sign in with Google.');
      setUser(guest);
    } finally { loginInProgress.current = false; setAuthBusy(false); endTransition(); setLoading(false); }
  };

  const logout = async () => {
    let endTransition: (() => void) | undefined;
    try {
      const current = getFirebaseAuth()?.currentUser;
      if (current?.isAnonymous && !confirm('This guest account has no sign-in credentials. Signing out may permanently lose access to its cloud library. Cancel and link Google or export your decks first. Sign out anyway?')) return;
      endTransition = beginAuthTransition();
      loginInProgress.current = true; setAuthBusy(true);
      const auth = getFirebaseAuth();
      if (auth?.currentUser) await signOut(auth);
      // Failure to clear a guest flag would silently log the user back in on refresh.
      if (!optionalStorage.removeItem('hahu_local_guest_session')) throw new Error('Browser storage blocked sign-out. Enable storage and retry.');
      setUser(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Sign-out failed. Please retry.');
    } finally {
      if (endTransition) { setUser(getFirebaseAuth()?.currentUser || restoreLocalGuest()); loginInProgress.current = false; setAuthBusy(false); endTransition(); }
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginAsGuest, logout }}>
      {slowOperation && <p role="status" className="fixed bottom-2 left-2 right-2 z-[200] rounded-lg bg-neutral-900 border border-neutral-700 p-3 text-xs text-amber-400">An operation is still waiting for confirmation. Check your connection. Do not retry or close this tab: the server may still finish it.</p>}
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

// --- Protected Route ---
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="w-8 h-8 border-2 border-zinc-800 border-t-zinc-100 rounded-full animate-spin" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <React.Fragment key={user.uid}>{children}</React.Fragment>;
};

// --- Components ---



const ConfirmModal: React.FC<{
  isOpen: boolean;
  title: string;
  onConfirm: () => unknown | Promise<unknown>;
  heading?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onCancel: () => void;
  language?: Language;
  theme?: 'dark' | 'light';
}> = ({
  isOpen, title, onConfirm, onCancel, heading, description, confirmLabel, cancelLabel, language = 'English', theme = 'dark'
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const action = usePendingAction();
  useDialog(dialogRef, isOpen, onCancel, action.pending);
  useBeforeUnload(action.pending);
  useEffect(() => { if (isOpen) action.setError(null); }, [isOpen]);
  const copy = interactionCopy[language];
  if (!isOpen) return null;
  const t = translations[language];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div ref={dialogRef} role="alertdialog" aria-modal="true" aria-label={heading || t.confirmDelete} aria-busy={action.pending} tabIndex={-1}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`p-6 max-w-sm w-full space-y-6 rounded-2xl border shadow-2xl ${
          theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-neutral-900 border-neutral-800/80 text-neutral-50'
        }`}
      >
        <div className="space-y-2">
          <h3 className={`text-lg font-extrabold tracking-tighter uppercase ${theme === 'light' ? 'text-slate-900' : 'text-neutral-50'}`}>
            {heading || t.confirmDelete}
          </h3>
          <p className={`text-sm ${theme === 'light' ? 'text-slate-600' : 'text-neutral-400'}`}>
            {title}
          </p>
        </div>
        {(description ?? copy.deleteBody).trim() && <p className="text-sm text-neutral-500">{description ?? copy.deleteBody}</p>}
        {action.error && <p role="alert" className="text-sm text-red-500">{action.error}</p>}
        <div className="flex gap-3">
          <button
            data-initial-focus disabled={action.pending} onClick={onCancel}
            className={`disabled:opacity-50 flex-1 px-4 py-2.5 rounded-xl active:scale-95 transition-all text-xs font-bold uppercase tracking-wider ${
              theme === 'light' ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
          >
            {cancelLabel || t.cancel}
          </button>
          <button
            disabled={action.pending} onClick={() => action.run(onConfirm)}
            className="disabled:opacity-50 flex-1 px-4 py-2.5 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 active:scale-95 transition-all text-xs font-bold uppercase tracking-wider"
          >
            {action.pending ? copy.working : (confirmLabel || t.delete)}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const MoveModal: React.FC<{
  isOpen: boolean;
  units: FolderData[];
  currentUnitId: string;
  onMove: (targetUnitId: string) => unknown | Promise<unknown>;
  onClose: () => void;
  language?: Language;
  theme?: 'dark' | 'light';
}> = ({ isOpen, units, currentUnitId, onMove, onClose, language = 'English', theme = 'dark' }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const action = usePendingAction();
  const [destination, setDestination] = useState<string | null>(null);
  const available = units.filter(u => u.id !== currentUnitId);
  const copy = interactionCopy[language];
  useDialog(dialogRef, isOpen, onClose, action.pending);
  useBeforeUnload(action.pending);
  useEffect(() => { if (isOpen) { setDestination(null); action.setError(null); } }, [isOpen]);
  if (!isOpen) return null;
  const t = translations[language];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t.move} aria-busy={action.pending} tabIndex={-1}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`p-6 max-w-md w-full space-y-6 rounded-2xl border shadow-2xl ${
          theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-neutral-900 border-neutral-800/80 text-neutral-50'
        }`}
      >
        <div className="flex items-center justify-between">
          <h3 className={`text-lg font-extrabold tracking-tighter uppercase ${theme === 'light' ? 'text-slate-900' : 'text-neutral-50'}`}>
            {t.move}
          </h3>
          <button data-initial-focus disabled={action.pending} aria-label={copy.close} onClick={onClose} className={`p-1 transition-colors ${theme === 'light' ? 'text-slate-400 hover:text-slate-700' : 'text-neutral-500 hover:text-neutral-50'}`}>
            <X size={20} />
          </button>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
          {available.map(unit => (
            <button
              key={unit.id}
              disabled={action.pending} aria-pressed={destination === unit.id} onClick={() => setDestination(unit.id)}
              className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left group ${
                theme === 'light'
                  ? 'bg-slate-50 border-slate-200/80 text-slate-800 hover:bg-indigo-50 hover:border-indigo-300'
                  : 'bg-neutral-950/50 border-neutral-800/30 text-neutral-300 hover:text-neutral-50 hover:border-neutral-700'
              }`}
            >
              <Folder size={18} className="text-indigo-400 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-bold tracking-tight">{folderPath(unit, units)}</span>
              {destination === unit.id ? <Check size={16} className="ml-auto text-indigo-400" /> : <ChevronRight size={16} className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />}
            </button>
          ))}
          {available.length === 0 && (
            <p className="text-center py-8 text-neutral-500 text-xs font-medium italic">{copy.noDestination}</p>
          )}
        </div>
        {action.error && <p role="alert" className="text-sm text-red-500">{action.error}</p>}
        <button disabled={action.pending || !available.some(u => u.id === destination)} onClick={() => destination && action.run(() => onMove(destination))}
          className="w-full px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50">
          {action.pending ? copy.moving : copy.moveConfirm}
        </button>
      </motion.div>
    </div>
  );
};

const StudySettingsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onStart: (duration: number, mode: 'online' | 'anki' | 'lockin', config?: any) => void;
  language?: Language;
  theme?: 'dark' | 'light';
}> = ({ isOpen, onClose, onStart, language = 'English', theme = 'dark' }) => {
  const [activeTab, setActiveTab] = useState<'settings' | 'help'>('settings');
  const [mode, setMode] = useState<'online' | 'anki' | 'lockin'>('online');
  const [h, setH] = useState(0);
  const [m, setM] = useState(1);
  const [s, setS] = useState(0);

  // Lock-In specific
  const [cycles, setCycles] = useState(1);
  const [rdM, setRdM] = useState(0);
  const [rdS, setRdS] = useState(5);

  const [notifications, setNotifications] = useState(true);

  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, isOpen, onClose);

  if (!isOpen) return null;
  const t = translations[language] || translations.English;

  const handleStart = () => {
    const totalSeconds = h * 3600 + m * 60 + s;
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0 || totalSeconds > 86400) return;
    if (mode === 'lockin' && !validSessionConfig({ cycles, revealDelay: rdM * 60 + rdS, notifications })) return;
    if (totalSeconds > 0) {
      if (mode === 'lockin') {
        if (notifications && 'Notification' in window && Notification.permission === 'default') void Notification.requestPermission().catch(() => {});
        onStart(totalSeconds, mode, {
          cycles,
          revealDelay: rdM * 60 + rdS,
          notifications
        });
      } else {
        onStart(totalSeconds, mode);
      }
    }
  };

  const selectModeFromHelp = (chosenMode: 'online' | 'anki' | 'lockin') => {
    setMode(chosenMode);
    setActiveTab('settings');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm overflow-y-auto overscroll-contain"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t.studyModeSettings} tabIndex={-1}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className={`max-w-lg w-full max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden transition-colors ${
          theme === 'light'
            ? 'bg-white border-slate-200 text-slate-900 shadow-slate-400/40'
            : 'bg-neutral-900 border-neutral-800 text-white shadow-black/90'
        }`}
      >
        {/* Modal Header */}
        <div className={`p-5 sm:p-6 pb-4 border-b flex items-center justify-between gap-3 shrink-0 ${
          theme === 'light' ? 'border-slate-100 bg-slate-50/50' : 'border-neutral-800/80 bg-neutral-950/40'
        }`}>
          <div className="space-y-0.5">
            <h3 className={`text-lg sm:text-xl font-black tracking-tight ${theme === 'light' ? 'text-slate-900' : 'text-neutral-50'}`}>
              {activeTab === 'settings' ? t.studyModeSettings : (t.modeGuide || 'Mode Guide')}
            </h3>
            <p className={`text-xs ${theme === 'light' ? 'text-slate-500' : 'text-neutral-400'}`}>
              {activeTab === 'settings' ? t.chooseStudyExp : (t.howModesWork || 'How Each Study Mode Works')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Help / Settings Tab Toggle Button */}
            <button
              onClick={() => setActiveTab(activeTab === 'settings' ? 'help' : 'settings')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
                activeTab === 'help'
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                  : (theme === 'light'
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                      : 'bg-indigo-950/50 border-indigo-800/60 text-indigo-300 hover:bg-indigo-900/60')
              }`}
              title={activeTab === 'settings' ? 'View Help & Mode Guide' : 'Back to Settings'}
            >
              <HelpCircle size={14} />
              <span>{activeTab === 'settings' ? (t.help || 'Help') : (t.settingsTab || 'Settings')}</span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition-colors ${
                theme === 'light'
                  ? 'hover:bg-slate-200/70 text-slate-400 hover:text-slate-700'
                  : 'hover:bg-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-6 custom-scrollbar">
          {activeTab === 'help' ? (
            /* Help & Mode Guide View */
            <div className="space-y-4">
              {/* Mode 1: Speed Recall */}
              <div className={`p-4 rounded-2xl border transition-all ${
                mode === 'online'
                  ? (theme === 'light' ? 'bg-sky-50/80 border-sky-300 shadow-sm' : 'bg-sky-950/30 border-sky-600/50')
                  : (theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-neutral-950/60 border-neutral-800/80')
              }`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-500 flex items-center justify-center font-bold">
                      <Timer size={18} />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-sky-500">
                        {t.speedRecallHelpTitle || 'Speed Recall (Online Mode)'}
                      </h4>
                    </div>
                  </div>
                  <button
                    onClick={() => selectModeFromHelp('online')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all active:scale-95 ${
                      mode === 'online'
                        ? 'bg-sky-500 text-white shadow-sm'
                        : (theme === 'light' ? 'bg-slate-200 text-slate-700 hover:bg-sky-100 hover:text-sky-700' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700')
                    }`}
                  >
                    {mode === 'online' ? (t.selected || 'Active') : (t.useThisMode || 'Use Mode')}
                  </button>
                </div>

                <p className={`text-xs leading-relaxed mb-3 ${theme === 'light' ? 'text-slate-600' : 'text-neutral-300'}`}>
                  {t.speedRecallHelpDesc}
                </p>

                <div className={`p-3 rounded-xl border text-[11px] space-y-2.5 ${
                  theme === 'light' ? 'bg-white border-slate-200 text-slate-700' : 'bg-neutral-900 border-neutral-800 text-neutral-300'
                }`}>
                  <div>
                    <div className="font-bold text-sky-500 uppercase tracking-wider text-[10px] mb-0.5">
                      {t.bestForLabel || 'Best Used For'}
                    </div>
                    <p className="leading-relaxed">{t.speedRecallUsage || t.speedRecallHelpDesc}</p>
                  </div>

                  <div className="pt-2 border-t border-dashed border-slate-200 dark:border-neutral-800">
                    <div className="font-bold text-sky-500 uppercase tracking-wider text-[10px] mb-0.5">
                      {t.howItWorksLabel || t.featuresLabel || 'How It Works & Key Features'}
                    </div>
                    <p className="leading-relaxed">{t.speedRecallFeatures}</p>
                  </div>

                  <div className="pt-2 border-t border-dashed border-slate-200 dark:border-neutral-800">
                    <div className="font-bold text-amber-500 uppercase tracking-wider text-[10px] mb-0.5">
                      {t.exampleLabel || 'Practical Example'}
                    </div>
                    <p className="italic leading-relaxed">{t.speedRecallExample}</p>
                  </div>
                </div>
              </div>

              {/* Mode 2: Anki Spaced Repetition */}
              <div className={`p-4 rounded-2xl border transition-all ${
                mode === 'anki'
                  ? (theme === 'light' ? 'bg-emerald-50/80 border-emerald-300 shadow-sm' : 'bg-emerald-950/30 border-emerald-600/50')
                  : (theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-neutral-950/60 border-neutral-800/80')
              }`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center font-bold">
                      <BrainCircuit size={18} />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-emerald-500">
                        {t.ankiHelpTitle || 'Spaced Review'}
                      </h4>
                    </div>
                  </div>
                  <button
                    onClick={() => selectModeFromHelp('anki')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all active:scale-95 ${
                      mode === 'anki'
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : (theme === 'light' ? 'bg-slate-200 text-slate-700 hover:bg-emerald-100 hover:text-emerald-700' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700')
                    }`}
                  >
                    {mode === 'anki' ? (t.selected || 'Active') : (t.useThisMode || 'Use Mode')}
                  </button>
                </div>

                <p className={`text-xs leading-relaxed mb-3 ${theme === 'light' ? 'text-slate-600' : 'text-neutral-300'}`}>
                  {t.ankiHelpDesc}
                </p>

                <div className={`p-3 rounded-xl border text-[11px] space-y-2.5 ${
                  theme === 'light' ? 'bg-white border-slate-200 text-slate-700' : 'bg-neutral-900 border-neutral-800 text-neutral-300'
                }`}>
                  <div>
                    <div className="font-bold text-emerald-500 uppercase tracking-wider text-[10px] mb-0.5">
                      {t.bestForLabel || 'Best Used For'}
                    </div>
                    <p className="leading-relaxed">{t.ankiUsage || t.ankiHelpDesc}</p>
                  </div>

                  <div className="pt-2 border-t border-dashed border-slate-200 dark:border-neutral-800">
                    <div className="font-bold text-emerald-500 uppercase tracking-wider text-[10px] mb-0.5">
                      {t.howItWorksLabel || t.featuresLabel || 'How It Works & Key Features'}
                    </div>
                    <p className="leading-relaxed">{t.ankiFeatures}</p>
                  </div>

                  <div className="pt-2 border-t border-dashed border-slate-200 dark:border-neutral-800">
                    <div className="font-bold text-amber-500 uppercase tracking-wider text-[10px] mb-0.5">
                      {t.exampleLabel || 'Practical Example'}
                    </div>
                    <p className="italic leading-relaxed">{t.ankiExample}</p>
                  </div>
                </div>
              </div>

              {/* Mode 3: Lock-In Mode */}
              <div className={`p-4 rounded-2xl border transition-all ${
                mode === 'lockin'
                  ? (theme === 'light' ? 'bg-amber-50/80 border-amber-300 shadow-sm' : 'bg-amber-950/30 border-amber-600/50')
                  : (theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-neutral-950/60 border-neutral-800/80')
              }`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center font-bold">
                      <Lock size={18} />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-amber-500">
                        {t.lockinHelpTitle || 'Lock-In Mode (Deep Focus)'}
                      </h4>
                    </div>
                  </div>
                  <button
                    onClick={() => selectModeFromHelp('lockin')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all active:scale-95 ${
                      mode === 'lockin'
                        ? 'bg-amber-500 text-white shadow-sm'
                        : (theme === 'light' ? 'bg-slate-200 text-slate-700 hover:bg-amber-100 hover:text-amber-700' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700')
                    }`}
                  >
                    {mode === 'lockin' ? (t.selected || 'Active') : (t.useThisMode || 'Use Mode')}
                  </button>
                </div>

                <p className={`text-xs leading-relaxed mb-3 ${theme === 'light' ? 'text-slate-600' : 'text-neutral-300'}`}>
                  {t.lockinHelpDesc}
                </p>

                <div className={`p-3 rounded-xl border text-[11px] space-y-2.5 ${
                  theme === 'light' ? 'bg-white border-slate-200 text-slate-700' : 'bg-neutral-900 border-neutral-800 text-neutral-300'
                }`}>
                  <div>
                    <div className="font-bold text-amber-500 uppercase tracking-wider text-[10px] mb-0.5">
                      {t.bestForLabel || 'Best Used For'}
                    </div>
                    <p className="leading-relaxed">{t.lockinUsage || t.lockinHelpDesc}</p>
                  </div>

                  <div className="pt-2 border-t border-dashed border-slate-200 dark:border-neutral-800">
                    <div className="font-bold text-amber-500 uppercase tracking-wider text-[10px] mb-0.5">
                      {t.howItWorksLabel || t.featuresLabel || 'How It Works & Key Features'}
                    </div>
                    <p className="leading-relaxed">{t.lockinFeatures}</p>
                  </div>

                  <div className="pt-2 border-t border-dashed border-slate-200 dark:border-neutral-800">
                    <div className="font-bold text-amber-500 uppercase tracking-wider text-[10px] mb-0.5">
                      {t.exampleLabel || 'Practical Example'}
                    </div>
                    <p className="italic leading-relaxed">{t.lockinExample}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Settings Configuration View */
            <div className="space-y-6">
              {/* Mode Selector */}
              <div className={`flex p-1 rounded-2xl border ${
                theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-neutral-950 border-neutral-800'
              }`}>
                <button
                  onClick={() => setMode('online')}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                    mode === 'online'
                      ? (theme === 'light' ? 'bg-white text-indigo-600 shadow-sm' : 'bg-neutral-800 text-white shadow-sm')
                      : (theme === 'light' ? 'text-slate-600 hover:text-slate-900' : 'text-neutral-400 hover:text-neutral-200')
                  }`}
                >
                  <Timer size={14} className={mode === 'online' ? 'text-indigo-500' : 'opacity-60'} />
                  <span>{t.onlineModeTitle || 'Speed Recall'}</span>
                </button>
                <button
                  onClick={() => setMode('anki')}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                    mode === 'anki'
                      ? (theme === 'light' ? 'bg-white text-emerald-600 shadow-sm' : 'bg-neutral-800 text-white shadow-sm')
                      : (theme === 'light' ? 'text-slate-600 hover:text-slate-900' : 'text-neutral-400 hover:text-neutral-200')
                  }`}
                >
                  <BrainCircuit size={14} className={mode === 'anki' ? 'text-emerald-500' : 'opacity-60'} />
                  <span>{t.ankiModeTitle || 'Spaced Review'}</span>
                </button>
                <button
                  onClick={() => setMode('lockin')}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                    mode === 'lockin'
                      ? (theme === 'light' ? 'bg-white text-amber-600 shadow-sm' : 'bg-neutral-800 text-white shadow-sm')
                      : (theme === 'light' ? 'text-slate-600 hover:text-slate-900' : 'text-neutral-400 hover:text-neutral-200')
                  }`}
                >
                  <Lock size={14} className={mode === 'lockin' ? 'text-amber-500' : 'opacity-60'} />
                  <span>{t.lockInModeTitle || 'Lock-In'}</span>
                </button>
              </div>

              {/* Mode-specific Controls */}
              <div className="space-y-5">
                {/* Session Timer Box */}
                <div className={`p-4 rounded-2xl border space-y-3.5 ${
                  theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-neutral-950/60 border-neutral-800/80'
                }`}>
                  <span className={`text-[11px] font-extrabold uppercase tracking-wider block text-center ${
                    theme === 'light' ? 'text-slate-500' : 'text-neutral-400'
                  }`}>
                    {t.sessionTimer}
                  </span>
                  <div className="flex justify-center gap-3">
                    {[
                      { label: 'HH', value: h, setter: setH, max: 23 },
                      { label: 'MM', value: m, setter: setM, max: 59 },
                      { label: 'SS', value: s, setter: setS, max: 59 },
                    ].map(({ label, value, setter, max }) => (
                      <div key={label} className="flex flex-col items-center gap-1">
                        <input
                          type="number"
                          aria-label={label}
                          inputMode="numeric"
                          value={value === 0 ? '00' : value.toString().padStart(2, '0')}
                          onChange={(e) => setter(Math.max(0, Math.min(max, parseInt(e.target.value) || 0)))}
                          className={`w-14 h-14 rounded-xl text-center text-xl font-bold transition-colors outline-none border ${
                            theme === 'light'
                              ? 'bg-white border-slate-200 text-slate-900 focus:border-indigo-500 shadow-sm'
                              : 'bg-neutral-900 border-neutral-800 text-neutral-50 focus:border-neutral-500'
                          }`}
                        />
                        <span className={`text-[9px] font-bold uppercase tracking-wider ${
                          theme === 'light' ? 'text-slate-400' : 'text-neutral-500'
                        }`}>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Lock-In Controls */}
                {mode === 'lockin' && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="grid grid-cols-2 gap-3">
                      {/* Cycles */}
                      <div className={`p-4 rounded-2xl border space-y-3 ${
                        theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-neutral-950/60 border-neutral-800/80'
                      }`}>
                        <span className={`text-[10px] font-extrabold uppercase tracking-wider block text-center ${
                          theme === 'light' ? 'text-slate-500' : 'text-neutral-400'
                        }`}>{t.cycles}</span>
                        <div className="flex justify-center">
                          <input
                            type="number"
                            inputMode="numeric"
                            value={cycles}
                            onChange={(e) => setCycles(Math.max(1, Math.min(99, parseInt(e.target.value) || 1)))}
                            className={`w-14 h-14 rounded-xl text-center text-xl font-bold transition-colors outline-none border ${
                              theme === 'light'
                                ? 'bg-white border-slate-200 text-slate-900 focus:border-amber-500 shadow-sm'
                                : 'bg-neutral-900 border-neutral-800 text-neutral-50 focus:border-amber-500'
                            }`}
                          />
                        </div>
                      </div>

                      {/* Reveal Delay */}
                      <div className={`p-4 rounded-2xl border space-y-3 ${
                        theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-neutral-950/60 border-neutral-800/80'
                      }`}>
                        <span className={`text-[10px] font-extrabold uppercase tracking-wider block text-center ${
                          theme === 'light' ? 'text-slate-500' : 'text-neutral-400'
                        }`}>{t.revealDelay}</span>
                        <div className="flex justify-center gap-2">
                          {[
                            { label: 'MM', value: rdM, setter: setRdM },
                            { label: 'SS', value: rdS, setter: setRdS },
                          ].map(({ label, value, setter }) => (
                            <div key={label} className="flex flex-col items-center gap-1">
                              <input
                                type="number"
                                inputMode="numeric"
                                value={value === 0 ? '00' : value.toString().padStart(2, '0')}
                                onChange={(e) => setter(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                                className={`w-12 h-14 rounded-xl text-center text-lg font-bold transition-colors outline-none border ${
                                  theme === 'light'
                                    ? 'bg-white border-slate-200 text-slate-900 focus:border-amber-500 shadow-sm'
                                    : 'bg-neutral-900 border-neutral-800 text-neutral-50 focus:border-amber-500'
                                }`}
                              />
                              <span className={`text-[8px] font-bold uppercase tracking-wider ${
                                theme === 'light' ? 'text-slate-400' : 'text-neutral-500'
                              }`}>{label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Background Notifications */}
                    <div className={`p-4 rounded-2xl border space-y-3 ${
                      theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-neutral-950/60 border-neutral-800/80'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className={`text-xs font-bold uppercase tracking-wider block ${
                            theme === 'light' ? 'text-slate-800' : 'text-neutral-200'
                          }`}>{t.backgroundNotifications}</span>
                          <p className={`text-[10px] ${
                            theme === 'light' ? 'text-slate-500' : 'text-neutral-500'
                          }`}>{t.bgNotifDesc}</p>
                        </div>
                        <button
                          onClick={() => setNotifications(!notifications)}
                          className={`w-12 h-6 rounded-full transition-all relative ${
                            notifications ? 'bg-amber-500' : (theme === 'light' ? 'bg-slate-300' : 'bg-neutral-800')
                          }`}
                        >
                          <div className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
                            notifications ? 'right-1 bg-white' : (theme === 'light' ? 'left-1 bg-white' : 'left-1 bg-neutral-500')
                          }`} />
                        </button>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={async () => {
                            const permission = await Notification.requestPermission();
                            if (permission === 'granted') {
                              if ('serviceWorker' in navigator) {
                                const reg = await navigator.serviceWorker.ready;
                                reg.showNotification('HaHu Cards', {
                                  body: 'Notifications are working correctly!',
                                  tag: 'test-notif'
                                });
                              } else {
                                new Notification('HaHu Cards', { body: 'Notifications are working correctly!' });
                              }
                            } else {
                              console.warn("Notification permission denied.");
                            }
                          }}
                          className={`flex-1 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 ${
                            theme === 'light'
                              ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                              : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                          }`}
                        >
                          {t.testNotif}
                        </button>
                        <button
                          onClick={() => {
                            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                            const playBeep = (time: number, freq: number) => {
                              const osc = ctx.createOscillator();
                              const gain = ctx.createGain();
                              osc.type = 'square';
                              osc.frequency.setValueAtTime(freq, time);
                              gain.gain.setValueAtTime(0.1, time);
                              gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
                              osc.connect(gain);
                              gain.connect(ctx.destination);
                              osc.start(time);
                              osc.stop(time + 0.1);
                            };
                            const now = ctx.currentTime;
                            playBeep(now, 880);
                            playBeep(now + 0.15, 880);
                            playBeep(now + 0.3, 660);
                            playBeep(now + 0.45, 660);
                          }}
                          className={`flex-1 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 ${
                            theme === 'light'
                              ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                              : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                          }`}
                        >
                          {t.testAlarm}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Anki Spaced Repetition Mode Info */}
                {mode === 'anki' && (
                  <div className={`p-4 rounded-2xl border space-y-2 text-center animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                    theme === 'light' ? 'bg-emerald-50/70 border-emerald-200 text-slate-800' : 'bg-emerald-950/30 border-emerald-900/60 text-neutral-200'
                  }`}>
                    <p className="text-xs font-bold text-emerald-500 uppercase tracking-wider">{t.spacedRepetitionMode}</p>
                    <p className={`text-xs leading-relaxed ${theme === 'light' ? 'text-slate-600' : 'text-neutral-400'}`}>
                      {t.spacedRepetitionDesc}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Action Buttons Footer */}
        <div className={`p-4 sm:p-5 border-t flex gap-3 shrink-0 ${
          theme === 'light' ? 'border-slate-100 bg-slate-50/50' : 'border-neutral-800/80 bg-neutral-950/40'
        }`}>
          {activeTab === 'help' ? (
            <button
              onClick={() => setActiveTab('settings')}
              className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs uppercase tracking-wider transition-all active:scale-95 shadow-md shadow-indigo-600/30"
            >
              {t.gotIt || 'Got It'} • {t.settingsTab || 'Back to Settings'}
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className={`flex-1 py-3 rounded-xl border text-xs font-extrabold uppercase tracking-wider transition-all active:scale-95 ${
                  theme === 'light'
                    ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                {t.wait}
              </button>
              <button
                disabled={h * 3600 + m * 60 + s <= 0 || h * 3600 + m * 60 + s > 86400}
                onClick={handleStart}
                className="disabled:opacity-50 disabled:cursor-not-allowed flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs uppercase tracking-wider transition-all active:scale-95 shadow-md shadow-indigo-600/30 flex items-center justify-center gap-2"
              >
                <Play size={16} />
                <span>{t.play}</span>
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};

type SessionState = 'COUNTDOWN' | 'ALARM' | 'REVEAL_DELAY' | 'READY_TO_REVEAL' | 'ANSWER_SHOWN' | 'SESSION_COMPLETE';

const StudyCardFace = React.memo(({ card, side, hidden }: { card: FlashcardData; side: 'front' | 'back'; hidden: boolean }) => {
  const image = side === 'front' ? card.frontImageUrl : card.backImageUrl;
  const text = side === 'front' ? card.frontText : card.backText;
  return <div aria-hidden={hidden} className={`${side === 'front' ? 'relative w-full min-h-[220px] sm:min-h-[300px]' : 'absolute inset-0 w-full h-full [transform:rotateY(180deg)]'} [backface-visibility:hidden] [-webkit-backface-visibility:hidden] rounded-xl overflow-hidden shadow-xl border-2 border-neutral-700 bg-neutral-900`} style={side === 'front' ? { aspectRatio: card.aspectRatio || 1, maxHeight: '65vh' } : undefined}>
    {image && <img src={image} alt={side} className="absolute inset-0 w-full h-full object-contain" referrerPolicy="no-referrer" />}
    {text && <div className={`absolute inset-0 overflow-y-auto p-6 flex flex-col ${image ? 'bg-black/30' : ''}`}>
      <p className="font-extrabold text-center drop-shadow-md tracking-tight whitespace-pre-wrap break-words shrink-0" style={{ fontSize: card.textSize || 24, color: card.textColor || '#ffffff', overflowWrap: 'anywhere', marginTop: card.verticalAlign === 'top' ? 0 : 'auto', marginBottom: card.verticalAlign === 'bottom' ? 0 : 'auto' }}>{text}</p>
    </div>}
  </div>;
});

const SingleCardStudySession: React.FC<{
  card: FlashcardData;
  duration: number;
  resume?: boolean;
  mode: 'online' | 'anki' | 'lockin';
  config?: {
    cycles: number;
    revealDelay: number;
    notifications?: boolean;
  };
  onQuit: () => void;
  onEdit?: (card: FlashcardData) => void;
  language?: Language;
}> = ({ card, duration, mode, config, onQuit, onEdit, resume = false, language = 'English' }) => {
  const { user } = useAuth();
  const [timeLeft, setTimeLeft] = useState(duration);
  const [restored, setRestored] = useState(false);
  const [sessionRun, setSessionRun] = useState(0);
  const [sessionState, updateSessionState] = useState<SessionState>('COUNTDOWN');
  const phase = useRef<SessionState>('COUNTDOWN');
  const setSessionState = (next: SessionState) => { phase.current = next; updateSessionState(next); };
  const [sessionId] = useState(() => crypto.randomUUID());
  const [startedAt] = useState(() => Date.now());
  const [ownershipVersion, setOwnershipVersion] = useState(0);
  const [superseded, setSuperseded] = useState(false);
  const supersededRef = useRef(false);
  const mounted = useRef(false);
  const ownsFullscreen = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cyclesLeft, setCyclesLeft] = useState(config?.cycles || 1);
  const [revealDelayLeft, setRevealDelayLeft] = useState(config?.revealDelay || 0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [quitOpen, setQuitOpen] = useState(false);
  const [reviewSchedule, setReviewSchedule] = useState<Pick<FlashcardData, 'easeFactor' | 'interval' | 'nextReview'>>(card);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const reviewLock = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [showToast, setShowToast] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [persistenceError, setPersistenceError] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const alarmInterval = useRef<NodeJS.Timeout | null>(null);

  const t = translations[language];

  // Persistence Key
  const PERSISTENCE_KEY = `lockin_session_${user?.uid}_${card.id}`;
  const interruptionKey = `interrupted_lockin_session_${user?.uid}`;
  const clearRecovery = () => { if (mode === 'lockin') clearOwnedRecovery(optionalStorage, PERSISTENCE_KEY, interruptionKey, sessionId); };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (toastTimer.current) clearTimeout(toastTimer.current); }; }, []);

  // Initialize Persistence
  useEffect(() => {
    setRestored(true);
    if (mode !== 'lockin' || !resume) return;
    const saved = optionalStorage.getItem(PERSISTENCE_KEY);
    if (saved) {
      const data = parseStoredSession(saved);
      if (!data || data.cyclesLeft > (config?.cycles || 1)) return;
      setIsFlipped(data.state === 'ANSWER_SHOWN');
      setRevealDelayLeft(data.revealDelayLeft);
      const now = Date.now();
      const elapsed = Math.max(0, Math.floor((now - data.timestamp) / 1000));

      if (data.state === 'COUNTDOWN') {
        const newTime = Math.max(0, data.timeLeft - elapsed);
        setTimeLeft(newTime);
        setCyclesLeft(data.cyclesLeft);
        if (newTime === 0) setSessionState('ALARM');
        else setSessionState('COUNTDOWN');
      } else if (data.state === 'REVEAL_DELAY') {
        const newDelay = Math.max(0, data.revealDelayLeft - elapsed);
        setRevealDelayLeft(newDelay);
        setCyclesLeft(data.cyclesLeft);
        if (newDelay === 0) setSessionState('READY_TO_REVEAL');
        else setSessionState('REVEAL_DELAY');
      } else {
        setSessionState(data.state as SessionState);
        setCyclesLeft(data.cyclesLeft);
      }
    }
  }, [mode, card.id, resume]);

  // Save Persistence
  useEffect(() => {
    if (mode !== 'lockin' || !restored || supersededRef.current) return;
    try {
      const owner = JSON.parse(optionalStorage.getItem(interruptionKey) || 'null');
      if (owner && newerSession(owner, { sessionId, startedAt })) { supersededRef.current = true; setSuperseded(true); return; }
    } catch { /* Invalid recovery is replaced by this explicit session. */ }
    if (sessionState === 'SESSION_COMPLETE') {
      clearRecovery();
      return;
    }
    const data = {
      sessionId,
      state: sessionState,
      timeLeft,
      revealDelayLeft,
      cyclesLeft,
      timestamp: Date.now()
    };
    try {
      const saved = optionalStorage.setItem(PERSISTENCE_KEY, JSON.stringify(data));
      const indexed = saved && optionalStorage.setItem(interruptionKey, JSON.stringify({ sessionId, startedAt, cardId: card.id, duration, mode, config }));
      setPersistenceError(!indexed);
      if (!indexed) clearRecovery();
    } catch (error) { console.warn('Could not persist study session', error); }
  }, [sessionState, timeLeft, revealDelayLeft, cyclesLeft, mode, card.id, restored, ownershipVersion]);

  // Cleanup Persistence on Quit
  const handleQuit = () => {
    clearRecovery();
    stopAlarm();
    closeNotifications();
    if (ownsFullscreen.current && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    onQuit();
  };

  const requestQuit = () => {
    if (reviewLock.current) return;
    if (superseded || isComplete || sessionState === 'SESSION_COMPLETE') handleQuit();
    else setQuitOpen(true);
  };
  useDialog(dialogRef, true, requestQuit, isSaving);
  useBeforeUnload(isSaving || (!isComplete && sessionState !== 'SESSION_COMPLETE'));

  // Fullscreen Logic
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (!document.documentElement.requestFullscreen) return;
        await document.documentElement.requestFullscreen();
        ownsFullscreen.current = true;
        if (!mounted.current) await document.exitFullscreen?.();
      } else {
        await document.exitFullscreen?.(); ownsFullscreen.current = false;
      }
    } catch { /* Fullscreen is optional, e.g. on unsupported mobile browsers. */ }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    handleFsChange();
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Audio Logic
  const initAudio = () => {
    try {
      if (!audioContext.current || audioContext.current.state === 'closed') {
        audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioContext.current && audioContext.current.state === 'suspended') {
        audioContext.current.resume().catch(() => {});
      }
    } catch (e) {
      console.warn("WebAudio initialization suppressed:", e);
    }
  };

  const playTick = () => {
    try {
      initAudio();
      if (!audioContext.current || audioContext.current.state === 'closed') return;
      const now = audioContext.current.currentTime;
      const osc = audioContext.current.createOscillator();
      const gain = audioContext.current.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1500, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.02);

      // Boosted volume for production
      gain.gain.setValueAtTime(0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      osc.connect(gain);
      gain.connect(audioContext.current.destination);

      osc.start(now);
      osc.stop(now + 0.03);
    } catch (e) {
      // Ignore audio autoplay restrictions
    }
  };

  const startAlarm = () => {
    initAudio();
    if (!audioContext.current || alarmInterval.current) return;

    const playBeep = () => {
      try {
        if (!audioContext.current || audioContext.current.state === 'closed') return;
        const now = audioContext.current.currentTime;

        // Upbeat rhythmic beep
        const osc = audioContext.current.createOscillator();
        const gain = audioContext.current.createGain();

        // Alternating pitch for "upbeat" feel
        const isEven = Math.floor(now * 2) % 2 === 0;
        osc.type = 'square';
        osc.frequency.setValueAtTime(isEven ? 880 : 660, now);

        // High volume for mobile speakers
        gain.gain.setValueAtTime(0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        osc.connect(gain);
        gain.connect(audioContext.current.destination);

        osc.start(now);
        osc.stop(now + 0.1);

        // Double beep pattern
        const osc2 = audioContext.current.createOscillator();
        const gain2 = audioContext.current.createGain();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(isEven ? 880 : 660, now + 0.15);
        gain2.gain.setValueAtTime(0.7, now + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc2.connect(gain2);
        gain2.connect(audioContext.current.destination);
        osc2.start(now + 0.15);
        osc2.stop(now + 0.25);
      } catch (e) {
        // Ignore audio playback exceptions
      }
    };

    playBeep();
    alarmInterval.current = setInterval(playBeep, 600); // Faster, more upbeat interval
  };

  const stopAlarm = () => {
    if (alarmInterval.current) {
      clearInterval(alarmInterval.current);
      alarmInterval.current = null;
    }
  };

  // Safe cleanup of audio context on component unmount
  useEffect(() => {
    return () => {
      stopAlarm();
      closeNotifications();
      if (ownsFullscreen.current && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      if (audioContext.current && audioContext.current.state !== 'closed') {
        try {
          audioContext.current.close().catch(() => {});
        } catch (e) {}
      }
    };
  }, []);

  // Resume audio on focus
  useEffect(() => {
    const handleFocus = () => {
      if (audioContext.current && audioContext.current.state === 'suspended') {
        audioContext.current.resume().catch(() => {});
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const notificationTag = `lockin-${sessionId}`;
  const closeNotifications = () => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistration().then(async registration => {
        const notifications = await registration?.getNotifications({ tag: notificationTag });
        notifications?.forEach(notification => notification.close());
      }).catch(() => {});
    }
  };
  const sendNotification = async () => {
    if (mode !== 'lockin' || config?.notifications === false || !('Notification' in window) || Notification.permission !== 'granted') return;
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (!mounted.current || supersededRef.current || phase.current !== 'ALARM') return;
    if (registration) await registration.showNotification('Lock-In', {
      body: 'Return to your study session.', tag: notificationTag, requireInteraction: true, data: { url: window.location.href }
    });
    // Without a registered worker, keep the in-app alarm rather than a notification
    // that cannot reliably be cleaned up on mobile or after session exit.
    if (!mounted.current || phase.current !== 'ALARM') closeNotifications();
  };

  useEffect(() => {
    if (mode !== 'lockin') return;
    const changed = (event: StorageEvent) => {
      if (event.key !== interruptionKey || !event.newValue) return;
      try {
        const other = JSON.parse(event.newValue);
        if (other?.sessionId && other.sessionId !== sessionId) {
          if (other.startedAt === undefined || newerSession(other, { sessionId, startedAt })) {
            supersededRef.current = true; setSuperseded(true); stopAlarm(); closeNotifications();
          } else if (!supersededRef.current) setOwnershipVersion(value => value + 1);
        }
      } catch { /* Ignore malformed external state. */ }
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [mode, interruptionKey, sessionId]);

  // Main Timer Loop
  useEffect(() => {
    if (!restored || superseded || isComplete || (mode === 'lockin' && !['COUNTDOWN', 'REVEAL_DELAY'].includes(sessionState))) return;

    const initial = sessionState === 'REVEAL_DELAY' ? revealDelayLeft : timeLeft;
    const deadline = Date.now() + initial * 1000;
    let finished = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => {
      if (finished || !mounted.current || supersededRef.current) return;
      const remaining = remainingSeconds(deadline);
      if (mode === 'lockin') {
        if (sessionState === 'COUNTDOWN') {
          setTimeLeft(remaining);
          if (remaining === 0) {
            finished = true;
            setSessionState('ALARM');
          }
        } else if (sessionState === 'REVEAL_DELAY') {
          setRevealDelayLeft(remaining);
          if (remaining === 0) { finished = true; setSessionState('READY_TO_REVEAL'); }
          else playTick();
        }
      } else {
        setTimeLeft(remaining);
        if (remaining === 0) finished = true;
      }
      if (finished && timer) clearInterval(timer);
    };
    tick();
    if (!finished) timer = setInterval(tick, 1000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => { finished = true; clearInterval(timer); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick); };
  }, [sessionState, isComplete, mode, restored, sessionRun, superseded]);

  // Alarm Handler
  useEffect(() => {
    if (mode === 'lockin' && sessionState === 'ALARM' && !superseded) {
      startAlarm();
      void sendNotification().catch(() => {});
    } else {
      stopAlarm(); closeNotifications();
    }
    return () => { stopAlarm(); };
  }, [sessionState, mode, superseded]);

  const handleImHere = () => {
    if (mode !== 'lockin' || phase.current !== 'ALARM' || supersededRef.current) return;
    setSessionState(revealDelayLeft === 0 ? 'READY_TO_REVEAL' : 'REVEAL_DELAY');
  };

  const handleReveal = () => {
    if (mode !== 'lockin' || phase.current !== 'READY_TO_REVEAL' || supersededRef.current) return;
    setSessionState('ANSWER_SHOWN');
    setIsFlipped(true);
  };

  const handleFine = () => {
    if (mode !== 'lockin' || phase.current !== 'ANSWER_SHOWN' || supersededRef.current) return;
    if (cyclesLeft > 1) {
      setCyclesLeft(prev => prev - 1);
      setTimeLeft(duration);
      setRevealDelayLeft(config?.revealDelay || 0);
      setIsFlipped(false);
      setSessionState('COUNTDOWN');
    } else {
      setSessionState('SESSION_COMPLETE');
      clearRecovery();
    }
  };

  const handleAnkiEvaluation = async (rating: ReviewRating) => {
    if (mode !== 'anki' || !isFlipped || reviewLock.current || isComplete) return;
    reviewLock.current = true;
    setReviewError(null);
    setIsSaving(true);
    try {
      if (!user) throw new Error('Please sign in again before saving a review.');
      const schedule = await reviewFlashcard(user, card.id, rating);

      if (!mounted.current) return;
      setReviewSchedule(schedule);
      setShowToast(true);
      toastTimer.current = setTimeout(() => setShowToast(false), 2000);
      setIsComplete(true);
    } catch (error) {
      if (mounted.current) setReviewError(error instanceof Error ? error.message : 'Could not save review.');
    } finally {
      reviewLock.current = false;
      if (mounted.current) setIsSaving(false);
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h.toString().padStart(2, '0') + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isStress = mode === 'online' && timeLeft <= 10 && timeLeft > 0;

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={card.cardName || t.studyModeSettings} tabIndex={-1} className={`fixed inset-0 z-[60] bg-neutral-950 flex flex-col items-center p-6 overflow-y-auto ${mode === 'lockin' ? 'z-[100]' : ''}`}>
      {persistenceError && <p role="status" className="mb-4 rounded-lg bg-amber-950 text-amber-100 p-3 text-sm">
        {language === 'Amharic' ? 'የክፍለ ጊዜ ሂደት በዚህ መሣሪያ ላይ ማስቀመጥ አልተቻለም። ገጹን አይዝጉ።' : 'Session recovery is unavailable because browser storage could not be written. Keep this page open.'}
      </p>}
      <ConfirmModal isOpen={quitOpen} heading={interactionCopy[language].quitTitle} title={interactionCopy[language].quitBody} description=" "
        confirmLabel={interactionCopy[language].quit} onConfirm={handleQuit} onCancel={() => setQuitOpen(false)} language={language} />
      {reviewError && <p role="alert" className="mb-3 text-sm text-red-500">{reviewError}</p>}
      {superseded && <p role="alert" className="mb-3 text-sm text-amber-400">{language === 'Amharic' ? 'አዲስ ክፍለ ጊዜ በሌላ ትር ተጀምሯል። ይህ ክፍለ ጊዜ ቆሟል።' : 'A newer Lock-In session started in another tab. This session has stopped.'}</p>}
      {/* Toast */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-12 px-6 py-3 rounded-full bg-neutral-50 text-neutral-950 font-extrabold text-[10px] uppercase tracking-widest shadow-xl shadow-white/5 z-[70]"
          >
            {t.reviewSaved || 'Review Saved!'}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background Pulse */}
      <AnimatePresence>
        {isStress && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-red-500/5 pointer-events-none"
            style={{
              boxShadow: 'inset 0 0 100px rgba(239, 68, 68, 0.1)'
            }}
          />
        )}
      </AnimatePresence>

      {/* Header / Top Timer for Lock-In */}
      <div className="w-full flex items-center justify-between mb-8">
        <button
          disabled={isSaving} onClick={requestQuit}
          aria-label="Quit study session"
          className="p-3 rounded-full bg-neutral-900/50 border border-neutral-800/30 text-neutral-500 hover:text-neutral-50 transition-all active:scale-95"
        >
          <X size={24} />
        </button>

        {mode === 'lockin' && (
          <div className="flex flex-col items-center">
            <div className="text-4xl font-extrabold tracking-tighter text-neutral-50">
              {sessionState === 'REVEAL_DELAY' ? formatTime(revealDelayLeft) : formatTime(timeLeft)}
            </div>
            <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mt-1">
              {t.cycle || 'Cycle'} {(config?.cycles || 1) - cyclesLeft + 1} / {config?.cycles || 1} • {sessionState.replace('_', ' ')}
            </div>
          </div>
        )}

        <button
          onClick={toggleFullscreen}
          aria-label="Toggle fullscreen"
          className="p-3 rounded-full bg-neutral-900/50 border border-neutral-800/30 text-neutral-500 hover:text-neutral-50 transition-all active:scale-95"
        >
          {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
        </button>
      </div>

      <fieldset disabled={superseded} className="contents">
      {/* Card Container */}
      <div className="relative w-full h-fit max-w-[480px] mx-auto [perspective:1000px]">
        <AnimatePresence mode="wait">
          {sessionState === 'SESSION_COMPLETE' ? (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center gap-8 text-center py-20"
            >
              <div className="w-24 h-24 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-50">
                <Check size={48} />
              </div>
              <div className="space-y-2">
                <h2 className="text-4xl font-extrabold text-neutral-50 tracking-tighter uppercase">{t.sessionComplete}</h2>
                <p className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest">{config?.cycles} {t.cycles} Completed!</p>
              </div>
              <button
                disabled={isSaving} onClick={requestQuit}
                className="mt-4 px-12 py-4 rounded-2xl bg-neutral-50 text-neutral-950 font-extrabold text-sm uppercase tracking-widest hover:bg-neutral-200 active:scale-95 transition-all shadow-xl shadow-white/5"
              >
                {t.finish}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="card"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`relative w-full transition-all duration-500 [transform-style:preserve-3d] ${isFlipped ? '[-webkit-transform:rotateY(180deg)] [transform:rotateY(180deg)]' : ''}`}
            >
              <StudyCardFace card={card} side="front" hidden={isFlipped} />
              <StudyCardFace card={card} side="back" hidden={!isFlipped} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ALARM STATE BUTTON */}
        <AnimatePresence>
          {sessionState === 'ALARM' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center z-50"
            >
              <button
                onClick={handleImHere}
                className="px-12 py-6 rounded-3xl bg-neutral-50 text-neutral-950 font-extrabold text-2xl hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.3)] animate-pulse uppercase tracking-tighter"
              >
                {t.imHere}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls / Scrollable Reveal for Lock-In */}
      <div className={`flex flex-col items-center gap-8 w-full max-w-sm mt-12 pb-12`}>
        {mode !== 'lockin' && (
          <div className={`text-6xl font-extrabold tracking-tighter transition-colors duration-300 ${isStress ? 'text-red-500' : 'text-neutral-50'}`}>
            {formatTime(timeLeft)}
          </div>
        )}

        <AnimatePresence mode="wait">
          {mode === 'lockin' ? (
            <div className="w-full">
              {sessionState === 'READY_TO_REVEAL' && (
                <motion.div
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col items-center w-full"
                >
                  <button
                    onClick={handleReveal}
                    className="w-full py-4 px-8 rounded-2xl bg-neutral-50 text-neutral-950 font-extrabold text-base sm:text-lg hover:bg-neutral-200 active:scale-95 transition-all shadow-xl shadow-white/5 uppercase tracking-widest flex items-center justify-center gap-2.5"
                  >
                    <Eye size={20} />
                    <span>{t.revealAnswer || t.revealPrompt || 'Reveal Answer'}</span>
                  </button>
                </motion.div>
              )}
              {sessionState === 'ANSWER_SHOWN' && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-4 w-full"
                >
                  <button
                    onClick={() => { clearRecovery(); stopAlarm(); closeNotifications(); onEdit?.(card); }}
                    className="flex-1 py-4 rounded-xl bg-neutral-900 border border-neutral-800/30 text-neutral-400 font-extrabold uppercase tracking-widest hover:text-neutral-50 transition-all active:scale-95"
                  >
                    {t.edit}
                  </button>
                  <button
                    onClick={handleFine}
                    className="flex-1 py-4 rounded-xl bg-neutral-50 text-neutral-950 font-extrabold uppercase tracking-widest hover:bg-neutral-200 transition-all active:scale-95 shadow-xl shadow-white/5"
                  >
                    {t.fine}
                  </button>
                </motion.div>
              )}
            </div>
          ) : !isFlipped ? (
            <motion.button
              key="reveal"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              disabled={!restored || timeLeft > 0}
              onClick={() => { if (!restored || timeLeft > 0) return; setIsFlipped(true); if (mode === 'online') setIsComplete(true); }}
              className="disabled:opacity-40 disabled:cursor-not-allowed px-12 py-4 rounded-2xl bg-neutral-50 text-neutral-950 font-extrabold uppercase tracking-widest hover:bg-neutral-200 active:scale-95 transition-all shadow-xl shadow-white/5"
            >
              {t.revealAnswer}
            </motion.button>
          ) : (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full space-y-4"
            >
              {mode === 'anki' && !isComplete ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
                  {(['again', 'hard', 'good', 'easy'] as const).map(rating => (
                    <button key={rating} disabled={isSaving} onClick={() => handleAnkiEvaluation(rating)}
                      title={rating === 'again' ? t.againHint : rating === 'hard' ? t.hardHint : undefined}
                      className={`py-4 px-2 rounded-xl border-2 font-bold transition-all text-sm disabled:opacity-50 ${rating === 'again' || rating === 'hard' ? 'bg-red-500/30 border-red-500/50 text-red-500 hover:bg-red-500/40' : rating === 'good' ? 'bg-blue-500/30 border-blue-500/50 text-blue-500 hover:bg-blue-500/40' : 'bg-emerald-500/30 border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/40'}`}>
                      <span className="block">{t[rating]}</span>
                      <span className="block mt-1 text-xs">~{formatReviewDelay((calculateReview(reviewSchedule, rating).nextReview - Date.now()) / 86400000, language)}</span>
                    </button>
                  ))}
                  <p className="col-span-2 sm:col-span-4 text-xs text-neutral-400">{t.againHint} {t.hardHint}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  {isComplete && mode === 'anki' && (
                    <p className="text-emerald-500 font-bold animate-bounce">{t.saved}</p>
                  )}
                  <div className="flex gap-3 w-full">
                    <button
                      onClick={() => {
                        setIsFlipped(false);
                        setIsComplete(false);
                        setTimeLeft(duration);
                        setSessionRun(run => run + 1);
                      }}
                      className="flex-1 py-4 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold hover:text-white active:scale-95 transition-all"
                    >
                      {t.restart}
                    </button>
                    <button
                      onClick={handleQuit}
                      className="flex-1 py-4 rounded-xl bg-emerald-500 text-white font-bold hover:bg-emerald-600 active:scale-95 transition-all shadow-lg shadow-emerald-500/20"
                    >
                      {t.backToList}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </fieldset>
    </div>
  );
};

const StudySession = (props: React.ComponentProps<typeof SingleCardStudySession>) => {
  const { user } = useAuth();
  return props.mode === 'anki' && user
    ? <ReviewHub requestNew user={user} scope={props.card.unitId} duration={props.duration} language={props.language} onClose={props.onQuit} />
    : <SingleCardStudySession {...props} />;
};

const FolderItem: React.FC<{
  folder: FolderData;
  allFolders: FolderData[];
  onAdd: (parentId: string, level: number) => void;
  onRename: (id: string, currentName: string) => void;
  onDelete: (id: string, name: string) => void;
  onSelectUnit: (folder: FolderData) => void;
  language?: Language;
  theme?: 'dark' | 'light';
}> = ({ folder, allFolders, onAdd, onRename, onDelete, onSelectUnit, language = 'English', theme = 'dark' }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const children = useMemo(() => allFolders.filter(f => f.parentId === folder.id), [allFolders, folder.id]);
  const t = translations[language];

  const subfoldersLabel = children.length === 1 ? t.subfolder : t.subfolders;
  const levelLabel = `${t.level} ${folder.level}`;

  return (
    <div className="space-y-2">
      <div className={`group flex items-center gap-3 p-3.5 rounded-2xl border transition-all duration-200 ${
        theme === 'light'
          ? 'bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-md text-slate-900 shadow-sm'
          : 'bg-neutral-900/60 border-neutral-800/80 hover:border-neutral-700 text-neutral-100'
      }`}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`p-1.5 rounded-lg transition-colors ${
            isExpanded
              ? (theme === 'light' ? 'text-indigo-600 bg-indigo-50' : 'text-neutral-100 bg-neutral-800')
              : (theme === 'light' ? 'text-slate-400 hover:text-slate-700' : 'text-neutral-500 hover:text-neutral-300')
          }`}
          title={children.length > 0 ? (isExpanded ? "Collapse subfolders" : "Expand subfolders") : "No subfolders"}
        >
          {children.length > 0 ? (isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />) : <div className="w-[18px]" />}
        </button>

        {/* Click anywhere on folder row to open it directly as a deck/unit */}
        <div
          className="flex-1 flex items-center gap-3 cursor-pointer py-1"
          onClick={() => onSelectUnit(folder)}
        >
          <Folder size={20} className={folder.level === 1 ? 'text-blue-500' : folder.level === 2 ? 'text-purple-500' : 'text-amber-500'} />
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
            <span className={`font-bold text-sm transition-colors ${theme === 'light' ? 'text-slate-900 group-hover:text-indigo-600' : 'text-neutral-50 group-hover:text-white'}`}>
              {folder.name}
            </span>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] uppercase tracking-widest font-extrabold ${theme === 'light' ? 'text-slate-400' : 'text-neutral-500'}`}>
                {levelLabel}
              </span>
              {children.length > 0 && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  theme === 'light' ? 'bg-slate-100 text-slate-600 border border-slate-200' : 'bg-neutral-800/80 text-neutral-400'
                }`}>
                  {children.length} {subfoldersLabel}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          {/* Quick Open Folder Button */}
          <button
            onClick={() => onSelectUnit(folder)}
            className={`px-3 py-1.5 active:scale-95 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
              theme === 'light'
                ? 'bg-indigo-50 border border-indigo-200/80 text-indigo-700 hover:bg-indigo-600 hover:text-white'
                : 'bg-neutral-800 text-neutral-200 hover:text-white hover:bg-neutral-700'
            }`}
            title={t.open}
          >
            <BookOpen size={14} />
            <span className="hidden sm:inline">{t.open}</span>
          </button>

          {/* Optional Subfolder Creation (up to 3 levels) */}
          {folder.level < 3 && (
            <button
              onClick={(e) => { e.stopPropagation(); onAdd(folder.id, folder.level + 1); }}
              className={`p-2 rounded-lg transition-colors ${
                theme === 'light' ? 'text-slate-400 hover:text-slate-800 hover:bg-slate-100' : 'text-neutral-400 hover:text-neutral-50 hover:bg-neutral-800'
              }`}
              title={t.addSubfolderTitle}
            >
              <FolderPlus size={16} />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onRename(folder.id, folder.name); }}
            className={`p-2 rounded-lg transition-colors ${
              theme === 'light' ? 'text-slate-400 hover:text-slate-800 hover:bg-slate-100' : 'text-neutral-400 hover:text-neutral-50 hover:bg-neutral-800'
            }`}
            title={t.renameFolder}
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(folder.id, folder.name); }}
            className={`p-2 rounded-lg transition-colors ${
              theme === 'light' ? 'text-slate-400 hover:text-red-600 hover:bg-red-50' : 'text-neutral-400 hover:text-red-400 hover:bg-red-500/10'
            }`}
            title={t.delete}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && children.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={`overflow-hidden pl-6 sm:pl-8 space-y-2 border-l ml-5 ${
              theme === 'light' ? 'border-slate-200' : 'border-neutral-900'
            }`}
          >
            {children.map(child => (
              <FolderItem
                key={child.id}
                folder={child}
                allFolders={allFolders}
                onAdd={onAdd}
                onRename={onRename}
                onDelete={onDelete}
                onSelectUnit={onSelectUnit}
                language={language}
                theme={theme}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Flashcard Editor ---
const FlashcardEditor: React.FC<{
  unitId: string;
  editingCard?: FlashcardData;
  onClose: () => void;
  onSave: () => void;
  language?: Language;
  theme?: 'dark' | 'light';
}> = ({ unitId, editingCard, onClose, onSave, language = 'English', theme = 'dark' }) => {
  const { user } = useAuth();
  const t = translations[language] || translations.English;
  const [side, setSide] = useState<'front' | 'back'>('front');
  const draftKey = `hahu_editor_${user?.uid}_${unitId}_${editingCard?.id || 'new'}`;
  const [recovered] = useState(() => readEditorDraft(draftKey));
  const initialCard = recovered?.fields || editingCard;
  const baseline = recovered?.baseline || editingCard;
  const draftDismissed = useRef(false);
  const [draftWarning, setDraftWarning] = useState<string | null>(recovered ? (language === 'Amharic' ? 'ያልተቀመጡ ለውጦች ተመልሰዋል።' : 'Your unsaved draft was restored. Review it before saving.') : null);
  const [cardName, setCardName] = useState(initialCard?.cardName || '');
  const [note, setNote] = useState(initialCard?.note || '');
  const [frontText, setFrontText] = useState(initialCard?.frontText || '');
  const [backText, setBackText] = useState(initialCard?.backText || '');
  const [frontPreview, setFrontPreview] = useState<string | null>(initialCard?.frontImageUrl || null);
  const [backPreview, setBackPreview] = useState<string | null>(initialCard?.backImageUrl || null);
  const [aspectRatio, setAspectRatio] = useState(initialCard?.aspectRatio || 1);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [textSize, setTextSize] = useState(initialCard?.textSize || 24);
  const [textColor, setTextColor] = useState(initialCard?.textColor || '#ffffff');
  const [verticalAlign, setVerticalAlign] = useState<'top' | 'center' | 'bottom'>(initialCard?.verticalAlign || 'center');

  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<Crop>();
  const [isCropping, setIsCropping] = useState(false);
  const [cropSide, setCropSide] = useState<'front' | 'back'>('front');
  const imgRef = useRef<HTMLImageElement>(null);

  const [showNameWarning, setShowNameWarning] = useState(false);
  const cardNameInputRef = useRef<HTMLInputElement>(null);

  const copy = interactionCopy[language];
  const dialogRef = useRef<HTMLDivElement>(null);
  const cropRef = useRef<HTMLDivElement>(null);
  const savingLock = useRef(false);
  const imageOperation = useRef<AbortController | null>(null);
  const cropUrl = useRef<string | null>(null);
  const mounted = useRef(true);
  const releaseCrop = () => { if (cropUrl.current) URL.revokeObjectURL(cropUrl.current); cropUrl.current = null; };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; imageOperation.current?.abort(); releaseCrop(); };
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [cropBusy, setCropBusy] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const dirty = note !== (editingCard?.note || '') || cardName !== (editingCard?.cardName || '') || frontText !== (editingCard?.frontText || '') || backText !== (editingCard?.backText || '') ||
    frontPreview !== (editingCard?.frontImageUrl || null) || backPreview !== (editingCard?.backImageUrl || null) ||
    aspectRatio !== (editingCard?.aspectRatio || 1) || textSize !== (editingCard?.textSize || 24) || textColor !== (editingCard?.textColor || '#ffffff') || verticalAlign !== (editingCard?.verticalAlign || 'center');
  const latestDraft = useRef({ dirty, fields: { cardName, note, frontText, backText, frontImageUrl: frontPreview || '', backImageUrl: backPreview || '', aspectRatio, textSize, textColor, verticalAlign }, baseline });
  latestDraft.current = { dirty, fields: { cardName, note, frontText, backText, frontImageUrl: frontPreview || '', backImageUrl: backPreview || '', aspectRatio, textSize, textColor, verticalAlign }, baseline };
  const clearDraft = () => {
    draftDismissed.current = true;
    try { sessionStorage.removeItem(draftKey); } catch {
      try { sessionStorage.setItem(draftKey, 'null'); } catch {
        alert('Browser storage could not clear this recovery draft. An older draft may appear when you reopen the editor; review it before saving.');
      }
    }
  };
  const persistDraft = () => {
    if (draftDismissed.current) return;
    const draft = latestDraft.current;
    try {
      if (draft.dirty) sessionStorage.setItem(draftKey, JSON.stringify({ fields: draft.fields, baseline: draft.baseline, timestamp: Date.now() }));
      else sessionStorage.removeItem(draftKey);
    } catch { if (mounted.current) setDraftWarning(language === 'Amharic' ? 'ረቂቁ አልተቀመጠም። ገጹን ከማደስዎ በፊት ለውጦቹን ያስቀምጡ።' : 'Draft recovery storage is unavailable or full. Save your changes before refreshing.'); }
  };
  useEffect(() => {
    const timer = setTimeout(persistDraft, 250);
    return () => clearTimeout(timer);
  }, [cardName, note, frontText, backText, frontPreview, backPreview, aspectRatio, textSize, textColor, verticalAlign]);
  useEffect(() => {
    window.addEventListener('pagehide', persistDraft);
    window.addEventListener('beforeunload', persistDraft);
    return () => { persistDraft(); window.removeEventListener('pagehide', persistDraft); window.removeEventListener('beforeunload', persistDraft); };
  }, [draftKey]);
  const requestClose = () => { if (savingLock.current || !!imageOperation.current) return; if (dirty) setDiscardOpen(true); else onClose(); };
  const closeCrop = () => { if (!imageOperation.current) { releaseCrop(); setIsCropping(false); setCropImageSrc(null); setError(null); } };
  useDialog(dialogRef, true, requestClose, isSaving || imageLoading);
  useDialog(cropRef, isCropping, closeCrop, cropBusy);
  useBeforeUnload(dirty || isSaving || cropBusy || isCropping || imageLoading);

  const loadImage = async (file: File) => {
    if (imageOperation.current || savingLock.current || isCropping || discardOpen || clearOpen) return;
    const controller = new AbortController();
    imageOperation.current = controller;
    const targetSide = side;
    setImageLoading(true); setError(null); setCrop(undefined); setCompletedCrop(undefined);
    try {
      const preview = await prepareEditorImage(file, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      releaseCrop();
      cropUrl.current = URL.createObjectURL(preview);
      setCropImageSrc(cropUrl.current); setCropSide(targetSide); setIsCropping(true);
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load image.');
    } finally {
      if (imageOperation.current === controller) imageOperation.current = null;
      if (mounted.current) setImageLoading(false);
    }
  };
  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // Selecting the same file after failure must retry.
    if (file) void loadImage(file);
  };
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (imageOperation.current || savingLock.current || isCropping || discardOpen || clearOpen) return;
      const item = Array.from(event.clipboardData?.items || []).find(item => item.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) { event.preventDefault(); void loadImage(file); }
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  }, [side, isCropping, discardOpen, clearOpen]);

  const handleCropSave = async () => {
    if (!imgRef.current || !completedCrop || completedCrop.width === 0 || completedCrop.height === 0 || imageOperation.current) return;
    const controller = new AbortController();
    imageOperation.current = controller;
    setCropBusy(true); setError(null);
    try {
      const bounds = getCropBounds(imgRef.current, completedCrop);
      const ratio = bounds.width / bounds.height;
      if (ratio > 10 || ratio < 0.001) throw new Error('Choose a less narrow crop.');
      const croppedFile = await getCroppedImg(imgRef.current, completedCrop, 'cropped.jpg', controller.signal);
      const preview = await imageDataUrl(croppedFile, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      setAspectRatio(ratio);
      if (cropSide === 'front') { setFrontPreview(preview); }
      else { setBackPreview(preview); }
      releaseCrop(); setIsCropping(false); setCropImageSrc(null);
    } catch (error) { if (mounted.current && !controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not crop image.'); }
    finally { if (imageOperation.current === controller) imageOperation.current = null; if (mounted.current) setCropBusy(false); }
  };

  const handleSave = async () => {
    if (!user || savingLock.current || isCropping || !!imageOperation.current) return;
    if (!cardName.trim()) {
      setShowNameWarning(true);
      cardNameInputRef.current?.focus();
      return;
    }
    setShowNameWarning(false);
    savingLock.current = true;
    setIsSaving(true); setError(null);
    try {
      let frontUrl = frontPreview || '';
      let backUrl = backPreview || '';

      const path = 'flashcards';
      const cardData: any = {
        cardName: cardName.trim(),
        note,
        frontText,
        backText,
        frontImageUrl: frontUrl,
        backImageUrl: backUrl,
        aspectRatio,
        ownerId: user.uid,
        updatedAt: serverTimestamp(),
        textSize,
        textColor,
        verticalAlign
      };

      if (!editingCard) {
        cardData.unitId = unitId;
      }

      await saveFlashcard(user, cardData, editingCard?.id, baseline);

      clearDraft();
      if (mounted.current) onSave();
    } catch (error: any) {
      console.error("Error saving flashcard:", error);
      if (mounted.current) setError(error instanceof Error ? error.message : 'Could not save card.');
    } finally {
      savingLock.current = false;
      if (mounted.current) setIsSaving(false);
    }
  };

  const currentPreview = side === 'front' ? frontPreview : backPreview;
  const currentText = side === 'front' ? frontText : backText;

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={editingCard ? t.editFlashcard : t.create} aria-busy={isSaving} tabIndex={-1} className="fixed inset-0 z-50 bg-neutral-950 flex flex-col">
      {draftWarning && <p role="status" className="px-4 py-2 text-xs text-amber-400">{draftWarning}</p>}
      <fieldset disabled={isSaving || imageLoading} className="contents">
      <header className="h-16 border-b border-neutral-900 flex items-center justify-between px-3 sm:px-8">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
          <button aria-label={copy.close} onClick={requestClose} className="p-2 text-neutral-400 hover:text-neutral-50 transition-colors">
            <X size={24} />
          </button>
          <h2 className="text-lg font-extrabold tracking-tighter text-neutral-50 uppercase truncate">{editingCard ? 'Edit Flashcard' : 'Create Flashcard'}</h2>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button onClick={() => setIsPreview(!isPreview)} className="px-3 sm:px-4 py-2 rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:scale-95 transition-all text-[10px] font-bold uppercase tracking-wider">
            {isPreview ? 'Edit Mode' : 'Preview'}
          </button>
          <button onClick={handleSave} disabled={isSaving} className="px-3 sm:px-6 py-2 rounded-lg bg-neutral-50 text-neutral-950 hover:bg-neutral-200 active:scale-95 transition-all text-[10px] font-bold uppercase tracking-wider disabled:opacity-50">
            {isSaving ? copy.saving : copy.save}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 w-full">
        <div className="flex flex-col xl:flex-row items-center xl:items-start justify-center gap-8 lg:gap-12 max-w-7xl mx-auto w-full">

          {/* Left Column: Input + Preview */}
          <div className="flex flex-col items-center w-full xl:w-1/2 max-w-md xl:max-w-xl gap-6 xl:sticky xl:top-8 shrink-0">
            {/* Card Name Input & Intuitive Name Required Popup */}
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1.5">
                  <span>{copy.cardName}</span>
                  <span className="text-amber-400 font-bold">*</span>
                </label>
                <AnimatePresence>
                  {showNameWarning && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: -2 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -2 }}
                      className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20"
                    >
                      <AlertCircle size={12} className="text-amber-400" />
                      <span>Required to save</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="relative">
                <input
                  ref={cardNameInputRef}
                  data-initial-focus
                  maxLength={200}
                  aria-label={copy.cardName}
                  aria-invalid={showNameWarning}
                  type="text"
                  value={cardName}
                  onChange={(e) => {
                    setCardName(e.target.value);
                    if (showNameWarning && e.target.value.trim()) {
                      setShowNameWarning(false);
                    }
                  }}
                  placeholder="e.g., Mitochondria"
                  className={`w-full bg-neutral-900 border rounded-xl px-4 py-3 text-sm text-neutral-100 outline-none transition-all ${
                    showNameWarning
                      ? 'border-amber-500/80 ring-2 ring-amber-500/20 shadow-lg shadow-amber-950/20'
                      : 'border-neutral-800/30 focus:border-neutral-500'
                  }`}
                />
              </div>

              {/* Small Intuitive Pop-up Callout inside Card Editor */}
              <AnimatePresence>
                {showNameWarning && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="p-3 bg-gradient-to-r from-amber-950/90 via-neutral-900 to-neutral-900 border border-amber-500/40 rounded-xl flex items-center justify-between gap-3 shadow-xl shadow-black/60"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                        <AlertCircle size={14} className="text-amber-400" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-amber-200">
                          Card name required
                        </p>
                        <p className="text-[11px] text-neutral-400">
                          Please enter a name above to save this card.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowNameWarning(false)}
                      className="p-1.5 text-neutral-400 hover:text-amber-300 hover:bg-neutral-800 rounded-lg transition-colors"
                      title="Close popup"
                    >
                      <X size={14} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <label className="block space-y-2 text-sm text-neutral-300">
              <span>{language === 'Amharic' ? 'የካርድ ማስታወሻ (አማራጭ)' : 'Card note (optional)'}</span>
              <textarea aria-label={language === 'Amharic' ? 'የካርድ ማስታወሻ (አማራጭ)' : 'Card note (optional)'} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} rows={3}
                placeholder={language === 'Amharic' ? 'ለምሳሌ፦ ይህ ርዕስ በፈተና ሊመጣ ይችላል።' : 'e.g., This topic may be on the exam.'}
                className="block w-full bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-neutral-100 resize-y" />
              <span className="block text-xs text-neutral-500">{language === 'Amharic' ? 'በማጥናት ጊዜ አይታይም። ካርዱን ሲያጋሩ ማስታወሻውም ይካተታል።' : 'Hidden during study. Included when you export or share the card.'} {note.length}/1000</span>
            </label>

            {/* Side Toggle */}
            <div className="flex bg-neutral-900 p-1 rounded-xl border border-neutral-800/30 w-full">
              <button
                onClick={() => setSide('front')}
                className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 ${side === 'front' ? 'bg-neutral-800 text-neutral-50 shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                Front Side
              </button>
              <button
                onClick={() => setSide('back')}
                className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 ${side === 'back' ? 'bg-neutral-800 text-neutral-50 shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                Back Side
              </button>
            </div>

            {/* Card Preview Container */}
            <div
              className="relative bento-card overflow-hidden shadow-2xl shadow-white/5 transition-all duration-500 h-auto w-full max-w-md bg-neutral-900 border-2 border-neutral-200"
              style={{
                aspectRatio: aspectRatio.toString()
              }}
            >
              {currentPreview ? (
                <img src={currentPreview} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" loading="lazy" />
              ) : (
                <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-800/50 transition-colors group p-4 text-center">
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                  <div className="p-4 rounded-full bg-neutral-800 text-neutral-500 group-hover:text-neutral-300 transition-colors mb-4">
                    <Plus size={32} />
                  </div>
                  <p className="text-neutral-500 font-bold uppercase text-[10px] tracking-widest">Click to upload image</p>
                  <p className="text-neutral-700 text-[10px] mt-1 uppercase tracking-tighter">{t.supportsFormats || 'Supports JPEG, PNG, WebP'}</p>
                </label>
              )}

              {/* Text Overlay */}
              <div className={`absolute inset-0 flex p-8 pointer-events-none ${
                verticalAlign === 'top' ? 'items-start' :
                verticalAlign === 'bottom' ? 'items-end' :
                'items-center'
              } justify-center`}>
                <p
                  className="font-extrabold text-center drop-shadow-lg break-words w-full tracking-tight"
                  style={{
                    fontSize: `${textSize}px`,
                    color: textColor
                  }}
                >
                  {currentText}
                </p>
              </div>

              {currentPreview && !isPreview && (
                <button
                  aria-label={language === 'Amharic' ? 'ምስሉን አስወግድ' : 'Remove image'}
                  onClick={() => { if (side === 'front') { setFrontPreview(null); } else { setBackPreview(null); } }}
                  className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full active:scale-95 transition-all backdrop-blur-md"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Controls */}
          {!isPreview && (
            <div className="w-full xl:w-1/2 max-w-xl space-y-6 flex-1 pt-4 xl:pt-0">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{t.cardText || 'Card Text'}</label>
                <div className="relative">
                  <textarea maxLength={2000} aria-label={t.cardText}
                    value={side === 'front' ? frontText : backText}
                    onChange={(e) => side === 'front' ? setFrontText(e.target.value) : setBackText(e.target.value)}
                    placeholder={t.typeSomething || `Type something for the ${side}...`}
                    className="w-full bg-neutral-900 border border-neutral-800/30 rounded-xl px-4 py-3 text-sm text-neutral-100 outline-none focus:border-neutral-500 transition-colors min-h-[140px] resize-none"
                  />
                  <p className="text-[10px] text-neutral-500 text-right mt-1" aria-live="off">{currentText.length}/2000</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{t.textSize || 'Text Size'}</label>
                    <span className="text-xs font-bold text-neutral-400">{textSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="12"
                    max="72"
                    value={textSize}
                    onChange={(e) => setTextSize(parseInt(e.target.value))}
                    className="w-full accent-neutral-50 cursor-pointer"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{t.textColor || 'Text Color'}</label>
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <input
                      type="color"
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                      className="w-10 h-10 rounded-lg bg-neutral-900 border border-neutral-800/30 cursor-pointer p-1"
                    />
                    <span className="text-xs font-mono text-neutral-400 uppercase">{textColor}</span>
                  </div>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{t.verticalAlignment || 'Vertical Alignment'}</label>
                  <div className="flex gap-2">
                    {(['top', 'center', 'bottom'] as const).map((align) => (
                      <button
                        key={align}
                        onClick={() => setVerticalAlign(align)}
                        className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                          verticalAlign === align
                            ? 'bg-neutral-50 text-neutral-950 border-neutral-50'
                            : 'bg-neutral-900 text-neutral-400 border-neutral-800/30 hover:border-neutral-700'
                        }`}
                      >
                        {align === 'top' ? (t.alignTop || 'Top') : align === 'center' ? (t.alignCenter || 'Center') : 'Bottom'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-6 mt-6 border-t border-neutral-800/50">
                <button
                  onClick={() => setClearOpen(true)}
                  disabled={!currentText && !currentPreview}
                  className="flex-1 py-3 rounded-xl bg-neutral-900 border border-neutral-800/30 text-neutral-400 hover:text-neutral-50 hover:border-neutral-700 transition-all font-bold text-[10px] uppercase tracking-widest"
                >
                  {copy.clear}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      </fieldset>
      {imageLoading && <p role="status" className="px-4 py-2 text-sm text-neutral-400">{copy.working}</p>}
      {error && !isCropping && <p role="alert" className="px-4 py-3 text-sm text-red-500">{error}</p>}
      <ConfirmModal isOpen={discardOpen} title={copy.discardBody} heading={copy.discardTitle} description=" " confirmLabel={copy.discard} cancelLabel={copy.keepEditing}
        onConfirm={() => { clearDraft(); onClose(); }} onCancel={() => setDiscardOpen(false)} language={language} theme={theme} />
      <ConfirmModal isOpen={clearOpen} title={copy.clearBody} heading={copy.clearSide} description=" " confirmLabel={copy.clear}
        onConfirm={() => { if (side === 'front') { setFrontText(''); setFrontPreview(null); } else { setBackText(''); setBackPreview(null); } setClearOpen(false); }}
        onCancel={() => setClearOpen(false)} language={language} theme={theme} />
      {/* Cropping Modal */}
      <AnimatePresence>
        {isCropping && cropImageSrc && (
          <motion.div ref={cropRef} role="dialog" aria-modal="true" aria-label={t.cropImage} tabIndex={-1}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-neutral-950 flex flex-col"
          >
            <header className="h-16 border-b border-neutral-900 flex items-center justify-between px-3 sm:px-8">
              <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                <button disabled={cropBusy} aria-label={copy.close} onClick={closeCrop} className="p-2 text-neutral-400 hover:text-neutral-50 transition-colors">
                  <X size={24} />
                </button>
                <h2 className="text-lg font-extrabold tracking-tighter text-neutral-50 uppercase">Crop Image</h2>
              </div>
              <button disabled={cropBusy || !completedCrop?.width || !completedCrop?.height} onClick={handleCropSave} className="px-3 sm:px-6 py-2 rounded-lg bg-neutral-50 text-neutral-950 hover:bg-neutral-200 active:scale-95 transition-all text-[10px] font-bold uppercase tracking-wider">
                {cropBusy ? copy.working : (t.applyCrop || 'Apply crop')}
              </button>
            </header>
            {error && <p role="alert" className="px-4 py-2 text-sm text-red-500">{error}</p>}
            <div className="flex-1 overflow-hidden bg-neutral-900 flex items-center justify-center p-4 sm:p-8 min-h-0 w-full relative">
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                onComplete={(_, percentCrop) => setCompletedCrop(percentCrop)}
                className="max-h-full max-w-full flex justify-center items-center"
              >
                <img
                  ref={imgRef}
                  src={cropImageSrc}
                  alt="Crop preview"
                  onError={() => { setError('Could not display this image. Close the crop and choose another file.'); setCompletedCrop(undefined); }}
                  className="block object-contain"
                  style={{ maxHeight: 'calc(100vh - 120px)', maxWidth: '100%', height: 'auto', width: 'auto' }}
                  onLoad={(e) => {
                    setCrop({ unit: '%', x: 0, y: 0, width: 100, height: 100 });
                    setCompletedCrop({ unit: '%', x: 0, y: 0, width: 100, height: 100 });
                  }}
                />
              </ReactCrop>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const FlashcardListItem = React.memo(({
  card,
  isSelectMode,
  selectedIds,
  onSelect,
  onLongPress,
  onPressCancel,
  onStudyNow,
  onEdit,
  onDelete,
  onMove,
  onRename,
  onExportSingle,
  dateBoundaries,
  language = 'English',
  theme = 'dark'
}: {
  card: FlashcardData;
  isSelectMode: boolean;
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onLongPress: (id: string) => void;
  onPressCancel: () => void;
  onStudyNow: (card: FlashcardData) => void;
  onEdit: (card: FlashcardData) => void;
  onDelete: (card: FlashcardData) => void;
  onMove: (card: FlashcardData) => void;
  onRename: (card: FlashcardData) => void;
  onExportSingle?: (card: FlashcardData) => void;
  dateBoundaries: { startOfToday: number; startOfTomorrow: number; startOfDayAfter: number };
  language?: Language;
  theme?: 'dark' | 'light';
}) => {
  const t = translations[language];

  const getReviewBadge = (nextReview?: number) => {
    const { startOfTomorrow, startOfDayAfter } = dateBoundaries;

    if (!nextReview || nextReview < startOfTomorrow) return (
      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider inline-flex items-center gap-1.5 ${
        theme === 'light' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-neutral-800 text-neutral-300'
      }`}>
        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        {t.dueToday}
      </span>
    );

    if (nextReview >= startOfTomorrow && nextReview < startOfDayAfter) return (
      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
        theme === 'light' ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-neutral-800 text-neutral-300'
      }`}>
        {t.dueTomorrow}
      </span>
    );

    const days = Math.ceil((nextReview - dateBoundaries.startOfToday) / 86400000);
    const daysSuffix = language === 'Amharic' ? 'ቀናት' : 'days';
    const inDaysText = `${t.inDays} ${days} ${daysSuffix}`;
    return (
      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
        theme === 'light' ? 'bg-slate-100 text-slate-600 border border-slate-200' : 'bg-neutral-800 text-neutral-300'
      }`}>
        {inDaysText}
      </span>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      onPointerDown={(e) => { if ((e.target as HTMLElement).closest('button')) return; onLongPress(card.id); }}
      onPointerUp={onPressCancel}
      onPointerLeave={onPressCancel}
      onPointerMove={onPressCancel}
      onPointerCancel={onPressCancel}
      onContextMenu={(e) => e.preventDefault()}
      role="button"
      tabIndex={0}
      aria-label={`${isSelectMode ? 'Select' : 'Study'} ${card.cardName || 'flashcard'}`}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); isSelectMode ? onSelect(card.id) : onStudyNow(card); }
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        if (isSelectMode) onSelect(card.id);
        else onStudyNow(card);
      }}
      className={`group flex items-center gap-3 p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer ${
        selectedIds.has(card.id)
          ? 'border-emerald-500/50 bg-emerald-500/10 shadow-sm'
          : (theme === 'light'
              ? 'bg-white border-slate-200/90 hover:border-indigo-300 hover:shadow-md text-slate-900 shadow-sm'
              : 'bg-neutral-900 border-neutral-800 text-neutral-50 hover:border-neutral-700 shadow-sm')
      }`}
    >
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full">
        <AnimatePresence>
          {isSelectMode && (
            <motion.button aria-label={`${t.select} ${card.cardName}`} aria-pressed={selectedIds.has(card.id)}
              initial={{ width: 0, opacity: 0, x: -10 }}
              animate={{ width: 'auto', opacity: 1, x: 0 }}
              exit={{ width: 0, opacity: 0, x: -10 }}
              onClick={(e) => { e.stopPropagation(); onSelect(card.id); }}
              className={`w-6 h-6 rounded-full border transition-all flex items-center justify-center shrink-0 ${
                selectedIds.has(card.id)
                  ? 'bg-emerald-500 border-emerald-500 text-white'
                  : (theme === 'light' ? 'border-slate-300 bg-slate-100' : 'border-neutral-700 bg-neutral-900')
              }`}
            >
              {selectedIds.has(card.id) && <Check size={14} strokeWidth={4} />}
            </motion.button>
          )}
        </AnimatePresence>

        {!isSelectMode && <button
          className={`p-3 rounded-xl border cursor-pointer active:scale-95 transition-all shadow-sm shrink-0 ${
            theme === 'light'
              ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white'
              : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800 active:bg-emerald-500 active:text-white'
          }`}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onStudyNow(card); }}
          title="Study Now"
        >
          <Play size={18} fill="currentColor" />
        </button>}

        <div className="flex-1 flex items-center gap-3 overflow-hidden py-1 min-w-0">
          <div className="flex flex-col min-w-0">
            <span className={`font-bold text-sm truncate ${theme === 'light' ? 'text-slate-900' : 'text-neutral-50'}`}>
              {card.cardName || 'Untitled Flashcard'}
            </span>
            {card.note && <details className="mt-1 text-xs opacity-80" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
              <summary className="cursor-pointer font-semibold">{language === 'Amharic' ? 'ማስታወሻ' : 'Note'}</summary>
              <p className="whitespace-pre-wrap break-words mt-2">{card.note}</p>
            </details>}

            <div className="flex items-center gap-2 mt-0.5">
              <div className="text-[10px] font-bold uppercase tracking-widest">
                {getReviewBadge(card.nextReview)}
              </div>
            </div>
          </div>
        </div>

        {!isSelectMode && <div className="flex items-center justify-end gap-1 w-full sm:w-auto sm:ml-auto shrink-0">
          {card.frontImageUrl && (
            <div className={`w-10 h-10 rounded-lg border overflow-hidden shrink-0 mr-1.5 ${
              theme === 'light' ? 'bg-slate-100 border-slate-300' : 'bg-neutral-900 border-neutral-700'
            }`}>
              <ImageErrorBoundary>
                <img src={card.frontImageUrl} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" loading="lazy" />
              </ImageErrorBoundary>
            </div>
          )}
          {onExportSingle && (
            <button
              onClick={(e) => { e.stopPropagation(); onExportSingle(card); }}
              className={`p-2 rounded-lg transition-colors ${
                theme === 'light' ? 'text-slate-400 hover:text-slate-900 hover:bg-slate-100' : 'text-neutral-500 hover:text-neutral-50 hover:bg-neutral-800'
              }`}
              title={t.exportDeck}
            >
              <Download size={16} />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onMove(card); }}
            className={`p-2 rounded-lg transition-colors ${
              theme === 'light' ? 'text-slate-400 hover:text-slate-900 hover:bg-slate-100' : 'text-neutral-500 hover:text-neutral-50 hover:bg-neutral-800'
            }`}
            title={t.move}
          >
            <FolderInput size={16} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRename(card); }}
            className={`p-2 rounded-lg transition-colors ${
              theme === 'light' ? 'text-slate-400 hover:text-slate-900 hover:bg-slate-100' : 'text-neutral-500 hover:text-neutral-50 hover:bg-neutral-800'
            }`}
            title={language === 'Amharic' ? 'የካርድ ስም ቀይር' : 'Rename card'}
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(card); }}
            className={`p-2 rounded-lg transition-colors ${
              theme === 'light' ? 'text-slate-400 hover:text-slate-900 hover:bg-slate-100' : 'text-zinc-500 hover:text-white hover:bg-neutral-800'
            }`}
            title="Edit"
          >
            <Settings size={16} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(card); }}
            className={`p-2 rounded-lg transition-colors ${
              theme === 'light' ? 'text-slate-400 hover:text-red-600 hover:bg-red-50' : 'text-zinc-500 hover:text-red-400 hover:bg-red-500/10'
            }`}
            title={t.delete}
          >
            <Trash2 size={16} />
          </button>
        </div>}
      </div>
    </motion.div>
  );
});

const FocusCenter = ({
  userName,
  dueToday,
  dueTomorrow,
  upcoming,
  onResume,
  onOpenGlobal,
  onNewFolder,
  onImportDeck,
  onTryNow,
  language,
  theme = 'dark'
}: {
  userName?: string;
  dueToday: number;
  dueTomorrow: number;
  upcoming: number;
  onResume: () => void;
  onOpenGlobal: (filter: 'today' | 'tomorrow' | 'upcoming') => void;
  onNewFolder?: () => void;
  onImportDeck?: () => void;
  onTryNow?: () => void;
  language: Language;
  theme?: 'dark' | 'light';
}) => {
  const { user } = useAuth();
  const hasInterruptedSession = !!optionalStorage.getItem(`interrupted_lockin_session_${user?.uid}`);
  const t = translations[language];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 mb-8"
    >
      {/* Top Hero Container (Matching Reference Design) */}
      <div className="p-3.5 sm:p-5 md:p-6 bg-gradient-to-br from-indigo-900/80 via-purple-900/40 to-neutral-950 rounded-xl sm:rounded-2xl border border-indigo-500/20 shadow-xl relative overflow-hidden flex flex-col md:flex-row items-start justify-between gap-4 w-full">
        {/* Decorative Background Element */}
        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none hidden sm:block">
          <GraduationCap size={120} className="text-indigo-200" />
        </div>

        <div className="relative z-10 flex-1 min-w-0 w-full">
          {/* Top Pill Tag */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 border border-white/10 mb-2.5 backdrop-blur-sm max-w-full">
            <Sparkles size={11} className="text-emerald-400 shrink-0" />
            <span className="text-[10px] sm:text-[10.5px] font-bold text-white tracking-wide truncate">Personalized Study Platform</span>
          </div>

          {/* Heading */}
          <h1 className="text-base sm:text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight mb-2 max-w-lg break-words whitespace-pre-line leading-tight">
            {t.heroTitle}
          </h1>

          {/* Description */}
          <p className="text-indigo-100/90 text-xs sm:text-[13px] leading-relaxed max-w-lg mb-3.5 break-words whitespace-pre-wrap">
            {t.heroDesc}
          </p>

          {/* Action Buttons Row: "Try Now" on the left, "New Folder" & "Import Deck" on the right (parallel) */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4 w-full">
            {/* Left Action: Try Now & Resume */}
            <div className="flex flex-wrap items-center gap-2">
              {onTryNow && (
                <button
                  onClick={onTryNow}
                  className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-full bg-gradient-to-r from-rose-500 via-indigo-600 to-violet-600 hover:from-rose-400 hover:to-violet-500 text-white font-black text-xs sm:text-sm flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-indigo-600/30 hover:shadow-indigo-500/50 cursor-pointer"
                  title={t.tryNowDesc || "Explore sample flashcards instantly"}
                >
                  <Sparkles size={15} className="text-amber-300 animate-pulse shrink-0" />
                  <span className="tracking-wide">{t.tryNow || "Try Now"}</span>
                </button>
              )}
              {hasInterruptedSession && (
                <button
                  onClick={onResume}
                  className="px-3.5 py-2 rounded-full border border-emerald-500/50 text-emerald-400 font-bold text-xs flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors active:scale-95"
                >
                  <Play size={14} fill="currentColor" />
                  <span>{t.resumeSession}</span>
                </button>
              )}
            </div>

            {/* Right Actions: New Folder and Import Deck parallel to Try Now */}
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {onNewFolder && (
                <button
                  onClick={onNewFolder}
                  className="px-3.5 py-2 rounded-full bg-white text-indigo-950 hover:bg-neutral-200 font-bold text-xs sm:text-[13px] flex items-center gap-1.5 transition-transform active:scale-95 shadow-sm"
                >
                  <FolderPlus size={14} />
                  <span>{t.newFolder}</span>
                </button>
              )}
              {onImportDeck && (
                <button
                  onClick={onImportDeck}
                  className="px-3.5 py-2 rounded-full bg-white text-neutral-950 hover:bg-neutral-100 font-bold text-xs sm:text-[13px] flex items-center gap-1.5 transition-transform active:scale-95 shadow-sm"
                >
                  <Download size={14} />
                  <span>{t.importDeck}</span>
                </button>
              )}
            </div>
          </div>

          {/* Study Modes Marquee Flashcards */}
          <div className="mt-3 overflow-hidden relative w-full pt-1">
            <h2 className="text-[11px] font-bold text-indigo-200/60 uppercase tracking-widest mb-2 px-1">{t.studyModesTitle}</h2>
            <div className="relative w-full overflow-hidden py-1">
              {/* Edge fade masks for crisp entry and exit */}
              <div className="absolute left-0 top-0 bottom-0 w-6 sm:w-10 bg-gradient-to-r from-indigo-950/90 to-transparent z-20 pointer-events-none" />
              <div className="absolute right-0 top-0 bottom-0 w-6 sm:w-10 bg-gradient-to-l from-indigo-950/90 to-transparent z-20 pointer-events-none" />

              <style>{`
                @keyframes marqueeInfinite {
                  0% { transform: translate3d(0, 0, 0); }
                  100% { transform: translate3d(-100%, 0, 0); }
                }
                .animate-marquee-track {
                  display: flex;
                  animation: marqueeInfinite 42s linear infinite;
                  will-change: transform;
                }
              `}</style>

              <div className="flex w-max">
                {/* Track 1 */}
                <div className="flex gap-4 pr-4 shrink-0 animate-marquee-track">
                  {[
                    { title: t.onlineModeTitle, description: t.onlineModeDesc, icon: Timer, flipText: t.flipToRead || "Hover to flip" },
                    { title: t.ankiModeTitle, description: t.ankiModeDesc, icon: BrainCircuit, flipText: t.flipToRead || "Hover to flip" },
                    { title: t.lockInModeTitle, description: t.lockInModeDesc, icon: Lock, flipText: t.flipToRead || "Hover to flip" },
                  ].map((mode, idx) => (
                    <FlipCard
                      key={`t1-${idx}`}
                      title={mode.title}
                      description={mode.description}
                      icon={mode.icon}
                      flipText={mode.flipText}
                    />
                  ))}
                </div>

                {/* Track 2 (Exact Duplicate for Seamless Infinite Loop) */}
                <div className="flex gap-4 pr-4 shrink-0 animate-marquee-track" aria-hidden="true">
                  {[
                    { title: t.onlineModeTitle, description: t.onlineModeDesc, icon: Timer, flipText: t.flipToRead || "Hover to flip" },
                    { title: t.ankiModeTitle, description: t.ankiModeDesc, icon: BrainCircuit, flipText: t.flipToRead || "Hover to flip" },
                    { title: t.lockInModeTitle, description: t.lockInModeDesc, icon: Lock, flipText: t.flipToRead || "Hover to flip" },
                  ].map((mode, idx) => (
                    <FlipCard
                      key={`t2-${idx}`}
                      title={mode.title}
                      description={mode.description}
                      icon={mode.icon}
                      flipText={mode.flipText}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Review Queue Statistics Cards */}
      <div className={`p-4 sm:p-5 md:p-6 rounded-2xl sm:rounded-3xl border transition-colors ${
        theme === 'light' ? 'bg-white border-slate-200/90 shadow-sm text-slate-900' : 'bg-neutral-900/40 border-neutral-800/60'
      }`}>
        {/* Review Queue Statistics Cards */}
        <div className="pt-1">
          <div className="flex items-center justify-between mb-2.5">
            <span className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${
              theme === 'light' ? 'text-slate-500' : 'text-neutral-400'
            }`}>
              <span>{t.reviewQueue}</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div
              onClick={() => onOpenGlobal('today')}
              className={`p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border transition-all cursor-pointer group relative overflow-hidden ${
                dueToday > 0
                  ? (theme === 'light'
                      ? 'bg-emerald-50 border-emerald-300 hover:border-emerald-400 hover:bg-emerald-100/60 shadow-sm'
                      : 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-400 hover:bg-emerald-950/30 shadow-lg shadow-emerald-950/20')
                  : (theme === 'light'
                      ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                      : 'bg-neutral-950/60 border-neutral-800/60 hover:bg-neutral-900/60 hover:border-neutral-700')
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-emerald-500 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${dueToday > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                  {t.forToday}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl sm:text-3xl font-black tracking-tight ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>{dueToday}</span>
              </div>
            </div>

            <div
              onClick={() => onOpenGlobal('tomorrow')}
              className={`p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border space-y-1 cursor-pointer transition-all group ${
                theme === 'light'
                  ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                  : 'bg-neutral-950/60 border-neutral-800/60 hover:bg-neutral-900/60 hover:border-neutral-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-xs sm:text-sm font-extrabold uppercase tracking-wider ${theme === 'light' ? 'text-slate-700' : 'text-amber-400'}`}>{t.forTomorrow}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl sm:text-3xl font-black tracking-tight ${theme === 'light' ? 'text-slate-800' : 'text-neutral-300'}`}>{dueTomorrow}</span>
              </div>
            </div>

            <div
              onClick={() => onOpenGlobal('upcoming')}
              className={`p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border space-y-1 cursor-pointer transition-all group ${
                theme === 'light'
                  ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                  : 'bg-neutral-950/60 border-neutral-800/60 hover:bg-neutral-900/60 hover:border-neutral-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-xs sm:text-sm font-extrabold uppercase tracking-wider ${theme === 'light' ? 'text-slate-700' : 'text-indigo-400'}`}>{t.forFuture}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl sm:text-3xl font-black tracking-tight ${theme === 'light' ? 'text-slate-700' : 'text-neutral-400'}`}>{upcoming}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const TransferProgressModal = ({
  title,
  progress,
  status,
  language = 'English'
}: {
  title: string;
  progress: number;
  status: string;
  language?: Language;
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, true, () => {}, true);
  useBeforeUnload(true);
  return (
    <div className="fixed inset-0 z-[120]">
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} aria-busy="true" tabIndex={-1} className="fixed bottom-6 right-4 sm:right-6 z-50 flex items-center gap-3.5 p-4 bg-zinc-900/95 backdrop-blur-md border border-zinc-700/80 rounded-2xl shadow-2xl text-white max-w-sm w-[calc(100%-2rem)] sm:w-full">
      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
        <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-xs font-bold text-zinc-100 truncate">{title}</p>
          <span role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="text-[11px] font-bold text-emerald-400">{Math.round(progress)}%</span>
        </div>
        <p className="text-[11px] text-zinc-400 truncate">{status}</p>
        <div className="w-full h-1.5 bg-zinc-800 rounded-full mt-2 overflow-hidden">
          <div
            className="h-full bg-emerald-400 rounded-full transition-all duration-200"
            style={{ width: `${Math.max(5, Math.min(100, progress))}%` }}
          />
        </div>
      </div>
    </div>
    <span className="sr-only">{interactionCopy[language].transfer}</span>
    </div>
  );
};

// --- Unit View ---
const UnitView: React.FC<{
  unit: FolderData;
  allFolders: FolderData[];
  onBack: () => void;
  onFolderSelect: (folder: FolderData) => void;
  onRenameUnit: (id: string, name: string) => void;
  onNewFolder?: () => void;
  onRequireAuth: (action: () => void) => void;
  language: Language;
  theme?: 'dark' | 'light';
}> = ({ unit, allFolders, onBack, onFolderSelect, onRenameUnit, onNewFolder, onRequireAuth, language, theme = 'dark' }) => {
  const { user } = useAuth();
  const t = translations[language];
  const [cards, setCards] = useState<FlashcardData[]>([]);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<FlashcardData | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<FlashcardData | null>(null);
  const [movingCard, setMovingCard] = useState<FlashcardData | null>(null);
  const [studyModeCard, setStudyModeCard] = useState<FlashcardData | null>(null);
  const [renamingCard, setRenamingCard] = useState<{ id: string; name: string } | null>(null);
  const [newCardName, setNewCardName] = useState('');
  const renameAction = usePendingAction();
  const renameRef = useRef<HTMLDivElement>(null);
  useDialog(renameRef, !!renamingCard, () => setRenamingCard(null), renameAction.pending);
  useBeforeUnload(renameAction.pending);
  useEffect(() => { renameAction.setError(null); }, [renamingCard?.id]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkMoving, setIsBulkMoving] = useState(false);
  const bulkMoveOrigins = useRef<Record<string, string>>({});
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [isStudySettingsOpen, setIsStudySettingsOpen] = useState(false);
  const [studyDuration, setStudyDuration] = useState(60);
  const [studyMode, setStudyMode] = useState<'online' | 'anki' | 'lockin'>('online');
  const [studyConfig, setStudyConfig] = useState<any>(null);
  const [isStudySessionActive, setIsStudySessionActive] = useState(false);
  const isGlobal = unit.id.startsWith('global_');
  const globalFilterName = isGlobal ? unit.id.replace('global_', '') as 'today' | 'tomorrow' | 'upcoming' : null;

  const [showGlobalCreateModal, setShowGlobalCreateModal] = useState(false);

  const [filter, setFilter] = useState<'all' | 'today' | 'tomorrow' | 'upcoming'>(
    globalFilterName || 'all'
  );

  // Sync internal filter to prop changes (crucial for when user clicks dashboard stats repeatedly)
  useEffect(() => {
    if (unit.id.startsWith('global_')) {
      setFilter(unit.id.replace('global_', '') as any);
    } else {
      setFilter('all');
    }
  }, [unit.id]);
  const [isLoading, setIsLoading] = useState(true);
  const [progressInfo, setProgressInfo] = useState<{ percent: number; status: string } | null>(null);
  const [cardsError, setCardsError] = useState<string | null>(null);
  const [cardsRetry, setCardsRetry] = useState(0);
  const transferLock = useRef(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const justStartedSelectMode = useRef(false);
  useEffect(() => () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }, []);



  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [unit.id]);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    const unsubscribe = subscribeFlashcards(
      user,
      (data) => {
        setCards(data);
        setCardsError(null);
        setIsLoading(false);
      },
      unit.id,
      isGlobal,
      (error) => {
        setCardsError(error instanceof Error ? error.message : "Could not load cards. Your saved library has not been cleared.");
        setIsLoading(false);
      }
    );
    return unsubscribe;
  }, [user, unit.id, isGlobal, cardsRetry]);

  const handleDeleteCard = async () => {
    if (!confirmDelete || !user) return;
    try {
      await deleteFlashcard(user, confirmDelete.id);
      setConfirmDelete(null);
    } catch (error) {
      throw error;
    }
  };

  const handleMoveCard = async (targetUnitId: string) => {
    if (!movingCard || !user) return;
    try {
      await updateFlashcard(user, movingCard.id, {
        unitId: targetUnitId
      }, { unitId: movingCard.unitId });
      setMovingCard(null);
    } catch (error) {
      throw error;
    }
  };

  const handleRenameCard = async () => {
    if (!renamingCard || !newCardName.trim() || !user) return;
    try {
      await updateFlashcard(user, renamingCard.id, {
        cardName: newCardName.trim()
      }, { cardName: renamingCard.name });
      setRenamingCard(null);
      setNewCardName('');
    } catch (error) {
      throw error;
    }
  };

  const toggleSelect = (id: string) => {
    if (justStartedSelectMode.current) { justStartedSelectMode.current = false; return; }
    if (!isSelectMode) setIsSelectMode(true);
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
      if (next.size === 0) setIsSelectMode(false);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleLongPress = (id: string) => {
    setIsSelectMode(true);
    const next = new Set(selectedIds);
    next.add(id);
    setSelectedIds(next);
    justStartedSelectMode.current = true;

    // Vibrate if supported
    if (window.navigator.vibrate) window.navigator.vibrate(50);
  };

  const startLongPress = (id: string) => {
    justStartedSelectMode.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => handleLongPress(id), 600);
  };

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const toggleSelectAll = () => {
    if (filteredCards.length > 0 && selectedIds.size === filteredCards.length) {
      setSelectedIds(new Set());
      setIsSelectMode(false);
    } else {
      setIsSelectMode(true);
      setSelectedIds(new Set(filteredCards.map(c => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || !user) return;
    try {
      await bulkDeleteFlashcards(user, Array.from(selectedIds));
      setSelectedIds(new Set());
      setIsBulkDeleting(false);
    } catch (error) {
      throw error;
    }
  };

  const handleBulkMove = async (targetUnitId: string) => {
    if (selectedIds.size === 0 || !user) return;
    try {
      await bulkMoveFlashcards(user, Array.from(selectedIds), targetUnitId, bulkMoveOrigins.current);
      setSelectedIds(new Set());
      setIsBulkMoving(false);
    } catch (error) {
      throw error;
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async (exportCards?: FlashcardData[]) => {
    if (transferLock.current) return;
    let cardsToExport: FlashcardData[] = [];

    if (exportCards && exportCards.length > 0) {
      cardsToExport = exportCards;
    } else if (isSelectMode && selectedIds.size > 0) {
      cardsToExport = exportScope(cards, filteredCards, isGlobal, selectedIds);
    } else {
      cardsToExport = exportScope(cards, filteredCards, isGlobal);
    }

    if (cardsToExport.length === 0) {
      alert("No flashcards selected for export.");
      return;
    }

    if (!exportCards && !isSelectMode && allFolders.some(folder => folder.parentId === unit.id) && !confirm(language === 'Amharic' ? 'በዚህ አቃፊ ውስጥ ያሉ ካርዶች ብቻ ይላካሉ። ንዑስ አቃፊዎች አይካተቱም። ይቀጥሉ?' : 'Export cards in this folder only? Subfolders are not included; export each subfolder separately.')) return;
    const isSubset = cardsToExport.length < cards.length;
    let exportTitle = unit?.name || 'HaHu_Cards';
    let safeName = '';
    let fileName = '';

    if (cardsToExport.length === 1) {
      // Single card export: use custom card name saved on platform!
      const singleCard = cardsToExport[0];
      const customCardTitle = (singleCard.cardName && singleCard.cardName.trim())
        ? singleCard.cardName.trim()
        : (singleCard.frontText && singleCard.frontText.trim())
          ? singleCard.frontText.trim().slice(0, 35)
          : 'Flashcard';

      exportTitle = customCardTitle;
      safeName = customCardTitle.replace(/[^\p{L}\p{N}_\-]/gu, '_').replace(/_+/g, '_');
      fileName = `HaHu_Card_${safeName}.zip`;
    } else {
      const folderName = unit?.name || 'Deck';
      exportTitle = isSubset ? `${folderName} (Selected ${cardsToExport.length})` : folderName;
      safeName = folderName.replace(/[^\p{L}\p{N}_\-]/gu, '_').replace(/_+/g, '_');
      const suffix = isSubset ? `_Selected_${cardsToExport.length}_cards` : '';
      fileName = `HaHu_Cards_${safeName}${suffix}.zip`;
    }

    try {
      transferLock.current = true;
      setProgressInfo({ percent: 10, status: 'Packaging flashcards and images...' });
      if (!user) throw new Error('Sign in before exporting.');
      const zipBlob = await protectedOperation(user.uid, false, () => exportDeckAsZip(exportTitle, cardsToExport, (percent, status) => {
        setProgressInfo({ percent, status });
      }));

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60000);

      if (isSelectMode) {
        setSelectedIds(new Set());
        setIsSelectMode(false);
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to export deck archive.');
    } finally {
      setTimeout(() => { transferLock.current = false; setProgressInfo(null); }, 300);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || transferLock.current) return;
    transferLock.current = true;

    try {
      if (!user) throw new Error("User not authenticated");

      setProgressInfo({ percent: 5, status: 'Reading deck package...' });
      setIsLoading(true);
      await importDeckFile(user, file, unit.id, (percent, status) => setProgressInfo({ percent, status }), count => chooseImportRecovery(count, language));
    } catch (err) {
      console.error("Import failed:", err);
      alert(err instanceof Error ? err.message : "Failed to import flashcards.");
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => { transferLock.current = false; setProgressInfo(null); }, 300);
    }
  };

  const units = allFolders;
  const subFolders = useMemo(() => allFolders.filter(f => f.parentId === unit.id), [allFolders, unit.id]);

  // Calendar-based date rolling logic
  const calendarDay = useCalendarDay();
  const dateBoundaries = useMemo(() => getDateBoundaries(), [calendarDay]);

  const filteredCards = useMemo(() => {
    const { startOfTomorrow, startOfDayAfter } = dateBoundaries;

    return cards.filter(card => {
      if (filter === 'all') return true;
      const next = card.nextReview;

      // Task 1 & 2 logic
      if (filter === 'today') return !next || next < startOfTomorrow;
      if (filter === 'tomorrow') return next && next >= startOfTomorrow && next < startOfDayAfter;
      if (filter === 'upcoming') return next && next >= startOfDayAfter;
      return true;
    });
  }, [cards, filter, dateBoundaries]);

  useEffect(() => {
    setSelectedIds(previous => visibleSelection(previous, filteredCards));
  }, [filteredCards]);

  const stats = useMemo(() => {
    const { startOfTomorrow, startOfDayAfter } = dateBoundaries;

    return {
      dueToday: cards.filter(c => !c.nextReview || c.nextReview < startOfTomorrow).length,
      dueTomorrow: cards.filter(c => c.nextReview && c.nextReview >= startOfTomorrow && c.nextReview < startOfDayAfter).length
    };
  }, [cards, dateBoundaries]);

  const getReviewBadge = (nextReview?: number) => {
    const { startOfTomorrow, startOfDayAfter } = dateBoundaries;

    if (!nextReview || nextReview < startOfTomorrow) return (
      <span className="flex items-center gap-1.5 text-red-400">
        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        {t.dueToday}
      </span>
    );

    if (nextReview >= startOfTomorrow && nextReview < startOfDayAfter) return <span className="text-orange-400">Tomorrow</span>;

    const days = Math.ceil((nextReview - dateBoundaries.startOfToday) / 86400000);
    return <span className="text-zinc-500">In {days} days</span>;
  };

  const memoizedCardList = useMemo(() => {
    if (isLoading) {
      return Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="animate-pulse bg-zinc-800 h-24 rounded-xl w-full" />
      ));
    }

    if (filteredCards.length === 0) {
      return (
        <div className="text-center py-20 bento-card border-dashed">
          <BookOpen size={48} className="mx-auto text-zinc-800 mb-4" />
          <p className="text-zinc-500">No flashcards matching this filter.</p>
        </div>
      );
    }

    return filteredCards.map((card) => (
      <FlashcardListItem
        key={card.id}
        card={card}
        isSelectMode={isSelectMode}
        selectedIds={selectedIds}
        onSelect={toggleSelect}
        onLongPress={startLongPress}
        onPressCancel={clearLongPress}
        onStudyNow={(card) => {
          setStudyModeCard(card);
          setIsStudySettingsOpen(true);
        }}
        onEdit={(card) => {
          setEditingCard(card);
          setIsEditorOpen(true);
        }}
        onDelete={setConfirmDelete}
        onMove={setMovingCard}
        onRename={(card) => {
          setRenamingCard({ id: card.id, name: card.cardName });
          setNewCardName(card.cardName);
        }}
        onExportSingle={(card) => handleExport([card])}
        dateBoundaries={dateBoundaries}
        language={language}
        theme={theme}
      />
    ));
  }, [filteredCards, isSelectMode, selectedIds, isLoading, dateBoundaries, language, theme]);

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto w-full space-y-6">
      {cardsError && <div role="alert" className="text-sm text-red-400">{cardsError} <button className="underline" onClick={() => setCardsRetry(value => value + 1)}>{language === 'Amharic' ? 'እንደገና ይሞክሩ' : 'Retry'}</button></div>}
      {folderIsDeleting(allFolders, unit.id) && <p role="alert" className="text-sm text-amber-400">{language === 'Amharic' ? 'ይህ አቃፊ እየተሰረዘ ነው።' : 'This folder is being deleted. New changes are blocked. If deletion was interrupted, retry Delete to finish cleanup.'}</p>}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <button
            onClick={onBack}
            className={`inline-flex items-center gap-1.5 active:scale-95 transition-all text-xs sm:text-sm font-semibold group ${
              theme === 'light' ? 'text-slate-500 hover:text-slate-900' : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            <ChevronRight size={16} className="rotate-180 group-hover:-translate-x-1 transition-transform" />
            {t.backToFolders}
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className={`text-xl sm:text-2xl md:text-3xl font-black tracking-tight ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
              {unit.name}
            </h2>
            {!isGlobal && (
              <button
                onClick={() => onRenameUnit(unit.id, unit.name)}
                className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-lg active:scale-95 transition-all text-[11px] font-bold uppercase tracking-wider ${
                  theme === 'light'
                    ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-100'
                }`}
              >
                <Edit2 size={12} />
                {t.renameFolder}
              </button>
            )}
            <div className={`flex items-center gap-3 px-3 py-1.5 border rounded-xl text-xs font-medium ${
              theme === 'light' ? 'bg-slate-100/80 border-slate-200 text-slate-700' : 'bg-zinc-900/50 border-zinc-800 text-zinc-400'
            }`}>
              <span><strong className="text-red-500">{stats.dueToday}</strong> {t.dueTodayCount}</span>
              <div className={`w-px h-3 ${theme === 'light' ? 'bg-slate-300' : 'bg-zinc-800'}`} />
              <span><strong className="text-orange-500">{stats.dueTomorrow}</strong> {t.dueTomorrowCount}</span>
            </div>
          </div>
          <p className={`text-xs sm:text-sm font-medium ${theme === 'light' ? 'text-slate-500' : 'text-zinc-500'}`}>
            {cards.length} {t.flashcardsInView}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {cards.length > 0 && (
            <button
              onClick={() => {
                if (isSelectMode) {
                  setSelectedIds(new Set());
                  setIsSelectMode(false);
                } else {
                  setIsSelectMode(true);
                }
              }}
              className={`px-4 py-3 rounded-xl border transition-all active:scale-95 text-sm font-medium flex items-center gap-2 ${
                isSelectMode
                  ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500 font-bold'
                  : (theme === 'light'
                      ? 'bg-white border-slate-200 text-slate-700 hover:text-slate-900 hover:border-slate-300 shadow-sm'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700')
              }`}
            >
              <Layers size={18} />
              {isSelectMode ? t.cancel : t.select}
            </button>
          )}
          {isSelectMode && cards.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className={`px-4 py-3 rounded-xl border active:scale-95 transition-all text-sm font-medium flex items-center gap-2 ${
                theme === 'light'
                  ? 'bg-white border-slate-200 text-slate-700 hover:text-slate-900 hover:border-slate-300 shadow-sm'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
              }`}
            >
              {filteredCards.length > 0 && selectedIds.size === filteredCards.length ? <Check size={18} className="text-emerald-500" /> : <Plus size={18} className="rotate-45" />}
              {filteredCards.length > 0 && selectedIds.size === filteredCards.length ? t.deselectAll : t.selectAll}
            </button>
          )}
          {!isSelectMode && (
            <>
              {cards.length > 0 && (
                <button
                  onClick={() => handleExport()}
                  title={t.exportDeck}
                  className={`px-4 py-3 rounded-xl border active:scale-95 transition-all flex items-center gap-2 text-sm font-medium ${
                    theme === 'light'
                      ? 'bg-white border-slate-200 text-slate-700 hover:text-slate-900 hover:border-slate-300 shadow-sm'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                  }`}
                >
                  <Download size={18} />
                  <span className="hidden sm:inline">{t.exportDeck}</span>
                </button>
              )}

              {!isGlobal && (
                <>
                  <input
                    type="file"
                    accept=".zip,.json,.zencards"
                    ref={fileInputRef}
                    onChange={handleImport}
                    className="hidden"
                  />
                  <button
                    onClick={() => onRequireAuth(() => fileInputRef.current?.click())}
                    title={t.import}
                    className={`px-4 py-3 rounded-xl border active:scale-95 transition-all flex items-center gap-2 text-sm font-medium ${
                      theme === 'light'
                        ? 'bg-white border-slate-200 text-slate-700 hover:text-slate-900 hover:border-slate-300 shadow-sm'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                    }`}
                  >
                    <Upload size={18} />
                    <span className="hidden sm:inline">{t.import}</span>
                  </button>
                </>
              )}
            </>
          )}
          {!isGlobal && (
            <button
              onClick={() => onRequireAuth(() => { setEditingCard(undefined); setIsEditorOpen(true); })}
              className={`px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95 shadow-md ${
                theme === 'light'
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-zinc-100 text-zinc-950 hover:bg-zinc-200 shadow-white/5'
              }`}
            >
              <Plus size={20} />
              {t.create}
            </button>
          )}
          {isGlobal && (
            <button
              onClick={() => onRequireAuth(() => setShowGlobalCreateModal(true))}
              className={`px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95 shadow-md ${
                theme === 'light'
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-zinc-100 text-zinc-950 hover:bg-zinc-200 shadow-white/5'
              }`}
              title="Create a card"
            >
              <Plus size={20} />
              {t.create}
            </button>
          )}
        </div>
      </div>

      {!isGlobal && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
          {(['all', 'today', 'tomorrow', 'upcoming'] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setSelectedIds(new Set()); setIsSelectMode(false); }}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all active:scale-95 whitespace-nowrap border ${
                filter === f
                  ? (theme === 'light'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                      : 'bg-zinc-100 text-zinc-950 border-zinc-100 shadow-lg shadow-white/5')
                  : (theme === 'light'
                      ? 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 shadow-sm'
                      : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700')
              }`}
            >
              {f === 'all' ? t.allCards :
               f === 'today' ? t.dueToday :
               f === 'tomorrow' ? t.dueTomorrow :
               t.upcoming}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-6 pb-24">
        {subFolders.length > 0 && !isGlobal && (
          <div>
            <h3 className={`text-xs font-bold uppercase tracking-widest mb-3 ${theme === 'light' ? 'text-slate-500' : 'text-zinc-500'}`}>
              Sub-folders
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {subFolders.map(folder => (
                <button
                  key={folder.id}
                  onClick={() => onFolderSelect(folder)}
                  className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all active:scale-95 group shadow-sm ${
                    theme === 'light'
                      ? 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md'
                      : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/80'
                  }`}
                >
                  <div className={`p-2 rounded-lg shrink-0 ${theme === 'light' ? 'bg-indigo-50 text-indigo-600' : 'bg-indigo-500/20 text-indigo-400'}`}>
                    <Folder size={20} className="group-hover:scale-110 transition-transform" />
                  </div>
                  <span className={`font-semibold truncate text-sm ${theme === 'light' ? 'text-slate-800' : 'text-zinc-200'}`}>
                    {folder.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          {subFolders.length > 0 && !isGlobal && (
            <h3 className={`text-xs font-bold uppercase tracking-widest mb-3 ${theme === 'light' ? 'text-slate-500' : 'text-zinc-500'}`}>
              Flashcards
            </h3>
          )}
          <div className="space-y-3">
            {memoizedCardList}
          </div>
        </div>
      </div>

      {/* Bulk Action Bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 sm:gap-4 px-3 sm:px-6 py-4 max-w-[calc(100%-2rem)] overflow-x-auto bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/50"
          >
            <div className="flex items-center gap-3 pr-4 border-r border-zinc-800">
              <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-bold text-white">
                {selectedIds.size}
              </div>
              <span className="text-sm font-medium text-zinc-400">{t.selected || 'Selected'}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExport()}
                className="flex items-center gap-2 px-4 py-2 text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 active:scale-95 rounded-xl transition-all text-sm font-medium"
                title="Export only the selected flashcards"
              >
                <Download size={18} />
                {t.exportSelected || 'Export'} ({selectedIds.size})
              </button>
              <button
                onClick={() => { bulkMoveOrigins.current = Object.fromEntries(cards.filter(card => selectedIds.has(card.id)).map(card => [card.id, card.unitId])); setIsBulkMoving(true); }}
                className="flex items-center gap-2 px-4 py-2 text-zinc-300 hover:text-white hover:bg-zinc-800 active:scale-95 rounded-xl transition-all text-sm font-medium"
              >
                <FolderInput size={18} />
                {t.move}
              </button>
              <button
                onClick={() => setIsBulkDeleting(true)}
                className="flex items-center gap-2 px-4 py-2 text-red-400 hover:bg-red-500/10 active:scale-95 rounded-xl transition-all text-sm font-medium"
              >
                <Trash2 size={18} />
                {t.delete}
              </button>
              <button
                onClick={() => {
                  setSelectedIds(new Set());
                  setIsSelectMode(false);
                }}
                className="flex items-center gap-2 px-4 py-2 text-zinc-100 bg-zinc-800 hover:bg-zinc-700 active:scale-95 rounded-xl transition-all text-sm font-bold"
              >
                {t.done}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Delete Confirmation */}
      <ConfirmModal
        isOpen={isBulkDeleting}
        title={language === 'English' ? `${selectedIds.size} ${selectedIds.size === 1 ? 'card' : 'cards'}` : `${selectedIds.size} ${t.flashcardsInView}`}
        onConfirm={handleBulkDelete}
        onCancel={() => setIsBulkDeleting(false)}
        language={language}
        theme={theme}
      />

      {/* Bulk Move Modal */}
      <MoveModal
        isOpen={isBulkMoving}
        units={units}
        currentUnitId={unit.id}
        onMove={handleBulkMove}
        onClose={() => setIsBulkMoving(false)}
        language={language}
        theme={theme}
      />

      {isEditorOpen && (
        <FlashcardEditor
          unitId={unit.id}
          editingCard={editingCard}
          onClose={() => setIsEditorOpen(false)}
          onSave={() => setIsEditorOpen(false)}
          language={language}
          theme={theme}
        />
      )}

      {/* Global View Card Creation Warning Pop Up Modal */}
      <AnimatePresence>
        {showGlobalCreateModal && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className={`max-w-md w-full p-6 rounded-3xl border shadow-2xl space-y-5 ${
                theme === 'light'
                  ? 'bg-white border-slate-200 text-slate-900 shadow-slate-300/50'
                  : 'bg-neutral-900 border-neutral-800 text-white shadow-black/80'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                    <FolderPlus size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight">Create a Folder First</h3>
                    <p className={`text-xs ${theme === 'light' ? 'text-slate-500' : 'text-neutral-400'}`}>
                      {unit.name} View
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowGlobalCreateModal(false)}
                  className={`p-2 rounded-xl transition-colors ${
                    theme === 'light' ? 'hover:bg-slate-100 text-slate-400' : 'hover:bg-neutral-800 text-neutral-400'
                  }`}
                >
                  <X size={20} />
                </button>
              </div>

              <div className={`p-4 rounded-2xl border text-xs leading-relaxed ${
                theme === 'light'
                  ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-200'
              }`}>
                Cards cannot be created directly inside filter views ({unit.name}). Please create a folder first, then create cards inside your folder.
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => setShowGlobalCreateModal(false)}
                  className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                    theme === 'light'
                      ? 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                      : 'border-neutral-800 bg-neutral-800/80 text-neutral-300 hover:bg-neutral-700'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowGlobalCreateModal(false);
                    onBack();
                    if (onNewFolder) {
                      onNewFolder();
                    }
                  }}
                  className="flex-1 py-3 px-4 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30"
                >
                  <FolderPlus size={16} />
                  <span>Create Folder</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!confirmDelete}
        title={confirmDelete?.cardName || t.thisFlashcard || "Flashcard"}
        onConfirm={handleDeleteCard}
        onCancel={() => setConfirmDelete(null)}
        language={language}
        theme={theme}
      />

      {/* Move Modal */}
      <MoveModal
        isOpen={!!movingCard}
        units={units}
        currentUnitId={unit.id}
        onMove={handleMoveCard}
        onClose={() => setMovingCard(null)}
        language={language}
        theme={theme}
      />

      {/* Study Settings Modal */}
      <StudySettingsModal
        isOpen={isStudySettingsOpen}
        onClose={() => setIsStudySettingsOpen(false)}
        onStart={(duration, mode, config) => {
          setStudyDuration(duration);
          setStudyMode(mode);
          setStudyConfig(config);
          setIsStudySettingsOpen(false);
          setIsStudySessionActive(true);
        }}
        language={language}
        theme={theme}
      />

      {/* Study Session Overlay */}
      {isStudySessionActive && studyModeCard && (
        <StudySession key={`${user?.uid}:${studyModeCard.id}:${studyMode}`}
          card={studyModeCard}
          duration={studyDuration}
          mode={studyMode}
          config={studyConfig}
          language={language}
          onQuit={() => {
            setIsStudySessionActive(false);
            setStudyModeCard(null);
          }}
          onEdit={(card) => {
            setIsStudySessionActive(false);
            setStudyModeCard(null);
            setEditingCard(card);
            setIsEditorOpen(true);
          }}
        />
      )}

      {/* Rename Flashcard Modal */}
      <AnimatePresence>
        {renamingCard && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div ref={renameRef} role="dialog" aria-modal="true" aria-label={t.cardNameTitle} tabIndex={-1}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`p-6 max-w-sm w-full space-y-6 rounded-2xl border shadow-xl ${
                theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-zinc-900 border-zinc-800 text-white'
              }`}
            >
              <div className="flex justify-between items-center">
                <h3 className={`text-lg font-semibold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                  {language === 'Amharic' ? 'የካርድ ስም ቀይር' : 'Rename card'}
                </h3>
                <button disabled={renameAction.pending} aria-label={interactionCopy[language].close} onClick={() => setRenamingCard(null)} className={theme === 'light' ? 'text-slate-400 hover:text-slate-700' : 'text-zinc-500 hover:text-zinc-100'}>
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-2">
                <label className={`text-xs font-bold uppercase tracking-wider ${theme === 'light' ? 'text-slate-500' : 'text-zinc-500'}`}>
                  {t.cardNameTitle}
                </label>
                <input
                  data-initial-focus
                  disabled={renameAction.pending}
                  maxLength={200}
                  aria-label={t.cardNameTitle}
                  type="text"
                  value={newCardName}
                  onChange={(e) => setNewCardName(e.target.value)}
                  className={`w-full border rounded-xl px-4 py-3 text-sm outline-none transition-colors ${
                    theme === 'light'
                      ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-indigo-500'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-100 focus:border-zinc-500'
                  }`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); renameAction.run(handleRenameCard); }
                  }}
                />
              </div>

              {renameAction.error && <p role="alert" className="text-sm text-red-500">{renameAction.error}</p>}
              <button
                onClick={() => renameAction.run(handleRenameCard)}
                disabled={renameAction.pending || !newCardName.trim()}
                className={`w-full py-3 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  theme === 'light'
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-white text-zinc-950 hover:bg-zinc-200'
                }`}
              >
                {renameAction.pending ? interactionCopy[language].saving : t.saveChanges}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {progressInfo && (
          <TransferProgressModal language={language}
            title="Processing Deck"
            progress={progressInfo.percent}
            status={progressInfo.status}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Pages ---

const LoginPage = () => {
  const { login, loginAsGuest, user } = useAuth();
  const navigate = useNavigate();
  const [authError, setAuthError] = useState<string | null>(null);
  const [signInBusy, setSignInBusy] = useState(false);
  const [language, setLanguage] = useState<Language>(() => {
    const saved = optionalStorage.getItem('hahu_language');
    if (saved && (saved === 'English' || saved === 'Amharic')) {
      return saved as Language;
    }
    return 'English';
  });

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = optionalStorage.getItem('hahu_theme');
    if (saved && (saved === 'dark' || saved === 'light')) {
      return saved as 'dark' | 'light';
    }
    return 'dark';
  });

  useEffect(() => {
    optionalStorage.setItem('hahu_language', language);
  }, [language]);

  useEffect(() => {
    if (user) navigate('/dashboard');
  }, [user, navigate]);

  const t = translations[language];

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-6 transition-colors ${
      theme === 'light' ? 'bg-slate-100 text-slate-900' : 'bg-neutral-950 text-neutral-100'
    }`}>
      {/* Top Language & Theme Selector */}
      <div className="w-full max-w-md flex items-center justify-between mb-4 px-2">
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as Language)}
          className={`text-xs font-bold rounded-lg px-3 py-1.5 border outline-none cursor-pointer ${
            theme === 'light'
              ? 'bg-white border-slate-200 text-slate-800'
              : 'bg-neutral-900 border-neutral-800 text-neutral-200'
          }`}
        >
          <option value="English">English</option>
          <option value="Amharic">Amharic (አማርኛ)</option>
        </select>

        <button
          onClick={() => {
            const nextTheme = theme === 'dark' ? 'light' : 'dark';
            setTheme(nextTheme);
            optionalStorage.setItem('hahu_theme', nextTheme);
          }}
          className={`p-2 rounded-lg border text-xs font-bold transition-all ${
            theme === 'light'
              ? 'bg-white border-slate-200 text-slate-800'
              : 'bg-neutral-900 border-neutral-800 text-neutral-200'
          }`}
        >
          {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className={`p-8 md:p-10 text-center space-y-8 rounded-3xl border shadow-2xl ${
          theme === 'light' ? 'bg-white border-slate-200' : 'bg-neutral-900 border-neutral-800/30'
        }`}>
          <div className="flex justify-center">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg ${
              theme === 'light' ? 'bg-indigo-600 text-white' : 'bg-neutral-50 text-neutral-950'
            }`}>
              <GraduationCap className="w-10 h-10" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className={`text-2xl font-extrabold tracking-tight uppercase ${
              theme === 'light' ? 'text-slate-900' : 'text-neutral-50'
            }`}>
              {t.consistencyQuote}
            </h1>
            <p className={`text-[10px] font-bold uppercase tracking-widest ${
              theme === 'light' ? 'text-slate-500' : 'text-neutral-500'
            }`}>
              {t.masterCraft}
            </p>
          </div>

          <div className="space-y-3 flex flex-col items-center">
            {authError && (
              <div className="w-full p-3 mb-2 bg-red-500/10 border border-red-500/50 text-red-500 text-xs font-bold rounded-xl flex items-center justify-center text-center">
                {authError}
              </div>
            )}


              <button
                disabled={signInBusy}
                aria-busy={signInBusy}
                onClick={async () => {
                  if (signInBusy) return;
                  setSignInBusy(true);
                  try {
                    setAuthError(null);
                    await login(); // Same Firebase popup/link flow used in the profile panel.
                  } catch (error: any) {
                    setAuthError(error?.message || "Sign-in was blocked or failed. Please try again.");
                  } finally { setSignInBusy(false); }
                }}
                className={`w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-extrabold text-sm uppercase tracking-widest active:scale-95 transition-all duration-200 shadow-md ${
                  theme === 'light'
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-neutral-50 text-neutral-950 hover:bg-neutral-200'
                }`}
              >
                <UserIcon className="w-5 h-5" />
                {t.signInWithGoogle}
              </button>

            <div className="w-full relative py-3 flex items-center justify-center">
              <div className={`absolute border-t w-full ${theme === 'light' ? 'border-slate-200' : 'border-neutral-800'}`}></div>
              <span className={`relative px-3 text-xs font-bold uppercase ${theme === 'light' ? 'bg-white text-slate-400' : 'bg-neutral-900 text-neutral-500'}`}>or</span>
            </div>

            <button
              disabled={signInBusy}
              onClick={async () => {
                if (signInBusy) return;
                setSignInBusy(true);
                try {
                  setAuthError(null);
                  await loginAsGuest();
                } catch (error: any) {
                  setAuthError(error?.message || "Guest sign-in failed. Please try again.");
                } finally { setSignInBusy(false); }
              }}
              className={`w-full flex items-center justify-center gap-3 border py-3 rounded-xl font-extrabold text-sm uppercase tracking-widest active:scale-95 transition-all duration-200 ${
                theme === 'light'
                  ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-50 hover:bg-neutral-800'
              }`}
            >
              {t.continueAsGuest}
            </button>
          </div>

          <p className={`text-[10px] font-bold uppercase tracking-tighter ${
            theme === 'light' ? 'text-slate-400' : 'text-neutral-600'
          }`}>
            {t.termsOfService}
          </p>
        </div>
      </motion.div>
    </div>
  );
};

const AuthRequiredModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSignIn: () => void;
  theme: 'light' | 'dark';
  language: Language;
}> = ({ isOpen, onClose, onSignIn, theme, language }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/60">
      <div className={`w-full max-w-sm rounded-2xl p-6 shadow-2xl border ${theme === 'light' ? 'bg-white border-slate-200' : 'bg-neutral-900 border-neutral-800'}`}>
        <div className="text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center bg-indigo-500/20 text-indigo-400">
            <Lock size={24} />
          </div>
          <h3 className={`text-xl font-black uppercase tracking-tight ${theme === 'light' ? 'text-slate-800' : 'text-neutral-100'}`}>
            {language === 'Amharic' ? 'መግባት ያስፈልጋል' : 'Sign In Required'}
          </h3>
          <p className={`text-sm ${theme === 'light' ? 'text-slate-600' : 'text-neutral-400'}`}>
            {language === 'Amharic' ? 'ይዘት ለመፍጠር ወይም ለማስገባት መግባት አለብዎት።' : 'You must be signed in to create content or import decks.'}
          </p>
          <div className="flex gap-3 pt-4">
            <button onClick={onClose} className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-colors ${theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100' : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:bg-neutral-800'}`}>
              {language === 'Amharic' ? 'ሰርዝ' : 'Cancel'}
            </button>
            <button onClick={() => { onClose(); onSignIn(); }} className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-indigo-900/20 transition-transform active:scale-95">
              {language === 'Amharic' ? 'ግባ' : 'Sign In'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const AccountDashboard = () => {
  const { user } = useAuth();
  return <DashboardLayout key={user?.uid} />;
};

const DashboardLayout = () => {
  const { user, login, logout } = useAuth();
  const linkAction = usePendingAction();
  const navigate = useNavigate();
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [allCards, setAllCards] = useState<FlashcardData[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [isProfileDrawerOpen, setIsProfileDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [language, setLanguage] = useState<Language>(() => {
    const saved = optionalStorage.getItem('hahu_language');
    if (saved && (saved === 'English' || saved === 'Amharic')) {
      return saved as Language;
    }
    return 'English';
  });
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = optionalStorage.getItem('hahu_theme');
    if (saved && (saved === 'dark' || saved === 'light')) {
      return saved as 'dark' | 'light';
    }
    return 'dark';
  });
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [isRenaming, setIsRenaming] = useState<{ id: string; name: string } | null>(null);
  const [isAdding, setIsAdding] = useState<{ parentId: string | null; level: number } | null>(null);
  const [newName, setNewName] = useState('');
  const folderAction = usePendingAction();
  const folderDialogRef = useRef<HTMLDivElement>(null);
  const closeFolderDialog = () => { setIsAdding(null); setIsRenaming(null); setNewName(''); };
  useDialog(folderDialogRef, !!(isAdding || isRenaming), closeFolderDialog, folderAction.pending);
  useBeforeUnload(folderAction.pending);
  useEffect(() => { folderAction.setError(null); }, [isAdding, isRenaming]);
  const globalTransferLock = useRef(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [studyModeCard, setStudyModeCard] = useState<FlashcardData | null>(null);
  const globalFileInputRef = useRef<HTMLInputElement>(null);
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [globalProgressInfo, setGlobalProgressInfo] = useState<{ percent: number; status: string } | null>(null);

  const [showAuthRequired, setShowAuthRequired] = useState(false);

  const handleRequireAuth = (action: () => void) => {
    if (!user) {
      setShowAuthRequired(true);
    } else {
      action();
    }
  };
  const [isStudySettingsOpen, setIsStudySettingsOpen] = useState(false);
  const [dashboardEditingCard, setDashboardEditingCard] = useState<FlashcardData | null>(null);
  const [sessionParams, setSessionParams] = useState<{ duration: number; mode: 'online' | 'anki' | 'lockin'; config?: any; resume?: boolean } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const t = translations[language] || translations.English;

  useEffect(() => {
    optionalStorage.setItem('hahu_language', language);
  }, [language]);

  useEffect(() => {
    optionalStorage.setItem('hahu_theme', theme);
  }, [theme]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch((err) => console.error(err));
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Global Cards Listener for Focus Center
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeFlashcards(
      user,
      (data) => {
        setAllCards(data);
      },
      null,
      true,
      (error) => {
        setDataError(error?.message || "Could not load cards.");
      }
    );
    return unsubscribe;
  }, [user]);

  const searchMatchingFolders = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return folders.filter(f => f.name.toLowerCase().includes(q));
  }, [folders, searchQuery]);

  const searchMatchingCards = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return allCards.filter(c =>
      c.cardName?.toLowerCase().includes(q) ||
      c.frontText?.toLowerCase().includes(q) ||
      c.backText?.toLowerCase().includes(q)
    );
  }, [allCards, searchQuery]);

  const calendarDay = useCalendarDay();
  const dashboardStats = useMemo(() => {
    const { startOfTomorrow, startOfDayAfter } = getDateBoundaries();

    return {
      dueToday: allCards.filter(c => !c.nextReview || c.nextReview < startOfTomorrow).length,
      dueTomorrow: allCards.filter(c => c.nextReview && c.nextReview >= startOfTomorrow && c.nextReview < startOfDayAfter).length,
      upcoming: allCards.filter(c => c.nextReview && c.nextReview >= startOfDayAfter).length
    };
  }, [allCards, calendarDay]);

  const handleResumeSession = () => {
    const key = `interrupted_lockin_session_${user?.uid}`;
    try {
      const data = JSON.parse(optionalStorage.getItem(key) || 'null');
      const card = allCards.find(c => c.id === data?.cardId);
      if (card && data.mode === 'lockin' && Number.isFinite(data.duration) && data.duration > 0 && data.duration <= 86400 && validSessionConfig(data.config)) {
        setStudyModeCard(card);
        setSessionParams({ duration: data.duration, mode: 'lockin', config: data.config, resume: true });
      } else optionalStorage.removeItem(key);
    } catch { optionalStorage.removeItem(key); }
  };

  const selectedUnit = useMemo(() => {
    if (selectedUnitId === 'global_today') return { id: 'global_today', name: translations[language].dueToday, level: 3, parentId: null } as FolderData;
    if (selectedUnitId === 'global_tomorrow') return { id: 'global_tomorrow', name: translations[language].dueTomorrow, level: 3, parentId: null } as FolderData;
    if (selectedUnitId === 'global_upcoming') return { id: 'global_upcoming', name: 'Upcoming', level: 3, parentId: null } as FolderData;
    return selectedUnitId ? folders.find(f => f.id === selectedUnitId) || null : null;
  }, [folders, selectedUnitId, language]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [selectedUnitId]);


  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeFolders(
      user,
      async (data) => {
        setFolders(data);

        // Sample decks are opt-in via Try sample, never inferred from an empty library.

      },
      (error) => {
        setDataError(error instanceof Error ? error.message : "Could not load folders.");
      }
    );
    return unsubscribe;
  }, [user]);

  const handleTryNow = async () => {
    if (!user || isGlobalLoading) return;
    setIsGlobalLoading(true);
    try {
      const sample = folders.find(isSampleFolder);
      const id = sample?.id || await seedSampleData(user);
      setSelectedUnitId(id);
    } catch (error) { setDataError(error instanceof Error ? error.message : 'Could not open sample deck.'); }
    finally { setIsGlobalLoading(false); setGlobalProgressInfo(null); }
  };

  const handleAddFolder = async () => {
    if (!user || !newName.trim() || !isAdding) return;
    try {
      await createFolder(user, {
        name: newName.trim(),
        parentId: isAdding.parentId,
        level: isAdding.level
      });
      setIsAdding(null);
      setNewName('');
    } catch (error) {
      throw error;
    }
  };

  const handleGlobalImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || globalTransferLock.current) return;
    globalTransferLock.current = true;

    try {
      if (!user) throw new Error("User not authenticated");

      setIsGlobalLoading(true);
      setGlobalProgressInfo({ percent: 5, status: 'Unpacking deck archive...' });

      const createdFolderId = await importDeckFile(user, file, undefined, (percent, status) => setGlobalProgressInfo({ percent, status }), count => chooseImportRecovery(count, language));
      setSelectedUnitId(createdFolderId);
    } catch (err) {
      console.error("Import failed:", err);
      alert(err instanceof Error ? err.message : "Failed to import deck archive.");
    } finally {
      setIsGlobalLoading(false);
      if (globalFileInputRef.current) globalFileInputRef.current.value = '';
      setTimeout(() => { globalTransferLock.current = false; setGlobalProgressInfo(null); }, 300);
    }
  };

  const handleRenameFolder = async () => {
    if (!isRenaming || !newName.trim() || !user) return;
    const path = `folders/${isRenaming.id}`;
    try {
      await updateFolder(user, isRenaming.id, newName.trim(), isRenaming.name);
      setIsRenaming(null);
      setNewName('');
    } catch (error) {
      throw error;
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (!user) return;
    const path = `folders/${id}`;
    try {
      await deleteFolder(user, id);
      setConfirmDelete(null);
      if (selectedUnitId === id) setSelectedUnitId(null);
    } catch (error) {
      throw error;
    }
  };

  const recoveryAction = usePendingAction();
  const orphanCount = user && isGuestSession(user) ? orphanReferences({ folders, cards: allCards }).size : 0;
  const rootFolders = useMemo(() => folders.filter(f => f.level === 1), [folders]);

  return (
    <div className={`min-h-screen overflow-x-hidden flex flex-col transition-colors duration-200 ${
      theme === 'light' ? 'bg-slate-100 text-slate-900' : 'bg-zinc-950 text-zinc-100'
    }`}>
      {orphanCount > 0 && <div role="alert" className="mx-4 mt-4 rounded-xl border border-amber-500/30 p-3 text-sm text-amber-400">
        {language === 'Amharic' ? 'የጎደሉ አቃፊዎች ያሉባቸው እቃዎች ተገኝተዋል።' : `${orphanCount} items have missing folders. Your content is preserved.`}
        <button disabled={recoveryAction.pending} className="ml-3 underline" onClick={() => {
          if (user && confirm('Recover missing-folder items? Orphan folders become top-level folders; orphan cards go into Recovered cards. A local backup is kept. No cards are deleted.')) void recoveryAction.run(() => recoverLocalOrphans(user));
        }}>{language === 'Amharic' ? 'መልስ' : 'Recover items'}</button>
        {recoveryAction.error && <p>{recoveryAction.error}</p>}
      </div>}
      {/* Right Slide-Over Profile & Settings Panel */}
      <AnimatePresence>
        {isProfileDrawerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsProfileDrawerOpen(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            />

            {/* Slide-over Drawer from Right */}
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed top-0 right-0 bottom-0 w-80 sm:w-96 bg-zinc-950/95 border-l border-zinc-800/80 p-6 flex flex-col z-50 shadow-2xl backdrop-blur-2xl overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80 mb-6">
                <div className="flex items-center gap-2">
                  <Settings size={18} className="text-indigo-400" />
                  <h2 className="text-sm font-extrabold text-white tracking-wider uppercase">
                    {translations[language].profile}
                  </h2>
                </div>
                <button
                  onClick={() => setIsProfileDrawerOpen(false)}
                  className="p-2 text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-zinc-800/80"
                >
                  <X size={20} />
                </button>
              </div>

              {/* User Profile Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-950/50 via-purple-950/30 to-zinc-900 border border-indigo-500/25 flex items-center gap-4 mb-6 shadow-inner">
                <ProfileAvatar user={user} className="w-14 h-14 border-2 border-indigo-400/60 shadow-md shrink-0" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-black text-white truncate">{user?.displayName || 'Student'}</h3>
                  <p className="text-xs text-zinc-400 truncate mt-0.5">{user?.email || 'Guest Account'}</p>
                  <span className="inline-block mt-1.5 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {translations[language].student}
                  </span>
                </div>
              </div>

              {user?.isAnonymous && <div className="mb-6">
                <button disabled={linkAction.pending} onClick={() => void linkAction.run(() => login())} className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
                  {linkAction.pending ? (language === 'Amharic' ? 'በማገናኘት ላይ…' : 'Connecting…') : (language === 'Amharic' ? 'የGoogle መለያ ያገናኙ' : 'Link Google account')}
                </button>
                {linkAction.error && <p role="alert" className="mt-2 text-sm text-red-400">{linkAction.error}</p>}
              </div>}
              {/* Settings Controls */}
              <div className="space-y-6 flex-1">
                {/* Fullscreen Mode */}
                <div className="space-y-2">
                  <label className="text-xs font-extrabold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                    <Sparkles size={15} className="text-indigo-400" />
                    {translations[language].displayMode}
                  </label>
                  <button
                    onClick={toggleFullscreen}
                    className="w-full flex items-center justify-between p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-200 hover:text-white transition-all text-sm font-semibold active:scale-95"
                  >
                    <span className="flex items-center gap-2.5">
                      {isFullscreen ? <Minimize size={18} className="text-indigo-400" /> : <Maximize size={18} className="text-indigo-400" />}
                      {isFullscreen ? translations[language].exitFullscreen : translations[language].fullscreen}
                    </span>
                    <span className="text-[10px] font-extrabold text-indigo-400/80 uppercase tracking-widest px-2 py-1 rounded bg-indigo-500/10 border border-indigo-500/20">
                      {isFullscreen ? "ON" : "OFF"}
                    </span>
                  </button>
                </div>

                {/* Language Settings */}
                <div className="space-y-2">
                  <label className="text-xs font-extrabold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                    <Globe size={15} className="text-indigo-400" />
                    {translations[language].language}
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as Language)}
                    className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 text-sm font-medium rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none p-3.5 transition-all cursor-pointer appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a1a1aa'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundPosition: 'right 0.85rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.2em 1.2em', paddingRight: '2.5rem' }}
                  >
                    <option value="English">English</option>
                    <option value="Amharic">Amharic (አማርኛ)</option>
                  </select>
                </div>

                {/* Theme Settings: Light vs Dark */}
                <div className="space-y-2">
                  <label className="text-xs font-extrabold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                    <Sun size={15} className="text-indigo-400" />
                    {translations[language].theme}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setTheme('dark')}
                      className={`flex items-center justify-center gap-2.5 p-3 rounded-xl border transition-all text-xs font-bold ${
                        theme === 'dark'
                          ? 'border-indigo-400 bg-indigo-500/15 text-white shadow-md ring-1 ring-indigo-400/50'
                          : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      <Moon size={16} className="text-indigo-400" />
                      {translations[language].darkMode}
                    </button>

                    <button
                      onClick={() => setTheme('light')}
                      className={`flex items-center justify-center gap-2.5 p-3 rounded-xl border transition-all text-xs font-bold ${
                        theme === 'light'
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-900 shadow-md ring-1 ring-indigo-500/50'
                          : 'border-slate-200 bg-slate-100 text-slate-600 hover:border-slate-300 hover:text-slate-900'
                      }`}
                    >
                      <Sun size={16} className="text-amber-500" />
                      {translations[language].lightMode}
                    </button>
                  </div>
                </div>


              </div>

              {/* Sign Out Button */}
              <div className="pt-6 border-t border-zinc-800/80 mt-auto">
                <button
                  onClick={logout}
                  className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:text-red-300 font-extrabold text-sm uppercase tracking-wider transition-all active:scale-95 shadow-lg shadow-red-950/20"
                >
                  <LogOut size={18} />
                  <span>{translations[language].signOut}</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Hidden Global Input File for Deck Imports */}
      <input
        type="file"
        accept=".zip,.json,.zencards"
        ref={globalFileInputRef}
        onChange={handleGlobalImport}
        className="hidden"
      />

      {reviewOpen && user && <ReviewHub user={user} onClose={() => setReviewOpen(false)} language={language} />}
      {user && <div className="w-full max-w-6xl mx-auto px-4 md:px-8 mb-3 flex justify-end"><button onClick={() => setReviewOpen(true)} className="rounded-xl border border-neutral-700 bg-neutral-900 text-white px-4 py-2 text-sm font-bold">{language === 'Amharic' ? 'ክለሳ ጀምር / ቀጥል' : 'Start / resume reviews'}</button></div>}

      {/* Top Main Navigation Header Bar */}
      <header className="w-full max-w-6xl mx-auto px-4 md:px-8 sticky top-4 z-30 mb-2">
        <div className={`h-16 flex items-center justify-between px-6 backdrop-blur-xl border rounded-full transition-colors shadow-xl ${
          theme === 'light'
            ? 'bg-white/90 border-slate-200/90 shadow-slate-200/50 text-slate-900'
            : 'bg-neutral-950/85 border-neutral-800/80 shadow-2xl shadow-black/60 text-white'
        }`}>
          {/* Left Brand & Search */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => { setSelectedUnitId(null); setSearchQuery(''); }}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-md ${
                theme === 'light' ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-950'
              }`}>
                <GraduationCap className="w-5 h-5" />
              </div>
              <span className={`font-black text-lg tracking-tight hidden sm:inline ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                HaHu Cards
              </span>
            </div>

            {/* Functional Search Input */}
            <div className={`flex items-center gap-3 border px-3.5 py-1.5 rounded-full w-48 sm:w-64 lg:w-80 ml-2 transition-colors ${
              theme === 'light'
                ? 'bg-slate-100 border-slate-200 text-slate-900'
                : 'bg-neutral-900/60 border-neutral-800/40 text-neutral-200'
            }`}>
              <Search size={15} className={theme === 'light' ? 'text-slate-400 shrink-0' : 'text-neutral-500 shrink-0'} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={translations[language].searchPlaceholder}
                className={`bg-transparent border-none outline-none text-xs font-medium w-full ${
                  theme === 'light' ? 'text-slate-900 placeholder:text-slate-400' : 'text-neutral-200 placeholder:text-neutral-500'
                }`}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* User profile */}
          <div className="flex items-center gap-2.5">


            <button
              onClick={() => setIsProfileDrawerOpen(true)}
              className="relative w-11 h-11 rounded-full border-2 border-indigo-400/80 shadow-[0_0_15px_rgba(99,102,241,0.35)] flex items-center justify-center bg-indigo-950/80 hover:border-indigo-300 hover:scale-105 active:scale-95 transition-all cursor-pointer group"
              title={translations[language].profile}
              aria-label={translations[language].profile}
            >
              <ProfileAvatar user={user} className="w-full h-full" />
              <div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-zinc-950" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 min-h-screen flex flex-col w-full">
        {searchQuery.trim() ? (
          <div className="p-4 md:p-8 max-w-6xl mx-auto w-full space-y-8">
            <div className={`flex items-center justify-between pb-4 border-b ${theme === 'light' ? 'border-slate-200' : 'border-zinc-800'}`}>
              <div>
                <h2 className={`text-xl md:text-2xl font-black tracking-tight ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                  {translations[language].searchResults}
                </h2>
                <p className={`text-xs ${theme === 'light' ? 'text-slate-500' : 'text-zinc-400'}`}>
                  Query: "{searchQuery}"
                </p>
              </div>
              <button
                onClick={() => setSearchQuery('')}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white active:scale-95 transition-all"
              >
                Clear Search
              </button>
            </div>

            {searchMatchingFolders.length === 0 && searchMatchingCards.length === 0 ? (
              <div className={`text-center py-16 border border-dashed rounded-2xl ${
                theme === 'light' ? 'bg-white border-slate-300 text-slate-500' : 'bg-zinc-900/40 border-zinc-800 text-zinc-500'
              }`}>
                <Search size={44} className="mx-auto mb-3 opacity-40" />
                <p className="font-semibold">{translations[language].noResultsFound} "{searchQuery}"</p>
              </div>
            ) : (
              <div className="space-y-8">
                {searchMatchingFolders.length > 0 && (
                  <div className="space-y-3">
                    <h3 className={`text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 ${
                      theme === 'light' ? 'text-slate-600' : 'text-zinc-400'
                    }`}>
                      <Folder size={16} className="text-indigo-500" />
                      {translations[language].matchingFolders} ({searchMatchingFolders.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {searchMatchingFolders.map(folder => (
                        <div
                          key={folder.id}
                          onClick={() => {
                            setSelectedUnitId(folder.id);
                            setSearchQuery('');
                          }}
                          className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                            theme === 'light'
                              ? 'bg-white border-slate-200 hover:border-indigo-400 hover:shadow-md'
                              : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Folder size={20} className="text-indigo-400 group-hover:scale-110 transition-transform" />
                            <span className={`font-bold text-sm ${theme === 'light' ? 'text-slate-800' : 'text-zinc-200'}`}>
                              {folder.name}
                            </span>
                          </div>
                          <ChevronRight size={18} className="text-zinc-500 group-hover:translate-x-1 transition-transform" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {searchMatchingCards.length > 0 && (
                  <div className="space-y-3">
                    <h3 className={`text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 ${
                      theme === 'light' ? 'text-slate-600' : 'text-zinc-400'
                    }`}>
                      <BookOpen size={16} className="text-indigo-500" />
                      {translations[language].matchingCards} ({searchMatchingCards.length})
                    </h3>
                    <div className="space-y-3">
                      {searchMatchingCards.map(card => {
                        const parentFolder = folders.find(f => f.id === card.unitId);
                        return (
                          <div
                            key={card.id}
                            className={`p-4 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                              theme === 'light'
                                ? 'bg-white border-slate-200 hover:border-slate-300'
                                : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                            }`}
                          >
                            <div className="space-y-1.5 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`font-bold text-sm ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                                  {card.cardName || "Flashcard"}
                                </span>
                                {parentFolder && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                                    {parentFolder.name}
                                  </span>
                                )}
                              </div>
                              <p className={`text-xs line-clamp-2 ${theme === 'light' ? 'text-slate-600' : 'text-zinc-400'}`}>
                                {card.frontText}
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                setSelectedUnitId(card.unitId);
                                setSearchQuery('');
                              }}
                              className="px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-xs font-extrabold uppercase tracking-wider hover:bg-indigo-500 active:scale-95 transition-all self-start md:self-center shrink-0"
                            >
                              Open Folder
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : selectedUnit ? (
          <UnitView key={selectedUnit.id}
            unit={selectedUnit}
            allFolders={folders}
            onBack={() => setSelectedUnitId(null)}
            onFolderSelect={(folder) => setSelectedUnitId(folder.id)}
            onRenameUnit={(id, name) => { setIsRenaming({ id, name }); setNewName(name); }}
            onNewFolder={() => handleRequireAuth(() => setIsAdding({ parentId: null, level: 1 }))}
            onRequireAuth={handleRequireAuth}
            language={language}
            theme={theme}
          />
        ) : (
          <div className="p-4 md:p-8 max-w-6xl mx-auto w-full space-y-8">
            <FocusCenter
              language={language}
              theme={theme}
              userName={user?.displayName?.split(' ')[0]}
              dueToday={dashboardStats.dueToday}
              dueTomorrow={dashboardStats.dueTomorrow}
              upcoming={dashboardStats.upcoming}
              onResume={handleResumeSession}
              onOpenGlobal={(filter) => setSelectedUnitId(`global_${filter}`)}
              onNewFolder={() => handleRequireAuth(() => setIsAdding({ parentId: null, level: 1 }))}
              onTryNow={handleTryNow}
              onImportDeck={() => handleRequireAuth(() => globalFileInputRef.current?.click())}
            />

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2"
            >
              <div>
                <h2 className={`text-xl md:text-2xl font-black tracking-tight ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                  {translations[language].myFolders}
                </h2>
                <p className={`text-xs md:text-sm font-medium ${theme === 'light' ? 'text-slate-500' : 'text-zinc-400'}`}>
                  {translations[language].foldersDesc}
                </p>
              </div>
            </motion.div>

            {/* Folder Hierarchy */}
            <div className="space-y-4">
              {rootFolders.length === 0 && !isAdding && (
                <div className={`text-center py-20 rounded-2xl border border-dashed ${
                  theme === 'light' ? 'bg-white border-slate-300 text-slate-500' : 'bg-zinc-900/40 border-zinc-800 text-zinc-500'
                }`}>
                  <Folder size={48} className="mx-auto text-zinc-700 mb-4" />
                  <p className="font-semibold">{language === 'Amharic' ? 'እስካሁን ምንም ፎልደሮች የሉም። ለመጀመር የመጀመሪያዎን ይፍጠሩ።' : 'No folders yet. Create your first one to get started.'}</p>
                </div>
              )}

              {rootFolders.map(folder => (
                <FolderItem
                  key={folder.id}
                  folder={folder}
                  allFolders={folders}
                  onAdd={(parentId, level) => handleRequireAuth(() => setIsAdding({ parentId, level }))}
                  onRename={(id, name) => { setIsRenaming({ id, name }); setNewName(name); }}
                  onDelete={(id, name) => setConfirmDelete({ id, name })}
                  onSelectUnit={(unit) => setSelectedUnitId(unit.id)}
                  language={language}
                  theme={theme}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Minimalist Footer */}
      <footer className={`mt-24 border-t py-10 px-6 sm:px-12 transition-colors ${
        theme === 'light' ? 'bg-slate-50/80 border-slate-200 text-slate-600' : 'bg-[#060b17]/90 border-indigo-950/60 text-slate-400'
      }`}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-xs font-medium">
          {/* Brand & Slogan */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 flex items-center justify-center text-white font-black shadow-md shadow-indigo-600/20">
              <GraduationCap size={18} />
            </div>
            <div>
              <span className={`font-black text-sm tracking-tight block ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                HaHu Cards
              </span>
              <span className="text-[11px] opacity-75">{language === 'Amharic' ? 'ካርዶችና ክለሳ' : 'Flashcards & Review'}</span>
            </div>
          </div>

          {/* Copyright */}
          <div className="opacity-75 text-center md:text-right text-[11px]">
            © {new Date().getFullYear()} HaHu Cards. All rights reserved.
          </div>
        </div>
      </footer>

      {dashboardEditingCard && <FlashcardEditor unitId={dashboardEditingCard.unitId} editingCard={dashboardEditingCard}
        onClose={() => setDashboardEditingCard(null)} onSave={() => setDashboardEditingCard(null)} language={language} theme={theme} />}
      {dataError && <div role="alert" className="fixed bottom-4 left-4 right-4 z-[150] rounded-xl bg-red-950 text-white p-4 shadow-xl flex items-center justify-between gap-4">
        <span>{dataError}</span><button onClick={() => setDataError(null)} aria-label="Dismiss error"><X /></button>
      </div>}
      {/* Modals */}
      <StudySettingsModal
        isOpen={isStudySettingsOpen}
        onClose={() => setIsStudySettingsOpen(false)}
        onStart={(duration, mode, config) => {
          if (studyModeCard) {
            setSessionParams({ duration, mode, config });
            setIsStudySettingsOpen(false);

          }
        }}
        language={language}
        theme={theme}
      />

      {studyModeCard && sessionParams && (
        <StudySession key={`${user?.uid}:${studyModeCard.id}:${sessionParams.mode}`} resume={sessionParams.resume}
          card={studyModeCard}
          duration={sessionParams.duration}
          mode={sessionParams.mode}
          config={sessionParams.config}
          language={language}
          onQuit={() => {
            setStudyModeCard(null);
            setSessionParams(null);
          }}
          onEdit={(card) => {
            setStudyModeCard(null);
            setSessionParams(null);
            setDashboardEditingCard(card);
          }}
        />
      )}

      <ConfirmModal
        isOpen={!!confirmDelete}
        title={confirmDelete?.name || ''}
        description={interactionCopy[language].folderDelete}
        onConfirm={() => confirmDelete && handleDeleteFolder(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
        language={language}
        theme={theme}
      />

      {/* Add/Rename Modal */}
      <AnimatePresence>
        {(isAdding || isRenaming) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div ref={folderDialogRef} role="dialog" aria-modal="true" aria-label={isAdding ? t.newFolderTitle : t.renameFolder} tabIndex={-1}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`p-6 max-w-sm w-full space-y-6 rounded-2xl border shadow-xl ${
                theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-neutral-900 border-neutral-800/30 text-white'
              }`}
            >
              <div className="flex justify-between items-center">
                <h3 className={`text-lg font-extrabold tracking-tight uppercase ${theme === 'light' ? 'text-slate-900' : 'text-neutral-50'}`}>
                  {isAdding
                    ? (isAdding.parentId ? `${t.addSubfolderTitle} (${t.level} ${isAdding.level})` : t.newFolderTitle)
                    : t.renameFolder}
                </h3>
                <button
                  disabled={folderAction.pending} aria-label={interactionCopy[language].close} onClick={closeFolderDialog}
                  className={`active:scale-95 transition-all ${theme === 'light' ? 'text-slate-400 hover:text-slate-700' : 'text-neutral-500 hover:text-neutral-50'}`}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-2">
                <label className={`text-[10px] font-bold uppercase tracking-widest ${theme === 'light' ? 'text-slate-500' : 'text-neutral-500'}`}>
                  {t.folderNameLabel}
                </label>
                <input
                  data-initial-focus
                  disabled={folderAction.pending}
                  maxLength={100}
                  aria-label={t.folderNameLabel}
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t.folderNamePlaceholder}
                  className={`w-full border rounded-xl px-4 py-3 text-sm outline-none transition-colors ${
                    theme === 'light'
                      ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-indigo-500'
                      : 'bg-neutral-950/50 border-neutral-800/30 text-neutral-100 focus:border-neutral-500'
                  }`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); folderAction.run(isAdding ? handleAddFolder : handleRenameFolder); }
                  }}
                />
              </div>

              {folderAction.error && <p role="alert" className="text-sm text-red-500">{folderAction.error}</p>}
              <button
                onClick={() => folderAction.run(isAdding ? handleAddFolder : handleRenameFolder)}
                disabled={folderAction.pending || !newName.trim()}
                className={`w-full py-3 rounded-xl font-extrabold text-sm uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  theme === 'light'
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-neutral-50 text-neutral-950 hover:bg-neutral-200'
                }`}
              >
                {folderAction.pending ? interactionCopy[language].saving : (isAdding ? t.createFolder : t.saveChanges)}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {globalProgressInfo && (
          <TransferProgressModal language={language}
            title="Importing Deck"
            progress={globalProgressInfo.percent}
            status={globalProgressInfo.status}
          />
        )}
      </AnimatePresence>

      <AuthRequiredModal
        isOpen={showAuthRequired}
        onClose={() => setShowAuthRequired(false)}
        onSignIn={async () => {
          try {
            await login();
          } catch (error: any) {
            alert(error?.message || "Sign-in failed.");
          }
        }}
        theme={theme}
        language={language}
      />


    </div>
  );
};

// --- Root Component ---

// Helper for Flippable Cards
const FlipCard = ({ title, description, icon: Icon, flipText }: { title: string, description: string, icon: any, flipText: string }) => {
  const [isFlipped, setIsFlipped] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFlipped(prev => !prev);
  };

  const handleMouseEnter = () => {
    setIsFlipped(true);
  };

  const handleMouseLeave = () => {
    setIsFlipped(false);
  };

  return (
    <div
      className="relative w-48 sm:w-56 h-28 sm:h-32 cursor-pointer group shrink-0 select-none"
      style={{ perspective: '1000px' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <motion.div
        className="w-full h-full relative"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-indigo-950/95 via-indigo-900/90 to-neutral-900/95 border-2 border-indigo-400/80 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center p-2.5 sm:p-3 shadow-lg overflow-hidden group-hover:border-indigo-300 transition-colors duration-200"
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
        >
          {/* Reflective Gloss */}
          <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/25 opacity-70 transform -rotate-45 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out pointer-events-none" />

          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-indigo-500/30 flex items-center justify-center text-indigo-200 mb-1 shadow-inner border border-indigo-300/40">
            <Icon size={16} />
          </div>
          <h3 className="text-xs sm:text-sm text-white font-black tracking-tight uppercase text-center relative z-10 px-2">{title}</h3>
          <p className="mt-1 text-[8.5px] uppercase tracking-widest text-indigo-200 font-extrabold opacity-85 group-hover:opacity-100 transition-opacity relative z-10">{flipText}</p>
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-emerald-950/95 via-teal-900/90 to-neutral-950 border-2 border-emerald-400/80 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center p-2.5 sm:p-3 shadow-lg overflow-hidden"
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          {/* Reflective Gloss */}
          <div className="absolute inset-0 bg-gradient-to-bl from-white/0 via-white/15 to-white/0 opacity-50 pointer-events-none" />

          <p className="text-emerald-50 text-[11px] sm:text-xs font-semibold leading-tight text-center relative z-10 px-1.5">{description}</p>
        </div>
      </motion.div>
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <AccountDashboard />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </HashRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
