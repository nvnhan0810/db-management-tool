<template>
  <div ref="contentAreaInnerRef" class="content-area-inner">
    <div class="tabs-container">
      <el-tabs v-model="activeTabId" type="card" closable @tab-remove="handleRemoveTab($event)"
        @tab-click="handleTabClick($event)">
        <el-tab-pane v-for="tab in tabs" :key="tab.id" :label="tab.tableName" :name="tab.id">
          <div class="tab-content-wrapper">
            <!-- Main Content Area -->
            <div class="tab-main-content">
              <!-- Query Editor Tab -->
              <QueryEditorTab v-if="tab.tabType === 'query'" :connection-id="connection?.id"
                :db-type="connection?.type || 'postgresql'" />

              <!-- Table Tabs -->
              <template v-else>
                <!-- Structure View -->
                <TableStructureView v-if="tab.viewMode === 'structure'" :structure="tab.structure"
                  :is-loading="tab.isLoadingStructure === true" :error="tab.structureError || null" />

                <!-- Data View -->
                <TableDataView v-else-if="tab.viewMode === 'data'" :ref="(el: any) => setTableDataViewRef(tab.id, el)"
                  :data="tab.data" :is-loading="tab.isLoadingData === true" :error="tab.dataError || null"
                  :db-type="connection?.type || 'postgresql'" :table-name="tab.tableName"
                  :connection-id="connection?.id"
                  :column-types="(tab.structure?.columns) ? Object.fromEntries(tab.structure.columns.map((c: { name: string; type: string }) => [c.name, c.type])) : {}"
                  :sidebar-panel-open="dataSidebarVisible" />

                <!-- Fallback if no view mode -->
                <!-- <div v-else class="no-view-mode">
                  <el-empty description="No view mode selected" />
                </div> -->
              </template>
            </div>

            <!-- Footer (only for table tabs) -->
            <!-- <TableViewFooter v-if="tab.tabType !== 'query'" :view-mode="tab.viewMode || 'data'" :data="tab.data"
              @update:view-mode="(val: 'structure' | 'data') => switchViewMode(tab, val)"
              @page-change="(page: number) => handlePageChange(tab, page)"
              @per-page-change="(perPage: number) => handlePerPageChange(tab, perPage)" @add-row="handleAddRow(tab)" /> -->
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
    <!-- Data table cell sidebar (inside content-area, full height) -->
    <!-- <div v-if="dataSidebarVisible" class="data-detail-sidebar-wrap">
      <TableDataCellSidebar ref="dataSidebarRef" :visible="true" :selected-row="dataSidebarSelectedRow"
        :selected-column="dataSidebarSelectedColumn" :modified-fields="dataSidebarModifiedFields"
        :is-deleted="dataSidebarIsDeleted" :column-types="dataSidebarColumnTypes"
        @close="onDataSidebarClose(activeTabId)"
        @update-field="(field: string, value: unknown) => onDataUpdateField(activeTabId, { field, value })"
        @mark-deleted="onDataMarkDeleted(activeTabId)" @unmark-deleted="onDataUnmarkDeleted(activeTabId)" />
    </div> -->
  </div>

</template>

<script setup lang="ts">
import { useConnectionsStore } from '@/stores/connectionsStore';
import { Tab } from '@/stores/tableStore';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import QueryEditorTab from '../TableView/QueryEditorTab.vue';
import TableDataView from '../TableView/TableDataView.vue';
import TableStructureView from '../TableView/TableStructureView.vue';

const props = defineProps<{
  modelValue: string;
  tabs: Tab[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'tab-remove': [tabId: string];
  'tab-click': [tabId: string];
}>();

const activeTabId = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
});

const { currentConnection: connection, dataSidebarOpen } = storeToRefs(useConnectionsStore());

const contentAreaInnerRef = ref<HTMLElement | null>(null);

const dataSidebarVisible = computed(() => {
  return dataSidebarOpen.value && props.tabs.length > 0;
});

const handleRemoveTab = (tabId: string) => {
  emit('tab-remove', tabId);
};

const handleTabClick = (tabId: string) => {
  emit('tab-click', tabId);
};
</script>
