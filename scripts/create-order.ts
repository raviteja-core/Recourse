import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const BASE_URL = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';
const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_SECRET;
const ORDER_SESSION_FILE = path.resolve(process.cwd(), '.spike-order-session.json');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set in .env');
  process.exit(1);
}

async function getAccessToken(): Promise<string> {
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
    throw new Error(`Failed to obtain access token (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function createStandardOrder(token: string, enableVault: boolean = false) {
  console.log(`\n--- Creating Orders v2 (intent: CAPTURE${enableVault ? ', with vault on success' : ''}) ---`);
  
  const paypalPaymentSource: any = {
    experience_context: {
      brand_name: 'Recourse Sandbox Store',
      locale: 'en-US',
      user_action: 'PAY_NOW',
      return_url: 'http://localhost:3000/api/checkout/return',
      cancel_url: 'http://localhost:3000/api/checkout/cancel',
    },
  };

  if (enableVault) {
    paypalPaymentSource.attributes = {
      vault: {
        store_in_vault: 'ON_SUCCESS',
        usage_type: 'MERCHANT',
      },
    };
  }

  const payload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: 'default',
        description: 'Recourse Trail Gear Purchase',
        amount: {
          currency_code: 'USD',
          value: '35.00',
          breakdown: {
            item_total: {
              currency_code: 'USD',
              value: '35.00',
            },
          },
        },
        items: [
          {
            name: 'Larkspur Waterproof Compact Daypack',
            unit_amount: {
              currency_code: 'USD',
              value: '35.00',
            },
            quantity: '1',
            category: 'PHYSICAL_GOODS',
          },
        ],
      },
    ],
    payment_source: {
      paypal: paypalPaymentSource,
    },
  };

  const res = await fetch(`${BASE_URL}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `order-std-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    },
    body: JSON.stringify(payload),
  });

  const resText = await res.text();
  if (!res.ok) {
    throw new Error(`Create Order failed (${res.status}): ${resText}`);
  }

  const data = JSON.parse(resText);
  const approveLink = data.links?.find((l: { rel: string; href: string }) => l.rel === 'payer-action' || l.rel === 'approve')?.href;

  console.log(`Order created successfully: ${data.id}`);
  console.log(`Order status: ${data.status}`);
  console.log(`Approval URL: ${approveLink}`);

  fs.writeFileSync(
    ORDER_SESSION_FILE,
    JSON.stringify({ orderId: data.id, approveLink, createdAt: new Date().toISOString() }, null, 2),
    'utf8'
  );

  return { orderId: data.id, approveLink, data };
}

async function captureOrder(token: string, orderId: string) {
  console.log(`\n--- Capturing Order ${orderId} (POST /v2/checkout/orders/${orderId}/capture) ---`);
  const res = await fetch(`${BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `capture-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    },
  });

  const resText = await res.text();
  if (!res.ok) {
    throw new Error(`Capture Order failed (${res.status}): ${resText}`);
  }

  const data = JSON.parse(resText);
  const captureId = data.purchase_units?.[0]?.payments?.captures?.[0]?.id;
  const vaultToken = data.payment_source?.paypal?.attributes?.vault?.id;

  console.log('Capture succeeded!');
  console.log(`Status: ${data.status}`);
  console.log(`Capture ID: ${captureId}`);
  if (vaultToken) {
    console.log(`Vault Token created on purchase: ${vaultToken}`);
  }

  fs.writeFileSync(
    ORDER_SESSION_FILE,
    JSON.stringify(
      {
        orderId,
        captureId,
        vaultToken,
        status: data.status,
        capturedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf8'
  );

  return { orderId, captureId, vaultToken, data };
}

async function main() {
  const arg = process.argv[2];
  const token = await getAccessToken();

  if (arg === 'capture') {
    let orderId = process.argv[3];
    if (!orderId && fs.existsSync(ORDER_SESSION_FILE)) {
      const session = JSON.parse(fs.readFileSync(ORDER_SESSION_FILE, 'utf8'));
      orderId = session.orderId;
    }
    if (!orderId) {
      console.error('Usage: tsx scripts/create-order.ts capture [orderId]');
      process.exit(1);
    }
    await captureOrder(token, orderId);
    return;
  }

  // Create order
  const enableVault = process.argv.includes('--vault');
  await createStandardOrder(token, enableVault);
}

main().catch((err) => {
  console.error('Order script error:', err.message);
  process.exit(1);
});

