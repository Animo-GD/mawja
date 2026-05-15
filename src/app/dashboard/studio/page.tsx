'use client';

import { useRef, useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLang } from '@/lib/LanguageContext';
import { Eraser, Type, Undo2, Save, Loader2, X, Image as ImageIcon, RotateCcw, Trash2, Paintbrush } from 'lucide-react';
import { toast } from 'react-hot-toast';

type Tool = 'select' | 'text' | 'brush';

interface TextObject {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontFamily: string;
  fontScript: 'arabic' | 'english';
  fontWeight: string;
  fontStyle: 'normal' | 'italic';
  opacity: number;
  letterSpacing: number;
  textTransform: 'none' | 'uppercase' | 'lowercase';
  shadowEnabled: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
}

const ARABIC_FONTS = [
  { name: 'Cairo', label: 'Cairo | قاهرة' },
  { name: 'Tajawal', label: 'Tajawal | تجوال' },
  { name: 'Almarai', label: 'Almarai | المراعي' },
  { name: 'Amiri', label: 'Amiri | أميري' },
  { name: 'Lemonada', label: 'Lemonada | ليمونادة' },
  { name: 'Reem Kufi', label: 'Reem Kufi | ريم كوفي' },
];

const ENGLISH_FONTS = [
  { name: 'Inter', label: 'Inter' },
  { name: 'Montserrat', label: 'Montserrat' },
  { name: 'Playfair Display', label: 'Playfair Display' },
  { name: 'Oswald', label: 'Oswald' },
  { name: 'Raleway', label: 'Raleway' },
  { name: 'Bebas Neue', label: 'Bebas Neue' },
  { name: 'Roboto Slab', label: 'Roboto Slab' },
];

// Global map to hold background tasks so they survive client-side navigations
const backgroundTasks = new Map<string, Promise<string>>();

// Helper: sample average color of a 5x5 area at (x, y)
function sampleCorner(ctx: CanvasRenderingContext2D, x: number, y: number, canvasW: number, canvasH: number): [number, number, number] {
  const sx = Math.max(0, Math.min(canvasW - 5, Math.round(x - 2)));
  const sy = Math.max(0, Math.min(canvasH - 5, Math.round(y - 2)));
  try {
    const data = ctx.getImageData(sx, sy, 5, 5);
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.data.length; i += 4) {
      r += data.data[i]; g += data.data[i+1]; b += data.data[i+2]; count++;
    }
    if (count === 0) return [255, 255, 255];
    return [Math.round(r/count), Math.round(g/count), Math.round(b/count)];
  } catch (e) {
    return [255, 255, 255]; // Fallback to white instead of gray
  }
}

// Helper: bilinear interpolation
function bilinear(tl: number, tr: number, bl: number, br: number, tx: number, ty: number): number {
  return Math.round(
    tl * (1 - tx) * (1 - ty) +
    tr * tx * (1 - ty) +
    bl * (1 - tx) * ty +
    br * tx * ty
  );
}

function StudioContent() {
  const { t } = useLang();
  const searchParams = useSearchParams();
  const router = useRouter();
  const mediaUrl = searchParams.get('media_url') || '';

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Offscreen canvas holding the clean image before any brush strokes
  const cleanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Offscreen mask canvas — accumulates strokes so renderMaskOverlay never loops all strokes
  const maskOverlayRef = useRef<HTMLCanvasElement | null>(null);
  // Tracks whether any strokes have been made (avoids expensive state update on every move)
  const hasMaskRef = useRef(false);
  // AbortController ref to cancel in-flight erase requests on unmount/navigation
  const eraseAbortRef = useRef<AbortController | null>(null);
  // Last brush point for lineTo continuous stroke
  const lastBrushPointRef = useRef<{ x: number; y: number } | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Tool state
  const [tool, setTool] = useState<Tool>('select');
  
  // Selection state
  const [selection, setSelection] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isErasing, setIsErasing] = useState(false);

  // Undo
  const [undoStack, setUndoStack] = useState<{ imageData: ImageData; texts: TextObject[] }[]>([]);

  // Text tool state
  const [pendingText, setPendingText] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [fontSize, setFontSize] = useState(48);
  const [fontFamily, setFontFamily] = useState('Inter');
  const [fontScript, setFontScript] = useState<'arabic' | 'english'>('english');
  const [fontWeight, setFontWeight] = useState('bold');
  const [fontStyle, setFontStyle] = useState<'normal' | 'italic'>('normal');
  const [textOpacity, setTextOpacity] = useState(1);
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [textTransform, setTextTransform] = useState<'none' | 'uppercase' | 'lowercase'>('none');
  const [shadowEnabled, setShadowEnabled] = useState(false);
  const [shadowColor, setShadowColor] = useState('#000000');
  const [shadowBlur, setShadowBlur] = useState(8);
  const [shadowOffsetX, setShadowOffsetX] = useState(3);
  const [shadowOffsetY, setShadowOffsetY] = useState(3);
  const [strokeEnabled, setStrokeEnabled] = useState(false);
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(2);

  // Multi-text state
  const [texts, setTexts] = useState<TextObject[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  // Brush/mask tool state
  const [brushSize, setBrushSize] = useState(40);
  const [isDrawingMask, setIsDrawingMask] = useState(false);
  const [hasMask, setHasMask] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  const isVideo = /\.(mp4|webm|ogg|mov)(\?|$)/i.test(mediaUrl);

  // Load Google Fonts dynamically
  useEffect(() => {
    const allFonts = [...ARABIC_FONTS, ...ENGLISH_FONTS].map(f => f.name.replace(/ /g, '+'));
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${allFonts.join('&family=')}&display=swap`;
    document.head.appendChild(link);
    return () => {
      if (document.head.contains(link)) {
        document.head.removeChild(link);
      }
    };
  }, []);

  // ── Load image onto canvas ────────────────────────────────────────
  useEffect(() => {
    if (!mediaUrl || isVideo) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const proxyUrl = `/api/studio/proxy-image?url=${encodeURIComponent(mediaUrl)}`;
    const loadImg = async (src: string) => {
      // 1. Fetch cloud draft first
      let draftData = null;
      try {
        const res = await fetch(`/api/studio/draft?media_url=${encodeURIComponent(mediaUrl)}`);
        if (res.ok) {
          const { draft } = await res.json();
          if (draft) draftData = draft;
        }
      } catch (e) { console.warn('Failed to fetch draft', e); }

      const img = new window.Image();
      // No crossOrigin needed for same-origin proxy — prevents canvas tainting
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        
        // ── Load cached image & texts ──
        let cachedData = draftData ? draftData.draft_image_url : null;
        let initialTexts: TextObject[] = draftData ? draftData.texts : [];
        
        // Fallback to localStorage if no draft
        if (!draftData) {
          try {
            const cacheKey = `studio_cache_${mediaUrl}`;
            cachedData = localStorage.getItem(cacheKey);
            const textKey = `studio_texts_${mediaUrl}`;
            const storedTexts = localStorage.getItem(textKey);
            if (storedTexts) initialTexts = JSON.parse(storedTexts);
          } catch (e) {}
        }

        const finalizeLoad = (imgToDraw: HTMLImageElement, isCache: boolean) => {
          ctx.drawImage(imgToDraw, 0, 0);
          setIsLoaded(true);
          setTexts(initialTexts);
          try {
            setUndoStack([{ imageData: ctx.getImageData(0, 0, canvas.width, canvas.height), texts: initialTexts }]);
          } catch (e) {
            console.warn('Canvas tainted when loading cache, undo state might be limited', e);
          }
          if (isCache) toast.success(draftData ? 'Draft loaded securely from cloud! ☁️' : 'Work restored from local cache');
        };

        if (cachedData) {
          const cachedImg = new window.Image();
          cachedImg.crossOrigin = 'anonymous'; // Important for proxy and data URLs
          cachedImg.onload = () => finalizeLoad(cachedImg, true);
          cachedImg.onerror = () => finalizeLoad(img, false); // Fallback to original if cache fails
          
          if (cachedData.startsWith('http')) {
            cachedImg.src = `/api/studio/proxy-image?url=${encodeURIComponent(cachedData)}`;
          } else {
            cachedImg.src = cachedData;
          }
        } else {
          finalizeLoad(img, false);
        }
      };
      img.onerror = () => toast.error('Failed to load image');
      img.src = src;
    };

    // Always load through proxy to avoid canvas CORS tainting
    loadImg(proxyUrl);
  }, [mediaUrl, isVideo]);

  // ── Helpers ───────────────────────────────────────────────────────
  const saveSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setUndoStack(prev => [...prev.slice(-19), { imageData: data, texts: [...texts] }]);
    
    // Persist to localStorage
    try {
      localStorage.setItem(`studio_cache_${mediaUrl}`, canvas.toDataURL('image/png', 0.8));
    } catch (e) {
      console.warn('Storage limit reached, caching disabled for this step');
    }
  }, [mediaUrl, texts]);

  const resetToOriginal = async () => {
    if (!confirm('Discard all changes and reset to original?')) return;
    localStorage.removeItem(`studio_cache_${mediaUrl}`);
    localStorage.removeItem(`studio_texts_${mediaUrl}`);
    try {
      await fetch(`/api/studio/draft?media_url=${encodeURIComponent(mediaUrl)}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Failed to delete cloud draft', e);
    }
    window.location.reload();
  };

  // ── Persist texts to localStorage whenever they change ──────────────
  useEffect(() => {
    if (!mediaUrl || !isLoaded) return;
    try {
      localStorage.setItem(`studio_texts_${mediaUrl}`, JSON.stringify(texts));
    } catch (e) {
      console.warn('Failed to cache texts');
    }
  }, [texts, mediaUrl, isLoaded]);

  const undo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || undoStack.length <= 1) return;
    const newStack = undoStack.slice(0, -1);
    setUndoStack(newStack);
    const lastState = newStack[newStack.length - 1];
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.putImageData(lastState.imageData, 0, 0);
    setTexts(lastState.texts);
    // Clear any brush mask so it doesn't linger after undo
    if (maskOverlayRef.current) {
      maskOverlayRef.current.getContext('2d')!
        .clearRect(0, 0, maskOverlayRef.current.width, maskOverlayRef.current.height);
    }
    hasMaskRef.current = false;
    setHasMask(false);
    // Update the clean reference so brush mode starts fresh from the undone state
    if (cleanCanvasRef.current) {
      cleanCanvasRef.current.getContext('2d')!.drawImage(canvas, 0, 0);
    }
    try {
      localStorage.setItem(`studio_cache_${mediaUrl}`, canvas.toDataURL('image/png', 0.8));
    } catch (e) {}
  }, [undoStack, mediaUrl]);

  // ── Capture clean canvas snapshot + init mask overlay when entering brush mode ──
  useEffect(() => {
    if (tool === 'brush' && isLoaded) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      hasMaskRef.current = false;
      setHasMask(false);
      // Snapshot the current canvas as the clean (pre-brush) state
      const clean = document.createElement('canvas');
      clean.width = canvas.width;
      clean.height = canvas.height;
      clean.getContext('2d')!.drawImage(canvas, 0, 0);
      cleanCanvasRef.current = clean;
      // Create an empty offscreen mask overlay canvas
      const overlay = document.createElement('canvas');
      overlay.width = canvas.width;
      overlay.height = canvas.height;
      maskOverlayRef.current = overlay;
    }
  }, [tool, isLoaded]);

  // ── Cleanup: cancel any in-flight erase request on unmount ──
  useEffect(() => {
    return () => { eraseAbortRef.current?.abort(); };
  }, []);

  // ── Delete selected text with keyboard ──────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      // Don't intercept when user is typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!selectedTextId) return;
      e.preventDefault();
      setTexts(prev => prev.filter(t => t.id !== selectedTextId));
      setSelectedTextId(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedTextId]);

  // ── Resume pending job on mount (user returned after navigating away) ──────
  useEffect(() => {
    if (!mediaUrl || !isLoaded) return;
    const key = `studio_job_${mediaUrl}`;
    const pending = localStorage.getItem(key);
    if (!pending) return;
    let parsed: { jobId: string; ts: number };
    try { parsed = JSON.parse(pending); } catch { localStorage.removeItem(key); return; }
    const { jobId } = parsed;
    if (!jobId) return;

    setIsErasing(true);
    toast('AI is still working in the background…', { icon: '⏳' });

    const poll = async () => {
      const MAX_WAIT_MS = 5 * 60 * 1000;
      const INTERVAL_MS = 4000;
      const start = Date.now();
      while (Date.now() - start < MAX_WAIT_MS) {
        await new Promise(r => setTimeout(r, INTERVAL_MS));
        if (!canvasRef.current) return; // navigated away again
        try {
          const res = await fetch(`/api/studio/job?jobId=${jobId}`);
          if (!res.ok) break;
          const data = await res.json();
          if (data.status === 'done' && data.result) {
            localStorage.removeItem(key);
            applyEraseResult(data.result);
            toast.success('AI Erase complete! Result applied.');
            setIsErasing(false);
            return;
          }
          if (data.status === 'failed') {
            localStorage.removeItem(key);
            toast.error(data.error || 'Background AI Erase failed');
            setIsErasing(false);
            return;
          }
        } catch { break; }
      }
      localStorage.removeItem(key);
      toast.error('AI Erase timed out. Please try again.');
      setIsErasing(false);
    };
    poll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, mediaUrl]);

  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const onMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    if (!isLoaded) return;
    const pos = getCanvasPos(e);

    if (tool === 'brush') {
      setIsDrawingMask(true);
      paintMask(e.clientX, e.clientY);
    } else if (tool === 'select') {
      setSelectedTextId(null);
      setSelectionStart(pos);
      setSelection({ x: pos.x, y: pos.y, width: 0, height: 0 });
      setIsSelecting(true);
    } else if (tool === 'text') {
      if (!pendingText.trim()) { toast.error('Type your text in the panel first'); return; }
      // Place text directly at click position — no modal
      const newText: TextObject = {
        id: Math.random().toString(36).substr(2, 9),
        text: pendingText,
        x: pos.x, y: pos.y,
        fontSize, color: textColor, fontFamily, fontScript,
        fontWeight, fontStyle,
        opacity: textOpacity, letterSpacing, textTransform,
        shadowEnabled, shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY,
        strokeEnabled, strokeColor, strokeWidth,
      };
      setTexts(prev => [...prev, newText]);
      setSelectedTextId(newText.id);
    }
  };

  // ── Brush painting — draws directly on the main canvas ──────────────
  // Uses an offscreen maskOverlayRef to accumulate strokes efficiently.
  // renderMaskOverlay: O(1) — always just 2 drawImage calls regardless of stroke count.

  const renderMaskOverlay = () => {
    const canvas = canvasRef.current;
    const clean = cleanCanvasRef.current;
    const overlay = maskOverlayRef.current;
    if (!canvas || !clean || !overlay) return;
    const ctx = canvas.getContext('2d')!;
    // Restore the pre-brush clean image
    ctx.drawImage(clean, 0, 0);
    // Composite the mask overlay at reduced opacity
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.drawImage(overlay, 0, 0);
    ctx.restore();
  };

  const paintMask = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const overlay = maskOverlayRef.current;
    if (!canvas || !overlay) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    const diameter = brushSize * scaleX; // lineWidth = full brush diameter

    const octx = overlay.getContext('2d')!;
    octx.lineWidth = diameter;
    octx.lineCap = 'round';
    octx.lineJoin = 'round';
    octx.strokeStyle = 'rgb(239, 68, 68)';
    octx.fillStyle = 'rgb(239, 68, 68)';

    const last = lastBrushPointRef.current;
    if (last) {
      // Connect to previous point → smooth continuous stroke
      octx.beginPath();
      octx.moveTo(last.x, last.y);
      octx.lineTo(x, y);
      octx.stroke();
    } else {
      // First point of a new stroke — draw a filled circle
      octx.beginPath();
      octx.arc(x, y, diameter / 2, 0, Math.PI * 2);
      octx.fill();
    }
    lastBrushPointRef.current = { x, y };
    renderMaskOverlay();
    if (!hasMaskRef.current) {
      hasMaskRef.current = true;
      setHasMask(true);
    }
  };

  const clearMask = () => {
    // Clear the offscreen overlay
    const overlay = maskOverlayRef.current;
    if (overlay) {
      overlay.getContext('2d')!.clearRect(0, 0, overlay.width, overlay.height);
    }
    hasMaskRef.current = false;
    setHasMask(false);
    // Restore clean image to main canvas
    const canvas = canvasRef.current;
    const clean = cleanCanvasRef.current;
    if (canvas && clean) {
      canvas.getContext('2d')!.drawImage(clean, 0, 0);
    }
  };

  const getMaskBase64 = (): string | null => {
    const overlay = maskOverlayRef.current;
    if (!overlay || !hasMaskRef.current) return null;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    // Build B&W mask: white where painted, black elsewhere
    const mask = document.createElement('canvas');
    mask.width = canvas.width;
    mask.height = canvas.height;
    const mctx = mask.getContext('2d')!;
    // Step 1: black background
    mctx.fillStyle = 'black';
    mctx.fillRect(0, 0, mask.width, mask.height);
    // Step 2: white where the overlay has painted pixels
    const helper = document.createElement('canvas');
    helper.width = canvas.width;
    helper.height = canvas.height;
    const hctx = helper.getContext('2d')!;
    hctx.fillStyle = 'white';
    hctx.fillRect(0, 0, helper.width, helper.height);
    hctx.globalCompositeOperation = 'destination-in'; // keep only where overlay is opaque
    hctx.drawImage(overlay, 0, 0);
    mctx.drawImage(helper, 0, 0);
    return mask.toDataURL('image/png');
  };

  // Compute bounding box of painted mask area (used as fallback `selection` for brush mode)
  const getMaskBoundingBox = (): { x: number; y: number; width: number; height: number } | null => {
    const overlay = maskOverlayRef.current;
    if (!overlay || !hasMaskRef.current) return null;
    const ctx = overlay.getContext('2d', { willReadFrequently: true })!;
    const { data, width, height } = ctx.getImageData(0, 0, overlay.width, overlay.height);
    let minX = width, minY = height, maxX = 0, maxY = 0, found = false;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 32) {
        const px = (i / 4) % width;
        const py = Math.floor(i / 4 / width);
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        found = true;
      }
    }
    return found ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null;
  };

  const onMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    // Always track cursor position for brush cursor display
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }

    if (tool === 'brush') {
      if (isDrawingMask) paintMask(e.clientX, e.clientY);
      return;
    }

    const pos = getCanvasPos(e);
    if (draggingId) {
      setTexts(prev => prev.map(t =>
        t.id === draggingId
          ? { ...t, x: pos.x - (dragStart?.x || 0), y: pos.y - (dragStart?.y || 0) }
          : t
      ));
      return;
    }
    if (!isSelecting || !selectionStart || tool !== 'select') return;
    setSelection({
      x: Math.max(0, Math.min(canvasRef.current!.width, Math.min(selectionStart.x, pos.x))),
      y: Math.max(0, Math.min(canvasRef.current!.height, Math.min(selectionStart.y, pos.y))),
      width: Math.abs(pos.x - selectionStart.x),
      height: Math.abs(pos.y - selectionStart.y),
    });
  };

  const onMouseUp = () => {
    lastBrushPointRef.current = null; // end of brush stroke
    setIsSelecting(false);
    setIsDrawingMask(false);
    setDraggingId(null);
    setDragStart(null);
  };

  const onMouseLeave = () => {
    onMouseUp();
    setCursorPos(null);
  };

  // ── Erase logic (Fast Local Fallback) ───────────────────────────
  const handleLocalErase = () => {
    if (!selection || !canvasRef.current || selection.width < 1 || selection.height < 1) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    
    saveSnapshot();

    try {
      // 1. Get average color of pixels just outside the selection (4px border)
      const p = 6;
      const sx = Math.max(0, Math.round(selection.x) - p);
      const sy = Math.max(0, Math.round(selection.y) - p);
      const sw = Math.min(canvas.width - sx, Math.round(selection.width) + p * 2);
      const sh = Math.min(canvas.height - sy, Math.round(selection.height) + p * 2);
      
      let avgR = 200, avgG = 200, avgB = 200; // neutral gray fallback
      try {
        const imgData = ctx.getImageData(sx, sy, sw, sh);
        let r = 0, g = 0, b = 0, count = 0;
        const innerX = Math.round(selection.x) - sx;
        const innerY = Math.round(selection.y) - sy;
        const innerW = Math.round(selection.width);
        const innerH = Math.round(selection.height);
        
        for (let y = 0; y < sh; y++) {
          for (let x = 0; x < sw; x++) {
            const isInside = x >= innerX && x < innerX + innerW && y >= innerY && y < innerY + innerH;
            if (!isInside) {
              const idx = (y * sw + x) * 4;
              // Only count if alpha > 0 and not suspiciously black (tainted canvas artifact)
              if (imgData.data[idx + 3] > 128) {
                r += imgData.data[idx];
                g += imgData.data[idx + 1];
                b += imgData.data[idx + 2];
                count++;
              }
            }
          }
        }
        if (count > 0) {
          avgR = Math.round(r / count);
          avgG = Math.round(g / count);
          avgB = Math.round(b / count);
        }
      } catch (e) {
        // Canvas tainted or getImageData failed — use neutral fallback
        console.warn('getImageData failed (tainted canvas?), using fallback color');
      }

      // 2. Draw solid average color — no ctx.filter (causes black artifacts)
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgb(${avgR}, ${avgG}, ${avgB})`;
      ctx.fillRect(Math.round(selection.x), Math.round(selection.y), Math.round(selection.width), Math.round(selection.height));
      ctx.restore();
      
      setSelection(null);
      
      try {
        localStorage.setItem(`studio_cache_${mediaUrl}`, canvas.toDataURL('image/png', 0.8));
      } catch (e) {}

      toast.success('Local Erase applied!');
    } catch (err) {
      toast.error('Local Erase failed');
      console.error(err);
    }
  };

  // ── Apply result image (shared by direct response + background poll) ────────
  const applyEraseResult = (resultUrl: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      if (cleanCanvasRef.current) cleanCanvasRef.current.getContext('2d')!.drawImage(canvas, 0, 0);
      if (maskOverlayRef.current) maskOverlayRef.current.getContext('2d')!.clearRect(0, 0, maskOverlayRef.current.width, maskOverlayRef.current.height);
      hasMaskRef.current = false;
      setHasMask(false);
      setSelection(null);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setUndoStack(prev => [...prev.slice(-19), { imageData: imgData, texts: prev.length > 0 ? prev[prev.length - 1].texts : [] }]);
      try { localStorage.setItem(`studio_cache_${mediaUrl}`, resultUrl); } catch (_) {}
    };
    img.onerror = () => toast.error('Failed to apply result image');
    if (resultUrl.startsWith('http')) {
      img.src = `/api/studio/proxy-image?url=${encodeURIComponent(resultUrl)}`;
    } else {
      img.src = resultUrl;
    }
  };

  // ── Erase logic (AI – Full Image) ────────────────────────────────
  const handleEraseSelection = async () => {
    const canvas = canvasRef.current;
    if (!canvas || isErasing) return;

    // Brush mode: need a painted mask AND a valid clean canvas
    if (tool === 'brush') {
      if (!hasMaskRef.current) return;
      if (!cleanCanvasRef.current) { toast.error('Canvas not ready, please try again'); return; }
    }
    // Select mode: need a drawn rectangle
    if (tool === 'select' && (!selection || selection.width < 1 || selection.height < 1)) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    setIsErasing(true);

    // Snapshot for undo BEFORE sending (works even if user leaves)
    const snapshotCtx = (tool === 'brush' && cleanCanvasRef.current)
      ? cleanCanvasRef.current.getContext('2d', { willReadFrequently: true })!
      : ctx;
    const snapshotCanvas = (tool === 'brush' && cleanCanvasRef.current) || canvas;
    setUndoStack(prev => [...prev.slice(-19), {
      imageData: snapshotCtx.getImageData(0, 0, snapshotCanvas.width, snapshotCanvas.height),
      texts: [...texts],
    }]);

    const fullCanvasBase64 = (tool === 'brush' && cleanCanvasRef.current)
      ? cleanCanvasRef.current.toDataURL('image/png')
      : canvas.toDataURL('image/png');
    const maskBase64 = tool === 'brush' ? getMaskBase64() : null;

    // Generate jobId + persist BEFORE the fetch so navigation won't lose it
    const jobId = crypto.randomUUID();
    const jobKey = `studio_job_${mediaUrl}`;
    localStorage.setItem(jobKey, JSON.stringify({ jobId, ts: Date.now() }));

    try {
      let body: Record<string, unknown>;
      if (tool === 'brush') {
        const bbox = getMaskBoundingBox();
        body = {
          image: fullCanvasBase64,
          mask: maskBase64,
          jobId,
          mediaUrl,
          ...(bbox ? { selection: { x: Math.round(bbox.x), y: Math.round(bbox.y), width: Math.round(bbox.width), height: Math.round(bbox.height) } } : {}),
        };
      } else {
        body = {
          image: fullCanvasBase64,
          jobId,
          mediaUrl,
          selection: {
            x: Math.round(selection!.x), y: Math.round(selection!.y),
            width: Math.round(selection!.width), height: Math.round(selection!.height),
          },
        };
      }

      // ⚠️  NO AbortSignal — server ALWAYS completes even if client navigates away
      const response = await fetch('/api/studio/erase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        // ── Insufficient credits ──
        if (response.status === 402) {
          localStorage.removeItem(jobKey); // no job was created, don't poll
          throw new Error(`Not enough credits. You need ${errBody.required ?? '?'} credits but have ${errBody.balance ?? 0}. Please top up.`);
        }
        throw new Error(errBody.error || `Server error ${response.status}`);
      }

      const { result } = await response.json();
      if (!result) throw new Error('No result returned from AI');

      localStorage.removeItem(jobKey);
      if (canvasRef.current) {
        applyEraseResult(result);
        toast.success('AI Erase applied!');
      }
    } catch (err: any) {
      // If user navigated away while fetch was running, the component may be unmounted.
      // The job is already persisted in localStorage + Supabase, so it will resume on return.
      if (canvasRef.current) {
        toast.error(err.message || 'AI Erase failed');
        localStorage.removeItem(jobKey);
      }
    } finally {
      if (canvasRef.current) setIsErasing(false);
    }
  };


  const updateSelectedText = (updates: Partial<TextObject>) => {
    if (!selectedTextId) return;
    setTexts(prev => prev.map(t => t.id === selectedTextId ? { ...t, ...updates } : t));
  };

  const deleteSelectedText = () => {
    if (!selectedTextId) return;
    setTexts(prev => prev.filter(t => t.id !== selectedTextId));
    setSelectedTextId(null);
  };

  const [isSavingDraft, setIsSavingDraft] = useState(false);

  // ── Save to Gallery ──────────────────────────────────────────────
  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !isLoaded) return;
    setIsSaving(true);

    // Composite image + all text overlays onto a temp canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tctx = tempCanvas.getContext('2d')!;
    tctx.drawImage(canvas, 0, 0);
    texts.forEach(t => {
      const displayText = t.textTransform === 'uppercase' ? t.text.toUpperCase()
        : t.textTransform === 'lowercase' ? t.text.toLowerCase() : t.text;
      tctx.save();
      tctx.globalAlpha = t.opacity ?? 1;
      tctx.font = `${t.fontStyle ?? 'normal'} ${t.fontWeight ?? 'bold'} ${t.fontSize}px "${t.fontFamily}", sans-serif`;
      tctx.textBaseline = 'middle';
      (tctx as any).letterSpacing = `${t.letterSpacing ?? 0}px`;
      if (t.shadowEnabled) {
        tctx.shadowColor = t.shadowColor;
        tctx.shadowBlur = t.shadowBlur;
        tctx.shadowOffsetX = t.shadowOffsetX;
        tctx.shadowOffsetY = t.shadowOffsetY;
      }
      tctx.fillStyle = t.color;
      const xPos = t.fontScript === 'arabic' ? t.x - tctx.measureText(displayText).width : t.x;
      tctx.fillText(displayText, xPos, t.y);
      if (t.strokeEnabled && t.strokeWidth > 0) {
        tctx.shadowBlur = 0; tctx.shadowColor = 'transparent';
        tctx.strokeStyle = t.strokeColor;
        tctx.lineWidth = t.strokeWidth;
        tctx.lineJoin = 'round';
        tctx.strokeText(displayText, xPos, t.y);
      }
      tctx.restore();
    });

    tempCanvas.toBlob(async (blob) => {
      if (!blob) { toast.error('Export failed'); setIsSaving(false); return; }
      try {
        const formData = new FormData();
        formData.append('file', blob, `studio_${Date.now()}.png`);
        const res = await fetch('/api/studio/save-image', { method: 'POST', body: formData });
        if (!res.ok) {
          const { error } = await res.json();
          throw new Error(error || `Upload failed (${res.status})`);
        }
        toast.success(t('toast_gallery_saved'), { duration: 3000 });
      } catch (err: any) {
        toast.error(t('toast_gallery_failed'));
      } finally {
        setIsSaving(false);
      }
    }, 'image/png');
  };

  // ── Save as Draft ────────────────────────────────────────────────
  const handleSaveDraft = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !isLoaded || !mediaUrl) return;
    setIsSavingDraft(true);

    canvas.toBlob(async (blob) => {
      if (!blob) { toast.error('Export failed'); setIsSavingDraft(false); return; }
      try {
        const formData = new FormData();
        formData.append('file', blob);
        formData.append('media_url', mediaUrl);
        formData.append('texts', JSON.stringify(texts));
        
        const res = await fetch('/api/studio/draft', { method: 'POST', body: formData });
        if (!res.ok) {
          const { error } = await res.json();
          throw new Error(error || `Draft save failed (${res.status})`);
        }
        toast.success(t('toast_draft_saved'), { duration: 3000 });
      } catch (err: any) {
        toast.error(t('toast_draft_failed'));
      } finally {
        setIsSavingDraft(false);
      }
    }, 'image/png');
  };


  if (!mediaUrl || isVideo) {
    return (
      <div className="empty-state" style={{ marginTop: 60 }}>
        <ImageIcon size={48} style={{ opacity: 0.3 }} />
        <p style={{ marginTop: 16 }}>
          {isVideo
            ? 'Studio only supports images. Select an image from the Gallery.'
            : 'No image selected. Go to Gallery and click "Edit in Studio".'}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 0, height: 'calc(100vh - 80px)', background: '#f5f5f5', borderRadius: 12, overflow: 'hidden', border: '1px solid #e8e8e8' }}>

      {/* ── Left Tool Panel ── */}
      <div style={{ background: '#fff', borderRight: '1px solid #ececec', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {/* Tools */}
        <div style={{ padding: '12px 8px', borderBottom: '1px solid #f0f0f0' }}>
          {([
            { id: 'select' as Tool, icon: <Eraser size={16} />, label: t('studio_tool_select') },
            { id: 'brush' as Tool, icon: <Paintbrush size={16} />, label: t('studio_tool_brush') },
            { id: 'text'   as Tool, icon: <Type size={16} />,   label: t('studio_add_text') },
          ]).map(({ id, icon, label }) => (
            <button
              key={id}
              onClick={() => { setTool(id); setSelection(null); if (id !== 'brush') clearMask(); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '11px 14px', borderRadius: 8, marginBottom: 2,
                background: tool === id ? '#f0f0f0' : 'transparent',
                border: 'none', cursor: 'pointer', fontSize: '0.9rem', fontWeight: tool === id ? 600 : 400,
                color: '#222',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{icon} {label}</span>
              {tool === id && <X size={13} style={{ color: '#999' }} onClick={e => { e.stopPropagation(); setTool('select'); setSelection(null); clearMask(); }} />}
            </button>
          ))}
        </div>

        {/* Brush panel — in sidebar, not floating on canvas */}
        {tool === 'brush' && isLoaded && (
          <div style={{ padding: '12px 10px', borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#555', paddingLeft: 4 }}>{t('studio_brush_size')} — {brushSize}px</div>
            <input type="range" min={10} max={150} value={brushSize} onChange={e => setBrushSize(+e.target.value)} style={{ width: '100%' }} />
            <button
              onClick={handleEraseSelection}
              disabled={!hasMask || isErasing}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, border: 'none', background: hasMask && !isErasing ? '#ef4444' : '#ccc', color: '#fff', cursor: hasMask && !isErasing ? 'pointer' : 'not-allowed', fontSize: '0.87rem', fontWeight: 600 }}
            >
              {isErasing ? <><Loader2 size={14} className="spin" /> {t('studio_erasing')}</> : <><Eraser size={14} /> {t('studio_erase_selection')}</>}
            </button>
            {hasMask && !isErasing && (
              <button onClick={clearMask} style={{ width: '100%', background: 'transparent', border: '1px solid #ddd', borderRadius: 8, padding: '7px 12px', fontSize: '0.82rem', cursor: 'pointer', color: '#666' }}>{t('studio_reset')}</button>
            )}
            {isErasing && <div style={{ fontSize: '0.75rem', color: '#888', textAlign: 'center' }}>{t('studio_erasing')}</div>}
          </div>
        )}

        {/* Selection action buttons */}
        {tool === 'select' && selection && selection.width > 2 && (
          <div style={{ padding: '10px 10px', borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '0.75rem', color: '#999', paddingLeft: 4 }}>{Math.round(selection.width)} × {Math.round(selection.height)}px</div>
            <button onClick={handleEraseSelection} disabled={isErasing}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, border: 'none', background: isErasing ? '#ccc' : '#ef4444', color: '#fff', cursor: isErasing ? 'not-allowed' : 'pointer', fontSize: '0.87rem', fontWeight: 600 }}
            >{isErasing ? <><Loader2 size={14} className="spin" /> {t('studio_erasing')}</> : <><Eraser size={14} /> {t('studio_erase_selection')}</>}</button>
            <button onClick={() => setSelection(null)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.82rem', color: '#999' }}
            ><X size={12} /> Clear</button>
          </div>
        )}

        {/* Text panel — in sidebar when text tool is active */}
        {tool === 'text' && (
          <div style={{ padding: '12px 10px', borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: 11, overflowY: 'auto' }}>
            {/* Text input */}
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#555', marginBottom: 4 }}>{t('studio_add_text')}</div>
              <textarea rows={2} value={pendingText} onChange={e => setPendingText(e.target.value)}
                placeholder={t('studio_text_placeholder')}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #e5e5e5', fontSize: '0.88rem', resize: 'none', fontFamily, fontWeight, fontStyle, direction: fontScript === 'arabic' ? 'rtl' : 'ltr', boxSizing: 'border-box' }}
              />
            </div>
            {/* Script toggle */}
            <div style={{ display: 'flex', gap: 5 }}>
              {(['english', 'arabic'] as const).map(s => (
                <button key={s} onClick={() => setFontScript(s)}
                  style={{ flex: 1, padding: '6px', borderRadius: 7, border: '1px solid', borderColor: fontScript === s ? '#6366f1' : '#e5e5e5', background: fontScript === s ? '#ede9fe' : 'transparent', color: fontScript === s ? '#6366f1' : '#555', fontWeight: 600, cursor: 'pointer', fontSize: '0.78rem' }}
                >{s === 'arabic' ? 'عربي' : 'English'}</button>
              ))}
            </div>
            {/* Font family */}
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#555', marginBottom: 4 }}>{t('studio_font')}</div>
              <select value={fontFamily} onChange={e => setFontFamily(e.target.value)}
                style={{ width: '100%', padding: '7px 8px', borderRadius: 7, border: '1px solid #e5e5e5', fontSize: '0.82rem', fontFamily }}>
                {(fontScript === 'arabic' ? ARABIC_FONTS : ENGLISH_FONTS).map(f => (
                  <option key={f.name} value={f.name}>{f.name}</option>
                ))}
              </select>
            </div>
            {/* Size + Weight */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#555', marginBottom: 4 }}>{t('studio_text_size')}</div>
                <input type="number" min={10} max={300} value={fontSize} onChange={e => setFontSize(+e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid #e5e5e5', fontSize: '0.85rem', boxSizing: 'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#555', marginBottom: 4 }}>Weight</div>
                <select value={fontWeight} onChange={e => setFontWeight(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid #e5e5e5', fontSize: '0.82rem' }}>
                  {['300','400','600','bold','700','900'].map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            </div>
            {/* Style + Transform */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#555', marginBottom: 4 }}>Style</div>
                <select value={fontStyle} onChange={e => setFontStyle(e.target.value as any)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid #e5e5e5', fontSize: '0.82rem' }}>
                  <option value="normal">Normal</option>
                  <option value="italic">Italic</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#555', marginBottom: 4 }}>Case</div>
                <select value={textTransform} onChange={e => setTextTransform(e.target.value as any)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid #e5e5e5', fontSize: '0.82rem' }}>
                  <option value="none">None</option>
                  <option value="uppercase">UPPER</option>
                  <option value="lowercase">lower</option>
                </select>
              </div>
            </div>
            {/* Color + Opacity */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#555', marginBottom: 4 }}>{t('studio_color')}</div>
                <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)}
                  style={{ width: '100%', height: 34, borderRadius: 7, border: '1px solid #e5e5e5', cursor: 'pointer', padding: 2 }} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#555', marginBottom: 4 }}>Opacity {Math.round(textOpacity * 100)}%</div>
                <input type="range" min={0} max={1} step={0.05} value={textOpacity} onChange={e => setTextOpacity(+e.target.value)} style={{ width: '100%', marginTop: 8 }} />
              </div>
            </div>
            {/* Letter spacing */}
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#555', marginBottom: 4 }}>{t('studio_letter_spacing')} — {letterSpacing}px</div>
              <input type="range" min={-5} max={30} value={letterSpacing} onChange={e => setLetterSpacing(+e.target.value)} style={{ width: '100%' }} />
            </div>
            {/* Shadow toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', color: '#444' }}>
              <input type="checkbox" checked={shadowEnabled} onChange={e => setShadowEnabled(e.target.checked)} style={{ accentColor: '#6366f1', width: 14, height: 14 }} />
              {t('studio_shadow')}
            </label>
            {shadowEnabled && (
              <div style={{ paddingLeft: 6, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: 3 }}>Color</div>
                    <input type="color" value={shadowColor} onChange={e => setShadowColor(e.target.value)} style={{ width: '100%', height: 30, borderRadius: 6, border: '1px solid #e5e5e5', padding: 2 }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: 3 }}>Blur {shadowBlur}px</div>
                    <input type="range" min={0} max={40} value={shadowBlur} onChange={e => setShadowBlur(+e.target.value)} style={{ width: '100%', marginTop: 7 }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: 3 }}>X {shadowOffsetX}px</div>
                    <input type="range" min={-20} max={20} value={shadowOffsetX} onChange={e => setShadowOffsetX(+e.target.value)} style={{ width: '100%', marginTop: 7 }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: 3 }}>Y {shadowOffsetY}px</div>
                    <input type="range" min={-20} max={20} value={shadowOffsetY} onChange={e => setShadowOffsetY(+e.target.value)} style={{ width: '100%', marginTop: 7 }} />
                  </div>
                </div>
              </div>
            )}
            {/* Stroke toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', color: '#444' }}>
              <input type="checkbox" checked={strokeEnabled} onChange={e => setStrokeEnabled(e.target.checked)} style={{ accentColor: '#6366f1', width: 14, height: 14 }} />
              {t('studio_stroke')}
            </label>
            {strokeEnabled && (
              <div style={{ paddingLeft: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: 3 }}>Color</div>
                  <input type="color" value={strokeColor} onChange={e => setStrokeColor(e.target.value)} style={{ width: '100%', height: 30, borderRadius: 6, border: '1px solid #e5e5e5', padding: 2 }} />
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: 3 }}>Width {strokeWidth}px</div>
                  <input type="range" min={1} max={10} value={strokeWidth} onChange={e => setStrokeWidth(+e.target.value)} style={{ width: '100%', marginTop: 7 }} />
                </div>
              </div>
            )}
            {/* Hint */}
            <div style={{ fontSize: '0.73rem', color: '#aaa', textAlign: 'center', padding: '4px 0', borderTop: '1px dashed #f0f0f0', marginTop: 2 }}>
              {t('studio_hint_click')}
            </div>
          </div>
        )}

        {/* Undo / Reset */}
        <div style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>
          <button onClick={undo} disabled={undoStack.length <= 1} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.87rem', color: '#444', opacity: undoStack.length <= 1 ? 0.4 : 1 }}>
            <Undo2 size={15} /> {t('studio_undo')}
          </button>
          <button onClick={resetToOriginal} disabled={!isLoaded} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.87rem', color: '#444' }}>
            <RotateCcw size={15} /> {t('studio_reset')}
          </button>
        </div>

        <div style={{ flex: 1 }} />

        {/* Save */}
        <div style={{ padding: 12, borderTop: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleSaveDraft} disabled={isSavingDraft || !isLoaded} style={{ width: '100%', justifyContent: 'center', borderRadius: 8, fontWeight: 600, border: '1px solid #e5e5e5', background: '#fff' }}>
            {isSavingDraft ? <><Loader2 size={14} className="spin" style={{ marginInlineEnd: 7 }} />{t('studio_saving')}</> : <><Save size={14} style={{ marginInlineEnd: 7 }} />{t('studio_save_draft')}</>}
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={isSaving || !isLoaded} style={{ width: '100%', justifyContent: 'center', borderRadius: 8, fontWeight: 600 }}>
            {isSaving ? <><Loader2 size={14} className="spin" style={{ marginInlineEnd: 7 }} />{t('studio_exporting')}</> : <><Save size={14} style={{ marginInlineEnd: 7 }} />{t('studio_export_gallery')}</>}
          </button>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div ref={containerRef} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative', background: '#f5f5f5' }}>
        {!isLoaded && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: '#aaa' }}>
            <Loader2 size={32} className="spin" />
            <p style={{ fontSize: '0.88rem' }}>Loading image…</p>
          </div>
        )}

        <div
          style={{ position: 'relative', display: isLoaded ? 'inline-block' : 'none', maxWidth: '100%', maxHeight: '100%', boxShadow: '0 8px 48px rgba(0,0,0,0.14)', overflow: 'hidden', cursor: tool === 'brush' ? 'none' : 'auto' }}
          onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}
        >
          <canvas
            ref={canvasRef}
            style={{ display: 'block', width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: 'calc(100vh - 100px)', cursor: tool === 'select' ? 'crosshair' : tool === 'brush' ? 'none' : 'text', touchAction: 'none' }}
            onMouseDown={onMouseDown}
          />
          {/* Brush mask drawn directly on main canvas — no overlay canvas needed */}
          {/* Visual brush cursor circle */}
          {tool === 'brush' && cursorPos && (
            <div style={{
              position: 'absolute',
              left: cursorPos.x,
              top: cursorPos.y,
              width: brushSize,
              height: brushSize,
              transform: 'translate(-50%, -50%)',
              border: '2px solid rgba(239,68,68,0.9)',
              background: 'rgba(239,68,68,0.15)',
              borderRadius: '50%',
              pointerEvents: 'none',
              zIndex: 20,
            }} />
          )}

          {/* Text Objects Overlay */}
          {texts.map(t => {
            const isSelected = t.id === selectedTextId;
            const displayText = (t.textTransform === 'uppercase' ? t.text.toUpperCase() : t.textTransform === 'lowercase' ? t.text.toLowerCase() : t.text);
            const scaledFs = (t.fontSize / (canvasRef.current?.width || 1)) * (containerRef.current?.offsetWidth || 0);
            return (
              <div key={t.id}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setSelectedTextId(t.id); setTool('text'); setDraggingId(t.id);
                  const rect = canvasRef.current!.getBoundingClientRect();
                  const scaleX = canvasRef.current!.width / rect.width;
                  const scaleY = canvasRef.current!.height / rect.height;
                  setDragStart({ x: (e.clientX - rect.left) * scaleX - t.x, y: (e.clientY - rect.top) * scaleY - t.y });
                }}
                style={{
                  position: 'absolute',
                  left: `${(t.x / (canvasRef.current?.width || 1)) * 100}%`,
                  top: `${(t.y / (canvasRef.current?.height || 1)) * 100}%`,
                  transform: t.fontScript === 'arabic' ? 'translateX(-100%) translateY(-50%)' : 'translateY(-50%)',
                  color: t.color,
                  fontSize: `${scaledFs}px`,
                  fontFamily: `"${t.fontFamily}", sans-serif`,
                  fontWeight: t.fontWeight ?? 'bold',
                  fontStyle: t.fontStyle ?? 'normal',
                  opacity: t.opacity ?? 1,
                  letterSpacing: `${(t.letterSpacing ?? 0) * (scaledFs / (t.fontSize || 1))}px`,
                  textTransform: (t.textTransform ?? 'none') as any,
                  textShadow: t.shadowEnabled ? `${t.shadowOffsetX}px ${t.shadowOffsetY}px ${t.shadowBlur}px ${t.shadowColor}` : 'none',
                  WebkitTextStroke: t.strokeEnabled ? `${t.strokeWidth}px ${t.strokeColor}` : undefined,
                  cursor: draggingId === t.id ? 'grabbing' : 'grab', userSelect: 'none', whiteSpace: 'nowrap',
                  padding: '3px 6px', border: isSelected ? '1.5px dashed rgba(99,102,241,0.8)' : '1.5px solid transparent',
                  borderRadius: 3, background: isSelected ? 'rgba(99,102,241,0.07)' : 'transparent',
                  zIndex: isSelected ? 10 : 5, pointerEvents: isErasing ? 'none' : 'auto'
                }}
              >{displayText}</div>
            );
          })}

          {/* Selection Overlay */}
          {selection && canvasRef.current && (
            <div style={{
              position: 'absolute',
              left: `${(selection.x / canvasRef.current.width) * 100}%`,
              top: `${(selection.y / canvasRef.current.height) * 100}%`,
              width: `${(selection.width / canvasRef.current.width) * 100}%`,
              height: `${(selection.height / canvasRef.current.height) * 100}%`,
              border: '1.5px dashed #6366f1', background: 'rgba(99,102,241,0.09)',
              pointerEvents: 'none', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {isErasing && (
                <div style={{ background: 'rgba(0,0,0,0.6)', padding: '7px 14px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 8, color: '#fff', fontSize: 12 }}>
                  <Loader2 size={13} className="spin" /> AI is working...
                </div>
              )}
            </div>
          )}
          {isErasing && <div style={{ position: 'absolute', inset: 0, zIndex: 10, cursor: 'not-allowed' }} />}
        </div>

      </div>
    </div>
  );
}

export default function StudioPage() {
  const { t } = useLang();
  return (
    <div>
      <div className="page-header">
        <h1 className="text-heading">{t('page_studio_title')}</h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.92rem', marginTop: 4 }}>
          {t('page_studio_sub')}
        </p>
      </div>
      <Suspense fallback={
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <Loader2 size={32} className="spin" style={{ color: 'var(--color-text-muted)' }} />
        </div>
      }>
        <StudioContent />
      </Suspense>
    </div>
  );
}
