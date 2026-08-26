import { EMPTY_DRAFT } from './brief-drafter.service';
import { RawAnswers, UNKNOWN, buildFacts } from './brief-facts';
import { renderBrief } from './brief-renderer';
import { detectContradictions } from './contradictions';
import { EMPTY_EXTRACTION } from './website-extraction.types';

const answers: RawAnswers = {
  businessName: 'סטודיו נועה',
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
        { id: 'q1_focus', label: 'במה העסק שלך עוסק?', value: 'עיצוב פנים' },
      ],
    },
    {
      title: 'השיווק שלך כיום',
      items: [
        {
          id: 'q12_sources',
          label: 'מאיפה מגיעים רוב הלקוחות שלך כיום?',
          value: 'המלצות, עדיין אין לקוחות (בהקמה)',
        },
      ],
    },
  ],
};

function render(overrides: Partial<Parameters<typeof renderBrief>[0]> = {}) {
  const facts = buildFacts(answers);
  return renderBrief({
    facts,
    extraction: { ...EMPTY_EXTRACTION },
    draft: { ...EMPTY_DRAFT },
    contradictions: detectContradictions(facts),
    generatedAt: new Date('2026-07-24T09:00:00.000Z'),
    websiteUrl: null,
    model: 'test-model',
    ...overrides,
  });
}

describe('renderBrief', () => {
  it('never emits an empty field — every unknown is explicit', () => {
    const md = render();

    // No "- **label:** · tag" (a value-less line) anywhere.
    expect(md).not.toMatch(/^- \*\*[^*]+:\*\*\s+·/m);
    expect(md).toContain(UNKNOWN);
  });

  it('keeps the questionnaire answers with their step tag', () => {
    const md = render();
    expect(md).toContain('- **תחום:** עיצוב פנים · 🔵[1]');
    expect(md).toContain('- **איש קשר:** נועה כהן · 🔵[10]');
  });

  it('marks every drafted field as a draft awaiting approval', () => {
    const md = render({
      draft: {
        ...EMPTY_DRAFT,
        valueProposition: 'עיצוב פנים לזוגות צעירים',
        toneWords: ['חם', 'ברור', 'מקצועי'],
      },
    });
    expect(md).toContain(
      '- **הצעת ערך במשפט:** עיצוב פנים לזוגות צעירים · 🟠 טיוטה — טעון אישור',
    );
    expect(md).toContain('טיוטה שדורשת אישור אנושי');
  });

  it('surfaces contradictions instead of resolving them', () => {
    const md = render();
    expect(md).toContain('## ⚠️ דורש הכרעה לפני שימוש');
    expect(md).toMatch(/עדיין אין לקוחות/);
    expect(md).toContain('- **סתירות פתוחות:** 1 — ראה למעלה · ⚠️');
  });

  it('lists the questions that were never answered', () => {
    const md = render();
    expect(md).toContain('## 10 · מה עדיין חסר');
    expect(md).toContain('- מה מבחינתך ייחשב הצלחה? · 🔵[7]');
  });

  it('leaves out the questions this business branch was never asked', () => {
    const md = render();
    // A service business never sees the product questions — they must not show
    // up as ⟨לא ידוע⟩ rows or in the "still missing" list.
    expect(md).not.toContain('רכישה חוזרת');
    expect(md).not.toContain('רוב הלקוחות קונים פעם אחת');
    expect(md).toContain('שלב המודעות');
  });

  it('renders all ten sections plus the quick card', () => {
    const md = render();
    for (const heading of [
      '## ⚡ כרטיס מהיר',
      '## 1 · זהות ומיצוב',
      '## 2 · קהלים ופרסונות',
      '## 3 · שירותים, הצעות ומחירים',
      '## 4 · מסרים וטון',
      '## 5 · השיווק כיום ונכסים',
      '## 6 · הוכחות ונכסים',
      '## 7 · מתחרים',
      '## 8 · מטרות, מציאות ומגבלות',
      '## 9 · פרטי קשר ותפעול',
      '## 10 · מה עדיין חסר',
    ]) {
      expect(md).toContain(heading);
    }
  });
});
