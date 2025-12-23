import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.message));

  try {
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
    const content = await page.content();
    console.log('Final HTML length:', content.length);
  } catch (err) {
    console.error('NAVIGATION ERROR:', err.message);
  }

  await browser.close();
})();
