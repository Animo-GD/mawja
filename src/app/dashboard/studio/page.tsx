'use client';

import { useRef, useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLang } from '@/lib/LanguageContext';
import { MousePointer2, Eraser, Type, Undo2, Save, Loader2, Check, X, Image as ImageIcon, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

type Tool = 'select' | 'text';

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
                setUndoStack(prev => [...prev.slice(-19), ctx.getImageData(0, 0, canvas.width, canvas.height)]);
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
    canvas.getContext('2d', { willReadFrequently: true })!.putImageData(lastState.imageData, 0, 0);
    setTexts(lastState.texts);
    
    // Update cache to match undo state
    try {
      localStorage.setItem(`studio_cache_${mediaUrl}`, canvas.toDataURL('image/png', 0.8));
    } catch (e) {}
  }, [undoStack, mediaUrl]);

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

  // ── Mouse events ──────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isLoaded) return;
    const pos = getCanvasPos(e);

    if (tool === 'select') {
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

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
    setDraggingId(null);
    setDragStart(null);
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

  // ── Erase logic (AI Crop & Stitch) ──────────────────────────────
  const handleEraseSelection = async () => {
    if (!selection || !canvasRef.current || selection.width < 1 || selection.height < 1) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    
    saveSnapshot();
    setIsErasing(true);

    const padding = 40;
    const cropX = Math.max(0, selection.x - padding);
    const cropY = Math.max(0, selection.y - padding);
    const cropW = Math.min(canvas.width - cropX, selection.width + padding * 2);
    const cropH = Math.min(canvas.height - cropY, selection.height + padding * 2);

    const offCanvas = document.createElement('canvas');
    offCanvas.width = cropW;
    offCanvas.height = cropH;
    const offCtx = offCanvas.getContext('2d')!;
    
    offCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    const croppedBase64 = offCanvas.toDataURL('image/png');
    
    // Save full canvas state so the background task can stitch it even if component unmounts
    const fullCanvasBase64 = canvas.toDataURL('image/png');

    const processTask = async () => {
      try {
        const response = await fetch('/api/studio/erase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: croppedBase64,
            selection: {
              x: Math.round(selection.x - cropX),
              y: Math.round(selection.y - cropY),
              width: Math.round(selection.width),
              height: Math.round(selection.height),
              full_x: Math.round(selection.x),
              full_y: Math.round(selection.y)
            }
          })
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'AI request failed');
        }

        const { result } = await response.json();

        return new Promise<string>((resolve, reject) => {
          const origImg = new window.Image();
          origImg.crossOrigin = 'anonymous';
          origImg.onload = () => {
            const stitchCanvas = document.createElement('canvas');
            stitchCanvas.width = origImg.width;
            stitchCanvas.height = origImg.height;
            const stitchCtx = stitchCanvas.getContext('2d')!;
            stitchCtx.drawImage(origImg, 0, 0);

            const patchImg = new window.Image();
            patchImg.crossOrigin = 'anonymous';
            patchImg.onload = () => {
              stitchCtx.drawImage(patchImg, cropX, cropY, cropW, cropH);
              const finalBase64 = stitchCanvas.toDataURL('image/png', 0.8);
              
              try {
                localStorage.setItem(`studio_cache_${mediaUrl}`, finalBase64);
              } catch (e) {}
              
              resolve(finalBase64);
            };
            patchImg.onerror = () => reject(new Error('Failed to load AI patch'));
            patchImg.src = result;
          };
          origImg.onerror = () => reject(new Error('Failed to load original image'));
          origImg.src = fullCanvasBase64;
        });
      } catch (err) {
        throw err;
      }
    };

    const task = processTask();
    backgroundTasks.set(mediaUrl, task);

    try {
      const finalBase64 = await task;
      
      // If we are still mounted, update the canvas
      if (canvasRef.current) {
        const finalImg = new window.Image();
        finalImg.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(finalImg, 0, 0);
          setSelection(null);
          setIsErasing(false);
          toast.success('AI patch applied!');
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
        
        // Clear cache on success
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
    <div style={{ display: 'grid', gridTemplateColumns: '270px 1fr', gap: 20, height: 'calc(100vh - 148px)' }}>

      {/* ── Left Panel ── */}
      <div className="card-flat" style={{ border: '1px solid var(--color-border)', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' }}>
        <h2 className="text-subhead" style={{ marginBottom: 0 }}>Image Studio</h2>

        {/* Tool selector */}
        <div className="form-group">
          <label className="form-label">Active Tool</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {([
              { id: 'select' as Tool, icon: <MousePointer2 size={16} />, label: 'Select & Erase' },
              { id: 'text'   as Tool, icon: <Type size={16} />,          label: 'Text'           },
            ]).map(({ id, icon, label }) => (
              <button key={id}
                className={`btn ${tool === id ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flexDirection: 'column', gap: 4, padding: '10px 6px', fontSize: '0.72rem', justifyContent: 'center' }}
                onClick={() => { setTool(id); setSelection(null); }}
              >
                {icon}{label}
              </button>
            ))}
          </div>
        </div>

        {/* Selection options */}
        {tool === 'select' && (
          <>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Drag on the image to select an area, then click <strong>Erase Selection</strong> to remove it and fill with the surrounding background.
            </p>
            {selection && (
              <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem', color: '#6366f1' }}>
                Selection: {Math.round(selection.width)} × {Math.round(selection.height)}px
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                className="btn btn-danger"
                onClick={handleEraseSelection}
                disabled={!selection || isErasing || selection.width < 2}
                style={{ width: '100%', justifyContent: 'center', fontWeight: 600 }}
              >
                {isErasing
                  ? <><Loader2 size={14} className="spin" style={{ marginInlineEnd: 6 }} />Processing…</>
                  : <><Eraser size={14} style={{ marginInlineEnd: 6 }} />✨ AI Erase</>}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleLocalErase}
                disabled={!selection || isErasing || selection.width < 2}
                style={{ width: '100%', justifyContent: 'center' }}
                title="Fast, lower-quality erase that runs locally in your browser"
              >
                <Eraser size={14} style={{ marginInlineEnd: 6 }} /> Fast Erase (Local)
              </button>
            </div>
            {selection && (
              <button
                className="btn btn-secondary"
                onClick={() => setSelection(null)}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Clear Selection
              </button>
            )}
          </>
        )}

        {/* Text options */}
        {tool === 'text' && (
          <>
            <div className="form-group">
              <label className="form-label">Script</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <button
                  className={`btn btn-sm ${fontScript === 'english' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => { setFontScript('english'); setFontFamily('Inter'); }}
                >
                  English
                </button>
                <button
                  className={`btn btn-sm ${fontScript === 'arabic' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => { setFontScript('arabic'); setFontFamily('Cairo'); }}
                >
                  عربي
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Font</label>
              <select
                className="form-select"
                value={fontFamily}
                onChange={e => setFontFamily(e.target.value)}
                style={{ fontFamily }}
              >
                {(fontScript === 'arabic' ? ARABIC_FONTS : ENGLISH_FONTS).map(f => (
                  <option key={f.name} value={f.name} style={{ fontFamily: f.name }}>
                    {f.label}
                  </option>
                ))}
              </select>
              <div style={{
                marginTop: 8,
                padding: '8px 10px',
                background: 'var(--color-bg-warm)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                fontFamily,
                fontSize: '1rem',
                direction: fontScript === 'arabic' ? 'rtl' : 'ltr',
                color: 'var(--color-text-primary)',
                textAlign: fontScript === 'arabic' ? 'right' : 'left',
              }}>
                {fontScript === 'arabic' ? 'مرحبًا بالعالم' : 'Hello, World!'}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Text Color</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)}
                  style={{ width: 44, height: 38, border: 'none', borderRadius: 8, cursor: 'pointer', padding: 2 }} />
                <code style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{textColor}</code>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {['#ffffff', '#000000', '#f0ede6', '#1a1a2e', '#e8d5b7', '#c4a882', '#6366f1', '#ef4444'].map(c => (
                  <button key={c} onClick={() => setTextColor(c)}
                    style={{ width: 26, height: 26, borderRadius: 6, border: textColor === c ? '2px solid var(--color-accent)' : '1px solid var(--color-border)', background: c, cursor: 'pointer' }} />
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Size — {fontSize}px</label>
              <input type="range" min={12} max={200} value={fontSize} onChange={e => setFontSize(+e.target.value)} style={{ width: '100%' }} />
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', lineHeight: 1.55, margin: 0 }}>
              Click on the image to place text.
            </p>
          </>
        )}

        {/* Actions */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn btn-secondary" onClick={resetToOriginal} disabled={!isLoaded}
            style={{ width: '100%', justifyContent: 'center' }}>
            <RotateCcw size={15} style={{ marginInlineEnd: 8 }} /> Reset to Original
          </button>
          <button className="btn btn-secondary" onClick={undo} disabled={undoStack.length <= 1}
            style={{ width: '100%', justifyContent: 'center' }}>
            <Undo2 size={15} style={{ marginInlineEnd: 8 }} /> Undo
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={isSaving || !isLoaded}
            style={{ width: '100%', justifyContent: 'center' }}>
            {isSaving
              ? <><Loader2 size={15} className="spin" style={{ marginInlineEnd: 8 }} />Saving…</>
              : <><Save size={15} style={{ marginInlineEnd: 8 }} />Save to Gallery</>}
          </button>
        </div>

        {/* Selected Text Controls */}
        {selectedTextId && tool === 'text' && (
          <div className="card-flat" style={{ border: '1px solid var(--color-border)', borderRadius: 14, padding: 15, display: 'flex', flexDirection: 'column', gap: 12, marginTop: 15, background: 'rgba(99,102,241,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>Edit Text</h3>
              <button onClick={deleteSelectedText} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}>
                <Trash2 size={14} />
              </button>
            </div>
            
            <input 
              className="input-flat" 
              value={texts.find(t => t.id === selectedTextId)?.text || ''} 
              onChange={e => updateSelectedText({ text: e.target.value })}
              style={{ width: '100%', fontSize: '0.8rem', padding: '6px 10px' }}
              placeholder="Text content..."
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="color" value={texts.find(t => t.id === selectedTextId)?.color || '#ffffff'} onChange={e => updateSelectedText({ color: e.target.value })}
                style={{ width: 30, height: 30, border: 'none', padding: 0, background: 'none', cursor: 'pointer' }} />
              <input type="range" min={12} max={200} value={texts.find(t => t.id === selectedTextId)?.fontSize || 48} onChange={e => updateSelectedText({ fontSize: +e.target.value })} style={{ flex: 1 }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Canvas Area ── */}
      <div ref={containerRef} style={{ background: '#0d0d0d', borderRadius: 14, border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
        {!isLoaded && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: '#666' }}>
            <Loader2 size={32} className="spin" />
            <p style={{ fontSize: '0.88rem' }}>Loading image…</p>
          </div>
        )}

        <div 
          style={{ 
            position: 'relative', 
            display: isLoaded ? 'inline-block' : 'none', 
            maxWidth: '100%', 
            maxHeight: '100%',
            boxShadow: '0 0 20px rgba(0,0,0,0.3)',
            borderRadius: 8,
            overflow: 'hidden'
          }}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <canvas
            ref={canvasRef}
            style={{
              display: 'block',
              width: 'auto',
              height: 'auto',
              maxWidth: '100%',
              maxHeight: '100%',
              cursor: tool === 'select' ? 'crosshair' : 'text',
              touchAction: 'none',
            }}
            onMouseDown={onMouseDown}
          />

          {/* Text Objects Overlay */}
          {texts.map(t => {
            const isSelected = t.id === selectedTextId;
            return (
              <div
                key={t.id}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setSelectedTextId(t.id);
                  setTool('text');
                  setDraggingId(t.id);
                  const rect = canvasRef.current!.getBoundingClientRect();
                  const scaleX = canvasRef.current!.width / rect.width;
                  const scaleY = canvasRef.current!.height / rect.height;
                  setDragStart({
                    x: (e.clientX - rect.left) * scaleX - t.x,
                    y: (e.clientY - rect.top) * scaleY - t.y
                  });
                }}
                style={{
                  position: 'absolute',
                  left: `${(t.x / canvasRef.current!.width) * 100}%`,
                  top: `${(t.y / canvasRef.current!.height) * 100}%`,
                  transform: t.fontScript === 'arabic' ? 'translateX(-100%) translateY(-50%)' : 'translateY(-50%)',
                  color: t.color,
                  fontSize: `${(t.fontSize / canvasRef.current!.width) * (containerRef.current?.offsetWidth || 0)}px`, // Responsive size
                  fontFamily: `"${t.fontFamily}", sans-serif`,
                  fontWeight: 'bold',
                  cursor: draggingId === t.id ? 'grabbing' : 'grab',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                  padding: '4px 8px',
                  border: isSelected ? '2px solid #6366f1' : '2px solid transparent',
                  borderRadius: 4,
                  background: isSelected ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                  zIndex: isSelected ? 10 : 5,
                  pointerEvents: isErasing ? 'none' : 'auto'
                }}
              >
                {t.text}
              </div>
            );
          })}

          {selection && canvasRef.current && (
            <div style={{
              position: 'absolute',
              left: `${(selection.x / canvasRef.current.width) * 100}%`,
              top: `${(selection.y / canvasRef.current.height) * 100}%`,
              width: `${(selection.width / canvasRef.current.width) * 100}%`,
              height: `${(selection.height / canvasRef.current.height) * 100}%`,
              border: '2px dashed #6366f1',
              background: 'rgba(99, 102, 241, 0.12)',
              pointerEvents: 'none',
              zIndex: 5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {isErasing && (
                <div style={{ background: 'rgba(0,0,0,0.6)', padding: 12, borderRadius: 50, display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>
                  <Loader2 size={16} className="spin" />
                  <span style={{ fontSize: 12, fontWeight: 500 }}>AI is working...</span>
                </div>
              )}
            </div>
          )}
          
          {/* Block canvas interactions when processing */}
          {isErasing && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 10, cursor: 'not-allowed' }} />
          )}
        </div>

        {/* Text input modal */}
        {showTextModal && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 10,
          }}>
            <div className="card-flat" style={{ border: '1px solid var(--color-border)', borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 300, maxWidth: 400 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>Add Text to Image</p>
              
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Font: <strong>{fontFamily}</strong></span>
                <span>·</span>
                <span>{fontSize}px</span>
                <span>·</span>
                <span style={{ color: textColor, background: '#000', padding: '1px 6px', borderRadius: 4 }}>■</span>
              </div>
              
              <input
                autoFocus
                className="form-input"
                placeholder={fontScript === 'arabic' ? 'اكتب النص هنا…' : 'Type your text…'}
                value={pendingText}
                onChange={e => setPendingText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') setShowTextModal(false); }}
                style={{
                  fontFamily,
                  direction: fontScript === 'arabic' ? 'rtl' : 'ltr',
                  textAlign: fontScript === 'arabic' ? 'right' : 'left',
                  fontSize: '1.1rem',
                }}
              />
              
              {pendingText && (
                <div style={{
                  padding: '10px 14px',
                  background: '#111',
                  borderRadius: 8,
                  fontFamily,
                  fontSize: Math.min(fontSize, 32),
                  color: textColor,
                  direction: fontScript === 'arabic' ? 'rtl' : 'ltr',
                  textAlign: fontScript === 'arabic' ? 'right' : 'left',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                }}>
                  {pendingText}
                </div>
              )}
              
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={commitText}>
                  <Check size={15} style={{ marginInlineEnd: 6 }} /> Place
                </button>
                <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setShowTextModal(false); setPendingText(''); }}>
                  <X size={15} style={{ marginInlineEnd: 6 }} /> Cancel
                </button>
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
