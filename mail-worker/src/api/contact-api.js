import app from '../hono/hono';
import contactService from '../service/contact-service';
import result from '../model/result';
import userService from '../service/user-service';

const currentUserId = async (c) => {
	const user = await userService.getCurrentUser(c);
	return user.userId;
};

app.get('/contact/list', async (c) => {
	const userId = await currentUserId(c);
	return c.json(result.ok(await contactService.list(c, c.req.query(), userId)));
});

app.post('/contact/create', async (c) => {
	const userId = await currentUserId(c);
	return c.json(result.ok(await contactService.create(c, await c.req.json(), userId)));
});

app.put('/contact/update', async (c) => {
	const userId = await currentUserId(c);
	return c.json(result.ok(await contactService.update(c, await c.req.json(), userId)));
});

app.delete('/contact/delete', async (c) => {
	const userId = await currentUserId(c);
	await contactService.delete(c, c.req.query().contactId, userId);
	return c.json(result.ok());
});

app.get('/contact/emails', async (c) => {
	const userId = await currentUserId(c);
	return c.json(result.ok(await contactService.emails(c, c.req.query(), userId)));
});
