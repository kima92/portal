import { UNKNOWN } from './brief-facts';

/**
 * 🟢 The shape of the extraction layer's output, kept in its own module on
 * purpose: `website-extractor.service.ts` pulls in `puppeteer`, which is an
 * ESM-only package. Anything that only needs the *type* or the empty value —
 * the renderer, the drafter, their specs — imports from here and never drags
 * a headless browser into the module graph (Jest's CJS runtime can't load it).
 */
export interface WebExtraction {
  /** Pages actually read, for the brief's source note. */
  pages: string[];
  services: string[];
  pricing: string;
  tone: string;
  toneWords: string[];
  testimonials: string[];
  proofAssets: string[];
  digitalPresence: string[];
  story: string;
  processSteps: string[];
  faq: string[];
  customerLanguage: string[];
  geography: string;
  notes: string;
}

export const EMPTY_EXTRACTION: WebExtraction = {
  pages: [],
  services: [],
  pricing: UNKNOWN,
  tone: UNKNOWN,
  toneWords: [],
  testimonials: [],
  proofAssets: [],
  digitalPresence: [],
  story: UNKNOWN,
  processSteps: [],
  faq: [],
  customerLanguage: [],
  geography: UNKNOWN,
  notes: '',
};
