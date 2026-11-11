import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

const resolvedPath = path.join(process.cwd(), 'data', 'recourse.db');

// Ensure directory exists
const dir = path.dirname(resolvedPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  dbInstance = new Database(resolvedPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  initSchema(dbInstance);
  return dbInstance;
}

export function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      paypal_customer_id TEXT,
      vault_token_id TEXT,
      vault_status TEXT DEFAULT 'INACTIVE',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mandates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      nl_text TEXT NOT NULL,
      constraints_json TEXT NOT NULL,
      status TEXT NOT NULL, -- 'active' | 'revoked' | 'expired'
      signed_jws TEXT NOT NULL,
      hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      spent_total REAL DEFAULT 0.0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS merchants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      profile TEXT NOT NULL, -- 'reliable' | 'sloppy' | 'unreliable'
      default_ship_days INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      attributes_json TEXT,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS carts (
      id TEXT PRIMARY KEY,
      mandate_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      items_json TEXT NOT NULL,
      total REAL NOT NULL,
      status TEXT NOT NULL, -- 'PROPOSED' | 'APPROVED' | 'BLOCKED' | 'ORDERED'
      guard_decision_json TEXT,
      human_approval_status TEXT, -- 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED'
      created_at TEXT NOT NULL,
      FOREIGN KEY (mandate_id) REFERENCES mandates(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      cart_id TEXT NOT NULL,
      paypal_order_id TEXT,
      paypal_capture_id TEXT,
      status TEXT NOT NULL, -- 'COMPLETED' | 'REFUNDED' | 'DISPUTED'
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      created_at TEXT NOT NULL,
      FOREIGN KEY (cart_id) REFERENCES carts(id)
    );

    CREATE TABLE IF NOT EXISTS fulfillments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      carrier TEXT,
      tracking_number TEXT,
      status TEXT NOT NULL, -- 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'STALLED'
      events_json TEXT NOT NULL,
      delivery_report_json TEXT,
      shipped_at TEXT,
      delivered_at TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      mandate_hash TEXT NOT NULL,
      bundle_json TEXT NOT NULL,
      prev_hash TEXT NOT NULL,
      hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS disputes (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      paypal_dispute_id TEXT,
      reason TEXT NOT NULL,
      status TEXT NOT NULL, -- 'OPEN' | 'RESOLVED' | 'UNDER_REVIEW'
      opened_by TEXT NOT NULL, -- 'RESOLVER' | 'BUYER_MANUAL'
      evidence_json TEXT,
      offer_json TEXT,
      outcome TEXT, -- 'BUYER_FAVOR' | 'SELLER_FAVOR' | 'REFUNDED'
      refunded_amount REAL DEFAULT 0.0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS agent_events (
      id TEXT PRIMARY KEY,
      actor TEXT NOT NULL, -- 'shopper' | 'guard' | 'resolver' | 'defender' | 'system'
      type TEXT NOT NULL,
      payload_json TEXT,
      reasoning_text TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      paypal_event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      verified INTEGER NOT NULL,
      processed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS demo_clock (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      virtual_time TEXT NOT NULL
    );
  `);
}

