<template>
  <div class="frameless-test">
    <div class="test-header">
      <h2>Frameless Window Test</h2>
      <p>This window has no default title bar. You can drag it using the custom title bar above.</p>
    </div>
    
    <div class="test-content">
      <el-card>
        <template #header>
          <div class="card-header">
            <span>Window Controls Test</span>
          </div>
        </template>
        
        <div class="test-buttons">
          <el-button @click="testMinimize">Test Minimize</el-button>
          <el-button @click="testMaximize">Test Maximize</el-button>
          <el-button @click="testClose" type="danger">Test Close</el-button>
        </div>
        
        <div class="test-info">
          <p><strong>Window State:</strong> {{ windowState }}</p>
          <p><strong>Platform:</strong> {{ platform }}</p>
          <p><strong>Is Frameless:</strong> {{ isFrameless }}</p>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

const windowState = ref('Unknown');
const platform = ref('Unknown');
const isFrameless = ref(true);

onMounted(() => {
  platform.value = navigator.platform;
  // You can add more window state detection here
});

const testMinimize = () => {
  if (window.electron) {
    window.electron.invoke('window:minimize', {});
  }
};

const testMaximize = () => {
  if (window.electron) {
    window.electron.invoke('window:maximize', {});
  }
};

const testClose = () => {
  if (window.electron) {
    window.electron.invoke('window:close', {});
  }
};
</script>

<style scoped>
.frameless-test {
  padding: 2rem;
  height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.test-header {
  text-align: center;
  margin-bottom: 2rem;
}

.test-header h2 {
  margin: 0 0 1rem 0;
  font-size: 2rem;
}

.test-content {
  max-width: 600px;
  margin: 0 auto;
}

.test-buttons {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
}

.test-info {
  background: rgba(255, 255, 255, 0.1);
  padding: 1rem;
  border-radius: 8px;
}

.test-info p {
  margin: 0.5rem 0;
}
</style>
