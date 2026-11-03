import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROMO_DURATION_SEC,
  PROMO_SCENES,
  clampPromoTime,
  formatPromoTimecode,
  getActivePromoScene,
  validatePromoTimeline,
} from './promoVideoLogic';

test('promo timeline covers exact 45 seconds contiguously without gaps', () => {
  assert.equal(PROMO_DURATION_SEC, 45);
  assert.equal(PROMO_SCENES.length, 6);
  assert.equal(validatePromoTimeline(PROMO_SCENES), true);
});

test('clampPromoTime and formatPromoTimecode handle edge boundaries accurately', () => {
  assert.equal(clampPromoTime(-5), 0);
  assert.equal(clampPromoTime(Number.NaN), 0);
  assert.equal(clampPromoTime(22.5), 22.5);
  assert.equal(clampPromoTime(99), 45);

  assert.equal(formatPromoTimecode(0), '00:00');
  assert.equal(formatPromoTimecode(7), '00:07');
  assert.equal(formatPromoTimecode(45), '00:45');
  assert.equal(formatPromoTimecode(60), '00:45');
});

test('getActivePromoScene transitions accurately across all 6 scenes', () => {
  assert.equal(getActivePromoScene(0).scene.id, 'intro');
  assert.equal(getActivePromoScene(6.99).scene.id, 'intro');
  assert.equal(getActivePromoScene(7.0).scene.id, 'songs');
  assert.equal(getActivePromoScene(15.0).scene.id, 'quran');
  assert.equal(getActivePromoScene(23.0).scene.id, 'radio');
  assert.equal(getActivePromoScene(31.0).scene.id, 'studio');
  assert.equal(getActivePromoScene(39.0).scene.id, 'outro');
  assert.equal(getActivePromoScene(45.0).scene.id, 'outro');
  assert.equal(getActivePromoScene(45.0).globalProgress, 1);
});
