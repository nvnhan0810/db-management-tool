// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';

const validChannels: string[] = [];

const invokeChannels = ['database:connect'];

contextBridge.exposeInMainWorld(
  'electron',
  {
    send: (channel: string, data: any) => {
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data)
      }
    },
    receive: (channel: string, func: (...args: any[]) => void) => {
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender` 
        ipcRenderer.on(channel, (event, ...args) => func(...args))
      }
    },
    invoke: async (channel: string, data: any) => {
      if (invokeChannels.includes(channel)) {
        return await ipcRenderer.invoke(channel, data);
      }
    },
  }
)