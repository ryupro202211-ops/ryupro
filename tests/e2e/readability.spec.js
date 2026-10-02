const { test, expect } = require('@playwright/test');

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`article typography and headings fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('blog/posts/2026-09-30-engineer-to-people-work.html');
    const typography = await page.locator('.article-body').evaluate(body => {
      const style = getComputedStyle(body);
      return { size: parseFloat(style.fontSize), weight: style.fontWeight, line: parseFloat(style.lineHeight) };
    });
    expect(typography.size).toBeGreaterThanOrEqual(16);
    expect(typography.size).toBeLessThanOrEqual(18);
    expect(typography.weight).toBe('400');
    expect(typography.line / typography.size).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.article-hero-img img')).toBeVisible();
    await page.screenshot({ path: `test-results/article-${width}.png`, fullPage: true });
    await page.goto('');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const heading of ['#servicesTitle', '#projectsTitle']) {
      await page.locator(heading).scrollIntoViewIfNeeded();
      for (const phrase of await page.locator(`${heading} .heading-phrase`).all()) {
        const fits = await phrase.evaluate(el => {
          const r = el.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(el);
          return r.left >= 0 && r.right <= innerWidth && range.getClientRects().length === 1;
        });
        expect(fits).toBe(true);
      }
      await page.screenshot({ path: `test-results/${heading.slice(1)}-${width}.png` });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
