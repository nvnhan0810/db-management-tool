<template>
    <div id="settings" class="p-4">
        <h1 class="title mb-3">Settings</h1>
        <div class="settings-card p-4 mb-4">
            <h2 class="mb-2">General Settings</h2>
            <div class="setting-item py-2">
                <label class="mb-1">Theme</label>
                <select class="p-2">
                    <option>Light</option>
                    <option>Dark</option>
                </select>
            </div>
            <div class="setting-item py-2">
                <label class="mb-1">Language</label>
                <select class="p-2">
                    <option>English</option>
                    <option>Vietnamese</option>
                </select>
            </div>
        </div>
        <div class="settings-card p-4">
            <h2 class="mb-2">Database Settings</h2>
            <div class="setting-item py-2">
                <label class="mb-1">Connection Timeout</label>
                <input type="number" class="p-2" value="30">
            </div>
            <div class="setting-item py-2">
                <label class="mb-1">Max Connections</label>
                <input type="number" class="p-2" value="10">
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">

</script>

<style scoped>
.title {
    font-size: 24px;
    font-weight: bold;
    color: var(--primary-color);
    margin-top: 0;
}

.settings-card {
    border: 1px solid var(--light-color);
    border-radius: 8px;
    background-color: var(--light-color);
}

.settings-card h2 {
    color: var(--dark-color);
    font-size: 18px;
    font-weight: 600;
}

.setting-item {
    border-bottom: 1px solid var(--secondary-color);
}

.setting-item:last-child {
    border-bottom: none;
}

.setting-item label {
    display: block;
    color: var(--dark-color);
    font-weight: 500;
}

.setting-item select,
.setting-item input {
    border: 1px solid var(--secondary-color);
    border-radius: 4px;
    background-color: white;
    color: var(--dark-color);
    width: 200px;
}

.setting-item select:focus,
.setting-item input:focus {
    outline: none;
    border-color: var(--primary-color);
}
</style>