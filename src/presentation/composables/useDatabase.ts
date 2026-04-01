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

  return {
    connect,
    disconnect,
    disconnectAll,
    hasActiveConnections,
    getTables,
    getDatabases,
    getTableStructure,
    executeQuery,
  };
}
