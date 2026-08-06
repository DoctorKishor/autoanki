import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Plus, Layers, Image as ImageIcon, Folder, Tag, Save, ChevronDown,
  BookOpen, Edit3, Scissors, RefreshCw, Check, AlertCircle
} from 'lucide-react';

// Helpers
function nextClozeOrdinal(text) {
  const matches = [...(text || '').matchAll(/\{\{c(\d+)::/g)];
  if (matches.length === 0) return 1;
  const max = Math.max(...matches.map(m => parseInt(m[1], 10)));
  return max + 1;
}

const clamp1000 = v => Math.max(0, Math.min(1000, Math.round(v)));

// CropOverlay Component
function CropOverlay({ imageSrc, imgBox, onChange }) {
  const containerRef = useRef(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragHandle = useRef(null);
  const boxRef = useRef(imgBox);

  useEffect(() => { boxRef.current = imgBox; }, [imgBox]);

  const getPct = useCallback((e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clamp1000(((clientX - rect.left) / rect.width) * 1000),
      y: clamp1000(((clientY - rect.top) / rect.height) * 1000),
    };
  }, []);

  const onMouseMove = useCallback((e) => {
    if (!isDragging.current) return;
    if (e.cancelable) e.preventDefault();
    const cur = getPct(e);
    const dx = cur.x - dragStart.current.x;
    const dy = cur.y - dragStart.current.y;
    dragStart.current = cur;
    const b = { ...boxRef.current };
    const h = dragHandle.current;
    if (h === 'move') {
      const w = b.xmax - b.xmin;
      const ht = b.ymax - b.ymin;
      b.xmin = clamp1000(b.xmin + dx);
      b.xmax = clamp1000(b.xmin + w);
      b.ymin = clamp1000(b.ymin + dy);
      b.ymax = clamp1000(b.ymin + ht);
    } else {
      if (h.includes('e')) b.xmax = clamp1000(Math.max(b.xmin + 20, b.xmax + dx));
      if (h.includes('w')) b.xmin = clamp1000(Math.min(b.xmax - 20, b.xmin + dx));
      if (h.includes('s')) b.ymax = clamp1000(Math.max(b.ymin + 20, b.ymax + dy));
      if (h.includes('n')) b.ymin = clamp1000(Math.min(b.ymax - 20, b.ymin + dy));
    }
    boxRef.current = b;
    onChange(b);
  }, [getPct, onChange]);

  const onMouseUp = useCallback(() => {
    isDragging.current = false;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('touchmove', onMouseMove);
    window.removeEventListener('touchend', onMouseUp);
  }, [onMouseMove]);

  const onMouseDown = useCallback((e, handle) => {
    e.preventDefault();
    isDragging.current = true;
    dragHandle.current = handle;
    dragStart.current = getPct(e);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onMouseMove, { passive: false });
    window.addEventListener('touchend', onMouseUp);
  }, [getPct, onMouseMove, onMouseUp]);

  if (!imageSrc) return null;

  const { xmin, ymin, xmax, ymax } = imgBox;
  const left = `${xmin / 10}%`;
  const top  = `${ymin / 10}%`;
  const w    = `${(xmax - xmin) / 10}%`;
  const h    = `${(ymax - ymin) / 10}%`;
  const handleStyle = 'absolute w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-lg cursor-pointer z-10 -translate-x-1/2 -translate-y-1/2';

  return (
    <div ref={containerRef} className="relative w-full select-none overflow-hidden rounded-xl" style={{ touchAction: 'none' }}>
      <img src={imageSrc} alt="source" className="w-full h-auto block rounded-xl" draggable={false} />
      <div
        className="absolute border-2 border-blue-400 cursor-move"
        style={{ left, top, width: w, height: h }}
        onMouseDown={e => onMouseDown(e, 'move')}
        onTouchStart={e => onMouseDown(e, 'move')}
      >
        {[
          { pos: { top: '0%',   left: '0%'   }, handle: 'nw', cursor: 'nw-resize' },
          { pos: { top: '0%',   left: '100%' }, handle: 'ne', cursor: 'ne-resize' },
          { pos: { top: '100%', left: '0%'   }, handle: 'sw', cursor: 'sw-resize' },
          { pos: { top: '100%', left: '100%' }, handle: 'se', cursor: 'se-resize' },
        ].map(({ pos, handle, cursor }) => (
          <div
            key={handle}
            className={handleStyle}
            style={{ ...pos, cursor }}
            onMouseDown={e => { e.stopPropagation(); onMouseDown(e, handle); }}
            onTouchStart={e => { e.stopPropagation(); onMouseDown(e, handle); }}
          />
        ))}
      </div>
      <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[9px] font-mono px-2 py-1 rounded-lg backdrop-blur-sm pointer-events-none">
        [{Math.round(xmin)},{Math.round(ymin)}] - [{Math.round(xmax)},{Math.round(ymax)}]
      </div>
    </div>
  );
}

export default function ManualCardModal({
  isOpen,
  onClose,
  onSave,
  themeMode,
  defaultDeck = '',
  deckPaths = [],
  libraryPages = [],
  initialCard = null,
}) {
  const EMPTY = {
    type: 'Basic',
    deck: defaultDeck,
    front: '',
    back: '',
    text: '',
    tags: [],
    pageId: '',
    imgBox: { ymin: 100, xmin: 100, ymax: 700, xmax: 900 },
    isManual: true,
    source: 'manual',
  };

  const [form, setForm] = useState(EMPTY);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const clozeRef = useRef(null);

  const dark = themeMode === 'dark';
  const isEdit = Boolean(initialCard?.id);

  useEffect(() => {
    if (isOpen) {
      if (initialCard) {
        setForm({
          ...EMPTY,
          ...initialCard,
          imgBox: initialCard.imgBox || {
            ymin: initialCard.ymin ?? 100,
            xmin: initialCard.xmin ?? 100,
            ymax: initialCard.ymax ?? 700,
            xmax: initialCard.xmax ?? 900,
          },
          pageId: initialCard.pageId || '',
          isManual: true,
          source: 'manual',
        });
      } else {
        setForm({ ...EMPTY, deck: defaultDeck });
      }
      setErrors({});
      setTagInput('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultDeck]);

  const linkedPage = libraryPages.find(p => p.id === form.pageId);
  const linkedImageSrc = linkedPage ? (linkedPage.imageUrl || linkedPage.base64) : null;

  const validate = () => {
    const e = {};
    if (!form.deck.trim()) e.deck = 'Target deck is required.';
    if (form.type === 'Cloze' && !form.text.trim()) e.text = 'Cloze content is required.';
    if (form.type === 'Basic' && !form.front.trim()) e.front = 'Front is required.';
    if (form.type === 'Basic' && !form.back.trim()) e.back = 'Back is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        ...(form.pageId ? {
          ymin: form.imgBox.ymin,
          xmin: form.imgBox.xmin,
          ymax: form.imgBox.ymax,
          xmax: form.imgBox.xmax,
        } : {}),
      };
      await onSave(payload);
      onClose();
    } catch (err) {
      console.error('[ManualCardModal] save failed', err);
    } finally {
      setSaving(false);
    }
  };

  const handleInsertCloze = () => {
    const textarea = clozeRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = form.text || '';
    const selected = currentText.slice(start, end);
    if (!selected.trim()) return;
    const n = nextClozeOrdinal(currentText);
    const wrapped = `{{c${n}::${selected}}}`;
    const newText = currentText.slice(0, start) + wrapped + currentText.slice(end);
    setForm(f => ({ ...f, text: newText }));
    setTimeout(() => {
      textarea.focus();
      const newPos = start + wrapped.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const addTag = (val) => {
    const cleaned = val.trim().replace(/^#+/, '');
    if (!cleaned) return;
    if (!form.tags.includes(cleaned)) {
      setForm(f => ({ ...f, tags: [...f.tags, cleaned] }));
    }
    setTagInput('');
  };

  const removeTag = (tag) => setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }));

  const inp = `w-full p-3 rounded-xl outline-none text-xs font-mono transition ${dark ? 'neu-pressed-dark text-white border border-gray-800' : 'neu-pressed-light text-gray-800 border border-gray-200'}`;
  const lbl = `block text-[10px] font-black uppercase tracking-widest mb-1.5 ${dark ? 'text-gray-400' : 'text-gray-500'}`;
  const errTxt = 'text-red-500 text-[10px] mt-1 font-bold';

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="manual-card-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[300]"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          key="manual-card-panel"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className={`${dark ? 'neu-card-dark text-white border border-gray-800' : 'neu-card-light text-gray-900 border border-white'} rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]`}
        >
          {/* Header */}
          <div className={`px-6 py-5 border-b flex items-center justify-between shrink-0 ${dark ? 'border-gray-800' : 'border-gray-200/60'}`}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-purple-500/15 rounded-xl flex items-center justify-center">
                <Edit3 className="w-4 h-4 text-purple-500" />
              </div>
              <div>
                <h3 className={`font-black uppercase tracking-widest text-xs ${dark ? 'text-white' : 'text-gray-900'}`}>
                  {isEdit ? 'Edit Card' : 'Create Manual Flashcard'}
                </h3>
                <p className={`text-[10px] mt-0.5 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Saved directly to your local library
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-wider bg-purple-500/15 text-purple-500 border border-purple-500/25 px-2.5 py-1 rounded-full">
                Manual
              </span>
              <button onClick={onClose} className={`p-1.5 rounded-xl transition ${dark ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 overflow-y-auto flex-grow space-y-5" style={{ scrollbarWidth: 'none' }}>

            {/* Card Type */}
            <div>
              <label className={lbl}>Card Type</label>
              <div className="flex gap-2">
                {['Basic', 'Cloze'].map(type => (
                  <button
                    key={type}
                    onClick={() => setForm(f => ({ ...f, type }))}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition border flex items-center justify-center gap-1.5 ${
                      form.type === type
                        ? type === 'Basic'
                          ? 'bg-red-500 text-white border-red-500 shadow-md shadow-red-500/20'
                          : 'bg-blue-500 text-white border-blue-500 shadow-md shadow-blue-500/20'
                        : dark
                          ? 'neu-btn-dark text-gray-300 border-gray-700'
                          : 'neu-btn-light text-gray-600 border-gray-200'
                    }`}
                  >
                    {type === 'Basic' ? <BookOpen className="w-3.5 h-3.5" /> : <Scissors className="w-3.5 h-3.5" />}
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Target Deck */}
            <div>
              <label className={lbl}>
                <Folder className="w-3 h-3 inline mr-1" />Target Deck / Folder
              </label>
              <div className="relative">
                <input
                  list="deck-datalist-manual"
                  value={form.deck}
                  onChange={e => { setForm(f => ({ ...f, deck: e.target.value })); setErrors(er => ({ ...er, deck: '' })); }}
                  placeholder="e.g. Cerebellum or Cerebellum::Anatomy"
                  className={`${inp} pr-8`}
                />
                <datalist id="deck-datalist-manual">
                  {deckPaths.map(d => <option key={d} value={d} />)}
                </datalist>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
              {errors.deck && <p className={errTxt}><AlertCircle className="w-3 h-3 inline mr-1" />{errors.deck}</p>}
            </div>

            {/* Card Content */}
            {form.type === 'Cloze' ? (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={`${lbl} mb-0`}>
                    <Scissors className="w-3 h-3 inline mr-1" />Cloze Content
                  </label>
                  <button
                    onClick={handleInsertCloze}
                    title="Highlight text then click to wrap in {{c1::...}}"
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition ${
                      dark ? 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/30'
                           : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'
                    }`}
                  >
                    <Scissors className="w-3 h-3" />
                    {'Cloze {c1::...}'}
                  </button>
                </div>
                <textarea
                  ref={clozeRef}
                  rows={6}
                  value={form.text}
                  onChange={e => { setForm(f => ({ ...f, text: e.target.value })); setErrors(er => ({ ...er, text: '' })); }}
                  placeholder="Type content here, highlight a word/phrase and click Cloze button to insert deletion markers..."
                  className={`${inp} leading-relaxed resize-y`}
                />
                {errors.text && <p className={errTxt}><AlertCircle className="w-3 h-3 inline mr-1" />{errors.text}</p>}
                <p className={`text-[9px] mt-1.5 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                  {'Tip: Highlight text then click Cloze to wrap as {{c1::...}}. Each click increments the ordinal (c1, c2, c3...).'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className={lbl}>Front (Question)</label>
                  <textarea
                    rows={3}
                    value={form.front}
                    onChange={e => { setForm(f => ({ ...f, front: e.target.value })); setErrors(er => ({ ...er, front: '' })); }}
                    placeholder="What is the question?"
                    className={`${inp} font-bold resize-y`}
                  />
                  {errors.front && <p className={errTxt}><AlertCircle className="w-3 h-3 inline mr-1" />{errors.front}</p>}
                </div>
                <div>
                  <label className={lbl}>Back (Answer)</label>
                  <textarea
                    rows={3}
                    value={form.back}
                    onChange={e => { setForm(f => ({ ...f, back: e.target.value })); setErrors(er => ({ ...er, back: '' })); }}
                    placeholder="The answer..."
                    className={`${inp} resize-y`}
                  />
                  {errors.back && <p className={errTxt}><AlertCircle className="w-3 h-3 inline mr-1" />{errors.back}</p>}
                </div>
              </div>
            )}

            {/* Link to Page */}
            <div className={`rounded-2xl p-4 border space-y-3 ${dark ? 'border-gray-800 bg-white/3' : 'border-gray-200/60 bg-gray-50/60'}`}>
              <div className="flex items-center justify-between">
                <label className={`${lbl} mb-0 flex items-center gap-1.5`}>
                  <ImageIcon className="w-3 h-3 text-emerald-500" />
                  Link to Note Page
                  <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${dark ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500'}`}>optional</span>
                </label>
                {form.pageId && (
                  <button
                    onClick={() => setForm(f => ({ ...f, pageId: '' }))}
                    className={`text-[10px] font-bold flex items-center gap-1 ${dark ? 'text-red-400 hover:text-red-300' : 'text-red-500 hover:text-red-700'}`}
                  >
                    <X className="w-3 h-3" />Unlink
                  </button>
                )}
              </div>
              <div className="relative">
                <select
                  value={form.pageId}
                  onChange={e => setForm(f => ({ ...f, pageId: e.target.value }))}
                  className={`${inp} appearance-none pr-8`}
                >
                  <option value="">— No page linked —</option>
                  {libraryPages.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.fileName || p.id}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>

              <AnimatePresence>
                {form.pageId && linkedImageSrc && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <p className={`text-[10px] font-black uppercase tracking-wider ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Set Image Crop Region
                      </p>
                      <button
                        onClick={() => setForm(f => ({ ...f, imgBox: { ymin: 100, xmin: 100, ymax: 700, xmax: 900 } }))}
                        className={`flex items-center gap-1 text-[10px] font-bold ${dark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-500 hover:text-blue-700'}`}
                      >
                        <RefreshCw className="w-3 h-3" />Reset
                      </button>
                    </div>
                    <p className={`text-[9px] ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                      Drag the box or handles to define the crop area exported with this card.
                    </p>
                    <CropOverlay
                      imageSrc={linkedImageSrc}
                      imgBox={form.imgBox}
                      onChange={imgBox => setForm(f => ({ ...f, imgBox }))}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {form.pageId && !linkedImageSrc && (
                <p className={`text-[10px] ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                  This page has no image preview but the card will be linked by ID.
                </p>
              )}
            </div>

            {/* Tags */}
            <div>
              <label className={lbl}>
                <Tag className="w-3 h-3 inline mr-1" />Tags
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {form.tags.map(tag => {
                  const display = tag.startsWith('#') ? tag : `#${tag}`;
                  return (
                    <span key={tag} className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full font-bold ${dark ? 'neu-pressed-dark text-blue-400 border border-blue-500/30' : 'neu-pressed-light text-blue-600 border border-blue-100'}`}>
                      {display}
                      <button onClick={() => removeTag(tag)} className="hover:text-red-400 transition">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
              <input
                type="text"
                value={tagInput}
                placeholder="Add tag (press Enter or comma)..."
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                className={inp}
              />
            </div>
          </div>

          {/* Footer */}
          <div className={`px-6 py-5 border-t flex justify-between items-center gap-4 shrink-0 ${dark ? 'border-gray-800' : 'border-gray-200/60'}`}>
            <button
              onClick={onClose}
              className={`px-6 py-2.5 text-xs font-bold rounded-2xl transition ${dark ? 'neu-btn-dark text-gray-300' : 'neu-btn-light text-gray-600'}`}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`flex items-center gap-2 px-8 py-2.5 text-xs font-black uppercase tracking-wider rounded-2xl transition disabled:opacity-60 ${dark ? 'neu-btn-accent-dark' : 'neu-btn-accent-light'}`}
            >
              {saving
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span>Saving...</span></>
                : <><Save className="w-3.5 h-3.5" /><span>{isEdit ? 'Update Card' : 'Create Card'}</span></>
              }
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
