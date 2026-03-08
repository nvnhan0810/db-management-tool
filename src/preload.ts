import { contextBridge, ipcRenderer } from 'electron';

const invokeChannels = [
  'database:connect',
  'database:disconnect',
  'database:disconnectAll',
  'database:hasActiveConnections',
  'database:query',
  'database:getTables',
  'database:getTableStructure',
  'database:getDatabases',
  'database:executeQuery',
  'reload:prevent',
  'window:minimize',
  'window:maximize',
  'window:close',
  'secrets:save',
  'secrets:get',
  'secrets:delete',
];

contextBridge.exposeInMainWorld('electron', {
  invoke: async (channel: string, data?: unknown) => {
    if (invokeChannels.includes(channel)) {
      return await ipcRenderer.invoke(channel, data);
    }
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (channel === 'reload-prevented') {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
  off: (channel: string, callback: (...args: unknown[]) => void) => {
    if (channel === 'reload-prevented') {
      ipcRenderer.removeListener(channel, callback as () => void);
    }
  },
});
