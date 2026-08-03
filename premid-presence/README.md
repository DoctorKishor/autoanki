# Auto-Anki Discord Rich Presence (PreMiD Presence)

This directory contains the PreMiD Presence files that enable Discord Rich Presence for **Auto-Anki** when running in a web browser.

It hooks into the hidden state bridge rendered in Auto-Anki to display:
*   The active page view (Dashboard, Card Library, Study Tracker, Analytics, Settings, etc.)
*   The active deck folder you are browsing or studying (e.g. `Marrow :: Pathology`).
*   Your current daily revision streak and streak records.
*   Spaced repetition card counts and review progress (e.g. `Reviewing card 5 of 24`).
*   Study room activities including Pomodoro timers, Sprints, and QR Scans.
*   A button linking directly to the app URL.

---

## Developer / Testing Instructions

To test this Discord Rich Presence locally during development:

### 1. Prerequisites
1.  Download and install the **[PreMiD Desktop Client](https://premid.app/download)** (runs in the background on your computer).
2.  Install the **[PreMiD Browser Extension](https://premid.app/download)** (Chrome, Firefox, Edge, Brave, etc.).
3.  Make sure the **Discord Desktop App** is running on your computer.

### 2. Enable Developer Mode in the Extension
1.  Click the PreMiD extension icon in your browser toolbar.
2.  Click the **Settings (gear icon ⚙️)** at the top right of the popup.
3.  Scroll down to the Developer section and enable **Activity Developer Mode**.

### 3. Run the PreMiD Dev Server
Open your terminal in this directory (`auto-anki-app/premid-presence`) and run:
```bash
npx pmd dev
```
*(If `pmd` is not recognized, you can run `npx @premid/cli dev` instead).*

This will start a local WebSocket server that interfaces with the PreMiD browser extension.

### 4. Test the Integration
1.  Start your Auto-Anki local server:
    ```bash
    npm run dev
    ```
2.  Open `http://localhost:5173` in your browser.
3.  Navigate through different tabs (Dashboard, CAMP Tracker, Library, study screen) in Auto-Anki.
4.  Open Discord and check your profile status—it should update in real-time with custom messages, active study timers, and stats!

---

## Customizing Discord Assets / Client ID

The presence is configured to use a default Discord client ID (`1388081691235352618`). If you want to use your own Discord Application assets and name:
1.  Go to the **[Discord Developer Portal](https://discord.com/developers/applications)**.
2.  Create a **New Application** named `Auto-Anki` (or your preferred name).
3.  Upload your rich presence logos under **Rich Presence > Art Assets** (e.g. `autoanki_logo` and `streak_flame`).
4.  Copy your application's **Client ID**.
5.  Open `metadata.json` and replace the `"default"` client ID under `"clientIDs"` with your new Client ID.
