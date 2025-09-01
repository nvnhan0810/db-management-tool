import { app, BrowserWindow, ipcMain } from 'electron';
import started from 'electron-squirrel-startup';
import path from 'node:path';
import { databaseService } from './services/database';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false, // Disable default title bar
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    // Set dark theme
    backgroundColor: '#1a202c',
  });

  // Prevent reload when there are active database connections
  mainWindow.webContents.on('will-navigate', async (event, navigationUrl) => {
    // Check if this is a reload attempt (same URL)
    if (navigationUrl === mainWindow.webContents.getURL()) {
      try {
        const hasConnections = await databaseService.hasActiveConnections();
        if (hasConnections) {
          event.preventDefault();
          console.log('Reload prevented at main process level - active connections detected');
          // Send message to renderer to show warning
          mainWindow.webContents.send('reload-prevented', 'Cannot reload app while database connections are active');
        }
      } catch (error) {
        console.error('Error checking active connections:', error);
      }
    }
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Disconnect all database connections before app quits
app.on('before-quit', async (event) => {
  event.preventDefault();
  
  try {
    console.log('App is quitting, disconnecting all database connections...');
    await databaseService.disconnectAll();
    console.log('All database connections disconnected successfully');
  } catch (error) {
    console.error('Error disconnecting database connections on quit:', error);
  }
  
  // Force quit after disconnecting
  app.exit(0);
});

// Also handle window-all-closed event
app.on('window-all-closed', async () => {
  try {
    console.log('All windows closed, disconnecting all database connections...');
    await databaseService.disconnectAll();
    console.log('All database connections disconnected successfully');
  } catch (error) {
    console.error('Error disconnecting database connections on window close:', error);
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

// Database handlers
ipcMain.handle('database:connect', (event, connection) => {
  return databaseService.connect(connection);
});

ipcMain.handle('database:disconnect', (event, connectionId) => {
  return databaseService.disconnect(connectionId);
});

ipcMain.handle('database:disconnectAll', () => {
  return databaseService.disconnectAll();
});

ipcMain.handle('database:hasActiveConnections', () => {
  return databaseService.hasActiveConnections();
});

// Handle reload prevention message
ipcMain.handle('reload:prevent', (event, message) => {
  const window = BrowserWindow.getFocusedWindow();
  if (window) {
    window.webContents.send('reload-prevented', message);
  }
});

ipcMain.handle('database:query', (event, { connectionId, query }) => {
  return databaseService.query(connectionId, query);
});

ipcMain.handle('database:getTables', async (event, { connectionId }) => {
  return databaseService.getTables(connectionId);
});

ipcMain.handle('database:getTableStructure', async (event, { connectionId, tableName }) => {
  try {
    // Validate parameters
    if (!connectionId || !tableName) {
      throw new Error('Missing connectionId or tableName');
    }
    
    const result = await databaseService.getTableStructure(connectionId, tableName);
    
    if (result === undefined) {
      throw new Error('Database service returned undefined');
    }
    
    return result;
  } catch (error) {
    console.error('IPC getTableStructure error:', error);
    throw error;
  }
});

ipcMain.handle('database:getDatabases', async (event, { connectionId }) => {
  try {
    // Validate parameters
    if (!connectionId) {
      throw new Error('Missing connectionId');
    }
    
    const result = await databaseService.getDatabases(connectionId);
    
    if (result === undefined) {
      throw new Error('Database service returned undefined');
    }
    
    return result;
  } catch (error) {
    console.error('IPC getDatabases error:', error);
    throw error;
  }
});

ipcMain.handle('database:executeQuery', async (event, { connectionId, query }) => {
  try {
    // Validate parameters
    if (!connectionId || !query) {
      throw new Error('Missing connectionId or query');
    }
    
    const result = await databaseService.executeQuery(connectionId, query);
    
    if (result === undefined) {
      throw new Error('Database service returned undefined');
    }
    
    return result;
  } catch (error) {
    console.error('IPC executeQuery error:', error);
    throw error;
  }
});

// Window control handlers
ipcMain.handle('window:minimize', () => {
  const window = BrowserWindow.getFocusedWindow();
  if (window) {
    window.minimize();
  }
});

ipcMain.handle('window:maximize', () => {
  const window = BrowserWindow.getFocusedWindow();
  if (window) {
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  }
});

ipcMain.handle('window:close', () => {
  const window = BrowserWindow.getFocusedWindow();
  if (window) {
    window.close();
  }
});

ipcMain.handle('app:quit', () => {
  app.quit();
});