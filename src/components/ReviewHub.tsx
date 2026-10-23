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
  const [manage, setManage] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [settingsGeneration, setSettingsGeneration] = useState(0);
  const [dirtySettings, setDirtySettings] = useState<Set<string>>(new Set());
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
  const persist = (next: ReviewSessionData) => {
    const existing = localStorage.getItem(key);
    if (existing && parseReviewSession(existing).owner !== owner) throw new Error(text('Review was opened in another tab. Close this window and reopen it to continue.', 'ክለሳው በሌላ ትር ተከፍቷል። ይህን መስኮት ዘግተው እንደገና ይክፈቱ።'));
    localStorage.setItem(key, JSON.stringify(next));
    latest.current = next;
    setSession(next);
  };
  const change = (next: ReviewSessionData) => { try { persist(next); } catch (e) { setError(String((e as Error).message)); setBlocked(true); } };
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
    if (!loaded || !ready || !foldersReady || blocked || resumeChoice || lock.current || session.pending || manage) return;
    if (session.current && current && revision(current) === session.current.revision && content === session.current.content && !current.review?.paused && (!session.scope || current.unitId === session.scope) && queue.eligible.some(c => c.id === current.id)) return;
    const next = queue.eligible[0];
    if (!next && !session.current) return;
    change({ ...latest.current, current: next ? { id: next.id, revision: revision(next), content: cardContentVersion(next), deadline: Date.now() + latest.current.duration * 1000, shown: false } : null });
  }, [loaded, ready, foldersReady, blocked, resumeChoice, availableCards, now, manage, session.current, session.pending, session.limits]);
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
    if (busy || !confirm(text('Start a new review session? Cards and saved ratings are kept. Any pending save must be resolved first.', 'አዲስ የክለሳ ክፍለ ጊዜ ይጀምሩ? ካርዶችና የተቀመጡ ውጤቶች ይቆያሉ።'))) return;
    if (session.pending || !allowDiscard()) return;
    setManage(false);
    try {
      const saved = localStorage.getItem(key);
      let pending = false;
      if (saved) { try { pending = !!parseReviewSession(saved).pending; } catch (e) { if (!blocked) throw e; } }
      if (pending) throw new Error(text('Resume and resolve the pending save first.', 'በመጀመሪያ ያልተጠናቀቀውን ማስቀመጥ ያጠናቅቁ።'));
      const next = { ...freshReviewSession(owner, scope, duration), limits: latest.current.limits }; localStorage.setItem(key, JSON.stringify(next)); latest.current = next; setSession(next); setLoaded(true); setResumeChoice(false); setBlocked(false); setError(''); } catch (e) { setError((e as Error).message); }
  };
  const button = 'rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-bold hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed';
  const seconds = Math.max(0, Math.ceil(((session.current?.deadline || now) - now) / 1000));
  const copy = translations[language];
  const labels = [copy.again, copy.hard, copy.good, copy.easy];
  return <div ref={ref} role="dialog" aria-modal="true" aria-label={text('Spaced Review', 'በጊዜ ልዩነት ክለሳ')} tabIndex={-1} className="fixed inset-0 z-[100] bg-neutral-950 text-neutral-100 overflow-y-auto p-4 sm:p-8">
    <div className="max-w-3xl mx-auto space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold">{text('Spaced Review', 'በጊዜ ልዩነት ክለሳ')}</h2>
        <button className={button} disabled={busy} onClick={requestClose}>{text('Save & close', 'አስቀምጥና ዝጋ')}</button>
      </header>
      <p className="text-sm text-neutral-400">{session.scope ? text('Folder review', 'የአቃፊ ክለሳ') : text('All cards', 'ሁሉም ካርዶች')} · {session.completed} {text('reviewed this session', 'በዚህ ክፍለ ጊዜ ተከልሰዋል')}</p>
      {foldersReady && cards.length > availableCards.length && <p role="status" className="text-sm text-amber-300">{text('Cards in missing or deleting folders are excluded. Finish deletion or recover their folders from the library.', 'የጠፉ ወይም እየተሰረዙ አቃፊዎች ውስጥ ያሉ ካርዶች ከክለሳ ተወግደዋል። ስረዛውን ያጠናቅቁ ወይም አቃፊዎቹን ያስመልሱ።')}</p>}
      {error && <p role="alert" className="border border-red-700 rounded-xl p-3 text-red-300">{error}</p>}
      {resumeChoice && <div className="rounded-xl border border-neutral-700 p-4 space-y-3"><p>{text('A saved review session is available. Resume it, or start with the folder and thinking time you just selected.', 'የተቀመጠ የክለሳ ክፍለ ጊዜ አለ። ይቀጥሉት ወይም አሁን በመረጡት አቃፊና ጊዜ ይጀምሩ።')}</p><button className={button} onClick={() => setResumeChoice(false)}>{text('Resume saved review', 'የተቀመጠውን ክለሳ ቀጥል')}</button></div>}
      {session.pending && <div className="space-y-2 border border-amber-600 rounded-xl p-3">
        <p>{text('A save needs confirmation. Retrying cannot count the same operation twice.', 'ማስቀመጡ ማረጋገጫ ይፈልጋል። እንደገና መሞከር ውጤቱን ሁለት ጊዜ አይቆጥርም።')}</p>
        <button className={button} disabled={busy || blocked} onClick={() => void run(session.pending!)}>{text('Retry save', 'እንደገና አስቀምጥ')}</button>
        <button className={button} disabled={busy || blocked} onClick={() => { if (confirm(text('Reload the stored schedule? This does not undo any successful save.', 'የተቀመጠውን መርሐግብር እንደገና ይጫኑ? የተሳካ ማስቀመጥን አይሰርዝም።'))) change({ ...session, pending: null, current: null, undo: null }); }}>{text('Reload stored schedule', 'የተቀመጠውን መርሐግብር ጫን')}</button>
      </div>}
      <fieldset disabled={busy || blocked || !!session.pending || !loaded || !ready || !foldersReady || resumeChoice} className="space-y-5">
        <div className="flex flex-wrap gap-2 text-xs text-neutral-300">
          <span>{text('Ready to review', 'አሁን ዝግጁ')}: {queue.ready}</span><span>· {text('New', 'አዲስ')}: {queue.newCount}</span><span>· {text('Practising', 'እንደገና መማር')}: {queue.learningCount}</span><span>· {text('Scheduled later', 'ለበኋላ የተያዙ')}: {queue.later}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={button} onClick={() => { if (!manage || allowDiscard()) setManage(!manage); }}>{manage ? text('Return to review', 'ወደ ክለሳ ተመለስ') : text('Manage cards', 'ካርዶችን አስተዳድር')}</button>
          <button className={button} disabled={!session.undo} onClick={undo}>{text('Undo last rating', 'የመጨረሻውን ግምገማ መልስ')}</button>
        </div>
        <details className="rounded-xl border border-neutral-800 p-3">
          <summary className="cursor-pointer font-bold">{text('Daily limits & review settings', 'ዕለታዊ ገደቦችና የክለሳ ቅንብሮች')}</summary>
          <div className="grid sm:grid-cols-3 gap-3 mt-3 text-sm">
            {([['newCards', text('New cards per day', 'በቀን አዲስ ካርዶች'), 1000], ['reviews', text('Review cards per day', 'በቀን የክለሳ ካርዶች'), 10000]] as const).map(([name,label,max]) => <label key={name}>{label}<input className="w-full p-2 bg-neutral-900 rounded" type="number" min={0} max={max} value={session.limits[name]} onChange={e => change({ ...session, limits: { ...session.limits, [name]: Math.max(0, Math.min(max, Math.trunc(Number(e.target.value)) || 0)) } })}/></label>)}
            <label>{text('Thinking time (seconds, next card)', 'የማሰብ ጊዜ (ሰከንድ፣ ቀጣይ ካርድ)')}<input className="w-full p-2 bg-neutral-900 rounded" type="number" min={1} max={86400} value={session.duration} onChange={e => change({ ...session, duration: Math.max(1, Math.min(86400, Math.trunc(Number(e.target.value)) || 1)) })}/></label>
          </div>
          <label className="flex gap-2 mt-3 text-sm"><input type="checkbox" checked={session.limits.spaceRelated} onChange={e => change({ ...session, limits: { ...session.limits, spaceRelated: e.target.checked } })}/>{text('Hide related cards until tomorrow', 'ተዛማጅ ካርዶችን እስከ ነገ ደብቅ')}</label>
          <p className="text-xs text-neutral-400 mt-2">{text('Limits count unique cards across your library today. Repeat practice is not blocked by the review limit. Settings and session resume are saved on this device.', 'ገደቦቹ ዛሬ በሁሉም አቃፊዎች የተከለሱ ልዩ ካርዶችን ይቆጥራሉ። የመማር እርምጃዎች አይታገዱም። ቅንብሮችና ሂደቱ በዚህ መሣሪያ ይቀመጣሉ።')}</p>
        </details>
        {queue.limited > 0 && <p className="text-amber-300 text-sm">{queue.limited} {text('ready cards remain beyond today’s limit. Increase the limit above to continue.', 'ዝግጁ ካርዶች ከዛሬው ገደብ በላይ ይቀራሉ። ለመቀጠል ገደቡን ያሳድጉ።')}</p>}
        {queue.hidden > 0 && <p className="text-sm text-neutral-400">{queue.hidden} {text('related cards hidden until tomorrow.', 'ተዛማጅ ካርዶች እስከ ነገ ተደብቀዋል።')}</p>}
        {manage ? <div className="space-y-3"><label className="block text-sm">{text('Find a card', 'ካርድ ፈልግ')}<input className="block w-full bg-neutral-900 rounded-xl p-3" value={search} onChange={e => { if (allowDiscard()) { setSearch(e.target.value); setPage(0); } }}/></label><p className="text-xs text-neutral-400">{text('Give related questions the same group label. Identical question text in the same folder is also spaced automatically.', 'ለተዛማጅ ጥያቄዎች አንድ የቡድን ስም ይስጡ። በአንድ አቃፊ ያሉ ተመሳሳይ ጥያቄዎችም በራሳቸው ይለያያሉ።')}</p>{managedCards.slice(page*50, (page+1)*50).map(card => <ReviewCardSettings key={`${card.id}:${settingsGeneration}`} card={card} onDirty={markDirty} text={text} button={button} onSave={(opened, paused, group) => submit(opened, { kind: 'settings', paused, group })}/>)}<div className="flex gap-2"><button className={button} disabled={page === 0} onClick={() => { if (allowDiscard()) setPage(p => p-1); }}>{text('Previous', 'ቀዳሚ')}</button><button className={button} disabled={(page+1)*50 >= managedCards.length} onClick={() => { if (allowDiscard()) setPage(p => p+1); }}>{text('Next', 'ቀጣይ')}</button></div></div> : current && session.current ? <section className="space-y-4">
          <h3 className="text-lg font-bold">{current.cardName || text('Untitled card', 'ስም የሌለው ካርድ')}</h3>
          <p className="text-xs text-neutral-400">{cardKind(current) === 'new' ? text('New', 'አዲስ') : cardKind(current) === 'learning' ? text('Practising', 'መማር') : text('Review', 'ክለሳ')}</p>
          {(current.review?.failures || 0) >= 8 && <p className="rounded-xl border border-amber-600 p-3 text-sm">{text('This card is repeatedly forgotten. Consider splitting or rewriting the question in the editor, or pause it using Manage cards.', 'ይህ ካርድ በተደጋጋሚ ይረሳል። ጥያቄውን በአርታዒው ይከፋፍሉ ወይም ያስተካክሉ፤ ወይም ለጊዜው ያቁሙት።')}</p>}
          <div className="rounded-2xl border border-neutral-700 p-6 space-y-4" style={{ fontSize: current.textSize || 24, color: current.textColor || '#ffffff' }}>
            <p className="whitespace-pre-wrap break-words">{current.frontText}</p>{current.frontImageUrl && <img src={current.frontImageUrl} alt={text('Question', 'ጥያቄ')} className="max-h-64 mx-auto object-contain"/>}
            {session.current.shown && seconds === 0 && <div className="border-t border-neutral-700 pt-4"><p className="whitespace-pre-wrap break-words">{current.backText}</p>{current.backImageUrl && <img src={current.backImageUrl} alt={text('Answer', 'መልስ')} className="max-h-64 mx-auto object-contain"/>}</div>}
          </div>
          {!session.current.shown || seconds > 0 ? <div className="text-center space-y-3"><p className="text-4xl font-bold" role="timer">{String(Math.floor(seconds/60)).padStart(2,'0')}:{String(seconds%60).padStart(2,'0')}</p><button className={button} disabled={seconds > 0} onClick={() => { if (Date.now() >= session.current!.deadline) change({ ...session, current: { ...session.current!, shown: true } }); }}>{text('Reveal Answer', 'መልሱን አሳይ')}</button></div> : <><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{labels.map((label, i) => {
            let delay = '';
            try { delay = formatReviewDelay((scheduleReview(current, i+1, 'preview', now).nextReview! - now)/86400000, language); } catch { /* A concurrent review will advance the queue. */ }
            return <button key={label} className={button} title={[copy.againHint, copy.hardHint, text('I remembered the answer.', 'መልሱን አስታወስኩ።'), text('I remembered the answer easily.', 'መልሱን በቀላሉ አስታወስኩ።')][i]} onClick={() => submit(current, { kind: 'rate', rating: i+1 })}>{label}<span className="block text-xs text-neutral-400">~{delay}</span></button>;
          })}</div><p className="text-xs text-neutral-400">{text('Difficult means you remembered with effort. Easy means you remembered easily. Times show when the next review will be.', 'በችግር አስታወስኩ ማለት ጥረት አድርገው መልሱን አስታውሰዋል ማለት ነው። ጊዜዎቹ ቀጣዩ ክለሳ መቼ እንደሆነ ያሳያሉ።')}</p></>}
        </section> : <section className="rounded-2xl border border-neutral-700 p-6 text-center space-y-3"><h3 className="font-bold">{text('No cards ready in this queue', 'በዚህ ወረፋ ዝግጁ ካርዶች የሉም')}</h3>{queue.nextLearning && <p>{text('Next practice card in', 'ቀጣዩ የመማር ካርድ በ')} {Math.max(1, Math.ceil((queue.nextLearning-now)/1000))} {text('seconds. It will appear automatically.', 'ሰከንዶች። በራሱ ይታያል።')}</p>}<p className="text-sm text-neutral-400">{text('You can save and close; completed ratings are already saved.', 'አስቀምጠው መዝጋት ይችላሉ፤ የተጠናቀቁ ግምገማዎች ተቀምጠዋል።')}</p></section>}
      </fieldset>
      <button className={button} disabled={busy || !!session.pending} onClick={reset}>{text('Start a new session', 'አዲስ ክፍለ ጊዜ ጀምር')}</button>
    </div>
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
  return <div role="group" aria-label={card.cardName || card.id} className="rounded-xl border border-neutral-700 p-3 space-y-3">
    <p className="font-bold">{card.cardName || card.frontText?.slice(0,80)}</p>
    <label className="flex gap-2"><input type="checkbox" checked={paused} onChange={e => setPaused(e.target.checked)}/>{text('Pause card', 'ካርዱን ለጊዜው አቁም')}</label>
    <label className="block text-sm">{text('Related group (same label for related cards)', 'ተዛማጅ ቡድን (ለተዛማጅ ካርዶች አንድ ስም)')}<input className="block w-full rounded bg-neutral-900 p-2 mt-1" maxLength={80} value={group} onChange={e => setGroup(e.target.value)}/></label>
    <button className={button} onClick={save}>{text('Save card settings', 'የካርድ ቅንብሮችን አስቀምጥ')}</button>
    <button className={button} disabled={!dirty} onClick={reset}>{text('Discard settings changes', 'የቅንብር ለውጦችን ሰርዝ')}</button>
    {(card.review?.failures || 0) >= 8 && <p className="text-sm text-amber-300">{text('Repeatedly forgotten: consider improving this question.', 'በተደጋጋሚ ተረስቷል፦ ጥያቄውን ማሻሻል ያስቡበት።')}</p>}
  </div>;
}
