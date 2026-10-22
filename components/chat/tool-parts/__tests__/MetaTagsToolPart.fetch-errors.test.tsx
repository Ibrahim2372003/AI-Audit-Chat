import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MetaTagsToolPart } from '../MetaTagsToolPart';
import { SITE_FETCH_MESSAGES, timeoutMessage } from '../../../../lib/security/site-fetch-error';

/**
 * The route forwards a website failure's own user-safe message as the tool
 * part's errorText. These tests assert each kind of failure renders in the
 * designed "Fetch failed" alert, and that no AI-provider error token leaks in.
 */
const MESSAGES = [
  ...Object.values(SITE_FETCH_MESSAGES),
  timeoutMessage(8000),
  'Fetch failed: 404 Not Found',
  'Fetch failed: 429 Too Many Requests',
  'Expected HTML, got content-type "application/json"',
];

describe('MetaTagsToolPart: website fetch failures', () => {
  it.each(MESSAGES)('shows %j in the fetch-failed alert', (errorText) => {
    render(<MetaTagsToolPart part={{ state: 'output-error', errorText }} />);
    const alert = screen.getByRole('alert', { name: /fetch failed/i });
    expect(alert).toHaveTextContent(errorText);
    expect(alert).not.toHaveTextContent(/ai_error:/);
  });
});
