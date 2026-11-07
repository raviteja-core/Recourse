import { describe, it, expect } from 'vitest';
import { createReceiptBundle, verifyReceiptChain, GENESIS_HASH } from '../lib/receipts/bundle';

describe('Receipt Bundle & Tamper-Evident Hash Chain', () => {
  const dummyGuard = {
    decision: 'ALLOW' as const,
    reasons: [],
    explanation: 'Approved',
  };

  const dummyCart = {
    merchantId: 'larkspur',
    items: [
      {
        sku: 'tent-1',
        title: 'Trail Tent',
        price: 45.0,
        category: 'outdoor',
        attributesAtPurchase: { waterproof: true },
      },
    ],
    total: 45.0,
  };

  it('creates and verifies a clean 3-receipt chain', () => {
    const r1 = createReceiptBundle({
      mandateHash: 'hash-1',
      mandateJws: 'jws-1',
      cart: dummyCart,
      guard: dummyGuard,
      agentRationale: 'Tent needed for camping trip',
      paypal: { orderId: 'ord-1', captureId: 'cap-1' },
      prevHash: GENESIS_HASH,
    });

    const r2 = createReceiptBundle({
      mandateHash: 'hash-1',
      mandateJws: 'jws-1',
      cart: dummyCart,
      guard: dummyGuard,
      agentRationale: 'Jacket purchase',
      paypal: { orderId: 'ord-2', captureId: 'cap-2' },
      prevHash: r1.hash,
    });

    const r3 = createReceiptBundle({
      mandateHash: 'hash-1',
      mandateJws: 'jws-1',
      cart: dummyCart,
      guard: dummyGuard,
      agentRationale: 'Pack purchase',
      paypal: { orderId: 'ord-3', captureId: 'cap-3' },
      prevHash: r2.hash,
    });

    const result = verifyReceiptChain([r1, r2, r3]);
    expect(result.valid).toBe(true);
  });

  it('detects tampering with cart attributes inside a receipt', () => {
    const r1 = createReceiptBundle({
      mandateHash: 'hash-1',
      mandateJws: 'jws-1',
      cart: dummyCart,
      guard: dummyGuard,
      agentRationale: 'Original purchase',
      paypal: { orderId: 'ord-1', captureId: 'cap-1' },
      prevHash: GENESIS_HASH,
    });

    // Tamper with attributesAtPurchase (e.g. attempting to cover up waterproof: false)
    r1.bundle.cart.items[0].attributesAtPurchase.waterproof = false;

    const result = verifyReceiptChain([r1]);
    expect(result.valid).toBe(false);
    expect(result.brokenAtIndex).toBe(0);
    expect(result.error).toContain('Tampered bundle');
  });

  it('detects broken linkage in chain order', () => {
    const r1 = createReceiptBundle({
      mandateHash: 'hash-1',
      mandateJws: 'jws-1',
      cart: dummyCart,
      guard: dummyGuard,
      agentRationale: 'First',
      paypal: { orderId: 'ord-1', captureId: 'cap-1' },
      prevHash: GENESIS_HASH,
    });

    const r2 = createReceiptBundle({
      mandateHash: 'hash-1',
      mandateJws: 'jws-1',
      cart: dummyCart,
      guard: dummyGuard,
      agentRationale: 'Second',
      paypal: { orderId: 'ord-2', captureId: 'cap-2' },
      prevHash: 'fake_broken_hash_value',
    });

    const result = verifyReceiptChain([r1, r2]);
    expect(result.valid).toBe(false);
    expect(result.brokenAtIndex).toBe(1);
    expect(result.error).toContain('Broken link');
  });
});
