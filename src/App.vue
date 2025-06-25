<template>
  <div class="p-5 gap-3 max-w-sm m-auto flex flex-col items-center **:transition-all">
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
    <button class="h-12 text-white bg-lime-600" type="button" @click="registerBridge" :disabled="bridgeRegistered">
      Register Bridge
    </button>
    <button class="h-12 text-white bg-sky-600" type="button" @click="authenticateBridge"
      :disabled="!ssoAuthorizationCode">
      Authenticate Bridge
    </button>

    <input v-model="transactionId" type="text" placeholder="Transaction ID" class="input" />

    <button class="h-12 text-white bg-fib" type="button" @click="payment"
      :disabled="!transactionId || !ssoAuthorizationCode">
      Payment
    </button>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import useSingleSignOn from '@/composables/useSingleSignOn';
import { useFIBNativeBridge } from '@/composables/useFIBNativeBridge';

const { registerBridge, sendMessage, on } = useFIBNativeBridge();

const clientIdentifier = ref()
const clientSecret = ref()
const environment = ref('stage')
const addCorsAnywhere = ref(false)

const ssoAuthorizationCode = ref()
const transactionId = ref()

const getUserDetails = ref()


const isFIB = !!(window?.AndroidInterface || window.webkit?.messageHandlers?.FIBNativeBridge)

const bridgeRegistered = window.FIBNativeBridge

const useSSO = () => {
  const suffix = addCorsAnywhere.value ? 'https://cors-anywhere.herokuapp.com/' : ''
  const { initiate, getUserDetails: getDetails } = useSingleSignOn(
    clientIdentifier.value,
    clientSecret.value,
    environment.value, // or 'prod', etc.
    suffix

  );
  getUserDetails.value = getDetails
  return { initiate }
}

const startSSO = async () => {
  try {
    const { initiate } = useSSO()
    const { ssoAuthorizationCode: code } = await initiate();
    ssoAuthorizationCode.value = code;
  } catch (error) {
    console.log(error);

    alert(error)
  }
};

const fetchUser = async () => {
  try {
    const userData = await getUserDetails.value(ssoAuthorizationCode.value);
    alert(userData)
  } catch (error) {
    alert(error)
  }
};

const setClientData = () => {
  clientIdentifier.value = "StageBookingAdvisorSso"
  clientSecret.value = "4021fa5b-a703-4569-bdc1-c973c5ec67ab"
}

const authenticateBridge = () => {
  sendMessage({
    type: 'AUTHENTICATE',
    body: { readableId: ssoAuthorizationCode.value }
  });
}

const payment = () => {
  window.FIBNativeBridge.sendMessage({
    type: "PAYMENT",
    body: { transactionId: transactionId.value, readableId: ssoAuthorizationCode.value }
  })
}

onMounted(() => {
  window.FIBNativeBridge.addEventListener("AUTHENTICATED", async (event) => {
    alert(`user is Authenticated : ${event}`)
  })
  window.FIBNativeBridge.addEventListener("AUTHENTICATION_FAILED", async (event) => {
    alert(`user Authenticated Failed ${event}`)
  })
  window.FIBNativeBridge.addEventListener("PAYMENT_SUCCESSFULLY_PAID", async (event) => {
    const { transactionId } = event.detail.body
    alert(`Payment Successfully Paid ${transactionId}`)
  })
  window.FIBNativeBridge.addEventListener("PAYMENT_FAILED", async (event) => {
    const { transactionId, reason } = event.detail.body
    alert(`Payment Successfully Paid ${transactionId} , ${reason}`)
  })
  window.addEventListener('error', (event) => {
    const message = `
    Message: ${event.message}
    Source: ${event.filename}
    Line: ${event.lineno}
    Column: ${event.colno}
    Error object: ${event.error ? event.error.stack : 'N/A'}
  `;
    alert(message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    alert(`Unhandled Promise Rejection: ${reason?.message || reason}`);
    console.error('Promise rejection:', reason);
  });


});

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