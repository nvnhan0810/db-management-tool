interface ElectronAPI {
  invoke: (channel: string, data: any) => Promise<any>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export { };
