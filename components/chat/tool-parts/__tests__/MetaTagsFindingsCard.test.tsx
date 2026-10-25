import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MetaTagsFindingsCard } from '../MetaTagsFindingsCard';

describe('MetaTagsFindingsCard', () => {
  it('renders a pass/fail row per finding with the score', () => {
    render(
      <MetaTagsFindingsCard
        result={{
          url: 'https://example.com',
          score: 60,
          findings: [
            { label: 'Title tag present', pass: true, value: 'Example Site' },
            { label: 'Meta description present', pass: false, value: null },
          ],
        }}
      />
    );
    expect(screen.getByLabelText('Score 60 out of 100')).toBeInTheDocument();
    expect(screen.getByText('Title tag present')).toBeInTheDocument();
    expect(screen.getByText('Meta description present')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(2);
  });

  it('does not overclaim when every check fails: it describes the fetched HTML, not the page', () => {
    render(
      <MetaTagsFindingsCard
        result={{
          url: 'https://example.com',
          score: 0,
          findings: [
            { label: 'Title tag present', pass: false, value: null },
            { label: 'Meta description present', pass: false, value: null },
          ],
        }}
      />
    );
    const note = screen.getByText(/none of the checked tags were found in the html we fetched/i);
    expect(note).toHaveTextContent(/javascript/i);
    expect(note).toHaveTextContent(/not proof/i);
    expect(screen.queryByText(/real result/i)).not.toBeInTheDocument();
  });

  it('shows no such note when at least one check passes', () => {
    render(
      <MetaTagsFindingsCard
        result={{
          url: 'https://example.com',
          score: 20,
          findings: [
            { label: 'Title tag present', pass: true, value: 'Example Site' },
            { label: 'Meta description present', pass: false, value: null },
          ],
        }}
      />
    );
    expect(screen.queryByText(/none of the checked tags/i)).not.toBeInTheDocument();
  });

  it('falls back to a designed notice instead of crashing on a malformed result', () => {
    render(<MetaTagsFindingsCard result={{ url: 'https://example.com' } as any} />);
    expect(screen.getByRole('status')).toHaveTextContent(/wasn't in the expected shape/i);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
