const WALLET_SESSION_KEY = 'clayde.wallet.tab-session.v1';
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const PRIVATE_KEY_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const ASSETS = new Set(['', 'CYD', 'ETH']);
const VIEWS = new Set(['home', 'send', 'receive', 'activity', 'settings']);

function validateSession(value) {
  if (!value || typeof value !== 'object'
    || !ADDRESS_PATTERN.test(value.address)
    || !ASSETS.has(value.selectedAsset)
    || !VIEWS.has(value.walletView)
    || !['local', 'metamask'].includes(value.source)) {
    throw new Error('La session du portefeuille est invalide.');
  }
  if (value.source === 'local' && !PRIVATE_KEY_PATTERN.test(value.privateKey)) {
    throw new Error('La clé de la session locale est invalide.');
  }
  return {
    address: value.address,
    source: value.source,
    privateKey: value.source === 'local' ? value.privateKey : '',
    selectedAsset: value.selectedAsset,
    walletView: value.walletView,
  };
}

export function readWalletSession(storage) {
  const saved = storage.getItem(WALLET_SESSION_KEY);
  if (saved === null) return null;
  let session;
  try {
    session = JSON.parse(saved);
  } catch {
    throw new Error('La session enregistrée est illisible.');
  }
  return validateSession(session);
}

export function saveWalletSession(storage, session) {
  const validatedSession = validateSession(session);
  storage.setItem(WALLET_SESSION_KEY, JSON.stringify(validatedSession));
}

export function clearWalletSession(storage) {
  storage.removeItem(WALLET_SESSION_KEY);
}
