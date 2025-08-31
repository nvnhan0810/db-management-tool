<template>
    <div id="home">
        <!-- Custom Title Bar -->
        <CustomTitleBar 
            :current-connection="currentConnection || null"
            :active-tab="activeTab"
            @tab-change="handleTabChange"
            @add-query="handleAddQuery"
            @new-connection="handleNewConnection"
            @disconnect="handleDisconnect"
        />
        
        <el-container>
            <!-- Left Sidebar - Connection Tabs (only show when multiple connections) -->
            <el-aside v-if="activeConnections.length > 1" width="200px">
                <ConnectionTabs
                    :connections="activeConnections"
                    :current-tab-id="currentTabId"
                    :has-connections="hasConnections"
                    :sorted-connections="sortedConnections"
                    @new-connection="handleNewConnection"
                    @switch-tab="handleSwitchTab"
                    @close-tab="handleCloseTab"
                />
            </el-aside>
            
            <!-- Main Content -->
            <el-main>
                <template v-if="activeConnections.length === 0">
                    <ConnectionForm @connection-created="handleConnectionCreated" />
                </template>
                <template v-else>
                    <!-- Show QueryEditor for active connections -->
                    <QueryEditor 
                        ref="queryEditorRef"
                        :key="currentTabId || 'default'"
                        :connection="currentConnection || null"
                        @new-connection="showConnectionModal = true"
                    />
                </template>
            </el-main>
        </el-container>
        
        <!-- Connection Modal -->
        <ConnectionModal
            v-model="showConnectionModal"
            @connection-created="handleConnectionCreated"
        />
    </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import ConnectionForm from '../components/ConnectionForm.vue';
import ConnectionModal from '../components/ConnectionModal.vue';
import ConnectionTabs from '../components/ConnectionTabs.vue';
import CustomTitleBar from '../components/CustomTitleBar.vue';
import QueryEditor from '../components/QueryEditor.vue';
import { useConnections } from '../composables/useConnections';
import { useDatabase } from '../composables/useDatabase';

const { 
    activeConnections, 
    currentTabId, 
    currentConnection,
    hasConnections, 
    sortedConnections,
    addConnection,
    switchToConnection,
    removeConnection,
    clearAllConnections
} = useConnections();

const { disconnectAll } = useDatabase();

const showConnectionModal = ref(false);
const activeTab = ref('home');
const queryEditorRef = ref();

// State persistence - prevent reload when connections are active
const handleBeforeUnload = async (e: BeforeUnloadEvent) => {
  if (activeConnections.value.length > 0) {
    e.preventDefault();
    e.returnValue = 'You have active database connections. Are you sure you want to leave?';
    
    // Disconnect all database connections
    try {
      console.log('Disconnecting all database connections before app quit...');
      await disconnectAll();
      await clearAllConnections();
      console.log('All connections disconnected successfully');
    } catch (error) {
      console.error('Error disconnecting connections on quit:', error);
    }
    
    return e.returnValue;
  }
};

// Handle new connection
const handleNewConnection = () => {
    console.log('handleNewConnection called');
    // Open connection modal instead of creating empty connection
    showConnectionModal.value = true;
};

// Handle connection created
const handleConnectionCreated = (connection: any, name: string) => {
    addConnection(connection, name);
};

// Handle tab switching
const handleSwitchTab = (tabId: string) => {
    switchToConnection(tabId);
};

// Handle tab closing
const handleCloseTab = async (tabId: string) => {
    await removeConnection(tabId);
};

// Handle tab change
const handleTabChange = (tabId: string) => {
    activeTab.value = tabId;
};

// Handle add query
const handleAddQuery = () => {
    // Forward to QueryEditor if connected
    if (currentConnection.value && queryEditorRef.value) {
        // Call QueryEditor's addQueryTab method
        queryEditorRef.value.addQueryTab();
    } else {
        // If not connected, show connection modal
        showConnectionModal.value = true;
    }
};

// Handle disconnect
const handleDisconnect = async () => {
    // Remove current connection
    if (currentTabId.value) {
        await removeConnection(currentTabId.value);
    }
};

// Handle app quit - disconnect all connections
const handleAppQuit = async () => {
    if (activeConnections.value.length > 0) {
        try {
            console.log('App is quitting, disconnecting all database connections...');
            await disconnectAll();
            await clearAllConnections();
            console.log('All connections disconnected successfully');
        } catch (error) {
            console.error('Error disconnecting connections on quit:', error);
        }
    }
};

// Global keyboard shortcuts - prevent Ctrl+N when no active connections
const handleGlobalKeydown = (event: KeyboardEvent) => {
    // Prevent Ctrl+N/Cmd+N when no active connections (Home screen)
    if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
        if (activeConnections.value.length === 0) {
            event.preventDefault();
            console.log('Ctrl+N prevented on Home screen - no active connections');
        }
    }
};

onMounted(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
    document.removeEventListener('keydown', handleGlobalKeydown);
});
</script>

<style scoped lang="scss">
#home {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--el-bg-color);
}

.el-container {
  flex: 1;
}

.el-aside {
  background-color: var(--el-bg-color-page);
  border-right: 1px solid var(--el-border-color);
}

.el-main {
  padding: 0;
  overflow: hidden;
}
</style>