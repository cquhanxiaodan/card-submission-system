import { Hono } from 'hono';
import { Env } from '../types';
import { hashPassword, verifyPassword, generateCardCode } from '../utils/auth';

export const adminRoutes = new Hono<{ Bindings: Env }>();

const adminAuth = async (c: any, next: any) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return c.json({ success: false, message: '未登录' }, 401);
  }

  try {
    const decoded = atob(token);
    const [username, password] = decoded.split(':');
    if (!username || !password) {
      return c.json({ success: false, message: '认证信息无效' }, 401);
    }

    const admin = await c.env.DB.prepare('SELECT * FROM admins WHERE username = ?')
      .bind(username)
      .first();

    if (!admin) {
      return c.json({ success: false, message: '管理员不存在' }, 401);
    }

    const valid = await verifyPassword(password, admin.password_hash as string);
    if (!valid) {
      return c.json({ success: false, message: '密码错误' }, 401);
    }

    c.set('admin', admin);
    await next();
  } catch {
    return c.json({ success: false, message: '认证失败' }, 401);
  }
};

adminRoutes.post('/login', async (c) => {
  const { username, password } = await c.req.json<{ username: string; password: string }>();

  if (!username || !password) {
    return c.json({ success: false, message: '请输入用户名和密码' }, 400);
  }

  const admin = await c.env.DB.prepare('SELECT * FROM admins WHERE username = ?')
    .bind(username)
    .first();

  if (!admin) {
    return c.json({ success: false, message: '用户名或密码错误' }, 401);
  }

  const valid = await verifyPassword(password, admin.password_hash as string);
  if (!valid) {
    return c.json({ success: false, message: '用户名或密码错误' }, 401);
  }

  const token = btoa(`${username}:${password}`);
  return c.json({ success: true, message: '登录成功', data: { token } });
});

adminRoutes.post('/init', async (c) => {
  const existingAdmins = await c.env.DB.prepare('SELECT COUNT(*) as count FROM admins').first();
  if ((existingAdmins?.count as number) > 0) {
    return c.json({ success: false, message: '管理员已初始化，不可重复操作' }, 400);
  }

  const { username, password } = await c.req.json<{ username: string; password: string }>();
  if (!username || !password) {
    return c.json({ success: false, message: '请输入用户名和密码' }, 400);
  }

  const passwordHash = await hashPassword(password);
  await c.env.DB.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)')
    .bind(username, passwordHash)
    .run();

  return c.json({ success: true, message: '管理员初始化成功' });
});

adminRoutes.use('/*', adminAuth);

adminRoutes.post('/cards/generate', async (c) => {
  const { count = 1, groupName } = await c.req.json<{ count?: number; groupName?: string }>();
  const clampedCount = Math.min(Math.max(count, 1), 100);

  const codes: string[] = [];
  const stmts = [];
  for (let i = 0; i < clampedCount; i++) {
    const code = generateCardCode(groupName);
    codes.push(code);
    stmts.push(c.env.DB.prepare('INSERT OR IGNORE INTO cards (code) VALUES (?)').bind(code));
  }

  await c.env.DB.batch(stmts);

  return c.json({ success: true, data: { codes } });
});

adminRoutes.get('/cards', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = (page - 1) * limit;

  const [cards, totalResult] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM cards ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .bind(limit, offset)
      .all(),
    c.env.DB.prepare('SELECT COUNT(*) as total FROM cards').first(),
  ]);

  const cardsWithGroup = cards.results.map((card: any) => {
    const code = card.code as string;
    const lastUnderscoreIndex = code.lastIndexOf('_');
    const groupName = lastUnderscoreIndex > 0 ? code.substring(lastUnderscoreIndex + 1) : null;
    return { ...card, group_name: groupName };
  });

  return c.json({
    success: true,
    data: {
      cards: cardsWithGroup,
      total: totalResult?.total as number,
      page,
      limit,
    },
  });
});

adminRoutes.post('/cards/batch-delete', async (c) => {
  const { codes } = await c.req.json<{ codes: string[] }>();

  if (!codes || codes.length === 0) {
    return c.json({ success: false, message: '请选择要删除的卡密' }, 400);
  }

  const placeholders = codes.map(() => '?').join(',');
  const stmts = [
    c.env.DB.prepare(`DELETE FROM cards WHERE code IN (${placeholders})`).bind(...codes),
    c.env.DB.prepare(`DELETE FROM submissions WHERE card_code IN (${placeholders})`).bind(...codes),
  ];

  await c.env.DB.batch(stmts);

  return c.json({ success: true, message: '删除成功' });
});

adminRoutes.get('/submissions', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = (page - 1) * limit;

  const [submissions, totalResult] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM submissions ORDER BY submitted_at DESC LIMIT ? OFFSET ?')
      .bind(limit, offset)
      .all(),
    c.env.DB.prepare('SELECT COUNT(*) as total FROM submissions').first(),
  ]);

  return c.json({
    success: true,
    data: {
      submissions: submissions.results,
      total: totalResult?.total as number,
      page,
      limit,
    },
  });
});

adminRoutes.get('/stats', async (c) => {
  const [totalCards, usedCards, totalSubmissions] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as count FROM cards').first(),
    c.env.DB.prepare("SELECT COUNT(*) as count FROM cards WHERE status = 'used'").first(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM submissions').first(),
  ]);

  return c.json({
    success: true,
    data: {
      totalCards: totalCards?.count as number,
      usedCards: usedCards?.count as number,
      unusedCards: (totalCards?.count as number) - (usedCards?.count as number),
      totalSubmissions: totalSubmissions?.count as number,
    },
  });
});

adminRoutes.get('/settings/contact', async (c) => {
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

adminRoutes.post('/settings/contact', async (c) => {
  const { qqNumber, wechatGroupImage } = await c.req.json<{
    qqNumber?: string;
    wechatGroupImage?: string;
  }>();

  const stmts = [];

  if (qqNumber !== undefined) {
    stmts.push(
      c.env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(
        'qq_number',
        qqNumber
      )
    );
  }

  if (wechatGroupImage !== undefined) {
    stmts.push(
      c.env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(
        'wechat_group_image',
        wechatGroupImage
      )
    );
  }

  if (stmts.length > 0) {
    await c.env.DB.batch(stmts);
  }

  return c.json({ success: true, message: '联系方式已更新' });
});

adminRoutes.post('/settings/upload-image', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('image') as File | null;

  if (!file) {
    return c.json({ success: false, message: '请选择图片' }, 400);
  }

  if (!file.type.startsWith('image/')) {
    return c.json({ success: false, message: '仅支持图片文件' }, 400);
  }

  if (file.size > 2 * 1024 * 1024) {
    return c.json({ success: false, message: '图片大小不能超过2MB' }, 400);
  }

  const arrayBuffer = await file.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  );
  const dataUrl = `data:${file.type};base64,${base64}`;

  await c.env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .bind('wechat_group_image', dataUrl)
    .run();

  return c.json({ success: true, message: '图片上传成功', data: { url: dataUrl } });
});

adminRoutes.get('/custom-display', async (c) => {
  const items = await c.env.DB.prepare(
    'SELECT * FROM custom_display ORDER BY sort_order ASC, id ASC'
  ).all();

  return c.json({ success: true, data: items.results });
});

adminRoutes.post('/custom-display', async (c) => {
  const { title, content, type = 'text', sort_order = 0 } = await c.req.json<{
    title: string;
    content: string;
    type?: string;
    sort_order?: number;
  }>();

  if (!title || !content) {
    return c.json({ success: false, message: '标题和内容不能为空' }, 400);
  }

  if (!['text', 'link'].includes(type)) {
    return c.json({ success: false, message: '类型只能是 text 或 link' }, 400);
  }

  const result = await c.env.DB.prepare(
    'INSERT INTO custom_display (title, content, type, sort_order) VALUES (?, ?, ?, ?)'
  )
    .bind(title, content, type, sort_order)
    .run();

  return c.json({ success: true, message: '添加成功', data: { id: result.meta.last_row_id } });
});

adminRoutes.put('/custom-display/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const { title, content, type, sort_order } = await c.req.json<{
    title?: string;
    content?: string;
    type?: string;
    sort_order?: number;
  }>();

  const existing = await c.env.DB.prepare('SELECT * FROM custom_display WHERE id = ?')
    .bind(id)
    .first();

  if (!existing) {
    return c.json({ success: false, message: '项目不存在' }, 404);
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (title !== undefined) { updates.push('title = ?'); values.push(title); }
  if (content !== undefined) { updates.push('content = ?'); values.push(content); }
  if (type !== undefined) {
    if (!['text', 'link'].includes(type)) {
      return c.json({ success: false, message: '类型只能是 text 或 link' }, 400);
    }
    updates.push('type = ?'); values.push(type);
  }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); values.push(sort_order); }

  if (updates.length === 0) {
    return c.json({ success: false, message: '没有需要更新的内容' }, 400);
  }

  values.push(id);
  await c.env.DB.prepare(`UPDATE custom_display SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  return c.json({ success: true, message: '更新成功' });
});

adminRoutes.delete('/custom-display/:id', async (c) => {
  const id = parseInt(c.req.param('id'));

  const existing = await c.env.DB.prepare('SELECT * FROM custom_display WHERE id = ?')
    .bind(id)
    .first();

  if (!existing) {
    return c.json({ success: false, message: '项目不存在' }, 404);
  }

  await c.env.DB.prepare('DELETE FROM custom_display WHERE id = ?').bind(id).run();

  return c.json({ success: true, message: '删除成功' });
});

adminRoutes.post('/change-password', async (c) => {
  const { oldPassword, newPassword } = await c.req.json<{
    oldPassword: string;
    newPassword: string;
  }>();

  if (!oldPassword || !newPassword) {
    return c.json({ success: false, message: '请输入当前密码和新密码' }, 400);
  }

  if (newPassword.length < 6) {
    return c.json({ success: false, message: '新密码长度至少6位' }, 400);
  }

  const admin = c.get('admin');
  const valid = await verifyPassword(oldPassword, admin.password_hash as string);
  if (!valid) {
    return c.json({ success: false, message: '当前密码错误' }, 400);
  }

  const newHash = await hashPassword(newPassword);
  await c.env.DB.prepare('UPDATE admins SET password_hash = ? WHERE id = ?')
    .bind(newHash, admin.id)
    .run();

  const newToken = btoa(`${admin.username}:${newPassword}`);
  return c.json({ success: true, message: '密码修改成功', data: { token: newToken } });
});

adminRoutes.get('/groups', async (c) => {
  const groups = await c.env.DB.prepare('SELECT * FROM card_groups ORDER BY sort_order ASC, id ASC').all();
  return c.json({ success: true, data: groups.results });
});

adminRoutes.post('/groups', async (c) => {
  const { name, sort_order = 0 } = await c.req.json<{ name: string; sort_order?: number }>();

  if (!name || name.trim().length === 0) {
    return c.json({ success: false, message: '分组名称不能为空' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM card_groups WHERE name = ?').bind(name.trim()).first();
  if (existing) {
    return c.json({ success: false, message: '分组名称已存在' }, 400);
  }

  const result = await c.env.DB.prepare('INSERT INTO card_groups (name, sort_order) VALUES (?, ?)')
    .bind(name.trim(), sort_order)
    .run();

  return c.json({ success: true, message: '分组创建成功', data: { id: result.meta.last_row_id } });
});

adminRoutes.put('/groups/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const { name, sort_order } = await c.req.json<{ name?: string; sort_order?: number }>();

  const existing = await c.env.DB.prepare('SELECT * FROM card_groups WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json({ success: false, message: '分组不存在' }, 404);
  }

  if (name !== undefined) {
    if (name.trim().length === 0) {
      return c.json({ success: false, message: '分组名称不能为空' }, 400);
    }
    const duplicate = await c.env.DB.prepare('SELECT id FROM card_groups WHERE name = ? AND id != ?').bind(name.trim(), id).first();
    if (duplicate) {
      return c.json({ success: false, message: '分组名称已存在' }, 400);
    }
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name.trim()); }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); values.push(sort_order); }

  if (updates.length === 0) {
    return c.json({ success: false, message: '没有需要更新的内容' }, 400);
  }

  values.push(id);
  await c.env.DB.prepare(`UPDATE card_groups SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

  return c.json({ success: true, message: '分组更新成功' });
});

adminRoutes.delete('/groups/:id', async (c) => {
  const id = parseInt(c.req.param('id'));

  const existing = await c.env.DB.prepare('SELECT * FROM card_groups WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json({ success: false, message: '分组不存在' }, 404);
  }

  const cardInGroup = await c.env.DB.prepare('SELECT id FROM cards WHERE group_id = ?').bind(id).first();
  if (cardInGroup) {
    return c.json({ success: false, message: '该分组下存在卡密，无法删除' }, 400);
  }

  await c.env.DB.prepare('DELETE FROM card_groups WHERE id = ?').bind(id).run();
  return c.json({ success: true, message: '分组删除成功' });
});
