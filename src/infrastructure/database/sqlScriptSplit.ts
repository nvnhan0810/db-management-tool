/**
 * Splits SQL into statements on `;` outside of single-quoted strings.
 * Does not handle PostgreSQL dollar-quoted bodies ($$...$$) — complex dumps may need pg_dump.
 */
export function hasExecutableSql(sql: string): boolean {
  let i = 0;

  while (i < sql.length) {
    while (i < sql.length && /\s/.test(sql[i])) i++;

    if (sql.startsWith('--', i)) {
      const nextLine = sql.indexOf('\n', i + 2);
      if (nextLine === -1) return false;
      i = nextLine + 1;
      continue;
    }

    if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) return false;
      i = end + 2;
      continue;
    }

    return i < sql.length;
  }

  return false;
}

export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inSingle = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'" && sql[i + 1] === "'") {
      buf += "''";
      i++;
      continue;
    }
    if (c === "'") {
      inSingle = !inSingle;
      buf += c;
      continue;
    }
    if (!inSingle && c === ';') {
      const t = buf.trim();
      if (hasExecutableSql(t)) {
        out.push(t);
      }
      buf = '';
      continue;
    }
    buf += c;
  }
  const t = buf.trim();
  if (hasExecutableSql(t)) {
    out.push(t);
  }
  return out;
}
