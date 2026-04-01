import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const nodeModulesDir = path.join(repoRoot, 'node_modules');
const outNodeModulesDir = path.join(repoRoot, 'extraResources', 'node_modules');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function modulePackageJson(name) {
  return path.join(nodeModulesDir, name, 'package.json');
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function rmDir(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dest) {
  rmDir(dest);
  fs.cpSync(src, dest, { recursive: true });
}

function resolveDeps(rootModuleNames) {
  const seen = new Set();
  const queue = [...rootModuleNames];

  while (queue.length) {
    const name = queue.shift();
    if (!name || seen.has(name)) continue;

    const pkgPath = modulePackageJson(name);
    if (!fs.existsSync(pkgPath)) {
      throw new Error(`Missing dependency "${name}" in node_modules (expected: ${pkgPath})`);
    }

    seen.add(name);
    const pkg = readJson(pkgPath);
    const deps = {
      ...(pkg.dependencies ?? {}),
      // ssh2 can load optional deps at runtime; include them so it doesn't break in packaged apps.
      ...(pkg.optionalDependencies ?? {}),
    };

    for (const depName of Object.keys(deps)) {
      if (!seen.has(depName)) queue.push(depName);
    }
  }

  return Array.from(seen);
}

function main() {
  // Dependencies that must be runtime-require'able in packaged app.
  // We keep these out of the Vite bundle and ship them as extra resources.
  // pg (node-postgres) has internal circular dependencies that break when force-bundled
  // by rollup/esbuild, so it must be shipped externally like ssh2.
  const roots = ['ssh2', 'pg'];
  const all = resolveDeps(roots);
  // pg-cloudflare is only for Cloudflare Workers; desktop Node never loads it.
  const skipCopy = new Set(['pg-cloudflare']);

  ensureDir(outNodeModulesDir);

  for (const name of all) {
    if (skipCopy.has(name)) continue;
    const src = path.join(nodeModulesDir, name);
    const dest = path.join(outNodeModulesDir, name);
    copyDir(src, dest);
  }

  // Small marker file for debugging/verifying packaged resources
  const marker = path.join(repoRoot, 'extraResources', 'EXTRA_RESOURCES_READY');
  fs.writeFileSync(marker, `ok ${new Date().toISOString()}\nmodules=${all.join(',')}\n`, 'utf-8');
  process.stdout.write(`[prepare-extra-resources] Copied ${all.length} modules to extraResources/node_modules\n`);
}

main();

