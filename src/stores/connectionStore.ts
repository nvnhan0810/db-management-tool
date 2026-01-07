import { storageService, type SavedConnection } from '@/services/storage';
import type { DatabaseConnection } from '@/types/connection';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

export const useConnectionStore = defineStore('connections', () => {
  // State
  const connections = ref<SavedConnection[]>([]); // Changed to SavedConnection[]
  const activeConnection = ref<DatabaseConnection | null>(null);
  const isConnected = ref(false);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // Getters
  const hasConnections = computed(() => connections.value.length > 0);
  const activeConnectionId = computed(() => activeConnection.value?.id || null);
  const recentConnections = computed(() => connections.value.slice(0, 5));

  // Actions - Saved Connections Management
  const loadSavedConnections = async () => {
    isLoading.value = true;
    error.value = null;

    try {
      connections.value = await storageService.getSavedConnections();
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load saved connections';
      console.error('Failed to load saved connections:', err);
    } finally {
      isLoading.value = false;
    }
  };

  const saveConnection = async (connection: DatabaseConnection, name: string) => {
    error.value = null;

    try {
      await storageService.saveConnection(connection, name);
      await loadSavedConnections(); // Reload the list
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to save connection';
      console.error('Failed to save connection:', err);
      throw err;
    }
  };

  const deleteConnection = async (connectionId: string) => {
    error.value = null;

    try {
      await storageService.deleteConnection(connectionId);
      await loadSavedConnections(); // Reload the list
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete connection';
      console.error('Failed to delete connection:', err);
      throw err;
    }
  };

  const getDecryptedConnection = async (savedConnection: SavedConnection): Promise<DatabaseConnection & { name?: string }> => {
    try {
      return await storageService.getDecryptedConnection(savedConnection);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to decrypt connection';
      console.error('Failed to decrypt connection:', err);
      throw err;
    }
  };

  const updateLastUsed = async (connectionId: string) => {
    try {
      await storageService.updateLastUsed(connectionId);
      await loadSavedConnections(); // Reload to update the order
    } catch (err) {
      console.error('Failed to update last used:', err);
    }
  };

  // Actions - Active Connection Management
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

  // Initialize: Load saved connections from storage on store creation
  const initialize = async () => {
    await loadSavedConnections();
  };

  // Auto-initialize when store is created
  initialize();

  // Watch connections and persist to localStorage automatically
  watch(connections, () => {
    // Connections are already persisted via storageService
    // This watch is here for any additional side effects if needed
  }, { deep: true });

  return {
    // State
    connections,
    activeConnection,
    isConnected,
    isLoading,
    error,

    // Getters
    hasConnections,
    activeConnectionId,
    recentConnections,

    // Actions - Saved Connections
    loadSavedConnections,
    saveConnection,
    deleteConnection,
    getDecryptedConnection,
    updateLastUsed,

    // Actions - Active Connection
    setActiveConnection,
    setConnectionStatus,
    setError,
    clearError,

    // Initialization
    initialize
  };
});
