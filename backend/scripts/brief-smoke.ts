/**
 * Temporary end-to-end smoke run for the brief pipeline (no DB, no Nest).
 * Usage: npx ts-node -T scripts/brief-smoke.ts [website]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildFacts } from '../src/briefs/brief-facts';
import { detectContradictions } from '../src/briefs/contradictions';
import { renderBrief } from '../src/briefs/brief-renderer';
import { ClaudeJsonService } from '../src/briefs/claude-json.service';
import { WebsiteExtractorService } from '../src/briefs/website-extractor.service';
import { BriefDrafterService } from '../src/briefs/brief-drafter.service';

// .env from the repo root, parsed just enough to get the API key out.
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const config = {
  get: (key: string, def?: string) => process.env[key] ?? def,
} as never;

const answers = {
  businessName: 'סטודיו נועה — עיצוב פנים',
  businessType: 'service',
  audience: 'b2c',
  contactName: 'נועה כהן',
  phone: '050-1234567',
  email: 'noa@example.com',
  preferredChannel: 'whatsapp',
  sections: [
    {
      title: 'סוג העסק',
      items: [
        { id: 'q1_focus', label: 'במה העסק שלך עוסק?', value: 'עיצוב פנים לדירות מגורים, בעיקר שיפוצים של דירות ישנות בתל אביב' },
        { id: 'q4_age', label: 'כמה זמן העסק קיים?', value: '3–5 שנים' },
      ],
    },
    {
      title: 'קהל היעד',
      items: [
        { id: 'q5_ideal', label: 'מי הלקוח האידיאלי שלך?', value: 'זוג בגילאי 30-45 שקנה דירה ישנה ורוצה לשפץ אותה מהיסוד, עם תקציב אמיתי ורצון להיות מעורב' },
        { id: 'q6_problem', label: 'מה הבעיה או הצורך שבגללו הוא פונה אליך?', value: 'הם לא יודעים איך להתחיל, מפחדים לבזבז כסף על טעויות ולא רוצים לנהל קבלנים לבד' },
        { id: 'q7_trigger', label: 'מה בדרך כלל גורם לו להחליט שהגיע הזמן לחפש פתרון?', value: 'קבלת מפתח לדירה חדשה או לידה של ילד' },
      ],
    },
    {
      title: 'המוצר / השירות',
      items: [
        { id: 'q2_offerings', label: 'אילו מוצרים או שירותים אתה מציע?', value: 'תכנון מלא, ליווי ביצוע, ייעוץ נקודתי של פגישה אחת' },
        { id: 'q3_main', label: 'מהו המוצר או השירות החשוב ביותר עבורך כיום?', value: 'ליווי מלא מתכנון עד מסירה' },
        { id: 'q20s_know', label: 'האם רוב הלקוחות כבר יודעים מה הם צריכים כשהם פונים אליך?', value: 'לא, צריך להסביר ולבנות אמון' },
        { id: 'q21s_cycle', label: 'כמה זמן עובר מהפנייה הראשונה ועד סגירת העסקה?', value: 'עד חודש' },
        { id: 'q22s_convince', label: 'מה משכנע (או לדעתך ישכנע) לקוחות לבחור דווקא בך?', value: 'שהם רואים שאני מבינה בביצוע ולא רק בתמונות יפות' },
      ],
    },
    {
      title: 'הבידול שלך',
      items: [
        { id: 'q9_why', label: 'למה שלקוחות יבחרו דווקא בך?', value: 'אני מלווה גם את הביצוע בפועל מול הקבלנים, לא רק מוסרת תוכניות' },
        { id: 'q11_oneliner', label: 'במשפט אחד — מה מייחד את העסק שלך?', value: 'עיצוב שמתחשב בתקציב האמיתי ולא בתקציב הדמיוני' },
        { id: 'q10_competitors', label: 'למה לדעתך לקוחות בוחרים במתחרים שלך?', value: 'אינסטגרם יפה יותר ומחירים נמוכים' },
        { id: 'q8_hesitation', label: 'מה עלול לגרום ללקוחות להסס לפני שהם קונים ממך?', value: 'המחיר, והפחד שהעיצוב יהיה יקר לביצוע' },
      ],
    },
    {
      title: 'השיווק שלך כיום',
      items: [
        { id: 'q12_sources', label: 'מאיפה מגיעים רוב הלקוחות שלך כיום?', value: 'המלצות, אינסטגרם, עדיין אין לקוחות (בהקמה)' },
        { id: 'q30_assets', label: 'אילו נכסים דיגיטליים כבר קיימים לעסק?', value: 'אתר, אינסטגרם, וואטסאפ Business' },
        { id: 'q13_tried', label: 'האם ניסית לשווק את העסק בעבר? מה עבד ומה לא?', value: 'ניסיתי קידום ממומן באינסטגרם, הביא פניות לא רציניות' },
        { id: 'q14_best_channel', label: 'אם יש ערוץ אחד שמביא לך היום את התוצאות הטובות ביותר — מה הוא?', value: 'המלצות מלקוחות' },
      ],
    },
    {
      title: 'תקציב ומשאבים',
      items: [
        { id: 'q23_has_budget', label: 'האם כיום יש לעסק תקציב קבוע לשיווק?', value: 'כן' },
        { id: 'q26_paid', label: 'האם אתה פתוח לשיווק ממומן?', value: 'אולי' },
      ],
    },
    {
      title: 'המטרות שלך',
      items: [
        { id: 'q16_success', label: 'מה מבחינתך ייחשב הצלחה?', value: 'שלושה פרויקטים מלאים בשנה במקום עשרה ייעוצים קטנים' },
        { id: 'q15_sixmonths', label: 'איפה היית רוצה לראות את העסק בעוד חצי שנה?', value: 'עם שני פרויקטים גדולים בביצוע ורשימת המתנה' },
        { id: 'q33_tradeoff', label: 'מה חשוב לך יותר?', value: 'פחות לקוחות, אבל עסקאות גדולות יותר' },
        { id: 'q34_brand', label: 'מה חשוב לך יותר בבניית המותג?', value: 'להיתפס כעסק איכותי ומוביל' },
      ],
    },
    {
      title: 'המיצוב שלך',
      items: [
        { id: 'q31_describe', label: 'איך היית רוצה שלקוחות יתארו את העסק שלך?', value: 'יוקרתי, אמין, משתלם' },
        { id: 'q32_top', label: 'מבין אלה שבחרת — מה הכי חשוב לך?', value: 'אמין' },
        { id: 'q17_personality', label: 'אם העסק שלך היה בן אדם — איך היית מתאר את האישיות שלו?', value: 'ישירה, חמה, לא מתחנפת' },
      ],
    },
    {
      title: 'אתגרים ומתחרים',
      items: [
        { id: 'q28_blocker', label: 'מה לדעתך היום הדבר שהכי מעכב את צמיחת העסק?', value: 'מעט פניות, חוסר זמן' },
        { id: 'q27_worry', label: 'מה הכי מטריד אותך כשאתה חושב על שיווק?', value: 'לבזבז כסף, אני לא יודע מאיפה להתחיל' },
        { id: 'q35_competitor', label: 'מי לדעתך המתחרה הטוב ביותר שלך?', value: 'סטודיו שמעון אדריכלים' },
      ],
    },
    {
      title: 'פרטי קשר',
      items: [
        { id: 'q37_anything', label: 'משהו נוסף שחשוב לך שנדע לפני שנבנה עבורך אסטרטגיה?', value: 'אני לא רוצה להיראות כמו עוד מעצבת אינסטגרם' },
      ],
    },
  ],
};

async function main() {
  const site = process.argv[2] ?? null;
  const claude = new ClaudeJsonService(config);
  const extractor = new WebsiteExtractorService(claude);
  const drafter = new BriefDrafterService(claude);

  console.log(`model=${claude.model} configured=${claude.configured} site=${site ?? 'none'}`);

  const facts = buildFacts(answers);
  const contradictions = detectContradictions(facts);
  console.log(`contradictions: ${contradictions.map((c) => c.code).join(', ') || 'none'}`);

  const t0 = Date.now();
  const extraction = site
    ? await extractor.extract(site)
    : (await import('../src/briefs/web-extraction')).EMPTY_EXTRACTION;
  console.log(`extraction: pages=${extraction.pages.length} (${Date.now() - t0}ms)`);

  const t1 = Date.now();
  const draft = await drafter.draft({ facts, extraction, contradictions });
  console.log(`draft: positioning="${draft.positioningStatement.slice(0, 60)}" (${Date.now() - t1}ms)`);

  const markdown = renderBrief({
    facts,
    extraction,
    draft,
    contradictions,
    generatedAt: new Date(),
    websiteUrl: site,
    model: claude.model,
  });

  const out = path.resolve(__dirname, 'brief-smoke-output.md');
  fs.writeFileSync(out, markdown, 'utf8');
  console.log(`written: ${out} (${markdown.length} chars)`);
}

void main();
