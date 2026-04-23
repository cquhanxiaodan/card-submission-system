import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './types';
import { cardRoutes } from './routes/cards';
import { submissionRoutes } from './routes/submissions';
import { adminRoutes } from './routes/admin';
import { settingsRoutes } from './routes/settings';

const INIT_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'unused',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    used_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_code TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (card_code) REFERENCES cards(code)
  )`,
  `CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cards_code ON cards(code)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status)`,
  `CREATE INDEX IF NOT EXISTS idx_submissions_card_code ON submissions(card_code)`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS custom_display (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'text' CHECK(type IN ('text', 'link')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
];

let dbInitialized = false;

async function ensureDbInit(db: D1Database) {
  if (dbInitialized) return;
  for (const sql of INIT_STATEMENTS) {
    try {
      await db.prepare(sql).run();
    } catch (e: any) {
      console.log('Init SQL error:', e?.message || e);
    }
  }
  dbInitialized = true;
}

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

app.use('*', async (c, next) => {
  await ensureDbInit(c.env.DB);
  await next();
});

app.route('/api/cards', cardRoutes);
app.route('/api/submissions', submissionRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/settings', settingsRoutes);

app.get('/api/health', async (c) => {
  const result = await c.env.DB.prepare('SELECT COUNT(*) as count FROM admins').first();
  return c.json({ status: 'ok', adminCount: result?.count });
});

app.all('/*', async (c) => {
  const url = new URL(c.req.url);
  const path = url.pathname;

  if (path.startsWith('/api/')) {
    return c.notFound();
  }

  const env = c.env as any;
  const assetFetch = env.ASSETS;
  if (assetFetch && typeof assetFetch.fetch === 'function') {
    return assetFetch.fetch(c.req.raw);
  }

  return c.notFound();
});

export default app;
