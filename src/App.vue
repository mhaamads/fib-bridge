<template>
  <div class="p-5 gap-3 max-w-lg m-auto flex flex-col items-center **:transition-all">
    <div @dblclick="setClientData" :class="isFIB ? 'bg-fib' : 'bg-red-500'"
      class=" fixed bottom-5 end-5 text-white  aspect-square h-10 grid place-content-center rounded-full">
      FIB
    </div>
    <a href="https://cors-anywhere.herokuapp.com/corsdemo" target="_blank" class="fixed bottom-5 start-5">Cors</a>
    <div class="flex gap-3 w-full">
      <button class="tab" :class="environment === 'dev' ? 'active' : 'inactive'"
        @click="environment = 'dev'">DEV</button>
      <button class="tab" :class="environment === 'stage' ? 'active' : 'inactive'"
        @click="environment = 'stage'">STAGE</button>
      <button class="tab" :class="environment === 'prod' ? 'active' : 'inactive'"
        @click="environment = 'prod'">PROD</button>
    </div>
    <button @click="addCorsAnywhere = !addCorsAnywhere" :class="addCorsAnywhere ? 'bg-red-600 ' : ' bg-sky-600 '"
      class="h-12 text-white  ">
      {{ addCorsAnywhere ? 'Disable Proxy' : 'Enable Proxy' }}
    </button>
    <input v-model="ssoAuthorizationCode" placeholder="SSO Authorization Code"
      class=" input tracking-widest text-center" />
    <input v-model="clientIdentifier" type="text" placeholder="Client Identifier" class="input" />
    <input v-model="clientSecret" type="text" placeholder="Client Secret" class="input" />
    <button class="h-12 text-white bg-sky-600" type="button" @click="startSSO"
      :disabled="!clientIdentifier || !clientSecret">
      Get SSO Authorization Code
    </button>
    <button class="h-12 text-white bg-indigo-600" type="button" @click="fetchUser" :disabled="!ssoAuthorizationCode">
      Fetch User
    </button>
    <button class="h-12 text-white bg-sky-600" type="button" @click="authenticateBridge"
      :disabled="!ssoAuthorizationCode">
      Authenticate Bridge
    </button>
    <input v-model="transactionId" type="text" placeholder="Payment Id" class="input" />
    <input v-model="readableId" type="text" placeholder="readable Code" class="input" />

    <button class="h-12 text-white bg-fib" type="button" @click="payment" :disabled="!transactionId || !readableId">
      Payment
    </button>

    <!-- Logs UI -->
    <div class="bg-gray-100 text-xs w-full max-h-40 overflow-auto p-2 rounded mt-5">
      <div v-for="(msg, index) in logs" :key="index" class="whitespace-pre-line font-mono">{{ msg }}</div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import useSingleSignOn from '@/composables/useSingleSignOn';
import { registerFIBNativeBridge } from "@first-iraqi-bank/sdk/fib-native-bridge"

const clientIdentifier = ref()
const clientSecret = ref()
const environment = ref('stage')
const addCorsAnywhere = ref(false)

const ssoAuthorizationCode = ref()
const transactionId = ref()
const readableId = ref()
const getUserDetails = ref()

const logs = ref([])

const log = (message) => {
  console.log(message)
  logs.value.unshift(`[${new Date().toLocaleTimeString()}] ${typeof message === 'string' ? message : JSON.stringify(message, null, 2)}`)
}

const isFIB = !!(window?.AndroidInterface || window.webkit?.messageHandlers?.FIBNativeBridge)

const useSSO = () => {
  const suffix = addCorsAnywhere.value ? 'https://cors-anywhere.herokuapp.com/' : ''
  const { initiate, getUserDetails: getDetails } = useSingleSignOn(
    clientIdentifier.value,
    clientSecret.value,
    environment.value,
    suffix
  )
  getUserDetails.value = getDetails
  return { initiate }
}



const startSSO = async () => {
  try {
    console.log('Init SSO');
    
    const { initiate } = useSSO()
    const { ssoAuthorizationCode: code } = await initiate()
    ssoAuthorizationCode.value = code
    log(`SSO Code received: ${code}`)
  } catch (error) {
    log(`SSO Error: ${error?.message || error}`)
  }
}

const fetchUser = async () => {
  try {
    const userData = await getUserDetails.value(ssoAuthorizationCode.value)
    log(`User Data: ${JSON.stringify(userData, null, 2)}`)
  } catch (error) {
    log(`Fetch User Error: ${error?.message || error}`)
  }
}

const setClientData = () => {
  clientIdentifier.value = "StageBookingAdvisorSso"
  clientSecret.value = "4021fa5b-a703-4569-bdc1-c973c5ec67ab"
  log('Client data set for Stage')
}

const authenticateBridge = () => {
  try {
    const message = {
      type: "AUTHENTICATE",
      body: { readableId: readableId.value }
    }
    log(`AUTHENTICATE sent: ${JSON.stringify(message)}`)
    window.FIBNativeBridge.sendMessage(message)
    log(`AUTHENTICATE sent`)
  } catch (error) {
    log(`Bridge not available: ${error?.message || error}`)
  }
}

const payment = () => {
  try {
    const message = {
      type: "PAYMENT",
      body: { transactionId: transactionId.value, readableId: readableId.value }
    }
    window.FIBNativeBridge.sendMessage(message)
    log(`PAYMENT sent: ${JSON.stringify(message)}`)
  } catch (error) {
    log(`Bridge not available: ${error?.message || error}`)
  }
}

onMounted(() => {
  registerFIBNativeBridge()
  setTimeout(() => {
    if (!window.FIBNativeBridge) {
      log("FIBNativeBridge not loaded.")
      return
    }

    window.FIBNativeBridge.addEventListener("AUTHENTICATED", (event) => {
      log(`AUTHENTICATED: ${JSON.stringify(event.detail)}`)
    })
    window.FIBNativeBridge.addEventListener("AUTHENTICATION_FAILED", (event) => {
      log(`AUTHENTICATION_FAILED: ${JSON.stringify(event.detail)}`)
    })
    window.FIBNativeBridge.addEventListener("PAYMENT_SUCCESSFULLY_PAID", (event) => {
      log(`PAYMENT_SUCCESSFULLY_PAID: ${JSON.stringify(event.detail)}`)
    })
    window.FIBNativeBridge.addEventListener("PAYMENT_FAILED", (event) => {
      log(`PAYMENT_FAILED: ${JSON.stringify(event.detail)}`)
    })

    window.addEventListener('error', (event) => {
      log(`JS Error: ${event.message}\nSource: ${event.filename}\nLine: ${event.lineno}:${event.colno}`)
    })

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason
      log(`Unhandled Promise Rejection: ${reason?.message || reason}`)
    })
  }, 500)
})
</script>
<style>
@reference "@/assets/css/style.css";

button {
  @apply w-full px-5 flex items-center justify-center rounded-md cursor-pointer disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-400 uppercase font-semibold text-sm
}

.tab {
  @apply w-full text-sm flex items-center justify-center px-3 border
}

.tab.active {
  @apply bg-fib h-10 border-fib text-white
}

.tab.inactive {
  @apply border-black/20 text-neutral-950 bg-transparent
}

.input {
  @apply border w-full border-black/20 text-sm focus:outline-0 focus:ring-0 focus:border-fib rounded-md h-12 px-3
}
</style>