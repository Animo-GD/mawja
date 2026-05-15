import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { image, mask, selection, jobId, mediaUrl } = await req.json();
    const webhookUrl = process.env.STUDIO_ERASE_WEBHOOK_URL;

    if (!webhookUrl) {
      return NextResponse.json({ error: 'Erase service URL not configured' }, { status: 500 });
    }

    // ── 1. Read dynamic price from admin-controlled service_prices ──
    const { data: priceRow } = await supabaseAdmin
      .from('service_prices')
      .select('price')
      .eq('service_name', 'studio_erase')
      .single();
    const ERASE_COST = priceRow?.price ?? 3;

    // ── 2. Check balance BEFORE processing (fail fast, no wasted Modal call) ──
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('credits')
      .eq('id', session.id)
      .single();

    const currentCredits = userRow?.credits ?? 0;
    if (currentCredits < ERASE_COST) {
      return NextResponse.json(
        { error: 'insufficient_credits', required: ERASE_COST, balance: currentCredits },
        { status: 402 }
      );
    }

    // ── 3. Create job record so client can poll if it navigates away ──
    const resolvedJobId = jobId || crypto.randomUUID();
    await supabaseAdmin.from('studio_jobs').insert({
      id: resolvedJobId,
      user_id: session.id,
      media_url: mediaUrl || '',
      status: 'processing',
    });

    // ── 4. Call Modal WITHOUT req.signal — survives client disconnect ──
    const modalRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, mask, selection }),
    });

    if (!modalRes.ok) {
      const text = await modalRes.text();
      const errMsg = `Inpainting service error: ${modalRes.status} — ${text.slice(0, 200)}`;
      await supabaseAdmin
        .from('studio_jobs')
        .update({ status: 'failed', error: errMsg })
        .eq('id', resolvedJobId);
      // No credits deducted — Modal failed
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }

    const contentType = modalRes.headers.get('content-type') || '';
    let resultBase64: string;

    if (contentType.includes('application/json')) {
      const data = await modalRes.json();
      resultBase64 = data.image || data.url || data.media_url;
      if (!resultBase64) throw new Error('Service did not return an image');
    } else if (contentType.includes('image/') || contentType.includes('application/octet-stream')) {
      const arrayBuffer = await modalRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mime = contentType.includes('image/') ? contentType.split(';')[0] : 'image/png';
      resultBase64 = `data:${mime};base64,${buffer.toString('base64')}`;
    } else {
      throw new Error(`Unexpected response type: ${contentType}`);
    }

    // ── 5. Upload result image to Supabase Storage ──
    const base64Data = resultBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const filename = `studio_erase_${resolvedJobId}.png`;
    const storagePath = `${session.id}/${filename}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('images')
      .upload(storagePath, buffer, { contentType: 'image/png', upsert: true });

    let resultUrl: string;
    if (uploadError) {
      // Fallback to base64 inline (don't fail the job)
      resultUrl = resultBase64;
    } else {
      resultUrl = supabaseAdmin.storage.from('images').getPublicUrl(storagePath).data.publicUrl;
    }

    // ── 6. Mark job done ──
    await supabaseAdmin
      .from('studio_jobs')
      .update({ status: 'done', result_url: resultUrl })
      .eq('id', resolvedJobId);

    // ── 7. Deduct credits ONLY after confirmed success ──
    await supabaseAdmin
      .from('users')
      .update({ credits: currentCredits - ERASE_COST })
      .eq('id', session.id);

    await supabaseAdmin.from('credit_transactions').insert({
      user_id: session.id,
      amount: -ERASE_COST,
      type: 'spend',
      description: `Studio AI Erase (job ${resolvedJobId.slice(0, 8)})`,
    });

    return NextResponse.json({ jobId: resolvedJobId, result: resultUrl });
  } catch (error: any) {
    console.error('Studio Erase API Error:', error);
    // No credits deducted on unexpected error
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
