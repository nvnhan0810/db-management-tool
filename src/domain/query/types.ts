export interface QueryHistoryItem {
  connection: string;
  query: string;
  timestamp: string;
}

export interface QueryResult {
  success: boolean;
  data?: unknown[];
  fields?: unknown[];
  rowCount?: number;
  error?: string;
}
