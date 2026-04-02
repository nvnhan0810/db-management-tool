<template>
  <div class="ssh-tab">
    <template v-if="form.type !== 'sqlite'">
      <el-form-item>
        <el-checkbox v-model="form.ssh!.enabled" :disabled="disabled">
          Enable SSH Tunnel
        </el-checkbox>
      </el-form-item>

      <el-form-item label="Host" prop="ssh.host">
        <el-input
          v-model="form.ssh!.host"
          placeholder="ssh.example.com"
          :disabled="disabled || !form.ssh?.enabled"
        />
      </el-form-item>

      <el-form-item label="Port" prop="ssh.port">
        <el-input-number
          v-model="form.ssh!.port"
          :min="1"
          :max="65535"
          style="width: 100%"
          :disabled="disabled || !form.ssh?.enabled"
        />
        <div class="field-hint">Default: 22</div>
      </el-form-item>

      <el-form-item label="Username" prop="ssh.username">
        <el-input
          v-model="form.ssh!.username"
          placeholder="Enter SSH username"
          :disabled="disabled || !form.ssh?.enabled"
        />
      </el-form-item>

      <el-form-item label="Authentication">
        <el-radio-group v-model="sshAuthMethod" :disabled="disabled || !form.ssh?.enabled">
          <el-radio label="password">Password</el-radio>
          <el-radio label="key">Private Key</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item v-if="sshAuthMethod === 'password'" label="SSH Password" prop="ssh.password">
        <el-input
          v-model="form.ssh!.password"
          type="password"
          placeholder="Enter SSH password"
          show-password
          :disabled="disabled || !form.ssh?.enabled"
        />
      </el-form-item>

      <template v-if="sshAuthMethod === 'key'">
        <el-form-item label="Private Key" prop="ssh.privateKey">
          <div class="private-key-picker">
            <el-input
              :model-value="selectedKeyPath || (form.ssh?.privateKey ? '••• Key loaded' : '')"
              placeholder="No file selected"
              readonly
              :disabled="disabled || !form.ssh?.enabled"
              class="key-path-input"
            />
            <el-button
              type="primary"
              :disabled="disabled || !form.ssh?.enabled"
              @click="handleSelectKeyFile"
            >
              <el-icon><FolderOpened /></el-icon>
              Select File
            </el-button>
            <el-button
              v-if="form.ssh!.privateKey"
              type="danger"
              plain
              :disabled="disabled || !form.ssh?.enabled"
              @click="handleClearKey"
            >
              Clear
            </el-button>
          </div>
        </el-form-item>

        <el-form-item label="Key Passphrase" prop="ssh.passphrase">
          <el-input
            v-model="form.ssh!.passphrase"
            type="password"
            placeholder="Enter passphrase if key is encrypted (optional)"
            show-password
            :disabled="disabled || !form.ssh?.enabled"
          />
        </el-form-item>
      </template>
    </template>
    <div v-else class="field-hint">SSH tunnel is not available for SQLite connections.</div>
  </div>
</template>

<script setup lang="ts">
import type { DatabaseConnection } from '@/domain/connection/types';
import { FolderOpened } from '@element-plus/icons-vue';
import { ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    form: DatabaseConnection & { name?: string };
    disabled?: boolean;
  }>(),
  { disabled: false }
);

const sshAuthMethod = defineModel<'password' | 'key'>('sshAuthMethod', { required: true });

const selectedKeyPath = ref('');

watch(
  () => sshAuthMethod.value,
  (val) => {
    if (val !== 'key') selectedKeyPath.value = '';
  }
);

const handleSelectKeyFile = async () => {
  const result = (await window.electron?.invoke('dialog:showOpenFile', {
    title: 'Select SSH Private Key',
  })) as { canceled?: boolean; content?: string; path?: string; error?: string };

  if (!result || result.canceled || !result.content) {
    if (result?.error) {
      console.error('Failed to load private key:', result.error);
    }
    return;
  }

  if (props.form.ssh) {
    props.form.ssh.privateKey = result.content;
    selectedKeyPath.value = result.path ?? 'Selected';
  }
};

const handleClearKey = () => {
  if (props.form.ssh) {
    props.form.ssh.privateKey = '';
    selectedKeyPath.value = '';
  }
};
</script>

<style scoped lang="scss">
.private-key-picker {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;

  .key-path-input {
    flex: 1;
  }
}

.field-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-top: 4px;
}
</style>
