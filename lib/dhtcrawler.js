const dgram = require('dgram');
const events = require('events');
const bencode = require('bencode');
const utils = require('./utils');
const KBucket = require('./kbucket');
const InfohashQueue = require('./infohashqueue');

const DEFAULT_CRAWLER_OPTS = { 
  address: '0.0.0.0',
  port: 6881,
  kbucketSize: 128,
  name: 'crawler'
};

class DHTCrawler extends events.EventEmitter {
  constructor(options) {
    super();
    this._address = options.address;
    this._port = options.port;
    this._name = options.name;
    this._kbucket = new KBucket(options.kbucketSize);
    this._selfId = this._kbucket._selfId;
    this._recentInfohashes = new InfohashQueue(1024);

    this.bootstrapNodes = [
      {address: 'router.bittorrent.com', port: 6881},
      {address: 'dht.transmissionbt.com', port: 6881},
      {address: 'router.utorrent.com', port: 6881}];
    this.udp = dgram.createSocket('udp4');

    this._krpcPacketFieldT = utils.generateRandomId().slice(0, 4);
    this._krpcReqDic = {
      'get_peers': this.onKrpcGetPeersRequest,
      'announce_peer': this.onKrpcAnnouncePeerRequest,
      'find_node': this.onKrpcFindNodeRequest,
      'ping': Function.prototype
    };
  }

  /*
   * The KRPC protocol is a simple RPC mechanism consisting of bencoded dictionaries sent
   * over UDP. A single query packet is sent out and a single packet is sent in response. 
   * There is no retry.
   */
  sendKRPCQuery (message, peerAddress) {
    try {
      const buffer = bencode.encode(message);
      this.udp.send(buffer, 0, buffer.length, peerAddress.port, peerAddress.address);
    }
    catch (err) {}
  }

  /*
   * The KRPC find_node query lets other DHT peer nodes know us. Before having any peer
   * nodes, bootstrap nodes are used to query selfId. Then nodes from find_node responses
   * can be used to fill up the kbucket. Once there are some nodes in the kbucket, further
   * find_node queries can be made by using peer nodes' neighbor id.
   */
  krpcFindNodeQuery (queryingNodeId, peerAddress) {
    this.sendKRPCQuery({
      t: this._krpcPacketFieldT,
      y: 'q',
      q: 'find_node',
      a: { id: queryingNodeId, target: utils.generateRandomId() }
    }, peerAddress);
  }

  onKrpcFindNodeRequest (message, peerAddress) {
    const req = this.extractKRPCQueryInfo(message);
    if (req === null) return;
    this.sendKRPCQuery({
      t: req.tid,
      y: 'r',
      r: { 
        id: utils.generateNeighborNodeId(req.peerId, this._selfId),
        nodes: utils.encodeNodes(this._kbucket.closestNodes())
      }
    }, peerAddress);
  }

  onKrpcFindNodeResponse (compactNodesInfo) {
    utils.extractCompactNodesInfo(compactNodesInfo)
      .map(node => this.validateNode(node) && this._kbucket.addNode(node));
  }

  joinDHTNetwork () {
    this.bootstrapNodes.map(node => this.krpcFindNodeQuery(this._selfId, node));
  }

  /* 
   * Send KRPC find_node query to all nodes in the kbucket. The queryingNodeId is
   * calculated by using some high bytes of peer node's id, which makes our id close
   * to the peer node XOR wise.
   * After broadcasting, nodes in the kbucket are useless for crawler's sake. Just
   * empty the kbucket for future peer nodes.
   */ 
  broadcastSelf () {
    this._kbucket._nodes.map(node => {
      const queryingNodeId = utils.generateNeighborNodeId(node.id, this._selfId);
      this.krpcFindNodeQuery(queryingNodeId, { address: node.address, port: node.port });
    });
    this._kbucket.empty();
  }

  /*
   * First 2 bytes of infohash are used to be the token. If the peer querying for
   * the infohash finds it in the future, it is supposed to send announce_peer to
   * us with the token, which can be used to verify the announce_peer packet.
   * The infohash in the message is not guaranteed to be legit.  
   */
  onKrpcGetPeersRequest (message, peerAddress) {
    const req = this.extractKRPCQueryInfo(message);
    if (req === null) return;
    this.sendKRPCQuery({
      t: req.tid,
      y: 'r',
      r: { 
        id: utils.generateNeighborNodeId(req.infohash, this._selfId),
        // nodes: utils.encodeNodes(this._kbucket.closestNodes()),
        nodes: '',
        token: utils.generateTokenFromInfohash(req.infohash)  
      }
    }, peerAddress);
  }

  onKrpcAnnouncePeerRequest (message, peerAddress) {
    const req = this.extractKRPCQueryInfo(message);
    if (req === null) return;

    /* There is an optional argument called implied_port which value is either 0 or 1.
     * If it is present and non-zero, the port argument should be ignored and the source 
     * port of the UDP packet should be used as the peer's port instead.
     */ 
    const peerPort = (req.implied != undefined && req.implied != 0) ? peerAddress.port : (req.port || 0);
    if (!utils.validatePort(peerPort)) return;
    const peerAddressToRespond = { address: peerAddress.address, port: peerPort };

    this.sendKRPCQuery({
      t: req.tid,
      y: 'r',
      r: { id: utils.generateNeighborNodeId(req.peerId, this._selfId) }
    }, peerAddressToRespond);

    const infohashString = utils.byteArrayToString(req.infohash);
    if (this._recentInfohashes.enqueue(infohashString)) {
      this.emit('infohash', infohashString, utils.byteArrayToString(req.peerId), peerAddressToRespond);
    }
  }

  onUDPMessage (data, peerAddress) {
    try {
      let message;
      try { message = bencode.decode(data); } catch (err) { return; }
      
      /* 
       * It is not in the specification on BitTorrent.org, but BT clients add an extra 
       * key 'v' to the DHT messages, indicating the Version/Client. 
       * See http://getright.com/torrentdev.html As a crawler, we just ignore 'v' key.
       */
      if (!message || message.hasOwnProperty('v') || !message.hasOwnProperty('y')) return;

      const krpcReqString = message.y.toString();
      if (krpcReqString === 'r' && message.r.nodes) {
        this.onKrpcFindNodeResponse(message.r.nodes);
        return;
      } 
      
      if (krpcReqString !== 'q' || !message.hasOwnProperty('q')) return;
      this._krpcReqDic[message.q.toString()].call(this, message, peerAddress);
    } 
    catch (err) { 
      console.error(err);
    }
  }

  listen () {
    this.udp.bind(this._port, this._address);
    this.udp.on('listening', () => console.log(`${this._name} listening on ${this._address}:${this._port}`));
    this.udp.on('message', (data, addr) => this.onUDPMessage(data, addr));
    this.udp.on('error', (err) => {console.error(`UDP error: ${err}`);});
    // 1511 and 2003 are prime numbers.
    setInterval(() => {
      this.joinDHTNetwork();
    }, 2003);
    setInterval(() => {
      this.broadcastSelf();
    }, 1511);
  }

  validateNode (node) {
    return (node.id != this._selfId && node.address != this._address && utils.validatePort(node.port));
  }

  extractKRPCQueryInfo (message) {
    const { t: tid, a } = message;
    if (!tid || !a) return null;
    let { id: peerId, info_hash: infohash, token, target, implied_port: implied, port } = a;
    infohash = a.hasOwnProperty('target') ? a.target : a.info_hash;
    if (!infohash || !peerId || peerId.length != 20 || infohash.length != 20) return null;
    if (!a.hasOwnProperty('port')) return { tid, peerId, infohash };
    if (!token || !utils.validateTokenFromInfohash(token, infohash) || !port) return null;
    return { tid, peerId, infohash, implied, port };
  }
}

module.exports = (options = DEFAULT_CRAWLER_OPTS) => {
  const dhtCrawler = new DHTCrawler(options);
  dhtCrawler.listen();
  return dhtCrawler;
}