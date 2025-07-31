<template>
    <div id="home" class="p-4">
        <el-container>
            <el-header>
                <h1 class="text-center">Database Client</h1>
            </el-header>
            <el-main>
                <template v-if="!isConnected">
                    <ConnectionForm />
                </template>
                <template v-else>
                    <QueryEditor />
                </template>
            </el-main>
        </el-container>
    </div>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import ConnectionForm from '../components/ConnectionForm.vue';
import QueryEditor from '../components/QueryEditor.vue';
import { useDatabase } from '../composables/useDatabase';

const { isConnected } = useDatabase();

// Log initial value
console.log('isConnected initial:', isConnected.value);

// Watch for changes
watch(isConnected, (newValue, oldValue) => {
  console.log('isConnected changed:', { oldValue, newValue });
}, { immediate: false });
</script>

<style scoped lang="scss">
#home {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
</style>