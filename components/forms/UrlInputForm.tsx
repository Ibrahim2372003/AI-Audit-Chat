import { useState, type FormEvent } from 'react';

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function UrlInputForm({ onSubmit }: { onSubmit: (url: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Enter a URL to audit.');
      return;
    }
    if (!isValidUrl(trimmed)) {
      setError('Enter a valid URL, including https://');
      return;
    }
    setError(null);
    onSubmit(trimmed);
    setValue('');
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label htmlFor="audit-url">URL to audit</label>
      <input
        id="audit-url"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? 'audit-url-error' : undefined}
      />
      {error && (
        <p id="audit-url-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit">Send</button>
    </form>
  );
}
