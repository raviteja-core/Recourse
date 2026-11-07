import { MandateConstraints, verifyMandateSignature } from '../mandate';

export type ReasonCode =
  | 'SIGNATURE_INVALID'
  | 'MANDATE_EXPIRED'
  | 'MANDATE_REVOKED'
  | 'OVER_TOTAL_CAP'
  | 'OVER_PER_PURCHASE_CAP'
  | 'MAX_PURCHASES'
  | 'CATEGORY_NOT_ALLOWED'
  | 'MERCHANT_NOT_ALLOWED'
  | 'PRICE_DRIFT'
  | 'CART_MISMATCH'
  | 'ABOVE_APPROVAL_THRESHOLD';

export interface MandateEntity {
  id: string;
  userId: string;
  nlText: string;
  constraints: MandateConstraints;
  status: 'active' | 'revoked' | 'expired';
  signedJws: string;
  hash: string;
  spentTotal: number;
  purchasesCount?: number;
}

export interface CartItem {
  sku: string;
  title: string;
  price: number;
  quotedPrice?: number;
  category: string;
  attributesAtPurchase?: Record<string, any>;
}

export interface CartEntity {
  id: string;
  mandateId: string;
  merchantId: string;
  items: CartItem[];
  total: number;
  expectedItemCount?: number;
}

export interface GuardEvaluationState {
  currentVirtualTime: Date;
  allowPriceDriftPercent?: number; // default 5%
}

export interface GuardResult {
  decision: 'ALLOW' | 'REQUIRE_APPROVAL' | 'BLOCK';
  reasons: ReasonCode[];
  explanation: string;
}

export async function evaluateGuard(
  mandate: MandateEntity,
  cart: CartEntity,
  state: GuardEvaluationState
): Promise<GuardResult> {
  const reasons: ReasonCode[] = [];

  // 1. Verify JWS cryptographic signature first
  const sigResult = await verifyMandateSignature(mandate.signedJws);
  if (!sigResult.valid) {
    reasons.push('SIGNATURE_INVALID');
  }

  // 2. Status checks
  if (mandate.status === 'revoked') {
    reasons.push('MANDATE_REVOKED');
  }

  // Expiration check against virtual demo clock or current time
  const expiresAt = new Date(mandate.constraints.expiresAt);
  if (state.currentVirtualTime.getTime() > expiresAt.getTime()) {
    reasons.push('MANDATE_EXPIRED');
  }

  // 3. Merchant check
  if (mandate.constraints.merchantsAllow && mandate.constraints.merchantsAllow.length > 0) {
    const normCartMerchant = cart.merchantId.toLowerCase().replace(/[^a-z0-9]/g, '');
    const isAllowed = mandate.constraints.merchantsAllow.some((m) => {
      const normAllowed = m.toLowerCase().replace(/[^a-z0-9]/g, '');
      return normCartMerchant === normAllowed || normCartMerchant.includes(normAllowed) || normAllowed.includes(normCartMerchant);
    });
    if (!isAllowed) {
      reasons.push('MERCHANT_NOT_ALLOWED');
    }
  }

  // 4. Category checks (all items must match allowed categories, none in denied)
  for (const item of cart.items) {
    if (
      mandate.constraints.categoriesAllow &&
      !mandate.constraints.categoriesAllow.some((cat) =>
        item.category.toLowerCase().includes(cat.toLowerCase())
      )
    ) {
      if (!reasons.includes('CATEGORY_NOT_ALLOWED')) {
        reasons.push('CATEGORY_NOT_ALLOWED');
      }
    }

    if (
      mandate.constraints.categoriesDeny &&
      mandate.constraints.categoriesDeny.some((cat) =>
        item.category.toLowerCase().includes(cat.toLowerCase())
      )
    ) {
      if (!reasons.includes('CATEGORY_NOT_ALLOWED')) {
        reasons.push('CATEGORY_NOT_ALLOWED');
      }
    }

    // 5. Price drift check (> 5% drift from quoted price)
    if (item.quotedPrice !== undefined && item.quotedPrice > 0) {
      const drift = Math.abs(item.price - item.quotedPrice) / item.quotedPrice;
      const maxDrift = state.allowPriceDriftPercent ? state.allowPriceDriftPercent / 100 : 0.05;
      if (drift > maxDrift) {
        if (!reasons.includes('PRICE_DRIFT')) {
          reasons.push('PRICE_DRIFT');
        }
      }
    }
  }

  // 6. Cart mismatch (e.g. proposed count vs checkout count)
  if (cart.expectedItemCount !== undefined && cart.items.length !== cart.expectedItemCount) {
    reasons.push('CART_MISMATCH');
  }

  // 7. Per-purchase cap check
  if (
    mandate.constraints.perPurchaseCap !== undefined &&
    cart.total > mandate.constraints.perPurchaseCap
  ) {
    reasons.push('OVER_PER_PURCHASE_CAP');
  }

  // 8. Total cap check
  const projectedTotal = mandate.spentTotal + cart.total;
  if (projectedTotal > mandate.constraints.totalCap) {
    reasons.push('OVER_TOTAL_CAP');
  }

  // 9. Max purchases count check
  if (
    mandate.constraints.maxPurchases !== undefined &&
    (mandate.purchasesCount || 0) >= mandate.constraints.maxPurchases
  ) {
    reasons.push('MAX_PURCHASES');
  }

  // 10. Approval threshold check (soft gate)
  if (
    mandate.constraints.approvalThreshold !== undefined &&
    cart.total > mandate.constraints.approvalThreshold
  ) {
    reasons.push('ABOVE_APPROVAL_THRESHOLD');
  }

  // Decision determination:
  // Any hard reason results in BLOCK
  const hardViolations = reasons.filter((r) => r !== 'ABOVE_APPROVAL_THRESHOLD');

  if (hardViolations.length > 0) {
    return {
      decision: 'BLOCK',
      reasons,
      explanation: `Purchase blocked by Mandate Guard: ${hardViolations.join(', ')}.`,
    };
  }

  // Threshold only requires human approval
  if (reasons.includes('ABOVE_APPROVAL_THRESHOLD')) {
    return {
      decision: 'REQUIRE_APPROVAL',
      reasons,
      explanation: `Cart total ($${cart.total.toFixed(2)}) exceeds approval threshold ($${mandate.constraints.approvalThreshold?.toFixed(2)}). Human confirmation required.`,
    };
  }

  return {
    decision: 'ALLOW',
    reasons: [],
    explanation: `Purchase within all mandate constraints. Approved for unattended checkout.`,
  };
}
