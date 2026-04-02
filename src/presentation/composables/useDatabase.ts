import type { DatabaseConnection } from '@/domain/connection/types';
import { toRaw } from 'vue';

export function useDatabase() {
  const connect = async (
    connection: DatabaseConnection
  ): Promise<{ success: boolean; error?: string | null }> => {
    const plain = toRaw(connection);
    const result = (await window.electron?.invoke('database:connect', plain)) as {
      success: boolean;
      error?: string;
    };
    return { success: result?.success ?? false, error: result?.error ?? null };
  };

  const disconnect = async (connectionId: string) => {
    await window.electron?.invoke('database:disconnect', connectionId);
  };

  const disconnectAll = async () => {
    await window.electron?.invoke('database:disconnectAll');
  };

  const hasActiveConnections = async (): Promise<boolean> => {
    return (await window.electron?.invoke('database:hasActiveConnections')) as boolean;
  };

  const getTables = async (
    connectionId: string
  ): Promise<Array<{ name: string; type?: string }>> => {
    const result = (await window.electron?.invoke('database:getTables', {
      connectionId,
    })) as Array<{ name: string; type?: string }>;
    return result ?? [];
  };

  const getDatabases = async (
    connectionId: string
  ): Promise<Array<{ name: string; tableCount?: number }>> => {
    const result = (await window.electron?.invoke('database:getDatabases', {
      connectionId,
    })) as Array<{ name: string; tableCount?: number }>;
    return result ?? [];
  };

  const getTableStructure = async (
    connectionId: string,
    tableName: string
  ): Promise<{
    columns: Array<Record<string, unknown>>;
    rows?: number;
    indexes?: Array<Record<string, unknown>>;
  }> => {
    return (await window.electron?.invoke('database:getTableStructure', {
      connectionId,
      tableName,
    })) as {
      columns: Array<Record<string, unknown>>;
      rows?: number;
      indexes?: Array<Record<string, unknown>>;
    };
  };

  const executeQuery = async (
    connectionId: string,
    query: string
  ): Promise<{
    success: boolean;
    data?: unknown[];
    fields?: unknown[];
    rowCount?: number;
    error?: string;
  }> => {
    return (await window.electron?.invoke('database:executeQuery', {
      connectionId,
      query,
    })) as {
      success: boolean;
      data?: unknown[];
      fields?: unknown[];
      rowCount?: number;
      error?: string;
    };
  };

  const exportTablesSql = async (
    connectionId: string,
    tableNames: string[]
  ): Promise<{ success: boolean; sql?: string; error?: string }> => {
    return (await window.electron?.invoke('database:exportTablesSql', {
      connectionId,
      tableNames,
    })) as { success: boolean; sql?: string; error?: string };
  };

  const chooseSavePath = async (args: {
    defaultFilename?: string;
    title?: string;
    extensions?: string[];
  }): Promise<{ success: boolean; canceled?: boolean; path?: string }> => {
    const r = (await window.electron?.invoke('dialog:chooseSavePath', args)) as
      | {
      success: boolean;
      canceled?: boolean;
      path?: string;
    }
      | undefined;
    if (!r) {
      return { success: false, canceled: true };
    }
    return r;
  };

  const chooseOpenSqlPath = async (): Promise<{ success: boolean; canceled?: boolean; path?: string }> => {
    const r = (await window.electron?.invoke('dialog:chooseOpenSqlPath')) as
      | { success: boolean; canceled?: boolean; path?: string }
      | undefined;
    if (!r) return { success: false, canceled: true };
    return r;
  };

  const exportTablesSqlToPath = async (
    connectionId: string,
    tableNames: string[],
    path: string
  ): Promise<{ success: boolean; path?: string; error?: string }> => {
    const r = (await window.electron?.invoke('database:exportTablesSqlToPath', {
      connectionId,
      tableNames,
      path,
    })) as { success: boolean; path?: string; error?: string } | undefined;
    if (!r) return { success: false, error: 'Export failed (no response from main process)' };
    return r;
  };

  const exportTablesSqlToPathWithJob = async (
    connectionId: string,
    tableNames: string[],
    path: string,
    jobId: string,
    mode: 'structure-data' | 'structure' | 'data'
  ): Promise<{ success: boolean; path?: string; error?: string }> => {
    const r = (await window.electron?.invoke('database:exportTablesSqlToPath', {
      connectionId,
      tableNames,
      path,
      jobId,
      mode,
    })) as { success: boolean; path?: string; error?: string } | undefined;
    if (!r) return { success: false, error: 'Export failed (no response from main process)' };
    return r;
  };

  const importSqlFromPathWithJob = async (args: {
    connectionId: string;
    path: string;
    jobId: string;
  }): Promise<{ success: boolean; executed?: number; totalBytes?: number; error?: string }> => {
    const r = (await window.electron?.invoke('database:importSqlFromPath', args)) as
      | { success: boolean; executed?: number; totalBytes?: number; error?: string }
      | undefined;
    if (!r) return { success: false, error: 'Import failed (no response from main process)' };
    return r;
  };

  const cancelImport = async (jobId: string): Promise<{ success: boolean; error?: string }> => {
    const r = (await window.electron?.invoke('database:cancelImport', { jobId })) as
      | { success: boolean; error?: string }
      | undefined;
    if (!r) return { success: false, error: 'Cancel failed' };
    return r;
  };

  const cancelExport = async (jobId: string): Promise<{ success: boolean; error?: string }> => {
    const r = (await window.electron?.invoke('database:cancelExport', { jobId })) as
      | { success: boolean; error?: string }
      | undefined;
    if (!r) return { success: false, error: 'Cancel failed' };
    return r;
  };

  const showItemInFolder = async (path: string): Promise<{ success: boolean; error?: string }> => {
    const r = (await window.electron?.invoke('shell:showItemInFolder', { path })) as
      | { success: boolean; error?: string }
      | undefined;
    if (!r) return { success: false, error: 'Open folder failed' };
    return r;
  };

  const dropTable = async (
    connectionId: string,
    tableName: string,
    tableType?: string
  ): Promise<{ success: boolean; error?: string }> => {
    const r = (await window.electron?.invoke('database:dropTable', {
      connectionId,
      tableName,
      tableType,
    })) as { success: boolean; error?: string } | undefined;
    if (!r) return { success: false, error: 'Drop failed (no response)' };
    return r;
  };

  const importSqlScript = async (
    connectionId: string,
    sql: string
  ): Promise<{ success: boolean; executed?: number; error?: string }> => {
    return (await window.electron?.invoke('database:importSqlScript', {
      connectionId,
      sql,
    })) as { success: boolean; executed?: number; error?: string };
  };

  const saveTextFile = async (args: {
    content: string;
    defaultFilename?: string;
    title?: string;
  }): Promise<{ success: boolean; canceled?: boolean; path?: string; error?: string }> => {
    return (await window.electron?.invoke('dialog:saveTextFile', args)) as {
      success: boolean;
      canceled?: boolean;
      path?: string;
      error?: string;
    };
  };

  const openSqlFile = async (): Promise<{
    canceled: boolean;
    content?: string | null;
    path?: string;
  }> => {
    return (await window.electron?.invoke('dialog:openSqlFile')) as {
      canceled: boolean;
      content?: string | null;
      path?: string;
    };
  };

  return {
    connect,
    disconnect,
    disconnectAll,
    hasActiveConnections,
    getTables,
    getDatabases,
    getTableStructure,
    executeQuery,
    exportTablesSql,
    chooseSavePath,
    chooseOpenSqlPath,
    exportTablesSqlToPath,
    exportTablesSqlToPathWithJob,
    cancelExport,
    showItemInFolder,
    dropTable,
    importSqlScript,
    importSqlFromPathWithJob,
    cancelImport,
    saveTextFile,
    openSqlFile,
  };
}
