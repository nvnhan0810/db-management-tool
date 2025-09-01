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
    data?: any[];
    fields?: any[];
    error?: string;
    rowCount?: number;
    executionTime?: number;
    message?: string;
  };
}

export interface Tab {
  id: string;
  title: string;
  type: 'table' | 'query';
  data?: TableData | QueryData;
}

export interface TableTabState {
  displayMode: 'data' | 'structure';
  filterRows: Array<{ apply: boolean; column: string; operator: string; value: string }>;
  tableData: any[];
  isLoadingData: boolean;
  recordsPerPage: number;
  currentPage: number;
  totalPages: number;
  generatedSQL: string;
  executedQueries: ExecutedQuery[];
}

export interface QueryTabState {
  query: string;
  result?: any;
  isExecuting: boolean;
  executedQueries: ExecutedQuery[];
}

export interface ExecutedQuery {
  sql: string;
  timestamp: Date;
  success: boolean;
  error?: string;
  executionTime?: number;
}

export const useTableStore = defineStore('table', () => {
  // State
  const tabs = ref<Array<{ id: string; title: string; type: 'table' | 'query'; data?: TableData | any }>>([]);
  const activeTab = ref<string | null>(null);
  const tableTabStates = ref<Map<string, TableTabState>>(new Map());
  const queryCounter = ref(1);

  // Getters
  const hasTabs = computed(() => tabs.value.length > 0);
  
  const activeTableState = computed(() => {
    if (!activeTab.value || !tableTabStates.value.has(activeTab.value)) {
      return null;
    }
    return tableTabStates.value.get(activeTab.value)!;
  });

  const displayMode = computed({
    get: () => activeTableState.value?.displayMode || 'structure',
    set: (value: 'data' | 'structure') => {
      if (activeTableState.value) {
        activeTableState.value.displayMode = value;
      }
    }
  });

  const filterRows = computed({
    get: () => activeTableState.value?.filterRows || [],
    set: (value: Array<{ apply: boolean; column: string; operator: string; value: string }>) => {
      if (activeTableState.value) {
        activeTableState.value.filterRows = value;
      }
    }
  });

  const tableData = computed({
    get: () => activeTableState.value?.tableData || [],
    set: (value: any[]) => {
      if (activeTableState.value) {
        activeTableState.value.tableData = value;
      }
    }
  });

  const isLoadingData = computed({
    get: () => activeTableState.value?.isLoadingData || false,
    set: (value: boolean) => {
      if (activeTableState.value) {
        activeTableState.value.isLoadingData = value;
      }
    }
  });

  const recordsPerPage = computed({
    get: () => activeTableState.value?.recordsPerPage || 25,
    set: (value: number) => {
      if (activeTableState.value) {
        activeTableState.value.recordsPerPage = value;
      }
    }
  });

  const currentPage = computed({
    get: () => activeTableState.value?.currentPage || 1,
    set: (value: number) => {
      if (activeTableState.value) {
        activeTableState.value.currentPage = value;
      }
    }
  });

  const totalPages = computed({
    get: () => activeTableState.value?.totalPages || 1,
    set: (value: number) => {
      if (activeTableState.value) {
        activeTableState.value.totalPages = value;
      }
    }
  });

  const executedQueries = computed({
    get: () => {
      // For table tabs, get from table state
      if (activeTableState.value) {
        return activeTableState.value.executedQueries || [];
      }
      
      // For query tabs, get from query tab state
      if (activeTab.value && tableTabStates.value.has(activeTab.value)) {
        const tabState = tableTabStates.value.get(activeTab.value);
        if (tabState && 'executedQueries' in tabState) {
          return tabState.executedQueries || [];
        }
      }
      
      return [];
    },
    set: (value: ExecutedQuery[]) => {
      if (activeTableState.value) {
        activeTableState.value.executedQueries = value;
      }
      
      // For query tabs, update query tab state
      if (activeTab.value && tableTabStates.value.has(activeTab.value)) {
        const tabState = tableTabStates.value.get(activeTab.value);
        if (tabState && 'executedQueries' in tabState) {
          tabState.executedQueries = value;
        }
      }
    }
  });

  // Actions
  const addTableTab = async (tableData: any, connectionId?: string) => {
    const tableId = `table-${tableData.name}-${Date.now()}`;
    
    // Check if table tab already exists
    const existingTab = tabs.value.find(tab => 
      tab.type === 'table' && tab.data && 'name' in tab.data && tab.data.name === tableData.name
    );
    
    if (existingTab) {
      activeTab.value = existingTab.id;
      return existingTab.id;
    }
    
    const newTab = {
      id: tableId,
      title: tableData.name,
      type: 'table' as const,
      data: tableData
    };
    
    tabs.value.push(newTab);
    activeTab.value = tableId;
    
    // Initialize table tab state
    const initialSQL = `SELECT * FROM ${tableData.name} LIMIT 25`;
    const tableState: TableTabState = {
      displayMode: 'data',
      filterRows: [],
      tableData: [],
      isLoadingData: false,
      recordsPerPage: 25,
      currentPage: 1,
      totalPages: 1,
      generatedSQL: '',
      executedQueries: [{
        sql: initialSQL,
        timestamp: new Date(),
        success: true
      }]
    };
    
    tableTabStates.value.set(tableId, tableState);
    
    // Auto-load table data
    await loadTableData(tableId, tableData.name, connectionId);
    
    return tableId;
  };

  const addQueryTab = () => {
    const queryId = `query-${Date.now()}`;
    const queryTitle = `Query ${queryCounter.value}`;
    
    const newTab = {
      id: queryId,
      title: queryTitle,
      type: 'query' as const,
      data: {
        query: '',
        result: undefined
      }
    };
    
    tabs.value.push(newTab);
    activeTab.value = queryId;
    queryCounter.value++;
    
    // Initialize query tab state
    const queryState: QueryTabState = {
      query: '',
      result: undefined,
      isExecuting: false,
      executedQueries: []
    };
    
    tableTabStates.value.set(queryId, queryState as any);
  };

  const closeTab = (tabId: string) => {
    const index = tabs.value.findIndex(tab => tab.id === tabId);
    if (index > -1) {
      tabs.value.splice(index, 1);
      
      // Remove table tab state if it exists
      if (tableTabStates.value.has(tabId)) {
        tableTabStates.value.delete(tabId);
      }
      
      // If closed tab was active, switch to another tab
      if (activeTab.value === tabId) {
        if (tabs.value.length > 0) {
          activeTab.value = tabs.value[Math.min(index, tabs.value.length - 1)].id;
        } else {
          activeTab.value = null;
        }
      }
    }
  };

  const addExecutedQuery = (sql: string, success: boolean, error?: string, executionTime?: number) => {
    if (!activeTab.value || !tableTabStates.value.has(activeTab.value)) {
      return;
    }
    
    const tabState = tableTabStates.value.get(activeTab.value)!;
    
    // Check if this exact SQL query was just added (avoid duplicates)
    // But allow different success/error states for the same SQL
    if ('executedQueries' in tabState) {
      const lastQuery = tabState.executedQueries[0];
      if (lastQuery && lastQuery.sql === sql && lastQuery.success === success) {
        return; // Skip if same query with same success/error state was just added
      }
      
      const query: ExecutedQuery = {
        sql,
        timestamp: new Date(),
        success,
        error,
        executionTime
      };
      
      tabState.executedQueries.unshift(query);
      
      // Keep only last 10 queries
      if (tabState.executedQueries.length > 10) {
        tabState.executedQueries = tabState.executedQueries.slice(0, 10);
      }
    }
  };

  const getActiveTabContent = () => {
    if (!activeTab.value) return null;
    return tabs.value.find(tab => tab.id === activeTab.value);
  };

  // Load table data from database
  const loadTableData = async (tabId: string, tableName: string, connectionId?: string) => {
    const tableState = tableTabStates.value.get(tabId);
    if (!tableState) return;

    try {
      tableState.isLoadingData = true;
      
      // Generate SQL for loading data with pagination
      const offset = (tableState.currentPage - 1) * tableState.recordsPerPage;
      const sql = `SELECT * FROM ${tableName} LIMIT ${tableState.recordsPerPage} OFFSET ${offset}`;
      
      // Execute query to get actual data
      const result = await window.electron.invoke('database:query', {
        connectionId: connectionId || 'default',
        query: sql
      });
      
      if (result.success) {
        // Update table data with real data (even if empty array)
        tableState.tableData = result.data || [];
        
        // Add to executed queries
        addExecutedQuery(sql, true);
        
        // Check if data is empty
        if (!result.data || result.data.length === 0) {
          // Table has no data
        }
      } else {
        throw new Error(result.error || 'Failed to load table data');
      }
    } catch (error) {
      // Add error to executed queries
      const offset = (tableState.currentPage - 1) * tableState.recordsPerPage;
      const sql = `SELECT * FROM ${tableName} LIMIT ${tableState.recordsPerPage} OFFSET ${offset}`;
      const errorMessage = error instanceof Error ? error.message : 'Failed to load table data';
      addExecutedQuery(sql, false, errorMessage);
    } finally {
      // Clear loading state
      tableState.isLoadingData = false;
    }
  };

  // Execute SQL query
  const executeQuery = async (query: string, connectionId?: string, isSelectedQuery?: boolean) => {
    if (!activeTab.value) return null;

    const startTime = Date.now();
    
    try {
      // Execute query
      const result = await window.electron.invoke('database:query', {
        connectionId: connectionId || 'default',
        query: query
      });
      
      const executionTime = Date.now() - startTime;
      
      if (result.success) {
        // Update query tab result
        const activeTabContent = getActiveTabContent();
        if (activeTabContent?.type === 'query' && activeTabContent.data) {
          const queryData = activeTabContent.data as QueryData;
          queryData.result = {
            success: true,
            data: result.data || [],
            fields: result.fields || [],
            rowCount: result.rowCount || 0,
            executionTime,
            message: result.message
          };
        }
        
        // Add to executed queries
        addExecutedQuery(query, true, undefined, executionTime);
        
        return {
          success: true,
          data: result.data || [],
          fields: result.fields || [],
          rowCount: result.rowCount || 0,
          executionTime,
          message: result.message
        };
      } else {
        throw new Error(result.error || 'Query failed');
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Query execution failed';
      
      // Update query tab result with error
      const activeTabContent = getActiveTabContent();
      if (activeTabContent?.type === 'query' && activeTabContent.data) {
        const queryData = activeTabContent.data as QueryData;
        queryData.result = {
          success: false,
          error: errorMessage,
          executionTime
        };
      }
      
      // Add error to executed queries
      addExecutedQuery(query, false, errorMessage, executionTime);
      
      return {
        success: false,
        error: errorMessage,
        executionTime
      };
    }
  };

  return {
    // State
    tabs,
    activeTab,
    tableTabStates,
    queryCounter,
    
    // Getters
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
    
    // Actions
    addTableTab,
    addQueryTab,
    closeTab,
    addExecutedQuery,
    getActiveTabContent,
    loadTableData,
    executeQuery
  };
});
