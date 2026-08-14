import React from 'react';
import { motion } from 'framer-motion';
import { 
  Sparkles, Share2, Brain, GraduationCap, ShieldCheck, Zap, HardDrive, Cpu
} from 'lucide-react';

export default function AboutDashboard({ isDark = false, onNavigate }) {
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

    </div>
  );
}
