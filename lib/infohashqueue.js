const DEFAULT_QUEUE_SIZE = 256;

class InfohashQueue {
  constructor(capacity = DEFAULT_QUEUE_SIZE) {
    this.infohashes = [];
    this.capacity = capacity;
  }

  enqueue (infohashString) {
    if (this.infohashes.includes(infohashString)) return false;
    if (this.infohashes.length >= this.capacity) this.infohashes.shift();
    this.infohashes.push(infohashString);
    return true;
  }
}

module.exports = function (capacity) { return new InfohashQueue(capacity); }