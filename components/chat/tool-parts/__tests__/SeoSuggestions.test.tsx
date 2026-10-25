import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeoSuggestions } from '../SeoSuggestions';

const response = {
  url: 'https://example.com/products/widget',
  title: {
    current: 'Widget | Example',
    suggested: 'Widget for Everyday Tasks | Example',
    rationale: 'The audited title is brief and can be clearer while keeping its existing topic.',
  },
  description: {
    current: 'A useful widget for everyday tasks.',
    suggested:
      'Explore a useful widget for everyday tasks. See the product details and find the right fit for your needs.',
    rationale: 'The current description is short; this adds context without asserting new product claims.',
  },
};

describe('SeoSuggestions', () => {
  const fetchMock = vi.fn();
  const writeText = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    writeText.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders current and suggested values, rationales, and copies selected suggestion text', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => response,
    });
    render(<SeoSuggestions url={response.url} />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate suggestions' }));

    expect(await screen.findByText(response.title.current)).toBeInTheDocument();
    expect(screen.getByText(response.title.suggested)).toBeInTheDocument();
    expect(screen.getByText(response.title.rationale)).toBeInTheDocument();
    expect(screen.getByText(response.description.current)).toBeInTheDocument();
    expect(screen.getByText(response.description.suggested)).toBeInTheDocument();
    expect(
      screen.getByText('Suggestions only — nothing has been edited or published on your website.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy seo title' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(response.title.suggested));
    expect(screen.getByRole('button', { name: 'Copied seo title' })).toBeInTheDocument();
  });

  it('shows loading state and rejects an invalid response shape', async () => {
    let finishResponse: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        finishResponse = resolve;
      }),
    );
    render(<SeoSuggestions url={response.url} />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate suggestions' }));
    expect(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/fetching the audited page/i);

    finishResponse({
      ok: true,
      json: async () => ({ url: response.url, title: null }),
    });

    expect(
      await screen.findByRole('alert', {
        name: '',
      }),
    ).toHaveTextContent('The suggestions service returned an invalid response. Please retry.');
  });

  it('shows a safe error returned by the endpoint', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Suggestions could not be validated. Please try again.' }),
    });
    render(<SeoSuggestions url={response.url} />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate suggestions' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Suggestions could not be validated. Please try again.',
    );
  });
});
