const CONFIG = Object.freeze({
  dailyDocId: '1q-b6YU1YFhqfDY8b3xzGtg-Oq81Twy7QCjoeCutZCZY',
  weekendDocId: '1pY9_7_dS_xTptgGNUYqR0Geg0MP4AXTTWPf0WpADJtI',
  recipient: 'chiral.perturbation@gmail.com',
  senderName: 'Quantum Daily'
});

function doGet() {
  return jsonResponse_({ ok: true, service: 'Quantum Daily Google bridge' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const expectedSecret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
    if (!expectedSecret || payload.secret !== expectedSecret) {
      return jsonResponse_({ ok: false, error: 'unauthorized' });
    }
    if (!['daily', 'weekend'].includes(payload.mode)) {
      return jsonResponse_({ ok: false, error: 'invalid mode' });
    }
    const markdown = String(payload.markdown || '').trim();
    if (!markdown) {
      return jsonResponse_({ ok: false, error: 'empty markdown' });
    }

    const docId = payload.mode === 'weekend' ? CONFIG.weekendDocId : CONFIG.dailyDocId;
    writeGoogleDoc_(docId, markdown);

    const subject = String(payload.subject || defaultSubject_(payload.mode, payload.date));
    const plainBody = markdownToPlain_(markdown);
    const htmlBody = markdownToHtml_(markdown);
    MailApp.sendEmail({
      to: CONFIG.recipient,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody,
      name: CONFIG.senderName
    });

    return jsonResponse_({
      ok: true,
      mode: payload.mode,
      documentId: docId,
      recipient: CONFIG.recipient
    });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonResponse_({ ok: false, error: String(error) });
  } finally {
    lock.releaseLock();
  }
}

function writeGoogleDoc_(docId, markdown) {
  const document = DocumentApp.openById(docId);
  const body = document.getBody();
  body.clear();

  const lines = markdown.replace(/\r/g, '').split('\n');
  lines.forEach(function(rawLine) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      body.appendParagraph('');
      return;
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
    if (/^結果\s/.test(paragraph.getText()) || /^なぜ重要か\s/.test(paragraph.getText()) || /^証拠\s/.test(paragraph.getText()) || /^金融R&Dへの含意\s/.test(paragraph.getText()) || /^判定\s/.test(paragraph.getText())) {
      const separator = paragraph.getText().indexOf(' ');
      if (separator > 0) {
        paragraph.editAsText().setBold(0, separator - 1, true);
      }
    }
  });

  document.saveAndClose();
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
  return markdown
    .replace(/\r/g, '')
    .split('\n')
    .map(function(line) {
      return markdownInlineToPlain_(line.replace(/^#{1,6}\s+/, '').replace(/^[-*]\s+/, '• '));
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

  return '<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.55;max-width:760px">' + output.join('\n') + '</div>';
}

function inlineHtml_(text) {
  let value = escapeHtml_(String(text));
  value = value.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2">$1</a>');
  value = value.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  value = value.replace(/`([^`]+)`/g, '<code>$1</code>');
  value = value.replace(/\s{2,}$/g, '');
  return value;
}

function escapeHtml_(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function defaultSubject_(mode, dateValue) {
  const prefix = mode === 'weekend' ? 'Quantum Weekend' : 'Quantum Daily';
  return '[' + prefix + '] ' + (dateValue || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'));
}

function jsonResponse_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
