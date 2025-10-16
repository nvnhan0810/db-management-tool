export interface QueryHistoryItem {
  connection: string;
  query: string;
  timestamp: string;
}

export interface QueryResult {
  success: boolean;
  data?: any[];
  fields?: any[];
  rowCount?: number;
  error?: string;
}
