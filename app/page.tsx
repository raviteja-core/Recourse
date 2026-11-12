import { getDb } from '@/lib/db';
import { calculateKpisFromDb, EXCLUDED_SPIKE_ORDER_IDS, EXCLUDED_SPIKE_DISPUTE_IDS } from '@/lib/analytics/kpis';
import { DemoConsoleClient } from '@/components/demo-console/DemoConsoleClient';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const db = getDb();

  // Load database state
  const mandate = db.prepare('SELECT * FROM mandates ORDER BY rowid DESC LIMIT 1').get() as any;

  const rawOrders = db.prepare(`
    SELECT o.*, c.merchant_id, c.items_json, c.guard_decision_json, m.name as merchant_name
    FROM orders o
    JOIN carts c ON o.cart_id = c.id
    LEFT JOIN merchants m ON c.merchant_id = m.id
    ORDER BY o.created_at ASC
  `).all() as any[];

  // Exclude spike orders
  const orders = rawOrders.filter(
    (o) => !EXCLUDED_SPIKE_ORDER_IDS.includes(o.paypal_order_id) && !EXCLUDED_SPIKE_ORDER_IDS.includes(o.id)
  );

  const receipts = db.prepare('SELECT * FROM receipts ORDER BY rowid ASC').all() as any[];

  const rawDisputes = db.prepare('SELECT * FROM disputes ORDER BY rowid DESC').all() as any[];
  // Exclude spike disputes
  const disputes = rawDisputes.filter(
    (d) => !EXCLUDED_SPIKE_DISPUTE_IDS.includes(d.paypal_dispute_id) && !EXCLUDED_SPIKE_DISPUTE_IDS.includes(d.id)
  );

  const user = db.prepare('SELECT * FROM users LIMIT 1').get() as any;
  const kpis = calculateKpisFromDb();

  const formattedMandate = mandate
    ? {
        id: mandate.id,
        nlText: mandate.nl_text,
        status: mandate.status,
        constraints: JSON.parse(mandate.constraints_json),
        signedJws: mandate.signed_jws,
        hash: mandate.hash,
        spentTotal: kpis.spentTotal,
        totalCap: kpis.totalCap,
      }
    : null;

  return (
    <DemoConsoleClient
      initialMandate={formattedMandate}
      initialOrders={orders}
      initialReceipts={receipts}
      initialDisputes={disputes}
      initialKpis={kpis}
      userVaultToken={user?.vault_token_id || ''}
    />
  );
}
