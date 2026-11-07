import { getDb } from '../db';
import { SEED_PRODUCTS, Product } from '../merchants/catalog';
import { checkoutGuardedCart, CheckoutResult } from '../paypal/orders';
import { getCurrentVirtualTime } from '../merchants/fulfillment';

export interface ShoppingProposal {
  cartId: string;
  merchantId: string;
  items: {
    sku: string;
    title: string;
    price: number;
    category: string;
    attributesAtPurchase: Record<string, any>;
  }[];
  total: number;
  agentRationale: string;
}

export function createCartProposal(
  mandateId: string,
  productIds: string[],
  agentRationale: string
): ShoppingProposal {
  const db = getDb();
  const selectedProducts: Product[] = [];

  for (const id of productIds) {
    const p = SEED_PRODUCTS.find((prod) => prod.id === id);
    if (!p) throw new Error(`Product ${id} not found in catalog`);
    selectedProducts.push(p);
  }

  const merchantId = selectedProducts[0].merchantId;
  const items = selectedProducts.map((p) => ({
    sku: p.id,
    title: p.title,
    price: p.price,
    category: p.category,
    attributesAtPurchase: { ...p.attributes },
  }));

  const total = items.reduce((sum, item) => sum + item.price, 0);
  const cartId = `cart-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const virtualTime = getCurrentVirtualTime();

  db.prepare(`
    INSERT INTO carts (id, mandate_id, merchant_id, items_json, total, status, human_approval_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cartId,
    mandateId,
    merchantId,
    JSON.stringify(items),
    total,
    'PROPOSED',
    'NOT_REQUIRED',
    virtualTime.toISOString()
  );

  db.prepare(`
    INSERT INTO agent_events (id, actor, type, payload_json, reasoning_text, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    'shopper',
    'CART_PROPOSED',
    JSON.stringify({ cartId, merchantId, itemsCount: items.length, total }),
    agentRationale,
    virtualTime.toISOString()
  );

  return {
    cartId,
    merchantId,
    items,
    total,
    agentRationale,
  };
}

export async function executeShopperOrder(
  cartId: string,
  options: { replayMode?: boolean; vaultTokenId?: string } = {}
): Promise<CheckoutResult> {
  const db = getDb();
  const cartRow = db.prepare('SELECT * FROM carts WHERE id = ?').get(cartId) as any;
  if (!cartRow) throw new Error(`Cart ${cartId} not found`);

  return await checkoutGuardedCart(cartId, options);
}

export function approveCartProposal(cartId: string, notes?: string) {
  const db = getDb();
  const virtualTime = getCurrentVirtualTime();
  db.prepare('UPDATE carts SET human_approval_status = ? WHERE id = ?').run('APPROVED', cartId);

  db.prepare(`
    INSERT INTO agent_events (id, actor, type, payload_json, reasoning_text, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    'system',
    'HUMAN_APPROVAL_RECORDED',
    JSON.stringify({ cartId, approved: true }),
    notes || 'User approved purchase in Recourse Control Tower.',
    virtualTime.toISOString()
  );
}

export function rejectCartProposal(cartId: string, reason?: string) {
  const db = getDb();
  const virtualTime = getCurrentVirtualTime();
  db.prepare('UPDATE carts SET status = ?, human_approval_status = ? WHERE id = ?').run(
    'BLOCKED',
    'REJECTED',
    cartId
  );

  db.prepare(`
    INSERT INTO agent_events (id, actor, type, payload_json, reasoning_text, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    'system',
    'HUMAN_APPROVAL_REJECTED',
    JSON.stringify({ cartId, approved: false }),
    reason || 'User rejected purchase in Recourse Control Tower.',
    virtualTime.toISOString()
  );
}
