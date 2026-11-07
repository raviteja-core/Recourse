import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

import { getDb, initSchema } from '../lib/db';
import { SEED_MERCHANTS, SEED_PRODUCTS } from '../lib/merchants/catalog';
import { setVirtualTime } from '../lib/merchants/fulfillment';

async function main() {
  console.log('Seeding Recourse Database...');
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
  console.log(`- Seeded ${SEED_MERCHANTS.length} merchants (Larkspur, Ridgeback, Cobalt, ElectroWorld)`);

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
  console.log(`- Seeded ${SEED_PRODUCTS.length} catalog products`);

  // Read vaulted token from session or use verified spike token
  let vaultTokenId = '57h784950k031805d';
  let customerId = 'qyKatysRMd';
  const sessionPath = path.resolve(process.cwd(), '.spike-1-session.json');
  if (fs.existsSync(sessionPath)) {
    try {
      const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      if (session.paymentTokenId) vaultTokenId = session.paymentTokenId;
      if (session.customerId) customerId = session.customerId;
    } catch {}
  }

  // Seed default user
  db.prepare(`
    INSERT INTO users (id, name, paypal_customer_id, vault_token_id, vault_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    'user-1',
    'Alex Mercer',
    customerId,
    vaultTokenId,
    'ACTIVE',
    new Date().toISOString()
  );
  console.log(`- Seeded primary user with active PayPal vault token (${vaultTokenId})`);

  // Reset demo clock
  const now = new Date();
  setVirtualTime(now);
  console.log(`- Reset virtual demo clock to: ${now.toISOString()}`);

  console.log('Database seed completed successfully!');
}

main().catch((err) => {
  console.error('Seed error:', err.message);
  process.exit(1);
});
