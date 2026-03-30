import { app } from 'electron';
import path from 'node:path';

export function loadKeytar(): typeof import('keytar') {
  try {
    return require('keytar');
  } catch {
    try {
      const appPath = app.getAppPath();
      return require(path.join(appPath, 'node_modules', 'keytar'));
    } catch {
      try {
        const appPath = app.getAppPath();
        return require(path.join(appPath, '..', 'app.asar.unpacked', 'node_modules', 'keytar'));
      } catch (err) {
        throw new Error('keytar module not found. Please ensure keytar is installed and rebuilt for Electron.');
      }
    }
  }
}

export function loadSsh2(): typeof import('ssh2') {
  try {
    return require('ssh2');
  } catch {
    try {
      const appPath = app.getAppPath();
      return require(path.join(appPath, 'node_modules', 'ssh2'));
    } catch {
      try {
        const appPath = app.getAppPath();
        return require(path.join(appPath, '..', 'app.asar.unpacked', 'node_modules', 'ssh2'));
      } catch (err) {
        throw new Error('ssh2 module not found. Please ensure ssh2 is installed and rebuilt for Electron.');
      }
    }
  }
}

let _keytar: typeof import('keytar') | null = null;
let _ssh2: typeof import('ssh2') | null = null;

export function getKeytar(): typeof import('keytar') {
  if (!_keytar) _keytar = loadKeytar();
  return _keytar;
}

export function getSsh2(): typeof import('ssh2') {
  if (!_ssh2) _ssh2 = loadSsh2();
  return _ssh2;
}

export function getSsh2Client(): new () => import('ssh2').Client {
  return getSsh2().Client;
}
