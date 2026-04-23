import { Hono } from 'hono';
import { Env } from '../types';

export const settingsRoutes = new Hono<{ Bindings: Env }>();

settingsRoutes.get('/contact', async (c) => {
  const keys = ['qq_number', 'wechat_group_image'];
  const result: Record<string, string | null> = {};

  for (const key of keys) {
    const row = await c.env.DB.prepare('SELECT value FROM settings WHERE key = ?')
      .bind(key)
      .first();
    result[key] = (row?.value as string) || null;
  }

  return c.json({
    success: true,
    data: {
      qqNumber: result['qq_number'],
      wechatGroupImage: result['wechat_group_image'],
    },
  });
});

settingsRoutes.get('/custom-display', async (c) => {
  const items = await c.env.DB.prepare(
    'SELECT id, title, content, type, sort_order FROM custom_display ORDER BY sort_order ASC, id ASC'
  ).all();

  return c.json({
    success: true,
    data: items.results,
  });
});
