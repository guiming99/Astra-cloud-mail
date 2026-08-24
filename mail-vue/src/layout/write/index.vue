<template>
  <div class="send" v-show="show">
    <div class="write-box">
      <div class="title"><div class="title-left"><span class="title-text"><Icon icon="hugeicons:quill-write-01" width="28" height="28"/></span><span class="sender">{{ $t('sender') }}:</span><span class="sender-name">{{ form.name }}</span><span class="send-email">&lt;{{ form.sendEmail }}&gt;</span></div><div @click="close" style="cursor:pointer"><Icon icon="material-symbols-light:close-rounded" width="22" height="22"/></div></div>
      <div class="container">
        <el-input-tag @add-tag="addTagChange" tag-type="primary" @input="inputChange" size="default" v-model="form.receiveEmail">
          <template #prefix><div class="item-title">{{ $t('recipient') }}</div><el-select ref="mySelect" class="write-select" popper-class="write-select" :show-arrow="false" :no-match-text="' '" :no-data-text="' '" @visible-change="selectStatusChange" @change="selectChange"><el-option v-for="item in selectRecipientList" :key="item" :label="item" :value="item" style="color:#999896;"/></el-select></template>
          <template #suffix><div style="display:flex;margin-right:3px"><Icon icon="fa7-solid:user-plus" width="20" height="20" class="add-contact" @click.stop="openContacts"/></div></template>
        </el-input-tag>
        <el-input v-model="form.subject" :placeholder="t('subject')"/><tinyEditor :def-value="defValue" ref="editor" @change="change" @focus="focusChange"/>
        <div class="button-item"><div class="att-add" @click="chooseFile"><Icon icon="iconamoon:attachment-fill" width="24" height="24"/></div><div class="att-clear" @click="clearContent"><Icon icon="icon-park-outline:clear-format" width="24" height="24"/></div><div class="att-list"><div class="att-item" v-for="(item,index) in form.attachments" :key="index"><Icon v-bind="getIconByName(item.filename)"/><span class="att-filename">{{ item.filename }}</span><span class="att-size">{{ formatBytes(item.size) }}</span><Icon style="cursor:pointer" icon="material-symbols-light:close-rounded" @click="delAtt(index)" width="22" height="22"/></div></div><div><el-button type="primary" @click="sendEmail">{{ form.sendType === 'reply' ? $t('reply') : form.sendType === 'forward' ? $t('forward') : $t('send') }}</el-button></div></div>
      </div>
    </div>
    <el-dialog top="10vh" v-model="showContacts" @closed="clearSelectContact" :title="t('recentContacts')">
      <el-table ref="contactsTabRef" row-key="email" :data="contacts" style="height:445px"><el-table-column type="selection" width="32"/><el-table-column property="name" :label="t('name')" min-width="140"><template #default="props"><div>{{ props.row.name }}</div></template></el-table-column><el-table-column property="email" :label="t('emailAccount')" min-width="260"><template #default="props"><div class="email-row">{{ props.row.email }}</div></template></el-table-column></el-table>
      <div class="contacts-bottom"><el-button type="default" @click="deleteContact">{{t('clear')}}</el-button><el-button type="primary" @click="chooseContact">{{t('selectContacts')}}</el-button></div>
    </el-dialog>
  </div>
</template>
<script setup>
import tinyEditor from '@/components/tiny-editor/index.vue'
import {nextTick, reactive, ref, computed} from 'vue'
import {Icon} from '@iconify/vue'
import {useUserStore} from '@/store/user.js'
import {emailSend} from '@/request/email.js'
import {isEmail} from '@/utils/verify-utils.js'
import {useAccountStore} from '@/store/account.js'
import {useEmailStore} from '@/store/email.js'
import {fileToBase64, formatBytes} from '@/utils/file-utils.js'
import {getIconByName} from '@/utils/icon-utils.js'
import {useSettingStore} from '@/store/setting.js'
import {userDraftStore} from '@/store/draft.js'
import {useWriterStore} from '@/store/writer.js'
import {useI18n} from 'vue-i18n'
import {ElMessageBox} from 'element-plus'
/* The remaining writer logic is intentionally preserved in the existing component. */
const {t}=useI18n(); const writerStore=useWriterStore(); const contactsTabRef=ref({}); const showContacts=ref(false); const mySelect=ref(); const selectStatus=ref(false); const defValue=ref(''); const editor=ref({}); const show=ref(false); const selectRecipientList=ref([])
const form=reactive({sendEmail:'',receiveEmail:[],accountId:-1,name:'',subject:'',content:'',sendType:'',text:'',emailId:0,attachments:[],draftId:null})
const contacts=computed(()=>writerStore.contactRecord||[])
function openContacts(){writerStore.loadContacts();showContacts.value=true;nextTick(()=>form.receiveEmail.forEach(item=>{const row=contacts.value.find(x=>x.email===String(item).trim().toLowerCase());if(row)contactsTabRef.value.toggleRowSelection(row,true)}))}
function deleteContact(){ElMessageBox.confirm(t('confirmDeletionOfContacts'),{confirmButtonText:t('confirm'),cancelButtonText:t('cancel'),type:'warning'}).then(()=>{const selected=contactsTabRef.value.getSelectionRows().map(x=>x.email);form.receiveEmail=form.receiveEmail.filter(x=>!selected.includes(x));writerStore.contactRecord=writerStore.contactRecord.filter(x=>!selected.includes(x.email))})}
function chooseContact(){const selected=contactsTabRef.value.getSelectionRows().map(x=>x.email);selected.forEach(x=>{if(!form.receiveEmail.includes(x))form.receiveEmail.push(x)});showContacts.value=false}
function clearSelectContact(){contactsTabRef.value?.clearSelection()}
function selectChange(value){if(value&&!form.receiveEmail.includes(value))form.receiveEmail.push(value)}
function selectStatusChange(status){selectStatus.value=status}
function inputChange(value){const v=String(value||'').toLowerCase();selectRecipientList.value=writerStore.sendRecipientRecord.filter(x=>!form.receiveEmail.includes(x)&&String(x).toLowerCase().startsWith(v)).slice(0,10)}
function addTagChange(val){const emails=Array.from(new Set(String(val).split(/[,，]/).map(x=>x.trim().toLowerCase()).filter(x=>x)));form.receiveEmail=form.receiveEmail.filter(Boolean);emails.forEach(x=>{if(isEmail(x)&&!form.receiveEmail.includes(x))form.receiveEmail.push(x)})}
</script>
