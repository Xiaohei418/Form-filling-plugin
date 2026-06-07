# 工作时间记录器（Chrome 扩展）

一个用来记录每天工作任务和时间的 Chrome 扩展。点开始 → 干活 → 点结束，自动把 `日期 / 时间段 / 名字 / 任务` 四列写入指定的 Google Sheet。

## 它是怎么工作的

```
[Chrome 扩展弹窗] ── HTTPS POST ──> [Google Apps Script Web App] ── 写入 ──> [Google Sheet]
```

> **注意：** Google Sheet 自带的"发布到网络"是只读的，不能写入。所以这里用 **Google Apps Script** 部署一个 Web App 充当中转。你在扩展设置里填的不是 Sheet 的发布地址，而是 Apps Script 部署后给你的那个 `/exec` 结尾的 URL。

---

## 第一步：准备 Google Sheet 和 Apps Script

1. 新建（或打开）一个 Google Sheet，比如叫 `工作时间记录`。
2. 顶部菜单 **Extensions（扩展程序） → Apps Script**。
3. 把项目里 **`Code.gs`** 文件中的全部内容粘贴进编辑器（覆盖默认那一段 `function myFunction() {}`），保存（💾 或 Ctrl/Cmd + S）。
4. 右上角点 **Deploy → New deployment**。
5. 左上齿轮图标选择 **Web app**，然后：
   - **Description**：随便填，例如 "Work Tracker"
   - **Execute as**：**Me**（重要，这样脚本会以你身份写入 Sheet）
   - **Who has access**：**Anyone**（重要，必须开放访问，否则扩展无法调用；不用担心，这个 URL 别人猜不到，且只能"追加一行数据"）
6. 点 **Deploy**，第一次会弹出授权窗口：
   - 选你的 Google 账号 → 看到 "Google hasn't verified this app" → 点 **Advanced** → **Go to ... (unsafe)** → **Allow**。这是因为是你自己的脚本，没在 Google 商店发布，所以会显示这个提示，正常。
7. 部署完成后会显示一个 **Web app URL**，形如：
   ```
   https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxx/exec
   ```
   **复制这个 URL**，下一步要用。

> 以后修改了 `Code.gs`，记得 **Deploy → Manage deployments → 选中现有部署 → 铅笔图标 → Version 选 New version → Deploy**。否则修改不会生效。

---

## 第二步：安装 Chrome 扩展

1. 打开 Chrome，地址栏输入 `chrome://extensions`。
2. 右上角打开 **开发者模式（Developer mode）**。
3. 点 **加载已解压的扩展程序（Load unpacked）**。
4. 选中本项目所在文件夹（包含 `manifest.json` 的那个），确认。
5. 工具栏里就会出现一个黑色小方块图标（如果看不到，点工具栏的拼图图标，把这个扩展"图钉"住）。

## 第三步：填写设置

1. 右键扩展图标 → **选项（Options）**，或在弹窗中点右上齿轮。
2. 填两项：
   - **你的名字**：写入"名字"列的内容
   - **Google Apps Script Web App 地址**：粘贴第一步拿到的 `/exec` URL
3. 点 **测试连接** → 看到绿色 "连接成功 ✓" 就稳了。
4. 点 **保存设置**。

---

## 怎么用

1. 准备开始一项工作 → 点工具栏图标 → 在文本框里写"任务详情"（例如：写产品周报）→ **开始计时**。
2. 工具栏图标会出现一个绿色小圆点徽标，提醒你"正在记录中"。
3. 干完活 → 再点工具栏图标 → 看到任务名、开始时间、已用时间 → **结束并提交**。
4. 自动写入 Sheet，比如：

   | 日期 | 时间 | 名字 | 任务 |
   |---|---|---|---|
   | 2026-05-10 | 08:20-09:00 | 张三 | 写产品周报 |

5. 想中途取消（不写入）→ 弹窗底部 **取消本次记录**。

> 浏览器关闭了也没关系，正在进行中的任务存在 `chrome.storage.local`，重开 Chrome 仍在计时。

---

## 自定义

### 改列结构

打开 `Code.gs`，改两个常量：

```javascript
const HEADER_ROW = ['日期', '时间', '名字', '任务'];

function buildRow_(p) {
  return [p.date, p.timeRange, p.name, p.task];
}
```

例如想把"任务"放第一列：

```javascript
const HEADER_ROW = ['任务', '日期', '时间', '名字'];

function buildRow_(p) {
  return [p.task, p.date, p.timeRange, p.name];
}
```

改完别忘了重新部署（Manage deployments → New version）。

### 写到指定的 Tab

如果一个 Sheet 有多个工作表，想写到名字叫 `2026-05` 的那一个：

```javascript
const TARGET_SHEET_NAME = '2026-05';
```

### 可用字段

POST 请求里 `Code.gs` 能拿到的字段：

| 字段 | 说明 | 示例 |
|---|---|---|
| `date` | 日期 | `"2026-05-10"` |
| `timeRange` | 时间段 | `"08:20-09:00"` |
| `startTime` | 开始时间 | `"08:20"` |
| `endTime` | 结束时间 | `"09:00"` |
| `name` | 名字（设置里的） | `"张三"` |
| `task` | 任务详情 | `"写产品周报"` |

---

## 常见问题

**Q：测试连接报 "响应不是 JSON"？**
通常是部署时 "Who has access" 没选 Anyone，或者粘贴的不是项目里的 `Code.gs`。重新部署一次，注意权限。

**Q：测试连接报 HTTP 401 / 403？**
同上，"Who has access" 必须是 Anyone。

**Q：提交成功但 Sheet 里没看到数据？**
看下 `Code.gs` 里 `TARGET_SHEET_NAME` 是否设成了你想要的 Tab 名；留空就是写到第一个 Tab。

**Q：URL 是不是公开的就不安全？**
URL 包含一段随机字符串，外人猜不到。即便泄露，对方也只能往你的 Sheet 里追加数据，无法读取或删除。如果不放心，可以在 `doPost` 里加一个简单的 token 校验：让扩展每次请求带一个固定 token，Apps Script 检查后才接受。

**Q：能在多台电脑共用同一份配置吗？**
名字和 URL 存在 `chrome.storage.sync` 里，登录同一个 Google 账号同步 Chrome 后会自动同步过去。

---

## 文件清单

```
work-tracker/
├── manifest.json       Chrome 扩展清单
├── popup.html / .css / .js   工具栏弹窗
├── options.html / .css / .js 设置页
├── background.js       后台 service worker（管理徽标）
├── icons/              图标
├── Code.gs             ★ 粘贴到 Google Apps Script
└── README.md           本文档
```
