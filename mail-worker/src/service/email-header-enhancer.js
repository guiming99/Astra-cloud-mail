import { and, eq } from 'drizzle-orm';
import email from '../entity/email';

const normalizeList = (value) => Array.isArray(value)
  ? value.map(v => String(v || '').trim().toLowerCase()).filter(Boolean)
  : [];

const unique = (items) => [...new Set(items)];

export function installEmailHeaderEnhancer(emailService) {
  if (emailService.__headerEnhancerInstalled) return;
  emailService.__headerEnhancerInstalled = true;

  const originalCloudflare = emailService.sendByCloudflareEmail.bind(emailService);
  emailService.sendByCloudflareEmail = async function(c, params) {
    const result = await originalCloudflare(c, params);
    return result;
  };

  const originalResend = emailService.sendByResend.bind(emailService);
  emailService.sendByResend = async function(resendToken, params) {
    return originalResend(resendToken, params);
  };

  // Patch the actual provider calls by wrapping the methods with cc/bcc-aware params.
  emailService.sendByCloudflareEmail = async function(c, params) {
    const sendForm = {
      from: { email: params.accountEmail, name: params.name },
      to: [...params.receiveEmail],
      subject: params.subject
    };
    if (params.cc?.length) sendForm.cc = params.cc;
    if (params.bcc?.length) sendForm.bcc = params.bcc;
    if (params.text) sendForm.text = params.text;
    if (params.html) sendForm.html = params.html;
    const attachments = await this.toCloudflareAttachments(params.attachments || []);
    if (attachments.length) sendForm.attachments = attachments;
    if (params.sendType === 'reply' && params.messageId) {
      sendForm.headers = { 'in-reply-to': params.messageId, references: params.messageId };
    }
    const result = await c.env.email.send(sendForm);
    return { data: { id: result.messageId } };
  };

  emailService.sendByResend = async function(resendToken, params) {
    const { Resend } = await import('resend');
    const resend = new Resend(resendToken);
    const sendForm = {
      from: `${params.name} <${params.accountEmail}>`,
      to: [...params.receiveEmail],
      subject: params.subject,
      text: params.text,
      html: params.html,
      attachments: await this.toResendAttachments(params.attachments || [])
    };
    if (params.cc?.length) sendForm.cc = [...params.cc];
    if (params.bcc?.length) sendForm.bcc = [...params.bcc];
    if (params.sendType === 'reply' && params.messageId) {
      sendForm.headers = { 'in-reply-to': params.messageId, references: params.messageId };
    }
    return resend.emails.send(sendForm);
  };

  const originalSend = emailService.send.bind(emailService);
  emailService.send = async function(c, params, userId) {
    const cc = normalizeList(params.cc);
    const bcc = normalizeList(params.bcc);
    const to = normalizeList(params.receiveEmail);
    const allTo = unique(to);
    const cleanCc = unique(cc.filter(v => !allTo.includes(v)));
    const cleanBcc = unique(bcc.filter(v => !allTo.includes(v) && !cleanCc.includes(v)));

    const enhancedParams = {
      ...params,
      receiveEmail: allTo,
      cc: cleanCc,
      bcc: cleanBcc
    };

    // The original sender already handles normal To delivery and persistence.
    // For internal mail, additionally create recipient copies for CC/BCC without exposing BCC addresses.
    const originalHandle = emailService.HandleOnSiteEmail;
    let internalSendData = null;
    let internalAttList = null;
    emailService.HandleOnSiteEmail = async function(c2, receiveList, sendData, attList) {
      internalSendData = sendData;
      internalAttList = attList;
      return originalHandle.call(this, c2, receiveList, sendData, attList);
    };

    try {
      const result = await originalSend(c, enhancedParams, userId);
      const sent = result?.[0];

      if (sent) {
        await c.env.db.prepare('UPDATE email SET cc = ?, bcc = ? WHERE email_id = ? AND user_id = ?')
          .bind(JSON.stringify(cleanCc), JSON.stringify(cleanBcc), sent.emailId, userId).run();
      }

      if (internalSendData && internalAttList) {
        const visibleRecipients = unique([...allTo, ...cleanCc]);
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
