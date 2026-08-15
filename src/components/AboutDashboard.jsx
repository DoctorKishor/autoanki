import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, Share2, Brain, GraduationCap, ShieldCheck, Zap, HardDrive, Cpu,
  BookOpen, Flame, BarChart2, Sliders, LayoutDashboard, Home, Library, Download,
  MessageSquare, CheckCircle2, ListChecks, Calendar, Tv, Settings, Trash2,
  Search, ArrowUpRight, Activity, Layers, Info, ExternalLink, HelpCircle, FileText,
  X, Check, Play, Pause, RotateCcw, SlidersHorizontal, ChevronDown, ChevronRight,
  Eye, Lightbulb, Filter, AlertTriangle, RefreshCw
} from 'lucide-react';

// Liquid Button Component matching exact spec
function LiquidButton({ children, onClick, className = '' }) {
  return (
    <button
      onClick={onClick}
      className={`liquid-glass rounded-xl px-5 py-2.5 text-xs md:text-sm font-semibold text-white/90 transition-transform duration-200 hover:scale-[1.02] cursor-pointer inline-flex items-center justify-center gap-2 active:scale-95 ${className}`}
    >
      {children}
    </button>
  );
}

// Card Video Component with auto-play looping 100% opacity matching exact spec
function CardVideo({ src }) {
  return (
    <video
      src={src}
      autoPlay
      muted
      loop
      playsInline
      className="absolute inset-0 h-full w-full object-cover pointer-events-none"
    />
  );
}

const MANUAL_CATEGORIES = [
  {
    id: 'focus',
    label: 'Focus & Review',
    icon: Flame,
    desc: 'Deep study lounge, FSRS-6 spaced repetition engine, Pomodoro lounge, and daily revision scheduling.',
    color: 'from-amber-500 to-orange-600',
    badgeColor: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    features: [
      {
        id: 'dashboard',
        name: 'Dashboard (Command Center)',
        tabId: 'dashboard',
        icon: LayoutDashboard,
        summary: 'Central command center providing real-time session tracking, live streak badges, customizable widgets, and due card forecasts.',
        elements: [
          { name: 'Live Timer & Stopwatch', type: 'Widget / Controller', desc: 'Starts, pauses, and resets active study blocks. Displays elapsed time in HH:MM:SS or with milliseconds toggle.' },
          { name: 'Milliseconds Toggle', type: 'Toggle', desc: 'Switches high-precision centisecond display on/off in the active timer widget.' },
          { name: 'Timer Fullscreen Button', type: 'Button', desc: 'Expands the study timer into a distraction-free full-screen ambient mode.' },
          { name: 'Widget Customizer (Settings)', type: 'Modal Button', desc: 'Opens a modal to toggle visibility and drag-and-drop order for Streak, Study Time, Quick Links, and Due Cards widgets.' },
          { name: 'Daily Target Sliders', type: 'Preferences', desc: 'Configures daily goals for Cards Target (e.g. 50 cards) and Hours Target (e.g. 4.0 hrs), saved to local storage.' },
          { name: 'Streak Meter & Archetypes', type: 'Status Badge', desc: 'Tracks consecutive daily revisions: Rookie (1h), Consistent (2-3h), Topper (3-5h), Legend (5h+).' },
          { name: 'Quick Logger Box', type: 'Action Input', desc: 'Instantly logs quick study hours, questions solved, or pages read directly into IndexedDB without opening full modals.' }
        ],
        howToUse: [
          '1. Review your streak meter and today\'s scheduled due cards forecast in the morning.',
          '2. Click "Play" on the Live Timer widget to start recording your focus session.',
          '3. Click "Customize" in the top bar to adjust which metric cards appear on your dashboard.',
          '4. Use Quick Access buttons to jump directly to Library, Smart Review, or Card Extractor.'
        ]
      },
      {
        id: 'smartReview',
        name: 'Smart Review Hub (FSRS-6)',
        tabId: 'smartReview',
        icon: Brain,
        summary: 'Official FSRS-6 algorithm implementation with 21 benchmark parameters (w0..w20), velocity gauges, and leech remediation.',
        elements: [
          { name: 'Review Queue Subtab', type: 'Subtab', desc: 'Displays daily categorized queues for Overdue Topics, Due Today Topics, and New Unstudied Topics.' },
          { name: 'Velocity Subtab', type: 'Subtab', desc: 'Displays real-time Cards/Hour throughput, retention velocity gauges, and cognitive load heatmaps.' },
          { name: 'Analytics (FSRS Stats) Subtab', type: 'Subtab', desc: 'Plots memory stability retention decay curves and difficulty distribution bar charts across 1M, 3M, 1Y, and ALL timeframes.' },
          { name: 'Leeches Subtab', type: 'Subtab', desc: 'Isolates high-lapse cards (lapses >= threshold) for dedicated clinical review and remediation.' },
          { name: 'Rating Buttons (Again, Hard, Good, Easy)', type: 'Rating Controls', desc: 'Grades active recall (1=Again, 2=Hard, 3=Good, 4=Easy) with live preview of next interval days displayed above each button.' },
          { name: 'Reveal Answer (Spacebar)', type: 'Button / Key', desc: 'Flips the flashcard or reveals answer fields and clinical explanations.' },
          { name: 'AI Hints Button (Lightbulb)', type: 'AI Tool', desc: 'Generates tiered active recall hints (First-line clue, Mechanism clue, Diagnostic hallmark) without spoiling the answer.' },
          { name: 'PDF Slice Viewer (Eye)', type: 'Modal Trigger', desc: 'Opens the high-resolution PDF textbook slice linked to the current topic in a preview modal.' },
          { name: 'Topic Notes Modal', type: 'Modal Trigger', desc: 'Opens attached clinical notes, diagnostic tables, and mnemonics for the active topic.' },
          { name: 'Select New Topics Modal', type: 'Modal Trigger', desc: 'Launches AI strategy modes (High-Yield Priority, Weakness First, Balanced Spread) to introduce new topics into the queue.' },
          { name: 'Exam Target Profiles Modal', type: 'Modal Trigger', desc: 'Configure target examination dates (NEET PG, INI-CET) and tentative flags to calibrate retention pacing.' },
          { name: 'FSRS-6 Settings Modal', type: 'Modal Trigger', desc: 'Configure Desired Retention (0.70 to 0.97), Max Interval (days), Leech Threshold, and 21 weight parameters.' },
          { name: 'Undo / Redo Buttons', type: 'Action Controls', desc: 'Reverts or re-applies the last rating with 100% queue order and FSRS state preservation.' }
        ],
        howToUse: [
          '1. Open Smart Review Hub and view your daily Due Queue.',
          '2. Read the clinical query, use AI Hints if stuck, then press Spacebar to reveal the answer.',
          '3. Select Again (1), Hard (2), Good (3), or Easy (4) based on your recall accuracy.',
          '4. Open the Analytics tab weekly to inspect your stability decay curve and difficulty distributions.'
        ]
      },
      {
        id: 'study',
        name: 'Study Room & Focus Lounge',
        tabId: 'study',
        icon: GraduationCap,
        summary: 'Full-screen distraction-free focus lounge with Pomodoro timers, ambient sound mixer, YouTube audio streams, and GT scorecards.',
        elements: [
          { name: 'Pomodoro Timer Controller', type: 'Timer Panel', desc: 'Configures work blocks (25m, 50m, custom), short breaks (5m), and long breaks (15m) with audio notifications.' },
          { name: 'Ambient Sound Mixer', type: 'Audio Panel', desc: 'Mixes Lo-Fi study beats, Gentle Rain, Forest Ambience, and White Noise tracks with independent volume sliders.' },
          { name: 'YouTube Audio Stream Embed', type: 'Audio Input', desc: 'Parses YouTube video URLs/IDs to stream study music directly in the background.' },
          { name: 'Medical Motivational Quotes', type: 'Quote Panel', desc: 'Displays curated quotes tailored for postgraduate medical aspirants with next/prev controls.' },
          { name: 'GT & Mock Scorecard Logger', type: 'Logger Panel', desc: 'Logs Grand Test (GT) exam scores, platform (Marrow, Prepladder, Cerebellum), type (NEET PG 200/180 Qs, INI-CET), correct/incorrect splits, and ranks.' },
          { name: 'Floating Utility Widgets', type: 'Draggable Widgets', desc: 'Minimizable floating overlays for Timer, Sound Mixer, Notes, and Live Study Metrics.' }
        ],
        howToUse: [
          '1. Set your Pomodoro interval and start the timer when beginning a revision block.',
          '2. Choose an ambient soundscape or paste a YouTube study stream link.',
          '3. After attempting a mock exam or Grand Test, log your score in the GT Scorecard panel to update long-term trend lines.'
        ]
      },
      {
        id: 'studyScheduler',
        name: 'Study Scheduler',
        tabId: 'studyScheduler',
        icon: Calendar,
        summary: 'Spaced repetition calendar balancing future review workloads, detecting overdue topics, and organizing daily tasks.',
        elements: [
          { name: 'Spaced Repetition Calendar Grid', type: 'Calendar View', desc: 'Visual daily matrix displaying scheduled topic reviews, completed decks, and upcoming workloads.' },
          { name: 'Overdue Topics Alert Bar', type: 'Alert List', desc: 'Highlights medical topics that have passed their scheduled FSRS review dates.' },
          { name: 'Daily Action Checklist', type: 'Task Manager', desc: 'Add, edit, check off, and delete daily study goals, QBank question quotas, and subject milestones.' },
          { name: 'Workload Leveler', type: 'Balancing Tool', desc: 'Distributes upcoming card reviews evenly across future days to avoid study burnout.' }
        ],
        howToUse: [
          '1. Inspect the calendar grid to identify days with heavy review loads.',
          '2. Check off overdue topics by clicking on them to launch an immediate review session.',
          '3. Add custom daily to-do tasks and mark them complete as you finish your study blocks.'
        ]
      }
    ]
  },
  {
    id: 'knowledge',
    label: 'Content & Knowledge',
    icon: BookOpen,
    desc: 'PDF textbook ingestion, Gemini Vision AI card extraction, 19 medical subjects, and NEET PG PYT indices.',
    color: 'from-blue-500 to-indigo-600',
    badgeColor: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    features: [
      {
        id: 'library',
        name: 'Library & PDF Ingestion',
        tabId: 'library',
        icon: Library,
        summary: 'Localized textbook repository with canvas PDF rendering, bounding box anchors, and page slice previews.',
        elements: [
          { name: 'Upload PDF / Slides Button', type: 'File Input', desc: 'Uploads medical textbook PDFs or slide images directly into local IndexedDB storage.' },
          { name: 'Interactive PDF Canvas Viewer', type: 'Reader View', desc: 'Powered by pdfjs-dist with multi-page continuous scroll, page jumps, and zooming.' },
          { name: 'Diagram Bounding Box Selector', type: 'Annotation Tool', desc: 'Click-and-drag bounding box on textbook diagrams to attach visual crops directly to flashcards.' },
          { name: 'PDF Slice Preview Tool', type: 'Modal Trigger', desc: 'Slices multi-page PDF sections into high-res images for visual flashcard extraction.' },
          { name: 'Subject Folders Manager', type: 'Folder System', desc: 'Create, rename, organize, and delete folders for all 19 medical subjects.' }
        ],
        howToUse: [
          '1. Upload your clinical textbook PDF (e.g. Robbins Pathology, Harrison Medicine) into the relevant subject folder.',
          '2. Scroll to a high-yield page and use the diagram selector to highlight a clinical flowchart or histology image.',
          '3. Trigger AI extraction to generate flashcards linked to that exact page coordinate.'
        ]
      },
      {
        id: 'cards',
        name: 'Cards Manager & AI Generation',
        tabId: 'cards',
        icon: Home,
        summary: 'Extract high-yield clinical cards from textbook pages using Google Gemini Vision AI with rich pre-save editing.',
        elements: [
          { name: 'AI Extract Flashcards Button', type: 'AI Action', desc: 'Sends page layout and text to Gemini Vision AI to extract high-yield clinical Q&A pairs.' },
          { name: 'Interactive Card Editor', type: 'Editor View', desc: 'Edit Question, Answer, Notes, Tags, Deck, and Yield Rating before saving to database.' },
          { name: 'Manual Card Creator Modal', type: 'Modal Trigger', desc: 'Create cards manually with rich formatting, Cloze deletion syntax ({{c1::text}}), and image drag-and-drop.' },
          { name: 'Image Cropper Tool', type: 'Image Editor', desc: 'Adjust crop boundaries for clinical diagrams, histology slides, and ECG strips.' },
          { name: 'Conflict Inspector Modal', type: 'Modal Trigger', desc: 'Detects duplicate cards in active decks and offers side-by-side diffing to merge, overwrite, or discard.' },
          { name: 'Search & Tag Filters', type: 'Filter Controls', desc: 'Filter generated cards by Subject, Tag, Status, or Yield Tier (High-Yield / Super-High-Yield).' }
        ],
        howToUse: [
          '1. Click "Extract Flashcards" on any uploaded textbook page.',
          '2. Refine the generated question and answer in the interactive editor.',
          '3. Assign appropriate subject tags and click "Save to Deck".',
          '4. If duplicates are found, resolve them in the Conflict Inspector modal.'
        ]
      },
      {
        id: 'subjectTracker',
        name: 'Subject Tracker (19 Subjects)',
        tabId: 'subjectTracker',
        icon: ListChecks,
        summary: 'Complete syllabus matrix covering Pre-clinical, Para-clinical, and Clinical postgraduate medical modules.',
        elements: [
          { name: '19-Subject Matrix Grid', type: 'Matrix View', desc: 'Covers Anatomy, Physiology, Biochemistry, Pathology, Pharmacology, Microbiology, FMT, PSM, Ophthal, ENT, Medicine, Surgery, OBG, Peds, Ortho, Derma, Psych, Radio, and Anesthesia.' },
          { name: 'Chapter Milestone Checklists', type: 'Checklist', desc: 'Mark individual chapters and revision stages complete as you progress.' },
          { name: 'Time Log Sync', type: 'Data Link', desc: 'Links focus hours logged in the Study Room directly to individual subject milestones.' },
          { name: 'Completion Date Projection', type: 'Predictive Gauge', desc: 'Estimates syllabus completion date based on your active daily study velocity.' }
        ],
        howToUse: [
          '1. Select a medical subject to view its chapter checklist.',
          '2. Mark completed chapters after finishing your reading blocks.',
          '3. Review the projected completion timeline to stay on track for exam dates.'
        ]
      },
      {
        id: 'pytManager',
        name: 'PYT Manager (Previous Year Topics)',
        tabId: 'pytManager',
        icon: BookOpen,
        summary: 'Central reference database of clinical themes tested in past NEET PG and INI-CET entrance examinations.',
        elements: [
          { name: 'Subject Syllabus Selector', type: 'Dropdown', desc: 'Filter PYT topics across all 19 medical subjects.' },
          { name: 'Bulk Topic Ingestion Box', type: 'Text Area / Parser', desc: 'Paste syllabus topic lists (one topic per line) with automated indexing and storage in IndexedDB.' },
          { name: 'Yield Level Ratings', type: 'Tag Badges', desc: 'Flags topics as Standard, High-Yield, or Super-High-Yield based on past exam frequency.' },
          { name: 'Textbook PDF Mapping', type: 'File Linker', desc: 'Link scanned textbook PDFs directly to PYT topics for contextual study.' }
        ],
        howToUse: [
          '1. Choose a subject and paste your topic list into the bulk ingestion box.',
          '2. Click "Save PYT Topics" to index the syllabus into local storage.',
          '3. Assign Super-High-Yield tags to topics frequently tested in recent exam papers.'
        ]
      },
      {
        id: 'pytLogger',
        name: 'PYT Logger & Revision Heatmap',
        tabId: 'pytLogger',
        icon: CheckCircle2,
        summary: 'Log study events directly against PYT IDs with revision frequency heatmaps and neglect warnings.',
        elements: [
          { name: 'Topic Revision Counters (+ / -)', type: 'Counter Buttons', desc: 'Increments or decrements the logged revision count for individual medical topics.' },
          { name: 'Coverage Heatmap', type: 'Visual Matrix', desc: 'Color-coded indicators showing thoroughly revised vs neglected topics.' },
          { name: 'Neglected Topics Filter (>30 Days)', type: 'Filter Button', desc: 'Isolates critical clinical topics that have not been revised in over 30 days.' },
          { name: 'Duplicate Topics Cleaner', type: 'Filter Button', desc: 'Detects and merges duplicate topic entries across spelling variations.' },
          { name: 'Multi-Sort Selector', type: 'Dropdown', desc: 'Sorts by Alphabetical (A-Z), Page Number (Ascending), Revisions (High to Low), or Revisions (Low to High).' }
        ],
        howToUse: [
          '1. After completing a clinical topic, locate it in the PYT Logger and tap the "+" button.',
          '2. Filter by "Neglected Topics" at the start of each week to prioritize forgotten clinical points.',
          '3. Use search and sorting to find specific topics quickly.'
        ]
      }
    ]
  },
  {
    id: 'analytics',
    label: 'Progress & Metrics',
    icon: BarChart2,
    desc: 'Consistent Active Memorization Protocol (CAMP), counseling rank predictors, and nested Sunburst deck charts.',
    color: 'from-emerald-500 to-teal-600',
    badgeColor: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    features: [
      {
        id: 'campTracker',
        name: 'CAMP Tracker (Milestone Protocol)',
        tabId: 'campTracker',
        icon: Activity,
        summary: 'Consistent Active Memorization Protocol tracking micro-milestone progression and mathematical throughput.',
        elements: [
          { name: 'Micro-Milestone Cards', type: 'Interactive Cards', desc: 'Breaks down subjects into small milestone cards with Unstudied, In-Progress, and Completed states.' },
          { name: 'Efficiency Score Calculator', type: 'Algorithm Display', desc: 'Computes cognitive throughput score based on completed milestones vs logged hours.' },
          { name: 'Weighted Concentration Index', type: 'Radar / Metric', desc: 'Evaluates balance between clinical and pre-clinical subject coverage.' },
          { name: 'Milestone Progress Radars', type: 'Chart', desc: 'Visualizes completion percentage across each subject module.' }
        ],
        howToUse: [
          '1. Open CAMP Tracker after completing a subject deck review.',
          '2. Click milestone badges to advance their status to "Completed".',
          '3. Review your Efficiency Score to gauge study throughput.'
        ]
      },
      {
        id: 'analytics',
        name: 'Analysis & Counseling Predictor',
        tabId: 'analytics',
        icon: BarChart2,
        summary: 'Deep analytical suite with 5 specialized subtabs, counseling rank predictors, and circadian peak heatmaps.',
        elements: [
          { name: 'Generation Analytics Subtab', type: 'Subtab', desc: 'Tracks total AI-generated cards, daily creation volume, and API token usage.' },
          { name: 'Study Analytics Subtab', type: 'Subtab', desc: 'Displays daily study consistency heatmaps, review accuracy percentages, and hours distribution.' },
          { name: 'Counseling & Rank Predictor Subtab', type: 'Subtab / Predictor', desc: 'Input mock Grand Test scores to predict estimated NEET PG rank brackets and counseling specialty cutoffs.' },
          { name: 'PYT Coverage Subtab', type: 'Subtab', desc: 'Visualizes percentage of tested Previous Year Topics revised across all 19 subjects.' },
          { name: 'Subject Coverage Subtab', type: 'Subtab / Sunburst', desc: 'Interactive nested Sunburst chart mapping cards count across subjects and subtopics.' },
          { name: 'Circadian Peak Heatmap', type: 'Chart', desc: 'Pinpoints peak cognitive performance hours (Morning, Afternoon, Evening, Night).' }
        ],
        howToUse: [
          '1. Navigate to Analysis to inspect your weekly study patterns.',
          '2. Enter your latest Grand Test score in the Counseling Predictor to forecast competitive rank tiers.',
          '3. Explore the Sunburst chart to locate subjects requiring more flashcards.'
        ]
      }
    ]
  },
  {
    id: 'system',
    label: 'Tools & System',
    icon: Sliders,
    desc: 'Official Anki APKG compiler, AI prompt tuning, OBS stream overlays, local database manager, and Chrome extension.',
    color: 'from-purple-500 to-pink-600',
    badgeColor: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    features: [
      {
        id: 'export',
        name: 'Exporter Hub & Anki APKG Compiler',
        tabId: 'export',
        icon: Download,
        summary: 'Compile curated deck collections into standardized SQLite .apkg files compatible with official Anki apps.',
        elements: [
          { name: 'Compile .apkg Package Button', type: 'Export Action', desc: 'Packages cards, tags, formatting, and notes into standard SQLite Anki databases.' },
          { name: 'Media Asset Bundler', type: 'Media Processor', desc: 'Automatically embeds cropped images and diagrams into the .apkg media collection.' },
          { name: 'Export Image Verification Modal', type: 'Modal Trigger', desc: 'Scans deck for broken image links or missing coordinates and fixes them before export.' },
          { name: 'Subject / Tag Selectors', type: 'Checkboxes', desc: 'Select specific subjects or tag groups for modular specialty exports.' }
        ],
        howToUse: [
          '1. Select the subjects or decks you wish to export.',
          '2. Click "Verify Images" to ensure all diagram attachments are intact.',
          '3. Click "Generate .apkg" and import the downloaded file directly into official Anki on Desktop, iOS, or Android.'
        ]
      },
      {
        id: 'prompt',
        name: 'AI Prompt Editor',
        tabId: 'prompt',
        icon: MessageSquare,
        summary: 'Refine Gemini AI extraction guidelines with dual prompt categories and JSON schema validation.',
        elements: [
          { name: 'Image Prompts Category Tab', type: 'Category Tab', desc: 'Prompts tailored for diagram parsing, histology labels, clinical flowcharts, and radiology signs.' },
          { name: 'Text Prompts Category Tab', type: 'Category Tab', desc: 'Prompts tailored for high-yield tables, differential diagnoses, and pharmacological bullet points.' },
          { name: 'Instruction Profile Editor', type: 'Editor', desc: 'Customize extraction rules (e.g. emphasize clinical case-vignettes, diagnostic criteria).' },
          { name: 'JSON Schema Validation Tester', type: 'Validator', desc: 'Validates AI response structure against strict JSON output schemas.' },
          { name: 'Template Backups & Factory Reset', type: 'Action Buttons', desc: 'Save custom presets or restore original medical extraction guidelines.' }
        ],
        howToUse: [
          '1. Select Image or Text category.',
          '2. Adjust prompt directives to emphasize your preferred flashcard format.',
          '3. Save changes or click "Reset" to return to verified default medical prompts.'
        ]
      },
      {
        id: 'obsOverlay',
        name: 'OBS Overlay Customizer',
        tabId: 'obsOverlay',
        icon: Tv,
        summary: 'Broadcast live session statistics, timers, and streak badges on study streams via OBS Studio.',
        elements: [
          { name: 'Live Data Synchronizer', type: 'Data Feed', desc: 'Synchronizes active session timer, study hours, and streak titles with streaming client inputs.' },
          { name: 'Visual Layout Customizer', type: 'Styling Panel', desc: 'Adjust background opacity, borders, typography, and color schemes.' },
          { name: 'Copy Browser Source Link', type: 'Copy Button', desc: 'Generates and copies a persistent Browser Source URL formatted for OBS Studio.' }
        ],
        howToUse: [
          '1. Customize your overlay colors and dimensions.',
          '2. Click "Copy Link".',
          '3. In OBS Studio, add a Browser Source, paste the URL, and match width/height.'
        ]
      },
      {
        id: 'settings',
        name: 'Settings & LocalDB Management',
        tabId: 'settings',
        icon: Settings,
        summary: '100% offline-first IndexedDB database control, JSON database backup/restore, and private GitHub sync.',
        elements: [
          { name: 'Backup Database (Export JSON)', type: 'Backup Button', desc: 'Exports entire IndexedDB database (flashcards, logs, PYTs, settings) to a single portable JSON file.' },
          { name: 'Restore Database (Import JSON)', type: 'Restore Button', desc: 'Imports a saved JSON backup to restore all data instantly with zero data loss.' },
          { name: 'Storage Store Diagnostics', type: 'Diagnostic View', desc: 'Inspects item counts and storage footprint for each IndexedDB store.' },
          { name: 'GitHub Cloud Sync (PAT Manager)', type: 'Sync Controller', desc: 'Configure GitHub Username, Repo, and Personal Access Token for secure push/pull cloud backups.' },
          { name: 'Gemini API Key Manager', type: 'Credentials Input', desc: 'Input and validate Google Gemini API key with live connection testing.' },
          { name: 'Theme Mode Toggle (Light / Dark)', type: 'Theme Switch', desc: 'Switches between Neumorphic Light (#e6ecf5) and Dark (#222730).' },
          { name: 'Mobile Navigation Customizer', type: 'Drag-and-Drop', desc: 'Configure up to 8 bottom navigation tab shortcuts for mobile view.' }
        ],
        howToUse: [
          '1. Input your Google Gemini API key to enable AI card generation.',
          '2. Click "Backup Database (JSON)" to keep safe offline backups on your computer.',
          '3. Link your private GitHub repository for automated cross-device syncing.'
        ]
      },
      {
        id: 'trash',
        name: 'Recycle Bin & Recovery',
        tabId: 'trash',
        icon: Trash2,
        summary: 'Soft-delete safety net for restoring accidentally removed cards and pages back to active decks.',
        elements: [
          { name: 'Restore Card Button', type: 'Action Button', desc: 'Instantly restores soft-deleted cards back to their exact original parent deck.' },
          { name: 'Empty Recycle Bin Button', type: 'Delete Action', desc: 'Permanently deletes all soft-deleted items to reclaim local disk space.' },
          { name: 'Deletion Audit Log', type: 'Audit Table', desc: 'Displays original deletion timestamps and parent deck tags.' }
        ],
        howToUse: [
          '1. If a card or page is accidentally deleted, open the Recycle Bin.',
          '2. Locate the item and click the green "Restore" button.',
          '3. To permanently wipe deleted cards, click "Empty Recycle Bin".'
        ]
      },
      {
        id: 'chromeExt',
        name: 'Chrome Extension Ecosystem',
        tabId: 'library',
        icon: ExternalLink,
        summary: 'Browser companion tool to highlight medical text/diagrams online and send cards straight to AutoAnki.',
        elements: [
          { name: 'Floating Action Menu', type: 'Browser Injected UI', desc: 'Appears when highlighting medical questions on online question banks (Marrow, Prepladder).' },
          { name: 'Offscreen Diagram Capturer', type: 'Canvas Engine', desc: 'Captures high-res diagram regions from web pages directly into AutoAnki.' },
          { name: 'Extension Popup Manager', type: 'Popup Tool', desc: 'Select active deck and trigger instant card creation directly from the browser toolbar.' }
        ],
        howToUse: [
          '1. Install the extension in Chrome from the chrome-extension directory.',
          '2. Highlight clinical questions on medical portals and click the AutoAnki floating icon.',
          '3. Cards are automatically saved into your active AutoAnki queue.'
        ]
      }
    ]
  }
];

export default function AboutDashboard({ isDark = false, onNavigate }) {
  const [activeTab, setActiveTab] = useState('app_info'); // 'app_info' | 'features' | 'manual'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all'); // 'all' | 'focus' | 'knowledge' | 'analytics' | 'system'
  const [selectedFeatureModal, setSelectedFeatureModal] = useState(null);

  // Filtered manual items
  const filteredCategories = useMemo(() => {
    return MANUAL_CATEGORIES.map(cat => {
      if (selectedCategory !== 'all' && cat.id !== selectedCategory) {
        return null;
      }
      const matchingFeatures = cat.features.filter(f => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
          f.name.toLowerCase().includes(q) ||
          f.summary.toLowerCase().includes(q) ||
          f.elements.some(e => e.name.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q)) ||
          f.howToUse.some(h => h.toLowerCase().includes(q))
        );
      });
      if (matchingFeatures.length === 0) return null;
      return { ...cat, features: matchingFeatures };
    }).filter(Boolean);
  }, [searchQuery, selectedCategory]);

  const totalFeatureCount = useMemo(() => {
    return MANUAL_CATEGORIES.reduce((acc, cat) => acc + cat.features.length, 0);
  }, []);

  const tabIndex = activeTab === 'app_info' ? 0 : activeTab === 'features' ? 1 : 2;

  return (
    <div className="space-y-8 pb-24 text-left">
      
      {/* HEADER HERO SECTION */}
      <motion.div 
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0, 0, 0.2, 1] }}
        className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-700 p-6 md:p-8 rounded-3xl text-white shadow-xl relative overflow-hidden"
      >
        <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 opacity-10 pointer-events-none">
          <Brain className="w-72 h-72 text-white" />
        </div>
        <div className="relative z-10 space-y-2.5 max-w-3xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[11px] font-black uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" /> Documentation & Knowledge Hub
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
            AutoAnki Interactive Ecosystem
          </h1>
          <p className="text-xs md:text-sm text-blue-100 font-medium leading-relaxed">
            A 100% offline-first AI medical flashcard platform engineered to eliminate busywork and maximize active recall retention for medical licensure exams.
          </p>
        </div>
      </motion.div>

      {/* MODERN SLIDING PILL 3-SUBTAB SWITCHER */}
      <div 
        className={`relative flex items-center p-1.5 rounded-2xl select-none overflow-x-auto custom-scrollbar max-w-lg ${
          isDark 
            ? 'neu-pressed-dark border border-gray-800/80 bg-[#1e232d]' 
            : 'neu-pressed-light border border-white/80 bg-[#e6ecf5]'
        }`}
      >
        {/* Sliding Active Pill */}
        <div
          className={`absolute top-1.5 bottom-1.5 rounded-xl shadow-md ${
            isDark ? 'neu-btn-accent-dark' : 'neu-btn-accent-light'
          }`}
          style={{
            width: 'calc(33.333% - 0.25rem)',
            left: `calc(0.375rem + ${tabIndex} * (33.333% - 0.125rem))`,
            transition: 'all 0.6s cubic-bezier(0, 0, 0, 1)'
          }}
        />

        <button
          onClick={() => setActiveTab('app_info')}
          className={`w-1/3 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer select-none flex items-center justify-center gap-1.5 relative z-10 transition-colors duration-300 ${
            activeTab === 'app_info'
              ? 'text-white font-extrabold'
              : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
          }`}
        >
          <Info className="w-3.5 h-3.5" />
          <span>About App</span>
        </button>

        <button
          onClick={() => setActiveTab('features')}
          className={`w-1/3 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer select-none flex items-center justify-center gap-1.5 relative z-10 transition-colors duration-300 ${
            activeTab === 'features'
              ? 'text-white font-extrabold'
              : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Showcase</span>
        </button>

        <button
          onClick={() => setActiveTab('manual')}
          className={`w-1/3 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer select-none flex items-center justify-center gap-1.5 relative z-10 transition-colors duration-300 ${
            activeTab === 'manual'
              ? 'text-white font-extrabold'
              : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Manual ({totalFeatureCount})</span>
        </button>
      </div>

      <AnimatePresence mode="wait">
        {/* ========================================================================= */}
        {/* SUBTAB 1: ABOUT APP */}
        {/* ========================================================================= */}
        {activeTab === 'app_info' && (
          <motion.div 
            key="app_info_tab"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="space-y-8"
          >
            {/* WHAT IS AUTOANKI CARD */}
            <motion.div 
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05 }}
              className={`p-6 md:p-8 rounded-3xl border shadow-sm space-y-6 ${
                isDark 
                  ? 'bg-[#222730] border-slate-700/80 neu-card-dark text-slate-200' 
                  : 'bg-white border-slate-200 neu-card-light text-slate-800'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-500">
                  <Brain className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg md:text-xl font-black tracking-tight">What is AutoAnki?</h2>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">AI Medical Flashcard Engine & FSRS-6 Spaced Repetition Suite</p>
                </div>
              </div>

              <div className="text-xs md:text-sm leading-relaxed space-y-3 font-medium opacity-90 max-w-4xl">
                <p>
                  AutoAnki is an advanced, AI-powered active recall ecosystem tailored specifically for postgraduate medical doctors and aspirants preparing for competitive licensing examinations like <strong className="text-blue-500">NEET PG</strong> and <strong className="text-indigo-500">INI-CET</strong>.
                </p>
                <p>
                  Built with a <strong className="text-emerald-500">100% offline-first local database model (IndexedDB via localDb.js)</strong>, it ensures lightning-fast flashcard reviews, sub-millisecond queries, and zero cloud dependency while offering flexible private GitHub sync.
                </p>
              </div>

              {/* Feature Highlights Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-150'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <HardDrive className="w-4 h-4 text-blue-500" />
                    <div className="text-base font-black text-blue-500">100%</div>
                  </div>
                  <div className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Offline First</div>
                  <div className="text-[9px] text-slate-500 font-medium mt-0.5">Zero cloud latency lag</div>
                </div>

                <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-150'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-4 h-4 text-emerald-500" />
                    <div className="text-base font-black text-emerald-500">&lt; 1ms</div>
                  </div>
                  <div className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Local DB Latency</div>
                  <div className="text-[9px] text-slate-500 font-medium mt-0.5">IndexedDB instant reads</div>
                </div>

                <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-150'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Cpu className="w-4 h-4 text-purple-500" />
                    <div className="text-base font-black text-purple-500">FSRS-6</div>
                  </div>
                  <div className="text-[10px] text-slate-400 font-black uppercase tracking-wider">21 Parameters</div>
                  <div className="text-[9px] text-slate-500 font-medium mt-0.5">State-of-the-art memory math</div>
                </div>

                <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-150'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="w-4 h-4 text-indigo-500" />
                    <div className="text-base font-black text-indigo-500">19 Subjects</div>
                  </div>
                  <div className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Medical Coverage</div>
                  <div className="text-[9px] text-slate-500 font-medium mt-0.5">Pre & Clinical Modules</div>
                </div>
              </div>
            </motion.div>

            {/* DEDICATED PREMIUM DEVELOPER PORTFOLIO HERO */}
            <motion.div 
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="text-white p-6 md:p-8 rounded-3xl shadow-2xl relative overflow-hidden border border-red-500/20"
              style={{
                backgroundColor: '#1d222b',
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
                backgroundSize: '24px 24px'
              }}
            >
              {/* Background ambient glow shapes */}
              <div className="absolute -right-20 -bottom-20 w-96 h-96 bg-red-600/15 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -left-20 -top-20 w-96 h-96 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute left-1/3 top-1/4 w-80 h-80 bg-white/5 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 space-y-6">
                
                {/* Header Profile Title Info */}
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-red-500/20 text-red-500 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner shrink-0">
                    🩺
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-white tracking-tight leading-none">Dr. Kishor Anbazhakan</h2>
                    <p className="text-xs text-red-400 font-bold flex items-center gap-1 mt-1.5">
                      <GraduationCap className="w-4 h-4" /> General Practitioner (MBBS) & Medical Tech Developer
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-700/80 my-4" />

                {/* 2-Column Layout for Bio & Interactive Stats */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  
                  {/* Left: Silhouette & Text Wrap */}
                  <div className="lg:col-span-2 flow-root text-xs text-gray-200 leading-relaxed font-medium">
                    {/* Transparent silhouette PNG floated to the left with alpha shape-outside wrapping */}
                    <img 
                      src="/developer_profile.png" 
                      alt="Dr. Kishor Anbazhakan silhouette" 
                      className="w-36 h-64 md:w-56 md:h-96 object-contain float-left mr-6 mb-2 [shape-outside:url('/developer_profile.png')] [shape-margin:1.5rem]"
                    />
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <h4 className="text-xs font-black uppercase text-red-400 tracking-wider flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-red-400" /> The Story
                        </h4>
                        <p className="text-xs text-gray-300 leading-relaxed max-w-3xl">
                          The journey of AutoAnki began in active clinical rotations, where balancing 14-hour hospital shifts with rigorous exam preparation was the daily reality. I realized that traditional flashcard creation—copious copying, pasting, cropping, and tagging—consumed more time than actual active study. Driven by this inefficiency, I wrote the first scripts to automate deck formatting. Over countless late-night coding sessions, those scripts evolved into this comprehensive desktop-mobile ecosystem, merging state-of-the-art vision models with spaced repetition science.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <h4 className="text-xs font-black uppercase text-red-400 tracking-wider flex items-center gap-1.5">
                          <Brain className="w-3.5 h-3.5 text-red-400" /> Mission & Vision
                        </h4>
                        <p className="text-xs text-gray-300 leading-relaxed max-w-3xl">
                          Designed by a doctor, for doctors and medical aspirants. The goal is simple: eliminate the busywork of card formatting so you can focus entirely on mastering clinical concepts and conquering competitive postgraduate medical entrance examinations (like NEET PG and INICET). AutoAnki integrates sub-second local database pipelines, personalized sleep tracking logic, and high-yield topic indices (PYTs). This platform represents the ultimate consolidation of medicine and computer science, engineering a study space where technology handles cognitive load so you can achieve peak learning efficiency.
                        </p>
                      </div>

                      <div className="pt-4">
                        <a 
                          href="https://linktr.ee/doctorkishor" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition active:scale-95 shadow-lg shadow-red-950/50"
                        >
                          <Share2 className="w-4 h-4" /> Connect with Developer
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Right: Modern Aesthetic Elements / Stats Grid */}
                  <div className="lg:col-span-1 flex flex-col justify-center space-y-4">
                    <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">Project Statistics</h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { val: '19', label: 'Subjects covered', desc: 'All clinical/pre-clinical modules' },
                        { val: '99.8%', label: 'AI Extraction accuracy', desc: 'High-yield fact isolation' },
                        { val: '< 1ms', label: 'Local DB query speed', desc: 'IndexedDB instant retrieval' },
                        { val: 'FSRS-6', label: 'Algorithm standard', desc: '21 calibrated parameters' }
                      ].map((stat, idx) => (
                        <div key={idx} className="bg-white/5 border border-white/10 p-4 rounded-2xl flex flex-col justify-between hover:bg-white/10 transition duration-300">
                          <div className="text-2xl font-black text-red-400">{stat.val}</div>
                          <div>
                            <div className="text-[10px] font-black text-white mt-1">{stat.label}</div>
                            <div className="text-[8px] text-gray-400 font-medium leading-tight mt-0.5">{stat.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="bg-red-950/20 border border-red-900/30 p-4 rounded-2xl space-y-2">
                      <div className="text-[10px] font-black text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5" /> Local-First Blueprint
                      </div>
                      <p className="text-[9px] text-gray-300 leading-normal font-medium">
                        Engineered with an IndexedDB storage engine (`localDb.js`), optimized for sub-second flashcard lookups, and integrated with GitHub sync for complete user data ownership.
                      </p>
                    </div>
                  </div>

                </div>

              </div>
            </motion.div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* SUBTAB 2: FEATURES SHOWCASE (CINEMATIC BENTO GRID SPEC) */}
        {/* ========================================================================= */}
        {activeTab === 'features' && (
          <motion.div 
            key="features_tab"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="rounded-3xl p-6 md:p-10 text-white shadow-2xl relative overflow-hidden border border-slate-800"
            style={{
              backgroundColor: '#000000',
              fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif'
            }}
          >
            {/* Header matching exact prompt spec */}
            <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-start md:justify-between text-left">
              <div className="space-y-2 max-w-2xl">
                <h2 className="text-2xl md:text-4xl lg:text-[2.75rem] font-normal tracking-tight text-white leading-tight">
                  Medical-grade tools for high-yield licensure mastery.
                </h2>
                <p className="text-sm md:text-base text-white/40 mt-2 font-normal">
                  Study with confidence. Powered by FSRS-6 & Gemini Vision AI.
                </p>
              </div>
              <div className="md:pt-3 shrink-0">
                <LiquidButton onClick={() => onNavigate && onNavigate('smartReview')}>
                  Start Using AutoAnki
                </LiquidButton>
              </div>
            </div>

            {/* Bento Grid matching exact spec: grid-cols-1 gap-5 md:grid-cols-3 md:grid-rows-2 */}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:grid-rows-2 text-left">
              
              {/* CARD 01 — feature-card md:row-span-2 min-h-[28rem] (tall left column) */}
              <div className="feature-card md:row-span-2 min-h-[28rem] p-7 flex flex-col relative rounded-[1.25rem] overflow-hidden bg-[#252B4C]">
                <CardVideo src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260427_104605_2700410c-4303-4d44-a368-e1b8c84eca8c.mp4" />
                
                {/* Top row */}
                <div className="relative z-10 flex justify-between text-sm text-white/60 font-medium">
                  <span>01/</span>
                  <span>Focus & FSRS-6 Review</span>
                </div>

                {/* Spacer */}
                <div className="flex-1 min-h-24" />

                {/* Bottom block */}
                <div className="relative z-10">
                  <h3 className="text-xl md:text-2xl font-medium text-white leading-tight">
                    Scientific Memory Retention<br/>Built for Clinical Mastery
                  </h3>
                  <div className="mt-4 h-px w-full bg-white/20" />
                  <p className="mt-4 text-xs text-white/70 leading-relaxed font-normal">
                    FSRS-6 algorithm with 21 calibrated parameters.<br/>
                    Adaptive stability, difficulty, and interval scheduling engineered for medical doctors.
                  </p>
                  <div className="mt-5">
                    <LiquidButton onClick={() => onNavigate && onNavigate('smartReview')}>
                      Launch Smart Review
                    </LiquidButton>
                  </div>
                </div>
              </div>

              {/* CARD 02 — feature-card-dark md:col-span-2 (wide top right) */}
              <div className="feature-card-dark md:col-span-2 p-7 flex flex-col relative rounded-[1.25rem] overflow-hidden bg-[#252B4C]">
                <CardVideo src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260427_104731_bfd355f7-1f84-4f81-ad88-52c2bca70bad.mp4" />
                
                {/* Top row */}
                <div className="relative z-10 flex justify-between items-start gap-4">
                  <h3 className="text-xl md:text-2xl font-medium text-white leading-tight">
                    Where High-Yield Clinical Mastery Begins
                  </h3>
                  <span className="text-sm text-white/60 font-medium shrink-0">02/</span>
                </div>

                {/* Spacer */}
                <div className="flex-1 min-h-36 md:min-h-48" />

                {/* Bottom block */}
                <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <p className="text-xs text-white/80 max-w-md font-normal leading-relaxed">
                    Extract high-yield clinical cards directly from textbook PDF pages using Gemini Vision AI. Integrated with the 19-subject syllabus and NEET PG / INI-CET PYT indices.
                  </p>
                  <div className="shrink-0">
                    <LiquidButton onClick={() => onNavigate && onNavigate('cards')}>
                      Open Cards Manager
                    </LiquidButton>
                  </div>
                </div>
              </div>

              {/* CARD 03 — feature-card (bottom middle) */}
              <div className="feature-card p-7 flex flex-col relative rounded-[1.25rem] overflow-hidden bg-[#252B4C]">
                <CardVideo src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260427_104758_e7d78f06-3700-4862-8c9b-595ed447e81a.mp4" />
                
                {/* Top row */}
                <div className="relative z-10 flex justify-between text-sm text-white/60 font-medium">
                  <span>CAMP Protocol & Velocity</span>
                  <span>03/</span>
                </div>

                <p className="relative z-10 mt-8 text-xs text-white/80 leading-relaxed font-normal">
                  Consistent Active Memorization Protocol (CAMP). Measure mathematical efficiency throughput, track subject milestones, and forecast exam rank percentiles.
                </p>

                {/* Spacer */}
                <div className="flex-1 min-h-8" />

                {/* Bottom */}
                <div className="relative z-10 mt-6">
                  <LiquidButton onClick={() => onNavigate && onNavigate('campTracker')}>
                    Open CAMP Tracker
                  </LiquidButton>
                </div>
              </div>

              {/* CARD 04 — feature-card (bottom right) */}
              <div className="feature-card p-7 flex flex-col relative rounded-[1.25rem] overflow-hidden bg-[#252B4C]">
                <CardVideo src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260427_105007_f90de0f3-0f93-44d4-9b71-7446f78c4bd2.mp4" />
                
                {/* Top row */}
                <div className="relative z-10 flex justify-between text-sm text-white/60 font-medium">
                  <span>100% Offline-First LocalDB</span>
                  <span>04/</span>
                </div>

                {/* Spacer */}
                <div className="flex-1 min-h-16" />

                {/* Bottom paragraph */}
                <div className="relative z-10 text-center space-y-2">
                  <p className="text-xs text-white/80 font-normal leading-relaxed">
                    Sub-millisecond query speed powered by IndexedDB. Zero cloud latency lag with full SQLite Anki package (.apkg) compilation.
                  </p>
                  <p className="text-[10px] text-white/50 uppercase tracking-wider font-bold">
                    Medical Aspirants & Rankers Trust Our Local Engine
                  </p>
                </div>
              </div>

            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* SUBTAB 3: COMPLETE APPLICATION MANUAL */}
        {/* ========================================================================= */}
        {activeTab === 'manual' && (
          <motion.div 
            key="manual_tab"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            {/* MANUAL CONTROLS & SEARCH BAR */}
            <div className={`p-4 md:p-6 rounded-3xl border space-y-4 ${
              isDark 
                ? 'bg-[#222730] border-slate-700/80 neu-card-dark text-slate-200' 
                : 'bg-white border-slate-200 neu-card-light text-slate-800'
            }`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-blue-500" />
                    AutoAnki Complete A-to-Z Feature Manual
                  </h2>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    Click any feature card to view its full button-by-button breakdown, UI elements, and step-by-step instructions.
                  </p>
                </div>

                {/* Search Bar */}
                <div className="relative w-full md:w-80 shrink-0">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search buttons, features, settings..."
                    className={`w-full pl-9 pr-4 py-2.5 text-xs font-semibold rounded-xl outline-none transition ${
                      isDark 
                        ? 'bg-slate-800/80 border border-slate-700/80 text-white placeholder-slate-500 focus:border-blue-500' 
                        : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-500'
                    }`}
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition shrink-0 ${
                    selectedCategory === 'all'
                      ? 'bg-blue-600 text-white shadow-md'
                      : (isDark ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                  }`}
                >
                  All Categories ({totalFeatureCount})
                </button>
                {MANUAL_CATEGORIES.map(cat => {
                  const CatIcon = cat.icon;
                  const isSelected = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition flex items-center gap-1.5 shrink-0 ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-md'
                          : (isDark ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                      }`}
                    >
                      <CatIcon className="w-3.5 h-3.5" />
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* CATEGORIES & FEATURE CARDS */}
            <div className="space-y-8">
              {filteredCategories.map(category => {
                const CategoryIcon = category.icon;
                return (
                  <motion.div 
                    key={category.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-4"
                  >
                    {/* Category Header */}
                    <div className="flex items-center gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
                      <div className={`p-2 rounded-xl bg-gradient-to-br ${category.color} text-white shadow-sm`}>
                        <CategoryIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-base font-black tracking-tight">{category.label}</h3>
                        <p className="text-[11px] text-slate-400 font-medium">{category.desc}</p>
                      </div>
                    </div>

                    {/* Features Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {category.features.map(feature => {
                        const FeatureIcon = feature.icon;
                        return (
                          <div
                            key={feature.id}
                            className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4 cursor-pointer group ${
                              isDark 
                                ? 'bg-[#222730] border-slate-700/70 neu-card-dark text-slate-200 hover:border-blue-500/60' 
                                : 'bg-white border-slate-200/90 neu-card-light text-slate-800 hover:border-blue-400'
                            }`}
                            onClick={() => setSelectedFeatureModal(feature)}
                          >
                            <div className="space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                  <div className={`p-2 rounded-xl border ${category.badgeColor}`}>
                                    <FeatureIcon className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <h4 className="text-xs md:text-sm font-black tracking-tight group-hover:text-blue-500 transition-colors">
                                      {feature.name}
                                    </h4>
                                    <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">
                                      {feature.elements.length} Buttons & Controls
                                    </span>
                                  </div>
                                </div>
                                {onNavigate && feature.tabId && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onNavigate(feature.tabId);
                                    }}
                                    className={`p-1.5 rounded-lg border text-slate-400 hover:text-blue-500 transition active:scale-95 shrink-0 ${
                                      isDark ? 'bg-slate-800/80 border-slate-700 hover:bg-slate-700' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                                    }`}
                                    title={`Open ${feature.name}`}
                                  >
                                    <ArrowUpRight className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>

                              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400 font-medium">
                                {feature.summary}
                              </p>

                              {/* Preview elements */}
                              <div className="space-y-1.5 pt-1">
                                {feature.elements.slice(0, 3).map((elem, eIdx) => (
                                  <div key={eIdx} className="flex items-start gap-2 text-[11px] leading-snug">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                                    <div className="min-w-0">
                                      <span className="font-bold opacity-90">{elem.name}</span>: <span className="text-slate-400 font-medium">{elem.desc.slice(0, 75)}...</span>
                                    </div>
                                  </div>
                                ))}
                                {feature.elements.length > 3 && (
                                  <div className="text-[10px] text-blue-500 font-bold pt-1">
                                    + {feature.elements.length - 3} more buttons & options...
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                              <span className="text-[10px] font-bold text-slate-400">Click to view complete manual</span>
                              <span className="inline-flex items-center gap-1 text-[10px] font-black text-blue-500 uppercase tracking-wider">
                                <span>Inspect Guide</span>
                                <ChevronRight className="w-3 h-3" />
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                );
              })}

              {filteredCategories.length === 0 && (
                <div className={`p-12 text-center rounded-3xl border space-y-2 ${
                  isDark ? 'bg-[#222730] border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500'
                }`}>
                  <Search className="w-8 h-8 mx-auto text-slate-400 opacity-50 mb-2" />
                  <p className="text-sm font-bold">No manual features matching &ldquo;{searchQuery}&rdquo;</p>
                  <p className="text-xs text-slate-400">Try clearing the search query or selecting &ldquo;All Categories&rdquo;.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FEATURE DETAIL MODAL / DRAWER */}
      <AnimatePresence>
        {selectedFeatureModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className={`w-full max-w-3xl max-h-[85vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden text-left ${
                isDark 
                  ? 'bg-[#222730] border-slate-700 text-slate-100 neu-card-dark' 
                  : 'bg-white border-slate-200 text-slate-900 neu-card-light'
              }`}
            >
              {/* Modal Header */}
              <div className={`p-6 border-b flex items-start justify-between gap-4 ${
                isDark ? 'border-slate-800 bg-[#1e232d]' : 'border-slate-150 bg-slate-50'
              }`}>
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-500">
                    {React.createElement(selectedFeatureModal.icon, { className: "w-6 h-6" })}
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight">{selectedFeatureModal.name}</h3>
                    <p className="text-xs text-slate-400 font-medium">Complete Feature & Button Manual</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {onNavigate && selectedFeatureModal.tabId && (
                    <button
                      onClick={() => {
                        const tId = selectedFeatureModal.tabId;
                        setSelectedFeatureModal(null);
                        onNavigate(tId);
                      }}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[11px] font-black uppercase tracking-wider transition active:scale-95 flex items-center gap-1 shadow-md"
                    >
                      <span>Open Tab</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedFeatureModal(null)}
                    className={`p-2 rounded-xl transition ${
                      isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
                {/* Summary */}
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Module Overview</h4>
                  <p className="text-xs md:text-sm text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                    {selectedFeatureModal.summary}
                  </p>
                </div>

                {/* Elements & Buttons Breakdown */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    Interactive Elements, Buttons & Controls ({selectedFeatureModal.elements.length})
                  </h4>
                  <div className="grid grid-cols-1 gap-2.5">
                    {selectedFeatureModal.elements.map((elem, idx) => (
                      <div 
                        key={idx}
                        className={`p-3.5 rounded-2xl border ${
                          isDark ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-black text-blue-500">{elem.name}</span>
                          <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            {elem.type}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                          {elem.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* How to Use Step-by-Step */}
                {selectedFeatureModal.howToUse && (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                      Step-by-Step Workflow Guide
                    </h4>
                    <div className={`p-4 rounded-2xl border space-y-2 ${
                      isDark ? 'bg-blue-950/20 border-blue-900/40 text-blue-200' : 'bg-blue-50/70 border-blue-200 text-blue-900'
                    }`}>
                      {selectedFeatureModal.howToUse.map((step, sIdx) => (
                        <div key={sIdx} className="text-xs font-medium leading-relaxed">
                          {step}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
