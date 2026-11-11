import { NextRequest, NextResponse } from 'next/server';
import { pollAndDefendDisputes } from '@/lib/agents/defender';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const replayMode = searchParams.get('replay') === 'true';

    const decisions = await pollAndDefendDisputes({ replayMode });

    return NextResponse.json({
      success: true,
      mode: replayMode ? 'replay' : 'live',
      disputesProcessed: decisions.length,
      decisions,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
