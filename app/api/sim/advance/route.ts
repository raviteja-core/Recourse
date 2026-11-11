import { NextRequest, NextResponse } from 'next/server';
import { advanceVirtualTime, getCurrentVirtualTime } from '@/lib/merchants/fulfillment';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const days = typeof body.days === 'number' ? body.days : 3.5;

    const newTime = advanceVirtualTime(days);
    const db = getDb();

    const fulfillments = db.prepare(`
      SELECT f.*, o.amount, o.paypal_capture_id, c.items_json
      FROM fulfillments f
      JOIN orders o ON f.order_id = o.id
      JOIN carts c ON o.cart_id = c.id
    `).all() as any[];

    return NextResponse.json({
      success: true,
      advancedDays: days,
      currentVirtualTime: newTime.toISOString(),
      fulfillmentsCount: fulfillments.length,
      fulfillments: fulfillments.map((f) => ({
        orderId: f.order_id,
        captureId: f.paypal_capture_id,
        status: f.status,
        carrier: f.carrier,
        trackingNumber: f.tracking_number,
        deliveryReport: f.delivery_report_json ? JSON.parse(f.delivery_report_json) : null,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
