import type { DatabaseConnection } from '@/types/connection';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

export interface ActiveConnection extends Omit<DatabaseConnection, 'id'> {
  id: string;
  name: string;
  isConnected: boolean;
  lastActivity: Date;
  tabId: string; // Unique tab identifier
  selectedDatabase?: string; // Currently selected database
  /**
   * Root physical connection id used for server-level operations (e.g. list databases).
   * For cloned connections (chọn DB khác), nhiều ActiveConnection có chung rootConnectionId.
   */
  rootConnectionId?: string;
}

export const useConnectionsStore = defineStore('activeConnections', () => {
  // State
  const activeConnections = ref<ActiveConnection[]>([]);
  const currentTabId = ref<string | null>(null);
  const nextTabId = ref(1);
  let stateLoaded = false;

  // Check if this is a fresh app start
  const isFreshStart = () => {
    const lastQuitTime = localStorage.getItem('lastQuitTime');
    const currentTime = Date.now();

    // If no lastQuitTime or it's been more than 5 seconds, consider it a fresh start
    if (!lastQuitTime || (currentTime - parseInt(lastQuitTime)) > 5000) {
      return true;
    }
    return false;
  };

  // Mark app quit time
  const markAppQuit = () => {
    localStorage.setItem('lastQuitTime', Date.now().toString());
  };

  // State persistence functions
  const saveState = () => {
    const state = {
      activeConnections: activeConnections.value,
      currentTabId: currentTabId.value,
      nextTabId: nextTabId.value,
      timestamp: Date.now()
    };
    localStorage.setItem('connectionsState', JSON.stringify(state));
  };

  const loadState = () => {
    try {
      // If this is a fresh start, clear any old state
      // But only if we don't have any active connections being added
      if (isFreshStart()) {
        console.log('Fresh app start detected - clearing old state');
        // Only clear if we don't have connections (they might be added right after)
        if (activeConnections.value.length === 0) {
          clearState();
        } else {
          console.log('Keeping state - active connections exist');
        }
        return false;
      }

      const savedState = localStorage.getItem('connectionsState');
      if (savedState) {
        const state = JSON.parse(savedState);

        // Check if state is not too old (24 hours)
        const isStateValid = Date.now() - state.timestamp < 24 * 60 * 60 * 1000;

        if (isStateValid && state.activeConnections && state.activeConnections.length > 0) {
          // Check if we have a recent quit time - if so, clear the state
          const lastQuitTime = localStorage.getItem('lastQuitTime');
          if (lastQuitTime) {
            const quitTime = parseInt(lastQuitTime);
            const stateTime = state.timestamp;

            // If the state was saved before the last quit, clear it
            if (stateTime < quitTime) {
              console.log('State was saved before last quit - clearing old state');
              clearState();
              return false;
            }
          }

          // Load the state only if it's recent and valid; restore lastActivity as Date (JSON stores it as string)
          activeConnections.value = (state.activeConnections as ActiveConnection[]).map((conn: ActiveConnection) => ({
            ...conn,
            lastActivity: conn.lastActivity instanceof Date ? conn.lastActivity : new Date(conn.lastActivity as unknown as string),
          }));
          currentTabId.value = state.currentTabId;
          nextTabId.value = state.nextTabId || 1;
          console.log('Loaded saved connection state');
          return true;
        }
      }
    } catch (error) {
      console.error('Failed to load connections state:', error);
      // Clear corrupted state
      clearState();
    }
    return false;
  };

  const clearState = () => {
    localStorage.removeItem('connectionsState');
    localStorage.removeItem('lastQuitTime');
    activeConnections.value = [];
    currentTabId.value = null;
    nextTabId.value = 1;
  };

  // Auto-save state when it changes
  watch([activeConnections, currentTabId], () => {
    saveState();
  }, { deep: true });

  // Load state only once on first initialization
  if (!stateLoaded) {
    loadState();
    stateLoaded = true;
  }

  // Computed
  const currentConnection = computed(() => {
    if (!currentTabId.value) return null;
    return activeConnections.value.find(conn => conn.tabId === currentTabId.value);
  });

  const sortedConnections = computed(() => [...activeConnections.value]);

  const hasConnections = computed(() => activeConnections.value.length > 0);

  // Data table sidebar (right) – toggled by CustomTitleBar, not by row click
  const dataSidebarOpen = ref(false);
  const toggleDataSidebar = () => {
    dataSidebarOpen.value = !dataSidebarOpen.value;
  };
  const closeDataSidebar = () => {
    dataSidebarOpen.value = false;
  };

  // Actions
  const addConnection = async (connection: DatabaseConnection, name: string): Promise<string> => {
    const tabId = `tab-${nextTabId.value++}`;

    console.log('Adding new connection:', {
      connectionId: connection.id,
      name: name,
      database: connection.database,
      host: connection.host,
      currentActiveConnections: activeConnections.value.length
    });

    // Connection is already established in ConnectionForm, so we assume it's connected
    const isConnected = true;

    // Nếu connection được tạo từ một ActiveConnection khác, giữ nguyên rootConnectionId; ngược lại dùng id hiện tại.
    const baseRootId = (connection as unknown as ActiveConnection).rootConnectionId ?? connection.id;

    const activeConnection: ActiveConnection = {
      ...connection,
      name,
      isConnected: isConnected, // Set based on actual connection result
      lastActivity: new Date(),
      tabId,
      rootConnectionId: baseRootId,
    };

    // Clear any existing state that might have been cleared by fresh start detection
    // This ensures we can add connections even after a fresh start
    if (activeConnections.value.length === 0) {
      console.log('Clearing fresh start state to allow new connections');
      // Don't clear state, just ensure we can add
    }

    activeConnections.value.push(activeConnection);
    currentTabId.value = tabId;

    console.log('Active connections after adding:', {
      count: activeConnections.value.length,
      connections: activeConnections.value.map(c => ({
        id: c.id,
        name: c.name,
        isConnected: c.isConnected,
        tabId: c.tabId
      })),
      currentTabId: currentTabId.value
    });

    // Save state to localStorage immediately
    saveState();

    // Force a re-render by triggering a reactive update
    await new Promise(resolve => setTimeout(resolve, 0));

    console.log('Connection added successfully, state saved');

    return tabId;
  };

  const removeConnection = async (tabId: string) => {
    const index = activeConnections.value.findIndex(conn => conn.tabId === tabId);
    if (index > -1) {
      const connection = activeConnections.value[index];

      // Disconnect from database first
      try {
        if (connection.id && window.electron) {
          await window.electron.invoke('database:disconnect', connection.id);
          console.log(`Disconnected database connection: ${connection.id}`);
        }
      } catch (error) {
        console.error('Error disconnecting database connection:', error);
      }

      // Remove from UI state
      activeConnections.value.splice(index, 1);

      // If we're removing the current tab, switch to another one
      if (currentTabId.value === tabId) {
        if (activeConnections.value.length > 0) {
          currentTabId.value = activeConnections.value[0].tabId;
        } else {
          currentTabId.value = null;
        }
      }
    }
  };

  const switchToConnection = (tabId: string) => {
    const connection = activeConnections.value.find(conn => conn.tabId === tabId);
    if (connection) {
      currentTabId.value = tabId;
      // Don't update lastActivity - keeps connection position in sidebar when switching

      if (!connection.isConnected) {
        connection.isConnected = true;
      }
    }
  };

  const updateConnectionStatus = (tabId: string, isConnected: boolean) => {
    const connection = activeConnections.value.find(conn => conn.tabId === tabId);
    if (connection) {
      connection.isConnected = isConnected;
      connection.lastActivity = new Date();
    }
  };

  const refreshConnectionStatus = async () => {
    try {
      if (window.electron) {
        const hasConnections = await window.electron.invoke('database:hasActiveConnections', null);
        console.log('Refreshing connection status, database has connections:', hasConnections);

        // If database has connections, mark all UI connections as connected
        // If database has no connections, mark all UI connections as disconnected
        activeConnections.value.forEach(connection => {
          connection.isConnected = hasConnections;
        });
      }
    } catch (error) {
      console.error('Error refreshing connection status:', error);
    }
  };

  const getConnectionByTabId = (tabId: string) => {
    return activeConnections.value.find(conn => conn.tabId === tabId);
  };

  const clearAllConnections = async () => {
    // Disconnect all database connections first
    try {
      if (window.electron) {
        await window.electron.invoke('database:disconnectAll', null);
        console.log('Disconnected all database connections');
      }
    } catch (error) {
      console.error('Error disconnecting all database connections:', error);
    }

    // Clear UI state and localStorage
    activeConnections.value = [];
    currentTabId.value = null;
    nextTabId.value = 1;

    // Mark app quit time
    markAppQuit();

    // Explicitly clear localStorage
    try {
      localStorage.removeItem('connectionsState');
      console.log('Cleared connections state from localStorage');
    } catch (error) {
      console.error('Error clearing localStorage:', error);
    }
  };

  const selectDatabase = async (databaseName: string) => {
    if (!currentTabId.value) {
      return false;
    }

    const connection = activeConnections.value.find(conn => conn.tabId === currentTabId.value);
    if (!connection) {
      return false;
    }

    try {
      const hadDatabase = !!connection.database;
      const normalizedCurrentDb = connection.database?.trim().toLowerCase() || '';
      const normalizedTargetDb = databaseName.trim().toLowerCase();

      // Nếu chọn trùng với database hiện đang active (so sánh không phân biệt hoa thường / khoảng trắng)
      if (hadDatabase && normalizedCurrentDb === normalizedTargetDb) {
        return true;
      }

      // Case 2.1: connection chưa có database -> cập nhật DB ngay trên connection hiện tại
      if (!hadDatabase) {
        connection.database = databaseName;
        connection.selectedDatabase = databaseName;

        if (window.electron) {
          // Reconnect with new database on the same connection id
          try {
            await window.electron.invoke('database:disconnect', connection.id);
          } catch {
            // Ignore disconnect errors
          }

          // Tạo object kết nối thuần (tránh reactive Proxy, đặc biệt với ssh)
          const plainConnection = {
            id: connection.id,
            type: connection.type,
            host: connection.host,
            port: connection.port,
            username: connection.username,
            password: connection.password,
            database: databaseName,
            ssh: connection.ssh ? { ...connection.ssh } : undefined,
          };

          const isConnected = await window.electron.invoke('database:connect', plainConnection);
          connection.isConnected = isConnected;
          return !!isConnected;
        }

        // No electron (fallback, mainly for tests)
        return true;
      }

      // Case 2.2: connection đã có database -> tạo mới connection với DB vừa chọn và auto active
      if (window.electron) {
        const newId = crypto.randomUUID();

        // Sao chép ssh sang object thuần để tránh lỗi "An object could not be cloned"
        const sshConfig = connection.ssh ? { ...connection.ssh } : undefined;

        const plainConnection = {
          id: newId,
          type: connection.type,
          host: connection.host,
          port: connection.port,
          username: connection.username,
          password: connection.password,
          database: databaseName,
          ssh: sshConfig,
        };

        const isConnected = await window.electron.invoke('database:connect', plainConnection);
        if (!isConnected) {
          return false;
        }

        const newConnection: DatabaseConnection & { rootConnectionId?: string } = {
          id: newId as `${string}-${string}-${string}-${string}-${string}`,
          type: connection.type,
          host: connection.host,
          port: connection.port,
          username: connection.username,
          password: connection.password,
          database: databaseName,
          ssh: sshConfig,
          // Giữ rootConnectionId của connection gốc để dùng lại cho getDatabases
          rootConnectionId: (connection as ActiveConnection).rootConnectionId ?? connection.id,
        };

        // Tên hiển thị: ưu tiên name gốc, kèm theo tên DB nếu cần
        const displayName =
          connection.name && connection.name !== ''
            ? `${connection.name} (${databaseName})`
            : `${connection.type} - ${connection.host}/${databaseName}`;

        await addConnection(newConnection, displayName);
        return true;
      }

      // Nếu không có electron, fallback: chỉ cập nhật tạm trong UI (hiếm khi dùng)
      return false;
    } catch (error) {
      console.error('Error selecting database:', error);
      return false;
    }

    return false;
  };

  const testRestartDetection = () => {
    console.log('Testing restart detection...');
    console.log('isFreshStart():', isFreshStart());
    console.log('lastQuitTime:', localStorage.getItem('lastQuitTime'));
    console.log('connectionsState:', localStorage.getItem('connectionsState'));
  };

  return {
    // State
    activeConnections,
    currentTabId,
    currentConnection,
    dataSidebarOpen,

    // Computed
    sortedConnections,
    hasConnections,

    // State persistence
    saveState,
    loadState,
    clearState,

    // Methods
    addConnection,
    removeConnection,
    switchToConnection,
    updateConnectionStatus,
    refreshConnectionStatus,
    getConnectionByTabId,
    clearAllConnections,
    selectDatabase,
    toggleDataSidebar,
    closeDataSidebar,
    markAppQuit,
    isFreshStart,
    testRestartDetection,
  };
});

