import app from '../hono/hono';
import contactService from '../service/contact-service';
import result from '../model/result';

const currentUserId = (c) => {
	const userId = c.get('userId');
	if (!userId) throw new Error('Unauthorized');
	return Number(userId);
};

app.get('/contact/list', async (c) => c.json(result.ok(await contactService.list(c, c.req.query(), currentUserId(c)))));
app.post('/contact/create', async (c) => c.json(result.ok(await contactService.create(c, await c.req.json(), currentUserId(c)))));
app.put('/contact/update', async (c) => c.json(result.ok(await contactService.update(c, await c.req.json(), currentUserId(c)))));
app.delete('/contact/delete', async (c) => { await contactService.delete(c, c.req.query().contactId, currentUserId(c)); return c.json(result.ok()); });
app.get('/contact/emails', async (c) => c.json(result.ok(await contactService.emails(c, c.req.query(), currentUserId(c)))));
