import { getDb } from '../db';
import { SEED_PRODUCTS, Product } from '../merchants/catalog';
import { checkoutGuardedCart, CheckoutResult } from '../paypal/orders';
import { getCurrentVirtualTime } from '../merchants/fulfillment';
import { createGroq } from '@ai-sdk/groq';
import { generateText, tool } from 'ai';
import { z } from 'zod';

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

export interface ShopperAgentResult {
  cartId: string;
  checkoutResult?: CheckoutResult;
  toolCallsExecuted: string[];
  latencyMs?: number;
  tokens?: any;
  model?: string;
  isFallback: boolean;
}

export async function runAiShopperAgent(
  userGoal: string,
  mandateId: string,
  options: { replayMode?: boolean; vaultTokenId?: string } = {}
): Promise<ShopperAgentResult> {
  const db = getDb();
  const virtualTime = getCurrentVirtualTime();
  const groqApiKey = process.env.GROQ_API_KEY || process.env.LLM_API_KEY;
  const modelName = process.env.LLM_MODEL || 'openai/gpt-oss-120b';
  const toolCallsExecuted: string[] = [];

  let createdCartId: string | undefined;
  let finalCheckoutResult: CheckoutResult | undefined;

  if (groqApiKey && !process.env.FORCE_FALLBACK && !options.replayMode) {
    try {
      const start = Date.now();
      const groqProvider = createGroq({ apiKey: groqApiKey });

      const tools = {
        search_catalog: tool({
          description: 'Search available merchant catalogs for products matching user request.',
          parameters: z.object({
            query: z.string().describe('Search query keyword (e.g. tent, jacket, backpack, headphones)'),
          }),
          execute: async ({ query }) => {
            toolCallsExecuted.push('search_catalog');
            const q = query.toLowerCase();
            const matches = SEED_PRODUCTS.filter(
              (p) =>
                p.title.toLowerCase().includes(q) ||
                p.category.toLowerCase().includes(q) ||
                p.description.toLowerCase().includes(q)
            );
            db.prepare(`
              INSERT INTO agent_events (id, actor, type, payload_json, reasoning_text, created_at)
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(
              `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              'shopper',
              'TOOL_CALL:search_catalog',
              JSON.stringify({ query, foundCount: matches.length }),
              `Shopper queried catalog for "${query}", matched ${matches.length} products.`,
              virtualTime.toISOString()
            );
            return matches.map((m) => ({
              id: m.id,
              title: m.title,
              merchantId: m.merchantId,
              price: m.price,
              category: m.category,
            }));
          },
        }),
        propose_cart: tool({
          description: 'Propose a shopping cart for a selected product to check against Mandate Guard.',
          parameters: z.object({
            productId: z.string().describe('ID of the product from search_catalog (e.g. tent-1, jacket-1, pack-1, headphones-1)'),
            rationale: z.string().describe('Why this product satisfies the user shopping goal'),
          }),
          execute: async ({ productId, rationale }) => {
            toolCallsExecuted.push('propose_cart');
            const proposal = createCartProposal(mandateId, [productId], rationale);
            createdCartId = proposal.cartId;
            return {
              cartId: proposal.cartId,
              total: proposal.total,
              merchantId: proposal.merchantId,
              item: proposal.items[0]?.title,
            };
          },
        }),
        checkout_via_guard: tool({
          description: 'Execute checkout through the deterministic Mandate Guard.',
          parameters: z.object({
            cartId: z.string().describe('Cart ID returned by propose_cart'),
          }),
          execute: async ({ cartId }) => {
            toolCallsExecuted.push('checkout_via_guard');
            const res = await executeShopperOrder(cartId, options);
            finalCheckoutResult = res;
            return {
              decision: res.guardResult.decision,
              reasons: res.guardResult.reasons,
              explanation: res.guardResult.explanation,
              success: res.success,
              requireApproval: res.requireApproval,
              paypalCaptureId: res.captureId,
            };
          },
        }),
      };

      const result = await generateText({
        model: groqProvider(modelName),
        tools,
        maxSteps: 5,
        prompt: `You are the Recourse Autonomous Shopping Agent.
Your goal: "${userGoal}".
Mandate ID: "${mandateId}".

Workflow instructions:
1. Search the catalog using tool 'search_catalog' to find the relevant product.
2. Formulate a cart proposal using tool 'propose_cart'.
3. Submit the cart to the deterministic Mandate Guard using 'checkout_via_guard'.
Follow this 3-step sequence strictly.`,
      });

      const latencyMs = Date.now() - start;
      const usage = result.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      console.log(
        `[AI:Shopper] Model: ${modelName} | Latency: ${latencyMs}ms | Tokens: prompt=${usage.promptTokens}, completion=${usage.completionTokens}, total=${usage.totalTokens} | ToolCalls: ${toolCallsExecuted.join(' -> ')}`
      );

      if (createdCartId) {
        return {
          cartId: createdCartId,
          checkoutResult: finalCheckoutResult,
          toolCallsExecuted,
          latencyMs,
          tokens: usage,
          model: modelName,
          isFallback: false,
        };
      }
    } catch (err: any) {
      console.warn('Live Groq Shopper Agent failed, falling back to deterministic flow:', err.message);
    }
  }

  // Deterministic Fallback Flow (e.g. for replay or if tool calling fails)
  let targetProductId = 'tent-1';
  if (userGoal.toLowerCase().includes('jacket')) targetProductId = 'jacket-1';
  else if (userGoal.toLowerCase().includes('pack')) targetProductId = 'pack-1';
  else if (userGoal.toLowerCase().includes('headphone')) targetProductId = 'headphones-1';
  else if (userGoal.toLowerCase().includes('stove')) targetProductId = 'stove-1';

  toolCallsExecuted.push('search_catalog', 'propose_cart', 'checkout_via_guard');
  const proposal = createCartProposal(mandateId, [targetProductId], `Shopper agent selected ${targetProductId} for goal: "${userGoal}"`);
  const checkoutResult = await executeShopperOrder(proposal.cartId, options);

  return {
    cartId: proposal.cartId,
    checkoutResult,
    toolCallsExecuted,
    isFallback: true,
  };
}
