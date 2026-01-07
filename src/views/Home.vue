<template>
  <div id="home">
    <el-container>
      <header>
        <h1>Saved Connections</h1>
        <el-button type="primary" @click="handleNewConnection">
          <Plus />New
        </el-button>
      </header>

      <el-main>
        <!-- Loading State -->
        <div v-if="isLoading" class="loading-container">
          <el-skeleton :rows="3" animated />
        </div>

        <!-- Empty State -->
        <div v-else-if="!hasConnections" class="empty-state">
          <el-empty description="No saved connections">
            <el-button type="primary" @click="handleNewConnection">
              Create New Connection
            </el-button>
          </el-empty>
        </div>

        <!-- Connections Grid -->
        <div v-else class="connections-grid">
          <el-card
            v-for="connection in savedConnections"
            :key="connection.id"
            class="connection-card"
            shadow="hover"
            @click="handleLoadConnection(connection)"
          >
            <template #header>
              <div class="card-header">
                <div class="connection-name">
                  <el-icon class="connection-icon"><Connection /></el-icon>
                  <span>{{ connection.name }}</span>
                </div>
                <el-dropdown
                  trigger="click"
                  @command="(cmd: string) => handleCommand(cmd, connection)"
                  popper-class="connection-dropdown-menu"
                >
                  <el-button
                    circle
                    size="small"
                    class="connection-action-btn"
                    @click.stop
                  >
                    <el-icon><MoreFilled /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="edit" class="dropdown-item-edit">
                        <el-icon class="dropdown-icon"><Edit /></el-icon>
                        <span>Edit</span>
                      </el-dropdown-item>
                      <el-dropdown-item command="delete" divided class="dropdown-item-delete">
                        <el-icon class="dropdown-icon"><Delete /></el-icon>
                        <span>Delete</span>
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </template>

            <div class="connection-details">
              <div class="detail-item">
                <span class="label">Type:</span>
                <el-tag size="small">{{ connection.type }}</el-tag>
              </div>
              <div class="detail-item">
                <span class="label">Host:</span>
                <span class="value">{{ connection.host }}:{{ connection.port }}</span>
              </div>
              <div v-if="connection.database" class="detail-item">
                <span class="label">Database:</span>
                <span class="value">{{ connection.database }}</span>
              </div>
              <div v-if="connection.lastUsed" class="detail-item">
                <span class="label">Last Used:</span>
                <span class="value">{{ formatDate(connection.lastUsed) }}</span>
              </div>
            </div>
          </el-card>
        </div>
      </el-main>
    </el-container>

    <!-- Connection Modal -->
    <ConnectionModal
      v-model="showConnectionModal"
      :connection-to-edit="connectionToEdit"
      @saved="handleConnectionSaved"
      @connected="handleConnectionConnected"
    />
  </div>
</template>

<script setup lang="ts">
import type { SavedConnection } from '@/services/storage';
import { useConnectionStore } from '@/stores/connectionStore';
import { Connection, Delete, Edit, MoreFilled, Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import ConnectionModal from '../components/ConnectionModal.vue';
import { useDatabase } from '../composables/useDatabase';

const router = useRouter();
const connectionStore = useConnectionStore();
const { connect } = useDatabase();

// Use store state and actions
const savedConnections = computed(() => connectionStore.connections);
const isLoading = computed(() => connectionStore.isLoading);
const hasConnections = computed(() => connectionStore.hasConnections);
const {
  deleteConnection,
  getDecryptedConnection,
  updateLastUsed,
  loadSavedConnections
} = connectionStore;

// Modal state
const showConnectionModal = ref(false);
const connectionToEdit = ref<SavedConnection | null>(null);

// Handle new connection
const handleNewConnection = () => {
  connectionToEdit.value = null;
  showConnectionModal.value = true;
};

// Handle connection saved
const handleConnectionSaved = () => {
  // Reload saved connections to show the new one at the top
  loadSavedConnections();
  connectionToEdit.value = null;
};

// Handle connection connected
const handleConnectionConnected = () => {
  // Connection will navigate to workspace automatically
  // Just reload connections in case it was auto-saved
  loadSavedConnections();
};

// Handle load connection
const handleLoadConnection = async (connection: SavedConnection) => {
  try {
    const loadingMessage = ElMessage({
      message: 'Connecting...',
      type: 'info',
      duration: 0,
    });

    // Get decrypted connection
    const decryptedConnection = await getDecryptedConnection(connection);

    // Connect to database
    const success = await connect(decryptedConnection);

    if (success) {
      // Update last used timestamp
      await updateLastUsed(connection.id);

      // Set as active connection in store
      connectionStore.setActiveConnection({
        ...decryptedConnection,
        name: connection.name,
      });

      loadingMessage.close();
      ElMessage.success(`Connected to ${connection.name}`);

      // Navigate to workspace
      router.push({ name: 'workspace' });
    } else {
      loadingMessage.close();
      ElMessage.error('Failed to connect to database');
    }
  } catch (error) {
    console.error('Failed to load connection:', error);
    ElMessage.error(error instanceof Error ? error.message : 'Failed to connect to database');
  }
};

// Handle dropdown commands
const handleCommand = async (command: string, connection: SavedConnection) => {
  if (command === 'edit') {
    connectionToEdit.value = connection;
    showConnectionModal.value = true;
  } else if (command === 'delete') {
    try {
      await ElMessageBox.confirm(
        `Are you sure you want to delete "${connection.name}"?`,
        'Delete Connection',
        {
          confirmButtonText: 'Delete',
          cancelButtonText: 'Cancel',
          type: 'warning',
          confirmButtonClass: 'el-button--danger',
          buttonSize: 'default',
        }
      );

      await deleteConnection(connection.id);
      ElMessage.success('Connection deleted successfully');
    } catch (error) {
      if (error !== 'cancel') {
        console.error('Failed to delete connection:', error);
        ElMessage.error('Failed to delete connection');
      }
    }
  }
};

// Format date helper
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) {
    return 'Today';
  } else if (diffInDays === 1) {
    return 'Yesterday';
  } else if (diffInDays < 7) {
    return `${diffInDays} days ago`;
  } else {
    return date.toLocaleDateString();
  }
};
</script>

<style scoped lang="scss">
@use '@/sass/views/home.scss' as *;
</style>

<!-- <script setup lang="ts">
import { computed, ref } from 'vue';
import ConnectionForm from '../components/ConnectionForm.vue';
import ConnectionModal from '../components/ConnectionModal.vue';
import ConnectionTabs from '../components/ConnectionTabs.vue';
import CustomTitleBar from '../components/CustomTitleBar.vue';
import DatabaseManager from '../components/DatabaseManager.vue';
import QueryEditor from '../components/QueryEditor.vue';
import { useConnections } from '../composables/useConnections';
// import { useDatabase } from '../composables/useDatabase';
import { useTableStore } from '../stores/tableStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { ElMessage } from 'element-plus';

// const {
//     activeConnections,
//     currentTabId,
//     currentConnection,
//     hasConnections,
//     addConnection,
//     switchToConnection,
//     removeConnection,
//     clearAllConnections,
//     selectDatabase,
//     markAppQuit,
//     refreshConnectionStatus
// } = useConnections();

// const { disconnectAll, hasActiveConnections } = useDatabase();
const connectionStore = useConnectionStore();

// Use Pinia store
const tableStore = useTableStore();

const showConnectionModal = ref(false);
const activeTab = ref('home');
const queryEditorRef = ref();
const databaseManagerRef = ref();
const cleanupReloadPreventionRef = ref<(() => void) | null>(null);
const isDataReloading = ref(false); // Flag to track data reload

// Selected databases for current connection
const selectedDatabases = ref<Array<{ name: string; tableCount: number; isConnected: boolean }>>([]);

// Database states to save/restore when switching databases
const databaseStates = ref<Record<string, {
  activeTable?: string;
  openTabs?: Array<{ name: string; query?: string; isActive?: boolean }>;
  queryHistory?: Array<{ sql: string; timestamp: Date; success: boolean }>;
}>>({});

// Database manager popup state
const showDatabaseManager = ref(false);

// State persistence - prevent reload when connections are active
// const handleBeforeUnload = async (e: BeforeUnloadEvent) => {
//   const hasActiveDBConnections = await hasActiveConnections();
//   const hasUIConnections = activeConnections.value.length > 0;

//   if (hasActiveDBConnections || hasUIConnections) {
//     e.preventDefault();
//     e.returnValue = 'You have active database connections. Are you sure you want to leave?';

//     // Check if this is a reload attempt using a simpler method
//     const isReload = window.performance?.navigation?.type === 1;

//     if (isReload) {
//       console.log('Reload attempt detected - preventing reload');
//       // Show warning message
//       ElMessage.warning('Cannot reload app while database connections are active. Please disconnect all connections first.');
//       return e.returnValue;
//     }

//     // Only disconnect connections if this is a real app quit, not a data reload
//     if (isDataReloading.value) {
//       return e.returnValue;
//     }

//     // Disconnect all database connections for real app quit
//     try {
//       console.log('Disconnecting all database connections before app quit...');
//       await disconnectAll();
//       await clearAllConnections();
//       markAppQuit(); // Mark app quit time
//       console.log('All connections disconnected successfully');
//     } catch (error) {
//       console.error('Error disconnecting connections on quit:', error);
//     }

//     return e.returnValue;
//   } else {
//     // Even if no connections, mark app quit time
//     markAppQuit();
//   }
// };

// Handle new connection
const handleNewConnection = () => {
    console.log('handleNewConnection called');
    // Open connection modal instead of creating empty connection
    showConnectionModal.value = true;
};

// Handle connection created
// const handleConnectionCreated = async (connection: any, name: string) => {
//     try {
//         const tabId = await addConnection(connection, name);

//         // If connecting with existing database, add it to selectedDatabases
//         // This allows user to later add more databases via Database Manager
//         if (connection.database) {
//             selectedDatabases.value = [{
//                 name: connection.database,
//                 tableCount: 0, // Will be updated when user opens Database Manager
//                 isConnected: true
//             }];


//         } else {
//             // If connecting without database, clear selectedDatabases
//             // User will need to select databases via Database Manager
//             selectedDatabases.value = [];
//         }
//     } catch (error) {
//         console.error('Failed to add connection:', error);
//         ElMessage.error('Failed to establish database connection. Please try again.');
//     }
// };

// Handle opening new window for connection
const handleOpenNewWindow = async (connection?: any, name?: string) => {
    try {
        // Open new window with connection
        if (window.electron) {
            await window.electron.invoke('window:open-new', {
                connection: connection || null,
                name: name || 'New Connection'
            });
        } else {
            // Fallback for web version - open in new tab
            const newWindow = window.open('', '_blank');
            if (newWindow) {
                newWindow.location.href = window.location.href;
            }
        }
    } catch (error) {
        console.error('Failed to open new window:', error);
        ElMessage.error('Failed to open new window. Please try again.');
    }
};

// Handle tab switching
// const handleSwitchTab = async (tabId: string) => {
//     await switchToConnection(tabId);
//     // Refresh connection status when switching tabs
//     await refreshConnectionStatus();
// };

// // Handle tab closing
// const handleCloseTab = async (tabId: string) => {
//     await removeConnection(tabId);
// };

// Handle disconnect connection from title bar
// const handleDisconnectConnection = async (tabId: string) => {
//     await removeConnection(tabId);
// };

// Handle database selection
// const handleSelectDatabase = async (databaseName: string) => {
//     try {
//         // Get current database name before switching
//         const currentDatabaseName = currentConnection.value?.database;

//         const success = await selectDatabase(databaseName);

//         if (success) {
//             // Update selectedDatabases to reflect the new active database
//             selectedDatabases.value = selectedDatabases.value.map(db => ({
//                 ...db,
//                 isConnected: db.name === databaseName
//             }));

//             ElMessage.success(`Connected to database: ${databaseName}`);
//         } else {
//             ElMessage.error(`Failed to connect to database: ${databaseName}`);
//         }
//     } catch (error) {
//         console.error('Error selecting database:', error);
//         ElMessage.error('Failed to select database');
//     }
// };

// Handle adding new database
const handleAddDatabase = async (databaseName: string) => {
    console.log('Adding database:', databaseName);
    // TODO: Implement database creation logic
    // This would create a new database and add it to the list
};

// Handle disconnecting database
const handleDisconnectDatabase = async (databaseName: string) => {
    console.log('Disconnecting database:', databaseName);
    // TODO: Implement database disconnection logic
    // This would disconnect from the current database
};

// Handle database selection from Database Manager
// const handleSelectDatabaseFromManager = async (databaseName: string) => {
//     // Check if database is already in selectedDatabases
//     const existingDb = selectedDatabases.value.find(db => db.name === databaseName);

//     if (existingDb) {
//         // Database already exists, just switch to it
//         await handleSelectDatabase(databaseName);
//     } else {
//         // Database doesn't exist, add it to selectedDatabases and make it active
//         // Get current database name before switching
//         const currentDatabaseName = currentConnection.value?.database;

//         // Add to selectedDatabases
//         selectedDatabases.value.push({
//             name: databaseName,
//             tableCount: 0,
//             isConnected: true
//         });

//         // Update connection to use the new database
//         if (currentConnection.value) {
//             const connectionIndex = activeConnections.value.findIndex(
//                 conn => conn.tabId === currentConnection.value?.tabId
//             );

//             if (connectionIndex !== -1) {
//                 activeConnections.value[connectionIndex].database = databaseName;
//                 activeConnections.value[connectionIndex].selectedDatabase = databaseName;

//                 // Call selectDatabase to actually switch database
//                 const success = await selectDatabase(databaseName);

//                 if (success) {
//                     // Database switched successfully
//                 }
//             }
//         }
//     }

//     // Close the database manager popup
//     showDatabaseManager.value = false;
// };

// Handle select database from title bar
const handleSelectDatabaseFromTitleBar = () => {
    // Open database manager popup
    showDatabaseManager.value = true;
};

// Handle select database from sidebar
// const handleSelectDatabaseFromSidebar = (databaseName: string) => {
//     if (databaseName === '') {
//         // Open database manager popup
//         showDatabaseManager.value = true;
//     } else {
//         // Handle specific database selection
//         handleSelectDatabase(databaseName);
//     }
// };

// Handle add query (placeholder for title bar)
const handleAddQuery = () => {
    console.log('Add query clicked');
    // This would typically open a new query tab
};

// Handle toggle sidebar (placeholder for title bar)
const handleToggleSidebar = () => {
    console.log('Toggle sidebar clicked');
    // This would toggle the sidebar visibility
};





// Handle app quit - disconnect all connections
// const handleAppQuit = async () => {
//     if (activeConnections.value.length > 0) {
//         try {
//             console.log('App is quitting, disconnecting all database connections...');
//             await disconnectAll();
//             await clearAllConnections();
//             markAppQuit(); // Mark app quit time
//             console.log('All connections disconnected successfully');
//         } catch (error) {
//             console.error('Error disconnecting connections on quit:', error);
//         }
//     }
// };

// Global keyboard shortcuts - prevent Ctrl+N when no active connections
// const handleGlobalKeydown = async (event: KeyboardEvent) => {
//     // Prevent Ctrl+N/Cmd+N when no active connections (Home screen)
//     if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
//         if (activeConnections.value.length === 0) {
//             event.preventDefault();
//         }
//     }

//     // Handle Cmd+R (Mac) or Ctrl+R (Windows/Linux) for data reload
//     if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
//         const hasActiveDBConnections = await hasActiveConnections();
//         if (hasConnections || activeConnections.value.length > 0) {
//             // Always prevent browser reload when we have connections
//             event.preventDefault();
//             event.stopPropagation();
//             event.stopImmediatePropagation();

//             // Call QueryEditor reload method directly
//             if (queryEditorRef.value && queryEditorRef.value.handleReloadData) {
//                 isDataReloading.value = true; // Set flag before reload
//                 try {
//                     await queryEditorRef.value.handleReloadData();
//                 } catch (error) {
//                     console.error('Error in handleReloadData:', error);
//                 } finally {
//                     // Delay clearing the flag to prevent beforeunload from disconnecting
//                     setTimeout(() => {
//                         isDataReloading.value = false;
//                     }, 100); // 100ms delay
//                 }
//             } else {
//                 // Show warning if we can't reload data
//                 ElMessage.warning('Cannot reload data - QueryEditor not available');
//             }
//             return false;
//         }
//     }

//     // Prevent F5 key when there are active connections
//     if (event.key === 'F5') {
//         const hasActiveDBConnections = await hasActiveConnections();
//         if (hasConnections || activeConnections.value.length > 0) {
//             event.preventDefault();
//             event.stopPropagation();
//             event.stopImmediatePropagation();
//             console.log('F5 reload prevented - active connections detected');
//             ElMessage.warning('Cannot reload app while database connections are active. Please disconnect all connections first.');
//             return false;
//         }
//     }
// };

// Listen for reload prevention messages from main process
const handleReloadPrevented = (message: string) => {
    console.log('Reload prevented by main process:', message);
    ElMessage.warning(message);
};

// Prevent reload using multiple methods
// const setupReloadPrevention = () => {
//     // Method 1: Prevent reload using beforeunload with stronger logic
//     const preventReload = (event: BeforeUnloadEvent) => {
//         if (activeConnections.value.length > 0) {
//             event.preventDefault();
//             event.returnValue = 'You have active database connections. Are you sure you want to leave?';
//             console.log('Reload prevented via beforeunload');
//             return event.returnValue;
//         }
//     };

//     // Method 2: Prevent navigation using popstate
//     const preventNavigation = (event: PopStateEvent) => {
//         if (activeConnections.value.length > 0) {
//             console.log('Navigation prevented via history API');
//             ElMessage.warning('Cannot navigate while database connections are active');
//             // Push current state back to prevent navigation
//             window.history.pushState(null, '', window.location.href);
//         }
//     };

//     // Method 3: Prevent reload using visibilitychange
//     const preventVisibilityChange = () => {
//         if (activeConnections.value.length > 0 && document.visibilityState === 'hidden') {
//             console.log('Page visibility change prevented');
//             ElMessage.warning('Cannot leave page while database connections are active');
//         }
//     };

//     // Method 4: Prevent reload using pagehide
//     const preventPageHide = (event: PageTransitionEvent) => {
//         if (activeConnections.value.length > 0) {
//             console.log('Page hide prevented');
//             event.preventDefault();
//             return false;
//         }
//     };

//     // Method 5: Prevent reload using unload
//     const preventUnload = (event: Event) => {
//         if (activeConnections.value.length > 0) {
//             console.log('Unload prevented');
//             event.preventDefault();
//             return false;
//         }
//     };

//     // Add all event listeners
//     window.addEventListener('beforeunload', preventReload, { capture: true });
//     window.addEventListener('popstate', preventNavigation);
//     document.addEventListener('visibilitychange', preventVisibilityChange);
//     window.addEventListener('pagehide', preventPageHide);
//     window.addEventListener('unload', preventUnload);

//     // Return cleanup function
//     return () => {
//         window.removeEventListener('beforeunload', preventReload, { capture: true });
//         window.removeEventListener('popstate', preventNavigation);
//         document.removeEventListener('visibilitychange', preventVisibilityChange);
//         window.removeEventListener('pagehide', preventPageHide);
//         window.removeEventListener('unload', preventUnload);
//     };
// };

// onMounted(() => {
//     window.addEventListener('beforeunload', handleBeforeUnload);
//     document.addEventListener('keydown', handleGlobalKeydown, true); // Use capture phase

//     // Setup reload prevention
//     cleanupReloadPreventionRef.value = setupReloadPrevention();

//     // Listen for reload prevention messages
//     if (window.electron) {
//         window.electron.on('reload-prevented', handleReloadPrevented);
//     }

//     // Additional CMD+R prevention at window level
//     window.addEventListener('keydown', (event) => {
//         // Prevent F5 at window level
//         if (event.key === 'F5') {
//             if (activeConnections.value.length > 0) {
//                 event.preventDefault();
//                 event.stopPropagation();
//                 return false;
//             }
//         }
//     }, true); // Use capture phase
// });

// onUnmounted(() => {
//     window.removeEventListener('beforeunload', handleBeforeUnload);
//     document.removeEventListener('keydown', handleGlobalKeydown, true);

//     // Remove reload prevention listener
//     if (window.electron) {
//         window.electron.off('reload-prevented', handleReloadPrevented);
//     }

//     // Cleanup reload prevention
//     if (cleanupReloadPreventionRef.value) {
//         cleanupReloadPreventionRef.value();
//     }

//     console.log('Reload prevention cleanup completed');
// });
</script> -->
