/**
 * Splits SQL into statements on `;` outside of single-quoted strings.
 * Does not handle PostgreSQL dollar-quoted bodies ($$...$$) — complex dumps may need pg_dump.
 */
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
      if (t && !t.startsWith('--')) {
        out.push(t);
      }
      buf = '';
      continue;
    }
    buf += c;
  }
  const t = buf.trim();
  if (t && !t.startsWith('--')) {
    out.push(t);
  }
  return out;
}
