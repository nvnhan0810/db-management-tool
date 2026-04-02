<template>
  <el-dialog
    :model-value="modelValue"
    title="Enter credentials"
    width="480px"
    :close-on-click-modal="false"
    append-to-body
    destroy-on-close
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @closed="onDialogClosed"
  >
    <p v-if="saved" class="hint">
      <strong>{{ saved.name }}</strong>
      <span v-if="saved.ssh?.enabled"> — SSH {{ saved.ssh.host }}:{{ saved.ssh.port }}</span>
    </p>
    <p v-if="flags?.needDbPassword" class="subhint">Database password is missing from saved secrets.</p>
    <p v-if="flags?.needSshAuth" class="subhint">SSH authentication is missing (password or private key).</p>

    <el-form label-position="top" class="cred-form">
      <el-form-item v-if="flags?.needDbPassword" label="Database password">
        <el-input
          v-model="dbPassword"
          type="password"
          show-password
          placeholder="Database password"
          autocomplete="off"
        />
      </el-form-item>

      <template v-if="flags?.needSshAuth">
        <el-form-item label="SSH password">
          <el-input
            v-model="sshPassword"
            type="password"
            show-password
            placeholder="SSH login password (if using password auth)"
            autocomplete="off"
          />
        </el-form-item>
        <div class="or-divider">or</div>
        <el-form-item label="SSH private key">
          <div class="private-key-picker">
            <el-input
              :model-value="selectedKeyPath || (sshPrivateKey ? '••• Key loaded' : '')"
              placeholder="No file selected"
              readonly
              class="key-path-input"
            />
            <el-button size="small" type="primary" @click="handleSelectKeyFile">
              <el-icon><FolderOpened /></el-icon>
              Select file
            </el-button>
            <el-button v-if="sshPrivateKey" size="small" type="danger" plain @click="handleClearKey">Clear</el-button>
          </div>
          <div class="field-hint">PEM / OpenSSH — including files with no extension.</div>
        </el-form-item>
        <el-form-item label="Key passphrase (optional)">
          <el-input
            v-model="sshPassphrase"
            type="password"
            show-password
            placeholder="Only if the key is encrypted"
            autocomplete="off"
          />
        </el-form-item>
      </template>
    </el-form>

    <template #footer>
      <el-button size="small" @click="cancel">Cancel</el-button>
      <el-button size="small" type="primary" :disabled="!canSubmit" @click="submit">Connect</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { DatabaseConnection } from '@/domain/connection/types';
import type { MissingCredentialFlags } from '@/domain/connection/missingCredentials';
import type { SavedConnection } from '@/infrastructure/storage/storageService';
import { showErrorDialog } from '@/presentation/utils/errorDialogs';
import { FolderOpened } from '@element-plus/icons-vue';
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  modelValue: boolean;
  saved: SavedConnection | null;
  decrypted: (DatabaseConnection & { name?: string }) | null;
  flags: MissingCredentialFlags | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [connection: DatabaseConnection];
  cancel: [];
}>();

const dbPassword = ref('');
const sshPassword = ref('');
const sshPrivateKey = ref('');
const selectedKeyPath = ref('');
const sshPassphrase = ref('');
const closedByConfirm = ref(false);

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      dbPassword.value = '';
      sshPassword.value = '';
      sshPrivateKey.value = '';
      selectedKeyPath.value = '';
      sshPassphrase.value = '';
    }
  }
);

async function handleSelectKeyFile() {
  const result = (await window.electron?.invoke('dialog:showOpenFile', {
    title: 'Select SSH private key',
  })) as { canceled?: boolean; content?: string; path?: string; error?: string } | undefined;

  if (!result || result.canceled || !result.content) {
    if (result?.error) {
      await showErrorDialog({ title: 'Could not read key file', message: result.error });
    }
    return;
  }

  sshPrivateKey.value = result.content;
  selectedKeyPath.value = result.path ?? 'Selected';
}

function handleClearKey() {
  sshPrivateKey.value = '';
  selectedKeyPath.value = '';
}

const canSubmit = computed(() => {
  const f = props.flags;
  if (!f) return false;
  if (f.needSshAuth) {
    const hasPwd = sshPassword.value.trim().length > 0;
    const hasKey = sshPrivateKey.value.trim().length > 0;
    if (!hasPwd && !hasKey) return false;
  }
  return true;
});

function stripName(c: DatabaseConnection & { name?: string }): DatabaseConnection {
  const { name: _n, ...rest } = c;
  return rest as DatabaseConnection;
}

function buildMerged(): DatabaseConnection | null {
  const d = props.decrypted;
  const s = props.saved;
  const f = props.flags;
  if (!d || !s || !f) return null;

  const password = f.needDbPassword ? dbPassword.value : d.password;

  if (!s.ssh?.enabled) {
    return stripName({ ...d, password });
  }

  if (f.needSshAuth) {
    const key = sshPrivateKey.value.trim();
    const pwd = sshPassword.value.trim();
    if (!key && !pwd) return null;
    if (key) {
      return stripName({
        ...d,
        password,
        ssh: {
          enabled: true,
          host: s.ssh.host,
          port: s.ssh.port || 22,
          username: s.ssh.username,
          privateKey: key,
          passphrase: sshPassphrase.value.trim() || undefined,
        },
      });
    }
    return stripName({
      ...d,
      password,
      ssh: {
        enabled: true,
        host: s.ssh.host,
        port: s.ssh.port || 22,
        username: s.ssh.username,
        password: pwd,
      },
    });
  }

  return stripName({
    ...d,
    password,
    ssh: d.ssh ? { ...d.ssh } : undefined,
  });
}

function submit() {
  const merged = buildMerged();
  if (!merged) return;
  closedByConfirm.value = true;
  emit('confirm', merged);
  emit('update:modelValue', false);
}

function cancel() {
  emit('update:modelValue', false);
}

function onDialogClosed() {
  if (!closedByConfirm.value) {
    emit('cancel');
  }
  closedByConfirm.value = false;
}
</script>

<style scoped>
.hint {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.subhint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.cred-form {
  margin-top: 8px;
}

.or-divider {
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 4px 0 12px;
}

.private-key-picker {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.key-path-input {
  flex: 1;
}

.field-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
