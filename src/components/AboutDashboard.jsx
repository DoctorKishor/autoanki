import React, { useState } from 'react';
import { 
  Info, Sparkles, Compass, Share2, HelpCircle, Check, Play, Settings, Activity, Home, Library, 
  Flame, BarChart2, Download, MessageSquare, BookOpen, CheckCircle2, ListChecks, Calendar, Tv, Trash2,
  ChevronRight, ChevronDown, Award, Rocket, CheckCircle, Database, GitMerge, FileText, LayoutDashboard, Brain,
  GraduationCap
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
      { name: 'Completion States', details: 'Log completion stamps that sync immediately with your cloud repository.' }
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
      { name: 'Source File Manager', details: 'Add, rename, and delete reference PDFs or study images.' },
      { name: 'Page Indexer', details: 'Quickly scroll, jump to pages, or anchor card generation prompts to specific file locations.' },
      { name: 'Metadata Sync', details: 'Stores page references to ensure your cards are always linked to their primary source text.' }
    ],
    usage: 'Upload your high-yield study guides or lecture notes here, then tap any page to begin generating active-recall cards.'
  },
  studyRoom: {
    title: 'Study Room',
    icon: Flame,
    desc: 'An immersive active study screen featuring focus timers, interactive card reviews, and scorecards.',
    subfeatures: [
      { name: 'Spaced Repetition Review', details: 'Review cards using classic intervals: Again, Hard, Good, Easy.' },
      { name: 'Focus Timer & Session Tracker', details: 'Log session timing, pause whenever necessary, and commit session hours to database logs.' },
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
    desc: 'Secure cloud syncing, credentials backup, and personalized bottom tab customizer.',
    subfeatures: [
      { name: 'GitHub Cloud credentials sync', details: 'Saves configuration and deck data in your personal GitHub repository.' },
      { name: 'Firestore Settings Backup', details: 'Instantly store and pull setup details to/from the cloud database.' },
      { name: 'Nav Customize Dashboard', details: 'Drag, drop, and configure up to 8 bottom tab shortcuts for quick access on mobile.' }
    ],
    usage: 'Link your GitHub credentials and tap "Save to Cloud" to ensure secure automated progress syncing.'
  },
  trash: {
    title: 'Trash Bin',
    icon: Trash2,
    desc: 'Recovery room for deleted resources. Easily restore deleted cards or pages.',
    subfeatures: [
      { name: 'Restore Anchors', details: 'Revert soft-deleted pages and flashcards back into active decks instantly.' },
      { name: 'Batch Emptying', details: 'Clear the trash bin to permanently delete cards and free up screen space.' },
      { name: 'Recovery Audit Logs', details: 'Track when cards were deleted and identify their original parent decks.' }
    ],
    usage: 'If a card is accidentally deleted, click "Trash", locate the card item, and tap the green restore button.'
  }
};

export default function AboutDashboard() {
  const [activeSubTab, setActiveSubTab] = useState('app_info'); // 'app_info' | 'sandbox' | 'quiz' | 'pipeline' | 'guide' | 'faq'
  const [guideMenuTab, setGuideMenuTab] = useState('dashboard');
  
  // Checklist states
  const [checklist, setChecklist] = useState({
    profile: false,
    upload: false,
    generate: false,
    review: false,
    sync: false
  });
  
  // FAQ Buddy Chat States
  const [chatHistory, setChatHistory] = useState([
    { sender: 'buddy', text: 'Hello doctor! 🩺 I am your AutoAnki AI assistant. Ask me anything about how the app works!' }
  ]);
  const [isTyping, setIsTyping] = useState(false);

  // Quiz States
  const [quizStep, setQuizStep] = useState(0); // 0 = start, 1-3 = questions, 4 = result
  const [quizAnswers, setQuizAnswers] = useState({ q1: '', q2: '', q3: '' });

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
    }, 600);
  };

  // Quiz handler
  const handleQuizAnswer = (qKey, value) => {
    setQuizAnswers(prev => ({ ...prev, [qKey]: value }));
    setQuizStep(prev => prev + 1);
  };

  const getQuizResult = () => {
    const { q1, q2, q3 } = quizAnswers;
    if (q1 === '4+' && q2 === '50+') return { name: 'Legend', desc: 'You are committed to absolute mastery. Target study streaks: 4-6 hours daily with high review rates. Spaced repetitions are your weapon of choice.', bg: 'from-purple-500 to-indigo-600' };
    if (q1 === '2-4' || q2 === '20-50') return { name: 'Topper', desc: 'Extremely consistent and highly analytical. Focus on maintaining a regular streak pace and logging high-yield PYTs.', bg: 'from-blue-500 to-cyan-600' };
    if (q3 === 'spaced') return { name: 'Consistent', desc: 'Revision is your priority. Your focus lies in regular intervals rather than intense study bursts. The scheduler is your guide.', bg: 'from-emerald-500 to-teal-600' };
    return { name: 'Rookie', desc: 'Building up consistency step-by-step. Focus on completing core subject tracking decks and logging at least 1 hour daily.', bg: 'from-orange-500 to-amber-600' };
  };

  // Sandbox operations
  const startSandboxExtraction = () => {
    setSandboxStep('extracting');
    setTimeout(() => {
      setSandboxStep('edit');
    }, 1500);
  };

  const handleSandboxRate = (id, rating) => {
    setSandboxCards(prev => prev.map(c => c.id === id ? { ...c, rating } : c));
  };

  const SelectedGuide = MENU_DETAILS[guideMenuTab];

  return (
    <div className="space-y-6 pb-24 text-left animate-in fade-in duration-200">
      
      {/* HEADER SECTION */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 opacity-10">
          <Brain className="w-64 h-64 text-white" />
        </div>
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-black uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" /> Documentation Hub
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">Interactive User Guide</h1>
          <p className="text-xs md:text-sm text-blue-100 max-w-xl font-medium">
            Learn the app workflows, configure study archetypes, practice card generations, and explore technical pipelines.
          </p>
        </div>
      </div>

      {/* TABS SELECTOR */}
      <div className="flex flex-wrap gap-2 bg-gray-100 p-1.5 rounded-2xl border border-gray-200/50">
        {[
          { id: 'app_info', label: 'About App', icon: Info },
          { id: 'guide', label: 'Menus Guide', icon: BookOpen },
          { id: 'sandbox', label: 'Interactive Sandbox', icon: Rocket },
          { id: 'quiz', label: 'Persona Quiz', icon: Award },
          { id: 'pipeline', label: 'Under the Hood', icon: GitMerge },
          { id: 'faq', label: 'Buddy FAQ Chat', icon: HelpCircle },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition ${
                isActive 
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/10' 
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* APP INFO TAB */}
      {activeSubTab === 'app_info' && (
        <div className="space-y-8">
          
          {/* Main Info Columns - Full Width */}
          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-3xl border border-gray-150 shadow-sm space-y-4">
                <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                  <Brain className="w-5 h-5 text-blue-600" /> What is AutoAnki?
                </h2>
                <div className="text-xs text-gray-600 leading-relaxed space-y-3 font-medium">
                  <p>
                    AutoAnki is an advanced, AI-powered active recall ecosystem tailored specifically for postgraduate medical students preparing for highly competitive licensing examinations like **NEET PG** and **INI-CET**.
                  </p>
                  <p>
                    By integrating Cloud syncing, sleep & performance metrics, and a dynamic scheduler with an automated flashcard generator, it helps students move source material seamlessly from PDFs to long-term memory.
                  </p>
                </div>
              </div>

              {/* Checklist Gamified Section */}
              <div className="bg-white p-6 rounded-3xl border border-gray-150 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-black text-gray-900">Power-User Checklist</h2>
                    <p className="text-[10px] text-gray-400 font-bold">Complete all setup goals to master the AutoAnki app</p>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black text-blue-600">{progressPercent}%</span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                </div>

                <div className="space-y-2">
                  {[
                    { key: 'profile', label: 'Configure Study Archetype Goal', desc: 'Select Rookie, Legend, or Topper to set daily streaks.' },
                    { key: 'upload', label: 'Upload your first High-Yield PDF file', desc: 'Add files inside the Library page.' },
                    { key: 'generate', label: 'Extract Flashcards using Gemini AI', desc: 'Select a page and trigger the card generator.' },
                    { key: 'review', label: 'Log Study Session in active Study Room', desc: 'Start focus timer and rate flashcards.' },
                    { key: 'sync', label: 'Backup configuration to Cloud Firestore', desc: 'Go to Settings and trigger Save to Cloud.' }
                  ].map(item => (
                    <button
                      key={item.key}
                      onClick={() => toggleChecklist(item.key)}
                      className="w-full text-left flex items-start gap-3 p-3 hover:bg-gray-50 rounded-2xl transition border border-transparent hover:border-gray-100"
                    >
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition ${
                        checklist[item.key] ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300 bg-white'
                      }`}>
                        {checklist[item.key] && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                      <div>
                        <div className="text-xs font-black text-gray-800">{item.label}</div>
                        <div className="text-[10px] text-gray-500 font-medium">{item.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* DEDICATED PREMIUM DEVELOPER PORTFOLIO HERO */}
          <div 
            className="text-white p-8 rounded-3xl shadow-2xl relative overflow-hidden border border-red-500/20"
            style={{
              backgroundColor: '#0d0d0f',
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
              backgroundSize: '24px 24px'
            }}
          >
            {/* Curved background glow shapes */}
            <div className="absolute -right-20 -bottom-20 w-96 h-96 bg-red-600/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -left-20 -top-20 w-96 h-96 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute left-1/3 top-1/4 w-80 h-80 bg-white/5 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 space-y-6">
              
              {/* Header Profile Title Info */}
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-500/20 text-red-500 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner shrink-0 animate-pulse">
                  🩺
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight leading-none">Dr. Kishor Anbazhakan</h2>
                  <p className="text-xs text-red-500 font-bold flex items-center gap-1 mt-1.5">
                    <GraduationCap className="w-4 h-4" /> General Practitioner (MBBS) & Medical Tech Developer
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-850 my-4" />

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
                      <h4 className="text-xs font-black uppercase text-red-500 tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-red-500" /> The Story
                      </h4>
                      <p className="text-xs text-gray-300 leading-relaxed max-w-3xl">
                        The journey of AutoAnki began in active clinical rotations, where balancing 14-hour hospital shifts with rigorous exam preparation was the daily reality. I realized that traditional flashcard creation—copious copying, pasting, cropping, and tagging—consumed more time than actual active study. Driven by this inefficiency, I wrote the first scripts to automate deck formatting. Over countless late-night coding sessions, those scripts evolved into this comprehensive desktop-mobile ecosystem, merging state-of-the-art vision models with spaced repetition science.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-xs font-black uppercase text-red-500 tracking-wider flex items-center gap-1.5">
                        <Brain className="w-3.5 h-3.5 text-red-500" /> Mission & Vision
                      </h4>
                      <p className="text-xs text-gray-300 leading-relaxed max-w-3xl">
                        Designed by a doctor, for doctors and medical aspirants. The goal is simple: eliminate the busywork of card formatting so you can focus entirely on mastering clinical concepts and conquering competitive postgraduate medical entrance examinations (like NEET PG and INICET). AutoAnki integrates sub-second database pipelines, personalized sleep tracking logic, and high-yield topic indices (PYTs). This platform represents the ultimate consolidation of medicine and computer science, engineering a study space where technology handles cognitive load so you can achieve peak learning efficiency.
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
                  <h4 className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-1">Project Statistics</h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { val: '19', label: 'Subjects covered', desc: 'All clinical/pre-clinical modules' },
                      { val: '99.8%', label: 'AI Extraction accuracy', desc: 'High-yield fact isolation' },
                      { val: '< 4.5s', label: 'Avg latency', desc: 'Sub-second rendering speeds' },
                      { val: 'AES-256', label: 'Cloud encryption', desc: 'Secure repository sync' }
                    ].map((stat, idx) => (
                      <div key={idx} className="bg-white/5 border border-white/10 p-4 rounded-2xl flex flex-col justify-between hover:bg-white/10 transition duration-300">
                        <div className="text-2xl font-black text-red-500">{stat.val}</div>
                        <div>
                          <div className="text-[10px] font-black text-white mt-1">{stat.label}</div>
                          <div className="text-[8px] text-gray-400 font-medium leading-tight mt-0.5">{stat.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-red-950/20 border border-red-900/30 p-4 rounded-2xl space-y-2">
                    <div className="text-[10px] font-black text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> Tech Blueprint
                    </div>
                    <p className="text-[9px] text-gray-300 leading-normal font-medium">
                      Engineered with a modular state architecture, optimized for lightweight page layout parsing, and integrated with GitHub sync for complete user data ownership.
                    </p>
                  </div>
                </div>

              </div>

            </div>
          </div>
          
        </div>
      )}

      {/* MENUS GUIDE */}
      {activeSubTab === 'guide' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Menu Selector Sidebar */}
          <div className="md:col-span-1 space-y-1 max-h-[500px] overflow-y-auto pr-1 border-r border-gray-100">
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
                      ? 'bg-blue-50 text-blue-600' 
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    <span>{menu.title}</span>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                </button>
              );
            })}
          </div>

          {/* Guide Content Display */}
          <div className="md:col-span-3 bg-white p-6 rounded-3xl border border-gray-150 space-y-6 shadow-sm">
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
              <div className="bg-blue-100 p-3 rounded-2xl text-blue-600">
                <SelectedGuide.icon className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-black text-gray-900">{SelectedGuide.title} Guide</h2>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Tab reference and subfeatures</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-wide">Overview Description</h3>
                <p className="text-xs text-gray-700 mt-1 leading-relaxed font-semibold">{SelectedGuide.desc}</p>
              </div>

              <div>
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-wide mb-2">Key Subfeatures Included</h3>
                <div className="grid grid-cols-1 gap-2.5">
                  {SelectedGuide.subfeatures.map((sf, index) => (
                    <div key={index} className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                      <div className="text-xs font-black text-gray-800 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                        {sf.name}
                      </div>
                      <div className="text-[10px] text-gray-500 font-medium mt-0.5 pl-3">{sf.details}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-2xl">
                <h3 className="text-[10px] font-black text-blue-800 uppercase tracking-wider">How to Use as an Aspirant</h3>
                <p className="text-xs text-blue-900 mt-1 font-medium">{SelectedGuide.usage}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* INTERACTIVE SANDBOX */}
      {activeSubTab === 'sandbox' && (
        <div className="bg-white p-6 rounded-3xl border border-gray-150 shadow-sm space-y-6">
          <div className="flex justify-between items-center pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-lg font-black text-gray-900">Interactive Sandbox Simulator</h2>
              <p className="text-[10px] text-gray-500 font-bold">Try generating and rating a cards workflow in real time</p>
            </div>
            <div className="flex gap-1">
              {['upload', 'edit', 'synced'].map((step, idx) => (
                <div 
                  key={step} 
                  className={`w-2.5 h-2.5 rounded-full ${
                    sandboxStep === step ? 'bg-blue-600 animate-pulse' : idx < ['upload', 'edit', 'synced'].indexOf(sandboxStep) ? 'bg-green-500' : 'bg-gray-200'
                  }`} 
                />
              ))}
            </div>
          </div>

          {/* SIMULATOR SCREEN CONTENT */}
          {sandboxStep === 'upload' && (
            <div className="p-8 border-2 border-dashed border-gray-200 rounded-3xl flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                <FileText className="w-6 h-6 animate-bounce" />
              </div>
              <div>
                <h3 className="text-xs font-black text-gray-800">Simulated Upload PDF source</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">Click the trigger below to simulate AI extraction from a medical textbook page</p>
              </div>
              <button
                onClick={startSandboxExtraction}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition active:scale-95 shadow-md shadow-blue-500/10"
              >
                Trigger AI Extraction
              </button>
            </div>
          )}

          {sandboxStep === 'extracting' && (
            <div className="p-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <div className="text-xs font-black text-gray-800">Gemini Vision AI analyzing medical page layout...</div>
            </div>
          )}

          {sandboxStep === 'edit' && (
            <div className="space-y-4">
              <div className="p-4 bg-yellow-50 border border-yellow-200 text-yellow-800 text-[10px] font-bold rounded-2xl">
                ⚠️ Simulated Flashcard Generated successfully! Rate the card below using spacing weights:
              </div>

              {sandboxCards.map(card => (
                <div key={card.id} className="p-4 bg-gray-50 border border-gray-200 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase">{card.tag}</span>
                    {card.rating && (
                      <span className="bg-green-100 text-green-600 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase">Rated: {card.rating}</span>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-400 font-bold uppercase">Question</div>
                    <div className="text-xs font-black text-gray-800">{card.q}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-400 font-bold uppercase">Answer</div>
                    <div className="text-xs font-semibold text-gray-700">{card.a}</div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    {['Again', 'Hard', 'Good', 'Easy'].map(r => (
                      <button
                        key={r}
                        onClick={() => handleSandboxRate(card.id, r)}
                        className={`flex-grow py-2 rounded-xl text-[10px] font-bold uppercase transition active:scale-95 border ${
                          card.rating === r ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
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
                  className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition active:scale-95"
                >
                  Commit & Sync to Cloud
                </button>
              </div>
            </div>
          )}

          {sandboxStep === 'synced' && (
            <div className="p-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xs font-black text-gray-800">Mock Data Synced Successfully!</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">Your study logs, streak metrics, and deck sizes have updated live.</p>
              </div>
              <button
                onClick={() => {
                  setSandboxStep('upload');
                  setSandboxCards([{ id: 1, q: 'What is the pathognomonic finding of Aschoff nodules?', a: 'Anitschkow cells (caterpillar nucleus cells)', tag: 'Pathology', rating: '' }]);
                }}
                className="px-6 py-2.5 bg-gray-150 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-black uppercase tracking-wider transition"
              >
                Reset Simulator
              </button>
            </div>
          )}
        </div>
      )}

      {/* STUDY PERSONA QUIZ */}
      {activeSubTab === 'quiz' && (
        <div className="bg-white p-6 rounded-3xl border border-gray-150 shadow-sm space-y-6">
          <div className="pb-4 border-b border-gray-100">
            <h2 className="text-lg font-black text-gray-900">Study Persona Selector Quiz</h2>
            <p className="text-[10px] text-gray-500 font-bold">Diagnose your preparation targets and select optimal scheduler goals</p>
          </div>

          {quizStep === 0 && (
            <div className="p-6 text-center space-y-4">
              <div className="text-3xl">📝</div>
              <div>
                <h3 className="text-xs font-black text-gray-800">Identify your Streak Archetype</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">Answer 3 simple questions about your daily revision pace</p>
              </div>
              <button
                onClick={() => setQuizStep(1)}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition shadow-md shadow-blue-500/10"
              >
                Start Diagnostic
              </button>
            </div>
          )}

          {quizStep === 1 && (
            <div className="space-y-4">
              <h3 className="text-sm font-black text-gray-800">Question 1: How many hours do you plan to study daily?</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { val: '0-2', label: '0 to 2 Hours (Part-time / Interns)' },
                  { val: '2-4', label: '2 to 4 Hours (Regular preparation)' },
                  { val: '4+', label: '4+ Hours (Dedicated study block)' }
                ].map(opt => (
                  <button
                    key={opt.val}
                    onClick={() => handleQuizAnswer('q1', opt.val)}
                    className="p-4 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-2xl transition text-left text-xs font-bold text-gray-800"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {quizStep === 2 && (
            <div className="space-y-4">
              <h3 className="text-sm font-black text-gray-800">Question 2: What is your daily target for Qbank questions?</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { val: '0-20', label: 'Up to 20 Questions' },
                  { val: '20-50', label: '20 to 50 Questions' },
                  { val: '50+', label: '50+ Questions (High volume)' }
                ].map(opt => (
                  <button
                    key={opt.val}
                    onClick={() => handleQuizAnswer('q2', opt.val)}
                    className="p-4 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-2xl transition text-left text-xs font-bold text-gray-800"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {quizStep === 3 && (
            <div className="space-y-4">
              <h3 className="text-sm font-black text-gray-800">Question 3: Which memory retention method do you trust most?</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { val: 'spaced', label: 'Spaced repetition reviews' },
                  { val: 'reading', label: 'Re-reading text / source notes' },
                  { val: 'tests', label: 'Attempting full grand tests' }
                ].map(opt => (
                  <button
                    key={opt.val}
                    onClick={() => handleQuizAnswer('q3', opt.val)}
                    className="p-4 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-2xl transition text-left text-xs font-bold text-gray-800"
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
                  <div className={`bg-gradient-to-r ${res.bg} p-6 rounded-3xl text-white space-y-3`}>
                    <div className="inline-block px-2.5 py-0.5 bg-white/20 rounded-full text-[9px] font-black uppercase tracking-wider">Recommended Archetype</div>
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
                  className="px-6 py-2.5 bg-gray-150 hover:bg-gray-250 text-gray-800 rounded-xl text-xs font-black uppercase tracking-wider transition"
                >
                  Retry Diagnostic
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* UNDER THE HOOD PIPELINE */}
      {activeSubTab === 'pipeline' && (
        <div className="bg-white p-6 rounded-3xl border border-gray-150 shadow-sm space-y-6">
          <div className="pb-4 border-b border-gray-100">
            <h2 className="text-lg font-black text-gray-900">Under the Hood: Data Pipeline</h2>
            <p className="text-[10px] text-gray-500 font-bold">Trace how textbook source PDFs transform into spaced repetition decks</p>
          </div>

          <div className="relative border-l-2 border-blue-100 ml-4 pl-6 space-y-6">
            {[
              {
                title: '1. Source Ingestion (Library)',
                desc: 'PDF and image bytes are loaded inside the browser storage. Coordinates are mapped to specific page boundaries.',
                schema: '{\n  "fileName": "Pathology_HighYield_Notes.pdf",\n  "totalPages": 84,\n  "fileSize": 4518204,\n  "contentType": "application/pdf"\n}'
              },
              {
                title: '2. Vision LLM extraction (Cards)',
                desc: 'Pages are converted into canvas coordinates and processed by Gemini Vision AI to identify high-yield clinical queries.',
                schema: '{\n  "question": "What is the primary indicator of Whipple disease?",\n  "answer": "PAS-positive macrophages in lamina propria",\n  "subject": "Pathology",\n  "tags": ["Whipple", "Gastroenterology"]\n}'
              },
              {
                title: '3. Cloud Backup Sync (Settings)',
                desc: 'Client records and settings are committed to Firestore instances and backed up inside the users private GitHub repository.',
                schema: '{\n  "path": "users/{uid}/settings/keys",\n  "fields": {\n    "githubUsername": "doctor_prep",\n    "repoName": "my_anki_decks",\n    "pat": "ghp_***"\n  }\n}'
              },
              {
                title: '4. Exporter compilation (Export)',
                desc: 'Curated card records are packaged inside a local SQLite deck and compiled as an Anki package (.apkg) file.',
                schema: '{\n  "deckName": "Pathology::NEETPG",\n  "cardFormat": "Anki2.0",\n  "compressed": true,\n  "mimeType": "application/apkg"\n}'
              }
            ].map((node, index) => (
              <div key={index} className="relative space-y-2">
                <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-blue-600 border-4 border-white shadow-sm" />
                <h3 className="text-xs font-black text-gray-900">{node.title}</h3>
                <p className="text-[10px] text-gray-500 font-medium leading-relaxed">{node.desc}</p>
                <details className="group border border-gray-150 rounded-xl overflow-hidden bg-gray-50">
                  <summary className="flex items-center justify-between p-2.5 text-[9px] font-black text-blue-600 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100">
                    <span>View JSON Metadata Schema</span>
                    <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
                  </summary>
                  <pre className="p-3 bg-gray-950 text-green-400 font-mono text-[9px] leading-relaxed overflow-x-auto select-all">
                    {node.schema}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FAQ BUDDY CHAT */}
      {activeSubTab === 'faq' && (
        <div className="bg-white p-6 rounded-3xl border border-gray-150 shadow-sm space-y-6">
          <div className="pb-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-gray-900">Study Buddy Help Chat</h2>
              <p className="text-[10px] text-gray-500 font-bold">Ask rapid questions about syncing, study logic, and export options</p>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-green-50 border border-green-200 rounded-full text-[9px] font-bold text-green-700 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Buddy Online
            </div>
          </div>

          {/* CHAT DISPLAY */}
          <div className="h-64 border border-gray-150 rounded-2xl bg-gray-50 p-4 overflow-y-auto space-y-3 flex flex-col justify-end">
            <div className="space-y-3 overflow-y-auto max-h-full">
              {chatHistory.map((msg, index) => (
                <div 
                  key={index} 
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-[11px] font-medium leading-relaxed ${
                    msg.sender === 'user' 
                      ? 'bg-blue-600 text-white rounded-br-none' 
                      : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none shadow-sm'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 text-gray-400 px-3.5 py-2 rounded-2xl rounded-bl-none shadow-sm text-[10px] font-bold italic animate-pulse">
                    Buddy is drafting response...
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* FAQ SELECTIONS */}
          <div className="space-y-2">
            <h4 className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Quick Inquiries</h4>
            <div className="flex flex-wrap gap-2">
              {[
                { 
                  q: 'How does Cloud Sync work?', 
                  a: 'It links to your personal GitHub repository. Tap Settings, input your repository settings and token, then click Save to Cloud to backup everything securely.' 
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
                  a: 'Yes, session logs are preserved in local storage and can be synced back up when a connection is established.'
                },
                {
                  q: 'What is the Streak Meter?',
                  a: 'Measures study consistency and rewards achievements (e.g. Rookie, Dedicated, Legend) based on your daily targets.'
                },
                {
                  q: 'How does AI card generation cost work?',
                  a: 'It is powered by the Gemini API. The app tracks reads/writes to help you manage usage limits effectively.'
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
                  a: 'Marks a card as forgot, resetting its ease level and scheduling it for immediate re-review in the active session.'
                },
                {
                  q: 'How do I add PDF references?',
                  a: 'Go to Library, create a subject deck folder, and upload files using the plus button.'
                },
                {
                  q: 'What is the PYT Logger?',
                  a: 'Previous Year Topics logger, where you catalog study sessions directly against clinical topics tested in past papers.'
                },
                {
                  q: 'Can I sync mobile navigation settings?',
                  a: 'Yes! Save setup preferences to cloud Firestore, and pull them on any mobile device to sync bottom nav layouts.'
                },
                {
                  q: 'What are counseling percentile predictions?',
                  a: 'Uses past cutoffs to predict target scores needed for getting desired medical seats in counseling rounds.'
                },
                {
                  q: 'Is my data stored securely?',
                  a: 'Absolutely. All database rules and GitHub sync directories are mapped using your own private API tokens.'
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
                  a: 'Significantly increases the spacing interval of a card, scheduling it far into future review dates.'
                },
                {
                  q: 'How do I setup GitHub API token?',
                  a: 'Generate a Personal Access Token (PAT) with repo scopes on GitHub, then paste and save it inside the Settings tab.'
                }
              ].map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => handleFaqClick(item.q, item.a)}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 text-[10px] font-bold rounded-full transition active:scale-95"
                >
                  {item.q}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
