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
      <button class="button flex-1 bg-fib text-white" type="button" :disabled="busy || loggedIn" @click="login()">
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

    <form class="flex gap-2" @submit.prevent="login(manualCode)">
      <input v-model.trim="manualCode" class="input flex-1" required autocomplete="off" placeholder="Paste an auth code (desktop testing)" :disabled="busy || loggedIn" />
      <button class="button secondary-button px-4" type="submit" :disabled="busy || loggedIn">Login with code</button>
    </form>

    <section v-if="loggedIn" class="panel">
      <h2 class="font-semibold">Logged-in customer</h2>
      <pre class="mt-2 whitespace-pre-wrap break-words">{{ formatJson(userInfo) }}</pre>
    </section>

    <form class="flex flex-col gap-3" @submit.prevent="createPayment">
      <fieldset :disabled="busy" class="flex flex-col gap-3">
        <legend class="text-sm font-semibold">Create payment (signed in this browser)</legend>

        <label>
          Gateway URL
          <input v-model.trim="gateway.url" type="url" required class="input" autocomplete="off" placeholder="https://..." />
        </label>
        <label>
          Client ID
          <input v-model.trim="gateway.clientId" required class="input" autocomplete="off" />
        </label>
        <label>
          Private key
          <textarea v-model="gateway.privateKey" required rows="4" class="input textarea" autocomplete="off" spellcheck="false" placeholder="PEM or bare base64 (PKCS#8 or PKCS#1)"></textarea>
        </label>
        <label>
          Key version
          <input v-model.trim="gateway.keyVersion" required class="input" inputmode="numeric" />
        </label>
        <label>
          Amount (IQD)
          <input v-model.trim="order.amount" required class="input" inputmode="numeric" pattern="\d+" />
        </label>
        <label>
          Buyer ID
          <input v-model.trim="order.buyerId" required class="input" autocomplete="off" />
          <span class="muted"><code>referenceBuyerId</code>, filled in after login.</span>
        </label>
        <label>
          Redirect URL
          <input v-model.trim="order.redirectUrl" type="url" required class="input" autocomplete="off" />
        </label>
        <span class="muted text-xs">Secrets stay in memory only and are cleared on reload. UAT keys only, never production.</span>

        <button class="button bg-fib text-white" type="submit">
          {{ busy && action === 'create' ? 'Creating payment…' : 'Create payment' }}
        </button>
      </fieldset>
    </form>

    <form class="flex flex-col gap-3" @submit.prevent="pay">
      <fieldset :disabled="!loggedIn || busy" class="flex flex-col gap-3">
        <legend class="text-sm font-semibold">Payment details</legend>

        <label>
          Payment URL
          <input v-model.trim="paymentUrl" type="url" required class="input" autocomplete="off" placeholder="https://wallet.example.com/cashier?orderId=..." />
          <span class="muted">Filled by Create payment, or paste <code>redirectActionForm.redirectUrl</code> from a <code>pay</code> response.</span>
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
import { onMounted, reactive, ref } from 'vue'

const BACKEND_URL = import.meta.env.DEV ? '/proxy/booking-advisors' : 'https://app.bookingadvisors.com'
// The gateway sends no CORS headers: dev uses the Vite proxy, deployed builds use the Cloudflare Worker in worker/
const GATEWAY_PROXY = import.meta.env.DEV ? '/superqi-gateway' : import.meta.env.VITE_SUPERQI_PROXY
const ONLINE_PURCHASE = '51051000101000000011'
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
const manualCode = ref('')
// never persisted: secrets live only in this page's memory
const gateway = reactive({ url: 'https://gateway-qiuat.banqinonprod.com', clientId: '', privateKey: '', keyVersion: '1' })
const order = reactive({ amount: '1000', buyerId: '', redirectUrl: location.href })
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

// code: optional pasted auth code; otherwise a fresh one is requested from Super Qi
async function login(code) {
  failed.value = false
  status.value = ''
  result.value = ''
  userInfo.value = null
  busy.value = true
  action.value = 'login'

  try {
    const { customerId, userInfo: info } = await authenticate(code || (await getAuthCode()))
    loggedIn.value = true
    // accessToken / refreshToken are intentionally not shown or stored
    userInfo.value = { customerId, ...info }
    order.buyerId = info?.userId || customerId || ''
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

// Super Qi expects "+00:00", not "Z"
function superQiTime(date) {
  return date.toISOString().replace('Z', '+00:00')
}

function derLength(n) {
  if (n < 0x80) return [n]
  const bytes = []
  for (; n; n >>= 8) bytes.unshift(n & 0xff)
  return [0x80 | bytes.length, ...bytes]
}

// WebCrypto only imports PKCS#8, so wrap a PKCS#1 key (BEGIN RSA PRIVATE KEY) in a PKCS#8 envelope
function pkcs1ToPkcs8(pkcs1) {
  const header = [0x02, 0x01, 0x00, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00, 0x04, ...derLength(pkcs1.length)]
  return Uint8Array.from([0x30, ...derLength(header.length + pkcs1.length), ...header, ...pkcs1])
}

// Accepts PEM (PKCS#8 or PKCS#1), escaped newlines, or bare base64, same as the backend
async function importPrivateKey(raw) {
  const der = Uint8Array.from(atob(raw.replace(/-----[^-]+-----|\\n|[\s"']/g, '')), c => c.charCodeAt(0))
  const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
  try {
    return await crypto.subtle.importKey('pkcs8', der, algorithm, false, ['sign'])
  } catch {
    return crypto.subtle.importKey('pkcs8', pkcs1ToPkcs8(der), algorithm, false, ['sign'])
  }
}

async function superQiRequest(path, body) {
  const requestTime = superQiTime(new Date())
  const rawBody = JSON.stringify(body)
  const key = await importPrivateKey(gateway.privateKey)
  const content = new TextEncoder().encode(`POST ${path}\n${gateway.clientId}.${requestTime}.${rawBody}`)
  const signature = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, content))))
  const headers = {
    'Content-Type': 'application/json; charset=UTF-8',
    'Client-Id': gateway.clientId,
    'Request-Time': requestTime,
    Signature: `algorithm=RSA256, keyVersion=${gateway.keyVersion}, signature=${signature}`,
  }

  const url = `${GATEWAY_PROXY || gateway.url.replace(/\/$/, '')}${path}`
  if (GATEWAY_PROXY) headers['X-Superqi-Gateway'] = gateway.url

  try {
    const response = await fetch(url, { method: 'POST', headers, body: rawBody })
    return await response.json()
  } catch (error) {
    throw new Error(GATEWAY_PROXY ? errorMessage(error) : `${errorMessage(error)}. Likely blocked by CORS: set VITE_SUPERQI_PROXY to the deployed worker URL.`)
  }
}

async function createPayment() {
  failed.value = false
  status.value = ''
  result.value = ''
  paymentState.value = ''
  busy.value = true
  action.value = 'create'

  try {
    const data = await superQiRequest('/v1/payments/pay', {
      productCode: ONLINE_PURCHASE,
      paymentRequestId: `PAY-${crypto.randomUUID()}`,
      paymentAmount: { currency: 'IQD', value: order.amount },
      order: { orderDescription: 'Super Qi tester order', buyer: { referenceBuyerId: order.buyerId } },
      paymentExpiryTime: superQiTime(new Date(Date.now() + 30 * 60 * 1000)).replace(/\.\d{3}/, ''),
      paymentRedirectUrl: order.redirectUrl,
    })
    const url = data?.redirectActionForm?.redirectUrl || data?.redirectActionForm?.redirectionUrl
    if (url) paymentUrl.value = url
    failed.value = !url
    status.value = url ? 'Payment created. Payment URL filled in below.' : `Payment not created${data?.result?.resultCode ? `: ${data.result.resultCode}` : ''}`
    result.value = formatJson(data)
  } catch (error) {
    failed.value = true
    status.value = 'Create payment failed'
    result.value = errorMessage(error)
  } finally {
    busy.value = false
    action.value = ''
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

.textarea {
  @apply h-auto py-2 font-mono text-xs;
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
