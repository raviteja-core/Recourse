import { NextResponse } from 'next/server';
import { calculateKpisFromDb } from '@/lib/analytics/kpis';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const kpis = calculateKpisFromDb();
    return NextResponse.json(kpis);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
