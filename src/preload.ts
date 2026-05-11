import { contextBridge, ipcRenderer } from 'electron';

const invokeChannels = [
  'dialog:showOpenFile',
  'dialog:chooseSavePath',
  'dialog:saveTextFile',
  'dialog:saveJsonFile',
  'dialog:openSqlFile',
  'dialog:chooseOpenSqlPath',
  'dialog:openJsonFile',
  'database:connect',
  'database:disconnect',
  'database:disconnectAll',
  'database:hasActiveConnections',
  'database:query',
  'database:getTables',
  'database:getTableStructure',
  'database:getDatabases',
  'database:executeQuery',
  'database:exportTablesSql',
  'database:exportTablesSqlToPath',
  'database:cancelExport',
  'database:dropTable',
  'database:dropDatabase',
  'shell:showItemInFolder',
  'database:importSqlScript',
  'database:importSqlFromPath',
  'database:cancelImport',
  'reload:prevent',
  'window:minimize',
  'window:maximize',
  'window:close',
  'secrets:save',
  'secrets:get',
  'secrets:delete',
];

type SqlHistoryEventDetail = {
  channel: 'database:query' | 'database:executeQuery';
  connectionId?: string;
  query?: string;
  success?: boolean;
  error?: string | null;
  executionTime?: number;
  timestamp: string;
};

const listenerChannels = new Set([
  'reload-prevented',
  'export:progress',
  'import:progress',
]);

const listenerWrappers = new Map<
  string,
  Map<(...args: unknown[]) => void, (...args: unknown[]) => void>
>();

contextBridge.exposeInMainWorld('electron', {
  invoke: async (channel: string, data?: unknown) => {
    if (invokeChannels.includes(channel)) {
      const shouldTrackSql =
        channel === 'database:query' || channel === 'database:executeQuery';

      const start = shouldTrackSql ? performance.now() : 0;
      try {
        const result = await ipcRenderer.invoke(channel, data);

        if (shouldTrackSql) {
          const execMs = Math.max(0, Math.round(performance.now() - start));
          const payload = (data ?? {}) as { connectionId?: string; query?: string };
          const detail: SqlHistoryEventDetail = {
            channel: channel as SqlHistoryEventDetail['channel'],
            connectionId: payload.connectionId,
            query: payload.query,
            success: (result as { success?: boolean } | undefined)?.success,
            error: (result as { error?: string } | undefined)?.error ?? null,
            executionTime: execMs,
            timestamp: new Date().toISOString(),
          };
          window.dispatchEvent(new CustomEvent('sql:executed', { detail }));
        }

        return result;
      } catch (err) {
        if (shouldTrackSql) {
          const execMs = Math.max(0, Math.round(performance.now() - start));
          const payload = (data ?? {}) as { connectionId?: string; query?: string };
          const detail: SqlHistoryEventDetail = {
            channel: channel as SqlHistoryEventDetail['channel'],
            connectionId: payload.connectionId,
            query: payload.query,
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
            executionTime: execMs,
            timestamp: new Date().toISOString(),
          };
          window.dispatchEvent(new CustomEvent('sql:executed', { detail }));
        }
        throw err;
      }
    }
    throw new Error(`IPC channel not allowed: ${channel}`);
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (listenerChannels.has(channel)) {
      const wrapper = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
        callback(...args);
      const channelWrappers = listenerWrappers.get(channel) ?? new Map();
      channelWrappers.set(callback, wrapper);
      listenerWrappers.set(channel, channelWrappers);
      ipcRenderer.on(channel, wrapper);
    }
  },
  off: (channel: string, callback: (...args: unknown[]) => void) => {
    if (listenerChannels.has(channel)) {
      const wrapper = listenerWrappers.get(channel)?.get(callback);
      if (!wrapper) return;
      ipcRenderer.removeListener(channel, wrapper);
      listenerWrappers.get(channel)?.delete(callback);
    }
  },
});
