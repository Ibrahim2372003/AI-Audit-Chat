'use client';

import { useState } from 'react';
import { SendButton } from '@/components/chat/ui/SendButton';

type Mode = 'random' | 'always-succeed' | 'always-fail';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fake async call: random 600–1400ms latency, outcome per the selected mode. */
function fakeRequest(mode: Mode) {
  return async () => {
    await delay(600 + Math.random() * 800);
    const shouldFail = mode === 'always-fail' || (mode === 'random' && Math.random() < 0.2);
    if (shouldFail) throw new Error('Simulated failure');
  };
}

export default function MotionDemoPage() {
  const [mode, setMode] = useState<Mode>('random');

  return (
    <main className="page">
      <div className="panel">
        <h1>Send button — motion states</h1>
        <p className="lede">
          One state machine (idle → loading → success/error), CSS transitions
          doing all the choreography. Click either button below; use the
          toggle to force a specific outcome instead of waiting on the 20%
          random failure rate.
        </p>

        <div className="mode-toggle" role="radiogroup" aria-label="Outcome mode">
          {(
            [
              ['random', 'Random (20% fail)'],
              ['always-succeed', 'Force success'],
              ['always-fail', 'Force failure'],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={`mode-btn ${mode === value ? 'is-active' : ''}`}
            >
              {text}
            </button>
          ))}
        </div>

        <div className="row">
          <SendButton label="Send" onAction={fakeRequest(mode)} />
          <SendButton
            label="Save"
            loadingLabel="Saving…"
            successLabel="Saved"
            errorLabel="Retry"
            variant="save"
            onAction={fakeRequest(mode)}
          />
        </div>

        <section className="note">
          <h2>Duration &amp; easing notes</h2>
          <ul>
            <li>
              <strong>Hover/focus — 150ms ease-out.</strong> Fast enough to
              read as a direct response to the cursor rather than a delayed
              reaction; ease-out because the motion should feel like it's
              arriving, not winding up.
            </li>
            <li>
              <strong>Press — 100ms ease-in.</strong> Shorter than hover on
              purpose — a press is a commitment, not an invitation, so the
              "in" half of the interaction is faster than the "out" half.
            </li>
            <li>
              <strong>Label/icon crossfade — 200ms ease-in-out,</strong> icon
              scale on a back-out curve (
              <code>cubic-bezier(0.34, 1.56, 0.64, 1)</code>) so each icon
              settles with a tiny overshoot instead of arriving flat.
            </li>
            <li>
              <strong>Success — 220ms back-out pop,</strong> held for 1.4s
              before fading back to idle. The overshoot is the one
              deliberately celebratory beat in the sequence — nothing else
              in the button overshoots.
            </li>
            <li>
              <strong>Error — one 400ms shake,</strong> ±6px, decaying
              amplitude. Short and low-amplitude on purpose: enough to read
              as "no" without feeling like a scolding. Re-triggers on every
              fresh failure, including repeated retries.
            </li>
            <li>
              <strong>Reduced motion is the default,</strong> not an
              exception. All transform-based motion above is added only
              inside <code>@media (prefers-reduced-motion: no-preference)</code>.
              With it off, every state still communicates — color changes
              and a fast opacity crossfade survive — just none of the
              lift/press/pop/shake.
            </li>
          </ul>
        </section>
      </div>

      <style jsx>{`
        .page {
          min-height: 100dvh;
          display: flex;
          justify-content: center;
          padding: 48px 20px;
          background: #0b0e14;
          color: #e7e9ee;
          font-family: system-ui, sans-serif;
        }
        .panel {
          width: 100%;
          max-width: 560px;
        }
        h1 {
          font-size: 20px;
          margin: 0 0 8px;
        }
        .lede {
          color: #8891a3;
          font-size: 14px;
          line-height: 1.6;
          margin: 0 0 24px;
        }
        .mode-toggle {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }
        .mode-btn {
          border: 1px solid #262b36;
          background: transparent;
          color: #c4c9d4;
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 999px;
          cursor: pointer;
        }
        .mode-btn.is-active {
          border-color: #7c9cff;
          color: #7c9cff;
        }
        .row {
          display: flex;
          gap: 12px;
          margin-bottom: 40px;
        }
        .note {
          border-top: 1px solid #262b36;
          padding-top: 20px;
        }
        .note h2 {
          font-size: 14px;
          color: #e7e9ee;
          margin: 0 0 12px;
        }
        .note ul {
          margin: 0;
          padding-left: 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .note li {
          font-size: 13px;
          line-height: 1.6;
          color: #c4c9d4;
        }
        .note code {
          font-family: ui-monospace, monospace;
          font-size: 12px;
          color: #7c9cff;
        }
      `}</style>
    </main>
  );
}
