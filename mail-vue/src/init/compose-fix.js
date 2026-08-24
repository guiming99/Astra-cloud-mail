import { nextTick } from 'vue';
import { useUiStore } from '@/store/ui.js';
import { emailComposeSource } from '@/request/email.js';

// Reply/Forward must use the complete message, not the summary object from the list view.
// This wrapper intentionally leaves ShadowHtml and the normal compose component untouched.
export function installComposeFix() {
  const uiStore = useUiStore();
  let installedWriter = null;
  let timer = null;

  const install = () => {
    const writer = uiStore.writerRef?.value;
    if (!writer || installedWriter === writer || typeof writer.openReply !== 'function' || typeof writer.openForward !== 'function') return false;

    const originalReply = writer.openReply.bind(writer);
    const originalForward = writer.openForward.bind(writer);

    writer.openReply = async (email) => {
      try {
        const source = await emailComposeSource(email?.emailId);
        if (!source) return;
        await originalReply({ ...email, ...source, emailId: email.emailId });
      } catch (e) {
        console.error('[compose-fix] reply source failed', e);
      }
    };

    writer.openForward = async (email) => {
      try {
        const source = await emailComposeSource(email?.emailId);
        if (!source) return;
        // emailSend() already consumes this queue and adds these files to the real send request.
        window.__cloudMailForwardAttachments = Array.isArray(source.attachments) ? source.attachments : [];
        await originalForward({ ...email, ...source, emailId: email.emailId });
      } catch (e) {
        console.error('[compose-fix] forward source failed', e);
      }
    };

    installedWriter = writer;
    return true;
  };

  timer = setInterval(() => {
    if (install()) {
      clearInterval(timer);
      timer = null;
    }
  }, 100);

  nextTick(install);
}
