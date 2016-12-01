const crypto = require('crypto');

exports.generateRandomId = () => crypto.createHash('sha1').update(crypto.randomBytes(20)).digest();
exports.generateTokenFromInfohash = (infohash) => infohash.slice(0, 2);
exports.validateTokenFromInfohash = (token, infohash) => token.toString('hex') === infohash.slice(0, 2).toString('hex');
exports.validatePort = (port) => (port > 0 && port < 65535);

/*
 * http://www.bittorrent.org/beps/bep_0005.html
 * Contact Encoding
 * Contact information for peers is encoded as a 6-byte string. Also known as "Compact IP-address/port
 * info" the 4-byte IP address is in network byte order with the 2 byte port in network byte order 
 * concatenated onto the end.
 * Contact information for nodes is encoded as a 26-byte string. Also known as "Compact node info" 
 * the 20-byte Node ID in network byte order has the compact IP-address/port info concatenated to the end.
 */
exports.extractCompactNodesInfo = cptNodeInfo => {
  const nodeList = [];
  for (let i = 0; i + 26 <= cptNodeInfo.length; i += 26) {
    nodeList.push({
      id: cptNodeInfo.slice(i, i + 20),
      address: `${cptNodeInfo[i + 20]}.${cptNodeInfo[i + 21]}.${cptNodeInfo[i + 22]}.${cptNodeInfo[i + 23]}`,
      port: cptNodeInfo.readUInt16BE(i + 24)
    })
  }
  return nodeList;
};

// Returns a random integer between min (included) and max (excluded)
const getRandomInt = (min, max) => {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min;
}
exports.generateNeighborNodeId = (targetId, id) => {
  // const sliceLocation = getRandomInt(8, 11);
  const sliceLocation = 10;
  return Buffer.concat([targetId.slice(0, sliceLocation), id.slice(sliceLocation)], 20);
};

const encodeIpAddress = ip => Buffer.from(ip.split('.').map(i => parseInt(i)));
const encodePort = port => {
  const buffer = Buffer.allocUnsafe(2);
  buffer.writeUInt16BE(port, 0);
  return buffer;
}
exports.encodeNodes = nodes => Buffer.concat(
  nodes.map((node) => Buffer.concat([node.id, encodeIpAddress(node.address), encodePort(node.port)])));

exports.byteArrayToString = uint8arr => Buffer.from(uint8arr).toString('hex');