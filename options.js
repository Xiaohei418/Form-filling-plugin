// 设置页逻辑

const $ = (id) => document.getElementById(id);
const elName = $('userName');
const elUrl = $('webAppUrl');
const elSave = $('saveBtn');
const elTest = $('testBtn');
const elStatus = $('status');

function showStatus(msg, kind) {
  elStatus.textContent = msg;
  elStatus.className = `status ${kind}`;
}
function clearStatus() {
  elStatus.className = 'status hidden';
  elStatus.textContent = '';
}

function validate() {
  const name = elName.value.trim();
  const url = elUrl.value.trim();
  if (!name) return '请输入名字';
  if (!url) return '请输入 Web App 地址';
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec/.test(url)) {
    return '地址格式不对，应为 https://script.google.com/macros/s/.../exec';
  }
  return null;
}

// 加载已有设置
chrome.storage.sync.get(['userName', 'webAppUrl'], (s) => {
  if (s.userName) elName.value = s.userName;
  if (s.webAppUrl) elUrl.value = s.webAppUrl;
});

// 保存
elSave.addEventListener('click', () => {
  const err = validate();
  if (err) { showStatus(err, 'error'); return; }
  chrome.storage.sync.set({
    userName: elName.value.trim(),
    webAppUrl: elUrl.value.trim(),
  }, () => {
    showStatus('已保存。可以点 "测试连接" 验证。', 'success');
  });
});

// 测试：发一条 ping=true 的请求，Apps Script 会识别并回 ok 而不写入
elTest.addEventListener('click', async () => {
  const err = validate();
  if (err) { showStatus(err, 'error'); return; }

  elTest.disabled = true;
  const oldText = elTest.textContent;
  elTest.textContent = '测试中…';
  clearStatus();

  try {
    const resp = await fetch(elUrl.value.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ping: true, name: elName.value.trim() }),
      redirect: 'follow',
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    let data;
    try { data = await resp.json(); } catch (_) {
      throw new Error('响应不是 JSON，请确认部署的是项目里的 Code.gs，并选择 Anyone 访问。');
    }
    if (data && data.success) {
      showStatus(`连接成功 ✓ 表格："${data.sheetName || '当前工作表'}"`, 'success');
    } else {
      throw new Error(data.error || '响应异常');
    }
  } catch (e) {
    showStatus(`连接失败：${e.message || e}`, 'error');
  } finally {
    elTest.disabled = false;
    elTest.textContent = oldText;
  }
});
