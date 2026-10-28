// SlotSync Shared Phone Normalization Unit Tests
// Tests 12 different phone number formats per Patch 4 Item A

import { describe, it, expect } from 'vitest';
import { normalizePhone } from '../src/shared/phone';

describe('Phone Normalization Module (src/shared/phone.ts)', () => {
  it('1. Indian 10-digit number without prefix', () => {
    const res = normalizePhone('9876543210', 'IN');
    expect(res.valid).toBe(true);
    expect(res.e164).toBe('+919876543210');
    expect(res.display).toContain('+91');
  });

  it('2. +91 with spaces', () => {
    const res = normalizePhone('+91 98765 43210', 'IN');
    expect(res.valid).toBe(true);
    expect(res.e164).toBe('+919876543210');
  });

  it('3. 0-prefixed Indian trunk number', () => {
    const res = normalizePhone('09876543210', 'IN');
    expect(res.valid).toBe(true);
    expect(res.e164).toBe('+919876543210');
  });

  it('4. 91-prefixed without plus sign', () => {
    const res = normalizePhone('919876543210', 'IN');
    expect(res.valid).toBe(true);
    expect(res.e164).toBe('+919876543210');
  });

  it('5. Number with dashes', () => {
    const res = normalizePhone('98765-43210', 'IN');
    expect(res.valid).toBe(true);
    expect(res.e164).toBe('+919876543210');
  });

  it('6. Number with brackets', () => {
    const res = normalizePhone('(98765) 43210', 'IN');
    expect(res.valid).toBe(true);
    expect(res.e164).toBe('+919876543210');
  });

  it('7. UK international number (+44)', () => {
    const res = normalizePhone('+44 7911 123456');
    expect(res.valid).toBe(true);
    expect(res.e164).toBe('+447911123456');
  });

  it('8. US international number (+1)', () => {
    const res = normalizePhone('+1 202-555-0123');
    expect(res.valid).toBe(true);
    expect(res.e164).toBe('+12025550123');
  });

  it('9. Too short number (invalid)', () => {
    const res = normalizePhone('12345', 'IN');
    expect(res.valid).toBe(false);
  });

  it('10. Letters in place of digits (invalid)', () => {
    const res = normalizePhone('abcdefghij', 'IN');
    expect(res.valid).toBe(false);
  });

  it('11. Empty string (invalid)', () => {
    const res = normalizePhone('', 'IN');
    expect(res.valid).toBe(false);
    expect(res.e164).toBe('');
  });

  it('12. Number with extension', () => {
    const res = normalizePhone('+91 9876543210 ext 123', 'IN');
    expect(res.valid).toBe(true);
    expect(res.e164).toBe('+919876543210');
  });
});
