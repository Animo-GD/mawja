'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useLang } from '@/lib/LanguageContext';
import { Image as ImageIcon, Sparkles, Trash2, Edit3, Loader2, X, ZoomIn } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';

interface GalleryItem {
  id: string;
  user_id: string;
  media_url: string;
  source: string;
  created_at: string;
}

async function fetchGallery(): Promise<GalleryItem[]> {
  const res = await fetch('/api/gallery');
  if (!res.ok) throw new Error('Failed to load gallery');
  return res.json();
}

export default function GalleryPage() {
  const { t, lang } = useLang();
  const isAr = lang === 'ar';
  const qc = useQueryClient();
  const [tab, setTab] = useState<'ai' | 'studio'>('ai');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const { data: posts, isLoading: postsLoading } = useQuery({
    queryKey: ['posts'],
    queryFn: api.getPosts,
  });

  const { data: galleryItems, isLoading: galleryLoading } = useQuery({
    queryKey: ['gallery'],
    queryFn: fetchGallery,
  });

  // Close lightbox on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxUrl(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const mediaItems = posts?.filter(p => p.image_url || p.video_url) ?? [];

  const deleteGalleryItem = async (id: string) => {
    if (!confirm(isAr ? 'هل تريد الحذف؟' : 'Delete this item?')) return;
    const res = await fetch('/api/gallery', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    if (res.ok) {
      toast.success(isAr ? 'تم الحذف' : 'Deleted');
      qc.invalidateQueries({ queryKey: ['gallery'] });
    } else {
      toast.error('Delete failed');
    }
  };

  const TAB_STYLE = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px',
    borderRadius: 8,
    border: '1px solid var(--color-border)',
    background: active ? 'var(--color-accent)' : 'transparent',
    color: active ? '#fff' : 'var(--color-text-secondary)',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    fontSize: '0.9rem',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'all 0.2s ease',
  });

  const GRID: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 20,
  };

  const CARD: React.CSSProperties = {
    padding: 0,
    overflow: 'hidden',
    border: '1px solid var(--color-border)',
    borderRadius: 16,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-bg-warm)',
    boxShadow: 'var(--shadow-card)',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="text-heading">{t('page_gallery_title')}</h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.92rem', marginTop: 4 }}>
          {t('page_gallery_sub')}
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <button style={TAB_STYLE(tab === 'ai')} onClick={() => setTab('ai')}>
          <Sparkles size={15} /> {isAr ? 'مولّد بالذكاء الاصطناعي' : 'AI Generated'}
          {mediaItems.length > 0 && (
            <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 999, padding: '1px 7px', fontSize: '0.75rem' }}>
              {mediaItems.length}
            </span>
          )}
        </button>
        <button style={TAB_STYLE(tab === 'studio')} onClick={() => setTab('studio')}>
          <Edit3 size={15} /> {isAr ? 'تعديلات الاستوديو' : 'Studio Edits'}
          {galleryItems && galleryItems.length > 0 && (
            <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 999, padding: '1px 7px', fontSize: '0.75rem' }}>
              {galleryItems.length}
            </span>
          )}
        </button>
      </div>

      <div className="page-body">
        {/* ── AI Generated Tab ── */}
        {tab === 'ai' && (
          postsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <Loader2 size={32} className="spin" style={{ color: 'var(--color-text-muted)' }} />
            </div>
          ) : mediaItems.length === 0 ? (
            <div className="empty-state">
              <ImageIcon size={40} style={{ opacity: 0.3 }} />
              <p>{isAr ? 'لا توجد وسائط' : 'No AI-generated media yet'}</p>
            </div>
          ) : (
            <div style={GRID}>
              {mediaItems.map(item => (
                <div key={item.id} className="card-flat" style={CARD}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-hover)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-card)'; }}
                >
                  <div
                    style={{ position: 'relative', paddingTop: '100%', background: 'var(--color-bg-dark)', overflow: 'hidden', cursor: item.image_url ? 'zoom-in' : 'default' }}
                    onClick={() => item.image_url && setLightboxUrl(item.image_url)}
                  >
                    {item.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image_url} alt="Generated"
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s ease' }}
                        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                      />
                    )}
                    <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s' }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                    >
                      <ZoomIn size={15} />
                    </div>
                  </div>
                  <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--color-text-secondary)', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', display: '-webkit-box', overflow: 'hidden' }}>
                      {item.text || (isAr ? 'بدون نص' : 'No caption')}
                    </p>
                    <Link
                      href={`/dashboard/studio?media_url=${encodeURIComponent(item.image_url || '')}`}
                      className="btn btn-secondary"
                      style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}
                    >
                      <Edit3 size={14} style={{ marginInlineEnd: 6 }} />
                      {isAr ? 'تعديل في الاستوديو' : 'Edit in Studio'}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── Studio Edits Tab ── */}
        {tab === 'studio' && (
          galleryLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <Loader2 size={32} className="spin" style={{ color: 'var(--color-text-muted)' }} />
            </div>
          ) : !galleryItems || galleryItems.length === 0 ? (
            <div className="empty-state">
              <Edit3 size={40} style={{ opacity: 0.3 }} />
              <p>{isAr ? 'لا توجد تعديلات بعد' : 'No studio edits yet. Open an image and edit it in Studio.'}</p>
            </div>
          ) : (
            <div style={GRID}>
              {galleryItems.map(item => (
                <div key={item.id} className="card-flat" style={CARD}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-hover)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-card)'; }}
                >
                  <div
                    style={{ position: 'relative', paddingTop: '100%', background: 'var(--color-bg-dark)', overflow: 'hidden', cursor: 'zoom-in' }}
                    onClick={() => setLightboxUrl(item.media_url)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.media_url} alt="Studio edit"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s ease' }}
                      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
                      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                    />
                    <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '0.7rem', fontWeight: 600, padding: '4px 8px', borderRadius: 6, backdropFilter: 'blur(4px)' }}>
                      Studio
                    </div>
                  </div>
                  <div style={{ padding: '14px 16px', display: 'flex', gap: 8 }}>
                    <Link
                      href={`/dashboard/studio?media_url=${encodeURIComponent(item.media_url)}`}
                      className="btn btn-secondary"
                      style={{ flex: 1, justifyContent: 'center', textDecoration: 'none' }}
                    >
                      <Edit3 size={14} style={{ marginInlineEnd: 6 }} />
                      {isAr ? 'تعديل' : 'Re-edit'}
                    </Link>
                    <button className="btn btn-secondary" style={{ padding: '0 14px' }} onClick={() => deleteGalleryItem(item.id)}>
                      <Trash2 size={15} style={{ color: 'var(--color-error, #e55)' }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* ── Lightbox ── */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.88)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, cursor: 'zoom-out',
            backdropFilter: 'blur(10px)',
            animation: 'fadeIn 0.15s ease',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Preview"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '92vw', maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: 12,
              boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
              cursor: 'default',
            }}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            style={{
              position: 'fixed', top: 20, right: 20,
              background: 'rgba(255,255,255,0.12)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff',
              borderRadius: '50%',
              width: 44, height: 44,
              cursor: 'pointer',
              fontSize: 20, fontWeight: 300,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
          >
            <X size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
