import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, Share2, Brain, GraduationCap, ShieldCheck, Zap, HardDrive, Cpu,
  BookOpen, Flame, BarChart2, Sliders, LayoutDashboard, Home, Library, Download,
  MessageSquare, CheckCircle2, ListChecks, Calendar, Tv, Settings, Trash2,
  Search, ArrowUpRight, Activity, Layers, Info, ExternalLink, HelpCircle, FileText
} from 'lucide-react';

const MANUAL_CATEGORIES = [
  {
    id: 'focus',
    label: 'Focus & Review',
    icon: Flame,
    desc: 'Deep study lounge, FSRS-4.5 spaced repetition engine, and daily revision scheduling.',
    color: 'from-amber-500 to-orange-600',
    badgeColor: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    features: [
      {
        id: 'dashboard',
        name: 'Dashboard (Command Center)',
        tabId: 'dashboard',
        icon: LayoutDashboard,
        summary: 'Central command center providing real-time session tracking, live streak badges, customizable widgets, and due card forecasts.',
        highlights: [
          'Live Study Tracker with real-time active session timer and hour logger',
          'Streak Meter awarding motivational archetypes: Rookie (1h), Consistent (2-3h), Topper (3-5h), Legend (5h+)',
          'Drag-and-drop Neumorphic widget grid with full layout customizer',
          'FSRS Due Cards Forecast and daily study question meters'
        ]
      },
      {
        id: 'smartReview',
        name: 'Smart Review Hub & FSRS-4.5 Engine',
        tabId: 'smartReview',
        icon: Brain,
        summary: 'Next-generation Free Spaced Repetition Scheduler (FSRS) calculating adaptive memory stability and retrievability.',
        highlights: [
          'Adaptive mathematical scheduling based on Stability (S), Difficulty (D), Retrievability (R), and Intervals (I)',
          '19 optimized memory weight parameters replacing legacy rigid SM-2 algorithms',
          'Study Velocity Tab tracking cards/hour throughput, retention speed, and cognitive load',
          'FSRS Stats Tab displaying historical retention decay curves and stability histograms across 1M, 3M, 1Y, and ALL timeframes',
          'Predictive Timing Engine estimating review block duration without altering FSRS scheduling math',
          'Leech Card Detection for automatic clinical remediation and AI Strategy Modes for new topic introductions'
        ]
      },
      {
        id: 'study',
        name: 'Study Room & Focus Lounge',
        tabId: 'study',
        icon: GraduationCap,
        summary: 'Full-screen distraction-free study environment equipped with Pomodoro timers, ambient soundscapes, and scorecards.',
        highlights: [
          'Configurable Pomodoro timers with work intervals, short breaks, and long breaks',
          'Ambient audio lounge featuring Lo-Fi beats, Rain, Forest sounds, and custom YouTube audio stream embeds',
          'Curated medical motivational quote engine and scorecard logger for Grand Tests (GTs)',
          'Floating draggable utility widgets for Audio, Timer, and Live Stats'
        ]
      },
      {
        id: 'studyScheduler',
        name: 'Study Scheduler',
        tabId: 'studyScheduler',
        icon: Calendar,
        summary: 'Spaced repetition calendar balancing future review workloads and flagging overdue clinical topics.',
        highlights: [
          'Visual spaced repetition calendar mapping overdue, due today, and scheduled revision loads',
          'Automated alerts for topics exceeding optimal FSRS memory retention cutoffs',
          'Interactive daily task checklist for organizing QBank questions and mock exams',
          'Workload leveling to prevent review spikes'
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
        highlights: [
          'High-resolution PDF viewer powered by pdfjs-dist with multi-page scrolling and zooming',
          'Interactive diagram bounding-box selector anchoring text directly to textbook coordinates',
          'PDF Slice Preview tool converting textbook diagrams into flashcard attachments',
          'Hierarchical folder system for the 19 postgraduate medical subjects'
        ]
      },
      {
        id: 'cards',
        name: 'Cards Manager & AI Generation',
        tabId: 'cards',
        icon: Home,
        summary: 'Extract high-yield clinical cards from textbook pages using Google Gemini Vision AI with rich pre-save editing.',
        highlights: [
          'Automated AI detection of clinical vignettes, diagnostic hallmarks, and pharmacological mechanisms',
          'Interactive pre-save editor for Question, Answer, Notes, Tags, and Deck assignments',
          'Manual Card Creator modal with Cloze deletion syntax ({{c1::text}}) and image pasting',
          'Conflict Inspector modal for side-by-side diffing and merging duplicate cards'
        ]
      },
      {
        id: 'subjectTracker',
        name: 'Subject Tracker (19 Subjects)',
        tabId: 'subjectTracker',
        icon: ListChecks,
        summary: 'Complete syllabus matrix covering Pre-clinical, Para-clinical, and Clinical postgraduate medical modules.',
        highlights: [
          '19-subject checklist tracking chapter milestones, flashcard decks, and logged focus hours',
          'Covers Anatomy, Physiology, Biochemistry, Pathology, Pharmacology, Microbiology, FMT, PSM, Ophthal, ENT, Medicine, Surgery, OBG, Peds, Ortho, Derma, Psych, Radio, and Anesthesia',
          'Dynamic completion date projection based on active study velocity'
        ]
      },
      {
        id: 'pytManager',
        name: 'PYT Manager (Previous Year Topics)',
        tabId: 'pytManager',
        icon: BookOpen,
        summary: 'Central reference database of clinical themes tested in past NEET PG and INI-CET entrance examinations.',
        highlights: [
          'Yield classifications: High-Yield vs Super-High-Yield priority tags',
          'Bulk syllabus ingestion parser (one topic per line)',
          'Direct card anchors linking custom flashcards to specific PYT IDs',
          'Textbook PDF mappings for contextual study references'
        ]
      },
      {
        id: 'pytLogger',
        name: 'PYT Logger & Revision Heatmap',
        tabId: 'pytLogger',
        icon: CheckCircle2,
        summary: 'Log study events directly against PYT IDs with revision frequency heatmaps and neglect warnings.',
        highlights: [
          'Color-coded revision heatmaps highlighting neglected topics (> 30 days without revision)',
          'Linked textbook scanner to cross-reference PDF pages with tested topics',
          'Duplicate topic detector with 1-click deduplication',
          'Multi-sorting engine by Alphabetical, Page Number, and Revision Counts'
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
        highlights: [
          'Subject-level micro-milestones with Unstudied, In-Progress, and Completed progression states',
          'Mathematical Efficiency Score calculation evaluating completed milestones vs time invested',
          'Weighted Concentration algorithms evaluating clinical vs pre-clinical study balance',
          'Collapsible subject cards with responsive completion radars'
        ]
      },
      {
        id: 'analytics',
        name: 'Analysis & Counseling Predictor',
        tabId: 'analytics',
        icon: BarChart2,
        summary: 'Deep analytical suite with 5 specialized subtabs, counseling rank predictors, and circadian peak heatmaps.',
        highlights: [
          'Generation Analytics & Study Analytics tracking daily extraction volume and accuracy rates',
          'Counseling & Mentorship Rank Predictor forecasting NEET PG rank cutoffs based on Grand Test scores',
          'Nested Sunburst Deck Mapping visualizing card counts across all 19 medical subjects and sub-specialties',
          'Circadian Peak Heatmap analyzing historical review performance to locate peak cognitive hours'
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
        highlights: [
          'Standardized Anki 2.0 package generation with embedded SQLite deck databases',
          'Automatic media sanitization and diagram bundling into .apkg packages',
          'Export Image Verification Modal inspecting and fixing missing diagram references prior to compilation',
          'Modular specialty exports filtered by subject or tag'
        ]
      },
      {
        id: 'prompt',
        name: 'AI Prompt Editor',
        tabId: 'prompt',
        icon: MessageSquare,
        summary: 'Refine Gemini AI extraction guidelines with dual prompt categories and JSON schema validation.',
        highlights: [
          'Dual prompt management: Image Extraction prompts vs Text Extraction prompts',
          'JSON Schema validation ensuring generated cards strictly adhere to input specifications',
          'Preset template backups and 1-click default factory reset'
        ]
      },
      {
        id: 'obsOverlay',
        name: 'OBS Overlay Customizer',
        tabId: 'obsOverlay',
        icon: Tv,
        summary: 'Broadcast live session statistics, timers, and streak badges on study streams via OBS Studio.',
        highlights: [
          'Real-time data synchronization for session timing, question counts, and streak titles',
          'Full visual customizer for opacity, Neumorphic borders, and color palettes',
          '1-Click Browser Source URL generation'
        ]
      },
      {
        id: 'settings',
        name: 'Settings & LocalDB Management',
        tabId: 'settings',
        icon: Settings,
        summary: '100% offline-first IndexedDB database control, JSON database backup/restore, and private GitHub sync.',
        highlights: [
          'Complete JSON database backup and instant restore for all flashcards, logs, and settings',
          'Private GitHub Cloud Sync (Personal Access Token) for secure cross-device backups',
          'Google Gemini API key management and live connection validation',
          'Neumorphic theme toggle (Light #e6ecf5 vs Dark #222730) and mobile bottom nav customizer'
        ]
      },
      {
        id: 'trash',
        name: 'Recycle Bin & Recovery',
        tabId: 'trash',
        icon: Trash2,
        summary: 'Soft-delete safety net for restoring accidentally removed cards and pages back to active decks.',
        highlights: [
          '1-Click card restoration returning items to their exact parent decks',
          'Permanent batch deletion utility to reclaim local storage',
          'Recovery audit logs tracking deletion timestamps'
        ]
      },
      {
        id: 'chromeExt',
        name: 'Chrome Extension Ecosystem',
        tabId: 'library',
        icon: ExternalLink,
        summary: 'Browser companion tool to highlight medical text/diagrams online and send cards straight to AutoAnki.',
        highlights: [
          'Floating action bubble on medical question banks and web portals',
          'Background worker and offscreen canvas capturing high-resolution diagrams',
          'Direct local database queue integration'
        ]
      }
    ]
  }
];

export default function AboutDashboard({ isDark = false, onNavigate }) {
  const [activeTab, setActiveTab] = useState('app_info'); // 'app_info' | 'manual'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all'); // 'all' | 'focus' | 'knowledge' | 'analytics' | 'system'

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
          f.highlights.some(h => h.toLowerCase().includes(q))
        );
      });
      if (matchingFeatures.length === 0) return null;
      return { ...cat, features: matchingFeatures };
    }).filter(Boolean);
  }, [searchQuery, selectedCategory]);

  const totalFeatureCount = useMemo(() => {
    return MANUAL_CATEGORIES.reduce((acc, cat) => acc + cat.features.length, 0);
  }, []);

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

      {/* MODERN SLIDING PILL SUBTABS SWITCHER */}
      <div 
        className={`relative flex items-center p-1.5 rounded-2xl select-none overflow-x-auto custom-scrollbar max-w-md ${
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
            width: 'calc(50% - 0.375rem)',
            left: activeTab === 'app_info' ? '0.375rem' : 'calc(50%)',
            transition: 'all 0.6s cubic-bezier(0, 0, 0, 1)'
          }}
        />

        <button
          onClick={() => setActiveTab('app_info')}
          className={`w-1/2 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer select-none flex items-center justify-center gap-2 relative z-10 transition-colors duration-300 ${
            activeTab === 'app_info'
              ? 'text-white font-extrabold'
              : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
          }`}
        >
          <Info className="w-4 h-4" />
          <span>About App</span>
        </button>

        <button
          onClick={() => setActiveTab('manual')}
          className={`w-1/2 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer select-none flex items-center justify-center gap-2 relative z-10 transition-colors duration-300 ${
            activeTab === 'manual'
              ? 'text-white font-extrabold'
              : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>App Manual ({totalFeatureCount})</span>
        </button>
      </div>

      {/* SUBTAB 1: ABOUT APP */}
      <AnimatePresence mode="wait">
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
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">AI Medical Flashcard Engine & Spaced Repetition Suite</p>
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
                    <div className="text-base font-black text-purple-500">FSRS</div>
                  </div>
                  <div className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Spaced Repetition</div>
                  <div className="text-[9px] text-slate-500 font-medium mt-0.5">Dynamic memory retention</div>
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

        {/* SUBTAB 2: APP MANUAL & FEATURE CATALOG */}
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
                    AutoAnki Complete Application Manual
                  </h2>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    Browse all features, workflows, and modules across the 4 primary app categories.
                  </p>
                </div>

                {/* Search Bar */}
                <div className="relative w-full md:w-72 shrink-0">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search manual features..."
                    className={`w-full pl-9 pr-4 py-2 text-xs font-semibold rounded-xl outline-none transition ${
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
                            className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4 ${
                              isDark 
                                ? 'bg-[#222730] border-slate-700/70 neu-card-dark text-slate-200 hover:border-slate-600' 
                                : 'bg-white border-slate-200/90 neu-card-light text-slate-800 hover:border-slate-300'
                            }`}
                          >
                            <div className="space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                  <div className={`p-2 rounded-xl border ${category.badgeColor}`}>
                                    <FeatureIcon className="w-4 h-4" />
                                  </div>
                                  <h4 className="text-xs md:text-sm font-black tracking-tight">
                                    {feature.name}
                                  </h4>
                                </div>
                                {onNavigate && feature.tabId && (
                                  <button
                                    onClick={() => onNavigate(feature.tabId)}
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

                              {/* Highlight bullets */}
                              <div className="space-y-1.5 pt-1">
                                {feature.highlights.map((item, hIdx) => (
                                  <div key={hIdx} className="flex items-start gap-2 text-[11px] leading-snug">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                                    <span className="opacity-90 font-medium">{item}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {onNavigate && feature.tabId && (
                              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 flex justify-end">
                                <button
                                  onClick={() => onNavigate(feature.tabId)}
                                  className="inline-flex items-center gap-1.5 text-[10px] font-black text-blue-500 hover:text-blue-600 uppercase tracking-wider transition"
                                >
                                  <span>Jump to Tab</span>
                                  <ArrowUpRight className="w-3 h-3" />
                                </button>
                              </div>
                            )}
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

    </div>
  );
}
