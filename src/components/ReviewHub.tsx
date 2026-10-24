import { availableFolderIds } from '../dataIntegrity';
import { translations } from '../translations';
import { cardContentVersion } from '../cardConflicts';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '../firebase';
import type { FlashcardData, FolderData } from '../models';
import { applyReviewAction, subscribeFolders, subscribeFlashcards, type ReviewAction } from '../dataStore';
import { revision, reviewQueue, scheduleReview, snapshot } from '../reviewEngine';
import { freshReviewSession, parseReviewSession, type ReviewSessionData } from '../reviewSession';
import { useBeforeUnload, useDialog } from '../hooks/useDialog';
import { formatReviewDelay } from '../studyUtils';
import { FlipCardStage } from './StudyCardFace';
import { AlertTriangle, Check, Maximize, Minimize, X } from 'lucide-react';

/**
 * Spaced Review keeps the same distraction-free stage as Speed Recall: the
 * card, a thinking timer, one reveal action, then four ratings. There is no
 * settings or management panel here — scheduling options stay out of study.
 *
 * Sessions are saved locally and resume silently. Daily limits, paused cards
 * and card groups remain supported in the stored data for compatibility, but
 * they are only surfaced when they would otherwise hide ready work.
 */
export function ReviewHub({ user, scope = null, duration = 60, language = 'English', requestNew = false, onClose }: { user: User; scope?: string | null; duration?: number; language?: 'English' | 'Amharic'; requestNew?: boolean; onClose: () => void }) {
  const text = (en: string, am: string) => language === 'Amharic' ? am : en;
  const key = `hahu_review_session_${user.uid}`;
  const [owner] = useState(() => crypto.randomUUID());
  const [session, setSession] = useState<ReviewSessionData>(() => freshReviewSession(owner, scope, duration));
  const latest = useRef(session);
  const initializedKey = useRef('');
  const [loaded, setLoaded] = useState(false);
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ownsFullscreen = useRef(false);
  const requestClose = () => { if (!lock.current) onClose(); };
  useDialog(ref, true, requestClose, busy);
  useBeforeUnload(busy);
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
  useEffect(() => {
    if (initializedKey.current !== key) try {
      const saved = localStorage.getItem(key);
      let next: ReviewSessionData;
      if (saved) {
        const stored = parseReviewSession(saved);
        // Explicitly starting from another folder begins a review for that
        // folder. Otherwise the saved progress resumes silently; a newly picked
        // thinking time is adopted without discarding what is already reviewed.
        if (requestNew && stored.scope !== scope) next = freshReviewSession(owner, scope, duration);
        else next = { ...stored, owner, duration: requestNew ? duration : stored.duration };
      } else next = freshReviewSession(owner, scope, duration);
      localStorage.setItem(key, JSON.stringify(next));
      initializedKey.current = key;
      latest.current = next; setSession(next); setLoaded(true);
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
  const scopedCards = useMemo(() => availableCards.filter(card => !session.scope || card.unitId === session.scope), [availableCards, session.scope]);
  const queue = reviewQueue(availableCards, session.scope, session.limits, now);
  const pausedCards = useMemo(() => scopedCards.filter(card => card.review?.paused), [scopedCards]);
  const current = availableCards.find(c => c.id === session.current?.id);
  const content = useMemo(() => current ? cardContentVersion(current) : '', [current]);
  useEffect(() => {
    if (!loaded || !ready || !foldersReady || blocked || lock.current || session.pending) return;
    if (session.current && current && revision(current) === session.current.revision && content === session.current.content && !current.review?.paused && (!session.scope || current.unitId === session.scope) && queue.eligible.some(c => c.id === current.id)) return;
    const next = queue.eligible[0];
    if (!next && !session.current) return;
    change({ ...latest.current, current: next ? { id: next.id, revision: revision(next), content: cardContentVersion(next), deadline: Date.now() + latest.current.duration * 1000, shown: false } : null });
  }, [loaded, ready, foldersReady, blocked, availableCards, now, session.current, session.pending, session.limits]);
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
        completed: Math.max(0, s.completed + (pending.action.kind === 'rate' ? 1 : 0)),
        undo: pending.action.kind === 'rate' ? { cardId: pending.cardId, expected: pending.action.id, before: pending.before } : s.undo });
      return true;
    } catch (e) { if (mounted.current) setError((e as Error).message); return false; }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const submit = (card: FlashcardData, rating: number) => {
    if (session.pending || lock.current || blocked) return;
    if (!session.current?.shown || Date.now() < session.current.deadline || revision(card) !== session.current.revision || content !== session.current.content) return;
    const action: ReviewAction = { kind: 'rate', rating, id: crypto.randomUUID(), expected: revision(card), at: Date.now(), content };
    void run({ cardId: card.id, action, before: snapshot(card) });
  };
  // Behind-limit and paused cards stay in the saved schedule; one explicit tap
  // makes them available again without exposing settings screens.
  const studyMore = () => {
    const more = Math.max(0, queue.limited);
    if (!more) return;
    change({ ...latest.current, limits: {
      ...latest.current.limits,
      newCards: Math.min(1000, latest.current.limits.newCards + more),
      reviews: Math.min(10000, latest.current.limits.reviews + more)
    } });
  };
  const resumePaused = async () => {
    if (lock.current || !pausedCards.length) return;
    lock.current = true; setBusy(true); setError('');
    try {
      for (const card of pausedCards) {
        await applyReviewAction(user, card.id, { kind: 'settings', id: crypto.randomUUID(), expected: revision(card), at: Date.now(), paused: false, group: card.review?.group || '' });
      }
    } catch (e) { if (mounted.current) setError((e as Error).message); }
    finally { lock.current = false; if (mounted.current) { setBusy(false); setNow(Date.now()); } }
  };
  const button = 'rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-bold hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed';
  const corner = 'p-3 rounded-full bg-neutral-900/60 border border-neutral-800/60 text-neutral-400 hover:text-white transition-all active:scale-95';
  const seconds = Math.max(0, Math.ceil(((session.current?.deadline || now) - now) / 1000));
  const shown = !!session.current?.shown && seconds === 0;
  const copy = translations[language];
  const labels = [copy.again, copy.hard, copy.good, copy.easy];
  const disabled = busy || blocked || !!session.pending || !loaded || !ready || !foldersReady;
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return <div ref={ref} role="dialog" aria-modal="true" aria-label={text('Spaced Review', 'በጊዜ ልዩነት ክለሳ')} tabIndex={-1}
    className="fixed inset-0 z-[100] bg-neutral-950 text-neutral-100 flex flex-col overflow-y-auto overscroll-contain">

    <header className="w-full flex items-center justify-between gap-3 p-4 sm:p-6">
      <button aria-label={text('Close review', 'ክለሳ ዝጋ')} disabled={busy} onClick={requestClose} className={corner}><X size={22} /></button>
      <button aria-label={isFullscreen ? text('Exit fullscreen', 'ሙሉ ስክሪን ውጣ') : text('Fullscreen', 'ሙሉ ስክሪን')} onClick={() => void toggleFullscreen()} className={corner}>
        {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
      </button>
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

      <fieldset disabled={disabled} className="contents">
        {current && session.current ? <section className="w-full flex flex-col items-center gap-5">
          <h2 className="sr-only">{current.cardName || text('Untitled card', 'ስም የሌለው ካርድ')}</h2>
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
                  onClick={() => submit(current, i + 1)}>{label}<span className="block text-[11px] font-bold text-neutral-500">~{delay}</span></button>;
              })}</div>
            </div>}
        </section> : <section className="text-center space-y-3">
          <Check className="mx-auto text-emerald-400" size={48} />
          <h3 className="text-2xl font-extrabold tracking-tight">{text('All done for now', 'ለአሁኑ ተጠናቅቋል')}</h3>
          {queue.nextLearning && <p className="text-sm text-neutral-400">{text('Next practice card in', 'ቀጣዩ የልምምድ ካርድ በ')} {formatReviewDelay(Math.max(1, queue.nextLearning - now) / 86400000, language)}</p>}
          {!queue.nextLearning && queue.limited === 0 && <p className="text-sm text-neutral-400">{text('Nothing else is due right now.', 'አሁን ሌላ የሚከለስ የለም።')}</p>}
          {queue.limited > 0 && <div className="mx-auto max-w-sm space-y-2">
            <p className="text-sm text-amber-300">{queue.limited} {text('more ready cards are waiting.', 'ተጨማሪ ዝግጁ ካርዶች አሉ።')}</p>
            <button className={button} disabled={busy} onClick={studyMore}>{text('Study them now', 'አሁን ከልሳቸው')}</button>
          </div>}
          {pausedCards.length > 0 && <div className="mx-auto max-w-sm space-y-2">
            <p className="text-sm text-neutral-400">{pausedCards.length} {text('paused cards are hidden from reviews.', 'የቆሙ ካርዶች ከክለሳ ተደብቀዋል።')}</p>
            <button className={button} disabled={busy} onClick={() => void resumePaused()}>{text('Resume paused cards', 'የቆሙ ካርዶችን ቀጥል')}</button>
          </div>}
          {queue.hidden > 0 && <p className="text-xs text-neutral-500">{queue.hidden} {text('related cards hidden until tomorrow.', 'ተዛማጅ ካርዶች እስከ ነገ ተደብቀዋል።')}</p>}
        </section>}
      </fieldset>
    </main>
  </div>;
}
