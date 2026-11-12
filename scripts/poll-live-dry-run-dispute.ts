import dotenv from 'dotenv';
import { getDb } from '../lib/db';
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
  const targetCaptureId = process.argv[2] || '48725438S2363071K';
  console.log(`Polling for live dispute on capture: ${targetCaptureId}...`);

  const token = await getAccessToken();
  const startTime = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const listRes = await fetch(`${BASE_URL}/v1/customer/disputes?start_time=${startTime}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!listRes.ok) throw new Error(`List disputes failed: ${await listRes.text()}`);
  const listData = await listRes.json();
  const items = listData.items || [];

  let matched: any = null;
  let matchedDetail: any = null;

  for (const item of items) {
    const dRes = await fetch(`${BASE_URL}/v1/customer/disputes/${item.dispute_id}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (dRes.ok) {
      const dData = await dRes.json();
      const cap = dData.disputed_transactions?.[0]?.seller_transaction_id;
      if (cap === targetCaptureId) {
        matched = item;
        matchedDetail = dData;
        break;
      }
    }
  }

  if (!matched) {
    console.log(`No dispute found yet on capture ${targetCaptureId}. Found ${items.length} total disputes in sandbox:`);
    for (const it of items) {
      console.log(`- Dispute: ${it.dispute_id} | Status: ${it.status} | Reason: ${it.reason} | Capture: ${it.disputed_transactions?.[0]?.seller_transaction_id} | Amount: ${it.dispute_amount?.value} ${it.dispute_amount?.currency_code}`);
    }
    return;
  }

  const disputeId = matched.dispute_id;
  console.log(`\n✓ MATCHED DISPUTE: ${disputeId}`);
  console.log(`Dispute Status: ${matched.status}`);
  console.log(`Dispute Reason: ${matched.reason}`);
  console.log(`Life Cycle Stage: ${matched.dispute_life_cycle_stage}`);

  // Fetch full dispute details
  const detailRes = await fetch(`${BASE_URL}/v1/customer/disputes/${disputeId}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const detailData = await detailRes.json();
  console.log('\nFull Dispute Object:');
  console.log(JSON.stringify(detailData, null, 2));

  // Run Defender
  console.log('\nExecuting Defender evaluation & settlement...');
  const db = getDb();
  const orderRow = db.prepare('SELECT * FROM orders WHERE paypal_capture_id = ?').get(targetCaptureId) as any;
  if (!orderRow) throw new Error(`Order for capture ${targetCaptureId} not found in DB`);

  const decision = await processDisputeDecision(disputeId, orderRow.id, { replayMode: false });
  console.log('\nDefender Decision Result:');
  console.log(JSON.stringify(decision, null, 2));

  // Verify settlement with PayPal API
  console.log('\nVerifying resolution via PayPal API...');
  const updatedDisputeRes = await fetch(`${BASE_URL}/v1/customer/disputes/${disputeId}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const updatedDispute = await updatedDisputeRes.json();
  console.log(`Updated Dispute Status: ${updatedDispute.status}`);
  console.log(`Dispute Life Cycle Stage: ${updatedDispute.dispute_life_cycle_stage}`);

  const captureRes = await fetch(`${BASE_URL}/v2/payments/captures/${targetCaptureId}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const captureData = await captureRes.json();
  console.log(`Capture Status: ${captureData.status}`);
  console.log(`Refund Details:`, captureData.seller_receivable_breakdown || captureData.amount);
}

main().catch(console.error);
