<template>
    <div id="home">
        <el-container>
            <!-- Left Sidebar - Connection Tabs (only show when multiple connections) -->
            <el-aside v-if="activeConnections.length > 1" width="120px">
                <ConnectionTabs
                    :connections="activeConnections"
                    :current-tab-id="currentTabId"
                    :has-connections="hasConnections"
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
import { ElMessage } from 'element-plus'; // Added ElMessage import
import { onMounted, onUnmounted, ref } from 'vue';
import ConnectionForm from '../components/ConnectionForm.vue';
import ConnectionModal from '../components/ConnectionModal.vue';
import ConnectionTabs from '../components/ConnectionTabs.vue';
import QueryEditor from '../components/QueryEditor.vue';
import { useConnections } from '../composables/useConnections';
import { useDatabase } from '../composables/useDatabase';
import { useTableStore } from '../stores/tableStore';

const { 
    activeConnections, 
    currentTabId, 
    currentConnection,
    hasConnections, 
    addConnection,
    switchToConnection,
    removeConnection,
    clearAllConnections,
    markAppQuit,
    refreshConnectionStatus
} = useConnections();

const { disconnectAll, hasActiveConnections } = useDatabase();

// Use Pinia store
const tableStore = useTableStore();

const showConnectionModal = ref(false);
const activeTab = ref('home');
const queryEditorRef = ref();
const cleanupReloadPreventionRef = ref<(() => void) | null>(null);
const isDataReloading = ref(false); // Flag to track data reload

// State persistence - prevent reload when connections are active
const handleBeforeUnload = async (e: BeforeUnloadEvent) => {
  const hasConnections = await hasActiveConnections();
  const hasUIConnections = activeConnections.value.length > 0;
  
  if (hasConnections || hasUIConnections) {
    e.preventDefault();
    e.returnValue = 'You have active database connections. Are you sure you want to leave?';
    
    // Check if this is a reload attempt using a simpler method
    const isReload = window.performance?.navigation?.type === 1;
    
    if (isReload) {
      console.log('Reload attempt detected - preventing reload');
      // Show warning message
      ElMessage.warning('Cannot reload app while database connections are active. Please disconnect all connections first.');
      return e.returnValue;
    }
    
    // Only disconnect connections if this is a real app quit, not a data reload
    if (isDataReloading.value) {
      return e.returnValue;
    }
    
    // Disconnect all database connections for real app quit
    try {
      console.log('Disconnecting all database connections before app quit...');
      await disconnectAll();
      await clearAllConnections();
      markAppQuit(); // Mark app quit time
      console.log('All connections disconnected successfully');
    } catch (error) {
      console.error('Error disconnecting connections on quit:', error);
    }
    
    return e.returnValue;
  } else {
    // Even if no connections, mark app quit time
    markAppQuit();
  }
};

// Handle new connection
const handleNewConnection = () => {
    console.log('handleNewConnection called');
    // Open connection modal instead of creating empty connection
    showConnectionModal.value = true;
};

// Handle connection created
const handleConnectionCreated = async (connection: any, name: string) => {
    try {
        await addConnection(connection, name);
    } catch (error) {
        console.error('Failed to add connection:', error);
        ElMessage.error('Failed to establish database connection. Please try again.');
    }
};

// Handle tab switching
const handleSwitchTab = async (tabId: string) => {
    await switchToConnection(tabId);
    // Refresh connection status when switching tabs
    await refreshConnectionStatus();
};

// Handle tab closing
const handleCloseTab = async (tabId: string) => {
    await removeConnection(tabId);
};



// Handle app quit - disconnect all connections
const handleAppQuit = async () => {
    if (activeConnections.value.length > 0) {
        try {
            console.log('App is quitting, disconnecting all database connections...');
            await disconnectAll();
            await clearAllConnections();
            markAppQuit(); // Mark app quit time
            console.log('All connections disconnected successfully');
        } catch (error) {
            console.error('Error disconnecting connections on quit:', error);
        }
    }
};

// Global keyboard shortcuts - prevent Ctrl+N when no active connections
const handleGlobalKeydown = async (event: KeyboardEvent) => {
    // Prevent Ctrl+N/Cmd+N when no active connections (Home screen)
    if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
        if (activeConnections.value.length === 0) {
            event.preventDefault();
        }
    }
    
    // Handle Cmd+R (Mac) or Ctrl+R (Windows/Linux) for data reload
    if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
        const hasConnections = await hasActiveConnections();
        if (hasConnections || activeConnections.value.length > 0) {
            // Always prevent browser reload when we have connections
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            
            // Call QueryEditor reload method directly
            if (queryEditorRef.value && queryEditorRef.value.handleReloadData) {
                isDataReloading.value = true; // Set flag before reload
                try {
                    await queryEditorRef.value.handleReloadData();
                } catch (error) {
                    console.error('Error in handleReloadData:', error);
                } finally {
                    // Delay clearing the flag to prevent beforeunload from disconnecting
                    setTimeout(() => {
                        isDataReloading.value = false;
                    }, 100); // 100ms delay
                }
            } else {
                // Show warning if we can't reload data
                ElMessage.warning('Cannot reload data - QueryEditor not available');
            }
            return false;
        }
    }
    
    // Prevent F5 key when there are active connections
    if (event.key === 'F5') {
        const hasConnections = await hasActiveConnections();
        if (hasConnections || activeConnections.value.length > 0) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            console.log('F5 reload prevented - active connections detected');
            ElMessage.warning('Cannot reload app while database connections are active. Please disconnect all connections first.');
            return false;
        }
    }
};

// Listen for reload prevention messages from main process
const handleReloadPrevented = (message: string) => {
    console.log('Reload prevented by main process:', message);
    ElMessage.warning(message);
};

// Prevent reload using multiple methods
const setupReloadPrevention = () => {
    // Method 1: Prevent reload using beforeunload with stronger logic
    const preventReload = (event: BeforeUnloadEvent) => {
        if (activeConnections.value.length > 0) {
            event.preventDefault();
            event.returnValue = 'You have active database connections. Are you sure you want to leave?';
            console.log('Reload prevented via beforeunload');
            return event.returnValue;
        }
    };
    
    // Method 2: Prevent navigation using popstate
    const preventNavigation = (event: PopStateEvent) => {
        if (activeConnections.value.length > 0) {
            console.log('Navigation prevented via history API');
            ElMessage.warning('Cannot navigate while database connections are active');
            // Push current state back to prevent navigation
            window.history.pushState(null, '', window.location.href);
        }
    };
    
    // Method 3: Prevent reload using visibilitychange
    const preventVisibilityChange = () => {
        if (activeConnections.value.length > 0 && document.visibilityState === 'hidden') {
            console.log('Page visibility change prevented');
            ElMessage.warning('Cannot leave page while database connections are active');
        }
    };
    
    // Method 4: Prevent reload using pagehide
    const preventPageHide = (event: PageTransitionEvent) => {
        if (activeConnections.value.length > 0) {
            console.log('Page hide prevented');
            event.preventDefault();
            return false;
        }
    };
    
    // Method 5: Prevent reload using unload
    const preventUnload = (event: Event) => {
        if (activeConnections.value.length > 0) {
            console.log('Unload prevented');
            event.preventDefault();
            return false;
        }
    };
    
    // Add all event listeners
    window.addEventListener('beforeunload', preventReload, { capture: true });
    window.addEventListener('popstate', preventNavigation);
    document.addEventListener('visibilitychange', preventVisibilityChange);
    window.addEventListener('pagehide', preventPageHide);
    window.addEventListener('unload', preventUnload);
    
    // Return cleanup function
    return () => {
        window.removeEventListener('beforeunload', preventReload, { capture: true });
        window.removeEventListener('popstate', preventNavigation);
        document.removeEventListener('visibilitychange', preventVisibilityChange);
        window.removeEventListener('pagehide', preventPageHide);
        window.removeEventListener('unload', preventUnload);
    };
};

onMounted(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('keydown', handleGlobalKeydown, true); // Use capture phase
    
    // Setup reload prevention
    cleanupReloadPreventionRef.value = setupReloadPrevention();
    
    // Listen for reload prevention messages
    if (window.electron) {
        window.electron.on('reload-prevented', handleReloadPrevented);
    }
    
    // Additional CMD+R prevention at window level
    window.addEventListener('keydown', (event) => {
        // Prevent F5 at window level
        if (event.key === 'F5') {
            if (activeConnections.value.length > 0) {
                event.preventDefault();
                event.stopPropagation();
                return false;
            }
        }
    }, true); // Use capture phase
});

onUnmounted(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
    document.removeEventListener('keydown', handleGlobalKeydown, true);
    
    // Remove reload prevention listener
    if (window.electron) {
        window.electron.off('reload-prevented', handleReloadPrevented);
    }
    
    // Cleanup reload prevention
    if (cleanupReloadPreventionRef.value) {
        cleanupReloadPreventionRef.value();
    }
    
    console.log('Reload prevention cleanup completed');
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