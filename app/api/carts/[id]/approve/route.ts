import { NextRequest, NextResponse } from 'next/server';
import { approveCartProposal, executeShopperOrder } from '@/lib/agents/shopper';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = body.reason || 'Approved by user via Recourse Console';
    const replayMode = Boolean(body.replayMode);

    // 1. Record human approval
    approveCartProposal(id, reason);

    // 2. Execute guarded checkout
    const result = await executeShopperOrder(id, { replayMode });

    return NextResponse.json({
      cartId: id,
      approved: true,
      result,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

