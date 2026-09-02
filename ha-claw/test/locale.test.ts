import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { languageFromHaLocale, parseLanguageOption, resolveLanguage } from '../src/core/locale.js';

describe('parseLanguageOption', () => {
  it('accepts auto, en and de', () => {
    assert.equal(parseLanguageOption('auto'), 'auto');
    assert.equal(parseLanguageOption('en'), 'en');
    assert.equal(parseLanguageOption('de'), 'de');
  });

  it('normalises case and unknown values', () => {
    assert.equal(parseLanguageOption('EN'), 'en');
    assert.equal(parseLanguageOption('De'), 'de');
    assert.equal(parseLanguageOption('fr'), 'auto');
    assert.equal(parseLanguageOption(undefined), 'auto');
  });
});

describe('languageFromHaLocale', () => {
  it('treats a missing locale as German', () => {
    assert.equal(languageFromHaLocale(undefined), 'de');
    assert.equal(languageFromHaLocale(null), 'de');
    assert.equal(languageFromHaLocale(''), 'de');
  });

  it('maps de and de-* to German', () => {
    assert.equal(languageFromHaLocale('de'), 'de');
    assert.equal(languageFromHaLocale('de-DE'), 'de');
    assert.equal(languageFromHaLocale('de_CH'), 'de');
  });

  it('maps any other locale to English', () => {
    assert.equal(languageFromHaLocale('en'), 'en');
    assert.equal(languageFromHaLocale('en-GB'), 'en');
    assert.equal(languageFromHaLocale('fr'), 'en');
    assert.equal(languageFromHaLocale('nl-NL'), 'en');
  });
});

describe('resolveLanguage', () => {
  it('honours an explicit option over the HA locale', () => {
    assert.equal(resolveLanguage('en', 'de'), 'en');
    assert.equal(resolveLanguage('de', 'en-US'), 'de');
  });

  it('in auto mode follows the HA locale rules', () => {
    assert.equal(resolveLanguage('auto', 'de-DE'), 'de');
    assert.equal(resolveLanguage('auto', 'en'), 'en');
    assert.equal(resolveLanguage('auto', undefined), 'de');
  });
});
