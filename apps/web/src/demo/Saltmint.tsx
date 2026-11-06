/**
 * "Saltmint", the demo site shown inside the devices: a small, believable budgeting app landing page, rendered at
 * the device's real CSS width (393 px phone, 1280 px laptop) and scaled down like Kinglet does. What you see is the
 * layout that width really gets.
 */
export type SiteState = { inspect?: boolean; keyboard?: boolean; keyboardFixed?: boolean; broken?: boolean; accent?: boolean };

const ink = '#11241c';
const paper = '#f6f5f0';
const mint = '#a6f0c6';
const deep = '#1f6b4b';
const grey = '#5c6660';
const line = '#e3e2da';

function Logo({ size = 17 }: { size?: number }) {
  return (
    <span className="flex items-center gap-1.5 font-bold tracking-[-0.045em]" style={{ fontSize: size, color: ink }}>
      <svg width={size + 2} height={size + 2} viewBox="0 0 20 20" aria-hidden="true">
        <rect width="20" height="20" rx="6" fill={ink} />
        <path d="M6 13.5c0-4 3-7 8-7.5-.4 5-3.5 8-7.5 8" fill={mint} />
      </svg>
      saltmint
    </span>
  );
}

function Cta({ inspect, label, big, accent, target }: { inspect?: boolean; label: string; big?: boolean; accent?: boolean; target?: string }) {
  return (
    <span className="relative inline-flex" data-target={target}>
      <span
        className="inline-flex w-full items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-colors duration-500"
        style={{ background: accent ? mint : ink, color: accent ? ink : paper, padding: big ? '15px 26px' : '14px 20px', fontSize: big ? 15 : 15 }}
      >
        {label}
        <span aria-hidden="true">→</span>
      </span>
      {inspect && (
        <>
          <span aria-hidden="true" className="pointer-events-none absolute -inset-1 rounded-full" style={{ background: 'rgba(91,141,239,0.16)', boxShadow: '0 0 0 2px #5b8def' }} />
          <span aria-hidden="true" className="absolute -top-7 left-0 rounded px-1.5 font-mono text-[12px] leading-5 whitespace-nowrap text-white" style={{ background: '#5b8def' }}>
            button.cta
          </span>
        </>
      )}
    </span>
  );
}

function Trust({ small }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2.5" style={{ fontSize: small ? 13 : 14, color: grey }}>
      <span className="flex">
        {['#f4c7a1', '#a9c8f0', '#c9b6ef', '#9fdcc0'].map((c, i) => (
          <span key={c} className="inline-block rounded-full" style={{ width: small ? 24 : 28, height: small ? 24 : 28, background: c, marginLeft: i ? -8 : 0, border: `2px solid ${paper}` }} />
        ))}
      </span>
      <span>
        <b style={{ color: ink }}>★ 4.9</b> · 12,000 reviews
      </span>
    </div>
  );
}

function Balance({ compact }: { compact?: boolean }) {
  const bars = [38, 56, 44, 72, 52, 64, 88];
  return (
    <div className="relative flex flex-col rounded-[24px]" style={{ background: ink, color: paper, padding: compact ? 18 : 26, gap: compact ? 12 : 16, boxShadow: '0 30px 60px rgba(17,36,28,0.22)' }}>
      <div className="flex justify-between" style={{ fontSize: 13, color: '#9db0a6' }}>
        <span>Safe to spend · May</span>
        <span style={{ color: mint }}>▲ 12%</span>
      </div>
      <span className="font-semibold tracking-[-0.035em]" style={{ fontSize: compact ? 34 : 44 }}>
        $1,284<span style={{ color: '#9db0a6' }}>.50</span>
      </span>
      <div className="flex items-end" style={{ height: compact ? 62 : 86, gap: 7 }}>
        {bars.map((h, i) => (
          <span key={i} className="flex-1 rounded-[6px]" style={{ height: `${h}%`, background: i === bars.length - 1 ? mint : '#24392f' }} />
        ))}
      </div>
      {!compact && (
        <div className="flex flex-col" style={{ gap: 10, fontSize: 14 }}>
          {[
            ['☕', 'Corner Café', '−$4.80', '#9db0a6'],
            ['↓', 'Salary', '+$3,200.00', mint],
            ['⌂', 'Rent', '−$1,450.00', '#9db0a6'],
          ].map(([icon, a, b, c]) => (
            <div key={a} className="flex items-center gap-3 border-t pt-2.5" style={{ borderColor: '#24392f' }}>
              <span className="flex size-7 items-center justify-center rounded-full text-[13px]" style={{ background: '#24392f' }}>
                {icon}
              </span>
              <span className="flex-1">{a}</span>
              <span style={{ color: c }}>{b}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Toast({ style }: { style?: React.CSSProperties }) {
  return (
    <div className="absolute flex items-center gap-2.5 rounded-2xl bg-white" style={{ padding: '10px 14px', boxShadow: '0 16px 40px rgba(17,36,28,0.18)', fontSize: 13, color: ink, ...style }}>
      <span className="flex size-8 items-center justify-center rounded-full font-bold" style={{ background: mint, color: deep }}>
        ✓
      </span>
      <span className="flex flex-col leading-tight">
        <b>Saved $120</b>
        <span style={{ color: grey, fontSize: 12 }}>this week, automatically</span>
      </span>
    </div>
  );
}

export function SitePhone({ inspect, keyboard, keyboardFixed, accent }: SiteState) {
  return (
    <div className="relative h-full overflow-hidden" style={{ background: paper, color: ink, fontFamily: 'var(--font-sans)' }}>
      <div className="flex flex-col transition-transform duration-500" style={{ padding: '58px 22px 22px', gap: 18, transform: keyboard ? 'translateY(-150px)' : 'none' }}>
        <div className="flex items-center justify-between">
          <Logo />
          <span className="flex items-center gap-3">
            <span className="rounded-full font-semibold" style={{ fontSize: 13, padding: '6px 12px', border: `1px solid ${line}` }}>
              Sign in
            </span>
            <span className="flex flex-col gap-[5px]">
              <span className="block h-[2px] w-5" style={{ background: ink }} />
              <span className="block h-[2px] w-5" style={{ background: ink }} />
            </span>
          </span>
        </div>
        <span className="self-start rounded-full font-semibold" style={{ marginTop: 14, padding: '5px 11px', fontSize: 12, background: '#dcf7e8', color: deep }}>
          New · Shared budgets →
        </span>
        <span className="font-semibold" style={{ fontSize: 46, lineHeight: 0.98, letterSpacing: '-0.05em' }}>
          Money,
          <br />
          finally <span style={{ color: deep }}>calm.</span>
        </span>
        <span style={{ fontSize: 16, lineHeight: 1.5, color: grey }}>Saltmint sorts every payment, plans your month and tells you what’s safe to spend.</span>
        <div className="flex flex-col" style={{ gap: 10 }}>
          <span
            className="flex items-center rounded-full"
            style={{ height: 50, padding: '0 18px', fontSize: 15, background: '#fff', color: keyboard ? ink : '#9aa19c', boxShadow: keyboard ? `0 0 0 2px ${ink}` : `0 0 0 1px ${line}` }}
          >
            {keyboard ? 'jessica@studio.co' : 'Your email'}
            {keyboard && <span className="blink ml-px inline-block h-5 w-[2px]" style={{ background: ink }} />}
          </span>
          <Cta inspect={inspect} accent={accent} target="cta-phone" label="Get started — free" />
        </div>
        <Trust small />
        <div className="relative" style={{ marginTop: 10 }}>
          <Balance compact />
          <Toast style={{ right: -6, top: -26 }} />
        </div>
      </div>
      {/* The sticky sign-up bar: under the keyboard until the page follows visualViewport. */}
      <div
        className="absolute inset-x-0 flex items-center justify-between transition-[bottom] duration-500"
        style={{ bottom: keyboard && keyboardFixed ? 336 : 0, padding: keyboard && keyboardFixed ? '12px 22px' : '14px 22px 30px', background: ink, zIndex: 1 }}
      >
        <span style={{ fontSize: 14, color: '#b9c6bf' }}>Free for 30 days</span>
        <span className="rounded-full font-semibold" style={{ background: mint, color: ink, padding: '10px 18px', fontSize: 14 }}>
          Create account
        </span>
      </div>
      {keyboard && <IosKeyboard />}
    </div>
  );
}

function IosKeyboard() {
  const rows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  const key = 'flex h-[42px] items-center justify-center rounded-[5px] bg-white text-[19px] text-black shadow-[0_1px_0_#888]';
  return (
    <div aria-hidden="true" className="absolute inset-x-0 bottom-0 z-[2] flex flex-col gap-[11px] px-[3px] pt-2 pb-9" style={{ background: '#d1d3d9', height: 336 }}>
      <div className="flex justify-around px-2 pb-1 text-[15px] text-[#555]">
        <span>jessica@studio.co</span>
        <span>@</span>
        <span>.com</span>
      </div>
      {rows.map((r, i) => (
        <div key={r} className="flex justify-center gap-[6px]" style={{ padding: i === 1 ? '0 18px' : 0 }}>
          {i === 2 && <span className={`${key} w-[42px] !bg-[#adb0b8]`}>⇧</span>}
          {r.split('').map((c) => (
            <span key={c} className={`${key} flex-1`}>
              {c}
            </span>
          ))}
          {i === 2 && <span className={`${key} w-[42px] !bg-[#adb0b8]`}>⌫</span>}
        </div>
      ))}
      <div className="flex gap-[6px]">
        <span className={`${key} w-[88px] !bg-[#adb0b8] !text-[15px]`}>123</span>
        <span className={`${key} flex-1 !text-[15px]`}>space</span>
        <span className={`${key} w-[88px] !bg-[#007aff] !text-[15px] !text-white`}>go</span>
      </div>
    </div>
  );
}

export function SiteDesktop({ inspect, broken, accent }: SiteState) {
  return (
    <div className="h-full overflow-hidden" style={{ background: paper, color: ink, fontFamily: 'var(--font-sans)' }}>
      <div className="mx-auto flex max-w-[1140px] flex-col" style={{ padding: '24px 44px', gap: 58 }}>
        <div className="flex items-center" style={{ gap: 34, fontSize: 15, color: grey }}>
          <Logo size={20} />
          <span>Product</span>
          <span>Pricing</span>
          <span>Stories</span>
          <span>Changelog</span>
          <span className="ml-auto">Sign in</span>
          <span className="rounded-full font-semibold" style={{ background: ink, color: paper, padding: '10px 18px' }}>
            Get started
          </span>
        </div>
        <div className="flex items-center" style={{ gap: 70 }}>
          <div className="flex flex-1 flex-col" style={{ gap: 22 }}>
            <span className="self-start rounded-full font-semibold" style={{ padding: '5px 12px', fontSize: 13, background: '#dcf7e8', color: deep }}>
              New · Shared budgets →
            </span>
            <span className="font-semibold" style={{ fontSize: 82, lineHeight: 0.95, letterSpacing: '-0.055em' }}>
              Money,
              <br />
              finally <span style={{ color: deep }}>calm.</span>
            </span>
            <span style={{ fontSize: 19, lineHeight: 1.5, color: grey, maxWidth: 450 }}>Saltmint sorts every payment, plans your month and tells you what’s safe to spend.</span>
            <div className="flex items-center" style={{ gap: 18, marginTop: 4 }}>
              <Cta inspect={inspect} accent={accent} target="cta-laptop" label="Get started — free" big />
              <span className="font-semibold" style={{ fontSize: 15 }}>
                See how it works
              </span>
            </div>
            <Trust />
          </div>
          <div className="relative flex-1" style={{ maxWidth: 440 }}>
            {broken ? (
              <div className="flex h-[330px] flex-col items-center justify-center gap-2 rounded-[24px] border-2 border-dashed text-center" style={{ borderColor: '#e5b4ae', color: '#b4483b', fontSize: 15 }}>
                <span className="font-semibold">Couldn’t load your budget</span>
                <span style={{ color: grey }}>Something went wrong. Try again.</span>
              </div>
            ) : (
              <>
                <Balance />
                <Toast style={{ left: -70, bottom: 40 }} />
                <span className="absolute rounded-full bg-white font-semibold" style={{ right: -18, top: -16, padding: '8px 14px', fontSize: 13, boxShadow: '0 12px 30px rgba(17,36,28,0.15)' }}>
                  ⏰ Rent due in 3 days
                </span>
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 border-t" style={{ gap: 36, paddingTop: 28, borderColor: line }}>
          {[
            ['Auto-sort', 'Every payment lands in the right budget.'],
            ['Safe to spend', 'One number, updated after each purchase.'],
            ['Shared budgets', 'Plan rent and groceries with your partner.'],
          ].map(([a, b]) => (
            <div key={a} className="flex items-start gap-3" style={{ fontSize: 14 }}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: '#dcf7e8', color: deep }}>
                ✦
              </span>
              <span className="flex flex-col gap-0.5">
                <b>{a}</b>
                <span style={{ color: grey }}>{b}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The site's own share image, as the Open Graph previews show it once fixed. */
export function ShareImage({ height = 120 }: { height?: number }) {
  return (
    <div className="flex items-end justify-between p-3" style={{ height, background: paper, color: ink }}>
      <span className="font-semibold" style={{ fontSize: height / 5.2, lineHeight: 0.95, letterSpacing: '-0.05em' }}>
        Money,
        <br />
        finally <span style={{ color: deep }}>calm.</span>
      </span>
      <Logo size={height / 9} />
    </div>
  );
}
