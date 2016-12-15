const DEFAULT_QUEUE_SIZE = 1024;

class InfohashQueue {
  constructor(capacity = DEFAULT_QUEUE_SIZE) {
    this._infohashes = {};
    // Create 16 arrays corresponding to the first character of the infohash string.
    ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f']
      .map(hexDigit => this._infohashes[hexDigit] = []);
    this._capacity = Math.floor((capacity + 15)/ 16);
  }

  enqueue (infohashString) {
    const queue = this._infohashes[infohashString[0]];
    if (queue.includes(infohashString)) return false;
    if (queue.length >= this._capacity) queue.shift();
    queue.push(infohashString);
    return true;
  }
}

module.exports = function (capacity) { return new InfohashQueue(capacity); }