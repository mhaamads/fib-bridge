import '@/assets/css/style.css'
import { registerFIBNativeBridge } from "@first-iraqi-bank/sdk/fib-native-bridge"
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

const app = createApp(App)
registerFIBNativeBridge()
app.use(createPinia())
app.use(router)

app.mount('#app')
