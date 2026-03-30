import type { DatabaseConnection } from '@/domain/connection/types';
import {
  storageService,
  type SavedConnection,
} from '@/infrastructure/storage/storageService';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

/** Saved connection profiles and transient “connecting from home” pointer — not workspace tabs. */
export const useConnectionsStore = defineStore('savedConnections', () => {
  const connections = ref<SavedConnection[]>([]);
  const activeConnection = ref<DatabaseConnection | null>(null);
  const isConnected = ref(false);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const hasConnections = computed(() => connections.value.length > 0);
  const activeConnectionId = computed(() => activeConnection.value?.id ?? null);
  const recentConnections = computed(() => connections.value.slice(0, 5));

  const loadSavedConnections = async () => {
    isLoading.value = true;
    error.value = null;
    try {
      connections.value = await storageService.getSavedConnections();
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load saved connections';
    } finally {
      isLoading.value = false;
    }
  };

  const saveConnection = async (connection: DatabaseConnection, name: string) => {
    error.value = null;
    try {
      await storageService.saveConnection(connection, name);
      await loadSavedConnections();
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to save connection';
      throw err;
    }
  };

  const deleteConnection = async (connectionId: string) => {
    error.value = null;
    try {
      await storageService.deleteConnection(connectionId);
      await loadSavedConnections();
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete connection';
      throw err;
    }
  };

  const getDecryptedConnection = async (
    saved: SavedConnection
  ): Promise<DatabaseConnection & { name?: string }> => {
    return storageService.getDecryptedConnection(saved);
  };

  const updateLastUsed = async (connectionId: string) => {
    try {
      await storageService.updateLastUsed(connectionId);
      await loadSavedConnections();
    } catch {
      /* ignore */
    }
  };

  const setActiveConnection = (connection: DatabaseConnection | null) => {
    activeConnection.value = connection;
    isConnected.value = !!connection;
  };

  const setConnectionStatus = (status: boolean) => {
    isConnected.value = status;
  };

  const setError = (msg: string | null) => {
    error.value = msg;
  };

  const clearError = () => {
    error.value = null;
  };

  const initialize = async () => {
    await loadSavedConnections();
  };

  return {
    connections,
    activeConnection,
    isConnected,
    isLoading,
    error,
    hasConnections,
    activeConnectionId,
    recentConnections,
    loadSavedConnections,
    saveConnection,
    deleteConnection,
    getDecryptedConnection,
    updateLastUsed,
    setActiveConnection,
    setConnectionStatus,
    setError,
    clearError,
    initialize,
  };
});
