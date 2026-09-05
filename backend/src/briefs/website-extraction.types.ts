import { UNKNOWN } from './brief-facts';

/** 🟢 Everything the extraction step can pull off the public web. */
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
