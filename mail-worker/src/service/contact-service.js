import { and, asc, count, desc, eq, like, or, sql } from 'drizzle-orm';
import orm from '../entity/orm';
import contact from '../entity/contact';
import email from '../entity/email';
import { isDel } from '../const/entity-const';
import BizError from '../error/biz-error';

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const contactService = {
	async list(c, params, userId) {
		const keyword = String(params.keyword || '').trim();
		const size = Math.min(Math.max(Number(params.size) || 50, 1), 100);
		const page = Math.max(Number(params.page) || 1, 1);
		const where = [eq(contact.userId, userId), eq(contact.isDel, isDel.NORMAL)];
		if (keyword) {
			const pattern = `%${keyword}%`;
			where.push(or(like(contact.name, pattern), like(contact.email, pattern)));
		}
		const list = await orm(c).select().from(contact).where(and(...where)).orderBy(asc(contact.name), asc(contact.contactId)).limit(size).offset((page - 1) * size).all();
		const total = await orm(c).select({ total: count() }).from(contact).where(and(...where)).get();
		return { list, total: total?.total || 0, page, size };
	},

	async get(c, contactId, userId) {
		return orm(c).select().from(contact).where(and(eq(contact.contactId, Number(contactId)), eq(contact.userId, userId), eq(contact.isDel, isDel.NORMAL))).get();
	},

	async create(c, params, userId) {
		const name = String(params.name || '').trim();
		const emailAddress = normalizeEmail(params.email);
		if (!name || !emailAddress) throw new BizError('Contact name and email are required');
		const exists = await orm(c).select().from(contact).where(and(eq(contact.userId, userId), sql`lower(${contact.email}) = ${emailAddress}`, eq(contact.isDel, isDel.NORMAL))).get();
		if (exists) throw new BizError('Contact email already exists');
		return orm(c).insert(contact).values({ userId, name, email: emailAddress }).returning().get();
	},

	async update(c, params, userId) {
		const contactId = Number(params.contactId);
		const name = String(params.name || '').trim();
		const emailAddress = normalizeEmail(params.email);
		if (!contactId || !name || !emailAddress) throw new BizError('Contact id, name and email are required');
		if (!await this.get(c, contactId, userId)) throw new BizError('Contact not found');
		const duplicate = await orm(c).select().from(contact).where(and(eq(contact.userId, userId), sql`lower(${contact.email}) = ${emailAddress}`, eq(contact.isDel, isDel.NORMAL))).all();
		if (duplicate.some(row => row.contactId !== contactId)) throw new BizError('Contact email already exists');
		return orm(c).update(contact).set({ name, email: emailAddress, updateTime: new Date().toISOString() }).where(and(eq(contact.contactId, contactId), eq(contact.userId, userId), eq(contact.isDel, isDel.NORMAL))).returning().get();
	},

	async delete(c, contactId, userId) {
		await orm(c).update(contact).set({ isDel: isDel.DELETE, updateTime: new Date().toISOString() }).where(and(eq(contact.contactId, Number(contactId)), eq(contact.userId, userId), eq(contact.isDel, isDel.NORMAL))).run();
	},

	async emails(c, params, userId) {
		const contactRow = await this.get(c, params.contactId, userId);
		if (!contactRow) throw new BizError('Contact not found');
		const address = normalizeEmail(contactRow.email);
		const where = and(
			eq(email.userId, userId),
			eq(email.isDel, isDel.NORMAL),
			or(
				sql`lower(${email.sendEmail}) = ${address}`,
				sql`lower(${email.recipient}) like ${`%\"address\":\"${address}\"%`}`
			)
		);
		const size = Math.min(Math.max(Number(params.size) || 50, 1), 100);
		const page = Math.max(Number(params.page) || 1, 1);
		const list = await orm(c).select().from(email).where(where).orderBy(desc(email.emailId)).limit(size).offset((page - 1) * size).all();
		const total = await orm(c).select({ total: count() }).from(email).where(where).get();
		return { contact: contactRow, list, total: total?.total || 0, page, size };
	}
};

export { normalizeEmail };
export default contactService;
