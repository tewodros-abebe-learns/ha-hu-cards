import { availableFolderIds } from '../dataIntegrity';
import { translations } from '../translations';
import { cardContentVersion } from '../cardConflicts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '../firebase';
import type { FlashcardData, FolderData } from '../models';
import { applyReviewAction, subscribeFolders, subscribeFlashcards, type ReviewAction } from '../dataStore';
import { cardKind, revision, reviewQueue, scheduleReview, snapshot } from '../reviewEngine';
import { freshReviewSession, parseReviewSession, type ReviewSessionData } from '../reviewSession';
import { useBeforeUnload, useDialog } from '../hooks/useDialog';
import { formatReviewDelay } from '../studyUtils';
import { FlipCardStage } from './StudyCardFace';
import {
  AlertTriangle, CalendarClock, Check, ChevronLeft, ChevronRight, Clock3, Maximize,
  Minimize, Search, SlidersHorizontal, Sparkles, Undo2, X
} from 'lucide-react';

type View = 'review' | 'options' | 'manage';

/**
 * Spaced Review uses the same distraction-free stage as Speed Recall: only the
 * card, thinking timer, reveal/rating controls, close and fullscreen. Scheduling
 * details live behind a single options button so the study screen stays calm.
 */
export function ReviewHub({ user, scope = null, duration = 60, language = 'English', requestNew = false, onClose }: { user: User; scope?: string | null; duration?: number; language?: 'English' | 'Amharic'; requestNew?: boolean; onClose: () => void }) {
  const text = (en: string, am: string) => language === 'Amharic' ? am : en;
  const key = `hahu_review_session_${user.uid}`;
  const [owner] = useState(() => crypto.randomUUID());
  const [session, setSession] = useState<ReviewSessionData>(() => freshReviewSession(owner, scope, duration));
  const latest = useRef(session);
  const initializedKey = useRef('');
  const [loaded, setLoaded] = useState(false);
  const [resumeChoice, setResumeChoice] = useState(false);
  const [cards, setCards] = useState<FlashcardData[]>([]);
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [foldersReady, setFoldersReady] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  const [now, setNow] = useState(Date.now());
  const [view, setView] = useState<View>('review');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ownsFullscreen = useRef(false);
  const [settingsGeneration, setSettingsGeneration] = useState(0);
  const [dirtySettings, setDirtySettings] = useState<Set<string>>(new Set());
  const manage = view === 'manage';
  const markDirty = useCallback((id: string, dirty: boolean) => setDirtySettings(previous => {
    if (previous.has(id) === dirty) return previous;
    const next = new Set(previous); if (dirty) next.add(id); else next.delete(id); return next;
  }), []);
  const allowDiscard = () => {
    if (!dirtySettings.size) return true;
    if (!confirm(text('Discard unsaved card settings?', 'ያልተቀመጡ የካርድ ቅንብሮች ይሰረዙ?'))) return false;
    setSettingsGeneration(value => value + 1); setDirtySettings(new Set()); return true;
  };
  const requestClose = () => { if (!lock.current && allowDiscard()) onClose(); };
  useDialog(ref, true, requestClose, busy);
  useBeforeUnload(busy || dirtySettings.size > 0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const changed = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', changed);
    return () => { document.removeEventListener('fullscreenchange', changed); if (ownsFullscreen.current && document.fullscreenElement) void document.exitFullscreen?.().catch(() => {}); };
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (!document.documentElement.requestFullscreen) return;
        await document.documentElement.requestFullscreen(); ownsFullscreen.current = true;
      } else { await document.exitFullscreen?.(); ownsFullscreen.current = false; }
    } catch { /* Fullscreen is optional, e.g. on unsupported mobile browsers. */ }
  };
  const persist = (next: ReviewSessionData) => {
    const existing = localStorage.getItem(key);
    if (existing && parseReviewSession(existing).owner !== owner) throw new Error(text('Review is open in another tab. Close this window and reopen it to continue.', 'ክለሳው በሌላ ትር ተከፍቷል። ይህን መስኮት ዘግተው እንደገና ይክፈቱ።'));
    localStorage.setItem(key, JSON.stringify(next));
    latest.current = next;
    setSession(next);
  };
  const change = (next: ReviewSessionData) => { try { persist(next); } catch (e) { setError(String((e as Error).message)); setBlocked(true); } };
  // Options and card management are not study time: the thinking countdown is
  // paused while they are open and resumes where it stopped on return.
  const pausedAt = useRef<number | null>(null);
  useEffect(() => {
    if (view === 'review') {
      const start = pausedAt.current; pausedAt.current = null;
      const active = latest.current.current;
      if (!start || !active || active.shown) return;
      const extended = Math.min(8.64e15, active.deadline + Math.max(0, Date.now() - start));
      try { persist({ ...latest.current, current: { ...active, deadline: extended } }); } catch { /* The visible timer still uses the stored deadline. */ }
    } else if (pausedAt.current === null) pausedAt.current = Date.now();
  }, [view]);
  useEffect(() => {
    if (initializedKey.current !== key) try {
      const saved = localStorage.getItem(key);
      const next = saved ? { ...parseReviewSession(saved), owner } : freshReviewSession(owner, scope, duration);
      localStorage.setItem(key, JSON.stringify(next));
      initializedKey.current = key;
      latest.current = next; setSession(next); setLoaded(true); setResumeChoice(!!saved && requestNew);
    } catch (e) { setError(text('Saved review progress cannot be read or written. Your cards are unchanged. ', 'የክለሳ ሂደቱ መነበብ ወይም መቀመጥ አልቻለም። ካርዶችዎ አልተቀየሩም። ') + (e as Error).message); setBlocked(true); }
    const storage = (e: StorageEvent) => { if (e.key === key || e.key === null) { setBlocked(true); setError(text('Review progress changed in another tab. Close and reopen this review.', 'የክለሳ ሂደቱ በሌላ ትር ተቀይሯል። ዘግተው እንደገና ይክፈቱ።')); } };
    window.addEventListener('storage', storage);
    return () => window.removeEventListener('storage', storage);
  }, [key, owner]);
  useEffect(() => subscribeFolders(user, next => { setFolders(next); setFoldersReady(true); }, e => { setError(e.message); setFoldersReady(false); }), [user.uid]);
  useEffect(() => subscribeFlashcards(user, next => { setCards(next); setReady(true); }, null, true, e => { setError(e.message); if (!e.recoverable) setReady(false); }), [user.uid]);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 1000);
    window.addEventListener('focus', tick); document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick); };
  }, []);
  const availableCards = useMemo(() => { const active = availableFolderIds(folders); return cards.filter(card => active.has(card.unitId)); }, [cards, folders]);
  const queue = reviewQueue(availableCards, session.scope, session.limits, now);
  const managedCards = useMemo(() => availableCards.filter(c => (!session.scope || c.unitId === session.scope) && `${c.cardName} ${c.frontText}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [availableCards, session.scope, search]);
  useEffect(() => setPage(p => Math.min(p, Math.max(0, Math.ceil(managedCards.length / 50) - 1))), [managedCards.length]);
  const current = availableCards.find(c => c.id === session.current?.id);
  const content = useMemo(() => current ? cardContentVersion(current) : '', [current]);
  useEffect(() => {
    if (!loaded || !ready || !foldersReady || blocked || resumeChoice || lock.current || session.pending || view !== 'review') return;
    if (session.current && current && revision(current) === session.current.revision && content === session.current.content && !current.review?.paused && (!session.scope || current.unitId === session.scope) && queue.eligible.some(c => c.id === current.id)) return;
    const next = queue.eligible[0];
    if (!next && !session.current) return;
    change({ ...latest.current, current: next ? { id: next.id, revision: revision(next), content: cardContentVersion(next), deadline: Date.now() + latest.current.duration * 1000, shown: false } : null });
  }, [loaded, ready, foldersReady, blocked, resumeChoice, availableCards, now, view, session.current, session.pending, session.limits]);
  const run = async (pending: NonNullable<ReviewSessionData['pending']>) => {
    if (lock.current || blocked) return false;
    lock.current = true; setBusy(true); setError('');
    try {
      persist({ ...latest.current, pending }); // Durable intent precedes the library write.
      const committed = await applyReviewAction(user, pending.cardId, pending.action);
      if (!mounted.current) return false;
      // A transaction acknowledgement can precede the live snapshot. Do not
      // briefly enqueue the old due card, or overwrite a newer remote revision.
      setCards(cards => cards.map(card => card.id === pending.cardId &&
        (revision(card) === pending.action.expected || card.review?.revision === pending.action.id)
        ? { ...card, ...committed } : card));
      const s = latest.current;
      persist({ ...s, pending: null, current: null,
        completed: Math.max(0, s.completed + (pending.action.kind === 'rate' ? 1 : pending.action.kind === 'undo' ? -1 : 0)),
        undo: pending.action.kind === 'rate' ? { cardId: pending.cardId, expected: pending.action.id, before: pending.before } : pending.action.kind === 'undo' ? null : s.undo });
      return true;
    } catch (e) { if (mounted.current) setError((e as Error).message); return false; }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const submit = (card: FlashcardData, details: { kind: 'rate'; rating: number } | { kind: 'settings'; paused: boolean; group: string }) => {
    if (session.pending || lock.current || blocked) return Promise.resolve(false);
    if (details.kind === 'rate' && (!session.current?.shown || Date.now() < session.current.deadline || revision(card) !== session.current.revision || content !== session.current.content)) return Promise.resolve(false);
    const action: ReviewAction = { id: crypto.randomUUID(), expected: revision(card), at: Date.now(), ...details, ...(details.kind === 'rate' ? { content } : {}) };
    return run({ cardId: card.id, action, before: snapshot(card) });
  };
  const undo = () => {
    if (!session.undo || session.pending) return;
    void run({ cardId: session.undo.cardId, before: session.undo.before, action: { kind: 'undo', id: crypto.randomUUID(), expected: session.undo.expected, at: Date.now(), before: session.undo.before } });
  };
  const reset = () => {
    if (busy || !confirm(text('Start a new review session? Cards and saved ratings are kept.', 'አዲስ የክለሳ ክፍለ ጊዜ ይጀምሩ? ካርዶችና የተቀመጡ ውጤቶች ይቆያሉ።'))) return;
    if (session.pending || !allowDiscard()) return;
    setView('review');
    try {
      const saved = localStorage.getItem(key);
      let pending = false;
      if (saved) { try { pending = !!parseReviewSession(saved).pending; } catch (e) { if (!blocked) throw e; } }
      if (pending) throw new Error(text('Resume and finish the interrupted save first.', 'በመጀመሪያ ያልተጠናቀቀውን ማስቀመጥ ያጠናቅቁ።'));
      const next = { ...freshReviewSession(owner, scope, duration), limits: latest.current.limits }; localStorage.setItem(key, JSON.stringify(next)); latest.current = next; setSession(next); setLoaded(true); setResumeChoice(false); setBlocked(false); setError(''); } catch (e) { setError((e as Error).message); }
  };
  const button = 'rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-bold hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed';
  const corner = 'p-3 rounded-full bg-neutral-900/60 border border-neutral-800/60 text-neutral-400 hover:text-white transition-all active:scale-95';
  const seconds = Math.max(0, Math.ceil(((session.current?.deadline || now) - now) / 1000));
  const shown = !!session.current?.shown && seconds === 0;
  const copy = translations[language];
  const labels = [copy.again, copy.hard, copy.good, copy.easy];
  const status = current ? cardKind(current) : 'new';
  const statusLabel = status === 'new' ? text('New', 'አዲስ') : status === 'learning' ? text('Practising', 'እየተለማመደ') : text('Review', 'ክለሳ');
  const disabled = busy || blocked || !!session.pending || !loaded || !ready || !foldersReady || resumeChoice;
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return <div ref={ref} role="dialog" aria-modal="true" aria-label={text('Spaced Review', 'በጊዜ ልዩነት ክለሳ')} tabIndex={-1}
    className="fixed inset-0 z-[100] bg-neutral-950 text-neutral-100 flex flex-col overflow-y-auto overscroll-contain">

    <header className="w-full flex items-center justify-between gap-3 p-4 sm:p-6">
      <button aria-label={text('Close review', 'ክለሳ ዝጋ')} disabled={busy} onClick={requestClose} className={corner}><X size={22} /></button>
      <div className="flex items-center gap-2">
        {view === 'review' && <button aria-label={text('Review options', 'የክለሳ አማራጮች')} onClick={() => setView('options')} className={corner}><SlidersHorizontal size={20} /></button>}
        <button aria-label={isFullscreen ? text('Exit fullscreen', 'ሙሉ ስክሪን ውጣ') : text('Fullscreen', 'ሙሉ ስክሪን')} onClick={() => void toggleFullscreen()} className={corner}>
          {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
        </button>
      </div>
    </header>

    <main className="flex-1 w-full flex flex-col items-center justify-center gap-5 px-4 pb-10">
      {error && <p role="alert" className="w-full max-w-xl rounded-xl border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}
      {foldersReady && cards.length > availableCards.length && <p role="status" className="w-full max-w-xl rounded-xl border border-amber-800/60 bg-amber-950/30 p-2.5 text-xs text-amber-200">
        {text('Cards in missing or deleting folders are hidden.', 'የጠፉ ወይም እየተሰረዙ አቃፊዎች ውስጥ ያሉ ካርዶች ተደብቀዋል።')}
      </p>}
      {session.pending && <div className="w-full max-w-xl rounded-xl border border-amber-700 bg-amber-950/30 p-3 space-y-2 text-sm">
        <p className="flex items-center gap-2"><AlertTriangle size={16} /> {text('A rating is waiting to be saved.', 'አንድ ግምገማ ለመቀመጥ በመጠበቅ ላይ ነው።')}</p>
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={busy || blocked} onClick={() => void run(session.pending!)}>{text('Retry save', 'እንደገና አስቀምጥ')}</button>
          <button className={button} disabled={busy || blocked} onClick={() => { if (confirm(text('Reload the stored schedule? Successful saves are kept.', 'የተቀመጠውን መርሐግብር እንደገና ይጫኑ? የተሳኩ ማስቀመጦች ይቀየራሉ።'))) change({ ...session, pending: null, current: null, undo: null }); }}>{text('Reload schedule', 'መርሐግብር ጫን')}</button>
        </div>
      </div>}
      {resumeChoice && <section className="w-full max-w-xl rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 space-y-4 text-center">
        <Clock3 className="mx-auto text-emerald-400" size={32} />
        <h3 className="text-lg font-extrabold">{text('Continue where you left off?', 'የቆሙበትን ይቀጥሉ?')}</h3>
        <div className="flex flex-col sm:flex-row justify-center gap-2">
          <button className={button} onClick={() => setResumeChoice(false)}>{text('Resume saved review', 'የተቀመጠውን ክለሳ ቀጥል')}</button>
          <button className={button} onClick={reset}>{text('Start a new session', 'አዲስ ክፍለ ጊዜ ጀምር')}</button>
        </div>
      </section>}

      <fieldset disabled={disabled} className="contents">
        {view === 'manage' ? <section aria-label={text('Manage cards', 'ካርዶችን አስተዳድር')} className="w-full max-w-xl space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-extrabold">{text('Manage cards', 'ካርዶችን አስተዳድር')}</h3>
            <button className={button} onClick={() => setView('review')}>{text('Back to review', 'ወደ ክለሳ')}</button>
          </div>
          <label className="block text-sm">{text('Find a card', 'ካርድ ፈልግ')}
            <span className="relative block mt-1"><Search size={16} className="absolute left-3 top-3 text-neutral-500" />
              <input className="w-full bg-neutral-900 rounded-xl p-3 pl-9" value={search} onChange={e => { if (allowDiscard()) { setSearch(e.target.value); setPage(0); } }} />
            </span>
          </label>
          <p className="text-xs text-neutral-500">{text('Cards with the same group are shown on different days.', 'አንድ ዓይነት ቡድን ያላቸው ካርዶች በተለያዩ ቀናት ይታያሉ።')}</p>
          {managedCards.slice(page * 50, (page + 1) * 50).map(card => <ReviewCardSettings key={`${card.id}:${settingsGeneration}`} card={card} onDirty={markDirty} text={text} button={button} onSave={(opened, paused, group) => submit(opened, { kind: 'settings', paused, group })} />)}
          {!managedCards.length && <p className="rounded-xl border border-neutral-800 p-4 text-sm text-neutral-400">{text('No cards in this folder.', 'በዚህ አቃፊ ካርዶች የሉም።')}</p>}
          <div className="flex gap-2">
            <button className={button} disabled={page === 0} onClick={() => { if (allowDiscard()) setPage(p => p - 1); }}><ChevronLeft size={16} /></button>
            <button className={button} disabled={(page + 1) * 50 >= managedCards.length} onClick={() => { if (allowDiscard()) setPage(p => p + 1); }}><ChevronRight size={16} /></button>
          </div>
        </section> : view === 'options' ? <section aria-label={text('Review options', 'የክለሳ አማራጮች')} className="w-full max-w-xl space-y-4 pb-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-extrabold">{text('Review options', 'የክለሳ አማራጮች')}</h3>
            <button className={button} onClick={() => setView('review')}>{text('Back to review', 'ወደ ክለሳ')}</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            {([[text('Done', 'ተጠናቅቋል'), session.completed, Check], [text('Ready', 'ዝግጁ'), queue.ready, CalendarClock], [text('New', 'አዲስ'), queue.newCount, Sparkles], [text('Practising', 'በልምምድ'), queue.learningCount, Clock3]] as const).map(([label, value, Icon]) => <div key={label} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-neutral-400"><Icon size={13} />{label}</span>
              <span className="mt-1 block text-2xl font-extrabold">{value}</span>
            </div>)}
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-3">
            <h4 className="font-bold">{text('Daily limits', 'ዕለታዊ ገደቦች')}</h4>
            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              {([['newCards', text('New cards per day', 'በቀን አዲስ ካርዶች'), 1000], ['reviews', text('Review cards per day', 'በቀን የክለሳ ካርዶች'), 10000]] as const).map(([name, label, max]) =>
                <label key={name}>{label}<input className="w-full p-2 bg-neutral-950 rounded-lg mt-1" type="number" min={0} max={max} value={session.limits[name]} onChange={e => change({ ...session, limits: { ...session.limits, [name]: Math.max(0, Math.min(max, Math.trunc(Number(e.target.value)) || 0)) } })} /></label>)}
              <label>{text('Thinking time (s)', 'የማሰብ ጊዜ (ሰከንድ)')}<input className="w-full p-2 bg-neutral-950 rounded-lg mt-1" type="number" min={1} max={86400} value={session.duration} onChange={e => change({ ...session, duration: Math.max(1, Math.min(86400, Math.trunc(Number(e.target.value)) || 1)) })} /></label>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={session.limits.spaceRelated} onChange={e => change({ ...session, limits: { ...session.limits, spaceRelated: e.target.checked } })} />{text('Hide related cards until tomorrow', 'ተዛማጅ ካርዶችን እስከ ነገ ደብቅ')}</label>
            <p className="text-xs text-neutral-500">{text('Saved on this device. The thinking timer applies to the next card.', 'በዚህ መሣሪያ ይቀመጣል። የማሰብ ጊዜው ለቀጣዩ ካርድ ነው።')}</p>
          </div>
          <div className="flex flex-col gap-2">
            <button className={button} onClick={() => { if (!manage || allowDiscard()) setView('manage'); }}>{text('Manage cards', 'ካርዶችን አስተዳድር')}</button>
            <button className={button} disabled={!session.undo || busy} onClick={() => { undo(); setView('review'); }}><span className="inline-flex items-center gap-2"><Undo2 size={16} />{text('Undo last rating', 'የመጨረሻውን ግምገማ መልስ')}</span></button>
            <button className={button} disabled={busy || !!session.pending} onClick={reset}>{text('Start a new session', 'አዲስ ክፍለ ጊዜ ጀምር')}</button>
          </div>
        </section> : current && session.current ? <section className="w-full flex flex-col items-center gap-5">
          <h2 className="sr-only">{current.cardName || text('Untitled card', 'ስም የሌለው ካርድ')}</h2>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-neutral-500">
            <Sparkles size={13} className={status === 'new' ? 'text-sky-400' : 'opacity-60'} />
            <span>{statusLabel}</span>
            {(current.review?.failures || 0) >= 8 && <AlertTriangle size={13} className="text-amber-400" aria-label={text('Often forgotten', 'በተደጋጋሚ ይረሳል')} />}
          </div>
          {!shown && <p role="timer" aria-label={text('Thinking time', 'የማሰብ ጊዜ')} className={`text-5xl sm:text-6xl font-extrabold tracking-tighter tabular-nums ${seconds <= 5 && seconds > 0 ? 'text-amber-300' : 'text-neutral-50'}`}>{clock}</p>}
          <FlipCardStage card={current} flipped={shown} />
          {!shown ? <button className="px-12 py-4 rounded-2xl bg-neutral-50 text-neutral-950 font-extrabold text-sm sm:text-base uppercase tracking-widest hover:bg-neutral-200 active:scale-95 transition-all shadow-xl shadow-black/40 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={seconds > 0} onClick={() => { if (Date.now() >= session.current!.deadline) change({ ...session, current: { ...session.current!, shown: true } }); }}>{text('Reveal Answer', 'መልሱን አሳይ')}</button>
            : <div className="w-full max-w-[520px] space-y-3">
              <div className="grid grid-cols-2 gap-2">{labels.map((label, i) => {
                let delay = '';
                try { delay = formatReviewDelay((scheduleReview(current, i + 1, 'preview', now).nextReview! - now) / 86400000, language); } catch { /* A concurrent review will advance the queue. */ }
                const tone = i === 0 ? 'text-red-300 border-red-900/70' : i === 1 ? 'text-amber-300 border-amber-900/70' : i === 2 ? 'text-sky-300 border-sky-900/70' : 'text-emerald-300 border-emerald-900/70';
                return <button key={label} disabled={busy} className={`rounded-xl border bg-neutral-900/70 px-3 py-3 text-sm font-extrabold hover:bg-neutral-800 active:scale-95 transition-all ${tone}`}
                  title={[copy.againHint, copy.hardHint, text('I remembered the answer.', 'መልሱን አስታወስኩ።'), text('I remembered it easily.', 'መልሱን በቀላሉ አስታወስኩ።')][i]}
                  onClick={() => void submit(current, { kind: 'rate', rating: i + 1 })}>{label}<span className="block text-[11px] font-bold text-neutral-500">~{delay}</span></button>;
              })}</div>
              {session.undo && <button className="w-full text-xs font-bold text-neutral-500 hover:text-neutral-200" onClick={() => { undo(); }}><span className="inline-flex items-center gap-1.5"><Undo2 size={13} />{text('Undo', 'መልስ')}</span></button>}
            </div>}
        </section> : <section className="text-center space-y-3">
          <Check className="mx-auto text-emerald-400" size={48} />
          <h3 className="text-2xl font-extrabold tracking-tight">{text('All done for now', 'ለአሁኑ ተጠናቅቋል')}</h3>
          {queue.nextLearning && <p className="text-sm text-neutral-400">{text('Next practice card in', 'ቀጣዩ የልምምድ ካርድ በ')} {formatReviewDelay(Math.max(1, queue.nextLearning - now) / 86400000, language)}</p>}
          <p className="text-sm text-neutral-500">{session.completed} {text('done this session', 'በዚህ ክፍለ ጊዜ')}</p>
          {queue.limited > 0 && <p className="mx-auto max-w-sm text-sm text-amber-300">{queue.limited} {text('ready cards remain beyond today’s limit.', 'ዝግጁ ካርዶች ከዛሬው ገደብ በላይ ይቀራሉ።')} <button className="underline" onClick={() => setView('options')}>{text('Raise limit', 'ገደቡን ጨምር')}</button></p>}
          {queue.hidden > 0 && <p className="text-xs text-neutral-500">{queue.hidden} {text('related cards hidden until tomorrow.', 'ተዛማጅ ካርዶች እስከ ነገ ተደብቀዋል።')}</p>}
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <button className={button} onClick={() => setView('options')}>{text('Adjust limits', 'ገደቦችን አስተካክል')}</button>
          </div>
        </section>}
      </fieldset>
    </main>
  </div>;
}

function ReviewCardSettings({ card, text, button, onSave, onDirty }: { card: FlashcardData; text: (en: string, am: string) => string; button: string; onDirty: (id: string, dirty: boolean) => void; onSave: (opened: FlashcardData, paused: boolean, group: string) => Promise<boolean> }) {
  const [opened, setOpened] = useState(card);
  const [savedFields, setSavedFields] = useState({ group: card.review?.group || '', paused: card.review?.paused || false });
  const [group, setGroup] = useState(card.review?.group || '');
  const [paused, setPaused] = useState(card.review?.paused || false);
  const dirty = group !== savedFields.group || paused !== savedFields.paused;
  useEffect(() => { onDirty(card.id, dirty); return () => onDirty(card.id, false); }, [card.id, dirty, onDirty]);
  const reset = () => {
    setOpened(card); setGroup(card.review?.group || ''); setPaused(card.review?.paused || false);
    setSavedFields({ group: card.review?.group || '', paused: card.review?.paused || false });
  };
  useEffect(() => { if (!dirty && revision(card) !== revision(opened)) reset(); }, [card, dirty, opened]);
  const save = async () => {
    if (await onSave(opened, paused, group)) { setGroup(group.trim()); setSavedFields({ paused, group: group.trim() }); }
  };
  return <div role="group" aria-label={card.cardName || card.id} className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3 space-y-3">
    <p className="font-bold">{card.cardName || card.frontText?.slice(0, 80)}</p>
    <label className="flex gap-2"><input type="checkbox" checked={paused} onChange={e => setPaused(e.target.checked)} />{text('Pause card', 'ካርዱን ለጊዜው አቁም')}</label>
    <label className="block text-sm">{text('Related group', 'ተዛማጅ ቡድን')}<input className="block w-full rounded-lg bg-neutral-950 p-2 mt-1" maxLength={80} value={group} onChange={e => setGroup(e.target.value)} aria-label={text('Related group (same label for related cards)', 'ተዛማጅ ቡድን (ለተዛማጅ ካርዶች አንድ ስም)')} /></label>
    <div className="flex flex-wrap gap-2">
      <button className={button} onClick={save}>{text('Save card settings', 'የካርድ ቅንብሮችን አስቀምጥ')}</button>
      <button className={button} disabled={!dirty} onClick={reset}>{text('Discard settings changes', 'የቅንብር ለውጦችን ሰርዝ')}</button>
    </div>
    {(card.review?.failures || 0) >= 8 && <p className="text-sm text-amber-300">{text('Often forgotten: improve or split this question.', 'በተደጋጋሚ ተረስቷል፦ ጥያቄውን ማሻሻል ያስቡበት።')}</p>}
  </div>;
}
