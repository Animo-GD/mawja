export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const webhookUrl = process.env.N8N_SUGGEST_CONTENT_URL;
    if (!webhookUrl) {
      return NextResponse.json(
        { error: 'N8N_SUGGEST_CONTENT_URL is not set in .env.local' },
        { status: 503 }
      );
    }

    // ── Credit check & deduction ──────────────────────────────────────
    const { data: priceRow } = await supabase
      .from('service_prices')
      .select('price')
      .eq('service_name', 'idea_generation')
      .single();
    const cost = priceRow?.price ?? 5;

    if (session.id !== 'demo') {
      const { data: userRow } = await supabase
        .from('users')
        .select('credits')
        .eq('id', session.id)
        .single();

      if ((userRow?.credits ?? 0) < cost) {
        return NextResponse.json(
          { error: 'Insufficient credits. Please buy more credits to continue.' },
          { status: 402 }
        );
      }

      // Deduct credits
      await supabase
        .from('users')
        .update({ credits: (userRow!.credits ?? 0) - cost })
        .eq('id', session.id);

      await supabase.from('credit_transactions').insert({
        user_id: session.id,
        amount: -cost,
        type: 'spend',
        description: 'Content idea generation',
      });
    }

    // ── Fetch business profile for agent context ──────────────────────
    const { data: businessProfile } = await supabase
      .from('business')
      .select('*')
      .eq('user_id', session.id)
      .eq('is_active', true)
      .single();

    // ── Call n8n webhook ──────────────────────────────────────────────
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: session.id,
        business_profile: businessProfile ?? null,
      }),
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}`);
    }

    const data = await response.json();

    // ── Normalize response ────────────────────────────────────────────
    // Handles: [{output:[...]}], [...], {ideas:[...]}, {data:[...]}
    let ideas: any[];
    if (Array.isArray(data) && data.length > 0 && data[0]?.output) {
      ideas = data[0].output;
    } else if (Array.isArray(data)) {
      ideas = data;
    } else {
      ideas = data.ideas ?? data.data ?? [data];
    }

    return NextResponse.json(ideas);
  } catch (error: any) {
    console.error('Suggest content error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch suggestions' },
      { status: 500 }
    );
  }
}
