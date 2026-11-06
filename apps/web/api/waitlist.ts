// Vercel function: adds an email to the launch list (a Resend audience), so everyone on it can be told
// when Kinglet ships, with their discount.
// Env (Vercel project settings): RESEND_API_KEY, RESEND_AUDIENCE_ID.
// Accepts JSON from the page ({ email }) and a plain form post (no JavaScript), which is redirected back.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

async function readBody(request: Request): Promise<{ email: unknown; website: unknown; form: boolean }> {
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return { email: body.email, website: body.website, form: false };
  }
  const data = await request.formData().catch(() => null);
  return { email: data?.get('email'), website: data?.get('website'), form: true };
}

export async function addContact(email: string, env = process.env, fetcher: typeof fetch = fetch): Promise<boolean> {
  const key = env.RESEND_API_KEY;
  const audience = env.RESEND_AUDIENCE_ID;
  if (!key || !audience) {
    console.error('waitlist: RESEND_API_KEY or RESEND_AUDIENCE_ID is missing');
    return false;
  }
  const res = await fetcher(`https://api.resend.com/audiences/${audience}/contacts`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ email, unsubscribed: false }),
  });
  // Already on the list counts as a success: no need to tell anyone their email was known.
  if (res.ok || res.status === 409) return true;
  console.error('waitlist: Resend answered', res.status, await res.text().catch(() => ''));
  return false;
}

export async function POST(request: Request): Promise<Response> {
  const { email: raw, website, form } = await readBody(request);
  const reply = (status: number, result: 'ok' | 'invalid' | 'error') =>
    form ? Response.redirect(new URL(`/?waitlist=${result}#waitlist`, request.url), 303) : Response.json({ ok: result === 'ok', error: result === 'ok' ? undefined : result }, { status });

  // Honeypot: a hidden field people never fill. Bots get a quiet success.
  if (typeof website === 'string' && website) return reply(200, 'ok');
  const email = validEmail(raw);
  if (!email) return reply(400, 'invalid');
  return (await addContact(email)) ? reply(200, 'ok') : reply(502, 'error');
}
