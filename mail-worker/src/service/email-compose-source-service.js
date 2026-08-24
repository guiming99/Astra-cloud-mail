import orm from '../entity/orm';
import email from '../entity/email';
import { att } from '../entity/att';
import { and, eq } from 'drizzle-orm';
import { isDel, attConst } from '../const/entity-const';
import r2Service from './r2-service';

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const emailComposeSourceService = {
  async get(c, emailId, userId) {
    const id = Number(emailId);
    if (!id) throw new Error('Invalid email id');
    const source = await orm(c).select().from(email).where(and(eq(email.emailId, id), eq(email.userId, userId), eq(email.isDel, isDel.NORMAL))).get();
    if (!source) throw new Error('Original email not found');
    const rows = await orm(c).select().from(att).where(and(eq(att.emailId, id), eq(att.userId, userId), eq(att.type, attConst.type.ATT))).all();
    const attachments = [];
    for (const row of rows) {
      const obj = await r2Service.getObj(c, row.key);
      if (!obj) continue;
      const buffer = obj instanceof ArrayBuffer ? obj : await obj.arrayBuffer();
      attachments.push({ filename: row.filename, size: row.size, type: row.mimeType || 'application/octet-stream', mimeType: row.mimeType || 'application/octet-stream', contentType: row.mimeType || 'application/octet-stream', content: arrayBufferToBase64(buffer) });
    }
    return { ...source, attachments };
  }
};

export default emailComposeSourceService;
