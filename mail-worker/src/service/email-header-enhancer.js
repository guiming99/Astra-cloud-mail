import { Resend } from 'resend';
import settingService from './setting-service';
import emailUtils from '../utils/email-utils';

const normalizeList = (value) => Array.isArray(value) ? value.map(v => String(v || '').trim().toLowerCase()).filter(Boolean) : [];
const unique = (items) => [...new Set(items)];

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
    const cc = normalizeList(params.cc), bcc = normalizeList(params.bcc), to = normalizeList(params.receiveEmail);
    const cleanCc = unique(cc.filter(v => !to.includes(v)));
    const cleanBcc = unique(bcc.filter(v => !to.includes(v) && !cleanCc.includes(v)));
    const { domainList = [] } = await settingService.query(c);
    const allRecipients = unique([...to, ...cleanCc, ...cleanBcc]);
    const allInternal = allRecipients.every(address => domainList.includes('@' + emailUtils.getDomain(address)));
    const enhancedParams = { ...params, receiveEmail: allInternal ? to : allRecipients, primaryTo: to, cc: cleanCc, bcc: cleanBcc };

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
