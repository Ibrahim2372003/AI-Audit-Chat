import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom doesn't implement scrollIntoView; AuditChat calls it in a real
// useEffect for auto-scroll. Stubbing it here is a test-environment
// concern, not a production code change.
Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
});
