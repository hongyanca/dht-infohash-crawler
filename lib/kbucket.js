const utils = require('./utils');

const DEFAULT_KBUCKET_SIZE = 200;

class KBucket {
  constructor(capacity = DEFAULT_KBUCKET_SIZE) {
    this.selfId = utils.generateRandomId();
    this.nodes = [];
    this.capacity = capacity;
  }

  addNode (node) {
    if (this.nodes.length >= this.capacity || this.nodes.indexOf(node) > -1) return;
    this.nodes.push(node);
  }

  empty () {
    this.nodes = [];
  }

  size () {
    return this.nodes.length;
  }

  closestNodes () {
    const silceLocation = this.nodes.length >= 8 ? 8 : this.nodes.length;
    return this.nodes.slice(0, silceLocation);
  } 
};

module.exports = KBucket;