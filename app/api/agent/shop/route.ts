import { NextRequest, NextResponse } from 'next/server';
import { runAiShopperAgent } from '@/lib/agents/shopper';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mandateId, productSkus, rationale, replayMode, goal } = body;

    if (process.env.REPLAY_ONLY === 'true' && !replayMode) {
      return NextResponse.json(
        { error: 'Live PayPal Sandbox checkout is disabled in hosted Replay-Only mode. Please use replay mode or run locally with sandbox credentials.' },
        { status: 403 }
      );
    }

    const db = getDb();
    let effectiveMandateId = mandateId;
    const exists = effectiveMandateId ? db.prepare('SELECT id FROM mandates WHERE id = ?').get(effectiveMandateId) : null;
    if (!exists) {
      const latest = db.prepare('SELECT id FROM mandates ORDER BY rowid DESC LIMIT 1').get() as any;
      effectiveMandateId = latest?.id;
    }
    if (!effectiveMandateId) {
      return NextResponse.json({ error: 'No active mandate found' }, { status: 400 });
    }

    const userGoal = goal || rationale || `Purchase product ${productSkus?.join(', ')}`;
    const shopperResult = await runAiShopperAgent(userGoal, effectiveMandateId, {
      replayMode: Boolean(replayMode),
    });

    const cartRow = db.prepare('SELECT * FROM carts WHERE id = ?').get(shopperResult.cartId) as any;

    return NextResponse.json({
      cartId: shopperResult.cartId,
      total: cartRow?.total || 0,
      merchantId: cartRow?.merchant_id,
      result: shopperResult.checkoutResult,
      toolCalls: shopperResult.toolCallsExecuted,
      model: shopperResult.model,
      latencyMs: shopperResult.latencyMs,
      tokens: shopperResult.tokens,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
