import RichInputField from './RichInputField';
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Plus, Layers, Image as ImageIcon, Folder, Tag, Save, ChevronDown,
  BookOpen, Edit3, Scissors, RefreshCw, Check, AlertCircle, Upload, FileImage,
  Clipboard, Layout, Minimize2, Maximize2, Sparkles, Trash2
} from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
function nextClozeOrdinal(text) {
  const matches = [...(text || '').matchAll(/\{\{c(\d+)::/g)];
  if (matches.length === 0) return 1;
  const max = Math.max(...matches.map(m => parseInt(m[1], 10)));
  return max + 1;
}

// ──────────────────────────────────────────────────────────────────────────────
// NeumorphicSelect Component (Custom Neumorphic Dropdown)
// ──────────────────────────────────────────────────────────────────────────────
function NeumorphicSelect({
  value,
  onChange,
  options = [],
  themeMode = 'light',
  placeholder = 'Select option...',
  icon: IconComponent,
  allowCustomInput = false,
  customInputPlaceholder = 'Type custom path...'
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customVal, setCustomVal] = useState('');
  const ref = useRef(null);
  const dark = themeMode === 'dark';

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(o => String(o.value) === String(value));

  return (
    <div ref={ref} className="relative w-full text-left">
      {isCustomMode ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={customVal}
            onChange={e => setCustomVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (customVal.trim()) {
                  onChange(customVal.trim());
                  setIsCustomMode(false);
                }
              }
            }}
            placeholder={customInputPlaceholder}
            autoFocus
            className={`w-full p-2.5 rounded-xl text-xs font-mono font-bold outline-none border transition ${
              dark ? 'neu-pressed-dark text-white border-blue-500/50' : 'neu-pressed-light text-gray-800 border-blue-400'
            }`}
          />
          <button
            type="button"
            onClick={() => {
              if (customVal.trim()) onChange(customVal.trim());
              setIsCustomMode(false);
            }}
            className="px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shrink-0 hover:bg-blue-700 transition"
          >
            Done
          </button>
          <button
            type="button"
            onClick={() => setIsCustomMode(false)}
            className={`px-2.5 py-2 rounded-xl text-xs font-bold shrink-0 transition ${
              dark ? 'neu-btn-dark text-gray-400' : 'neu-btn-light text-gray-500'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full p-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all cursor-pointer border ${
            dark
              ? 'neu-pressed-dark text-white border-gray-800 hover:border-gray-700'
              : 'neu-pressed-light text-gray-800 border border-gray-200/80 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-2 truncate pr-2">
            {IconComponent && <IconComponent className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
            <span className="truncate">
              {selectedOption ? selectedOption.label : (value || placeholder)}
            </span>
          </div>
          <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-500' : (dark ? 'text-gray-400' : 'text-gray-500')}`} />
        </button>
      )}

      {isOpen && !isCustomMode && (
        <div
          className={`absolute left-0 right-0 top-full mt-1.5 z-50 p-1.5 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
            dark
              ? 'neu-card-dark border border-gray-800 bg-[#1e232d]/98 backdrop-blur-md'
              : 'neu-card-light border border-gray-200 bg-white/98 backdrop-blur-md'
          }`}
        >
          <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1" style={{ scrollbarWidth: 'none' }}>
            {options.map((opt) => {
              const isSelected = String(opt.value) === String(value);
              return (
                <button
                  key={opt.value || opt.label}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition ${
                    isSelected
                      ? (dark ? 'neu-pressed-dark text-blue-400' : 'neu-pressed-light text-blue-600')
                      : (dark ? 'hover:bg-gray-800/60 text-gray-300' : 'hover:bg-gray-100 text-gray-700')
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {opt.icon && <opt.icon className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                    <span className="truncate">{opt.label}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-blue-500 shrink-0 ml-2" />}
                </button>
              );
            })}

            {allowCustomInput && (
              <button
                type="button"
                onClick={() => {
                  setCustomVal('');
                  setIsCustomMode(true);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition text-blue-500 ${
                  dark ? 'hover:bg-blue-500/10' : 'hover:bg-blue-50'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Create Custom Folder Path...</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Robust 1:1 Zero-Drift Image Crop Overlay Component
// ──────────────────────────────────────────────────────────────────────────────
function CropOverlay({ imageSrc, imgBox, onChange }) {
  const containerRef = useRef(null);
  const isDragging = useRef(false);
  const dragHandle = useRef(null);
  const startMouse = useRef({ x: 0, y: 0 });
  const startBox = useRef({ xmin: 100, xmax: 900, ymin: 100, ymax: 700 });
  const containerSize = useRef({ w: 1, h: 1 });

  const onMouseMove = useCallback((e) => {
    if (!isDragging.current) return;
    if (e.cancelable) e.preventDefault();

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const deltaX = ((clientX - startMouse.current.x) / containerSize.current.w) * 1000;
    const deltaY = ((clientY - startMouse.current.y) / containerSize.current.h) * 1000;

    const sb = startBox.current;
    const handle = dragHandle.current;
    let b = { ...sb };

    if (handle === 'move') {
      const boxW = sb.xmax - sb.xmin;
      const boxH = sb.ymax - sb.ymin;

      let newXmin = Math.max(0, Math.min(1000 - boxW, sb.xmin + deltaX));
      let newYmin = Math.max(0, Math.min(1000 - boxH, sb.ymin + deltaY));

      b = {
        xmin: Math.round(newXmin),
        ymin: Math.round(newYmin),
        xmax: Math.round(newXmin + boxW),
        ymax: Math.round(newYmin + boxH),
      };
    } else {
      const MIN_SIZE = 40;
      if (handle.includes('w')) {
        b.xmin = Math.round(Math.max(0, Math.min(sb.xmax - MIN_SIZE, sb.xmin + deltaX)));
      }
      if (handle.includes('e')) {
        b.xmax = Math.round(Math.min(1000, Math.max(sb.xmin + MIN_SIZE, sb.xmax + deltaX)));
      }
      if (handle.includes('n')) {
        b.ymin = Math.round(Math.max(0, Math.min(sb.ymax - MIN_SIZE, sb.ymin + deltaY)));
      }
      if (handle.includes('s')) {
        b.ymax = Math.round(Math.min(1000, Math.max(sb.ymin + MIN_SIZE, sb.ymax + deltaY)));
      }
    }

    onChange(b);
  }, [onChange]);

  const onMouseUp = useCallback(() => {
    isDragging.current = false;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('touchmove', onMouseMove);
    window.removeEventListener('touchend', onMouseUp);
  }, [onMouseMove]);

  const onMouseDown = useCallback((e, handle) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    isDragging.current = true;
    dragHandle.current = handle;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    startMouse.current = { x: clientX, y: clientY };
    startBox.current = { ...imgBox };
    containerSize.current = { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onMouseMove, { passive: false });
    window.addEventListener('touchend', onMouseUp);
  }, [imgBox, onMouseMove, onMouseUp]);

  if (!imageSrc) return null;

  const { xmin, ymin, xmax, ymax } = imgBox;
  const left = `${xmin / 10}%`;
  const top  = `${ymin / 10}%`;
  const w    = `${(xmax - xmin) / 10}%`;
  const h    = `${(ymax - ymin) / 10}%`;

  const handleStyle = 'absolute w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-xl cursor-pointer z-20 -translate-x-1/2 -translate-y-1/2 hover:scale-125 transition-transform';

  return (
    <div ref={containerRef} className="relative w-full select-none overflow-hidden rounded-2xl border border-gray-700/50 shadow-inner bg-black/80" style={{ touchAction: 'none' }}>
      <img src={imageSrc} alt="source" className="w-full h-auto block rounded-2xl opacity-90" draggable={false} />
      
      {/* Dark overlay outside crop */}
      <div className="absolute inset-0 bg-black/50 pointer-events-none" style={{
        clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${left} ${top}, ${left} calc(${top} + ${h}), calc(${left} + ${w}) calc(${top} + ${h}), calc(${left} + ${w}) ${top}, ${left} ${top})`
      }} />

      {/* Crop Box */}
      <div
        className="absolute border-2 border-blue-400 bg-blue-500/10 cursor-move shadow-[0_0_15px_rgba(59,130,246,0.3)]"
        style={{ left, top, width: w, height: h }}
        onMouseDown={e => onMouseDown(e, 'move')}
        onTouchStart={e => onMouseDown(e, 'move')}
      >
        {/* Grid lines */}
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40">
          {[...Array(9)].map((_, i) => <div key={i} className="border border-blue-200/50" />)}
        </div>

        {/* Resize Handles */}
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
            onMouseDown={e => onMouseDown(e, handle)}
            onTouchStart={e => onMouseDown(e, handle)}
          />
        ))}
      </div>

      <div className="absolute bottom-2.5 right-2.5 bg-black/80 text-white text-[9px] font-mono px-2.5 py-1 rounded-lg backdrop-blur-md border border-white/10 pointer-events-none shadow-md">
        Crop: [${Math.round(xmin)},${Math.round(ymin)}] → [${Math.round(xmax)},${Math.round(ymax)}]
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main ManualCardModal Component
// ──────────────────────────────────────────────────────────────────────────────
export default function ManualCardModal({
  isOpen,
  onClose,
  onSave,
  themeMode = 'light',
  defaultDeck = '',
  deckPaths = [],
  libraryPages = [],
  initialCard = null,
}) {
  const EMPTY = {
    type: 'Basic',
    deck: defaultDeck || (deckPaths[0] || 'General'),
    front: '',
    back: '',
    text: '',
    tags: [],
    pageId: '',
    customImage: null,
    imageSide: 'back',
    has_image: false,
    include_image: false,
    imgBox: { ymin: 100, xmin: 100, ymax: 700, xmax: 900 },
    isManual: true,
    source: 'manual',
  };

  const [form, setForm] = useState(EMPTY);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  const dragCounterRef = useRef(0);
  const prevIsOpenRef = useRef(false);
  const clozeRef = useRef(null);
  const fileInputRef = useRef(null);

  const dark = themeMode === 'dark';
  const isEdit = Boolean(initialCard?.id);

  // Initialize form state ONLY when modal transitions from closed to open
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      if (initialCard) {
        const hasImg = Boolean(initialCard.pageId || initialCard.imageUrl || initialCard.base64 || initialCard.customImage || initialCard.has_image);
        setForm({
          ...EMPTY,
          ...sanitizedInit,
          imageSide: initialCard.imageSide || initialCard.imageLocation || 'back',
          imgBox: initialCard.imgBox || {
            ymin: initialCard.ymin ?? 100,
            xmin: initialCard.xmin ?? 100,
            ymax: initialCard.ymax ?? 700,
            xmax: initialCard.xmax ?? 900,
          },
          pageId: initialCard.pageId || (initialCard.customImage ? 'custom_upload' : ''),
          customImage: initialCard.customImage || initialCard.imageUrl || initialCard.base64 || null,
          has_image: hasImg,
          include_image: hasImg,
          isManual: true,
          source: 'manual',
        });
      } else {
        setForm({ ...EMPTY, deck: defaultDeck || (deckPaths[0] || 'General') });
      }
      setErrors({});
      setTagInput('');
      setIsDraggingOver(false);
      setConflictModalOpen(false);
      setIsMinimized(false);
      dragCounterRef.current = 0;
    }
    prevIsOpenRef.current = isOpen;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialCard]);

  // Helpers for inline field images
  const extractEmbeddedImages = (fieldHtml) => {
    if (!fieldHtml || typeof fieldHtml !== 'string') return [];
    const regex = /<img[^>]+src=["'](data:image\/[^"']+|blob:[^"']+)["'][^>]*>/gi;
    const matches = [];
    let m;
    while ((m = regex.exec(fieldHtml)) !== null) {
      const srcMatch = /src=["']([^"']+)["']/i.exec(m[0]);
      if (srcMatch && srcMatch[1]) {
        matches.push({ fullTag: m[0], src: srcMatch[1] });
      }
    }
    return matches;
  };

  const removeEmbeddedImage = (fieldHtml, targetSrc, fieldName) => {
    if (!fieldHtml || typeof fieldHtml !== 'string') return;
    const updated = fieldHtml.replace(targetSrc, '');
    setForm(prev => ({
      ...prev,
      [fieldName]: updated
    }));
  };

  const handleImagePasteToField = (e, fieldName) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    let imageItem = null;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        imageItem = items[i];
        break;
      }
    }

    if (imageItem) {
      e.preventDefault();
      e.stopPropagation();
      const file = imageItem.getAsFile();
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Data = event.target.result;
        setForm(prev => {
          if (!prev) return prev;
          const currentAttached = prev.attachedImages || (prev.customImage ? [prev.customImage] : []);
          const updatedAttached = Array.from(new Set([...currentAttached, base64Data]));
          const cleanVal = (prev[fieldName] || '').replace(/<img[^>]*>/gi, '').trim();

          return {
            ...prev,
            [fieldName]: cleanVal,
            pageId: 'custom_upload',
            customImage: base64Data,
            imageUrl: base64Data,
            base64: base64Data,
            attachedImages: updatedAttached,
            has_image: true,
            include_image: true
          };
        });
        setErrors(er => ({ ...er, [fieldName]: '' }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Set image state helper
  const applyImageState = (imageSrc) => {
    if (!imageSrc) return;
    setForm(f => ({
      ...f,
      pageId: 'custom_upload',
      customImage: imageSrc,
      imageUrl: imageSrc,
      has_image: true,
      include_image: true,
      imgBox: { ymin: 100, xmin: 100, ymax: 700, xmax: 900 }
    }));
  };

  // Process Local File or Web Image URL
  const processImageFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      applyImageState(evt.target?.result);
    };
    reader.readAsDataURL(file);
  };

  const processImageSrc = (src) => {
    if (!src) return;
    if (src.startsWith('data:image')) {
      applyImageState(src);
      return;
    }
    // Attempt fetching web image to convert to Base64
    fetch(src)
      .then(res => res.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onload = (evt) => {
          if (evt.target?.result) applyImageState(evt.target.result);
        };
        reader.readAsDataURL(blob);
      })
      .catch(() => {
        // Fallback to direct URL if CORS fails
        applyImageState(src);
      });
  };

  // Process any DataTransfer object (Local Files or Web Browser Drag-and-Drop)
  const processDroppedData = (dataTransfer) => {
    if (!dataTransfer) return;

    // 1. Check local files first
    if (dataTransfer.files && dataTransfer.files.length > 0) {
      const file = dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        processImageFile(file);
        return;
      }
    }

    // 2. Check HTML data for web images dragged from other browser tabs
    const htmlData = dataTransfer.getData('text/html');
    if (htmlData) {
      try {
        const doc = new DOMParser().parseFromString(htmlData, 'text/html');
        const imgEl = doc.querySelector('img');
        if (imgEl && imgEl.src) {
          processImageSrc(imgEl.src);
          return;
        }
      } catch (err) {
        console.warn('Failed to parse dropped HTML data', err);
      }
    }

    // 3. Check URI list or plain text URL (e.g. dragging image link or URL)
    const uriData = dataTransfer.getData('text/uri-list') || dataTransfer.getData('text/plain');
    if (uriData && (uriData.startsWith('http') || uriData.startsWith('data:image'))) {
      const firstUrl = uriData.trim().split('\n')[0];
      processImageSrc(firstUrl);
      return;
    }
  };

  // Stable Non-Blinking Drag Event Handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types && e.dataTransfer.types.length > 0) {
      setIsDraggingOver(true);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);
    processDroppedData(e.dataTransfer);
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const blob = items[i].getAsFile();
        if (blob) processImageFile(blob);
        return;
      }
    }
    // Check if plain text pasted is an image URL
    const textData = e.clipboardData?.getData('text/plain');
    if (textData && (textData.startsWith('http://') || textData.startsWith('https://') || textData.startsWith('data:image/'))) {
      const trimmed = textData.trim();
      if (trimmed.match(/\.(jpeg|jpg|gif|png|webp|svg)/i) || trimmed.startsWith('data:image/')) {
        processImageSrc(trimmed);
      }
    }
  };

  // Filter note pages by selected target deck
  const folderPages = useMemo(() => {
    if (!form.deck) return libraryPages;
    return libraryPages.filter(p => p.deck === form.deck);
  }, [libraryPages, form.deck]);

  // Build deck select options
  const deckOptions = useMemo(() => {
    const set = new Set([...deckPaths, form.deck].filter(Boolean));
    return Array.from(set).map(d => ({ value: d, label: d, icon: Folder }));
  }, [deckPaths, form.deck]);

  // Build page select options (filtered by deck + Upload Own Image action)
  const pageOptions = useMemo(() => {
    const opts = [
      { value: '', label: '— No page linked —' },
      { value: '__upload_custom__', label: '📷 Upload / Drag Custom Image...', icon: Upload },
    ];
    folderPages.forEach(p => {
      opts.push({
        value: p.id,
        label: p.fileName ? `${p.fileName}` : `Page ${p.id.slice(0, 8)}`,
        icon: FileImage
      });
    });
    if (form.pageId === 'custom_upload' && form.customImage) {
      opts.splice(1, 0, { value: 'custom_upload', label: 'Custom Uploaded / Dropped Image', icon: FileImage });
    }
    return opts;
  }, [folderPages, form.pageId, form.customImage]);

  // Find linked image source
  const linkedPage = libraryPages.find(p => p.id === form.pageId);
  const linkedImageSrc = form.pageId === 'custom_upload'
    ? form.customImage
    : (linkedPage ? (linkedPage.imageUrl || linkedPage.base64) : null);

  // Handle deck change: if pageId doesn't belong to new deck, reset page link
  const handleDeckChange = (newDeck) => {
    setForm(f => {
      const isCustom = f.pageId === 'custom_upload';
      const isPageInNewDeck = libraryPages.some(p => p.id === f.pageId && p.deck === newDeck);
      return {
        ...f,
        deck: newDeck,
        pageId: (isCustom || isPageInNewDeck) ? f.pageId : ''
      };
    });
    setErrors(er => ({ ...er, deck: '' }));
  };

  // Handle Page Selection or Custom Image Upload trigger
  const handlePageSelectChange = (val) => {
    if (val === '__upload_custom__') {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
        fileInputRef.current.click();
      }
      return;
    }
    setForm(f => ({ ...f, pageId: val }));
  };

  // File Upload Handler
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
  };

  const validate = () => {
    const e = {};
    if (!form.deck || !form.deck.trim()) e.deck = 'Target deck is required.';
    
    if (form.type === 'Cloze' && !form.text.trim()) e.text = 'Cloze content is required.';
    if (form.type === 'Basic') {
      if (!form.front.trim()) e.front = 'Front (Question) is required.';
      if (!form.back.trim()) e.back = 'Back (Answer) is required.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // Trigger Save with Conflict Detection (Dual filling check)
  const handleSaveClick = () => {
    if (!validate()) return;

    const hasBasicContent = Boolean(form.front.trim() || form.back.trim());
    const hasClozeContent = Boolean(form.text.trim());

    // Dual filling conflict detected
    if (hasBasicContent && hasClozeContent) {
      setConflictModalOpen(true);
      return;
    }

    executeSave(form.type);
  };

  const executeSave = async (chosenType) => {
    setSaving(true);
    try {
      const finalType = chosenType || form.type;
      const hasImg = Boolean(form.pageId && linkedImageSrc);
      const boxArr = hasImg ? [form.imgBox.ymin, form.imgBox.xmin, form.imgBox.ymax, form.imgBox.xmax] : null;

      const payload = {
        ...form,
        type: finalType,
        // Discard unselected format content
        ...(finalType === 'Basic' ? { text: '' } : { front: '', back: '' }),
        // Automatic Image Tagging and Metadata Structure for Export
        has_image: hasImg,
        include_image: hasImg,
        img_box: boxArr,
        ymin: hasImg ? form.imgBox.ymin : undefined,
        xmin: hasImg ? form.imgBox.xmin : undefined,
        ymax: hasImg ? form.imgBox.ymax : undefined,
        xmax: hasImg ? form.imgBox.xmax : undefined,
        imageSide: form.imageSide || 'back',
        imageLocation: form.imageSide || 'back',
        ...(form.pageId === 'custom_upload' && form.customImage ? {
          imageUrl: form.customImage,
          base64: form.customImage,
        } : {}),
      };

      await onSave(payload);
      onClose();
    } catch (err) {
      console.error('[ManualCardModal] save failed', err);
    } finally {
      setSaving(false);
      setConflictModalOpen(false);
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
    const wrapped = `{{\c${n}::${selected}}}`;
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
      {/* ── MINIMIZED DRAFT FLOATING BAR ── */}
      {isMinimized ? (
        <motion.div
          key="manual-card-minimized"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          className="fixed bottom-20 md:bottom-6 right-4 left-4 md:left-auto md:w-96 z-[350]"
        >
          <div className={`p-3.5 rounded-2xl shadow-2xl border flex items-center justify-between gap-3 backdrop-blur-xl ${
            dark ? 'neu-card-dark bg-[#1a1f2b]/95 text-white border-gray-700/80' : 'neu-card-light bg-white/95 text-gray-900 border-gray-200'
          }`}>
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/30">
                <Edit3 className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider truncate">
                    {isEdit ? 'Editing Card Draft' : 'New Card Draft'}
                  </span>
                  <span className="text-[8px] font-mono px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 shrink-0">
                    {form.type}
                  </span>
                </div>
                <p className={`text-[9px] truncate font-mono mt-0.5 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Deck: {form.deck || 'General'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsMinimized(false)}
                className={`p-2 rounded-xl text-blue-500 hover:bg-blue-500/15 transition active:scale-95`}
                title="Expand Card Creator"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className={`p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-500/15 transition active:scale-95`}
                title="Discard Draft & Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      ) : (
        /* ── EXPANDED MODAL ── */
        <motion.div
          key="manual-card-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[300]"
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
          onPaste={handlePaste}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <motion.div
            key="manual-card-panel"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className={`${dark ? 'neu-card-dark text-white border border-gray-800' : 'neu-card-light text-gray-900 border border-white'} rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh] relative overflow-hidden ${
              isDraggingOver ? 'ring-4 ring-blue-500' : ''
            }`}
          >
            {/* Stable File/Web Image Drag-and-Drop Overlay */}
            {isDraggingOver && (
              <div className="absolute inset-0 bg-blue-600/90 backdrop-blur-md z-[350] flex flex-col items-center justify-center text-white p-6 text-center animate-in fade-in duration-200 pointer-events-none">
                <Upload className="w-16 h-16 mb-3 animate-bounce text-white" />
                <h3 className="text-xl font-black uppercase tracking-wider text-white">Drop Image Here</h3>
                <p className="text-xs text-blue-100 mt-1">Local files or web browser images will be attached</p>
              </div>
            )}

            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              className="hidden"
            />

            {/* Header */}
            <div className={`px-6 py-4 sm:py-5 border-b flex items-center justify-between shrink-0 ${dark ? 'border-gray-800' : 'border-gray-200/60'}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 bg-purple-500/15 rounded-xl flex items-center justify-center shrink-0">
                  <Edit3 className="w-4 h-4 text-purple-500" />
                </div>
                <div className="min-w-0">
                  <h3 className={`font-black uppercase tracking-widest text-xs truncate ${dark ? 'text-white' : 'text-gray-900'}`}>
                    {isEdit ? 'Edit Card' : 'Create Manual Flashcard'}
                  </h3>
                  <p className={`text-[10px] truncate mt-0.5 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                    Drag web/local images or paste anywhere (Ctrl+V)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="hidden sm:inline-block text-[9px] font-black uppercase tracking-wider bg-purple-500/15 text-purple-500 border border-purple-500/25 px-2.5 py-1 rounded-full">
                  Manual
                </span>
                {/* Minimize Button */}
                <button
                  type="button"
                  onClick={() => setIsMinimized(true)}
                  className={`p-1.5 rounded-xl transition ${dark ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
                  title="Minimize Draft"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
                {/* Close Button */}
                <button
                  type="button"
                  onClick={onClose}
                  className={`p-1.5 rounded-xl transition ${dark ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto flex-grow space-y-5 custom-scrollbar" style={{ scrollbarWidth: 'none' }}>

              {/* Card Type Toggle */}
              <div>
                <label className={lbl}>Card Type</label>
                <div className="flex gap-2">
                  {['Basic', 'Cloze'].map(type => (
                    <button
                      key={type}
                      type="button"
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

              {/* Target Deck (Custom Neumorphic Select) */}
              <div>
                <label className={lbl}>
                  <Folder className="w-3 h-3 inline mr-1" />Target Deck / Folder
                </label>
                <NeumorphicSelect
                  value={form.deck}
                  onChange={handleDeckChange}
                  options={deckOptions}
                  themeMode={themeMode}
                  placeholder="Select target deck..."
                  icon={Folder}
                  allowCustomInput
                  customInputPlaceholder="Enter new folder path (e.g. Brain::Anatomy)..."
                />
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
                      type="button"
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
                  <RichInputField
                    editorRef={clozeRef}
                    value={form.text}
                    onChange={(val) => { setForm(f => ({ ...f, text: val })); setErrors(er => ({ ...er, text: '' })); }}
                    themeMode={themeMode}
                    minHeight="140px"
                    placeholder="Type content here, highlight text and click Cloze, or paste images inline (Ctrl+V)..."
                  />
                  {errors.text && <p className={errTxt}><AlertCircle className="w-3 h-3 inline mr-1" />{errors.text}</p>}
                  <p className={`text-[9px] mt-1.5 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                    {'Tip: Highlight text then click Cloze to wrap as {{c1::...}}. Paste images inline directly anywhere in the text.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className={lbl}>Front (Question)</label>
                    <RichInputField
                      value={form.front}
                      onChange={(val) => { setForm(f => ({ ...f, front: val })); setErrors(er => ({ ...er, front: '' })); }}
                      themeMode={themeMode}
                      minHeight="90px"
                      placeholder="What is the question? (Paste images inline directly)..."
                    />
                    {errors.front && <p className={errTxt}><AlertCircle className="w-3 h-3 inline mr-1" />{errors.front}</p>}
                  </div>
                  <div>
                    <label className={lbl}>Back (Answer)</label>
                    <RichInputField
                      value={form.back}
                      onChange={(val) => { setForm(f => ({ ...f, back: val })); setErrors(er => ({ ...er, back: '' })); }}
                      themeMode={themeMode}
                      minHeight="90px"
                      placeholder="The answer... (Paste images inline directly)..."
                    />
                    {errors.back && <p className={errTxt}><AlertCircle className="w-3 h-3 inline mr-1" />{errors.back}</p>}
                  </div>
                </div>
              )}

              {/* Card Tags */}
              <div>
                <label className={lbl}>
                  <Tag className="w-3 h-3 inline mr-1" />Card Tags
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {form.tags.map(tag => (
                    <span key={tag} className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full font-bold ${dark ? 'neu-pressed-dark text-blue-400 border border-blue-500/30' : 'neu-pressed-light text-blue-600 border border-blue-100'}`}>
                      <span>#{tag}</span>
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className={`rounded-full p-0.5 transition ${dark ? 'hover:bg-blue-500/20 text-blue-400' : 'hover:bg-blue-100 text-blue-600'}`}
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
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
                type="button"
                onClick={onClose}
                className={`px-6 py-2.5 text-xs font-bold rounded-2xl transition ${dark ? 'neu-btn-dark text-gray-300' : 'neu-btn-light text-gray-600'}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveClick}
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
      )}

      {/* Conflict Dialog Modal (Dual Type Filling) */}
      {conflictModalOpen && (
        <motion.div
          key="conflict-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[400]"
        >
          <motion.div
            key="conflict-modal-panel"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className={`p-6 rounded-3xl max-w-md w-full border shadow-2xl space-y-4 text-center ${
              dark ? 'neu-card-dark text-white border-gray-800' : 'neu-card-light text-gray-900 border-white'
            }`}
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-500">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-wider">Format Conflict Detected</h3>
              <p className={`text-xs mt-1.5 leading-relaxed ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                You have entered text in both <strong>Basic (Front/Back)</strong> and <strong>Cloze</strong> fields. Which flashcard format would you like to save?
              </p>
            </div>
            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => executeSave('Basic')}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-red-600/20 transition flex items-center justify-center gap-2"
              >
                <BookOpen className="w-4 h-4" /> Save as Basic Card (Discard Cloze)
              </button>
              <button
                type="button"
                onClick={() => executeSave('Cloze')}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-blue-600/20 transition flex items-center justify-center gap-2"
              >
                <Scissors className="w-4 h-4" /> Save as Cloze Card (Discard Basic)
              </button>
              <button
                type="button"
                onClick={() => setConflictModalOpen(false)}
                className={`w-full py-2.5 rounded-2xl text-xs font-bold transition ${
                  dark ? 'neu-btn-dark text-gray-400' : 'neu-btn-light text-gray-600'
                }`}
              >
                Cancel & Keep Editing
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
