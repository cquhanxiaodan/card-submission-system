import { Hono } from 'hono';
import { Env } from '../types';

export const submissionRoutes = new Hono<{ Bindings: Env }>();

submissionRoutes.post('/', async (c) => {
  const { cardCode, content } = await c.req.json<{ cardCode: string; content: string }>();

  if (!cardCode || cardCode.trim().length === 0) {
    return c.json({ success: false, message: '缺少卡密信息' }, 400);
  }

  if (!content || content.trim().length === 0) {
    return c.json({ success: false, message: '请输入提交内容' }, 400);
  }

  const card = await c.env.DB.prepare('SELECT * FROM cards WHERE code = ? AND status = ?')
    .bind(cardCode.trim().toUpperCase(), 'unused')
    .first();

  if (!card) {
    return c.json({ success: false, message: '卡密无效或已使用' }, 401);
  }

  const existingSubmission = await c.env.DB.prepare('SELECT id FROM submissions WHERE card_code = ?')
    .bind(cardCode.trim().toUpperCase())
    .first();

  if (existingSubmission) {
    return c.json({ success: false, message: '您已提交过信息，不可重复提交' }, 409);
  }

  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO submissions (card_code, content) VALUES (?, ?)').bind(
      cardCode.trim().toUpperCase(),
      content.trim()
    ),
    c.env.DB.prepare("UPDATE cards SET status = 'used', used_at = datetime('now') WHERE code = ?").bind(
      cardCode.trim().toUpperCase()
    ),
  ]);

  return c.json({ success: true, message: '提交成功' });
});

submissionRoutes.get('/status/:cardCode', async (c) => {
  const cardCode = c.req.param('cardCode').toUpperCase();

  const submission = await c.env.DB.prepare('SELECT * FROM submissions WHERE card_code = ?')
    .bind(cardCode)
    .first();

  if (!submission) {
    return c.json({ success: false, message: '未找到提交记录' }, 404);
  }

  return c.json({
    success: true,
    data: {
      submitted: true,
      submittedAt: submission.submitted_at,
    },
  });
});
