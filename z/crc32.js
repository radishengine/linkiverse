define(['wasm/load!./crc32'], function(module) {

  'use strict';

  var memory = {
    main: new WebAssembly.Memory({initial:1}),
    'crc32Tables*': 0,
  };
  var gotInstance = WebAssembly.instantiate(module, {memory:memory})
  .then(function(instance) {
    for (var k in instance.exports) {
      if (/(^sizeof )|(\*$)/.test(k)) {
        var v = instance.exports[v];
        if (typeof v === 'function') v = v();
        memory[k] = v;
      }
    }
    memory['free*'] = memory['crc32Tables*'] + memory['sizeof crc32Tables'];
    return instance;
  });
  
  function crc32(blob) {
    return gotInstance.then(function(instance) {
      var crc = instance.exports.initialValue;
      var pos = 0;
      function nextSlice() {
        return new Promise(function(resolve, reject) {
          var sliceSize = Math.min(blob.size - pos, (1024*1024) - memory['free*']);
          var fr = new FileReader;
          fr.onload = function() {
            resolve(new Uint8Array(this.result));
          };
          fr.onerror = function() {
            reject(this.error);
          };
          if (sliceSize === blob.size) fr.readAsArrayBuffer(blob);
          else fr.readAsArrayBuffer(blob.slice(pos, pos + sliceSize));
        });
      }
      function onSlice(buf) {
        var again;
        if ((pos += buf.length) < blob.size) again = nextSlice().then(onSlice);
        var ptr = memory['free*'];
        var endPtr = ptr + buf.length;
        var pageDiff = Math.ceil((endPtr - memory.main.buffer.byteLength)/65536);
        if (pageDiff > 0) {
          memory.main.grow(pageDiff);
        }
        new Uint8Array(memory.main.buffer, ptr, buf.length).set(buf);
        crc = instance.exports.crc32(crc, ptr, endPtr);
        return again || ('00000000' + (crc >>> 0).toString(16).toLowerCase()).slice(-8);
      }
      return nextSlice().then(onSlice);
    });
  }
  
  return {crc32:crc32};
});
