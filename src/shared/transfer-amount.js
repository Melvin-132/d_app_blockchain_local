import { parseUnits } from 'ethers';

export const MIN_CYD_TRANSFER = '0.10';

const AMOUNT_PATTERN = /^\d+([.,]\d{1,18})?$/;

function parseTransferAmount(amount) {
  const normalizedAmount = String(amount).trim().replace(',', '.');
  if (!AMOUNT_PATTERN.test(normalizedAmount)) {
    throw new Error('Saisissez un montant positif avec au maximum 18 décimales.');
  }
  return parseUnits(normalizedAmount, 18);
}

export function parseCydTransferAmount(amount) {
  const value = parseTransferAmount(amount);
  if (value < parseUnits(MIN_CYD_TRANSFER, 18)) {
    throw new Error(`Le montant minimum d’un transfert est de ${MIN_CYD_TRANSFER.replace('.', ',')} CYD.`);
  }
  return value;
}

export function parseEthTransferAmount(amount) {
  const value = parseTransferAmount(amount);
  if (value <= 0n) {
    throw new Error('Saisissez un montant ETH supérieur à zéro.');
  }
  return value;
}
