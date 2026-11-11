import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { signMandate, MandateConstraintsSchema } from '@/lib/mandate';
import { getCurrentVirtualTime } from '@/lib/merchants/fulfillment';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const mandates = db.prepare('SELECT * FROM mandates ORDER BY created_at DESC').all();
  return NextResponse.json({ mandates });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const constraints = MandateConstraintsSchema.parse(body.constraints);
    const nlText = body.nlText || 'Spending mandate';
    const userId = body.userId || 'user-1';

    const { signedJws, hash } = await signMandate(constraints);
    const virtualNow = getCurrentVirtualTime();
    const mandateId = `mandate-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const db = getDb();
    db.prepare(`
      INSERT INTO mandates (id, user_id, nl_text, constraints_json, status, signed_jws, hash, created_at, expires_at, spent_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      mandateId,
      userId,
      nlText,
      JSON.stringify(constraints),
      'active',
      signedJws,
      hash,
      virtualNow.toISOString(),
      constraints.expiresAt,
      0.0
    );

    return NextResponse.json({
      mandateId,
      signedJws,
      hash,
      constraints,
      status: 'active',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
