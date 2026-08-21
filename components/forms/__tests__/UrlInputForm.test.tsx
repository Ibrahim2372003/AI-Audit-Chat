import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UrlInputForm } from '../UrlInputForm';

describe('UrlInputForm', () => {
  it('shows an error and does not submit when the field is empty', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<UrlInputForm onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/enter a url/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows an error and does not submit for a malformed URL', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<UrlInputForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/url to audit/i), 'not a url');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/enter a valid url/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the trimmed URL and clears the field on valid input', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<UrlInputForm onSubmit={onSubmit} />);

    const input = screen.getByLabelText(/url to audit/i);
    await user.type(input, '  https://example.com  ');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(onSubmit).toHaveBeenCalledWith('https://example.com');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(input).toHaveValue('');
  });
});
