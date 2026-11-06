import { PageShell } from './components/Shell';
import { PORTAL_URL, PRICE } from './config';
import { LEGAL_UPDATED, MEDIATOR, PUBLISHER, REFUND_DAYS } from './publisher';

/**
 * The legal pages (/legal, /terms, /privacy): static HTML without JavaScript, like /thanks.
 * What they say must match what Kinglet does: the license (apps/desktop/src/main/license.ts), the network
 * calls of the app, the launch list (functions/waitlist.ts). Change LEGAL_UPDATED with every change here.
 */

const Fill = ({ what }: { what: string }) => <span className="rounded bg-[rgba(240,160,127,0.14)] px-1 font-mono text-[0.9em] text-[#f0a07f]">[to fill in: {what}]</span>;
const field = (v: string | null, what: string) => v ?? <Fill what={what} />;
const Email = () => (PUBLISHER.email ? <a href={`mailto:${PUBLISHER.email}`}>{PUBLISHER.email}</a> : <Fill what="contact email" />);

function H2({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="m-0 mt-12 scroll-mt-6 text-[20px] font-semibold tracking-[-0.02em] text-fg">
      {children}
    </h2>
  );
}

function Doc({ title, intro, children }: { title: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <PageShell>
      <main id="main" className="mx-auto w-full max-w-[720px] flex-1 px-4 pt-20 pb-24 sm:px-6">
        <h1 className="m-0 text-[clamp(32px,5vw,48px)] leading-[1.02] font-semibold tracking-[-0.045em]">{title}</h1>
        <p className="m-0 mt-3 text-[13px] text-faint">Last updated {LEGAL_UPDATED}</p>
        <p className="m-0 mt-6 text-base leading-relaxed text-muted">{intro}</p>
        <div className="legal mt-2 text-[15px] leading-relaxed text-muted [&_a]:text-fg [&_a]:underline [&_a]:underline-offset-2 [&_li]:mt-2 [&_p]:m-0 [&_p]:mt-4 [&_strong]:font-medium [&_strong]:text-fg [&_ul]:m-0 [&_ul]:mt-3 [&_ul]:pl-5">
          {children}
        </div>
      </main>
    </PageShell>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5 border-b border-line-soft px-4 py-3 last:border-b-0">
      <span className="w-44 shrink-0 text-faint">{k}</span>
      <span className="min-w-0 flex-1 text-fg">{children}</span>
    </div>
  );
}

const Table = ({ children }: { children: React.ReactNode }) => <div className="mt-4 overflow-hidden rounded-[14px] border border-line-soft bg-[#0d0d10] text-[14px]">{children}</div>;

export function LegalNotice() {
  return (
    <Doc title="Legal notice" intro="Who publishes getkinglet.com and the Kinglet app, who hosts the site and who sells the licenses.">
      <H2>Publisher</H2>
      <Table>
        <Row k="Name">{PUBLISHER.name}</Row>
        <Row k="Status">{field(PUBLISHER.status, 'legal status')}</Row>
        <Row k="SIREN">{field(PUBLISHER.siren, 'SIREN number')}</Row>
        <Row k="VAT">{field(PUBLISHER.vat, 'VAT number or “not applicable”')}</Row>
        <Row k="Address">
          {field(PUBLISHER.address, 'postal address')}, {PUBLISHER.country}
        </Row>
        <Row k="Contact">
          <Email />
        </Row>
        <Row k="Publication director">{PUBLISHER.name}</Row>
      </Table>

      <H2>Hosting</H2>
      <p>
        The site is hosted by <strong>Vercel Inc.</strong>, 440 N Barranca Ave #4133, Covina, CA 91723, United States (<a href="https://vercel.com">vercel.com</a>). The app’s downloads are served by{' '}
        <strong>GitHub, Inc.</strong>, 88 Colin P Kelly Jr St, San Francisco, CA 94107, United States.
      </p>

      <H2>Sales</H2>
      <p>
        Licenses are sold by <strong>Polar</strong> (<a href="https://polar.sh">polar.sh</a>), the merchant of record: Polar takes the payment, charges and pays the taxes (such as VAT) and issues the invoice. See the{' '}
        <a href="/terms/">Terms</a>.
      </p>

      <H2>Intellectual property</H2>
      <p>
        Kinglet, its name, its logo, the app and the content of this site belong to {PUBLISHER.name}. Copying or reusing them without permission is not allowed, except where the law allows it. The typefaces are Geist and Geist Mono
        (Vercel) and Young Serif (Bryan Kirschen), under the SIL Open Font License.
      </p>
      <p>
        Claude and Claude Code are trademarks of Anthropic; Vercel, GitHub, WhatsApp, Slack, LinkedIn and the other services named on this site belong to their owners. Kinglet works with them but is not affiliated with or endorsed
        by them.
      </p>

      <H2>Personal data</H2>
      <p>
        See the <a href="/privacy/">Privacy policy</a>.
      </p>
    </Doc>
  );
}

export function Terms() {
  return (
    <Doc
      title="Terms of sale and license"
      intro={
        <>
          These terms apply to every purchase of a Kinglet license and to the use of the app. In short: you pay {PRICE.label} once, you keep Kinglet, every update is included, and you can get a refund within {REFUND_DAYS} days.
        </>
      }
    >
      <H2 id="parties">1. Who is who</H2>
      <p>
        <strong>Kinglet</strong> is a desktop app published by {PUBLISHER.name} (“we”; see the <a href="/legal/">Legal notice</a>). <strong>Polar</strong> resells the licenses as merchant of record: the order, the payment, the
        taxes and the invoice are between you and Polar, under <a href="https://polar.sh/legal/terms">Polar’s terms</a>. The license to use Kinglet is granted by us, under these terms. “You” is the person who buys or uses the
        license.
      </p>

      <H2 id="product">2. The product</H2>
      <p>
        Kinglet shows a site on emulated devices, checks it, previews how its links look when shared, and connects to Vercel, GitHub and Claude Code. Its features are described on <a href="/">getkinglet.com</a>. It runs on Linux
        (AppImage and pacman package). Try the requirements before buying: if Kinglet doesn’t run on your computer, the refund below applies.
      </p>
      <p>
        Some features use services you sign up for yourself, under their own terms and prices: <strong>Claude Code</strong> (Anthropic), <strong>Vercel</strong> and <strong>GitHub</strong>. Kinglet doesn’t include access to them,
        and we are not responsible for them or for what they change.
      </p>

      <H2 id="price">3. Price and payment</H2>
      <p>
        A license costs <strong>{PRICE.label}, paid once</strong>. It is not a subscription: nothing is charged again. Taxes such as VAT are added where they apply and shown by Polar before you pay. The license key is delivered right
        after payment, in Polar’s receipt email and in its <a href={PORTAL_URL}>customer portal</a>.
      </p>

      <H2 id="license">4. The license</H2>
      <p>Once paid, we grant you a personal, worldwide, non-exclusive, non-transferable license to use Kinglet, with no time limit:</p>
      <ul>
        <li>
          for <strong>one person</strong>, on <strong>up to 3 computers</strong> at a time. You can move it from one computer to another (Settings → License → Deactivate on this computer, or from the customer portal);
        </li>
        <li>for personal and commercial work: the sites you build, test and ship with Kinglet are yours, for you or your clients;</li>
        <li>the link to the review page you send your clients doesn’t need them to buy anything.</li>
      </ul>
      <p>You may not:</p>
      <ul>
        <li>share, sell, rent or publish your license key, or let other people use your license;</li>
        <li>remove or work around the license check;</li>
        <li>copy, decompile or modify Kinglet, except to the extent the law allows it (for example for interoperability);</li>
        <li>use Kinglet to break the law or to access sites and accounts you are not allowed to.</li>
      </ul>
      <p>Kinglet and its code stay ours: you buy a license to use it, not the software itself.</p>

      <H2 id="updates">5. Updates for life</H2>
      <p>
        Every new version of Kinglet is included in the license, at no extra cost, for as long as Kinglet is developed. Updates download in the background and install when you choose. They can add, change or remove features; we keep
        what a license includes, and we won’t move a feature you bought behind another payment.
      </p>
      <p>
        If we ever stop developing Kinglet, we will publish a last version that no longer checks the license, so that the copy you bought keeps working.
      </p>

      <H2 id="activation">6. Activation</H2>
      <p>
        Kinglet asks for your key on first launch. Activating needs the internet once; Kinglet then checks the license with Polar at startup and every 6 hours, and keeps working offline for up to 14 days after the last check. A
        refunded, revoked or deleted activation stops Kinglet on that computer.
      </p>

      <H2 id="refunds">7. Refunds and right of withdrawal</H2>
      <p>
        If Kinglet isn’t for you, write to us at <Email /> or through Polar’s <a href={PORTAL_URL}>customer portal</a> within <strong>{REFUND_DAYS} days</strong> of your purchase: you get a full refund, no questions asked. The license
        is then revoked.
      </p>
      <p>
        Kinglet is digital content delivered right after payment. If you live in the European Union, by buying you ask for it to be delivered immediately and you acknowledge that you therefore lose the legal right of withdrawal
        (article L221-28 of the French Consumer Code and the equivalent laws of other member states). The {REFUND_DAYS}-day refund above applies anyway.
      </p>

      <H2 id="warranty">8. Warranty and liability</H2>
      <p>
        If you are a consumer, you have the legal guarantee of conformity for digital content (articles L224-25-1 and following of the French Consumer Code, or the law of your country): if Kinglet doesn’t work as described, tell us
        and we’ll fix it, or refund you if we can’t.
      </p>
      <p>
        Apart from that guarantee, Kinglet is provided as it is. Device emulation, share previews and checks are approximations: they help you see problems, they don’t promise how a real device, platform or search engine will behave.
        Keep backups of your work; Claude Code and the other tools Kinglet opens change your files on your instructions.
      </p>
      <p>
        To the extent the law allows, our total liability is limited to the price you paid for the license, and we are not liable for indirect losses (lost profit, data or business). Nothing here limits liability that the law doesn’t
        allow to be limited, such as for gross negligence, fraud, or death and personal injury.
      </p>

      <H2 id="end">9. End of the license</H2>
      <p>
        You can stop using Kinglet at any time. If you seriously break these terms (for example by sharing your key publicly), we may revoke the license after telling you, without a refund. Sections 4 (what you may not do), 8 and 10
        survive the end of the license.
      </p>

      <H2 id="law">10. Changes, law and disputes</H2>
      <p>
        We may update these terms; the date at the top changes when we do. The terms in force when you bought your license keep applying to it, unless a change is in your favour. These terms are governed by French law. If you are a
        consumer, you also keep the protection of the mandatory rules of the country where you live, and you can go to the courts there. Write to us first at <Email />: most problems are solved by email.
      </p>
      <p>
        If you are a consumer and a written complaint to us hasn’t settled the matter within one month, you can refer it free of charge to the consumer mediator we are registered with (articles L612-1 and following of the French
        Consumer Code): <strong>{MEDIATOR.name}</strong>, {MEDIATOR.address}, <a href={MEDIATOR.url}>{MEDIATOR.url.replace('https://', '')}</a>.
      </p>
    </Doc>
  );
}

export function Privacy() {
  return (
    <Doc
      title="Privacy policy"
      intro={
        <>
          What personal data getkinglet.com and the Kinglet app collect, why, and who sees it. In short: no tracking, no analytics, no telemetry. The app keeps your projects on your computer, and the site only knows the email you give it.
        </>
      }
    >
      <H2>Who is responsible</H2>
      <p>
        {PUBLISHER.name} (see the <a href="/legal/">Legal notice</a>) is the controller of the data below. For any question or request: <Email />.
      </p>

      <H2>On this site</H2>
      <ul>
        <li>
          <strong>No cookies, no analytics, no trackers.</strong> Fonts and images are served from this site; no third-party script runs on it.
        </li>
        <li>
          <strong>Server logs.</strong> Our host, Vercel, records technical data of each request (IP address, browser, page, time) to serve the site and protect it from abuse. They are kept for a short time, set by Vercel.
        </li>
        <li>
          <strong>The launch list.</strong> If you leave your email, it is stored with <strong>Resend</strong> (Resend, Inc., United States), the service that sends the launch email. We use it only to tell you when Kinglet launches and
          about the launch offer. Basis: your consent, which you can withdraw at any time with the unsubscribe link of the email or by writing to us. We delete it on request, and at the latest 12 months after launch.
        </li>
      </ul>

      <H2>When you buy</H2>
      <p>
        <strong>Polar</strong> handles the checkout as merchant of record, with Stripe for the payment. Polar collects your name, email, billing country and address and payment details, and is responsible for them under{' '}
        <a href="https://polar.sh/legal/privacy">its own privacy policy</a>. We receive from Polar your name, email, country and the details of your order and license (never your card number), to deliver the license, support you and
        handle refunds. Basis: the contract, and our accounting obligations, which require keeping orders for 10 years.
      </p>

      <H2>In the app</H2>
      <p>
        <strong>Kinglet has no telemetry and no account of ours.</strong> Your projects, settings, screenshots, comments and history stay on your computer (in <code className="font-mono text-[0.92em]">~/.config/Kinglet</code>); your
        Vercel and GitHub tokens and your license key are encrypted by your system’s keyring. The app connects to the internet only for:
      </p>
      <ul>
        <li>
          <strong>The license</strong>, with Polar: your key and a name for the activation made of your user name and your computer’s name (<code className="font-mono text-[0.92em]">user@machine</code>), so you can tell your
          computers apart in the customer portal.
        </li>
        <li>
          <strong>Updates</strong>, from GitHub: the app downloads the list of versions and the new versions from GitHub’s servers, which see your IP address.
        </li>
        <li>
          <strong>Vercel and GitHub</strong>, if you connect them: the app calls their APIs directly from your computer with your tokens, to list your projects, deployments and pull requests and to publish what you ask. That data
          doesn’t go through us.
        </li>
        <li>
          <strong>Claude Code</strong>, if you use it: Kinglet starts Claude Code on your computer, under your own Anthropic account. What you send Claude (messages, screenshots, code) goes to Anthropic under your agreement with them,
          not to us.
        </li>
        <li>
          <strong>The sites you open</strong>: Kinglet loads them and the pages they link to like a browser does, and reads them the way the share platforms’ robots do.
        </li>
      </ul>
      <p>
        The review link you send a client is served from your own computer: their comments and screenshots arrive in your app, not on our servers. Feedback becomes a GitHub issue only when you choose to send it there.
      </p>

      <H2>Transfers outside the European Union</H2>
      <p>
        Vercel, Resend, Polar, Stripe and GitHub are based in the United States. Transfers to them rely on the EU–US Data Privacy Framework where they are certified, or on the European Commission’s standard contractual clauses.
      </p>

      <H2>Your rights</H2>
      <p>
        Under the GDPR you can access your data, correct it, delete it, receive a copy, object to or restrict its use, and withdraw your consent at any time. Write to <Email />; we answer within a month. If you think we haven’t
        respected your rights, you can complain to the CNIL (<a href="https://www.cnil.fr">cnil.fr</a>) or the data protection authority of your country.
      </p>
    </Doc>
  );
}

/** The legal pages, for the build (scripts/build.mjs) and the tests. */
export const LEGAL_PAGES = [
  { path: 'legal', title: 'Legal notice', description: 'Publisher, hosting and sales of Kinglet.', Page: LegalNotice },
  { path: 'terms', title: 'Terms of sale and license', description: `Kinglet’s license: ${PRICE.label} once, updates for life, ${REFUND_DAYS}-day refund.`, Page: Terms },
  { path: 'privacy', title: 'Privacy policy', description: 'What getkinglet.com and the Kinglet app collect: no tracking, no telemetry.', Page: Privacy },
];
