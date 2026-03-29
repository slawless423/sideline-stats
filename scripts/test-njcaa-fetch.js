/**
 * Quick test - can we fetch a box score URL from CI?
 * node scripts/test-njcaa-fetch.js
 */

const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const TEST_URL = 'https://njcaastats.prestosports.com/sports/mbkb/2025-26/div1/boxscores/20260313_7g0e.xml';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

async function main() {
  console.log(`Fetching: ${TEST_URL}`);
  try {
    const res = await fetch(TEST_URL, { headers: HEADERS });
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    console.log(`Response length: ${text.length} chars`);
    console.log(`First 300 chars:`);
    console.log(text.substring(0, 300));
    if (text.includes('Just a moment')) {
      console.log('\n❌ Cloudflare blocked us');
    } else if (text.includes('TaRea Fulcher') || text.includes('player-name')) {
      console.log('\n✅ Got real box score data!');
    } else {
      console.log('\n⚠ Got a response but content is unexpected');
    }
  } catch (e) {
    console.log(`❌ Error: ${e.message}`);
  }
}

main();
