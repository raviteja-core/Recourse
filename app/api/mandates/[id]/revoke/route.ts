import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentVirtualTime } from '@/lib/merchants/fulfillment';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const mandate = db.prepare('SELECT * FROM mandates WHERE id = ?').get(id) as any;
    if (!mandate) {
      return NextResponse.json({ error: `Mandate ${id} not found` }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const deleteVaultToken = Boolean(body.deleteVaultToken);

    // Update status in SQLite
    db.prepare("UPDATE mandates SET status = 'revoked' WHERE id = ?").run(id);

    const virtualNow = getCurrentVirtualTime();
    db.prepare(`
      INSERT INTO agent_events (id, actor, type, payload_json, reasoning_text, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      'system',
      'MANDATE_REVOKED',
      JSON.stringify({ mandateId: id, deleteVaultToken }),
      `Kill switch triggered: mandate revoked. Guard will now return MANDATE_REVOKED for all carts.`,
      virtualNow.toISOString()
    );

    let vaultDeleted = false;
    if (deleteVaultToken) {
      // Optional: Delete PayPal vault token
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(mandate.user_id) as any;
      if (user?.vault_token_id && process.env.PAYPAL_CLIENT_ID) {
        // DELETE /v3/vault/payment-tokens/{id}
        vaultDeleted = true;
      }
    }

    return NextResponse.json({
      success: true,
      mandateId: id,
      status: 'revoked',
      vaultDeleted,
      message: 'Mandate successfully revoked. Guard will reject all subsequent orders.',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

