import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',
  fullyParallel:false,
  workers:1,
  maxFailures:1,
  timeout:45000,
  reporter:'list',
  outputDir:'./work/browser-results',
  use:{baseURL:'http://127.0.0.1:1420',viewport:{width:1440,height:1000},headless:true,
    launchOptions:{...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']},
    trace:'retain-on-failure'},
  webServer:{command:'node scripts/desktop-dev-server.mjs',url:'http://127.0.0.1:1420',reuseExistingServer:!process.env.CI},
});
