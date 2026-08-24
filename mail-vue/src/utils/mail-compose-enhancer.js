import { useWriterStore } from '@/store/writer.js';
import { useEmailStore } from '@/store/email.js';
import { useAccountStore } from '@/store/account.js';
import { emailComposeSource } from '@/request/email.js';

const state = { started: false, lastBox: null };
const norm = (v) => String(v || '').trim().toLowerCase();
const unique = (a) => [...new Set((a || []).map(norm).filter(Boolean))];

function parseAddresses(value) {
  if (!value) return [];
  if (Array.isArray(value)) return unique(value.map(x => typeof x === 'string' ? x : x.address));
  try { return parseAddresses(JSON.parse(value)); } catch { return unique(String(value).split(/[,;，；]/)); }
}
function getHeaderState() { if (!window.__cloudMailCcBcc) window.__cloudMailCcBcc={cc:[],bcc:[]}; return window.__cloudMailCcBcc; }
function setHeaderState(field,value){ getHeaderState()[field]=unique(value); }
function addAddress(field,address){ const list=unique(getHeaderState()[field]); const email=norm(address); if(email&&!list.includes(email))list.push(email); getHeaderState()[field]=list; }

function renderFields(box) {
  if(!box||box.querySelector('.cloudmail-ccbcc'))return;
  const container=box.querySelector('.container'); const recipient=container?.querySelector('.el-input-tag'); if(!container||!recipient)return;
  const wrap=document.createElement('div'); wrap.className='cloudmail-ccbcc'; wrap.style.cssText='display:flex;flex-direction:column;gap:6px;margin-top:-8px;';
  wrap.innerHTML=`<div style="display:flex;gap:10px;font-size:13px;color:var(--el-text-color-secondary);"><button type="button" data-field="cc">CC</button><button type="button" data-field="bcc">BCC</button></div><div data-row="cc" style="display:none;align-items:center;gap:6px;"><span style="width:32px;color:var(--el-text-color-secondary);">CC</span><input data-input="cc" placeholder="添加抄送地址"/><button type="button" data-pick="cc">联系人</button></div><div data-row="bcc" style="display:none;align-items:center;gap:6px;"><span style="width:32px;color:var(--el-text-color-secondary);">BCC</span><input data-input="bcc" placeholder="添加密送地址"/><button type="button" data-pick="bcc">联系人</button></div>`;
  recipient.insertAdjacentElement('afterend',wrap);
  wrap.querySelectorAll('button[data-field]').forEach(btn=>btn.onclick=()=>{const row=wrap.querySelector(`[data-row="${btn.dataset.field}"]`);row.style.display=row.style.display==='none'?'flex':'none'});
  wrap.querySelectorAll('input[data-input]').forEach(input=>input.onkeydown=e=>{if(e.key!=='Enter'&&e.key!==',')return;e.preventDefault();input.value.split(/[,，]/).map(norm).filter(Boolean).forEach(v=>addAddress(input.dataset.input,v));input.value='';refreshRows(wrap)});
  wrap.querySelectorAll('button[data-pick]').forEach(btn=>btn.onclick=()=>openContactPicker(wrap,btn.dataset.pick));
  refreshRows(wrap);
}
function refreshRows(wrap){const s=getHeaderState();['cc','bcc'].forEach(field=>{const row=wrap.querySelector(`[data-row="${field}"]`),input=wrap.querySelector(`[data-input="${field}"]`);if(!row||!input)return;row.querySelectorAll('.cloudmail-chip').forEach(n=>n.remove());s[field].forEach(email=>{const chip=document.createElement('span');chip.className='cloudmail-chip';chip.textContent=email+' ×';chip.style.cssText='background:var(--el-fill-color);border-radius:12px;padding:2px 8px;font-size:12px;cursor:pointer;';chip.onclick=()=>{setHeaderState(field,s[field].filter(x=>x!==email));refreshRows(wrap)};row.insertBefore(chip,input)})})}
function openContactPicker(wrap,field){const store=useWriterStore();const contacts=store.contactRecord?.length?store.contactRecord:(store.sendRecipientRecord||[]).map(email=>({email}));const panel=document.createElement('div');panel.style.cssText='position:fixed;z-index:99999;background:var(--el-bg-color);border:1px solid var(--el-border-color);box-shadow:var(--el-box-shadow);padding:8px;border-radius:6px;max-height:260px;overflow:auto;min-width:280px;';panel.innerHTML='<input placeholder="搜索联系人" style="width:100%;box-sizing:border-box;margin-bottom:6px;padding:6px;">';const list=document.createElement('div');panel.appendChild(list);const render=(k='')=>{list.innerHTML='';contacts.filter(c=>!k||`${c.name||''} ${c.email}`.toLowerCase().includes(k.toLowerCase())).forEach(c=>{const item=document.createElement('div');item.style.cssText='padding:7px;cursor:pointer;';item.innerHTML=`<b>${c.name||''}</b> <span>${c.email}</span>`;item.onclick=()=>{addAddress(field,c.email);refreshRows(wrap);panel.remove()};list.appendChild(item)})};panel.querySelector('input').oninput=e=>render(e.target.value);render();document.body.appendChild(panel);const btn=wrap.querySelector(`[data-pick="${field}"]`),r=btn.getBoundingClientRect();panel.style.left=`${r.left}px`;panel.style.top=`${r.bottom+4}px`;setTimeout(()=>document.addEventListener('click',function close(e){if(!panel.contains(e.target)&&e.target!==btn){panel.remove();document.removeEventListener('click',close)}}, {once:true}),0)}

async function loadComposeSource(email){
  if(!email?.emailId) return email || {};
  try {
    const result = await emailComposeSource(email.emailId);
    return {...email, ...(result?.data || result || {})};
  } catch (e) {
    console.warn('读取原始邮件失败:', e);
    return email || {};
  }
}

function setForwardAttachments(email){
  const attachments = (email?.attachments || email?.attList || []).map(att => ({
    content: att.content,
    filename: att.filename,
    size: att.size,
    type: att.type || att.mimeType || att.contentType || 'application/octet-stream',
    contentType: att.contentType || att.mimeType || att.type || 'application/octet-stream'
  })).filter(att => att.content);
  window.__cloudMailForwardAttachments = attachments;
}

function prepareReply(email,replyAll){const self=norm(useAccountStore().currentAccount?.email),sender=norm(email?.sendEmail),to=parseAddresses(email?.recipient),cc=parseAddresses(email?.cc);let next=cc.filter(x=>x!==self&&x!==sender);if(replyAll)next=unique([...next,...to.filter(x=>x!==self&&x!==sender)]);setHeaderState('cc',next);setHeaderState('bcc',[])}
async function openReplyWithSource(email,replyAll=false){const source=await loadComposeSource(email);prepareReply(source,replyAll);window.__cloudMailUiStore?.writerRef?.openReply(source)}
async function openForwardWithSource(email){const source=await loadComposeSource(email);setForwardAttachments(source);window.__cloudMailUiStore?.writerRef?.openForward(source)}

function addReplyAllButton(header){if(header.querySelector('.cloudmail-reply-all'))return;const btn=document.createElement('button');btn.className='cloudmail-reply-all';btn.type='button';btn.title='Reply all';btn.textContent='↩↩';btn.style.cssText='border:0;background:none;cursor:pointer;font-size:18px;color:var(--el-text-color-primary);padding:0;';btn.onclick=()=>{const email=useEmailStore().contentData.email;openReplyWithSource(email,true)};const forward=header.querySelector('[data-icon="iconoir:arrow-up-right"]');if(forward)forward.insertAdjacentElement('beforebegin',btn);else header.appendChild(btn)}

export function installMailComposeEnhancer(uiStore){if(state.started)return;state.started=true;window.__cloudMailUiStore=uiStore;window.__cloudMailCcBcc={cc:[],bcc:[]};window.__cloudMailForwardAttachments=[];const observer=new MutationObserver(()=>{const box=document.querySelector('.write-box');if(box){renderFields(box);state.lastBox=box}const header=document.querySelector('.header-actions');if(header)addReplyAllButton(header)});observer.observe(document.body,{childList:true,subtree:true});document.addEventListener('click',async e=>{const icon=e.target?.closest?.('.header-actions svg');if(!icon)return;const iconName=icon.getAttribute('data-icon')||'';const email=useEmailStore().contentData.email;if(iconName.includes('la:reply')){e.preventDefault();e.stopImmediatePropagation();await openReplyWithSource(email,false)}if(iconName.includes('iconoir:arrow-up-right')){e.preventDefault();e.stopImmediatePropagation();await openForwardWithSource(email)}},true)}
