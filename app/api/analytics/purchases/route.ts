import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT 
        o.id as orderId,
        o.paypal_order_id as paypalOrderId,
        o.paypal_capture_id as paypalCaptureId,
        o.status as orderStatus,
        o.amount,
        o.created_at as createdAt,
        c.merchant_id as merchantId,
        m.name as merchantName,
        c.items_json as itemsJson,
        c.guard_decision_json as guardDecisionJson,
        r.hash as receiptHash,
        r.prev_hash as prevHash,
        f.status as fulfillmentStatus,
        f.carrier,
        f.tracking_number as trackingNumber
      FROM orders o
      JOIN carts c ON o.cart_id = c.id
      LEFT JOIN merchants m ON c.merchant_id = m.id
      LEFT JOIN receipts r ON r.order_id = o.id
      LEFT JOIN fulfillments f ON f.order_id = o.id
      WHERE c.mandate_id = (SELECT id FROM mandates ORDER BY rowid DESC LIMIT 1)
      ORDER BY o.rowid ASC
    `).all() as any[];

    const purchases = rows.map((r) => {
      const items = JSON.parse(r.itemsJson || '[]');
      const guardResult = r.guardDecisionJson ? JSON.parse(r.guardDecisionJson) : null;
      const decision = guardResult?.decision || (r.orderStatus === 'BLOCKED' ? 'BLOCK' : 'ALLOW');
      return {
        orderId: r.orderId,
        itemTitle: items.map((i: any) => i.title).join(', '),
        merchant: r.merchantName || r.merchantId,
        amount: r.amount,
        currency: 'USD',
        status: r.orderStatus,
        guardDecision: decision,
        paypalOrderId: r.paypalOrderId,
        paypalCaptureId: r.paypalCaptureId,
        receiptHash: r.receiptHash ? `${r.receiptHash.slice(0, 16)}...` : 'N/A',
        fulfillmentStatus: r.fulfillmentStatus || 'PROCESSING',
        trackingNumber: r.trackingNumber || 'N/A',
        createdAt: r.createdAt,
      };
    });

    return NextResponse.json({ purchases });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
