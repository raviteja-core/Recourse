import dotenv from 'dotenv';
import { getDb } from '../lib/db';
import { pollAndDefendDisputes, processDisputeDecision } from '../lib/agents/defender';

dotenv.config();

const BASE_URL = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';

async function fetchWithRetry(url: string, options: any, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err: any) {
      console.warn(`Fetch attempt ${i + 1} failed: ${err.message}. Retrying...`);
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('Unreachable');
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_SECRET;
  if (!clientId || !clientSecret) throw new Error('Missing PayPal credentials');

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetchWithRetry(`${BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  return data.access_token;
}

async function main() {
  const targetCaptureId = process.argv[2] || '48725438S2363071K';
  const knownDisputeId = process.argv[3] || 'PP-R-JVE-10199692';
  console.log(`Polling for live dispute on capture: ${targetCaptureId} (known dispute ID: ${knownDisputeId})...`);

  const token = await getAccessToken();

  let disputeId = knownDisputeId;
  let detailData: any = null;

  if (knownDisputeId) {
    const detailRes = await fetchWithRetry(`${BASE_URL}/v1/customer/disputes/${knownDisputeId}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (detailRes.ok) {
      detailData = await detailRes.json();
      disputeId = detailData.dispute_id;
    }
  }

  if (!detailData) {
    const startTime = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const listRes = await fetchWithRetry(`${BASE_URL}/v1/customer/disputes?start_time=${startTime}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!listRes.ok) throw new Error(`List disputes failed: ${await listRes.text()}`);
    const listData = await listRes.json();
    const items = listData.items || [];

    for (const item of items) {
      const dRes = await fetchWithRetry(`${BASE_URL}/v1/customer/disputes/${item.dispute_id}`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (dRes.ok) {
        const dData = await dRes.json();
        const cap = dData.disputed_transactions?.[0]?.seller_transaction_id;
        if (cap === targetCaptureId) {
          disputeId = item.dispute_id;
          detailData = dData;
          break;
        }
      }
    }
  }

  if (!detailData) {
    console.log(`No dispute found yet on capture ${targetCaptureId}.`);
    return;
  }
  console.log(`\n✓ MATCHED DISPUTE: ${disputeId}`);
  console.log(`Dispute Status: ${detailData.status}`);
  console.log(`Dispute Reason: ${detailData.reason}`);
  console.log(`Life Cycle Stage: ${detailData.dispute_life_cycle_stage}`);

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
