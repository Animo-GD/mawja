import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { image, selection } = await req.json();
    const webhookUrl = process.env.STUDIO_ERASE_WEBHOOK_URL;

    if (!webhookUrl) {
      return NextResponse.json({ error: 'Webhook URL not configured' }, { status: 500 });
    }

    // Call the AI Webhook (n8n / custom)
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image, // Full image as base64
        selection, // { x, y, width, height }
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`AI Webhook error: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Support both direct base64 or a URL response
    const resultImage = data.image || data.url || data.media_url;

    if (!resultImage) {
      throw new Error('AI Webhook did not return an image');
    }

    return NextResponse.json({ result: resultImage });
  } catch (error: any) {
    console.error('Studio Erase API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
