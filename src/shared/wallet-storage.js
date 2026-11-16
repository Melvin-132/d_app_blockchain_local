const WALLET_STORAGE_KEY = 'clayde.wallet.keystores';
const LEGACY_WALLET_STORAGE_KEY = 'clayde.wallet.keystore';
const ADDRESS_PATTERN = /^(0x)?[a-fA-F0-9]{40}$/;

function normalizeAddress(address) {
  if (typeof address !== 'string' || !ADDRESS_PATTERN.test(address)) {
    throw new Error('Une adresse de portefeuille enregistrée est invalide.');
  }
  return `0x${address.replace(/^0x/i, '')}`;
}

function validateWallet(entry) {
  if (!entry || typeof entry !== 'object' || typeof entry.keystore !== 'string' || !entry.keystore) {
    throw new Error('La liste des portefeuilles enregistrés est invalide.');
  }
  return { address: normalizeAddress(entry.address), keystore: entry.keystore };
}

export function getStoredWallets(storage) {
  const saved = storage.getItem(WALLET_STORAGE_KEY);
  if (saved !== null) {
    let entries;
    try {
      entries = JSON.parse(saved);
    } catch {
      throw new Error('La liste des portefeuilles enregistrés est illisible.');
    }
    if (!Array.isArray(entries)) {
      throw new Error('La liste des portefeuilles enregistrés est invalide.');
    }
    return entries.map(validateWallet);
  }

  const legacyKeystore = storage.getItem(LEGACY_WALLET_STORAGE_KEY);
  if (!legacyKeystore) return [];

  let legacyWallet;
  try {
    legacyWallet = JSON.parse(legacyKeystore);
  } catch {
    throw new Error('Le portefeuille déjà enregistré est illisible. Ne supprimez pas les données du navigateur.');
  }
  const migratedWallet = validateWallet({ address: legacyWallet.address, keystore: legacyKeystore });
  storage.setItem(WALLET_STORAGE_KEY, JSON.stringify([migratedWallet]));
  storage.removeItem(LEGACY_WALLET_STORAGE_KEY);
  return [migratedWallet];
}

export function saveStoredWallet(storage, address, keystore) {
  const wallet = validateWallet({ address, keystore });
  const wallets = getStoredWallets(storage);
  const matchingWallet = wallets.findIndex(({ address: savedAddress }) =>
    savedAddress.toLowerCase() === wallet.address.toLowerCase());
  if (matchingWallet === -1) {
    wallets.push(wallet);
  } else {
    wallets[matchingWallet] = wallet;
  }
  storage.setItem(WALLET_STORAGE_KEY, JSON.stringify(wallets));
  return wallets;
}

export function getStoredWallet(storage, address) {
  const normalizedAddress = normalizeAddress(address).toLowerCase();
  return getStoredWallets(storage).find(({ address: savedAddress }) =>
    savedAddress.toLowerCase() === normalizedAddress) || null;
}
