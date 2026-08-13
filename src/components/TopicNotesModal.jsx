import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Bold, Italic, Underline, Strikethrough, List, ListOrdered, 
  AlignLeft, AlignCenter, AlignRight, AlignJustify, RemoveFormatting, 
  Save, FileText, Highlighter, Check
} from 'lucide-react';

export default function TopicNotesModal({
  isOpen,
  onClose,
  topic,
  onSaveNotes,
  themeMode = 'dark'
}) {
  const isDark = themeMode === 'dark';
  const editorRef = useRef(null);
  const [notesHtml, setNotesHtml] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  // Sync content when topic changes or modal opens
  useEffect(() => {
    if (isOpen && topic) {
      const initialNotes = topic.notes || '';
      setNotesHtml(initialNotes);
      if (editorRef.current) {
        editorRef.current.innerHTML = initialNotes;
      }
    }
  }, [isOpen, topic]);

  if (!isOpen || !topic) return null;

  const handleExecuteCommand = (command, value = null) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    if (editorRef.current) {
      setNotesHtml(editorRef.current.innerHTML);
    }
  };

  const handleInput = () => {
    if (editorRef.current) {
      setNotesHtml(editorRef.current.innerHTML);
      setIsSaved(false);
    }
  };

  const handleSave = () => {
    const finalHtml = editorRef.current ? editorRef.current.innerHTML : notesHtml;
    if (onSaveNotes && topic) {
      onSaveNotes(topic.subject, topic.name, finalHtml);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    }
  };

  const handleClose = () => {
    // Auto-save on exit if modified
    const currentHtml = editorRef.current ? editorRef.current.innerHTML : notesHtml;
    if (currentHtml !== (topic.notes || '')) {
      if (onSaveNotes && topic) {
        onSaveNotes(topic.subject, topic.name, currentHtml);
      }
    }
    onClose();
  };

  const toolbarButtons = [
    { label: 'Bold', icon: Bold, cmd: 'bold', title: 'Bold (Ctrl+B)' },
    { label: 'Italic', icon: Italic, cmd: 'italic', title: 'Italic (Ctrl+I)' },
    { label: 'Underline', icon: Underline, cmd: 'underline', title: 'Underline (Ctrl+U)' },
    { label: 'Strike', icon: Strikethrough, cmd: 'strikeThrough', title: 'Strikethrough' },
    { type: 'separator' },
    { label: 'Bullet List', icon: List, cmd: 'insertUnorderedList', title: 'Bullet List' },
    { label: 'Numbered List', icon: ListOrdered, cmd: 'insertOrderedList', title: 'Numbered List' },
    { type: 'separator' },
    { label: 'Align Left', icon: AlignLeft, cmd: 'justifyLeft', title: 'Align Left' },
    { label: 'Align Center', icon: AlignCenter, cmd: 'justifyCenter', title: 'Align Center' },
    { label: 'Align Right', icon: AlignRight, cmd: 'justifyRight', title: 'Align Right' },
    { label: 'Align Justify', icon: AlignJustify, cmd: 'justifyFull', title: 'Align Justify' },
    { type: 'separator' },
    { label: 'Highlight', icon: Highlighter, cmd: 'backColor', value: isDark ? '#3b82f640' : '#fef08a', title: 'High-Yield Highlight' },
    { label: 'Clear', icon: RemoveFormatting, cmd: 'removeFormat', title: 'Clear Formatting' }
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className={`w-full max-w-3xl rounded-3xl p-6 shadow-2xl border overflow-hidden flex flex-col max-h-[85vh] ${
            isDark ? 'bg-[#222730] border-slate-700/80 text-white neu-card-dark' : 'bg-[#e6ecf5] border-slate-300 text-slate-900 neu-card-light'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-700/40 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`p-2.5 rounded-2xl ${isDark ? 'neu-pressed-dark text-blue-400' : 'bg-blue-100 text-blue-600'}`}>
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                    isDark ? 'bg-slate-800 text-indigo-300 border border-slate-700' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  }`}>
                    {topic.subject}
                  </span>
                  {topic.page && (
                    <span className={`text-[10px] font-mono font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      p. {topic.page}{topic.endPage ? `–${topic.endPage}` : ''}
                    </span>
                  )}
                </div>
                <h3 className="text-base sm:text-lg font-black tracking-tight truncate mt-0.5">
                  Notes: {topic.name}
                </h3>
              </div>
            </div>

            <button
              onClick={handleClose}
              className={`p-2 rounded-2xl transition cursor-pointer ${
                isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200 text-slate-600'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Formatting Toolbar */}
          <div className={`my-3 p-2 rounded-2xl border flex items-center gap-1 flex-wrap shrink-0 ${
            isDark ? 'neu-pressed-dark border-slate-800/80 bg-slate-900/60' : 'neu-pressed-light border-slate-200/80 bg-slate-100/70'
          }`}>
            {toolbarButtons.map((btn, idx) => {
              if (btn.type === 'separator') {
                return (
                  <div key={idx} className={`h-5 w-[1px] mx-1 ${isDark ? 'bg-slate-700/60' : 'bg-slate-300'}`} />
                );
              }
              const IconComp = btn.icon;
              return (
                <button
                  key={idx}
                  type="button"
                  title={btn.title}
                  onClick={() => handleExecuteCommand(btn.cmd, btn.value)}
                  className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center ${
                    isDark
                      ? 'hover:bg-slate-800 text-slate-300 hover:text-white active:scale-95'
                      : 'hover:bg-slate-200 text-slate-700 hover:text-slate-900 active:scale-95'
                  }`}
                >
                  <IconComp className="w-4 h-4" />
                </button>
              );
            })}
          </div>

          {/* Rich Text Editor Content Area */}
          <div className="flex-grow min-h-0 relative flex flex-col my-1">
            <div
              ref={editorRef}
              contentEditable
              onInput={handleInput}
              style={{ minHeight: '220px' }}
              className={`w-full h-full p-4 rounded-2xl outline-none overflow-y-auto custom-scrollbar leading-relaxed font-sans transition text-sm ${
                isDark
                  ? 'neu-pressed-dark text-slate-100 border border-slate-800/80 focus:border-blue-500/50'
                  : 'neu-pressed-light text-slate-900 border border-slate-200 focus:border-blue-400'
              }`}
            />
            {(!notesHtml || notesHtml === '<br>') && (
              <div className={`absolute top-4 left-4 pointer-events-none text-xs font-medium select-none ${
                isDark ? 'text-slate-500' : 'text-slate-400'
              }`}>
                Type your high-yield clinical notes, mnemonics, or textbook summaries here... (Use Bold, Italics, Lists, or Highlighter)
              </div>
            )}
          </div>

          {/* Footer Action Bar */}
          <div className="pt-4 border-t border-slate-700/40 flex items-center justify-between shrink-0 mt-2">
            <span className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              💡 Press Enter for new line • Ctrl+B for bold • Ctrl+I for italic
            </span>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleClose}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  isDark ? 'neu-pressed-dark text-slate-400 hover:text-white' : 'neu-pressed-light text-slate-600 hover:text-slate-900'
                }`}
              >
                Close
              </button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.96 }}
                type="button"
                onClick={handleSave}
                className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer transition shadow-md ${
                  isSaved
                    ? 'bg-emerald-600 text-white'
                    : isDark ? 'neu-btn-dark text-blue-400 hover:text-blue-300' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20'
                }`}
              >
                {isSaved ? (
                  <>
                    <Check className="w-4 h-4" /> Saved!
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" /> Save Notes
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
