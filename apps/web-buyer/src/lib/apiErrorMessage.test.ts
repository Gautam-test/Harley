import { describe, it, expect } from 'vitest';
import { ApiError, apiErrorMessage } from './api';

describe('apiErrorMessage', () => {
  it('extracts the friendly message from a fieldErrors JSON envelope', () => {
    const e = new ApiError(
      400,
      'VALIDATION_ERROR',
      JSON.stringify({ fieldErrors: { pincode: ['Entered Pincode does not match with the selected City and State.'] } }),
    );
    expect(apiErrorMessage(e)).toBe('Entered Pincode does not match with the selected City and State.');
  });

  it('returns a plain (non-JSON) message unchanged', () => {
    const e = new ApiError(409, 'ENQUIRY_ALREADY_OPEN', 'You already have an active enquiry for this motorcycle.');
    expect(apiErrorMessage(e)).toBe('You already have an active enquiry for this motorcycle.');
  });

  it('falls back for non-ApiError values', () => {
    expect(apiErrorMessage(new Error('boom'), 'Could not send')).toBe('Could not send');
  });

  it('never leaks raw JSON braces to the UI', () => {
    const e = new ApiError(400, 'VALIDATION_ERROR', JSON.stringify({ fieldErrors: { email: ['Invalid email.'] } }));
    const out = apiErrorMessage(e);
    expect(out).toBe('Invalid email.');
    expect(out).not.toContain('{');
  });
});
