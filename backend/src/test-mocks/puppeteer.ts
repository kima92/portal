// Test-only stub. Jest/ts-jest can't transform puppeteer's ESM-only entry
// point, and nothing in the unit test suite actually launches a browser —
// this keeps specs that merely import a puppeteer-adjacent module working.
export type Browser = unknown;
export type Page = unknown;

export function launch(): Promise<never> {
  return Promise.reject(
    new Error('puppeteer is stubbed in tests; do not call launch()'),
  );
}
