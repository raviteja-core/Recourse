import * as crypto from 'crypto';
import { canonicalJSON, computeSha256 } from '../mandate';
import { GuardResult } from '../guard/guard';

export interface CartSnapshot {
  merchantId: string;
  items: {
    sku: string;
    title: string;
    price: number;
    category: string;
    attributesAtPurchase: Record<string, any>;
  }[];
  total: number;
}

export interface HumanApprovalRecord {
  required: boolean;
  approved: boolean;
  decidedAt?: string;
  decidedBy?: string; // 'user' | 'auto_test'
  notes?: string;
}

export interface PayPalTransactionInfo {
  orderId: string;
  captureId: string;
  vaultTokenId?: string;
  customId?: string;
}

export interface ReceiptBundlePayload {
  receiptId: string;
  mandateHash: string;
  mandateJws: string;
  cart: CartSnapshot;
  guard: GuardResult;
  humanApproval?: HumanApprovalRecord;
  agentRationale: string;
  paypal: PayPalTransactionInfo;
  createdAt: string;
}

export interface ReceiptRecord {
  bundle: ReceiptBundlePayload;
  prevHash: string;
  hash: string;
}

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export function computeReceiptHash(prevHash: string, bundle: ReceiptBundlePayload): string {
  const canonicalBundle = canonicalJSON(bundle);
  return computeSha256(prevHash + canonicalBundle);
}

export function createReceiptBundle(
  params: Omit<ReceiptBundlePayload, 'receiptId' | 'createdAt'> & {
    receiptId?: string;
    createdAt?: string;
    prevHash?: string;
  }
): ReceiptRecord {
  const receiptId = params.receiptId || `rcpt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const createdAt = params.createdAt || new Date().toISOString();
  const prevHash = params.prevHash || GENESIS_HASH;

  const bundle: ReceiptBundlePayload = {
    receiptId,
    mandateHash: params.mandateHash,
    mandateJws: params.mandateJws,
    cart: params.cart,
    guard: params.guard,
    humanApproval: params.humanApproval,
    agentRationale: params.agentRationale,
    paypal: params.paypal,
    createdAt,
  };

  const hash = computeReceiptHash(prevHash, bundle);

  return {
    bundle,
    prevHash,
    hash,
  };
}

export function verifyReceiptChain(receipts: ReceiptRecord[]): { valid: boolean; brokenAtIndex?: number; error?: string } {
  let expectedPrevHash = GENESIS_HASH;

  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i];

    if (r.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        brokenAtIndex: i,
        error: `Broken link at index ${i}: prevHash '${r.prevHash}' does not match expected '${expectedPrevHash}'`,
      };
    }

    const recomputedHash = computeReceiptHash(r.prevHash, r.bundle);
    if (r.hash !== recomputedHash) {
      return {
        valid: false,
        brokenAtIndex: i,
        error: `Tampered bundle at index ${i}: stored hash '${r.hash}' does not match computed '${recomputedHash}'`,
      };
    }

    expectedPrevHash = r.hash;
  }

  return { valid: true };
}

