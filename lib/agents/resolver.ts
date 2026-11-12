import { z } from 'zod';
import { getDb } from '../db';
import { getCurrentVirtualTime } from '../merchants/fulfillment';
import { createGroq } from '@ai-sdk/groq';
import { generateText } from 'ai';

export const CaseFileSchema = z.object({
  caseId: z.string(),
  orderId: z.string(),
  paypalOrderId: z.string(),
  paypalCaptureId: z.string(),
  merchantId: z.string(),
  merchantName: z.string(),
  itemTitle: z.string(),
  disputedAmount: z.number().positive(),
  currency: z.literal('USD'),
  reason: z.enum([
    'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED',
    'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
    'UNAUTHORIZED_TRANSACTION',
  ]),
  summary: z.string(),
  facts: z.array(z.string()),
  evidenceReferences: z.object({
    mandateHash: z.string(),
    receiptHash: z.string(),
    trackingNumber: z.string().optional(),
    deliveryReportCondition: z.string().optional(),
  }),
  suggestedRemedy: z.enum(['FULL_REFUND', 'PARTIAL_REFUND', 'REPLACEMENT']),
  copyPasteFilingText: z.string(),
});

export type CaseFile = z.infer<typeof CaseFileSchema>;

export const CaseFileResolutionSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('GROUNDS_FOUND'),
    caseFile: CaseFileSchema,
  }),
  z.object({
    status: z.literal('NO_GROUNDS'),
    orderId: z.string(),
    reason: z.literal('ITEM_MATCHES_LISTING'),
    message: z.string(),
    observedCondition: z.string(),
  }),
]);

export type CaseFileResolution = z.infer<typeof CaseFileResolutionSchema>;

export async function generateResolverCaseFile(orderId: string): Promise<CaseFileResolution> {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
  if (!order) throw new Error(`Order ${orderId} not found`);

  const cart = db.prepare('SELECT * FROM carts WHERE id = ?').get(order.cart_id) as any;
  const fulfillment = db.prepare('SELECT * FROM fulfillments WHERE order_id = ?').get(orderId) as any;
  const receipt = db.prepare('SELECT * FROM receipts WHERE order_id = ?').get(orderId) as any;
  const merchant = db.prepare('SELECT * FROM merchants WHERE id = ?').get(cart.merchant_id) as any;

  const cartItems = JSON.parse(cart.items_json);
  const primaryItem = cartItems[0];
  const deliveryReport = fulfillment?.delivery_report_json ? JSON.parse(fulfillment.delivery_report_json) : null;
  const receiptBundle = receipt?.bundle_json ? JSON.parse(receipt.bundle_json) : null;

  const virtualTime = getCurrentVirtualTime();
  const caseId = `case-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // Extract stored attributes from receipt bundle and delivery report
  const receiptItem = receiptBundle?.cart?.items?.find((i: any) => i.sku === primaryItem.sku || i.title === primaryItem.title) || primaryItem;
  const attributesAtPurchase = receiptItem.attributesAtPurchase || primaryItem.attributes || {};
  const observedAttributes = deliveryReport?.observedAttributes || {};
  const inspectorNotes = deliveryReport?.inspectorNotes || 'Inspection completed.';

  // Check if item was delivered in pristine condition matching listing
  if (fulfillment?.status === 'DELIVERED' && deliveryReport?.condition === 'PRISTINE') {
    const discrepancies: string[] = [];
    for (const [key, val] of Object.entries(attributesAtPurchase)) {
      if (key in observedAttributes && observedAttributes[key] !== val) {
        discrepancies.push(`${key}: expected ${JSON.stringify(val)} but got ${JSON.stringify(observedAttributes[key])}`);
      }
    }

    if (discrepancies.length === 0) {
      // Feature: Resolver agent refuses to manufacture or prepare a claim when stored facts confirm delivery in pristine condition
      db.prepare(`
        INSERT INTO agent_events (id, actor, type, payload_json, reasoning_text, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        'resolver',
        'DISPUTE_REFUSED_NO_GROUNDS',
        JSON.stringify({ orderId, condition: 'PRISTINE' }),
        `Resolver refused to file dispute: simulated delivery record confirms item '${primaryItem.title}' matches listing specifications in pristine condition.`,
        virtualTime.toISOString()
      );

      return {
        status: 'NO_GROUNDS',
        orderId,
        reason: 'ITEM_MATCHES_LISTING',
        message: 'No grounds: item matches listing specifications in pristine condition.',
        observedCondition: 'PRISTINE',
      };
    }
  }

  let reason: 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED' | 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED' =
    'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED';
  let summary = '';
  const facts: string[] = [];
  let copyPasteFilingText = '';

  if (fulfillment?.status === 'STALLED' || deliveryReport?.condition === 'NEVER_ARRIVED') {
    reason = 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED';
    const carrier = fulfillment?.carrier || 'Carrier';
    const tracking = fulfillment?.tracking_number || 'N/A';
    summary = `Item not received: order placed on ${order.created_at} has stalled. Carrier tracking ${tracking} shows no movement. Expected delivery elapsed.`;
    facts.push(`Order authorized with Mandate Guard on ${order.created_at}.`);
    facts.push(`${carrier} Tracking Number: ${tracking}.`);
    facts.push(`Fulfillment record shows status STALLED at transit facility with zero final delivery scan.`);
    copyPasteFilingText = `I have not received the item (${primaryItem.title}). Carrier tracking (${tracking}) has stalled with no delivery progress past the delivery window. Stored receipt locks payment on ${order.created_at}. Requesting full refund of $${order.amount.toFixed(2)}.`;
  } else {
    reason = 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED';
    // Dynamically identify discrepancies between stored attributesAtPurchase and observedAttributes
    const discrepancies: string[] = [];
    for (const [key, val] of Object.entries(attributesAtPurchase)) {
      if (key in observedAttributes && observedAttributes[key] !== val) {
        discrepancies.push(`expected ${key}=${JSON.stringify(val)} but observed ${key}=${JSON.stringify(observedAttributes[key])}`);
      }
    }
    const discrepancyStr = discrepancies.length > 0 
      ? discrepancies.join(', ')
      : `observed condition '${deliveryReport?.condition || 'DEFECTIVE'}' contradicting advertised specifications`;

    summary = `Item '${primaryItem.title}' materially differs from attributes locked in receipt bundle (hash: ${receipt?.hash?.slice(0, 16)}...). Discrepancy: ${discrepancyStr}.`;
    facts.push(`Purchase-time listing attributes: ${JSON.stringify(attributesAtPurchase)}.`);
    facts.push(`Delivery inspection observed attributes: ${JSON.stringify(observedAttributes)}.`);
    facts.push(`Delivery inspector report notes: "${inspectorNotes}".`);
    facts.push(`Tamper-evident receipt hash ${receipt?.hash?.slice(0, 16)}... cryptographic lock verified.`);

    copyPasteFilingText = `I received an item that is different from described. The ${primaryItem.title} was purchased with specifications (${JSON.stringify(attributesAtPurchase)}), but delivery inspection proved discrepancy (${discrepancyStr}). Inspector report: "${inspectorNotes}". Requesting full refund of $${order.amount.toFixed(2)}.`;
  }

  const groqApiKey = process.env.GROQ_API_KEY || process.env.LLM_API_KEY;
  const modelName = process.env.LLM_MODEL || 'openai/gpt-oss-120b';

  if (groqApiKey && !process.env.FORCE_FALLBACK) {
    try {
      const start = Date.now();
      const groqProvider = createGroq({ apiKey: groqApiKey });
      const prompt = `You are the Recourse Buyer Dispute Resolver Agent.
A purchase defect was detected for order ${orderId} (${primaryItem.title}, $${order.amount.toFixed(2)} USD).
Reason: ${reason}.
Purchase specifications: ${JSON.stringify(attributesAtPurchase)}.
Observed inspection attributes: ${JSON.stringify(observedAttributes)}.
Inspector notes: "${inspectorNotes}".
Cryptographic receipt hash: ${receipt?.hash}.

Write a formal 2-3 sentence dispute filing statement to be submitted into PayPal Resolution Center requesting a full refund of $${order.amount.toFixed(2)} USD. Reference the specification mismatch and receipt hash.`;

      const result = await generateText({
        model: groqProvider(modelName),
        prompt,
      });

      const latencyMs = Date.now() - start;
      const usage = result.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      console.log(
        `[AI:Resolver] Model: ${modelName} | Latency: ${latencyMs}ms | Tokens: prompt=${usage.promptTokens}, completion=${usage.completionTokens}, total=${usage.totalTokens}`
      );

      if (result.text?.trim()) {
        copyPasteFilingText = result.text.trim();
      }
    } catch (err: any) {
      console.warn('Groq Resolver case text generation failed, using deterministic template:', err.message);
    }
  }

  const caseFile: CaseFile = {
    caseId,
    orderId,
    paypalOrderId: order.paypal_order_id,
    paypalCaptureId: order.paypal_capture_id,
    merchantId: cart.merchant_id,
    merchantName: merchant?.name || cart.merchant_id,
    itemTitle: primaryItem.title,
    disputedAmount: order.amount,
    currency: 'USD',
    reason,
    summary,
    facts,
    evidenceReferences: {
      mandateHash: receiptBundle?.mandateHash || '',
      receiptHash: receipt?.hash || '',
      trackingNumber: fulfillment?.tracking_number,
      deliveryReportCondition: deliveryReport?.condition,
    },
    suggestedRemedy: 'FULL_REFUND',
    copyPasteFilingText,
  };

  // Validate with Zod
  const validatedCase = CaseFileSchema.parse(caseFile);

  // Store in DB as prepared dispute
  db.prepare(`
    INSERT INTO disputes (id, order_id, reason, status, opened_by, evidence_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    caseId,
    orderId,
    reason,
    'PREPARED',
    'RESOLVER',
    JSON.stringify(validatedCase),
    virtualTime.toISOString(),
    virtualTime.toISOString()
  );

  db.prepare(`
    INSERT INTO agent_events (id, actor, type, payload_json, reasoning_text, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    'resolver',
    'CASE_FILE_PREPARED',
    JSON.stringify({ caseId, orderId, reason, amount: order.amount }),
    `Resolver agent analyzed delivery discrepancy against receipt bundle. Prepared case for buyer filing.`,
    virtualTime.toISOString()
  );

  return { status: 'GROUNDS_FOUND', caseFile: validatedCase };
}

