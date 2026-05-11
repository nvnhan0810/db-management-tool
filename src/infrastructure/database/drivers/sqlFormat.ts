export function sanitizeTableIdent(name: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Invalid table name: ${name}`);
  }
  return name;
}

export function pgQuoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function mysqlQuoteDatabaseIdent(name: string): string {
  return `\`${name.replace(/`/g, '``')}\``;
}

export function pgLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (Buffer.isBuffer(v)) return `'\\x${v.toString('hex')}'::bytea`;
  if (v instanceof Date) return `'${v.toISOString()}'::timestamp with time zone`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

export function mysqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
  if (v instanceof Date) return `'${formatMysqlDate(v)}'`;
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function formatMysqlDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
