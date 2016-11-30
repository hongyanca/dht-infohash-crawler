const Crawler = require('../lib/dhtcrawler');

const CONSOLE_NC = '\033[0m';
const CONSOLE_RED = '\033[0;31m';
const CONSOLE_BLUE = '\033[0;34m';
const CONSOLE_GREEN = '\033[0;32m';

const crawler1 = Crawler.createCrawler({address: '0.0.0.0', port: 6881, kbucketSize: 256, name: 'crawler1'});
crawler1.on('infohash', (infohash, peerAddress) => 
  console.log(`crawler1 -> ${CONSOLE_GREEN}magnet:?xt=urn:btih:${infohash}${CONSOLE_NC} from ${peerAddress.address}:${peerAddress.port}`));

const crawler2 = Crawler.createCrawler({address: '0.0.0.0', port: 6882, kbucketSize: 256, name: 'crawler2'});
crawler2.on('infohash', (infohash, peerAddress) => 
  console.log(`crawler2 -> ${CONSOLE_BLUE}magnet:?xt=urn:btih:${infohash}${CONSOLE_NC} from ${peerAddress.address}:${peerAddress.port}`));