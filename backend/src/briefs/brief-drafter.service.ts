import { Injectable, Logger } from '@nestjs/common';
import { ClaudeJsonService } from './claude-json.service';
import { BriefFacts, UNKNOWN, renderFactsForPrompt } from './brief-facts';
import { Contradiction } from './contradictions';
import { WebExtraction } from './web-extraction';

export interface DraftPersona {
  name: string;
  who: string;
  pain: string;
  trigger: string;
  awareness: string;
  objections: string[];
  convincers: string[];
}

export interface DraftServiceAngle {
  service: string;
  forWhom: string;
  problem: string;
  outcome: string;
}

/** 🟠 Everything the drafting step produces. All of it is a draft for approval. */
export interface BriefDraft {
  positioningStatement: string;
  differentiation: string[];
  valueProposition: string;
  brandStory: string;
  vision: string;
  values: string[];
  personality: string;
  promise: string;
  toneDescription: string;
  toneWords: string[];
  formality: string;
  coreMessages: string[];
  personas: DraftPersona[];
  serviceAngles: DraftServiceAngle[];
  upsells: string[];
  say: string[];
  dontSay: string[];
  primaryCta: string;
  redLines: string[];
  competitorResponse: string;
  faq: string[];
  keepablePromises: string[];
  openQuestions: string[];
}

export const EMPTY_DRAFT: BriefDraft = {
  positioningStatement: UNKNOWN,
  differentiation: [],
  valueProposition: UNKNOWN,
  brandStory: UNKNOWN,
  vision: UNKNOWN,
  values: [],
  personality: UNKNOWN,
  promise: UNKNOWN,
  toneDescription: UNKNOWN,
  toneWords: [],
  formality: UNKNOWN,
  coreMessages: [],
  personas: [],
  serviceAngles: [],
  upsells: [],
  say: [],
  dontSay: [],
  primaryCta: UNKNOWN,
  redLines: [],
  competitorResponse: UNKNOWN,
  faq: [],
  keepablePromises: [],
  openQuestions: [],
};

const SYSTEM_PROMPT = `אתה אסטרטג שיווק בכיר שכותב את שלב ה"ניסוח" בבריף עסקי. אתה מקבל (א) תשובות שהלקוח מילא בשאלון אסטרטגיה, (ב) מידע שחולץ מהאתר שלו, (ג) סתירות שזוהו בתשובות. אתה מייצר את המסקנה המקצועית: מיצוב, בידול, פרסונות, מסרים וטון.

מה אתה כן עושה:
- מסיק מהחומר שקיבלת. מיצוב ובידול הם מסקנה — לא נתון — ולכן מותר וצריך לנסח אותם.
- כותב בעברית עסקית נקייה, בגוף שמדבר על העסק. בלי סופרלטיבים ריקים ("הטוב ביותר", "מהפכני", "פורץ דרך"), בלי קלישאות ("פתרונות מותאמים אישית", "שירות ללא פשרות").
- מנסח קצר. משפט אחד שאפשר להשתמש בו עדיף על פסקה יפה.

מה אסור לך:
- אסור להמציא עובדות: מספרים, שנות ותק, כמות לקוחות, פרסים, מחירים, שמות לקוחות, טכנולוגיות או הבטחות שלא הופיעו בחומר. אם משהו לא נמסר — "${UNKNOWN}" למחרוזת, מערך ריק לרשימה.
- אסור להסתמך על ידע כללי על התחום כאילו הוא עובדה על העסק הזה.
- כששדה אינו ידוע — החזר בדיוק "${UNKNOWN}" ותו לא. בלי הסברים ובלי מידע חלקי בסוגריים.
- אסור להכריע סתירה שדווחה לך. אם שתי תשובות מתנגשות — נסח לפי מה שבטוח, וכתוב את ההכרעה הנדרשת ב-openQuestions.
- אסור להציע הבטחה שהעסק לא יכול לעמוד בה (זמני תגובה, אחריות, תוצאות מובטחות) אם לא נמסרה.

החזר JSON יחיד בלבד, ללא טקסט נוסף, במבנה המדויק:
{
  "positioningStatement": string,   // «עבור ⟨קהל⟩, אנחנו ה-⟨קטגוריה⟩ ש-⟨תועלת ייחודית⟩, בניגוד ל-⟨אלטרנטיבה⟩.»
  "differentiation": string[],      // 2–4 נקודות בידול, כל אחת משפט
  "valueProposition": string,       // הצעת ערך במשפט אחד: מה נותנים, למי, ולמה זה שונה
  "brandStory": string,             // 2–4 משפטים; רק על בסיס מה שנמסר
  "vision": string,
  "values": string[],               // 3–5 ערכים, מילה או שתיים כל אחד
  "personality": string,            // אישיות המותג במשפט
  "promise": string,                // מה הלקוח תמיד יקבל
  "toneDescription": string,        // איך מדברים — משפט
  "toneWords": string[],            // בדיוק 3 מילים
  "formality": string,              // רמת רשמיות ואורך משפטים
  "coreMessages": string[],         // 3 מסרי-על
  "personas": [{ "name": string, "who": string, "pain": string, "trigger": string, "awareness": string, "objections": string[], "convincers": string[] }],
  "serviceAngles": [{ "service": string, "forWhom": string, "problem": string, "outcome": string }],
  "upsells": string[],              // תוספות אפשריות — רק כאלה שנגזרות מהשירותים שנמסרו
  "say": string[],                  // ✅ ניסוחים ומילים לומר
  "dontSay": string[],              // ⛔ ניסוחים ומילים לא לומר — הכי חשוב, היה ספציפי לעסק הזה
  "primaryCta": string,             // הפעולה שרוצים מהלקוח
  "redLines": string[],             // מה אסור להבטיח / לא עושים
  "competitorResponse": string,     // מה עונים כשמשווים אותנו למתחרה
  "faq": string[],                  // שאלות שלקוחות צפויים לשאול — שאלות בלבד, בלי תשובות
  "keepablePromises": string[],     // הבטחות שהעסק כן יכול לעמוד בהן לפי החומר
  "openQuestions": string[]         // מה חייבים לברר מול הלקוח לפני שמשתמשים בבריף
}

פרסונות: 1–2 פרסונות, על בסיס קהל היעד שנמסר בלבד. אם נמסר קהל אחד — פרסונה אחת.`;

/**
 * 🟠 The drafting layer: positioning, differentiation, personas, messaging.
 *
 * This is the part a client pays a strategist for, and the part that must never
 * be mistaken for a fact — the renderer stamps every field produced here as
 * "טיוטה — טעון אישור". If the call fails we return the empty draft, so the
 * brief ships with ⟨לא ידוע⟩ instead of plausible fiction.
 */
@Injectable()
export class BriefDrafterService {
  private readonly log = new Logger(BriefDrafterService.name);

  constructor(private readonly claude: ClaudeJsonService) {}

  async draft(input: {
    facts: BriefFacts;
    extraction: WebExtraction;
    contradictions: Contradiction[];
  }): Promise<BriefDraft> {
    const user = [
      '=== תשובות הלקוח בשאלון (🔵) ===',
      renderFactsForPrompt(input.facts),
      '',
      '=== מה שחולץ מהאתר (🟢) ===',
      renderExtraction(input.extraction),
      '',
      '=== סתירות שזוהו בתשובות (⚠️) ===',
      input.contradictions.length
        ? input.contradictions.map((c) => `- ${c.text}`).join('\n')
        : 'לא זוהו סתירות.',
      '',
      'נסח את שלב ה-🟠 לפי המבנה. זכור: מה שלא נמסר — לא ממציאים.',
    ].join('\n');

    const parsed = await this.claude.json<Partial<BriefDraft>>({
      system: SYSTEM_PROMPT,
      user,
      maxTokens: 8000,
    });
    if (!parsed) {
      this.log.warn(
        'drafting step produced nothing — brief will ship as 🔵/🟢 only',
      );
      return { ...EMPTY_DRAFT };
    }

    return {
      positioningStatement: str(parsed.positioningStatement),
      differentiation: strArray(parsed.differentiation),
      valueProposition: str(parsed.valueProposition),
      brandStory: str(parsed.brandStory),
      vision: str(parsed.vision),
      values: strArray(parsed.values),
      personality: str(parsed.personality),
      promise: str(parsed.promise),
      toneDescription: str(parsed.toneDescription),
      toneWords: strArray(parsed.toneWords).slice(0, 3),
      formality: str(parsed.formality),
      coreMessages: strArray(parsed.coreMessages),
      personas: personas(parsed.personas),
      serviceAngles: serviceAngles(parsed.serviceAngles),
      upsells: strArray(parsed.upsells),
      say: strArray(parsed.say),
      dontSay: strArray(parsed.dontSay),
      primaryCta: str(parsed.primaryCta),
      redLines: strArray(parsed.redLines),
      competitorResponse: str(parsed.competitorResponse),
      faq: strArray(parsed.faq),
      keepablePromises: strArray(parsed.keepablePromises),
      openQuestions: strArray(parsed.openQuestions),
    };
  }
}

function renderExtraction(e: WebExtraction): string {
  if (e.pages.length === 0) {
    return 'לא נמסר אתר / לא הצלחנו לקרוא אותו. אין שכבת חילוץ — אל תשלים אותה מהדמיון.';
  }
  const list = (items: string[]) =>
    items.length ? items.map((i) => `  - ${i}`).join('\n') : `  ${UNKNOWN}`;
  return [
    `עמודים שנקראו: ${e.pages.join(', ')}`,
    'שירותים/מוצרים:',
    list(e.services),
    `מחירים: ${e.pricing}`,
    `טון הכתיבה: ${e.tone}${e.toneWords.length ? ` (${e.toneWords.join(', ')})` : ''}`,
    'המלצות:',
    list(e.testimonials),
    'נכסי הוכחה:',
    list(e.proofAssets),
    'נוכחות דיגיטלית:',
    list(e.digitalPresence),
    `סיפור העסק: ${e.story}`,
    'תהליך העבודה:',
    list(e.processSteps),
    'שאלות נפוצות באתר:',
    list(e.faq),
    'שפת הלקוח:',
    list(e.customerLanguage),
    `אזור פעילות: ${e.geography}`,
    e.notes ? `הערות: ${e.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');
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
function personas(v: unknown): DraftPersona[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (p): p is Record<string, unknown> => Boolean(p) && typeof p === 'object',
    )
    .map((p) => ({
      name: str(p.name),
      who: str(p.who),
      pain: str(p.pain),
      trigger: str(p.trigger),
      awareness: str(p.awareness),
      objections: strArray(p.objections),
      convincers: strArray(p.convincers),
    }))
    .slice(0, 3);
}
function serviceAngles(v: unknown): DraftServiceAngle[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object',
    )
    .map((s) => ({
      service: str(s.service),
      forWhom: str(s.forWhom),
      problem: str(s.problem),
      outcome: str(s.outcome),
    }))
    .slice(0, 8);
}
