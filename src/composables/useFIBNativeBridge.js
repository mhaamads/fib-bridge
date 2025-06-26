class InvalidMessageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidMessageError';
  }
}

export class UnsupportedPlatformError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsupportedPlatformError';
  }
}

function isValidSendableMessage(message) {
  if (typeof message !== 'object' || message === null) return false;
  if (typeof message.type !== 'string') return false;
  console.log(message);
  
  switch (message.type) {
    case 'EXIT':
      return true;
    case 'AUTHENTICATE':
      return message.body && typeof message.body.readableId === 'string';
    case 'PAYMENT':
      return message.body &&
        typeof message.body.readableId === 'string' &&
        typeof message.body.transactionId === 'string';
    default:
      return false;
  }
}

function isValidReceivableMessage(message) {
  if (typeof message !== 'object' || message === null) return false;
  if (typeof message.type !== 'string') return false;

  switch (message.type) {
    case 'AUTHENTICATED':
    case 'AUTHENTICATION_FAILED':
      return true;
    case 'PAYMENT_SUCCESSFULLY_PAID':
      return message.body && typeof message.body.transactionId === 'string';
    case 'PAYMENT_FAILED':
      return message.body &&
        typeof message.body.transactionId === 'string' &&
        typeof message.body.reason === 'string';
    default:
      return false;
  }
}

export function useFIBNativeBridge() {
  const listeners = new Map();

  const sendMessage = (message) => {
    if (!isValidSendableMessage(message)) {
      throw new InvalidMessageError('Invalid message format');
    }

    const serialized = JSON.stringify(message);

    if (window?.AndroidInterface) {
      window.AndroidInterface.postMessage(serialized);
    } else if (window?.webkit?.messageHandlers?.FIBNativeBridge) {
      window.webkit.messageHandlers.FIBNativeBridge.postMessage(serialized);
    } else {
      throw new UnsupportedPlatformError(
        'Native bridge only supported when running embedded in FIB mobile app!'
      );
    }
  };

  const receiveMessage = (raw) => {
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new InvalidMessageError('Invalid JSON string');
    }

    if (!isValidReceivableMessage(parsed)) {
      throw new InvalidMessageError('Invalid message format');
    }

    const type = parsed.type;
    const callback = listeners.get(type);
    if (callback) {
      callback(parsed);
    }

    return 'FIB_BRIDGE:RECEIVED';
  };

  const on = (eventType, callback) => {
    listeners.set(eventType, callback);
  };

  const off = (eventType) => {
    listeners.delete(eventType);
  };

  const registerBridge = () => {
    window.FIBNativeBridge = {
      sendMessage,
      receiveMessage,
      on,
      off,
    };

    window.notifyWebView = receiveMessage;
  };

 

  return {
    registerBridge,
    sendMessage,
    on,
    off,
  };
}
