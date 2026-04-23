import { Hono } from 'hono';
import { Env } from '../types';
import { generateCardCode } from '../utils/auth';

export const cardRoutes = new Hono<{ Bindings: Env }>();

cardRoutes.post('/login', async (c) => {
  const { code } = await c.req.json<{ code: string }>();

  if (!code || code.trim().length === 0) {
    return c.json({ success: false, message: '请输入卡密' }, 400);
  }

  const card = await c.env.DB.prepare('SELECT * FROM cards WHERE code = ? AND status = ?')
    .bind(code.trim().toUpperCase(), 'unused')
    .first();

  if (!card) {
    return c.json({ success: false, message: '卡密无效或已使用' }, 401);
  }

  return c.json({
    success: true,
    message: '登录成功',
    data: { cardCode: card.code },
  });
});

cardRoutes.get('/check/:code', async (c) => {
  const code = c.req.param('code').toUpperCase();

  const card = await c.env.DB.prepare('SELECT code, status FROM cards WHERE code = ?')
    .bind(code)
    .first();

  if (!card) {
    return c.json({ success: false, message: '卡密不存在' }, 404);
  }

  const submission = await c.env.DB.prepare('SELECT id FROM submissions WHERE card_code = ?')
    .bind(code)
    .first();

  return c.json({
    success: true,
    data: {
      cardCode: card.code,
      status: card.status,
      hasSubmitted: !!submission,
    },
  });
});
