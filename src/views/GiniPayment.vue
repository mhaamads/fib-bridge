<template>
  <main class="p-5 max-w-lg m-auto flex flex-col gap-4">
    <RouterLink to="/" class="text-sm text-fib">← FIB Bridge</RouterLink>

    <div>
      <p class="text-xs uppercase tracking-widest text-gray-500">Developer tool</p>
      <h1 class="text-2xl font-semibold">Gini payment tester</h1>
      <p class="mt-2 text-sm text-gray-600">
        Login first, then open the payment dialog with <code>gini.pay()</code>.
      </p>
    </div>

    <div class="notice">
      Test-only direct Bridge mode. Credentials are entered at runtime and kept in memory only; nothing is stored in
      the source code or local storage.
    </div>

    <div class="flex flex-wrap gap-2" aria-live="polite">
      <span class="badge" :class="badgeClass(isMiniApp)">isMiniApp: {{ badgeText(isMiniApp) }}</span>
      <span class="badge" :class="badgeClass(isReady)">ready: {{ badgeText(isReady) }}</span>
    </div>

    <form class="flex flex-col gap-3" @submit.prevent="login">
      <label>
        Gini API URL
        <input v-model.trim="baseUrl" type="url" required class="input" :disabled="loggedIn" placeholder="https://bridge.gini.iq/api" />
      </label>

      <label>
        API key
        <input v-model.trim="apiKey" required class="input" :disabled="loggedIn" autocomplete="off" placeholder="app_key_..." />
      </label>

      <label>
        App secret
        <input v-model.trim="appSecret" type="password" required class="input" :disabled="loggedIn" autocomplete="off" placeholder="Your app secret" />
      </label>

      <div class="flex gap-3">
        <button class="button flex-1 bg-fib text-white" type="submit" :disabled="busy || loggedIn">
          {{ busy && action === 'login' ? 'Logging in…' : loggedIn ? 'Logged in' : 'Login with Gini' }}
        </button>
        <button v-if="loggedIn" class="button reset-button" type="button" @click="resetLogin">Reset</button>
      </div>
    </form>

    <section v-if="loggedIn" class="panel">
      <div class="flex items-center justify-between gap-3">
        <h2 class="font-semibold">Logged-in customer</h2>
        <button class="text-sm text-fib" type="button" :disabled="busy" @click="loadUserInfo">Refresh profile</button>
      </div>
      <pre v-if="userInfo" class="mt-2 whitespace-pre-wrap break-words">{{ formatJson(userInfo) }}</pre>
    </section>

    <form class="flex flex-col gap-3" @submit.prevent="pay">
      <fieldset :disabled="!loggedIn || busy" class="flex flex-col gap-3">
        <legend class="text-sm font-semibold">Payment details</legend>

        <label>
          Amount (IQD)
          <input v-model.number="amount" type="number" min="1" step="1" required class="input" placeholder="50000" />
        </label>

        <label>
          Commission ID
          <input v-model.number="commissionId" type="number" min="1" step="1" required class="input" placeholder="1" />
        </label>

        <label>
          Merchant reference <span class="muted">(optional)</span>
          <input v-model.trim="merchantReference" class="input" maxlength="255" placeholder="TEST-001" />
        </label>

        <label>
          Metadata JSON <span class="muted">(optional)</span>
          <textarea v-model="metadataText" class="input h-28 py-3 font-mono" spellcheck="false" placeholder='{"source":"gini-test"}' />
        </label>

        <button class="button bg-fib text-white" type="submit">
          {{ busy && action === 'pay' ? 'Opening payment…' : 'Initiate payment' }}
        </button>
      </fieldset>
    </form>

    <section v-if="transactionUuid" class="panel">
      <label>
        Transaction UUID
        <input v-model.trim="transactionUuid" class="input" />
      </label>
      <button class="button secondary-button mt-3" type="button" :disabled="busy" @click="checkPaymentStatus">
        {{ busy && action === 'status' ? 'Checking…' : 'Check payment status' }}
      </button>
      <pre v-if="paymentStatus" class="mt-2 whitespace-pre-wrap break-words">{{ formatJson(paymentStatus) }}</pre>
    </section>

    <div v-if="status" class="result" :class="failed ? 'result-error' : 'result-success'">
      <p class="font-semibold">{{ status }}</p>
      <pre v-if="result" class="mt-2 whitespace-pre-wrap break-words">{{ result }}</pre>
    </div>
  </main>
</template>

<script setup>
import { onMounted, ref } from 'vue'

const baseUrl = ref('https://bridge.gini.iq/api')
const apiKey = ref('')
const appSecret = ref('')
const amount = ref(null)
const commissionId = ref(null)
const merchantReference = ref('')
const metadataText = ref('')
const busy = ref(false)
const action = ref('')
const loggedIn = ref(false)
const isMiniApp = ref(null)
const isReady = ref(null)
const userInfo = ref(null)
const transactionUuid = ref('')
const paymentStatus = ref(null)
const failed = ref(false)
const status = ref('')
const result = ref('')
let giniClient
let storage

function memoryStorage() {
  const values = new Map()
  return {
    get length() { return values.size },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function formatJson(value) {
  return JSON.stringify(value, null, 2)
}

function badgeText(value) {
  return value === null ? 'checking…' : value ? 'yes' : 'no'
}

function badgeClass(value) {
  return value === null ? 'badge-pending' : value ? 'badge-ok' : 'badge-error'
}

function safeUserInfo(user) {
  if (!user || typeof user !== 'object') return user
  const safe = { ...user }
  delete safe.token
  delete safe.refresh_token
  return safe
}

async function sign(canonical) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret.value),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical))
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function signedFetch() {
  const nativeFetch = window.fetch.bind(window)
  return async (input, init = {}) => {
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const nonce = crypto.randomUUID().replaceAll('-', '')
    const body = init.body || ''
    const signature = await sign([apiKey.value, timestamp, nonce, body].join('\n'))
    const headers = new Headers(init.headers)
    headers.set('X-Api-Key', apiKey.value)
    headers.set('X-Timestamp', timestamp)
    headers.set('X-Nonce', nonce)
    headers.set('X-Signature', signature)
    return nativeFetch(input, { ...init, headers })
  }
}

function createClient() {
  if (!window.Gini?.create) throw new Error('Gini SDK is not loaded.')
  storage = memoryStorage()
  return window.Gini.create({
    baseUrl: baseUrl.value,
    storage,
    fetch: signedFetch(),
    disableRemoteEventReporting: true,
  })
}

async function checkGini() {
  if (!window.Gini?.create) {
    isMiniApp.value = false
    isReady.value = false
    return
  }

  try {
    const probe = window.Gini.create({
      baseUrl: baseUrl.value,
      storage: memoryStorage(),
      disableRemoteEventReporting: true,
    })
    isMiniApp.value = probe.isMiniApp()
    await probe.ready()
    isReady.value = true
  } catch {
    isReady.value = false
  }
}

async function loadUserInfo() {
  if (!giniClient) return
  try {
    userInfo.value = await giniClient.request('GET', '/v1/customer/me')
  } catch (error) {
    userInfo.value = {
      ...safeUserInfo(userInfo.value),
      profileError: errorMessage(error),
    }
  }
}

async function login() {
  failed.value = false
  status.value = ''
  result.value = ''
  userInfo.value = null
  busy.value = true
  action.value = 'login'

  try {
    giniClient = createClient()
    const user = await giniClient.login()
    loggedIn.value = true
    userInfo.value = safeUserInfo(user)
    await loadUserInfo()
    status.value = user?.name ? `Logged in as ${user.name}` : 'Logged in successfully'
  } catch (error) {
    giniClient = undefined
    storage = undefined
    failed.value = true
    status.value = 'Login failed'
    result.value = errorMessage(error)
  } finally {
    busy.value = false
    action.value = ''
  }
}

function resetLogin() {
  storage?.clear()
  storage = undefined
  giniClient = undefined
  loggedIn.value = false
  userInfo.value = null
  transactionUuid.value = ''
  paymentStatus.value = null
  status.value = ''
  result.value = ''
  failed.value = false
}

async function pay() {
  failed.value = false
  status.value = ''
  result.value = ''
  paymentStatus.value = null
  transactionUuid.value = ''

  let metadata
  try {
    metadata = metadataText.value.trim() ? JSON.parse(metadataText.value) : undefined
    if (metadata !== undefined && (!metadata || Array.isArray(metadata) || typeof metadata !== 'object')) {
      throw new Error('Metadata must be a JSON object.')
    }
  } catch (error) {
    failed.value = true
    status.value = 'Invalid input'
    result.value = errorMessage(error)
    return
  }

  if (!Number.isSafeInteger(amount.value) || amount.value < 1) {
    failed.value = true
    status.value = 'Invalid input'
    result.value = 'Amount must be a positive whole number.'
    return
  }

  busy.value = true
  action.value = 'pay'
  try {
    if (!loggedIn.value || !giniClient) throw new Error('Login first.')
    if (!Number.isSafeInteger(commissionId.value) || commissionId.value < 1) {
      throw new Error('Commission ID must be a positive whole number.')
    }
    const payload = { amount: amount.value, commission_id: commissionId.value }
    if (merchantReference.value) payload.merchant_reference = merchantReference.value
    if (metadata !== undefined) payload.metadata = metadata

    status.value = 'Opening payment dialog…'
    const payment = await giniClient.pay(payload)
    transactionUuid.value = payment?.uuid || transactionUuid.value
    status.value = `Payment flow finished (${payment?.status || 'success'})`
    result.value = JSON.stringify(payment, null, 2)
  } catch (error) {
    transactionUuid.value = error?.uuid || transactionUuid.value
    failed.value = true
    status.value = 'Payment failed'
    result.value = errorMessage(error)
  } finally {
    busy.value = false
    action.value = ''
  }
}

async function checkPaymentStatus() {
  if (!giniClient) return
  if (!transactionUuid.value) {
    failed.value = true
    status.value = 'Missing transaction UUID'
    result.value = 'Run a payment first or enter a transaction UUID.'
    return
  }

  failed.value = false
  status.value = ''
  result.value = ''
  busy.value = true
  action.value = 'status'
  try {
    paymentStatus.value = await giniClient.request(
      'GET',
      `/v1/payments/${encodeURIComponent(transactionUuid.value)}/status`,
    )
    status.value = 'Payment status loaded'
  } catch (error) {
    failed.value = true
    status.value = 'Could not load payment status'
    result.value = errorMessage(error)
  } finally {
    busy.value = false
    action.value = ''
  }
}

onMounted(checkGini)
</script>

<style scoped>
@reference "@/assets/css/style.css";

label {
  @apply flex flex-col gap-1 text-sm font-medium;
}

.input {
  @apply border border-black/20 rounded-md h-12 px-3 font-normal focus:outline-0 focus:ring-0 focus:border-fib;
}

.button {
  @apply h-12 rounded-md cursor-pointer font-semibold disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-400;
}

.reset-button {
  @apply border border-black/20 px-4;
}

.secondary-button {
  @apply border border-black/20;
}

.muted {
  @apply font-normal text-gray-500;
}

.notice {
  @apply rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900;
}

.badge {
  @apply rounded-full px-3 py-1 text-xs font-semibold;
}

.badge-pending {
  @apply bg-gray-100 text-gray-600;
}

.badge-ok {
  @apply bg-emerald-100 text-emerald-800;
}

.badge-error {
  @apply bg-red-100 text-red-800;
}

.result {
  @apply rounded-md p-3 text-sm;
}

.panel {
  @apply rounded-md border border-black/10 bg-gray-50 p-3 text-sm;
}

.result-success {
  @apply bg-emerald-50 text-emerald-900;
}

.result-error {
  @apply bg-red-50 text-red-900;
}
</style>
