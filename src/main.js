import '@/assets/css/style.css'
import { registerFIBNativeBridge } from "@first-iraqi-bank/sdk/fib-native-bridge"
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

const app = createApp(App)
registerFIBNativeBridge()
app.use(createPinia())

app.mount('#app')
