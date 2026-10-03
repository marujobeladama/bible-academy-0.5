import { defineConfig, devices } from '@playwright/test';

const ci = Boolean(process.env.CI);
const port = ci ? 3100 : 3000;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 2 : 0,
  workers: ci ? 1 : undefined,
  reporter: ci ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: ci
    ? [
        {
          command: 'node tests/e2e/mock-supabase.mjs',
          url: 'http://127.0.0.1:54321/health',
          timeout: 15000,
        },
        {
          command: 'npm run dev -- --hostname 127.0.0.1 --port 3100',
          url: `${baseURL}/login`,
          timeout: 120000,
          env: {
            NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'e2e-test-publishable-key',
            SUPABASE_SERVICE_ROLE_KEY: 'e2e-test-service-role-key',
            NEXT_PUBLIC_APP_URL: baseURL,
            PAYMENT_GATEWAY_PROVIDER: '',
            MERCADOPAGO_ACCESS_TOKEN: '',
            MERCADOPAGO_WEBHOOK_SECRET: '',
          },
        },
      ]
    : {
        command: 'npm run dev -- --hostname 127.0.0.1 --port 3000',
        url: `${baseURL}/login`,
        reuseExistingServer: true,
        timeout: 120000,
      },
});