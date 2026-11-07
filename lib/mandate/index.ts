import { z } from 'zod';
import { CompactSign, compactVerify, importJWK, exportJWK } from 'jose';
import * as crypto from 'crypto';
import { createGroq } from '@ai-sdk/groq';
import { generateObject } from 'ai';

export const MandateConstraintsSchema = z.object({
  currency: z.literal('USD'),
  totalCap: z.number().positive(),
  perPurchaseCap: z.number().positive().optional(),
  approvalThreshold: z.number().positive().optional(),
  maxPurchases: z.number().int().positive().optional(),
  categoriesAllow: z.array(z.string()).min(1),
  categoriesDeny: z.array(z.string()).optional(),
  merchantsAllow: z.array(z.string()).optional(),
  expiresAt: z.string(),
  requireTracking: z.boolean().optional(),
});

export type MandateConstraints = z.infer<typeof MandateConstraintsSchema>;

export function canonicalJSON(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJSON).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(obj[k])}`);
  return '{' + pairs.join(',') + '}';
}

export function computeSha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function computeMandateHash(constraints: MandateConstraints): string {
  const canonical = canonicalJSON(constraints);
  return computeSha256(canonical);
}

let cachedPrivateKey: any = null;
let cachedPublicKey: any = null;

export async function getSigningKeys() {
  if (cachedPrivateKey && cachedPublicKey) {
    return { privateKey: cachedPrivateKey, publicKey: cachedPublicKey };
  }

  const keyEnv = process.env.MANDATE_SIGNING_PRIVATE_KEY;
  if (!keyEnv) {
    throw new Error('MANDATE_SIGNING_PRIVATE_KEY is not configured in .env');
  }

  let jwk: any;
  try {
    jwk = JSON.parse(keyEnv);
  } catch {
    throw new Error('MANDATE_SIGNING_PRIVATE_KEY is not valid JSON JWK');
  }

  cachedPrivateKey = await importJWK(jwk, 'ES256');

  // Derive public JWK
  const { d, ...publicJwk } = jwk;
  cachedPublicKey = await importJWK(publicJwk, 'ES256');

  return { privateKey: cachedPrivateKey, publicKey: cachedPublicKey };
}

export async function signMandate(constraints: MandateConstraints): Promise<{ signedJws: string; hash: string }> {
  const validated = MandateConstraintsSchema.parse(constraints);
  const canonical = canonicalJSON(validated);
  const hash = computeSha256(canonical);

  const { privateKey } = await getSigningKeys();
  const signedJws = await new CompactSign(new TextEncoder().encode(canonical))
    .setProtectedHeader({ alg: 'ES256' })
    .sign(privateKey);

  return { signedJws, hash };
}

export async function verifyMandateSignature(signedJws: string): Promise<{ valid: boolean; constraints?: MandateConstraints; error?: string }> {
  try {
    const { publicKey } = await getSigningKeys();
    const { payload } = await compactVerify(signedJws, publicKey);
    const decoded = new TextDecoder().decode(payload);
    const json = JSON.parse(decoded);
    const constraints = MandateConstraintsSchema.parse(json);
    return { valid: true, constraints };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

export async function getPublicJwks() {
  const keyEnv = process.env.MANDATE_SIGNING_PRIVATE_KEY;
  if (!keyEnv) return { keys: [] };
  const jwk = JSON.parse(keyEnv);
  const { d, ...publicJwk } = jwk;
  return {
    keys: [{ ...publicJwk, use: 'sig', alg: 'ES256' }],
  };
}

export async function parseMandateNaturalLanguage(
  nlText: string,
  now: Date = new Date()
): Promise<{ constraints: MandateConstraints; isFallback: boolean }> {
  const groqApiKey = process.env.GROQ_API_KEY || process.env.LLM_API_KEY;
  const modelName = process.env.LLM_MODEL || 'openai/gpt-oss-120b';

  // Live LLM Path
  if (groqApiKey && !process.env.FORCE_FALLBACK) {
    try {
      const prompt = `You are an AI spending mandate parser for Recourse.
Convert the user's natural language spending mandate into strict JSON constraints.
Current time: ${now.toISOString()}.
Resolve any ambiguity to the strict reading.

User mandate text:
"${nlText}"

Output schema rules:
- currency: must be "USD"
- totalCap: total dollar budget
- perPurchaseCap: maximum allowed per single purchase (if mentioned)
- approvalThreshold: amount above which human approval is required before purchase
- categoriesAllow: array of allowed categories (e.g. ["outdoor", "camping"])
- merchantsAllow: array of allowed merchant identifiers (standardize to catalog IDs: "larkspur", "ridgeback", "cobalt")
- expiresAt: ISO date string when the mandate expires
- requireTracking: boolean
`;

      const groqProvider = createGroq({ apiKey: groqApiKey });
      const result = await generateObject({
        model: groqProvider(modelName),
        schema: MandateConstraintsSchema,
        prompt,
      });

      return { constraints: result.object, isFallback: false };
    } catch (err: any) {
      console.warn('Groq LLM parse failed, falling back to deterministic template:', err.message);
    }
  }

  // Deterministic Fallback Mode (Honest Labeling per user instruction 3)
  const expiresAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();

  // Mandate A template
  if (nlText.toLowerCase().includes('larkspur') || nlText.toLowerCase().includes('ridgeback') || nlText.includes('150')) {
    return {
      constraints: {
        currency: 'USD',
        totalCap: 150.0,
        perPurchaseCap: 60.0,
        approvalThreshold: 50.0,
        categoriesAllow: ['outdoor', 'camping'],
        merchantsAllow: ['larkspur', 'ridgeback'],
        expiresAt,
        requireTracking: true,
      },
      isFallback: true,
    };
  }

  // Mandate B template (Cobalt)
  if (nlText.toLowerCase().includes('cobalt') || nlText.includes('60')) {
    return {
      constraints: {
        currency: 'USD',
        totalCap: 60.0,
        perPurchaseCap: 60.0,
        approvalThreshold: 50.0,
        categoriesAllow: ['camping', 'outdoor'],
        merchantsAllow: ['cobalt'],
        expiresAt,
        requireTracking: true,
      },
      isFallback: true,
    };
  }

  // Generic outdoor fallback
  return {
    constraints: {
      currency: 'USD',
      totalCap: 100.0,
      perPurchaseCap: 50.0,
      approvalThreshold: 40.0,
      categoriesAllow: ['outdoor'],
      merchantsAllow: ['larkspur'],
      expiresAt,
      requireTracking: true,
    },
    isFallback: true,
  };
}
