const createCrawler = require('../lib/dhtcrawler');
const InfohashQueue = require('../lib/infohashqueue');
const recentInfohashes = new InfohashQueue(1024);

const CONSOLE_NC = '\033[0m';
// const CONSOLE_RED = '\033[0;31m';
const CONSOLE_GREEN = '\033[0;32m';
const CONSOLE_BROWN = '\033[0;33m';
const CONSOLE_BLUE = '\033[0;34m';
const CONSOLE_PURPLE = '\033[0;35m';
const CONSOLE_CYAN = '\033[0;36m';
const COLORS = [CONSOLE_GREEN, CONSOLE_BROWN, CONSOLE_BLUE, CONSOLE_PURPLE, CONSOLE_CYAN];

let crawlerCounter = 0;
const BASE_PORT = 6881;
const KBUCKET_SIZE = 128;

startCrawl(2);

function startCrawl(numOfCrawlers) {
  const noc = numOfCrawlers >= 5 ? 5 : numOfCrawlers;
  const crawlers = [];
  for (let index = 0; index < noc; ++index) {
    let crawler = createCrawler({
      address: '0.0.0.0',
      port: BASE_PORT + index, 
      kbucketSize: KBUCKET_SIZE,
      name: `crawler-${index+1}`});

    crawler.on('infohash', (infohash, peerId, peerAddress) => {
      if (!recentInfohashes.enqueue(infohash)) return;
      console.log(`${COLORS[index]}magnet:?xt=urn:btih:${infohash}${CONSOLE_NC} peerId: ${peerId} ` + 
        `[${++crawlerCounter}] from ${peerAddress.address}:${peerAddress.port}`);
    });
    crawlers.push(crawler);
  }
}