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
      if (isFreshStart()) {
        console.log('Fresh app start detected - clearing old state');
        clearState();
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
          
          // Load the state only if it's recent and valid
          activeConnections.value = state.activeConnections;
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
  const addConnection = async (connection: DatabaseConnection, name: string): Promise<string> => {
    const tabId = `tab-${nextTabId.value++}`;
    
    console.log('Adding new connection:', {
      connectionId: connection.id,
      name: name,
      database: connection.database,
      host: connection.host
    });
    
    // First, try to connect to the database
    let isConnected = false;
    try {
      if (window.electron) {
        // Create a plain object with only the necessary database connection properties
        const plainConnection = {
          id: connection.id,
          type: connection.type,
          host: connection.host,
          port: connection.port,
          username: connection.username,
          password: connection.password,
          database: connection.database
        };
        
        isConnected = await window.electron.invoke('database:connect', plainConnection);
        console.log(`Database connection ${connection.id} established:`, isConnected);
      }
    } catch (error) {
      console.error('Error connecting to database:', error);
      isConnected = false;
    }
    
    const activeConnection: ActiveConnection = {
      ...connection,
      name,
      isConnected: isConnected, // Set based on actual connection result
      lastActivity: new Date(),
      tabId,
    };
    
    activeConnections.value.push(activeConnection);
    currentTabId.value = tabId;
    
    console.log('Active connections after adding:', activeConnections.value.map(c => ({
      id: c.id,
      name: c.name,
      isConnected: c.isConnected,
      tabId: c.tabId
    })));
    
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
      
      // Ensure connection is marked as connected when switching to it
      // This is important for multi-connection scenarios
      if (!connection.isConnected) {
        console.log(`Marking connection ${connection.id} as connected when switching to tab ${tabId}`);
        connection.isConnected = true;
      }
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

  // Refresh connection status for all connections
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

  // Test method to simulate app restart
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
    markAppQuit,
    isFreshStart,
    testRestartDetection,
  };
}
