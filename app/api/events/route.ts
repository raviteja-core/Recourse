import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM agent_events
      ORDER BY rowid DESC
      LIMIT 100
    `).all() as any[];

    const events = rows.map((r) => ({
      id: r.id,
      actor: r.actor,
      type: r.type,
      payload: r.payload_json ? JSON.parse(r.payload_json) : null,
      reasoningText: r.reasoning_text,
      createdAt: r.created_at,
    }));

    return NextResponse.json({ events });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
