import { NextRequest, NextResponse } from 'next/server';
import { createCartProposal, executeShopperOrder } from '@/lib/agents/shopper';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mandateId, productSkus, rationale, replayMode } = body;

    if (!mandateId || !productSkus || !Array.isArray(productSkus)) {
      return NextResponse.json(
        { error: 'mandateId and productSkus array are required' },
        { status: 400 }
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
