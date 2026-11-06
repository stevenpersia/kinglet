import { Icon } from '../../../desktop/src/renderer/components/Icons';
import { CHECKOUT_URL, PRICE } from '../config';
import { WaitlistForm } from './Waitlist';

/** Polar's checkout (merchant of record: VAT handled), which hands out the license key. */
export function BuyButton({ className = '' }: { className?: string }) {
  return (
    <a
      href={CHECKOUT_URL!}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-[10px] px-5 text-[15px] font-semibold no-underline bg-[linear-gradient(100deg,#f0a07f,#e6c07b)] text-[#1a120b] hover:brightness-110 ${className}`}
    >
      Buy Kinglet · {PRICE.label}
      <Icon name="up" size={14} className="rotate-90" />
    </a>
  );
}

/** Before launch the launch list, after it the checkout. */
export function GetKinglet({ align = 'center' }: { align?: 'center' | 'stretch' }) {
  return CHECKOUT_URL ? <BuyButton className={align === 'stretch' ? 'w-full' : ''} /> : <WaitlistForm align={align} />;
}
