<script setup lang="ts">
import { computed } from 'vue';
import { useData, useRoute } from 'vitepress';

const route = useRoute();
const { site } = useData();

const breadcrumbs = computed(() => {
  const path = route.path;
  if (path === '/' || path === '/index.html') {
    return [];
  }
  
  const parts = path.split('/').filter(Boolean);
  const crumbs: Array<{ label: string; link: string }> = [];
  
  // Add home
  crumbs.push({ label: 'Home', link: '/' });
  
  // Build path parts
  let currentPath = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === 'index.html' || part.endsWith('.html')) {
      continue;
    }
    
    currentPath += '/' + part;
    
    // Convert slug to title
    const label = part
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    crumbs.push({ 
      label,
      link: currentPath + '/'
    });
  }
  
  return crumbs;
});
</script>

<template>
  <nav v-if="breadcrumbs.length > 1" class="breadcrumbs" aria-label="Breadcrumb">
    <ol>
      <li v-for="(crumb, index) in breadcrumbs" :key="crumb.link">
        <a v-if="index < breadcrumbs.length - 1" :href="crumb.link">
          {{ crumb.label }}
        </a>
        <span v-else class="current">{{ crumb.label }}</span>
        <span v-if="index < breadcrumbs.length - 1" class="separator">/</span>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.breadcrumbs {
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--vp-c-divider);
}

.breadcrumbs ol {
  display: flex;
  flex-wrap: wrap;
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.875rem;
}

.breadcrumbs li {
  display: flex;
  align-items: center;
}

.breadcrumbs a {
  color: var(--vp-c-text-2);
  text-decoration: none;
}

.breadcrumbs a:hover {
  color: var(--vp-c-brand-1);
}

.breadcrumbs .current {
  color: var(--vp-c-text-1);
  font-weight: 500;
}

.breadcrumbs .separator {
  margin: 0 0.5rem;
  color: var(--vp-c-text-3);
}
</style>

