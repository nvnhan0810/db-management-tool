// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';

const validChannels: string[] = [];

const invokeChannels = ['database:connect', 'database:disconnect', 'database:disconnectAll', 'database:hasActiveConnections', 'database:query', 'database:getTables', 'database:getTableStructure', 'database:getDatabases', 'database:executeQuery', 'reload:prevent'];

contextBridge.exposeInMainWorld(
  'electron',
  {
    invoke: async (channel: string, data: any) => {
      if (invokeChannels.includes(channel)) {
        return await ipcRenderer.invoke(channel, data);
      }
    },
    on: (channel: string, callback: Function) => {
      if (channel === 'reload-prevented') {
        ipcRenderer.on(channel, (event, ...args) => callback(...args));
      }
    },
    off: (channel: string, callback: Function) => {
      if (channel === 'reload-prevented') {
        ipcRenderer.removeListener(channel, callback as any);
      }
    },
  }
)