// 工作时间记录器 - popup 逻辑
// 两种填写模式：计时（start/stop）、手动（手填时间段）
// 都会发送 { name, date, timeRange, content } 给 Apps Script

const $ = (id) => document.getElementById(id);

const els = {
  setupNeeded: $('setupNeeded'),
  idleView: $('idleView'),
  runningView: $('runningView'),

  dateInput: $('dateInput'),
  tabTimer: $('tabTimer'),
  tabManual: $('tabManual'),
  timerPanel: $('timerPanel'),
  manualPanel: $('manualPanel'),

  timerContent: $('timerContent'),
  startBtn: $('startBtn'),

  manualStart: $('manualStart'),
  manualEnd: $('manualEnd'),
  manualContent: $('manualContent'),
  manualSubmitBtn: $('manualSubmitBtn'),

  stopBtn: $('stopBtn'),
  cancelBtn: $('cancelBtn'),
  settingsBtn: $('settingsBtn'),
  goSettings: $('goSettings'),
  userName: $('userName'),
  runningTask: $('runningTask'),
  runningDate: $('runningDate'),
  startTimeDisplay: $('startTimeDisplay'),
  elapsedDisplay: $('elapsedDisplay'),
  toast: $('toast'),
};

let elapsedInterval = null;

// ---------- 工具 ----------
const pad = (n) => String(n).padStart(2, '0');

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTimeOfDay(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatElapsed(ms) {
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function showToast(msg, kind = 'default') {
  els.toast.textContent = msg;
  els.toast.className = `toast ${kind}`;
  void els.toast.offsetWidth;
  setTimeout(() => {
    els.toast.className = 'toast hidden';
  }, 2400);
}

function showView(name) {
  els.setupNeeded.classList.add('hidden');
  els.idleView.classList.add('hidden');
  els.runningView.classList.add('hidden');
  if (name === 'setup') els.setupNeeded.classList.remove('hidden');
  if (name === 'idle')  els.idleView.classList.remove('hidden');
  if (name === 'running') els.runningView.classList.remove('hidden');
}

// ---------- 存储 ----------
const getSettings = () => new Promise((res) =>
  chrome.storage.sync.get(['userName', 'webAppUrl'], (s) => res(s || {})));
const getActiveTask = () => new Promise((res) =>
  chrome.storage.local.get(['activeTask'], (s) => res(s.activeTask || null)));
const setActiveTask = (t) => new Promise((res) =>
  chrome.storage.local.set({ activeTask: t }, res));
const clearActiveTask = () => new Promise((res) =>
  chrome.storage.local.remove('activeTask', res));

// ---------- 计时显示 ----------
function startElapsedTimer(startTs) {
  stopElapsedTimer();
  const update = () => {
    els.elapsedDisplay.textContent = formatElapsed(Date.now() - startTs);
  };
  update();
  elapsedInterval = setInterval(update, 1000);
}

function stopElapsedTimer() {
  if (elapsedInterval) {
    clearInterval(elapsedInterval);
    elapsedInterval = null;
  }
}

// ---------- 模式切换 ----------
function setMode(mode) {
  if (mode === 'timer') {
    els.tabTimer.classList.add('active');
    els.tabManual.classList.remove('active');
    els.timerPanel.classList.remove('hidden');
    els.manualPanel.classList.add('hidden');
    setTimeout(() => els.timerContent.focus(), 30);
  } else {
    els.tabManual.classList.add('active');
    els.tabTimer.classList.remove('active');
    els.manualPanel.classList.remove('hidden');
    els.timerPanel.classList.add('hidden');
    // 默认起止时间：当前时间 -> 当前时间
    if (!els.manualStart.value) {
      const now = new Date();
      els.manualStart.value = formatTimeOfDay(now);
      els.manualEnd.value = formatTimeOfDay(now);
    }
  }
}

// ---------- 渲染 ----------
async function render() {
  const settings = await getSettings();
  if (!settings.userName || !settings.webAppUrl) {
    showView('setup');
    return;
  }

  const active = await getActiveTask();
  if (active) {
    els.runningTask.textContent = active.content;
    els.runningDate.textContent = active.date;
    els.startTimeDisplay.textContent = formatTimeOfDay(new Date(active.startTs));
    startElapsedTimer(active.startTs);
    showView('running');
  } else {
    els.userName.textContent = settings.userName;
    els.dateInput.value = todayStr();
    showView('idle');
    setMode('timer');
  }
}

// ---------- 提交核心 ----------
async function submitEntry({ date, timeRange, content }) {
  const settings = await getSettings();
  const resp = await fetch(settings.webAppUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      name: settings.userName,
      date,
      timeRange,
      content,
    }),
    redirect: 'follow',
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  let data = null;
  try { data = await resp.json(); } catch (_) {
    throw new Error('响应不是 JSON，请检查 Apps Script 部署');
  }
  if (!data.success) throw new Error(data.error || '写入失败');
  return data;
}

// ---------- 计时模式：开始 ----------
async function onStart() {
  const content = els.timerContent.value.trim();
  if (!content) {
    showToast('请先填写工作内容', 'error');
    els.timerContent.focus();
    return;
  }
  const date = els.dateInput.value || todayStr();
  await setActiveTask({ content, date, startTs: Date.now() });
  els.timerContent.value = '';
  await render();
}

// ---------- 计时模式：结束并提交 ----------
async function onStop() {
  const active = await getActiveTask();
  if (!active) { await render(); return; }

  const startDate = new Date(active.startTs);
  const endDate = new Date();
  const startStr = formatTimeOfDay(startDate);
  const endStr = formatTimeOfDay(endDate);

  // —— 立即冻结显示，捕获时间就是点击瞬间 ——
  stopElapsedTimer();
  // 把"已用"块改为显示结束时刻，让用户看清楚抓到的是几点几分
  const elapsedCap = document.querySelector('#runningView .timer-block:last-child .timer-cap');
  if (elapsedCap) elapsedCap.textContent = '结束';
  els.elapsedDisplay.textContent = endStr;

  // 按"实际本地日期"判断跨了几个午夜
  const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  const daysSpan = Math.round((endDay - startDay) / 86400000);

  els.stopBtn.disabled = true;
  els.cancelBtn.disabled = true;
  const oldHTML = els.stopBtn.innerHTML;
  els.stopBtn.textContent = '提交中…';

  try {
    if (daysSpan === 0) {
      // 同一天
      await submitEntry({
        date: active.date,
        timeRange: `${startStr}-${endStr}`,
        content: active.content,
      });
      showToast(`已记录 ${startStr}-${endStr}`, 'success');
    } else {
      // 跨午夜：拆成多段，分别写入对应日期行
      //   第 1 段：active.date     startStr → 00:00（下一天的开始）
      //   中间段：active.date + i  00:00 → 23:59（整天，留 1 分钟空隙避免歧义）
      //   末 段： active.date + N  00:00 → endStr（若 endStr === '00:00' 则跳过）
      await submitEntry({
        date: active.date,
        timeRange: `${startStr}-00:00`,
        content: active.content,
      });
      for (let i = 1; i < daysSpan; i++) {
        await submitEntry({
          date: addDaysStr(active.date, i),
          timeRange: '00:00-23:59',
          content: active.content,
        });
      }
      if (endStr !== '00:00') {
        await submitEntry({
          date: addDaysStr(active.date, daysSpan),
          timeRange: `00:00-${endStr}`,
          content: active.content,
        });
      }
      showToast(`跨 ${daysSpan + 1} 天已记录`, 'success');
    }
    await clearActiveTask();
    setTimeout(render, 400);
  } catch (err) {
    showToast(`提交失败：${err.message || err}（如已部分写入，请去表格手动检查）`, 'error');
    els.stopBtn.disabled = false;
    els.cancelBtn.disabled = false;
    els.stopBtn.innerHTML = oldHTML;
    // 提交失败时让用户重试：恢复计时显示
    if (elapsedCap) elapsedCap.textContent = '已用';
    startElapsedTimer(active.startTs);
  }
}

// 把 "2026-05-14" 加 n 天，返回 "2026-05-15"
function addDaysStr(yyyymmdd, n) {
  const parts = yyyymmdd.split('-').map(s => parseInt(s, 10));
  const d = new Date(parts[0], parts[1] - 1, parts[2] + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function onCancel() {
  if (!confirm('确定取消本次记录？')) return;
  stopElapsedTimer();
  await clearActiveTask();
  await render();
}

// ---------- 手动模式：直接提交 ----------
async function onManualSubmit() {
  const date = els.dateInput.value || todayStr();
  const start = els.manualStart.value;
  const end = els.manualEnd.value;
  const content = els.manualContent.value.trim();

  if (!start || !end) { showToast('请填写起止时间', 'error'); return; }
  if (!content) { showToast('请填写工作内容', 'error'); els.manualContent.focus(); return; }
  if (start === end) { showToast('起止时间相同', 'error'); return; }

  const timeRange = `${start}-${end}`;
  els.manualSubmitBtn.disabled = true;
  const oldText = els.manualSubmitBtn.textContent;
  els.manualSubmitBtn.textContent = '提交中…';

  try {
    await submitEntry({ date, timeRange, content });
    els.manualContent.value = '';
    showToast(`已记录 ${timeRange}`, 'success');
  } catch (err) {
    showToast(`提交失败：${err.message || err}`, 'error');
  } finally {
    els.manualSubmitBtn.disabled = false;
    els.manualSubmitBtn.textContent = oldText;
  }
}

function openOptions() {
  if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  else window.open(chrome.runtime.getURL('options.html'));
}

// ---------- 事件绑定 ----------
els.startBtn.addEventListener('click', onStart);
els.stopBtn.addEventListener('click', onStop);
els.cancelBtn.addEventListener('click', onCancel);
els.manualSubmitBtn.addEventListener('click', onManualSubmit);
els.settingsBtn.addEventListener('click', openOptions);
els.goSettings.addEventListener('click', openOptions);
els.tabTimer.addEventListener('click', () => setMode('timer'));
els.tabManual.addEventListener('click', () => setMode('manual'));

els.timerContent.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); onStart(); }
});

window.addEventListener('unload', stopElapsedTimer);

render();
