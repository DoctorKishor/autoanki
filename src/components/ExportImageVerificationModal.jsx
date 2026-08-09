import React, { useState, useEffect, useRef } from 'react';
import {
  X, Check, AlertTriangle, Image as ImageIcon, Eye, EyeOff, Sparkles,
  Layers, CheckCircle2, ChevronRight, HelpCircle, FileText, Download, Crop, RotateCcw,
  ZoomIn, ZoomOut, Edit3, Minus, Maximize2
} from 'lucide-react';
import { cropAndMaskDiagram } from '../utils/imageCropper';

// --- SUB-COMPONENT: INTERACTIVE MANUAL CROP BOX TUNER MODAL ---
function FineTuneCropModal({
  isOpen,
  onClose,
  card,
  sourceImageUrl,
  currentImgBox,
  onSaveCrop,
  themeMode = 'light'
}) {
  const [box, setBox] = useState([0, 0, 1000, 1000]); // [ymin, xmin, ymax, xmax]
  const [cropPreview, setCropPreview] = useState(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(false);
  const [showLivePreview, setShowLivePreview] = useState(true);

  const zoomScaleRef = useRef(1);
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef(null);
  const workspaceRef = useRef(null);
  const isDraggingRef = useRef(null); // null | 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e'
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, initialBox: [0, 0, 1000, 1000] });

  const isDark = themeMode === 'dark';
  const bgBase = isDark ? '#222730' : '#e6ecf5';

  // Attach non-passive mouse wheel listener focused on mouse pointer position
  useEffect(() => {
    if (!isOpen || isMinimized) {
      setZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
      zoomScaleRef.current = 1;
      panOffsetRef.current = { x: 0, y: 0 };
      return;
    }

    const el = workspaceRef.current;
    if (!el) return;

    const handleWheelNative = (e) => {
      e.preventDefault();

      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      const oldScale = zoomScaleRef.current;
      const newScale = Math.min(4, Math.max(1, parseFloat((oldScale + delta).toFixed(2))));
      if (newScale === oldScale) return;

      if (newScale === 1) {
        setZoomScale(1);
        setPanOffset({ x: 0, y: 0 });
        zoomScaleRef.current = 1;
        panOffsetRef.current = { x: 0, y: 0 };
        return;
      }

      if (containerRef.current && workspaceRef.current) {
        const imgRect = containerRef.current.getBoundingClientRect();
        const wsRect = workspaceRef.current.getBoundingClientRect();

        // Exact mouse position inside workspace
        const mouseWsX = e.clientX - wsRect.left;
        const mouseWsY = e.clientY - wsRect.top;

        // Exact unscaled local image coordinates under mouse cursor
        const cursorImgX = (e.clientX - imgRect.left) / oldScale;
        const cursorImgY = (e.clientY - imgRect.top) / oldScale;

        // Initial centered offset of container relative to workspace when panOffset was 0
        const initialLeft = (imgRect.left - wsRect.left) - panOffsetRef.current.x;
        const initialTop = (imgRect.top - wsRect.top) - panOffsetRef.current.y;

        // Compute new pan offset so cursorImgX, cursorImgY lands EXACTLY under mouseWsX, mouseWsY
        const newPanX = mouseWsX - initialLeft - cursorImgX * newScale;
        const newPanY = mouseWsY - initialTop - cursorImgY * newScale;

        setZoomScale(newScale);
        setPanOffset({ x: newPanX, y: newPanY });
        zoomScaleRef.current = newScale;
        panOffsetRef.current = { x: newPanX, y: newPanY };
      }
    };

    el.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheelNative);
    };
  }, [isOpen, isMinimized]);

  useEffect(() => {
    if (!isOpen) return;
    if (currentImgBox && Array.isArray(currentImgBox) && currentImgBox.length === 4) {
      setBox(currentImgBox);
    } else if (currentImgBox && typeof currentImgBox === 'object') {
      setBox([currentImgBox.ymin || 0, currentImgBox.xmin || 0, currentImgBox.ymax || 1000, currentImgBox.xmax || 1000]);
    } else {
      setBox([0, 0, 1000, 1000]);
    }
  }, [currentImgBox, isOpen]);

  // Update real-time cropped preview thumbnail
  useEffect(() => {
    if (!isOpen || !sourceImageUrl || isMinimized) return;
    let isCurrent = true;
    cropAndMaskDiagram(sourceImageUrl, box, [], 'back', card?.type || 'Basic')
      .then(url => {
        if (isCurrent) setCropPreview(url);
      })
      .catch(console.error);
    return () => { isCurrent = false; };
  }, [box, sourceImageUrl, isOpen, card?.type, isMinimized]);

  if (!isOpen) return null;

  // Minimized Widget Rendering
  if (isMinimized) {
    return (
      <div
        className="fixed bottom-4 left-4 z-[320] flex items-center gap-3 p-3 rounded-2xl shadow-2xl border cursor-pointer hover:scale-105 active:scale-95 transition-all duration-200"
        style={{
          background: bgBase,
          borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
          boxShadow: isDark
            ? '6px 6px 14px #171a20, -6px -6px 14px #2d3440'
            : '6px 6px 14px #c2c8d4, -6px -6px 14px #ffffff'
        }}
        onClick={() => setIsMinimized(false)}
      >
        <div className={`p-2 rounded-xl ${isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-500/10 text-blue-600'}`}>
          <Crop className="w-5 h-5 animate-pulse" />
        </div>
        <div>
          <span className={`text-[9px] uppercase font-black block tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Crop Editor</span>
          <span className={`text-xs font-bold block ${isDark ? 'text-white' : 'text-slate-800'}`}>Tuning Crop Box</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setIsMinimized(false); }}
          className="px-2.5 py-1 text-[10px] font-black text-blue-500 hover:underline uppercase tracking-wider ml-1"
        >
          Restore
        </button>
      </div>
    );
  }

  const handlePointerDown = (e, handleType) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = handleType;
    const clientX = e.clientX || e.touches?.[0]?.clientX || 0;
    const clientY = e.clientY || e.touches?.[0]?.clientY || 0;
    dragStartRef.current = {
      mouseX: clientX,
      mouseY: clientY,
      initialBox: [...box]
    };

    const handlePointerMove = (moveEvt) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const currX = moveEvt.clientX || moveEvt.touches?.[0]?.clientX || 0;
      const currY = moveEvt.clientY || moveEvt.touches?.[0]?.clientY || 0;

      const deltaX = ((currX - dragStartRef.current.mouseX) / rect.width) * 1000;
      const deltaY = ((currY - dragStartRef.current.mouseY) / rect.height) * 1000;

      const [initYmin, initXmin, initYmax, initXmax] = dragStartRef.current.initialBox;
      let [ymin, xmin, ymax, xmax] = [initYmin, initXmin, initYmax, initXmax];

      const minSize = 30; // Min size 30/1000 units

      if (isDraggingRef.current === 'move') {
        const boxWidth = initXmax - initXmin;
        const boxHeight = initYmax - initYmin;

        xmin = Math.max(0, Math.min(1000 - boxWidth, initXmin + deltaX));
        ymin = Math.max(0, Math.min(1000 - boxHeight, initYmin + deltaY));
        xmax = xmin + boxWidth;
        ymax = ymin + boxHeight;
      } else {
        if (isDraggingRef.current.includes('w')) {
          xmin = Math.max(0, Math.min(initXmax - minSize, initXmin + deltaX));
        }
        if (isDraggingRef.current.includes('e')) {
          xmax = Math.min(1000, Math.max(initXmin + minSize, initXmax + deltaX));
        }
        if (isDraggingRef.current.includes('n')) {
          ymin = Math.max(0, Math.min(initYmax - minSize, initYmin + deltaY));
        }
        if (isDraggingRef.current.includes('s')) {
          ymax = Math.min(1000, Math.max(initYmin + minSize, initYmax + deltaY));
        }
      }

      setBox([Math.round(ymin), Math.round(xmin), Math.round(ymax), Math.round(xmax)]);
    };

    const handlePointerUp = () => {
      isDraggingRef.current = null;
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove);
    window.addEventListener('touchend', handlePointerUp);
  };

  const [ymin, xmin, ymax, xmax] = box;
  const leftPct = `${(xmin / 1000) * 100}%`;
  const topPct = `${(ymin / 1000) * 100}%`;
  const widthPct = `${((xmax - xmin) / 1000) * 100}%`;
  const heightPct = `${((ymax - ymin) / 1000) * 100}%`;

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-7xl flex flex-col rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden border"
        style={{
          maxHeight: '96dvh',
          background: bgBase,
          borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.1)',
          boxShadow: isDark
            ? '0 32px 80px rgba(0,0,0,0.6), 6px 6px 14px #171a20, -6px -6px 14px #2d3440'
            : '0 32px 80px rgba(0,0,0,0.15), 6px 6px 14px #c2c8d4, -6px -6px 14px #ffffff'
        }}
      >
        {/* Header */}
        <div
          className="px-4 sm:px-6 py-2.5 sm:py-4 border-b flex items-center justify-between shrink-0"
          style={{ borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-500/10 text-blue-600'}`}>
              <Crop className="w-4 h-4 sm:w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className={`text-xs sm:text-base font-black tracking-tight leading-tight ${isDark ? 'text-white' : 'text-slate-800'}`}>
                Fine-Tune Image Crop Box
              </h3>
              <p className={`text-[10px] mt-0.5 hidden sm:block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Scroll mouse wheel or pinch to zoom. Drag glowing blue box or handles to adjust crop workspace.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            <div className={`flex items-center gap-1 px-1.5 py-0.5 sm:py-1 rounded-xl text-[10px] sm:text-xs font-bold ${isDark ? 'neu-pressed-dark text-slate-200' : 'neu-pressed-light text-slate-700'}`}>
              <button
                onClick={() => {
                  setZoomScale(prev => {
                    const next = Math.max(1, parseFloat((prev - 0.25).toFixed(2)));
                    if (next === 1) setPanOffset({ x: 0, y: 0 });
                    return next;
                  });
                }}
                className={`p-1 rounded transition hover:bg-black/10`}
                title="Zoom Out"
              >
                <ZoomOut className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </button>
              <span className="w-10 text-center font-mono text-[9px] sm:text-[11px] font-black">{Math.round(zoomScale * 100)}%</span>
              <button
                onClick={() => setZoomScale(prev => Math.min(4, parseFloat((prev + 0.25).toFixed(2))))}
                className={`p-1 rounded transition hover:bg-black/10`}
                title="Zoom In"
              >
                <ZoomIn className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </button>
            </div>

            {/* Minimize button */}
            <button
              onClick={() => setIsMinimized(true)}
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition ${isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}
              title="Minimize Crop Editor"
            >
              <Minus className="w-4 h-4" />
            </button>

            {/* Close button */}
            <button
              onClick={onClose}
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition ${isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row bg-slate-950 relative">
          
          {/* Main Interactive Zoom Box Area */}
          <div
            ref={workspaceRef}
            className="flex-1 relative overflow-hidden flex items-center justify-center p-2 bg-slate-950 h-[48vh] sm:h-[55vh]"
          >
            {/* Toggle live preview button overlay in the workspace */}
            <button
              onClick={() => setShowLivePreview(!showLivePreview)}
              className="absolute top-2 left-2 z-50 p-2 rounded-xl bg-black/60 text-white hover:bg-black/80 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider transition active:scale-95 shadow-lg border border-white/10"
            >
              {showLivePreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              <span>{showLivePreview ? 'Hide Preview' : 'Show Preview'}</span>
            </button>

            {/* Main image container */}
            <div
              className="relative inline-block max-w-full max-h-[46vh] sm:max-h-[52vh] select-none transition-transform duration-75 origin-top-left"
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
                transformOrigin: '0 0'
              }}
              ref={containerRef}
            >
              <img
                src={sourceImageUrl}
                alt="Source Page"
                className="max-h-[46vh] sm:max-h-[52vh] object-contain rounded-xl pointer-events-none block border border-slate-800"
              />

              {/* Glowing Crop Bounding Box */}
              <div
                className="absolute border-2 border-blue-500 bg-blue-500/10 cursor-move shadow-xl"
                style={{ left: leftPct, top: topPct, width: widthPct, height: heightPct }}
                onMouseDown={(e) => handlePointerDown(e, 'move')}
                onTouchStart={(e) => handlePointerDown(e, 'move')}
              >
                {/* Drag Handles */}
                <div className="absolute -top-2.5 -left-2.5 w-5 h-5 bg-white border-2 border-blue-600 rounded-full cursor-nwse-resize shadow-lg hover:scale-125 transition-transform" onMouseDown={(e) => handlePointerDown(e, 'nw')} onTouchStart={(e) => handlePointerDown(e, 'nw')} />
                <div className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-white border-2 border-blue-600 rounded-full cursor-nesw-resize shadow-lg hover:scale-125 transition-transform" onMouseDown={(e) => handlePointerDown(e, 'ne')} onTouchStart={(e) => handlePointerDown(e, 'ne')} />
                <div className="absolute -bottom-2.5 -left-2.5 w-5 h-5 bg-white border-2 border-blue-600 rounded-full cursor-nesw-resize shadow-lg hover:scale-125 transition-transform" onMouseDown={(e) => handlePointerDown(e, 'sw')} onTouchStart={(e) => handlePointerDown(e, 'sw')} />
                <div className="absolute -bottom-2.5 -right-2.5 w-5 h-5 bg-white border-2 border-blue-600 rounded-full cursor-nwse-resize shadow-lg hover:scale-125 transition-transform" onMouseDown={(e) => handlePointerDown(e, 'se')} onTouchStart={(e) => handlePointerDown(e, 'se')} />

                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-2.5 bg-blue-500 border border-white rounded-full cursor-ns-resize shadow" onMouseDown={(e) => handlePointerDown(e, 'n')} onTouchStart={(e) => handlePointerDown(e, 'n')} />
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-2.5 bg-blue-500 border border-white rounded-full cursor-ns-resize shadow" onMouseDown={(e) => handlePointerDown(e, 's')} onTouchStart={(e) => handlePointerDown(e, 's')} />
                <div className="absolute top-1/2 -left-2 -translate-y-1/2 w-2.5 h-8 bg-blue-500 border border-white rounded-full cursor-ew-resize shadow" onMouseDown={(e) => handlePointerDown(e, 'w')} onTouchStart={(e) => handlePointerDown(e, 'w')} />
                <div className="absolute top-1/2 -right-2 -translate-y-1/2 w-2.5 h-8 bg-blue-500 border border-white rounded-full cursor-ew-resize shadow" onMouseDown={(e) => handlePointerDown(e, 'e')} onTouchStart={(e) => handlePointerDown(e, 'e')} />
              </div>
            </div>

            {/* Mobile-optimized floating preview thumbnail overlay (hides layout sidebar on small devices) */}
            {showLivePreview && (
              <div className="md:hidden absolute bottom-3 right-3 w-28 sm:w-36 aspect-4/3 bg-black rounded-lg border border-slate-700 overflow-hidden flex flex-col p-0.5 shadow-xl pointer-events-none z-50">
                {cropPreview ? (
                  <img src={cropPreview} alt="Crop Preview" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-[9px] text-gray-500 m-auto">Previewing...</span>
                )}
              </div>
            )}
          </div>

          {/* Live Preview Sidebar (only visible on desktop / tablet) */}
          <div className="hidden md:flex w-80 lg:w-96 shrink-0 h-full bg-slate-900 border-l border-slate-800 flex-col p-4 gap-3 overflow-y-auto">
            <span className="text-xs font-black text-gray-300 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
              <Eye className="w-4 h-4 text-blue-400" /> Cropped Result Preview
            </span>
            <div className="aspect-4/3 min-h-[200px] bg-black rounded-xl overflow-hidden border border-slate-750 flex items-center justify-center p-1 shadow-inner shrink-0">
              {cropPreview ? (
                <img src={cropPreview} alt="Crop Preview" className="w-full h-full object-contain" />
              ) : (
                <span className="text-[10px] text-slate-500">Generating preview...</span>
              )}
            </div>
            <div className="text-[10px] text-slate-400 font-mono space-y-1 bg-slate-950 p-2.5 rounded-lg border border-slate-850 shrink-0">
              <div className="flex justify-between"><span>Top: {ymin}</span> <span>Left: {xmin}</span></div>
              <div className="flex justify-between"><span>Bottom: {ymax}</span> <span>Right: {xmax}</span></div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div
          className="px-4 py-3 border-t flex flex-col gap-2.5 shrink-0"
          style={{
            borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            boxShadow: isDark ? 'inset 0 1px 0 rgba(255,255,255,0.02)' : 'none'
          }}
        >
          {/* Mobile Grid: cancel + Select Entire Page + Reset AI + Apply */}
          <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-between gap-2.5">
            {/* Left buttons (mobile: top row of grid / sm: flex row) */}
            <button
              onClick={onClose}
              className={`py-2 px-4 text-xs font-bold rounded-xl transition-all active:scale-95 ${isDark ? 'neu-btn-dark text-slate-400' : 'neu-btn-light text-slate-500'}`}
            >
              Cancel
            </button>

            <button
              onClick={() => setBox([0, 0, 1000, 1000])}
              className={`py-2 px-3 text-xs font-bold rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 ${isDark ? 'neu-btn-dark text-slate-200' : 'neu-btn-light text-slate-700'}`}
            >
              <span>Entire Page</span>
              <span className="text-[9px] font-mono text-blue-500 font-bold bg-blue-500/10 px-1 py-0.5 rounded">100%</span>
            </button>

            {/* Reset AI Crop (if card has it) */}
            {card?.img_box ? (
              <button
                onClick={() => setBox(Array.isArray(card.img_box) ? card.img_box : [card.img_box.ymin, card.img_box.xmin, card.img_box.ymax, card.img_box.xmax])}
                className={`py-2 px-3 text-xs font-bold rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 ${isDark ? 'neu-btn-dark text-amber-400' : 'neu-btn-light text-amber-600'}`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>AI Crop</span>
              </button>
            ) : (
              <div className="hidden sm:block" />
            )}

            {/* Apply button */}
            <button
              onClick={() => {
                onSaveCrop(box);
                onClose();
              }}
              className="py-2.5 px-5 bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-blue-500/30 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" /> Apply
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// Helper to detect [0, 0, 0, 0] or invalid zero bounding box
const isZeroOrInvalidBox = (box) => {
  if (!box) return true;
  let ymin = 0, xmin = 0, ymax = 0, xmax = 0;
  if (Array.isArray(box)) {
    if (box.length !== 4) return true;
    [ymin, xmin, ymax, xmax] = box;
  } else if (typeof box === 'object') {
    ymin = box.ymin ?? 0;
    xmin = box.xmin ?? 0;
    ymax = box.ymax ?? 0;
    xmax = box.xmax ?? 0;
  } else {
    return true;
  }
  // Top: 0, Left: 0, Bottom: 0, Right: 0 -> strictly no image needed
  if (ymin === 0 && xmin === 0 && ymax === 0 && xmax === 0) return true;
  // Negative or collapsed height/width
  if (ymax <= ymin || xmax <= xmin) return true;
  return false;
};

// --- MAIN EXPORT VERIFICATION MODAL ---
export default function ExportImageVerificationModal({
  isOpen,
  onClose,
  cards = [],
  sourceImageUrl,
  findCardImageSrc,
  onConfirmExport,
  themeMode = 'light'
}) {
  const isDark = themeMode === 'dark';
  const bgBase = isDark ? '#222730' : '#e6ecf5';
  const [activeTab, setActiveTab] = useState('uncertain');
  const [cardConfigs, setCardConfigs] = useState({});
  const [previewImages, setPreviewImages] = useState({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const prevIsOpenRef = useRef(false);

  // Fine-tuning modal state
  const [fineTuneState, setFineTuneState] = useState({ isOpen: false, cardId: null, card: null });

  // Resolve exact source image for a given card (per-card image first, fallback to sourceImageUrl)
  const resolveCardImageSrc = (card) => {
    if (!card) return sourceImageUrl;
    return (findCardImageSrc ? findCardImageSrc(card) : null) || card.imageUrl || card.base64 || sourceImageUrl;
  };

  // Initialize card configs & crop images ONLY ONCE when modal transitions to open
  useEffect(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false;
      return;
    }

    // Prevent re-initializing configs when scrolling or parent component re-renders
    if (prevIsOpenRef.current) return;
    prevIsOpenRef.current = true;

    if (!cards || cards.length === 0) return;

    let isMounted = true;
    setIsGenerating(true);

    const initialConfigs = {};
    let hasUncertain = false;
    let hasConfirmed = false;

    cards.forEach((card, idx) => {
      const id = card.id || `card_${idx}`;
      const hasZeroBox = Boolean(card.img_box && isZeroOrInvalidBox(card.img_box));
      
      let parsedBox = null;
      if (card.img_box && !hasZeroBox) {
        if (Array.isArray(card.img_box) && card.img_box.length === 4) {
          parsedBox = card.img_box;
        } else if (card.img_box.ymin !== undefined) {
          parsedBox = [card.img_box.ymin, card.img_box.xmin, card.img_box.ymax, card.img_box.xmax];
        }
      }

      const hasImg = !hasZeroBox && Boolean(card.has_image || parsedBox);
      const confidence = hasZeroBox ? 0 : (typeof card.image_confidence === 'number' ? card.image_confidence : (hasImg ? 85 : 0));
      
      // If marked as having an image, but img_box is missing or full page [0,0,1000,1000], default to a centered AI pre-crop area [120, 120, 880, 880]
      if (hasImg && (!parsedBox || (parsedBox[0] === 0 && parsedBox[1] === 0 && parsedBox[2] === 1000 && parsedBox[3] === 1000))) {
        parsedBox = [120, 120, 880, 880];
      }

      const includeByDefault = hasImg && confidence >= 70;

      if (hasImg && confidence < 70) hasUncertain = true;
      if (hasImg && confidence >= 70) hasConfirmed = true;

      initialConfigs[id] = {
        includeImage: includeByDefault,
        imageSide: card.image_side || (card.type === 'Cloze' ? 'text' : 'back'),
        confidence: confidence,
        imgBox: hasImg ? parsedBox : null,
        front: card.front || '',
        back: card.back || '',
        text: card.text || ''
      };
    });

    setCardConfigs(initialConfigs);

    // Set initial active tab dynamically
    if (hasUncertain) {
      setActiveTab('uncertain');
    } else if (hasConfirmed) {
      setActiveTab('confirmed');
    } else {
      setActiveTab('textonly');
    }

    // Generate previews asynchronously
    const generateAllPreviews = async () => {
      const previews = {};
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const id = card.id || `card_${i}`;
        const cfg = initialConfigs[id];

        const imgSrc = resolveCardImageSrc(card);
        const effectiveImgBox = cfg.imgBox || [120, 120, 880, 880];

        if (cfg.includeImage || cfg.imgBox || card.has_image) {
          if (imgSrc) {
            try {
              const dataUrl = await cropAndMaskDiagram(
                imgSrc,
                effectiveImgBox,
                [],
                cfg.imageSide,
                card.type
              );
              if (dataUrl) {
                previews[id] = dataUrl;
              } else {
                previews[id] = imgSrc;
              }
            } catch (e) {
              console.error(`Preview crop error for ${id}:`, e);
              previews[id] = imgSrc;
            }
          }
        }
      }
      if (isMounted) {
        setPreviewImages(previews);
        setIsGenerating(false);
      }
    };

    generateAllPreviews();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const totalIncludedImages = Object.values(cardConfigs).filter(c => c.includeImage).length;

  // Minimized Widget Rendering
  if (isMinimized) {
    return (
      <div
        className="fixed bottom-4 right-4 z-[260] flex items-center gap-3 p-3 rounded-2xl shadow-2xl border cursor-pointer hover:scale-105 active:scale-95 transition-all duration-200"
        style={{
          background: bgBase,
          borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
          boxShadow: isDark
            ? '6px 6px 14px #171a20, -6px -6px 14px #2d3440'
            : '6px 6px 14px #c2c8d4, -6px -6px 14px #ffffff'
        }}
        onClick={() => setIsMinimized(false)}
      >
        <div className={`p-2 rounded-xl ${isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-500/10 text-amber-600'}`}>
          <ImageIcon className="w-5 h-5 animate-pulse" />
        </div>
        <div>
          <span className={`text-[9px] uppercase font-black block tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Verify Images</span>
          <span className={`text-xs font-bold block ${isDark ? 'text-white' : 'text-slate-800'}`}>{totalIncludedImages} Selected</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setIsMinimized(false); }}
          className="px-2.5 py-1 text-[10px] font-black text-blue-500 hover:underline uppercase tracking-wider ml-1"
        >
          Restore
        </button>
      </div>
    );
  }

  const confirmedCards = cards.filter((c, idx) => { const id = c.id || `card_${idx}`; const cfg = cardConfigs[id]; return cfg && (c.has_image || cfg.imgBox) && cfg.confidence >= 70; });
  const uncertainCards = cards.filter((c, idx) => { const id = c.id || `card_${idx}`; const cfg = cardConfigs[id]; return cfg && (c.has_image || cfg.imgBox) && cfg.confidence < 70; });
  const textOnlyCards  = cards.filter((c, idx) => { const id = c.id || `card_${idx}`; const cfg = cardConfigs[id]; return cfg && !c.has_image && !cfg.imgBox; });
  const displayedCards = activeTab === 'confirmed' ? confirmedCards : activeTab === 'uncertain' ? uncertainCards : textOnlyCards;

  const toggleIncludeImage = (id) => setCardConfigs(prev => ({ ...prev, [id]: { ...prev[id], includeImage: !prev[id]?.includeImage } }));
  const setSide = (id, side) => setCardConfigs(prev => ({ ...prev, [id]: { ...prev[id], imageSide: side } }));
  const updateCardText = (id, field, value) => setCardConfigs(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const handleApproveAllUncertain = () => {
    setCardConfigs(prev => {
      const next = { ...prev };
      uncertainCards.forEach((c, idx) => { const id = c.id || `card_${idx}`; if (next[id]) next[id].includeImage = true; });
      return next;
    });
  };

  const handleOpenFineTune = (card, id) => {
    const cfg = cardConfigs[id] || {};
    setFineTuneState({ isOpen: true, cardId: id, card, currentImgBox: cfg.imgBox || [0, 0, 1000, 1000] });
  };

  const handleSaveCrop = async (id, newImgBox) => {
    const card = cards.find((c, idx) => (c.id || `card_${idx}`) === id);
    const imgSrc = resolveCardImageSrc(card);
    setCardConfigs(prev => ({ ...prev, [id]: { ...prev[id], imgBox: newImgBox, includeImage: true } }));
    if (imgSrc) {
      try {
        const cfg = cardConfigs[id] || {};
        const dataUrl = await cropAndMaskDiagram(imgSrc, newImgBox, [], cfg.imageSide || 'back', card?.type || 'Basic');
        if (dataUrl) setPreviewImages(prev => ({ ...prev, [id]: dataUrl }));
      } catch (err) { console.error('Error updating preview after fine-tune crop:', err); }
    }
  };

  const handleFinalExport = async () => {
    const processedCards = cards.map((card, idx) => {
      const id = card.id || `card_${idx}`;
      const cfg = cardConfigs[id] || {};
      const includeImg = Boolean(cfg.includeImage);
      return {
        ...card,
        front: cfg.front !== undefined ? cfg.front : card.front,
        back: cfg.back !== undefined ? cfg.back : card.back,
        text: cfg.text !== undefined ? cfg.text : card.text,
        has_image: includeImg, include_image: includeImg,
        img_box: includeImg ? cfg.imgBox : null,
        image_side: cfg.imageSide || card.image_side || 'back',
        cropped_data_url: includeImg ? (previewImages[id] || null) : null
      };
    });
    try { await onConfirmExport(processedCards); } catch (err) { console.error('[ExportVerificationModal] Export pipeline error:', err); }
    onClose();
  };



  return (
    <div className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md overflow-y-auto">
      <div
        className="w-full max-w-5xl flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 sm:slide-in-from-bottom-0 duration-300 sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden"
        style={{
          maxHeight: '94dvh',
          background: bgBase,
          border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.7)',
          boxShadow: isDark
            ? '0 32px 80px rgba(0,0,0,0.6), 6px 6px 14px #171a20, -6px -6px 14px #2d3440'
            : '0 32px 80px rgba(0,0,0,0.15), 6px 6px 14px #c2c8d4, -6px -6px 14px #ffffff'
        }}
      >

        {/* ── COMPACT HEADER ── */}
        <div
          className="px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between shrink-0 border-b"
          style={{ borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 ${isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-500/10 text-amber-600'}`}>
              <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className={`text-sm sm:text-lg font-black tracking-tight leading-tight ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                  Pre-Export Image Verification
                </h2>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black shrink-0 ${isDark ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-700'}`}>
                  {totalIncludedImages} Selected
                </span>
              </div>
              {/* Description hidden on mobile to reclaim vertical space */}
              <p className={`text-[10px] mt-0.5 hidden sm:block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Review AI-cropped diagrams, fine-tune crop areas (drag &amp; scale), and side placement before export.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMinimized(true)}
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition ${isDark ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-200 text-slate-400 hover:text-slate-700'}`}
              title="Minimize Verification"
            >
              <Minus className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button
              onClick={onClose}
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition ${isDark ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-200 text-slate-400 hover:text-slate-700'}`}
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* ── TAB NAV ── */}
        <div
          className="px-3 sm:px-6 py-2 sm:py-3 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between shrink-0 border-b"
          style={{ borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}
        >
          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-0.5">
            {[
              { key: 'uncertain', label: `AI Suggested (${uncertainCards.length})`, icon: <AlertTriangle className="w-3.5 h-3.5" />, active: 'bg-amber-500 text-white shadow-md shadow-amber-500/30' },
              { key: 'confirmed', label: `Confirmed (${confirmedCards.length})`, icon: <CheckCircle2 className="w-3.5 h-3.5" />, active: 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25' },
              { key: 'textonly', label: `Text Only (${textOnlyCards.length})`, icon: <FileText className="w-3.5 h-3.5" />, active: 'bg-blue-600 text-white shadow-md shadow-blue-600/25' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex-shrink-0 px-3 py-2 rounded-xl text-[11px] sm:text-xs font-black transition-all flex items-center gap-1.5 active:scale-95 ${
                  activeTab === t.key ? t.active : isDark ? 'neu-btn-dark text-slate-300' : 'neu-btn-light text-slate-600'
                }`}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>
          {activeTab === 'uncertain' && uncertainCards.length > 0 && (
            <button
              onClick={handleApproveAllUncertain}
              className="w-full sm:w-auto flex-shrink-0 text-[11px] sm:text-xs font-black bg-amber-500 hover:bg-amber-600 active:scale-95 text-white px-4 py-2 rounded-xl transition shadow-md shadow-amber-500/25"
            >
              Approve All Suggested
            </button>
          )}
        </div>

        {/* ── CONTENT BODY ── */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 custom-scrollbar">
          {isGenerating ? (
            <div className="py-12 text-center flex flex-col items-center justify-center gap-3">
              <Sparkles className="w-8 h-8 text-amber-500 animate-spin" />
              <p className={`text-sm font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Auto-cropping diagrams &amp; masking front labels...</p>
            </div>
          ) : displayedCards.length === 0 ? (
            <div className={`py-12 text-center font-bold text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              No cards in this category.
            </div>
          ) : (
            displayedCards.map((card, idx) => {
              const id = card.id || `card_${idx}`;
              const cfg = cardConfigs[id] || {};
              const previewImg = previewImages[id];
              const cardImgSrc = resolveCardImageSrc(card);
              const hasImageBlock = !!(cfg.imgBox || card.has_image || cfg.includeImage || cardImgSrc);

              return (
                <div
                  key={id}
                  className="rounded-2xl p-1 transition-all"
                  style={{
                    background: bgBase,
                    boxShadow: cfg.includeImage
                      ? (isDark ? 'inset 2px 2px 6px #171a20, inset -2px -2px 6px #2d3440, 0 0 0 2px rgba(59,130,246,0.4)' : 'inset 2px 2px 6px #c5cbd6, inset -2px -2px 6px #ffffff, 0 0 0 2px rgba(59,130,246,0.3)')
                      : (isDark ? 'inset 2px 2px 6px #171a20, inset -2px -2px 6px #2d3440' : 'inset 2px 2px 6px #c5cbd6, inset -2px -2px 6px #ffffff')
                  }}
                >
                  <div className="p-3 sm:p-4 rounded-xl flex flex-col gap-3">
                    {/* Badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>{card.type} Card</span>
                      {cfg.confidence > 0 && (
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${cfg.confidence >= 70 ? (isDark ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700') : (isDark ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700')}`}>
                          {cfg.confidence}% AI Confidence
                        </span>
                      )}
                    </div>

                    {/* Layout: image first on mobile, text alongside on desktop */}
                    <div className={`flex flex-col sm:flex-row gap-3`}>

                      {/* IMAGE BLOCK — shown first on mobile */}
                      {hasImageBlock && (
                        <div
                          className="w-full sm:w-72 lg:w-80 shrink-0 flex flex-col gap-2 p-3 rounded-2xl"
                          style={{ boxShadow: isDark ? '3px 3px 7px #171a20, -3px -3px 7px #2d3440' : '3px 3px 7px #c2c8d4, -3px -3px 7px #ffffff' }}
                        >
                          {/* Image preview */}
                          <div className="relative aspect-4/3 bg-gray-950 rounded-xl overflow-hidden flex items-center justify-center border border-gray-700 group shadow-inner">
                            {previewImg || cardImgSrc ? (
                              <img src={previewImg || cardImgSrc} alt="Cropped Diagram" className="object-contain w-full h-full" />
                            ) : (
                              <div className="flex flex-col items-center justify-center text-gray-400 p-2 text-center">
                                <ImageIcon className="w-6 h-6 mb-1 opacity-40 animate-pulse text-blue-400" />
                                <span className="text-[10px]">Loading Crop...</span>
                              </div>
                            )}
                            {cfg.occlusions && cfg.occlusions.length > 0 && (card.type === 'Cloze' || cfg.imageSide === 'front' || cfg.imageSide === 'both') && (
                              <span className="absolute top-1 right-1 text-[9px] bg-amber-500 text-white font-bold px-1.5 py-0.5 rounded shadow">{cfg.occlusions.length} Masked</span>
                            )}
                            {cardImgSrc && (
                              <button
                                onClick={() => handleOpenFineTune(card, id)}
                                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white font-bold text-xs"
                              >
                                <Crop className="w-4 h-4 text-blue-400" /> Fine-Tune Crop Box
                              </button>
                            )}
                          </div>

                          {/* Fine-Tune button */}
                          {cardImgSrc && (
                            <button
                              onClick={() => handleOpenFineTune(card, id)}
                              className={`w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-95 ${isDark ? 'neu-btn-dark text-blue-400' : 'neu-btn-light text-blue-600'}`}
                            >
                              <Crop className="w-3.5 h-3.5" /> Fine-Tune Crop Box
                            </button>
                          )}

                          {/* Attach-to side controls */}
                          {card.type === 'Basic' && (
                            <div className="flex items-center justify-between gap-1 text-[11px]">
                              <span className={`font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Attach to:</span>
                              <div className="flex items-center gap-1">
                                {['front', 'back', 'both'].map(side => (
                                  <button
                                    key={side}
                                    onClick={() => setSide(id, side)}
                                    className={`px-2.5 py-1.5 rounded-lg font-black uppercase text-[10px] transition active:scale-95 ${cfg.imageSide === side ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30' : isDark ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                                  >
                                    {side}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Include toggle — big touch target */}
                          <button
                            onClick={() => toggleIncludeImage(id)}
                            className={`w-full py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition active:scale-95 ${cfg.includeImage ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/25' : isDark ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-600'}`}
                          >
                            {cfg.includeImage ? <Check className="w-4 h-4" /> : null}
                            {cfg.includeImage ? 'Image Included ✓' : 'Include Image'}
                          </button>
                        </div>
                      )}

                      {/* TEXT FIELDS */}
                      <div className="flex-1 space-y-2">
                        {card.type === 'Basic' ? (
                          <div className="space-y-2 text-xs">
                            <div>
                              <label className="text-[10px] font-black text-blue-500 uppercase tracking-wider flex items-center gap-1 mb-1"><Edit3 className="w-3 h-3" /> Question (Front)</label>
                              <textarea value={cfg.front !== undefined ? cfg.front : (card.front || '')} onChange={(e) => updateCardText(id, 'front', e.target.value)} rows={2} placeholder="Enter question..." className={`w-full text-xs font-bold rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none transition resize-y ${isDark ? 'bg-slate-700 text-slate-100 border border-slate-600 focus:border-blue-500' : 'bg-white text-slate-800 border border-slate-200 focus:border-blue-500'}`} />
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-emerald-500 uppercase tracking-wider flex items-center gap-1 mb-1"><Edit3 className="w-3 h-3" /> Answer (Back)</label>
                              <textarea value={cfg.back !== undefined ? cfg.back : (card.back || '')} onChange={(e) => updateCardText(id, 'back', e.target.value)} rows={2} placeholder="Enter answer..." className={`w-full text-xs font-semibold rounded-xl p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition resize-y ${isDark ? 'bg-slate-700 text-slate-200 border border-slate-600 focus:border-emerald-500' : 'bg-white text-slate-700 border border-slate-200 focus:border-emerald-500'}`} />
                            </div>
                          </div>
                        ) : (
                          <div>
                            <label className="text-[10px] font-black text-purple-500 uppercase tracking-wider flex items-center gap-1 mb-1"><Edit3 className="w-3 h-3" /> Cloze Text</label>
                            <textarea value={cfg.text !== undefined ? cfg.text : (card.text || '')} onChange={(e) => updateCardText(id, 'text', e.target.value)} rows={3} placeholder="Enter cloze text..." className={`w-full text-xs font-bold rounded-xl p-2.5 focus:ring-2 focus:ring-purple-500 focus:outline-none transition resize-y font-mono ${isDark ? 'bg-slate-700 text-slate-100 border border-slate-600 focus:border-purple-500' : 'bg-white text-slate-800 border border-slate-200 focus:border-purple-500'}`} />
                          </div>
                        )}
                        {!cfg.imgBox && cardImgSrc && (
                          <button onClick={() => handleOpenFineTune(card, id)} className={`mt-1 text-xs font-bold hover:underline flex items-center gap-1.5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                            <Crop className="w-3.5 h-3.5" /> Add Manual Image Crop Box
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── FOOTER ── */}
        <div
          className="px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 shrink-0 border-t"
          style={{ borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}
        >
          <button
            onClick={onClose}
            className={`px-4 py-2.5 text-xs font-bold rounded-xl transition active:scale-95 ${isDark ? 'neu-btn-dark text-slate-300' : 'neu-btn-light text-slate-600'}`}
          >
            Cancel
          </button>
          <button
            onClick={handleFinalExport}
            className="px-5 sm:px-6 py-2.5 bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-blue-600/30 transition flex items-center gap-2 active:scale-95"
          >
            <Download className="w-4 h-4" />
            Export ({totalIncludedImages} Images)
          </button>
        </div>
      </div>

      {fineTuneState.isOpen && (
        <FineTuneCropModal
          isOpen={fineTuneState.isOpen}
          onClose={() => setFineTuneState({ isOpen: false, cardId: null, card: null })}
          card={fineTuneState.card}
          sourceImageUrl={resolveCardImageSrc(fineTuneState.card)}
          currentImgBox={fineTuneState.currentImgBox}
          onSaveCrop={(newBox) => handleSaveCrop(fineTuneState.cardId, newBox)}
        />
      )}
    </div>
  );
}


