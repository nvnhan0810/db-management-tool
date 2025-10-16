import { computed, ref, watch } from 'vue';
import { storageService, type SavedConnection } from '../services/storage';
import type { DatabaseConnection } from '@/types/connection';

export function useSavedConnections() {
  const savedConnections = ref<SavedConnection[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // Load saved connections
  const loadSavedConnections = async () => {
    isLoading.value = true;
    error.value = null;

    try {
      savedConnections.value = await storageService.getSavedConnections();
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load saved connections';
    } finally {
      isLoading.value = false;
    }
  };

  // Save a new connection
  const saveConnection = async (connection: DatabaseConnection, name: string) => {
    error.value = null;

    try {
      await storageService.saveConnection(connection, name);
      await loadSavedConnections(); // Reload the list
    } catch (err) {
      console.error('Failed to save connection:', err);
      error.value = err instanceof Error ? err.message : 'Failed to save connection';
      throw err;
    }
  };

  // Delete a saved connection
  const deleteConnection = async (connectionId: string) => {
    error.value = null;

    try {
      await storageService.deleteConnection(connectionId);
      await loadSavedConnections(); // Reload the list
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete connection';
      throw err;
    }
  };

  // Get decrypted connection for use
  const getDecryptedConnection = async (savedConnection: SavedConnection): Promise<DatabaseConnection & { name?: string }> => {
    try {
      return await storageService.getDecryptedConnection(savedConnection);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to decrypt connection';
      throw err;
    }
  };

  // Update last used timestamp
  const updateLastUsed = async (connectionId: string) => {
    try {
      await storageService.updateLastUsed(connectionId);
      await loadSavedConnections(); // Reload to update the order
    } catch (err) {
      console.error('Failed to update last used:', err);
    }
  };

  // Computed properties
  const hasConnections = computed(() => savedConnections.value.length > 0);

  const recentConnections = computed(() =>
    savedConnections.value.slice(0, 5) // Show only 5 most recent
  );

  watch(savedConnections, (oldValue, newValue) => {
    console.log('savedConnections changed', oldValue, newValue);
  }, {
    deep: true,
    immediate: true,
    flush: 'post',
  });

  return {
    // State
    savedConnections,
    isLoading,
    error,

    // Computed
    hasConnections,
    recentConnections,

    // Methods
    loadSavedConnections,
    saveConnection,
    deleteConnection,
    getDecryptedConnection,
    updateLastUsed,
  };
}
