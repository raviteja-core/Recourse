import { describe, it, expect, beforeAll } from 'vitest';
import * as dotenv from 'dotenv';
dotenv.config();

import { signMandate, MandateConstraints } from '../lib/mandate';
import { evaluateGuard, MandateEntity, CartEntity } from '../lib/guard/guard';

describe('Mandate Guard Pure Evaluation Engine', () => {
  const baseConstraints: MandateConstraints = {
    currency: 'USD',
    totalCap: 150.0,
    perPurchaseCap: 60.0,
    approvalThreshold: 50.0,
    maxPurchases: 5,
    categoriesAllow: ['outdoor', 'camping'],
    categoriesDeny: ['electronics'],
    merchantsAllow: ['larkspur', 'ridgeback'],
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    requireTracking: true,
  };

  let validJws: string;
  let validHash: string;

  beforeAll(async () => {
    const res = await signMandate(baseConstraints);
    validJws = res.signedJws;
    validHash = res.hash;
  });

  function createMandate(overrides: Partial<MandateEntity> = {}): MandateEntity {
    return {
      id: 'mandate-test',
      userId: 'user-1',
      nlText: 'Test mandate',
      constraints: { ...baseConstraints, ...(overrides.constraints || {}) },
      status: 'active',
      signedJws: validJws,
      hash: validHash,
      spentTotal: 0.0,
      purchasesCount: 0,
      ...overrides,
    };
  }

  function createCart(overrides: Partial<CartEntity> = {}): CartEntity {
    return {
      id: 'cart-test',
      mandateId: 'mandate-test',
      merchantId: 'larkspur',
      items: [
        {
          sku: 'tent-1',
          title: 'Trail Tent',
          price: 45.0,
          category: 'outdoor',
        },
      ],
      total: 45.0,
      ...overrides,
    };
  }

  it('ALLOWs in-bounds purchase under threshold', async () => {
    const mandate = createMandate();
    const cart = createCart({ total: 45.0 });
    const result = await evaluateGuard(mandate, cart, { currentVirtualTime: new Date() });

    expect(result.decision).toBe('ALLOW');
    expect(result.reasons).toEqual([]);
  });

  it('returns REQUIRE_APPROVAL when above threshold but under cap', async () => {
    const mandate = createMandate();
    const cart = createCart({
      items: [{ sku: 'pack-1', title: 'Pack 55L', price: 55.0, category: 'outdoor' }],
      total: 55.0,
    });
    const result = await evaluateGuard(mandate, cart, { currentVirtualTime: new Date() });

    expect(result.decision).toBe('REQUIRE_APPROVAL');
    expect(result.reasons).toContain('ABOVE_APPROVAL_THRESHOLD');
  });

  it('BLOCKs on SIGNATURE_INVALID', async () => {
    const mandate = createMandate({ signedJws: 'invalid.jws.signature' });
    const cart = createCart();
    const result = await evaluateGuard(mandate, cart, { currentVirtualTime: new Date() });

    expect(result.decision).toBe('BLOCK');
    expect(result.reasons).toContain('SIGNATURE_INVALID');
  });

  it('BLOCKs on MANDATE_REVOKED', async () => {
    const mandate = createMandate({ status: 'revoked' });
    const cart = createCart();
    const result = await evaluateGuard(mandate, cart, { currentVirtualTime: new Date() });

    expect(result.decision).toBe('BLOCK');
    expect(result.reasons).toContain('MANDATE_REVOKED');
  });

  it('BLOCKs on MANDATE_EXPIRED', async () => {
    const mandate = createMandate();
    const futureDate = new Date(Date.now() + 10 * 24 * 3600 * 1000); // 10 days in future (expires in 7)
    const cart = createCart();
    const result = await evaluateGuard(mandate, cart, { currentVirtualTime: futureDate });

    expect(result.decision).toBe('BLOCK');
    expect(result.reasons).toContain('MANDATE_EXPIRED');
  });

  it('BLOCKs on OVER_PER_PURCHASE_CAP', async () => {
    const mandate = createMandate();
    const cart = createCart({
      items: [{ sku: 'deluxe-tent', title: 'Deluxe Tent', price: 75.0, category: 'outdoor' }],
      total: 75.0, // Cap is 60.0
    });
    const result = await evaluateGuard(mandate, cart, { currentVirtualTime: new Date() });

    expect(result.decision).toBe('BLOCK');
    expect(result.reasons).toContain('OVER_PER_PURCHASE_CAP');
  });

  it('BLOCKs on OVER_TOTAL_CAP', async () => {
    const mandate = createMandate({ spentTotal: 120.0 });
    const cart = createCart({ total: 40.0 }); // 120 + 40 = 160 > 150 totalCap
    const result = await evaluateGuard(mandate, cart, { currentVirtualTime: new Date() });

    expect(result.decision).toBe('BLOCK');
    expect(result.reasons).toContain('OVER_TOTAL_CAP');
  });

  it('BLOCKs on MAX_PURCHASES', async () => {
    const mandate = createMandate({ purchasesCount: 5 }); // maxPurchases is 5
    const cart = createCart();
    const result = await evaluateGuard(mandate, cart, { currentVirtualTime: new Date() });

    expect(result.decision).toBe('BLOCK');
    expect(result.reasons).toContain('MAX_PURCHASES');
  });

  it('BLOCKs on CATEGORY_NOT_ALLOWED', async () => {
    const mandate = createMandate();
    const cart = createCart({
      items: [{ sku: 'headphones', title: 'Headphones', price: 40.0, category: 'electronics' }],
      total: 40.0,
    });
    const result = await evaluateGuard(mandate, cart, { currentVirtualTime: new Date() });

    expect(result.decision).toBe('BLOCK');
    expect(result.reasons).toContain('CATEGORY_NOT_ALLOWED');
  });

  it('BLOCKs on MERCHANT_NOT_ALLOWED', async () => {
    const mandate = createMandate();
    const cart = createCart({ merchantId: 'unauthorized-merchant' });
    const result = await evaluateGuard(mandate, cart, { currentVirtualTime: new Date() });

    expect(result.decision).toBe('BLOCK');
    expect(result.reasons).toContain('MERCHANT_NOT_ALLOWED');
  });

  it('BLOCKs on PRICE_DRIFT (> 5%)', async () => {
    const mandate = createMandate();
    const cart = createCart({
      items: [
        {
          sku: 'tent-1',
          title: 'Trail Tent',
          price: 52.0, // Quoted was 45.0 -> drift is 15.5% > 5%
          quotedPrice: 45.0,
          category: 'outdoor',
        },
      ],
      total: 52.0,
    });
    const result = await evaluateGuard(mandate, cart, { currentVirtualTime: new Date() });

    expect(result.decision).toBe('BLOCK');
    expect(result.reasons).toContain('PRICE_DRIFT');
  });

  it('BLOCKs on CART_MISMATCH', async () => {
    const mandate = createMandate();
    const cart = createCart({
      items: [
        { sku: 'tent-1', title: 'Trail Tent', price: 45.0, category: 'outdoor' },
        { sku: 'extra-item', title: 'Sneaky Item', price: 5.0, category: 'outdoor' },
      ],
      expectedItemCount: 1, // Agent proposed 1 item, checkout has 2
      total: 50.0,
    });
    const result = await evaluateGuard(mandate, cart, { currentVirtualTime: new Date() });

    expect(result.decision).toBe('BLOCK');
    expect(result.reasons).toContain('CART_MISMATCH');
  });
});

