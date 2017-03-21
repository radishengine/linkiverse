define(function() {

  'use strict';
  
  function WGTFontView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  WGTFontView.prototype = {
    get signature() {
      return String.fromCharCode.apply(null, this.bytes.subarray(0, 15));
    },
    get hasValidSignature() {
      return this.signature === "WGT Font File  ";
    },
    get addressesOffset() {
      return this.dv.getUint16(15, true);
    },
    get characterCount() {
      return (this.dv.byteLength - this.addressesOffset) / 2;
    },
    get characters() {
      var list = new Array(this.characterCount);
      var offset = this.addressesOffset;
      var buffer = this.dv.buffer;
      var byteLength = this.dv.byteLength;
      for (var i = 0; i < list.length; i++) {
        var glyphOffset = this.dv.getUint16(offset + i*2, true);
        list[i] = new WGTGlyphView(buffer, glyphOffset, byteLength - glyphOffset);
      }
      Object.defineProperty(this, 'characters', {value:list});
      return list;
    },
    getTextWidth: function(str) {
      var w = 0;
      for (var i = 0; i < str.length; i++) {
        var glyph = this.characters[str.charCodeAt(i)];
        if (glyph) w += glyph.width;
      }
      return w;
    },
    get lineHeight() {
      var h = 0;
      for (var i = 0; i < this.characters.length; i++) {
        h = Math.max(h, this.characters[i].height);
      }
      return h;
    },
    getAllImageData: function(ctx2d) {
      var chars = new Array(256);
      var empty = ctx.createImageData(1, 1);
      for (var i = 0; i < 256; i++) {
        var glyph = this.characters[i];
        chars[i] = glyph ? glyph.createImageData(ctx2d) : empty;
      }
      return chars;
    },
  };
  
  function WGTGlyphView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  WGTGlyphView.prototype = {
    get width() {
      return this.dv.getUint16(0, true);
    },
    get height() {
      return this.dv.getUint16(2, true);
    },
    get stride() {
      return Math.ceil(this.width / 8);
    },
    getBitplanes: function() {
      return this.bytes.slice(4, 4 + this.stride * this.height);
    },
    createImageData: function(ctx2d) {
      var stride = this.stride, width = this.width, height = this.height;
      var bitplanes = this.getBitplanes();
      var imageData = ctx2d.createImageData(width, height);
      var asU32 = new Uint32Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength / 4);
      for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
          var byte = bitplanes[y*stride + (x >> 3)];
          if (byte & (0x80 >>> (x & 7))) {
            asU32[y*width + x] = 0xffffffff;
          }
        }
      }
      return imageData;
    },
  };
  
  WGTFontView.GlyphView = WGTGlyphView;
  
  return WGTFontView;

});
