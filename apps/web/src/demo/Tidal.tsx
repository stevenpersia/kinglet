/**
 * "Tidal", the demo site shown inside the devices. A small, believable fintech landing page, rendered at the
 * device's real CSS width (393 px phone, 1280 px laptop) and scaled down like Kinglet does: what you see is the
 * layout that width really gets.
 */
export type TidalState = { inspect?: boolean; keyboard?: boolean; keyboardFixed?: boolean; broken?: boolean; lime?: boolean; target?: string };

const ink = '#0e0f0c';
const paper = '#f6f6f1';
const lime = '#c6f432';
const grey = '#5d6058';

function Logo({ size = 17 }: { size?: number }) {
  return (
    <span className="flex items-center gap-1.5 font-bold tracking-[-0.04em]" style={{ fontSize: size }}>
      <span className="inline-block rounded-full" style={{ width: size, height: size, background: ink, boxShadow: `inset -${size / 3.5}px -${size / 7}px 0 ${lime}` }} />
      tidal
    </span>
  );
}

function Cta({ inspect, label, big, lime: isLime, target }: { inspect?: boolean; label: string; big?: boolean; lime?: boolean; target?: string }) {
  return (
    <span className="relative inline-flex" data-target={target}>
      <span
        className="inline-flex items-center justify-center rounded-full font-semibold whitespace-nowrap transition-colors duration-500"
        style={{ background: isLime ? lime : ink, color: isLime ? ink : paper, padding: big ? '14px 24px' : '13px 20px', fontSize: big ? 15 : 14, width: '100%' }}
      >
        {label}
      </span>
      {inspect && (
        <>
          <span aria-hidden="true" className="pointer-events-none absolute -inset-1 rounded-full" style={{ background: 'rgba(91,141,239,0.18)', boxShadow: '0 0 0 2px #5b8def' }} />
          <span aria-hidden="true" className="absolute -top-7 left-0 rounded px-1.5 font-mono text-[12px] leading-5 whitespace-nowrap text-white" style={{ background: '#5b8def' }}>
            button.cta
          </span>
        </>
      )}
    </span>
  );
}

function Card({ compact }: { compact?: boolean }) {
  const bars = compact ? [40, 62, 48, 80, 56, 92] : [40, 62, 48, 80, 56, 70, 92];
  return (
    <div className="flex flex-col rounded-[22px]" style={{ background: ink, color: paper, padding: compact ? 18 : 24, gap: compact ? 12 : 16, boxShadow: '0 30px 60px rgba(14,15,12,0.18)' }}>
      <div className="flex justify-between" style={{ fontSize: 13, color: '#8b8e85' }}>
        <span>Safe to spend · May</span>
        <span style={{ color: lime }}>+12% vs April</span>
      </div>
      <span className="font-semibold tracking-[-0.03em]" style={{ fontSize: compact ? 32 : 40 }}>
        $1,284.50
      </span>
      <div className="flex items-end" style={{ height: compact ? 64 : 84, gap: 6 }}>
        {bars.map((h, i) => (
          <span key={i} className="flex-1 rounded-[5px]" style={{ height: `${h}%`, background: i === bars.length - 1 ? lime : '#2b2d27' }} />
        ))}
      </div>
      {!compact && (
        <div className="flex flex-col" style={{ gap: 10, fontSize: 14 }}>
          {[
            ['Blue Bottle Coffee', '−$5.40', '#8b8e85'],
            ['Salary', '+$3,200.00', lime],
            ['Rent', '−$1,450.00', '#8b8e85'],
          ].map(([a, b, c]) => (
            <div key={a} className="flex justify-between border-t pt-2.5" style={{ borderColor: '#24261f' }}>
              <span>{a}</span>
              <span style={{ color: c }}>{b}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TidalPhone({ inspect, keyboard, keyboardFixed, lime: isLime }: TidalState) {
  return (
    <div className="relative h-full overflow-hidden" style={{ background: paper, color: ink, fontFamily: 'var(--font-sans)' }}>
      <div className="flex flex-col transition-transform duration-500" style={{ padding: '58px 22px 22px', gap: 18, transform: keyboard ? 'translateY(-150px)' : 'none' }}>
        <div className="flex items-center justify-between">
          <Logo />
          <span className="flex flex-col gap-[5px]">
            <span className="block h-[2px] w-5" style={{ background: ink }} />
            <span className="block h-[2px] w-5" style={{ background: ink }} />
          </span>
        </div>
        <span className="self-start rounded-full font-semibold" style={{ marginTop: 18, padding: '5px 11px', fontSize: 12, background: '#e9f9b8', color: '#3d5200' }}>
          New · Shared budgets
        </span>
        <span className="font-semibold" style={{ fontSize: 46, lineHeight: 0.98, letterSpacing: '-0.05em' }}>
          Money,
          <br />
          finally calm.
        </span>
        <span style={{ fontSize: 16, lineHeight: 1.5, color: grey }}>Tidal sorts every payment, plans your month and tells you what’s safe to spend.</span>
        <div className="flex flex-col" style={{ gap: 10 }}>
          <span
            className="flex items-center rounded-full"
            style={{ height: 48, padding: '0 18px', fontSize: 15, background: '#fff', color: keyboard ? ink : '#9a9c94', boxShadow: keyboard ? `0 0 0 2px ${ink}` : '0 0 0 1px #dcdcd3' }}
          >
            {keyboard ? 'mia@studio.co' : 'you@email.com'}
            {keyboard && <span className="blink ml-px inline-block h-5 w-[2px]" style={{ background: ink }} />}
          </span>
          <Cta inspect={inspect} lime={isLime} target="cta-phone" label="Get started — free" />
        </div>
        <div style={{ marginTop: 14 }}>
          <Card compact />
        </div>
      </div>
      {/* The sticky sign-up bar: under the keyboard until the page follows visualViewport. */}
      <div
        className="absolute inset-x-0 flex items-center justify-between border-t transition-[bottom] duration-500"
        style={{ bottom: keyboard && keyboardFixed ? 336 : 0, padding: keyboard && keyboardFixed ? '12px 22px' : '14px 22px 30px', background: ink, borderColor: ink, zIndex: 1 }}
      >
        <span style={{ fontSize: 14, color: '#b8bbb0' }}>Free for 30 days</span>
        <span className="rounded-full font-semibold" style={{ background: lime, color: ink, padding: '10px 18px', fontSize: 14 }}>
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
        <span>mia@studio.co</span>
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

export function TidalDesktop({ inspect, broken, lime: isLime }: TidalState) {
  return (
    <div className="h-full overflow-hidden" style={{ background: paper, color: ink, fontFamily: 'var(--font-sans)' }}>
      <div className="mx-auto flex max-w-[1120px] flex-col" style={{ padding: '26px 40px', gap: 72 }}>
        <div className="flex items-center" style={{ gap: 34, fontSize: 15, color: grey }}>
          <Logo size={20} />
          <span>Product</span>
          <span>Pricing</span>
          <span>Customers</span>
          <span>Changelog</span>
          <span className="ml-auto">Sign in</span>
          <span className="rounded-full font-semibold" style={{ background: ink, color: paper, padding: '9px 18px' }}>
            Get started
          </span>
        </div>
        <div className="flex items-center" style={{ gap: 64 }}>
          <div className="flex flex-1 flex-col" style={{ gap: 24 }}>
            <span className="self-start rounded-full font-semibold" style={{ padding: '5px 12px', fontSize: 13, background: '#e9f9b8', color: '#3d5200' }}>
              New · Shared budgets
            </span>
            <span className="font-semibold" style={{ fontSize: 84, lineHeight: 0.95, letterSpacing: '-0.055em' }}>
              Money,
              <br />
              finally calm.
            </span>
            <span style={{ fontSize: 19, lineHeight: 1.5, color: grey, maxWidth: 440 }}>Tidal sorts every payment, plans your month and tells you what’s safe to spend.</span>
            <div className="flex items-center" style={{ gap: 14, marginTop: 6 }}>
              <Cta inspect={inspect} lime={isLime} target="cta-laptop" label="Get started — free" big />
              <span className="font-semibold" style={{ fontSize: 15 }}>
                See how it works →
              </span>
            </div>
          </div>
          <div className="flex-1" style={{ maxWidth: 440 }}>
            {broken ? (
              <div className="flex h-[300px] flex-col items-center justify-center gap-2 rounded-[22px] border-2 border-dashed text-center" style={{ borderColor: '#e5b4ae', color: '#b4483b', fontSize: 15 }}>
                <span className="font-semibold">Couldn’t load your budget</span>
                <span style={{ color: grey }}>Something went wrong. Try again.</span>
              </div>
            ) : (
              <Card />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
