const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const AMOUNT_PATTERN = /^\d+([.,]\d{1,18})?$/;

export function createCydPaymentUrl(dappUrl, recipient, amount = '', origin) {
  const address = recipient.trim();
  if (!ADDRESS_PATTERN.test(address)) {
    throw new Error('Une adresse Ethereum valide est requise pour la demande de paiement.');
  }

  const normalizedAmount = amount.trim().replace(',', '.');
  if (normalizedAmount) {
    if (!AMOUNT_PATTERN.test(amount.trim())) {
      throw new Error('Le montant doit être positif et comporter au maximum 18 décimales.');
    }
    const [whole, fraction = ''] = normalizedAmount.split('.');
    if (BigInt(whole) === 0n && !/[1-9]/.test(fraction)) {
      throw new Error('Le montant demandé doit être supérieur à zéro.');
    }
  }

  const url = new URL(dappUrl, origin);
  url.searchParams.set('to', address);
  if (normalizedAmount) url.searchParams.set('amount', normalizedAmount);
  else url.searchParams.delete('amount');
  return url.toString();
}
