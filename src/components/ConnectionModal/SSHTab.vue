<template>
  <div class="ssh-tab">
    <template v-if="form.type !== 'sqlite'">
      <el-form-item>
        <el-checkbox v-model="form.ssh!.enabled" :disabled="disabled">
          Enable SSH Tunnel
        </el-checkbox>
      </el-form-item>

      <el-form-item label="SSH Host" prop="ssh.host">
        <el-input
          v-model="form.ssh!.host"
          placeholder="ssh.example.com"
          :disabled="disabled || !form.ssh?.enabled"
        />
      </el-form-item>

      <el-form-item label="SSH Port" prop="ssh.port">
        <el-input-number
          v-model="form.ssh!.port"
          :min="1"
          :max="65535"
          style="width: 100%"
          :disabled="disabled || !form.ssh?.enabled"
        />
        <div class="field-hint">Default: 22</div>
      </el-form-item>

      <el-form-item label="SSH Username" prop="ssh.username">
        <el-input
          v-model="form.ssh!.username"
          placeholder="Enter SSH username"
          :disabled="disabled || !form.ssh?.enabled"
        />
      </el-form-item>

      <el-form-item label="SSH Authentication">
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
        <el-form-item label="SSH Private Key" prop="ssh.privateKey">
          <el-input
            v-model="form.ssh!.privateKey"
            type="textarea"
            :rows="4"
            placeholder="Paste your SSH private key here (OpenSSH format)"
            :disabled="disabled || !form.ssh?.enabled"
          />
          <div class="field-hint">Paste your private key content (starting with -----BEGIN...)</div>
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
import type { DatabaseConnection } from '@/types/connection';

withDefaults(
  defineProps<{
    form: DatabaseConnection & { name?: string };
    disabled?: boolean;
  }>(),
  { disabled: false }
);

const sshAuthMethod = defineModel<'password' | 'key'>('sshAuthMethod', { required: true });
</script>

<style scoped lang="scss">
.field-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-top: 4px;
}
</style>
