import { getDb } from '../db';
import { evaluateGuard, CartEntity, MandateEntity } from '../guard/guard';
import { createReceiptBundle, GENESIS_HASH } from '../receipts/bundle';
import { getCurrentVirtualTime } from '../merchants/fulfillment';

const BASE_URL = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';
const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_SECRET;

export async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_SECRET;
  const baseUrl = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';

  if (!clientId || !clientSecret) {
    throw new Error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set');
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`OAuth failed: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export interface CheckoutOptions {
  replayMode?: boolean;
  agentRationale?: string;
  vaultTokenId?: string;
}

export interface CheckoutResult {
  success: boolean;
  orderId?: string;
  paypalOrderId?: string;
  captureId?: string;
  receiptId?: string;
  receiptHash?: string;
  guardResult: any;
  requireApproval?: boolean;
  error?: string;
}

export async function checkoutGuardedCart(
  cartId: string,
  options: CheckoutOptions = {}
): Promise<CheckoutResult> {
  const db = getDb();
  const cartRow = db.prepare('SELECT * FROM carts WHERE id = ?').get(cartId) as any;
  if (!cartRow) {
    throw new Error(`Cart ${cartId} not found`);
  }

  const mandateRow = db.prepare('SELECT * FROM mandates WHERE id = ?').get(cartRow.mandate_id) as any;
  if (!mandateRow) {
    throw new Error(`Mandate ${cartRow.mandate_id} not found`);
  }

  const mandateConstraints = JSON.parse(mandateRow.constraints_json);
  const cartItems = JSON.parse(cartRow.items_json);

  const mandateEntity: MandateEntity = {
    id: mandateRow.id,
    userId: mandateRow.user_id,
    nlText: mandateRow.nl_text,
    constraints: mandateConstraints,
    status: mandateRow.status,
    signedJws: mandateRow.signed_jws,
    hash: mandateRow.hash,
    spentTotal: mandateRow.spent_total,
  };

  const cartEntity: CartEntity = {
    id: cartRow.id,
    mandateId: cartRow.mandate_id,
    merchantId: cartRow.merchant_id,
    items: cartItems,
    total: cartRow.total,
  };

  const virtualTime = getCurrentVirtualTime();
  const guardResult = await evaluateGuard(mandateEntity, cartEntity, { currentVirtualTime: virtualTime });

  // Update cart with guard decision
  db.prepare('UPDATE carts SET guard_decision_json = ? WHERE id = ?').run(
    JSON.stringify(guardResult),
    cartId
  );

  // Hard BLOCK
  if (guardResult.decision === 'BLOCK') {
    db.prepare('UPDATE carts SET status = ? WHERE id = ?').run('BLOCKED', cartId);
    db.prepare(`
      INSERT INTO agent_events (id, actor, type, payload_json, reasoning_text, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      'guard',
      'CHECKOUT_BLOCKED',
      JSON.stringify({ cartId, reasons: guardResult.reasons, total: cartRow.total }),
      guardResult.explanation,
      virtualTime.toISOString()
    );
    return { success: false, guardResult };
  }

  // Soft Gate: REQUIRE_APPROVAL
  if (guardResult.decision === 'REQUIRE_APPROVAL' && cartRow.human_approval_status !== 'APPROVED') {
    db.prepare('UPDATE carts SET status = ?, human_approval_status = ? WHERE id = ?').run(
      'PENDING_APPROVAL',
      'PENDING',
      cartId
    );
    db.prepare(`
      INSERT INTO agent_events (id, actor, type, payload_json, reasoning_text, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      'guard',
      'APPROVAL_REQUIRED',
      JSON.stringify({ cartId, threshold: mandateConstraints.approvalThreshold, total: cartRow.total }),
      guardResult.explanation,
      virtualTime.toISOString()
    );
    return { success: false, requireApproval: true, guardResult };
  }

  // Execution: ALLOW or Human Approved
  const orderDbId = `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let paypalOrderId: string;
  let paypalCaptureId: string;

  if (options.replayMode) {
    // Real recorded sandbox IDs from fixtures
    const primarySku = cartItems[0]?.sku || '';
    if (primarySku.includes('tent')) {
      paypalOrderId = '4YY66781YU2917137';
      paypalCaptureId = '7BH91632Y92698500';
    } else if (primarySku.includes('jacket')) {
      paypalOrderId = '4JS10478D8056260X';
      paypalCaptureId = '24185227UU994700W';
    } else if (primarySku.includes('pack')) {
      paypalOrderId = '8KC65034CE698390J';
      paypalCaptureId = '4LE12533XH788181M';
    } else {
      paypalOrderId = `ORDER-RECORDED-${cartRow.id.slice(-6)}`;
      paypalCaptureId = `CAPTURE-RECORDED-${cartRow.id.slice(-6)}`;
    }
  } else {
    // Live PayPal Sandbox Checkout
    const userRow = db.prepare('SELECT vault_token_id FROM users WHERE id = ?').get(mandateRow.user_id) as any;
    const vaultTokenId = options.vaultTokenId || userRow?.vault_token_id;

    if (!vaultTokenId) {
      throw new Error('No vaulted payment token available for unattended order checkout');
    }

    const token = await getAccessToken();
    const payload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: 'default',
          description: cartItems.map((i: any) => i.title).join(', '),
          custom_id: orderDbId,
          amount: {
            currency_code: 'USD',
            value: cartRow.total.toFixed(2),
            breakdown: {
              item_total: {
                currency_code: 'USD',
                value: cartRow.total.toFixed(2),
              },
            },
          },
          items: cartItems.map((i: any) => ({
            name: i.title,
            unit_amount: {
              currency_code: 'USD',
              value: Number(i.price).toFixed(2),
            },
            quantity: '1',
            category: 'PHYSICAL_GOODS',
          })),
        },
      ],
      payment_source: {
        paypal: {
          vault_id: vaultTokenId,
          experience_context: {
            brand_name: 'Recourse Demo Store',
          },
        },
      },
    };

    const baseUrl = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';
    const res = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `req-${Date.now()}`,
      },
      body: JSON.stringify(payload),
    });

    const resText = await res.text();
    if (!res.ok) {
      throw new Error(`PayPal Order Capture failed (${res.status}): ${resText}`);
    }

    const orderData = JSON.parse(resText);
    paypalOrderId = orderData.id;
    paypalCaptureId = orderData.purchase_units?.[0]?.payments?.captures?.[0]?.id || `cap-${paypalOrderId}`;
  }

  // Insert Order into DB
  db.prepare(`
    INSERT INTO orders (id, cart_id, paypal_order_id, paypal_capture_id, status, amount, currency, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    orderDbId,
    cartId,
    paypalOrderId,
    paypalCaptureId,
    'COMPLETED',
    cartRow.total,
    'USD',
    virtualTime.toISOString()
  );

  // Update Cart status
  db.prepare('UPDATE carts SET status = ? WHERE id = ?').run('ORDERED', cartId);

  // Update Mandate spent_total
  db.prepare('UPDATE mandates SET spent_total = spent_total + ? WHERE id = ?').run(
    cartRow.total,
    mandateRow.id
  );

  // Find previous receipt for hash-chaining
  const latestReceipt = db.prepare('SELECT hash FROM receipts ORDER BY rowid DESC LIMIT 1').get() as { hash: string } | undefined;
  const prevHash = latestReceipt?.hash || GENESIS_HASH;

  // Build tamper-evident receipt bundle
  const receiptRecord = createReceiptBundle({
    mandateHash: mandateRow.hash,
    mandateJws: mandateRow.signed_jws,
    cart: {
      merchantId: cartRow.merchant_id,
      items: cartItems.map((item: any) => ({
        sku: item.sku,
        title: item.title,
        price: item.price,
        category: item.category,
        attributesAtPurchase: item.attributesAtPurchase || {},
      })),
      total: cartRow.total,
    },
    guard: guardResult,
    humanApproval: cartRow.human_approval_status === 'APPROVED' ? {
      required: true,
      approved: true,
      decidedAt: virtualTime.toISOString(),
      decidedBy: 'user',
      notes: 'Human approval recorded by user in Recourse Control Hub.',
    } : {
      required: false,
      approved: true,
    },
    agentRationale: options.agentRationale || 'Autonomous shopper found optimal items matching mandate criteria.',
    paypal: {
      orderId: paypalOrderId,
      captureId: paypalCaptureId,
      customId: orderDbId,
    },
    prevHash,
    createdAt: virtualTime.toISOString(),
  });

  // Store Receipt in DB
  db.prepare(`
    INSERT INTO receipts (id, order_id, mandate_hash, bundle_json, prev_hash, hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    receiptRecord.bundle.receiptId,
    orderDbId,
    mandateRow.hash,
    JSON.stringify(receiptRecord.bundle),
    receiptRecord.prevHash,
    receiptRecord.hash,
    virtualTime.toISOString()
  );

  // Generate initial fulfillment record
  const trackingNumber = `94001${Math.floor(1000000000000000 + Math.random() * 9000000000000000)}`;
  const initialEvents = [
    {
      status: 'PROCESSING',
      timestamp: virtualTime.toISOString(),
      location: 'Merchant Warehouse',
      description: 'Order confirmed and ready for dispatch.',
    },
  ];

  db.prepare(`
    INSERT INTO fulfillments (id, order_id, carrier, tracking_number, status, events_json, shipped_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    `ful-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    orderDbId,
    'USPS',
    trackingNumber,
    'PROCESSING',
    JSON.stringify(initialEvents),
    virtualTime.toISOString()
  );

  // Log successful guarded checkout event
  db.prepare(`
    INSERT INTO agent_events (id, actor, type, payload_json, reasoning_text, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    'shopper',
    'ORDER_CAPTURED',
    JSON.stringify({
      orderId: orderDbId,
      paypalOrderId,
      captureId: paypalCaptureId,
      total: cartRow.total,
      receiptHash: receiptRecord.hash,
    }),
    `Order successfully captured on PayPal rails with verified Mandate Guard ALLOW.`,
    virtualTime.toISOString()
  );

  return {
    success: true,
    orderId: orderDbId,
    paypalOrderId,
    captureId: paypalCaptureId,
    receiptId: receiptRecord.bundle.receiptId,
    receiptHash: receiptRecord.hash,
    guardResult,
  };
}
