import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatErrorBanner } from '../ChatErrorBanner';

describe('ChatErrorBanner', () => {
  it('shows credit-balance copy when the account has no API credits', () => {
    render(<ChatErrorBanner error={new Error('insufficient_quota')} onRetry={vi.fn()} />);
    expect(screen.getByText(/no api credits available/i)).toBeInTheDocument();
  });

  it('shows rate-limit copy for a 429 error', () => {
    render(<ChatErrorBanner error={new Error('Request failed with status 429')} onRetry={vi.fn()} />);
    expect(screen.getByText(/faster than the audit service/i)).toBeInTheDocument();
  });

  it('shows connection-drop copy for a network/fetch error', () => {
    render(<ChatErrorBanner error={new Error('fetch failed')} onRetry={vi.fn()} />);
    expect(screen.getByText(/lost the connection/i)).toBeInTheDocument();
  });

  it('disables the retry button immediately after the first click, so a double click cannot fire twice', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ChatErrorBanner error={new Error('boom')} onRetry={onRetry} />);

    const button = screen.getByRole('button', { name: /retry last message/i });
    await user.click(button);

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
  });
});
