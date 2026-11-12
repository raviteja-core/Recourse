import { getDb } from '../db';
import { getAccessToken } from './orders';

const BASE_URL = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';

export interface SetupTokenResult {
  setupTokenId: string;
  approveUrl: string;
  status: string;
}

export interface PaymentTokenResult {
  paymentTokenId: string;
  customerId?: string;
  status: string;
}

/**
 * Creates a PayPal Vault Setup Token for autonomous agent merchant checkout.
 * Rule 3: Never log, print, or expose client secret or bearer token.
 */
export async function createVaultSetupToken(
  returnUrl = 'http://localhost:3000/api/vault/return',
  cancelUrl = 'http://localhost:3000/api/vault/cancel'
): Promise<SetupTokenResult> {
  const token = await getAccessToken();

  const payload = {
    payment_source: {
      paypal: {
        usage_type: 'MERCHANT',
        experience_context: {
          brand_name: 'Recourse Sandbox Store',
          locale: 'en-US',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'CONTINUE',
          return_url: returnUrl,
          cancel_url: cancelUrl,
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
    throw new Error(`Failed to create Vault setup token (${res.status}): ${resText}`);
  }

  const data = JSON.parse(resText);
  const approveLink = data.links?.find((l: { rel: string; href: string }) => l.rel === 'approve')?.href;

  if (!approveLink) {
    throw new Error('PayPal response did not contain an approve link');
  }

  return {
    setupTokenId: data.id,
    approveUrl: approveLink,
    status: data.status,
  };
}

/**
 * Exchanges an approved setup token for a permanent payment token (vault_id).
 * Updates the user's active vault token in the database.
 */
export async function exchangeVaultSetupToken(setupTokenId: string, userId = 'user-1'): Promise<PaymentTokenResult> {
  const token = await getAccessToken();

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
      'PayPal-Request-Id': `exchange-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    },
    body: JSON.stringify(payload),
  });

  const resText = await res.text();
  if (!res.ok) {
    throw new Error(`Failed to exchange payment token (${res.status}): ${resText}`);
  }

  const data = JSON.parse(resText);
  const paymentTokenId = data.id;
  const customerId = data.customer?.id;

  // Persist to SQLite DB
  const db = getDb();
  db.prepare(`
    UPDATE users 
    SET vault_token_id = ?, paypal_customer_id = COALESCE(?, paypal_customer_id), vault_status = 'ACTIVE'
    WHERE id = ?
  `).run(paymentTokenId, customerId || null, userId);

  return {
    paymentTokenId,
    customerId,
    status: data.status,
  };
}
