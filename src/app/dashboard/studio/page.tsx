'use client';

import { useRef, useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLang } from '@/lib/LanguageContext';
import { MousePointer2, Eraser, Type, Undo2, Save, Loader2, Check, X, Image as ImageIcon } from 'lucide-react';
import { toast } from 'react-hot-toast';

type Tool = 'select' | 'text';

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
  const [undoStack, setUndoStack] = useState<ImageData[]>([]);

  // Text tool state
  const [showTextModal, setShowTextModal] = useState(false);
  const [pendingText, setPendingText] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [fontSize, setFontSize] = useState(48);
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);
  const [fontFamily, setFontFamily] = useState('Inter');
  const [fontScript, setFontScript] = useState<'arabic' | 'english'>('english');

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

    const loadImg = (src: string) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        setIsLoaded(true);
        setUndoStack([ctx.getImageData(0, 0, canvas.width, canvas.height)]);
      };
      img.onerror = () => {
        if (src === mediaUrl) {
          loadImg(`/api/studio/proxy-image?url=${encodeURIComponent(mediaUrl)}`);
        } else {
          toast.error('Failed to load image');
        }
      };
      img.src = src;
    };
    loadImg(mediaUrl);
  }, [mediaUrl, isVideo]);

  // ── Helpers ───────────────────────────────────────────────────────
  const saveSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    setUndoStack(prev => [...prev.slice(-19), ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  }, []);

  const undo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || undoStack.length <= 1) return;
    const newStack = undoStack.slice(0, -1);
    setUndoStack(newStack);
    canvas.getContext('2d', { willReadFrequently: true })!.putImageData(newStack[newStack.length - 1], 0, 0);
  }, [undoStack]);

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
      setSelectionStart(pos);
      setSelection({ x: pos.x, y: pos.y, width: 0, height: 0 });
      setIsSelecting(true);
    } else if (tool === 'text') {
      setTextPos(pos);
      setShowTextModal(true);
    }
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isSelecting || !selectionStart || tool !== 'select') return;
    const pos = getCanvasPos(e);
    
    setSelection({
      x: Math.max(0, Math.min(canvasRef.current!.width, Math.min(selectionStart.x, pos.x))),
      y: Math.max(0, Math.min(canvasRef.current!.height, Math.min(selectionStart.y, pos.y))),
      width: Math.abs(pos.x - selectionStart.x),
      height: Math.abs(pos.y - selectionStart.y),
    });
  };

  const onMouseUp = () => {
    setIsSelecting(false);
  };

  // ── Erase logic ───────────────────────────────────────────────────
  const handleEraseSelection = async () => {
    if (!selection || !canvasRef.current || selection.width < 1 || selection.height < 1) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    
    saveSnapshot();
    setIsErasing(true);

    try {
      const borderSize = Math.max(10, Math.round(Math.min(selection.width, selection.height) * 0.2));
      const sampleX = Math.max(0, selection.x - borderSize);
      const sampleY = Math.max(0, selection.y - borderSize);
      const sampleW = Math.min(canvas.width - sampleX, selection.width + borderSize * 2);
      const sampleH = Math.min(canvas.height - sampleY, selection.height + borderSize * 2);
      
      const surroundingData = ctx.getImageData(sampleX, sampleY, sampleW, sampleH);
      const borderPixels: [number, number, number][] = [];
      const relSelX = selection.x - sampleX;
      const relSelY = selection.y - sampleY;
      
      for (let y = 0; y < sampleH; y++) {
        for (let x = 0; x < sampleW; x++) {
          const isAtEdge = x < 3 || y < 3 || x > sampleW - 4 || y > sampleH - 4;
          const insideSel =
            x >= relSelX && x < relSelX + selection.width &&
            y >= relSelY && y < relSelY + selection.height;
            
          if (!insideSel || isAtEdge) {
            const idx = (y * sampleW + x) * 4;
            borderPixels.push([
              surroundingData.data[idx],
              surroundingData.data[idx + 1],
              surroundingData.data[idx + 2],
            ]);
          }
        }
      }
      
      let avgR = 255, avgG = 255, avgB = 255;
      if (borderPixels.length > 0) {
        avgR = Math.round(borderPixels.reduce((s, p) => s + p[0], 0) / borderPixels.length);
        avgG = Math.round(borderPixels.reduce((s, p) => s + p[1], 0) / borderPixels.length);
        avgB = Math.round(borderPixels.reduce((s, p) => s + p[2], 0) / borderPixels.length);
      }
      
      const topLeft = sampleCorner(ctx, selection.x - 2, selection.y - 2, canvas.width, canvas.height);
      const topRight = sampleCorner(ctx, selection.x + selection.width + 2, selection.y - 2, canvas.width, canvas.height);
      const bottomLeft = sampleCorner(ctx, selection.x - 2, selection.y + selection.height + 2, canvas.width, canvas.height);
      const bottomRight = sampleCorner(ctx, selection.x + selection.width + 2, selection.y + selection.height + 2, canvas.width, canvas.height);
      
      const fillW = Math.ceil(selection.width);
      const fillH = Math.ceil(selection.height);
      const fillData = ctx.createImageData(fillW, fillH);
      
      for (let fy = 0; fy < fillH; fy++) {
        for (let fx = 0; fx < fillW; fx++) {
          const tx = fx / selection.width;
          const ty = fy / selection.height;
          
          const r = bilinear(topLeft[0], topRight[0], bottomLeft[0], bottomRight[0], tx, ty);
          const g = bilinear(topLeft[1], topRight[1], bottomLeft[1], bottomRight[1], tx, ty);
          const b = bilinear(topLeft[2], topRight[2], bottomLeft[2], bottomRight[2], tx, ty);
          
          const idx = (fy * fillW + fx) * 4;
          // Mix 70% interpolated, 30% average for noise reduction
          fillData.data[idx]     = Math.round(r * 0.7 + avgR * 0.3);
          fillData.data[idx + 1] = Math.round(g * 0.7 + avgG * 0.3);
          fillData.data[idx + 2] = Math.round(b * 0.7 + avgB * 0.3);
          fillData.data[idx + 3] = 255;
        }
      }
      
      ctx.putImageData(fillData, Math.round(selection.x), Math.round(selection.y));
      
      // Edge blending
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 6; i > 0; i--) {
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = `rgb(${avgR},${avgG},${avgB})`;
        ctx.filter = 'blur(2px)';
        ctx.fillRect(
          selection.x - i * 0.5,
          selection.y - i * 0.5,
          selection.width + i,
          selection.height + i
        );
      }
      ctx.restore();
      
      setSelection(null);
      toast.success('Area erased!');
    } catch (err) {
      toast.error('Erase failed');
      console.error(err);
    } finally {
      setIsErasing(false);
    }
  };

  // ── Commit text ───────────────────────────────────────────────────
  const commitText = () => {
    if (!textPos || !pendingText.trim()) { setShowTextModal(false); return; }
    const ctx = canvasRef.current!.getContext('2d', { willReadFrequently: true })!;
    saveSnapshot();
    
    document.fonts.ready.then(() => {
      ctx.font = `bold ${fontSize}px "${fontFamily}", sans-serif`;
      ctx.fillStyle = textColor;
      ctx.textBaseline = 'middle';
      
      if (fontScript === 'arabic') {
        const metrics = ctx.measureText(pendingText);
        ctx.fillText(pendingText, textPos!.x - metrics.width, textPos!.y);
      } else {
        ctx.fillText(pendingText, textPos!.x, textPos!.y);
      }
    });
    
    setPendingText('');
    setShowTextModal(false);
    setTextPos(null);
  };

  // ── Save ──────────────────────────────────────────────────────────
  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas || !isLoaded) return;
    setIsSaving(true);
    canvas.toBlob(async (blob) => {
      if (!blob) { toast.error('Export failed'); setIsSaving(false); return; }
      try {
        const fd = new FormData();
        fd.append('file', blob, 'studio-edit.png');
        const res = await fetch('/api/studio/save-image', { method: 'POST', body: fd });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
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
            <button
              className="btn btn-danger"
              onClick={handleEraseSelection}
              disabled={!selection || isErasing || selection.width < 2}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {isErasing
                ? <><Loader2 size={14} className="spin" style={{ marginInlineEnd: 6 }} />Erasing…</>
                : <><Eraser size={14} style={{ marginInlineEnd: 6 }} />Erase Selection</>}
            </button>
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
      </div>

      {/* ── Canvas Area ── */}
      <div ref={containerRef} style={{ background: '#0d0d0d', borderRadius: 14, border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
        {!isLoaded && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: '#666' }}>
            <Loader2 size={32} className="spin" />
            <p style={{ fontSize: '0.88rem' }}>Loading image…</p>
          </div>
        )}

        <div style={{ position: 'relative', display: isLoaded ? 'block' : 'none', maxWidth: '100%', maxHeight: '100%' }}>
          <canvas
            ref={canvasRef}
            style={{
              display: 'block',
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              cursor: tool === 'select' ? 'crosshair' : 'text',
              touchAction: 'none',
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          />

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
            }} />
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
