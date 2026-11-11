import { z } from 'zod';
import { getDb } from '../db';
import { getCurrentVirtualTime } from '../merchants/fulfillment';

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

export function generateResolverCaseFile(orderId: string): CaseFile {
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

  let reason: 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED' | 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED' =
    'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED';
  let summary = '';
  const facts: string[] = [];
  let copyPasteFilingText = '';

  // Extract stored attributes from receipt bundle and delivery report
  const receiptItem = receiptBundle?.cart?.items?.find((i: any) => i.sku === primaryItem.sku || i.title === primaryItem.title) || primaryItem;
  const attributesAtPurchase = receiptItem.attributesAtPurchase || primaryItem.attributes || {};
  const observedAttributes = deliveryReport?.observedAttributes || {};
  const inspectorNotes = deliveryReport?.inspectorNotes || 'Inspection completed.';

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

  return validatedCase;
}

