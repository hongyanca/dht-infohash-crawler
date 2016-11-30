const dgram = require('dgram');
const events = require('events');
const bencode = require('bencode');
const utils = require('./utils');
const KBucket = require('./kbucket');
const InfohashQueue = require('./infohashqueue');

class DHTCrawler extends events.EventEmitter {
  constructor(options = { address: '0.0.0.0', port: 6881, kbucketSize: 512, name: 'crawler' }) {
    super();
    this.address = options.address;
    this.port = options.port;
    this.name = options.name;
    this.kbucket = new KBucket(options.kbucketSize);
    this.selfId = this.kbucket.selfId;
    this.recentInfohashes = new InfohashQueue(256);

    this.bootstrapNodes = [
      {address: 'router.bittorrent.com', port: 6881},
      {address: 'dht.transmissionbt.com', port: 6881},
      {address: 'router.utorrent.com', port: 6881}];
    this.udp = dgram.createSocket('udp4');

    this.krpcPacketFieldT = utils.generateRandomId().slice(0, 4);
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
      t: this.krpcPacketFieldT,
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
        id: utils.generateNeighborNodeId(req.peerId, this.selfId),
        nodes: utils.encodeNodes(this.kbucket.closestNodes())
      }
    }, peerAddress);
  }

  onKrpcFindNodeResponse (compactNodesInfo) {
    utils.extractCompactNodesInfo(compactNodesInfo)
      .map(node => this.validateNode(node) && this.kbucket.addNode(node));
  }

  joinDHTNetwork () {
    this.bootstrapNodes.map(node => this.krpcFindNodeQuery(this.selfId, node));
  }

  /* 
   * Send KRPC find_node query to all nodes in the kbucket. The queryingNodeId is
   * calculated by using some high bytes of peer node's id, which makes our id close
   * to the peer node XOR wise.
   * After broadcasting, nodes in the kbucket are useless for crawler's sake. Just
   * empty the kbucket for future peer nodes.
   */ 
  broadcastSelf () {
    this.kbucket._nodes.map(node => {
      const queryingNodeId = utils.generateNeighborNodeId(node.id, this.selfId);
      this.krpcFindNodeQuery(queryingNodeId, { address: node.address, port: node.port });
    });
    this.kbucket.empty();
  }

  /*
   * Respond to KRPC get_peers request with closest nodes. It's not necessarily
   * closest here. First 8 nodes or less in the kbucket are sent as response.
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
        id: utils.generateNeighborNodeId(req.infohash, this.selfId),
        // id: utils.generateNeighborNodeId(req.peerId, this.selfId),
        nodes: utils.encodeNodes(this.kbucket.closestNodes()),
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
    const peerAddressToResponse = { address: peerAddress.address, port: peerPort };

    this.sendKRPCQuery({
      t: req.tid,
      y: 'r',
      r: { id: utils.generateNeighborNodeId(req.peerId, this.selfId) }
    }, peerAddressToResponse);

    const infohashString = utils.byteArrayToString(req.infohash);
    if (this.recentInfohashes.enqueue(infohashString)) {
      this.emit('infohash', infohashString, peerAddressToResponse);
    }
  }

  onUDPMessage (data, peerAddress) {
    try {
      let message;
      try {
        message = bencode.decode(data);
      }
      catch (err) {
        // console.log(`Corrupted UDP data, unable to decode.`);
        // console.log(err);
        // return;
      }
      
      /* 
       * It is not in the specification on BitTorrent.org, but GetRight, uTorrent, libtorrent.sf.net,
       * MooPolice, and likely others add an extra key to the DHT messages.
       * Version/Client: "v", it contains a 4 byte string where the two first bytes identifies the 
       * client, in these cases GR, UT, LT, and MP. The two last bytes are binary/text and identify 
       * the version of the client. As a crawler, we can just ignore this message.
       */
      if (message.hasOwnProperty('v') || !message.hasOwnProperty('y')) return;

      if (message.y.toString() === 'r' && message.r.nodes) {
        this.onKrpcFindNodeResponse(message.r.nodes);
        return;
      } 
      
      if (message.y.toString() !== 'q' || !message.hasOwnProperty('q')) return;
      switch(message.q.toString()) {
        case 'get_peers':
          this.onKrpcGetPeersRequest(message, peerAddress);
          break;
        case 'announce_peer':
          this.onKrpcAnnouncePeerRequest(message, peerAddress);
          break;
        case 'find_node':
          this.onKrpcFindNodeRequest(message, peerAddress);
          break;
        default:
          break;
      }
    } 
    catch (err) { 
      // console.error(err);
    }
  }

  listen () {
    this.udp.bind(this.port, this.address);
    this.udp.on('listening', () => console.log(`${this.name} listening on ${this.address}:${this.port}`));
    this.udp.on('message', (data, addr) => this.onUDPMessage(data, addr));
    this.udp.on('error', (err) => {console.log(`UDP error: ${err}`);});
    setInterval(() => {
      console.log(`${this.name} kbucket size: ${this.kbucket.size}`);
      if (this.kbucket.size < 64) this.joinDHTNetwork();
    }, 3000);
    setInterval(() => {      
      this.broadcastSelf();
    }, 1000);
  }

  validateNode (node) {
    return (node.id != this.selfId && node.address != this.address && utils.validatePort(node.port));
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

exports.createCrawler = (options) => {
  const dhtCrawler = new DHTCrawler(options);
  dhtCrawler.listen();
  return dhtCrawler;
}