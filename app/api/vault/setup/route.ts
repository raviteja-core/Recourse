import { NextRequest, NextResponse } from 'next/server';
import { createVaultSetupToken } from '@/lib/paypal/vault';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    if (process.env.REPLAY_ONLY === 'true') {
      return NextResponse.json(
        { error: 'PayPal Vault setup is disabled in Replay-Only mode.' },
        { status: 403 }
      );
    }

    const host = req.headers.get('host') || 'localhost:3000';
    const proto = req.headers.get('x-forwarded-proto') || 'http';
    const returnUrl = `${proto}://${host}/api/vault/return`;
    const cancelUrl = `${proto}://${host}/api/vault/cancel`;

    const result = await createVaultSetupToken(returnUrl, cancelUrl);

    return NextResponse.json({
      success: true,
      setupTokenId: result.setupTokenId,
      approveUrl: result.approveUrl,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

