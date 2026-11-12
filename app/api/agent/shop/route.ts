import { NextRequest, NextResponse } from 'next/server';
import { createCartProposal, executeShopperOrder } from '@/lib/agents/shopper';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mandateId, productSkus, rationale, replayMode } = body;

    if (process.env.REPLAY_ONLY === 'true' && !replayMode) {
      return NextResponse.json(
        { error: 'Live PayPal Sandbox checkout is disabled in hosted Replay-Only mode. Please use replay mode or run locally with sandbox credentials.' },
        { status: 403 }
      );
    }

    // 1. Propose cart
    const proposal = createCartProposal(mandateId, productSkus, rationale);

    // 2. Execute guarded order
    const result = await executeShopperOrder(proposal.cartId, {
      replayMode: Boolean(replayMode),
    });

    return NextResponse.json({
      cartId: proposal.cartId,
      total: proposal.total,
      merchantId: proposal.merchantId,
      result,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
