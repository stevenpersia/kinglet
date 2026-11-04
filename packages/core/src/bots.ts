/**
 * User agents of the link-preview crawlers we imitate.
 * These bots do not run JavaScript: what they see is the raw HTML response.
 */
export const BOTS = {
  whatsapp: 'WhatsApp/2.23.20.0 A',
  facebook: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  imessage:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0',
  twitter: 'Twitterbot/1.0',
  linkedin: 'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
  slack: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  discord: 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
  google: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
} as const;

export type BotId = keyof typeof BOTS;
