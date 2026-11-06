import { useEffect, useId, useState, type FormEvent } from 'react';
import { Icon } from '../../../desktop/src/renderer/components/Icons';
import { LAUNCH_OFFER, WAITLIST_API } from '../config';

type State = 'idle' | 'sending' | 'ok' | 'invalid' | 'error';

const MESSAGES: Record<Exclude<State, 'idle' | 'sending'>, string> = {
  ok: `You’re on the list. We’ll email you at launch, with ${LAUNCH_OFFER}.`,
  invalid: 'That email doesn’t look right.',
  error: 'Something went wrong. Try again in a minute.',
};

/**
 * Email field for the launch list. Works without JavaScript (plain form post, redirected back with ?waitlist=…);
 * with JavaScript it posts JSON and answers in place.
 */
export function WaitlistForm({ className = '', align = 'center' }: { className?: string; align?: 'center' | 'stretch' }) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>('idle');

  // Back from a form post without JavaScript.
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get('waitlist');
    if (result === 'ok' || result === 'invalid' || result === 'error') setState(result);
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const website = (new FormData(e.currentTarget).get('website') as string | null) ?? '';
    setState('sending');
    try {
      const res = await fetch(WAITLIST_API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, website }) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      setState(body.ok ? 'ok' : body.error === 'invalid' ? 'invalid' : 'error');
    } catch {
      setState('error');
    }
  }

  if (state === 'ok') {
    return (
      <p role="status" className={`m-0 inline-flex items-center gap-2.5 rounded-[10px] border border-[rgba(125,211,168,0.25)] bg-[rgba(125,211,168,0.08)] px-4 py-3 text-[15px] text-[#c4c4cc] ${className}`}>
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[rgba(125,211,168,0.16)] text-ok">
          <Icon name="check" size={12} />
        </span>
        {MESSAGES.ok}
      </p>
    );
  }

  const problem = state === 'invalid' || state === 'error' ? MESSAGES[state] : null;
  return (
    <form action={WAITLIST_API} method="post" onSubmit={submit} className={`flex w-full flex-col gap-2 ${align === 'center' ? 'max-w-[460px] items-center' : ''} ${className}`}>
      <div className="flex w-full flex-wrap gap-2">
        <label htmlFor={`${id}-email`} className="sr-only">
          Your email
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={state === 'invalid' || undefined}
          aria-describedby={problem ? `${id}-problem` : undefined}
          className="h-12 min-w-0 flex-[1_1_220px] rounded-[10px] border border-[#26262c] bg-[#0f0f12] px-4 text-[15px] text-fg placeholder:text-ghost focus:border-line-strong"
        />
        {/* Honeypot, hidden from people and screen readers. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute left-[-9999px] h-px w-px opacity-0" />
        <button
          type="submit"
          disabled={state === 'sending'}
          className="inline-flex h-12 flex-[1_0_auto] cursor-pointer items-center justify-center gap-2 rounded-[10px] px-5 font-semibold transition-[filter] bg-[linear-gradient(100deg,#f0a07f,#e6c07b)] text-[#1a120b] hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
        >
          {state === 'sending' ? 'Adding you…' : 'Notify me at launch'}
        </button>
      </div>
      {problem ? (
        <p id={`${id}-problem`} role="alert" className="m-0 text-sm text-[#f28b82]">
          {problem}
        </p>
      ) : null}
    </form>
  );
}
