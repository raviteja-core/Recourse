import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { SEED_MERCHANTS, SEED_PRODUCTS } from '@/lib/merchants/catalog';
import { setVirtualTime } from '@/lib/merchants/fulfillment';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const db = getDb();

    // Clear existing data
    db.exec(`
      DELETE FROM webhook_events;
      DELETE FROM agent_events;
      DELETE FROM disputes;
      DELETE FROM fulfillments;
      DELETE FROM receipts;
      DELETE FROM orders;
      DELETE FROM carts;
      DELETE FROM products;
      DELETE FROM merchants;
      DELETE FROM mandates;
      DELETE FROM users;
      DELETE FROM demo_clock;
    `);

    // Seed Merchants
    const insertMerchant = db.prepare(`
      INSERT INTO merchants (id, name, profile, default_ship_days)
      VALUES (?, ?, ?, ?)
    `);
    for (const m of SEED_MERCHANTS) {
      insertMerchant.run(m.id, m.name, m.profile, m.defaultShipDays);
    }

    // Seed Products
    const insertProduct = db.prepare(`
      INSERT INTO products (id, merchant_id, title, description, category, price, currency, attributes_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of SEED_PRODUCTS) {
      insertProduct.run(
        p.id,
        p.merchantId,
        p.title,
        p.description,
        p.category,
        p.price,
        p.currency,
        JSON.stringify(p.attributes)
      );
    }

    // Seed default user with vault token
    db.prepare(`
      INSERT INTO users (id, name, paypal_customer_id, vault_token_id, vault_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('user-1', 'Alex Mercer', 'qyKatysRMd', '57h784950k031805d', 'ACTIVE', new Date().toISOString());

    // Reset demo clock
    const now = new Date();
    setVirtualTime(now);

    return NextResponse.json({
      success: true,
      message: 'Database reset and seeded with initial demo state.',
      virtualTime: now.toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
