import { NextRequest, NextResponse } from 'next/server';
import { parseMandateNaturalLanguage } from '@/lib/mandate';
import { getCurrentVirtualTime } from '@/lib/merchants/fulfillment';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const nlText = body.text || body.prompt;
    if (!nlText) {
      return NextResponse.json({ error: 'Missing prompt text' }, { status: 400 });
    }

    const now = getCurrentVirtualTime();
    const result = await parseMandateNaturalLanguage(nlText, now);

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

