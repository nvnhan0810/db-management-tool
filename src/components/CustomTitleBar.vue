<template>
    <div class="custom-title-bar" :class="{ macos: isMacOS }">
        <!-- Left side - Navigation tabs -->
        <div class="title-bar-left" v-if="currentConnection">
            <div class="nav-tabs">
                <el-tooltip content="New Connection" placement="bottom">
                    <div class="nav-tab" @click="$emit('new-connection')">
                        <el-icon>
                            <Link />
                        </el-icon>
                    </div>
                </el-tooltip>

                <el-tooltip content="Disconnect" placement="bottom">
                    <div class="nav-tab" @click="$emit('disconnect')">
                        <el-icon>
                            <SwitchButton />
                        </el-icon>
                    </div>
                </el-tooltip>

                <!-- Divider -->
                <div class="nav-divider"></div>

                <!-- Action buttons -->
                <el-tooltip content="New Query" placement="bottom">
                    <div class="nav-tab" @click="$emit('add-query')">
                        <el-icon>
                            <Edit />
                        </el-icon>
                    </div>
                </el-tooltip>
            </div>
        </div>

        <!-- Center - App title -->
        <div class="title-bar-center">
            <div class="app-title">
                <div class="app-icon">
                    <el-icon>
                        <Monitor />
                    </el-icon>
                </div>
                <div class="app-info">
                    <span v-if="currentConnection" class="connection-info">{{ currentConnection.name ||
                        currentConnection.host }}</span>
                    <span v-else class="app-name">Database Client</span>
                    <!-- <span v-if="currentConnection" class="connection-info">
            {{ currentConnection.name || currentConnection.host }}
          </span> -->
                </div>
            </div>
        </div>

        <!-- Right side - Window controls and theme toggle -->
        <div class="title-bar-right">
            <!-- Theme toggle button (always visible) -->
            <el-button size="small" class="control-btn theme-toggle" @click="handleThemeToggle">
                <el-icon>
                    <component :is="isDarkMode ? 'Sunny' : 'Moon'" />
                </el-icon>
            </el-button>
            
            <!-- Window controls (hidden on macOS) -->
            <div v-if="!isMacOS" class="window-controls">
                <el-button size="small" class="control-btn minimize" @click="minimizeWindow">
                    <el-icon>
                        <Minus />
                    </el-icon>
                </el-button>
                <el-button size="small" class="control-btn maximize" @click="maximizeWindow">
                    <el-icon>
                        <FullScreen />
                    </el-icon>
                </el-button>
                <el-button size="small" class="control-btn close" @click="closeWindow">
                    <el-icon>
                        <Close />
                    </el-icon>
                </el-button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import {
    Close,
    Edit,
    FullScreen,
    Link,
    Minus,
    Monitor,
    SwitchButton
} from '@element-plus/icons-vue';
import { onMounted, ref } from 'vue';
import type { ActiveConnection } from '../composables/useConnections';
import { useTheme } from '../composables/useTheme';



const props = defineProps<{
    currentConnection: ActiveConnection | null;
    activeTab?: string;
}>();

const emit = defineEmits<{
    'tab-change': [tabId: string];
    'add-query': [];
    'new-connection': [];
    'disconnect': [];
}>();

// Platform detection
const isMacOS = ref(false);

// Use global theme composable
const { isDarkMode, toggleTheme } = useTheme();

onMounted(() => {
    isMacOS.value = navigator.platform.toLowerCase().includes('mac');
});

const handleThemeToggle = () => {
    console.log('Theme toggle clicked!');
    toggleTheme();
};



// Window control methods
const minimizeWindow = () => {
    if (window.electron) {
        window.electron.invoke('window:minimize', {});
    }
};

const maximizeWindow = () => {
    if (window.electron) {
        window.electron.invoke('window:maximize', {});
    }
};

const closeWindow = () => {
    if (window.electron) {
        window.electron.invoke('window:close', {});
    }
};
</script>

<style scoped>
.custom-title-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 2rem;
    min-height: 2rem;
    max-height: 2rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 0 16px;
    -webkit-app-region: drag;
    /* Makes the title bar draggable */
    user-select: none;
    position: sticky;
    top: 0;
    z-index: 1000;
    box-sizing: border-box;
    flex-shrink: 0;
}

/* Add padding for macOS to avoid window controls */
.custom-title-bar.macos {
    padding-left: 80px;
    /* Space for macOS window controls */
}

.title-bar-left {
    display: flex;
    align-items: center;
    flex: 1;
    justify-content: flex-start;
}

.title-bar-center {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
}

.app-title {
    display: flex;
    align-items: center;
    gap: 8px;
    -webkit-app-region: drag;
    /* Make title area draggable */
}

.app-icon {
    display: flex;
    align-items: center;
    font-size: 16px;
}

.app-info {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
}

.app-name {
    font-weight: 600;
    font-size: 14px;
}

.connection-info {
    font-size: 11px;
    opacity: 0.8;
}

.nav-tabs {
    display: flex;
    gap: 8px;
    align-items: center;
    -webkit-app-region: no-drag;
    /* Prevents dragging on navigation */
}

.nav-divider {
    width: 1px;
    height: 20px;
    background-color: rgba(255, 255, 255, 0.3);
    margin: 0 4px;
}

.nav-tab {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    -webkit-app-region: no-drag;
    /* Prevents dragging on interactive elements */
}

.nav-tab:hover {
    background-color: rgba(255, 255, 255, 0.1);
}

.nav-tab.active {
    background-color: rgba(255, 255, 255, 0.2);
    font-weight: 500;
}

.title-bar-right {
    display: flex;
    align-items: center;
    flex: 1;
    justify-content: flex-end;
    gap: 8px;
}

.window-controls {
    display: flex;
    gap: 4px;
    -webkit-app-region: no-drag;
}

.control-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s ease;
}

.control-btn:hover {
    background-color: rgba(255, 255, 255, 0.1);
}

.control-btn.close:hover {
    background-color: #e53e3e;
}

.control-btn.theme-toggle {
    -webkit-app-region: no-drag;
    cursor: pointer;
}

.control-btn.theme-toggle:hover {
    background-color: rgba(255, 255, 255, 0.1);
}

/* Dark theme support */
.dark .custom-title-bar {
    background: linear-gradient(135deg, #1a202c 0%, #2d3748 100%);
}

.dark .nav-tab:hover {
    background-color: rgba(255, 255, 255, 0.05);
}

.dark .nav-tab.active {
    background-color: rgba(255, 255, 255, 0.1);
}
</style>
