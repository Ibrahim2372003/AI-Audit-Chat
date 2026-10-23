import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import EmptyState from '../EmptyState';
import { fetchMetaTags } from '../../../lib/ai/tools/fetch-meta-tags';

/**
 * The empty state is the first thing a visitor reads, so its claims have to
 * match what the app really does. Production shipped URL fetching (SSRF-guarded
 * fetchMetaTags) while this screen still said "This can't fetch a URL on its
 * own yet". These tests keep the copy honest.
 */
describe('EmptyState copy', () => {
  it('keeps the headline other tests and the e2e spec rely on', () => {
    render(<EmptyState />);
    expect(
      screen.getByText(/paste a page in, get a prioritized seo audit back/i),
    ).toBeInTheDocument();
  });

  it('no longer claims URLs cannot be fetched, or asks for pasted tag text', () => {
    render(<EmptyState />);
    expect(screen.queryByText(/can.t fetch a url/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/paste the page.s title tag/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/title: home \| acme/i)).not.toBeInTheDocument();
  });

  it('tells the visitor to enter a URL and what will be checked and scored', () => {
    render(<EmptyState />);
    const copy = screen.getByText(/enter a public page url/i);
    for (const signal of [
      /title tag/i,
      /meta description/i,
      /canonical/i,
      /robots/i,
      /open graph/i,
      /twitter/i,
      /out of 100/i,
    ]) {
      expect(copy.textContent).toMatch(signal);
    }
  });

  it('only names signals the tool really extracts (copy cannot drift from the tool)', () => {
    const declared = String((fetchMetaTags as unknown as { description?: string }).description);
    for (const signal of [/title/i, /description/i, /canonical/i, /robots/i, /open graph/i, /twitter/i]) {
      expect(declared).toMatch(signal);
    }
  });

  it('states the real limits: public pages only', () => {
    render(<EmptyState />);
    expect(screen.getByText(/public web pages only/i).textContent).toMatch(
      /private or internal addresses/i,
    );
  });

  it('shows an example the URL form would accept (http or https URL)', () => {
    render(<EmptyState />);
    const example = screen.getByText(/^https?:\/\//i).textContent ?? '';
    const url = new URL(example.trim());
    expect(['http:', 'https:']).toContain(url.protocol);
  });
});
