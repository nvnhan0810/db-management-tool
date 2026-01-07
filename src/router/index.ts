import DefaultLayout from '@/layouts/DefaultLayout.vue'
import Home from '@/views/Home.vue'
import Workspace from '@/views/Workspace.vue'
import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: DefaultLayout,
      children: [
        {
          path: '',
          name: 'home',
          component: Home,
        },
        {
          path: '/workspace',
          name: 'workspace',
          component: Workspace,
        }
      ],
    }
  ]
})

export default router
