import React, { useState, useEffect, useRef } from 'react';
import {
  X, Check, AlertTriangle, Image as ImageIcon, Eye, EyeOff, Sparkles,
  Layers, CheckCircle2, ChevronRight, HelpCircle, FileText, Download, Crop, RotateCcw,
  ZoomIn, ZoomOut, Edit3
} from 'lucide-react';
import { cropAndMaskDiagram } from '../utils/imageCropper';

// --- SUB-COMPONENT: INTERACTIVE MANUAL CROP BOX TUNER MODAL ---
function FineTuneCropModal({
  isOpen,
  onClose,
  card,
  sourceImageUrl,
  currentImgBox,
  onSaveCrop
}) {
  const [box, setBox] = useState([0, 0, 1000, 1000]); // [ymin, xmin, ymax, xmax]
  const [cropPreview, setCropPreview] = useState(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  const zoomScaleRef = useRef(1);
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef(null);
  const workspaceRef = useRef(null);
  const isDraggingRef = useRef(null); // null | 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e'
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, initialBox: [0, 0, 1000, 1000] });

  // Attach non-passive mouse wheel listener focused on mouse pointer position
  useEffect(() => {
    if (!isOpen) {
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
  }, [isOpen]);

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
    if (!isOpen || !sourceImageUrl) return;
    let isCurrent = true;
    cropAndMaskDiagram(sourceImageUrl, box, [], 'back', card?.type || 'Basic')
      .then(url => {
        if (isCurrent) setCropPreview(url);
      })
      .catch(console.error);
    return () => { isCurrent = false; };
  }, [box, sourceImageUrl, isOpen, card?.type]);

  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 w-full max-w-7xl rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col max-h-[94vh] overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-800/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <Crop className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
                Fine-Tune Image Crop Box
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Scroll mouse wheel to zoom (focused on cursor). Drag glowing blue box or handles to crop.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Zoom Controls Widget */}
            <div className="flex items-center gap-1.5 bg-gray-200 dark:bg-gray-800 px-2.5 py-1 rounded-xl border border-gray-300 dark:border-gray-700 text-xs font-bold text-gray-700 dark:text-gray-200">
              <button
                onClick={() => {
                  setZoomScale(prev => {
                    const next = Math.max(1, parseFloat((prev - 0.25).toFixed(2)));
                    if (next === 1) setPanOffset({ x: 0, y: 0 });
                    return next;
                  });
                }}
                className="p-1 hover:bg-gray-300 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-300 transition"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              <span className="w-12 text-center font-mono text-[11px] font-black">{Math.round(zoomScale * 100)}%</span>

              <button
                onClick={() => {
                  setZoomScale(prev => Math.min(4, parseFloat((prev + 0.25).toFixed(2))));
                }}
                className="p-1 hover:bg-gray-300 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-300 transition"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>

              {zoomScale > 1 && (
                <button
                  onClick={() => {
                    setZoomScale(1);
                    setPanOffset({ x: 0, y: 0 });
                  }}
                  className="ml-1 text-[10px] text-blue-500 font-black hover:underline"
                >
                  Reset
                </button>
              )}
            </div>

            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Decoupled Workspace & Control Sidebar */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row bg-gray-950 relative">
          
          {/* Left Interactive Page Canvas Workspace */}
          <div
            ref={workspaceRef}
            className="flex-1 h-full relative overflow-hidden flex items-center justify-center p-6 bg-gray-950"
          >
            {/* Main Image & Interactive Drag Container */}
            <div
              className="relative inline-block max-w-full max-h-[75vh] select-none transition-transform duration-75 origin-top-left"
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
                transformOrigin: '0 0'
              }}
              ref={containerRef}
            >
              <img
                src={sourceImageUrl}
                alt="Source Page"
                className="max-h-[75vh] object-contain rounded-xl shadow-2xl pointer-events-none block border border-gray-800"
              />

              {/* Interactive Bounding Box */}
              <div
                className="absolute border-2 border-blue-500 bg-blue-500/10 cursor-move shadow-xl"
                style={{ left: leftPct, top: topPct, width: widthPct, height: heightPct }}
                onMouseDown={(e) => handlePointerDown(e, 'move')}
                onTouchStart={(e) => handlePointerDown(e, 'move')}
              >

                {/* Corner Drag Handles */}
                <div
                  className="absolute -top-2.5 -left-2.5 w-5 h-5 bg-white border-2 border-blue-600 rounded-full cursor-nwse-resize shadow-lg hover:scale-125 transition-transform"
                  onMouseDown={(e) => handlePointerDown(e, 'nw')}
                  onTouchStart={(e) => handlePointerDown(e, 'nw')}
                />
                <div
                  className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-white border-2 border-blue-600 rounded-full cursor-nesw-resize shadow-lg hover:scale-125 transition-transform"
                  onMouseDown={(e) => handlePointerDown(e, 'ne')}
                  onTouchStart={(e) => handlePointerDown(e, 'ne')}
                />
                <div
                  className="absolute -bottom-2.5 -left-2.5 w-5 h-5 bg-white border-2 border-blue-600 rounded-full cursor-nesw-resize shadow-lg hover:scale-125 transition-transform"
                  onMouseDown={(e) => handlePointerDown(e, 'sw')}
                  onTouchStart={(e) => handlePointerDown(e, 'sw')}
                />
                <div
                  className="absolute -bottom-2.5 -right-2.5 w-5 h-5 bg-white border-2 border-blue-600 rounded-full cursor-nwse-resize shadow-lg hover:scale-125 transition-transform"
                  onMouseDown={(e) => handlePointerDown(e, 'se')}
                  onTouchStart={(e) => handlePointerDown(e, 'se')}
                />

                {/* Edge Drag Handles */}
                <div
                  className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-2.5 bg-blue-500 border border-white rounded-full cursor-ns-resize shadow"
                  onMouseDown={(e) => handlePointerDown(e, 'n')}
                  onTouchStart={(e) => handlePointerDown(e, 'n')}
                />
                <div
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-2.5 bg-blue-500 border border-white rounded-full cursor-ns-resize shadow"
                  onMouseDown={(e) => handlePointerDown(e, 's')}
                  onTouchStart={(e) => handlePointerDown(e, 's')}
                />
                <div
                  className="absolute top-1/2 -left-2 -translate-y-1/2 w-2.5 h-8 bg-blue-500 border border-white rounded-full cursor-ew-resize shadow"
                  onMouseDown={(e) => handlePointerDown(e, 'w')}
                  onTouchStart={(e) => handlePointerDown(e, 'w')}
                />
                <div
                  className="absolute top-1/2 -right-2 -translate-y-1/2 w-2.5 h-8 bg-blue-500 border border-white rounded-full cursor-ew-resize shadow"
                  onMouseDown={(e) => handlePointerDown(e, 'e')}
                  onTouchStart={(e) => handlePointerDown(e, 'e')}
                />
              </div>
            </div>
          </div>

          {/* Right Live Preview Sidebar */}
          <div className="w-full md:w-80 lg:w-96 shrink-0 h-full bg-gray-900 border-l border-gray-800 flex flex-col p-4 gap-3 overflow-y-auto">
            <span className="text-xs font-black text-gray-300 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
              <Eye className="w-4 h-4 text-blue-400" /> Cropped Result Preview
            </span>
            <div className="aspect-4/3 min-h-[210px] bg-black rounded-xl overflow-hidden border border-gray-700 flex items-center justify-center p-1 shadow-inner shrink-0">
              {cropPreview ? (
                <img src={cropPreview} alt="Crop Preview" className="w-full h-full object-contain" />
              ) : (
                <span className="text-[10px] text-gray-500">Generating preview...</span>
              )}
            </div>

            <div className="text-[10px] text-gray-400 font-mono space-y-1 bg-gray-950 p-2.5 rounded-lg border border-gray-800 shrink-0">
              <div className="flex justify-between"><span>Top: {ymin}</span> <span>Left: {xmin}</span></div>
              <div className="flex justify-between"><span>Bottom: {ymax}</span> <span>Right: {xmax}</span></div>
            </div>
          </div>
        </div>

        {/* Footer Bar with Action Buttons */}
        <div className="px-6 py-3.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-800 dark:hover:text-white transition">
            Cancel
          </button>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => setBox([0, 0, 1000, 1000])}
              className="py-2 px-3 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-xl border border-gray-200 dark:border-gray-600 transition flex items-center gap-1.5 shadow-xs active:scale-95"
            >
              <span>Select Entire Page</span>
              <span className="text-[9px] text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">100%</span>
            </button>

            {card?.img_box && (
              <button
                onClick={() => setBox(Array.isArray(card.img_box) ? card.img_box : [card.img_box.ymin, card.img_box.xmin, card.img_box.ymax, card.img_box.xmax])}
                className="py-2 px-3 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-amber-600 dark:text-amber-400 text-xs font-bold rounded-xl border border-gray-200 dark:border-gray-600 transition flex items-center gap-1.5 shadow-xs active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                <span>Reset to AI Crop</span>
              </button>
            )}

            <button
              onClick={() => {
                onSaveCrop(box);
                onClose();
              }}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-blue-600/20 transition active:scale-95 flex items-center gap-2"
            >
              <Check className="w-4 h-4" /> Apply Fine-Tuned Crop
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
  onConfirmExport
}) {
  const [activeTab, setActiveTab] = useState('uncertain'); // 'confirmed' | 'uncertain' | 'textonly'
  const [cardConfigs, setCardConfigs] = useState({});
  const [previewImages, setPreviewImages] = useState({});
  const [isGenerating, setIsGenerating] = useState(false);
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

  // Filter cards by category
  const confirmedCards = cards.filter((c, idx) => {
    const id = c.id || `card_${idx}`;
    const cfg = cardConfigs[id];
    return cfg && (c.has_image || cfg.imgBox) && cfg.confidence >= 70;
  });

  const uncertainCards = cards.filter((c, idx) => {
    const id = c.id || `card_${idx}`;
    const cfg = cardConfigs[id];
    return cfg && (c.has_image || cfg.imgBox) && cfg.confidence < 70;
  });

  const textOnlyCards = cards.filter((c, idx) => {
    const id = c.id || `card_${idx}`;
    const cfg = cardConfigs[id];
    return cfg && !c.has_image && !cfg.imgBox;
  });

  const displayedCards = activeTab === 'confirmed' ? confirmedCards : activeTab === 'uncertain' ? uncertainCards : textOnlyCards;

  const toggleIncludeImage = (id) => {
    setCardConfigs(prev => ({
      ...prev,
      [id]: { ...prev[id], includeImage: !prev[id]?.includeImage }
    }));
  };

  const setSide = (id, side) => {
    setCardConfigs(prev => ({
      ...prev,
      [id]: { ...prev[id], imageSide: side }
    }));
  };

  const updateCardText = (id, field, value) => {
    setCardConfigs(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value }
    }));
  };

  const handleApproveAllUncertain = () => {
    setCardConfigs(prev => {
      const next = { ...prev };
      uncertainCards.forEach((c, idx) => {
        const id = c.id || `card_${idx}`;
        if (next[id]) {
          next[id].includeImage = true;
        }
      });
      return next;
    });
  };

  // Open Fine-Tune modal for a specific card
  const handleOpenFineTune = (card, id) => {
    const cfg = cardConfigs[id] || {};
    setFineTuneState({
      isOpen: true,
      cardId: id,
      card: card,
      currentImgBox: cfg.imgBox || [0, 0, 1000, 1000]
    });
  };

  // Callback when crop box fine-tuned
  const handleSaveCrop = async (id, newImgBox) => {
    const card = cards.find((c, idx) => (c.id || `card_${idx}`) === id);
    const imgSrc = resolveCardImageSrc(card);

    setCardConfigs(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        imgBox: newImgBox,
        includeImage: true
      }
    }));

    if (imgSrc) {
      try {
        const cfg = cardConfigs[id] || {};
        const dataUrl = await cropAndMaskDiagram(
          imgSrc,
          newImgBox,
          [],
          cfg.imageSide || 'back',
          card?.type || 'Basic'
        );
        if (dataUrl) {
          setPreviewImages(prev => ({ ...prev, [id]: dataUrl }));
        }
      } catch (err) {
        console.error("Error updating preview after fine-tune crop:", err);
      }
    }
  };

  const handleFinalExport = async () => {
    const processedCards = cards.map((card, idx) => {
      const id = card.id || `card_${idx}`;
      const cfg = cardConfigs[id] || {};
      const finalFront = cfg.front !== undefined ? cfg.front : card.front;
      const finalBack = cfg.back !== undefined ? cfg.back : card.back;
      const finalText = cfg.text !== undefined ? cfg.text : card.text;
      const includeImg = Boolean(cfg.includeImage);

      return {
        ...card,
        front: finalFront,
        back: finalBack,
        text: finalText,
        has_image: includeImg,
        include_image: includeImg,
        img_box: includeImg ? cfg.imgBox : null,
        image_side: cfg.imageSide || card.image_side || 'back',
        cropped_data_url: includeImg ? (previewImages[id] || null) : null
      };
    });

    // Await the full export pipeline (Firestore batch + file download)
    // before closing the modal so the async zip/download isn't aborted.
    try {
      await onConfirmExport(processedCards);
    } catch (err) {
      console.error('[ExportVerificationModal] Export pipeline error:', err);
    }
    onClose();
  };

  const totalIncludedImages = Object.values(cardConfigs).filter(c => c.includeImage).length;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 w-full max-w-5xl rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/80 dark:bg-gray-800/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold shrink-0">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
                Pre-Export Image Verification
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-bold">
                  {totalIncludedImages} Images Selected
                </span>
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Review AI-cropped diagrams, fine-tune crop areas (drag & scale), and side placement before export.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-gray-600 transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation Header */}
        <div className="px-6 py-3 bg-gray-50/60 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab('uncertain')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 ${
                activeTab === 'uncertain'
                  ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-amber-50 hover:text-amber-600'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              AI Suggested / Uncertain ({uncertainCards.length})
            </button>

            <button
              onClick={() => setActiveTab('confirmed')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 ${
                activeTab === 'confirmed'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-emerald-50 hover:text-emerald-600'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Confirmed Images ({confirmedCards.length})
            </button>

            <button
              onClick={() => setActiveTab('textonly')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 ${
                activeTab === 'textonly'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-blue-50 hover:text-blue-600'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Text Only ({textOnlyCards.length})
            </button>
          </div>

          {activeTab === 'uncertain' && uncertainCards.length > 0 && (
            <button
              onClick={handleApproveAllUncertain}
              className="text-xs font-black bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl transition shadow-md shadow-amber-500/20"
            >
              Approve All Suggested
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isGenerating ? (
            <div className="py-16 text-center text-gray-400 flex flex-col items-center justify-center gap-3">
              <Sparkles className="w-8 h-8 text-amber-500 animate-spin" />
              <p className="text-sm font-bold text-gray-600 dark:text-gray-300">Auto-cropping diagrams & masking front labels...</p>
            </div>
          ) : displayedCards.length === 0 ? (
            <div className="py-12 text-center text-gray-400 dark:text-gray-600 font-bold text-sm">
              No cards in this category.
            </div>
          ) : (
            displayedCards.map((card, idx) => {
              const id = card.id || `card_${idx}`;
              const cfg = cardConfigs[id] || {};
              const previewImg = previewImages[id];
              const cardImgSrc = resolveCardImageSrc(card);

              return (
                <div
                  key={id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row gap-4 items-start ${
                    cfg.includeImage
                      ? 'border-blue-200 dark:border-blue-900 bg-blue-50/20 dark:bg-blue-950/10'
                      : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
                  }`}
                >
                  {/* Card Content Text */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                        {card.type} Card
                      </span>

                      {cfg.confidence > 0 && (
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                          cfg.confidence >= 70
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                        }`}>
                          {cfg.confidence}% AI Confidence
                        </span>
                      )}
                    </div>

                    {card.type === 'Basic' ? (
                      <div className="space-y-2 text-xs">
                        <div>
                          <label className="text-[10px] font-black text-blue-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                            <Edit3 className="w-3 h-3" /> Question (Front)
                          </label>
                          <textarea
                            value={cfg.front !== undefined ? cfg.front : (card.front || '')}
                            onChange={(e) => updateCardText(id, 'front', e.target.value)}
                            rows={2}
                            placeholder="Enter question..."
                            className="w-full text-xs font-bold text-gray-900 dark:text-white bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition resize-y shadow-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-emerald-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                            <Edit3 className="w-3 h-3" /> Answer (Back)
                          </label>
                          <textarea
                            value={cfg.back !== undefined ? cfg.back : (card.back || '')}
                            onChange={(e) => updateCardText(id, 'back', e.target.value)}
                            rows={2}
                            placeholder="Enter answer..."
                            className="w-full text-xs font-semibold text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none transition resize-y shadow-xs"
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="text-[10px] font-black text-purple-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                          <Edit3 className="w-3 h-3" /> Cloze Text
                        </label>
                        <textarea
                          value={cfg.text !== undefined ? cfg.text : (card.text || '')}
                          onChange={(e) => updateCardText(id, 'text', e.target.value)}
                          rows={3}
                          placeholder="Enter cloze text..."
                          className="w-full text-xs font-bold text-gray-900 dark:text-white bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 focus:outline-none transition resize-y font-mono shadow-xs"
                        />
                      </div>
                    )}

                    {/* Add/Fine-tune Image Crop button for text-only cards */}
                    {(!cfg.imgBox && cardImgSrc) && (
                      <button
                        onClick={() => handleOpenFineTune(card, id)}
                        className="mt-2 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1.5"
                      >
                        <Crop className="w-3.5 h-3.5" /> Add Manual Image Crop Box
                      </button>
                    )}
                  </div>

                  {/* Image Preview & Controls */}
                  {(cfg.imgBox || card.has_image || cfg.includeImage || cardImgSrc) && (
                    <div className="w-full md:w-80 lg:w-[380px] shrink-0 flex flex-col gap-2.5 p-4 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs">
                      <div className="relative aspect-4/3 min-h-[200px] bg-gray-900 rounded-xl overflow-hidden flex items-center justify-center border border-gray-700 group shadow-inner">
                        {previewImg || cardImgSrc ? (
                          <img src={previewImg || cardImgSrc} alt="Cropped Diagram" className="object-contain w-full h-full" />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-gray-400 p-2 text-center">
                            <ImageIcon className="w-6 h-6 mb-1 opacity-40 animate-pulse text-blue-400" />
                            <span className="text-[10px]">Loading Crop...</span>
                          </div>
                        )}
                        {cfg.occlusions && cfg.occlusions.length > 0 && (card.type === 'Cloze' || cfg.imageSide === 'front' || cfg.imageSide === 'both') && (
                          <span className="absolute top-1 right-1 text-[9px] bg-amber-500 text-white font-bold px-1.5 py-0.5 rounded shadow">
                            {cfg.occlusions.length} Masked
                          </span>
                        )}

                        {/* Hover Overlay to Fine-Tune Crop */}
                        {cardImgSrc && (
                          <button
                            onClick={() => handleOpenFineTune(card, id)}
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white font-bold text-xs"
                          >
                            <Crop className="w-4 h-4 text-blue-400" /> Fine-Tune Crop Box
                          </button>
                        )}
                      </div>

                      {/* Manual Fine-Tune Button */}
                      {cardImgSrc && (
                        <button
                          onClick={() => handleOpenFineTune(card, id)}
                          className="w-full py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition flex items-center justify-center gap-1.5"
                        >
                          <Crop className="w-3 h-3 text-blue-500" /> Fine-Tune Crop Box
                        </button>
                      )}

                      {/* Side Placement Controls */}
                      {card.type === 'Basic' && (
                        <div className="flex items-center justify-between gap-1 text-[10px]">
                          <span className="text-gray-500 dark:text-gray-400 font-bold">Attach to:</span>
                          <div className="flex items-center gap-1">
                            {['front', 'back', 'both'].map((side) => (
                              <button
                                key={side}
                                onClick={() => setSide(id, side)}
                                className={`px-2 py-0.5 rounded font-black uppercase transition ${
                                  cfg.imageSide === side
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                                }`}
                              >
                                {side}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Include Checkbox */}
                      <button
                        onClick={() => toggleIncludeImage(id)}
                        className={`w-full py-1.5 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition ${
                          cfg.includeImage
                            ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {cfg.includeImage ? <Check className="w-3.5 h-3.5" /> : null}
                        {cfg.includeImage ? 'Image Included' : 'Include Image'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition"
          >
            Cancel
          </button>

          <button
            onClick={handleFinalExport}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-blue-600/20 transition flex items-center gap-2 active:scale-95"
          >
            <Download className="w-4 h-4" />
            Proceed to Export ({totalIncludedImages} Images)
          </button>
        </div>

      </div>

      {/* Embedded Fine-Tune Crop Box Modal */}
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
