import { describe, it, expect } from 'vitest';
import { scoreEvidence, calculateEV } from '../lib/agents/defender';
import { CaseFileSchema } from '../lib/agents/resolver';

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

