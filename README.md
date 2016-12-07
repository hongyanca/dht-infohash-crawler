# dht-infohash-crawler

### Crawl the DHT network for resource infohashes

This module  

## features

- Simple API
- Find peers from the DHT network
- Node.js event emitter based interface

## install

```
npm install dht-infohash-crawler
```

## API

### `createCrawler(opts)`

Options are:
```js
{ 
  address: '0.0.0.0',     // Listening address, (default='0.0.0.0') 
  port: 6881,             // Listening port (default=6881)
  kbucketSize: 128,       // Size of kbucket (default=128)
  name: 'crawler'         // Crawler name (default='crawler')
}
```

### Example:
```js
const createCrawler = require('dht-infohash-crawler');

const crawler = createCrawler();
crawler.on('infohash', (infohash, peerId, peerAddress) => {
  console.log(`magnet:?xt=urn:btih:${infohash} peerId: ${peerId} ` + 
    `from ${peerAddress.address}:${peerAddress.port}`);
  }
);
```

## License

MIT © [Hong Yan](https://github.com/homeryan).
