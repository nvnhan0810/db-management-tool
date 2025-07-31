interface ElectronAPI {
  send: (channel: string, data: any) => void;
  invoke: (channel: string, data: any) => Promise<any>;
  receive: (channel: string, func: (...args: any[]) => void) => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export { };
