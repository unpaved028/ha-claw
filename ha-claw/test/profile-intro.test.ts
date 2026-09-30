import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { profileFromStored } from '../src/core/profile.js';

describe('telegram first-run flag', () => {
  it('keeps the intro pending on a new profile', () => {
    const profile = profileFromStored({});
    assert.equal(profile.telegramIntroSeen, false);
    assert.equal(profile.onboardingComplete, false);
  });

  it('does not repeat the intro for a profile that finished setup before the flag existed', () => {
    const profile = profileFromStored({ onboardingComplete: true, botName: 'HA-Claw' });
    assert.equal(profile.telegramIntroSeen, true);
  });

  it('keeps an explicit false after the panel marked setup done', () => {
    const profile = profileFromStored({ onboardingComplete: true, telegramIntroSeen: false });
    assert.equal(profile.telegramIntroSeen, false);
  });
});
