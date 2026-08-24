import http from '@/axios/index.js';

export function contactList(params) { return http.get('/contact/list', { params }); }
export function contactCreate(data) { return http.post('/contact/create', data); }
export function contactUpdate(data) { return http.put('/contact/update', data); }
export function contactDelete(contactId) { return http.delete('/contact/delete', { params: { contactId } }); }
export function contactEmails(params) { return http.get('/contact/emails', { params }); }
