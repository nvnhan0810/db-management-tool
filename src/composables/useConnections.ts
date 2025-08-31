import { computed, onMounted, ref, watch } from 'vue';
import type { DatabaseConnection } from '../types';

export interface ActiveConnection extends Omit<DatabaseConnection, 'id'> {
  id: string;
  name: string;
  isConnected: boolean;
  lastActivity: Date;
  tabId: string; // Unique tab identifier
}

export function useConnections() {
  const activeConnections = ref<ActiveConnection[]>([]);
  const currentTabId = ref<string | null>(null);
  const nextTabId = ref(1);

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
      const savedState = localStorage.getItem('connectionsState');
      if (savedState) {
        const state = JSON.parse(savedState);
        
        // Check if state is not too old (24 hours)
        const isStateValid = Date.now() - state.timestamp < 24 * 60 * 60 * 1000;
        
        if (isStateValid && state.activeConnections) {
          activeConnections.value = state.activeConnections;
          currentTabId.value = state.currentTabId;
          nextTabId.value = state.nextTabId || 1;
          return true;
        }
      }
    } catch (error) {
      console.error('Failed to load connections state:', error);
    }
    return false;
  };

  const clearState = () => {
    localStorage.removeItem('connectionsState');
    activeConnections.value = [];
    currentTabId.value = null;
    nextTabId.value = 1;
  };

  // Auto-save state when it changes
  watch([activeConnections, currentTabId], () => {
    saveState();
  }, { deep: true });

  // Load state on mount
  onMounted(() => {
    loadState();
  });

  // Get current active connection
  const currentConnection = computed(() => {
    if (!currentTabId.value) return null;
    return activeConnections.value.find(conn => conn.tabId === currentTabId.value);
  });

  // Add new connection tab
  const addConnection = (connection: DatabaseConnection, name: string): string => {
    const tabId = `tab-${nextTabId.value++}`;
    const activeConnection: ActiveConnection = {
      ...connection,
      name,
      isConnected: true, // Set as connected when added
      lastActivity: new Date(),
      tabId,
    };
    
    activeConnections.value.push(activeConnection);
    currentTabId.value = tabId;
    
    // Save state to localStorage
    saveState();
    
    return tabId;
  };

  // Remove connection tab
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

  // Switch to a specific connection tab
  const switchToConnection = (tabId: string) => {
    const connection = activeConnections.value.find(conn => conn.tabId === tabId);
    if (connection) {
      currentTabId.value = tabId;
      connection.lastActivity = new Date();
    }
  };

  // Update connection status
  const updateConnectionStatus = (tabId: string, isConnected: boolean) => {
    const connection = activeConnections.value.find(conn => conn.tabId === tabId);
    if (connection) {
      connection.isConnected = isConnected;
      connection.lastActivity = new Date();
    }
  };

  // Get sorted connections (most recent first)
  const sortedConnections = computed(() => {
    return [...activeConnections.value].sort((a, b) => 
      b.lastActivity.getTime() - a.lastActivity.getTime()
    );
  });

  // Check if we have any connections
  const hasConnections = computed(() => activeConnections.value.length > 0);

  // Get connection by tab ID
  const getConnectionByTabId = (tabId: string) => {
    return activeConnections.value.find(conn => conn.tabId === tabId);
  };

  // Clear all active connections
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
    
    // Clear UI state
    activeConnections.value = [];
    currentTabId.value = null;
    nextTabId.value = 1;
    clearState();
  };

  return {
    // State
    activeConnections,
    currentTabId,
    currentConnection,
    
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
    getConnectionByTabId,
    clearAllConnections,
  };
}
