'use client';

import { useRef, useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLang } from '@/lib/LanguageContext';
import { Brush, Type, Undo2, Save, Loader2, Pipette, X, Check, Image as ImageIcon } from 'lucide-react';
import { toast } from 'react-hot-toast';

type Tool = 'brush' | 'text' | 'eyedropper';

function StudioContent() {
  const { t } = useLang();
  const searchParams = useSearchParams();
  const router = useRouter();
  const mediaUrl = searchParams.get('media_url') || '';

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Tool state
  const [tool, setTool] = useState<Tool>('brush');
  const [brushSize, setBrushSize] = useState(24);
  const [brushColor, setBrushColor] = useState('#ffffff');
  const [isDrawing, setIsDrawing] = useState(false);

  // Undo
  const [undoStack, setUndoStack] = useState<ImageData[]>([]);

  // Text tool
  const [showTextModal, setShowTextModal] = useState(false);
  const [pendingText, setPendingText] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [fontSize, setFontSize] = useState(48);
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);

  const isVideo = /\.(mp4|webm|ogg|mov)(\?|$)/i.test(mediaUrl);

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
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        setIsLoaded(true);
        setUndoStack([ctx.getImageData(0, 0, canvas.width, canvas.height)]);
      };
      img.onerror = () => {
        if (src === mediaUrl) {
          // Retry via proxy
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
    const ctx = canvas.getContext('2d')!;
    setUndoStack(prev => [...prev.slice(-19), ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  }, []);

  const undo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || undoStack.length <= 1) return;
    const newStack = undoStack.slice(0, -1);
    setUndoStack(newStack);
    canvas.getContext('2d')!.putImageData(newStack[newStack.length - 1], 0, 0);
  }, [undoStack]);

  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  // ── Mouse events ──────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isLoaded) return;
    const pos = getCanvasPos(e);
    const ctx = canvasRef.current!.getContext('2d')!;

    if (tool === 'eyedropper') {
      const px = ctx.getImageData(Math.floor(pos.x), Math.floor(pos.y), 1, 1).data;
      setBrushColor(`#${[px[0], px[1], px[2]].map(v => v.toString(16).padStart(2, '0')).join('')}`);
      setTool('brush');
      return;
    }
    if (tool === 'text') {
      setTextPos(pos);
      setShowTextModal(true);
      return;
    }
    if (tool === 'brush') {
      saveSnapshot();
      setIsDrawing(true);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = brushColor;
      ctx.fill();
    }
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || tool !== 'brush') return;
    const { x, y } = getCanvasPos(e);
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = brushColor;
    ctx.fill();
  };

  const onMouseUp = () => setIsDrawing(false);

  // ── Commit text ───────────────────────────────────────────────────
  const commitText = () => {
    if (!textPos || !pendingText.trim()) { setShowTextModal(false); return; }
    const ctx = canvasRef.current!.getContext('2d')!;
    saveSnapshot();
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = textColor;
    ctx.textBaseline = 'middle';
    ctx.fillText(pendingText, textPos.x, textPos.y);
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

  // ── No media / video guard ────────────────────────────────────────
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

  const PRESETS = ['#ffffff', '#000000', '#f0ede6', '#1a1a2e', '#e8d5b7', '#c4a882'];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '270px 1fr', gap: 20, height: 'calc(100vh - 148px)' }}>

      {/* ── Left Panel ── */}
      <div className="card-flat" style={{ border: '1px solid var(--color-border)', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' }}>
        <h2 className="text-subhead" style={{ marginBottom: 0 }}>Image Studio</h2>

        {/* Tool selector */}
        <div className="form-group">
          <label className="form-label">Active Tool</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {([
              { id: 'brush' as Tool,      icon: <Brush size={16} />,   label: 'Brush'   },
              { id: 'text'  as Tool,      icon: <Type size={16} />,    label: 'Text'    },
              { id: 'eyedropper' as Tool, icon: <Pipette size={16} />, label: 'Pick'    },
            ]).map(({ id, icon, label }) => (
              <button key={id}
                className={`btn ${tool === id ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flexDirection: 'column', gap: 4, padding: '10px 6px', fontSize: '0.72rem', justifyContent: 'center' }}
                onClick={() => setTool(id)}
              >
                {icon}{label}
              </button>
            ))}
          </div>
        </div>

        {/* Brush options */}
        {tool === 'brush' && (
          <>
            <div className="form-group">
              <label className="form-label">Color</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input type="color" value={brushColor} onChange={e => setBrushColor(e.target.value)}
                  style={{ width: 44, height: 38, border: 'none', borderRadius: 8, cursor: 'pointer', padding: 2 }} />
                <code style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{brushColor}</code>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                {PRESETS.map(c => (
                  <button key={c} onClick={() => setBrushColor(c)}
                    title={c}
                    style={{ width: 26, height: 26, borderRadius: 6, border: brushColor === c ? '2px solid var(--color-accent)' : '1px solid var(--color-border)', background: c, cursor: 'pointer' }} />
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Size — {brushSize}px</label>
              <input type="range" min={2} max={120} value={brushSize} onChange={e => setBrushSize(+e.target.value)} style={{ width: '100%' }} />
            </div>
          </>
        )}

        {/* Text options */}
        {tool === 'text' && (
          <>
            <div className="form-group">
              <label className="form-label">Text Color</label>
              <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)}
                style={{ width: 44, height: 38, border: 'none', borderRadius: 8, cursor: 'pointer', padding: 2 }} />
            </div>
            <div className="form-group">
              <label className="form-label">Font Size — {fontSize}px</label>
              <input type="range" min={12} max={200} value={fontSize} onChange={e => setFontSize(+e.target.value)} style={{ width: '100%' }} />
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', lineHeight: 1.55, margin: 0 }}>
              Click anywhere on the image to place text at that position.
            </p>
          </>
        )}

        {/* Eyedropper hint */}
        {tool === 'eyedropper' && (
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', lineHeight: 1.55, margin: 0 }}>
            Click on the image to sample a pixel color and set it as the brush color.
          </p>
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
      <div style={{ background: '#0d0d0d', borderRadius: 14, border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
        {!isLoaded && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: '#666' }}>
            <Loader2 size={32} className="spin" />
            <p style={{ fontSize: '0.88rem' }}>Loading image…</p>
          </div>
        )}

        <canvas
          ref={canvasRef}
          style={{
            maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
            cursor: tool === 'brush' ? 'crosshair' : tool === 'eyedropper' ? 'copy' : 'text',
            display: isLoaded ? 'block' : 'none',
            touchAction: 'none',
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        />

        {/* Text input modal */}
        {showTextModal && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 10,
          }}>
            <div className="card-flat" style={{ border: '1px solid var(--color-border)', borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 300, maxWidth: 400 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>Add Text to Image</p>
              <input
                autoFocus
                className="form-input"
                placeholder="Type your text…"
                value={pendingText}
                onChange={e => setPendingText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') setShowTextModal(false); }}
              />
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
