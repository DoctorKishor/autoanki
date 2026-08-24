import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, Image as ImageIcon, Sparkles, AlertCircle, Layers } from 'lucide-react';

export default function PdfSlicePreviewModal({
  isOpen,
  onClose,
  topicName = '',
  subjectName = '',
  pdfSlice = null,
  isLoading = false,
  onConfirmGenerate,
  isDark = true
}) {
  const [activeTab, setActiveTab] = useState('text'); // 'text' | 'images'

  if (!isOpen) return null;

  // Split text by page headers: --- PAGE N ---
  const textPages = (() => {
    if (!pdfSlice?.extractedText) return [];
    const raw = pdfSlice.extractedText;
    const parts = raw.split(/\n?--- PAGE (\d+) ---\n?/);
    const result = [];
    for (let i = 1; i < parts.length; i += 2) {
      result.push({
        pageNumber: parseInt(parts[i], 10),
        text: parts[i + 1] ? parts[i + 1].trim() : ''
      });
    }
    return result.length > 0 ? result : [{ pageNumber: pdfSlice.effStart || 1, text: raw }];
  })();

  return (
    <AnimatePresence>
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 overflow-hidden"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className={`w-full max-w-3xl p-6 rounded-3xl border shadow-2xl space-y-5 max-h-[90vh] flex flex-col transform-gpu ${
            isDark ? 'bg-[#222730] border-slate-700/80 text-white' : 'bg-[#e6ecf5] border-slate-300 text-slate-900'
          }`}
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between border-b pb-3 border-slate-700/40 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`p-2.5 rounded-2xl shrink-0 ${isDark ? 'neu-pressed-dark text-blue-400' : 'bg-blue-100 text-blue-600'}`}>
                <Layers className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-black tracking-tight truncate">
                  👁️ Extracted PDF Slice Preview
                </h3>
                <p className="text-[11px] font-medium text-slate-400 truncate">
                  Topic: <span className="text-amber-400 font-bold">{topicName}</span> ({subjectName})
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className={`p-2 rounded-xl border transition-all ${
                isDark ? 'neu-btn-dark text-slate-400 hover:text-white border-slate-700' : 'neu-btn-light text-slate-500 hover:text-slate-900 border-slate-300'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {isLoading ? (
            <div className="p-12 text-center space-y-3 my-auto">
              <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm font-bold text-amber-400">Loading PDF Page Slice...</p>
              <p className="text-xs text-slate-400">Extracting raw text & page thumbnails directly from browser IndexedDB...</p>
            </div>
          ) : !pdfSlice ? (
            <div className="p-8 text-center space-y-2 my-auto text-rose-400">
              <AlertCircle className="w-8 h-8 mx-auto" />
              <p className="text-xs font-bold">Failed to load PDF page slice preview.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden flex flex-col space-y-4 min-h-0">
              {/* Summary Metrics Bar */}
              <div className={`p-3.5 rounded-2xl border flex items-center justify-between flex-wrap gap-2 text-xs shrink-0 ${
                isDark ? 'neu-pressed-dark border-slate-800' : 'neu-pressed-light border-slate-200'
              }`}>
                <div className="flex items-center gap-3">
                  <span className="font-black text-amber-400">
                    📄 Pages {pdfSlice.effStart} to {pdfSlice.effEnd}
                  </span>
                  <span className="text-slate-400 font-bold">
                    ({pdfSlice.pageCount} {pdfSlice.pageCount === 1 ? 'Page' : 'Pages'} Total)
                  </span>
                </div>

                <div className="flex items-center gap-3 text-[11px]">
                  <span className={`px-2 py-0.5 rounded-md font-mono font-bold ${
                    pdfSlice.isScannedPdf ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {pdfSlice.isScannedPdf ? '📷 Scanned Page Images' : '📝 Text Extracted'}
                  </span>
                  <span className="text-slate-400 font-mono">
                    Payload: {pdfSlice.totalPayloadSizeMb} MB
                  </span>
                </div>
              </div>

              {/* Tab Selector */}
              <div className="flex items-center gap-2 shrink-0 border-b border-slate-700/40 pb-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('text')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border transition flex items-center gap-1.5 ${
                    activeTab === 'text'
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                      : isDark ? 'neu-btn-dark text-slate-400 border-slate-700' : 'neu-btn-light text-slate-600 border-slate-300'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Text Stream ({textPages.length} Pgs)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('images')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border transition flex items-center gap-1.5 ${
                    activeTab === 'images'
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                      : isDark ? 'neu-btn-dark text-slate-400 border-slate-700' : 'neu-btn-light text-slate-600 border-slate-300'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Page Images ({pdfSlice.pageImages?.length || 0})</span>
                </button>
              </div>

              {/* Tab Body */}
              <div
                onWheel={(e) => e.stopPropagation()}
                className="flex-1 overflow-y-auto pr-1 space-y-3 overscroll-contain touch-pan-y min-h-0 transform-gpu"
              >
                {activeTab === 'text' ? (
                  textPages.length > 0 ? (
                    textPages.map((pageObj, idx) => (
                      <div
                        key={idx}
                        className={`p-4 rounded-2xl border space-y-2 text-xs ${
                          isDark ? 'neu-card-dark border-slate-800' : 'neu-card-light border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                          <span className="font-mono font-black text-amber-400 text-[11px]">
                            PAGE {pageObj.pageNumber}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {pageObj.text.length} characters
                          </span>
                        </div>
                        <pre className={`whitespace-pre-wrap font-sans text-xs leading-relaxed ${
                          isDark ? 'text-slate-300' : 'text-slate-800'
                        }`}>
                          {pageObj.text || '(No text extracted from this page; scanned page image attached below.)'}
                        </pre>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs italic text-slate-400 text-center py-6">No raw text extracted. PDF may contain scanned images.</p>
                  )
                ) : (
                  pdfSlice.pageImages && pdfSlice.pageImages.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {pdfSlice.pageImages.map((imgObj, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-2xl border space-y-2 ${
                            isDark ? 'neu-card-dark border-slate-800' : 'neu-card-light border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] font-mono font-black text-amber-400">
                            <span>PAGE {imgObj.pageNumber}</span>
                            <span className="text-[10px] text-slate-500 font-normal">Rendered JPEG</span>
                          </div>
                          <div className="rounded-xl overflow-hidden border border-slate-700/50 bg-black/40">
                            <img
                              src={`data:image/jpeg;base64,${imgObj.base64}`}
                              alt={`Page ${imgObj.pageNumber}`}
                              className="w-full h-auto max-h-72 object-contain mx-auto"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs italic text-slate-400 text-center py-6">No page images rendered.</p>
                  )
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700/40 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition ${
                    isDark ? 'neu-btn-dark text-slate-400 border-slate-700' : 'neu-btn-light text-slate-600 border-slate-300'
                  }`}
                >
                  Close Preview
                </button>

                {typeof onConfirmGenerate === 'function' && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onConfirmGenerate();
                    }}
                    className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Confirm & Generate AI Mindmap</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
