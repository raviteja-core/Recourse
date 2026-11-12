import { NextRequest, NextResponse } from 'next/server';
import { generateResolverCaseFile } from '@/lib/agents/resolver';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    const resolution = await generateResolverCaseFile(orderId);
    return NextResponse.json(resolution);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

