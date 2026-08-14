import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Info, Sparkles, Compass, Share2, HelpCircle, Check, Play, Settings, Activity, Home, Library, 
  Flame, BarChart2, Download, MessageSquare, BookOpen, CheckCircle2, ListChecks, Calendar, Tv, Trash2,
  ChevronRight, ChevronDown, Award, Rocket, CheckCircle, Database, GitMerge, FileText, LayoutDashboard, Brain,
  GraduationCap, Cpu, ShieldCheck, Zap, HardDrive, RefreshCw
} from 'lucide-react';

const MENU_DETAILS = {
  dashboard: {
    title: 'Dashboard',
    icon: LayoutDashboard,
    desc: 'The central command center of your prep. Displays your streak metrics, study progress, active trackers, and personalized insights.',
    subfeatures: [
      { name: 'Live Study Tracker Widget', details: 'Displays active session timing and logs previous sessions with easy status checks.' },
      { name: 'Streak Meter', details: 'Visualizes daily study consistency and awards motivational streak titles based on your goal.' },
      { name: 'Quick Access Actions', details: 'Shortcuts to jump straight to library uploads, deck reviews, or settings.' }
    ],
    usage: 'Check the dashboard every morning to inspect your active targets and review your current streak progress.'
  },
  campTracker: {
    title: 'CAMP Tracker',
    icon: Activity,
    desc: 'Consistent Active Memorization Protocol (CAMP). Tracks subject-level completion metrics and milestones in real time.',
    subfeatures: [
      { name: 'Milestone Tracking', details: 'Breaks down subjects into micro-milestones to avoid overwhelming study sessions.' },
      { name: 'Progress Indicators', details: 'Color-coded completion cards that visually represent your current memory standing.' },
      { name: 'Instant Local Persistence', details: 'Log completion stamps that save instantly to your offline-first local database repository.' }
    ],
    usage: 'Use CAMP Tracker to update milestones immediately after completing a subject deck review.'
  },
  cards: {
    title: 'Cards Manager',
    icon: Home,
    desc: 'Generate high-quality Anki cards from PDF text or images using cutting-edge Gemini Vision AI.',
    subfeatures: [
      { name: 'AI Card Extractor', details: 'Automatically detects core high-yield clinical questions, answers, and tags from source materials.' },
      { name: 'Interactive Card Editor', details: 'Modify generated questions, answers, notes, or tags on the fly before exporting.' },
      { name: 'Deck Filtering', details: 'Search and filter generated cards by subject, status, or tag metadata.' }
    ],
    usage: 'Open any document page in the Library, trigger the AI Card Extractor, refine the outputs, and save them to your active deck.'
  },
  library: {
    title: 'Library',
    icon: Library,
    desc: 'Your localized document repository. Upload files, manage study lists, and coordinate extraction references.',
    subfeatures: [
      { name: 'Source File Manager', details: 'Add, rename, and delete reference PDFs or study images stored directly in local storage.' },
      { name: 'Page Indexer', details: 'Quickly scroll, jump to pages, or anchor card generation prompts to specific file locations.' },
      { name: 'Local Metadata Storage', details: 'Stores page references inside IndexedDB to ensure your cards are always linked to their primary source text.' }
    ],
    usage: 'Upload your high-yield study guides or lecture notes here, then tap any page to begin generating active-recall cards.'
  },
  studyRoom: {
    title: 'Study Room',
    icon: Flame,
    desc: 'An immersive active study screen featuring focus timers, interactive card reviews, and scorecards.',
    subfeatures: [
      { name: 'Spaced Repetition Review', details: 'Review cards using classic intervals: Again, Hard, Good, Easy powered by FSRS.' },
      { name: 'Focus Timer & Session Tracker', details: 'Log session timing, pause whenever necessary, and commit session hours to local IndexedDB logs.' },
      { name: 'Simulated Scorecards', details: 'Log grand tests and mock results to track accuracy and scoring trends over time.' }
    ],
    usage: 'Launch the focus timer when starting a revision block. Tap through card reviews to trigger memory retention algorithms.'
  },
  studyScheduler: {
    title: 'Scheduler',
    icon: Calendar,
    desc: 'Organize your revision schedule with dynamic checklists, task lists, and custom planning calendars.',
    subfeatures: [
      { name: 'Revision Frequency Control', details: 'Set custom intervals for reviewing high-yield points.' },
      { name: 'Spaced repetition Calendar', details: 'A visual daily planner that flags which subjects are due for revision.' },
      { name: 'Task Tracker checklist', details: 'Log specific quick-to-dos and mark items complete on the go.' }
    ],
    usage: 'Check the scheduler to identify overdue topics and organize daily revision goals.'
  },
  obsOverlay: {
    title: 'OBS Overlay',
    icon: Tv,
    desc: 'Generate custom streaming overlays to broadcast your real-time study stats, focus timers, and streak badges on stream.',
    subfeatures: [
      { name: 'Live Timer Feed', details: 'Synchronizes active session timer directly with streaming client inputs.' },
      { name: 'Overlay Customizer', details: 'Adjust backgrounds, opacity, borders, and text sizes to match your stream theme.' },
      { name: 'Instant Link Copy', details: 'Single-click copy utility for importing the browser source link into OBS Studio.' }
    ],
    usage: 'Configure your design, copy the URL, and add it as a Browser Source in OBS with dimensions matching your setup.'
  },
  analytics: {
    title: 'Analysis',
    icon: BarChart2,
    desc: 'Deep analytical suite providing sunburst card distributions, percentile predictors, and peak study trackers.',
    subfeatures: [
      { name: 'Sunburst Deck Mapping', details: 'Interactive nested ring charts visualizing card count by subject and topic levels.' },
      { name: 'Counseling Percentile Predictor', details: 'Input test scores to predict target seat percentiles and rank estimations.' },
      { name: 'Time-of-Day Heatmap', details: 'Identifies peak study hours and cognitive productivity zones based on logged history.' }
    ],
    usage: 'Review the analysis graphs weekly to locate knowledge gaps and identify subjects requiring additional attention.'
  },
  export: {
    title: 'Export',
    icon: Download,
    desc: 'Export your curated deck collections into ready-to-import Anki files (.apkg).',
    subfeatures: [
      { name: 'Anki Package Generator', details: 'Packages card text, tags, and formatting into standardized SQLite Anki databases.' },
      { name: 'Media Attachment Support', details: 'Prepares reference images for integration within Anki card backyards.' },
      { name: 'Subject Selectors', details: 'Choose specific subjects or tag groups to export, keeping decks modular.' }
    ],
    usage: 'Select the target deck, click generate export, and open the downloaded .apkg file directly in your Anki desktop/mobile app.'
  },
  prompt: {
    title: 'Prompt Editor',
    icon: MessageSquare,
    desc: 'Refine AI generation outputs by customizing system instructions and card structure directives.',
    subfeatures: [
      { name: 'Instruction Profile Editor', details: 'Customize guidelines (e.g. emphasize clinical case-vignettes or factual schemas).' },
      { name: 'JSON Schema Validation', details: 'Guarantees generated cards strictly match the input schema requested by the UI.' },
      { name: 'Template Backups', details: 'Revert custom prompts back to original defaults if card generation quality degrades.' }
    ],
    usage: 'Modify the prompt profile if you want the AI to output cards in a specific regional language or with detailed explanations.'
  },
  pytManager: {
    title: 'PYT Manager',
    icon: BookOpen,
    desc: 'Previous Year Topics manager. Reference index matching high-yield points from past medical exams.',
    subfeatures: [
      { name: 'NEET PG/INI-CET Topic Index', details: 'Pre-tagged database matching clinical themes tested in past papers.' },
      { name: 'Yield Level Ratings', details: 'Filters topics based on frequency flags (e.g. High-Yield, Super-High-Yield).' },
      { name: 'Direct Card Anchors', details: 'Quickly link custom flashcards directly to specific PYT IDs.' }
    ],
    usage: 'Browse the manager index when planning study blocks to prioritize super-high-yield topics.'
  },
  pytLogger: {
    title: 'PYT Logger',
    icon: CheckCircle2,
    desc: 'Track and log review frequencies specifically against high-yield PYTs.',
    subfeatures: [
      { name: 'Activity Log Sheets', details: 'Log study events directly against PYT IDs with ease.' },
      { name: 'Coverage Heatmaps', details: 'Indicates which clinical topics are thoroughly revised and which ones are neglected.' },
      { name: 'Spaced Alerts', details: 'Notifies when critical clinical topics have not been revised in over 30 days.' }
    ],
    usage: 'After reading a clinical topic, log it in the PYT Logger to update your revision heatmaps.'
  },
  subjectTracker: {
    title: 'Subject Tracker',
    icon: ListChecks,
    desc: 'Coordinate your study pace across all 19 medical subjects required for postgraduate exams.',
    subfeatures: [
      { name: 'Subject Checklist Matrix', details: 'Checklists mapping topics, revision timings, and completed decks.' },
      { name: 'Time Log Sync', details: 'Links logged focus hours directly to individual subject milestones.' },
      { name: 'Target Date Adjustments', details: 'Projected completion dates matching your active study pace.' }
    ],
    usage: 'Mark individual subject chapters complete as you finish reading them to maintain accurate timelines.'
  },
  settings: {
    title: 'Setup Settings',
    icon: Settings,
    desc: 'Offline-first database management, GitHub cloud backup, and personalized bottom tab customizer.',
    subfeatures: [
      { name: 'Local IndexedDB Storage', details: 'Stores flashcards, logs, and trackers directly on your device with sub-millisecond access.' },
      { name: 'GitHub Cloud Sync', details: 'Saves full database snapshots and deck data in your private GitHub repository.' },
      { name: 'Nav Customize Dashboard', details: 'Drag, drop, and configure up to 8 bottom tab shortcuts for quick access on mobile.' }
    ],
    usage: 'Manage your local database, configure API keys, and link your GitHub token to create secure backups.'
  },
  trash: {
    title: 'Trash Bin',
    icon: Trash2,
    desc: 'Recovery room for deleted resources. Easily restore deleted cards or pages.',
    subfeatures: [
      { name: 'Restore Anchors', details: 'Revert soft-deleted pages and flashcards back into active decks instantly.' },
      { name: 'Batch Emptying', details: 'Clear the trash bin to permanently delete cards and free up disk space.' },
      { name: 'Recovery Audit Logs', details: 'Track when cards were deleted and identify their original parent decks.' }
    ],
    usage: 'If a card is accidentally deleted, click "Trash", locate the card item, and tap the green restore button.'
  }
};

const SUBTABS = [
  { id: 'app_info', label: 'About App', icon: Info },
  { id: 'guide', label: 'Menus Guide', icon: BookOpen },
  { id: 'sandbox', label: 'Interactive Sandbox', icon: Rocket },
  { id: 'quiz', label: 'Persona Quiz', icon: Award },
  { id: 'pipeline', label: 'Under the Hood', icon: GitMerge },
  { id: 'faq', label: 'Buddy FAQ Chat', icon: HelpCircle },
];

export default function AboutDashboard({ isDark = false, onNavigate }) {
  const [activeSubTab, setActiveSubTab] = useState('app_info');
  const [guideMenuTab, setGuideMenuTab] = useState('dashboard');
  
  // Checklist states (persisted in localStorage)
  const [checklist, setChecklist] = useState(() => {
    try {
      const saved = localStorage.getItem('autoanki_about_checklist_v2');
      return saved ? JSON.parse(saved) : {
        profile: false,
        upload: false,
        generate: false,
        review: false,
        sync: false
      };
    } catch {
      return { profile: false, upload: false, generate: false, review: false, sync: false };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('autoanki_about_checklist_v2', JSON.stringify(checklist));
    } catch (e) {
      console.warn('Failed to save checklist to localStorage', e);
    }
  }, [checklist]);
  
  // FAQ Buddy Chat States
  const [chatHistory, setChatHistory] = useState([
    { sender: 'buddy', text: 'Hello doctor! 🩺 I am your AutoAnki AI assistant. Ask me anything about our offline-first local architecture and study workflows!' }
  ]);
  const [isTyping, setIsTyping] = useState(false);

  // Quiz States (persisted in localStorage)
  const [quizStep, setQuizStep] = useState(() => {
    try {
      const saved = localStorage.getItem('autoanki_about_quiz_step');
      return saved ? Number(saved) : 0;
    } catch {
      return 0;
    }
  });

  const [quizAnswers, setQuizAnswers] = useState(() => {
    try {
      const saved = localStorage.getItem('autoanki_about_quiz_answers');
      return saved ? JSON.parse(saved) : { q1: '', q2: '', q3: '' };
    } catch {
      return { q1: '', q2: '', q3: '' };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('autoanki_about_quiz_step', String(quizStep));
      localStorage.setItem('autoanki_about_quiz_answers', JSON.stringify(quizAnswers));
    } catch (e) {
      console.warn('Failed to save quiz to localStorage', e);
    }
  }, [quizStep, quizAnswers]);

  // Sandbox states
  const [sandboxStep, setSandboxStep] = useState('upload'); // 'upload' | 'extracting' | 'edit' | 'synced'
  const [sandboxCards, setSandboxCards] = useState([
    { id: 1, q: 'What is the pathognomonic finding of Aschoff nodules?', a: 'Anitschkow cells (caterpillar nucleus cells)', tag: 'Pathology', rating: '' }
  ]);

  const toggleChecklist = (key) => {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const completedCount = Object.values(checklist).filter(Boolean).length;
  const progressPercent = Math.round((completedCount / 5) * 100);

  // FAQ logic
  const handleFaqClick = (question, answer) => {
    setChatHistory(prev => [...prev, { sender: 'user', text: question }]);
    setIsTyping(true);
    setTimeout(() => {
      setChatHistory(prev => [...prev, { sender: 'buddy', text: answer }]);
      setIsTyping(false);
    }, 500);
  };

  // Quiz handler
  const handleQuizAnswer = (qKey, value) => {
    setQuizAnswers(prev => ({ ...prev, [qKey]: value }));
    setQuizStep(prev => prev + 1);
  };

  const getQuizResult = () => {
    const { q1, q2, q3 } = quizAnswers;
    if (q1 === '4+' && q2 === '50+') return { name: 'Legend', desc: 'You are committed to absolute mastery. Target study streaks: 4-6 hours daily with high review rates. Spaced repetitions with FSRS are your weapon of choice.', bg: 'from-purple-600 to-indigo-700' };
    if (q1 === '2-4' || q2 === '20-50') return { name: 'Topper', desc: 'Extremely consistent and highly analytical. Focus on maintaining a regular streak pace and logging high-yield PYTs.', bg: 'from-blue-600 to-cyan-600' };
    if (q3 === 'spaced') return { name: 'Consistent', desc: 'Revision is your priority. Your focus lies in regular intervals rather than intense study bursts. The scheduler is your guide.', bg: 'from-emerald-600 to-teal-700' };
    return { name: 'Rookie', desc: 'Building up consistency step-by-step. Focus on completing core subject tracking decks and logging at least 1 hour daily in local DB.', bg: 'from-amber-600 to-orange-700' };
  };

  // Sandbox operations
  const startSandboxExtraction = () => {
    setSandboxStep('extracting');
    setTimeout(() => {
      setSandboxStep('edit');
    }, 1200);
  };

  const handleSandboxRate = (id, rating) => {
    setSandboxCards(prev => prev.map(c => c.id === id ? { ...c, rating } : c));
  };

  const SelectedGuide = MENU_DETAILS[guideMenuTab] || MENU_DETAILS.dashboard;
  const activeSubIndex = Math.max(0, SUBTABS.findIndex(t => t.id === activeSubTab));

  return (
    <div className="space-y-6 pb-24 text-left">
      
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
            Explore our 100% offline-first local architecture, configure study personas, test card generation sandboxes, and inspect medical prep workflows.
          </p>
        </div>
      </motion.div>

      {/* MODERN SLIDING PILL SUBTABS SWITCHER */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.08 }}
        className={`relative flex items-center p-1.5 rounded-2xl select-none overflow-x-auto custom-scrollbar ${
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
            width: '8.5rem',
            left: `calc(0.375rem + ${activeSubIndex} * (8.5rem + 0.25rem))`,
            transition: 'all 0.6s cubic-bezier(0, 0, 0, 1)'
          }}
        />

        <div className="flex items-center gap-1 relative z-10">
          {SUBTABS.map(tab => {
            const IconComp = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`w-[8.5rem] py-2.5 text-[11px] font-black uppercase tracking-wider rounded-xl cursor-pointer select-none flex items-center justify-center gap-2 transition-colors duration-300 shrink-0 ${
                  isActive
                    ? 'text-white font-extrabold'
                    : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                }`}
              >
                <IconComp className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* SUBTAB CONTENT CONTAINERS WITH ANIMATIONS */}
      <AnimatePresence mode="wait">
        
        {/* ========================================================================= */}
        {/* TAB 1: APP INFO & DEVELOPER PORTFOLIO */}
        {/* ========================================================================= */}
        {activeSubTab === 'app_info' && (
          <motion.div 
            key="app_info"
            initial={{ opacity: 0, y: 12, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={{ duration: 0.3 }}
            className="space-y-8"
          >
            {/* Overview & Checklist Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* What is AutoAnki Card */}
              <motion.div 
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: 0.05 }}
                className={`p-6 rounded-3xl border shadow-sm space-y-4 ${
                  isDark 
                    ? 'bg-[#222730] border-slate-700/80 neu-card-dark text-slate-200' 
                    : 'bg-white border-slate-200 neu-card-light text-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-500">
                    <Brain className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base md:text-lg font-black tracking-tight">What is AutoAnki?</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">AI Medical Flashcard Engine</p>
                  </div>
                </div>

                <div className="text-xs leading-relaxed space-y-3 font-medium opacity-90">
                  <p>
                    AutoAnki is an advanced, AI-powered active recall ecosystem tailored specifically for postgraduate medical doctors and aspirants preparing for competitive licensing examinations like <strong className="text-blue-500">NEET PG</strong> and <strong className="text-indigo-500">INI-CET</strong>.
                  </p>
                  <p>
                    Built with a <strong className="text-emerald-500">100% offline-first local database model (IndexedDB)</strong>, it ensures lightning-fast flashcard reviews, sub-millisecond queries, and zero cloud dependency while offering flexible GitHub sync.
                  </p>
                </div>

                <div className="pt-2 grid grid-cols-3 gap-2 text-center">
                  <div className={`p-2.5 rounded-2xl border ${isDark ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-150'}`}>
                    <div className="text-sm font-black text-blue-500">100%</div>
                    <div className="text-[9px] text-slate-400 font-bold uppercase">Offline First</div>
                  </div>
                  <div className={`p-2.5 rounded-2xl border ${isDark ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-150'}`}>
                    <div className="text-sm font-black text-emerald-500">&lt; 1ms</div>
                    <div className="text-[9px] text-slate-400 font-bold uppercase">DB Latency</div>
                  </div>
                  <div className={`p-2.5 rounded-2xl border ${isDark ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-150'}`}>
                    <div className="text-sm font-black text-purple-500">FSRS</div>
                    <div className="text-[9px] text-slate-400 font-bold uppercase">Algorithm</div>
                  </div>
                </div>
              </motion.div>

              {/* Power User Checklist Section */}
              <motion.div 
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: 0.1 }}
                className={`p-6 rounded-3xl border shadow-sm space-y-4 ${
                  isDark 
                    ? 'bg-[#222730] border-slate-700/80 neu-card-dark text-slate-200' 
                    : 'bg-white border-slate-200 neu-card-light text-slate-800'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-base md:text-lg font-black tracking-tight">Power-User Checklist</h2>
                    <p className="text-[10px] text-slate-400 font-bold">Complete your setup goals to master AutoAnki</p>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black text-blue-500">{progressPercent}%</span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-slate-200/50 dark:bg-slate-700/50 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full transition-all duration-500 rounded-full" 
                    style={{ width: `${progressPercent}%` }} 
                  />
                </div>

                <div className="space-y-2">
                  {[
                    { key: 'profile', label: 'Configure Study Archetype Goal', desc: 'Take the Persona Quiz to set daily streak targets.' },
                    { key: 'upload', label: 'Upload your first High-Yield PDF file', desc: 'Add files locally inside the Library page.' },
                    { key: 'generate', label: 'Extract Flashcards using Gemini AI', desc: 'Select a page and trigger the card extractor.' },
                    { key: 'review', label: 'Log Study Session in active Study Room', desc: 'Start focus timer and rate flashcards via FSRS.' },
                    { key: 'sync', label: 'Backup & sync to Local Database / GitHub', desc: 'Go to Settings to manage IndexedDB and GitHub backup.' }
                  ].map(item => (
                    <button
                      key={item.key}
                      onClick={() => toggleChecklist(item.key)}
                      className={`w-full text-left flex items-start gap-3 p-3 rounded-2xl transition border ${
                        checklist[item.key] 
                          ? (isDark ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-50/70 border-emerald-200')
                          : (isDark ? 'hover:bg-slate-800/50 border-transparent' : 'hover:bg-slate-50 border-transparent')
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition ${
                        checklist[item.key] ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-400/60 bg-transparent'
                      }`}>
                        {checklist[item.key] && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                      <div>
                        <div className={`text-xs font-black ${checklist[item.key] ? 'line-through opacity-70' : ''}`}>
                          {item.label}
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium">{item.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            </div>

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
                        { val: '100%', label: 'Offline-First model', desc: 'Zero cloud latency lag' }
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
        {/* TAB 2: MENUS GUIDE */}
        {/* ========================================================================= */}
        {activeSubTab === 'guide' && (
          <motion.div 
            key="guide"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-6"
          >
            {/* Menu Selector Sidebar */}
            <div className={`md:col-span-1 space-y-1 max-h-[550px] overflow-y-auto pr-1 border-r ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}>
              {Object.keys(MENU_DETAILS).map(key => {
                const menu = MENU_DETAILS[key];
                const Icon = menu.icon;
                const isSelected = guideMenuTab === key;
                return (
                  <button
                    key={key}
                    onClick={() => setGuideMenuTab(key)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl transition text-xs font-black ${
                      isSelected 
                        ? (isDark ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-blue-50 text-blue-600 border border-blue-200') 
                        : (isDark ? 'text-slate-400 hover:bg-slate-800/60' : 'text-slate-600 hover:bg-slate-100')
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      <span>{menu.title}</span>
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isSelected ? 'rotate-90 text-blue-500' : ''}`} />
                  </button>
                );
              })}
            </div>

            {/* Guide Content Display */}
            <div className={`md:col-span-3 p-6 rounded-3xl border space-y-6 shadow-sm ${
              isDark 
                ? 'bg-[#222730] border-slate-700/80 neu-card-dark text-slate-200' 
                : 'bg-white border-slate-200 neu-card-light text-slate-800'
            }`}>
              <div className={`flex items-center gap-3 pb-4 border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                <div className={`p-3 rounded-2xl ${isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>
                  <SelectedGuide.icon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black">{SelectedGuide.title} Guide</h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tab features and local workflows</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-wide">Overview Description</h3>
                  <p className="text-xs mt-1 leading-relaxed font-semibold opacity-90">{SelectedGuide.desc}</p>
                </div>

                <div>
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-wide mb-2">Key Subfeatures Included</h3>
                  <div className="grid grid-cols-1 gap-2.5">
                    {SelectedGuide.subfeatures.map((sf, index) => (
                      <div key={index} className={`p-3 rounded-2xl border ${
                        isDark ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-150'
                      }`}>
                        <div className="text-xs font-black flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          {sf.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium mt-0.5 pl-3">{sf.details}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={`p-4 rounded-2xl border ${
                  isDark ? 'bg-blue-950/20 border-blue-900/40 text-blue-200' : 'bg-blue-50/70 border-blue-200 text-blue-900'
                }`}>
                  <h3 className="text-[10px] font-black uppercase tracking-wider text-blue-500">How to Use as an Aspirant</h3>
                  <p className="text-xs mt-1 font-medium leading-relaxed">{SelectedGuide.usage}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: INTERACTIVE SANDBOX */}
        {/* ========================================================================= */}
        {activeSubTab === 'sandbox' && (
          <motion.div 
            key="sandbox"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className={`p-6 rounded-3xl border shadow-sm space-y-6 ${
              isDark 
                ? 'bg-[#222730] border-slate-700/80 neu-card-dark text-slate-200' 
                : 'bg-white border-slate-200 neu-card-light text-slate-800'
            }`}
          >
            <div className={`flex justify-between items-center pb-4 border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
              <div>
                <h2 className="text-lg font-black">Interactive Sandbox Simulator</h2>
                <p className="text-[10px] text-slate-400 font-bold">Try generating and rating a cards workflow in real time</p>
              </div>
              <div className="flex gap-1.5 items-center">
                {['upload', 'edit', 'synced'].map((step, idx) => (
                  <div 
                    key={step} 
                    className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                      sandboxStep === step ? 'bg-blue-500 ring-4 ring-blue-500/20' : idx < ['upload', 'edit', 'synced'].indexOf(sandboxStep) ? 'bg-emerald-500' : 'bg-slate-400/40'
                    }`} 
                  />
                ))}
              </div>
            </div>

            {/* SIMULATOR SCREEN CONTENT */}
            {sandboxStep === 'upload' && (
              <div className={`p-8 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center text-center space-y-4 ${
                isDark ? 'border-slate-700 bg-slate-800/30' : 'border-slate-200 bg-slate-50'
              }`}>
                <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <FileText className="w-6 h-6 animate-bounce" />
                </div>
                <div>
                  <h3 className="text-xs font-black">Simulate Uploading PDF Source</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Click the trigger below to simulate AI extraction from a medical textbook page</p>
                </div>
                <button
                  onClick={startSandboxExtraction}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition active:scale-95 shadow-md shadow-blue-500/20"
                >
                  Trigger AI Extraction
                </button>
              </div>
            )}

            {sandboxStep === 'extracting' && (
              <div className="p-8 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <div className="text-xs font-black">Gemini Vision AI analyzing medical page layout...</div>
                <p className="text-[10px] text-slate-400">Extracting clinical vignettes and key diagnostic findings into local memory</p>
              </div>
            )}

            {sandboxStep === 'edit' && (
              <div className="space-y-4">
                <div className={`p-4 border rounded-2xl text-[10px] font-bold ${
                  isDark ? 'bg-amber-950/20 border-amber-900/40 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}>
                  ✨ Simulated Flashcard Generated successfully! Rate the card below using FSRS spacing intervals:
                </div>

                {sandboxCards.map(card => (
                  <div key={card.id} className={`p-4 rounded-2xl space-y-3 border ${
                    isDark ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex justify-between items-center">
                      <span className="bg-blue-500/20 text-blue-500 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase">{card.tag}</span>
                      {card.rating && (
                        <span className="bg-emerald-500/20 text-emerald-500 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase">Rated: {card.rating}</span>
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Question</div>
                      <div className="text-xs font-black">{card.q}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Answer</div>
                      <div className="text-xs font-semibold opacity-90">{card.a}</div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      {['Again', 'Hard', 'Good', 'Easy'].map(r => (
                        <button
                          key={r}
                          onClick={() => handleSandboxRate(card.id, r)}
                          className={`flex-grow py-2 rounded-xl text-[10px] font-bold uppercase transition active:scale-95 border ${
                            card.rating === r 
                              ? 'bg-blue-600 text-white border-blue-600 shadow-md' 
                              : (isDark ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100')
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setSandboxStep('synced')}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition active:scale-95 shadow-md shadow-emerald-600/20"
                  >
                    Commit & Save to Local DB
                  </button>
                </div>
              </div>
            )}

            {sandboxStep === 'synced' && (
              <div className="p-8 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xs font-black">Mock Data Saved to Local DB!</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Your study logs, streak metrics, and deck sizes have updated instantly in IndexedDB.</p>
                </div>
                <button
                  onClick={() => {
                    setSandboxStep('upload');
                    setSandboxCards([{ id: 1, q: 'What is the pathognomonic finding of Aschoff nodules?', a: 'Anitschkow cells (caterpillar nucleus cells)', tag: 'Pathology', rating: '' }]);
                  }}
                  className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition ${
                    isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                  }`}
                >
                  Reset Simulator
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: PERSONA QUIZ */}
        {/* ========================================================================= */}
        {activeSubTab === 'quiz' && (
          <motion.div 
            key="quiz"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className={`p-6 rounded-3xl border shadow-sm space-y-6 ${
              isDark 
                ? 'bg-[#222730] border-slate-700/80 neu-card-dark text-slate-200' 
                : 'bg-white border-slate-200 neu-card-light text-slate-800'
            }`}
          >
            <div className={`pb-4 border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
              <h2 className="text-lg font-black">Study Persona Selector Quiz</h2>
              <p className="text-[10px] text-slate-400 font-bold">Diagnose your preparation targets and select optimal scheduler goals</p>
            </div>

            {quizStep === 0 && (
              <div className="p-6 text-center space-y-4">
                <div className="text-3xl">📝</div>
                <div>
                  <h3 className="text-xs font-black">Identify your Streak Archetype</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Answer 3 simple questions about your daily revision pace</p>
                </div>
                <button
                  onClick={() => setQuizStep(1)}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition shadow-md shadow-blue-500/20"
                >
                  Start Diagnostic
                </button>
              </div>
            )}

            {quizStep === 1 && (
              <div className="space-y-4">
                <h3 className="text-sm font-black">Question 1: How many hours do you plan to study daily?</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { val: '0-2', label: '0 to 2 Hours (Part-time / Interns)' },
                    { val: '2-4', label: '2 to 4 Hours (Regular preparation)' },
                    { val: '4+', label: '4+ Hours (Dedicated study block)' }
                  ].map(opt => (
                    <button
                      key={opt.val}
                      onClick={() => handleQuizAnswer('q1', opt.val)}
                      className={`p-4 rounded-2xl transition text-left text-xs font-bold border ${
                        isDark 
                          ? 'bg-slate-800/50 border-slate-700 hover:border-blue-500 hover:bg-blue-500/10 text-slate-200' 
                          : 'bg-slate-50 border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {quizStep === 2 && (
              <div className="space-y-4">
                <h3 className="text-sm font-black">Question 2: What is your daily target for Qbank questions?</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { val: '0-20', label: 'Up to 20 Questions' },
                    { val: '20-50', label: '20 to 50 Questions' },
                    { val: '50+', label: '50+ Questions (High volume)' }
                  ].map(opt => (
                    <button
                      key={opt.val}
                      onClick={() => handleQuizAnswer('q2', opt.val)}
                      className={`p-4 rounded-2xl transition text-left text-xs font-bold border ${
                        isDark 
                          ? 'bg-slate-800/50 border-slate-700 hover:border-blue-500 hover:bg-blue-500/10 text-slate-200' 
                          : 'bg-slate-50 border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {quizStep === 3 && (
              <div className="space-y-4">
                <h3 className="text-sm font-black">Question 3: Which memory retention method do you trust most?</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { val: 'spaced', label: 'Spaced repetition reviews (FSRS)' },
                    { val: 'reading', label: 'Re-reading text / source notes' },
                    { val: 'tests', label: 'Attempting full grand tests' }
                  ].map(opt => (
                    <button
                      key={opt.val}
                      onClick={() => handleQuizAnswer('q3', opt.val)}
                      className={`p-4 rounded-2xl transition text-left text-xs font-bold border ${
                        isDark 
                          ? 'bg-slate-800/50 border-slate-700 hover:border-blue-500 hover:bg-blue-500/10 text-slate-200' 
                          : 'bg-slate-50 border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {quizStep === 4 && (
              <div className="space-y-6">
                {(() => {
                  const res = getQuizResult();
                  return (
                    <div className={`bg-gradient-to-r ${res.bg} p-6 md:p-8 rounded-3xl text-white space-y-3 shadow-lg`}>
                      <div className="inline-block px-2.5 py-0.5 bg-white/20 rounded-full text-[9px] font-black uppercase tracking-wider">
                        Recommended Archetype
                      </div>
                      <h3 className="text-2xl font-black">{res.name} Streak</h3>
                      <p className="text-xs leading-relaxed text-blue-50 font-medium">{res.desc}</p>
                    </div>
                  );
                })()}

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setQuizStep(0);
                      setQuizAnswers({ q1: '', q2: '', q3: '' });
                    }}
                    className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition ${
                      isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    Retry Diagnostic
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: UNDER THE HOOD DATA PIPELINE */}
        {/* ========================================================================= */}
        {activeSubTab === 'pipeline' && (
          <motion.div 
            key="pipeline"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className={`p-6 rounded-3xl border shadow-sm space-y-6 ${
              isDark 
                ? 'bg-[#222730] border-slate-700/80 neu-card-dark text-slate-200' 
                : 'bg-white border-slate-200 neu-card-light text-slate-800'
            }`}
          >
            <div className={`pb-4 border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
              <h2 className="text-lg font-black">Under the Hood: Data Pipeline</h2>
              <p className="text-[10px] text-slate-400 font-bold">Trace how textbook source PDFs transform into spaced repetition decks</p>
            </div>

            <div className="relative border-l-2 border-blue-500/30 ml-4 pl-6 space-y-6">
              {[
                {
                  title: '1. Source Ingestion (Library & localDb.js)',
                  desc: 'PDF and image bytes are loaded directly into browser IndexedDB storage. Coordinates are mapped to specific page boundaries.',
                  schema: '{\n  "fileName": "Pathology_HighYield_Notes.pdf",\n  "totalPages": 84,\n  "fileSize": 4518204,\n  "contentType": "application/pdf",\n  "storage": "IndexedDB / localDb.js"\n}'
                },
                {
                  title: '2. Vision LLM Extraction (Cards)',
                  desc: 'Pages are converted into canvas coordinates and processed by Gemini Vision AI to identify high-yield clinical queries.',
                  schema: '{\n  "question": "What is the primary indicator of Whipple disease?",\n  "answer": "PAS-positive macrophages in lamina propria",\n  "subject": "Pathology",\n  "tags": ["Whipple", "Gastroenterology"]\n}'
                },
                {
                  title: '3. Local Database & Offline-First Persistence (localDb.js)',
                  desc: 'Client records, decks, and metrics are persisted instantly into IndexedDB (AutoAnkiLocalDB) with zero lag, and can be backed up to your private GitHub repository.',
                  schema: '{\n  "database": "AutoAnkiLocalDB (IndexedDB)",\n  "storageEngine": "Dexie / IDB",\n  "stores": ["flashcards", "studyLogs", "campProgress", "pytLogs", "topics"],\n  "latency": "< 1ms",\n  "sync": "Optional GitHub PAT"\n}'
                },
                {
                  title: '4. Exporter Compilation (Export)',
                  desc: 'Curated card records are packaged inside a local SQLite deck and compiled as a standardized Anki package (.apkg) file.',
                  schema: '{\n  "deckName": "Pathology::NEETPG",\n  "cardFormat": "Anki2.0",\n  "compressed": true,\n  "mimeType": "application/apkg"\n}'
                }
              ].map((node, index) => (
                <div key={index} className="relative space-y-2">
                  <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-blue-600 border-4 border-white dark:border-[#222730] shadow-sm" />
                  <h3 className="text-xs font-black">{node.title}</h3>
                  <p className="text-[10px] text-slate-400 font-medium leading-relaxed">{node.desc}</p>
                  <details className={`group border rounded-xl overflow-hidden ${
                    isDark ? 'border-slate-700 bg-slate-800/40' : 'border-slate-200 bg-slate-50'
                  }`}>
                    <summary className="flex items-center justify-between p-2.5 text-[9px] font-black text-blue-500 uppercase tracking-wider cursor-pointer select-none hover:opacity-80">
                      <span>View JSON Metadata Schema</span>
                      <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
                    </summary>
                    <pre className="p-3 bg-gray-950 text-emerald-400 font-mono text-[9px] leading-relaxed overflow-x-auto select-all">
                      {node.schema}
                    </pre>
                  </details>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: BUDDY FAQ CHAT */}
        {/* ========================================================================= */}
        {activeSubTab === 'faq' && (
          <motion.div 
            key="faq"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className={`p-6 rounded-3xl border shadow-sm space-y-6 ${
              isDark 
                ? 'bg-[#222730] border-slate-700/80 neu-card-dark text-slate-200' 
                : 'bg-white border-slate-200 neu-card-light text-slate-800'
            }`}
          >
            <div className={`pb-4 border-b flex items-center justify-between ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
              <div>
                <h2 className="text-lg font-black">Study Buddy Help Chat</h2>
                <p className="text-[10px] text-slate-400 font-bold">Ask rapid questions about offline storage, study logic, and export options</p>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-[9px] font-bold text-emerald-500 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Buddy Online
              </div>
            </div>

            {/* CHAT DISPLAY */}
            <div className={`h-72 border rounded-2xl p-4 overflow-y-auto space-y-3 flex flex-col justify-end ${
              isDark ? 'border-slate-800 bg-[#1a1f27]' : 'border-slate-200 bg-slate-50'
            }`}>
              <div className="space-y-3 overflow-y-auto max-h-full custom-scrollbar pr-1">
                {chatHistory.map((msg, index) => (
                  <div 
                    key={index} 
                    className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-[11px] font-medium leading-relaxed ${
                      msg.sender === 'user' 
                        ? 'bg-blue-600 text-white rounded-br-none shadow-md' 
                        : (isDark 
                            ? 'bg-[#222730] border border-slate-700/80 text-slate-200 rounded-bl-none shadow-sm' 
                            : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-sm')
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex justify-start">
                    <div className={`px-3.5 py-2 rounded-2xl rounded-bl-none shadow-sm text-[10px] font-bold italic animate-pulse ${
                      isDark ? 'bg-[#222730] border border-slate-700 text-slate-400' : 'bg-white border border-slate-200 text-slate-400'
                    }`}>
                      Buddy is drafting response...
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* FAQ SELECTIONS */}
            <div className="space-y-2">
              <h4 className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Quick Inquiries</h4>
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                {[
                  { 
                    q: 'How does Local Database & Sync work?', 
                    a: 'AutoAnki is 100% offline-first using fast local IndexedDB storage (localDb.js). You can also connect your personal GitHub repository in Settings to backup and sync your study decks anywhere!' 
                  },
                  { 
                    q: 'How do I generate cards?', 
                    a: 'Go to Library, click on your uploaded PDF, and use the generation trigger. The Gemini AI will read the text context and return card fields automatically.' 
                  },
                  { 
                    q: 'Can I export to Anki App?', 
                    a: 'Yes, navigate to the Export tab, choose your subjects, generate the .apkg deck, and double-click or drag the file into your official Anki application!' 
                  },
                  { 
                    q: 'What is the CAMP Tracker?', 
                    a: 'Consistent Active Memorization Protocol tracker. It helps you monitor subject completion milestones and checks your memory retention flags.' 
                  },
                  {
                    q: 'What is the Health Tracker?',
                    a: 'It tracks sleep, study hours, and daily energy levels, plotting scatter charts to identify optimal work-life balance and warn against study burnout.'
                  },
                  {
                    q: 'How do I use OBS overlays?',
                    a: 'Configure overlay colors and layout parameters in the OBS Customiser tab, copy the custom link, and load it as a Browser Source inside your OBS Studio setup.'
                  },
                  {
                    q: 'How do I recover deleted cards?',
                    a: 'Open the Recycle Bin from either desktop sidebar or mobile views, locate the soft-deleted card, and click the green restore button to revert it.'
                  },
                  {
                    q: 'Can I customize AI prompts?',
                    a: 'Yes! Navigate to the Prompt Editor tab to adjust system guidelines and specify customized formatting tags for card extraction.'
                  },
                  {
                    q: 'How many subjects are in Subject Tracker?',
                    a: 'All 19 medical subjects (e.g. Anatomy, Physiology, Medicine, Surgery) required for licensing exams are supported.'
                  },
                  {
                    q: 'Can I log studies offline?',
                    a: 'Yes! All session logs and FSRS parameters are saved directly in local IndexedDB storage, completely functional without internet.'
                  },
                  {
                    q: 'What is the Streak Meter?',
                    a: 'Measures study consistency and rewards achievements (e.g. Rookie, Dedicated, Legend) based on your daily targets.'
                  },
                  {
                    q: 'How does AI card generation cost work?',
                    a: 'It is powered by your own Gemini API key. The app tracks reads and tokens to help you manage usage limits effectively.'
                  },
                  {
                    q: 'What is the Exporter Hub?',
                    a: 'A centralized exporter that converts generated cards into SQLite format compatible with standard .apkg Anki Decks.'
                  },
                  {
                    q: 'How does sleep affect memory?',
                    a: 'The Sleep Scatter plots reveal the correlation between sleep hours and next-day energy/recall accuracy metrics.'
                  },
                  {
                    q: 'What does "Again" rating do?',
                    a: 'Marks a card as lapsed/forgotten, adjusting FSRS memory stability and scheduling it for immediate re-review in the active session.'
                  },
                  {
                    q: 'How do I add PDF references?',
                    a: 'Go to Library, create a subject deck folder, and upload files directly to local IndexedDB.'
                  },
                  {
                    q: 'What is the PYT Logger?',
                    a: 'Previous Year Topics logger, where you catalog study sessions directly against clinical topics tested in past papers.'
                  },
                  {
                    q: 'Can I sync mobile navigation settings?',
                    a: 'Yes! Preferences are saved instantly in your local IndexedDB database and can be synced across devices via your repository backup.'
                  },
                  {
                    q: 'What are counseling percentile predictions?',
                    a: 'Uses past cutoffs to predict target scores needed for getting desired medical seats in counseling rounds.'
                  },
                  {
                    q: 'Is my data stored securely?',
                    a: 'Absolutely. All your flashcards and revision data are stored directly on your local device (IndexedDB) with zero external tracking.'
                  },
                  {
                    q: 'How do I customize card fonts?',
                    a: 'Theme layouts can be adjusted in the OBS customizer panel or via prompt templates.'
                  },
                  {
                    q: 'What does Spaced repetitions calendar show?',
                    a: 'Highlights upcoming revision deadlines so you know exactly which subject cards are due today.'
                  },
                  {
                    q: 'How do I empty the Recycle Bin?',
                    a: 'Click the Red "Empty Recycle Bin" button in the trash tab to permanently delete soft-deleted content.'
                  },
                  {
                    q: 'Can I batch export subjects?',
                    a: 'Yes, you can check select multiple folders inside the Exporter Hub to download them as a unified package.'
                  },
                  {
                    q: 'What is the Study room scorecard?',
                    a: 'Allows logging grand tests, mock results, and clinical vignettes to track score trends and progress.'
                  },
                  {
                    q: 'How does Gemini Vision AI process images?',
                    a: 'Translates diagram layout pixels and clinical flowcharts into structured text fields suitable for card generation.'
                  },
                  {
                    q: 'What does "Easy" card rating do?',
                    a: 'Significantly increases the spacing interval of a card according to FSRS, scheduling it far into future review dates.'
                  },
                  {
                    q: 'How do I setup GitHub API token?',
                    a: 'Generate a Personal Access Token (PAT) with repo scopes on GitHub, then paste and save it inside the Settings tab.'
                  }
                ].map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleFaqClick(item.q, item.a)}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition active:scale-95 border ${
                      isDark 
                        ? 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30 text-blue-400' 
                        : 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-800'
                    }`}
                  >
                    {item.q}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>

    </div>
  );
}
