import { useWriterStore } from '@/store/writer.js';
import { useEmailStore } from '@/store/email.js';
import { useAccountStore } from '@/store/account.js';
import { cvtR2Url } from '@/utils/convert.js';

const state = { started: false, lastBox: null, activeField: 'cc' };
const norm = (v) => String(v || '').trim().toLowerCase();
const unique = (a) => [...new Set((a || []).map(norm).filter(Boolean))];

function parseAddresses(value) {
  if (!value) return [];
  if (Array.isArray(value)) return unique(value.map(x => typeof x === 'string' ? x : x.address));
  try { return parseAddresses(JSON.parse(value)); } catch { return unique(String(value).split(/[,;，；]/)); }
}

function getHeaderState() {
  if (!window.__cloudMailCcBcc) window.__cloudMailCcBcc = { cc: [], bcc: [] };
  return window.__cloudMailCcBcc;
}

function setHeaderState(field, value) {
  const s = getHeaderState();
  s[field] = unique(value);
}

function addAddress(field, address) {
  const s = getHeaderState();
  const list = unique(s[field]);
  const email = norm(address);
  if (email && !list.includes(email)) list.push(email);
  s[field] = list;
}

function renderFields(box) {
  if (!box || box.querySelector('.cloudmail-ccbcc')) return;
  const container = box.querySelector('.container');
  const recipient = container?.querySelector('.el-input-tag');
  if (!container || !recipient) return;

  const wrap = document.createElement('div');
  wrap.className = 'cloudmail-ccbcc';
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:-8px;';
  wrap.innerHTML = `
    <div class="cloudmail-ccbcc-toggle" style="display:flex;gap:10px;font-size:13px;color:var(--el-text-color-secondary);">
      <button type="button" data-field="cc">CC</button><button type="button" data-field="bcc">BCC</button>
    </div>
    <div class="cloudmail-address-row" data-row="cc" style="display:none;align-items:center;gap:6px;">
      <span style="width:32px;color:var(--el-text-color-secondary);">CC</span><input data-input="cc" placeholder="添加抄送地址"/><button type="button" data-pick="cc">联系人</button>
    </div>
    <div class="cloudmail-address-row" data-row="bcc" style="display:none;align-items:center;gap:6px;">
      <span style="width:32px;color:var(--el-text-color-secondary);">BCC</span><input data-input="bcc" placeholder="添加密送地址"/><button type="button" data-pick="bcc">联系人</button>
    </div>`;

  recipient.insertAdjacentElement('afterend', wrap);
  wrap.querySelectorAll('button[data-field]').forEach(btn => btn.addEventListener('click', () => {
    const field = btn.dataset.field;
    const row = wrap.querySelector(`[data-row="${field}"]`);
    row.style.display = row.style.display === 'none' ? 'flex' : 'none';
  }));
  wrap.querySelectorAll('input[data-input]').forEach(input => input.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const field = input.dataset.input;
    const values = input.value.split(/[,，]/).map(norm).filter(Boolean);
    values.forEach(v => addAddress(field, v));
    input.value = '';
    refreshRows(wrap);
  }));
  wrap.querySelectorAll('button[data-pick]').forEach(btn => btn.addEventListener('click', () => openContactPicker(wrap, btn.dataset.pick)));
  refreshRows(wrap);
}

function refreshRows(wrap) {
  const state = getHeaderState();
  ['cc','bcc'].forEach(field => {
    const row = wrap.querySelector(`[data-row="${field}"]`);
    const input = wrap.querySelector(`[data-input="${field}"]`);
    if (!row || !input) return;
    row.querySelectorAll('.cloudmail-chip').forEach(n => n.remove());
    state[field].forEach(email => {
      const chip = document.createElement('span');
      chip.className = 'cloudmail-chip';
      chip.textContent = email + ' ×';
      chip.style.cssText = 'background:var(--el-fill-color);border-radius:12px;padding:2px 8px;font-size:12px;cursor:pointer;';
      chip.onclick = () => { setHeaderState(field, state[field].filter(x => x !== email)); refreshRows(wrap); };
      row.insertBefore(chip, input);
    });
  });
}

function openContactPicker(wrap, field) {
  state.activeField = field;
  const store = useWriterStore();
  const contacts = store.contactRecord?.length ? store.contactRecord : (store.sendRecipientRecord || []).map(email => ({email}));
  const panel = document.createElement('div');
  panel.className = 'cloudmail-contact-picker';
  panel.style.cssText = 'position:fixed;z-index:99999;background:var(--el-bg-color);border:1px solid var(--el-border-color);box-shadow:var(--el-box-shadow);padding:8px;border-radius:6px;max-height:260px;overflow:auto;min-width:280px;';
  panel.innerHTML = `<input placeholder="搜索联系人" style="width:100%;box-sizing:border-box;margin-bottom:6px;padding:6px;">`;
  const list = document.createElement('div');
  panel.appendChild(list);
  const render = (keyword='') => {
    list.innerHTML='';
    contacts.filter(c => !keyword || `${c.name||''} ${c.email}`.toLowerCase().includes(keyword.toLowerCase())).forEach(c => {
      const item=document.createElement('div'); item.style.cssText='padding:7px;cursor:pointer;'; item.innerHTML=`<b>${c.name||''}</b> <span>${c.email}</span>`;
      item.onclick=()=>{addAddress(field,c.email);refreshRows(wrap);panel.remove()}; list.appendChild(item);
    });
  };
  panel.querySelector('input').oninput=e=>render(e.target.value); render();
  document.body.appendChild(panel);
  const btn=wrap.querySelector(`[data-pick="${field}"]`); const r=btn.getBoundingClientRect(); panel.style.left=`${r.left}px`; panel.style.top=`${r.bottom+4}px`;
  setTimeout(()=>document.addEventListener('click',function close(e){if(!panel.contains(e.target)&&e.target!==btn){panel.remove();document.removeEventListener('click',close)}}),0);
}

async function loadForwardAttachments(email) {
  const list = email?.attList || [];
  const result=[];
  for (const att of list) {
    try {
      const response=await fetch(cvtR2Url(att.key));
      if(!response.ok) continue;
      const buffer=await response.arrayBuffer();
      const bytes=new Uint8Array(buffer); let binary='';
      for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
      result.push({content:btoa(binary),filename:att.filename,size:att.size,type:att.mimeType||'application/octet-stream',contentType:att.mimeType||'application/octet-stream'});
    } catch(e) { console.warn('转发附件读取失败:',att.filename,e); }
  }
  window.__cloudMailForwardAttachments=result;
}

function prepareReply(email, replyAll) {
  const accountStore=useAccountStore();
  const self=norm(accountStore.currentAccount?.email);
  const sender=norm(email?.sendEmail);
  const originalTo=parseAddresses(email?.recipient);
  const originalCc=parseAddresses(email?.cc);
  let cc=originalCc.filter(x=>x!==self&&x!==sender);
  if(replyAll) cc=unique([...cc,...originalTo.filter(x=>x!==self&&x!==sender)]);
  setHeaderState('cc',cc);
  setHeaderState('bcc',[]);
}

function addReplyAllButton(header) {
  if (header.querySelector('.cloudmail-reply-all')) return;
  const btn=document.createElement('button');
  btn.className='cloudmail-reply-all';
  btn.type='button';
  btn.title='Reply all';
  btn.textContent='↩↩';
  btn.style.cssText='border:0;background:none;cursor:pointer;font-size:18px;color:var(--el-text-color-primary);padding:0;';
  btn.onclick=()=>{
    const email=useEmailStore().contentData.email;
    prepareReply(email,true);
    window.__cloudMailReplyMode='reply-all';
    useEmailStore();
    const ui=window.__cloudMailUiStore;
    if(ui?.writerRef?.openReply) ui.writerRef.openReply(email);
  };
  const forward=header.querySelector('[data-icon="iconoir:arrow-up-right"]');
  if(forward) forward.insertAdjacentElement('beforebegin',btn); else header.appendChild(btn);
}

export function installMailComposeEnhancer(uiStore) {
  if(state.started) return; state.started=true;
  window.__cloudMailUiStore=uiStore;
  window.__cloudMailCcBcc={cc:[],bcc:[]};
  window.__cloudMailForwardAttachments=[];
  const observer=new MutationObserver(()=>{
    const box=document.querySelector('.write-box');
    if(box) { renderFields(box); state.lastBox=box; }
    const header=document.querySelector('.header-actions');
    if(header) addReplyAllButton(header);
  });
  observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('click',async e=>{
    const icon=e.target?.closest?.('.header-actions svg');
    if(!icon) return;
    const iconName=icon.getAttribute('data-icon')||'';
    const email=useEmailStore().contentData.email;
    if(iconName.includes('la:reply')) prepareReply(email,false);
    if(iconName.includes('iconoir:arrow-up-right')) await loadForwardAttachments(email);
  },true);
}
