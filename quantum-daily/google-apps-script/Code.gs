const CONFIG = Object.freeze({
  timezone: 'Asia/Tokyo',
  dailyDocId: '1q-b6YU1YFhqfDY8b3xzGtg-Oq81Twy7QCjoeCutZCZY',
  weekendDocId: '1pY9_7_dS_xTptgGNUYqR0Geg0MP4AXTTWPf0WpADJtI',
  dailyDocUrl: 'https://docs.google.com/document/d/1q-b6YU1YFhqfDY8b3xzGtg-Oq81Twy7QCjoeCutZCZY/edit',
  weekendDocUrl: 'https://docs.google.com/document/d/1pY9_7_dS_xTptgGNUYqR0Geg0MP4AXTTWPf0WpADJtI/edit',
  dailySourceUrl: 'https://raw.githubusercontent.com/ShumpeiUno/information/main/quantum-daily/CURRENT.md',
  weekendSourceUrl: 'https://raw.githubusercontent.com/ShumpeiUno/information/main/quantum-daily/WEEKEND.md',
  dailyPublicUrl: 'https://github.com/ShumpeiUno/information/blob/main/quantum-daily/CURRENT.md',
  weekendPublicUrl: 'https://github.com/ShumpeiUno/information/blob/main/quantum-daily/WEEKEND.md',
  recipient: 'chiral.perturbation@gmail.com',
  senderName: 'Quantum Daily'
});

const MANAGED_TRIGGER_FUNCTIONS = Object.freeze([
  'syncDailyPrimary',
  'syncDailyRetry',
  'syncWeekendPrimary',
  'syncWeekendRetry'
]);

/**
 * Apps Scriptエディタから最初に1回だけ実行する。
 * Google Docs、メール送信、外部取得、トリガー管理を承認し、
 * 定期トリガーを作成して、最新の日次号を直ちに同期する。
 */
function installAutomation() {
  removeManagedTriggers_();

  ScriptApp.newTrigger('syncDailyPrimary')
    .timeBased()
    .everyDays(1)
    .atHour(5)
    .nearMinute(40)
    .inTimezone(CONFIG.timezone)
    .create();

  ScriptApp.newTrigger('syncDailyRetry')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .nearMinute(10)
    .inTimezone(CONFIG.timezone)
    .create();

  ScriptApp.newTrigger('syncWeekendPrimary')
    .timeBased()
    .everyDays(1)
    .atHour(21)
    .nearMinute(0)
    .inTimezone(CONFIG.timezone)
    .create();

  ScriptApp.newTrigger('syncWeekendRetry')
    .timeBased()
    .everyDays(1)
    .atHour(21)
    .nearMinute(30)
    .inTimezone(CONFIG.timezone)
    .create();

  const installedAt = Utilities.formatDate(new Date(), CONFIG.timezone, 'yyyy-MM-dd HH:mm:ss z');
  PropertiesService.getScriptProperties().setProperty('INSTALLED_AT', installedAt);

  let initialResult;
  try {
    initialResult = syncEdition_('daily', false, false);
  } catch (error) {
    initialResult = { ok: false, error: String(error) };
  }

  MailApp.sendEmail({
    to: CONFIG.recipient,
    subject: '[Quantum Daily] Google Docs・Gmail自動配信を有効化しました',
    body:
      'Google Apps Scriptの定期実行を有効化しました。\n\n' +
      '日次版: 平日05:40頃（失敗時は06:10頃に再試行）\n' +
      '週末版: 金曜日21:00頃（失敗時は21:30頃に再試行）\n\n' +
      '固定Google Doc: ' + CONFIG.dailyDocUrl + '\n' +
      '初回同期: ' + JSON.stringify(initialResult),
    htmlBody:
      '<p>Google Apps Scriptの定期実行を有効化しました。</p>' +
      '<p><strong>日次版:</strong> 平日05:40頃（失敗時は06:10頃に再試行）<br>' +
      '<strong>週末版:</strong> 金曜日21:00頃（失敗時は21:30頃に再試行）</p>' +
      '<p><a href="' + CONFIG.dailyDocUrl + '">固定Google Docを開く</a></p>' +
      '<p>初回同期: <code>' + escapeHtml_(JSON.stringify(initialResult)) + '</code></p>',
    name: CONFIG.senderName
  });

  return {
    ok: true,
    installedAt: installedAt,
    triggerCount: ScriptApp.getProjectTriggers().length,
    initialResult: initialResult
  };
}

function uninstallAutomation() {
  return { ok: true, removed: removeManagedTriggers_() };
}

function syncNow() {
  return syncEdition_('daily', true, true);
}

function syncWeekendNow() {
  return syncEdition_('weekend', true, true);
}

function syncDailyPrimary() {
  if (!isWeekday_()) return { ok: true, skipped: 'weekend' };
  return syncEdition_('daily', false, false);
}

function syncDailyRetry() {
  if (!isWeekday_()) return { ok: true, skipped: 'weekend' };
  return syncEdition_('daily', true, false);
}

function syncWeekendPrimary() {
  if (!isFriday_()) return { ok: true, skipped: 'not Friday' };
  return syncEdition_('weekend', false, false);
}

function syncWeekendRetry() {
  if (!isFriday_()) return { ok: true, skipped: 'not Friday' };
  return syncEdition_('weekend', true, false);
}

function automationStatus() {
  return {
    now: Utilities.formatDate(new Date(), CONFIG.timezone, 'yyyy-MM-dd HH:mm:ss z'),
    triggers: ScriptApp.getProjectTriggers().map(function(trigger) {
      return {
        functionName: trigger.getHandlerFunction(),
        eventType: String(trigger.getEventType()),
        triggerSource: String(trigger.getTriggerSource())
      };
    }),
    properties: PropertiesService.getScriptProperties().getProperties(),
    remainingMailQuota: MailApp.getRemainingDailyQuota()
  };
}

function syncEdition_(mode, notifyOnFailure, forceSend) {
  const isWeekend = mode === 'weekend';
  const sourceUrl = isWeekend ? CONFIG.weekendSourceUrl : CONFIG.dailySourceUrl;
  const publicUrl = isWeekend ? CONFIG.weekendPublicUrl : CONFIG.dailyPublicUrl;
  const docId = isWeekend ? CONFIG.weekendDocId : CONFIG.dailyDocId;
  const docUrl = isWeekend ? CONFIG.weekendDocUrl : CONFIG.dailyDocUrl;
  const propertyPrefix = isWeekend ? 'WEEKEND' : 'DAILY';

  try {
    const markdown = fetchMarkdown_(sourceUrl);
    const editionDate = validateEdition_(mode, markdown);
    const hash = contentHash_(markdown);
    const properties = PropertiesService.getScriptProperties();
    const lastHash = properties.getProperty('LAST_' + propertyPrefix + '_HASH');

    if (!forceSend && lastHash === hash) {
      return { ok: true, skipped: 'already delivered', mode: mode, date: editionDate };
    }

    writeGoogleDoc_(docId, markdown);
    sendEditionEmail_(mode, editionDate, markdown, docUrl, publicUrl);

    const syncedAt = Utilities.formatDate(new Date(), CONFIG.timezone, 'yyyy-MM-dd HH:mm:ss z');
    const updates = {};
    updates['LAST_' + propertyPrefix + '_HASH'] = hash;
    updates['LAST_' + propertyPrefix + '_DATE'] = editionDate;
    updates['LAST_' + propertyPrefix + '_SYNC_AT'] = syncedAt;
    properties.setProperties(updates);
    properties.deleteProperty('LAST_' + propertyPrefix + '_ERROR');

    return {
      ok: true,
      mode: mode,
      date: editionDate,
      syncedAt: syncedAt,
      documentUrl: docUrl,
      recipient: CONFIG.recipient
    };
  } catch (error) {
    const message = error && error.stack ? error.stack : String(error);
    console.error(message);
    PropertiesService.getScriptProperties().setProperty(
      'LAST_' + propertyPrefix + '_ERROR',
      Utilities.formatDate(new Date(), CONFIG.timezone, 'yyyy-MM-dd HH:mm:ss z') + ' | ' + message
    );
    if (notifyOnFailure) notifyFailure_(mode, message);
    throw error;
  }
}

function fetchMarkdown_(url) {
  const response = UrlFetchApp.fetch(url + '?cacheBust=' + Date.now(), {
    method: 'get',
    followRedirects: true,
    muteHttpExceptions: true,
    headers: {
      Accept: 'text/plain',
      'Cache-Control': 'no-cache',
      'User-Agent': 'QuantumDailyGoogleSync/1.0'
    }
  });
  const status = response.getResponseCode();
  const text = response.getContentText('UTF-8').replace(/^\uFEFF/, '').trim();
  if (status !== 200) {
    throw new Error('GitHub raw fetch failed: HTTP ' + status + ' | ' + text.slice(0, 300));
  }
  if (text.length < 500) {
    throw new Error('Fetched edition is unexpectedly short: ' + text.length + ' characters');
  }
  return text;
}

function validateEdition_(mode, markdown) {
  const expectedLabel = mode === 'weekend' ? 'Weekend' : 'Daily';
  const titleMatch = markdown.match(new RegExp('^#\\s+Quantum\\s+' + expectedLabel + '\\s+[—-]\\s+(\\d{4}-\\d{2}-\\d{2})', 'm'));
  if (!titleMatch) throw new Error('Edition title is missing or malformed for mode: ' + mode);

  const editionDate = titleMatch[1];
  const today = Utilities.formatDate(new Date(), CONFIG.timezone, 'yyyy-MM-dd');
  if (editionDate !== today) {
    throw new Error('Latest ' + mode + ' edition is stale. Expected ' + today + ', found ' + editionDate);
  }
  if (markdown.indexOf('https://') === -1) throw new Error('Edition contains no source URLs');
  return editionDate;
}

function writeGoogleDoc_(docId, markdown) {
  const document = DocumentApp.openById(docId);
  const body = document.getBody();
  body.clear();

  const lines = markdown.replace(/\r/g, '').split('\n');
  let pendingBlank = false;

  lines.forEach(function(rawLine) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      pendingBlank = true;
      return;
    }
    if (pendingBlank && body.getNumChildren() > 0) {
      body.appendParagraph('');
      pendingBlank = false;
    }

    let match;
    if ((match = line.match(/^#\s+(.+)$/))) {
      body.appendParagraph(markdownInlineToPlain_(match[1])).setHeading(DocumentApp.ParagraphHeading.TITLE);
      return;
    }
    if ((match = line.match(/^##\s+(.+)$/))) {
      body.appendParagraph(markdownInlineToPlain_(match[1])).setHeading(DocumentApp.ParagraphHeading.HEADING1);
      return;
    }
    if ((match = line.match(/^###\s+(.+)$/))) {
      body.appendParagraph(markdownInlineToPlain_(match[1])).setHeading(DocumentApp.ParagraphHeading.HEADING2);
      return;
    }
    if ((match = line.match(/^\d+\.\s+(.+)$/))) {
      body.appendListItem(markdownInlineToPlain_(match[1])).setGlyphType(DocumentApp.GlyphType.NUMBER);
      return;
    }
    if ((match = line.match(/^[-*]\s+(.+)$/))) {
      body.appendListItem(markdownInlineToPlain_(match[1])).setGlyphType(DocumentApp.GlyphType.BULLET);
      return;
    }
    if (/^---+$/.test(line.trim())) {
      body.appendHorizontalRule();
      return;
    }

    const paragraph = body.appendParagraph(markdownInlineToPlain_(line));
    const paragraphText = paragraph.getText();
    ['結果', 'なぜ重要か', '証拠', '金融R&Dへの含意', '判定', '原典'].some(function(label) {
      if (paragraphText.indexOf(label + ' ') === 0 || paragraphText.indexOf(label + ':') === 0 || paragraphText.indexOf(label + '：') === 0) {
        paragraph.editAsText().setBold(0, label.length - 1, true);
        return true;
      }
      return false;
    });
  });

  body.appendHorizontalRule();
  body.appendParagraph('公開版: https://github.com/ShumpeiUno/information/tree/main/quantum-daily');
  document.saveAndClose();
}

function sendEditionEmail_(mode, editionDate, markdown, docUrl, publicUrl) {
  const metadata = extractMetadata_(markdown);
  const prefix = mode === 'weekend' ? 'Quantum Weekend' : 'Quantum Daily';
  const subjectParts = ['[' + prefix + '] ' + editionDate];
  const details = [];
  if (metadata.candidateCount) details.push('候補' + metadata.candidateCount + '件');
  if (metadata.readingMinutes) details.push('推定' + metadata.readingMinutes + '分');
  if (details.length) subjectParts.push(details.join('・'));

  MailApp.sendEmail({
    to: CONFIG.recipient,
    subject: subjectParts.join('｜'),
    body: '固定Google Doc: ' + docUrl + '\n公開版: ' + publicUrl + '\n\n' + markdownToPlain_(markdown),
    htmlBody:
      '<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.55;max-width:800px">' +
      '<p><a href="' + docUrl + '" style="display:inline-block;padding:10px 16px;background:#1a73e8;color:#fff;text-decoration:none;border-radius:4px">固定Google Docで読む</a></p>' +
      '<p><a href="' + publicUrl + '">GitHub公開版</a></p>' + markdownToHtml_(markdown) + '</div>',
    name: CONFIG.senderName
  });
}

function notifyFailure_(mode, message) {
  const properties = PropertiesService.getScriptProperties();
  const today = Utilities.formatDate(new Date(), CONFIG.timezone, 'yyyy-MM-dd');
  const key = 'LAST_FAILURE_NOTICE_' + mode.toUpperCase();
  if (properties.getProperty(key) === today) return;

  const label = mode === 'weekend' ? 'Quantum Weekend' : 'Quantum Daily';
  MailApp.sendEmail({
    to: CONFIG.recipient,
    subject: '[' + label + '] Google Docs・Gmail自動配信エラー｜' + today,
    body: '再試行後も自動同期を完了できませんでした。\n\n' + String(message).slice(0, 4000) + '\n\n公開版: https://github.com/ShumpeiUno/information/tree/main/quantum-daily',
    name: CONFIG.senderName
  });
  properties.setProperty(key, today);
}

function removeManagedTriggers_() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (MANAGED_TRIGGER_FUNCTIONS.indexOf(trigger.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
      removed += 1;
    }
  });
  return removed;
}

function isWeekday_() {
  const day = localDayOfWeek_();
  return day >= 1 && day <= 5;
}

function isFriday_() {
  return localDayOfWeek_() === 5;
}

function localDayOfWeek_() {
  const localIso = Utilities.formatDate(new Date(), CONFIG.timezone, "yyyy-MM-dd'T'HH:mm:ss'Z'");
  return new Date(localIso).getUTCDay();
}

function contentHash_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function(value) {
    const unsigned = value < 0 ? value + 256 : value;
    return ('0' + unsigned.toString(16)).slice(-2);
  }).join('');
}

function extractMetadata_(markdown) {
  const candidateMatch = markdown.match(/収集候補:\s*(\d+)件/);
  const minutesMatch = markdown.match(/推定読了時間:\s*(\d+)分/);
  return {
    candidateCount: candidateMatch ? candidateMatch[1] : null,
    readingMinutes: minutesMatch ? minutesMatch[1] : null
  };
}

function markdownInlineToPlain_(text) {
  return String(text)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '$1 ($2)')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\\([_*`])/g, '$1')
    .replace(/\s{2,}$/g, '')
    .trim();
}

function markdownToPlain_(markdown) {
  return markdown.replace(/\r/g, '').split('\n').map(function(line) {
    return markdownInlineToPlain_(line.replace(/^#{1,6}\s+/, '').replace(/^[-*]\s+/, '• '));
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function markdownToHtml_(markdown) {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const output = [];
  let listType = null;

  function closeList() {
    if (listType) {
      output.push('</' + listType + '>');
      listType = null;
    }
  }

  lines.forEach(function(rawLine) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      closeList();
      return;
    }

    let match;
    if ((match = line.match(/^(#{1,3})\s+(.+)$/))) {
      closeList();
      const level = match[1].length;
      output.push('<h' + level + '>' + inlineHtml_(match[2]) + '</h' + level + '>');
      return;
    }
    if ((match = line.match(/^\d+\.\s+(.+)$/))) {
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        output.push('<ol>');
      }
      output.push('<li>' + inlineHtml_(match[1]) + '</li>');
      return;
    }
    if ((match = line.match(/^[-*]\s+(.+)$/))) {
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        output.push('<ul>');
      }
      output.push('<li>' + inlineHtml_(match[1]) + '</li>');
      return;
    }
    if (/^---+$/.test(line.trim())) {
      closeList();
      output.push('<hr>');
      return;
    }
    closeList();
    output.push('<p>' + inlineHtml_(line) + '</p>');
  });
  closeList();
  return output.join('\n');
}

function inlineHtml_(text) {
  let value = escapeHtml_(String(text));
  value = value.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2">$1</a>');
  value = value.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  value = value.replace(/`([^`]+)`/g, '<code>$1</code>');
  return value.replace(/\s{2,}$/g, '');
}

function escapeHtml_(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
