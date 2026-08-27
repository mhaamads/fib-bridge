<template>
  <div>
    <button class="fixed end-4 bottom-4 z-[1000] rounded-md bg-neutral-900 px-4 py-2 text-xs font-semibold text-white shadow-lg" type="button" @click="loggerOpen = true">
      Errors<span v-if="errors.length"> ({{ errors.length }})</span>
    </button>

    <div v-if="loggerOpen" class="fixed inset-0 z-[1100] grid items-end justify-items-center bg-black/45 p-4" @click.self="loggerOpen = false">
      <section class="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white text-gray-900 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="logger-title">
        <header class="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <h2 id="logger-title" class="m-0 text-base font-semibold">Runtime errors</h2>
          <button class="border-0 bg-transparent text-2xl leading-none text-gray-500" type="button" aria-label="Close error log" @click="loggerOpen = false">
            ×
          </button>
        </header>

        <div class="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-2 text-xs text-gray-500">
          <span>{{ errors.length }} captured</span>
          <button v-if="errors.length" class="border-0 bg-transparent text-blue-600" type="button" @click="clearErrors">Clear</button>
        </div>

        <p v-if="!errors.length" class="m-0 p-8 text-center text-sm text-gray-500">No errors captured.</p>
        <div v-else class="overflow-auto p-3">
          <article v-for="(entry, index) in errors" :key="`${entry.time}-${index}`" class="mb-3 rounded-md border border-gray-200 bg-gray-50 p-3 last:mb-0">
            <div class="flex items-center justify-between gap-3 text-xs text-red-800">
              <strong>{{ entry.kind }}</strong>
              <span class="font-normal text-gray-500">{{ entry.time }}</span>
            </div>
            <div v-if="entry.method" class="mt-1 break-all font-mono text-xs text-gray-700">
              {{ entry.method }} {{ entry.url }}<span v-if="entry.status"> · {{ entry.status }}</span>
            </div>
            <pre class="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-gray-800">{{ pretty(entry.details) }}</pre>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { onUnmounted, ref } from 'vue'

const SENSITIVE_KEY = /auth.?code|access.?token|refresh.?token|authorization|api.?key|secret/i
const LOGGER_KEY = '__bookingAdvisorsErrorLogger'

function redactString(value) {
  return value.replace(
    /((?:["']?(?:auth.?code|access.?token|refresh.?token|authorization|api.?key|secret)["']?)\s*[=:]\s*)(["']?)[^\s,"'}]+\2/gi,
    '$1[redacted]',
  )
}

function sanitize(value, key = '', seen = new WeakSet()) {
  if (SENSITIVE_KEY.test(key)) return '[redacted]'
  if (typeof value === 'string') return redactString(value)
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return '[circular]'
  seen.add(value)

  if (value instanceof Error) {
    return sanitize({ name: value.name, message: value.message, stack: value.stack }, '', seen)
  }

  if (Array.isArray(value)) return value.map(item => sanitize(item, '', seen))

  return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, sanitize(item, name, seen)]))
}

function safeUrl(value) {
  try {
    const url = new URL(value, window.location.href)
    return `${url.origin}${url.pathname}`
  } catch {
    return String(value).split(/[?#]/, 1)[0]
  }
}

function responseDetails(body) {
  try {
    return sanitize(JSON.parse(body))
  } catch {
    return sanitize(body || 'No response body')
  }
}

function createLogger() {
  if (window[LOGGER_KEY]) return window[LOGGER_KEY]

  const logger = {
    entries: [],
    listeners: new Set(),
    record(entry) {
      const item = { time: new Date().toISOString(), ...entry }
      this.entries = [item, ...this.entries].slice(0, 100)
      for (const listener of this.listeners) listener(item)
    },
  }
  window[LOGGER_KEY] = logger

  const nativeFetch = window.fetch.bind(window)
  window.fetch = async (input, init = {}) => {
    const request = typeof Request !== 'undefined' && input instanceof Request ? input : null
    const method = String(init.method || request?.method || 'GET').toUpperCase()
    const url = safeUrl(request?.url || input)

    try {
      const response = await nativeFetch(input, init)
      if (!response.ok) {
        const body = await response.clone().text().catch(() => '')
        logger.record({
          kind: 'HTTP',
          method,
          url,
          status: `${response.status} ${response.statusText}`.trim(),
          details: responseDetails(body),
        })
      }
      return response
    } catch (error) {
      logger.record({ kind: 'HTTP', method, url, status: 'Network error', details: sanitize(error) })
      throw error
    }
  }

  const nativeConsoleError = console.error.bind(console)
  console.error = (...args) => {
    const details = args.map(arg => sanitize(arg))
    nativeConsoleError(...details)
    logger.record({ kind: 'CONSOLE', details })
  }

  window.addEventListener('error', event => {
    logger.record({
      kind: 'RUNTIME',
      details: sanitize({
        message: event.message,
        source: safeUrl(event.filename || window.location.href),
        line: event.lineno,
        column: event.colno,
        error: event.error,
      }),
    })
  })

  window.addEventListener('unhandledrejection', event => {
    logger.record({ kind: 'PROMISE', details: sanitize(event.reason) })
  })

  return logger
}

const logger = createLogger()
const errors = ref([...logger.entries])
const loggerOpen = ref(false)
const updateErrors = entry => {
  errors.value = [entry, ...errors.value].slice(0, 100)
}
logger.listeners.add(updateErrors)

function pretty(value) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2) || String(value)
  } catch {
    return String(value)
  }
}

function clearErrors() {
  logger.entries = []
  errors.value = []
}

onUnmounted(() => logger.listeners.delete(updateErrors))
</script>
