import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    const disputes = db.prepare(`
      SELECT 
        d.*,
        o.paypal_capture_id as captureId,
        o.amount as orderAmount,
        c.items_json as itemsJson,
        m.name as merchantName
      FROM disputes d
      JOIN orders o ON d.order_id = o.id
      JOIN carts c ON o.cart_id = c.id
      LEFT JOIN merchants m ON c.merchant_id = m.id
      ORDER BY d.rowid DESC
    `).all() as any[];

    const timeline = disputes.map((d) => {
      const items = JSON.parse(d.itemsJson || '[]');
      return {
        disputeId: d.id,
        paypalDisputeId: d.paypal_dispute_id || d.id,
        itemTitle: items.map((i: any) => i.title).join(', '),
        merchant: d.merchantName || 'Merchant',
        reason: d.reason,
        status: d.status,
        outcome: d.outcome || 'PENDING',
        disputedAmount: d.orderAmount,
        refundedAmount: d.refunded_amount || 0.0,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      };
    });

    return NextResponse.json({ timeline });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
