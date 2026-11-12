import { describe, it, expect } from 'vitest';
import { scoreEvidence, calculateEV, buildDefenseEvidenceStatement } from '../lib/agents/defender';
import { CaseFileSchema } from '../lib/agents/resolver';

describe('Evidence Integrity & Defense Statement Construction', () => {
  it('refuses to cite a mandate or receipt that does not exist for an order', () => {
    // Order with no receipt and no fulfillment record
    const defense = buildDefenseEvidenceStatement(null, null, 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED');
    expect(defense.hasMandate).toBe(false);
    expect(defense.hasReceipt).toBe(false);
    expect(defense.hasDelivery).toBe(false);
    expect(defense.evidenceText).toContain('Mandate authorization: no record available.');
    expect(defense.evidenceText).toContain('Receipt bundle: no record available.');
    expect(defense.evidenceText).toContain('Fulfillment delivery: no record available.');
    expect(defense.evidenceText).not.toContain('Mandate JWS verified');
    expect(defense.evidenceText).not.toContain('cryptographically locked');
  });

  it('correctly cites stored mandate JWS and receipt hash and labels delivery as simulated delivery record (sandbox)', () => {
    const mockReceiptRow = {
      mandate_hash: 'sha256-mandate-1234567890',
      hash: 'sha256-receipt-abcdef1234567890',
      bundle_json: JSON.stringify({
        mandateHash: 'sha256-mandate-1234567890',
        mandateJws: 'eyJhbGciOiJFUzI1NiJ9...',
        cart: { items: [{ sku: 'tent-1', title: 'Tent' }] },
      }),
    };
    const mockFulfillmentRow = {
      carrier: 'USPS',
      tracking_number: '9400111899223344556600',
      status: 'DELIVERED',
      delivery_report_json: JSON.stringify({ condition: 'PRISTINE' }),
    };

    const defense = buildDefenseEvidenceStatement(mockReceiptRow, mockFulfillmentRow, 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED');
    expect(defense.hasMandate).toBe(true);
    expect(defense.hasReceipt).toBe(true);
    expect(defense.hasDelivery).toBe(true);
    expect(defense.evidenceText).toContain('Mandate JWS verified (hash: sha256-mandate-1...).');
    expect(defense.evidenceText).toContain('Receipt bundle cryptographically locked at purchase (SHA-256: sha256-receipt-a...).');
    expect(defense.evidenceText).toContain('Simulated delivery record (sandbox): carrier USPS, tracking 9400111899223344556600, status DELIVERED, condition PRISTINE.');
  });

  it('heavily penalizes score when mandate authorization is missing from receipt', () => {
    const receiptWithoutMandate = {
      guardDecision: { decision: 'ALLOW' },
      // mandateHash missing
    };
    const fulfillment = {
      status: 'DELIVERED',
      delivery_report_json: JSON.stringify({ condition: 'PRISTINE' }),
    };

    const score = scoreEvidence('MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED', receiptWithoutMandate, fulfillment);
    expect(score.factors.mandateAuthorizationProof).toBeLessThan(0);
    expect(score.rubricNotes.some((n) => n.includes('No mandate record available'))).toBe(true);
  });
});

describe('Defender Evidence Scoring Rubric', () => {
  it('assigns low pWin when delivery inspection confirms defect (not as described)', () => {
    const receiptBundle = {
      mandateHash: 'abc123hash',
      guardDecision: { decision: 'ALLOW' },
    };
    const fulfillment = {
      status: 'DELIVERED',
      delivery_report_json: JSON.stringify({
        condition: 'DEFECTIVE_NOT_AS_DESCRIBED',
        observedAttributes: { waterproof: false },
        deliveredAt: '2026-11-08T10:00:00Z',
      }),
    };

    const score = scoreEvidence('MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED', receiptBundle, fulfillment);
    expect(score.pWin).toBeLessThanOrEqual(0.15);
    expect(score.factors.itemAttributesMatch).toBeLessThan(0);
  });

  it('assigns high pWin when delivery inspection confirms pristine condition', () => {
    const receiptBundle = {
      mandateHash: 'abc123hash',
      guardDecision: { decision: 'ALLOW' },
    };
    const fulfillment = {
      status: 'DELIVERED',
      delivery_report_json: JSON.stringify({
        condition: 'PRISTINE',
        observedAttributes: { waterproof: true },
        deliveredAt: '2026-11-08T10:00:00Z',
      }),
    };

    const score = scoreEvidence('MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED', receiptBundle, fulfillment);
    expect(score.pWin).toBeGreaterThanOrEqual(0.70);
    expect(score.factors.claimContradicted).toBeGreaterThan(0);
  });

  it('assigns low pWin when tracking stalled and dispute is not received', () => {
    const receiptBundle = {
      mandateHash: 'abc123hash',
      guardDecision: { decision: 'ALLOW' },
    };
    const fulfillment = {
      status: 'STALLED',
      delivery_report_json: JSON.stringify({
        condition: 'NEVER_ARRIVED',
      }),
    };

    const score = scoreEvidence('MERCHANDISE_OR_SERVICE_NOT_RECEIVED', receiptBundle, fulfillment);
    expect(score.pWin).toBeLessThanOrEqual(0.15);
  });
});

describe('Defender Expected Value (EV) Engine', () => {
  it('selects ACCEPT_AND_REFUND when pWin is low and chargeback fee makes contest worse than refund', () => {
    const amount = 38.0;
    const pWin = 0.10;
    const ev = calculateEV(amount, pWin, 15.0);

    expect(ev.optimalDecision).toBe('ACCEPT_AND_REFUND');
    expect(ev.evContest).toBeLessThan(ev.evAccept); // e.g. -43.9 < -38
  });

  it('selects CONTEST when pWin is high and evidence is backed by mandate JWS and delivery', () => {
    const amount = 45.0;
    const pWin = 0.90;
    const ev = calculateEV(amount, pWin, 15.0);

    expect(ev.optimalDecision).toBe('CONTEST');
    expect(ev.evContest).toBeGreaterThan(0);
    expect(ev.evContest).toBeGreaterThan(ev.evAccept);
  });
});

describe('Resolver Case File Schema Validation', () => {
  it('validates NO_GROUNDS resolution when item matches listing in pristine condition', () => {
    const noGrounds = {
      status: 'NO_GROUNDS' as const,
      orderId: 'ord-pristine-1',
      reason: 'ITEM_MATCHES_LISTING' as const,
      message: 'No grounds: item matches listing specifications in pristine condition.',
      observedCondition: 'PRISTINE',
    };
    expect(noGrounds.status).toBe('NO_GROUNDS');
    expect(noGrounds.reason).toBe('ITEM_MATCHES_LISTING');
  });

  it('strictly validates a compliant case file', () => {
    const mockCase = {
      caseId: 'case-test-1',
      orderId: 'ord-123',
      paypalOrderId: 'ORDER-123',
      paypalCaptureId: 'CAPTURE-123',
      merchantId: 'ridgeback',
      merchantName: 'Ridgeback Gear Co.',
      itemTitle: 'Ridgeback StormShield Jacket',
      disputedAmount: 38.0,
      currency: 'USD',
      reason: 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED',
      summary: 'Item delivered does not have advertised waterproof membrane.',
      facts: ['Advertised waterproof', 'Failed soak test'],
      evidenceReferences: {
        mandateHash: 'abc',
        receiptHash: 'def',
        deliveryReportCondition: 'DEFECTIVE_NOT_AS_DESCRIBED',
      },
      suggestedRemedy: 'FULL_REFUND',
      copyPasteFilingText: 'I received an item different from described...',
    };

    const parsed = CaseFileSchema.parse(mockCase);
    expect(parsed.caseId).toBe('case-test-1');
    expect(parsed.disputedAmount).toBe(38.0);
  });
});

describe('Correction C3: Spike Artifact Exclusion & Guard-Path Accounting', () => {
  it('strictly excludes spike artifacts (5GS32993858853423, 4MW82925T2060654E, PP-R-SQO-10196995)', async () => {
    const { calculateKpisFromDb, EXCLUDED_SPIKE_ORDER_IDS, EXCLUDED_SPIKE_DISPUTE_IDS } = await import(
      '../lib/analytics/kpis'
    );

    expect(EXCLUDED_SPIKE_ORDER_IDS).toContain('5GS32993858853423');
    expect(EXCLUDED_SPIKE_ORDER_IDS).toContain('4MW82925T2060654E');
    expect(EXCLUDED_SPIKE_DISPUTE_IDS).toContain('PP-R-SQO-10196995');

    const kpis = calculateKpisFromDb();
    // In current seeded DB, only the Guard-path jacket refund ($38.00) counts towards recoveredDollars
    expect(kpis.recoveredDollars).toBe(38.0);
    // Defended dollars must not count the spike tent dispute
    expect(kpis.defendedDollars).toBe(0.0);
  });
});

