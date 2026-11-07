import { getDb } from '../db';

export interface FulfillmentEvent {
  status: 'PROCESSING' | 'SHIPPED' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'STALLED';
  timestamp: string;
  location: string;
  description: string;
}

export interface DeliveryReport {
  carrier: string;
  trackingNumber: string;
  deliveredAt?: string;
  condition: 'PRISTINE' | 'DAMAGED' | 'DEFECTIVE_NOT_AS_DESCRIBED' | 'NEVER_ARRIVED';
  observedAttributes: Record<string, any>;
  inspectorNotes: string;
}

export function getCurrentVirtualTime(): Date {
  const db = getDb();
  const row = db.prepare('SELECT virtual_time FROM demo_clock WHERE id = 1').get() as { virtual_time: string } | undefined;
  if (!row) {
    const now = new Date().toISOString();
    db.prepare('INSERT OR REPLACE INTO demo_clock (id, virtual_time) VALUES (1, ?)').run(now);
    return new Date(now);
  }
  return new Date(row.virtual_time);
}

export function setVirtualTime(date: Date) {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO demo_clock (id, virtual_time) VALUES (1, ?)').run(date.toISOString());
}

export function advanceVirtualTime(days: number): Date {
  const current = getCurrentVirtualTime();
  const advanced = new Date(current.getTime() + days * 24 * 3600 * 1000);
  setVirtualTime(advanced);
  updateFulfillmentsOnClockAdvance(advanced);
  return advanced;
}

export function updateFulfillmentsOnClockAdvance(virtualNow: Date) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT f.*, o.amount, c.merchant_id, c.items_json
    FROM fulfillments f
    JOIN orders o ON f.order_id = o.id
    JOIN carts c ON o.cart_id = c.id
    WHERE f.status != 'DELIVERED'
  `).all() as any[];

  for (const f of rows) {
    const merchantId = f.merchant_id;
    const items = JSON.parse(f.items_json);
    const createdAt = new Date(f.shipped_at || f.events_json ? JSON.parse(f.events_json)[0]?.timestamp : virtualNow.toISOString());
    const daysSinceOrder = (virtualNow.getTime() - createdAt.getTime()) / (24 * 3600 * 1000);

    let events: FulfillmentEvent[] = JSON.parse(f.events_json || '[]');
    let newStatus = f.status;
    let deliveryReport: DeliveryReport | null = f.delivery_report_json ? JSON.parse(f.delivery_report_json) : null;

    if (merchantId === 'larkspur') {
      // Larkspur: Reliable, delivers on time
      if (daysSinceOrder >= 2 && f.status !== 'DELIVERED') {
        newStatus = 'DELIVERED';
        events.push({
          status: 'DELIVERED',
          timestamp: virtualNow.toISOString(),
          location: 'San Jose, CA',
          description: 'Package delivered at front door in pristine condition.',
        });
        deliveryReport = {
          carrier: f.carrier || 'USPS',
          trackingNumber: f.tracking_number,
          deliveredAt: virtualNow.toISOString(),
          condition: 'PRISTINE',
          observedAttributes: { waterproof: true, intact: true },
          inspectorNotes: 'Tent received in original factory packaging with verified waterproof coating.',
        };
      }
    } else if (merchantId === 'ridgeback') {
      // Ridgeback: Sloppy, ships non-waterproof jacket
      if (daysSinceOrder >= 3 && f.status !== 'DELIVERED') {
        newStatus = 'DELIVERED';
        events.push({
          status: 'DELIVERED',
          timestamp: virtualNow.toISOString(),
          location: 'San Jose, CA',
          description: 'Package delivered.',
        });
        const isJacket = items.some((i: any) => i.title.toLowerCase().includes('jacket') || i.sku === 'jacket-1');
        deliveryReport = {
          carrier: f.carrier || 'USPS',
          trackingNumber: f.tracking_number,
          deliveredAt: virtualNow.toISOString(),
          condition: isJacket ? 'DEFECTIVE_NOT_AS_DESCRIBED' : 'PRISTINE',
          observedAttributes: isJacket
            ? { waterproof: false, water_permeable: true, fabric_test: 'FAILED (absorbs water)' }
            : { capacity_liters: 55, frame: 'internal' },
          inspectorNotes: isJacket
            ? 'CRITICAL DISCREPANCY: Listing claims waterproof, but tested garment has no seam sealant or water-repellent membrane.'
            : 'Expedition pack delivered in good order.',
        };
      }
    } else if (merchantId === 'cobalt') {
      // Cobalt: Unreliable, stalls and never delivers
      if (daysSinceOrder >= 4 && f.status !== 'STALLED') {
        newStatus = 'STALLED';
        events.push({
          status: 'STALLED',
          timestamp: virtualNow.toISOString(),
          location: 'Denver Distribution Center, CO',
          description: 'Tracking update stalled. Carrier exception: shipment lost in transit.',
        });
        deliveryReport = {
          carrier: f.carrier || 'USPS',
          trackingNumber: f.tracking_number,
          condition: 'NEVER_ARRIVED',
          observedAttributes: {},
          inspectorNotes: 'Delivery window elapsed by > 5 days with zero carrier movement. Presumed lost.',
        };
      }
    }

    db.prepare(`
      UPDATE fulfillments
      SET status = ?, events_json = ?, delivery_report_json = ?, delivered_at = ?
      WHERE id = ?
    `).run(
      newStatus,
      JSON.stringify(events),
      deliveryReport ? JSON.stringify(deliveryReport) : null,
      newStatus === 'DELIVERED' ? virtualNow.toISOString() : null,
      f.id
    );
  }
}
