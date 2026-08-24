import { defineStore } from 'pinia'
import { contactList } from '@/request/contact.js'

export const useWriterStore = defineStore('writer', {
    state: () => ({
        sendRecipientRecord: [],
        contactRecord: []
    }),
    actions: {
        async loadContacts() {
            try {
                const result = await contactList({ size: 500, page: 1 });
                const list = result?.list || result?.data?.list || [];
                this.contactRecord = list.map(item => ({
                    contactId: item.contactId,
                    name: item.name,
                    email: String(item.email || '').trim().toLowerCase()
                })).filter(item => item.email);
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
