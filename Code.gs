/**
 * 工作时间记录器 — Google Apps Script
 *
 * 行为：
 *   - 根据请求中的 name 字段，找到名字相同的 sheet（tab）
 *   - 三列结构：日期 | 时间汇总 | 主要内容
 *   - 同一日期合并到同一行：第三列用换行追加新条目，第二列重算总分钟
 *
 * 部署：Deploy → New deployment → Web app
 *   Execute as: Me
 *   Who has access: Anyone
 */

const HEADER_ROW = ['日期', '时间汇总', '主要内容'];

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // ping 测试
    if (payload.ping === true) {
      const sheet = ss.getSheetByName(payload.name || '');
      if (!sheet) {
        return jsonOut_({
          success: false,
          error: '没有名为 "' + (payload.name || '') + '" 的 sheet。请在表格底部新建对应 tab。',
        });
      }
      return jsonOut_({ success: true, sheetName: sheet.getName() });
    }

    if (!payload.name || !payload.date || !payload.timeRange || !payload.content) {
      return jsonOut_({ success: false, error: '缺少必填字段（name/date/timeRange/content）' });
    }

    const sheet = ss.getSheetByName(payload.name);
    if (!sheet) {
      return jsonOut_({
        success: false,
        error: '没有名为 "' + payload.name + '" 的 sheet',
      });
    }

    ensureHeader_(sheet);

    const dateStr = payload.date; // YYYY-MM-DD
    const newEntry = payload.timeRange + ' ' + payload.content;

    // 找已有的日期行
    const lastRow = sheet.getLastRow();
    let targetRow = -1;
    if (lastRow >= 2) {
      const dateCol = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < dateCol.length; i++) {
        if (dateKey_(dateCol[i][0]) === dateStr) {
          targetRow = i + 2;
          break;
        }
      }
    }

    if (targetRow === -1) {
      // 新建一行
      const minutes = computeMinutesFromContent_(newEntry);
      sheet.appendRow([toDate_(dateStr), minutes + '分钟', newEntry]);
      const r = sheet.getLastRow();
      sheet.getRange(r, 1).setNumberFormat('yyyy-MM-dd');
      sheet.getRange(r, 3).setWrap(true).setVerticalAlignment('top');
    } else {
      // 追加到已有行的第三列，重算第二列
      const cellC = sheet.getRange(targetRow, 3);
      const existing = String(cellC.getValue() || '');
      const merged = existing ? (existing + '\n' + newEntry) : newEntry;
      const minutes = computeMinutesFromContent_(merged);
      sheet.getRange(targetRow, 2).setValue(minutes + '分钟');
      cellC.setValue(merged).setWrap(true).setVerticalAlignment('top');
    }

    return jsonOut_({ success: true });
  } catch (err) {
    return jsonOut_({ success: false, error: String(err && err.message || err) });
  }
}

function doGet() {
  return ContentService
    .createTextOutput('Work Tracker endpoint is alive. POST JSON to record entries.')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ---------- 内部工具 ----------

// 从内容里把所有 "HH:MM-HH:MM" 时段加起来，单位分钟
function computeMinutesFromContent_(content) {
  if (!content) return 0;
  const re = /(\d{1,2}):(\d{2})\s*[-—~～至到至]\s*(\d{1,2}):(\d{2})/g;
  let total = 0;
  let m;
  while ((m = re.exec(content)) !== null) {
    const start = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    const end = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
    let diff = end - start;
    if (diff < 0) diff += 24 * 60; // 跨午夜
    total += diff;
  }
  return total;
}

function dateKey_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  if (!v) return '';
  // 字符串日期：尝试解析成统一格式
  const s = String(v).trim();
  // 已经是 YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const p = s.split('-');
    return p[0] + '-' + pad2_(p[1]) + '-' + pad2_(p[2]);
  }
  // 2026/5/10 之类
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)) {
    const p = s.split('/');
    return p[0] + '-' + pad2_(p[1]) + '-' + pad2_(p[2]);
  }
  return s;
}

function pad2_(n) {
  return String(n).padStart(2, '0');
}

function toDate_(yyyymmdd) {
  const p = yyyymmdd.split('-');
  return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
}

function ensureHeader_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER_ROW);
    sheet.getRange(1, 1, 1, HEADER_ROW.length).setFontWeight('bold');
    sheet.setColumnWidth(1, 110);
    sheet.setColumnWidth(2, 90);
    sheet.setColumnWidth(3, 420);
  }
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
