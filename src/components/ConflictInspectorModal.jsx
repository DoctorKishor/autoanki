import React, { useState } from 'react';
import { AlertTriangle, AlertCircle, X, Download, Layers } from 'lucide-react';

export default function ConflictInspectorModal({
  isOpen,
  onClose,
  activeConflicts = [],
  selectedConflictIndex,
  setSelectedConflictIndex,
  setCards,
  saveLocalCards,
  saveLocalCard,
  deleteLocalCard,
  setIgnoredConflicts,
  themeMode = 'light'
}) {
  const [hoveredResolutionBtn, setHoveredResolutionBtn] = useState(null);

  const isDark = themeMode === 'dark';
  const bgBase = isDark ? '#222730' : '#e6ecf5';

  if (!isOpen || activeConflicts.length === 0) return null;

  const integrityScore = Math.max(50, Math.min(100, Math.round(100 - activeConflicts.length * 8)));
  const index = Math.min(selectedConflictIndex, activeConflicts.length - 1);
  const conflict = activeConflicts[index];
  if (!conflict) return null;

  const { cardA, cardB, similarity, key } = conflict;
  const matchPercent = Math.round(similarity * 100);

  const getHighlightedText = (text, otherText) => {
    if (!text) return "—";
    const cleanWords = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
    const otherWords = new Set(cleanWords(otherText));
    const words = text.split(/\s+/);

    return words.map((word, idx) => {
      const cleanWord = word.toLowerCase().replace(/[^a-z0-9]/g, '');
      const isOverlapping = otherWords.has(cleanWord) && cleanWord.length > 2;
      return (
        <span
          key={idx}
          className={isOverlapping ? "bg-orange-500/20 text-orange-600 px-0.5 rounded font-black border-b border-orange-500/50" : ""}
        >
          {word}{" "}
        </span>
      );
    });
  };

  const handleKeepBoth = async () => {
    try {
      const cardAUpdated = { ...cardA, keepBoth: true };
      const cardBUpdated = { ...cardB, keepBoth: true };

      setCards(prev => prev.map(c => {
        if (c.id === cardA.id) return cardAUpdated;
        if (c.id === cardB.id) return cardBUpdated;
        return c;
      }));

      await saveLocalCards([cardAUpdated, cardBUpdated]);

      setIgnoredConflicts(prev => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });

      if (selectedConflictIndex > 0) {
        setSelectedConflictIndex(prev => prev - 1);
      }
    } catch (err) {
      console.error("[LocalDB] Failed to save keepBoth decision:", err);
      alert("Failed to save decision locally: " + err.message);
    }
  };

  const handleMerge = async () => {
    try {
      const mergedBack = `${cardA.back || ''}\n\n--- MERGED ADDITIONAL DETAILS ---\n${cardB.back || cardB.text || ''}`;
      const cardAUpdated = { ...cardA, back: mergedBack };

      setCards(prev => prev.filter(c => c.id !== cardB.id).map(c => c.id === cardA.id ? cardAUpdated : c));

      await saveLocalCard(cardAUpdated);
      await deleteLocalCard(cardB.id);

      setIgnoredConflicts(prev => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });

      if (selectedConflictIndex > 0) {
        setSelectedConflictIndex(prev => prev - 1);
      }
    } catch (err) {
      console.error("[LocalDB] Failed to merge cards:", err);
      alert("Failed to merge cards locally: " + err.message);
    }
  };

  const handleRephrase = async () => {
    try {
      const currentFront = cardB.front || cardB.text || '';
      const deckName = (cardB.deck || '').split('::').pop() || 'Card';
      const refinedFront = `[Context: ${deckName}] ${currentFront}`;
      const cardBUpdated = cardB.front
        ? { ...cardB, front: refinedFront }
        : { ...cardB, text: refinedFront };

      setCards(prev => prev.map(c => c.id === cardB.id ? cardBUpdated : c));

      await saveLocalCard(cardBUpdated);

      setIgnoredConflicts(prev => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });

      if (selectedConflictIndex > 0) {
        setSelectedConflictIndex(prev => prev - 1);
      }
    } catch (err) {
      console.error("[LocalDB] Failed to refine card:", err);
      alert("Failed to refine card locally: " + err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md overflow-y-auto p-2 sm:p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-5xl flex flex-col rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden border animate-in zoom-in-95 duration-300"
        style={{
          maxHeight: '94dvh',
          background: bgBase,
          borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.1)',
          boxShadow: isDark
            ? '0 32px 80px rgba(0,0,0,0.6), 6px 6px 14px #171a20, -6px -6px 14px #2d3440'
            : '0 32px 80px rgba(0,0,0,0.15), 6px 6px 14px #c2c8d4, -6px -6px 14px #ffffff'
        }}
      >
        {/* Header */}
        <div
          className="px-4 sm:px-6 py-3 sm:py-4 border-b flex items-center justify-between shrink-0"
          style={{ borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 ${isDark ? 'bg-orange-500/15 text-orange-400' : 'bg-orange-500/10 text-orange-600'}`}>
              <AlertTriangle className="w-4 h-4 sm:w-5 h-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <h2 className={`text-sm sm:text-lg font-black tracking-tight leading-tight ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                AI Bundle Optimizer
              </h2>
              <p className={`text-[10px] mt-0.5 hidden sm:block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Resolve duplicate concept cards, merge content notes, or differentiate context tags.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition ${isDark ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-200 text-slate-400 hover:text-slate-700'}`}
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Dynamic Bundle Integrity Score Panel */}
        <div
          className="p-4 sm:p-5 border-b flex items-center justify-between shrink-0"
          style={{
            borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            background: isDark ? 'linear-gradient(90deg, rgba(59,130,246,0.04), rgba(168,85,247,0.04))' : 'linear-gradient(90deg, rgba(59,130,246,0.02), rgba(168,85,247,0.02))'
          }}
        >
          <div>
            <span className={`text-[9px] sm:text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Bundle Integrity Rating</span>
            <div className="flex items-center gap-2 mt-0.5 sm:mt-1">
              <span className={`text-lg sm:text-xl font-black ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{integrityScore}%</span>
              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider ${integrityScore >= 90 ? 'bg-emerald-500/20 text-emerald-400' : (integrityScore >= 75 ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400')}`}>
                {integrityScore >= 90 ? 'Excellent' : (integrityScore >= 75 ? 'Good' : 'Needs Optimization')}
              </span>
            </div>
          </div>
          <div className="relative w-11 h-11 sm:w-14 sm:h-14 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 56 56" className="w-full h-full transform -rotate-90">
              <circle cx="28" cy="28" r="22" stroke={isDark ? '#2e3542' : '#f3f4f6'} strokeWidth="4" fill="transparent" />
              <circle cx="28" cy="28" r="22" stroke="#3b82f6" strokeWidth="4" fill="transparent"
                strokeDasharray={2 * Math.PI * 22}
                strokeDashoffset={2 * Math.PI * 22 * (1 - integrityScore / 100)}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center text-[10px] sm:text-xs font-black ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{integrityScore}%</span>
          </div>
        </div>

        {/* Mobile Horizontal scroll conflict navigator */}
        <div
          className="flex sm:hidden items-center gap-2 overflow-x-auto py-2.5 px-3 border-b shrink-0 scrollbar-none"
          style={{ borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}
        >
          {activeConflicts.map((c, idx) => {
            const isActive = selectedConflictIndex === idx;
            return (
              <button
                key={c.key}
                onClick={() => setSelectedConflictIndex(idx)}
                className={`px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-wider shrink-0 transition active:scale-95 ${
                  isActive ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25' : isDark ? 'neu-btn-dark text-slate-300' : 'neu-btn-light text-slate-600'
                }`}
              >
                Conflict #{idx + 1} ({Math.round(c.similarity * 100)}%)
              </button>
            );
          })}
        </div>

        {/* Content Panel */}
        <div className="flex-grow flex overflow-hidden">
          
          {/* Desktop Left Sidebar Select Queue */}
          <div
            className="hidden sm:flex w-[200px] border-r flex-col overflow-y-auto shrink-0"
            style={{
              borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
              background: isDark ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'
            }}
          >
            <div
              className="p-3 border-b shrink-0"
              style={{ borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}
            >
              <span className={`text-[9px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Conflict Queue ({activeConflicts.length})</span>
            </div>
            <div className="flex-grow overflow-y-auto">
              {activeConflicts.map((c, idx) => {
                const isActive = selectedConflictIndex === idx;
                const matchPct = Math.round(c.similarity * 100);
                return (
                  <button
                    key={c.key}
                    onClick={() => setSelectedConflictIndex(idx)}
                    className={`p-3 border-b text-left transition-all flex flex-col gap-1.5 w-full ${
                      isActive
                        ? (isDark ? 'bg-orange-500/10 border-l-4 border-l-orange-500' : 'bg-orange-50/50 border-l-4 border-l-orange-500')
                        : (isDark ? 'hover:bg-slate-700/30 border-l-4 border-l-transparent text-slate-300' : 'hover:bg-slate-100/60 border-l-4 border-l-transparent text-slate-600')
                    }`}
                    style={{ borderColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className={`font-mono text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
                        #{idx + 1}
                      </span>
                      <span className="text-[8px] font-black text-orange-500">{matchPct}% Match</span>
                    </div>
                    <span className={`text-[9px] font-bold line-clamp-2 leading-tight ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                      {c.cardA.front || c.cardA.text || "Cloze Note"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Inspector workspace */}
          <div className="flex-grow p-3 sm:p-5 flex flex-col gap-3 sm:gap-5 overflow-y-auto">
            
            {/* Similarity Score bar */}
            <div
              className="p-3.5 rounded-2xl shrink-0 border"
              style={{
                background: isDark ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)',
                borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
              }}
            >
              <div className="flex justify-between items-center mb-1.5 text-xs font-black">
                <span className="flex items-center gap-1.5 text-orange-500"><AlertCircle className="w-4 h-4" /> Similarity Score</span>
                <span className={isDark ? 'text-slate-200' : 'text-slate-800'}>{matchPercent}% Match</span>
              </div>
              <div className="w-full bg-slate-300/40 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-orange-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${matchPercent}%` }}
                />
              </div>
            </div>

            {/* Split side-by-side comparison (or stack on mobile) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-grow overflow-y-auto items-start">
              
              {/* Card A */}
              <div
                className="rounded-2xl p-4 flex flex-col gap-3 transition-all border"
                style={{
                  background: isDark ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)',
                  borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                  boxShadow: isDark ? 'inset 1px 1px 3px rgba(0,0,0,0.3)' : 'inset 1px 1px 3px rgba(255,255,255,0.5)'
                }}
              >
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black uppercase text-blue-500 tracking-wider">Card A</span>
                  <span className={`text-[8px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{cardA.id.slice(0, 8)}</span>
                </div>
                <div>
                  <span className={`text-[9px] font-black uppercase block tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Front Content</span>
                  <p className={`text-xs font-bold mt-1 leading-relaxed ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                    {getHighlightedText(cardA.front || cardA.text, cardB.front || cardB.text)}
                  </p>
                </div>
                <div className="border-t pt-2.5" style={{ borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                  <span className={`text-[9px] font-black uppercase block tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Back (Answer)</span>
                  <p className={`text-[10px] mt-1 leading-relaxed p-2.5 rounded-xl border font-mono whitespace-pre-wrap ${isDark ? 'bg-slate-800 text-slate-200 border-slate-700' : 'bg-white text-slate-700 border-gray-100'}`}>
                    {cardA.back || "—"}
                  </p>
                </div>
                <div className={`text-[8px] font-bold px-2 py-1 rounded self-start mt-1 ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-gray-200/50 text-gray-500'}`}>
                  📁 {cardA.deck}
                </div>
              </div>

              {/* Card B */}
              <div
                className="rounded-2xl p-4 flex flex-col gap-3 transition-all border"
                style={{
                  background: isDark ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)',
                  borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                  boxShadow: isDark ? 'inset 1px 1px 3px rgba(0,0,0,0.3)' : 'inset 1px 1px 3px rgba(255,255,255,0.5)'
                }}
              >
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black uppercase text-orange-500 tracking-wider">Card B</span>
                  <span className={`text-[8px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{cardB.id.slice(0, 8)}</span>
                </div>
                <div>
                  <span className={`text-[9px] font-black uppercase block tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Front Content</span>
                  <p className={`text-xs font-bold mt-1 leading-relaxed ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                    {getHighlightedText(cardB.front || cardB.text, cardA.front || cardA.text)}
                  </p>
                </div>
                <div className="border-t pt-2.5" style={{ borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                  <span className={`text-[9px] font-black uppercase block tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Back (Answer)</span>
                  <p className={`text-[10px] mt-1 leading-relaxed p-2.5 rounded-xl border font-mono whitespace-pre-wrap ${isDark ? 'bg-slate-800 text-slate-200 border-slate-700' : 'bg-white text-slate-700 border-gray-100'}`}>
                    {cardB.back || "—"}
                  </p>
                </div>
                <div className={`text-[8px] font-bold px-2 py-1 rounded self-start mt-1 ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-gray-200/50 text-gray-500'}`}>
                  📁 {cardB.deck}
                </div>
              </div>

            </div>

            {/* Conflict Resolution Action Dock */}
            <div
              className="relative mt-auto border-t pt-4 sm:pt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0"
              style={{ borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}
            >
              {/* Keep Both Hover Info */}
              {hoveredResolutionBtn === 'keep' && (
                <div className="absolute bottom-[calc(100%+8px)] left-0 w-64 bg-slate-900/95 backdrop-blur-md text-slate-100 p-3.5 rounded-2xl text-[9px] font-bold leading-normal shadow-2xl border border-slate-800 animate-in fade-in slide-in-from-bottom-1 duration-155 z-50">
                  <div className="text-orange-400 font-black mb-1 uppercase tracking-wider">💡 Keep Both Cards</div>
                  <p className="text-slate-300 font-medium">Exports both cards as-is. This ignores the duplicate conflict for the current session without modifying any database records.</p>
                </div>
              )}

              {/* Differentiate Hover Info */}
              {hoveredResolutionBtn === 'diff' && (
                <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 w-64 bg-slate-900/95 backdrop-blur-md text-slate-100 p-3.5 rounded-2xl text-[9px] font-bold leading-normal shadow-2xl border border-slate-800 animate-in fade-in slide-in-from-bottom-1 duration-155 z-50">
                  <div className="text-orange-400 font-black mb-1 uppercase tracking-wider">💡 Differentiate Card B</div>
                  <p className="text-slate-300 font-medium">Appends the deck folder context prefix (e.g., <span className="text-blue-300">`[Context: Pharmacology]`</span>) to Card B's front text in database to make it distinct.</p>
                </div>
              )}

              {/* Merge Hover Info */}
              {hoveredResolutionBtn === 'merge' && (
                <div className="absolute bottom-[calc(100%+8px)] right-0 w-64 bg-slate-900/95 backdrop-blur-md text-slate-100 p-3.5 rounded-2xl text-[9px] font-bold leading-normal shadow-2xl border border-slate-800 animate-in fade-in slide-in-from-bottom-1 duration-155 z-50">
                  <div className="text-orange-400 font-black mb-1 uppercase tracking-wider">💡 Merge Card B 🡒 A</div>
                  <p className="text-slate-300 font-medium">Combines both cards into one: appends Card B's answer details to Card A's back in database, then deletes Card B completely.</p>
                </div>
              )}

              <button
                onClick={handleKeepBoth}
                onMouseEnter={() => setHoveredResolutionBtn('keep')}
                onMouseLeave={() => setHoveredResolutionBtn(null)}
                className={`py-2.5 px-4 font-black text-[10px] uppercase tracking-wider rounded-xl transition active:scale-95 duration-200 flex-1 flex items-center justify-center gap-1.5 ${isDark ? 'neu-btn-dark text-slate-300' : 'neu-btn-light text-slate-600'}`}
              >
                Keep Both
              </button>
              <button
                onClick={handleRephrase}
                onMouseEnter={() => setHoveredResolutionBtn('diff')}
                onMouseLeave={() => setHoveredResolutionBtn(null)}
                className={`py-2.5 px-4 font-black text-[10px] uppercase tracking-wider rounded-xl transition active:scale-95 duration-200 flex-1 flex items-center justify-center gap-1.5 ${isDark ? 'neu-btn-dark text-orange-400' : 'neu-btn-light text-orange-600 bg-orange-50/10'}`}
              >
                Differentiate
              </button>
              <button
                onClick={handleMerge}
                onMouseEnter={() => setHoveredResolutionBtn('merge')}
                onMouseLeave={() => setHoveredResolutionBtn(null)}
                className="py-2.5 px-4 bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition shadow-lg shadow-blue-500/25 active:scale-95 duration-200 flex-1 flex items-center justify-center gap-1.5"
              >
                Merge B 🡒 A
              </button>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
