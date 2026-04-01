import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import started from 'electron-squirrel-startup';
import fs from 'node:fs';
import path from 'node:path';
import { databaseService } from './infrastructure/database/databaseService';
import { deleteSecret, getSecret, saveSecret } from './main-secrets';

if (started) {
  app.quit();
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    // Keep the window background dark to match the fixed dark theme.
    backgroundColor: '#1e1e1e',
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }
};

app.on('ready', createWindow);

ipcMain.handle('secrets:save', async (_event, args: { id: string; value: string }) => {
  const { id, value } = args;
  if (!id || typeof value !== 'string') throw new Error('Invalid arguments for secrets:save');
  await saveSecret(id, value);
  return true;
});

ipcMain.handle('secrets:get', async (_event, args: { id: string }) => {
  const { id } = args;
  if (!id) throw new Error('Invalid arguments for secrets:get');
  return await getSecret(id);
});

ipcMain.handle('secrets:delete', async (_event, args: { id: string }) => {
  const { id } = args;
  if (!id) throw new Error('Invalid arguments for secrets:delete');
  await deleteSecret(id);
  return true;
});

app.on('before-quit', async (event) => {
  event.preventDefault();
  try {
    await databaseService.disconnectAll();
  } catch (err) {
    console.error('Error disconnecting on quit:', err);
  }
  app.exit(0);
});

app.on('window-all-closed', async () => {
  try {
    await databaseService.disconnectAll();
  } catch (err) {
    console.error('Error disconnecting on close:', err);
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('database:connect', async (_event, connection) => {
  try {
    const result = await databaseService.connect(connection);
    return { success: result, error: null };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to connect';
    return { success: false, error: msg };
  }
});

ipcMain.handle('database:disconnect', (_event, connectionId) =>
  databaseService.disconnect(connectionId)
);
ipcMain.handle('database:disconnectAll', () => databaseService.disconnectAll());
ipcMain.handle('database:hasActiveConnections', () =>
  databaseService.hasActiveConnections()
);

ipcMain.handle('database:query', async (_event, { connectionId, query }) => {
  console.log('[database:query]', { connectionId, query });
  return await databaseService.query(connectionId, query);
});
ipcMain.handle('database:getTables', async (_event, { connectionId }) =>
  databaseService.getTables(connectionId)
);
ipcMain.handle('database:getTableStructure', async (_event, { connectionId, tableName }) => {
  if (!connectionId || !tableName) throw new Error('Missing connectionId or tableName');
  return databaseService.getTableStructure(connectionId, tableName);
});
ipcMain.handle('database:getDatabases', async (_event, { connectionId }) => {
  if (!connectionId) throw new Error('Missing connectionId');
  return databaseService.getDatabases(connectionId);
});
ipcMain.handle('database:executeQuery', async (_event, { connectionId, query }) => {
  if (!connectionId || !query) throw new Error('Missing connectionId or query');
  console.log('[database:executeQuery]', { connectionId, query });
  return databaseService.executeQuery(connectionId, query);
});

ipcMain.handle('reload:prevent', (event, message) => {
  const window = BrowserWindow.getFocusedWindow();
  if (window) window.webContents.send('reload-prevented', message);
});

ipcMain.handle('window:minimize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    win.minimize();
    return { success: true };
  }
  return { success: false, error: 'No focused window' };
});

ipcMain.handle('window:maximize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    win.isMaximized() ? win.unmaximize() : win.maximize();
    return { success: true };
  }
  return { success: false, error: 'No focused window' };
});

ipcMain.handle('dialog:showOpenFile', async (_event, options?: { title?: string }) => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
    title: options?.title ?? 'Select SSH Private Key',
    properties: ['openFile'],
    filters: [
      { name: 'Private Key', extensions: ['pem', 'key', 'id_rsa'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, content: null };
  }
  try {
    const content = fs.readFileSync(result.filePaths[0], 'utf-8');
    return { canceled: false, content, path: result.filePaths[0] };
  } catch (err) {
    console.error('Failed to read private key file:', err);
    return { canceled: false, content: null, error: err instanceof Error ? err.message : 'Failed to read file' };
  }
});

ipcMain.handle('window:close', () => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (win) {
    win.destroy();
    return { success: true };
  }
  return { success: false, error: 'No window found' };
});
