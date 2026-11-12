import { getDb } from '../lib/db';
import { SEED_MERCHANTS, SEED_PRODUCTS } from '../lib/merchants/catalog';
import {
  setVirtualTime,
  getCurrentVirtualTime,
  advanceVirtualTime,
} from '../lib/merchants/fulfillment';
import { parseMandateNaturalLanguage, signMandate } from '../lib/mandate';
import { createCartProposal, executeShopperOrder, approveCartProposal } from '../lib/agents/shopper';
import { generateResolverCaseFile } from '../lib/agents/resolver';
import { verifyReceiptChain } from '../lib/receipts/bundle';
import dotenv from 'dotenv';

dotenv.config();

async function runLiveDryRun() {
  console.log('================================================================');
  console.log('=== RECOURSE LIVE DRY RUN (P0/P1/P2 LIVE VERIFICATION) ===');
  console.log('================================================================\n');

  const db = getDb();

  // 1. FRESH RESET
  console.log('1. RESETTING DATABASE TO CLEAN STATE...');
  db.exec(`
    DELETE FROM webhook_events;
    DELETE FROM agent_events;
    DELETE FROM disputes;
    DELETE FROM fulfillments;
    DELETE FROM receipts;
    DELETE FROM orders;
    DELETE FROM carts;
    DELETE FROM products;
    DELETE FROM merchants;
    DELETE FROM mandates;
    DELETE FROM users;
    DELETE FROM demo_clock;
  `);

  const insertMerchant = db.prepare(`
    INSERT INTO merchants (id, name, profile, default_ship_days)
    VALUES (?, ?, ?, ?)
  `);
  for (const m of SEED_MERCHANTS) {
    insertMerchant.run(m.id, m.name, m.profile, m.defaultShipDays);
  }

  const insertProduct = db.prepare(`
    INSERT INTO products (id, merchant_id, title, description, category, price, currency, attributes_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const p of SEED_PRODUCTS) {
    insertProduct.run(
      p.id,
      p.merchantId,
      p.title,
      p.description,
      p.category,
      p.price,
      p.currency,
      JSON.stringify(p.attributes)
    );
  }

  const userVaultToken = process.env.PAYPAL_VAULT_TOKEN || '57h784950k031805d';
  db.prepare(`
    INSERT INTO users (id, name, paypal_customer_id, vault_token_id, vault_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('user-1', 'Alex Mercer', 'qyKatysRMd', userVaultToken, 'ACTIVE', new Date().toISOString());

  const startTime = new Date();
  setVirtualTime(startTime);
  console.log(`✓ Database reset. Virtual Demo Clock initialized at: ${startTime.toISOString()}`);
  console.log(`✓ Active Vault Token: ${userVaultToken}`);

  // 2. LIVE MANDATE PARSE VIA GROQ
  console.log('\n2. PARSING & SIGNING MANDATE A VIA LIVE GROQ LLM...');
  const mandateNl =
    'Up to $150 on outdoor and camping gear from Larkspur Outdoors and Ridgeback Gear Co. Max $60 per purchase. Ask me before anything over $50. Expires in 7 days.';
  console.log(`Mandate Text: "${mandateNl}"`);

  const { constraints, isFallback, model, latencyMs, usage } = await parseMandateNaturalLanguage(mandateNl, startTime) as any;
  if (isFallback) {
    console.log('[Notice: Mandate parsed via fallback template]');
  } else {
    console.log(`✓ Parsed via Live Groq LLM: ${model || 'openai/gpt-oss-120b'} (${latencyMs || 0}ms)`);
  }
  console.log('Constraints:', JSON.stringify(constraints, null, 2));

  const { signedJws, hash: mandateHash } = await signMandate(constraints);
  const mandateId = `mandate-live-${Date.now()}`;
  db.prepare(`
    INSERT INTO mandates (id, user_id, nl_text, constraints_json, status, signed_jws, hash, created_at, expires_at, spent_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    mandateId,
    'user-1',
    mandateNl,
    JSON.stringify(constraints),
    'active',
    signedJws,
    mandateHash,
    startTime.toISOString(),
    constraints.expiresAt,
    0.0
  );
  console.log(`✓ Mandate Hash (SHA-256): ${mandateHash}`);
  console.log(`✓ Signed JWS (ES256): ${signedJws.slice(0, 36)}...`);

  // 3. SCENARIO 1: TENT ($45.00) - LIVE CHECKOUT
  console.log('\n3. EXECUTING LIVE ORDER: Larkspur Trail Tent ($45.00)...');
  const p1 = createCartProposal(mandateId, ['tent-1'], 'Selected 2-person waterproof tent within outdoor category.');
  const res1 = await executeShopperOrder(p1.cartId, { replayMode: false });
  console.log(`Guard Decision: ${res1.guardResult.decision}`);
  console.log(`Checkout Status: ${res1.success ? 'SUCCESS (LIVE SANDBOX CAPTURE)' : 'FAILED'}`);
  console.log(`PayPal Order ID: ${res1.paypalOrderId}`);
  console.log(`PayPal Capture ID: ${res1.captureId}`);
  console.log(`Receipt Hash: ${res1.receiptHash}`);

  // 4. SCENARIO 2: JACKET ($38.00) - LIVE CHECKOUT
  console.log('\n4. EXECUTING LIVE ORDER: Ridgeback StormShield Jacket ($38.00)...');
  const p2 = createCartProposal(mandateId, ['jacket-1'], 'Purchased Ridgeback StormShield all-weather jacket.');
  const res2 = await executeShopperOrder(p2.cartId, { replayMode: false });
  console.log(`Guard Decision: ${res2.guardResult.decision}`);
  console.log(`Checkout Status: ${res2.success ? 'SUCCESS (LIVE SANDBOX CAPTURE)' : 'FAILED'}`);
  console.log(`PayPal Order ID: ${res2.paypalOrderId}`);
  console.log(`PayPal Capture ID: ${res2.captureId}`);
  console.log(`Receipt Hash: ${res2.receiptHash}`);

  // 5. SCENARIO 3: EXPEDITION PACK ($55.00) - HUMAN APPROVAL -> LIVE CHECKOUT
  console.log('\n5. EXECUTING HUMAN APPROVAL FLOW: Ridgeback Expedition Pack ($55.00)...');
  const p3 = createCartProposal(mandateId, ['pack-1'], 'Expedition Pack 55L ($55.00 > $50 threshold).');
  const res3Pre = await executeShopperOrder(p3.cartId, { replayMode: false });
  console.log(`Guard Pre-check Decision: ${res3Pre.guardResult.decision} (requireApproval=${res3Pre.requireApproval})`);
  if (!res3Pre.requireApproval) {
    throw new Error('Expected Guard to flag REQUIRE_APPROVAL for $55.00 cart!');
  }

  console.log('Recording Human Approval in audit trail...');
  approveCartProposal(p3.cartId, 'Confirmed by user: Expedition Pack approved for upcoming trek.');

  const res3Post = await executeShopperOrder(p3.cartId, { replayMode: false });
  console.log(`Guard Post-approval Checkout: ${res3Post.success ? 'SUCCESS (LIVE SANDBOX CAPTURE)' : 'FAILED'}`);
  console.log(`PayPal Order ID: ${res3Post.paypalOrderId}`);
  console.log(`PayPal Capture ID: ${res3Post.captureId}`);
  console.log(`Receipt Hash: ${res3Post.receiptHash}`);

  // 6. SCENARIO 4: HEADPHONES ($129.00) - DETERMINISTIC BLOCK
  console.log('\n6. EXECUTING BLOCKED ORDER: AudioPro Wireless Headphones ($129.00)...');
  const p4 = createCartProposal(mandateId, ['headphones-1'], 'Shopper attempted to purchase wireless headphones.');
  const res4 = await executeShopperOrder(p4.cartId, { replayMode: false });
  console.log(`Guard Decision: ${res4.guardResult.decision}`);
  console.log(`Violations Caught:`, res4.guardResult.reasons);
  console.log(`Explanation: ${res4.guardResult.explanation}`);
  console.log(`Checkout Status: ${res4.success ? 'UNEXPECTED_SUCCESS' : 'BLOCKED AS EXPECTED (Zero PayPal API Calls Move Money)'}`);

  // 7. VERIFY RECEIPT HASH CHAIN
  console.log('\n7. AUDITING CRYPTOGRAPHIC RECEIPT HASH CHAIN...');
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
    throw new Error(`Receipt chain validation failed: ${chainResult.error}`);
  }

  // 8. ACCELERATE DEMO CLOCK (+3.5 DAYS)
  console.log('\n8. ACCELERATING DEMO CLOCK BY 3.5 DAYS & SIMULATING FULFILLMENT...');
  const advancedDate = advanceVirtualTime(3.5);
  console.log(`Current Virtual Time: ${advancedDate.toISOString()}`);

  const fulfillments = db.prepare(`
    SELECT f.*, o.amount, o.paypal_capture_id, c.items_json
    FROM fulfillments f
    JOIN orders o ON f.order_id = o.id
    JOIN carts c ON o.cart_id = c.id
  `).all() as any[];

  console.log('Fulfillment Inspections:');
  for (const f of fulfillments) {
    const items = JSON.parse(f.items_json);
    const report = f.delivery_report_json ? JSON.parse(f.delivery_report_json) : null;
    console.log(`- Capture: ${f.paypal_capture_id} | ${items[0]?.title} | Status: ${f.status} | Condition: ${report?.condition}`);
    console.log(`  Notes: "${report?.inspectorNotes}"`);
  }

  // 9. RESOLVER AGENT INSPECTS JACKET ORDER
  console.log('\n9. RESOLVER AGENT PREPARING CASE FILE FOR DEFECTIVE JACKET...');
  const jacketOrder = db.prepare(`
    SELECT o.* FROM orders o
    JOIN carts c ON o.cart_id = c.id
    WHERE c.items_json LIKE '%jacket%'
  `).get() as any;

  const resolution = await generateResolverCaseFile(jacketOrder.id);
  if (resolution.status !== 'GROUNDS_FOUND') {
    throw new Error('Expected Resolver to find grounds for defective jacket!');
  }

  const caseFile = resolution.caseFile;
  console.log(`\n================================================================`);
  console.log(`=== LIVE DRY RUN REACHED FILING CHECKPOINT ===`);
  console.log(`================================================================`);
  console.log(`\n[NEEDS USER RESOLUTION CENTER FILING]:`);
  console.log(`Item: ${caseFile.itemTitle}`);
  console.log(`Amount: $${caseFile.disputedAmount.toFixed(2)} USD`);
  console.log(`PayPal Capture ID: ${caseFile.paypalCaptureId}`);
  console.log(`PayPal Order ID: ${caseFile.paypalOrderId}`);
  console.log(`Dispute Reason: MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED`);
  console.log(`Receipt Hash: ${caseFile.evidenceReferences.receiptHash}`);
  console.log(`\nCopy-Paste Description for Sandbox Resolution Center:`);
  console.log(`"${caseFile.copyPasteFilingText}"`);
  console.log(`================================================================\n`);

  return {
    mandateId,
    tentCaptureId: res1.captureId,
    jacketCaptureId: res2.captureId,
    packCaptureId: res3Post.captureId,
    caseFile,
  };
}

runLiveDryRun().catch((err) => {
  console.error('\n❌ LIVE DRY RUN FAILED:', err);
  process.exit(1);
});
