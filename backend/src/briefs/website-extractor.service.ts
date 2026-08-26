import * as dns from 'node:dns/promises';
import { Injectable, Logger } from '@nestjs/common';
import { type Browser, type Page, launch } from 'puppeteer';
import { ClaudeJsonService } from './claude-json.service';
import { UNKNOWN } from './brief-facts';
import { WebExtraction, EMPTY_EXTRACTION } from './website-extraction.types';

export type { WebExtraction };
export { EMPTY_EXTRACTION };

const MAX_PAGES = 7;
const MAX_BYTES = 900_000;
const MAX_TEXT_PER_PAGE = 14_000;
const FETCH_TIMEOUT_MS = 15_000;
// Below this much readable text from a plain fetch, assume a client-rendered
// SPA and re-fetch through headless Chromium so its JS content becomes readable.
const MIN_STATIC_TEXT = 300;
const RENDER_TIMEOUT_MS = 20_000;

/**
 * Same-origin paths worth reading beyond the homepage, in PRIORITY order —
 * `pickLinks` reads the earliest-matching pages first. Commerce/pricing pages
 * lead because prices usually live on a store or product page, not the home.
 */
const INTERESTING = [
  // Commerce & pricing — most likely to carry prices/products.
  'price',
  'pricing',
  'מחיר',
  'מחירון',
  'packages',
  'חבילות',
  'store',
  'shop',
  'חנות',
  'product', // matches /product/... and /products
  'מוצרים',
  'catalog',
  'קטלוג',
  'buy',
  'לרכישה',
  'sale',
  'מבצע',
  // Informational pages.
  'services',
  'שירותים',
  'service',
  'about',
  'אודות',
  'testimonial',
  'reviews',
  'המלצות',
  'portfolio',
  'gallery',
  'faq',
  'שאלות',
  'contact',
  'צור-קשר',
];

const SYSTEM_PROMPT = `אתה שלב ה"חילוץ" בבניית בריף שיווקי לעסק. אתה מקבל טקסט גולמי שנקרא מאתר האינטרנט של העסק, ומחלץ ממנו רק מה שכתוב שם בפועל.

חוקי ברזל:
- אסור להמציא. אם מידע לא מופיע בטקסט — החזר "${UNKNOWN}" (למחרוזת) או מערך ריק (לרשימה). לעולם אל תשלים מהידע הכללי שלך על התחום.
- אל תנסח מסרים שיווקיים, אל תשפר ואל תמליץ. אתה מדווח מה קיים, לא מה כדאי.
- ציטוטים (המלצות, שפת לקוחות) — העתק כלשונם, בלי לערוך.
- מחירים — רק אם מספר מופיע בפועל בטקסט. אחרת "${UNKNOWN}".
- כששדה אינו ידוע — החזר בדיוק "${UNKNOWN}" ותו לא. בלי הסברים ובלי מידע חלקי בסוגריים.
- ענה בעברית, למעט שמות/כתובות שמופיעים בלועזית.

החזר JSON יחיד בלבד, ללא טקסט נוסף, במבנה:
{
  "services": string[],          // שירותים/מוצרים כפי שהאתר מציג אותם
  "pricing": string,             // טווחי מחיר/חבילות אם מפורסמים
  "tone": string,                // תיאור טון הכתיבה באתר (משפט–שניים)
  "toneWords": string[],         // עד 3 מילים שמתארות את הטון
  "testimonials": string[],      // ציטוטי לקוחות כלשונם
  "proofAssets": string[],       // מספרים, ותק, לקוחות מוכרים, תעודות, אזכורים
  "digitalPresence": string[],   // קישורים/רשתות שמופיעים באתר
  "story": string,               // סיפור העסק / "עלינו" בתמצית, על בסיס הטקסט בלבד
  "processSteps": string[],      // שלבי תהליך העבודה אם מתוארים
  "faq": string[],               // שאלות נפוצות כפי שמופיעות
  "customerLanguage": string[],  // ניסוחים שבהם האתר מתאר את הבעיה של הלקוח
  "geography": string,           // אזור פעילות אם מצוין
  "notes": string                // הערה קצרה על מה שלא נמצא באתר
}`;

/**
 * 🟢 The extraction layer: reads the business's own website and reports what is
 * actually written there.
 *
 * Two independent guards keep this honest. The fetcher refuses anything that
 * isn't a public http(s) host (an operator-supplied URL must not become an
 * SSRF probe into the cluster), and the prompt forbids filling gaps from the
 * model's own knowledge — a missing fact comes back as ⟨לא ידוע⟩ and travels
 * to the brief that way.
 */
@Injectable()
export class WebsiteExtractorService {
  private readonly log = new Logger(WebsiteExtractorService.name);

  constructor(private readonly claude: ClaudeJsonService) {}

  async extract(rawUrl: string | null | undefined): Promise<WebExtraction> {
    const start = this.normalizeUrl(rawUrl);
    if (!start) return { ...EMPTY_EXTRACTION };

    const pages = await this.crawl(start);
    if (pages.length === 0) {
      this.log.warn(`no readable pages at ${start.href}`);
      return {
        ...EMPTY_EXTRACTION,
        notes: `לא הצלחנו לקרוא את ${start.href}`,
      };
    }

    const corpus = pages
      .map((p) => `=== ${p.url} ===\n${p.text}`)
      .join('\n\n')
      .slice(0, 60_000);

    const parsed = await this.claude.json<Partial<WebExtraction>>({
      system: SYSTEM_PROMPT,
      user: `להלן הטקסט שנקרא מהאתר של העסק. חלץ ממנו את המידע לפי המבנה.\n\n${corpus}`,
      maxTokens: 4000,
    });

    if (!parsed) {
      return {
        ...EMPTY_EXTRACTION,
        pages: pages.map((p) => p.url),
        notes: 'החילוץ מהאתר נכשל — יש להשלים ידנית.',
      };
    }

    return {
      pages: pages.map((p) => p.url),
      services: strArray(parsed.services),
      pricing: str(parsed.pricing),
      tone: str(parsed.tone),
      toneWords: strArray(parsed.toneWords).slice(0, 3),
      testimonials: strArray(parsed.testimonials),
      proofAssets: strArray(parsed.proofAssets),
      digitalPresence: strArray(parsed.digitalPresence),
      story: str(parsed.story),
      processSteps: strArray(parsed.processSteps),
      faq: strArray(parsed.faq),
      customerLanguage: strArray(parsed.customerLanguage),
      geography: str(parsed.geography),
      notes: typeof parsed.notes === 'string' ? parsed.notes.trim() : '',
    };
  }

  /**
   * Public, SSRF-guarded crawl. Returns the readable pages (url + text) for a
   * caller that wants the raw site text with its OWN extraction prompt — e.g.
   * the operator "import facts from the website" action. Empty array when the
   * URL is unusable or nothing readable was found.
   */
  async readPages(
    rawUrl: string | null | undefined,
  ): Promise<Array<{ url: string; text: string }>> {
    const start = this.normalizeUrl(rawUrl);
    if (!start) return [];
    return this.crawl(start);
  }

  /** http(s) + a public host only. Returns null for anything we won't fetch. */
  private normalizeUrl(raw: string | null | undefined): URL | null {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) return null;
    const withScheme = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    try {
      const url = new URL(withScheme);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      if (!url.hostname || url.hostname === 'localhost') return null;
      return url;
    } catch {
      return null;
    }
  }

  /** Blocks loopback / link-local / private-range targets before any request. */
  private async isPublicHost(hostname: string): Promise<boolean> {
    try {
      const records = await dns.lookup(hostname, { all: true });
      if (records.length === 0) return false;
      return records.every((r) => !isPrivateAddress(r.address));
    } catch {
      return false;
    }
  }

  private async crawl(
    start: URL,
  ): Promise<Array<{ url: string; text: string }>> {
    if (!(await this.isPublicHost(start.hostname))) {
      this.log.warn(`refusing to fetch non-public host ${start.hostname}`);
      return [];
    }

    // A headless browser is launched lazily — only if a plain fetch turns out
    // too thin (an SPA) — and reused across the crawl, then closed. Held on an
    // object so the lazy assignment inside the closure survives narrowing.
    const held: { browser: Browser | null } = { browser: null };
    const getBrowser = async (): Promise<Browser> => {
      if (!held.browser) held.browser = await this.launchBrowser();
      return held.browser;
    };

    try {
      const home = await this.loadPage(start.href, getBrowser);
      if (!home) return [];

      const pages = [{ url: start.href, text: home.text }];
      const links = this.pickLinks(home.html, start);
      for (const link of links) {
        if (pages.length >= MAX_PAGES) break;
        const p = await this.loadPage(link, getBrowser);
        if (p) pages.push({ url: link, text: p.text });
      }
      return pages.filter((p) => p.text.length > 40);
    } finally {
      if (held.browser) await held.browser.close().catch(() => undefined);
    }
  }

  /**
   * Loads one page as { html, text }. Tries a cheap plain fetch first; if it
   * returns too little text (a client-rendered SPA shell) or fails, re-fetches
   * through headless Chromium so JS-rendered content becomes readable. The
   * rendered HTML is also what feeds link discovery, so SPA nav links are found.
   */
  private async loadPage(
    url: string,
    getBrowser: () => Promise<Browser>,
  ): Promise<{ html: string; text: string } | null> {
    const html = await this.fetchHtml(url);
    if (html) {
      const text = htmlToText(html);
      if (text.length >= MIN_STATIC_TEXT) return { html, text };
    }
    const rendered = await this.renderHtml(url, getBrowser);
    if (rendered) return { html: rendered, text: htmlToText(rendered) };
    return html ? { html, text: htmlToText(html) } : null;
  }

  private async launchBrowser(): Promise<Browser> {
    // System Chromium in prod (PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium),
    // bundled binary locally. --no-sandbox: the container is the boundary.
    return launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });
  }

  /** Renders a page with headless Chromium and returns its post-JS HTML. */
  private async renderHtml(
    url: string,
    getBrowser: () => Promise<Browser>,
  ): Promise<string | null> {
    let page: Page | null = null;
    try {
      const browser = await getBrowser();
      page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (compatible; PortalStudioBriefBot/1.0; +https://portalstudio.co.il)',
      );
      // We only need text — skip images/media/fonts/styles. Faster, and a
      // smaller surface when loading an untrusted external site.
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (
          ['image', 'media', 'font', 'stylesheet'].includes(req.resourceType())
        )
          void req.abort();
        else void req.continue();
      });
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: RENDER_TIMEOUT_MS,
      });
      // Let client-side rendering settle, bounded so a chatty site can't hang.
      await page
        .waitForNetworkIdle({ idleTime: 600, timeout: 6000 })
        .catch(() => undefined);
      const html = await page.content();
      return html.slice(0, MAX_BYTES);
    } catch (err) {
      this.log.debug(`render failed ${url}: ${(err as Error).message}`);
      return null;
    } finally {
      if (page) await page.close().catch(() => undefined);
    }
  }

  /**
   * Same-origin links that look like an interesting page, returned in priority
   * order (commerce/pricing pages first — see INTERESTING). Each link is scored
   * by its earliest-matching keyword so, with a small page budget, the pages
   * most likely to carry prices/products are read before about/contact.
   */
  private pickLinks(html: string, base: URL): string[] {
    const scored = new Map<string, number>(); // href -> best (lowest) keyword index
    const re = /href\s*=\s*["']([^"'#]+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      let url: URL;
      try {
        url = new URL(m[1], base);
      } catch {
        continue;
      }
      if (url.origin !== base.origin) continue;
      if (url.href === base.href) continue;
      if (/\.(pdf|jpe?g|png|gif|svg|webp|zip|mp4|css|js)$/i.test(url.pathname))
        continue;
      const path = decodeURIComponent(url.pathname).toLowerCase();
      const idx = INTERESTING.findIndex((k) => path.includes(k));
      if (idx === -1) continue;
      url.hash = '';
      const prev = scored.get(url.href);
      if (prev === undefined || idx < prev) scored.set(url.href, idx);
      if (scored.size >= 30) break;
    }
    return [...scored.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([href]) => href)
      .slice(0, MAX_PAGES - 1);
  }

  /** Plain HTTP fetch of a page's HTML (no JS). Null on any failure. */
  private async fetchHtml(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: {
          // Some hosts serve a bare challenge page to unknown agents.
          'user-agent':
            'Mozilla/5.0 (compatible; PortalStudioBriefBot/1.0; +https://portalstudio.co.il)',
          accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const type = res.headers.get('content-type') ?? '';
      if (type && !type.includes('html') && !type.includes('text')) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.subarray(0, MAX_BYTES).toString('utf8');
    } catch (err) {
      this.log.debug(`fetch failed ${url}: ${(err as Error).message}`);
      return null;
    }
  }
}

function str(v: unknown): string {
  return typeof v === 'string' && v.trim() ? v.trim() : UNKNOWN;
}
function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((x) => x && x !== UNKNOWN);
}

/** RFC1918 + loopback + link-local + CGNAT + IPv6 unique-local. */
function isPrivateAddress(address: string): boolean {
  if (address.includes(':')) {
    const v6 = address.toLowerCase();
    if (v6 === '::1' || v6 === '::') return true;
    if (v6.startsWith('fe80') || v6.startsWith('fc') || v6.startsWith('fd'))
      return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/** Strips markup down to readable text — good enough to feed a model. */
export function htmlToText(html: string): string {
  return (
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      // Spaces, tabs and NBSP — but not newlines, which carry the block structure.
      .replace(/[^\S\n]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, MAX_TEXT_PER_PAGE)
  );
}
