export const WALLET_PASSWORD_POLICY_MESSAGE = 'Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un symbole, sans espace.';

export function isStrongWalletPassword(password) {
  return typeof password === 'string'
    && password.length >= 8
    && !/\p{White_Space}/u.test(password)
    && /\p{Lu}/u.test(password)
    && /\p{Ll}/u.test(password)
    && /\p{N}/u.test(password)
    && /[\p{P}\p{S}]/u.test(password);
}

export function assertStrongWalletPassword(password) {
  if (!isStrongWalletPassword(password)) {
    throw new Error(WALLET_PASSWORD_POLICY_MESSAGE);
  }
}
