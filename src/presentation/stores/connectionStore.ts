import type { DatabaseConnection } from '@/domain/connection/types';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

export interface ActiveConnection extends Omit<DatabaseConnection, 'id'> {
  id: string;
  name: string;
  isConnected: boolean;
  lastActivity: Date;
  tabId: string;
  selectedDatabase?: string;
  rootConnectionId?: string;
}

const STORAGE_KEY = 'connectionsState';
const QUIT_TIME_KEY = 'lastQuitTime';

/** Workspace sessions: open tabs, current tab, sidebar — not the saved-connection list. */
export const useConnectionStore = defineStore('connection', () => {
  const activeConnections = ref<ActiveConnection[]>([]);
  const currentTabId = ref<string | null>(null);
  const nextTabId = ref(1);
  const dataSidebarOpen = ref(false);
  let stateLoaded = false;

  const isFreshStart = () => {
    const lastQuit = localStorage.getItem(QUIT_TIME_KEY);
    const now = Date.now();
    return !lastQuit || now - parseInt(lastQuit, 10) > 5000;
  };

  const markAppQuit = () => {
    localStorage.setItem(QUIT_TIME_KEY, Date.now().toString());
  };

  const saveState = () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        activeConnections: activeConnections.value,
        currentTabId: currentTabId.value,
        nextTabId: nextTabId.value,
        timestamp: Date.now(),
      })
    );
  };

  const loadState = (): boolean => {
    try {
      if (isFreshStart() && activeConnections.value.length === 0) {
        clearState();
        return false;
      }

      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return false;

      const state = JSON.parse(saved);
      const isRecent = Date.now() - state.timestamp < 24 * 60 * 60 * 1000;

      if (
        isRecent &&
        state.activeConnections?.length > 0
      ) {
        const lastQuit = localStorage.getItem(QUIT_TIME_KEY);
        if (lastQuit && state.timestamp < parseInt(lastQuit, 10)) {
          clearState();
          return false;
        }

        activeConnections.value = (state.activeConnections as ActiveConnection[]).map(
          (c: ActiveConnection) => ({
            ...c,
            lastActivity:
              c.lastActivity instanceof Date
                ? c.lastActivity
                : new Date(c.lastActivity as unknown as string),
          })
        );
        currentTabId.value = state.currentTabId;
        nextTabId.value = state.nextTabId ?? 1;
        return true;
      }
    } catch {
      clearState();
    }
    return false;
  };

  const clearState = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(QUIT_TIME_KEY);
    activeConnections.value = [];
    currentTabId.value = null;
    nextTabId.value = 1;
  };

  watch([activeConnections, currentTabId], saveState, { deep: true });

  if (!stateLoaded) {
    loadState();
    stateLoaded = true;
  }

  const currentConnection = computed(() =>
    currentTabId.value
      ? activeConnections.value.find((c) => c.tabId === currentTabId.value) ?? null
      : null
  );

  const sortedConnections = computed(() => [...activeConnections.value]);
  const hasConnections = computed(() => activeConnections.value.length > 0);

  const toggleDataSidebar = () => {
    dataSidebarOpen.value = !dataSidebarOpen.value;
  };

  const closeDataSidebar = () => {
    dataSidebarOpen.value = false;
  };

  const addConnection = async (
    connection: DatabaseConnection,
    name: string
  ): Promise<string> => {
    const tabId = `tab-${nextTabId.value++}`;
    const rootId = (connection as unknown as ActiveConnection).rootConnectionId ?? connection.id;

    const active: ActiveConnection = {
      ...connection,
      name,
      isConnected: true,
      lastActivity: new Date(),
      tabId,
      rootConnectionId: rootId,
    };

    activeConnections.value.push(active);
    currentTabId.value = tabId;
    saveState();

    return tabId;
  };

  const removeConnection = async (tabId: string) => {
    const index = activeConnections.value.findIndex((c) => c.tabId === tabId);
    if (index < 0) return;

    const conn = activeConnections.value[index];
    try {
      if (conn.id && typeof window.electron?.invoke === 'function') {
        await window.electron.invoke('database:disconnect', conn.id);
      }
    } catch {
      /* ignore */
    }

    activeConnections.value.splice(index, 1);
    if (currentTabId.value === tabId) {
      currentTabId.value =
        activeConnections.value[0]?.tabId ?? null;
    }
  };

  const switchToConnection = (tabId: string) => {
    const conn = activeConnections.value.find((c) => c.tabId === tabId);
    if (conn) {
      currentTabId.value = tabId;
      if (!conn.isConnected) conn.isConnected = true;
    }
  };

  const updateConnectionStatus = (tabId: string, isConnected: boolean) => {
    const conn = activeConnections.value.find((c) => c.tabId === tabId);
    if (conn) {
      conn.isConnected = isConnected;
      conn.lastActivity = new Date();
    }
  };

  const refreshConnectionStatus = async () => {
    try {
      const has = (await window.electron?.invoke('database:hasActiveConnections')) as boolean;
      activeConnections.value.forEach((c) => {
        c.isConnected = has;
      });
    } catch {
      /* ignore */
    }
  };

  const getConnectionByTabId = (tabId: string) =>
    activeConnections.value.find((c) => c.tabId === tabId) ?? null;

  const clearAllConnections = async () => {
    try {
      await window.electron?.invoke('database:disconnectAll');
    } catch {
      /* ignore */
    }
    activeConnections.value = [];
    currentTabId.value = null;
    nextTabId.value = 1;
    markAppQuit();
    localStorage.removeItem(STORAGE_KEY);
  };

  const selectDatabase = async (databaseName: string): Promise<boolean> => {
    if (!currentTabId.value) return false;

    const conn = activeConnections.value.find((c) => c.tabId === currentTabId.value);
    if (!conn) return false;

    const hadDb = !!conn.database;
    const currentDb = conn.database?.trim().toLowerCase() ?? '';
    const targetDb = databaseName.trim().toLowerCase();

    if (hadDb && currentDb === targetDb) return true;

    if (!hadDb) {
      conn.database = databaseName;
      conn.selectedDatabase = databaseName;

      try {
        await window.electron?.invoke('database:disconnect', conn.id);
      } catch {
        /* ignore */
      }

      const plain = {
        id: conn.id,
        type: conn.type,
        host: conn.host,
        port: conn.port,
        username: conn.username,
        password: conn.password,
        database: databaseName,
        ssh: conn.ssh ? { ...conn.ssh } : undefined,
      };

      const ok = (await window.electron?.invoke('database:connect', plain)) as boolean;
      conn.isConnected = ok;
      return ok;
    }

    const newId = crypto.randomUUID();
    const plain = {
      id: newId,
      type: conn.type,
      host: conn.host,
      port: conn.port,
      username: conn.username,
      password: conn.password,
      database: databaseName,
      ssh: conn.ssh ? { ...conn.ssh } : undefined,
    };

    const ok = (await window.electron?.invoke('database:connect', plain)) as boolean;
    if (!ok) return false;

    const newConn: DatabaseConnection & { rootConnectionId?: string } = {
      id: newId as `${string}-${string}-${string}-${string}-${string}`,
      type: conn.type,
      host: conn.host,
      port: conn.port,
      username: conn.username,
      password: conn.password,
      database: databaseName,
      ssh: conn.ssh ? { ...conn.ssh } : undefined,
      rootConnectionId: conn.rootConnectionId ?? conn.id,
    };

    const displayName =
      conn.name && conn.name !== ''
        ? `${conn.name} (${databaseName})`
        : `${conn.type} - ${conn.host}/${databaseName}`;

    await addConnection(newConn, displayName);
    return true;
  };

  return {
    activeConnections,
    currentTabId,
    currentConnection,
    dataSidebarOpen,
    sortedConnections,
    hasConnections,
    saveState,
    loadState,
    clearState,
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
  };
});
