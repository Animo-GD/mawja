'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Post } from '@/lib/api';
import dynamic from 'next/dynamic';
import { Loader2, Sparkles, Calendar, Trash2, Clock, CheckCircle, XCircle, Image as ImageIcon, FileText, Video, Save, Lightbulb, X, Copy, Download, Upload, Trash, Wand2, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { Toaster } from 'react-hot-toast';
import { useLang } from '@/lib/LanguageContext';
import type { TranslationKey } from '@/lib/i18n';

// Inline card — shown in the preview panel, not fullscreen
const GeneratingCard = dynamic(() => import('@/components/GeneratingCard'), { ssr: false });


const PLATFORMS = ['instagram', 'facebook', 'linkedin', 'x'] as const;
const TONES     = ['formal', 'casual', 'sales'] as const;

const LOADING_STEPS_EN = [
  '🔍 Analyzing your business profile...',
  '📈 Scanning latest trends...',
  '🌍 Checking what\'s hot in your market...',
  '💡 Crafting tailored ideas for you...',
  '✨ Almost ready...',
];
const LOADING_STEPS_AR = [
  '🔍 جارٍ تحليل ملف نشاطك التجاري...',
  '📈 فحص أحدث الترندات...',
  '🌍 ما الذي يتصدر السوق الآن...',
  '💡 تصميم أفكار مخصصة لك...',
  '✨ لحظات وتكون جاهزة...',
];

function IdeasModal({ isOpen, onClose, onSelect, isAr }: { isOpen: boolean; onClose: () => void; onSelect: (idea: any) => void; platform: string; isAr: boolean }) {
  const [ideas, setIdeas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setIdeas([]);
      handleFetch();
    }
  }, [isOpen]);

  // Cycle through loading messages while waiting
  useEffect(() => {
    if (!loading) { setStepIdx(0); return; }
    const steps = isAr ? LOADING_STEPS_AR : LOADING_STEPS_EN;
    const id = setInterval(() => setStepIdx(i => (i + 1) % steps.length), 2200);
    return () => clearInterval(id);
  }, [loading, isAr]);

  const handleFetch = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/content/suggest', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (res.status === 402) {
        toast.error(json.error || (isAr ? 'رصيد غير كافٍ، يرجى شراء المزيد من الكريدت' : 'Not enough credits! Please buy more credits.'));
        onClose();
        return;
      }
      if (!res.ok) throw new Error(json.error || 'Failed to fetch suggestions');
      setIdeas(Array.isArray(json) ? json : []);
    } catch (err: any) {
      toast.error(err.message || (isAr ? 'فشل جلب الأفكار' : 'Failed to fetch ideas'));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const steps = isAr ? LOADING_STEPS_AR : LOADING_STEPS_EN;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Lightbulb size={20} style={{ color: 'var(--color-warning)' }} />
            {isAr ? 'أفكار للمحتوى' : 'Content Ideas'}
          </h2>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ maxHeight: '62vh', overflowY: 'auto', padding: '16px' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '48px 24px', textAlign: 'center' }}>
              {/* Pulsing lightbulb */}
              <div style={{ position: 'relative', width: 64, height: 64 }}>
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: 'var(--color-warning)', opacity: 0.15,
                  animation: 'ideasPulse 1.6s ease-in-out infinite',
                }} />
                <div style={{
                  position: 'absolute', inset: 8, borderRadius: '50%',
                  background: 'var(--color-warning)', opacity: 0.25,
                  animation: 'ideasPulse 1.6s ease-in-out infinite 0.3s',
                }} />
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Lightbulb size={28} style={{ color: 'var(--color-warning)' }} />
                </div>
              </div>
              {/* Cycling message */}
              <div style={{ minHeight: 48 }}>
                <p style={{
                  fontSize: '0.95rem', fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  animation: 'ideasFade 0.5s ease',
                  key: stepIdx,
                }}>
                  {steps[stepIdx]}
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                  {isAr ? 'قد تستغرق العملية 10-30 ثانية' : 'This may take 10–30 seconds'}
                </p>
              </div>
              {/* Progress dots */}
              <div style={{ display: 'flex', gap: 6 }}>
                {steps.map((_, i) => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: i === stepIdx ? 'var(--color-accent)' : 'var(--color-border)',
                    transition: 'background 0.3s ease',
                  }} />
                ))}
              </div>
            </div>
          ) : ideas.length === 0 ? (
            <div className="empty-state">
              <Lightbulb size={40} style={{ opacity: 0.2 }} />
              <p>{isAr ? 'لا توجد أفكار متاحة حالياً' : 'No ideas found'}</p>
              <button className="btn btn-secondary" onClick={handleFetch}>{isAr ? 'إعادة المحاولة' : 'Try again'}</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {ideas.map((idea, idx) => (
                <div
                  key={idea.id || idx}
                  className="card-flat"
                  style={{
                    cursor: 'pointer',
                    border: '1px solid var(--color-border)',
                    padding: '16px',
                    transition: 'all 0.2s ease',
                    background: 'var(--color-bg-warm)',
                    animation: `slideUp 0.3s ease ${idx * 0.06}s both`,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--color-accent)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-card)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  onClick={() => onSelect(idea)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 12 }}>
                    <h3 style={{ fontSize: '0.97rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, lineHeight: 1.4 }}>{idea.title}</h3>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {idea.content_type && (
                        <span className="badge badge-gray" style={{ textTransform: 'capitalize', fontSize: '0.72rem' }}>{idea.content_type}</span>
                      )}
                      <span className="badge" style={{ textTransform: 'capitalize', fontSize: '0.72rem' }}>{idea.platform}</span>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.86rem', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.55 }}>{idea.description}</p>
                  {idea.trend && (
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                      <TrendingUp size={11} />
                      <span>{idea.trend}</span>
                    </div>
                  )}
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-accent)', fontSize: '0.82rem', fontWeight: 600 }}>
                    <Wand2 size={12} />
                    {isAr ? 'استخدم هذه الفكرة' : 'Use this idea'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ borderTop: '1px solid var(--color-border)', padding: '12px 16px' }}>
          <button className="btn btn-secondary" onClick={onClose}>{isAr ? 'إغلاق' : 'Close'}</button>
          <button className="btn btn-primary" onClick={handleFetch} disabled={loading}>
            {loading ? <Loader2 size={14} className="spin" /> : <Lightbulb size={14} />}
            {isAr ? 'أفكار جديدة' : 'Get More Ideas'}
          </button>
        </div>
        <style>{`
          @keyframes ideasPulse { 0%,100% { transform: scale(1); opacity: 0.15; } 50% { transform: scale(1.15); opacity: 0.3; } }
          @keyframes ideasFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>
      </div>
    </div>
  );
}


function StatusBadge({ status, t }: { status: Post['status']; t: (k: TranslationKey) => string }) {
  if (status === 'draft') return <span className="badge badge-gray"><FileText size={10} style={{ marginInlineEnd: 3 }} />Draft</span>;
  if (status === 'posted')   return <span className="badge badge-success"><CheckCircle size={10} style={{ marginInlineEnd: 3 }} />{t('status_posted')}</span>;
  if (status === 'failed')   return <span className="badge badge-error"><XCircle size={10} style={{ marginInlineEnd: 3 }} />{t('status_failed')}</span>;
  if (status === 'completed') return <span className="badge badge-success"><CheckCircle size={10} style={{ marginInlineEnd: 3 }} />Completed</span>;
  return <span className="badge"><Clock size={10} style={{ marginInlineEnd: 3 }} />{t('status_scheduled')}</span>;
}

const PLATFORM_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  instagram: { bg: '#fce4ec', color: '#c2185b', label: 'IG' },
  facebook:  { bg: '#e3f2fd', color: '#1565c0', label: 'FB' },
  linkedin:  { bg: '#e8f4fd', color: '#0a66c2', label: 'IN' },
  x:         { bg: '#f3f3f3', color: '#000',     label: 'X'  },
};

function PlatformLogo({ platform, size = 14 }: { platform: string; size?: number }) {
  if (platform === 'instagram') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  );
  if (platform === 'facebook') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
  if (platform === 'linkedin') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
  if (platform === 'x') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
  return <span>{platform.slice(0, 2).toUpperCase()}</span>;
}

function PlatformIcon({ platform }: { platform: string }) {
  const s = PLATFORM_STYLES[platform] ?? { bg: 'var(--color-bg-warm)', color: 'var(--color-text-secondary)', label: platform.slice(0,2).toUpperCase() };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: s.bg, color: s.color }}>
      <PlatformLogo platform={platform} size={14} />
    </span>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
interface EditModalProps {
  post: Post | null;
  onClose: () => void;
  onSave: () => void;
  editText: string;
  setEditText: (v: string) => void;
  editPublishAt: string;
  setEditPublishAt: (v: string) => void;
  editProductNotes: string;
  setEditProductNotes: (v: string) => void;
  editImageUrl: string | null;
  setEditImageUrl: (v: string | null) => void;
  isPending: boolean;
}

function EditModal({ post, onClose, onSave, editText, setEditText, editPublishAt, setEditPublishAt, editProductNotes, setEditProductNotes, editImageUrl, setEditImageUrl, isPending }: EditModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const handleCopyText = () => {
    navigator.clipboard.writeText(editText);
    toast.success('Text copied to clipboard!');
  };

  const handleCopyImage = async () => {
    if (!editImageUrl) return;
    try {
      const response = await fetch(editImageUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      toast.success('Image copied to clipboard!');
    } catch (err) {
      toast.error('Failed to copy image');
    }
  };

  const handleDownloadImage = async () => {
    if (!editImageUrl) return;
    try {
      const response = await fetch(editImageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'post_image.jpg';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Failed to download image');
    }
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/uploads/product-image', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditImageUrl(data.url);
      toast.success('Image uploaded successfully');
    } catch (err) {
      toast.error('Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!post) return null;

  const ps = PLATFORM_STYLES[post.platform] ?? { bg: 'var(--color-bg-warm)', color: 'var(--color-text-secondary)', label: post.platform.slice(0,2).toUpperCase() };

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div style={{
        background: '#fff',
        borderRadius: 16,
        width: '100%',
        maxWidth: 550,
        maxHeight: '94vh',
        overflow: 'hidden',
        boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
        animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header (FB style) */}
        <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ 
              width: 40, height: 40, borderRadius: '50%', background: ps.bg, color: ps.color, 
              display: 'flex', alignItems: 'center', justifyContent: 'center', 
              fontSize: '0.85rem', fontWeight: 800, border: '1px solid var(--color-border)' 
            }}>
              <PlatformLogo platform={post.platform} size={20} />
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.94rem', color: '#050505', textTransform: 'capitalize' }}>{post.platform}</p>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#65676b', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={12} />
                {post.publish_at ? new Date(post.publish_at).toLocaleString() : 'Draft'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ 
              background: '#e4e6eb', border: 'none', cursor: 'pointer', 
              width: 32, height: 32, borderRadius: '50%', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#65676b' 
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Plain Textarea */}
          <div style={{ padding: '0 16px 12px' }}>
            <textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              placeholder="What's on your mind?"
              rows={4}
              autoFocus
              style={{
                width: '100%',
                padding: 0,
                border: 'none',
                background: 'transparent',
                color: '#050505',
                fontSize: editText.length < 100 ? '1.25rem' : '1rem',
                lineHeight: 1.5,
                resize: 'none',
                fontFamily: 'inherit',
                outline: 'none',
                minHeight: 100,
              }}
            />
          </div>

          <div style={{ padding: '0 16px 12px' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, justifyContent: 'flex-end' }}>
               <button onClick={handleCopyText} style={{ background: 'none', border: 'none', color: '#65676b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}><Copy size={14}/> Copy Text</button>
            </div>
            
            {editImageUrl ? (
              <div style={{ position: 'relative', background: '#f0f2f5', borderRadius: 8, overflow: 'hidden' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={editImageUrl} alt="Post Content" style={{ width: '100%', display: 'block', maxHeight: 500, objectFit: 'contain' }} />
                <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6, background: 'rgba(0,0,0,0.6)', padding: 6, borderRadius: 8 }}>
                  <button onClick={handleCopyImage} title="Copy Image" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><Copy size={16}/></button>
                  <button onClick={handleDownloadImage} title="Download" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><Download size={16}/></button>
                  <label title="Change Image" style={{ cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center' }}>
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUploadImage} disabled={uploadingImage} />
                    {uploadingImage ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
                  </label>
                  <button onClick={() => setEditImageUrl(null)} title="Remove Image" style={{ background: 'none', border: 'none', color: '#ff4d4f', cursor: 'pointer' }}><Trash size={16}/></button>
                </div>
              </div>
            ) : post.video_url ? (
              <video src={post.video_url} controls style={{ width: '100%', display: 'block', maxHeight: 500, objectFit: 'contain', background: '#000', borderRadius: 8 }} />
            ) : (
              <div style={{ background: '#f0f2f5', padding: 32, borderRadius: 8, textAlign: 'center', border: '2px dashed #dddfe2' }}>
                <ImageIcon size={32} style={{ color: '#bcc0c4', margin: '0 auto 12px' }} />
                <p style={{ margin: '0 0 16px', fontSize: '0.9rem', color: '#65676b' }}>No image attached to this post.</p>
                <label className="btn btn-secondary" style={{ display: 'inline-flex', cursor: 'pointer', margin: '0 auto' }}>
                   <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUploadImage} disabled={uploadingImage} />
                   {uploadingImage ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                   {uploadingImage ? 'Uploading...' : 'Upload Image'}
                </label>
              </div>
            )}
          </div>

          {/* Footer controls */}
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
             {/* Product Notes Pill */}
             {editProductNotes && (
               <div style={{ background: '#f0f2f5', padding: '8px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                 <Lightbulb size={16} style={{ color: 'var(--color-accent)' }} />
                 <span style={{ fontSize: '0.88rem', color: '#4b4b4b', fontStyle: 'italic' }}>{editProductNotes}</span>
               </div>
             )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#65676b', textTransform: 'uppercase' }}>Schedule</label>
                <input
                  type="datetime-local"
                  value={editPublishAt}
                  onChange={e => setEditPublishAt(e.target.value)}
                  style={{
                    padding: '8px 12px', borderRadius: 8, border: '1px solid #dddfe2', background: '#f0f2f5', fontSize: '0.88rem', outline: 'none'
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                 <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#65676b', textTransform: 'uppercase' }}>Notes</label>
                 <input
                  value={editProductNotes}
                  onChange={e => setEditProductNotes(e.target.value)}
                  placeholder="Notes..."
                  style={{
                    padding: '8px 12px', borderRadius: 8, border: '1px solid #dddfe2', background: '#f0f2f5', fontSize: '0.88rem', outline: 'none'
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #dddfe2' }}>
          <button
            onClick={onSave}
            disabled={isPending}
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', height: 36, borderRadius: 6, fontWeight: 600 }}
          >
            {isPending ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            {isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PostsPage() {
  const { t, lang } = useLang();
  const isAr = lang === 'ar';
  const qc = useQueryClient();

  const [tab, setTab] = useState<'create' | 'posts' | 'images' | 'videos'>('create');
  const [form, setForm] = useState({ topic: '', platform: 'instagram', tone: 'casual', language: 'en', product_notes: '' });
  const [generated, setGenerated] = useState<{ text: string; image_url?: string; video_url?: string } | null>(null);
  const [previewPostId, setPreviewPostId] = useState<string | null>(null);
  const [editedText, setEditedText] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [filter, setFilter] = useState({ platform: '', status: '' });
  const [productImage, setProductImage] = useState<File | null>(null);
  const [productImageUrl, setProductImageUrl] = useState<string>('');
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [editText, setEditText] = useState('');
  const [editPublishAt, setEditPublishAt] = useState('');
  const [editProductNotes, setEditProductNotes] = useState('');
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const previewTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Async generation state
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [generatingActionType, setGeneratingActionType] = useState<'generate_text' | 'generate_image' | 'generate_full_post' | 'generate_video'>('generate_full_post');

  const [showIdeasModal, setShowIdeasModal] = useState(false);

  const handleSelectIdea = (idea: any) => {
    setForm(f => ({ 
      ...f, 
      topic: idea.topic || idea.title,
      product_notes: idea.product_notes || idea.description,
      platform: idea.platform || f.platform,
    }));
    setShowIdeasModal(false);
    toast.success(isAr ? 'تم تطبيق الفكرة!' : 'Idea applied!');
  };

  const { data: posts, isLoading: postsLoading } = useQuery({ queryKey: ['posts'], queryFn: api.getPosts });

  // ── Schedule mutation ──────────────────────────────────────────────
  const scheduleMutation = useMutation({
    mutationFn: api.schedulePost,
    onSuccess: () => {
      toast.success(t('toast_post_scheduled'));
      qc.invalidateQueries({ queryKey: ['posts'] });
      setPreviewPostId(null);
      setGenerated(null); setScheduleAt(''); setTab('posts');
    },
    onError: () => toast.error(t('toast_scheduling_failed')),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deletePost,
    onSuccess: () => { toast.success(t('toast_post_deleted')); qc.invalidateQueries({ queryKey: ['posts'] }); },
    onError: () => toast.error(t('toast_delete_failed')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { text?: string; image_url?: string | null; publish_at?: string | null; product_notes?: string } }) => api.updatePost(id, body),
    onSuccess: () => {
      toast.success('Post updated');
      setEditingPost(null);
      setPreviewPostId(null);
      setGenerated(null); 
      setScheduleAt(''); 
      if (tab === 'create') setTab('posts');
      qc.invalidateQueries({ queryKey: ['posts'] });
    },
    onError: () => toast.error('Update failed'),
  });

  // ── Generation callbacks ───────────────────────────────────────────
  const handleGenerationComplete = useCallback(async (result: { text: string; image_url?: string; video_url?: string; id?: string }) => {
    setActiveJobId(null);
    setPreviewPostId(result.id || null);

    if (result?.text || result?.image_url || result?.video_url) {
      setGenerated(result);
      setEditedText(result.text || '');
    } else {
      const freshPosts = await api.getPosts().catch(() => []);
      const latestWithContent = freshPosts.find((p) => !!p.text || !!p.image_url || !!p.video_url);
      if (latestWithContent) {
        setGenerated({ 
          text: latestWithContent.text || '', 
          image_url: latestWithContent.image_url || undefined,
          video_url: latestWithContent.video_url || undefined
        });
        setEditedText(latestWithContent.text || '');
        setPreviewPostId(latestWithContent.id);
        setScheduleAt(toDateTimeLocal(latestWithContent.publish_at));
      }
    }

    qc.invalidateQueries({ queryKey: ['posts'] });
    toast.success(t('toast_content_generated'));
  }, [qc, t]);

  const handleGenerationError = useCallback((msg: string) => {
    setActiveJobId(null);
    toast.error(msg || t('toast_generation_failed'));
  }, [t]);

  // ── Start generation ───────────────────────────────────────────────
  async function handleGenerate(action_type: 'generate_text' | 'generate_image' | 'generate_full_post' | 'generate_video') {
    if (!form.topic.trim()) { toast.error(t('toast_enter_topic')); return; }
    setGeneratingActionType(action_type);

    try {
      let uploadedImageUrl = productImageUrl;

      if (productImage) {
        const fd = new FormData();
        fd.append('file', productImage);

        const upRes = await fetch('/api/uploads/product-image', {
          method: 'POST',
          body: fd,
        });
        const upData = await upRes.json();
        if (!upRes.ok) {
          toast.error(upData.error || 'Image upload failed');
          return;
        }
        uploadedImageUrl = upData.url;
        setProductImageUrl(uploadedImageUrl);
      }

      const res = await fetch('/api/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, product_image_url: uploadedImageUrl || null, action_type }),
      });
      const data = await res.json();

      if (res.status === 402) {
        toast.error(data.error || 'Not enough credits! Please buy more credits.');
        return;
      }
      if (!res.ok) {
        toast.error(data.error || t('toast_generation_failed'));
        return;
      }

      if (data.sync) {
        // n8n responded synchronously (no generation_jobs table)
        setGenerated(data);
        setEditedText(data.text);
        setPreviewPostId(data.id || null);
        toast.success(t('toast_content_generated'));
      } else {
        // Async: show overlay and poll
        setActiveJobId(data.job_id);
      }
    } catch {
      toast.error(t('toast_generation_failed'));
    }
  }

  function handleSchedule() {
    if (!generated) return;
    if (previewPostId) {
      updateMutation.mutate({
        id: previewPostId,
        body: {
          text: editedText,
          publish_at: scheduleAt || null,
          product_notes: form.product_notes,
        },
      });
      return;
    }

    scheduleMutation.mutate({
      text: editedText,
      image_url: generated.image_url,
      platform: form.platform,
      publish_at: scheduleAt || undefined,
      product_notes: form.product_notes,
    });
  }

  function handleDelete(id: string) {
    if (!confirm(t('confirm_delete_post'))) return;
    deleteMutation.mutate(id);
  }

  function toDateTimeLocal(iso?: string | null) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  }

  function startEdit(post: Post) {
    setEditingPost(post);
    setEditText(post.text || '');
    setEditPublishAt(toDateTimeLocal(post.publish_at));
    setEditProductNotes(post.product_notes || '');
    setEditImageUrl(post.image_url || null);
  }

  function saveEdit() {
    if (!editingPost) return;
    updateMutation.mutate({
      id: editingPost.id,
      body: { 
        text: editText, 
        publish_at: editPublishAt || null, 
        product_notes: editProductNotes,
        image_url: editImageUrl
      },
    });
  }

  const filtered = posts?.filter(p => {
    if (filter.platform && p.platform !== filter.platform) return false;
    if (filter.status && p.status !== filter.status) return false;
    return true;
  }) ?? [];

  const imagesCount = posts?.filter(p => p.image_url).length ?? 0;
  const videosCount = posts?.filter(p => p.video_url).length ?? 0;

  const toneLabels: Record<string, string> = {
    formal: t('tone_formal'), casual: t('tone_casual'), sales: t('tone_sales'),
  };

  useEffect(() => {
    const el = previewTextareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [editedText]);

  return (
    <div>
      <Toaster position="top-right" />

      {/* Edit Modal */}
      <EditModal
        post={editingPost}
        onClose={() => setEditingPost(null)}
        onSave={saveEdit}
        editText={editText}
        setEditText={setEditText}
        editPublishAt={editPublishAt}
        setEditPublishAt={setEditPublishAt}
        editProductNotes={editProductNotes}
        setEditProductNotes={setEditProductNotes}
        editImageUrl={editImageUrl}
        setEditImageUrl={setEditImageUrl}
        isPending={updateMutation.isPending}
      />

      <IdeasModal
        isOpen={showIdeasModal}
        onClose={() => setShowIdeasModal(false)}
        onSelect={handleSelectIdea}
        platform={form.platform}
        isAr={isAr}
      />


      <div className="page-header">
        <h1 className="text-heading">{t('page_posts_title')}</h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.94rem', marginTop: 4 }}>
          {t('page_posts_sub')}
        </p>
      </div>

      <div className="page-body">
        <div className="tabs">
          <button className={`tab-btn${tab === 'create' ? ' active' : ''}`} onClick={() => setTab('create')}>
            <Sparkles size={14} style={{ marginInlineEnd: 6, verticalAlign: 'middle' }} />{t('tab_create')}
          </button>
          <button className={`tab-btn${tab === 'posts' ? ' active' : ''}`} onClick={() => setTab('posts')}>
            <FileText size={14} style={{ marginInlineEnd: 6, verticalAlign: 'middle' }} />{isAr ? 'المنشورات' : 'Posts'}
            {posts && <span className="badge" style={{ marginInlineStart: 8 }}>{posts.length}</span>}
          </button>
        </div>

        {tab === 'create' && (
          <div className="grid-2">
            {/* ── Form ── */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h2 className="text-subhead" style={{ margin: 0 }}>{t('generate_content_title')}</h2>
                <button 
                  className="btn btn-secondary btn-sm" 
                  style={{ color: 'var(--color-accent)', borderColor: 'var(--color-accent)', borderRadius: 20 }}
                  onClick={() => setShowIdeasModal(true)}
                >
                  <Lightbulb size={14} />
                  {isAr ? 'أعطني فكرة' : 'Give me an idea'}
                </button>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="topic">{t('label_topic')}</label>
                <input
                  id="topic" className="form-input"
                  value={form.topic}
                  onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
                  placeholder={isAr ? 'ماذا يدور في ذهنك؟ (مثال: فوائد الشاي الأخضر)' : "What's on your mind? (e.g. Benefits of Green Tea)"}
                  onKeyDown={e => e.key === 'Enter' && handleGenerate('generate_full_post')}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="platform">{t('label_platform')}</label>
                  <select id="platform" className="form-select" value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}>
                    {PLATFORMS.map(p => <option key={p} value={p} style={{ textTransform: 'capitalize' }}>{p}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="tone">{t('label_tone')}</label>
                  <select id="tone" className="form-select" value={form.tone} onChange={e => setForm(f => ({ ...f, tone: e.target.value }))}>
                    {TONES.map(tone => <option key={tone} value={tone}>{toneLabels[tone]}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="lang">{t('label_language_content')}</label>
                <select id="lang" className="form-select" value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))}>
                  <option value="en">{t('lang_english')}</option>
                  <option value="ar">{t('lang_arabic')}</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="product-notes">{t('label_product_notes')}</label>
                <textarea
                  id="product-notes"
                  className="form-input"
                  rows={3}
                  value={form.product_notes}
                  onChange={e => setForm(f => ({ ...f, product_notes: e.target.value }))}
                  placeholder={t('placeholder_product_notes')}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="product-image">Product Image (Optional)</label>
                <input
                  id="product-image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="form-input"
                  onChange={e => setProductImage(e.target.files?.[0] ?? null)}
                />
                {(productImage || productImageUrl) && (
                  <p style={{ marginTop: 6, fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                    {productImage ? `Selected: ${productImage.name}` : 'Image uploaded and ready'}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => handleGenerate('generate_text')}
                  disabled={!!activeJobId}
                >
                  {activeJobId && generatingActionType === 'generate_text' ? <Loader2 size={14} className="spin" /> : <FileText size={14} />}
                  {t('btn_generate_text')}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleGenerate('generate_image')}
                  disabled={!!activeJobId}
                >
                  {activeJobId && generatingActionType === 'generate_image' ? <Loader2 size={14} className="spin" /> : <ImageIcon size={14} />}
                  {t('btn_generate_image')}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleGenerate('generate_full_post')}
                  disabled={!!activeJobId}
                >
                  {activeJobId && generatingActionType === 'generate_full_post' ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                  {t('btn_generate_both')}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleGenerate('generate_video')}
                  disabled={!!activeJobId}
                >
                  {activeJobId && generatingActionType === 'generate_video' ? <Loader2 size={14} className="spin" /> : <Video size={14} />}
                  {isAr ? 'توليد فيديو' : 'Generate Video'}
                </button>
              </div>
            </div>

            {/* ── Preview / Generating Card ── */}
            <div>
              {activeJobId ? (
                <GeneratingCard
                  jobId={activeJobId}
                  onComplete={handleGenerationComplete}
                  onError={handleGenerationError}
                  actionType={generatingActionType}
                />
              ) : generated ? (
                // Done — Social Media Post Card Preview
                <div style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 16,
                  overflow: 'hidden',
                  background: 'var(--color-bg)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                  animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
                }}>
                  {/* Platform Header */}
                  <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-light)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: PLATFORM_STYLES[form.platform]?.bg || 'var(--color-bg-warm)',
                        color: PLATFORM_STYLES[form.platform]?.color || 'var(--color-text-secondary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '1px solid var(--color-border)',
                      }}>
                        <PlatformLogo platform={form.platform} size={18} />
                      </div>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.92rem', color: 'var(--color-text-primary)', textTransform: 'capitalize' }}>{form.platform}</p>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Draft · Just now</p>
                      </div>
                    </div>
                    <button
                      onClick={() => { setGenerated(null); setPreviewPostId(null); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Post text - editable */}
                  <div style={{ padding: '14px 16px' }}>
                    <textarea
                      ref={previewTextareaRef}
                      value={editedText}
                      onChange={e => setEditedText(e.target.value)}
                      rows={4}
                      placeholder="Post content…"
                      style={{
                        width: '100%', border: 'none', resize: 'none', outline: 'none',
                        background: 'transparent',
                        color: 'var(--color-text-primary)',
                        fontSize: editedText.length < 120 ? '1.05rem' : '0.95rem',
                        lineHeight: 1.6, fontFamily: 'inherit',
                        overflow: 'hidden',
                      }}
                    />
                  </div>

                  {/* Generated Image */}
                  {generated.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={generated.image_url}
                      alt="Generated"
                      style={{ width: '100%', display: 'block', maxHeight: 340, objectFit: 'cover' }}
                    />
                  )}

                  {/* Schedule & Save footer */}
                  <div style={{ padding: '14px 16px', borderTop: '1px solid var(--color-border-light)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(generatingActionType === 'generate_text' || generatingActionType === 'generate_full_post') && (
                      <>
                        <input
                          type="datetime-local"
                          className="form-input"
                          value={scheduleAt}
                          onChange={e => setScheduleAt(e.target.value)}
                          placeholder={t('label_schedule_datetime')}
                          style={{ fontSize: '0.88rem' }}
                        />
                        <button
                          className="btn btn-primary"
                          onClick={handleSchedule}
                          disabled={scheduleMutation.isPending || updateMutation.isPending}
                          style={{ width: '100%', justifyContent: 'center' }}
                        >
                          {scheduleMutation.isPending || updateMutation.isPending
                            ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                            : <Calendar size={14} />
                          }
                          {scheduleAt ? t('btn_schedule_post') : 'Save Post'}
                        </button>
                      </>
                    )}

                    {(generated.image_url || generated.video_url) && (
                      <a 
                        href={`/dashboard/studio?media_url=${encodeURIComponent(generated.image_url || generated.video_url || '')}`}
                        className="btn btn-secondary" 
                        style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}
                      >
                        <ImageIcon size={14} style={{ marginInlineEnd: 6 }} />
                        Edit in Studio
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                // Empty state
                <div className="card-flat empty-state" style={{ minHeight: 380 }}>
                  <Sparkles size={40} />
                  <p className="text-body-med" style={{ color: 'var(--color-text-secondary)' }}>{t('generate_empty_title')}</p>
                  <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>{t('generate_empty_sub')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Posts table ── */}
        {tab === 'posts' && (
          <div>
            <div className="filters-row">
              <select
                className="form-select" style={{ width: 'auto', minWidth: 140 }}
                value={filter.platform} onChange={e => setFilter(f => ({ ...f, platform: e.target.value }))}
              >
                <option value="">{t('filter_all_platforms')}</option>
                {PLATFORMS.map(p => <option key={p} value={p} style={{ textTransform: 'capitalize' }}>{p}</option>)}
              </select>
              <select
                className="form-select" style={{ width: 'auto', minWidth: 140 }}
                value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
              >
                <option value="">{t('filter_all_status')}</option>
                <option value="scheduled">{t('status_scheduled')}</option>
                <option value="draft">Draft</option>
                <option value="posted">{t('status_posted')}</option>
                <option value="failed">{t('status_failed')}</option>
              </select>
            </div>

            {postsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 8 }} />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <FileText size={40} style={{ opacity: 0.3 }} />
                <p>{t('no_posts_found')}</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
                {filtered.map(post => (
                  <div key={post.id} className="card-flat" onClick={() => startEdit(post)} style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--color-border)', borderRadius: 12, display: 'flex', flexDirection: 'column', transition: 'transform 0.2s ease, box-shadow 0.2s ease', cursor: 'pointer' }} onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; }} onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}>
                    {/* Image Preview (Gallery style) */}
                    <div style={{ position: 'relative', paddingTop: '56.25%', background: 'var(--color-bg-warm)', overflow: 'hidden' }}>
                      {post.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img 
                          src={post.image_url} 
                          alt="Post" 
                          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} 
                        />
                      ) : (
                        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <ImageIcon size={32} style={{ opacity: 0.1 }} />
                        </div>
                      )}
                      
                      {/* Platform Overlay */}
                      <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(255,255,255,0.9)', padding: '4px 8px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                        <PlatformIcon platform={post.platform} />
                      </div>

                      {/* Status Overlay */}
                      <div style={{ position: 'absolute', top: 12, right: 12 }}>
                        <StatusBadge status={post.status} t={t} />
                      </div>
                    </div>

                    {/* Content Area */}
                    <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
                        <Clock size={12} />
                        {post.publish_at ? new Date(post.publish_at).toLocaleString() : 'Draft'}
                      </div>

                      <p style={{ margin: 0, fontSize: '0.94rem', color: 'var(--color-text-primary)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {post.text || '\u2014'}
                      </p>

                      {post.product_notes && (
                        <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--color-bg-warm)', borderRadius: 8, fontSize: '0.82rem', color: 'var(--color-text-secondary)', display: 'flex', gap: 6 }}>
                          <Lightbulb size={14} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                          <span style={{ fontStyle: 'italic' }}>{post.product_notes}</span>
                        </div>
                      )}

                      <div style={{ marginTop: 'auto', paddingTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--color-border-light)' }}>
                        <button className="btn-icon btn-ghost" onClick={e => { e.stopPropagation(); handleDelete(post.id); }} title="Delete">
                          <Trash2 size={14} style={{ color: 'var(--color-error)' }} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Images tab ── */}
        {tab === 'images' && (
          <div>
            {postsLoading ? (
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
                 {[1,2,3,4,5,6].map(i => <div key={i} className="skeleton" style={{ paddingTop: '100%', borderRadius: 12 }} />)}
               </div>
            ) : posts?.filter(p => p.image_url).length === 0 ? (
              <div className="empty-state" style={{ minHeight: 400 }}>
                <ImageIcon size={48} style={{ opacity: 0.3 }} />
                <p className="text-body-med" style={{ color: 'var(--color-text-secondary)' }}>{isAr ? 'مكتبة الصور' : 'Image Library'}</p>
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>{isAr ? 'ستظهر هنا الصور المولدة بالذكاء الاصطناعي' : 'AI-generated images will appear here'}</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
                {posts?.filter(p => p.image_url).map(post => (
                  <div 
                    key={post.id} 
                    onClick={() => startEdit(post)}
                    className="gallery-item"
                    style={{ 
                      position: 'relative', 
                      paddingTop: '100%', 
                      borderRadius: 12, 
                      overflow: 'hidden', 
                      cursor: 'pointer',
                      border: '1px solid var(--color-border)',
                      transition: 'transform 0.2s ease'
                    }}
                  >
                    <img 
                      src={post.image_url} 
                      alt="Gallery Item" 
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                    <div style={{ 
                      position: 'absolute', bottom: 8, right: 8, 
                      background: 'rgba(255,255,255,0.9)', padding: '4px 6px', 
                      borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: PLATFORM_STYLES[post.platform]?.color || '#000'
                    }}>
                      <PlatformLogo platform={post.platform} size={12} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <style>{`
              .gallery-item:hover { transform: scale(1.03); }
            `}</style>
          </div>
        )}

        {/* ── Videos tab ── */}
        {tab === 'videos' && (
          <div>
            {postsLoading ? (
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
                 {[1,2,3,4,5,6].map(i => <div key={i} className="skeleton" style={{ paddingTop: '100%', borderRadius: 12 }} />)}
               </div>
            ) : posts?.filter(p => p.video_url).length === 0 ? (
              <div className="empty-state" style={{ minHeight: 400 }}>
                <Video size={48} style={{ opacity: 0.3 }} />
                <p className="text-body-med" style={{ color: 'var(--color-text-secondary)' }}>{isAr ? 'مكتبة الفيديوهات' : 'Video Library'}</p>
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>{isAr ? 'ستظهر هنا الفيديوهات المولدة بالذكاء الاصطناعي' : 'AI-generated videos will appear here'}</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
                {posts?.filter(p => p.video_url).map(post => (
                  <div 
                    key={post.id} 
                    onClick={() => startEdit(post)}
                    className="gallery-item"
                    style={{ 
                      position: 'relative', 
                      paddingTop: '100%', 
                      borderRadius: 12, 
                      overflow: 'hidden', 
                      cursor: 'pointer',
                      border: '1px solid var(--color-border)',
                      transition: 'transform 0.2s ease',
                      background: '#000'
                    }}
                  >
                    <video 
                      src={post.video_url} 
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#fff', opacity: 0.8 }}>
                      <Video size={32} />
                    </div>
                    <div style={{ 
                      position: 'absolute', bottom: 8, right: 8, 
                      background: 'rgba(255,255,255,0.9)', padding: '4px 6px', 
                      borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: PLATFORM_STYLES[post.platform]?.color || '#000'
                    }}>
                      <PlatformLogo platform={post.platform} size={12} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(28px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
    </div>
  );
}
