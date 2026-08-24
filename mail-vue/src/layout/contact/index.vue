<template>
  <div class="contact-page">
    <div class="toolbar">
      <el-input v-model="keyword" clearable placeholder="搜索姓名或邮箱" @keyup.enter="load" @clear="load" />
      <el-button type="primary" @click="openCreate">新增联系人</el-button>
    </div>
    <el-table :data="list" stripe @row-click="openHistory">
      <el-table-column prop="name" label="姓名" min-width="180" />
      <el-table-column prop="email" label="邮箱" min-width="280" />
      <el-table-column label="操作" width="160">
        <template #default="scope">
          <el-button link @click.stop="openEdit(scope.row)">编辑</el-button>
          <el-button link type="danger" @click.stop="remove(scope.row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑联系人' : '新增联系人'" width="420px">
      <el-form :model="form" label-width="70px">
        <el-form-item label="姓名"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="邮箱"><el-input v-model="form.email" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="historyVisible" :title="historyTitle" size="70%">
      <el-table :data="history" stripe>
        <el-table-column prop="subject" label="主题" min-width="280" show-overflow-tooltip />
        <el-table-column prop="sendEmail" label="发件人" min-width="220" show-overflow-tooltip />
        <el-table-column prop="createTime" label="时间" width="190" />
      </el-table>
      <el-empty v-if="!history.length" description="暂无邮件往来" />
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { contactList, contactCreate, contactUpdate, contactDelete, contactEmails } from '@/request/contact';

const keyword = ref('');
const list = ref([]);
const dialogVisible = ref(false);
const editing = ref(false);
const form = ref({ contactId: null, name: '', email: '' });
const historyVisible = ref(false);
const history = ref([]);
const historyTitle = ref('邮件往来');

async function load() {
  const result = await contactList({ keyword: keyword.value, size: 100, page: 1 });
  list.value = result?.list || [];
}

function openCreate() {
  editing.value = false;
  form.value = { contactId: null, name: '', email: '' };
  dialogVisible.value = true;
}

function openEdit(row) {
  editing.value = true;
  form.value = { contactId: row.contactId, name: row.name, email: row.email };
  dialogVisible.value = true;
}

async function save() {
  try {
    const data = { ...form.value, name: String(form.value.name || '').trim(), email: String(form.value.email || '').trim().toLowerCase() };
    if (!data.name || !data.email) return ElMessage.warning('姓名和邮箱不能为空');
    if (editing.value) await contactUpdate(data); else await contactCreate(data);
    dialogVisible.value = false;
    await load();
    ElMessage.success('保存成功');
  } catch (e) { ElMessage.error(e?.message || '保存失败'); }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除联系人“${row.name}”？`, '提示', { type: 'warning' });
    await contactDelete(row.contactId);
    await load();
    ElMessage.success('删除成功');
  } catch (e) { if (e !== 'cancel') ElMessage.error(e?.message || '删除失败'); }
}

async function openHistory(row) {
  try {
    const result = await contactEmails({ contactId: row.contactId, size: 100, page: 1 });
    history.value = result?.list || [];
    historyTitle.value = `${row.name} — 邮件往来`;
    historyVisible.value = true;
  } catch (e) { ElMessage.error(e?.message || '读取邮件失败'); }
}

onMounted(load);
</script>

<style scoped>
.contact-page { padding: 20px; }
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; }
.toolbar .el-input { max-width: 360px; }
</style>
