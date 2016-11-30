const dgram = require('dgram');
const events = require('events');
const bencode = require('bencode');
// const co = require('co');
const utils = require('./utils');
const KBucket = require('./kbucket');

class DHTCrawler extends events.EventEmitter {
  constructor(options = {address: '0.0.0.0', port: 6881, kbucketSize: 200}) {
    super();
    this.address = options.address;
    this.port = options.port;

    this.bootstrapNodes = [
      {address: 'router.bittorrent.com', port: 6881},
      {address: 'dht.transmissionbt.com', port: 6881},
      {address: 'router.utorrent.com', port: 6881}];

    this.kbucket = new KBucket(options.kbucketSize);
    this.selfId = this.kbucket.selfId;
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
    // console.log(`send find_node query to ${peerAddress.address}:${peerAddress.port}`);
  }

  onKrpcFindNodeRequest (message, peerAddress) {
    const req = this.extractFindNodeReqInfo(message);
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
   * to the peer node XOR wise. It waits 20ms between each query.
   * After broadcasting, nodes in the kbucket are useless for crawler's sake. Just
   * empty the kbucket for future peer nodes.
   */ 
  broadcastSelf () {
    this.kbucket.nodes.map(node => {
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
    const req = this.extractGetPeersReqInfo(message);
    if (req === null) return;
    this.sendKRPCQuery({
      t: req.tid,
      y: 'r',
      r: { 
        // id: utils.generateNeighborNodeId(req.infohash, this.selfId),
        id: utils.generateNeighborNodeId(req.peerId, this.selfId),
        nodes: utils.encodeNodes(this.kbucket.closestNodes()),
        token: utils.generateTokenFromInfohash(req.infohash)  
      }
    }, peerAddress);
  }

  onKrpcAnnouncePeerRequest (message, peerAddress) {
    const req = this.extractAnnouncePeerReqInfo(message);
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

    this.emit('infohash', utils.byteArrayToString(req.infohash), peerAddressToResponse);
  }

  onUDPMessage (data, peerAddress) {
    try {
      // const message = bencode.decode(data);
      let message;
      try {
        message = bencode.decode(data);
      }
      catch (err) {
        console.log(`Corrupted UPD data, unable to decode.`);
        console.log(err);
      }
      
      if (message.y.toString() === 'r' && message.r.nodes) {
        this.onKrpcFindNodeResponse(message.r.nodes);
        return;
      } 
      
      if (message.y.toString() !== 'q') return;

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
    catch (e) { console.log(e); }
  }

  listen () {
    this.udp.bind(this.port, this.address);
    this.udp.on('listening', () => console.log(`Crawler listening on ${this.address}:${this.port}`));
    this.udp.on('message', (data, addr) => this.onUDPMessage(data, addr));
    this.udp.on('error', (err) => {console.log(`UDP error: ${err}`);});
    setInterval(() => {
      console.log(`kbucket size: ${this.kbucket.size()}`);
      if (this.kbucket.size() < 32) this.joinDHTNetwork();
      this.broadcastSelf();
    }, 3000);
  }

  validateNode (node) {
    return (node.id != this.selfId && node.address != this.address && utils.validatePort(node.port));
  }

  extractFindNodeReqInfo (message) {
    const { t: tid, a: { id: peerId, target: infohash } } = message;
    if (!tid || !infohash || !peerId || peerId.length != 20 || infohash.length != 20) return null;
    return { tid, peerId, infohash };
  }

  extractGetPeersReqInfo (message) {
    const { t: tid, a: { id: peerId, info_hash: infohash } } = message;
    if (!tid || !infohash || !peerId || peerId.length != 20 || infohash.length != 20) return null;
    return { tid, peerId, infohash };
  }

  extractAnnouncePeerReqInfo (message, peerAddress) {
    const { t: tid, a: { info_hash: infohash, token, id: peerId, implied_port: implied, port } } = message;
    if (!tid || !peerId || peerId.length != 20 || !infohash || infohash.length != 20 || 
      !token || !utils.validateTokenFromInfohash(token, infohash) || !port) return null;
    return { tid, peerId, infohash, implied, port };
  }
}

module.exports = DHTCrawler;