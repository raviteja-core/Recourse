import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const BASE_URL = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';
const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set');
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
  if (!res.ok) throw new Error(`OAuth failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function pollForDisputes(token: string): Promise<any[]> {
  console.log('Polling GET /v1/customer/disputes...');
  const res = await fetch(`${BASE_URL}/v1/customer/disputes`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`List disputes failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.items || [];
}

async function getDisputeDetails(token: string, disputeId: string): Promise<any> {
  console.log(`Fetching GET /v1/customer/disputes/${disputeId}...`);
  const res = await fetch(`${BASE_URL}/v1/customer/disputes/${disputeId}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Get dispute failed (${res.status}): ${await res.text()}`);
  return await res.json();
}

async function provideEvidence(token: string, disputeId: string) {
  console.log(`\n--- Testing POST /v1/customer/disputes/${disputeId}/provide-evidence ---`);
  const payload = {
    evidence_type: 'PROOF_OF_FULFILLMENT',
    notes: 'Item fulfilled with tracking. Customer mandate hash verified.',
    tracking_info: [
      {
        carrier_name: 'USPS',
        tracking_number: '9400100000000000000000',
      },
    ],
  };

  const res = await fetch(`${BASE_URL}/v1/customer/disputes/${disputeId}/provide-evidence`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const resText = await res.text();
  console.log(`Provide Evidence Status: ${res.status}`);
  console.log(`Response: ${resText || '(empty body - 200 OK)'}`);
  return res.ok;
}

async function makeOffer(token: string, disputeId: string, amount: string = '20.00') {
  console.log(`\n--- Testing POST /v1/customer/disputes/${disputeId}/make-offer ---`);
  const payload = {
    offer_amount: {
      currency_code: 'USD',
      value: amount,
    },
    offer_type: 'REFUND',
    note: 'Offering partial refund of $20.00 for reported item condition.',
  };

  const res = await fetch(`${BASE_URL}/v1/customer/disputes/${disputeId}/make-offer`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const resText = await res.text();
  console.log(`Make Offer Status: ${res.status}`);
  console.log(`Response: ${resText || '(empty body - 200 OK)'}`);
  return res.ok;
}

async function acceptClaim(token: string, disputeId: string) {
  console.log(`\n--- Testing POST /v1/customer/disputes/${disputeId}/accept-claim ---`);
  const payload = {
    note: 'Defender accepted claim based on delivery inspection discrepancy.',
    accept_claim_reason: 'DID_NOT_SHIP_MERCHANDISE',
  };

  const res = await fetch(`${BASE_URL}/v1/customer/disputes/${disputeId}/accept-claim`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const resText = await res.text();
  console.log(`Accept Claim Status: ${res.status}`);
  console.log(`Response: ${resText || '(empty body - 200 OK)'}`);
  return res.ok;
}

async function adjudicateDispute(token: string, disputeId: string, outcome: 'BUYER_FAVOR' | 'SELLER_FAVOR' = 'BUYER_FAVOR') {
  console.log(`\n--- Testing POST /v1/customer/disputes/${disputeId}/adjudicate (Sandbox Settle) ---`);
  const payload = {
    adjudication_outcome: outcome,
  };

  const res = await fetch(`${BASE_URL}/v1/customer/disputes/${disputeId}/adjudicate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const resText = await res.text();
  console.log(`Adjudicate Status: ${res.status}`);
  console.log(`Response: ${resText || '(empty body - 200 OK)'}`);
  return res.ok;
}

async function main() {
  const token = await getAccessToken();
  console.log('Successfully authenticated with PayPal Sandbox.');

  const disputes = await pollForDisputes(token);
  console.log(`Found ${disputes.length} active dispute(s).`);

  if (disputes.length === 0) {
    console.log('\nNo active disputes detected via polling.');
    console.log('Please open a dispute in the Sandbox Resolution Center as buyer, then re-run this script.');
    return;
  }

  const latestDispute = disputes[0];
  console.log('\n=== Latest Dispute Details ===');
  console.log(`Dispute ID: ${latestDispute.dispute_id}`);
  console.log(`Reason: ${latestDispute.reason}`);
  console.log(`Status: ${latestDispute.status}`);
  console.log(`Dispute Amount: ${JSON.stringify(latestDispute.dispute_amount)}`);
  console.log(`Allowable Responses:`, latestDispute.allowable_responses);

  const fullDetails = await getDisputeDetails(token, latestDispute.dispute_id);
  console.log('\nFull Dispute Object:\n', JSON.stringify(fullDetails, null, 2));

  // Test Provide Evidence if allowed
  if (latestDispute.allowable_responses?.includes('PROVIDE_EVIDENCE')) {
    await provideEvidence(token, latestDispute.dispute_id);
  }

  // Test Adjudicate or Accept Claim
  console.log('\nTesting Adjudication / Resolution...');
  await adjudicateDispute(token, latestDispute.dispute_id, 'BUYER_FAVOR');

  // Re-fetch to check final status
  const updatedDetails = await getDisputeDetails(token, latestDispute.dispute_id);
  console.log('\nUpdated Dispute Status:', updatedDetails.status);
  console.log('Dispute Outcome:', updatedDetails.dispute_outcome);
  console.log('Refund details:', updatedDetails.refund_details);
}

main().catch((err) => {
  console.error('Spike 2 Error:', err.message);
  process.exit(1);
});

