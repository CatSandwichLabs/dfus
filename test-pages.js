const https = require('https');
https.get('https://dfus.pages.dev/register', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const match = data.match(/src="(\/assets\/index-[^"]+\.js)"/);
    if (match) {
      https.get('https://dfus.pages.dev' + match[1], (res2) => {
        console.log('JS Status:', res2.statusCode);
      });
    } else {
      console.log('No JS found');
    }
  });
});
