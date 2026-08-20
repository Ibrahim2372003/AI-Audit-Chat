'use client';

import { useEffect, useRef, useState } from 'react';

type Status = 'idle' | 'loading' | 'success' | 'error';
type Variant = 'send' | 'save';

/**
 * SendButton
 * ----------
 * A button that IS its own status indicator. One element, one state
 * machine, CSS transitions doing the choreography:
 *
 *   idle --click--> loading --resolve--> success --1.4s--> idle
 *                       |
 *                    reject
 *                       v
 *                     error --click (retry)--> loading
 *
 * Design choices (see README for the full note):
 * - State lives in `data-state` on the root <button>. Every visual change
 *   is a CSS transition keyed off that attribute, not a JS-driven animation
 *   library — so interrupting a transition mid-flight (rapid hover, a click
 *   during a fade) just retargets the transition from its current computed
 *   value. Nothing can "break".
 * - The button's width never changes. Label and icon swap via opacity/
 *   transform crossfade inside a fixed-size slot, so no layout thrash and
 *   nothing for a screen magnifier / adjacent layout to jump around.
 * - `prefers-reduced-motion` is the DEFAULT. Transform-based motion (lift,
 *   press, shake, success pop) is added only inside a
 *   `@media (prefers-reduced-motion: no-preference)` block. Color and
 *   icon/label swaps — the actual feedback — happen either way, just as a
 *   fast opacity crossfade instead of a flourish.
 */
export function SendButton({
  label = 'Send',
  loadingLabel = 'Sending…',
  successLabel = 'Sent',
  errorLabel = 'Retry',
  onAction,
  disabled = false,
  variant = 'send',
}: {
  label?: string;
  loadingLabel?: string;
  successLabel?: string;
  errorLabel?: string;
  /** Do the real work here. Resolve for success, throw/reject for failure. */
  onAction: () => Promise<void>;
  disabled?: boolean;
  variant?: Variant;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const revertTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(revertTimer.current), []);

  const handleClick = async () => {
    // Spam-click guard: only idle or error (= retry) can start a new attempt.
    // loading/success ignore clicks outright rather than queuing them.
    if (status === 'loading' || status === 'success') return;
    clearTimeout(revertTimer.current);
    setStatus('loading');
    try {
      await onAction();
      setStatus('success');
      revertTimer.current = setTimeout(() => setStatus('idle'), 1400);
    } catch {
      setStatus('error');
    }
  };

  const isBusy = status === 'loading';
  const isDisabled = disabled || isBusy || status === 'success';

  const currentLabel =
    status === 'loading'
      ? loadingLabel
      : status === 'success'
        ? successLabel
        : status === 'error'
          ? errorLabel
          : label;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      aria-busy={isBusy}
      data-state={status}
      className="motion-btn"
    >
      <span className="motion-btn__icon" aria-hidden="true">
        <IdleIcon variant={variant} className="icon-idle" />
        <SpinnerIcon className="icon-spinner" />
        <CheckIcon className="icon-check" />
        <ErrorIcon className="icon-error" />
      </span>

      <span className="motion-btn__label">{currentLabel}</span>

      {/* Feedback for screen readers doesn't depend on any of the motion above. */}
      <span className="sr-only" role="status" aria-live="polite">
        {status === 'loading' && `${label} in progress`}
        {status === 'success' && `${label} succeeded`}
        {status === 'error' && `${label} failed, press to retry`}
      </span>

      <style jsx>{`
        .motion-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          width: 132px;
          justify-content: center;
          padding: 10px 16px;
          border: none;
          border-radius: 8px;
          font: inherit;
          font-size: 14px;
          font-weight: 600;
          color: #12151c;
          background: #7c9cff;
          cursor: pointer;
          transition:
            background-color 180ms ease-out,
            color 180ms ease-out;
        }

        .motion-btn:disabled {
          cursor: default;
        }

        .motion-btn:focus-visible {
          outline: 2px solid #7c9cff;
          outline-offset: 3px;
        }

        /* ---- status colors: the feedback that survives reduced motion ---- */
        .motion-btn[data-state='loading'] {
          background: #3a4152;
          color: #c4c9d4;
        }
        .motion-btn[data-state='success'] {
          background: #4fd1a5;
          color: #0b0e14;
        }
        .motion-btn[data-state='error'] {
          background: #f0665a;
          color: #12151c;
        }

        .motion-btn__icon {
          position: relative;
          width: 16px;
          height: 16px;
          flex-shrink: 0;
        }

        .motion-btn__icon :global(svg) {
          position: absolute;
          inset: 0;
          opacity: 0;
        }

        /* Whichever icon matches the current state is shown; the rest stay
           at opacity 0 underneath. Base (reduced-motion-safe) transition is
           a quick fade only. */
        .motion-btn__icon :global(svg) {
          transition: opacity 120ms ease-out;
        }
        .motion-btn[data-state='idle'] :global(.icon-idle) {
          opacity: 1;
        }
        .motion-btn[data-state='loading'] :global(.icon-spinner) {
          opacity: 1;
        }
        .motion-btn[data-state='success'] :global(.icon-check) {
          opacity: 1;
        }
        .motion-btn[data-state='error'] :global(.icon-error) {
          opacity: 1;
        }

        .motion-btn :global(.icon-spinner) {
          animation: spin 800ms linear infinite;
          animation-play-state: paused;
        }
        .motion-btn[data-state='loading'] :global(.icon-spinner) {
          animation-play-state: running;
        }

        .motion-btn__label {
          transition: opacity 120ms ease-out;
        }

        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        /* ---- full motion, only when the user hasn't asked us to cut it ---- */
        @media (prefers-reduced-motion: no-preference) {
          .motion-btn {
            transition:
              background-color 180ms ease-out,
              color 180ms ease-out,
              transform 150ms ease-out,
              box-shadow 150ms ease-out;
          }

          /* Hover/focus: a small lift. 150ms ease-out — fast enough to feel
             like a direct response to the cursor, not a delayed reaction. */
          .motion-btn:not(:disabled):hover,
          .motion-btn:focus-visible {
            transform: translateY(-1px);
            box-shadow: 0 4px 14px rgba(124, 156, 255, 0.25);
          }

          /* Press: quick compression, 100ms ease-in — the "in" half of the
             motion should feel faster than the "out" half; a press is a
             commitment, not an invitation. */
          .motion-btn:not(:disabled):active {
            transform: translateY(0) scale(0.97);
            transition-duration: 100ms;
          }

          .motion-btn__icon :global(svg) {
            transition:
              opacity 200ms ease-in-out,
              transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
            transform: scale(0.6);
          }
          .motion-btn[data-state='idle'] :global(.icon-idle),
          .motion-btn[data-state='loading'] :global(.icon-spinner),
          .motion-btn[data-state='success'] :global(.icon-check),
          .motion-btn[data-state='error'] :global(.icon-error) {
            transform: scale(1);
          }

          .motion-btn__label {
            transition: opacity 200ms ease-in-out;
          }

          /* Success: a small overshoot "pop" on the whole button — the one
             deliberately celebratory beat in the whole sequence. Back-out
             easing (overshoots past 1, settles) reads as a positive result
             in a way a linear ease never does. */
          .motion-btn[data-state='success'] {
            animation: pop 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
          }
          @keyframes pop {
            0% {
              transform: scale(1);
            }
            50% {
              transform: scale(1.08);
            }
            100% {
              transform: scale(1);
            }
          }

          /* Error: one shake cycle. Short (400ms) and low-amplitude (6px) —
             enough to read as "no", not enough to feel like a scolding.
             Re-triggers each time the state transitions INTO 'error' (i.e.
             after a retry fails again), since the attribute selector only
             (re)matches on that transition. */
          .motion-btn[data-state='error'] {
            animation:
              pop 0ms,
              shake 400ms ease-in-out;
          }
          @keyframes shake {
            0%,
            100% {
              transform: translateX(0);
            }
            20% {
              transform: translateX(-6px);
            }
            40% {
              transform: translateX(5px);
            }
            60% {
              transform: translateX(-4px);
            }
            80% {
              transform: translateX(3px);
            }
          }
        }
      `}</style>
    </button>
  );
}

// ---- icons -----------------------------------------------------------

function IdleIcon({ variant, className }: { variant: Variant; className: string }) {
  if (variant === 'save') {
    return (
      <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M3 2h8l2 2v10H3V2Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path d="M5 2v4h5V2" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M5 9h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2 8h11M9 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SpinnerIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.8" />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3 8.5 6.5 12 13 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ErrorIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 4.5v4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="8" cy="11.5" r="1" fill="currentColor" />
    </svg>
  );
}
