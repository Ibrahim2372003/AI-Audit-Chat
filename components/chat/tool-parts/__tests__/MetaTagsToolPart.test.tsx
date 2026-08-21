import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MetaTagsToolPart } from '../MetaTagsToolPart';

describe('MetaTagsToolPart', () => {
  it('shows a drafting status while input is still streaming in', () => {
    render(<MetaTagsToolPart part={{ state: 'input-streaming', input: { url: 'https://ex' } }} />);
    expect(screen.getByRole('status', { name: /drafting audit request/i })).toBeInTheDocument();
  });

  it('shows the URL being fetched once input is finalized', () => {
    render(
      <MetaTagsToolPart part={{ state: 'input-available', input: { url: 'https://example.com' } }} />
    );
    const status = screen.getByRole('status', { name: /fetching meta tags/i });
    expect(status).toHaveTextContent('https://example.com');
  });

  it('renders the findings card as a real component when output is available', () => {
    render(
      <MetaTagsToolPart
        part={{
          state: 'output-available',
          output: {
            url: 'https://example.com',
            score: 85,
            findings: [{ label: 'Title tag present', pass: true, value: 'Example' }],
          },
        }}
      />
    );
    expect(screen.getByRole('status', { name: /audit complete/i })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Title tag present')).toBeInTheDocument();
    // proves it's a rendered component, not a JSON dump
    expect(screen.queryByText(/"score":/)).not.toBeInTheDocument();
  });

  it('shows a designed error message on output-error, not a crash', () => {
    render(
      <MetaTagsToolPart part={{ state: 'output-error', errorText: 'Fetch failed: 404 Not Found' }} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Fetch failed: 404 Not Found');
  });
});
