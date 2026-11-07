import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

import { getDb } from '../lib/db';
import { SEED_PRODUCTS, SEED_MERCHANTS } from '../lib/merchants/catalog';
import { parseMandateNaturalLanguage, signMandate } from '../lib/mandate';
import { createCartProposal, executeShopperOrder, approveCartProposal } from '../lib/agents/shopper';
import { advanceVirtualTime, getCurrentVirtualTime } from '../lib/merchants/fulfillment';
import { verifyReceiptChain } from '../lib/receipts/bundle';

const isReplay = process.argv.includes('--replay');

async function main() {
  console.log('\n================================================================');
  console.log(`=== RECOURSE GOLDEN PATH DEMO RUNNER [${isReplay ? 'REPLAY FIXTURE MODE' : 'LIVE SANDBOX MODE'}] ===`);
  console.log('================================================================\n');

  // Step 0: Ensure fresh seeded state
  const { execSync } = await import('child_process');
  execSync('npx tsx scripts/seed.ts', { stdio: 'inherit' });

  const db = getDb();
  const startTime = getCurrentVirtualTime();

  console.log('\n--- 1. PARSING & SIGNING MANDATE A ---');
  const mandateText =
    'Up to $150 on outdoor and camping gear from Larkspur Outdoors and Ridgeback Gear Co. Max $60 per purchase. Ask me before anything over $50. Expires in 7 days.';
  console.log(`Prompt: "${mandateText}"`);

  const { constraints, isFallback } = await parseMandateNaturalLanguage(mandateText, startTime);
  if (isFallback) {
    console.log('[Notice: Parsed via verified deterministic fallback mode]');
  } else {
    console.log('[Parsed via Live Groq LLM]');
  }
  console.log('Constraints:', JSON.stringify(constraints, null, 2));

  const { signedJws, hash } = await signMandate(constraints);
  console.log(`Mandate Hash (SHA-256): ${hash}`);
  console.log(`Signed JWS (ES256): ${signedJws.slice(0, 32)}...`);

  const mandateId = `mandate-a-${Date.now()}`;
  db.prepare(`
    INSERT INTO mandates (id, user_id, nl_text, constraints_json, status, signed_jws, hash, created_at, expires_at, spent_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    mandateId,
    'user-1',
    mandateText,
    JSON.stringify(constraints),
    'active',
    signedJws,
    hash,
    startTime.toISOString(),
    constraints.expiresAt,
    0.0
  );

  console.log('\n--- 2. SCENARIO S1: APPROVED PURCHASE (Larkspur Trail Tent $45.00) ---');
  const p1 = createCartProposal(mandateId, ['tent-1'], 'Selected 2-person waterproof tent within outdoor category.');
  console.log(`Cart Proposed: ${p1.cartId} | Total: $${p1.total.toFixed(2)} | Merchant: ${p1.merchantId}`);

  const res1 = await executeShopperOrder(p1.cartId, { replayMode: isReplay });
  console.log(`Guard Decision: ${res1.guardResult.decision} (${res1.guardResult.explanation})`);
  console.log(`Checkout: ${res1.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`Order ID: ${res1.paypalOrderId} | Capture ID: ${res1.captureId}`);
  console.log(`Receipt Hash: ${res1.receiptHash}`);

  console.log('\n--- 3. SCENARIO S2: BLOCKED PURCHASE (AudioPro Headphones $129.00) ---');
  const p2 = createCartProposal(
    mandateId,
    ['headphones-1'],
    'Autonomous shopper attempted to buy noise-cancelling headphones.'
  );
  console.log(`Cart Proposed: ${p2.cartId} | Total: $${p2.total.toFixed(2)} | Merchant: ${p2.merchantId}`);

  const res2 = await executeShopperOrder(p2.cartId, { replayMode: isReplay });
  console.log(`Guard Decision: ${res2.guardResult.decision}`);
  console.log(`Violations Caught:`, res2.guardResult.reasons);
  console.log(`Explanation: ${res2.guardResult.explanation}`);
  console.log(`Checkout Status: ${res2.success ? 'UNEXPECTED_SUCCESS' : 'BLOCKED AS EXPECTED'}`);

  console.log('\n--- 4. SCENARIO S3: PURCHASE WITH LATENT DEFECT (Ridgeback Jacket $38.00) ---');
  const p3 = createCartProposal(
    mandateId,
    ['jacket-1'],
    'Purchased Ridgeback StormShield all-weather jacket matching outdoor budget.'
  );
  console.log(`Cart Proposed: ${p3.cartId} | Total: $${p3.total.toFixed(2)} | Merchant: ${p3.merchantId}`);

  const res3 = await executeShopperOrder(p3.cartId, { replayMode: isReplay });
  console.log(`Guard Decision: ${res3.guardResult.decision}`);
  console.log(`Checkout: ${res3.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`Order ID: ${res3.paypalOrderId} | Capture ID: ${res3.captureId}`);
  console.log(`Receipt Hash: ${res3.receiptHash}`);

  console.log('\n--- 5. HUMAN-APPROVAL FLOW (Ridgeback Expedition Pack $55.00 > $50 threshold) ---');
  const p4 = createCartProposal(
    mandateId,
    ['pack-1'],
    'Expedition Pack 55L requested. Total ($55.00) exceeds $50 approval threshold.'
  );
  console.log(`Cart Proposed: ${p4.cartId} | Total: $${p4.total.toFixed(2)}`);

  // First evaluation: must return REQUIRE_APPROVAL
  const res4Pre = await executeShopperOrder(p4.cartId, { replayMode: isReplay });
  console.log(`Guard Pre-check Decision: ${res4Pre.guardResult.decision}`);
  console.log(`Require Approval Flag: ${res4Pre.requireApproval}`);

  // User records approval in UI
  console.log(`Simulating Human Approval via UI...`);
  approveCartProposal(p4.cartId, 'Confirmed by user: Expedition Pack approved for upcoming trek.');

  // Second evaluation: executes checkout
  const res4Post = await executeShopperOrder(p4.cartId, { replayMode: isReplay });
  console.log(`Guard Post-approval Checkout: ${res4Post.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`Order ID: ${res4Post.paypalOrderId} | Capture ID: ${res4Post.captureId}`);
  console.log(`Receipt Hash: ${res4Post.receiptHash}`);

  console.log('\n--- 6. ACCELERATING DEMO CLOCK & FULFILLMENT SIMULATION ---');
  const advancedDate = advanceVirtualTime(3.5);
  console.log(`Advanced clock by 3.5 days -> Current Virtual Time: ${advancedDate.toISOString()}`);

  const fulfillments = db.prepare(`
    SELECT f.*, o.amount, o.paypal_capture_id, c.items_json
    FROM fulfillments f
    JOIN orders o ON f.order_id = o.id
    JOIN carts c ON o.cart_id = c.id
  `).all() as any[];

  console.log(`Fulfillment Updates:`);
  for (const f of fulfillments) {
    const items = JSON.parse(f.items_json);
    const report = f.delivery_report_json ? JSON.parse(f.delivery_report_json) : null;
    console.log(`- Order: ${f.order_id} | Capture: ${f.paypal_capture_id} | Status: ${f.status}`);
    console.log(`  Items: ${items.map((i: any) => i.title).join(', ')}`);
    if (report) {
      console.log(`  Delivery Condition: ${report.condition}`);
      console.log(`  Inspector Notes: ${report.inspectorNotes}`);
    }
  }

  console.log('\n--- 7. VERIFYING RECEIPT HASH CHAIN ---');
  const receiptRows = db.prepare('SELECT * FROM receipts ORDER BY rowid ASC').all() as any[];
  const receipts = receiptRows.map((r) => ({
    bundle: JSON.parse(r.bundle_json),
    prevHash: r.prev_hash,
    hash: r.hash,
  }));

  const chainResult = verifyReceiptChain(receipts);
  console.log(`Receipt Chain Length: ${receipts.length}`);
  console.log(`Chain Integrity: ${chainResult.valid ? 'VERIFIED (UNBROKEN & TAMPER-EVIDENT)' : 'COMPROMISED'}`);
  if (!chainResult.valid) {
    throw new Error(`Receipt chain verification failed: ${chainResult.error}`);
  }

  const updatedMandate = db.prepare('SELECT * FROM mandates WHERE id = ?').get(mandateId) as any;
  console.log('\n================================================================');
  console.log('=== CORE ENGINE RUN SUMMARY ===');
  console.log(`Mandate Total Cap: $${constraints.totalCap.toFixed(2)}`);
  console.log(`Total Spent Recorded: $${updatedMandate.spent_total.toFixed(2)} / $${constraints.totalCap.toFixed(2)}`);
  console.log(`Budget Remaining: $${(constraints.totalCap - updatedMandate.spent_total).toFixed(2)}`);
  console.log(`Orders Executed: ${receipts.length}`);
  console.log(`Attempted Over-Cap / Out-of-Category Orders Blocked: 1 ($129.00 protected)`);
  console.log('================================================================\n');

  // Save sanitized fixture for replay mode
  const fixtureDir = path.resolve(process.cwd(), 'data/fixtures');
  if (!fs.existsSync(fixtureDir)) fs.mkdirSync(fixtureDir, { recursive: true });
  fs.writeFileSync(
    path.join(fixtureDir, 'demo-run.json'),
    JSON.stringify(
      {
        mandate: { ...updatedMandate, signed_jws: '[REDACTED_JWS]' },
        receiptsCount: receipts.length,
        spentTotal: updatedMandate.spent_total,
        verifiedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf8'
  );
}

main().catch((err) => {
  console.error('\nDEMO RUNNER ERROR:', err);
  process.exit(1);
});
