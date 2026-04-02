import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import started from 'electron-squirrel-startup';
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import { shell } from 'electron';
import { databaseService } from './infrastructure/database/databaseService';
import { deleteSecret, getSecret, saveSecret } from './main-secrets';

const exportJobs = new Map<string, { abort: AbortController; outPath: string }>();

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
  try {
    const { id, value } = args ?? ({} as { id?: string; value?: string });
    if (!id || typeof value !== 'string') {
      return { success: false, error: 'Invalid arguments for secrets:save' };
    }
    await saveSecret(id, value);
    return { success: true };
  } catch (err) {
    const inspected = util.inspect(err, { depth: 8, colors: false });
    const message = err instanceof Error ? err.message : String(err);
    console.error('[secrets:save] failed', { message, inspected });
    return { success: false, error: `${message}\n${inspected}` };
  }
});

ipcMain.handle('secrets:get', async (_event, args: { id: string }) => {
  try {
    const { id } = args ?? ({} as { id?: string });
    if (!id) return { success: false, error: 'Invalid arguments for secrets:get' };
    const value = await getSecret(id);
    return { success: true, value };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[secrets:get] failed', message);
    return { success: false, error: message };
  }
});

ipcMain.handle('secrets:delete', async (_event, args: { id: string }) => {
  try {
    const { id } = args ?? ({} as { id?: string });
    if (!id) return { success: false, error: 'Invalid arguments for secrets:delete' };
    await deleteSecret(id);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[secrets:delete] failed', message);
    return { success: false, error: message };
  }
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
    const inspected = util.inspect(error, { depth: 8, colors: false });
    console.error('[database:connect] failed', { msg, inspected, connection });
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

ipcMain.handle(
  'dialog:chooseSavePath',
  async (
    _event,
    args?: { defaultFilename?: string; title?: string; extensions?: string[] }
  ) => {
    const { defaultFilename, title, extensions } = args ?? {};
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePath } = await dialog.showSaveDialog(
      win ?? BrowserWindow.getAllWindows()[0],
      {
        title: title ?? 'Save file',
        defaultPath: defaultFilename ?? 'export.sql',
        filters: [
          { name: 'SQL', extensions: extensions ?? ['sql'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      }
    );
    if (canceled || !filePath) return { success: false, canceled: true };
    return { success: true, path: filePath };
  }
);

ipcMain.handle(
  'database:exportTablesSql',
  async (_event, args: { connectionId: string; tableNames: string[] }) => {
    try {
      const { connectionId, tableNames } = args ?? {};
      if (!connectionId || !Array.isArray(tableNames)) {
        return { success: false, error: 'Missing connectionId or tableNames' };
      }
      const sql = await databaseService.exportTablesSql(connectionId, tableNames);
      return { success: true, sql };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }
);

ipcMain.handle(
  'database:exportTablesSqlToPath',
  async (
    _event,
    args: { connectionId: string; tableNames: string[]; path: string; jobId: string }
  ) => {
    try {
      const { connectionId, tableNames, path: outPath, jobId } = args ?? {};
      if (!connectionId || !Array.isArray(tableNames) || !outPath || !jobId) {
        return { success: false, error: 'Missing connectionId, tableNames, path, or jobId' };
      }

      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      const send = (payload: unknown) => {
        try {
          win?.webContents?.send('export:progress', payload);
        } catch {
          /* ignore */
        }
      };

      const abort = new AbortController();
      exportJobs.set(jobId, { abort, outPath });

      send({ stage: 'start', jobId, totalTables: tableNames.length });
      await databaseService.exportTablesSqlToPath(
        connectionId,
        tableNames,
        outPath,
        (p) => send({ ...p, jobId }),
        abort.signal
      );
      send({ stage: 'done', jobId, path: outPath });
      exportJobs.delete(jobId);
      return { success: true, path: outPath };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (args?.jobId) exportJobs.delete(args.jobId);
      return { success: false, error: msg };
    }
  }
);

ipcMain.handle('database:cancelExport', async (_event, args: { jobId: string }) => {
  const job = exportJobs.get(args?.jobId);
  if (!job) return { success: false, error: 'Job not found' };
  job.abort.abort();
  return { success: true };
});

ipcMain.handle('shell:showItemInFolder', async (_event, args: { path: string }) => {
  const p = args?.path;
  if (!p) return { success: false, error: 'Missing path' };
  shell.showItemInFolder(p);
  return { success: true };
});

ipcMain.handle(
  'database:importSqlScript',
  async (_event, args: { connectionId: string; sql: string }) => {
    const { connectionId, sql } = args ?? {};
    if (!connectionId || typeof sql !== 'string') {
      throw new Error('Missing connectionId or sql');
    }
    return databaseService.importSqlScript(connectionId, sql);
  }
);

ipcMain.handle(
  'dialog:saveTextFile',
  async (
    _event,
    args: { defaultFilename?: string; content: string; title?: string }
  ) => {
    const { content, defaultFilename, title } = args ?? {};
    if (typeof content !== 'string') {
      return { success: false, error: 'Invalid content' };
    }
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePath } = await dialog.showSaveDialog(win ?? BrowserWindow.getAllWindows()[0], {
      title: title ?? 'Save SQL',
      defaultPath: defaultFilename ?? 'export.sql',
      filters: [
        { name: 'SQL', extensions: ['sql'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true, path: filePath };
  }
);

ipcMain.handle('dialog:openSqlFile', async () => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
    title: 'Open SQL file',
    properties: ['openFile'],
    filters: [
      { name: 'SQL', extensions: ['sql'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, content: null };
  }
  const content = fs.readFileSync(result.filePaths[0], 'utf-8');
  return { canceled: false, content, path: result.filePaths[0] };
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
