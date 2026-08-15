# 🩺 AutoAnki — Complete Application Feature Catalog & Technical Manual

This document provides a comprehensive, verified, and detailed catalog of every single module, tab, sub-feature, modal, service, and algorithm across the **AutoAnki** codebase—organized according to the 4 primary application navigation categories.

---

## 📑 Application Navigation Architecture

AutoAnki organizes its 17 modules into 4 specialized categories:
1. **⚡ Focus & Review**: High-yield study execution, FSRS-4.5 spaced repetition review, and workload scheduling.
2. **📚 Content & Knowledge**: Medical textbook ingestion, Vision AI card extraction, 19 medical subjects, and NEET PG PYT indices.
3. **📊 Progress & Metrics**: CAMP milestone protocol, counseling rank predictors, and nested Sunburst deck charts.
4. **🛠️ Tools & System**: Official Anki APKG compiler, AI prompt tuning, OBS stream overlays, local database manager, and Chrome extension.

---

## Table of Contents
- [1. Architecture & Storage Model](#1-architecture--storage-model)
- [2. Category I: Focus & Review](#2-category-i-focus--review)
  - [2.1 Dashboard (`dashboard`)](#21-dashboard-dashboard)
  - [2.2 Smart Review Hub & FSRS-4.5 Engine (`smartReview`)](#22-smart-review-hub--fsrs-45-engine-smartreview)
  - [2.3 Study Room & Focus Lounge (`study`)](#23-study-room--focus-lounge-study)
  - [2.4 Study Scheduler (`studyScheduler`)](#24-study-scheduler-studyscheduler)
- [3. Category II: Content & Knowledge](#3-category-ii-content--knowledge)
  - [3.1 Library & PDF Ingestion (`library`)](#31-library--pdf-ingestion-library)
  - [3.2 Cards Manager & AI Generation (`cards`)](#32-cards-manager--ai-generation-cards)
  - [3.3 Subject Tracker — 19 Subjects (`subjectTracker`)](#33-subject-tracker--19-subjects-subjecttracker)
  - [3.4 PYT Manager — Previous Year Topics (`pytManager`)](#34-pyt-manager--previous-year-topics-pytmanager)
  - [3.5 PYT Logger & Revision Heatmap (`pytLogger`)](#35-pyt-logger--revision-heatmap-pytlogger)
- [4. Category III: Progress & Metrics](#4-category-iii-progress--metrics)
  - [4.1 CAMP Tracker — Milestone Protocol (`campTracker`)](#41-camp-tracker--milestone-protocol-camptracker)
  - [4.2 Analysis Suite & Counseling Rank Predictor (`analytics`)](#42-analysis-suite--counseling-rank-predictor-analytics)
- [5. Category IV: Tools & System](#5-category-iv-tools--system)
  - [5.1 Exporter Hub & Anki APKG Compiler (`export`)](#51-exporter-hub--anki-apkg-compiler-export)
  - [5.2 AI Prompt Editor (`prompt`)](#52-ai-prompt-editor-prompt)
  - [5.3 OBS Overlay Customizer (`obsOverlay`)](#53-obs-overlay-customizer-obsoverlay)
  - [5.4 Settings & LocalDB Control (`settings`)](#54-settings--localdb-control-settings)
  - [5.5 Recycle Bin / Trash (`trash`)](#55-recycle-bin--trash-trash)
  - [5.6 About Page & Manual (`about`)](#56-about-page--manual-about)
- [6. Specialized Modals & Utility Components](#6-specialized-modals--utility-components)
- [7. Core Algorithms & Background Services](#7-core-algorithms--background-services)
- [8. Chrome Extension Ecosystem](#8-chrome-extension-ecosystem)

---

## 1. Architecture & Storage Model

* **Offline-First Local Database**: Powered by `src/services/localDb.js` using browser **IndexedDB** (`AutoAnkiLocalDB`).
* **Sub-millisecond Queries**: Fast in-memory caching and indexed lookups for flashcards, logs, and subject hierarchies with zero cloud roundtrip latency.
* **IndexedDB Object Stores**:
  * `flashcards`: Active card items (Q&A, tags, deck, source page, bounding boxes, FSRS parameters).
  * `studyLogs`: Historical study time, question count, and scorecard entries.
  * `campTracker`: Milestone completion stamps and subject progress for the 19 medical subjects.
  * `pytData`: NEET PG / INI-CET Previous Year Topics and revision frequency counts.
  * `topics` & `topicNotes`: Medical topic definitions, notes, and study links.
  * `fsrsLogs`: Detailed review log history ($S, D, R, I$, review intervals, rating grades).
  * `settings`: API keys, theme modes, navigation layouts, and custom prompts.
* **Cloud Backup Integration**: Optional private backup to the user's personal GitHub repository via Personal Access Token (PAT).
* **Dual Design System**: Neumorphic styling with soft elevations:
  * **Light Theme**: `#e6ecf5` base with `neu-card-light`, `neu-pressed-light`, `neu-btn-light`.
  * **Dark Theme**: `#222730` base with `neu-card-dark`, `neu-pressed-dark`, `neu-btn-dark` (never pitch black `#000000`).
  * **Sliding Pill Transitions**: Deceleration curve `0.6s cubic-bezier(0, 0, 0, 1)`.

---

## 2. Category I: Focus & Review

### 2.1 Dashboard (`dashboard`)
*Source: `src/App.jsx`, `src/components/DashboardGrid.jsx`*
* **Central Command Center**: Real-time overview of active study progress, streak status, and due reviews.
* **Live Study Tracker Widget**:
  * Active session timer with live Start, Pause, Resume, and Stop controls.
  * Today's accumulated study hours counter (`getLiveTodayHours()`).
  * Session hour commitment directly to local IndexedDB logs.
* **Streak Meter & Archetypes**:
  * Visual streak tracker awarding motivational titles based on consistency:
    * **Rookie**: Building initial daily study habits (1+ hr/day).
    * **Consistent**: Regular paced revision focus (2–3 hrs/day).
    * **Topper**: High volume & analytical consistency (3–5 hrs/day).
    * **Legend**: Mastery dedication with high review throughput (5+ hrs/day).
* **Customizable Neumorphic Dashboard Grid**:
  * Drag-and-drop widget layout with customizable positions and dimensions.
  * Widget Customizer modal to toggle visibility of individual widgets (Streak, Study Time, Quick Links, Upcoming Due Cards, Subject Matrix).
* **Quick Access Action Buttons**: Instant shortcuts to jump to Library uploads, Card Extractor, Smart Review Hub, or Settings.
* **FSRS Due Cards Forecast**: Live count of flashcards scheduled for review today.

---

### 2.2 Smart Review Hub & FSRS-4.5 Engine (`smartReview`)
*Source: `src/components/SmartReviewHub.jsx`, `src/services/fsrsEngine.js`, `src/services/predictiveTimingEngine.js`, `src/components/FsrsSettingsModal.jsx`, `src/components/FsrsStatsTab.jsx`, `src/components/StudyVelocityTab.jsx`, `src/components/RatingDurationModal.jsx`, `src/components/TopicNotesModal.jsx`, `src/components/SelectNewTopicsModal.jsx`*
* **FSRS-4.5 Memory Engine (`fsrsEngine.js`)**:
  * Next-generation Free Spaced Repetition Scheduler replacing legacy SM-2.
  * Tracks 4 core memory parameters per card:
    * **Stability ($S$)**: Days required for memory retention to drop from 100% to 90%.
    * **Difficulty ($D$)**: Inherent complexity scale ($1.0$ to $10.0$).
    * **Retrievability ($R$)**: Probability of successfully recalling the card on any given day.
    * **Interval ($I$)**: Days until next scheduled review.
  * 19 optimized weight coefficients governing memory consolidation and lapse decay.
* **Review Subtabs & Components**:
  1. **Smart Review Session**:
     * Daily queue of due flashcards with live preview of next interval dates for each rating (*Again*, *Hard*, *Good*, *Easy*).
     * Undo / Redo review actions with 100% queue preservation.
     * Leech detection: Automatically flags cards with excessive lapses for clinical remediation.
  2. **Study Velocity Tab (`StudyVelocityTab.jsx`)**:
     * Real-time cognitive throughput metrics: Cards/Hour, Retention Velocity, Daily Target Projection.
     * Speed and pacing gauges with circadian load distribution.
  3. **FSRS Stats Tab (`FsrsStatsTab.jsx`)**:
     * Memory retention decay curves across timeframes (`1M`, `3M`, `1Y`, `ALL`).
     * Card difficulty distribution bar charts and stability histograms.
     * Log array unpacking across all historical review sessions.
  4. **Dynamic Predictive Timing Engine (`predictiveTimingEngine.js` & `RatingDurationModal.jsx`)**:
     * Read-only timing engine measuring card reading duration and forecasting study block completion time.
     * **Strict FSRS Isolation**: Read-only consumer that never mutates or alters FSRS spaced repetition formulas.
  5. **Topic Notes Modal (`TopicNotesModal.jsx`)**:
     * Comprehensive clinical notes, mnemonics, and diagnostic flowcharts attached to active review topics.
  6. **Select New Topics Modal (`SelectNewTopicsModal.jsx`)**:
     * Intelligent topic selector with AI Strategy Modes (*High-Yield Priority*, *Weakness First*, *Balanced Spread*) to introduce new topics into the daily spaced repetition queue.
  7. **FSRS Settings Modal (`FsrsSettingsModal.jsx`)**:
     * Target retention rate slider ($80\%$ to $97\%$).
     * Maximum review interval limiter (e.g. 365 days).
     * Weight parameter inspector and baseline reset utilities.

---

### 2.3 Study Room & Focus Lounge (`study`)
*Source: `src/App.jsx`, `src/components/StudyRoomComponents.jsx`*
* **Immersive Active Study Room**:
  * Distraction-free full-screen environment for deep focus sessions.
* **Integrated Pomodoro & Focus Timer**:
  * Customizable work intervals, short breaks, and long breaks with audio chime notifications.
* **Ambient Sound Lounge (`SoundsPanel`)**:
  * Built-in sound tracks: Lo-Fi Study Beats, Gentle Rain, Forest Ambience, White Noise.
  * **YouTube Audio Stream Embed**: Ingest and play background audio streams via YouTube Video ID parser.
* **Motivational Quote Engine (`QuotesPanel`)**:
  * Curated database of motivational quotes tailored for medical doctors and exam aspirants.
* **Spaced Repetition Review Simulator**:
  * Quick flashcard review interface with *Again*, *Hard*, *Good*, and *Easy* rating buttons.
* **Scorecard & Grand Test (GT) Logger (`StatsPanel`)**:
  * Log mock test scores, total questions, correct/incorrect splits, and percentile trends over time.
* **Floating Utility Widgets**:
  * Draggable, minimizable floating widgets for Timer, Audio Player, Notes, and Stats.

---

### 2.4 Study Scheduler (`studyScheduler`)
*Source: `src/App.jsx`*
* **Dynamic Revision Planner**:
  * Visual Spaced Repetition Calendar mapping overdue, due today, and upcoming review workloads.
* **Overdue Topic Alerts**:
  * Automatically flags medical topics that have exceeded their optimal FSRS retention cutoff.
* **Daily Action Checklist**:
  * Interactive checklist for planning daily subject targets, QBank question quotas, and mock tests.
* **Workload Balancing**:
  * Distributes upcoming card reviews evenly across future days to prevent study session spikes.

---

## 3. Category II: Content & Knowledge

### 3.1 Library & PDF Ingestion (`library`)
*Source: `src/App.jsx`, `src/services/pdfSliceService.js`, `src/components/PdfSlicePreviewModal.jsx`*
* **Local Document Repository**:
  * Upload, view, and organize medical reference PDFs, notes, and study slides.
  * PDF files are stored directly in local IndexedDB storage.
* **Interactive PDF Viewer**:
  * Powered by `pdfjs-dist` with high-resolution canvas rendering.
  * Smooth multi-page scrolling, jump-to-page, zooming, and thumbnail previews.
* **PDF Slice Preview Modal (`PdfSlicePreviewModal.jsx`)**:
  * Slice multi-page PDF sections into isolated high-resolution images for card generation.
* **Subject & Deck Folders**:
  * Hierarchical organization matching the 19 medical subjects.
  * Deck creation, renaming, merging, and folder deletion.
* **Direct Flashcard Anchoring**:
  * Selecting any page region instantly triggers AI extraction anchored to that exact textbook coordinate.

---

### 3.2 Cards Manager & AI Generation (`cards`)
*Source: `src/App.jsx`, `src/components/ManualCardModal.jsx`, `src/components/ConflictInspectorModal.jsx`, `src/utils/imageCropper.js`*
* **AI-Powered Card Extraction**:
  * Powered by Google **Gemini Vision AI** via user API key.
  * Ingests medical PDF textbook pages and lecture slides to extract high-yield clinical questions, answers, and tags.
  * Automatic detection of clinical case-vignettes, diagnostic hallmarks, and pharmacological mechanisms.
* **Interactive Pre-Save Card Editor**:
  * Modify Question, Answer, Notes, Tags, and Deck assignments before committing to database.
  * Add custom clinical mnemonics, high-yield pearls, and source page references.
* **Visual Flashcard Image Cropper**:
  * Integrated bounding box selector (`imageCropper.js`) to crop clinical diagrams, histological slides, and flowcharts directly from source PDFs.
  * Automatically embeds cropped images into flashcard question/answer fields.
* **Manual Card Creator Modal (`ManualCardModal.jsx`)**:
  * Create custom Anki cards manually with rich formatting, image drag-and-drop, and tag autocomplete.
  * Dual-mode editor: Standard Front/Back and Cloze Deletion syntax (`{{c1::text}}`).
* **Conflict Inspector Modal (`ConflictInspectorModal.jsx`)**:
  * Detects duplicate or similar cards already existing in local decks.
  * Side-by-side visual diff comparison to merge, overwrite, or discard conflicts.
* **Deck Filtering & Search**: Filter cards by Subject, Deck, Yield Rating (High-Yield / Super-High-Yield), and Review Status.
* **Batch Processing & Queue Management**: Process multiple pages in sequence with rate-limit pacing.

---

### 3.3 Subject Tracker — 19 Subjects (`subjectTracker`)
*Source: `src/App.jsx`*
* **Complete 19-Subject Medical Matrix**:
  * Pre-clinical: Anatomy, Physiology, Biochemistry.
  * Para-clinical: Pathology, Pharmacology, Microbiology, Forensic Medicine, Community Medicine (PSM).
  * Clinical: Ophthalmology, ENT, General Medicine, General Surgery, OBG, Pediatrics, Orthopedics, Dermatology, Psychiatry, Radiology, Anesthesia.
* **Subject Checklist & Progress Matrix**:
  * Map chapters, completed flashcard decks, and revision hours per subject.
* **Projected Completion Timeline**:
  * Dynamically projects syllabus completion dates based on current daily study velocity.

---

### 3.4 PYT Manager — Previous Year Topics (`pytManager`)
*Source: `src/App.jsx`, `src/utils/pytService.js`*
* **Previous Year Topics (PYT) Knowledge Base**:
  * Comprehensive syllabus index mapping clinical themes tested in past NEET PG and INI-CET papers.
* **Yield Classification**:
  * Categorizes topics into *High-Yield* and *Super-High-Yield* priority tiers.
* **Bulk Topic Ingestion**:
  * Paste and parse full subject syllabi (one topic per line) with automated indexing.
* **Textbook PDF Mapping**:
  * Link scanned medical textbook PDFs directly to PYT subjects for contextual study.

---

### 3.5 PYT Logger & Revision Heatmap (`pytLogger`)
*Source: `src/App.jsx`*
* **Topic Revision Frequency Tracker**:
  * Log study sessions and review counts directly against individual PYT entries.
* **Revision Heatmaps & Neglect Alerts**:
  * Color-coded indicators showing which topics are thoroughly revised and which haven't been reviewed in $> 30$ days.
* **Duplicate Topic Detector**:
  * Identifies duplicate topics across different subjects or spellings with 1-click deduplication.
* **Search & Multi-Sort Engine**:
  * Search topic names and sort by Alphabetical, Page Number, Highest Revisions, or Lowest Revisions.

---

## 4. Category III: Progress & Metrics

### 4.1 CAMP Tracker — Milestone Protocol (`campTracker`)
*Source: `src/components/CampTracker/CampDashboard.jsx`, `CollapsibleCard.jsx`, `ProgressChart.jsx`, `src/utils/campCalculations.js`*
* **Consistent Active Memorization Protocol (CAMP)**: A medical study framework tracking completion across all 19 medical subjects.
* **Subject-Level Milestone Tracking**:
  * Breaks down all 19 NEET PG subjects into micro-milestone cards.
  * Status progression states: *Unstudied*, *In-Progress*, and *Completed*.
  * Progress percentage calculations with color-coded elevation badges.
* **Mathematical Efficiency & Concentration Metrics**:
  * `calculateEfficiencyScore(milestones, hours)`: Computes cognitive throughput based on completed milestones vs time invested.
  * `calculateWeightedConcentration(...)`: Evaluates subject distribution balance across high-yield clinical vs pre-clinical subjects.
* **Visual Progress Distribution Charts**:
  * Collapsible subject cards with individual module checklists.
  * Responsive progress bars and completion radars.

---

### 4.2 Analysis Suite & Counseling Rank Predictor (`analytics`)
*Source: `src/App.jsx`*
* **Deep Analytics Hub with 5 Specialized Subtabs**:
  1. **Cards Generation Analytics**: Track AI extraction volume, daily created cards, and token usage.
  2. **Study Analytics**: Long-term revision consistency, daily study hours heatmap, and review accuracy rates.
  3. **Counseling & Mentorship Rank Predictor**:
     * Input Grand Test scores to predict percentile brackets and estimated NEET PG rank cutoffs for competitive medical specialties.
  4. **PYT Coverage Heatmap**: Visual matrix tracking syllabus coverage against tested Previous Year Topics.
  5. **Subject Coverage Distribution**: Interactive nested Sunburst chart mapping card counts across all 19 medical subjects and sub-specialties.
* **Circadian Peak Heatmap**:
  * Analyzes historical review performance to pinpoint peak cognitive productivity hours (Morning vs Afternoon vs Night).

---

## 5. Category IV: Tools & System

### 5.1 Exporter Hub & Anki APKG Compiler (`export`)
*Source: `src/App.jsx`, `src/components/ExportImageVerificationModal.jsx`*
* **Official Anki Package (.apkg) Compiler**:
  * Packages cards, tags, formatting, and notes into standardized SQLite database files compatible with official Anki desktop, AnkiDroid, and AnkiMobile.
* **Media & Diagram Bundling**:
  * Automatically packages embedded textbook images and cropped diagrams into the `.apkg` media collection.
* **Export Image Verification Modal (`ExportImageVerificationModal.jsx`)**:
  * Pre-compilation scanner identifying missing image references, broken coordinates, or unlinked attachments with 1-click repair.
* **Selective Modular Export**:
  * Select specific subjects, sub-decks, or tag filters to export modular specialty packages.

---

### 5.2 AI Prompt Editor (`prompt`)
*Source: `src/App.jsx`*
* **System Instruction Profile Manager**:
  * Customize the system prompts used by Gemini Vision AI for card extraction.
* **Dual Category Prompts**:
  * **Image Prompts**: Optimized for diagram parsing, histology labels, clinical flowcharts, and radiology signs.
  * **Text Prompts**: Optimized for high-yield factual tables, differential diagnoses, and pharmacological bullet points.
* **JSON Schema Enforcement**:
  * Validates AI response structure against strict JSON output schemas to prevent corrupted card formats.
* **Template Backups & Factory Reset**:
  * Save custom prompt presets or restore default medical extraction guidelines with 1 click.

---

### 5.3 OBS Overlay Customizer (`obsOverlay`)
*Source: `src/App.jsx`, `src/components/StudyRoomComponents.jsx`*
* **Live Streaming Overlay Studio**:
  * Generates clean, broadcast-ready overlays for study streams (Twitch, YouTube Live, Kick).
* **Real-Time Data Feed**:
  * Displays active session timer, current study hours, today's question count, and streak badges.
* **Visual Customizer**:
  * Adjust background opacity, neumorphic borders, theme colors, typography, and widget positioning.
* **1-Click OBS URL Export**:
  * Generates a persistent Browser Source URL formatted with custom dimensions for OBS Studio.

---

### 5.4 Settings & LocalDB Control (`settings`)
*Source: `src/App.jsx`, `src/services/localDb.js`*
* **100% Offline-First Local Database Control**:
  * **Backup Database (JSON)**: Export the complete IndexedDB database (flashcards, logs, PYTs, settings) to a single portable file.
  * **Restore Database**: Import a saved JSON backup to restore all data instantly.
  * **Database Diagnostic & Reset**: Inspect storage sizes and clear individual stores safely.
* **Private GitHub Cloud Backup**:
  * Store credentials (GitHub Username, Repo Name, Personal Access Token).
  * 1-Click push and pull of database snapshots to personal private repositories for cross-device sync.
* **API Credentials Management**:
  * Configure and securely store Google Gemini API keys with live connection validation.
* **Theme Customizer**:
  * Switch between Neumorphic Light (`#e6ecf5`) and Neumorphic Dark (`#222730`) themes.
* **Mobile Navigation Customizer**:
  * Drag-and-drop selector to configure up to 8 bottom navigation tab shortcuts for mobile views.

---

### 5.5 Recycle Bin / Trash (`trash`)
*Source: `src/App.jsx`*
* **Soft-Delete Safety Net**:
  * Deleted flashcards and PDF scans are moved to the Recycle Bin rather than permanently erased.
* **1-Click Restore**:
  * Instantly restores cards and pages back to their exact original parent decks and queues.
* **Permanent Batch Deletion**:
  * "Empty Recycle Bin" utility to permanently delete soft-deleted content and reclaim local disk space.
* **Recovery Audit Log**:
  * Tracks original deletion timestamps and parent deck metadata.

---

### 5.6 About Page & Manual (`about`)
*Source: `src/components/AboutDashboard.jsx`*
* **Interactive Documentation & Knowledge Hub**:
  * Top hero gradient banner highlighting the platform mission and offline-first ethos.
* **Dual-Subtab Architecture**:
  1. **About App**: Core platform overview, 4-pillar architectural metrics, and dedicated developer hero for Dr. Kishor Anbazhakan (MBBS) with silhouette text-wrapping.
  2. **App Manual**: Interactive searchable feature catalog covering all 17 modules grouped by the 4 application categories with direct "Jump to Tab" navigation.

---

## 6. Specialized Modals & Utility Components

1. **Manual Card Modal (`ManualCardModal.jsx`)**: Comprehensive card editor with rich inputs, Cloze syntax, image pasting, and tag autocomplete.
2. **Conflict Inspector Modal (`ConflictInspectorModal.jsx`)**: Visual side-by-side diff resolving card conflicts and duplicates.
3. **Export Image Verification Modal (`ExportImageVerificationModal.jsx`)**: Pre-export image validator checking all diagram references before `.apkg` generation.
4. **PDF Slice Preview Modal (`PdfSlicePreviewModal.jsx`)**: High-resolution page slice rendering tool for visual diagram cards.
5. **Rating Duration Modal (`RatingDurationModal.jsx`)**: Read-only predictive timing modal displaying review duration and velocity without altering FSRS memory math.
6. **Topic Notes Modal (`TopicNotesModal.jsx`)**: Attached medical notes and diagnostic flowcharts for clinical review cards.
7. **Select New Topics Modal (`SelectNewTopicsModal.jsx`)**: Topic scheduler modal with strategy modes to introduce new clinical material.
8. **FsrsSettingsModal (`FsrsSettingsModal.jsx`)**: Configuration panel for FSRS target retention, max interval, and weight parameters.
9. **FsrsStatsTab (`FsrsStatsTab.jsx`)**: Memory decay charts and difficulty distributions.
10. **StudyVelocityTab (`StudyVelocityTab.jsx`)**: Throughput and speed analytics dashboard.
11. **NeumorphicSelect (`NeumorphicSelect.jsx`)**: Smooth Neumorphic dropdown selector with keyboard navigation and dark mode support.
12. **RichInputField (`RichInputField.jsx`)**: Rich text input field with syntax highlighting and medical formatting shortcuts.
13. **Uiverse Components (`UiverseSwitch.jsx`, `UiverseButton.jsx`, `UiverseGlassRadio.jsx`)**: Smooth micro-animated toggles and glassmorphic inputs.

---

## 7. Core Algorithms & Background Services

* **`src/services/localDb.js`**: Offline-first IndexedDB database engine (`AutoAnkiLocalDB`) handling transactions, indexed queries, bulk operations, and exports.
* **`src/services/fsrsEngine.js`**: Full mathematical implementation of FSRS-4.5 (Stability $S$, Difficulty $D$, Retrievability $R$, Intervals $I$, Leech detection, and parameter optimization).
* **`src/services/predictiveTimingEngine.js`**: Strictly read-only predictive timing engine estimating card study duration and workload balancing.
* **`src/services/aiHintEngine.js`**: Generates tiered clinical hints (First-line clue, Mechanism clue, Diagnostic hallmark) for active card reviews.
* **`src/services/pdfSliceService.js`**: Canvas rasterizer and slice processor extracting high-resolution regions from PDF pages.
* **`src/utils/campCalculations.js`**: Mathematical calculations for CAMP efficiency scores and weighted concentration indexes.
* **`src/utils/imageCropper.js`**: Bounding box coordinate calculator for cropping diagrams from PDF canvases.
* **`src/utils/pageUtils.js`**: Utility functions for PDF page parsing, batch queue pacing, and token management.
* **`src/utils/pytService.js`**: Topic normalization, search indexing, and syllabus hierarchy mapping.

---

## 8. Chrome Extension Ecosystem
*Source: `chrome-extension/`*

* **Direct Web Scraper**: Browser extension allowing doctors and students to highlight medical text and diagrams on question banks or online textbook portals.
* **Background Worker (`background.js`) & Offscreen Canvas (`offscreen.js`)**: Captures high-resolution webpage snapshots and diagrams.
* **Content Script (`content.js`)**: Injects a floating action menu to send clinical vignettes and questions directly into the AutoAnki card queue.
* **Extension Popup (`popup.js` & `popup.html`)**: Mini-control panel for selecting active decks, checking due card counts, and triggering instant AI extractions.
