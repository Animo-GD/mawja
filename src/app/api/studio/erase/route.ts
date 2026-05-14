import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { image, selection } = await req.json();
    const webhookUrl = process.env.STUDIO_ERASE_WEBHOOK_URL;

    if (!webhookUrl) {
      return NextResponse.json({ error: 'Erase service URL not configured' }, { status: 500 });
    }

    // Call the Modal LaMa inpainting endpoint
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, selection }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Inpainting service error: ${response.status} — ${text.slice(0, 200)}`);
    }

    const contentType = response.headers.get('content-type') || '';

    // Modal returns JSON: { "image": "data:image/png;base64,..." }
    if (contentType.includes('application/json')) {
      const data = await response.json();
      const resultImage = data.image || data.url || data.media_url;
      if (!resultImage) throw new Error('Service did not return an image');
      return NextResponse.json({ result: resultImage });
    }

    // Fallback: binary image response
    if (contentType.includes('image/') || contentType.includes('application/octet-stream')) {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');
      const mime = contentType.includes('image/') ? contentType.split(';')[0] : 'image/png';
      return NextResponse.json({ result: `data:${mime};base64,${base64}` });
    }

    throw new Error(`Unexpected response type: ${contentType}`);
  } catch (error: any) {
    console.error('Studio Erase API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
