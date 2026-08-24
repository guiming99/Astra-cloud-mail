import { defineStore } from 'pinia'
import { contactList } from '@/request/contact.js'

export const useWriterStore = defineStore('writer', {
    state: () => ({
        sendRecipientRecord: []
    }),
    actions: {
        async loadContacts() {
            try {
                const result = await contactList({ size: 500, page: 1 });
                const emails = (result?.list || []).map(item => String(item.email || '').trim().toLowerCase()).filter(Boolean);
                this.sendRecipientRecord = [...new Set([...emails, ...this.sendRecipientRecord.map(item => String(item).trim().toLowerCase())])].slice(0, 500);
            } catch (e) {
                console.warn('联系人加载失败:', e);
            }
        }
    },
    persist: {
        pick: ['sendRecipientRecord'],
        afterRestore: ({ store }) => { store.loadContacts(); }
    },
})
