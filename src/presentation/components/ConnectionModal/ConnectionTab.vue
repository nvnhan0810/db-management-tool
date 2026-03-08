<template>
  <div class="connection-tab">
    <el-form-item label="Connection Name" prop="name">
      <el-input
        v-model="form.name"
        placeholder="Enter connection name (required for save)"
        :class="{ 'is-error': nameError }"
        :disabled="disabled"
      />
      <div v-if="nameError" class="field-error">{{ nameError }}</div>
      <div v-else class="field-hint">Required for Save, optional for Connect</div>
    </el-form-item>

    <el-form-item label="Database Type" prop="type">
      <el-select v-model="form.type" placeholder="Select database type" style="width: 100%" :disabled="disabled">
        <el-option label="MySQL" value="mysql" />
        <el-option label="PostgreSQL" value="postgresql" />
        <el-option label="SQLite" value="sqlite" />
      </el-select>
    </el-form-item>

    <template v-if="form.type !== 'sqlite'">
      <el-form-item label="Host" prop="host">
        <el-input v-model="form.host" placeholder="localhost" :disabled="disabled" />
      </el-form-item>

      <el-form-item label="Port" prop="port">
        <el-input-number
          v-model="form.port"
          :min="1"
          :max="65535"
          style="width: 100%"
          :disabled="disabled"
        />
      </el-form-item>

      <el-form-item label="Username" prop="username">
        <el-input v-model="form.username" placeholder="Enter username" :disabled="disabled" />
      </el-form-item>

      <el-form-item label="Password" prop="password">
        <el-input
          v-model="form.password"
          type="password"
          placeholder="Enter password"
          show-password
          :disabled="disabled"
        />
      </el-form-item>
    </template>

    <el-form-item label="Database" prop="database">
      <el-input
        v-model="form.database"
        :placeholder="databasePlaceholder"
        :disabled="disabled"
      />
      <div class="field-hint">{{ databaseHint }}</div>
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import type { DatabaseConnection } from '@/domain/connection/types';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    form: DatabaseConnection & { name?: string };
    nameError: string;
    disabled?: boolean;
  }>(),
  { disabled: false }
);

const databasePlaceholder = computed(() => {
  if (props.form.type === 'sqlite') return 'Path to database file';
  if (props.form.type === 'postgresql') return 'Database name (optional, default: postgres)';
  return 'Database name (optional)';
});

const databaseHint = computed(() => {
  if (props.form.type === 'postgresql') {
    return 'Leave empty to use default database "postgres"';
  }
  return 'Leave empty to connect without selecting a database';
});
</script>

<style scoped lang="scss">
.field-error {
  color: var(--el-color-danger);
  font-size: 12px;
  margin-top: 4px;
}

.field-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-top: 4px;
}

:deep(.is-error) {
  .el-input__wrapper {
    box-shadow: 0 0 0 1px var(--el-color-danger) inset;
  }
}
</style>
