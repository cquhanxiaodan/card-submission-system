const API_BASE = '/api';
let currentCardCode = '';
let adminToken = '';
let cardsPage = 1;
let submissionsPage = 1;
let cachedContact = null;
let cachedCustomDisplay = null;
document.addEventListener('keydown', function(e) {
  if (e.ctrlKey && e.altKey && e.key === 'M') {
    e.preventDefault();
    showAdminLogin();
  }
});

function showPage(pageId) {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
}

function showLoginPage() {
  showPage('login-page');
}

function showAdminLogin() {
  showPage('admin-login-page');
}

function hideMessage(id) {
  const el = document.getElementById(id);
  if (el) {
    el.style.display = 'none';
    el.textContent = '';
  }
}

function showMessage(id, text, type) {
  const el = document.getElementById(id);
  if (el) {
    el.className = `message ${type}`;
    el.textContent = text;
    el.style.display = 'block';
  }
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (loading) {
    btn.dataset.originalText = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span>';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.originalText || '提交';
  }
}

async function loadContactInfo() {
  if (cachedContact) return cachedContact;
  try {
    const res = await fetch(`${API_BASE}/settings/contact`);
    const data = await res.json();
    if (data.success) {
      cachedContact = data.data;
      return data.data;
    }
  } catch (e) {
    console.error('Failed to load contact info', e);
  }
  return null;
}

function renderContactInfo(containerId, contact) {
  const container = document.getElementById(containerId);
  if (!container || !contact) return;

  const hasQQ = contact.qqNumber && contact.qqNumber.trim();
  const hasWechat = contact.wechatGroupImage;

  const outerSection = container.closest('.contact-section');

  if (!hasQQ && !hasWechat) {
    if (outerSection) outerSection.style.display = 'none';
    return;
  }

  let html = '<div class="contact-title">联系我们</div>';
  html += '<div class="contact-items">';

  if (hasQQ) {
    html += `<div class="contact-item">
      <span class="contact-label">QQ:</span>
      <span class="contact-value">${escapeHtml(contact.qqNumber)}</span>
    </div>`;
  }

  if (hasWechat) {
    html += `<div class="contact-qr">
      <img src="${contact.wechatGroupImage}" alt="微信群二维码">
      <div class="qr-label">微信售后群</div>
    </div>`;
  }

  html += '</div>';
  container.innerHTML = html;
  if (outerSection) outerSection.style.display = 'block';
}

async function loadCustomDisplay() {
  if (cachedCustomDisplay) return cachedCustomDisplay;
  try {
    const res = await fetch(`${API_BASE}/settings/custom-display`);
    const data = await res.json();
    if (data.success) {
      cachedCustomDisplay = data.data;
      return data.data;
    }
  } catch (e) {
    console.error('Failed to load custom display', e);
  }
  return [];
}

function renderCustomDisplay(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const outerSection = container.closest('.custom-display-section');

  if (!items || items.length === 0) {
    if (outerSection) outerSection.style.display = 'none';
    return;
  }

  let html = '<div class="custom-display-title">更多信息</div>';
  html += '<div class="custom-display-items">';

  for (const item of items) {
    if (item.type === 'link') {
      html += `<div class="custom-display-item">
        <span class="item-label">${escapeHtml(item.title)}:</span>
        <a href="${escapeHtml(item.content)}" target="_blank" rel="noopener">${escapeHtml(item.content)}</a>
      </div>`;
    } else {
      html += `<div class="custom-display-item">
        <span class="item-label">${escapeHtml(item.title)}:</span>
        <span>${escapeHtml(item.content)}</span>
      </div>`;
    }
  }

  html += '</div>';
  container.innerHTML = html;
  if (outerSection) outerSection.style.display = 'block';
}

async function handleLogin() {
  const code = document.getElementById('card-code').value.trim().toUpperCase();
  hideMessage('login-error');

  if (!code) {
    showMessage('login-error', '请输入卡密', 'error');
    return;
  }

  setLoading('login-btn', true);

  try {
    const res = await fetch(`${API_BASE}/cards/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    const data = await res.json();

    if (data.success) {
      currentCardCode = code;
      sessionStorage.setItem('cardCode', code);
      checkSubmissionStatus(code);
    } else {
      showMessage('login-error', data.message, 'error');
    }
  } catch {
    showMessage('login-error', '网络错误，请重试', 'error');
  } finally {
    setLoading('login-btn', false);
  }
}

async function checkSubmissionStatus(code) {
  try {
    const res = await fetch(`${API_BASE}/submissions/status/${code}`);
    const data = await res.json();

    if (data.success && data.data.submitted) {
      document.getElementById('submitted-time').textContent = `提交时间：${data.data.submittedAt}`;
      showPage('submitted-page');
      const [contact, customDisplay] = await Promise.all([loadContactInfo(), loadCustomDisplay()]);
      renderContactInfo('submitted-contact-content', contact);
      renderCustomDisplay('submitted-custom-display-content', customDisplay);
    } else {
      showPage('submit-page');
    }
  } catch {
    showPage('submit-page');
  }
}

async function handleSubmit() {
  const content = document.getElementById('submit-content').value.trim();
  hideMessage('submit-error');

  if (!content) {
    showMessage('submit-error', '请输入提交内容', 'error');
    return;
  }

  if (!confirm('提交后不可修改，确认提交吗？')) return;

  setLoading('submit-btn', true);

  try {
    const res = await fetch(`${API_BASE}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardCode: currentCardCode, content }),
    });

    const data = await res.json();

    if (data.success) {
      showPage('submitted-page');
      document.getElementById('submitted-time').textContent = '刚刚提交';
      cachedContact = null;
      cachedCustomDisplay = null;
      const [contact, customDisplay] = await Promise.all([loadContactInfo(), loadCustomDisplay()]);
      renderContactInfo('submitted-contact-content', contact);
      renderCustomDisplay('submitted-custom-display-content', customDisplay);
    } else {
      showMessage('submit-error', data.message, 'error');
    }
  } catch {
    showMessage('submit-error', '网络错误，请重试', 'error');
  } finally {
    setLoading('submit-btn', false);
  }
}

async function handleAdminLogin() {
  const username = document.getElementById('admin-username').value.trim();
  const password = document.getElementById('admin-password').value;
  hideMessage('admin-login-error');

  if (!username || !password) {
    showMessage('admin-login-error', '请输入用户名和密码', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (data.success) {
      adminToken = data.data.token;
      sessionStorage.setItem('adminToken', adminToken);
      showPage('admin-page');
      loadStats();
    } else {
      showMessage('admin-login-error', data.message, 'error');
    }
  } catch {
    showMessage('admin-login-error', '网络错误，请重试', 'error');
  }
}

function adminLogout() {
  adminToken = '';
  sessionStorage.removeItem('adminToken');
  cachedContact = null;
  cachedCustomDisplay = null;
  showPage('login-page');
  loadContactInfo().then((contact) => {
    renderContactInfo('login-contact-content', contact);
  });
  loadCustomDisplay().then((items) => {
    renderCustomDisplay('login-custom-display-content', items);
  });
}

function showTab(tabName) {
  document.querySelectorAll('.tab-content').forEach((t) => t.classList.remove('active'));
  document.getElementById(`tab-${tabName}`).classList.add('active');

  if (tabName === 'stats') loadStats();
  if (tabName === 'cards') loadCards();
  if (tabName === 'submissions') loadSubmissions();
  if (tabName === 'contact') loadContactSettings();
  if (tabName === 'display') loadDisplayItems();
  if (tabName === 'groups') loadGroups();
}

async function adminFetch(url, options = {}) {
  return fetch(`${API_BASE}/admin${url}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${adminToken}`,
    },
  });
}

async function loadStats() {
  try {
    const res = await adminFetch('/stats');
    const data = await res.json();
    if (data.success) {
      document.getElementById('stat-total-cards').textContent = data.data.totalCards;
      document.getElementById('stat-used-cards').textContent = data.data.usedCards;
      document.getElementById('stat-unused-cards').textContent = data.data.unusedCards;
      document.getElementById('stat-total-submissions').textContent = data.data.totalSubmissions;
    }
  } catch (e) {
    console.error('Failed to load stats', e);
  }
}

async function loadCards() {
  try {
    const res = await adminFetch(`/cards?page=${cardsPage}&limit=20`);
    const data = await res.json();
    if (data.success) {
      const tbody = document.getElementById('cards-table-body');
      tbody.innerHTML = data.data.cards
        .map(
          (c) => `
        <tr>
          <td><input type="checkbox" class="card-checkbox" value="${c.code}"></td>
          <td><code>${c.code}</code></td>
          <td><span class="badge badge-${c.status}">${c.status === 'unused' ? '未使用' : '已使用'}</span></td>
          <td>${c.created_at}</td>
          <td>${c.used_at || '-'}</td>
        </tr>
      `
        )
        .join('');
      renderPagination('cards-pagination', data.data.total, data.data.page, data.data.limit, (p) => {
        cardsPage = p;
        loadCards();
      });
    }
  } catch (e) {
    console.error('Failed to load cards', e);
  }
}

function toggleSelectAllCards() {
  const selectAll = document.getElementById('select-all-cards');
  const checkboxes = document.querySelectorAll('.card-checkbox:not(:disabled)');
  checkboxes.forEach(cb => cb.checked = selectAll.checked);
}

async function deleteSelectedCards() {
  const checkboxes = document.querySelectorAll('.card-checkbox:checked');
  const codes = Array.from(checkboxes).map(cb => cb.value);
  if (codes.length === 0) {
    alert('请先选择要删除的卡密');
    return;
  }
  if (!confirm(`确定删除选中的 ${codes.length} 个卡密吗？`)) return;

  try {
    const res = await adminFetch('/cards/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codes }),
    });
    const data = await res.json();
    if (data.success) {
      loadCards();
      alert('删除成功');
    } else {
      alert(data.message || '删除失败');
    }
  } catch (e) {
    alert('网络错误，请重试');
  }
}

async function exportCards() {
  try {
    const res = await adminFetch('/cards/export');
    const blob = await res.blob();
    downloadBlob(blob, 'cards.csv');
  } catch (e) {
    alert('导出失败');
  }
}

async function exportSubmissions() {
  try {
    const res = await adminFetch('/submissions/export');
    const blob = await res.blob();
    downloadBlob(blob, 'submissions.csv');
  } catch (e) {
    alert('导出失败');
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function loadSubmissions() {
  try {
    const res = await adminFetch(`/submissions?page=${submissionsPage}&limit=20`);
    const data = await res.json();
    if (data.success) {
      const tbody = document.getElementById('submissions-table-body');
      tbody.innerHTML = data.data.submissions
        .map(
          (s) => `
        <tr>
          <td><input type="checkbox" class="submission-checkbox" value="${s.id}"></td>
          <td><code>${s.card_code}</code></td>
          <td><input type="text" class="mother-code-input" value="${escapeHtml(s.mother_code || '')}" placeholder="输入母号" onchange="updateMotherCode(${s.id}, this.value)"></td>
          <td>${escapeHtml(s.content)}</td>
          <td>${s.submitted_at}</td>
        </tr>
      `
        )
        .join('');
      renderPagination('submissions-pagination', data.data.total, data.data.page, data.data.limit, (p) => {
        submissionsPage = p;
        loadSubmissions();
      });
    }
  } catch (e) {
    console.error('Failed to load submissions', e);
  }
}

async function updateMotherCode(id, motherCode) {
  try {
    const res = await adminFetch(`/submissions/${id}/mother-code`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motherCode }),
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || '保存失败');
    }
  } catch (e) {
    alert('保存失败');
  }
}

function toggleSelectAllSubmissions() {
  const selectAll = document.getElementById('select-all-submissions');
  const checkboxes = document.querySelectorAll('.submission-checkbox');
  checkboxes.forEach(cb => cb.checked = selectAll.checked);
}

async function deleteSelectedSubmissions() {
  const checkboxes = document.querySelectorAll('.submission-checkbox:checked');
  const ids = Array.from(checkboxes).map(cb => parseInt(cb.value));
  if (ids.length === 0) {
    alert('请先选择要删除的记录');
    return;
  }
  if (!confirm(`确定删除选中的 ${ids.length} 条记录吗？`)) return;

  try {
    const res = await adminFetch('/submissions/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    const data = await res.json();
    if (data.success) {
      loadSubmissions();
      alert('删除成功');
    } else {
      alert(data.message || '删除失败');
    }
  } catch (e) {
    alert('网络错误，请重试');
  }
}

async function generateCards() {
  const count = parseInt(document.getElementById('card-gen-count').value) || 10;
  const groupName = document.getElementById('card-gen-group').value.trim();
  try {
    const res = await adminFetch('/cards/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count, groupName: groupName || undefined }),
    });
    const data = await res.json();
    if (data.success) {
      const codesDiv = document.getElementById('generated-codes');
      const codesList = document.getElementById('codes-list');
      codesList.innerHTML = data.data.codes.map((c) => `<div class="code-item">${c}</div>`).join('');
      codesDiv.style.display = 'block';
      codesDiv.dataset.codes = data.data.codes.join('\n');
      loadCards();
    }
  } catch (e) {
    console.error('Failed to generate cards', e);
  }
}

function copyCodes() {
  const codesDiv = document.getElementById('generated-codes');
  const codes = codesDiv.dataset.codes;
  navigator.clipboard.writeText(codes).then(() => {
    alert('已复制到剪贴板');
  });
}

async function handleInit() {
  const username = document.getElementById('init-username').value.trim();
  const password = document.getElementById('init-password').value;
  const confirm = document.getElementById('init-password-confirm').value;
  hideMessage('init-error');

  if (!username || !password) {
    showMessage('init-error', '请输入用户名和密码', 'error');
    return;
  }

  if (password !== confirm) {
    showMessage('init-error', '两次密码输入不一致', 'error');
    return;
  }

  if (password.length < 6) {
    showMessage('init-error', '密码长度至少6位', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/admin/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (data.success) {
      showMessage('init-error', '初始化成功，请登录', 'success');
      setTimeout(() => showAdminLogin(), 1500);
    } else {
      showMessage('init-error', data.message, 'error');
    }
  } catch {
    showMessage('init-error', '网络错误，请重试', 'error');
  }
}

async function loadContactSettings() {
  try {
    const res = await adminFetch('/settings/contact');
    const data = await res.json();
    if (data.success) {
      document.getElementById('setting-qq').value = data.data.qqNumber || '';

      const imgEl = document.getElementById('wechat-image-img');
      const placeholderEl = document.getElementById('wechat-image-placeholder');

      if (data.data.wechatGroupImage) {
        imgEl.src = data.data.wechatGroupImage;
        imgEl.style.display = 'block';
        placeholderEl.style.display = 'none';
      } else {
        imgEl.style.display = 'none';
        placeholderEl.style.display = 'flex';
      }
    }
  } catch (e) {
    console.error('Failed to load contact settings', e);
  }
}

async function handleImageUpload(input) {
  const file = input.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('请选择图片文件');
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    alert('图片大小不能超过2MB');
    return;
  }

  const preview = document.getElementById('wechat-image-preview');
  const placeholder = document.getElementById('wechat-image-placeholder');
  const img = document.getElementById('wechat-image-img');

  preview.style.display = 'none';
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'image-upload-loading';
  loadingDiv.innerHTML = '<span class="loading" style="border-top-color: var(--primary)"></span>';
  preview.parentNode.appendChild(loadingDiv);

  try {
    const formData = new FormData();
    formData.append('image', file);

    const res = await adminFetch('/settings/upload-image', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();

    if (data.success) {
      img.src = data.data.url;
      img.style.display = 'block';
      placeholder.style.display = 'none';
      cachedContact = null;
    } else {
      alert(data.message || '上传失败');
    }
  } catch (e) {
    alert('上传失败，请重试');
  } finally {
    loadingDiv.remove();
    preview.style.display = 'flex';
    input.value = '';
  }
}

async function saveContactSettings() {
  const qqNumber = document.getElementById('setting-qq').value.trim();
  const btn = document.getElementById('save-contact-btn');
  const msgEl = document.getElementById('contact-settings-message');

  btn.disabled = true;
  btn.textContent = '保存中...';
  msgEl.style.display = 'none';

  try {
    const res = await adminFetch('/settings/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qqNumber }),
    });
    const data = await res.json();

    if (data.success) {
      cachedContact = null;
      msgEl.className = 'message success';
      msgEl.textContent = '保存成功';
      msgEl.style.display = 'block';
    } else {
      msgEl.className = 'message error';
      msgEl.textContent = data.message || '保存失败';
      msgEl.style.display = 'block';
    }
  } catch {
    msgEl.className = 'message error';
    msgEl.textContent = '网络错误，请重试';
    msgEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '保存设置';
  }
}

async function loadDisplayItems() {
  try {
    const res = await adminFetch('/custom-display');
    const data = await res.json();
    if (data.success) {
      const tbody = document.getElementById('display-table-body');
      tbody.innerHTML = data.data
        .map(
          (item) => `
        <tr>
          <td>${escapeHtml(item.title)}</td>
          <td>${item.type === 'link' ? '<a href="' + escapeHtml(item.content) + '" target="_blank" rel="noopener">' + escapeHtml(item.content) + '</a>' : escapeHtml(item.content)}</td>
          <td>${item.type === 'link' ? '链接' : '纯文本'}</td>
          <td>${item.sort_order}</td>
          <td><button class="btn-delete" onclick="deleteDisplayItem(${item.id})">删除</button></td>
        </tr>
      `
        )
        .join('');
    }
  } catch (e) {
    console.error('Failed to load display items', e);
  }
}

async function addDisplayItem() {
  const title = document.getElementById('display-title').value.trim();
  const content = document.getElementById('display-content').value.trim();
  const type = document.getElementById('display-type').value;
  const sortOrder = parseInt(document.getElementById('display-sort').value) || 0;
  const msgEl = document.getElementById('display-add-message');
  msgEl.style.display = 'none';

  if (!title || !content) {
    msgEl.className = 'message error';
    msgEl.textContent = '标题和内容不能为空';
    msgEl.style.display = 'block';
    return;
  }

  try {
    const res = await adminFetch('/custom-display', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, type, sort_order: sortOrder }),
    });
    const data = await res.json();

    if (data.success) {
      document.getElementById('display-title').value = '';
      document.getElementById('display-content').value = '';
      document.getElementById('display-sort').value = '0';
      cachedCustomDisplay = null;
      loadDisplayItems();
      msgEl.className = 'message success';
      msgEl.textContent = '添加成功';
      msgEl.style.display = 'block';
      setTimeout(() => { msgEl.style.display = 'none'; }, 2000);
    } else {
      msgEl.className = 'message error';
      msgEl.textContent = data.message || '添加失败';
      msgEl.style.display = 'block';
    }
  } catch {
    msgEl.className = 'message error';
    msgEl.textContent = '网络错误，请重试';
    msgEl.style.display = 'block';
  }
}

async function deleteDisplayItem(id) {
  if (!confirm('确定删除该展示项吗？')) return;

  try {
    const res = await adminFetch(`/custom-display/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      cachedCustomDisplay = null;
      loadDisplayItems();
    } else {
      alert(data.message || '删除失败');
    }
  } catch {
    alert('网络错误，请重试');
  }
}

async function changePassword() {
  const oldPassword = document.getElementById('old-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmNew = document.getElementById('confirm-new-password').value;
  const msgEl = document.getElementById('password-message');
  const btn = document.getElementById('change-pwd-btn');
  msgEl.style.display = 'none';

  if (!oldPassword || !newPassword || !confirmNew) {
    msgEl.className = 'message error';
    msgEl.textContent = '请填写所有字段';
    msgEl.style.display = 'block';
    return;
  }

  if (newPassword.length < 6) {
    msgEl.className = 'message error';
    msgEl.textContent = '新密码长度至少6位';
    msgEl.style.display = 'block';
    return;
  }

  if (newPassword !== confirmNew) {
    msgEl.className = 'message error';
    msgEl.textContent = '两次输入的新密码不一致';
    msgEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = '修改中...';

  try {
    const res = await adminFetch('/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    const data = await res.json();

    if (data.success) {
      adminToken = data.data.token;
      sessionStorage.setItem('adminToken', adminToken);
      document.getElementById('old-password').value = '';
      document.getElementById('new-password').value = '';
      document.getElementById('confirm-new-password').value = '';
      msgEl.className = 'message success';
      msgEl.textContent = '密码修改成功';
      msgEl.style.display = 'block';
    } else {
      msgEl.className = 'message error';
      msgEl.textContent = data.message || '修改失败';
      msgEl.style.display = 'block';
    }
  } catch {
    msgEl.className = 'message error';
    msgEl.textContent = '网络错误，请重试';
    msgEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '修改密码';
  }
}

function renderPagination(containerId, total, currentPage, limit, onPageChange) {
  const container = document.getElementById(containerId);
  const totalPages = Math.ceil(total / limit);

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';
  html += `<button ${currentPage <= 1 ? 'disabled' : ''} onclick="void(0)">上一页</button>`;

  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);

  for (let i = start; i <= end; i++) {
    html += `<button class="${i === currentPage ? 'active' : ''}" onclick="void(0)">${i}</button>`;
  }

  html += `<button ${currentPage >= totalPages ? 'disabled' : ''} onclick="void(0)">下一页</button>`;
  container.innerHTML = html;

  container.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const text = btn.textContent;
      let page = currentPage;
      if (text === '上一页') page = currentPage - 1;
      else if (text === '下一页') page = currentPage + 1;
      else page = parseInt(text);
      onPageChange(page);
    });
  });
}

async function loadGroups() {
  try {
    const res = await adminFetch('/groups');
    const data = await res.json();
    if (data.success) {
      const groups = data.data || [];
      const genSelect = document.getElementById('card-gen-group');
      const filterSelect = document.getElementById('cards-filter-group');
      if (genSelect) {
        genSelect.innerHTML = '<option value="">默认分组</option>' +
          groups.map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
      }
      if (filterSelect) {
        filterSelect.innerHTML = '<option value="">全部</option><option value="none">默认分组</option>' +
          groups.map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
      }
      const tbody = document.getElementById('groups-table-body');
      if (tbody) {
        tbody.innerHTML = groups.map((g) => `
          <tr>
            <td>${escapeHtml(g.name)}</td>
            <td>${g.sort_order}</td>
            <td>-</td>
            <td><button class="btn-delete" onclick="deleteGroup(${g.id})">删除</button></td>
          </tr>
        `).join('');
      }
    }
  } catch (e) {
    console.error('Failed to load groups', e);
  }
}

async function addGroup() {
  const name = document.getElementById('group-name').value.trim();
  const sortOrder = parseInt(document.getElementById('group-sort').value) || 0;
  const msgEl = document.getElementById('group-add-message');
  msgEl.style.display = 'none';

  if (!name) {
    msgEl.className = 'message error';
    msgEl.textContent = '分组名称不能为空';
    msgEl.style.display = 'block';
    return;
  }

  try {
    const res = await adminFetch('/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, sort_order: sortOrder }),
    });
    const data = await res.json();

    if (data.success) {
      document.getElementById('group-name').value = '';
      document.getElementById('group-sort').value = '0';
      loadGroups();
      msgEl.className = 'message success';
      msgEl.textContent = '添加成功';
      msgEl.style.display = 'block';
      setTimeout(() => { msgEl.style.display = 'none'; }, 2000);
    } else {
      msgEl.className = 'message error';
      msgEl.textContent = data.message || '添加失败';
      msgEl.style.display = 'block';
    }
  } catch {
    msgEl.className = 'message error';
    msgEl.textContent = '网络错误，请重试';
    msgEl.style.display = 'block';
  }
}

async function deleteGroup(id) {
  if (!confirm('确定删除该分组吗？')) return;

  try {
    const res = await adminFetch(`/groups/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      loadGroups();
    } else {
      alert(data.message || '删除失败');
    }
  } catch {
    alert('网络错误，请重试');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

(async function init() {
  const savedCard = sessionStorage.getItem('cardCode');
  const savedToken = sessionStorage.getItem('adminToken');

  const [contact, customDisplay] = await Promise.all([
    loadContactInfo(),
    loadCustomDisplay(),
  ]);

  if (savedToken) {
    adminToken = savedToken;
    showPage('admin-page');
    loadStats();
    return;
  }

  if (savedCard) {
    currentCardCode = savedCard;
    checkSubmissionStatus(savedCard);
    return;
  }

  showPage('login-page');
  renderContactInfo('login-contact-content', contact);
  renderCustomDisplay('login-custom-display-content', customDisplay);
})();
