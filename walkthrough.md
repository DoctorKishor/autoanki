# Health & Study Correlation Dashboard Walkthrough

We have laid the data foundation and built the foundational dashboard component for the new `/analytics` integration.

## Implemented Work

### 1. Ingestion Schema
We defined the schema for the Firestore `health_metrics` collection mapping sleep and workouts on a per-user, per-day basis:
- Path: `/users/{userId}/health_metrics/{date}` (e.g. `YYYY-MM-DD`).
- Key attributes: `sleep_hours` (float), `sleep_score` (int), `workout_type` (Lifting/Cardio/None), `workout_duration` (int), and `timestamp`.

### 2. Mock Data Utility: `src/utils/healthMockData.js`
- Generates 30 days of historical health and cognitive metrics.
- Encodes negative correlations for sleep $< 6$ hours (drops Anki review speed) and study duration comparisons for lifting vs rest days.

### 3. Component Design: `src/components/CorrelationDashboard.jsx`
- Developed using **Recharts** for visualizations.
- **Chart 1 (Scatter Chart)**: Compares sleep hours with Anki review speed (seconds per card). Includes a critical 6-hour sleep threshold reference line.
- **Chart 2 (Bar Chart)**: Compares average daily study duration between Lifting Days and Rest Days.
- Integrated Tailwind styling matching the existing glassmorphic Sci-Fi/minimalist theme.

### 4. Routing Integration in `src/App.jsx`
- Imported `CorrelationDashboard` statically.
- Added a new glassmorphic **Health Insights** (`Activity` icon) toggle button in the main top Header.
- Configured conditional layout rendering: when `currentTab === 'correlation'`, it swaps the workspace content panel with the single-column correlation dashboard without affecting the default three-column design.

## Build and Bundler Verification
Installed `recharts` and `react-is` packages. Verified Vite bundler output compiles successfully:
```bash
> vite build
vite v8.0.13 building client environment for production...
transforming...✓ 2319 modules transformed.
rendering chunks...
dist/index.html                     0.46 kB │ gzip:   0.29 kB
dist/assets/index-f4zUyMGO.css     75.00 kB │ gzip:  12.05 kB
dist/assets/index-flJ1MzMa.js   1,932.93 kB │ gzip: 532.93 kB
✓ built in 3.44s
```

## Discord Rich Presence (DRP) Fixes

### 1. PreMiD Metadata Regex Update
We corrected the `regExp` field in [metadata.json](file:///c:/Projects/Antigravity/auto-anki-app/premid-presence/metadata.json) to support any subpaths and query parameters:
- **Previous pattern**: Ended with `(?:$|[/])` which failed to match subpaths (like `/dashboard`) and query parameters (like `?login_session=...`) on direct URL entry or page refresh.
- **Updated pattern**: Matches the protocol, hosts, ports, and uses `(/.*)?$` at the end to match any subpath/query parameters. This allows PreMiD to correctly match and inject the presence script on any page of `autoanki.pages.dev`.

### 2. DRP Connection & Extension Architecture Clarified
- **Extension & Desktop Client Relationship**: Clarified that the PreMiD browser extension is not logged into Discord directly. Instead, it reads the metadata bridge on our website and forwards it to a local bridge.
- **Local Dev vs Production**: During development, running `npx pmd dev` acts as this bridge directly to Discord. In production (once the presence is officially reviewed and published to the PreMiD Store), the PreMiD extension handles the secure background socket communication with the PreMiD Desktop client automatically on the deployed site.

## CAMP Tracker Improvements & Midnight Timer Splitting

### 1. Midnight Timer Splitting on Manual & Auto Save
We implemented robust split logging for any study sessions (Pomodoro, Stopwatch, or Custom Countdown Timer) that cross the midnight threshold ($12:00\text{ AM}$):
- **Proportional Metrics Splitting**: Cards reviewed, questions solved, and pages read are split proportionally relative to the hours elapsed before vs. after midnight.
- **GT Handover**: If the session logged is a Grand Test (`gt`), the GT metadata structure is assigned strictly to yesterday, and today's logged session automatically falls back to `type = 'notes'`.
- **Double Log Persistence**: On save, two separate entries are stored locally and persisted to Firestore under `studyLogs` and `camp_daily_logs` for yesterday and today, ensuring data alignment.

### 2. Live Session Injection (Pre-population)
- The CAMP Dashboard dynamically intersects the running timer's active window `[startedAt, startedAt + elapsed]` with the selected calendar day bounds.
- If the user views the CAMP tracker at $11:59\text{ PM}$ while a session is running, the dashboard automatically pre-populates and scales the category stats and daily efficiency score in real-time, showing the current ongoing minutes.

### 3. State Isolation & Additive Logging
- Fixed race conditions during date switching in `CampDashboard.jsx` using checking references against `selectedDate`, preventing the previous date's write hook from overwriting loaded logs of adjacent dates.
- Verified that all study inputs are additive (accumulating session lists) instead of replacing pre-existing entries.
