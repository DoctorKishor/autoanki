# Workspace Rules for AutoAnki

## 🚨 0. ZERO-DATA-LOSS PRIME DIRECTIVE (Highest Priority & Non-Negotiable)
- **Absolute Zero-Tolerance for Data Loss**: While modifying, refactoring, writing, or optimizing any part of the codebase, the agent **MUST** prioritize data preservation above all else and proactively detect, audit, and eliminate **ANY** bug, race condition, unhandled error, silent overwrite, accidental deletion, or loophole that could cause a user to lose data (flashcards, review logs, topics, notes, occlusions, study time, or settings).
- **Defensive Engineering**: Every state mutation, deletion, migration, cloud sync, backup, and restore pathway must be engineered defensively with non-destructive fallback mechanisms and rollback safety before changes are declared complete.

---

## 1. Design System & App Appearance Guidelines
All UI components, buttons, color schemes, theme modes (Light: `#e6ecf5`, Dark: `#222730`), Neumorphic elevations, Framer Motion parameters, and layout standards are documented in detail in:
[DESIGN_SYSTEM.md](file:///d:/Projects/Antigravity/auto-anki-app/DESIGN_SYSTEM.md)

### Key Appearance Rules:
1. **Never use pitch black (`#000000`) for Dark Mode**: Always use `#222730` base with `neu-card-dark`, `neu-btn-dark`, `neu-pressed-dark`.
2. **Hidden Scrollbars**: Maintain hidden scrollbars across all scrollable containers using `scrollbar-width: none !important` and `::-webkit-scrollbar { display: none !important; }`.
3. **Button Consistency**: Action buttons in header bars must be grouped in uniform single-row grids (`grid grid-cols-N gap-2 w-full`) using matching heights (`h-[36px]` for `sm`, `42px` for `md`, `48px` for `lg`).
4. **Save Actions**:
   - `Save Page` calls `saveQueueItemToCloud(activeQueueId)` (or `saveLocalPage`)
   - `Save All` calls `saveAllProcessedToCloud()` (handles both local database saving & cloud saving).

---

## 2. Architectural Direction (Local DB Transition)
- **Offline-First Local Database Model**: The application is actively transitioning from Firebase/Cloud Firestore to a 100% offline-first local database model powered by `src/services/localDb.js` (IndexedDB / `AutoAnkiLocalDB`).

---

## 3. Storage Policy & Flexibility
- **Primary App Data**: Flashcards, topics, decks, scans/pages, review logs, FSRS state, PYT data, health metrics, CAMP tracker data, and heavy user datasets **MUST** be stored in IndexedDB via `localDb.js`.
- **Utility Local Storage**: `localStorage` or `sessionStorage` **MAY** still be used where appropriate for lightweight app utilities (e.g., storing user API keys, dark mode preferences, or temporary session state).

---

## 4. UI-Driven Refactoring Workflow & Rules

### 4.1 UI-Driven Refactoring (For Non-Coder User)
- When the user describes a UI function, button, or menu (e.g., "the Flashcard Creator", "the Review Deck button", or "the Settings page"), automatically inspect and trace all of its underlying backend connections, components, and hooks.
- Identify any Firebase/Firestore read, write, or query dependencies linked to that UI element and transition those operations to `localDb.js` (IndexedDB).

### 4.2 Strict Modular Control
- Do **NOT** refactor or transition any menu, page, or UI feature from Firebase to `localDb.js` automatically.
- Only transition **ONE** specific UI function, menu, or page at a time, strictly when explicitly requested by the user.

### 4.3 Preservation & Anti-Chaos Rules
- Do **NOT** rename, delete, or reorganize existing files or folder structures unless explicitly requested.
- Do **NOT** refactor or "clean up" unrelated code in files being edited—only touch code directly connected to the UI function being transitioned.
- Ensure proper error handling is included for IndexedDB operations so failures don't silently break the UI.

### 4.4 Execution, Testing & Git Safety
- Refactor both **Desktop** and **Mobile** views for the requested feature to ensure dual-view parity.
- Keep all other untouched features running smoothly without side effects.
- Run `npm run build` after making changes to verify zero compilation errors.
- Once the build succeeds cleanly, make a Git commit to the `local-db-transition` branch with a simple, clear message describing what was changed.
- Explain what was transitioned in simple, non-technical terms, and wait for the user's next explicit command before touching anything else.

---

### 4.5 Thorough Auditing, Radical Transparency & Non-Sugarcoating Policy
- **Exhaustive Dependency Auditing**: When transitioning any UI function, page, or menu to LocalDB, perform a complete, exhaustive codebase audit for **ALL** primary handlers, secondary options, modals, background syncs, exports, auto-taggers, and bulk actions linked to that feature. Do **NOT** leave any secondary or hidden Firebase calls behind.
- **Zero Sugarcoating or False Claims**: Never claim that a page or feature is "completely cleared of Firebase" unless every single read, write, batch update, document reference, and listener across the entire subsystem has been individually inspected, verified, and refactored to IndexedDB (`localDb.js`).
- **Full Transparency on Uncertainty**: If any ambiguity exists, or if any secondary action connected to the feature still relies on Firebase, state it explicitly and honestly to the user immediately. Do not hide, gloss over, or sugarcoat remaining dependencies.

---

### 4.6 Proactive Loophole Auditing & Zero-Desync Enforcement (Mandatory Rule)
- **Zero-Tolerance for User-Discovered Loopholes & Broken Click Handlers**: The agent **MUST** proactively audit, trace, and eliminate all edge-case desynchronizations (Undo, Redo, Log Deletion, Manual Log Edits, Empty Logs, Queue Categorization) **AND** verify interactive click paths, modal DOM scoping across all subtabs, state initializations, and trigger events **BEFORE** declaring work complete. The agent must **NEVER** assume code works perfectly based on build success alone; every UI button, modal trigger, and state mutation must be audited for unmounted conditional branches and subtab scoping loops.
- **Mandatory 360-Degree State & Queue Integrity Rules**:
  - **Global Modal & Action Scoping**: Any modal or overlay triggered from a top header button MUST be mounted in a parent scope accessible to ALL subtabs, ensuring clicking the button triggers the UI regardless of which subtab or view is active.
  - **Queue Preservation on Undo/Redo**: Undoing or redoing an action **MUST** return the item to its exact queue position with 100% visibility. Items must **NEVER** disappear, go invisible, or fall into an unassigned state.
  - **Zero-Log FSRS Reset Standard**: When all logs for a topic or session are deleted/undone, FSRS parameters ($S, D, I, R, \text{due date}, \text{lapses}, \text{isLeech}$) **MUST** reset to unstudied baseline (`S: New`, `D: Unstudied`, `0.0 days`, `0.0 / 10`). No residual values may persist.
  - **Log Structure Unpacking**: All stats components (`FsrsStatsTab`, Analytics, Day Summaries) **MUST** correctly unpack nested log arrays (`dayLog.fsrsLogs`) across all timeframes (`1M`, `3M`, `1Y`, `ALL`).
- **Pre-Response Audit Checklist**: Before presenting any feature or fix to the user, proactively test and verify every secondary state mutation (Undo, Redo, Delete, Clear All, Unstudied Card Render, Empty Log Array, Filtering Cutoff) and click-handler DOM path across all active subtabs to guarantee zero dead buttons or desynchronizations across all components.

---

### 4.7 Mandatory Component Scope & Variable Preservation Standard
- **Zero-Accidental-Deletion Policy**: When modifying or replacing code blocks in components, the agent **MUST** verify that all destructured props, `useState` hook declarations, and internal local variables used downstream in the component are strictly preserved.
- **Pre-Commit Symbol Audit**: Before completing any edit in a UI component, explicitly verify that every symbol referenced in the rendered JSX (e.g. `toastMessage`, `examProfiles`, `cleanName`) has a valid, active declaration within the scope of that component.

---

### 4.8 Strict FSRS Algorithm Isolation & Read-Only Predictive Timing Standard
- **Zero-FSRS-Interference Policy**: The Dynamic Predictive Timing Engine **MUST** operate strictly as a **read-only consumer** of FSRS parameters ($S, D, R, I, \text{lapses}, \text{nextReviewDue}$) and historical study logs.
- **Strict Read-Only Data Boundary**: The timing engine is **strictly forbidden** from mutating, overwriting, altering, or influencing FSRS memory calculations, interval scheduling, weights, stability adjustments, or retrievability formulas in any way.
- **Isolating Predictions from Scheduling**: Estimated study durations are exclusively for UI display, workload forecasting, and schedule balancing; FSRS alone governs spaced repetition review intervals.

---

### 4.9 Mandatory Full-Pipeline Backup & Export Integration Standard
- **Universal Sync & Export Parity Rule**: Whenever ANY state, model property, user preference, metadata field, card attribute (e.g. `isSuspended`, tags, bounding boxes, occlusions), topic metric, review log, or feature is added, modified, or corrected in the application, it **MUST** be explicitly audited and accounted for across ALL backup, sync, and export pipelines:
  1. **Universal Snapshot & Vault Backup (`exportFullUniversalSnapshot` / `importUniversalSnapshot`)**: Must capture, serialize, validate (FNV-1a checksum), and restore the new/modified data across all relevant IndexedDB stores and `localStorage` snapshot keys.
  2. **Google Drive Cloud Sync (`extractLocalBundles` / `hydrateLocalBundles`)**: Must partition, serialize (binary-safe), and hydrate the data within the appropriate sync bundle (Cards, Curriculum, Study Logs, FSRS, or CAMP).
  3. **Multi-Format Deck Exporters (`exportDeck`)**: All export formats (`.apkg`, `.anki` TSV, `.notion` CSV, `.pdf`, `.json`) must accurately map, format, and serialize the new attributes according to target platform specifications (e.g. Anki SQLite schema conventions, tag formatting with space delimiters, queue states, and column headers).
  4. **Rollback & Restore Integrity**: Ensure importing or restoring from any backup/export preserves 100% of the new fields without data corruption, loss, or silent defaults.




