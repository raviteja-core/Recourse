import { NextResponse } from 'next/server';
import { getPublicJwks } from '@/lib/mandate';

export const dynamic = 'force-dynamic';

export async function GET() {
  const jwks = await getPublicJwks();
  return NextResponse.json(jwks, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
