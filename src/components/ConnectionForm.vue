<template>
  <div class="connection-form">
    <el-form :model="form" label-width="120px" @submit.prevent="handleSubmit">
      <el-form-item label="Database Type">
        <el-select v-model="form.type" placeholder="Select database type">
          <el-option label="MySQL" value="mysql" />
          <!-- <el-option label="PostgreSQL" value="postgresql" />
          <el-option label="SQLite" value="sqlite" /> -->
        </el-select>
      </el-form-item>

      <template v-if="form.type !== 'sqlite'">
        <el-form-item label="Host">
          <el-input v-model="form.host" placeholder="localhost" />
        </el-form-item>

        <el-form-item label="Port">
          <el-input-number v-model="form.port" :min="1" :max="65535" />
        </el-form-item>

        <el-form-item label="Username">
          <el-input v-model="form.username" />
        </el-form-item>

        <el-form-item label="Password">
          <el-input v-model="form.password" type="password" />
        </el-form-item>
      </template>

      <el-form-item label="Database">
        <el-input v-model="form.database" :placeholder="form.type === 'sqlite' ? 'Path to database file' : 'Database name'" />
      </el-form-item>

      <el-form-item>
        <el-button type="primary" native-type="submit" :loading="isConnecting">
          Connect
        </el-button>
      </el-form-item>
    </el-form>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useDatabase } from '../composables/useDatabase';
import type { DatabaseConnection } from '../types';

const { connect, error } = useDatabase();
const isConnecting = ref(false);


const form = reactive<DatabaseConnection>({
  id: crypto.randomUUID(),
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  username: '',
  password: '',
  database: '',
});


const handleSubmit = async () => {
  isConnecting.value = true;
  try {
    const success = await connect(form);
    if (success) {
      // Reset form or navigate to query editor
    }
  } finally {
    isConnecting.value = false;
  }
};
</script>

<style scoped>
.connection-form {
  max-width: 500px;
  margin: 0 auto;
  padding: 2rem;
}

.error-message {
  color: var(--el-color-danger);
  padding: 0.5rem;
  background-color: var(--el-color-danger-light-9);
  border-radius: 4px;
  margin-top: 1rem;
}
</style> 