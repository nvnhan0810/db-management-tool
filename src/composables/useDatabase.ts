import { ref, toRaw } from 'vue';
import type { DatabaseConnection, QueryResult } from '../types';

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
      const success = await window.electron.invoke('database:connect', plainConnection);
      
      if (success) {
        isConnected.value = true;
        currentConnection.value = connection;
        error.value = null;
      }
      return success;
    } catch (err) {
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
      error.value = err instanceof Error ? err.message : 'Failed to execute query';
    }
  };

  const getTables = async (): Promise<Array<{ name: string; type?: string }>> => {
    if (!currentConnection.value) {
      console.warn('No active database connection for getTables');
      return []; // Return empty array instead of throwing error
    }

    try {
      const tables = await window.electron.invoke('database:getTables', { 
        connectionId: currentConnection.value.id 
      });
      return tables || []; // Ensure we always return an array
    } catch (err) {
      console.error('Error getting tables:', err);
      return []; // Return empty array on error instead of throwing
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
    executeQuery,
    getTables,
  };
} 