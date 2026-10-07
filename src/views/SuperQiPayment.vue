<template>
  <main class="p-5 max-w-lg m-auto flex flex-col gap-4">
    <RouterLink to="/fib" class="text-sm text-fib">← FIB Bridge</RouterLink>

    <div>
      <p class="text-xs uppercase tracking-widest text-gray-500">Developer tool</p>
      <h1 class="text-2xl font-semibold">Super Qi tester</h1>
      <p class="mt-2 text-sm text-gray-600">
        Login first, then open the cashier with <code>my.tradePay()</code>.
      </p>
    </div>

    <div class="notice">
      Only works inside the Super Qi app (UAT environment). A browser cannot produce a valid auth code.
    </div>

    <div class="flex flex-wrap gap-2" aria-live="polite">
      <span class="badge" :class="isMiniApp ? 'badge-ok' : 'badge-error'">isMiniApp: {{ isMiniApp ? 'yes' : 'no' }}</span>
    </div>

    <div class="flex gap-3">
      <button class="button flex-1 bg-fib text-white" type="button" :disabled="busy || loggedIn" @click="login">
        {{ busy && action === 'login' ? 'Logging in…' : loggedIn ? 'Logged in' : 'Login with Super Qi' }}
      </button>
      <button v-if="loggedIn" class="button reset-button" type="button" @click="resetLogin">Reset</button>
    </div>

    <button class="button secondary-button" type="button" :disabled="busy" @click="fetchAuthCode">
      {{ busy && action === 'code' ? 'Requesting…' : 'Get auth code only (for desktop testing)' }}
    </button>

    <section v-if="authCode" class="panel">
      <div class="flex items-center justify-between gap-2">
        <h2 class="font-semibold">Auth code</h2>
        <button class="text-sm text-fib font-semibold" type="button" @click="copyAuthCode">{{ copied ? 'Copied' : 'Copy' }}</button>
      </div>
      <pre class="mt-2 whitespace-pre-wrap break-all select-all">{{ authCode }}</pre>
      <span class="muted text-xs">Not sent to the backend. Single use and expires in minutes — use it right away.</span>
    </section>

    <section v-if="loggedIn" class="panel">
      <h2 class="font-semibold">Logged-in customer</h2>
      <pre class="mt-2 whitespace-pre-wrap break-words">{{ formatJson(userInfo) }}</pre>
    </section>

    <form class="flex flex-col gap-3" @submit.prevent="pay">
      <fieldset :disabled="!loggedIn || busy" class="flex flex-col gap-3">
        <legend class="text-sm font-semibold">Payment details</legend>

        <label>
          Payment URL
          <input v-model.trim="paymentUrl" type="url" required class="input" autocomplete="off" placeholder="https://wallet.example.com/cashier?orderId=..." />
          <span class="muted">From the Super Qi <code>pay</code> response: <code>redirectActionForm.redirectionUrl</code>.</span>
        </label>

        <button class="button bg-fib text-white" type="submit">
          {{ busy && action === 'pay' ? 'Opening payment…' : 'Open cashier' }}
        </button>
      </fieldset>
    </form>

    <div v-if="paymentState" class="payment-indicator" :class="paymentStateClass(paymentState)">
      {{ paymentStateLabel(paymentState) }}
    </div>

    <div v-if="status" class="result" :class="failed ? 'result-error' : 'result-success'">
      <p class="font-semibold">{{ status }}</p>
      <pre v-if="result" class="mt-2 whitespace-pre-wrap break-words">{{ result }}</pre>
    </div>
  </main>
</template>

<script setup>
import { onMounted, ref } from 'vue'

const BACKEND_URL = 'https://app.bookingadvisors.com'
// my.getAuthCode scopes: auth_base = user id, auth_user = name/avatar/gender/birthday/nationality/contacts
const SCOPES = ['auth_base', 'auth_user']
const AUTH_ERRORS = {
  1001: 'You cancelled the authorization.',
  1002: 'Super Qi app service error.',
  1003: 'Authorization timed out.',
  2001: 'Agreement pending — accept it in Super Qi first.',
}
const PAY_RESULTS = {
  9000: 'success',
  8000: 'pending',
  4000: 'failed',
  6001: 'cancelled',
  6002: 'failed',
  6004: 'pending',
}

const paymentUrl = ref('')
const busy = ref(false)
const action = ref('')
const loggedIn = ref(false)
const isMiniApp = ref(false)
const userInfo = ref(null)
const paymentState = ref('')
const failed = ref(false)
const status = ref('')
const result = ref('')
const authCode = ref('')
const copied = ref(false)

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function formatJson(value) {
  return JSON.stringify(value, null, 2)
}

function paymentStateLabel(value) {
  return {
    success: 'Payment succeeded',
    pending: 'Payment is still processing — final status pending',
    failed: 'Payment failed',
    cancelled: 'Payment was cancelled',
  }[value] || 'Payment status unknown'
}

function paymentStateClass(value) {
  return {
    success: 'payment-success',
    pending: 'payment-pending',
    failed: 'payment-failed',
    cancelled: 'payment-cancelled',
  }[value] || 'payment-pending'
}

function hasNativeMiniAppBridge() {
  if (typeof window.my?.getAuthCode !== 'function' || typeof window.my?.tradePay !== 'function') return false
  if (/miniprogram|griver/i.test(navigator.userAgent)) return true

  try {
    const app = String(window.my.getSystemInfoSync?.().app || '').toLowerCase()
    return Boolean(app) && !app.includes('web')
  } catch {
    return false
  }
}

// Auth codes are single use and short lived: always request a fresh one, never reuse.
function getAuthCode() {
  return new Promise((resolve, reject) => {
    window.my.getAuthCode({
      scopes: SCOPES,
      success: res => (res?.authCode ? resolve(res.authCode) : reject(new Error('Super Qi returned no auth code.'))),
      fail: err => {
        const code = Object.values(err?.authErrorScopes || {})[0]
        reject(new Error(AUTH_ERRORS[code] || `Authorization failed${code ? ` (${code})` : ''}.`))
      },
    })
  })
}

async function authenticate(authCode) {
  const response = await fetch(`${BACKEND_URL}/superqi/sso/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authCode }),
  })
  const data = await response.json().catch(() => ({}))

  // Failures: { message, errors } with 400/500, or { result: { resultCode: INVALID_CODE | USED_CODE | EXPIRED_CODE, ... } }
  if (!response.ok || data?.result?.resultStatus !== 'S') {
    const detail = data?.result?.resultCode || data?.errors?.[0]?.message || data?.errors?.[0] || ''
    throw new Error([data?.message || data?.result?.resultMessage || `Request failed (${response.status})`, detail].filter(Boolean).join(': '))
  }
  return data
}

async function login() {
  failed.value = false
  status.value = ''
  result.value = ''
  userInfo.value = null
  busy.value = true
  action.value = 'login'

  try {
    const { customerId, userInfo: info } = await authenticate(await getAuthCode())
    loggedIn.value = true
    // accessToken / refreshToken are intentionally not shown or stored
    userInfo.value = { customerId, ...info }
    status.value = info?.userName?.fullName ? `Logged in as ${info.userName.fullName}` : 'Logged in successfully'
  } catch (error) {
    failed.value = true
    status.value = 'Login failed'
    result.value = `${errorMessage(error)}\nTap login again to request a fresh auth code.`
  } finally {
    busy.value = false
    action.value = ''
  }
}

// Requests a code without sending it to the backend, so it stays unused for a desktop test env.
async function fetchAuthCode() {
  failed.value = false
  status.value = ''
  result.value = ''
  authCode.value = ''
  copied.value = false
  busy.value = true
  action.value = 'code'

  try {
    authCode.value = await getAuthCode()
  } catch (error) {
    failed.value = true
    status.value = 'Auth code request failed'
    result.value = errorMessage(error)
  } finally {
    busy.value = false
    action.value = ''
  }
}

function copyAuthCode() {
  const text = authCode.value
  const onCopied = () => (copied.value = true)
  if (typeof window.my?.setClipboard === 'function') {
    window.my.setClipboard({ text, success: onCopied })
  } else {
    navigator.clipboard?.writeText(text).then(onCopied)
  }
}

function resetLogin() {
  loggedIn.value = false
  userInfo.value = null
  paymentState.value = ''
  status.value = ''
  result.value = ''
  failed.value = false
}

function pay() {
  failed.value = false
  status.value = ''
  result.value = ''
  paymentState.value = ''
  busy.value = true
  action.value = 'pay'

  const done = (state, res) => {
    paymentState.value = state
    failed.value = state === 'failed'
    status.value = paymentStateLabel(state)
    result.value = formatJson(res)
    busy.value = false
    action.value = ''
  }

  window.my.tradePay({
    paymentUrl: paymentUrl.value,
    success: res => done(PAY_RESULTS[res?.resultCode] || 'pending', res),
    fail: err => done('failed', err),
  })
}

onMounted(() => {
  isMiniApp.value = hasNativeMiniAppBridge()
})
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

.payment-indicator {
  @apply rounded-md p-3 text-sm font-semibold;
}

.payment-pending {
  @apply bg-amber-50 text-amber-900;
}

.payment-success {
  @apply bg-emerald-50 text-emerald-900;
}

.payment-failed,
.payment-cancelled {
  @apply bg-red-50 text-red-900;
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
