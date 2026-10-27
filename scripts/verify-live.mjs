// Read-only checks against a deployed copy of the site. GET and HEAD only.
//
//   node scripts/verify-live.mjs                      the live site
//   node scripts/verify-live.mjs https://<20i preview address>
const base = (process.argv[2] || 'https://www.triffidesu.co.uk').replace(/\/$/, '');
const live = base === 'https://www.triffidesu.co.uk';
let failed = 0;

async function get(path, method = 'GET') {
  const url = path.startsWith('http') ? path : base + path;
  return fetch(url, { method, redirect: 'manual', headers: { 'Accept-Encoding': 'gzip, br' } });
}

function check(ok, what, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failed++;
}

async function expectRedirect(path, target) {
  const res = await get(path, 'HEAD');
  const location = res.headers.get('location') || '';
  check(res.status === 301 && location === target, `${path} -> ${target}`, `${res.status} ${location}`);
}

async function expectStatus(path, status) {
  const res = await get(path, 'HEAD');
  check(res.status === status, `${path} answers ${status}`, String(res.status));
}

const home = await get('/');
const html = await home.text();
check(home.status === 200, 'homepage 200', String(home.status));
check(/default-src 'self'/.test(home.headers.get('content-security-policy') || ''), 'CSP header');
check(/max-age=31536000/.test(home.headers.get('strict-transport-security') || ''), 'HSTS header');
check(/must-revalidate/.test(home.headers.get('cache-control') || ''), 'HTML revalidates', home.headers.get('cache-control'));
check(!/netlify/i.test(html), 'no Netlify references in the page');

const script = html.match(/src="(\/js\/main\.[0-9a-f]+\.js)"/)?.[1];
check(!!script, 'hashed script linked');
if (script) {
  const res = await get(script);
  check(res.status === 200 && /immutable/.test(res.headers.get('cache-control') || ''), 'script cached immutably', res.headers.get('cache-control'));
}

if (live) await expectRedirect('https://triffidesu.co.uk/dofe.html', 'https://www.triffidesu.co.uk/dofe.html');
await expectRedirect('/join', `https://www.triffidesu.co.uk/join.html`);
await expectRedirect('/index.html', 'https://www.triffidesu.co.uk/');
await expectRedirect('/news', 'https://www.triffidesu.co.uk/news/');
await expectStatus('/this-page-does-not-exist', 404);
await expectStatus('/news/2000-01-01-gone.html', 410);
await expectStatus('/server/bootstrap.php', 404);
// 20i's Git deployment keeps .git in the web root; 20i itself refuses it.
for (const path of ['/.git/HEAD', '/.git/config']) {
  const res = await get(path, 'HEAD');
  check(res.status === 403 || res.status === 404, `${path} not served`, String(res.status));
}
await expectStatus('/server/templates/page.html', 404);
await expectStatus('/server/instagram-sync.php', 404);

const calendar = await get('/api/calendar');
check(calendar.status === 200 && (await calendar.text()).includes('BEGIN:VCALENDAR'), 'calendar relay returns iCal', String(calendar.status));

const feedRes = await get('/data/instagram.json');
const feed = feedRes.status === 200 ? await feedRes.json() : null;
check(feed?.posts?.length > 0, 'Instagram feed has posts', String(feedRes.status));
if (feed?.posts?.length) {
  const age = (Date.now() - Date.parse(feed.syncedAt)) / 3600000;
  check(age < 3, 'last sync under 3 hours ago', `${age.toFixed(1)}h`);
  const post = feed.posts[0];
  const page = await get(post.url);
  check(page.status === 200 && (await page.text()).includes('"BlogPosting"'), `news page ${post.url}`, String(page.status));
  const image = await get(post.image.src, 'HEAD');
  check(image.status === 200 && /immutable/.test(image.headers.get('cache-control') || ''), 'post photo served from our domain, cached', `${image.status} ${post.image.src}`);
  await expectStatus('/news/', 200);
  await expectStatus('/sitemap-posts.xml', 200);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
