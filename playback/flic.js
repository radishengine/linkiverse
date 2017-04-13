define(function() {

  'use strict';
  
  const BUFFER_SIZE = 64 * 1024;
  
  const LITTLE_ENDIAN = (new Uint16Array(new Uint8Array([1, 0]).buffer)[0] === 1);
  
  const RGB = LITTLE_ENDIAN
  ? function RGB(r, g, b) {
      return (r | (g << 8) | (b << 16) | (0xff << 24)) >>> 0;
    }
  : function RGB(r, g, b) {
      return ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0;
    };
  
  const NO_CHANGES = Object.freeze({
    changes: false,
    apply: function() { return false; },
  });
  
  function bufferedFileRead(file, offset, length) {
    if ('buffer' in file) {
      if (offset >= file.buffer.bufferOffset
      && (offset + length) <= (file.buffer.bufferOffset + file.buffer.byteLength)) {
        return Promise.resolve(file.buffer.subarray(
          offset - file.buffer.bufferOffset,
          offset - file.buffer.bufferOffset + length));
      }
    }
    return new Promise(function(resolve, reject) {
      var fr = new FileReader();
      fr.addEventListener('load', function() {
        var result = new Uint8Array(this.result);
        if (length >= BUFFER_SIZE) {
          resolve(result);
          return;
        }
        result.bufferOffset = offset;
        file.buffer = result;
        resolve(result.subarray(0, length));
      });
      fr.readAsArrayBuffer(file.slice(
        offset,
        Math.min(file.size, offset + Math.max(length, BUFFER_SIZE))
      ));
    });
  }
  
  function FileChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  FileChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get compressionMode() {
      switch (this.chunkTypeCode) {
        case 0xAF30: return 'huffman-or-bwt';
        case 0xAF31: return 'frame-shift';
        default: return null;
      }
    },
    get frameCountInFirstSegment() {
      return this.dv.getUint16(6, true);
    },
    get width() {
      return this.dv.getUint16(8, true);
    },
    get height() {
      return this.dv.getUint16(10, true);
    },
    get bitsPerPixel() {
      return this.dv.getUint16(12, true) || 8;
    },
    get flags() {
      return this.dv.getUint16(14, true);
    },
    get defaultFrameDuration() {
      var value = this.dv.getUint32(16, true);
      return this.chunkTypeCode === 0xAF11 ? (value * 1000)/70 : value; // millisecond conversion
    },
    // 2 reserved bytes
    get createdAt() {
      return dosUtil.getTimeAndDate(this.dv, 22); // FLC only
    },
    get creatorId() {
      return this.dv.getUint32(26, true); // FLC only
    },
    get updatedAt() {
      return dosUtil.getTimeAndDate(this.dv, 30); // FLC only
    },
    get updaterID() {
      return this.dv.getUint32(34, true); // FLC only
    },
    get aspectWidth() {
      return this.dv.getUint16(38, true); // FLC only
    },
    get aspectHeight() {
      return this.dv.getUint16(40, true); // FLC only
    },
    get egiExtensionFlags() {
      return this.dv.getUint16(42, true); // EGI only
    },
    get keyFrameFrequency() {
      return this.dv.getUint16(44, true); // EGI only
    },
    get frameCount() {
      return this.dv.getUint16(46, true); // EGI only
    },
    get maxUncompressedChunkSize() {
      return this.dv.getUint32(48, true); // EGI only
    },
    get maxRegionsInCHK_REGION() {
      return this.dv.getUint16(52, true); // EGI only
    },
    get transparentLevelCount() {
      return this.dv.getUint16(54, true);
    },
    get frameOffset1() {
      return this.dv.getUint32(80, true); // FLC only
    },
    get frameOffset2() {
      return this.dv.getUint32(84, true); // FLC only
    },
    // reserved: 40 bytes
    play: function(canvas, startAt) {
      const self = this,
        bitsPerPixel = this.bitsPerPixel,
        defaultDuration = this.defaultFrameDuration,
        frames = this.frames,
        defaultWidth = this.width, defaultHeight = this.height;
      canvas.width = defaultWidth;
      canvas.height = defaultHeight;
      var i_frame = -1;
      var ctx = canvas.createContext('2d');
      var imageData = ctx.createImageData(defaultWidth, defaultHeight);
      var pixels = new Uint32Array(
        imageData.data.buffer,
        imageData.data.byteOffset,
        imageData.data.byteLength/4);
      var palette, palettePixels;
      if (bitsPerPixel === 8) {
        palette = new Uint32Array(256);
        palettePixels = new Uint8Array(defaultWidth * defaultHeight);
      }
      var nextTime = startAt || performance.now();
      return new Promise(function(resolve, reject) {
        function next() {
          var doAgain = requestAnimationFrame(next);
          var now = performance.now();
          var diff = now - nextTime;
          if (diff < 0) return;
          var frame = frames[++i_frame];
          if (!frame) {
            cancelAnimationFrame(doAgain);
            canvas.dispatchEvent(new CustomEvent('fmv-finished', {detail:{movie:self}}));
            resolve();
            return;
          }
          nextTime += frame.overrideDuration || defaultDuration;
          if (!frame.changes) return;
          if (frame.overrideWidth || frame.overrideHeight) {
            cancelAnimationFrame(doAgain);
            canvas.dispatchEvent(new CustomEvent('fmv-finished', {detail:{movie:self}}));
            reject('NYI: custom frame dimensions');
            return;
          }
          frame.apply(bitsPerPixel, defaultWidth, defaultHeight, pixels, palette, palettePixels);
          ctx.putImageData(imageData, 0, 0);
          canvas.dispatchEvent('fmv-frame', {detail:{movie:self}});
        }
        requestAnimationFrame(next);
      });
    },
  };
  FileChunk.subchunkOffset = 128;

  function PrefixChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  PrefixChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
  };
  
  function FrameChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  FrameChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get subchunkCount() {
      return this.dv.getUint16(6, true);
    },
    get overrideDelay() {
      return this.dv.getUint16(8, true) || false;
    },
    // reserved: 2 bytes
    get overrideWidth() {
      return this.dv.getUint16(12, true) || false;
    },
    get overrideHeight() {
      return this.dv.getUint16(14, true) || false;
    },
    pixels: NO_CHANGES,
    palette: NO_CHANGES,
    get changes() {
      return !!(this.pixels.changes || this.palette.changes);
    },
    apply: function(bpp, width, height, pixels, palette, palettePixels) {
      if (this.palette.apply(bpp, width, height, pixels, palette, palettePixels) && this.pixels.changes !== 'total') {
        for (var i = 0; i < pixels.length; i++) {
          pixels[i] = palette[palettePixels[i]];
        }
      }
      this.pixels.apply(bpp, width, height, pixels, palette, palettePixels);
    },
  };
  FrameChunk.subchunkOffset = 16;
  
  function SegmentTableChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  SegmentTableChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get subchunkCount() {
      return this.dv.getUint16(6, true);
    },
  };
  SegmentTableChunk.subchunkOffset = 8;
  
  function SegmentChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  SegmentChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get labelNumber() {
      return this.dv.getUint16(6, true);
    },
    // reserved: 2 bytes
    get continuedFromImageId() {
      return this.dv.getUint16(10, true);
    },
    get lastImageId() {
      return this.dv.getUint16(12, true);
    },
    get flags() {
      return this.dv.getUint16(14, true);
    },
    get containsRingFrame() {
      return !!(this.flags & 1);
    },
    get firstFrameContainsFullImage() {
      return !!(this.flags & 2);
    },
    get hasNextSegment() {
      return !!(this.flags & 4);
    },
    get hasSynchronizedAudio() {
      return !!(this.flags & 8);
    },
    get frameCount() {
      return this.dv.getUint16(16, true);
    },
    get frame1FileOffset() {
      return this.dv.getUint32(18, true);
    },
    get frame2FileOffset() {
      return this.dv.getUint32(22, true);
    },
    get nextSegment() {
      return this.dv.getUint16(26, true);
    },
    get repeats() {
      return this.dv.getUint16(28, true) || Infinity;
    },
    // reserved: 2 bytes
  };
  SegmentChunk.byteLength = 32;
  
  function CelChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  CelChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get originX() {
      return this.dv.getInt16(6, true);
    },
    get originY() {
      return this.dv.getInt16(8, true);
    },
    get scaleX() {
      return this.dv.getUint16(10, true);
    },
    get scaleY() {
      return this.dv.getUint16(12, true);
    },
    get angleX() {
      return this.dv.getUint16(14, true);
    },
    get angleY() {
      return this.dv.getUint16(16, true);
    },
    get angleZ() {
      return this.dv.getUint16(18, true);
    },
    get currentFrame() {
      return this.dv.getUint16(20, true);
    },
    // reserved: 2 bytes
    get transparentColorIndex() {
      return this.dv.getUint16(24, true);
    },
    get overlays() {
      var list = new Array(16);
      for (var i = 0; i < list.length; i++) {
        list[i] = this.dv.getInt16(26 + i * 2, true);
      }
      Object.defineProperty(this, 'overlays', {value:list, enumerable:true});
      return list;
    },
  };
  CelChunk.byteLength = 64;
  
  function PaletteChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  PaletteChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get isVgaMode() {
      return this.chunkTypeCode === 11;
    },
    get packetCount() {
      return this.dv.getUint16(6, true);
    },
    apply: function(bpp, width, height, pixels, palette, palettePixels) {
      var remainingPackets = this.packetCount;
      if (remainingPackets === 0) return false;
      var bytes = new Uint8Array(this.dv.buffer, this.dv.byteOffset + 8, this.dv.byteLength - 8);
      var pos = 0;
      var lshift, rshift;
      if (this.isVgaMode) {
        lshift = 2; rshift = 4;
      }
      else {
        lshift = 0; rshift = 8;
      }
      var i_col = 0;
      do {
        i_col += bytes[pos++];
        for (var j_col = i_col + bytes[pos++]; i_col < j_col; i_col++) {
          var r = bytes[pos++];
          var g = bytes[pos++];
          var b = bytes[pos++];
          palette[i_col] = RGB(
            (r << lshift) | (r >> rshift),
            (g << lshift) | (g >> rshift),
            (b << lshift) | (b >> rshift));
        }
      } while (--remainingPackets > 0);
      return true;
    },
  };
  
  function ByteDeltaChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  ByteDeltaChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    changes: 'total',
    get topLineY() {
      return this.dv.getUint16(6, true);
    },
    get lineCount() {
      return this.dv.getUint16(8, true);
    },
    apply: function(bpp, width, height, pixels, palette, palettePixels) {
      if (bpp !== 8) throw new Error('NYI');
      var i_out = this.topLineY * width;
      var bytes = new Uint8Array(this.dv.buffer, this.dv.byteOffset + 10, this.dv.byteLength - 10);
      var pos = 0;
      for (var i_line = 0, j_line = this.lineCount; i_line < j_line; i_line++) {
        var packetCount = bytes[pos++];
        var next_i_out = i_out + width;
        while (packetCount-- > 0) {
          i_out += bytes[pos++];
          var count = bytes[pos++] << 24 >> 24;
          if (count < 0) {
            var repPalette = bytes[pos++];
            var repPixel = palette[repPalette];
            do {
              pixels[i_out] = repPixel;
              palettePixels[i_out] = repPalette;
              i_out++;
            } while (++count < 0);
          }
          else if (count > 0) {
            do {
              pixels[i_out] = palette[palettePixels[i_out] = bytes[pos++]];
              i_out++;
            } while (--count > 0);
          }
        }
        i_out = next_i_out;
      }
      return true;
    },
  };
  
  function WordDeltaChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  WordDeltaChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    changes: 'partial',
    get lineCount() {
      return this.dv.getUint16(6, true);
    },
    apply: function(output, stride) {
      var i_out = 0;
      var i = 8;
      for (var left = this.lineCount; left > 0; --left) {
        var packetCount, lastByte = -1;
        opcoding: for (;;) {
          var opcode = this.dv.getInt16(i, true);
          i += 2;
          switch ((opcode >> 14) & 3) {
            case 0:
              packetCount = opcode;
              break opcoding;
            case 1:
              console.error('flic: undefined opcode');
              return;
            case 2:
              lastByte = opcode & 0xff;
              continue opcoding;
            case 3:
              out_i += stride * -opcode;
              continue opcoding;
          }
        }
        var bytes = new Uint8Array(this.dv.buffer, this.dv.byteOffset, this.dv.byteLength);
        var next_i_out = i_out + stride; 
        while (packetCount-- > 0) {
          i_out += bytes[i++] * 2;
          var count = bytes[i++] << 24 >> 24;
          if (count < 0) {
            var rep1 = bytes[i++];
            var rep2 = bytes[i++];
            do {
              output[i_out++] = rep1;
              output[i_out++] = rep2;
            } while (++count < 0);
          }
          else if (count > 0) {
            count <<= 1;
            output.set(bytes.subarray(i, i + count), i_out);
            i_out += count;
            i += count;
          }
        }
        i_out = next_i_out;
        if (lastByte >= 0) output[i_out - 1] = lastByte;
      }
    },
  };
  
  function ClearChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  ClearChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    changes: 'total',
    apply: function(bpp, width, height, pixels, palette, palettePixels) {
      if (bpp === 8) {
        palettePixels.set(new Uint8Array(palettePixels.length));
        const color0 = palette[0];
        for (var i = 0; i < pixels.length; i++) {
          pixels[i] = color0;
        }
      }
      else {
        const color0 = RGB(0, 0, 0);
        for (var i = 0; i < pixels.length; i++) {
          pixels[i] = color0;
        }
      }
      return true;
    },
  };
  ClearChunk.byteLength = 6;
  
  function ByteRunChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  ByteRunChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    changes: 'total',
    apply: function(bpp, width, height, pixels, palette, palettePixels) {
      if (bpp !== 8) throw new Error('NYI');
      if (width < 1) return false;
      var bytes = new Uint8Array(
        this.dv.buffer,
        this.dv.byteOffset + 6,
        this.dv.byteLength - 6);
      var i = 0, i_out = 0;
      while (++i < bytes.length) {
        var next_i_out = i_out + width;
        do {
          var count = bytes[i++] << 24 >> 24;
          if (count < 0) {
            do {
              pixels[i_out] = palette[palettePixels[i_out] = bytes[i++]];
              i_out++;
            } while (++count < 0);
          }
          else if (count > 0) {
            var repPalette = bytes[i++];
            var repPixel = palette[repPalette];
            do {
              palettePixels[i_out] = repPalette;
              pixels[i_out] = repPixel;
              i_out++;
            } while (--count > 0);
          }
        } while (i_out < next_i_out);
      }
      return true;
    },
  };
  
  function UncompressedChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  UncompressedChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    changes: 'total',
    apply: function(output, bpp) {
      if (bpp === 8) {
        output.set(this.bytes);
        return;
      }
    }
  };
  
  function ThumbnailChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  ThumbnailChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get height() {
      return this.dv.getUint16(6, true);
    },
    get width() {
      return this.dv.getUint16(8, true);
    },
    get colorTranslation() {
      return this.dv.getUint16(10, true);
    },
    palette: (function(thumbnailPalette) {
      for (var r = 0; r < 6; r++)
      for (var g = 0; g < 6; g++)
      for (var b = 0; b < 6; b++)
        thumbnailPalette[r*6*6 + g*6 + b] = RGB(r*255/5, g*255/5, b*255/5);
      return thumbnailPalette;
    })(new Uint32Array(256)),
  };
  ThumbnailChunk.subchunkOffset = 12;
  
  function PixelRunChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  PixelRunChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    changes: 'total',
    apply: function(output, bpp, stride) {
      if (stride < 1) return;
      var bytes = new Uint8Array(
        this.dv.buffer,
        this.dv.byteOffset + 6,
        this.dv.byteLength - 6);
      var i = 0, i_out = 0;
      var readPixel;
      if (bpp === 15) {
        readPixel = function() {
          var lo = bytes[i], hi = bytes[i+1];
          i += 2;
          var r = hi >>> 2, g = ((hi & 3) << 3) | (lo >>> 5), b = lo & 0x1F;
          return RGB(
            (r << 3) | (r >> 2),
            (g << 3) | (g >> 2),
            (b << 3) | (b >> 2));
        };
      }
      else if (bpp === 16) {
        readPixel = function() {
          var lo = bytes[i], hi = bytes[i+1];
          i += 2;
          var r = hi >>> 3, g = ((hi & 7) << 3) | (lo >>> 5), b = lo & 0x1F;
          return RGB(
            (r << 3) | (r >> 2),
            (g << 2) | (g >> 4),
            (b << 3) | (b >> 2));
        };
      }
      else if (bpp === 24) {
        readPixel = function() {
          var b = bytes[i], g = bytes[i+1], r = bytes[i+2];
          i += 3;
          return RGB(r, g, b);
        };
      }
      else throw new Error('unsupported bpp: ' + bpp);
      while (++i < bytes.length) {
        var remaining = stride;
        do {
          var count = bytes[i++] << 24 >> 24;
          if (count < 0) {
            do { output[i_out++] = readPixel(); } while (++count < 0);
          }
          else if (count > 0) {
            var rep = readPixel();
            while (count-- > 0) output[i_out++] = rep;
          }
          remaining -= count;
        } while (remaining > 0);
      }
    },
  };
  
  function PixelCopyChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  PixelCopyChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    changes: 'total',
    apply: function(output, bpp, stride) {
      if (stride < 1) return;
      var bytes = new Uint8Array(
        this.dv.buffer,
        this.dv.byteOffset + 6,
        this.dv.byteLength - 6);
      var i = 0, i_out = 0;
      if (bpp === 15) {
        while (i < bytes.length) {
          var lo = bytes[i], hi = bytes[i+1];
          i += 2;
          var r = hi >>> 2, g = ((hi & 3) << 3) | (lo >>> 5), b = lo & 0x1F;
          output[i_out++] = RGB(
            (r << 3) | (r >> 2),
            (g << 3) | (g >> 2),
            (b << 3) | (b >> 2));
        }
      }
      else if (bpp === 16) {
        while (i < bytes.length) {
          var lo = bytes[i], hi = bytes[i+1];
          i += 2;
          var r = hi >>> 3, g = ((hi & 7) << 3) | (lo >>> 5), b = lo & 0x1F;
          output[i_out++] = RGB(
            (r << 3) | (r >> 2),
            (g << 2) | (g >> 4),
            (b << 3) | (b >> 2));
        }
      }
      else if (bpp === 24) {
        while (i < bytes.length) {
          var b = bytes[i], g = bytes[i+1], r = bytes[i+2];
          i += 3;
          output[i_out++] = RGB(r, g, b);
        }
      }
    },
  };
  
  function PixelDeltaChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  PixelDeltaChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    changes: 'partial',
    get lineCount() {
      return this.dv.getUint16(6, true);
    },
    apply: function(output, bpp, stride) {
      if (stride < 1) return;
      var bytes = new Uint8Array(
        this.dv.buffer,
        this.dv.byteOffset + 8,
        this.dv.byteLength - 8);
      var i = 0, i_out = 0;
      var readPixel;
      if (bpp === 15) {
        readPixel = function() {
          var lo = bytes[i], hi = bytes[i+1];
          i += 2;
          var r = hi >>> 2, g = ((hi & 3) << 3) | (lo >>> 5), b = lo & 0x1F;
          return RGB((r << 3) | (r >> 2), (g << 3) | (g >> 2), (b << 3) | (b >> 2));
        };
      }
      else if (bpp === 16) {
        readPixel = function() {
          var lo = bytes[i], hi = bytes[i+1];
          i += 2;
          var r = hi >>> 3, g = ((hi & 7) << 3) | (lo >>> 5), b = lo & 0x1F;
          return RGB((r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2));
        };
      }
      else if (bpp === 24) {
        readPixel = function() {
          var b = bytes[i], g = bytes[i+1], r = bytes[i+2];
          i += 3;
          return RGB(r, g, b);
        };
      }
      else throw new Error('unsupported bpp: ' + bpp);
      var remaining = this.lineCount;
      while (remaining > 0) {
        var packets = this.dv.getInt16(i, true);
        i += 2;
        if (packets < 0) {
          out_i += stride * -packets;
          continue; // without remaining--
        }
        var next_i_out = i_out + stride;
        while (packets-- > 0) {
          var count = bytes[i++] << 24 >> 24;
          if (count < 0) {
            var rep = readPixel();
            do { output[i_out++] = rep; } while (++count < 0);
          }
          else {
            while (count-- > 0) {
              output[i_out++] = readPixel();
            }
          }
        }
        i_out = next_i_out;
        remaining--;
      }
    },
  };
  
  function LabelChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  LabelChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get userValue() {
      return this.dv.getUint16(6, true);
    },
    // reserved: 2 bytes
    get text() {
      if (this.chunkTypeCode !== 41) return null;
      return String.fromCharCode.apply(null, this.bytes.subarray(10)).replace(/\0$/, '');
    },
  };
  
  function MaskChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  MaskChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get bitsPerPixel() {
      return (this.chunkTypeCode === 0x0020) ? 1 : 8;
    },
    get x() {
      return this.dv.getInt16(6, true);
    },
    get y() {
      return this.dv.getInt16(8, true);
    },
    get width() {
      return this.dv.getUint16(10, true);
    },
    get height() {
      return this.dv.getUint16(12, true);
    },
    apply: function(output, stride) {
      throw new Error('NYI');
    },
  };
  
  function KeyImageChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  KeyImageChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    changes: 'total',
    apply: function(output, bpp, stride) {
      if (bpp === 8) return ByteRunChunk.prototype.apply.call(this, output, stride);
      return PixelRunChunk.prototype.apply.call(this, output, bpp, stride);
    },
  };
  
  function DirtyRectsChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  DirtyRectsChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get rectCount() {
      return this.dv.getUint16(6, true);
    },
    getRect: function(n) {
      return {
        x: this.dv.getUint16(8 + n*8, true),
        y: this.dv.getUint16(8 + n*8 + 2, true),
        width: this.dv.getUint16(8 + n*8 + 4, true),
        height: this.dv.getUint16(8 + n*8 + 6, true),
      };
    },
  };
  
  function AudioChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  AudioChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get flags() {
      return this.dv.getUint16(6, true);
    },
    get bytesPerSample() {
      return this.flags & 1 ? 16 : 8;
    },
    get isSigned() {
      return !!(this.flags & 2);
    },
    get isStereo() {
      return !!(this.flags & 4);
    },
    get isFirstBlock() {
      return !!(this.flags & 8);
    },
    get isLastBlock() {
      return !!(this.flags & 16);
    },
    get sampleFrequency() {
      return this.dv.getUint16(8, true);
    },
    get sampleOverlap() {
      return this.dv.getUint32(10, true);
    },
    // reserved: 6 bytes
    createBufferSource: function(audioContext) {
      var channels = new Array(this.isStereo ? 2 : 1);
      var sampleCount = (this.byteLength - 20) / (channels.length * this.bytesPerSample);
      var buffer = audioContext.createBuffer(channels.length, sampleCount, this.sampleFrequency);
      for (var i = 0; i < channels.length; i++) {
        channels[i] = new Float32Array(sampleCount);
      }
      if (this.bytesPerSample === 16) {
        if (this.isSigned) {
          for (var j = 0; j < channels.length; j++)
          for (var i = 0; i < sampleCount; i++)
            channels[j][i] = this.dv.getInt16(20 + (i*j + j) * 2, true) / 32768;
        }
        else {
          for (var j = 0; j < channels.length; j++)
          for (var i = 0; i < sampleCount; i++)
            channels[j][i] = (this.dv.getUint16(20 + (i*j + j) * 2, true) - 32768) / 32768;
        }
      }
      else {
        if (this.isSigned) {
          var data = new Int8Array(
            this.dv.buffer,
            this.dv.byteOffset + 20,
            this.dv.byteLength - 20);
          for (var j = 0; j < channels.length; j++)
          for (var i = 0; i < sampleCount; i++)
            channels[j][i] = data[i*j + j] / 128;
        }
        else {
          var data = new Uint8Array(
            this.dv.buffer,
            this.dv.byteOffset + 20,
            this.dv.byteLength - 20);
          for (var j = 0; j < channels.length; j++)
          for (var i = 0; i < sampleCount; i++)
            channels[j][i] = (data[i*j + j] - 128) / 128;
        }
      }
      for (var i = 0; i < channels.length; i++) {
        buffer.copyToChannel(channels[i], i);
      }
      buffer.overlapDuration = this.overlapSamples / this.sampleFrequency;
      return buffer;
    },
  };
  
  function TextChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  TextChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get text() {
      return String.fromCharCode.apply(null, this.bytes.subarray(6)).replace(/\0.*/, '');
    },
  };
  
  function FrameShiftChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  FrameShiftChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get forWhat() {
      return this.bytes[6] ? 'mask' : 'image';
    },
    // reserved: 1 byte (unused flags)
    get priorityListByteLength() {
      return this.dv.getUint16(8, true);
    },
    get verticalShiftList() {
      throw new Error('NYI');
    },
    get horizontalShiftList() {
      throw new Error('NYI');
    },
    get priorityList() {
      throw new Error('NYI');
    },
  };
  
  function PathMapChunk(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.stride = Math.sqrt(this.byteLength - 6);
  }
  PathMapChunk.prototype = {
    get byteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    getPath: function(fromSegment, toSegment) {
      return this.dv.getInt16(fromSegment * this.stride + toSegment * 2, true);
    },
  };
  
  var chunkTypes = [
    {id:0xAF11, name:'file', TChunk:FileChunk},
    {id:0xAF12, name:'file', TChunk:FileChunk},
    {id:0xAF44, name:'file', TChunk:FileChunk},
    {id:0xAF30, name:'file', TChunk:FileChunk},
    {id:0xAF31, name:'file', TChunk:FileChunk},
    {id:0xF100, name:'prefix', TChunk:PrefixChunk}, // TODO: CEL files, EGI files
    {id:0xF1FA, name:'frames[]', TChunk:FrameChunk},
    {id:0xF1FB, name:'segments[]', TChunk:SegmentTableChunk},
    {id:0x0003, name:'cel', TChunk:CelChunk},
    {id:0x0004, name:'palette', TChunk:PaletteChunk},
    {id:0x0007, name:'pixels', TChunk:WordDeltaChunk},
    {id:0x000B, name:'palette', TChunk:PaletteChunk},
    {id:0x000C, name:'pixels', TChunk:ByteDeltaChunk},
    {id:0x000D, name:'pixels', TChunk:EmptyChunk},
    {id:0x000F, name:'pixels', TChunk:ByteRunChunk},
    {id:0x0010, name:'pixels', TChunk:UncompressedChunk},
    {id:0x0012, name:'thumbnail', TChunk:ThumbnailChunk},
    {id:0x0019, name:'pixels', TChunk:PixelRunChunk},
    {id:0x001A, name:'pixels', TChunk:PixelCopyChunk},
    {id:0x001B, name:'pixels', TChunk:PixelDeltaChunk},
    {id:0x001F, name:'label', TChunk:LabelChunk},
    {id:0x0020, name:'mask', TChunk:MaskChunk},
    {id:0x0021, name:'mask', TChunk:MaskChunk},
    {id:0x0022, name:'segment', TChunk:SegmentChunk},
    {id:0x0023, name:'pixels', TChunk:KeyImageChunk},
    {id:0x0024, name:'palette', TChunk:PaletteChunk},
    {id:0x0025, name:'dirtyRects', TChunk:DirtyRectsChunk},
    {id:0x0026, name:'audio', TChunk:AudioChunk},
    {id:0x0027, name:'text', TChunk:TextChunk},
    {id:0x0028, name:'mask', TChunk:MaskChunk},
    {id:0x0029, name:'label', TChunk:LabelChunk},
    {id:0x002A, name:'frameShift', TChunk:FrameShiftChunk},
    {id:0x002B, name:'pathMap', TChunk:PathMapChunk},
  ];
  
  var chunkTypesById = {};
  chunkTypes.forEach(function(ct){ chunkTypesById[ct.id] = ct; });
  
  return {
    open: function(file) {
      function nextChunk(stream, offset, endOffset) {
        if (offset >= endOffset) return stream;
        return bufferedFileRead(file, offset, 6)
        .then(function(raw) {
          var dv = new DataView(raw.buffer, raw.byteOffset, 6);
          var length = dv.getUint32(0, true);
          var typeCode = dv.getUint16(4, true);
          var addTo, addAt;
          if (typeCode in chunkTypesById) {
            var chunkType = chunkTypesById[typeCode];
            if (chunkType.name.slice(-2) === '[]') {
              var arrayName = chunkType.name.slice(0, -2);
              addTo = arrayName in stream ? stream[arrayName] : stream[arrayName] = [];
              addAt = addTo.length++;
            }
            else {
              addTo = stream;
              addAt = chunkType.name;
            }
            if ('subchunkOffset' in chunkType.TChunk) {
              return chunkStream(offset, offset + length, chunkType.TChunk)
              .then(function(subchunk) {
                if (subchunk instanceof FrameChunk
                && !subchunk.changes
                && !subchunk.overrideDuration) {
                  subchunk = NO_CHANGES;
                }
                addTo[addAt] = subchunk;
                return nextChunk(stream, offset + length, endOffset);
              });
            }
            return bufferedFileRead(file, offset, length)
            .then(function(raw) {
              addTo[addAt] = new chunkType.TChunk(raw.buffer, raw.byteOffset, raw.byteLength);
              return nextChunk(stream, offset + length, endOffset);
            });
          }
          stream.unknown = stream.unknown || [];
          return bufferedFileRead(file, offset, length)
          .then(function(raw) {
            raw.chunkTypeCode = typeCode;
            stream.unknown.push(raw);
            return nextChunk(stream, offset + length, endOffset);
          });
        });
      }
      function chunkStream(offset, endOffset, TContainerChunk) {
        return bufferedFileRead(file, offset, TContainerChunk.subchunkOffset)
        .then(function(raw) {
          var container = new TContainerChunk(
            raw.buffer,
            raw.byteOffset,
            raw.byteLength);
          return nextChunk(
            container,
            offset + TContainerChunk.subchunkOffset,
            offset + container.byteLength);
        });
      }
      return chunkStream(0, file.size, FileChunk);
    },
  };

});
