# Ha-Hu Cards

A powerful, intuitive, and beautifully designed flashcard and exam study application. 

🎉 **100% Free & Open Source**  

---

## 📖 What is Ha-Hu Cards?

Ha-Hu Cards is a modern study platform designed to help you memorize information efficiently. Whether you are studying languages, science, or preparing for crucial exams, Ha-Hu Cards leverages spaced repetition concepts and a clean interface to make learning seamless.

You can use the app instantly as a guest (saving data directly to your device) or sign in securely with Google to sync your study decks across all your devices via the cloud.

---

## 🚀 How to Use It

1. **Get Started Instantly:** Open the app and start as a guest, or click "Sign In" to create a cloud-synced account.
2. **Explore the Sample Deck:** When you first join, a "Try sample" folder is automatically generated so you can see how cards look and feel.
3. **Create Your Folders:** Organize your study materials by creating new folders for different subjects or exams.
4. **Build Flashcards:** Inside a folder, create new flashcards. You can add text, customize text size/color, and even upload and crop images for both the front and back of the cards.
5. **Study Mode:** Click on a folder and hit the **Study** button. The app will test your knowledge, allowing you to flip the cards and grade your memory to optimize your next review session!

---

## 🛠️ What It Is Made Of (Tech Stack)

Ha-Hu Cards is built using modern, industry-standard web technologies to ensure a fast, secure, and responsive experience:

* **Frontend Framework:** [React 19](https://react.dev/) & [TypeScript](https://www.typescriptlang.org/) for robust and interactive user interfaces.
* **Build Tool:** [Vite](https://vitejs.dev/) for lightning-fast compilation and optimized production bundles.
* **Styling & Animations:** [Tailwind CSS](https://tailwindcss.com/) for fluid, responsive design and [Framer Motion](https://motion.dev/) for smooth page transitions and card flips.
* **Backend & Database:** [Firebase](https://firebase.google.com/) (Firestore & Authentication) for secure, real-time cloud data syncing and user login.
* **Icons:** [Lucide React](https://lucide.dev/) for clean, beautiful iconography.
* **PWA Ready:** Configured as a Progressive Web App, meaning it can be installed on your device for fast access and offline capabilities.

---

*Study smarter, not harder.*

## Development and verification

Use Node.js 22 and npm. `package-lock.json` is the authoritative dependency lockfile.

```sh
npm ci
npm test
npm run lint
npm run build
npm run dev
```

The UI supports **English and Amharic**. There is no first-run intro tour.
Local guests can create and import cards. Local libraries use one atomic storage
record; older folder/card storage is read automatically and retained as a backup.
A storage-read failure stops mutations instead of treating damaged data as empty.

### Accounts, backups, and deployment

- Firebase anonymous accounts are linked when upgrading to a new Google account,
  preserving their UID. If the Google account already exists, export guest decks
  before signing out; the app does not silently abandon the anonymous account.
- Local guest libraries can be copied to Google accounts with confirmation. The
  original local copy is retained. An interrupted copy can be retried without
  overwriting already-copied records.
- Deck exports are portable content packages, **not complete account backups**:
  folder hierarchy and review history are not included.
- Large cloud operations are committed in bounded batches, not one transaction
  across the whole library. On import failure, inspect the reported completed
  count and destination before retrying. Concurrent deletion/creation from multiple
  devices still requires care.
- Deploy `firestore.rules` to the configured Firebase database separately. A Vite
  build does not deploy security rules. The rules enforce folder ownership and
  valid parent levels; live/emulator verification is needed before production deployment.
- PWA caching covers the app shell. Cloud library persistence across offline browser
  restarts is not guaranteed. Browser/device suspension can delay notifications;
  Lock-In is not a guaranteed background alarm service.
- The compatible gRPC override patches Firebase's pinned Node-only dependency;
  the esbuild override patches tsx's tooling dependency. Re-run tests/build/audit
  when upgrading them.

### Critical interaction checks

The browser suite exercises local-guest flows without contacting production Firebase:
unsaved edits, keyboard focus, filtered selection, explicit moves, failed deletion,
image removal, repeated submissions, session exit, and narrow-screen controls.

```sh
npx playwright install chromium
npm run test:browser
```

Dialogs prevent duplicate submissions and keep errors beside the relevant action.
Editors warn before discarding changes; active transfers block in-app navigation.
These protections do not make large cloud operations atomic across every batch.

### Account changes, refreshes, and concurrent edits

- Account changes are blocked while this tab has a pending mutation. Cloud mutations
  recheck the current UID; an anonymous cloud account is never treated as local storage.
  External account changes remount the private UI to clear the previous account's state.
- Guest mutations use Web Locks for cross-tab serialization where supported, with a
  same-tab queue as fallback. Older browsers without Web Locks still need care when
  editing the same guest library from several tabs.
- Editor drafts are best-effort, account/folder/card-scoped **sessionStorage** recovery.
  Reopen the same editor after refreshing the same tab. Drafts expire after seven days,
  clear on save/discard, and retain the original content baseline for conflict detection.
  Closing a tab, clearing site storage, quota errors, and OS termination can defeat recovery.
- Pending writes request the browser's refresh/close warning. Forced refresh is not a
  transaction cancellation. Cloud writes already accepted may still commit. Large cloud
  moves/deletes/imports consist of multiple batches and are not globally atomic; inspect
  the destination after an interruption. Retrying the exact same file into the same destination uses retained recovery IDs while browser storage is intact.
- Cloud folder deletion marks the root as deleting before enumeration. Matching rules block
  writes and moves throughout the subtree; interrupted cleanup can be retried. This
  protection requires the new rules to be deployed (see release checklist below).
- Google OAuth popups, domain allowlists, real token expiry, Firestore security rules,
  offline/reconnect behavior and cross-device operations need staging/emulator testing.
  Local browser tests do not contact production Firebase or prove cloud availability.


### Transfer format and recovery

- Export Deck includes all cards directly in the current folder, regardless of date
  filter. Global Today/Tomorrow/Upcoming exports include only their matching cards. Explicit selection/single-card export includes only those cards. Subfolders
  are not included; the UI warns before exporting a parent with subfolders.
- Embedded raster images and bundled sample images are packaged in ZIP; HTTP/app-path
  image references remain links, so those images require their original host to remain
  available. Exports preserve content and styling, not review history or folder trees.
- A guest full-deck import creates its folder and cards in one atomic library write.
  Cloud imports still use multiple transactions. A small recovery record in localStorage
  stores stable folder/card IDs (not the deck contents). After interruption, choose the
  exact same file and destination to retry without overwriting previously imported cards.
  Changing the file/destination or clearing browser storage starts a separate import.
  Completed receipts are retained to deduplicate simultaneous submissions and expire
  after 30 days. A later intentional import creates another copy. Active checkpoints
  never auto-expire. Resume/copy/cancel is explicit; confirmed deleted items are not
  automatically recreated. Transfers are never automatically replayed after refresh.
- ZIP/JSON versions and declared card counts are checked, missing image files fail
  explicitly, and JSON referring to separate image files must be imported as its ZIP.
  Images are stored without recompression; only manifest text is compressed.


### Final hardening pass: rollout and verification

**Do not ship the new cloud deletion client against old rules.** It deliberately fails
closed rather than falling back to unsafe folder deletion. The database configured in
`firebase-applet-config.json` is a named database, not necessarily `(default)`.

1. Run `npm ci`, `npm test`, `npm run lint`, `npm run build`, and `npm run test:browser`.
2. With Java 21 installed, run `npm run test:rules`. This uses only `demo-hahu-cards`
   and the emulator config; it must never be pointed at production. CI has a separate
   Java-enabled rule-test job. The sandbox lacked Java, so emulator tests were **not
   verified locally** during this pass.
3. Verify Google linking/sign-out and cross-device deletion/import in staging.
4. Deploy tested `firestore.rules` to the actual named database, then release the client.
   No rules were deployed by this coding session. Older clients cannot delete folders
   without first marking them for deletion; use the current app to finish cleanup.
5. Verify the deployed rules, not just the repository copy, before calling cloud
   behavior production-ready. An owner bypassing the app with custom writes can still
   delete their own marked parent prematurely; automatic server-side repair/cleanup
   and scheduled backups are not supplied by this client-only project.

Other changes:
- Guest profiles offer Link Google account; cloud-anonymous sign-out warns of losing
  access. Account-generation checks reject stale queued work after account changes.
- Migration IDs are hashed per destination account. Existing same-account legacy IDs
  are retained on retry; conflicting-account legacy IDs are not reused.
- Samples are opt-in via Try sample, so empty libraries are never silently repopulated.
- Rename/move actions check the originally opened name/destination. Cloud bulk moves
  use bounded transactions and remain partially committable across batches.
- Local legacy orphan references no longer block unrelated safe edits. Recover items
  preserves a pre-repair backup in `hahu_repair_backup_<uid>`, promotes orphan folders,
  and moves orphan cards into Recovered cards. Recovery aborts if backup storage fails.
- Invalid cloud cards are reported and kept in the database; valid cards still display.
  Schema-corrupt local libraries remain protected from overwrite, requiring recovery
  from backup rather than automatic destructive normalization.
- Service-worker update prompts wait for dirty editors, study sessions, authentication,
  and pending mutations. Slow-operation messages do not claim an uncertain write failed
  or automatically replay it.
- Image signatures are checked cheaply, without recompressing images. This detects
  mislabeled/truncated headers but is not a full image decoder or decompression sandbox.

Remaining verification/architecture work: real Google OAuth/mobile browser scenarios,
large-library low-memory-device profiling, authenticated server backup/repair services,
full folder-tree backup format, and browser behavior without Web Locks. App bundle-size
warnings remain; no broad UI rewrite or unmeasured storage-engine migration was made.

### Sign-in and timed review update

- The login page and account panel use the same Firebase Google popup/link flow;
  the standalone Google Identity Services button/script is no longer loaded.
- Profile images prefer the linked Google provider's photo, then the Firebase user
  photo, then initials if the image is missing or cannot load.
- Speed Recall and Anki both require a positive selected timer. Reveal is disabled
  until it expires, with wall-clock catch-up after suspension; restart locks it again.
- Real Google account sign-in and photo delivery still need a deployed-domain check.

### FSRS review queue (requires updated Firestore rules)

**Deploy `firestore.rules` to the configured named database before deploying this
client.** Existing rules reject the new `review` map. Do not bypass the rules or
switch the database to test mode. Run `npm run test:rules` with Java 21 before release;
this workspace lacks Java, so the new emulator tests must run in CI/a Java-enabled
checkout. Existing legacy cards remain valid under the new rules.

Entry points:
- **Start / resume reviews** opens the saved review session (or all cards for a new
  session). Each device/account has a separate recoverable session.
- Selecting **Spaced Review** from a card starts its folder's queue, not just that card.
  If a session is already saved, explicitly resume it or start a new one using the
  newly selected folder/thinking time. Speed Recall and Lock-In keep their own player.

Implemented behavior:
- A due-now queue advances after each successful rating. New, learning, ready-now,
  and scheduled-later counts are separate. Learning cards return automatically at
  their due time while the review remains open. Every card still has a reveal timer.
- `ts-fsrs` **5.2.3**, pinned, uses default parameters with 90% requested retention and
  deterministic scheduling (fuzz off). FSRS still maintains each card's memory state
  (stability, difficulty, repetitions, lapses, learning steps).
- First-review timing is a fixed policy shown on the rating buttons: **Forgot 2 hours,
  Difficult 4 hours, Remembered 1 day, Easy 3 days**. Cards that have not graduated
  (new/learning) use these exactly, so a rating always produces the interval shown.
  Graduated review/relearning cards keep their longer FSRS interval and use the chosen
  answer's value only as a minimum, so mature schedules are never shortened and
  answers stay ordered. Forgetting a graduated card returns it after 2 hours rather
  than in one minute. A first interval of a day or more (Remembered/Easy) graduates
  the card to a normal review state, so it is labelled **Review** and counts toward
  the daily review limit instead of masquerading as an in-session practice step. The stored due date, legacy `interval` and
  `memory.scheduled_days` are written together, so validation and the Firestore rules
  continue to agree. Changing these constants requires updating the button expectations
  in `tests/browser/review-queue.spec.ts` and `tests/fsrsReview.test.ts`.
  We do not claim full Anki equivalence, personalized parameter fitting, or reminders
  while the app is closed.
- Existing schedules without history retain their due date and initialize a
  conservative approximate FSRS state only on their first review/settings save.
  Exact historical memory state cannot be reconstructed from the old ease/interval.
- Daily limits default to 20 new cards and 200 review cards. Counts use distinct cards
  across the loaded account library and the device's local calendar day. Learning
  steps bypass limits, and remaining ready work is visibly reported. Limits are
  client-side workload controls, not strict transactional account-wide quotas:
  simultaneous devices, differing time zones, or deletions can affect counts.
- Revealed state, the selected card, deadline, limits, pending operation, and last undo
  are saved locally. Reload resumes without replaying a completed write. Saved intent
  precedes a rating; operation IDs and optimistic revisions make retries idempotent.
  A second tab takes ownership and disables the earlier window. Other devices may
  study independently, but stale writes/undo are rejected by card revisions.
- Undo restores schedule fields only, preserves edited content, records an undo in
  history, and refuses to overwrite newer reviews or review settings. Pending saves
  must be retried/reconciled before another action or a new session.
- Manage cards can pause/unpause cards and assign related-group labels. Related cards
  are deferred until tomorrow after a sibling is studied; identical question text in
  the same folder is grouped automatically. This can be disabled. Management is paged
  and searchable rather than mounting an entire large library at once.
- Eight failed recalls trigger a non-destructive suggestion to improve or pause the
  card. Cards are never automatically rewritten, suspended, or deleted.
- Card review metadata (FSRS memory, pause/group state, revision, daily markers) syncs
  with the card. The most recent 100 timestamped rating/undo entries are retained per
  card to bound document/storage growth; lifetime counters persist. This is not an
  unlimited audit log or history-based parameter optimizer. Session/limits/undo are
  device-local; deck export remains content/style-only and excludes review metadata.
- Concurrent question edits reset the thinking timer and hide the answer. A compact
  content-change check rejects a rating if the stored question changed before saving.
  Ordinary editor saves/renames/moves do not overwrite review fields.

Tests cover FSRS mixed sequences, first-interval mapping, daily limits, sibling spacing,
legacy initialization, strict metadata validation, idempotent retries, undo conflicts,
refresh recovery, lost checkpoint recovery, pausing, tab ownership, and existing modes.
Cloud transactions and rule changes require the emulator/CI gate and a real-account
smoke test after deploying the rules. No production deployment was performed here.


### Simplified Spaced Review screen

The review screen deliberately has no settings, management or confirmation
panels. It contains only the card, the thinking timer, Reveal Answer, the four
ratings, and close/fullscreen in the corners. Removed from study:

- the options panel (Done/Ready/New/Practising counters, daily limits, thinking
  time, related-card toggle, manage cards, undo, start-new-session)
- the resume-vs-new-session prompt, the manage-cards editor and its dirty-state
  prompts

Compatibility is preserved in the saved data rather than in the UI:
- **Sessions resume silently.** Opening reviews continues the saved session; a
  review started from a card's Spaced Review action adopts the newly chosen
  thinking time and starts that folder only when the folder changes.
- **Daily limits stay enforced.** When ready cards remain beyond the limit, the
  done screen shows the count and a single **Study them now** button, which
  raises the stored limits instead of exposing settings.
- **Paused cards** stay out of the queue; the done screen offers **Resume paused
  cards** in one tap (uses the existing revision-checked settings action).
- **Related-card spacing and daily counts** are unchanged, and are only
  mentioned when they would otherwise hide work.
- Rating/undo history, pending-save recovery and cross-tab ownership rules are
  unchanged. A failed save still exposes Retry/Reload so no rating is lost.

### Card notes and plain-language labels

- The editor includes an optional, 1,000-character card note for reminders such as
  “This topic may be on the exam.” Open **Note** in the card list to read it without
  starting a study session. Notes are not answer inputs and do not appear on study
  faces, affect grades, or reset a running review timer.
- Notes participate in draft recovery, dirty/discard checks and editor conflicts.
  They are stored with the card, survive moves/migration and round-trip in shared
  decks. The editor explicitly warns that exported/shared cards include their notes;
  notes are not a separate private journal.
- Deploy the latest rules before the client: they allow an optional string `note`
  of at most 1,000 characters. Existing cards without notes need no migration.
- User-facing mode/rating labels are now **Spaced Review**, **Forgot**, **Difficult**,
  **Remembered**, and **Easy**, with equivalent Amharic labels and explanations.
  Internal mode/rating identifiers and FSRS scheduling are unchanged.
- Calendar buckets say **Review Today/Tomorrow** (they include scheduled times later
  in that day); the timed queue says **Ready to review** only for cards ready now.
  Technical scheduler names are kept out of introductory help, and unsupported
  promises about never forgetting/fixed review frequencies have been removed.

### Review-flow hardening

- Review writes reject malformed actions and undo snapshots before touching
  storage. Transactions, idempotent retries and revision checks still govern the
  actual write; saved-session recovery now also rejects mismatched undo due dates,
  non-object slots and out-of-range schedule values.
- A transaction acknowledgement is merged into the live card snapshot, so a
  completed rating cannot briefly re-queue the old due card or overwrite a newer
  remote revision.
- Cards in missing or deleting folder trees are excluded from review for both
  local and cloud accounts, matching the server rule that requires an active
  ancestor chain.
- Unsaved **paused/group** edits in Manage cards now prompt before closing,
  switching screens, searching, paging or starting a new session; remote updates
  no longer overwrite the open draft, and a discard control is available. Chosen
  daily limits survive **Start a new session**.
- Daily state changes are validated on read and on write, including impossible
  learning-step counts, lapses greater than repetitions, and reviewed states
  without a prior review. Legacy zero due dates and oversized intervals migrate
  safely and can still be undone.
- An active learning step is never suppressed by related-card spacing.


### Study screen and session continuity

- Spaced Review now shares the same distraction-free stage as Speed Recall:
  close and fullscreen sit in the corners, the card is centred, the thinking
  timer is above it, and **Reveal Answer** unlocks only when the timer ends.
  Ratings appear on the same stage after the reveal. Scheduling details moved
  behind one options button instead of filling the study screen.
- All three modes use one `FlipCardStage`. The card turns around smoothly, the
  back face is pre-rotated so the answer never appears mirrored, and the answer
  is not rendered in the DOM (or exposed to a screen reader) before reveal.
  Imported images are resolved through the same helper as the card list, so
  sample-alias and data-URL images keep their aspect ratio in review.
- Mode help is limited to a purpose, a one-line explanation, a short "how",
  and a single example. Long descriptions, algorithm names and English
  jargon such as "Reveal Delay" were removed from the primary help copy.
- Lock-In sessions resume automatically after a refresh or reopened tab. The
  saved record already carries the state, remaining time, reveal delay, cycle
  count and timer anchor, so reloading continues the same session instead of
  asking the learner to find and press Resume. Ending a session clears the
  record, and a newer tab still supersedes an older one.
