const utils = require('./utils');

const DEFAULT_KBUCKET_SIZE = 512;

class KBucket {
  constructor(capacity = DEFAULT_KBUCKET_SIZE) {
    this._selfId = utils.generateRandomId();
    this._nodes = [];
    this._capacity = capacity;
  }

  addNode (node) {
    if (this._nodes.length >= this._capacity || this._nodes.includes(node)) return;
    this._nodes.push(node);
  }

  empty () {
    this._nodes = [];
  }

  get selfId() {
    return this._selfId;
  }

  get size () {
    return this._nodes.length;
  }

  get capacity () {
    return this._capacity;
  }

  get nodes () {
    return this._nodes;
  }

  closestNodes () {
    const silceLocation = this._nodes.length >= 8 ? 8 : this._nodes.length;
    return this._nodes.slice(0, silceLocation);
  } 
};

module.exports = KBucket;