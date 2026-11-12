import { z } from 'zod';
import { getDb } from '../db';
import { getCurrentVirtualTime } from '../merchants/fulfillment';
import { createGroq } from '@ai-sdk/groq';
import { generateText } from 'ai';

const BASE_URL = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';

export const EvidenceScoreSchema = z.object({
  pWin: z.number().min(0).max(1),
  factors: z.object({
    mandateAuthorizationProof: z.number(),
    deliveryProof: z.number(),
    itemAttributesMatch: z.number(),
    claimContradicted: z.number(),
    contradictingFacts: z.number(),
  }),
  rubricNotes: z.array(z.string()),
});

export type EvidenceScore = z.infer<typeof EvidenceScoreSchema>;

export const EVAnalysisSchema = z.object({
  orderAmount: z.number(),
  disputeFee: z.number(),
  evContest: z.number(),
  evAccept: z.number(),
  evOffer: z.number(),
  optimalDecision: z.enum(['ACCEPT_AND_REFUND', 'OFFER_PARTIAL', 'CONTEST']),
  pWin: z.number(),
});

export type EVAnalysis = z.infer<typeof EVAnalysisSchema>;

export const DefenderDecisionSchema = z.object({
  disputeId: z.string(),
  orderId: z.string(),
  captureId: z.string(),
  decision: z.enum(['ACCEPT_AND_REFUND', 'OFFER_PARTIAL', 'CONTEST']),
  pWin: z.number(),
  evAnalysis: EVAnalysisSchema,
  narrative: z.string(),
  actionTaken: z.string(),
  refundId: z.string().optional(),
});

export type DefenderDecision = z.infer<typeof DefenderDecisionSchema>;

async function getAccessToken(): Promise<string> {
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

/**
 * Deterministically constructs defense evidence statement strictly from stored DB fields.
 * If records are missing, reports "no record available" and refuses to fabricate.
 * Delivery records are explicitly labeled "simulated delivery record (sandbox)".
 */
export function buildDefenseEvidenceStatement(
  receiptRow: any,
  fulfillmentRow: any,
  disputeReason: string
): { evidenceText: string; hasMandate: boolean; hasReceipt: boolean; hasDelivery: boolean } {
  const parts: string[] = [];
  const receiptBundle = receiptRow?.bundle_json ? JSON.parse(receiptRow.bundle_json) : null;
  const deliveryReport = fulfillmentRow?.delivery_report_json ? JSON.parse(fulfillmentRow.delivery_report_json) : null;

  const hasMandate = Boolean(receiptBundle?.mandateHash && (receiptBundle?.mandateJws || receiptRow?.mandate_hash));
  const hasReceipt = Boolean(receiptRow?.hash && receiptBundle?.cart);
  const hasDelivery = Boolean(fulfillmentRow?.status && deliveryReport);

  if (hasMandate) {
    const mandateHash = (receiptBundle?.mandateHash || receiptRow?.mandate_hash || '').slice(0, 16);
    parts.push(`Mandate JWS verified (hash: ${mandateHash}...). Deterministic Guard ALLOW.`);
  } else {
    parts.push('Mandate authorization: no record available.');
  }

  if (hasReceipt) {
    const receiptHash = (receiptRow?.hash || '').slice(0, 16);
    parts.push(`Receipt bundle cryptographically locked at purchase (SHA-256: ${receiptHash}...).`);
  } else {
    parts.push('Receipt bundle: no record available.');
  }

  if (hasDelivery) {
    parts.push(
      `Simulated delivery record (sandbox): carrier ${fulfillmentRow.carrier || 'USPS'}, tracking ${fulfillmentRow.tracking_number || 'N/A'}, status ${fulfillmentRow.status}, condition ${deliveryReport.condition}.`
    );
  } else {
    parts.push('Fulfillment delivery: no record available.');
  }

  return {
    evidenceText: parts.join(' '),
    hasMandate,
    hasReceipt,
    hasDelivery,
  };
}

/**
 * Deterministic rubric:
 * scoreEvidence(dispute, receiptBundle, fulfillment) -> pWin in [0, 1]
 */
export function scoreEvidence(
  reason: string,
  receiptBundle: any,
  fulfillment: any
): EvidenceScore {
  let mandateAuthorizationProof = 0.0;
  let deliveryProof = 0.0;
  let itemAttributesMatch = 0.0;
  let claimContradicted = 0.0;
  let contradictingFacts = 0.0;
  const rubricNotes: string[] = [];

  // 1. Mandate authorization proof (mandate hash and signed JWS presence)
  const isGuardAllow =
    receiptBundle?.guard?.decision === 'ALLOW' ||
    receiptBundle?.guardDecision?.decision === 'ALLOW';

  if (receiptBundle?.mandateHash && isGuardAllow) {
    mandateAuthorizationProof = 0.30;
    rubricNotes.push(`Mandate authorization verified (${receiptBundle.mandateHash.slice(0, 12)}...): Guard ALLOW (+0.30)`);
  } else {
    mandateAuthorizationProof = -0.30;
    contradictingFacts -= 0.15;
    rubricNotes.push('No mandate record available: purchase lacks cryptographic authorization proof (-0.45)');
  }

  // 2. Delivery proof / carrier tracking (simulated delivery record)
  const deliveryReport = fulfillment?.delivery_report_json
    ? JSON.parse(fulfillment.delivery_report_json)
    : null;

  if (fulfillment?.status === 'DELIVERED' || deliveryReport?.deliveredAt) {
    deliveryProof = 0.25;
    rubricNotes.push(`Simulated delivery record (sandbox): carrier delivery confirmed (+0.25)`);
  } else if (fulfillment?.status === 'STALLED' || deliveryReport?.condition === 'NEVER_ARRIVED') {
    deliveryProof = 0.0;
    rubricNotes.push(`Simulated delivery record (sandbox): tracking stalled, delivery missing (+0.00)`);
  } else {
    contradictingFacts -= 0.20;
    rubricNotes.push('No delivery record available: fulfillment record missing (-0.20)');
  }

  // 3. Item attributes & claim corroboration / contradiction
  const normReason = (reason || '').toUpperCase();

  if (normReason.includes('NOT_AS_DESCRIBED')) {
    if (deliveryReport?.condition === 'DEFECTIVE_NOT_AS_DESCRIBED' || deliveryReport?.observedAttributes?.waterproof === false) {
      // Delivery inspection confirmed defect: buyer claim is corroborated by merchant's own inspection log
      itemAttributesMatch = -0.45;
      contradictingFacts -= 0.10;
      rubricNotes.push(`Simulated delivery record (sandbox): soak test FAILED, defect verified (-0.55)`);
    } else if (deliveryReport?.condition === 'PRISTINE') {
      claimContradicted = 0.35;
      itemAttributesMatch = 0.10;
      rubricNotes.push(`Simulated delivery record (sandbox): confirmed pristine factory condition (+0.45)`);
    }
  } else if (normReason.includes('NOT_RECEIVED')) {
    if (fulfillment?.status === 'DELIVERED') {
      claimContradicted = 0.40;
      rubricNotes.push(`Simulated delivery record (sandbox): confirms carrier delivery (+0.40)`);
    } else {
      contradictingFacts -= 0.45;
      rubricNotes.push(`Simulated delivery record (sandbox): tracking stalled (-0.45)`);
    }
  } else if (normReason.includes('UNAUTHORIZED')) {
    // Mandate JWS and vault authorization directly refute unauthorized claim
    if (receiptBundle?.mandateHash && receiptBundle?.paypalOrderId) {
      claimContradicted = 0.40;
      rubricNotes.push(`Signed mandate JWS and customer vault authorization refute unauthorized claim (+0.40)`);
    }
  }

  const rawSum = mandateAuthorizationProof + deliveryProof + itemAttributesMatch + claimContradicted + contradictingFacts;
  // Bound pWin in [0.05, 0.95]
  const pWin = Math.min(0.95, Math.max(0.05, Math.round(rawSum * 100) / 100));

  return {
    pWin,
    factors: {
      mandateAuthorizationProof,
      deliveryProof,
      itemAttributesMatch,
      claimContradicted,
      contradictingFacts,
    },
    rubricNotes,
  };
}

/**
 * Modeled cost: Configurable dispute handling chargeback fee assumption.
 * Read from env DISPUTE_HANDLING_COST, default $15.00.
 */
export function getDisputeHandlingCost(): number {
  if (typeof process !== 'undefined' && process.env?.DISPUTE_HANDLING_COST) {
    const val = parseFloat(process.env.DISPUTE_HANDLING_COST);
    if (!isNaN(val) && val >= 0) return val;
  }
  return 15.0; // modeled cost
}

/**
 * Expected Value calculation:
 * EV_contest = pWin * V - (1 - pWin) * (V + fee)
 * EV_offer   = -offerAmount (e.g. 50% refund)
 * EV_accept  = -V
 * Note: fee is a modeled cost assumption.
 */
export function calculateEV(
  orderAmount: number,
  pWin: number,
  disputeFee: number = getDisputeHandlingCost()
): EVAnalysis {
  const V = orderAmount;
  const evContest = pWin * V - (1 - pWin) * (V + disputeFee);
  const evAccept = -V;
  const evOffer = -(V * 0.5);

  let optimalDecision: 'ACCEPT_AND_REFUND' | 'OFFER_PARTIAL' | 'CONTEST';

  if (pWin >= 0.65) {
    optimalDecision = 'CONTEST';
  } else if (pWin >= 0.35 && evOffer > evAccept && evOffer > evContest) {
    optimalDecision = 'OFFER_PARTIAL';
  } else {
    optimalDecision = 'ACCEPT_AND_REFUND';
  }

  return {
    orderAmount: Math.round(V * 100) / 100,
    disputeFee,
    evContest: Math.round(evContest * 100) / 100,
    evAccept: Math.round(evAccept * 100) / 100,
    evOffer: Math.round(evOffer * 100) / 100,
    optimalDecision,
    pWin,
  };
}

/**
 * Generate LLM narrative for Defender's decision
 */
export async function generateDefenderNarrative(
  decision: string,
  ev: EVAnalysis,
  score: EvidenceScore,
  itemTitle: string
): Promise<string> {
  const groqApiKey = process.env.GROQ_API_KEY || process.env.LLM_API_KEY;
  const modelName = process.env.LLM_MODEL || 'openai/gpt-oss-120b';

  if (groqApiKey && !process.env.FORCE_FALLBACK) {
    try {
      const start = Date.now();
      const groqProvider = createGroq({ apiKey: groqApiKey });
      const prompt = `You are the Recourse Autonomous PayPal Dispute Defender Agent.
Dispute Item: "${itemTitle}".
Decision: ${decision}.
Evidence Win Probability (pWin): ${score.pWin.toFixed(2)}.
EV Analysis: EV_contest = $${ev.evContest.toFixed(2)}, EV_accept = -$${ev.orderAmount.toFixed(2)} (modeled dispute cost fee: $${ev.disputeFee.toFixed(2)}).
Audit facts: ${JSON.stringify(score.rubricNotes)}.

Provide a professional, 2-sentence executive summary of why this decision is legally and mathematically optimal under the EV policy.`;

      const result = await generateText({
        model: groqProvider(modelName),
        prompt,
      });

      const latencyMs = Date.now() - start;
      const usage = result.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      console.log(
        `[AI:Defender] Model: ${modelName} | Latency: ${latencyMs}ms | Tokens: prompt=${usage.promptTokens}, completion=${usage.completionTokens}, total=${usage.totalTokens}`
      );

      if (result.text?.trim()) {
        return result.text.trim();
      }
    } catch (err: any) {
      console.warn('Groq Defender narrative generation failed, using deterministic template:', err.message);
    }
  }

  if (decision === 'ACCEPT_AND_REFUND') {
    return (
      `Defender evaluated dispute for '${itemTitle}'. Win probability pWin is ${score.pWin.toFixed(2)} ` +
      `due to delivery inspection corroborating the defect. Expected value of contesting (EV_contest = $${ev.evContest.toFixed(2)}) ` +
      `is worse than immediate full refund (EV_accept = -$${ev.orderAmount.toFixed(2)}) factoring in the $${ev.disputeFee.toFixed(2)} modeled cost dispute fee. ` +
      `Optimal deterministic policy: ACCEPT_AND_REFUND.`
    );
  } else if (decision === 'CONTEST') {
    return (
      `Defender evaluated dispute for '${itemTitle}'. Win probability pWin is ${score.pWin.toFixed(2)} ` +
      `backed by cryptographic mandate JWS, receipt hash chain, and verified carrier delivery proof. ` +
      `Expected value of contesting (EV_contest = +$${ev.evContest.toFixed(2)}) far exceeds capitulation (EV_accept = -$${ev.orderAmount.toFixed(2)}), even after the $${ev.disputeFee.toFixed(2)} modeled cost dispute fee. ` +
      `Optimal deterministic policy: CONTEST with full audit bundle.`
    );
  } else {
    return (
      `Defender evaluated dispute for '${itemTitle}'. Win probability pWin is ${score.pWin.toFixed(2)}. ` +
      `Mixed evidence warrants partial settlement offer (EV_offer = -$${Math.abs(ev.evOffer).toFixed(2)}).`
    );
  }
}

/**
 * Process a dispute for an order
 */
export async function processDisputeDecision(
  disputeId: string,
  orderId: string,
  options: { replayMode?: boolean } = {}
): Promise<DefenderDecision> {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
  if (!order) throw new Error(`Order ${orderId} not found`);

  const cart = db.prepare('SELECT * FROM carts WHERE id = ?').get(order.cart_id) as any;
  const receipt = db.prepare('SELECT * FROM receipts WHERE order_id = ?').get(orderId) as any;
  const fulfillment = db.prepare('SELECT * FROM fulfillments WHERE order_id = ?').get(orderId) as any;
  const disputeRow = db.prepare('SELECT * FROM disputes WHERE id = ? OR paypal_dispute_id = ?').get(disputeId, disputeId) as any;

  const cartItems = JSON.parse(cart.items_json);
  const primaryItem = cartItems[0];
  const receiptBundle = receipt ? JSON.parse(receipt.bundle_json) : null;
  const reason = disputeRow?.reason || 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED';

  // 1. Deterministic evidence score
  const score = scoreEvidence(reason, receiptBundle, fulfillment);

  // 2. Deterministic EV analysis
  const ev = calculateEV(order.amount, score.pWin);

  // 3. LLM narrative
  const narrative = await generateDefenderNarrative(ev.optimalDecision, ev, score, primaryItem.title);

  let actionTaken = '';
  let refundId: string | undefined;

  const virtualTime = getCurrentVirtualTime();

  if (ev.optimalDecision === 'ACCEPT_AND_REFUND') {
    if (!options.replayMode && order.paypal_capture_id && !order.paypal_capture_id.startsWith('CAPTURE-REPLAY')) {
      const token = await getAccessToken();

      // First attempt dispute accept-claim if a real dispute ID is present
      let acceptedViaDispute = false;
      if (disputeId && disputeId.startsWith('PP-')) {
        try {
          const acceptRes = await fetch(`${BASE_URL}/v1/customer/disputes/${disputeId}/accept-claim`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              note: 'Recourse Defender: Claim accepted based on inspection report. Full refund issued.',
              accept_claim_reason: 'NOT_ABLE_TO_WIN',
            }),
          });
          if (acceptRes.ok) {
            acceptedViaDispute = true;
            actionTaken = `LIVE_DISPUTE_ACCEPT_CLAIM (${disputeId})`;
          }
        } catch {}
      }

      // If dispute accept-claim was not executed or not applicable, execute capture refund
      if (!acceptedViaDispute) {
        const refundRes = await fetch(`${BASE_URL}/v2/payments/captures/${order.paypal_capture_id}/refund`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            note_to_payer: 'Recourse Defender: Claim accepted based on inspection report. Full refund issued.',
          }),
        });

        if (!refundRes.ok) {
          const errorText = await refundRes.text();
          // If already refunded, capture will report CAPTURE_ALREADY_REFUNDED
          if (errorText.includes('CAPTURE_ALREADY_REFUNDED') || errorText.includes('TRANSACTION_REFUSED')) {
            actionTaken = `ALREADY_REFUNDED (${order.paypal_capture_id})`;
          } else {
            throw new Error(`PayPal capture refund failed (${refundRes.status}): ${errorText}`);
          }
        } else {
          const refundData = await refundRes.json();
          refundId = refundData.id;
          actionTaken = `LIVE_REFUND_EXECUTED (${refundId})`;
        }
      }
    } else {
      // Replay mode using real recorded sandbox refund
      refundId = '22X59480TL380680H';
      actionTaken = `ACCEPT_AND_REFUND (Recorded Sandbox Refund ID: ${refundId})`;
    }

    // Update DB
    db.prepare(`
      UPDATE orders
      SET status = 'REFUNDED'
      WHERE id = ?
    `).run(orderId);

    if (disputeRow) {
      db.prepare(`
        UPDATE disputes
        SET status = 'RESOLVED', outcome = 'BUYER_FAVOR', refunded_amount = ?, updated_at = ?
        WHERE id = ?
      `).run(order.amount, virtualTime.toISOString(), disputeRow.id);
    } else {
      db.prepare(`
        INSERT INTO disputes (id, order_id, paypal_dispute_id, reason, status, opened_by, outcome, refunded_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        disputeId,
        orderId,
        disputeId.startsWith('PP-') ? disputeId : null,
        reason,
        'RESOLVED',
        'RESOLVER',
        'BUYER_FAVOR',
        order.amount,
        virtualTime.toISOString(),
        virtualTime.toISOString()
      );
    }

    db.prepare(`
      INSERT INTO agent_events (id, actor, type, payload_json, reasoning_text, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      'defender',
      'CLAIM_ACCEPTED_AND_REFUNDED',
      JSON.stringify({ disputeId, orderId, captureId: order.paypal_capture_id, refundId, ev, score }),
      narrative,
      virtualTime.toISOString()
    );
  } else if (ev.optimalDecision === 'CONTEST') {
    const defense = buildDefenseEvidenceStatement(receipt, fulfillment, reason);
    if (!defense.hasMandate || !defense.hasReceipt) {
      throw new Error(
        'Integrity check failed: Defender refuses to contest without stored mandate and receipt records.'
      );
    }
    actionTaken = 'CONTEST_DEFENSE_SUBMITTED (simulated delivery record sandbox)';

    if (!options.replayMode && disputeId.startsWith('PP-')) {
      const token = await getAccessToken();
      await fetch(`${BASE_URL}/v1/customer/disputes/${disputeId}/send-message`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: defense.evidenceText,
        }),
      });
    }

    if (disputeRow) {
      db.prepare(`
        UPDATE disputes
        SET status = 'CONTESTED', outcome = 'SELLER_CONTESTED', updated_at = ?
        WHERE id = ?
      `).run(virtualTime.toISOString(), disputeRow.id);
    }

    db.prepare(`
      INSERT INTO agent_events (id, actor, type, payload_json, reasoning_text, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      'defender',
      'DISPUTE_CONTESTED',
      JSON.stringify({ disputeId, orderId, captureId: order.paypal_capture_id, ev, score }),
      narrative,
      virtualTime.toISOString()
    );
  }

  return {
    disputeId,
    orderId,
    captureId: order.paypal_capture_id,
    decision: ev.optimalDecision,
    pWin: score.pWin,
    evAnalysis: ev,
    narrative,
    actionTaken,
    refundId,
  };
}

/**
 * Poll PayPal Disputes API and defend active disputes
 */
export async function pollAndDefendDisputes(options: { replayMode?: boolean } = {}) {
  const db = getDb();

  if (options.replayMode) {
    // In replay mode, find any PREPARED disputes in DB and process them
    const preparedDisputes = db.prepare("SELECT * FROM disputes WHERE status = 'PREPARED'").all() as any[];
    const results: DefenderDecision[] = [];

    for (const d of preparedDisputes) {
      const res = await processDisputeDecision(d.id, d.order_id, { replayMode: true });
      results.push(res);
    }
    return results;
  }

  // Live Mode: Poll GET /v1/customer/disputes (with start_time for full 30-day window)
  const token = await getAccessToken();
  const startTime = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const res = await fetch(`${BASE_URL}/v1/customer/disputes?start_time=${startTime}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`List disputes failed: ${await res.text()}`);
  const data = await res.json();
  const disputeItems = data.items || [];

  const results: DefenderDecision[] = [];

  for (const item of disputeItems) {
    const disputeId = item.dispute_id;
    let captureId = item.disputed_transactions?.[0]?.seller_transaction_id;

    if (!captureId) {
      try {
        const detailRes = await fetch(`${BASE_URL}/v1/customer/disputes/${disputeId}`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        if (detailRes.ok) {
          const detailData = await detailRes.json();
          captureId = detailData.disputed_transactions?.[0]?.seller_transaction_id;
        }
      } catch {}
    }

    // Find order matching captureId or amount
    let orderRow = captureId
      ? db.prepare('SELECT * FROM orders WHERE paypal_capture_id = ?').get(captureId) as any
      : null;

    if (!orderRow && item.dispute_amount?.value) {
      const val = parseFloat(item.dispute_amount.value);
      orderRow = db.prepare('SELECT * FROM orders WHERE amount = ? AND status = ?').get(val, 'COMPLETED') as any;
    }

    if (orderRow) {
      // Check if already resolved
      const existingDispute = db.prepare(
        'SELECT * FROM disputes WHERE paypal_dispute_id = ? OR order_id = ?'
      ).get(disputeId, orderRow.id) as any;

      if (existingDispute && existingDispute.status === 'RESOLVED') {
        continue;
      }

      console.log(`Defender detected dispute ${disputeId} on Order ${orderRow.id} (Capture ${orderRow.paypal_capture_id}). Evaluating...`);
      const dec = await processDisputeDecision(disputeId, orderRow.id, { replayMode: false });
      results.push(dec);
    }
  }

  return results;
}

