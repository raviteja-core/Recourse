import { NextRequest, NextResponse } from 'next/server';
import { pollAndDefendDisputes } from '@/lib/agents/defender';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handlePoll(req);
}

export async function POST(req: NextRequest) {
  return handlePoll(req);
}

async function handlePoll(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const replayMode = searchParams.get('replay') === 'true' || Boolean(body.replayMode);

    if (process.env.REPLAY_ONLY === 'true' && !replayMode) {
      return NextResponse.json(
        { error: 'Live dispute polling is disabled in hosted Replay-Only mode. Please use replay mode.' },
        { status: 403 }
      );
    }

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

