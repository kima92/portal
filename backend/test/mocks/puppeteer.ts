// Jest can't parse puppeteer's ESM entry point; the unit tests only need
// website-extractor.service.ts to import-compile, never to actually launch a
// browser, so a no-op stub is sufficient for the test suite.
export function launch(): never {
  throw new Error('puppeteer is stubbed out in tests');
}
