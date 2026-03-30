import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  ordinal_position?: number;
  character_set?: string;
  collation?: string;
  default_value?: string;
  extra?: string;
  foreign_key?: string;
  comment?: string;
}

export interface TableIndex {
  name: string;
  algorithm?: string;
  is_unique: boolean;
  column_name: string;
}

export interface TableData {
  name: string;
  columns: TableColumn[];
  rows?: number;
  indexes?: TableIndex[];
}

export interface QueryData {
  query: string;
  result?: {
    success: boolean;
    data?: unknown[];
    fields?: unknown[];
    error?: string;
    rowCount?: number;
    executionTime?: number;
    message?: string;
  };
}

export interface ExecutedQuery {
  sql: string;
  timestamp: Date;
  success: boolean;
  error?: string;
  executionTime?: number;
}

export interface TableTabState {
  displayMode: 'data' | 'structure';
  filterRows: Array<{ apply: boolean; column: string; operator: string; value: string }>;
  tableData: unknown[];
  isLoadingData: boolean;
  recordsPerPage: number;
  currentPage: number;
  totalPages: number;
  generatedSQL: string;
  executedQueries: ExecutedQuery[];
}

export interface QueryTabState {
  query: string;
  result?: unknown;
  isExecuting: boolean;
  executedQueries: ExecutedQuery[];
}

export const useTableStore = defineStore('table', () => {
  const tabs = ref<
    Array<{ id: string; title: string; type: 'table' | 'query'; data?: TableData | QueryData }>
  >([]);
  const activeTab = ref<string | null>(null);
  const tableTabStates = ref<Map<string, TableTabState | QueryTabState>>(new Map());
  const queryCounter = ref(1);

  const hasTabs = computed(() => tabs.value.length > 0);

  const activeTableState = computed(() => {
    if (!activeTab.value || !tableTabStates.value.has(activeTab.value)) return null;
    return tableTabStates.value.get(activeTab.value) as TableTabState | null;
  });

  const displayMode = computed({
    get: () => activeTableState.value?.displayMode ?? 'structure',
    set: (v: 'data' | 'structure') => {
      if (activeTableState.value) activeTableState.value.displayMode = v;
    },
  });

  const filterRows = computed({
    get: () => activeTableState.value?.filterRows ?? [],
    set: (v: TableTabState['filterRows']) => {
      if (activeTableState.value) activeTableState.value.filterRows = v;
    },
  });

  const tableData = computed({
    get: () => activeTableState.value?.tableData ?? [],
    set: (v: unknown[]) => {
      if (activeTableState.value) activeTableState.value.tableData = v;
    },
  });

  const isLoadingData = computed({
    get: () => activeTableState.value?.isLoadingData ?? false,
    set: (v: boolean) => {
      if (activeTableState.value) activeTableState.value.isLoadingData = v;
    },
  });

  const recordsPerPage = computed({
    get: () => activeTableState.value?.recordsPerPage ?? 25,
    set: (v: number) => {
      if (activeTableState.value) activeTableState.value.recordsPerPage = v;
    },
  });

  const currentPage = computed({
    get: () => activeTableState.value?.currentPage ?? 1,
    set: (v: number) => {
      if (activeTableState.value) activeTableState.value.currentPage = v;
    },
  });

  const totalPages = computed({
    get: () => activeTableState.value?.totalPages ?? 1,
    set: (v: number) => {
      if (activeTableState.value) activeTableState.value.totalPages = v;
    },
  });

  const executedQueries = computed({
    get: () => {
      const state = activeTableState.value;
      if (state && 'executedQueries' in state) return state.executedQueries ?? [];
      return [];
    },
    set: (v: ExecutedQuery[]) => {
      if (activeTableState.value && 'executedQueries' in activeTableState.value) {
        activeTableState.value.executedQueries = v;
      }
    },
  });

  const addExecutedQuery = (
    sql: string,
    success: boolean,
    error?: string,
    executionTime?: number
  ) => {
    if (!activeTab.value || !tableTabStates.value.has(activeTab.value)) return;

    const state = tableTabStates.value.get(activeTab.value)!;
    if (!('executedQueries' in state)) return;

    const last = state.executedQueries[0];
    if (last?.sql === sql && last.success === success) return;

    state.executedQueries.unshift({
      sql,
      timestamp: new Date(),
      success,
      error,
      executionTime,
    });
    if (state.executedQueries.length > 10) {
      state.executedQueries = state.executedQueries.slice(0, 10);
    }
  };

  const getActiveTabContent = () => {
    if (!activeTab.value) return null;
    return tabs.value.find((t) => t.id === activeTab.value) ?? null;
  };

  const addTableTab = async (
    tableData: TableData,
    connectionId?: string
  ): Promise<string> => {
    const tabId = `table-${tableData.name}-${Date.now()}`;
    const existing = tabs.value.find(
      (t) => t.type === 'table' && t.data && 'name' in t.data && t.data.name === tableData.name
    );
    if (existing) {
      activeTab.value = existing.id;
      return existing.id;
    }

    const newTab = {
      id: tabId,
      title: tableData.name,
      type: 'table' as const,
      data: tableData,
    };
    tabs.value.push(newTab);
    activeTab.value = tabId;

    const tableState: TableTabState = {
      displayMode: 'data',
      filterRows: [],
      tableData: [],
      isLoadingData: false,
      recordsPerPage: 25,
      currentPage: 1,
      totalPages: 1,
      generatedSQL: '',
      executedQueries: [
        {
          sql: `SELECT * FROM ${tableData.name} LIMIT 25`,
          timestamp: new Date(),
          success: true,
        },
      ],
    };
    tableTabStates.value.set(tabId, tableState);

    await loadTableData(tabId, tableData.name, connectionId);
    return tabId;
  };

  const addQueryTab = () => {
    const queryId = `query-${Date.now()}`;
    const title = `Query ${queryCounter.value}`;
    queryCounter.value++;

    const newTab = {
      id: queryId,
      title,
      type: 'query' as const,
      data: { query: '', result: undefined } as QueryData,
    };
    tabs.value.push(newTab);
    activeTab.value = queryId;

    const queryState: QueryTabState = {
      query: '',
      result: undefined,
      isExecuting: false,
      executedQueries: [],
    };
    tableTabStates.value.set(queryId, queryState);
  };

  const closeTab = (tabId: string) => {
    const index = tabs.value.findIndex((t) => t.id === tabId);
    if (index < 0) return;

    tabs.value.splice(index, 1);
    tableTabStates.value.delete(tabId);

    if (activeTab.value === tabId) {
      activeTab.value =
        tabs.value[Math.min(index, tabs.value.length - 1)]?.id ?? null;
    }
  };

  const loadTableData = async (
    tabId: string,
    tableName: string,
    connectionId?: string
  ) => {
    const state = tableTabStates.value.get(tabId) as TableTabState | undefined;
    if (!state) return;

    try {
      state.isLoadingData = true;
      const offset = (state.currentPage - 1) * state.recordsPerPage;
      const sql = `SELECT * FROM ${tableName} LIMIT ${state.recordsPerPage} OFFSET ${offset}`;

      const result = (await window.electron?.invoke('database:query', {
        connectionId: connectionId ?? 'default',
        query: sql,
      })) as { success: boolean; data?: unknown[]; error?: string };

      if (result?.success) {
        state.tableData = result.data ?? [];
        addExecutedQuery(sql, true);
      } else {
        throw new Error(result?.error ?? 'Failed to load table data');
      }
    } catch (err) {
      const offset = (state.currentPage - 1) * state.recordsPerPage;
      const sql = `SELECT * FROM ${tableName} LIMIT ${state.recordsPerPage} OFFSET ${offset}`;
      addExecutedQuery(sql, false, err instanceof Error ? err.message : 'Failed to load');
    } finally {
      state.isLoadingData = false;
    }
  };

  const executeQuery = async (
    query: string,
    connectionId?: string
  ): Promise<{
    success: boolean;
    data?: unknown[];
    fields?: unknown[];
    rowCount?: number;
    executionTime?: number;
    error?: string;
  } | null> => {
    if (!activeTab.value) return null;

    const start = Date.now();

    try {
      const result = (await window.electron?.invoke('database:query', {
        connectionId: connectionId ?? 'default',
        query,
      })) as {
        success: boolean;
        data?: unknown[];
        fields?: unknown[];
        rowCount?: number;
        error?: string;
      };

      const executionTime = Date.now() - start;

      if (result?.success) {
        const content = getActiveTabContent();
        if (content?.type === 'query' && content.data) {
          (content.data as QueryData).result = {
            success: true,
            data: result.data ?? [],
            fields: result.fields ?? [],
            rowCount: result.rowCount ?? 0,
            executionTime,
          };
        }
        addExecutedQuery(query, true, undefined, executionTime);
        return {
          success: true,
          data: result.data,
          fields: result.fields,
          rowCount: result.rowCount,
          executionTime,
        };
      }

      throw new Error(result?.error ?? 'Query failed');
    } catch (err) {
      const executionTime = Date.now() - start;
      const msg = err instanceof Error ? err.message : 'Query execution failed';

      const content = getActiveTabContent();
      if (content?.type === 'query' && content.data) {
        (content.data as QueryData).result = {
          success: false,
          error: msg,
          executionTime,
        };
      }
      addExecutedQuery(query, false, msg, executionTime);
      return { success: false, error: msg, executionTime };
    }
  };

  return {
    tabs,
    activeTab,
    tableTabStates,
    queryCounter,
    hasTabs,
    activeTableState,
    displayMode,
    filterRows,
    tableData,
    isLoadingData,
    recordsPerPage,
    currentPage,
    totalPages,
    executedQueries,
    addTableTab,
    addQueryTab,
    closeTab,
    addExecutedQuery,
    getActiveTabContent,
    loadTableData,
    executeQuery,
  };
});
