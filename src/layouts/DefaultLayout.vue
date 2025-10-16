<template>
  <div>
    <!-- Custom Title Bar -->
    <CustomTitleBar />

    <router-view />
  </div>
</template>

<script setup lang="ts">
import CustomTitleBar from '../components/CustomTitleBar.vue';
</script>
