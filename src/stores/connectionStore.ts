import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { DatabaseConnection } from '../types';

export const useConnectionStore = defineStore('connection', () => {
  // State
  const connections = ref<DatabaseConnection[]>([]);
  const activeConnection = ref<DatabaseConnection | null>(null);
  const isConnected = ref(false);
  const error = ref<string | null>(null);

  // Getters
  const hasConnections = computed(() => connections.value.length > 0);
  const activeConnectionId = computed(() => activeConnection.value?.id || null);

  // Actions
  const setConnections = (newConnections: DatabaseConnection[]) => {
    connections.value = newConnections;
  };

  const addConnection = (connection: DatabaseConnection) => {
    connections.value.push(connection);
  };

  const removeConnection = (connectionId: string) => {
    const index = connections.value.findIndex(conn => conn.id === connectionId);
    if (index > -1) {
      connections.value.splice(index, 1);
    }
    
    if (activeConnection.value?.id === connectionId) {
      activeConnection.value = null;
      isConnected.value = false;
    }
  };

  const setActiveConnection = (connection: DatabaseConnection | null) => {
    activeConnection.value = connection;
    isConnected.value = !!connection;
  };

  const setConnectionStatus = (status: boolean) => {
    isConnected.value = status;
  };

  const setError = (errorMessage: string | null) => {
    error.value = errorMessage;
  };

  const clearError = () => {
    error.value = null;
  };

  return {
    // State
    connections,
    activeConnection,
    isConnected,
    error,
    
    // Getters
    hasConnections,
    activeConnectionId,
    
    // Actions
    setConnections,
    addConnection,
    removeConnection,
    setActiveConnection,
    setConnectionStatus,
    setError,
    clearError
  };
});
