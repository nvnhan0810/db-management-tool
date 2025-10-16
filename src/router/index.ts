import { createRouter, createWebHashHistory } from 'vue-router'
import Home from '../views/Home.vue'
import DefaultLayout from '../layouts/DefaultLayout.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '',
      component: DefaultLayout,
      children: [
        {
          path: '/',
          name: 'home',
          component: Home,
        }
      ],
    }
  ]
})

export default router
