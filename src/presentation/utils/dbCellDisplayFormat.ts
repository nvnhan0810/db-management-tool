/**
 * Display formatting for table cells (shared by grid + equality checks).
 * Keeps raw DB strings / UTC Date in a stable Y-m-d H:i:s style where applicable.
 */
export function formatDbCellDisplayValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{1,2}(:\d{1,2})?(\.\d+)?$/.test(s)) {
      return s.replace(/\s+/g, ' ').slice(0, 19);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + ' 00:00:00';
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\.\d+)?(?:Z)?$/i);
    if (iso) {
      const [, date, h, m, sec] = iso;
      const pad = (n: string) => n.padStart(2, '0');
      return `${date} ${pad(h)}:${pad(m)}:${pad(sec ?? '0')}`;
    }
    return s;
  }
  if (value instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const asMs = value > 1e12 ? value : value > 1e9 && value < 1e11 ? value * 1000 : NaN;
    if (!Number.isNaN(asMs)) {
      const d = new Date(asMs);
      if (!Number.isNaN(d.getTime())) return formatDbCellDisplayValue(d);
    }
    return String(value);
  }
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
}

export function isTemporalSqlType(sqlType: string): boolean {
  const x = sqlType.toLowerCase();
  if (/\bjsonb?\b/.test(x)) return false;
  return (
    /\btimestamp\b/.test(x) ||
    /\bdatetime\b/.test(x) ||
    /\bdate\b/.test(x) ||
    /\btimetz\b/.test(x) ||
    /\btime\b/.test(x)
  );
}
