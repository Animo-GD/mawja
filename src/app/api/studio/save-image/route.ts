import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'File required' }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const filename = `studio_${Date.now()}.png`;
  const path = `${session.id}/${filename}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from('images')
    .upload(path, buffer, { contentType: 'image/png', upsert: false });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data } = supabaseAdmin.storage.from('images').getPublicUrl(path);
  const url = data.publicUrl;

  const { error: dbError } = await supabaseAdmin
    .from('gallery')
    .insert({ user_id: session.id, media_url: url, source: 'studio' });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ url });
}
