define(function() {

  'use strict';
  
  const BUFFER_SIZE = 64 * 1024;
  
  const LITTLE_ENDIAN = (new Uint16Array(new Uint8Array([1, 0]).buffer)[0] === 1);
  
  const RGB = LITTLE_ENDIAN
    ? function(r,g,b) {
        return (r | (g << 8) | (b << 16) | (0xff << 24)) >>> 0;
      }
    : function(r,g,b) {
        return ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0;
      };
  
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
  
  function FileHeaderView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  FileHeaderView.prototype = {
    get totalByteLength() {
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
    get frameDuration() {
      var value = this.dv.getUint32(16, true);
      return this.fileType === 'fli' ? (value * 1000)/70 : value; // millisecond conversion
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
  };
  FileHeaderView.byteLength = 128;
  
  function PrefixHeaderView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  PrefixHeaderView.prototype = {
    get totalByteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get subchunkCount() {
      return this.dv.getUint16(6, true);
    },
    // reserved: 8 bytes
  };
  PrefixHeaderView.byteLength = 16;
  
  function FrameHeaderView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  FrameHeaderView.prototype = {
    get totalByteLength() {
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
  };
  FrameHeaderView.byteLength = 16;
  
  function SegmentTableHeaderView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  SegmentTableHeaderView.prototype = {
    get totalByteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get subchunkCount() {
      return this.dv.getUint16(6, true);
    },
  };
  SegmentTableHeaderView.byteLength = 8;
  
  function SegmentView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  SegmentView.prototype = {
    get totalByteLength() {
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
  SegmentView.byteLength = 32;
  
  function CelView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  CelView.prototype = {
    get totalByteLength() {
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
  CelView.byteLength = 64;
  
  function PaletteView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  PaletteView.prototype = {
    get totalByteLength() {
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
    apply: function(toRGBAs) {
      toRGBAs = toRGBAs || new Uint32Array(256);
      var packets = new Array(this.packetCount);
      var bytes = new Uint8Array(this.dv.buffer, this.dv.byteOffset + 8, this.dv.byteLength - 8);
      var pos = 0;
      var lshift, rshift;
      if (this.isVgaMode) {
        lshift = 2;
        rshift = 4;
      }
      else {
        lshift = 0;
        rshift = 8;
      }
      for (var i_pk = 0, i_col = 0; i_pk < packets.length; i_pk++) {
        i_col += bytes[pos++];
        for (var j_col = i_col + bytes[pos++]; i_col < j_col; i_col++) {
          var r = bytes[pos++];
          var g = bytes[pos++];
          var b = bytes[pos++];
          toRGBAs[i_col] = RGB(
            (r << lshift) | (r >> rshift),
            (g << lshift) | (g >> rshift),
            (b << lshift) | (b >> rshift));
        }
      }
      return toRGBAs;
    },
  };
  
  function ByteDeltaView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  ByteDeltaView.prototype = {
    get totalByteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get isFullReplacement() {
      return false;
    },
    get topLineY() {
      return this.dv.getUint16(6, true);
    },
    get lineCount() {
      return this.dv.getUint16(8, true);
    },
    apply: function(output, stride) {
      var i_out = this.topLineY * stride;
      var bytes = new Uint8Array(buffer, byteOffset + 10, byteLength - 10);
      var pos = 0;
      for (var i_line = 0, j_line = this.lineCount; i_line < j_line; i_line++) {
        var packetCount = bytes[pos++];
        var next_i_out = i_out + stride;
        while (packetCount-- > 0) {
          i_out += bytes[pos++];
          var count = bytes[pos++] << 24 >> 24;
          if (count < 0) {
            var rep = bytes[pos++];
            do { output[i_out++] = rep; } while (++count < 0);
          }
          else if (count > 0) {
            output.set(bytes.subarray(pos, pos + count), i_out);
            i_out += count;
          }
        }
        i_out = next_i_out;
      }
    },
  };
  
  function WordDeltaView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  WordDeltaView.prototype = {
    get totalByteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get isFullReplacement() {
      return false;
    },
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
        var next_i_out = i_out + stride; 
        while (packetCount-- > 0) {
          i_out += bytes[pos++] * 2;
          var count = bytes[pos++] << 24 >> 24;
          if (count < 0) {
            var rep1 = bytes[pos++];
            var rep2 = bytes[pos++];
            do {
              output[i_out++] = rep1;
              output[i_out++] = rep2;
            } while (++count < 0);
          }
          else if (count > 0) {
            output.set(bytes.subarray(pos, pos + count * 2), i_out);
            i_out += count * 2;
          }
        }
        i_out = next_i_out;
        if (lastByte >= 0) output[i_out - 1] = lastByte;
      }
    },
  };
  
  function EmptyChunkView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  EmptyChunkView.prototype = {
    get totalByteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get isFullReplacement() {
      return true;
    },
    apply: function(output) {
      output.set(new Uint8Array(output.length));
    },
  };
  EmptyChunkView.byteLength = 6;
  
  function ByteRunView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  ByteRunView.prototype = {
    get totalByteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get isFullReplacement() {
      return true;
    },
    apply: function(output, stride) {
      if (stride < 1) return;
      var bytes = new Uint8Array(
        this.dv.buffer,
        this.dv.byteOffset + 6,
        this.dv.byteLength - 6);
      var i = 0, i_out = 0;
      while (++i < bytes.length) {
        var remaining = stride;
        do {
          var count = bytes[i++] << 24 >> 24;
          if (count < 0) {
            count = -count;
            output.set(bytes.subarray(i, i + count), i_out);
            i += count;
            i_out += count;
          }
          else if (count > 0) {
            var rep = bytes[i++];
            while (count-- > 0) output[i_out++] = rep;
          }
          remaining -= count;
        } while (remaining > 0);
      }
    },
  };
  
  function UncompressedView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  UncompressedView.prototype = {
    get totalByteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get isFullReplacement() {
      return true;
    },
    apply: function(output, bpp) {
      if (bpp === 8) {
        output.set(this.bytes);
        return;
      }
    }
  };
  
  function ThumbnailHeaderView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  ThumbnailHeaderView.prototype = {
    get totalByteLength() {
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
  };
  ThumbnailHeaderView.byteLength = 12;
  
  var postageStampPalette = new Uint32Array(256);
  
  for (var r = 0; r < 6; r++)
  for (var g = 0; g < 6; g++)
  for (var b = 0; b < 6; b++)
    postageStampPalette[r*6*6 + g*6 + b] = RGB((r*255)/5, (g*255)/5, (b*255)/5);
  
  function PixelRunView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  PixelRunView.prototype = {
    get totalByteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get isFullReplacement() {
      return true;
    },
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
  
  function PixelCopyView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  PixelCopyView.prototype = {
    get totalByteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get isFullReplacement() {
      return true;
    },
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
          output[i_out++] = RGB((r << 3) | (r >> 2), (g << 3) | (g >> 2), (b << 3) | (b >> 2));
        }
      }
      else if (bpp === 16) {
        while (i < bytes.length) {
          var lo = bytes[i], hi = bytes[i+1];
          i += 2;
          var r = hi >>> 3, g = ((hi & 7) << 3) | (lo >>> 5), b = lo & 0x1F;
          output[i_out++] = RGB((r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2));
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
  
  function PixelDeltaView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  PixelDeltaView.prototype = {
    get totalByteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get isFullReplacement() {
      return false;
    },
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
  
  function LabelView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  LabelView.prototype = {
    get totalByteLength() {
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
  
  function MaskView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  MaskView.prototype = {
    get totalByteLength() {
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
  
  function KeyImageView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  KeyImageView.prototype = {
    get totalByteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get isFullReplacement() {
      return true;
    },
    apply: function(output, bpp, stride) {
      if (bpp === 8) return ByteRunView.prototype.apply.call(this, output, stride);
      return PixelRunView.prototype.apply.call(this, output, bpp, stride);
    },
  };
  
  function DirtyRectsView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  DirtyRectsView.prototype = {
    get totalByteLength() {
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
  
  function AudioView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  AudioView.prototype = {
    get totalByteLength() {
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
      var sampleCount = (this.totalByteLength - 20) / (channels.length * this.bytesPerSample);
      var buffer = audioContext.createBuffer(channels.length, sampleCount, this.sampleFrequency);
      for (var i = 0; i < channels.length; i++) {
        channels[i] = new Float32Array(sampleCount);
      }
      if (this.bytesPerSample === 16) {
        if (this.isSigned) {
          for (var j = 0; j < channelCount; j++)
          for (var i = 0; i < sampleCount; i++)
            channels[j][i] = this.dv.getInt16(20 + (i*j + j) * 2, true) / 32768;
        }
        else {
          for (var j = 0; j < channelCount; j++)
          for (var i = 0; i < sampleCount; i++)
            channels[j][i] = (this.dv.getUint16(20 + (i*j + j) * 2, true) - 32768) / 32768;
        }
      }
      else {
        if (this.isSigned) {
          var data = new Int8Array(this.dv.buffer, this.dv.byteOffset + 20, this.dv.byteLength - 20);
          for (var j = 0; j < channelCount; j++)
          for (var i = 0; i < sampleCount; i++)
            channels[j][i] = data[i*j + j] / 128;
        }
        else {
          var data = new Uint8Array(this.dv.buffer, this.dv.byteOffset + 20, this.dv.byteLength - 20);
          for (var j = 0; j < channelCount; j++)
          for (var i = 0; i < sampleCount; i++)
            channels[j][i] = (data[i*j + j] - 128) / 128;
        }
      }
      for (var i = 0; i < channelCount; i++) {
        buffer.copyToChannel(channels[i], i);
      }
      buffer.overlapDuration = this.overlapSamples / this.sampleFrequency;
      return buffer;
    },
  };
  
  function TextView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  TextView.prototype = {
    get totalByteLength() {
      return this.dv.getUint32(0, true);
    },
    get chunkTypeCode() {
      return this.dv.getUint16(4, true);
    },
    get text() {
      return String.fromCharCode.apply(null, this.bytes.subarray(6)).replace(/\0.*/, '');
    },
  };
  
  function FrameShiftView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  FrameShiftView.prototype = {
    get totalByteLength() {
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
  
  function PathMapView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.stride = Math.sqrt(this.totalByteLength - 6);
  }
  PathMapView.prototype = {
    get totalByteLength() {
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
    {id:0xAF11, name:'file', isStream:true, THeader:FileHeaderView},
    {id:0xAF12, name:'file', isStream:true, THeader:FileHeaderView},
    {id:0xAF44, name:'file', isStream:true, THeader:FileHeaderView},
    {id:0xAF30, name:'file', isStream:true, THeader:FileHeaderView},
    {id:0xAF31, name:'file', isStream:true, THeader:FileHeaderView},
    {id:0xF100, name:'prefix', TChunk:PrefixHeaderView}, // TODO: CEL files, EGI files
    {id:0xF1FA, name:'frames[]', isStream:true, THeader:FrameHeaderView},
    {id:0xF1FB, name:'segments[]', isStream:true, THeader:SegmentTableHeaderView},
    {id:0x0003, name:'cel', TChunk:CelView},
    {id:0x0004, name:'palette', TChunk:PaletteView},
    {id:0x0007, name:'pixels', TChunk:WordDeltaView},
    {id:0x000B, name:'palette', TChunk:PaletteView},
    {id:0x000C, name:'pixels', TChunk:ByteDeltaView},
    {id:0x000D, name:'pixels', TChunk:EmptyChunkView},
    {id:0x000F, name:'pixels', TChunk:ByteRunView},
    {id:0x0010, name:'pixels', TChunk:UncompressedView},
    {id:0x0012, name:'thumbnail', isStream:true, THeader:ThumbnailHeaderView},
    {id:0x0019, name:'pixels', TChunk:PixelRunView},
    {id:0x001A, name:'pixels', TChunk:PixelCopyView},
    {id:0x001B, name:'pixels', TChunk:PixelDeltaView},
    {id:0x001F, name:'label', TChunk:LabelView},
    {id:0x0020, name:'mask', TChunk:MaskView},
    {id:0x0021, name:'mask', TChunk:MaskView},
    {id:0x0022, name:'segment', TChunk:SegmentView},
    {id:0x0023, name:'pixels', TChunk:KeyImageView},
    {id:0x0024, name:'palette', TChunk:PaletteView},
    {id:0x0025, name:'dirtyRects', TChunk:DirtyRectsView},
    {id:0x0026, name:'audio', TChunk:AudioView},
    {id:0x0027, name:'text', TChunk:TextView},
    {id:0x0028, name:'mask', TChunk:MaskView},
    {id:0x0029, name:'label', TChunk:LabelView},
    {id:0x002A, name:'frameShift', TChunk:FrameShiftView},
    {id:0x002B, name:'pathMap', TChunk:PathMapView},
  ];
  
  var chunkTypesById = {};
  chunkTypes.forEach(function(ct){ chunkTypesById[ct.id] = ct; });
  
  return {
    postageStampPalette: postageStampPalette,
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
            if (chunkType.name.slice(-2)) {
              var arrayName = chunkType.name.slice(0, -2);
              addTo = arrayName in stream ? stream[arrayName] : stream[arrayName] = [];
              addAt = addTo.length++;
            }
            else {
              addTo = stream;
              addAt = chunkType.name;
            }
            if (chunkType.isStream) {
              return chunkStream(offset, offset + length, chunkType.THeader)
              .then(function(subStream) {
                if (subStream.length === 0
                && chunkType.THeader === FrameHeaderView
                && !subStream.overrideDuration
                && !subStream.overrideWidth
                && !subStream.overrideHeight) {
                  addTo[addAt] = null;
                }
                else {
                  addTo[addAt] = subStream;
                }
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
      function chunkStream(offset, endOffset, THeader) {
        return bufferedFileRead(file, offset, THeader.byteLength)
        .then(function(raw) {
          var stream = new THeader(raw.buffer, raw.byteOffset, raw.byteLength);
          return nextChunk(
            stream,
            offset + THeader.byteLength,
            offset + stream.totalByteLength);
        });
      }
      return chunkStream(0, file.size, FileHeaderView);
    },
  };

});
