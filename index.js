const DHTCrawler = require('./lib/dhtcrawler');

const crawler = new DHTCrawler();
crawler.on('infohash', (infohash, peerAddress) => console.log(`magnet:?xt=urn:btih:${infohash} from ${peerAddress.address}:${peerAddress.port}`));
crawler.listen();
