# dht-infohash-crawler

### Crawl the DHT network for resource infohashes

This module partially implements BEP-5 to listen on DHT network for infohashes. It's based on [dontcontactme](https://github.com/dontcontactme)'s [nodeDHT](https://github.com/dontcontactme/nodeDHT). The [example](https://github.com/homeryan/dht-infohash-crawler/blob/master/example/index.js) code shows how to create multipul crawler instances to boost the crawling speed. After getting infohashes from DHT network peers, [bep9-metadata-dl](https://github.com/homeryan/bep9-metadata-dl) can be used to fetch the metadata. 

## Features

- Simple API
- Find peers from the DHT network
- Node.js event emitter based interface

## Install

```
npm install dht-infohash-crawler
```

## API

### `createCrawler(opts)`
### `crawler.on('infohash', callbackFn(infohash, peerId, peerAddress) {})`

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
