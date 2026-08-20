import Asiamall from '@/views/Asiamall.vue'
import GiniPayment from '@/views/GiniPayment.vue'
import Home from '@/views/Home.vue'
import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/fib',
      component: Home
    },
    {
      path: '/asiamall',
      component: Asiamall
    },
    {
      path: '/',
      component: GiniPayment
    }
  ],
})



export default router
