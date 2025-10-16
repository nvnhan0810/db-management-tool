import { ref, toRaw } from 'vue';
import type { DatabaseConnection } from '@/types/connection';
import type { QueryResult } from '@/types/query';

// Create singleton state outside the function
const isConnected = ref(false);
const currentConnection = ref<DatabaseConnection | null>(null);
const queryResult = ref<QueryResult | null>(null);
const error = ref<string | null>(null);

export function useDatabase() {

  const connect = async (connection: DatabaseConnection): Promise<boolean> => {
    try {
      // Convert reactive object to plain object for IPC
      const plainConnection = toRaw(connection);
      console.log('Attempting to connect with:', plainConnection);
      const success = await window.electron.invoke('database:connect', plainConnection);
      console.log('Connection result:', success);

      if (success) {
        isConnected.value = true;
        currentConnection.value = connection;
        error.value = null;
      }
      return success;
    } catch (err) {
      console.error('Connection error:', err);
      error.value = err instanceof Error ? err.message : 'Failed to connect to database';
      return false;
    }
  };

  const disconnect = async (): Promise<void> => {
    if (currentConnection.value) {
      try {
        await window.electron.invoke('database:disconnect', currentConnection.value.id);
        isConnected.value = false;
        currentConnection.value = null;
        error.value = null;
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Failed to disconnect from database';
      }
    }
  };

  const disconnectAll = async (): Promise<void> => {
    try {
      await window.electron.invoke('database:disconnectAll', null);
      isConnected.value = false;
      currentConnection.value = null;
      error.value = null;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to disconnect all databases';
    }
  };

  const hasActiveConnections = async (): Promise<boolean> => {
    try {
      return await window.electron.invoke('database:hasActiveConnections', null);
    } catch (err) {
      console.error('Error checking active connections:', err);
      return false;
    }
  };

  const executeQuery = async (query: string): Promise<void> => {
    if (!currentConnection.value) {
      error.value = 'No active database connection';
      return;
    }

    try {
      const result = await window.electron.invoke('database:query', {
        connectionId: currentConnection.value.id,
        query
      });

      queryResult.value = result;
      error.value = result.success ? null : result.error || 'Query execution failed';
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '';

      // Check if error is connection-related and try to reconnect
      if (errorMessage.includes('connection is in closed state') ||
          errorMessage.includes('ECONNREFUSED') ||
          errorMessage.includes('connection lost')) {

        console.log('Connection error detected in executeQuery, attempting to reconnect...');

        try {
          console.log('Attempting to reconnect to:', currentConnection.value.name);
          const reconnected = await connect(currentConnection.value);
          if (reconnected) {
            console.log('Reconnection successful, retrying query...');
            // Retry the original query
            const retryResult = await window.electron.invoke('database:query', {
              connectionId: currentConnection.value.id,
              query
            });

            queryResult.value = retryResult;
            error.value = retryResult.success ? null : retryResult.error || 'Query execution failed';
            return;
          }
        } catch (reconnectErr) {
          console.log('Reconnection failed:', reconnectErr);
        }
      }

      error.value = err instanceof Error ? err.message : 'Failed to execute query';
    }
  };

  const getTables = async (connectionId?: string): Promise<Array<{ name: string; type?: string }>> => {
    // Use provided connectionId or fall back to currentConnection
    const targetConnectionId = connectionId || currentConnection.value?.id;

    if (!targetConnectionId) {
      console.warn('No connection ID provided for getTables');
      return []; // Return empty array instead of throwing error
    }

    try {
      const tables = await window.electron.invoke('database:getTables', {
        connectionId: targetConnectionId
      });

      return tables || []; // Ensure we always return an array
    } catch (err) {
      console.error('Error getting tables for connection:', targetConnectionId, err);

      // Check if error is connection-related and try to reconnect
      const errorMessage = err instanceof Error ? err.message : '';
      if (errorMessage.includes('connection is in closed state') ||
          errorMessage.includes('ECONNREFUSED') ||
          errorMessage.includes('connection lost')) {

        // Try to reconnect to the same connection
        try {
          const connection = currentConnection.value;
          if (connection && connection.id === targetConnectionId) {
            const reconnected = await connect(connection);
            if (reconnected) {
              // Retry the original request
              const retryTables = await window.electron.invoke('database:getTables', {
                connectionId: targetConnectionId
              });
              return retryTables || [];
            }
          }
        } catch (reconnectErr) {
          // Ignore reconnect errors
        }
      }

      return []; // Return empty array on error instead of throwing
    }
  };

  const getDatabases = async (connectionId?: string): Promise<Array<{ name: string; tableCount?: number }>> => {
    // Use provided connectionId or fall back to currentConnection
    const targetConnectionId = connectionId || currentConnection.value?.id;

    if (!targetConnectionId) {
      console.warn('No connection ID provided for getDatabases');
      return []; // Return empty array instead of throwing error
    }

    try {
      const databases = await window.electron.invoke('database:getDatabases', {
        connectionId: targetConnectionId
      });

      return databases || []; // Ensure we always return an array
    } catch (err) {
      console.error('Error getting databases for connection:', targetConnectionId, err);

      // Check if error is connection-related and try to reconnect
      const errorMessage = err instanceof Error ? err.message : '';
      if (errorMessage.includes('connection is in closed state') ||
          errorMessage.includes('ECONNREFUSED') ||
          errorMessage.includes('connection lost')) {

        // Try to reconnect to the same connection
        try {
          const connection = currentConnection.value;
          if (connection && connection.id === targetConnectionId) {
            const reconnected = await connect(connection);
            if (reconnected) {
              // Retry the original request
              const retryDatabases = await window.electron.invoke('database:getDatabases', {
                connectionId: targetConnectionId
              });
              return retryDatabases || [];
            }
          }
        } catch (reconnectErr) {
          console.error('Reconnection failed:', reconnectErr);
        }
      }

      return []; // Return empty array on error
    }
  };

  const getTableStructure = async (connectionId: string, tableName: string): Promise<{
    columns: Array<{
      name: string;
      type: string;
      nullable: boolean;
      ordinal_position?: number;
      character_set?: string;
      collation?: string;
      default_value?: string;
      extra?: string;
      foreign_key?: string;
      comment?: string;
    }>;
    rows?: number;
    indexes?: Array<{
      name: string;
      algorithm?: string;
      is_unique: boolean;
      column_name: string;
    }>;
  }> => {
    try {
      if (!window.electron || !window.electron.invoke) {
        throw new Error('window.electron.invoke is not available');
      }

      const structure = await window.electron.invoke('database:getTableStructure', {
        connectionId,
        tableName
      });

      return structure;
    } catch (err) {
      console.error('Error getting table structure:', err);

      // Check if error is connection-related and try to reconnect
      const errorMessage = err instanceof Error ? err.message : '';
      if (errorMessage.includes('connection is in closed state') ||
          errorMessage.includes('ECONNREFUSED') ||
          errorMessage.includes('connection lost')) {

        console.log('Connection error detected, attempting to reconnect...');

        // Try to reconnect to the same connection
        try {
          const connection = currentConnection.value;
          if (connection && connection.id === connectionId) {
            console.log('Attempting to reconnect to:', connection.name);
            const reconnected = await connect(connection);
            if (reconnected) {
              console.log('Reconnection successful, retrying getTableStructure...');
              // Retry the original request
              const retryStructure = await window.electron.invoke('database:getTableStructure', {
                connectionId,
                tableName
              });
              return retryStructure;
            }
          }
        } catch (reconnectErr) {
          console.log('Reconnection failed:', reconnectErr);
        }
      }

      throw err;
    }
  };

  // Method to refresh connection status and auto-reconnect if needed
  const refreshConnectionStatus = async (): Promise<boolean> => {
    try {
      const hasConnections = await hasActiveConnections();

      if (!hasConnections && currentConnection.value) {
        console.log('Connection lost, attempting to reconnect...');
        const reconnected = await connect(currentConnection.value);
        if (reconnected) {
          console.log('Auto-reconnection successful');
          return true;
        } else {
          console.log('Auto-reconnection failed');
          isConnected.value = false;
          currentConnection.value = null;
          return false;
        }
      }

      return hasConnections;
    } catch (err) {
      console.error('Error refreshing connection status:', err);
      return false;
    }
  };

  return {
    isConnected,
    currentConnection,
    queryResult,
    error,
    connect,
    disconnect,
    disconnectAll,
    hasActiveConnections,
    executeQuery,
    getTables,
    getDatabases,
    getTableStructure,
    refreshConnectionStatus,
  };
}
