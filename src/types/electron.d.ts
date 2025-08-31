interface ElectronAPI {
  invoke: (channel: string, data: any) => Promise<any>;
  on: (channel: string, callback: Function) => void;
  off: (channel: string, callback: Function) => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export { };
