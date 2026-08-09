# Local Database Transition Tracker

> [!IMPORTANT]
> **Branch**: `feature/local-db-transition`  
> **Rule**: Items are only checked off (`[x]`) **after explicit user confirmation** that the menu/feature is fully stable.

---

## 🏗️ Core Infrastructure
- [x] **Step 1: Local Database Engine Setup** (`src/services/localDb.js`)
  - [x] IndexedDB schema definition (`AutoAnkiLocalDB` v1)
  - [x] Object stores: `topics`, `settings`, `camp_tracker`, `health_metrics`, `pyt_data`, `kv_store`
  - [x] CRUD helper methods & build verification
- [x] **Bypass Cloud Login Screen** (`src/App.jsx`)
  - [x] Auto-load `DEFAULT_LOCAL_USER` (`uid: 'local_user'`) for instant offline launch

---

## 📱 Application Menus & Features Transition Status

### [x] 16. ⚙️ Settings & Preferences (`settings`) — [COMPLETED]
- [x] **Settings Local Database Transition**
  - [x] **16.1 Bottom Nav Layout** (`settings/bottomNav` -> Local DB `saveLocalSetting('bottomNav')`)
  - [x] **16.2 Dashboard Widgets Order** (`settings/dashboard` -> Local DB `saveLocalSetting('dashboard')`)
  - [x] **16.3 Folder & Deck Hierarchy Paths** (`settings/hierarchy` -> Local DB `saveLocalSetting('hierarchy')`)
  - [x] **16.4 Study Room Preferences & Sounds** (`settings/studyRoomPreferences` & `settings/studyRoomBackgrounds` -> Local DB `saveLocalSetting('studyRoomPreferences')` & `saveLocalSetting('studyRoomBackgrounds')`)
  - [x] **16.5 OBS Security Overlay Token** (`settings/obsToken` -> Local DB `saveLocalSetting('obsToken')`)
  - [x] **16.6 Remove Cloud Save/Restore Toast Warnings & Replace with Instant Local DB Auto-Save**
  - [x] **16.7 Offline API Keys Persistence (Gemini & ImgBB keys stored in IndexedDB)**

### 1. 📊 Dashboard (`dashboard`) — [IN PROGRESS]
- [ ] **Dashboard Overview & Grid**
  - [ ] Widget configuration persistence
  - [ ] Daily progress gauge & streak tracker
  - [ ] Live study tracker & sprint timeline
  - [ ] Contribution activity heatmap
  - [ ] Hierarchy sunburst & library growth curve

### 2. 🎴 Card Generator (`cards`) — [COMPLETED]
- [x] **AI Card Generation & Local DB Transition**
  - [x] **2.1 Remove Triage Mechanism Completely** (Purge OCR triage inbox queue, `isPending` flags, approve/discard modals)
  - [x] **2.2 Direct Local Page & Scan Storage** (Store scan images/PDF page references directly in IndexedDB via `saveLocalPage`)
  - [x] **2.3 Purged Image Occlusion & Firebase Sync** (Removed image occlusion requirement & Firebase sync retries per user instruction; 100% offline IndexedDB saving)
  - [x] **2.4 Local Cloze & Q&A AI Flashcard Saving with All 12 Gemini Parameters** (Save all 12 Gemini schema parameters directly to IndexedDB via `saveLocalCard`)

### 3. 📚 Library & Decks Manager (`library`) — [IN PROGRESS]
- [ ] **Library & Decks Manager Local DB Transition (11 Key Points)**
  - [x] **3.1 Subject & Topic Hierarchy Trees** (`saveLocalSetting('hierarchy', { paths })` handles create, drag & drop move, rename, and delete 100% in IndexedDB)
  - [x] **3.2 Initial Card & Page Counts** (Replaced `getCountFromServer` with `getLocalCards().length` on mount)
  - [x] **3.3 Folder Cards Loader** (Replaced `loadFolderCards` range queries with local IndexedDB filtering via `getLocalCards()`)
  - [x] **3.4 Global Flashcard Loader** (Replaced `loadAllCards` delta sync queries with `getLocalCards()`)
  - [x] **3.5 Scans / Pages Loader** (Replaced `loadPages` delta sync queries with `getLocalPages()`)
  - [x] **3.6 Trash & Recovery Loader** (Replaced `loadTrash` Firestore queries with `getLocalKV('trash_pages')` & `getLocalKV('trash_cards')`, added automatic 30-day purge)
  - [x] **3.7 Bulk Page Move, Deletion & Recycle Bin Actions** (Replaced `handleBulkMove`, `deletePage`, `deleteCard`, `handleEmptyRecycleBin`, `handleRestoreCard`, `handlePermanentDeletePage`, `handlePermanentDeleteCard` with local IndexedDB operations; removed all Firebase Firestore batches and calls)
  - [x] **3.8 State Variable Naming Cleanup** (Refactored `cloudPages` -> `libraryPages` across the application to clarify 100% offline IndexedDB architecture)
  - [x] **3.9 Dual Storage Mode (Local DB vs. ImgBB Cloud)** (User can select Local DB base64/Blob storage or ImgBB Cloud in settings; both modes persist 100% of pages and cards locally to IndexedDB)
  - [ ] **3.10 Offline Study Logs & Analytics Persistence** (Migrate `loadStudyLogs` from Cloud Firestore `artifacts/.../studyLogs` to IndexedDB `saveLocalSetting('studyLogs', logs)`)
  - [ ] **3.11 Offline Guest User Context** (Remove mandatory `if (!user)` cloud auth checks in library operations, defaulting to `DEFAULT_LOCAL_USER`)

### 4. 🧠 Study & Anki Review (`study`)
- [ ] **Flashcard Review Session**
  - [ ] FSRS spaced-repetition scheduling algorithm integration
  - [ ] Review logs & card interval updates
  - [ ] Rating triggers (Again / Hard / Good / Easy)
  - [ ] Offline audio / image card preview rendering

### 5. ⏱️ Study Room (`studyRoom`)
- [ ] **Focus Timer & Study Room Hub**
  - [ ] Focus timer & Pomodoro hub persistence
  - [ ] Live study session logger
  - [ ] Sprint timeline recording
  - [ ] Background ambience audio settings

### 6. ⛺ CAMP Tracker (`campTracker`)
- [ ] **Bed-to-Book & CAMP Efficiency Tracker**
  - [ ] Student info & Target UID storage
  - [ ] Bed-to-Book daily logs
  - [ ] Session history & timer logs
  - [ ] Efficiency charts & progress history

### 7. 📈 Analytics & Performance (`analytics`)
- [ ] **Study Performance & Revision Analytics**
  - [ ] Revision history timeline
  - [ ] FSRS retention & mastery curves
  - [ ] Grand tests score tracking
  - [ ] Subject study duration distribution

### 8. 🩺 Correlation Dashboard (`correlation`)
- [ ] **Health & Productivity Correlation**
  - [ ] Sleep score & duration logging
  - [ ] Workout duration & intensity logs
  - [ ] Live health metrics correlation engine

### [x] 9. 🏷️ PYT Manager (`pytManager`) — [COMPLETED]
- [x] **Previous Year Topics Manager**
  - [x] Transferred `pyt_topics` storage completely to IndexedDB (`STORES.PYT_DATA`) via `saveLocalPytTopic` and `getAllLocalPytTopics`
  - [x] Purged all Firebase Firestore collection references, listeners, and auto-migrations for `pyt_topics`
  - [x] Rethemed Desktop and Mobile PYT Manager views to dual-themed Neumorphism design system

### 10. 📝 PYT Logger (`pytLogger`)
- [ ] **PYT Practice Session Logger**
  - [ ] Question solving session logs
  - [ ] Subject accuracy & timed test analytics

### 11. 🎯 Subject Tracker (`subjectTracker`)
- [ ] **Syllabus Coverage Tracker**
  - [ ] Subject completion percentage
  - [ ] Targeted revision milestones & goals

### 12. 📅 Study Scheduler (`studyScheduler`)
- [ ] **Exam & Revision Scheduler**
  - [ ] Exam target date allocation
  - [ ] Daily revision target calculations
  - [ ] Schedule calendar storage

### 13. 📦 Export & Backup Manager (`export`)
- [ ] **Data Export & Local Backup Tools**
  - [ ] Local IndexedDB JSON export & full system restore
  - [ ] Anki package (.apkg / JSON) export
  - [ ] Image verification modal pipeline

### 14. 🎨 Prompt Studio (`prompt`)
- [ ] **AI Prompt Customizer**
  - [ ] Custom AI flashcard generation templates
  - [ ] System prompt preferences

### 15. 📺 OBS Overlay (`obsOverlay`)
- [ ] **Stream Broadcast Overlay**
  - [ ] Live study timer broadcast view
  - [ ] Live streak & active deck overlay

### 17. 🗑️ Trash / Recycle Bin (`trash`)
- [ ] **Deleted Items Bin**
  - [ ] Trash cards, topics, and pages storage
  - [ ] Permanent delete & restore actions

### 18. ℹ️ About & System Status (`about`)
- [ ] **System Architecture & DB Status**
  - [ ] Local database storage usage breakdown
  - [ ] Storage quota & health diagnostic tools
