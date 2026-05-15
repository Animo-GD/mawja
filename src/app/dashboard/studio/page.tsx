'use client';

import { useRef, useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLang } from '@/lib/LanguageContext';
import { Eraser, Type, Undo2, Save, Loader2, Check, X, Image as ImageIcon, RotateCcw, Trash2, Paintbrush } from 'lucide-react';
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
  // Offscreen canvas holding the clean image before brush strokes
  const cleanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Brush strokes stored in canvas-space coordinates (no CSS scaling)
  const maskStrokesRef = useRef<{ x: number; y: number; radius: number }[]>([]);
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
  const [showTextModal, setShowTextModal] = useState(false);
  const [pendingText, setPendingText] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [fontSize, setFontSize] = useState(48);
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);
  const [fontFamily, setFontFamily] = useState('Inter');
  const [fontScript, setFontScript] = useState<'arabic' | 'english'>('english');

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
    const loadImg = (src: string) => {
      const img = new window.Image();
      // No crossOrigin needed for same-origin proxy — prevents canvas tainting
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        
        // Check for cached version or active background task
        const activeTask = backgroundTasks.get(mediaUrl);
        const cacheKey = `studio_cache_${mediaUrl}`;
        const cachedData = localStorage.getItem(cacheKey);

        if (activeTask) {
          setIsErasing(true);
          if (cachedData) {
             const cachedImg = new window.Image();
             cachedImg.onload = () => { ctx.drawImage(cachedImg, 0, 0); setIsLoaded(true); setUndoStack([{ imageData: ctx.getImageData(0, 0, canvas.width, canvas.height), texts: [] }]); };
             cachedImg.src = cachedData;
          } else {
             ctx.drawImage(img, 0, 0); setIsLoaded(true); setUndoStack([{ imageData: ctx.getImageData(0, 0, canvas.width, canvas.height), texts: [] }]);
          }

          activeTask.then(finalBase64 => {
             const finalImg = new window.Image();
             finalImg.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(finalImg, 0, 0);
                setUndoStack(prev => [...prev.slice(-19), { imageData: ctx.getImageData(0, 0, canvas.width, canvas.height), texts: prev.length > 0 ? prev[prev.length - 1].texts : [] }]);
                toast.success('Background task finished!');
                setIsErasing(false);
             };
             finalImg.src = finalBase64;
          }).catch(() => {
             toast.error('Background task failed');
             setIsErasing(false);
          });
        } else if (cachedData) {
          const cachedImg = new window.Image();
          cachedImg.onload = () => {
            ctx.drawImage(cachedImg, 0, 0);
            setIsLoaded(true);
            setUndoStack([{ imageData: ctx.getImageData(0, 0, canvas.width, canvas.height), texts: [] }]);
            toast.success('Work restored from cache');
          };
          cachedImg.src = cachedData;
        } else {
          ctx.drawImage(img, 0, 0);
          setIsLoaded(true);
          setUndoStack([{ imageData: ctx.getImageData(0, 0, canvas.width, canvas.height), texts: [] }]);
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

  const resetToOriginal = () => {
    if (!confirm('Discard all changes and reset to original?')) return;
    localStorage.removeItem(`studio_cache_${mediaUrl}`);
    window.location.reload();
  };

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
    maskStrokesRef.current = [];
    setHasMask(false);
    // Update the clean reference so brush mode starts fresh
    if (cleanCanvasRef.current) {
      cleanCanvasRef.current.getContext('2d')!.drawImage(canvas, 0, 0);
    }
    try {
      localStorage.setItem(`studio_cache_${mediaUrl}`, canvas.toDataURL('image/png', 0.8));
    } catch (e) {}
  }, [undoStack, mediaUrl]);

  // ── Capture clean canvas snapshot whenever brush mode is activated ──
  useEffect(() => {
    if (tool === 'brush' && isLoaded) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      maskStrokesRef.current = [];
      setHasMask(false);
      const offscreen = document.createElement('canvas');
      offscreen.width = canvas.width;
      offscreen.height = canvas.height;
      offscreen.getContext('2d')!.drawImage(canvas, 0, 0);
      cleanCanvasRef.current = offscreen;
    }
  }, [tool, isLoaded]);

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
      setSelectedTextId(null);
      setTextPos(pos);
      setShowTextModal(true);
    }
  };

  // ── Brush painting — draws directly on the main canvas ──────────────
  // All coordinates stored in canvas-space (canvas.width x canvas.height) — zero CSS scaling issues.

  const renderMaskOverlay = () => {
    const canvas = canvasRef.current;
    const clean = cleanCanvasRef.current;
    if (!canvas || !clean) return;
    const ctx = canvas.getContext('2d')!;
    // 1. Restore the pre-brush clean state
    ctx.drawImage(clean, 0, 0);
    // 2. Paint all accumulated strokes as a translucent red tint
    ctx.save();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.28)';
    for (const s of maskStrokesRef.current) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  const paintMask = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // scaleX converts CSS display pixels → canvas internal pixels
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    // Brush radius in canvas pixels: (brushSize/2 display px) * scaleX = correct canvas px
    const radius = (brushSize / 2) * scaleX;
    maskStrokesRef.current = [...maskStrokesRef.current, { x, y, radius }];
    setHasMask(true);
    renderMaskOverlay();
  };

  const clearMask = () => {
    maskStrokesRef.current = [];
    setHasMask(false);
    // Restore clean image (remove the painted overlay)
    const canvas = canvasRef.current;
    const clean = cleanCanvasRef.current;
    if (canvas && clean) {
      canvas.getContext('2d')!.drawImage(clean, 0, 0);
    }
  };

  const getMaskBase64 = (): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || maskStrokesRef.current.length === 0) return null;
    // Create a black background with white circles where strokes were
    const bw = document.createElement('canvas');
    bw.width = canvas.width;
    bw.height = canvas.height;
    const ctx = bw.getContext('2d')!;
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, bw.width, bw.height);
    ctx.fillStyle = 'white';
    for (const s of maskStrokesRef.current) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    return bw.toDataURL('image/png');
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

  // ── Erase logic (AI – Full Image) ────────────────────────────────
  const handleEraseSelection = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Brush mode: need a painted mask
    if (tool === 'brush' && !hasMask) return;
    // Select mode: need a drawn rectangle
    if (tool === 'select' && (!selection || selection.width < 1 || selection.height < 1)) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    
    saveSnapshot();
    setIsErasing(true);

    // For brush mode: send the CLEAN image (without red overlay), not the canvas which has the overlay baked in
    const fullCanvasBase64 = (tool === 'brush' && cleanCanvasRef.current)
      ? cleanCanvasRef.current.toDataURL('image/png')
      : canvas.toDataURL('image/png');
    const maskBase64 = tool === 'brush' ? getMaskBase64() : null;

    const processTask = async () => {
      try {
        const body = maskBase64
          ? { image: fullCanvasBase64, mask: maskBase64 }
          : { image: fullCanvasBase64, selection: { x: Math.round(selection!.x), y: Math.round(selection!.y), width: Math.round(selection!.width), height: Math.round(selection!.height) } };

        const response = await fetch('/api/studio/erase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'AI request failed');
        }

        const { result } = await response.json();

        // Cache the result
        try {
          localStorage.setItem(`studio_cache_${mediaUrl}`, result);
        } catch (e) {}

        return result;
      } catch (err) {

        throw err;
      }
    };

    const task = processTask();
    backgroundTasks.set(mediaUrl, task);

    try {
      const finalBase64 = await task;
      
      if (canvasRef.current) {
        const finalImg = new window.Image();
        finalImg.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(finalImg, 0, 0, canvas.width, canvas.height);
          // Update cleanCanvasRef to the NEW erased state so clearMask() doesn't revert it
          if (cleanCanvasRef.current) {
            cleanCanvasRef.current.getContext('2d')!.drawImage(canvas, 0, 0);
          }
          // Clear strokes without restoring old canvas
          maskStrokesRef.current = [];
          setHasMask(false);
          setUndoStack(prev => [...prev.slice(-19), { imageData: ctx.getImageData(0, 0, canvas.width, canvas.height), texts: texts }]);
          setSelection(null);
          setIsErasing(false);
          toast.success('AI Erase applied!');
        };
        finalImg.onerror = () => setIsErasing(false);
        finalImg.src = finalBase64;
      } else {
        toast.success('Background task finished successfully!');
        setIsErasing(false);
      }
    } catch (err: any) {
      if (canvasRef.current) toast.error(err.message || 'AI Erase failed');
      setIsErasing(false);
    } finally {
      backgroundTasks.delete(mediaUrl);
      setIsErasing(false);
    }
  };


  // ── Commit text ───────────────────────────────────────────────────
  const commitText = () => {
    if (!textPos || !pendingText.trim()) { setShowTextModal(false); return; }
    
    const newText: TextObject = {
      id: Math.random().toString(36).substr(2, 9),
      text: pendingText,
      x: textPos.x,
      y: textPos.y,
      fontSize: fontSize,
      color: textColor,
      fontFamily: fontFamily,
      fontScript: fontScript
    };

    setTexts(prev => [...prev, newText]);
    setSelectedTextId(newText.id);
    
    setPendingText('');
    setShowTextModal(false);
    setTextPos(null);
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

  // ── Save ──────────────────────────────────────────────────────────
  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas || !isLoaded) return;
    setIsSaving(true);

    // Create a temporary canvas to merge image and text
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tctx = tempCanvas.getContext('2d')!;
    
    // 1. Draw base image
    tctx.drawImage(canvas, 0, 0);

    // 2. Draw all text objects
    texts.forEach(t => {
      tctx.font = `bold ${t.fontSize}px "${t.fontFamily}", sans-serif`;
      tctx.fillStyle = t.color;
      tctx.textBaseline = 'middle';
      if (t.fontScript === 'arabic') {
        const metrics = tctx.measureText(t.text);
        tctx.fillText(t.text, t.x - metrics.width, t.y);
      } else {
        tctx.fillText(t.text, t.x, t.y);
      }
    });

    tempCanvas.toBlob(async (blob) => {
      if (!blob) { toast.error('Export failed'); setIsSaving(false); return; }
      try {
        const fd = new FormData();
        fd.append('file', blob, 'studio-edit.png');
        const res = await fetch('/api/studio/save-image', { method: 'POST', body: fd });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
        localStorage.removeItem(`studio_cache_${mediaUrl}`);
        toast.success('Saved to gallery!');
        router.push('/dashboard/gallery');
      } catch (err: any) {
        toast.error(err.message || 'Save failed');
      } finally {
        setIsSaving(false);
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
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 0, height: 'calc(100vh - 80px)', background: '#f5f5f5', borderRadius: 12, overflow: 'hidden', border: '1px solid #e8e8e8' }}>

      {/* ── Left Tool Panel ── */}
      <div style={{ background: '#fff', borderRight: '1px solid #ececec', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {/* Tools */}
        <div style={{ padding: '12px 8px', borderBottom: '1px solid #f0f0f0' }}>
          {([
            { id: 'select' as Tool, icon: <Eraser size={16} />, label: 'Retouch' },
            { id: 'brush' as Tool, icon: <Paintbrush size={16} />, label: 'Brush Erase' },
            { id: 'text'   as Tool, icon: <Type size={16} />,   label: 'Text' },
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

        {/* Selection action buttons */}
        {tool === 'select' && selection && selection.width > 2 && (
          <div style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '0.75rem', color: '#999', paddingLeft: 6 }}>
              {Math.round(selection.width)} × {Math.round(selection.height)}px selected
            </div>
            <button
              onClick={handleEraseSelection}
              disabled={isErasing}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 8, border: 'none', background: isErasing ? '#ccc' : '#ef4444', color: '#fff', cursor: isErasing ? 'not-allowed' : 'pointer', fontSize: '0.87rem', fontWeight: 600 }}
            >
              {isErasing ? <><Loader2 size={14} className="spin" /> Working…</> : <><Eraser size={14} /> AI Erase</>}
            </button>
            <button
              onClick={() => setSelection(null)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '7px 14px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.82rem', color: '#999' }}
            >
              <X size={12} /> Clear selection
            </button>
          </div>
        )}

        {/* Undo / Reset */}
        <div style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>
          <button onClick={undo} disabled={undoStack.length <= 1} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.87rem', color: '#444', opacity: undoStack.length <= 1 ? 0.4 : 1 }}>
            <Undo2 size={15} /> Undo
          </button>
          <button onClick={resetToOriginal} disabled={!isLoaded} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.87rem', color: '#444' }}>
            <RotateCcw size={15} /> Reset
          </button>
        </div>

        <div style={{ flex: 1 }} />

        {/* Save */}
        <div style={{ padding: 12, borderTop: '1px solid #f0f0f0' }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={isSaving || !isLoaded} style={{ width: '100%', justifyContent: 'center', borderRadius: 8, fontWeight: 600 }}>
            {isSaving ? <><Loader2 size={14} className="spin" style={{ marginInlineEnd: 7 }} />Saving…</> : <><Save size={14} style={{ marginInlineEnd: 7 }} />Download</>}
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
                  left: `${(t.x / canvasRef.current!.width) * 100}%`,
                  top: `${(t.y / canvasRef.current!.height) * 100}%`,
                  transform: t.fontScript === 'arabic' ? 'translateX(-100%) translateY(-50%)' : 'translateY(-50%)',
                  color: t.color, fontSize: `${(t.fontSize / canvasRef.current!.width) * (containerRef.current?.offsetWidth || 0)}px`,
                  fontFamily: `"${t.fontFamily}", sans-serif`, fontWeight: 'bold',
                  cursor: draggingId === t.id ? 'grabbing' : 'grab', userSelect: 'none', whiteSpace: 'nowrap',
                  padding: '3px 6px', border: isSelected ? '1.5px dashed rgba(99,102,241,0.8)' : '1.5px solid transparent',
                  borderRadius: 3, background: isSelected ? 'rgba(99,102,241,0.07)' : 'transparent',
                  zIndex: isSelected ? 10 : 5, pointerEvents: isErasing ? 'none' : 'auto'
                }}
              >{t.text}</div>
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

          {/* Brush erase controls — floating panel */}
          {tool === 'brush' && isLoaded && (
            <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 180, boxShadow: '0 4px 24px rgba(0,0,0,0.12)', zIndex: 8 }}>
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#555', marginBottom: 6 }}>Brush Size — {brushSize}px</div>
                <input type="range" min={10} max={150} value={brushSize} onChange={e => setBrushSize(+e.target.value)} style={{ width: '100%' }} />
              </div>
              <button
                onClick={handleEraseSelection}
                disabled={!hasMask || isErasing}
                style={{ background: hasMask && !isErasing ? '#ef4444' : '#ccc', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 12px', fontWeight: 600, fontSize: '0.85rem', cursor: hasMask && !isErasing ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
              >
                {isErasing ? <><Loader2 size={13} className="spin" /> Working…</> : <><Eraser size={13} /> AI Erase</>}
              </button>
              {hasMask && !isErasing && (
                <button onClick={clearMask} style={{ background: 'transparent', border: '1px solid #ddd', borderRadius: 8, padding: '7px 12px', fontSize: '0.82rem', cursor: 'pointer', color: '#666' }}>
                  Clear Mask
                </button>
              )}
            </div>
          )}
        </div>

        {/* Text input modal */}
        {showTextModal && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', zIndex: 10 }}>
            <div style={{ background: '#fff', borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 300, maxWidth: 400, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
              <p style={{ margin: 0, fontWeight: 600, color: '#111' }}>Add Text to Image</p>
              <div style={{ fontSize: '0.75rem', color: '#888', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Font: <strong>{fontFamily}</strong></span><span>·</span><span>{fontSize}px</span>
              </div>
              <input
                autoFocus
                style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: '10px 12px', fontSize: '1.05rem', fontFamily, direction: fontScript === 'arabic' ? 'rtl' : 'ltr', outline: 'none', color: '#111' }}
                placeholder={fontScript === 'arabic' ? 'اكتب النص هنا…' : 'Type your text…'}
                value={pendingText}
                onChange={e => setPendingText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') setShowTextModal(false); }}
              />
              {pendingText && (
                <div style={{ padding: '10px 14px', background: '#111', borderRadius: 8, fontFamily, fontSize: Math.min(fontSize, 32), color: textColor, direction: fontScript === 'arabic' ? 'rtl' : 'ltr', textAlign: fontScript === 'arabic' ? 'right' : 'left', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {pendingText}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={commitText}><Check size={15} style={{ marginInlineEnd: 6 }} /> Place</button>
                <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setShowTextModal(false); setPendingText(''); }}><X size={15} style={{ marginInlineEnd: 6 }} /> Cancel</button>
              </div>
            </div>
          </div>
        )}

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
