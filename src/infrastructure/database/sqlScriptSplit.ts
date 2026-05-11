type ParserState =
  | 'normal'
  | 'singleQuote'
  | 'doubleQuote'
  | 'backtick'
  | 'lineComment'
  | 'blockComment'
  | 'dollarQuote';

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
  const splitter = new SqlStatementSplitter();
  return [...splitter.push(sql), ...splitter.flush()];
}

export class SqlStatementSplitter {
  private buffer = '';
  private carry = '';
  private state: ParserState = 'normal';
  private dollarQuoteTag = '';

  push(chunk: string): string[] {
    const out: string[] = [];
    const input = this.carry + chunk;
    this.carry = '';

    for (let i = 0; i < input.length; i++) {
      const c = input[i];
      const next = input[i + 1];

      if (this.state === 'normal') {
        if ((c === '-' || c === '/') && next === undefined) {
          this.carry = c;
          break;
        }

        if (c === '-' && next === '-') {
          this.append('--');
          this.state = 'lineComment';
          i++;
          continue;
        }

        if (c === '/' && next === '*') {
          this.append('/*');
          this.state = 'blockComment';
          i++;
          continue;
        }

        if (c === "'") {
          this.append(c);
          this.state = 'singleQuote';
          continue;
        }

        if (c === '"') {
          this.append(c);
          this.state = 'doubleQuote';
          continue;
        }

        if (c === '`') {
          this.append(c);
          this.state = 'backtick';
          continue;
        }

        if (c === '$') {
          const dollarQuoteTag = readDollarQuoteTag(input, i);
          if (dollarQuoteTag === null) {
            this.carry = input.slice(i);
            break;
          }
          if (dollarQuoteTag) {
            this.append(dollarQuoteTag);
            this.dollarQuoteTag = dollarQuoteTag;
            this.state = 'dollarQuote';
            i += dollarQuoteTag.length - 1;
            continue;
          }
        }

        if (c === ';') {
          this.flushBuffer(out);
          continue;
        }

        this.append(c);
        continue;
      }

      if (this.state === 'lineComment') {
        this.append(c);
        if (c === '\n') this.state = 'normal';
        continue;
      }

      if (this.state === 'blockComment') {
        if (c === '*' && next === undefined) {
          this.carry = c;
          break;
        }
        this.append(c);
        if (c === '*' && next === '/') {
          this.append('/');
          this.state = 'normal';
          i++;
        }
        continue;
      }

      if (this.state === 'singleQuote') {
        if (c === "'" && next === undefined) {
          this.carry = c;
          break;
        }
        this.append(c);
        if (c === "'" && next === "'") {
          this.append("'");
          i++;
          continue;
        }
        if (c === "'") this.state = 'normal';
        continue;
      }

      if (this.state === 'doubleQuote') {
        if (c === '"' && next === undefined) {
          this.carry = c;
          break;
        }
        this.append(c);
        if (c === '"' && next === '"') {
          this.append('"');
          i++;
          continue;
        }
        if (c === '"') this.state = 'normal';
        continue;
      }

      if (this.state === 'backtick') {
        if (c === '`' && next === undefined) {
          this.carry = c;
          break;
        }
        this.append(c);
        if (c === '`' && next === '`') {
          this.append('`');
          i++;
          continue;
        }
        if (c === '`') this.state = 'normal';
        continue;
      }

      if (this.state === 'dollarQuote') {
        if (
          c === '$' &&
          input.length - i < this.dollarQuoteTag.length &&
          this.dollarQuoteTag.startsWith(input.slice(i))
        ) {
          this.carry = input.slice(i);
          break;
        }
        if (input.startsWith(this.dollarQuoteTag, i)) {
          this.append(this.dollarQuoteTag);
          i += this.dollarQuoteTag.length - 1;
          this.dollarQuoteTag = '';
          this.state = 'normal';
          continue;
        }
        this.append(c);
      }
    }

    return out;
  }

  flush(): string[] {
    if (this.carry) {
      this.append(this.carry);
      this.carry = '';
    }

    const out: string[] = [];
    this.flushBuffer(out);
    return out;
  }

  private append(value: string): void {
    this.buffer += value;
  }

  private flushBuffer(out: string[]): void {
    const statement = this.buffer.trim();
    this.buffer = '';
    if (hasExecutableSql(statement)) {
      out.push(statement);
    }
  }
}

function readDollarQuoteTag(input: string, start: number): string | null | undefined {
  if (input[start] !== '$') return undefined;
  let i = start + 1;

  if (input[i] === '$') return '$$';
  if (i >= input.length) return null;

  if (!/[A-Za-z_]/.test(input[i])) return undefined;
  i++;

  while (i < input.length && /[A-Za-z0-9_]/.test(input[i])) {
    i++;
  }

  if (i >= input.length) return null;
  if (input[i] !== '$') return undefined;
  return input.slice(start, i + 1);
}
