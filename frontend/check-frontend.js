const fetch = require('node-fetch');

fetch('https://dfus.pages.dev/register').then(r => r.text()).then(t => {
  const match = t.match(/src=\"(\/assets\/index-[^\"]*\.js)\"/);
  if (match) {
    const jsUrl = 'https://dfus.pages.dev' + match[1];
    fetch(jsUrl).then(r => r.text()).then(js => {
      if (js.includes('typeof data.error===')) {
        console.log('FRONTEND IS UPDATED!');
      } else if (js.includes('typeof data.error ===')) {
        console.log('FRONTEND IS UPDATED!');
      } else {
        console.log('FRONTEND IS NOT UPDATED YET');
      }
    });
  } else {
    console.log('No JS bundle found');
  }
});
