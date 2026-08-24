import http from '@/axios/index.js';

export function emailList(accountId, allReceive, emailId, timeSort, size, type) {
    return http.get('/email/list', {params: {accountId, allReceive, emailId, timeSort, size, type}})
}

export function emailDelete(emailIds) {
    return http.delete('/email/delete?emailIds=' + emailIds)
}

export function emailLatest(emailId, accountId, allReceive) {
    return http.get('/email/latest', {params: {emailId, accountId, allReceive}, noMsg: true, timeout: 35 * 1000})
}

export function emailRead(emailIds) {
    return http.put('/email/read', {emailIds})
}

function composeEnhancedForm(form) {
    const enhanced = {...form};
    const cc = window.__cloudMailCcBcc?.cc || [];
    const bcc = window.__cloudMailCcBcc?.bcc || [];
    const forwardAttachments = window.__cloudMailForwardAttachments || [];
    if (cc.length) enhanced.cc = [...cc];
    if (bcc.length) enhanced.bcc = [...bcc];
    if (forwardAttachments.length && (!enhanced.attachments || enhanced.attachments.length === 0)) enhanced.attachments = [...forwardAttachments];
    window.__cloudMailCcBcc = {cc: [], bcc: []};
    window.__cloudMailForwardAttachments = [];
    return enhanced;
}

export function emailSend(form,progress) {
    return http.post('/email/send', composeEnhancedForm(form),{
        onUploadProgress: (e) => { progress(e) },
        noMsg: true
    })
}
