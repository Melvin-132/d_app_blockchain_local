export const RECOVERY_PHRASE_WORD_COUNTS = Object.freeze([12, 15, 18, 21, 24]);

export function isValidRecoveryPhraseWordCount(count) {
  return RECOVERY_PHRASE_WORD_COUNTS.includes(count);
}

export function normalizeRecoveryPhrase(phrase) {
  const normalizedPhrase = phrase.trim().toLowerCase().split(/\s+/).join(' ');
  if (!normalizedPhrase) {
    throw new Error('Saisissez votre phrase de récupération.');
  }
  if (!isValidRecoveryPhraseWordCount(normalizedPhrase.split(' ').length)) {
    throw new Error('La phrase de récupération doit contenir 12, 15, 18, 21 ou 24 mots.');
  }
  return normalizedPhrase;
}
