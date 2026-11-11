import * as dotenv from 'dotenv';
import { getDb } from '../lib/db';
import { generateResolverCaseFile } from '../lib/agents/resolver';
import { pollAndDefendDisputes, processDisputeDecision } from '../lib/agents/defender';

dotenv.config();

const BASE_URL = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_SECRET;
  if (!clientId || !clientSecret) throw new Error('Missing PayPal credentials');

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  return data.access_token;
}

async function main() {
  const db = getDb();

  console.log('\n============================================================');
  console.log('=== S3 LIFECYCLE: RIDGEBACK JACKET "NOT AS DESCRIBED" ===');
  console.log('============================================================\n');

  const captureId = '24185227UU994700W';
  const paypalOrderId = '4JS10478D8056260X';
  const orderDbId = 'ord-live-s3-jacket';
  const cartId = 'cart-live-s3-jacket';
  const mandateId = 'mandate-live-a';

  // Ensure prerequisite rows exist in DB for this live order
  const user = db.prepare('SELECT id FROM users LIMIT 1').get() as any;
  const userId = user?.id || 'user-1';

  db.prepare(`
    INSERT OR IGNORE INTO mandates (id, user_id, nl_text, constraints_json, status, signed_jws, hash, created_at, expires_at, spent_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    mandateId,
    userId,
    'Up to $150 on outdoor and camping gear from Larkspur Outdoors and Ridgeback Gear Co.',
    JSON.stringify({ totalCap: 150, perPurchaseCap: 60, categoriesAllow: ['outdoor'] }),
    'active',
    'simulated-live-jws',
    'sha256-live-mandate-hash',
    new Date().toISOString(),
    new Date(Date.now() + 7 * 86400000).toISOString(),
    138.0
  );

  db.prepare(`
    INSERT OR IGNORE INTO carts (id, mandate_id, merchant_id, items_json, total, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    cartId,
    mandateId,
    'ridgeback',
    JSON.stringify([{
      id: 'jacket-1',
      title: 'Ridgeback StormShield All-Weather Jacket',
      price: 38.0,
      category: 'outdoor',
      attributes: { waterproof: true }
    }]),
    38.0,
    'ORDERED',
    new Date().toISOString()
  );

  db.prepare(`
    INSERT OR IGNORE INTO orders (id, cart_id, paypal_order_id, paypal_capture_id, status, amount, currency, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    orderDbId,
    cartId,
    paypalOrderId,
    captureId,
    'COMPLETED',
    38.0,
    'USD',
    new Date().toISOString()
  );

  db.prepare(`
    INSERT OR IGNORE INTO fulfillments (id, order_id, carrier, tracking_number, status, events_json, delivery_report_json, shipped_at, delivered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'ful-live-s3-jacket',
    orderDbId,
    'USPS',
    '9400111899223344556677',
    'DELIVERED',
    JSON.stringify([{ status: 'DELIVERED', timestamp: new Date().toISOString() }]),
    JSON.stringify({
      carrier: 'USPS',
      trackingNumber: '9400111899223344556677',
      deliveredAt: new Date().toISOString(),
      condition: 'DEFECTIVE_NOT_AS_DESCRIBED',
      observedAttributes: { waterproof: false, water_permeable: true },
      inspectorNotes: 'CRITICAL DISCREPANCY: Listing claims waterproof, but tested garment has no seam sealant or water-repellent membrane.'
    }),
    new Date().toISOString(),
    new Date().toISOString()
  );

  db.prepare(`
    INSERT OR IGNORE INTO receipts (id, order_id, mandate_hash, bundle_json, prev_hash, hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'rcpt-live-s3-jacket',
    orderDbId,
    'sha256-live-mandate-hash',
    JSON.stringify({
      mandateHash: 'sha256-live-mandate-hash',
      paypalOrderId,
      guardDecision: { decision: 'ALLOW' },
      items: [{ title: 'Ridgeback StormShield All-Weather Jacket', price: 38.0 }]
    }),
    'prev-hash-live',
    'hash-live-s3-jacket',
    new Date().toISOString()
  );

  // 1. Generate Resolver Case File
  console.log('--- 1. RESOLVER AGENT GENERATING CASE FILE ---');
  const resolution = generateResolverCaseFile(orderDbId);
  if (resolution.status !== 'GROUNDS_FOUND') {
    throw new Error(`Expected grounds found but got: ${resolution.status} - ${resolution.message}`);
  }
  const caseFile = resolution.caseFile;
  console.log(`Case ID: ${caseFile.caseId}`);
  console.log(`Disputed Amount: $${caseFile.disputedAmount.toFixed(2)} USD`);
  console.log(`Reason: ${caseFile.reason}`);
  console.log(`Summary: ${caseFile.summary}`);
  console.log(`\nCopy-Paste Filing Text for Resolution Center:`);
  console.log(`------------------------------------------------------------`);
  console.log(caseFile.copyPasteFilingText);
  console.log(`------------------------------------------------------------\n`);

  // 2. Check if dispute already exists on PayPal Sandbox
  console.log('--- 2. DEFENDER AGENT POLLING PAYPAL FOR DISPUTE ---');
  const token = await getAccessToken();
  const disputeRes = await fetch(`${BASE_URL}/v1/customer/disputes`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const disputeData = await disputeRes.json();
  const activeDisputes = disputeData.items || [];

  console.log(`Active PayPal sandbox disputes found: ${activeDisputes.length}`);

  let matchingDispute = activeDisputes.find((d: any) => {
    const txId = d.disputed_transactions?.[0]?.seller_transaction_id;
    const amount = parseFloat(d.dispute_amount?.value || '0');
    return txId === captureId || Math.abs(amount - 38.0) < 0.01;
  });

  if (!matchingDispute) {
    console.log(`\nNo dispute detected yet for Capture ${captureId} ($38.00).`);
    console.log(`Please follow the manual steps provided to submit the dispute in PayPal Sandbox Resolution Center.`);
    console.log(`Once submitted, re-run this script to execute Defender's automated evaluation and live refund.`);
    return;
  }

  console.log(`Matching dispute found!`);
  console.log(`PayPal Dispute ID: ${matchingDispute.dispute_id}`);
  console.log(`Status: ${matchingDispute.status}`);
  console.log(`Reason: ${matchingDispute.reason}`);

  // 3. Defender processes the decision
  console.log('\n--- 3. DEFENDER AGENT SCORING EVIDENCE & EXECUTING SETTLEMENT ---');
  const decision = await processDisputeDecision(matchingDispute.dispute_id, orderDbId, { replayMode: false });
  console.log(`Decision: ${decision.decision}`);
  console.log(`pWin: ${decision.pWin.toFixed(2)}`);
  console.log(`EV Analysis:`, decision.evAnalysis);
  console.log(`Narrative: ${decision.narrative}`);
  console.log(`Action Taken: ${decision.actionTaken}`);
  console.log(`Refund ID: ${decision.refundId}`);

  // 4. Verify refund on PayPal Capture API
  console.log('\n--- 4. VERIFYING REFUND ON PAYPAL CAPTURE API ---');
  const verifyRes = await fetch(`${BASE_URL}/v2/payments/captures/${captureId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const capData = await verifyRes.json();
  console.log(`Capture ID: ${capData.id}`);
  console.log(`Capture Status: ${capData.status}`);
  console.log(`Seller Receivable Breakdown:`, capData.seller_receivable_breakdown);

  console.log('\n============================================================');
  console.log('=== S3 LIFECYCLE COMPLETED SUCCESSFULLY ===');
  console.log('============================================================\n');
}

main().catch((err) => {
  console.error('Error in S3 lifecycle:', err);
  process.exit(1);
});

