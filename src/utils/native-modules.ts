import { app } from 'electron';
import path from 'node:path';

/**
 * Utility module for loading native modules in both dev and packaged environments
 * Handles dynamic require for modules that need to be unpacked from asar
 */

/**
 * Load keytar module from various possible locations
 */
export function loadKeytar(): typeof import('keytar') {
  try {
    // Try to require from node_modules (dev) or unpacked location (packaged)
    return require('keytar');
  } catch (err) {
    // If direct require fails, try from app path
    try {
      const appPath = app.getAppPath();
      const keytarPath = path.join(appPath, 'node_modules', 'keytar');
      return require(keytarPath);
    } catch (err2) {
      // Last resort: try from asar unpacked location
      try {
        const appPath = app.getAppPath();
        const keytarPath = path.join(appPath, '..', 'app.asar.unpacked', 'node_modules', 'keytar');
        return require(keytarPath);
      } catch (err3) {
        console.error('Failed to load keytar from all locations:', err, err2, err3);
        throw new Error('keytar module not found. Please ensure keytar is installed and rebuilt for Electron.');
      }
    }
  }
}

/**
 * Load ssh2 module from various possible locations
 */
export function loadSsh2(): typeof import('ssh2') {
  try {
    // Try to require from node_modules (dev) or unpacked location (packaged)
    return require('ssh2');
  } catch (err) {
    // If direct require fails, try from app path
    try {
      const appPath = app.getAppPath();
      const ssh2Path = path.join(appPath, 'node_modules', 'ssh2');
      return require(ssh2Path);
    } catch (err2) {
      // Last resort: try from asar unpacked location
      try {
        const appPath = app.getAppPath();
        const ssh2Path = path.join(appPath, '..', 'app.asar.unpacked', 'node_modules', 'ssh2');
        return require(ssh2Path);
      } catch (err3) {
        console.error('Failed to load ssh2 from all locations:', err, err2, err3);
        throw new Error('ssh2 module not found. Please ensure ssh2 is installed and rebuilt for Electron.');
      }
    }
  }
}

// Lazy load modules - only load when needed
let _keytar: typeof import('keytar') | null = null;
let _ssh2: typeof import('ssh2') | null = null;

/**
 * Get keytar module (lazy loaded)
 */
export function getKeytar(): typeof import('keytar') {
  if (!_keytar) {
    _keytar = loadKeytar();
  }
  return _keytar;
}

/**
 * Get ssh2 module (lazy loaded)
 */
export function getSsh2(): typeof import('ssh2') {
  if (!_ssh2) {
    _ssh2 = loadSsh2();
  }
  return _ssh2;
}

/**
 * Get ssh2 Client class (lazy loaded)
 */
export function getSsh2Client(): new () => import('ssh2').Client {
  return getSsh2().Client;
}
