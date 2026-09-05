/**
 * Deterministic assembly of the brief markdown.
 *
 * Nothing here calls a model. The three layers (🔵 questionnaire, 🟢 website,
 * 🟠 draft) arrive already resolved, and this file only decides where each one
 * is printed and how it is tagged — which is what makes the "no invention"
 * rule enforceable: a slot with no data prints ⟨לא ידוע⟩ because the renderer
 * says so, not because a prompt asked nicely.
 */

import { BriefFacts, UNKNOWN, answer, isRelevant } from './brief-facts';
import { BriefDraft } from './brief-drafter.service';
import { Contradiction } from './contradictions';
import { WebExtraction } from './website-extraction.types';
import { Q_FIELD_BY_ID } from './questionnaire-schema';

const DRAFT_TAG = '🟠 טיוטה — טעון אישור';
const WEB_TAG = '🟢 חילוץ';

export interface RenderBriefInput {
  facts: BriefFacts;
  extraction: WebExtraction;
  draft: BriefDraft;
  contradictions: Contradiction[];
  generatedAt: Date;
  websiteUrl?: string | null;
  model?: string | null;
}

/** `🔵[3]` — the questionnaire step a field came from. */
function q(fieldId: string): string {
  const step = Q_FIELD_BY_ID[fieldId]?.step;
  return step ? `🔵[${step}]` : '🔵';
}

function line(label: string, value: string, tag: string): string {
  const v = value && value.trim() ? value.trim() : UNKNOWN;
  return `- **${label}:** ${v} · ${tag}`;
}

/** A questionnaire line that disappears entirely when the question doesn't
 *  apply to this business (the wizard's product/service branch). */
function branchLine(
  facts: BriefFacts,
  label: string,
  fieldId: string,
): string[] {
  if (!isRelevant(facts, fieldId)) return [];
  return [line(label, answer(facts, fieldId), q(fieldId))];
}

/** A bullet list, or a single ⟨לא ידוע⟩ line when there's nothing to show. */
function bullets(items: string[], tag: string, indent = ''): string[] {
  if (items.length === 0) return [`${indent}- ${UNKNOWN} · ${tag}`];
  return items.map((i) => `${indent}- ${i} · ${tag}`);
}

function inline(items: string[]): string {
  return items.length ? items.join(' · ') : UNKNOWN;
}

function first(items: string[]): string {
  return items.length ? items[0] : UNKNOWN;
}

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function renderBrief(input: RenderBriefInput): string {
  const { facts, extraction, draft, contradictions } = input;
  const out: string[] = [];
  const push = (...lines: string[]) => out.push(...lines);

  const name = facts.businessName;
  const webRead = extraction.pages.length > 0;

  /* ---- Header ---------------------------------------------------------- */
  push(
    `# בריף עסק — ${name}`,
    '',
    '> מסמך מקור-אמת אחד לעסק. מוזן לכלי AI / סוכן שיווק כדי לייצר תוכן ואסטרטגיה.',
    `> **כלל ברזל:** שדה שאין עליו מידע כתוב במפורש \`${UNKNOWN}\`. אין ניחושים ואין השלמות מהדמיון.`,
    `> הבריף הופק אוטומטית מתוך שאלון האסטרטגיה ב-${formatDate(input.generatedAt)}. **כל שדה 🟠 הוא טיוטה שדורשת אישור אנושי לפני שימוש.**`,
    '',
    '| תג | מקור | מה זה אומר |',
    '|----|------|------------|',
    '| 🔵 | השאלון | תשובה של הלקוח. המספר ליד התג = שלב בשאלון. עובדה. |',
    `| 🟢 | חילוץ | נקרא מהאתר של העסק. ${webRead ? `נקראו: ${extraction.pages.length} עמודים.` : 'לא בוצע — לא נמסר אתר קריא.'} |`,
    '| 🟠 | ניסוח | מסקנה מקצועית שנוצרה כטיוטה. **לאשר לפני פרסום.** |',
    '',
    '---',
    '',
  );

  /* ---- Open decisions -------------------------------------------------- */
  if (contradictions.length > 0 || draft.openQuestions.length > 0) {
    push('## ⚠️ דורש הכרעה לפני שימוש', '');
    if (contradictions.length > 0) {
      push(
        '**סתירות בתשובות השאלון** — שתי התשובות מוצגות, אף אחת לא הוכרעה:',
        '',
      );
      push(...contradictions.map((c) => `- ⚠️ ${c.text}`));
      push('');
    }
    if (draft.openQuestions.length > 0) {
      push('**שאלות פתוחות לבירור מול הלקוח:**', '');
      push(...draft.openQuestions.map((q2) => `- ${q2}`));
      push('');
    }
    push('---', '');
  }

  /* ---- Quick card ------------------------------------------------------ */
  push(
    '## ⚡ כרטיס מהיר',
    '',
    '> השורות שמספיקות לרוב המשימות. אפשר להדביק רק את החלק הזה לפרומפט.',
    '',
    line('העסק', name, q('businessName')),
    line('תחום', answer(facts, 'q1_focus'), q('q1_focus')),
    line('סוג', answer(facts, 'businessType'), q('businessType')),
    line('ותק', answer(facts, 'q4_age'), q('q4_age')),
    line('קהל ראשי', answer(facts, 'audience'), q('audience')),
    line('הלקוח האידיאלי', answer(facts, 'q5_ideal'), q('q5_ideal')),
    line('הצעת ערך במשפט', draft.valueProposition, DRAFT_TAG),
    line('בידול במשפט', first(draft.differentiation), DRAFT_TAG),
    line('המוצר/שירות שמקדמים', answer(facts, 'q3_main'), q('q3_main')),
    line('טווח מחיר', extraction.pricing, WEB_TAG),
    line('טון ב-3 מילים', inline(draft.toneWords), DRAFT_TAG),
    line('מטרה נוכחית', answer(facts, 'q16_success'), q('q16_success')),
    line('CTA ראשי', draft.primaryCta, DRAFT_TAG),
    line('קו אדום #1', first(draft.redLines), DRAFT_TAG),
    line(
      'סתירות פתוחות',
      contradictions.length ? `${contradictions.length} — ראה למעלה` : 'אין',
      '⚠️',
    ),
    '',
    '---',
    '',
  );

  /* ---- 1 · Identity & positioning -------------------------------------- */
  push(
    '## 1 · זהות ומיצוב  🟠',
    '',
    '> רובו ניסוח. הבסיס: 🔵[4] בידול · 🔵[8] מיצוב.',
    '',
    line('מיצוב במשפט', draft.positioningStatement, DRAFT_TAG),
    line('הצעת הערך המרכזית', draft.valueProposition, DRAFT_TAG),
    line('סיפור המותג', draft.brandStory, DRAFT_TAG),
    line('חזון', draft.vision, DRAFT_TAG),
    line('ערכים', inline(draft.values), DRAFT_TAG),
    line('אישיות המותג', draft.personality, DRAFT_TAG),
    line(
      'אישיות כפי שהלקוח תיאר',
      answer(facts, 'q17_personality'),
      q('q17_personality'),
    ),
    line('הבטחת המותג', draft.promise, DRAFT_TAG),
    line('תפיסת מותג רצויה', answer(facts, 'q31_describe'), q('q31_describe')),
    line('התכונה החשובה ביותר', answer(facts, 'q32_top'), q('q32_top')),
    '',
    '**במה שונים:**',
    ...bullets(draft.differentiation, DRAFT_TAG),
    '',
    '**מה הלקוח עצמו אמר על הבידול:**',
    line('למה שיבחרו בך', answer(facts, 'q9_why'), q('q9_why')),
    line('משפט הייחוד', answer(facts, 'q11_oneliner'), q('q11_oneliner')),
    '',
    '---',
    '',
  );

  /* ---- 2 · Audiences & personas ---------------------------------------- */
  push('## 2 · קהלים ופרסונות', '');
  push(
    line('קהל ראשי', answer(facts, 'audience'), q('audience')),
    line('הלקוח האידיאלי', answer(facts, 'q5_ideal'), q('q5_ideal')),
    line('הבעיה / הכאב', answer(facts, 'q6_problem'), q('q6_problem')),
    line('טריגר לפעולה', answer(facts, 'q7_trigger'), q('q7_trigger')),
    ...branchLine(facts, 'שלב המודעות', 'q20s_know'),
    ...branchLine(facts, 'מה מניע רכישה', 'q20p_drivers'),
    ...branchLine(facts, 'מה משכנע לבחור בך', 'q22s_convince'),
    line(
      'התנגדויות / מה גורם להסס',
      answer(facts, 'q8_hesitation'),
      q('q8_hesitation'),
    ),
    '',
    '**השפה שבה הלקוח מתאר את הבעיה (מהאתר):**',
    ...bullets(extraction.customerLanguage, WEB_TAG),
    '',
  );
  if (draft.personas.length === 0) {
    push(`**פרסונות:** ${UNKNOWN} · ${DRAFT_TAG}`, '');
  } else {
    for (const [i, p] of draft.personas.entries()) {
      push(
        `### פרסונה ${i + 1} — ${p.name}  ·  ${DRAFT_TAG}`,
        '',
        line('מי זה', p.who, DRAFT_TAG),
        line('הכאב', p.pain, DRAFT_TAG),
        line('טריגר', p.trigger, DRAFT_TAG),
        line('שלב מודעות', p.awareness, DRAFT_TAG),
        '',
        '**התנגדויות:**',
        ...bullets(p.objections, DRAFT_TAG),
        '',
        '**מה משכנע:**',
        ...bullets(p.convincers, DRAFT_TAG),
        '',
      );
    }
  }
  push(
    '**שאלות שלקוחות צפויים לשאול:**',
    ...bullets(
      extraction.faq.length ? extraction.faq : draft.faq,
      extraction.faq.length ? WEB_TAG : DRAFT_TAG,
    ),
    '',
    '---',
    '',
  );

  /* ---- 3 · Services & pricing ------------------------------------------ */
  push(
    '## 3 · שירותים, הצעות ומחירים',
    '',
    line(
      'פירוט השירותים/מוצרים',
      answer(facts, 'q2_offerings'),
      q('q2_offerings'),
    ),
    line('המוצר הדגל (הכי חשוב לקדם)', answer(facts, 'q3_main'), q('q3_main')),
    '',
    '**שירותים כפי שהם מוצגים באתר:**',
    ...bullets(extraction.services, WEB_TAG),
    '',
    line('תמחור וחבילות', extraction.pricing, `${WEB_TAG} · לאמת מול הלקוח`),
    ...branchLine(facts, 'אורך מחזור מכירה (מפנייה לסגירה)', 'q21s_cycle'),
    ...branchLine(facts, 'זמן החלטה עד רכישה', 'q22p_decide'),
    ...branchLine(facts, 'רכישה חוזרת', 'q21p_repeat'),
    line('אזור פעילות', extraction.geography, WEB_TAG),
    '',
    '**תהליך העבודה:**',
    ...bullets(extraction.processSteps, WEB_TAG),
    '',
    '**זווית מכירה לכל שירות — למי מתאים / הבעיה / התוצאה:**',
  );
  if (draft.serviceAngles.length === 0) {
    push('', `- ${UNKNOWN} · ${DRAFT_TAG}`, '');
  } else {
    push(
      '',
      '| שירות | למי מתאים | הבעיה שפותר | התוצאה |',
      '|---|---|---|---|',
      ...draft.serviceAngles.map(
        (s) => `| ${s.service} | ${s.forWhom} | ${s.problem} | ${s.outcome} |`,
      ),
      '',
      `כל השורות בטבלה: ${DRAFT_TAG}`,
      '',
    );
  }
  push(
    '**תוספות (upsell):**',
    ...bullets(draft.upsells, DRAFT_TAG),
    '',
    '**הבטחות שהעסק יכול לעמוד בהן:**',
    ...bullets(draft.keepablePromises, DRAFT_TAG),
    '',
    `- **מה כלול ומה לא כלול:** ${UNKNOWN} · לברר מול הלקוח`,
    `- **מדיניות ביטול / שינויים:** ${UNKNOWN} · לברר מול הלקוח`,
    `- **זמני אספקה:** ${UNKNOWN} · לברר מול הלקוח`,
    '',
    '---',
    '',
  );

  /* ---- 4 · Messaging & tone -------------------------------------------- */
  push(
    '## 4 · מסרים וטון',
    '',
    line('טון הכתיבה באתר', extraction.tone, WEB_TAG),
    line('טון מומלץ', draft.toneDescription, DRAFT_TAG),
    line('טון ב-3 מילים', inline(draft.toneWords), DRAFT_TAG),
    line('רמת רשמיות ואורך משפטים', draft.formality, DRAFT_TAG),
    line('הצעת הערך המרכזית', draft.valueProposition, DRAFT_TAG),
    line('CTA ראשי', draft.primaryCta, DRAFT_TAG),
    '',
    '**3 מסרי-על:**',
    ...bullets(draft.coreMessages, DRAFT_TAG),
    '',
    '**✅ לומר / ⛔ לא לומר** — הטבלה הכי חשובה למניעת תוכן גנרי · ' +
      DRAFT_TAG,
    '',
    '| ✅ לומר | ⛔ לא לומר |',
    '|---|---|',
    ...sayTable(draft.say, draft.dontSay),
    '',
    line(
      'עסק שהלקוח מעריץ את השיווק שלו',
      answer(facts, 'q36_inspiration'),
      q('q36_inspiration'),
    ),
    '',
    '---',
    '',
  );

  /* ---- 5 · Marketing today & assets ------------------------------------ */
  push(
    '## 5 · השיווק כיום ונכסים',
    '',
    line(
      'מאיפה מגיעים לקוחות היום',
      answer(facts, 'q12_sources'),
      q('q12_sources'),
    ),
    line(
      'הערוץ הכי אפקטיבי',
      answer(facts, 'q14_best_channel'),
      q('q14_best_channel'),
    ),
    line('מה נוסה בעבר', answer(facts, 'q13_tried'), q('q13_tried')),
    line(
      'נכסים דיגיטליים קיימים',
      answer(facts, 'q30_assets'),
      q('q30_assets'),
    ),
    line(
      'נוכחות דיגיטלית לפי האתר',
      inline(extraction.digitalPresence),
      WEB_TAG,
    ),
    line('אתר שנסרק', input.websiteUrl?.trim() || UNKNOWN, WEB_TAG),
    line(
      'תקציב שיווק קבוע',
      answer(facts, 'q23_has_budget'),
      q('q23_has_budget'),
    ),
    ...branchLine(facts, 'סדר גודל חודשי', 'q24_budget_size'),
    line('פתיחות לשיווק ממומן', answer(facts, 'q26_paid'), q('q26_paid')),
    line(
      'נכונות להשקעה בהינתן ROI',
      answer(facts, 'q25_willing'),
      q('q25_willing'),
    ),
    `- **בסיס מדידה נוכחי (לידים/חודש · שיעור סגירה):** ${UNKNOWN} · לברר מול הלקוח`,
    `- **גישה לנכסים (דומיין, חשבונות פרסום, פיקסל, CRM):** ${UNKNOWN} · לברר מול הלקוח`,
    '',
    '---',
    '',
  );

  /* ---- 6 · Proof ------------------------------------------------------- */
  push(
    '## 6 · הוכחות ונכסים  🟢',
    '',
    '**המלצות וציטוטי לקוחות:**',
    ...bullets(extraction.testimonials, WEB_TAG),
    '',
    '**נכסי הוכחה (מספרים, ותק, לקוחות מוכרים, תעודות):**',
    ...bullets(extraction.proofAssets, WEB_TAG),
    '',
    line('סיפור העסק כפי שמופיע באתר', extraction.story, WEB_TAG),
    '',
    '---',
    '',
  );

  /* ---- 7 · Competitors ------------------------------------------------- */
  push(
    '## 7 · מתחרים',
    '',
    line(
      'המתחרה הכי טוב לדעת הלקוח',
      answer(facts, 'q35_competitor'),
      q('q35_competitor'),
    ),
    line(
      'למה לקוחות בוחרים במתחרים',
      answer(facts, 'q10_competitors'),
      q('q10_competitors'),
    ),
    line('מה עונים כשמשווים אותנו אליהם', draft.competitorResponse, DRAFT_TAG),
    `- **מפת מתחרים מלאה:** ${UNKNOWN} · מחקר נפרד`,
    '',
    '---',
    '',
  );

  /* ---- 8 · Goals & constraints ----------------------------------------- */
  push(
    '## 8 · מטרות, מציאות ומגבלות  🔵',
    '',
    line('מה נחשב הצלחה', answer(facts, 'q16_success'), q('q16_success')),
    line('יעד לחצי שנה', answer(facts, 'q15_sixmonths'), q('q15_sixmonths')),
    line('איכות מול כמות', answer(facts, 'q33_tradeoff'), q('q33_tradeoff')),
    line('מיצוב מול חשיפה', answer(facts, 'q34_brand'), q('q34_brand')),
    line('מה הכי מעכב צמיחה', answer(facts, 'q28_blocker'), q('q28_blocker')),
    line('מה הכי מטריד בשיווק', answer(facts, 'q27_worry'), q('q27_worry')),
    '',
    '**⛔ קווים אדומים — מה לא עושים / אסור להבטיח:**',
    ...bullets(draft.redLines, DRAFT_TAG),
    '',
    `- **קיבולת (כמה לקוחות אפשר לקלוט בחודש):** ${UNKNOWN} · השאלון לא שואל — לברר`,
    `- **עונתיות:** ${UNKNOWN} · לברר מול הלקוח`,
    `- **מגבלות רגולציה / רישוי:** ${UNKNOWN} · לברר מול הלקוח`,
    '',
    '---',
    '',
  );

  /* ---- 9 · Contact ----------------------------------------------------- */
  push(
    '## 9 · פרטי קשר ותפעול',
    '',
    line('איש קשר', facts.contactName, q('contactName')),
    line('טלפון', facts.phone, q('phone')),
    line('אימייל', facts.email, q('email')),
    line('ערוץ מועדף', facts.preferredChannel, q('preferredChannel')),
    line(
      'הערות חופשיות מהלקוח',
      answer(facts, 'q37_anything'),
      q('q37_anything'),
    ),
    '',
    '---',
    '',
  );

  /* ---- 10 · What's still missing --------------------------------------- */
  const unanswered = facts.missing
    .map((id) => Q_FIELD_BY_ID[id])
    .filter((f) => f && f.step <= 10)
    .map((f) => `- ${f.label} · 🔵[${f.step}]`);
  push('## 10 · מה עדיין חסר', '');
  if (unanswered.length === 0) {
    push('כל שאלות השאלון נענו.', '');
  } else {
    push('שאלות בשאלון שלא נענו — כל אחת מהן מופיעה בבריף כ-⟨לא ידוע⟩:', '');
    push(...unanswered, '');
  }
  push(
    'ארבעה שדות שהשאלון לא שואל בכלל ותמיד צריך לברר ידנית: **קיבולת חודשית · קווים אדומים · נכסי הוכחה · מדיניות תשלום וביטול.**',
    '',
    '---',
    '',
    '> התוכנית הרבעונית (קמפיינים, תקציב פעיל, מדדים) נשמרת בנפרד — היא משתנה כל חודש ולא צריכה לזהם את הבריף היציב.',
    '',
    `<!-- הופק אוטומטית · ${input.generatedAt.toISOString()} · מודל: ${input.model ?? 'n/a'} · אתר שנסרק: ${input.websiteUrl ?? 'ללא'} -->`,
  );

  return out.join('\n');
}

/** Pairs the two lists row by row; the shorter one pads with an em dash. */
function sayTable(say: string[], dontSay: string[]): string[] {
  const rows = Math.max(say.length, dontSay.length);
  if (rows === 0) return [`| ${UNKNOWN} | ${UNKNOWN} |`];
  const cell = (v: string | undefined) => (v ? v.replace(/\|/g, '\\|') : '—');
  return Array.from(
    { length: rows },
    (_, i) => `| ${cell(say[i])} | ${cell(dontSay[i])} |`,
  );
}
