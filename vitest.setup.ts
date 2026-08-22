import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, expect, vi } from 'vitest';
import type { AxeResults } from 'axe-core';

// jsdom doesn't implement scrollIntoView; AuditChat calls it in a real
// useEffect for auto-scroll. Stubbing it here is a test-environment
// concern, not a production code change.
Element.prototype.scrollIntoView = vi.fn();

// A small, self-written matcher against axe-core's real result shape,
// rather than the `vitest-axe` wrapper package: that package's own
// `extend-expect` entry point ships as an empty file (verified: 0 lines
// on disk), and its type re-exports don't resolve cleanly on this
// project's TypeScript version either. Fewer moving parts, same check.
expect.extend({
  toHaveNoViolations(results: AxeResults) {
    const pass = results.violations.length === 0;
    return {
      pass,
      message: () =>
        pass
          ? 'expected axe-core violations, found none'
          : `Found ${results.violations.length} accessibility violation(s):\n` +
            results.violations
              .map((v) => `- ${v.id}: ${v.help} (${v.nodes.length} node(s))`)
              .join('\n'),
    };
  },
});

afterEach(() => {
  cleanup();
});
