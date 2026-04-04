<template>
  <el-dialog
    v-model="visible"
    title="Select Database"
    width="500px"
    :close-on-click-modal="false"
    @close="handleCancel"
  >
    <div v-if="isLoading" class="loading">
      <el-skeleton :rows="5" animated />
    </div>

    <div v-else-if="databases.length === 0" class="no-databases">
      <el-empty description="No databases available">
        <p class="empty-text">No databases found for this connection</p>
      </el-empty>
    </div>

    <div v-else class="databases-list">
      <div
        v-for="database in databases"
        :key="database.name"
        class="database-item"
        :class="{ active: selectedDatabase === database.name, connecting: isConnecting }"
        @click="handleSelectDatabase(database.name)"
        @dblclick.stop="connectToDatabase(database.name)"
        @contextmenu.prevent.stop="openCtxMenu($event, database.name)"
      >
        <el-icon class="database-icon">
          <Folder />
        </el-icon>
        <div class="database-info">
          <div class="database-name">{{ database.name }}</div>
        </div>
        <el-icon v-if="selectedDatabase === database.name" class="check-icon">
          <Check />
        </el-icon>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button size="small" @click="handleCancel">Cancel</el-button>
        <el-button
          size="small"
          type="primary"
          :loading="isCreating"
          :disabled="isLoading || !hasResolvedConnection"
          @click="handleNewDatabase"
        >
          New
        </el-button>
      </div>
    </template>
  </el-dialog>

  <teleport to="body">
    <div
      v-if="ctxMenuVisible"
      class="db-select-ctx-menu"
      :style="{ left: `${ctxMenuX}px`, top: `${ctxMenuY}px` }"
      @click.stop
    >
      <button type="button" class="db-select-ctx-item" @click="ctxConnect">Connect</button>
      <button type="button" class="db-select-ctx-item danger" @click="ctxDrop">Drop</button>
    </div>
  </teleport>

  <el-dialog
    v-model="createDbDialogVisible"
    title="New database"
    width="420px"
    append-to-body
    :close-on-click-modal="false"
    destroy-on-close
    @opened="onCreateDbDialogOpened"
  >
    <div v-loading="loadingCreateMeta" class="create-db-body">
      <div class="create-db-field">
        <label class="create-db-label" for="new-db-name-input">Name</label>
        <el-input id="new-db-name-input" v-model="newDbName" clearable placeholder="Name" />
      </div>
      <div class="create-db-field">
        <label class="create-db-label" for="new-db-charset-select">Character set</label>
        <el-select
          id="new-db-charset-select"
          v-model="newDbCharset"
          filterable
          placeholder="Character set"
          class="create-db-select"
          :disabled="isPostgresCreateDb"
          @change="onMysqlCharsetChanged"
        >
          <el-option v-for="c in charsetOptions" :key="c" :label="c" :value="c" />
        </el-select>
      </div>
      <div class="create-db-field">
        <label class="create-db-label" for="new-db-collation-select">Collation</label>
        <el-select
          id="new-db-collation-select"
          v-model="newDbCollation"
          filterable
          placeholder="Collation"
          class="create-db-select"
          :disabled="isPostgresCreateDb"
        >
          <el-option v-for="c in collationOptions" :key="c" :label="c" :value="c" />
        </el-select>
      </div>
    </div>
    <template #footer>
      <el-button size="small" @click="createDbDialogVisible = false">Cancel</el-button>
      <el-button size="small" type="primary" :loading="isCreating" :disabled="loadingCreateMeta" @click="submitCreateDatabase">
        Create
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { useDatabase } from '@/presentation/composables/useDatabase';
import { useConnectionStore } from '@/presentation/stores/connectionStore';
import { Check, Folder } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { showErrorDialog } from '@/presentation/utils/errorDialogs';
import { storeToRefs } from 'pinia';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

const RESERVED_DB_NAMES = new Set([
  'mysql',
  'information_schema',
  'performance_schema',
  'sys',
  'postgres',
  'template0',
  'template1',
]);

function pgQuoteIdentLocal(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function mysqlQuoteDbLocal(name: string): string {
  return `\`${name.replace(/`/g, '``')}\``;
}

function buildMysqlCreateDatabaseSql(name: string, charset: string, collation: string): string {
  const cs = charset.trim();
  const cl = collation.trim();
  if (!/^[a-zA-Z0-9_]+$/.test(cs) || !/^[a-zA-Z0-9_]+$/.test(cl)) {
    throw new Error('Invalid charset or collation');
  }
  return `CREATE DATABASE ${mysqlQuoteDbLocal(name)} CHARACTER SET ${cs} COLLATE ${cl}`;
}

function pickRowString(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

const props = defineProps<{
  modelValue: boolean;
  connectionId?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  selected: [databaseName: string];
  'database-dropped': [databaseName: string];
}>();

const { getDatabases, dropDatabase, executeQuery } = useDatabase();
const connectionStore = useConnectionStore();
const { currentConnection } = storeToRefs(connectionStore);
const { selectDatabase } = connectionStore;

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const databases = ref<Array<{ name: string; tableCount?: number }>>([]);
const selectedDatabase = ref<string>('');
const isLoading = ref(false);
const isConnecting = ref(false);
const isCreating = ref(false);

const createDbDialogVisible = ref(false);
const newDbName = ref('');
const newDbCharset = ref('');
const newDbCollation = ref('');
const charsetOptions = ref<string[]>([]);
const collationOptions = ref<string[]>([]);
const loadingCreateMeta = ref(false);
/** Skip MySQL collation reload when form is filled on dialog open */
const isSeedingCreateDbForm = ref(false);

const ctxMenuVisible = ref(false);
const ctxMenuX = ref(0);
const ctxMenuY = ref(0);
const ctxMenuDbName = ref('');

function resolveConnectionId(): string | null {
  const current = currentConnection?.value;
  const baseId = (current as { rootConnectionId?: string } | null | undefined)?.rootConnectionId || current?.id;
  const id = props.connectionId || baseId;
  return id ?? null;
}

const hasResolvedConnection = computed(() => resolveConnectionId() !== null);

const isPostgresCreateDb = computed(() => currentConnection.value?.type === 'postgresql');

function closeCtxMenu() {
  ctxMenuVisible.value = false;
  ctxMenuDbName.value = '';
}

function openCtxMenu(e: MouseEvent, name: string) {
  ctxMenuDbName.value = name;
  ctxMenuX.value = e.clientX;
  ctxMenuY.value = e.clientY;
  ctxMenuVisible.value = true;
  selectedDatabase.value = name;
}

function handleGlobalClick(e: MouseEvent) {
  if (!ctxMenuVisible.value) return;
  const node = e.target as Node | null;
  const el = node instanceof Element ? node : node?.parentElement ?? null;
  if (el?.closest('.db-select-ctx-menu')) return;
  closeCtxMenu();
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeCtxMenu();
}

onMounted(() => {
  document.addEventListener('click', handleGlobalClick, { capture: true });
  document.addEventListener('keydown', handleGlobalKeydown, { capture: true });
});

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick, { capture: true } as AddEventListenerOptions);
  document.removeEventListener('keydown', handleGlobalKeydown, { capture: true } as AddEventListenerOptions);
});

watch(visible, async (newValue) => {
  if (newValue) {
    closeCtxMenu();
    await loadDatabases();
    const current = currentConnection?.value;
    if (current?.database) {
      selectedDatabase.value = current.database;
    } else {
      selectedDatabase.value = '';
    }
  }
});

const loadDatabases = async () => {
  isLoading.value = true;
  try {
    const connectionId = resolveConnectionId();
    if (!connectionId) {
      await showErrorDialog({ title: 'Error', message: 'No connection available' });
      return;
    }

    const dbList = await getDatabases(connectionId);
    databases.value = dbList || [];
  } catch (error) {
    console.error('Failed to load databases:', error);
    await showErrorDialog({
      title: 'Load databases failed',
      message: error instanceof Error ? error.message : 'Failed to load databases',
      details: error instanceof Error ? error.stack : undefined,
    });
    databases.value = [];
  } finally {
    isLoading.value = false;
  }
};

const handleSelectDatabase = (databaseName: string) => {
  selectedDatabase.value = databaseName;
};

const connectToDatabase = async (databaseName: string) => {
  if (!databaseName || isConnecting.value) return;

  isConnecting.value = true;
  try {
    const success = await selectDatabase(databaseName);
    if (success) {
      emit('selected', databaseName);
      visible.value = false;
    } else {
      await showErrorDialog({ title: 'Connect failed', message: 'Failed to connect to database' });
    }
  } catch (error) {
    console.error('Failed to select database:', error);
    await showErrorDialog({
      title: 'Connect failed',
      message: error instanceof Error ? error.message : 'Failed to connect to database',
      details: error instanceof Error ? error.stack : undefined,
    });
  } finally {
    isConnecting.value = false;
  }
};

function ctxConnect() {
  const n = ctxMenuDbName.value;
  closeCtxMenu();
  if (n) void connectToDatabase(n);
}

async function ctxDrop() {
  const name = ctxMenuDbName.value;
  closeCtxMenu();
  if (!name) return;
  await confirmAndDropDatabase(name);
}

function handleNewDatabase() {
  if (!resolveConnectionId() || isLoading.value) return;
  newDbName.value = '';
  newDbCharset.value = '';
  newDbCollation.value = '';
  charsetOptions.value = [];
  collationOptions.value = [];
  createDbDialogVisible.value = true;
}

async function onCreateDbDialogOpened() {
  const connectionId = resolveConnectionId();
  if (!connectionId) return;

  const dbType = currentConnection.value?.type;
  if (dbType === 'postgresql') {
    isSeedingCreateDbForm.value = true;
    charsetOptions.value = ['Default'];
    collationOptions.value = ['Default'];
    newDbCharset.value = 'Default';
    newDbCollation.value = 'Default';
    await nextTick();
    isSeedingCreateDbForm.value = false;
    return;
  }

  isSeedingCreateDbForm.value = true;
  loadingCreateMeta.value = true;
  try {
    const r = await executeQuery(
      connectionId,
      `SELECT CHARACTER_SET_NAME AS n FROM information_schema.CHARACTER_SETS ORDER BY CHARACTER_SET_NAME`
    );
    const rows = (r?.data ?? []) as Record<string, unknown>[];
    charsetOptions.value = rows.map((row) => pickRowString(row, ['n'])).filter(Boolean);
    if (!charsetOptions.value.length) {
      charsetOptions.value = ['utf8mb4', 'utf8', 'latin1'];
    }
    newDbCharset.value = charsetOptions.value.includes('utf8mb4')
      ? 'utf8mb4'
      : (charsetOptions.value[0] ?? 'utf8mb4');
    await loadMysqlCollationsForCharset(connectionId, newDbCharset.value);
  } catch (error) {
    console.error(error);
    charsetOptions.value = ['utf8mb4', 'utf8', 'latin1'];
    newDbCharset.value = 'utf8mb4';
    collationOptions.value = ['utf8mb4_general_ci', 'utf8mb4_unicode_ci'];
    newDbCollation.value = collationOptions.value[0] ?? '';
  } finally {
    loadingCreateMeta.value = false;
    await nextTick();
    isSeedingCreateDbForm.value = false;
  }
}

async function loadMysqlCollationsForCharset(connectionId: string, charset: string) {
  const esc = charset.replace(/'/g, "''");
  const r = await executeQuery(
    connectionId,
    `SELECT COLLATION_NAME AS n FROM information_schema.COLLATIONS WHERE CHARACTER_SET_NAME = '${esc}' ORDER BY COLLATION_NAME`
  );
  const rows = (r?.data ?? []) as Record<string, unknown>[];
  collationOptions.value = rows.map((row) => pickRowString(row, ['n'])).filter(Boolean);
  if (!collationOptions.value.length) {
    collationOptions.value = [`${charset}_general_ci`];
  }
  newDbCollation.value = collationOptions.value[0] ?? '';
}

async function onMysqlCharsetChanged() {
  if (isSeedingCreateDbForm.value || currentConnection.value?.type === 'postgresql') return;
  const connectionId = resolveConnectionId();
  if (!connectionId) return;
  loadingCreateMeta.value = true;
  try {
    await loadMysqlCollationsForCharset(connectionId, newDbCharset.value);
  } catch (e) {
    console.error(e);
  } finally {
    loadingCreateMeta.value = false;
  }
}

function validateNewDbName(name: string, dbType: string | undefined): string | null {
  if (!name) return 'Enter a name';
  if (name.length > 63) return 'Max 63 characters';
  if (!/^[a-zA-Z0-9_]+$/.test(name)) return 'Invalid name';
  if (RESERVED_DB_NAMES.has(name.toLowerCase())) return 'Reserved name';
  const dup = databases.value.some((d) =>
    dbType === 'mysql' ? d.name.toLowerCase() === name.toLowerCase() : d.name === name
  );
  if (dup) return 'Already exists';
  return null;
}

async function submitCreateDatabase() {
  const connectionId = resolveConnectionId();
  if (!connectionId || isCreating.value) return;

  const dbType = currentConnection.value?.type;
  const name = newDbName.value.trim();
  const err = validateNewDbName(name, dbType);
  if (err) {
    ElMessage.warning(err);
    return;
  }

  let sql: string;
  if (dbType === 'postgresql') {
    sql = `CREATE DATABASE ${pgQuoteIdentLocal(name)}`;
  } else {
    const cs = newDbCharset.value.trim();
    const cl = newDbCollation.value.trim();
    if (!cs || !cl) {
      ElMessage.warning('Choose character set and collation');
      return;
    }
    if (!charsetOptions.value.includes(cs) || !collationOptions.value.includes(cl)) {
      ElMessage.warning('Invalid character set or collation');
      return;
    }
    sql = buildMysqlCreateDatabaseSql(name, cs, cl);
  }

  isCreating.value = true;
  try {
    await executeQuery(connectionId, sql);
    ElMessage.success(`Database "${name}" created`);
    createDbDialogVisible.value = false;
    await loadDatabases();
  } catch (error) {
    await showErrorDialog({
      title: 'Create database failed',
      message: error instanceof Error ? error.message : 'Failed to create database',
      details: error instanceof Error ? error.stack : undefined,
    });
  } finally {
    isCreating.value = false;
  }
}

async function confirmAndDropDatabase(name: string) {
  try {
    await ElMessageBox.prompt(
      `This will permanently delete database "${name}" and all its data. This cannot be undone.\n\nType the database name exactly to confirm.`,
      'Drop database',
      {
        confirmButtonText: 'Drop database',
        cancelButtonText: 'Cancel',
        inputPlaceholder: name,
        inputValidator: (v) => {
          if (v === name) return true;
          return 'Name does not match';
        },
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
        distinguishCancelAndClose: true,
      }
    );
  } catch {
    return;
  }

  const connectionId = resolveConnectionId();
  if (!connectionId) {
    await showErrorDialog({ title: 'Error', message: 'No connection available' });
    return;
  }

  const result = await dropDatabase(connectionId, name);
  if (!result.success) {
    await showErrorDialog({
      title: 'Drop database failed',
      message: result.error ?? 'Failed to drop database',
    });
    return;
  }

  ElMessage.success(`Database "${name}" dropped`);
  emit('database-dropped', name);

  if (selectedDatabase.value === name) {
    selectedDatabase.value = '';
  }

  await loadDatabases();
}

const handleCancel = () => {
  closeCtxMenu();
  selectedDatabase.value = '';
  visible.value = false;
};
</script>

<style scoped lang="scss">
.loading {
  padding: 20px;
}

.no-databases {
  padding: 40px 20px;
  text-align: center;

  .empty-text {
    margin-top: 12px;
    color: var(--el-text-color-regular);
    font-size: 14px;
  }
}

.databases-list {
  max-height: 400px;
  overflow-y: auto;
  padding: 8px 0;

  .database-item {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    margin-bottom: 4px;
    border-radius: 6px;
    cursor: pointer;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
    background-color: transparent;
    border: 1px solid transparent;

    &.connecting {
      pointer-events: none;
      opacity: 0.7;
    }

    &:hover {
      border-color: var(--el-color-primary);
      box-shadow: 0 0 0 1px var(--el-color-primary) inset;
      background-color: transparent;
    }

    &.active {
      background-color: var(--el-color-primary-light-9);
      border-color: var(--el-color-primary);

      .dark & {
        background-color: rgba(64, 158, 255, 0.2);
        border-color: rgba(64, 158, 255, 0.5);
      }
    }

    .database-icon {
      font-size: 20px;
      color: var(--el-color-primary);
      margin-right: 12px;
    }

    .database-info {
      flex: 1;
      min-width: 0;

      .database-name {
        font-size: 14px;
        font-weight: 600;
        color: var(--el-text-color-primary);
        margin-bottom: 4px;
      }

      .database-details {
        font-size: 12px;
        color: var(--el-text-color-regular);
      }
    }

    .check-icon {
      font-size: 18px;
      color: var(--el-color-primary);
      margin-left: 12px;
    }
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.create-db-body {
  min-height: 120px;
}

.create-db-field {
  margin-bottom: 14px;

  &:last-child {
    margin-bottom: 0;
  }
}

.create-db-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.create-db-select {
  width: 100%;
}
</style>

<style lang="scss">
.db-select-ctx-menu {
  position: fixed;
  z-index: 10000;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 6px;
  min-width: 140px;
  box-shadow: var(--el-box-shadow-light);
}

.db-select-ctx-item {
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--el-text-color-primary);
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.db-select-ctx-item:hover {
  background: rgba(64, 158, 255, 0.12);
}

.db-select-ctx-item.danger:hover {
  background: rgba(245, 108, 108, 0.12);
}
</style>
