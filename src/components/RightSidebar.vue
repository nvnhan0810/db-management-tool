<template>
  <div class="right-sidebar">
    <!-- Browser-style Tabs -->
    <div class="tabs-container">
      <div class="tabs-list">
        <div 
          v-for="tab in tabs" 
          :key="tab.id"
          class="tab-item"
          :class="{ active: activeTab === tab.id }"
          @click="setActiveTab(tab.id)"
        >
          <span class="tab-title">{{ tab.title }}</span>
          <el-button 
            size="small" 
            class="close-tab"
            @click.stop="closeTab(tab.id)"
          >
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
    
    <!-- Tab Content Area -->
    <div class="content-container">
      <div v-if="activeTab && getActiveTabContent()" class="content-area">
        <!-- Table Info Tab -->
        <div v-if="getActiveTabContent()?.type === 'table'" class="table-info">
          <div class="table-header">
            <h3>{{ getActiveTabContent()?.title }}</h3>
            <div class="table-actions">
              <el-button size="small" @click="generateSelectQuery">
                SELECT *
              </el-button>
              <el-button size="small" @click="generateDescribeQuery">
                DESCRIBE
              </el-button>
            </div>
          </div>
          
          <div class="table-details">
            <div class="detail-item">
              <span class="label">Table Name:</span>
              <span class="value">{{ (getActiveTabContent()?.data as TableData)?.name }}</span>
            </div>
            <div class="detail-item">
              <span class="label">Columns:</span>
              <span class="value">{{ (getActiveTabContent()?.data as TableData)?.columns?.length || 0 }}</span>
            </div>
            <div class="detail-item">
              <span class="label">Rows:</span>
              <span class="value">{{ (getActiveTabContent()?.data as TableData)?.rows || 'Unknown' }}</span>
            </div>
          </div>
          
          <!-- Columns List -->
          <div class="columns-section">
            <h4>Columns</h4>
            <div class="columns-list">
              <div 
                v-for="column in (getActiveTabContent()?.data as TableData)?.columns" 
                :key="column.name"
                class="column-item"
              >
                <div class="column-name">{{ column.name }}</div>
                <div class="column-type">{{ column.type }}</div>
                <div class="column-nullable">{{ column.nullable ? 'NULL' : 'NOT NULL' }}</div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Query Tab -->
        <div v-else-if="getActiveTabContent()?.type === 'query'" class="query-editor">
          <div class="query-header">
            <h3>{{ getActiveTabContent()?.title }}</h3>
            <div class="query-actions">
              <el-button size="small" type="primary" @click="executeQuery">
                Execute
              </el-button>
              <el-button size="small" @click="clearQuery">
                Clear
              </el-button>
            </div>
          </div>
          
          <div class="query-input">
            <el-input
              :model-value="(getActiveTabContent()?.data as QueryData)?.query || ''"
              @update:model-value="updateQuery"
              type="textarea"
              :rows="12"
              placeholder="Enter your SQL query here..."
              resize="none"
            />
          </div>
          
          <!-- Query Results -->
          <div v-if="(getActiveTabContent()?.data as QueryData)?.result" class="query-results">
            <h4>Results</h4>
            <el-table
              v-if="(getActiveTabContent()?.data as QueryData)?.result?.success"
              :data="(getActiveTabContent()?.data as QueryData)?.result?.data"
              style="width: 100%"
              height="300"
              border
            >
              <el-table-column
                v-for="field in (getActiveTabContent()?.data as QueryData)?.result?.fields"
                :key="field.name"
                :prop="field.name"
                :label="field.name"
              />
            </el-table>
            <div v-else class="error-message">
              {{ (getActiveTabContent()?.data as QueryData)?.result?.error }}
            </div>
          </div>
        </div>
      </div>
      
      <div v-else class="empty-state">
        <el-empty description="Click on a table to view its information" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Close } from '@element-plus/icons-vue';
import { computed, ref } from 'vue';

interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
}

interface TableData {
  name: string;
  columns: TableColumn[];
  rows?: number;
}

interface QueryData {
  query: string;
  result?: {
    success: boolean;
    data?: any[];
    fields?: any[];
    error?: string;
  };
}

interface Tab {
  id: string;
  title: string;
  type: 'table' | 'query';
  data?: TableData | QueryData;
}

const props = defineProps<{
  visible: boolean;
  activeTableName?: string;
}>();

const emit = defineEmits<{
  'close-sidebar': [];
  'table-selected': [tableName: string];
}>();

const tabs = ref<Tab[]>([]);
const activeTab = ref<string | null>(null);
const queryCounter = ref(1);

// Computed
const hasTabs = computed(() => tabs.value.length > 0);

// Methods
const setActiveTab = (tabId: string) => {
  activeTab.value = tabId;
  
  // Emit table-selected event if this is a table tab
  const tab = tabs.value.find(t => t.id === tabId);
  if (tab?.type === 'table' && tab.data && 'name' in tab.data) {
    emit('table-selected', tab.data.name);
  }
};

const getActiveTabContent = () => {
  return tabs.value.find(tab => tab.id === activeTab.value);
};

const addQueryTab = () => {
  const queryId = `query-${Date.now()}`;
  const queryTitle = `Query ${queryCounter.value}`;
  
  const newTab: Tab = {
    id: queryId,
    title: queryTitle,
    type: 'query',
    data: {
      query: '',
      result: undefined
    }
  };
  
  tabs.value.push(newTab);
  activeTab.value = queryId;
  queryCounter.value++;
};

const addTableTab = (tableData: TableData) => {
  const tableId = `table-${tableData.name}-${Date.now()}`;
  
  // Check if table tab already exists
  const existingTab = tabs.value.find(tab => 
    tab.type === 'table' && tab.data && 'name' in tab.data && tab.data.name === tableData.name
  );
  
  if (existingTab) {
    activeTab.value = existingTab.id;
    return;
  }
  
  const newTab: Tab = {
    id: tableId,
    title: tableData.name,
    type: 'table',
    data: tableData
  };
  
  tabs.value.push(newTab);
  activeTab.value = tableId;
};

const closeTab = (tabId: string) => {
  const index = tabs.value.findIndex(tab => tab.id === tabId);
  if (index > -1) {
    tabs.value.splice(index, 1);
    
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

const executeQuery = async () => {
  const activeTabContent = getActiveTabContent();
  if (activeTabContent?.type === 'query' && activeTabContent.data) {
    const queryData = activeTabContent.data as QueryData;
    
    try {
      // TODO: Implement actual query execution
      // For now, just mock a result
      queryData.result = {
        success: true,
        data: [
          { id: 1, name: 'Test 1' },
          { id: 2, name: 'Test 2' }
        ],
        fields: [
          { name: 'id' },
          { name: 'name' }
        ]
      };
    } catch (error) {
      queryData.result = {
        success: false,
        error: error instanceof Error ? error.message : 'Query failed'
      };
    }
  }
};

const updateQuery = (value: string) => {
  const activeTabContent = getActiveTabContent();
  if (activeTabContent?.type === 'query' && activeTabContent.data) {
    const queryData = activeTabContent.data as QueryData;
    queryData.query = value;
  }
};

const clearQuery = () => {
  const activeTabContent = getActiveTabContent();
  if (activeTabContent?.type === 'query' && activeTabContent.data) {
    const queryData = activeTabContent.data as QueryData;
    queryData.query = '';
    queryData.result = undefined;
  }
};

const generateSelectQuery = () => {
  const activeTabContent = getActiveTabContent();
  if (activeTabContent?.type === 'table' && activeTabContent.data) {
    const tableData = activeTabContent.data as TableData;
    // Create a new query tab with SELECT * query
    const queryId = `query-${Date.now()}`;
    const queryTitle = `Query ${queryCounter.value}`;
    
    const newTab: Tab = {
      id: queryId,
      title: queryTitle,
      type: 'query',
      data: {
        query: `SELECT * FROM ${tableData.name}`,
        result: undefined
      }
    };
    
    tabs.value.push(newTab);
    activeTab.value = queryId;
    queryCounter.value++;
  }
};

const generateDescribeQuery = () => {
  const activeTabContent = getActiveTabContent();
  if (activeTabContent?.type === 'table' && activeTabContent.data) {
    const tableData = activeTabContent.data as TableData;
    // Create a new query tab with DESCRIBE query
    const queryId = `query-${Date.now()}`;
    const queryTitle = `Query ${queryCounter.value}`;
    
    const newTab: Tab = {
      id: queryId,
      title: queryTitle,
      type: 'query',
      data: {
        query: `DESCRIBE ${tableData.name}`,
        result: undefined
      }
    };
    
    tabs.value.push(newTab);
    activeTab.value = queryId;
    queryCounter.value++;
  }
};

// Expose methods for parent component
defineExpose({
  addTableTab,
  addQueryTab,
  setActiveTab
});
</script>

<style scoped>
.right-sidebar {
  width: 100%;
  height: 100%;
  background-color: var(--el-bg-color-page);
  display: flex;
  flex-direction: column;
}

.tabs-container {
  background-color: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color);
  height: 35px; /* Match Tables header height */
  display: flex;
  align-items: center;
}

.tabs-list {
  display: flex;
  /* gap: 0.25rem; */
  overflow-x: auto;
  align-items: flex-end;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.05rem 0.75rem;
  background-color: var(--el-bg-color-page);
  border: 0.5px solid var(--el-border-color);
  border-bottom: none;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 0;
  flex-shrink: 0;
  position: relative;
  height: 34px; /* Fixed height for consistency */
}

.tab-item:hover {
  background-color: var(--el-bg-color);
}

.tab-item.active {
  background-color: var(--el-bg-color);
  border-color: var(--el-border-color);
  border-bottom: 2px solid var(--el-color-primary);
  z-index: 1;
}



.tab-title {
  font-size: 0.875rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.close-tab {
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--el-text-color-regular);
}

.close-tab:hover {
  background-color: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}

.content-container {
  flex: 1;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-top: none;
  border-radius: 0 0 6px 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.content-area {
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

/* Table Info Styles */
.table-info h4 {
  margin: 0 0 1rem 0;
  color: var(--el-text-color-primary);
}

.table-details {
  margin-bottom: 1.5rem;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--el-border-color-light);
}

.detail-item:last-child {
  border-bottom: none;
}

.label {
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.value {
  color: var(--el-text-color-primary);
}

.columns-section h5 {
  margin: 1rem 0 0.5rem 0;
  color: var(--el-text-color-primary);
}

.columns-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.column-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  font-size: 0.875rem;
}

.column-name {
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.column-type {
  color: var(--el-text-color-regular);
  font-family: monospace;
}

.column-nullable {
  color: var(--el-text-color-secondary);
  font-size: 0.75rem;
}

/* Query Editor Styles */
.query-editor h4 {
  margin: 0 0 1rem 0;
  color: var(--el-text-color-primary);
}

.query-toolbar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.query-input {
  margin-bottom: 1rem;
}

.query-results h5 {
  margin: 1rem 0 0.5rem 0;
  color: var(--el-text-color-primary);
}

.error-message {
  color: var(--el-color-danger);
  padding: 0.5rem;
  background-color: var(--el-color-danger-light-9);
  border-radius: 4px;
  font-size: 0.875rem;
}

/* Dark mode styles */
.dark .tab-item {
  background-color: #2d3748;
  border-color: #4a5568;
  color: var(--el-text-color-primary);
}

.dark .tab-item:hover {
  background-color: #4a5568;
  border-color: #718096;
}

.dark .tab-item.active {
  background-color: #1a202c;
  border-color: #409eff;
  border-bottom: 2px solid #409eff;
  color: #409eff;
}

.dark .tabs-container {
  background-color: #2d3748;
  border-bottom-color: #4a5568;
}

.dark .content-container {
  background-color: #1a202c;
  border-color: #4a5568;
}

.dark .column-item {
  background-color: #2d3748;
  border-color: #4a5568;
}

.dark .detail-item {
  border-bottom-color: #4a5568;
}
</style>
