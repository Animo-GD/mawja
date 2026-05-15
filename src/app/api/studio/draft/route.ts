import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Get draft
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const mediaUrl = req.nextUrl.searchParams.get('media_url');
  if (!mediaUrl) return NextResponse.json({ error: 'Missing media_url' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('studio_drafts')
    .select('draft_image_url, texts')
    .eq('user_id', session.id)
    .eq('media_url', mediaUrl)
    .single();

  if (error || !data) {
    return NextResponse.json({ draft: null });
  }

  return NextResponse.json({ draft: data });
}

// Save draft
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as Blob | null;
    const mediaUrl = formData.get('media_url') as string;
    const textsJson = formData.get('texts') as string;

    if (!file || !mediaUrl) {
      return NextResponse.json({ error: 'Missing file or media_url' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // Use a fixed path per user/mediaUrl combination to overwrite old drafts
    const hash = Buffer.from(mediaUrl).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(-20);
    const fileName = `draft_${hash}.png`;
    const storagePath = `${session.id}/${fileName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('images')
      .upload(storagePath, buffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    const publicUrl = supabaseAdmin.storage.from('images').getPublicUrl(storagePath).data.publicUrl;
    
    // Add a cache buster so the browser always loads the fresh draft image
    const bustUrl = `${publicUrl}?t=${Date.now()}`;

    // Upsert draft record
    const { error: dbError } = await supabaseAdmin
      .from('studio_drafts')
      .upsert(
        {
          user_id: session.id,
          media_url: mediaUrl,
          draft_image_url: bustUrl,
          texts: textsJson ? JSON.parse(textsJson) : [],
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,media_url' }
      );

    if (dbError) throw dbError;

    return NextResponse.json({ success: true, url: bustUrl });
  } catch (error: any) {
    console.error('Draft save error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Delete draft
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const mediaUrl = req.nextUrl.searchParams.get('media_url');
  if (!mediaUrl) return NextResponse.json({ error: 'Missing media_url' }, { status: 400 });

  await supabaseAdmin
    .from('studio_drafts')
    .delete()
    .eq('user_id', session.id)
    .eq('media_url', mediaUrl);

  return NextResponse.json({ success: true });
}
