/**
 * "docs", the second project of the hero's demo: Saltmint's documentation site, shown while Claude works on
 * saltmint in its own tab (the Projects scene). Same idea as Saltmint.tsx: rendered at the device's real CSS width
 * and scaled down. Elements the demo cursor goes to carry data-target="…".
 */
const ink = '#0f1a2e';
const paper = '#ffffff';
const blue = '#3b6fd8';
const soft = '#eef3fd';
const grey = '#5b6478';
const line = '#e4e8f0';

const NAV = ['Getting started', 'Installation', 'Budgets', 'Shared accounts', 'Webhooks', 'API reference'];

function Logo({ size = 16 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2 font-bold tracking-[-0.03em]" style={{ fontSize: size, color: ink }}>
      <span className="flex items-center justify-center rounded-[6px] text-white" style={{ width: size + 6, height: size + 6, background: blue, fontSize: size - 4 }}>
        ¶
      </span>
      saltmint <span style={{ color: grey, fontWeight: 500 }}>docs</span>
    </span>
  );
}

/** The inspector's outline and size label, as on the Saltmint site. */
function Picked({ on, label, children, target }: { on?: boolean; label: string; children: React.ReactNode; target?: string }) {
  return (
    <span className="relative block" data-target={target}>
      {children}
      {on && (
        <>
          <span className="pointer-events-none absolute -inset-1.5 rounded-md" style={{ boxShadow: '0 0 0 2px #5b8def', background: 'rgba(91,141,239,0.08)' }} />
          <span className="absolute -top-7 left-0 rounded px-1.5 font-mono text-[11px] leading-5 text-white" style={{ background: '#5b8def' }}>
            {label}
          </span>
        </>
      )}
    </span>
  );
}

function Code({ big }: { big?: boolean }) {
  return (
    <div className="rounded-xl font-mono" style={{ background: ink, color: '#d7e2f7', padding: big ? '18px 20px' : '14px 16px', fontSize: big ? 15 : 13, lineHeight: 1.7 }}>
      <div>
        <span style={{ color: '#7f8db0' }}>$</span> npm install @saltmint/sdk
      </div>
      <div style={{ color: '#7f8db0' }}>// then</div>
      <div>
        <span style={{ color: '#9fc1ff' }}>import</span> {'{ Saltmint }'} <span style={{ color: '#9fc1ff' }}>from</span> <span style={{ color: '#a6f0c6' }}>'@saltmint/sdk'</span>
      </div>
    </div>
  );
}

export function DocsPhone({ inspect }: { inspect?: boolean }) {
  return (
    <div className="h-full overflow-hidden" style={{ background: paper, color: ink, fontFamily: 'var(--font-sans)' }}>
      <div className="flex items-center justify-between" style={{ padding: '58px 20px 14px', borderBottom: `1px solid ${line}` }}>
        <Logo />
        <span className="flex flex-col gap-[5px]">
          <span className="block h-[2px] w-5" style={{ background: ink }} />
          <span className="block h-[2px] w-5" style={{ background: ink }} />
        </span>
      </div>
      <div className="flex flex-col" style={{ padding: '26px 20px', gap: 16 }}>
        <span className="font-mono" style={{ fontSize: 12, color: blue }}>
          Docs / Getting started
        </span>
        <Picked on={inspect} label="h1 · 353 × 38">
          <span className="block font-semibold" style={{ fontSize: 32, letterSpacing: '-0.04em', lineHeight: 1.15 }}>
            Getting started
          </span>
        </Picked>
        <span style={{ fontSize: 16, lineHeight: 1.55, color: grey }}>Connect a bank, set a budget, and Saltmint moves what’s left to savings every week.</span>
        <span className="font-semibold" style={{ fontSize: 19, marginTop: 6 }}>
          Install the SDK
        </span>
        <Code />
        <span className="rounded-xl" style={{ background: soft, padding: '12px 14px', fontSize: 14, color: ink }}>
          <b style={{ color: blue }}>Tip</b> · test mode never touches real accounts.
        </span>
      </div>
    </div>
  );
}

export function DocsDesktop({ inspect }: { inspect?: boolean }) {
  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ background: paper, color: ink, fontFamily: 'var(--font-sans)' }}>
      <div className="flex items-center gap-8" style={{ padding: '18px 40px', borderBottom: `1px solid ${line}` }}>
        <Logo size={18} />
        <span className="flex-1 rounded-lg" style={{ maxWidth: 420, border: `1px solid ${line}`, padding: '8px 14px', fontSize: 14, color: grey }}>
          Search the docs <span className="float-right font-mono" style={{ fontSize: 12 }}>⌘K</span>
        </span>
        <span className="ml-auto flex items-center gap-6" style={{ fontSize: 14, color: grey }}>
          <span>Guides</span>
          <span>API</span>
          <span>Changelog</span>
          <span className="rounded-full font-mono" style={{ fontSize: 12, padding: '3px 10px', background: soft, color: blue }}>
            v2.4
          </span>
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <nav className="flex flex-col gap-1" style={{ width: 250, padding: '30px 22px 0 40px', borderRight: `1px solid ${line}`, fontSize: 15 }}>
          {NAV.map((n, i) => (
            <span key={n} className="rounded-md" style={{ padding: '7px 12px', background: i === 0 ? soft : 'transparent', color: i === 0 ? blue : grey, fontWeight: i === 0 ? 600 : 400 }}>
              {n}
            </span>
          ))}
        </nav>
        <main className="flex flex-col" style={{ padding: '44px 64px', gap: 20, maxWidth: 820 }}>
          <span className="font-mono" style={{ fontSize: 13, color: blue }}>
            Docs / Getting started
          </span>
          <Picked on={inspect} label="h1 · 692 × 58" target="docs-title">
            <span className="block font-semibold" style={{ fontSize: 48, letterSpacing: '-0.045em', lineHeight: 1.15 }}>
              Getting started
            </span>
          </Picked>
          <span style={{ fontSize: 18, lineHeight: 1.6, color: grey }}>Connect a bank, set a budget, and Saltmint moves what’s left to savings every week. Five minutes, test mode included.</span>
          <span className="font-semibold" style={{ fontSize: 24, marginTop: 8 }}>
            Install the SDK
          </span>
          <span data-target="docs-code">
            <Code big />
          </span>
        </main>
      </div>
    </div>
  );
}
