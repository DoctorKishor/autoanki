# Local App Backup & Restore Data Manifest

> **Purpose**: This living manifest tracks all application data, settings, and local database keys required for complete local backup & restore. Items are registered step-by-step as each feature area is built or refactored.

---

## 📌 Current Module: Settings Menu


### 1. External API Credentials (`STORES.SETTINGS` -> `apiKeys`)

| Key Name | Storage Engine | Description | Backup Required |
| :--- | :--- | :--- | :---: |
| `geminiApiKey` | IndexedDB & `localStorage` | Gemini AI API key for flashcard auto-generation & card editing. | ✅ Yes |
| `imgbbApiKey` | IndexedDB & `localStorage` | ImgBB API key for diagram mask image hosting & uploading. | ✅ Yes |
| `githubUsername` | IndexedDB & `localStorage` | GitHub account username for remote repo sync/backup. | ✅ Yes |
| `githubRepo` | IndexedDB & `localStorage` | GitHub repository name for data sync. | ✅ Yes |
| `githubPatToken` | IndexedDB & `localStorage` | GitHub Personal Access Token for authenticated Git actions. | ✅ Yes |

---

### 2. Deck Hierarchy & Study Caps (`STORES.SETTINGS` -> `hierarchy`)

| Key Name | Storage Engine | Description | Backup Required |
| :--- | :--- | :--- | :---: |
| `paths` | IndexedDB | List of active deck paths (e.g. `Marrow`, `Marrow::Pathology`, `Marrow::Pharmacology`). | ✅ Yes |
| `deckCardCounts` | IndexedDB | Mapping of deck path to card count breakdown. | ✅ Yes |
| `subjectCardCounts` | IndexedDB | Mapping of high-level subject names to total card counts. | ✅ Yes |
| `maxDailyReviewCap` | IndexedDB | Active daily review cap limit (e.g. `30` cards/day). | ✅ Yes |
| `originalCap` | IndexedDB | Original default daily review cap baseline. | ✅ Yes |

---

### 📋 Up Next (To be added as we proceed):
- [ ] Flashcard Deck & Review Progress (`KV_STORE`)
- [ ] Topic Master Tracker & PYT Progress (`TOPICS`)
- [ ] CAMP Tracker & Focus Metrics (`CAMP_TRACKER`).
