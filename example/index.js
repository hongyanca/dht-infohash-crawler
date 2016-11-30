const Crawler = require('../lib/dhtcrawler');

const CONSOLE_NC = '\033[0m';
const CONSOLE_GREEN = '\033[0;32m';
const CONSOLE_BROWN = '\033[0;33m';
const CONSOLE_BLUE = '\033[0;34m';

const crawler1 = Crawler.createCrawler({address: '0.0.0.0', port: 6881, kbucketSize: 384, name: 'crawler1'});
crawler1.on('infohash', (infohash, peerAddress) => 
  console.log(`${CONSOLE_GREEN}magnet:?xt=urn:btih:${infohash}${CONSOLE_NC} from ${peerAddress.address}:${peerAddress.port}`));

const crawler2 = Crawler.createCrawler({address: '0.0.0.0', port: 6882, kbucketSize: 384, name: 'crawler2'});
crawler2.on('infohash', (infohash, peerAddress) => 
  console.log(`${CONSOLE_BROWN}magnet:?xt=urn:btih:${infohash}${CONSOLE_NC} from ${peerAddress.address}:${peerAddress.port}`));

const crawler3 = Crawler.createCrawler({address: '0.0.0.0', port: 6883, kbucketSize: 384, name: 'crawler3'});
crawler3.on('infohash', (infohash, peerAddress) => 
  console.log(`${CONSOLE_BLUE}magnet:?xt=urn:btih:${infohash}${CONSOLE_NC} from ${peerAddress.address}:${peerAddress.port}`));