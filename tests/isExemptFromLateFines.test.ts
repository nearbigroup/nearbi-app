import test from 'node:test';
import assert from 'node:assert/strict';
import { isExemptFromLateFines } from '../lib/fineSettings.ts';

test('isExemptFromLateFines returns true for null or undefined staff', () => {
  assert.equal(isExemptFromLateFines(null), true);
  assert.equal(isExemptFromLateFines(undefined), true);
});

test('isExemptFromLateFines returns true for hourly staff even with valid shift_id', () => {
  assert.equal(isExemptFromLateFines({ pay_type: 'hourly', shift_id: 'shift-123' }), true);
  assert.equal(isExemptFromLateFines({ pay_type: 'hourly', shift_id: null }), true);
});

test('isExemptFromLateFines returns true for staff without shift_id regardless of pay_type', () => {
  assert.equal(isExemptFromLateFines({ pay_type: 'monthly', shift_id: null }), true);
  assert.equal(isExemptFromLateFines({ pay_type: 'monthly', shift_id: undefined }), true);
  assert.equal(isExemptFromLateFines({ pay_type: 'monthly', shift_id: '' }), true);
  assert.equal(isExemptFromLateFines({ pay_type: 'monthly', shift_id: '   ' }), true);
});

test('isExemptFromLateFines returns false for monthly staff with valid shift_id', () => {
  assert.equal(isExemptFromLateFines({ pay_type: 'monthly', shift_id: 'shift-abc' }), false);
  assert.equal(isExemptFromLateFines({ pay_type: undefined, shift_id: 'shift-abc' }), false);
});
