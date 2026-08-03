# ⚡ Auto Anki App

<div align="center">

![Auto Anki App Banner](https://img.shields.io/badge/Auto_Anki-AI--Powered_Flashcard_Generator-6366f1?style=for-the-badge&logo=anki&logoColor=white)

### **Transform Heavy Textbooks, Medical Slides & Notes into Anki Decks in Seconds using Gemini AI**

[![React](https://img.shields.io/badge/React-19.2-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.0-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Gemini AI](https://img.shields.io/badge/Gemini_AI-Flash_&_Pro-8E75B2?style=flat-square&logo=google-gemini&logoColor=white)](https://ai.google.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Capacitor](https://img.shields.io/badge/Capacitor-Android_Native-119DFF?style=flat-square&logo=capacitor&logoColor=white)](https://capacitorjs.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)

[✨ Feature Highlights](#-key-features) • [🚀 Quick Start](#-quick-start) • [⚡ High-Performance PDF Engine](#-high-performance-pdf-engine) • [📱 Mobile App](#-mobile--capacitor-support)

---

</div>

<details open>
<summary><b>📌 What is Auto Anki App? (Click to expand / collapse)</b></summary>

> **Auto Anki App** is a next-generation study application engineered specifically for medical students, researchers, and intensive learners. It eliminates the manual drudgery of creating Anki flashcards by utilizing **Google Gemini AI** to automatically convert high-res slides, notes, and 800+ page medical textbooks into structured, tagged, hierarchically-mapped Anki cards.

</details>

---

## ✨ Key Features

```
 📥 Upload PDF / Slides / Images 
        │
        ▼
 📑 Page Extractor & Deck Mapper (Streaming Engine)
        │
        ▼
 🧠 Gemini AI Multimodal Concept Extraction ──► 🏷️ Tagging & Folder Routing
        │
        ▼
 📇 Structured Anki Cards (.apkg / Anki-Connect / JSON Export)
```

### 🧠 Multimodal AI Flashcard Generation
- **Instant High-Yield Cards:** Extract Question/Answer pairs, Cloze deletions, diagnostic triads, and high-yield clinical facts.
- **Image & Diagram Understanding:** Processes handwritten notes, histology slides, tables, and anatomy diagrams using Gemini multimodal vision.
- **Custom Deck Routing:** Map specific page ranges directly into hierarchical decks (e.g., `Marrow::Pathology::Neoplasia`).

### 📄 High-Performance PDF Engine *(Textbook Scale)*
- **Zero-V8-Heap Streaming:** Powered by `URL.createObjectURL` streaming to prevent V8 memory bloat when loading massive 800+ page textbooks.
- **Batched Worker Lifecycle:** Automatically destroys and re-initializes PDF.js web workers in 5-page batches to keep browser RAM under 150MB regardless of file size.
- **Lazy Thumbnail Rendering:** Integrated `IntersectionObserver` with global concurrency semaphores (max 2 parallel renders) for smooth print preview performance on low-end devices.

### 🗂️ Interactive Deck Hierarchy & Management
- **Visual Folder Tree:** Drag-and-drop folder reorganization, custom deck creation, and pre-aggregated card counts.
- **In-App Card Editor:** Edit front/back fields, add custom tags, rotate page sources, and manage card queues seamlessly.
- **Anki Package Export:** One-click export to native `.apkg` packages ready to import into Anki Desktop and AnkiMobile.

### 📊 Analytics & Study Tracking
- **Study Room & Camp Tracker:** Track review logs, study sessions, card retention, and daily study streaks.
- **Correlation Dashboard:** Interactive visualizations (via Recharts) analyzing study habits vs performance metrics.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js**: `v18.0.0` or higher
- **npm**: `v9.0.0` or higher
- **Gemini API Key**: Obtain a free key from [Google AI Studio](https://aistudio.google.com/)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/DoctorKishor/autoanki.git
cd autoanki

# 2. Install dependencies
npm install

# 3. Configure environment variables
# Create a .env file in the project root:
echo "VITE_GEMINI_API_KEY=your_gemini_api_key_here" > .env

# 4. Start local development server
npm run dev
```

The application will launch at `http://localhost:5173`.

---

## ⚡ High-Performance PDF Engine

<details>
<summary><b>🔍 How we process 800+ Page Textbooks on Low-End Devices (Technical Overview)</b></summary>

Processing multi-hundred-page medical textbooks inside client-side JavaScript can easily lead to browser crashes (OOM errors). Auto Anki App implements an enterprise-grade memory management architecture:

1. **Blob-URL File Streaming:** Avoids `file.arrayBuffer()` which duplicates whole file bytes in JavaScript heap. PDF.js streams straight from the OS file system cache.
2. **WebWorker Batch Destruction:** PDF.js accumulates font/image decoded bitmaps in web workers. We process in 5-page batches and invoke `pdf.destroy()`, forcing worker garbage collection.
3. **Viewport Auto-Capping:** Page renders are dynamically scaled to max 800px bounding boxes to avoid giant 3000px RGBA canvas allocations.
4. **Streamed State Updates:** Pages are added one-by-one to React state rather than accumulating in an intermediate array.

```ts
// Memory consumption stays flat under ~150MB even for an 800+ page textbook
Memory Profile: [ Baseline: 40MB ] ───► [ Peak Processing: 140MB ] ───► [ Rest: 50MB ]
```

</details>

---

## 📱 Mobile & Capacitor Support

Auto Anki App is fully optimized for touch devices and mobile environments via **Capacitor**.

```bash
# Sync native Capacitor plugins for Android
npx cap sync android

# Open project in Android Studio
npx cap open android
```

---

## 🛠️ Built With

<div align="center">

| Core UI | AI & Utilities | Charts & Styling | Mobile Native |
| :--- | :--- | :--- | :--- |
| **React 19** | **Gemini AI API** | **Tailwind CSS** | **Capacitor Android** |
| **Vite 8** | **PDF.js** | **Lucide Icons** | **HTML5 QRCode** |
| **Framer Motion** | **JSZip** | **Recharts** | **Hello Pangea DnD** |

</div>

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

<div align="center">

---
**Made with ❤️ for Medical Students & Lifelong Learners**

</div>
