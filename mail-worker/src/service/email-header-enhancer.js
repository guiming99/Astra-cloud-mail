import { Resend } from 'resend';
import settingService from './setting-service';
import emailUtils from '../utils/email-utils';
import attService from './att-service';
import r2Service from './r2-service';

const normalizeList = (value) => Array.isArray(value) ? value.map(v => String(v || '').trim().toLowerCase()).filter(Boolean) : [];
const unique = (items) => [...new Set(items)];

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

async function loadOriginalForCompose(c, emailService, params, userId) {
  if (!params.emailId || !['reply', 'forward'].includes(params.sendType)) return params;
  const original = await emailService.selectById(c, Number(params.emailId));
  if (!original) return params;

  const next = { ...params };
  const originalHtml = original.content || `<pre style="font-family:inherit;white-space:pre-wrap">${String(original.text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>`;
  const date = original.createTime || '';
  const sender = original.name ? `${original.name} &lt;${original.sendEmail}&gt;` : original.sendEmail;
  const quote = `<div><br>${date} ${sender} wrote:</div><blockquote class="mceNonEditable" style="margin:0 0 0 .8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">${originalHtml}</blockquote>`;

  if (params.sendType === 'reply') {
    next.content = `${params.content || ''}${quote}`;
    next.text = `${params.text || ''}\n\n${date} ${sender} wrote:\n${original.text || ''}`;
  } else {
    next.content = params.content || quote;
    next.text = params.text || `${date} ${sender} wrote:\n${original.text || ''}`;

    const originalAtts = await attService.selectByEmailIds([Number(params.emailId)]);
    if (originalAtts.length) {
      const copied = [];
      for (const item of originalAtts) {
        const obj = await r2Service.getObj(c, item.key);
        if (!obj) continue;
        const buff = obj instanceof ArrayBuffer ? obj : await obj.arrayBuffer();
        copied.push({
          content: arrayBufferToBase64(buff),
          filename: item.filename,
          size: item.size,
          type: item.mimeType || 'application/octet-stream',
          contentType: item.mimeType || 'application/octet-stream'
        });
      }
      next.attachments = [...(params.attachments || []), ...copied];
    }
  }
  return next;
}

export function installEmailHeaderEnhancer(emailService) {
  if (emailService.__headerEnhancerInstalled) return;
  emailService.__headerEnhancerInstalled = true;

  emailService.sendByCloudflareEmail = async function(c, params) {
    const sendForm = { from: { email: params.accountEmail, name: params.name }, to: [...(params.primaryTo || params.receiveEmail)], subject: params.subject };
    if (params.cc?.length) sendForm.cc = params.cc;
    if (params.bcc?.length) sendForm.bcc = params.bcc;
    if (params.text) sendForm.text = params.text;
    if (params.html) sendForm.html = params.html;
    const attachments = await this.toCloudflareAttachments(params.attachments || []);
    if (attachments.length) sendForm.attachments = attachments;
    if (params.sendType === 'reply' && params.messageId) sendForm.headers = { 'in-reply-to': params.messageId, references: params.messageId };
    const result = await c.env.email.send(sendForm);
    return { data: { id: result.messageId } };
  };

  emailService.sendByResend = async function(resendToken, params) {
    const resend = new Resend(resendToken);
    const sendForm = { from: `${params.name} <${params.accountEmail}>`, to: [...(params.primaryTo || params.receiveEmail)], subject: params.subject, text: params.text, html: params.html, attachments: await this.toResendAttachments(params.attachments || []) };
    if (params.cc?.length) sendForm.cc = [...params.cc];
    if (params.bcc?.length) sendForm.bcc = [...params.bcc];
    if (params.sendType === 'reply' && params.messageId) sendForm.headers = { 'in-reply-to': params.messageId, references: params.messageId };
    return resend.emails.send(sendForm);
  };

  const originalSend = emailService.send.bind(emailService);
  emailService.send = async function(c, params, userId) {
    const composedParams = await loadOriginalForCompose(c, this, params, userId);
    const cc = normalizeList(composedParams.cc), bcc = normalizeList(composedParams.bcc), to = normalizeList(composedParams.receiveEmail);
    const cleanCc = unique(cc.filter(v => !to.includes(v)));
    const cleanBcc = unique(bcc.filter(v => !to.includes(v) && !cleanCc.includes(v)));
    const { domainList = [] } = await settingService.query(c);
    const allRecipients = unique([...to, ...cleanCc, ...cleanBcc]);
    const allInternal = allRecipients.every(address => domainList.includes('@' + emailUtils.getDomain(address)));
    const enhancedParams = { ...composedParams, receiveEmail: allInternal ? to : allRecipients, primaryTo: to, cc: cleanCc, bcc: cleanBcc };

    const originalHandle = emailService.HandleOnSiteEmail;
    let internalSendData = null, internalAttList = null;
    emailService.HandleOnSiteEmail = async function(c2, receiveList, sendData, attList) {
      internalSendData = sendData; internalAttList = attList;
      return originalHandle.call(this, c2, receiveList, sendData, attList);
    };

    try {
      const result = await originalSend(c, enhancedParams, userId);
      const sent = result?.[0];
      if (sent) {
        const storedTo = to.map(address => ({ address, name: '' }));
        await c.env.db.prepare('UPDATE email SET recipient = ?, cc = ?, bcc = ? WHERE email_id = ? AND user_id = ?')
          .bind(JSON.stringify(storedTo), JSON.stringify(cleanCc), JSON.stringify(cleanBcc), sent.emailId, userId).run();
      }
      if (allInternal && internalSendData && internalAttList) {
        const visibleRecipients = unique([...to, ...cleanCc]).map(address => ({ address, name: '' }));
        if (cleanCc.length) {
          const ccData = { ...internalSendData, recipient: JSON.stringify(visibleRecipients), cc: JSON.stringify(cleanCc), bcc: '[]' };
          await originalHandle.call(this, c, cleanCc, ccData, internalAttList);
        }
        for (const bccAddress of cleanBcc) {
          const bccData = { ...internalSendData, recipient: JSON.stringify(visibleRecipients), cc: JSON.stringify(cleanCc), bcc: '[]' };
          await originalHandle.call(this, c, [bccAddress], bccData, internalAttList);
        }
      }
      return result;
    } finally {
      emailService.HandleOnSiteEmail = originalHandle;
    }
  };
}