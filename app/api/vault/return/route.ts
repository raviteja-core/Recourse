import { NextRequest, NextResponse } from 'next/server';
import { exchangeVaultSetupToken } from '@/lib/paypal/vault';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const approvalTokenId = searchParams.get('approval_token_id');

  if (!approvalTokenId) {
    return new Response(
      `<html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h2 style="color: #dc2626;">Missing Approval Token</h2>
          <p>No approval_token_id was provided in the return URL.</p>
          <a href="/" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px;">Return to Console</a>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 400 }
    );
  }

  try {
    const result = await exchangeVaultSetupToken(approvalTokenId);

    return new Response(
      `<!DOCTYPE html>
      <html>
        <head>
          <title>PayPal Vault Connected - Recourse</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
            .card { background: white; border-radius: 16px; padding: 40px; max-width: 500px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; text-align: center; }
            .badge { display: inline-block; background: #ecfdf5; color: #059669; font-weight: 600; padding: 6px 14px; border-radius: 9999px; font-size: 14px; margin-bottom: 16px; }
            h1 { font-size: 22px; margin: 0 0 12px 0; font-weight: 700; color: #0f172a; }
            p { color: #64748b; font-size: 14px; line-height: 1.5; margin: 0 0 24px 0; }
            .token-box { background: #f1f5f9; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 13px; color: #334155; margin-bottom: 24px; word-break: break-all; }
            .btn { display: inline-block; background: #0070ba; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; transition: background 0.2s; }
            .btn:hover { background: #005ea6; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="badge">✓ Vault Connected</div>
            <h1>PayPal Authorization Completed</h1>
            <p>Your buyer account is now connected and vaulted with merchant checkout permissions for autonomous agent purchases.</p>
            <div class="token-box">Vault Payment Token: ${result.paymentTokenId}</div>
            <a href="/" class="btn">Return to Recourse Demo Console</a>
          </div>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  } catch (error: any) {
    return new Response(
      `<html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h2 style="color: #dc2626;">Vault Exchange Failed</h2>
          <p>${error.message}</p>
          <a href="/" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px;">Return to Console</a>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 500 }
    );
  }
}
