import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { calculateKpisFromDb, EXCLUDED_SPIKE_ORDER_IDS, EXCLUDED_SPIKE_DISPUTE_IDS } from '@/lib/analytics/kpis';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    const mandate = db.prepare('SELECT * FROM mandates ORDER BY rowid DESC LIMIT 1').get() as any;

    const rawOrders = db.prepare(`
      SELECT o.*, c.merchant_id, c.items_json, m.name as merchant_name
      FROM orders o
      JOIN carts c ON o.cart_id = c.id
      LEFT JOIN merchants m ON c.merchant_id = m.id
    `).all() as any[];

    // Exclude spike orders
    const orders = rawOrders.filter(
      (o) => !EXCLUDED_SPIKE_ORDER_IDS.includes(o.paypal_order_id) && !EXCLUDED_SPIKE_ORDER_IDS.includes(o.id)
    );

    const receipts = db.prepare('SELECT * FROM receipts ORDER BY rowid ASC').all() as any[];

    const rawDisputes = db.prepare('SELECT * FROM disputes ORDER BY rowid DESC').all() as any[];
    // Exclude spike disputes
    const disputes = rawDisputes.filter(
      (d) => !EXCLUDED_SPIKE_DISPUTE_IDS.includes(d.paypal_dispute_id) && !EXCLUDED_SPIKE_DISPUTE_IDS.includes(d.id)
    );

    const kpis = calculateKpisFromDb();

    return NextResponse.json({
      mandate: mandate ? {
        id: mandate.id,
        nlText: mandate.nl_text,
        status: mandate.status,
        constraints: JSON.parse(mandate.constraints_json),
        signedJws: mandate.signed_jws,
        hash: mandate.hash,
        spentTotal: kpis.spentTotal,
        totalCap: kpis.totalCap,
      } : null,
      kpis,
      orders: orders.map((o) => ({
        id: o.id,
        paypalOrderId: o.paypal_order_id,
        captureId: o.paypal_capture_id,
        amount: o.amount,
        status: o.status,
        merchantName: o.merchant_name,
        items: JSON.parse(o.items_json || '[]'),
        createdAt: o.created_at,
      })),
      receipts: receipts.map((r) => ({
        id: r.id,
        orderId: r.order_id,
        hash: r.hash,
        prevHash: r.prev_hash,
        createdAt: r.created_at,
      })),
      disputes: disputes.map((d) => ({
        id: d.id,
        paypalDisputeId: d.paypal_dispute_id,
        orderId: d.order_id,
        reason: d.reason,
        status: d.status,
        disputedAmount: d.disputed_amount,
        refundedAmount: d.refunded_amount,
        createdAt: d.created_at,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
