const { defineConfig } = require('@playwright/test');

const previewPort = process.env.RYUPRO_TEST_PORT || '3047';
const baseURL = `http://127.0.0.1:${previewPort}/ryupro/`;
const use = { browserName: 'chromium', baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' };
const channel = process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? undefined : 'chrome');
if (channel) use.channel = channel;
const webServer = {
  command: 'node server.js --dir _site',
  url: baseURL,
  env: { PORT: previewPort },
  timeout: 60_000,
  reuseExistingServer: false
};

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  use,
  ...(process.env.PLAYWRIGHT_EXTERNAL_SERVER ? {} : { webServer })
});
