import app from '../hono/hono';
import contactService from '../service/contact-service';
import result from '../model/result';
import userService from '../service/user-service';

const currentUserId = async (c) => {
	const userId = c.get('userId');
	if (userId) return Number(userId);
	const emailAddress = c.get('userEmail') || c.get('email');
	if (emailAddress && userService.selectByEmail) {
		const user = await userService.selectByEmail(c, emailAddress);
		if (user) return user.userId;
	}
	throw new Error('Unauthorized');
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
