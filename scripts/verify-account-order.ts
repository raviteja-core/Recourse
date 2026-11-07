import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';
const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_SECRET;
const BUYER_EMAIL = process.env.PAYPAL_BUYER_EMAIL;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing PayPal credentials in .env');
  process.exit(1);
}

async function getAccessToken(): Promise<{ token: string; appId?: string }> {
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string; app_id?: string };
  return { token: data.access_token, appId: data.app_id };
}

async function main() {
  console.log('=== Step 1: Configured Non-Secret Account Identifiers ===');
  console.log(`Buyer Email: ${BUYER_EMAIL || 'NOT_SET'}`);

  const { token, appId } = await getAccessToken();
  console.log(`App ID: ${appId || 'N/A'}`);

  console.log('\n=== Step 2: Creating Orders v2 (intent: CAPTURE) ===');
  const orderPayload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: 'default',
        description: 'Recourse Account Verification Order',
        amount: {
          currency_code: 'USD',
          value: '20.00',
        },
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: 'Recourse Sandbox Store',
          locale: 'en-US',
          user_action: 'PAY_NOW',
          return_url: 'http://localhost:3000/api/checkout/return',
          cancel_url: 'http://localhost:3000/api/checkout/cancel',
        },
      },
    },
  };

  const orderRes = await fetch(`${BASE_URL}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `verify-ord-${Date.now()}`,
    },
    body: JSON.stringify(orderPayload),
  });

  const orderText = await orderRes.text();
  if (!orderRes.ok) {
    throw new Error(`Order creation failed (${orderRes.status}): ${orderText}`);
  }

  const orderData = JSON.parse(orderText);
  const payee = orderData.purchase_units?.[0]?.payee;
  const orderApproveLink = orderData.links?.find((l: { rel: string }) => l.rel === 'payer-action' || l.rel === 'approve')?.href;

  console.log(`Order ID: ${orderData.id}`);
  console.log(`Order Status: ${orderData.status}`);
  console.log(`Payee (Merchant) Email: ${payee?.email_address || 'N/A'}`);
  console.log(`Payee Merchant ID: ${payee?.merchant_id || 'N/A'}`);
  console.log(`Orders v2 Approval Link: ${orderApproveLink}`);

  console.log('\n=== Step 3: Creating Fresh Spike 1 Vault Setup Token ===');
  const vaultPayload = {
    payment_source: {
      paypal: {
        usage_type: 'MERCHANT',
        experience_context: {
          brand_name: 'Recourse Sandbox Store',
          locale: 'en-US',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'CONTINUE',
          return_url: 'http://localhost:3000/api/vault/return',
          cancel_url: 'http://localhost:3000/api/vault/cancel',
        },
      },
    },
  };

  const vaultRes = await fetch(`${BASE_URL}/v3/vault/setup-tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `spike1-setup-${Date.now()}`,
    },
    body: JSON.stringify(vaultPayload),
  });

  const vaultText = await vaultRes.text();
  if (!vaultRes.ok) {
    throw new Error(`Vault Setup Token failed (${vaultRes.status}): ${vaultText}`);
  }

  const vaultData = JSON.parse(vaultText);
  const vaultApproveLink = vaultData.links?.find((l: { rel: string }) => l.rel === 'approve')?.href;

  console.log(`Vault Setup Token ID: ${vaultData.id}`);
  console.log(`Vault Status: ${vaultData.status}`);
  console.log(`Vault Approval Link: ${vaultApproveLink}`);

  // Update session file for Spike 1 completion
  const fs = await import('fs');
  const path = await import('path');
  const sessionFile = path.resolve(process.cwd(), '.spike-1-session.json');
  fs.writeFileSync(
    sessionFile,
    JSON.stringify({ setupTokenId: vaultData.id, approveLink: vaultApproveLink, createdAt: new Date().toISOString() }, null, 2),
    'utf8'
  );
}

main().catch((err) => {
  console.error('Verification error:', err.message);
  process.exit(1);
});

