import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('studio_jobs')
    .select('id, status, result_url, error')
    .eq('id', jobId)
    .eq('user_id', session.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({
    jobId: data.id,
    status: data.status,           // 'processing' | 'done' | 'failed'
    result: data.result_url,
    error: data.error,
  });
}
