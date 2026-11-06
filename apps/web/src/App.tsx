import { MotionConfig } from 'motion/react';
import { KingletBird, Mark } from '../../desktop/src/renderer/components/Icons';
import { Hero } from './components/Hero';
import { Faq, Pricing } from './components/Pricing';
import { AiWorkflow, Checks, DeviceLab, Mcp, Ship } from './components/Sections';
import { Reveal } from './components/ui';
import { GetKinglet } from './components/Get';
import { LAUNCHED } from './config';

function Nav() {
  const links: [string, string][] = [
    ['#ai', 'AI workflow'],
    ['#lab', 'Device lab'],
    ['#ship', 'Vercel & GitHub'],
    ['#checks', 'Checks'],
    ['#pricing', 'Pricing'],
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-[#141418] bg-[rgba(8,8,10,0.75)] backdrop-blur-xl">
      <nav aria-label="Main" className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 py-3 sm:px-7">
        <div className="flex items-center gap-9">
          <a href="#top" className="flex items-center gap-2.5 text-fg no-underline" aria-label="Kinglet, home">
            <Mark size={24} />
            <img src="/wordmark.svg" alt="" width="68" height="21" className="h-[21px] w-auto" />
          </a>
          <div className="hidden gap-6 text-sm md:flex">
            {links.map(([href, label]) => (
              <a key={href} href={href} className="text-muted no-underline transition-colors hover:text-fg">
                {label}
              </a>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href="#waitlist" className="inline-flex h-9 items-center rounded-lg bg-fg px-3.5 text-[13px] font-semibold text-ink no-underline hover:bg-white">
            {LAUNCHED ? 'Buy Kinglet' : 'Join the list'}
          </a>
        </div>
      </nav>
    </header>
  );
}

function WorksWith() {
  const names = ['Claude Code', 'Vercel', 'GitHub', 'Next.js', 'Nuxt', 'Astro', 'SvelteKit', 'Vite'];
  return (
    <section aria-label="Works with" className="mx-auto max-w-[1200px] px-4 pt-20 sm:px-6">
      <div className="flex flex-wrap items-center justify-center gap-x-11 gap-y-4 text-base font-semibold tracking-[-0.01em] text-ghost">
        <span className="font-mono text-xs font-normal tracking-[0.08em]">WORKS WITH</span>
        {names.map((n, i) => (
          <span key={n} className={i < 3 ? 'text-muted' : ''}>
            {n}
          </span>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto flex max-w-[1200px] flex-col items-center gap-6 px-4 pt-40 text-center sm:px-6">
      <Reveal className="flex flex-col items-center gap-6">
        <KingletBird width={120} />
        <h2 className="m-0 max-w-[820px] text-[clamp(38px,6vw,76px)] leading-[0.98] font-semibold tracking-[-0.055em]">
          Vibe code like
          <br />
          you can see everything.
        </h2>
        <p className="m-0 max-w-[520px] text-base leading-relaxed text-muted">
          {LAUNCHED ? 'Pay once, keep it. Your license key is ready right after paying, updates install themselves.' : 'Kinglet launches soon. Leave your email: one message at launch, with a discount for the list.'}
        </p>
        <GetKinglet />
      </Reveal>
    </section>
  );
}

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-fg focus:px-3 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <Nav />
      <main id="main" className="overflow-x-clip">
        <Hero />
        <WorksWith />
        <AiWorkflow />
        <DeviceLab />
        <Ship />
        <Checks />
        <Mcp />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <footer className="mx-auto mt-32 flex max-w-[1200px] flex-wrap justify-between gap-6 border-t border-[#141418] px-4 pt-7 pb-10 text-[13px] text-ghost sm:px-6">
        <span className="flex items-center gap-2">
          <Mark size={16} />
          Kinglet · made for sites built with Claude
        </span>
        <span className="flex gap-5">
          <a href="#faq" className="text-ghost no-underline hover:text-fg">
            FAQ
          </a>
          <a href="#waitlist" className="text-ghost no-underline hover:text-fg">
            {LAUNCHED ? 'Buy Kinglet' : 'Join the list'}
          </a>
        </span>
      </footer>
    </MotionConfig>
  );
}
