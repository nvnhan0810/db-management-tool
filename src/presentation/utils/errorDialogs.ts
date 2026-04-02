import { ElMessageBox } from 'element-plus';

type ShowErrorDialogArgs = {
  title: string;
  message: string;
  details?: string;
  sql?: string;
};

function asText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (v instanceof Error) return v.stack ?? v.message;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function showErrorDialog(args: ShowErrorDialogArgs): Promise<void> {
  const title = args.title || 'Error';
  const parts: string[] = [];
  if (args.message) parts.push(args.message);
  if (args.sql) parts.push(`\n--- SQL ---\n${args.sql}`);
  if (args.details) parts.push(`\n--- Details ---\n${args.details}`);
  const full = parts.join('\n');

  try {
    await ElMessageBox.confirm(full, title, {
      confirmButtonText: 'Close',
      cancelButtonText: 'Copy error',
      type: 'error',
      distinguishCancelAndClose: true,
      closeOnClickModal: false,
      closeOnPressEscape: true,
    });
  } catch (action) {
    // cancel => copy
    const ok = await copyToClipboard(full);
    // If copy fails, just close silently (no toast per requirement).
    if (!ok) {
      try {
        await ElMessageBox.alert(full, title, {
          confirmButtonText: 'Close',
          type: 'error',
        });
      } catch {
        /* ignore */
      }
    }
  }
}

export async function showSqlErrorDialog(
  title: string,
  error: unknown,
  sql?: string,
  details?: string
): Promise<void> {
  const msg = error instanceof Error ? error.message : asText(error);
  const det = details ?? (error instanceof Error ? error.stack : undefined);
  await showErrorDialog({ title, message: msg, details: det, sql });
}

