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
