const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  
  await page.goto('https://dfus.pages.dev/register', { waitUntil: 'networkidle0' });
  
  const content = await page.content();
  console.log('HTML Length:', content.length);
  
  await page.screenshot({ path: 'test-screenshot.png' });
  
  await browser.close();
})();
