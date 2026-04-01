/**
 * Shrinks packaged Electron apps by removing Chromium locale data that is not needed
 * for a single-language (or small set) UI. The Electron runtime binary cannot be reduced;
 * locales are the largest removable chunk (~40–55 MB on macOS arm64).
 *
 * Safe keeps: English (en*) + Vietnamese (vi*) + Base.lproj (macOS).
 * Edit KEEP_PREFIXES if you need more UI languages for native Chromium dialogs.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Directory names under Chromium Resources / locales must start with one of these. */
const KEEP_PREFIXES = ['en', 'vi'];

function dirSizeSync(dir) {
  let total = 0;
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else total += ent.isFile() ? fs.statSync(p).size : 0;
    }
  };
  try {
    walk(dir);
  } catch {
    /* ignore */
  }
  return total;
}

/**
 * macOS: .../Electron Framework.framework/Versions/A/Resources/*.lproj
 */
function stripMacOSLocales(appBundlePath) {
  const resources = path.join(
    appBundlePath,
    'Contents',
    'Frameworks',
    'Electron Framework.framework',
    'Versions',
    'A',
    'Resources'
  );
  if (!fs.existsSync(resources)) {
    return { removed: 0, bytesFreed: 0 };
  }

  let removed = 0;
  let bytesFreed = 0;

  for (const name of fs.readdirSync(resources)) {
    if (!name.endsWith('.lproj')) continue;
    if (name === 'Base.lproj') continue;
    const keep = KEEP_PREFIXES.some((p) => name.startsWith(p));
    if (keep) continue;

    const full = path.join(resources, name);
    try {
      const st = fs.statSync(full);
      if (!st.isDirectory()) continue;
      bytesFreed += dirSizeSync(full);
      fs.rmSync(full, { recursive: true, force: true });
      removed++;
    } catch {
      /* ignore */
    }
  }

  return { removed, bytesFreed };
}

/**
 * Windows / Linux: resources/locales/*.pak
 */
function stripLocalesPak(appRoot) {
  const localesDir = path.join(appRoot, 'resources', 'locales');
  if (!fs.existsSync(localesDir)) {
    return { removed: 0, bytesFreed: 0 };
  }

  let removed = 0;
  let bytesFreed = 0;

  for (const name of fs.readdirSync(localesDir)) {
    if (!name.endsWith('.pak')) continue;
    const base = name.replace(/\.pak$/i, '').toLowerCase();
    const keep =
      base === 'en-us' ||
      base === 'en-gb' ||
      base.startsWith('en-') ||
      base === 'vi' ||
      base.startsWith('vi-');
    if (keep) continue;

    const full = path.join(localesDir, name);
    try {
      bytesFreed += fs.statSync(full).size;
      fs.unlinkSync(full);
      removed++;
    } catch {
      /* ignore */
    }
  }

  return { removed, bytesFreed };
}

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * @param {string} packagedOutputPath - .app bundle (darwin) or folder containing resources/locales (win/linux)
 */
export function stripPackagedAppFat(packagedOutputPath) {
  const resolved = path.resolve(packagedOutputPath);
  let result = { removed: 0, bytesFreed: 0 };

  if (process.platform === 'darwin') {
    if (resolved.endsWith('.app')) {
      result = stripMacOSLocales(resolved);
    }
  } else if (process.platform === 'win32' || process.platform === 'linux') {
    result = stripLocalesPak(resolved);
  }

  if (result.bytesFreed > 0 || result.removed > 0) {
    process.stdout.write(
      `[strip-packaged-app-fat] ${path.basename(resolved)}: removed ${result.removed} locale chunk(s), freed ~${formatMb(result.bytesFreed)}\n`
    );
  }

  return result;
}

function findDarwinAppBundles(rootDir) {
  const out = [];
  const top = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const ent of top) {
    if (ent.isDirectory() && ent.name.endsWith('.app')) {
      out.push(path.join(rootDir, ent.name));
    }
  }
  return out;
}

/**
 * Called from Electron Forge `postPackage` with `packageResult.outputPaths`.
 */
export function stripForgeOutputPaths(outputPaths) {
  if (!outputPaths?.length) return;

  let totalBytes = 0;
  for (const raw of outputPaths) {
    const p = path.resolve(raw);
    if (!fs.existsSync(p)) continue;

    if (process.platform === 'darwin') {
      if (p.endsWith('.app')) {
        totalBytes += stripPackagedAppFat(p).bytesFreed;
      } else {
        const apps = findDarwinAppBundles(p);
        if (apps.length === 0) {
          process.stderr.write(`[strip-packaged-app-fat] No .app under ${p}, skipping\n`);
        }
        for (const app of apps) {
          totalBytes += stripPackagedAppFat(app).bytesFreed;
        }
      }
    } else {
      totalBytes += stripPackagedAppFat(p).bytesFreed;
    }
  }

  if (totalBytes > 0) {
    process.stdout.write(
      `[strip-packaged-app-fat] Total locale data removed: ~${formatMb(totalBytes)}\n`
    );
  }
}
