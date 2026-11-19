import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidRecoveryPhraseWordCount, normalizeRecoveryPhrase } from '../src/shared/recovery-phrase.js';

const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

test('normalizes a twelve-word recovery phrase', () => {
  assert.equal(normalizeRecoveryPhrase(`  ${phrase.toUpperCase()}  `), phrase);
});

test('accepts standard BIP-39 phrase lengths, including twenty-four words', () => {
  for (const wordCount of [12, 15, 18, 21, 24]) {
    assert.equal(isValidRecoveryPhraseWordCount(wordCount), true);
  }
  assert.equal(normalizeRecoveryPhrase(Array(24).fill('abandon').join(' ')).split(' ').length, 24);
});

test('rejects recovery phrases with unsupported word counts', () => {
  assert.throws(() => normalizeRecoveryPhrase('abandon abandon'), /12, 15, 18, 21 ou 24 mots/);
  assert.equal(isValidRecoveryPhraseWordCount(13), false);
  assert.throws(() => normalizeRecoveryPhrase(''), /phrase de récupération/);
});
