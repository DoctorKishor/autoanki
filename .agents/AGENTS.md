# Workspace Rules for AutoAnki

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
5. **Framer Motion Everywhere & Unique Component Staggering**:
   - Framer Motion entrance animations are **required everywhere** across all pages, views, panels, and modals.
   - **Unique Per-Component Animations**: Every sub-component, card, header, control bar, widget, and list container within a page **MUST** have its own unique, staggered `motion.div` entrance animation rather than everything appearing at once (using staggered delays e.g. `0.05s`, `0.15s`, `0.25s`, directional vectors `y: -12`/`y: 16`/`x: -12`, and soft scaling `scale: 0.98 -> 1`).
6. **Pill Switcher & Toggle Motion Standard**:
   - All multi-option toggles, subtab switchers, and segment controls across the app **MUST** use the single sliding pill indicator design with exact `0.6s cubic-bezier(0, 0, 0, 1)` smooth deceleration motion transition (`transition: 'all 0.6s cubic-bezier(0, 0, 0, 1)'`).

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
