// 后台 service worker
// 主要负责：当有任务正在进行时，在工具栏图标显示一个圆点徽标。

function refreshBadge() {
  chrome.storage.local.get(['activeTask'], (s) => {
    if (s.activeTask) {
      const txt = String(s.activeTask.content || s.activeTask.task || '').slice(0, 40);
      chrome.action.setBadgeText({ text: '●' });
      chrome.action.setBadgeBackgroundColor({ color: '#2d7a4a' });
      chrome.action.setTitle({ title: `工时记录 — 进行中: ${txt}` });
    } else {
      chrome.action.setBadgeText({ text: '' });
      chrome.action.setTitle({ title: '工时记录' });
    }
  });
}

chrome.runtime.onInstalled.addListener(refreshBadge);
chrome.runtime.onStartup.addListener(refreshBadge);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.activeTask) refreshBadge();
});

// 兜底：每分钟刷新一次
chrome.alarms.create('refreshBadge', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'refreshBadge') refreshBadge();
});

refreshBadge();
