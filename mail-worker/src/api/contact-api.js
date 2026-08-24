import app from '../hono/hono';
import contactService from '../service/contact-service';
import result from '../model/result';
import userContext from '../security/user-context';

app.get('/contact/list', async (c) => {
	const data = await contactService.list(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/contact/emails', async (c) => {
	const data = await contactService.emails(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/contact/create', async (c) => {
	const data = await contactService.create(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.put('/contact/update', async (c) => {
	const data = await contactService.update(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.delete('/contact/delete', async (c) => {
	await contactService.delete(c, c.req.query().contactId, userContext.getUserId(c));
	return c.json(result.ok());
});
