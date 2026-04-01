import { app } from 'electron';
import fs from 'node:fs';
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
    // When packaging with Forge+Vite, native deps may be shipped as extra resources:
    // `<App>.app/Contents/Resources/keytar`
    try {
      return require(path.join(process.resourcesPath, 'keytar'));
    } catch (err0) {
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
        console.error('Failed to load keytar from all locations:', err, err0, err2, err3);
        throw new Error(
          'keytar module not found. Ensure keytar is shipped with the packaged app (Resources/keytar) and rebuilt for Electron.'
        );
      }
      }
    }
  }
}

/**
 * Load ssh2 module from various possible locations
 */
export function loadSsh2(): typeof import('ssh2') {
  const tried: Array<{ label: string; path: string; exists: boolean; error?: string }> = [];
  try {
    // Try to require from node_modules (dev) or unpacked location (packaged)
    return require('ssh2');
  } catch (err) {
    // Ship a minimal node_modules tree as an extra resource:
    // `<App>.app/Contents/Resources/extraResources/node_modules/...`
    try {
      const p = path.join(process.resourcesPath, 'extraResources', 'node_modules', 'ssh2');
      tried.push({ label: 'resources/extraResources', path: p, exists: fs.existsSync(p) });
      return require(p);
    } catch (err0) {
      // If direct require fails, try from app path
      try {
        const appPath = app.getAppPath();
        const ssh2Path = path.join(appPath, 'node_modules', 'ssh2');
        tried.push({ label: 'appPath/node_modules', path: ssh2Path, exists: fs.existsSync(ssh2Path) });
        return require(ssh2Path);
      } catch (err2) {
        // Last resort: try from asar unpacked location
        try {
          const appPath = app.getAppPath();
          const ssh2Path = path.join(
            appPath,
            '..',
            'app.asar.unpacked',
            'node_modules',
            'ssh2'
          );
          tried.push({
            label: 'app.asar.unpacked/node_modules',
            path: ssh2Path,
            exists: fs.existsSync(ssh2Path),
          });
          return require(ssh2Path);
        } catch (err3) {
          console.error('Failed to load ssh2 from all locations:', {
            resourcesPath: process.resourcesPath,
            appPath: (() => {
              try {
                return app.getAppPath();
              } catch {
                return null;
              }
            })(),
            tried,
            err,
            err0,
            err2,
            err3,
          });
          throw new Error(
            'ssh2 module not found. Ensure ssh2 is shipped with the packaged app (Resources/extraResources/node_modules/ssh2).'
          );
        }
      }
    }
  }
}

/**
 * Load pg module from various possible locations.
 * pg has internal circular dependencies that break when force-bundled by rollup/esbuild,
 * so it must be loaded dynamically at runtime like ssh2.
 */
export function loadPg(): typeof import('pg') {
  const tried: Array<{ label: string; path: string; exists: boolean; error?: string }> = [];
  try {
    return require('pg');
  } catch (err) {
    try {
      const p = path.join(process.resourcesPath, 'extraResources', 'node_modules', 'pg');
      tried.push({ label: 'resources/extraResources', path: p, exists: fs.existsSync(p) });
      return require(p);
    } catch (err0) {
      try {
        const appPath = app.getAppPath();
        const pgPath = path.join(appPath, 'node_modules', 'pg');
        tried.push({ label: 'appPath/node_modules', path: pgPath, exists: fs.existsSync(pgPath) });
        return require(pgPath);
      } catch (err2) {
        console.error('Failed to load pg from all locations:', {
          resourcesPath: process.resourcesPath,
          tried,
          err,
          err0,
          err2,
        });
        throw new Error(
          'pg module not found. Ensure pg is shipped with the packaged app (Resources/extraResources/node_modules/pg).'
        );
      }
    }
  }
}

// Lazy load modules - only load when needed
let _keytar: typeof import('keytar') | null = null;
let _ssh2: typeof import('ssh2') | null = null;
let _pg: typeof import('pg') | null = null;

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

/**
 * Get pg module (lazy loaded)
 */
export function getPg(): typeof import('pg') {
  if (!_pg) {
    _pg = loadPg();
  }
  return _pg;
}
