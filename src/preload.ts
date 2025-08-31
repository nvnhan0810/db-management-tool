// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';

const validChannels: string[] = [];

const invokeChannels = ['database:connect', 'database:disconnect', 'database:disconnectAll', 'database:query', 'database:getTables'];

contextBridge.exposeInMainWorld(
  'electron',
  {
    invoke: async (channel: string, data: any) => {
      if (invokeChannels.includes(channel)) {
        return await ipcRenderer.invoke(channel, data);
      }
    },
  }
)