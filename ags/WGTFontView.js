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
    get glyphCount() {
      return (this.dv.byteLength - this.addressesOffset) / 2;
    },
    get glyphs() {
      var list = new Array(this.glyphCount);
      var offset = this.addressesOffset;
      var buffer = this.dv.buffer;
      var byteLength = this.dv.byteLength;
      for (var i = 0; i < list.length; i++) {
        var glyphOffset = this.dv.getUint16(offset + i*2, true);
        list[i] = new WGTGlyphView(buffer, glyphOffset, byteLength - glyphOffset);
      }
      Object.defineProperty(this, 'glyphs', {value:list});
      return list;
    },
    getTextWidth: function(str) {
      var w = 0;
      for (var i = 0; i < str.length; i++) {
        var glyph = this.glyphs[str.charCodeAt(i)];
        if (glyph) w += glyph.width;
      }
      return w;
    },
    get lineHeight() {
      var h = 0;
      for (var i = 0; i < this.glyphs.length; i++) {
        h = Math.max(h, this.glyphs[i].height);
      }
      Object.defineProperty(this, 'lineHeight', {value:h});
      return h;
    },
    getAllImageData: function(ctx2d) {
      var chars = new Array(256);
      var empty = ctx.createImageData(1, 1);
      for (var i = 0; i < 256; i++) {
        var glyph = this.glyphs[i];
        chars[i] = glyph ? glyph.createImageData(ctx2d) : empty;
      }
      return chars;
    },
    put: function(ctx2d, str, px, py, rgba) {
      var tw = this.getTextWidth(str), th = this.lineHeight;
      var pixels = ctx2d.getImageData(px, py, tw, th);
      var asU32 = new Uint32Array(pixels.data.buffer, pixels.data.byteOffset, pixels.data.length/4);
      var tx = 0;
      for (var i = 0; i < str.length; i++) {
        var glyph = this.glyphs[str.charCodeAt(i)];
        if (!glyph) continue;
        var gw = glyph.width, gh = glyph.height;
        var gstride = Math.ceil(gw / 8);
        var bitplanes = glyph.getBitplanes();
        for (var gy = 0; gy < gh; gy++) {
          for (var gx = 0; gx < gw; gx++) {
            var byte = bitplanes[gy*gstride + (gx >> 3)];
            if (byte & (0x80 >>> (gx & 7))) {
              asU32[gy*tw + tx + gx] = rgba;
            }
          }
        }
        tx += gw;
      }
      ctx2d.putImageData(pixels, px, py);
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
