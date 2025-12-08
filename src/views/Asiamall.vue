<template>
  <div class="p-4 max-w-lg mx-auto">
    <h2 class="text-xl font-semibold mb-4">Token Encryption & Callback</h2>

    <div class="mb-4">
      <label class="block mb-1">Plain Mobile (MSISDN):</label>
      <input v-model="plainText" type="text" placeholder="Enter MSISDN" class="w-full p-2 border rounded" />
    </div>

    <div class="gap-y-2 grid  mb-4">
      <button @click="encryptToken" class="px-4 py-2 rounded shadow bg-sky-500 text-white">Encrypt</button>
      <button @click="decryptToken" class="px-4 py-2 rounded shadow bg-sky-500 text-white">Decrypt</button>
    </div>

    <div class="mb-4">
      <label class="block mb-1">Encrypted Token:</label>
      <textarea v-model="encryptedText" rows="2" class="w-full p-2 border rounded"></textarea>
    </div>

    <div class="space-x-2 mb-6">
      <button @click="sendOrderCallback" class="px-4 py-2 rounded shadow bg-sky-500 text-white">Send Callback</button>
    </div>

    <div v-if="callbackResponse" class="bg-gray-100 p-3 rounded">
      <h3 class="font-medium mb-2">Callback Response:</h3>
      <pre class="text-sm">{{ callbackResponse }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import CryptoJS from 'crypto-js'


const plainText = ref('')
const encryptedText = ref('')
const callbackResponse = ref<string | null>(null)

function getKeySpecFromSecret(secret: string) {
  const hash = CryptoJS.SHA256(secret);
  return CryptoJS.enc.Hex.parse(hash.toString().substring(0, 32)); // 16 bytes = 32 hex chars
}

const SECRET = import.meta.env.VITE_SECRET; // your actual partner secret key

function encryptToken() {
  const keySpec = getKeySpecFromSecret(SECRET);
  const encrypted = CryptoJS.AES.encrypt(plainText.value, keySpec, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  });

  const base64 = encrypted.ciphertext.toString(CryptoJS.enc.Base64);
  encryptedText.value = encodeURIComponent(base64); // PHP uses urlencode
}

function decryptToken() {
  try {
    const keySpec = getKeySpecFromSecret(SECRET);
    const base64Decoded = decodeURIComponent(encryptedText.value);
    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(base64Decoded) } as any,
      keySpec,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
    );

    plainText.value = decrypted.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    console.error('Decryption error:', e);
    alert('Failed to decrypt token. Check the key and token.');
  }
}


async function sendOrderCallback() {
  const mobile = decryptTextForCallback()
  const payload = {
    order_currency_code: 'IQD',
    mobile_number: mobile,
    status: 'pending',
    total_item_count: 2,
    total_qty_ordered: 3,
    items: [
      { price: 140, qty_ordered: 1, name: 'Product Name', sku: 'product-sku', product_id: 123, additional_options: { key1: 'value1', key2: 'value2', key3: 'value3', key4: 'value4', key5: 'value5' } },
      { price: 200, qty_ordered: 2, name: 'Product Name', sku: 'product-sku', product_id: 124, additional_options: { key1: 'value1', key2: 'value2', key3: 'value3', key4: 'value4', key5: 'value5' } }
    ],
    subtotal: 540,
    shipping_amount: 10,
    discount_amount: 20,
    grandtotal: 530,
    billing_address: {
      email: 'customer@example.com', region: 'California', region_id: 12, region_code: 'CA', country_id: 'US', street: ['123 Main Street'], telephone: '1234567890', postcode: '90210', city: 'Beverly Hills', firstname: 'John', lastname: 'Doe'
    },
    shipping_address: {
      email: 'customer@example.com', region: 'California', region_id: 12, region_code: 'CA', country_id: 'US', street: ['123 Main Street'], telephone: '1234567890', postcode: '90210', city: 'Beverly Hills', firstname: 'John', lastname: 'Doe'
    },
    payment: { method: 'checkmo' },
    shipping_method: 'flatrate_flatrate',
  }

  try {
    const res = await fetch('https://asiamall.asiacell.com/partners/ordercallback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: '••••••' // replace with actual partner token
      },
      body: JSON.stringify(payload)
    })
    callbackResponse.value = await res.text()
  } catch (err) {
    console.error(err)
    callbackResponse.value = 'Error sending callback'
  }
}

// helper that decrypts current encryptedText without mutating plainText
function decryptTextForCallback(): string {
  const bytes = CryptoJS.AES.decrypt(
    encryptedText.value,
    CryptoJS.enc.Utf8.parse(SECRET),
    { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
  )
  return bytes.toString(CryptoJS.enc.Utf8)
}
</script>
