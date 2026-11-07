import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const BASE_URL = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';
const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_SECRET;
const SESSION_FILE = path.resolve(process.cwd(), '.spike-1-session.json');

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

  const data = (await res.json()) as { access_token: string; token_type: string; expires_in: number };
  return data.access_token;
}

async function createSetupToken(token: string) {
  console.log('\n--- Step 1: Creating Vault Setup Token (POST /v3/vault/setup-tokens) ---');
  const payload = {
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

  const res = await fetch(`${BASE_URL}/v3/vault/setup-tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `setup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    },
    body: JSON.stringify(payload),
  });

  const resText = await res.text();
  if (!res.ok) {
    throw new Error(`Create Setup Token failed (${res.status}): ${resText}`);
  }

  const data = JSON.parse(resText);
  const setupTokenId = data.id;
  const approveLink = data.links?.find((l: { rel: string; href: string }) => l.rel === 'approve')?.href;

  console.log(`Setup Token created successfully: ${setupTokenId}`);
  console.log(`Setup Token status: ${data.status}`);
  console.log(`Approval URL: ${approveLink}`);

  fs.writeFileSync(
    SESSION_FILE,
    JSON.stringify({ setupTokenId, approveLink, createdAt: new Date().toISOString() }, null, 2),
    'utf8'
  );

  return { setupTokenId, approveLink, data };
}

async function getSetupToken(token: string, setupTokenId: string) {
  console.log(`\n--- Querying Setup Token Status (GET /v3/vault/setup-tokens/${setupTokenId}) ---`);
  const res = await fetch(`${BASE_URL}/v3/vault/setup-tokens/${setupTokenId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const resText = await res.text();
  if (!res.ok) {
    throw new Error(`Get Setup Token failed (${res.status}): ${resText}`);
  }

  const data = JSON.parse(resText);
  console.log(`Setup Token ID: ${data.id}`);
  console.log(`Setup Token Status: ${data.status}`);
  console.log(`Setup Token Response:\n`, JSON.stringify(data, null, 2));
  return data;
}

async function exchangePaymentToken(token: string, setupTokenId: string) {
  console.log(`\n--- Step 2: Exchanging Setup Token for Permanent Payment Token (POST /v3/vault/payment-tokens) ---`);
  const payload = {
    payment_source: {
      token: {
        id: setupTokenId,
        type: 'SETUP_TOKEN',
      },
    },
  };

  const res = await fetch(`${BASE_URL}/v3/vault/payment-tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `paytoken-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    },
    body: JSON.stringify(payload),
  });

  const resText = await res.text();
  if (!res.ok) {
    throw new Error(`Exchange Payment Token failed (${res.status}): ${resText}`);
  }

  const data = JSON.parse(resText);
  console.log(`Payment Token created successfully!`);
  console.log(`Payment Token ID: ${data.id}`);
  console.log(`Customer ID: ${data.customer?.id || 'N/A'}`);
  return data;
}

async function createUnattendedOrder(token: string, paymentTokenId: string) {
  console.log(`\n--- Step 3: Unattended Checkout (POST /v2/checkout/orders) ---`);
  const orderIdReq = `order-${Date.now()}`;
  const payload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: 'default',
        description: 'Recourse Spike 1 Test Purchase (Tent)',
        custom_id: orderIdReq,
        invoice_id: `INV-${Date.now()}`,
        amount: {
          currency_code: 'USD',
          value: '45.00',
          breakdown: {
            item_total: {
              currency_code: 'USD',
              value: '45.00',
            },
          },
        },
        items: [
          {
            name: 'Larkspur Trail 2-Person Tent',
            unit_amount: {
              currency_code: 'USD',
              value: '45.00',
            },
            quantity: '1',
            category: 'PHYSICAL_GOODS',
          },
        ],
      },
    ],
    payment_source: {
      paypal: {
        vault_id: paymentTokenId,
      },
    },
  };

  const res = await fetch(`${BASE_URL}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `order-req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    },
    body: JSON.stringify(payload),
  });

  const resText = await res.text();
  if (!res.ok) {
    throw new Error(`Create Unattended Order failed (${res.status}): ${resText}`);
  }

  const data = JSON.parse(resText);
  console.log(`Order created successfully!`);
  console.log(`Order ID: ${data.id}`);
  console.log(`Order Status: ${data.status}`);

  let captureId: string | undefined;
  if (data.status === 'COMPLETED') {
    captureId = data.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    console.log(`Order auto-captured upon creation! Capture ID: ${captureId}`);
  } else if (data.status === 'APPROVED') {
    console.log(`Order is APPROVED. Calling POST /v2/checkout/orders/${data.id}/capture...`);
    const capRes = await fetch(`${BASE_URL}/v2/checkout/orders/${data.id}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const capText = await capRes.text();
    if (!capRes.ok) {
      throw new Error(`Capture order failed (${capRes.status}): ${capText}`);
    }
    const capData = JSON.parse(capText);
    captureId = capData.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    console.log(`Order captured! Capture ID: ${captureId}`);
  }

  return { order: data, captureId };
}

async function main() {
  const mode = process.argv[2];
  const accessToken = await getAccessToken();
  console.log('Successfully authenticated with PayPal Sandbox OAuth API.');

  if (mode === 'complete') {
    if (!fs.existsSync(SESSION_FILE)) {
      console.error(`Session file ${SESSION_FILE} not found. Run step 1 first.`);
      process.exit(1);
    }
    const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    console.log(`Resuming with Setup Token: ${session.setupTokenId}`);

    // Step 1: Query setup token status
    const setupTokenStatus = await getSetupToken(accessToken, session.setupTokenId);

    // Step 2: Exchange for permanent payment token
    const paymentTokenData = await exchangePaymentToken(accessToken, session.setupTokenId);
    console.log('Payment Token Response:\n', JSON.stringify(paymentTokenData, null, 2));
    const paymentTokenId = paymentTokenData.id;

    // Step 3: Create unattended order with vault_id
    const orderResult = await createUnattendedOrder(accessToken, paymentTokenId);
    console.log('Unattended Order Response:\n', JSON.stringify(orderResult.order, null, 2));

    console.log('\n=========================================');
    console.log('SPIKE 1 COMPLETED SUCCESSFULLY!');
    console.log(`Vault Token: ${paymentTokenId}`);
    console.log(`Order ID: ${orderResult.order.id}`);
    console.log(`Capture ID: ${orderResult.captureId}`);
    console.log('=========================================\n');

    // Save capture ID to session
    fs.writeFileSync(
      SESSION_FILE,
      JSON.stringify(
        {
          ...session,
          paymentTokenId,
          customerId: paymentTokenData.customer?.id,
          orderId: orderResult.order.id,
          captureId: orderResult.captureId,
          completedAt: new Date().toISOString(),
        },
        null,
        2
      ),
      'utf8'
    );

    return;
  }

  // Default: Step 1 create setup token
  const result = await createSetupToken(accessToken);
  console.log('\n=========================================');
  console.log('ACTION REQUIRED FROM BUYER:');
  console.log('Approval URL:');
  console.log(result.approveLink);
  console.log('=========================================\n');
}

main().catch((err) => {
  console.error('\nSPIKE 1 ERROR:', err.message);
  process.exit(1);
});

