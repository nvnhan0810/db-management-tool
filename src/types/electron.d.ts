interface ElectronAPI {
  invoke: (channel: string, data?: unknown) => Promise<unknown>;
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  off: (channel: string, callback: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};
