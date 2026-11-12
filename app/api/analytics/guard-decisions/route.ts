import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    const carts = db.prepare(`
      SELECT c.*, m.name as merchantName
      FROM carts c
      LEFT JOIN merchants m ON c.merchant_id = m.id
      WHERE c.mandate_id = (SELECT id FROM mandates ORDER BY rowid DESC LIMIT 1)
      ORDER BY c.rowid ASC
    `).all() as any[];

    const decisions = carts.map((c) => {
      const items = JSON.parse(c.items_json || '[]');
      const guardResult = c.guard_decision_json ? JSON.parse(c.guard_decision_json) : null;
      return {
        cartId: c.id,
        itemTitle: items.map((i: any) => i.title).join(', '),
        merchant: c.merchantName || c.merchant_id,
        amount: c.total,
        decision: guardResult?.decision || (c.status === 'BLOCKED' ? 'BLOCK' : 'ALLOW'),
        reasons: guardResult?.reasons || [],
        explanation: guardResult?.explanation || '',
        createdAt: c.created_at,
      };
    });

    return NextResponse.json({ decisions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
