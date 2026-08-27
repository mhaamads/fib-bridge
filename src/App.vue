<template>
  <div>
    <RouterView />
    <ErrorLogger />
  </div>
</template>

<script setup>
import ErrorLogger from './components/ErrorLogger.vue'
</script>
