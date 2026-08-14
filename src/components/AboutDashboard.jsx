import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Info, Sparkles, Share2, Check, Brain, GraduationCap, ShieldCheck
} from 'lucide-react';

export default function AboutDashboard({ isDark = false, onNavigate }) {
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

  const toggleChecklist = (key) => {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const completedCount = Object.values(checklist).filter(Boolean).length;
  const progressPercent = Math.round((completedCount / 5) * 100);

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

      {/* OVERVIEW & CHECKLIST GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* WHAT IS AUTOANKI CARD */}
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

        {/* POWER USER CHECKLIST SECTION */}
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
              { key: 'profile', label: 'Configure Study Archetype Goal', desc: 'Set daily streak and revision targets.' },
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

    </div>
  );
}
