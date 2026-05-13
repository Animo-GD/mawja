export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

const SUGGEST_WEBHOOK_URL =
  process.env.N8N_SUGGEST_CONTENT_URL ||
  'https://moaaz-n8n.20.56.6.98.sslip.io/webhook/suggest_content';

export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const response = await fetch(SUGGEST_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: session.id }),
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}`);
    }

    const data = await response.json();

    // n8n may return an array directly or wrap it in a key.
    // Normalize to always return an array.
    const ideas = Array.isArray(data) ? data : data.ideas ?? data.data ?? [data];

    return NextResponse.json(ideas);
  } catch (error: any) {
    console.error('Suggest content error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch suggestions' },
      { status: 500 }
    );
  }
}
