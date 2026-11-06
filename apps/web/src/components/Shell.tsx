import { Mark } from '../../../desktop/src/renderer/components/Icons';
import { LEGAL_LINKS } from '../publisher';

/** Links at the bottom of every page: the legal pages, plus the page's own (FAQ, buy…). */
export function SiteFooter({ links = [] }: { links?: [string, string][] }) {
  return (
    <footer className="mx-auto flex w-full max-w-[1200px] flex-wrap justify-between gap-6 border-t border-[#141418] px-4 pt-7 pb-10 text-[13px] text-ghost sm:px-6">
      <span className="flex items-center gap-2">
        <Mark size={16} />
        Kinglet · made for sites built with Claude
      </span>
      <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
        {[...links, ...LEGAL_LINKS].map(([href, label]) => (
          <a key={href} href={href} className="text-ghost no-underline hover:text-fg">
            {label}
          </a>
        ))}
      </nav>
    </footer>
  );
}

/** The frame of the static pages (thanks, legal): the logo back home, the content, the footer. */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[#141418]">
        <div className="mx-auto flex max-w-[1240px] items-center px-4 py-3 sm:px-7">
          <a href="/" className="flex items-center gap-2.5 text-fg no-underline" aria-label="Kinglet, home">
            <Mark size={24} />
            <img src="/wordmark.svg" alt="" width="68" height="21" className="h-[21px] w-auto" />
          </a>
        </div>
      </header>
      {children}
      <SiteFooter links={[['/', 'Home']]} />
    </div>
  );
}
