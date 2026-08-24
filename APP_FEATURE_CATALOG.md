# 🩺 AutoAnki — Complete Application Feature Catalog & Technical Manual

This document provides a comprehensive, verified, and detailed A-to-Z manual of every single module, tab, button, toggle, setting, preference, modal, and algorithm across the **AutoAnki** codebase—organized according to the 4 primary application navigation categories.

---

## 📑 Application Navigation Architecture

AutoAnki organizes its 17 modules into 4 specialized categories:
1. **⚡ Focus & Review**: High-yield study execution, FSRS-6 spaced repetition review, Pomodoro lounge, and workload scheduling.
2. **📚 Content & Knowledge**: Medical textbook ingestion, Gemini Vision AI card extraction, 19 medical subjects, and NEET PG PYT indices.
3. **📊 Progress & Metrics**: CAMP milestone protocol, counseling rank predictors, and nested Sunburst deck charts.
4. **🛠️ Tools & System**: Official Anki APKG compiler, AI prompt tuning, OBS stream overlays, local database manager, and Chrome extension.

---

## Table of Contents
- [1. Architecture & Storage Model](#1-architecture--storage-model)
- [2. Category I: Focus & Review](#2-category-i-focus--review)
  - [2.1 Dashboard (`dashboard`)](#21-dashboard-dashboard)
  - [2.2 Smart Review Hub & FSRS-6 Engine (`smartReview`)](#22-smart-review-hub--fsrs-6-engine-smartreview)
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
- [6. Specialized Modals & Dialogs Reference](#6-specialized-modals--dialogs-reference)
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

#### Overview & Core Purpose
The central command center provides real-time visibility into active study sessions, daily streak metrics, due card loads, and customizable Neumorphic widgets.

#### Buttons, Controls & UI Elements
* **Live Timer Play / Pause / Reset**: Starts, pauses, and resets the active study timer.
* **Milliseconds Toggle (`showMilliseconds`)**: Toggles high-precision centisecond display on the timer widget.
* **Timer Fullscreen Button (`Maximize2`)**: Expands the timer into a distraction-free ambient full-screen mode.
* **Widget Customizer Button (`Settings`)**: Opens modal to toggle visibility and reorder widgets (Streak, Study Time, Quick Links, Due Cards, Subject Matrix).
* **Daily Card Target Slider (`dashboard_daily_card_target`)**: Configures daily flashcard review targets (e.g. 50 cards).
* **Daily Hours Target Slider (`dashboard_daily_hours_target`)**: Configures daily study duration targets (e.g. 4.0 hours).
* **Streak Meter & Archetypes**: Evaluates daily consistency:
  * **Rookie**: Initial habit builder (1+ hr/day).
  * **Consistent**: Regular revision pacing (2–3 hrs/day).
  * **Topper**: High volume & analytical consistency (3–5 hrs/day).
  * **Legend**: High review throughput mastery (5+ hrs/day).
* **Quick Logger Inputs**: Text inputs to quickly log cards, hours, questions, or pages directly to IndexedDB.
* **Quick Access Action Buttons**: One-click jumps to Library, Smart Review Hub, or Card Extractor.

#### Step-by-Step Workflow
1. Check your streak meter and today's due cards forecast.
2. Click **Play** on the Live Timer widget to start recording focus hours.
3. Click **Customize** to toggle or rearrange widgets.
4. Jump straight to Smart Review or Library using the Quick Action buttons.

---

### 2.2 Smart Review Hub & FSRS-6 Engine (`smartReview`)
*Source: `src/components/SmartReviewHub.jsx`, `src/services/fsrsEngine.js`, `src/services/predictiveTimingEngine.js`, `src/components/FsrsSettingsModal.jsx`, `src/components/FsrsStatsTab.jsx`, `src/components/StudyVelocityTab.jsx`, `src/components/RatingDurationModal.jsx`, `src/components/TopicNotesModal.jsx`, `src/components/SelectNewTopicsModal.jsx`*

#### Overview & Core Purpose
The core spaced repetition review environment powered by the official **FSRS-6 (Free Spaced Repetition Scheduler)** algorithm with 21 benchmark parameters ($w_0 \dots w_{20}$).

#### FSRS-6 Mathematical Specification
* **Retrievability Formula**: $R(t, S) = (1 + w_{20} \cdot (t / S))^{-1 / w_{20}}$
* **Scheduled Interval Formula**: $I = (S / w_{20}) \cdot (DR^{-w_{20}} - 1)$
* **4 Core Parameters**:
  * **Stability ($S$)**: Days required for memory retention to decay from 100% to 90%.
  * **Difficulty ($D$)**: Inherent complexity scale ($1.0$ to $10.0$).
  * **Retrievability ($R$)**: Probability of recall on day $t$.
  * **Interval ($I$)**: Days until next scheduled review.

#### Subtabs & Navigation
1. **Review Queue Subtab (`queue`)**: Displays daily queues for Overdue Topics, Due Today Topics, and New Unstudied Topics.
2. **Study Velocity Subtab (`velocity`)**: Tracks Cards/Hour throughput, retention velocity, and circadian cognitive load distribution.
3. **Analytics (FSRS Stats) Subtab (`analytics`)**: Historical memory retention decay curves and stability histograms across timeframes (`1M`, `3M`, `1Y`, `ALL`).
4. **Leeches Subtab (`leeches`)**: Filters cards with excessive lapses ($\ge \text{leechThreshold}$) for targeted clinical review.

#### Buttons, Controls & UI Elements
* **Reveal Answer (Spacebar / `Eye`)**: Flips the flashcard or reveals hidden answer fields.
* **Rating Button — Again (1)**: Lapsed review ($r=1$). Resets stability to initial baseline $S_0(\text{Again})$ ($w_0$).
* **Rating Button — Hard (2)**: Difficult recall ($r=2$). Applies hard penalty multiplier ($w_{15}$).
* **Rating Button — Good (3)**: Successful recall ($r=3$). Normal stability growth.
* **Rating Button — Easy (4)**: Instant effortless recall ($r=4$). Applies easy bonus multiplier ($w_{16}$).
* **Live Interval Previews**: Displayed directly above each rating button (e.g. `1d`, `3d`, `7d`, `14d`).
* **AI Recall Hints Button (`Lightbulb`)**: Triggers tiered active recall clues (First-line clue, Mechanism clue, Diagnostic hallmark) without spoiling the answer.
* **PDF Slice Viewer Button (`Eye`)**: Opens a modal displaying the exact high-res PDF textbook slice linked to the card.
* **Topic Notes Button (`FileText`)**: Opens clinical notes, diagnostic tables, and mnemonics for the active topic.
* **Select New Topics Modal (`Plus`)**: Launches AI strategy modes (*High-Yield Priority*, *Weakness First*, *Balanced Spread*) to introduce unstudied topics into the queue.
* **Exam Target Profiles Modal (`Target`)**: Set target examination dates (NEET PG, INI-CET) and tentative flags to balance retention pacing.
* **FSRS Settings Modal (`Settings`)**: Adjust Desired Retention ($0.70$ to $0.97$), Max Interval, Leech Threshold, and 21 weight parameters.
* **Undo / Redo Buttons (`Undo2` / `RotateCw`)**: Reverts or re-applies ratings with 100% queue order and FSRS state preservation.

---

### 2.3 Study Room & Focus Lounge (`study`)
*Source: `src/App.jsx`, `src/components/StudyRoomComponents.jsx`*

#### Overview & Core Purpose
A full-screen active study lounge designed for deep focus blocks, Pomodoro cycles, background sound mixing, and mock exam score tracking.

#### Buttons, Controls & UI Elements
* **Pomodoro Timer Controller**: Presets for 25m/5m, 50m/10m, and custom intervals with audio chime alerts.
* **Ambient Sound Mixer**: Independent volume sliders for Lo-Fi study beats, Gentle Rain, Forest Ambience, and White Noise.
* **YouTube Audio Stream Embed**: Input field parsing YouTube Video URLs/IDs to play custom audio streams.
* **Motivational Quote Engine**: Curated medical quotes with previous/next controls.
* **GT Scorecard Logger**: Input fields for Exam Name, Platform (Marrow, Prepladder, Cerebellum), Type (NEET PG 200/180 Qs, INI-CET), Correct/Incorrect numbers, and All-India Rank.
* **Floating Utility Overlays**: Minimizable widgets for Timer, Audio, Notes, and Stats.

---

### 2.4 Study Scheduler (`studyScheduler`)
*Source: `src/App.jsx`*

#### Overview & Core Purpose
A dynamic spaced repetition calendar that balances upcoming revision loads and highlights overdue clinical topics.

#### Buttons, Controls & UI Elements
* **Spaced Repetition Calendar Matrix**: Visual daily schedule displaying due topics, completed decks, and workloads.
* **Overdue Topic Alerts**: Color-coded banners for topics past their FSRS retention deadline.
* **Daily Action Checklist**: Add, edit, check off, and delete daily study goals and QBank question quotas.
* **Workload Leveling**: Balances card reviews across future days to avoid study spikes.

---

## 3. Category II: Content & Knowledge

### 3.1 Library & PDF Ingestion (`library`)
*Source: `src/App.jsx`, `src/services/pdfSliceService.js`, `src/components/PdfSlicePreviewModal.jsx`*

#### Overview & Core Purpose
Localized document repository for medical textbook PDFs and slide images with high-resolution canvas rendering and diagram anchoring.

#### Buttons, Controls & UI Elements
* **Upload PDF / Slides Button (`UploadCloud`)**: Ingests reference PDFs or images directly into local IndexedDB storage.
* **Interactive PDF Canvas Viewer**: Multi-page scrolling, zoom in/out, jump-to-page, and thumbnail browser.
* **Diagram Bounding Box Selector**: Click-and-drag bounding box on textbook diagrams to attach visual crops directly to flashcards.
* **PDF Slice Preview Modal**: Slices multi-page PDF sections into high-res images for visual flashcard extraction.
* **Subject Folders Manager**: Create, rename, organize, and delete folders for all 19 medical subjects.

---

### 3.2 Cards Manager & AI Generation (`cards`)
*Source: `src/App.jsx`, `src/components/ManualCardModal.jsx`, `src/components/ConflictInspectorModal.jsx`, `src/utils/imageCropper.js`*

#### Overview & Core Purpose
Extracts high-yield clinical cards from textbook pages using Google Gemini Vision AI with rich pre-save editing and Cloze deletion support.

#### Buttons, Controls & UI Elements
* **AI Extract Flashcards Button**: Sends page layout and text to Gemini Vision AI to extract high-yield clinical Q&A pairs.
* **Interactive Pre-Save Card Editor**: Edit Question, Answer, Notes, Tags, Deck, and Yield Rating before saving.
* **Manual Card Creator Modal (`ManualCardModal.jsx`)**: Create cards manually with rich formatting, Cloze deletion syntax (`{{c1::text}}`), and image drag-and-drop.
* **Image Cropper Tool (`imageCropper.js`)**: Adjust crop boundaries for clinical diagrams, histology slides, and ECG strips.
* **Conflict Inspector Modal (`ConflictInspectorModal.jsx`)**: Side-by-side visual diff to merge, overwrite, or discard duplicate cards.
* **Search & Tag Filters**: Filter generated cards by Subject, Tag, Status, or Yield Tier (High-Yield / Super-High-Yield).

---

### 3.3 Subject Tracker — 19 Subjects (`subjectTracker`)
*Source: `src/App.jsx`*

#### Overview & Core Purpose
Complete syllabus matrix covering all 19 medical subjects required for postgraduate medical entrance exams.

#### Buttons, Controls & UI Elements
* **19-Subject Matrix Grid**: Covers Anatomy, Physiology, Biochemistry, Pathology, Pharmacology, Microbiology, FMT, PSM, Ophthal, ENT, Medicine, Surgery, OBG, Peds, Ortho, Derma, Psych, Radio, and Anesthesia.
* **Chapter Milestone Checklists**: Mark individual chapters and revision stages complete as you progress.
* **Time Log Sync**: Links focus hours logged in the Study Room directly to individual subject milestones.
* **Completion Date Projection**: Estimates syllabus completion date based on your active daily study velocity.

---

### 3.4 PYT Manager — Previous Year Topics (`pytManager`)
*Source: `src/App.jsx`, `src/utils/pytService.js`*

#### Overview & Core Purpose
Central reference database of clinical themes tested in past NEET PG and INI-CET entrance examinations.

#### Buttons, Controls & UI Elements
* **Subject Syllabus Selector**: Filter PYT topics across all 19 medical subjects.
* **Bulk Topic Ingestion Box**: Paste syllabus topic lists (one topic per line) with automated indexing into IndexedDB.
* **Yield Level Ratings**: Flags topics as Standard, High-Yield, or Super-High-Yield based on past exam frequency.
* **Textbook PDF Mapping**: Link scanned textbook PDFs directly to PYT topics for contextual reading.

---

### 3.5 PYT Logger & Revision Heatmap (`pytLogger`)
*Source: `src/App.jsx`*

#### Overview & Core Purpose
Log study events directly against PYT IDs with revision frequency heatmaps and neglect warnings.

#### Buttons, Controls & UI Elements
* **Topic Revision Counters (`+` / `-`)**: Increments or decrements the logged revision count for individual medical topics.
* **Coverage Heatmap**: Color-coded indicators showing thoroughly revised vs neglected topics.
* **Neglected Topics Filter (>30 Days)**: Isolates critical clinical topics that have not been revised in over 30 days.
* **Duplicate Topics Cleaner**: Detects and merges duplicate topic entries across spelling variations.
* **Multi-Sort Selector**: Sorts by Alphabetical (A-Z), Page Number (Ascending), Revisions (High to Low), or Revisions (Low to High).

---

## 4. Category III: Progress & Metrics

### 4.1 CAMP Tracker — Milestone Protocol (`campTracker`)
*Source: `src/components/CampTracker/CampDashboard.jsx`, `CollapsibleCard.jsx`, `ProgressChart.jsx`, `src/utils/campCalculations.js`*

#### Overview & Core Purpose
Consistent Active Memorization Protocol tracking micro-milestone progression and mathematical throughput.

#### Buttons, Controls & UI Elements
* **Micro-Milestone Cards**: Breaks down subjects into small milestone cards with Unstudied, In-Progress, and Completed states.
* **Efficiency Score Calculator**: Computes cognitive throughput score based on completed milestones vs logged hours (`calculateEfficiencyScore`).
* **Weighted Concentration Index**: Evaluates balance between clinical and pre-clinical subject coverage (`calculateWeightedConcentration`).
* **Milestone Progress Radars**: Visualizes completion percentage across each subject module.

---

### 4.2 Analysis Suite & Counseling Rank Predictor (`analytics`)
*Source: `src/App.jsx`*

#### Overview & Core Purpose
Deep analytical suite with 5 specialized subtabs, counseling rank predictors, and circadian peak heatmaps.

#### Buttons, Controls & UI Elements
* **Generation Analytics Subtab**: Tracks total AI-generated cards, daily creation volume, and API token usage.
* **Study Analytics Subtab**: Displays daily study consistency heatmaps, review accuracy percentages, and hours distribution.
* **Counseling & Rank Predictor Subtab**: Input mock Grand Test scores to predict estimated NEET PG rank brackets and counseling specialty cutoffs.
* **PYT Coverage Subtab**: Visualizes percentage of tested Previous Year Topics revised across all 19 subjects.
* **Subject Coverage Subtab**: Interactive nested Sunburst chart mapping cards count across subjects and subtopics.
* **Circadian Peak Heatmap**: Pinpoints peak cognitive performance hours (Morning, Afternoon, Evening, Night).

---

## 5. Category IV: Tools & System

### 5.1 Exporter Hub & Anki APKG Compiler (`export`)
*Source: `src/App.jsx`, `src/components/ExportImageVerificationModal.jsx`*

#### Overview & Core Purpose
Compile curated deck collections into standardized SQLite `.apkg` files compatible with official Anki apps.

#### Buttons, Controls & UI Elements
* **Compile .apkg Package Button**: Packages cards, tags, formatting, and notes into standard SQLite Anki databases.
* **Media Asset Bundler**: Automatically embeds cropped images and diagrams into the `.apkg` media collection.
* **Export Image Verification Modal**: Scans deck for broken image links or missing coordinates and fixes them before export.
* **Subject / Tag Selectors**: Select specific subjects or tag groups for modular specialty exports.

---

### 5.2 AI Prompt Editor (`prompt`)
*Source: `src/App.jsx`*

#### Overview & Core Purpose
Refine Gemini AI extraction guidelines with dual prompt categories and JSON schema validation.

#### Buttons, Controls & UI Elements
* **Image Prompts Category Tab**: Prompts tailored for diagram parsing, histology labels, clinical flowcharts, and radiology signs.
* **Text Prompts Category Tab**: Prompts tailored for high-yield tables, differential diagnoses, and pharmacological bullet points.
* **Instruction Profile Editor**: Customize extraction rules (e.g. emphasize clinical case-vignettes, diagnostic criteria).
* **JSON Schema Validation Tester**: Validates AI response structure against strict JSON output schemas.
* **Template Backups & Factory Reset**: Save custom presets or restore original medical extraction guidelines.

---

### 5.3 OBS Overlay Customizer (`obsOverlay`)
*Source: `src/App.jsx`, `src/components/StudyRoomComponents.jsx`*

#### Overview & Core Purpose
Broadcast live session statistics, timers, and streak badges on study streams via OBS Studio.

#### Buttons, Controls & UI Elements
* **Live Data Synchronizer**: Synchronizes active session timer, study hours, and streak titles with streaming client inputs.
* **Visual Layout Customizer**: Adjust background opacity, borders, typography, and color schemes.
* **Copy Browser Source Link**: Generates and copies a persistent Browser Source URL formatted for OBS Studio.

---

### 5.4 Settings & LocalDB Control (`settings`)
*Source: `src/App.jsx`, `src/services/localDb.js`*

#### Overview & Core Purpose
100% offline-first IndexedDB database control, JSON database backup/restore, and private GitHub sync.

#### Buttons, Controls & UI Elements
* **Backup Database (Export JSON)**: Exports entire IndexedDB database (flashcards, logs, PYTs, settings) to a single portable JSON file.
* **Restore Database (Import JSON)**: Imports a saved JSON backup to restore all data instantly with zero data loss.
* **Storage Store Diagnostics**: Inspects item counts and storage footprint for each IndexedDB store.
* **GitHub Cloud Sync (PAT Manager)**: Configure GitHub Username, Repo, and Personal Access Token for secure push/pull cloud backups.
* **Gemini API Key Manager**: Input and validate Google Gemini API key with live connection testing.
* **Theme Mode Toggle (Light / Dark)**: Switches between Neumorphic Light (`#e6ecf5`) and Dark (`#222730`).
* **Mobile Navigation Customizer**: Configure up to 8 bottom navigation tab shortcuts for mobile view.

---

### 5.5 Recycle Bin / Trash (`trash`)
*Source: `src/App.jsx`*

#### Overview & Core Purpose
Soft-delete safety net for restoring accidentally removed cards and pages back to active decks.

#### Buttons, Controls & UI Elements
* **Restore Card Button**: Instantly restores soft-deleted cards back to their exact original parent deck.
* **Empty Recycle Bin Button**: Permanently deletes all soft-deleted items to reclaim local disk space.
* **Deletion Audit Log**: Displays original deletion timestamps and parent deck tags.

---

### 5.6 About Page & Manual (`about`)
*Source: `src/components/AboutDashboard.jsx`*

#### Overview & Core Purpose
Knowledge hub containing platform architecture metrics, developer portfolio for Dr. Kishor, and complete interactive A-to-Z feature manual.

#### Buttons, Controls & UI Elements
* **About App Subtab**: Overview hero, 4-pillar architectural metrics, and developer bio with silhouette text-wrapping.
* **Complete Manual Subtab**: Categorized feature cards across all 4 categories, interactive search bar, category filter pills, and "Jump to Tab" buttons.
* **Feature Inspector Modal**: Click any feature to launch a detailed dialog showing all buttons, controls, and step-by-step instructions.

---

## 6. Specialized Modals & Dialogs Reference

1. **Manual Card Modal (`ManualCardModal.jsx`)**: Comprehensive card editor with rich inputs, Cloze syntax, image pasting, and tag autocomplete.
2. **Conflict Inspector Modal (`ConflictInspectorModal.jsx`)**: Visual side-by-side diff resolving card conflicts and duplicates.
3. **Export Image Verification Modal (`ExportImageVerificationModal.jsx`)**: Pre-export image validator checking all diagram references before `.apkg` generation.
4. **PDF Slice Preview Modal (`PdfSlicePreviewModal.jsx`)**: High-resolution page slice rendering tool for visual diagram cards.
5. **Rating Duration Modal (`RatingDurationModal.jsx`)**: Read-only predictive timing modal displaying review duration and velocity without altering FSRS memory math.
6. **Topic Notes Modal (`TopicNotesModal.jsx`)**: Attached medical notes and diagnostic flowcharts for clinical review cards.
7. **Select New Topics Modal (`SelectNewTopicsModal.jsx`)**: Topic scheduler modal with strategy modes to introduce new clinical material.
8. **FsrsSettingsModal (`FsrsSettingsModal.jsx`)**: Configuration panel for FSRS target retention, max interval, and 21 weight parameters.
9. **FsrsStatsTab (`FsrsStatsTab.jsx`)**: Memory decay charts and difficulty distributions.
10. **StudyVelocityTab (`StudyVelocityTab.jsx`)**: Throughput and speed analytics dashboard.

---

## 7. Core Algorithms & Background Services

* **`src/services/localDb.js`**: Offline-first IndexedDB database engine (`AutoAnkiLocalDB`) handling transactions, indexed queries, bulk operations, and exports.
* **`src/services/fsrsEngine.js`**: Full mathematical implementation of **FSRS-6** (21 benchmark parameters $w_0 \dots w_{20}$, Stability $S$, Difficulty $D$, Retrievability $R$, Intervals $I$, and Leech detection).
* **`src/services/predictiveTimingEngine.js`**: Strictly read-only predictive timing engine estimating card study duration and workload balancing without altering FSRS formulas.
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
