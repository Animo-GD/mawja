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

    const contentType = response.headers.get('content-type') || '';
    let resultImage = '';

    if (contentType.includes('image/') || contentType.includes('application/octet-stream')) {
      // Handle binary response directly
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');
      const mime = contentType.includes('image/') ? contentType : 'image/png';
      resultImage = `data:${mime};base64,${base64}`;
    } else {
      // Handle JSON response
      const data = await response.json();
      resultImage = data.image || data.url || data.media_url;
    }

    if (!resultImage) {
      throw new Error('AI Webhook did not return an image');
    }

    return NextResponse.json({ result: resultImage });
  } catch (error: any) {
    console.error('Studio Erase API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
