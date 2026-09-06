// Jest mock: `puppeteer` ships ESM-only and Jest's CommonJS transform can't
// parse it. Nothing under `*.spec.ts` actually launches a browser — the real
// package is only reached through website-extractor.service.ts and
// pdf-renderer.service.ts, neither of which is exercised at the unit level —
// so this stub exists purely to let those modules load during tests.
export function launch(): Promise<never> {
  return Promise.reject(
    new Error('puppeteer is mocked in the test environment'),
  );
}
