define(function() {

  'use strict';
  
  function StructViewFactory() {
  }
  StructViewFactory.prototype = {
    endOffset: 0,
    get bytes() {
      var bytes = new Uint8Array(this.buffer, this.byteOffset, this.byteLength);
      Object.defineProperty(this, 'bytes', {value:bytes, enumerable:false});
      return bytes;
    },
    get dv() {
      var dv = new DataView(this.buffer, this.byteOffset, this.byteLength);
      Object.defineProperty(this, 'dv', {value:dv, enumerable: false});
      return dv;
    },
    createType: function() {
      function StructView(buffer, byteOffset, byteLength) {
        buffer = buffer || new ArrayBuffer(0);
        if (isNaN(byteOffset)) byteOffset = 0;
        if (isNaN(byteLength)) byteLength = buffer.byteLength - byteOffset;
        Object.defineProperties(this, {
          buffer: {value: buffer},
          byteOffset: {value: byteOffset},
          byteLength: {value: byteLength, configurable: true},
        });
      }
      StructView.prototype = Object.create(this);
      return StructView;
    },
    $: function(name, def) {
      if (typeof name === 'number') {
        this.endOffset += name;
        return;
      }
      if (typeof name === 'function') {
        name.apply(this);
        return;
      }
    },
  };
  
  return StructViewFactory;

});
