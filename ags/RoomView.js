define(function() {

  'use strict';
  
  const INTERACTIONS_V2_SIZE = 148;
  
  function nullTerminated(bytes, offset, length) {
    return String.fromCharCode.apply(null, bytes.subarray(offset, offset + length)).match(/^[^\0]*/)[0];
  }
  
  function masked(op, mask, bytes) {
    bytes = new Uint8Array(bytes);
    if (op == '+') {
      for (var i = 0; i < bytes.length; i++) {
        bytes[i] = (bytes[i] + mask.charCodeAt(i % mask.length)) & 0xFF;
      }
    }
    else if (op === '-') {
      for (var i = 0; i < bytes.length; i++) {
        bytes[i] = (bytes[i] - mask.charCodeAt(i % mask.length)) & 0xFF;
      }
    }
    else throw new Error('unsupported mask op', 2)
    return String.fromCharCode.apply(null, bytes);
  }
  
  function RoomView(game, buffer, byteOffset, byteLength) {
    this.game = game;
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  RoomView.prototype = {
    get formatVersion() {
      return this.dv.getInt16(0, true);
    },
    get chunks() {
      var list;
      if (this.formatVersion <= 4) {
        list = null;
      }
      else {
        list = [];
        var pos = 2;
        chunkLoop: while (pos < this.bytes.length) {
          var chunkType = this.bytes[pos++];
          if (chunkType === 0xff) break;
          var len = this.dv.getInt32(pos, true);
          pos += 4;
          var chunk = {data: this.bytes.subarray(pos, pos+len), type:chunkType};
          switch (chunkType) {
            case 1: chunk.type = 'main'; break;
            case 2: chunk.type = 'script_source'; break;
            case 3: chunk.type = 'compiled_script_v1'; break;
            case 4: chunk.type = 'compiled_script_v2'; break;
            case 5: chunk.type = 'object_names'; break;
            case 6: chunk.type = 'background'; break;
            case 7: chunk.type = 'compiled_script_v3'; break;
            case 8: chunk.type = 'properties'; break;
            case 9: chunk.type = 'object_script_names'; break;
          }
          pos += len;
          list.push(chunk);
        }
      }
      list.afterPos = pos;
      Object.defineProperty(this, 'chunks', {value:list});
      return list;
    },
    get scriptSource() {
      if (!this.chunks) return null;
      for (var i = 0; i < this.chunks.length; i++) {
        if (this.chunks[i].type === 'script_source') {
          return masked('+', 'Avis Durgan', this.chunks[i].data);
        }
      }
      return null;
    },
    get main() {
      var main;
      if (this.chunks === null) {
        main = new RoomMainView(this, this.bytes.buffer, this.bytes.byteOffset + 2, this.bytes.byteLength - 2);
      }
      else {
        for (var i = 0; i < this.chunks.length; i++) {
          if (this.chunks[i].type === 'main') {
            var data = this.chunks[i].data;
            main = new RoomMainView(this, data.buffer, data.byteOffset, data.byteLength);
            break;
          }
        }
      }
      Object.defineProperty(this, 'main', {value:main});
      return main;
    },
  };
  
  function RoomMainView(room, buffer, byteOffset, byteLength) {
    this.formatVersion = room.formatVersion;
    this.game = room.game;
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
    
    this.endOffset = 0;
    
    this.member('bitsPerPixel', function() {
      if (this.formatVersion < 12) {
        return 8;
      }
      const offset = this.endOffset;
      this.endOffset += 4;
      return function() {
        return this.dv.getInt32(offset, true) * 8;
      };
    });
    
    this.member('walkbehindCount', function() {
      const offset = this.endOffset;
      this.endOffset += 2;
      return function() {
        return this.dv.getUint16(offset, true);
      };
    });
    
    this.member('walkbehinds', function() {
      const offset = this.endOffset;
      this.endOffset += this.walkbehindCount * 2;
      return function() {
        var list = new Array(this.walkbehindCount);
        for (var i = 0; i < list.length; i++) {
          list[i] = {baseline:this.dv.getInt16(offset + i*2, true)};
        }
        return list;
      };
    });
    
    this.member('hotspotCount', function() {
      if (this.formatVersion < 9) {
        return this.maxHotspots;
      }
      const offset = this.endOffset;
      this.endOffset += 4;
      return function() {
        return this.dv.getUint16(offset, true);
      };
    });
    
    this.member('interactions_v2', function() {
      if (this.formatVersion < 9 || this.formatVersion > 14) {
        return null;
      }
      const offset = this.endOffset;
      this.endOffset += INTERACTIONS_V2_SIZE * (this.maxHotspots + this.maxObjects + 1);
      return function() {
        var obj = {};
        var pos = offset;
        obj.forHotspots = new Array(this.maxHotspots);
        for (var i = 0; i < obj.forHotspots.length; i++) {
          obj.forHotspots[i] = readInteractionsV2(this.dv, pos);
          pos += INTERACTIONS_V2_SIZE;
        }
        obj.forObjects = new Array(this.maxObjects);
        for (var i = 0; i < obj.forObjects.length; i++) {
          obj.forObjects[i] = readInteractionsV2(this.dv, pos);
          pos += INTERACTIONS_V2_SIZE;
        }
        obj.forRoom = readInteractionsV2(this.dv, pos);
        pos += INTERACTIONS_V2_SIZE;
        return obj;
      };
    });
    
    this.member('hotspotWalkToPoints', function() {
      if (this.formatVersion < 9) {
        return null;
      }
      const offset = this.endOffset;
      this.endOffset += this.hotspotCount * 4;
      return function() {
        var list = new Array(this.hotspotCount);
        for (var i = 0; i < list.length; i++) {
          list[i] = {
            x: this.dv.getInt16(offset + i * 4, true),
            y: this.dv.getInt16(offset + i * 4 + 2, true),
          };
        }
        return list;
      };
    });
    
    this.member('hotspotNames', function() {
      const offset = this.endOffset;
      if (this.formatVersion < 9) return null;
      if (this.formatVersion < 28) {
        this.endOffset += this.hotspotCount * 30;
        return function() {
          var list = new Array(this.hotspotCount);
          for (var i = 0; i < list.length; i++) {
            list[i] = nullTerminated(this.bytes, offset + i*30, 30);
          }
          return list;
        };
      }
      var list = new Array(this.hotspotCount);
      var pos = offset;
      for (var i = 0; i < list.length; i++) {
        var endPos = pos;
        while (this.bytes[endPos] !== 0) {
          endPos++;
        }
        if (pos !== endPos) {
          list[i] = String.fromCharCode.apply(null, this.bytes.subarray(pos, endPos));
        }
        pos = endPos + 1;
      }
      this.endOffset = pos;
      return list;
    });
    
    this.member('hotspotScriptNames', function() {
      if (this.formatVersion < 24) return null;
      this.endOffset += this.hotspotCount * 20;
      return function() {
        throw new Error('NYI');
      };
    });
    
    this.member('wallCount', function() {
      if (this.formatVersion < 9) return 0;
      const offset = this.endOffset;
      this.endOffset += 4;
      return function() {
        return this.dv.getUint16(offset, true);
      };
    });
    
    this.member('walls', function() {
      const offset = this.endOffset;
      this.endOffset += this.wallCount * WallView.byteLength;
      return function() {
        var list = new Array(this.wallCount);
        for (var i = 0; i < list.length; i++) {
          list[i] = new WallView(
            this.bytes.buffer,
            this.bytes.byteOffset + offset + i * WallView.byteLength,
            WallView.byteLength);
        };
        return list;
      };
    });
    
    this.member('interactions_v1', function() {
      if (this.formatVersion >= 9) return null;
      throw new Error('NYI');
    });
    
    this.member('edges', function() {
      const offset = this.endOffset;
      this.endOffset += 8;
      return function() {
        return {
          top: this.dv.getInt16(offset, true),
          bottom: this.dv.getInt16(offset + 2, true),
          left: this.dv.getInt16(offset + 4, true),
          right: this.dv.getInt16(offset + 6, true),
        };
      };
    });
    
    this.member('objectCount', function() {
      const offset = this.endOffset;
      this.endOffset += 2;
      return function() {
        return this.dv.getUint16(offset, true);
      };
    });
    
    this.member('objects', function() {
      const offset = this.endOffset;
      this.endOffset += this.objectCount * ObjectView.byteLength;
      return function() {
        var list = new Array(this.objectCount);
        for (var i = 0; i < list.length; i++) {
          list[i] = new ObjectView(
            this.bytes.buffer,
            this.bytes.byteOffset + offset + i * ObjectView.byteLength,
            ObjectView.byteLength);
        }
        return list;
      };
    });
    
    this.member('v3_local_vars', function() {
      if (this.formatVersion < 19) return null;
      throw new Error('NYI');
    });
    
    this.member('interactions_v3', function() {
      if (this.formatVersion < 15 || this.formatVersion >= 26) {
        return null;
      }
      throw new Error('NYI');
    });
    
    this.member('regionCount', function() {
      if (this.formatVersion < 21) return 0;
      const offset = this.endOffset;
      this.endOffset += 4;
      return function() {
        return this.dv.getUint32(offset, true);
      };
    });
    
    this.member('interactions_v4', function() {
      if (this.formatVersion < 26) return null;
      throw new Error('NYI');
    });
    
    this.member('objectBaselines', function() {
      if (this.formatVersion < 9) return null;
      const offset = this.endOffset;
      this.endOffset += 4 * this.objectCount;
      return function() {
        var list = new Array(this.objects.length);
        for (var i = 0; i < list.length; i++) {
          list[i] = this.dv.getInt32(offset + i * 4, true);
        }
        return list;
      };
    });
    
    function member_dimension() {
      if (this.formatVersion < 9) return NaN;
      const offset = this.endOffset;
      this.endOffset += 2;
      return function() {
        return this.dv.getInt16(offset, true);
      };
    }
    
    this.member('width', member_dimension);
    this.member('height', member_dimension);
    
    this.member('objectFlags', function() {
      if (this.formatVersion < 23) return null;
      this.endOffset += this.objectCount * 2;
      return function() {
        throw new Error('NYI');
      };
    });
    
    this.member('resolution', function() {
      if (this.formatVersion < 11) return 'low';
      const offset = this.endOffset;
      this.endOffset += 2;
      return function() {
        var value = this.dv.getInt16(offset, true);
        switch (value) {
          case 1: value = 'low'; break;
          case 2: value = 'high'; break;
        }
        return value;
      };
    });
    
    this.member('walkZoneCount', function() {
      if (this.formatVersion < 10) return 0;
      if (this.formatVersion < 14) return this.maxWalkZones;
      const offset = this.endOffset;
      this.endOffset += 4;
      return function() {
        var count = this.dv.getInt32(offset, true);
        return count === 0 ? this.maxWalkZones : count;
      };
    });
    
    this.member('walkZoneScaleTop', function() {
      if (this.formatVersion < 10) return null;
      const offset = this.endOffset;
      this.endOffset += (this.walkZoneCount - 1) * 2;
      return function() {
        var list = new Array(this.walkZoneCount);
        for (var i = 1; i < list.length; i++) {
          list[i] = this.dv.getInt16(offset + (i-1)*2, true);
        }
        return list;
      };
    });
    
    this.member('walkZoneLightLevels', function() {
      if (this.formatVersion < 13) return null;
      const offset = this.endOffset;
      this.endOffset += 2 * (this.walkZoneCount - 1);
      if (this.formatVersion >= 21) return null; // regions have light level, not walk zones
      return function() {
        var list = new Array(this.walkZoneCount);
        for (var i = 0; i < list.length; i++) {
          list[i] = this.dv.getInt16(offset + i*2, true);
        }
        return list;
      };
    });
    
    this.member('walkZoneScaleInfo', function() {
      if (this.formatVersion < 18) return null;
      this.endOffset += this.walkZoneCount * 6;
      return function() {
        throw new Error('NYI');
      };
    });
    
    this.member('password', function() {
      const offset = this.endOffset;
      this.endOffset += 11;
      return function() {
        throw new Error('NYI');
      };
    });
    
    function member_uint8() {
      const offset = this.endOffset;
      this.endOffset++;
      return function() {
        return this.bytes[offset];
      };
    }
    
    function member_int8() {
      const offset = this.endOffset;
      this.endOffset++;
      return function() {
        return this.dv.getInt8(offset);
      };
    }
    
    function member_bool8() {
      const offset = this.endOffset;
      this.endOffset++;
      return function() {
        return !!this.bytes[offset];
      };
    }
    
    this.member('startupMusic', member_uint8);
    this.member('allowsSaveLoad', member_bool8);
    this.member('hidesPlayerCharacter', member_bool8);
    this.member('playerSpecialView', member_uint8); // 0 = no view
    this.member('musicVolume', member_int8); // 0 normal, -3 quietest, 5 loudest (3 highest setting in editor)
    
    this.member('messageCount', function() {
      this.endOffset += 5; // unused room options
      const offset = this.endOffset;
      this.endOffset += 2;
      return function() {
        return this.dv.getUint16(offset, true);
      };
    });
    
    this.member('gameID', function() {
      if (this.formatVersion < 25) return null;
      const offset = this.endOffset;
      this.endOffset += 4;
      return function() {
        return this.dv.getInt32(offset, true);
      };
    });
    
    this.member('messageFlags', function() {
      // TODO: check pre-v3?
      const offset = this.endOffset;
      this.endOffset += this.messageCount * 2;
      return function() {
        var list = new Array(this.messageCount);
        for (var i = 0; i < list.length; i++) {
          var flags1 = this.bytes[offset*2];
          var flags2 = this.bytes[offset*2 + 1];
          list[i] = {
            isShownAsSpeech: !!flags1,
            continuesToNext: !!(flags2 & 1),
            isRemovedAfterTimeout: !!(flags2 & 2),
          };
        }
        return list;
      };
    });
    
    // TODO: messages that end in \xC8 continue to the next
    
    this.member('messages', function() {
      var list = new Array(this.messageCount);
      var pos = this.endOffset;
      if (this.formatVersion >= 21) {
        throw new Error('NYI');
      }
      else for (var i = 0; i < list.length; i++) {
        var startPos = pos;
        do { } while (this.bytes[pos++] !== 0);
        list[i] = String.fromCharCode.apply(null, this.bytes.subarray(startPos, pos-1));
      }
      this.endOffset = pos;
      return list;
    });
    
    this.member('animationCount', function() {
      if (this.formatVersion < 6) return 0;
      const offset = this.endOffset;
      this.endOffset += 2;
      return function() {
        return this.dv.getInt16(offset, true);
      };
    });
    
    this.member('animations', function() {
      const offset = this.endOffset;
      const size = RoomAnimStageView.maxCount * RoomAnimStageView.byteLength + 4;
      this.endOffset += this.animationCount * size;
      return function() {
        var list = new Array(this.animationCount);
        for (var i = 0; i < list.length; i++) {
          list[i] = new Array(this.dv.getInt32(size - 4));
          for (var j = 0; j < list[j].length; j++) {
            list[j] = new RoomAnimStageView(
              this.bytes.buffer,
              this.bytes.byteOffset + size * i + RoomAnimStageView.byteLength * j,
              RoomAnimStageView.byteLength);
          }
        }
        return list;
      };
    });
    
    this.member('graphicalScriptVersion', function() {
      if (this.formatVersion < 4 || this.formatVersion > 15) return NaN;
      const offset = this.endOffset;
      this.endOffset += 4;
      return function() {
        return this.dv.getInt32(offset, true);
      };
    });
    
    this.member('graphicalVarCount', function() {
      if (this.formatVersion < 4 || this.formatVersion > 15) return 0;
      const offset = this.endOffset;
      this.endOffset += 4;
      return function() {
        return this.dv.getInt32(offset, true);
      };
    });
    
    this.member('graphicalVarNames', function() {
      var offset = this.endOffset;
      var list = new Array(this.graphicalVarCount);
      for (var i = 0; i < list.length; i++) {
        var len = this.bytes[offset++];
        list[i] = String.fromCharCode.apply(null, this.bytes.subarray(offset, offset + len));
        offset += len;
      }
      this.endOffset = offset;
      return list;
    });
    
    this.member('graphicalScripts', function() {
      if (this.formatVersion < 4 || this.formatVersion > 15) return null;
      var offset = this.endOffset;
      var list = [];
      for (;;) {
        var number = this.dv.getInt32(offset, true);
        offset += 4;
        if (number === -1) break;
        var len = this.dv.getInt32(offset, true);
        offset += 4;
        list.push({
          number: number,
          code: this.bytes.subarray(offset, offset + len),
        });
        offset += len;
      }
      this.endOffset = offset;
      return list;
    });
    
    this.member('shadowViews', function() {
      if (this.formatVersion < 8) return null;
      const offset = this.endOffset;
      this.endOffset += 2 * this.maxShadowLayers;
      return function() {
        var list = new Array(this.maxShadowLayers);
        for (var i = 0; i < list.length; i++) {
          list[i] = this.dv.getInt16(offset + i*2, true);
        }
        return list;
      };
    });
    
    this.member('regionLightLevels', function() {
      if (this.formatVersion < 21) return null;
      const offset = this.endOffset;
      this.endOffset += this.regionCount * 2;
      return function() {
        var list = new Array(this.regionCount);
        for (var i = 0; i < list.length; i++) {
          list[i] = this.dv.getInt16(i*2, true);
        }
        return list;
      };
    });
    
    this.member('regionTintLevels', function() {
      if (this.formatVersion < 21) return null;
      const offset = this.endOffset;
      this.endOffset += this.regionCount * 4;
      return function() {
        var list = new Array(this.regionCount);
        for (var i = 0; i < list.length; i++) {
          list[i] = this.dv.getInt16(i*4, true);
        }
        return list;
      };
    });
    
    function member_allegro_bitmap() {
      const w = this.dv.getUint16(this.endOffset, true);
      const h = this.dv.getUint16(this.endOffset + 2, true);
      this.endOffset += 4;
      var compressed = new Int8Array(this.bytes.buffer, this.bytes.byteOffset + this.endOffset);
      var uncompressed = new Uint8Array(w * h);
      compressed.pos = 0;
      uncompressed.pos = 0;
      while (uncompressed.pos < uncompressed.length) {
        var cx = compressed[compressed.pos++];
        if (cx === -128) {
          uncompressed[uncompressed.pos++] = compressed[compressed.pos++];
        }
        else if (cx < 0) {
          var rep = compressed[compressed.pos++];
          cx = 1 - cx;
          if (rep === 0) {
            uncompressed.pos += cx;
          }
          else {
            do { uncompressed[uncompressed.pos++] = rep; } while (--cx > 0);
          }
        }
        else {
          cx++;
          var part = compressed.subarray(compressed.pos, compressed.pos + cx);
          uncompressed.set(part, uncompressed.pos);
          uncompressed.pos += cx;
          compressed.pos += cx;
        }
      }
      this.endOffset += compressed.pos;
      const paletteOffset = this.endOffset;
      this.endOffset += 256 * 3;
      return function() {
        var palette = new Uint8Array(256 * 4);
        for (var i = 0; i < 256; i++) {
          var r, g, b;
          if (this.game.header.palette_uses[i] & 1) {
            r = this.game.header.palette[i*4];
            g = this.game.header.palette[i*4 + 1];
            b = this.game.header.palette[i*4 + 2];
          }
          else {
            r = this.bytes[paletteOffset + i*3];
            g = this.bytes[paletteOffset + i*3 + 1];
            b = this.bytes[paletteOffset + i*3 + 2];
          }
          palette[i*4] = (r << 2) | (r >> 4);
          palette[i*4 + 1] = (g << 2) | (g >> 4);
          palette[i*4 + 2] = (b << 2) | (b >> 4);
          palette[i*4 + 3] = 0xFF;
        }
        return {
          width: w,
          height: h,
          data: uncompressed,
          palette: palette,
          setImageData: function (imageData) {
            var w = this.width, h = this.height, data = this.data;
            var pix4 = new Int32Array(imageData.data.buffer, imageData.data.byteOffset, this.width * this.height);
            var pal4 = new Int32Array(this.palette.buffer, this.palette.byteOffset, 256);
            for (var y = 0; y < this.height; y++) {
              for (var x = 0; x < this.width; x++) {
                pix4[y*w + x] = pal4[data[y*w + x]];
              }
            }
          },
        };
      };
    }
    
    function member_lzw_bitmap() {
      const paletteOffset = this.endOffset;
      this.endOffset += 4 * 256;
      const uncompressedSize = this.dv.getInt32(this.endOffset, true);
      this.endOffset += 4;
      const compressedSize = this.dv.getInt32(this.endOffset, true);
      const compressedOffset = this.endOffset + 4;
      this.endOffset = compressedOffset + compressedSize;
      return function() {
        var compressed = this.bytes.subarray(compressedOffset, compressedOffset + compressedSize);
        var uncompressed = new Uint8Array(uncompressedSize);
        var dv = new DataView(uncompressed.buffer, uncompressed.byteOffset, uncompressed.byteLength);
        var lzbuffer = new Uint8Array(0x1000);
        uncompressed.pos = 0;
        compressed.pos = 0;
        var ix = 0x1000 - 0x10;
        while (uncompressed.pos < uncompressed.length) {
          var bits = compressed[compressed.pos++];
          for (var bit = 1; bit < 0x100; bit <<= 1) {
            if (bits & bit) {
              var jx = compressed[compressed.pos] | (compressed[compressed.pos + 1] << 8);
              compressed.pos += 2;
              var len = ((jx >>> 12) & 0xF) + 3;
              jx = (ix - jx - 1) & 0xFFF;
              for (var i = 0; i < len; i++) {
                uncompressed[uncompressed.pos++] = lzbuffer[jx];
                lzbuffer[ix] = lzbuffer[jx];
                jx = (jx + 1) & 0xFFF;
                ix = (ix + 1) & 0xFFF;
              }
            }
            else {
              lzbuffer[ix] = uncompressed[uncompressed.pos++] = compressed[compressed.pos++];
              ix = (ix + 1) & 0xFFF;
            }
          }
        }
        if (uncompressed.pos < uncompressed.length) {
          throw new Error('decompression underflow');
        }
        var palette = this.bytes.subarray(paletteOffset, paletteOffset + 256 * 4);
        palette = new Uint8Array(palette);
        for (var i = 0; i < this.game.header.palette_uses.length; i++) {
          if (this.game.header.palette_uses[i] & 1) {
            palette[i*4] = this.game.header.palette[i*4];
            palette[i*4 + 1] = this.game.header.palette[i*4 + 1];
            palette[i*4 + 2] = this.game.header.palette[i*4 + 2];
          }
        }
        for (var i = 0; i < palette.length; i += 4) {
          palette[i] = (palette[i] << 2) | (palette[i] >> 4);
          palette[i+1] = (palette[i+1] << 2) | (palette[i+1] >> 4);
          palette[i+2] = (palette[i+2] << 2) | (palette[i+2] >> 4);
          palette[i+3] = 0xFF;
        }
        return {
          stride: dv.getInt32(0, true),
          width: this.width,
          height: dv.getInt32(4, true),
          data: uncompressed.subarray(8),
          palette: palette,
          bitsPerPixel: this.bitsPerPixel,
          setImageData: function (imageData) {
            var w = this.width, h = this.height, data = this.data;
            var pix4 = new Int32Array(imageData.data.buffer, imageData.data.byteOffset, this.width * this.height);
            switch (this.bitsPerPixel) {
              case 8:
                var pal4 = new Int32Array(this.palette.buffer, this.palette.byteOffset, 256);
                for (var y = 0; y < this.height; y++) {
                  for (var x = 0; x < this.width; x++) {
                    pix4[y*w + x] = pal4[data[y*w + x]];
                  }
                }
                break;
              case 16:
                var dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
                for (var y = 0; y < this.height; y++) {
                  for (var x = 0; x < this.width; x++) {
                    var rgb = dv.getUint16(2 * (y*w + x), true);
                    var b = rgb & ((1 << 5) - 1);
                    var g = (rgb >> 5) & ((1 << 6) - 1);
                    var r = rgb >> 11;
                    b = (b << 3) | (b >> 2);
                    g = (g << 2) | (g >> 4);
                    r = (r << 3) | (r >> 2);
                    imageData.data[(y*w + x) * 4] = r;
                    imageData.data[(y*w + x) * 4 + 1] = g;
                    imageData.data[(y*w + x) * 4 + 2] = b;
                  }
                }
                break;
              case 24:
                for (var y = 0; y < this.height; y++) {
                  for (var x = 0; x < this.width; x++) {
                    imageData.data[(y*w + x) * 4] = data[(y*w + x) * 3];
                    imageData.data[(y*w + x) * 4 + 1] = data[(y*w + x) * 3 + 1];
                    imageData.data[(y*w + x) * 4 + 2] = data[(y*w + x) * 3 + 2];
                  }
                }
                break;
              case 32:
                imageData.data.set(data);
                break;
              default:
                throw new Error('unknown pixel format: ' + this.bitsPerPixel + 'bpp');
            }
            for (var i = 3; i < imageData.data.length; i += 4) {
              imageData.data[i] = 0xff;
            }
          },
        };
      };
    }
    
    this.member('backgroundBitmap', function() {
      if (this.formatVersion < 5) {
        return member_allegro_bitmap.apply(this);
      }
      return member_lzw_bitmap.apply(this);
    });
    
    this.member('regionBitmap', function() {
      if (this.formatVersion < 13) return null;
      if (this.formatVersion < 21) {
        return function() {
          return this.walkZoneBitmap;
        };
      }
      return member_allegro_bitmap.apply(this);
    });
    
    this.member('shadowBitmap', function() {
      if (this.formatVersion < 8) {
        return null;
      }
      if (this.formatVersion === 8) {
        return member_allegro_bitmap.apply(this);
      }
      member_allegro_bitmap.apply(this); // ignore!
      return function() {
        return this.walkZoneBitmap;
      };
    });
    
    this.member('wallBitmap', function() {
      if (this.formatVersion >= 9) return null;
      return member_allegro_bitmap.apply(this);
    });
    
    this.member('walkZoneBitmap', function() {
      if (this.formatVersion < 9) return null;
      return member_allegro_bitmap.apply(this);
    });
    
    this.member('walkBehindBitmap', member_allegro_bitmap);
    this.member('hotspotBitmap', member_allegro_bitmap);
  }
  
  RoomMainView.prototype = {
    member: function(name, def) {
      var value = def.apply(this);
      if (typeof value === 'function') {
        Object.defineProperty(this, name, {get:value});
      }
      else {
        Object.defineProperty(this, name, {value:value});
      }
      return this;
    },
    get maxHotspots() {
      return (this.formatVersion >= 25) ? 50
        : (this.formatVersion >= 23) ? 30
        : (this.formatVersion >= 9) ? 20
        : 16;
    },
    get maxObjects() {
      return 10;
    },
    get maxWalkZones() {
      return this.formatVersion >= 9 ? 16 : 0;
    },
    get maxShadowLayers() {
      return this.formatVersion >= 8 ? 16 : 0;
    },    
  };
  
  function ObjectView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  ObjectView.prototype = {
    get sprite() {
      return this.dv.getInt16(0, true);
    },
    get x() {
      return this.dv.getInt16(2, true);
    },
    get y() {
      return this.dv.getInt16(4, true);
    },
    get room() {
      return this.dv.getInt16(6, true);
    },
    get on() {
      return !!this.dv.getInt16(8, true);
    },
  };
  ObjectView.byteLength = 10;
  
  function WallView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  WallView.prototype = {
    get points() {
      var list = new Array(this.dv.getUint32(30*4 + 30*4, true));
      for (var i = 0; i < list.length; i++) {
        list[i] = {
          x: this.dv.getInt32(i*4, true),
          y: this.dv.getInt32((30+i)*4, true),
        };
      }
      Object.defineProperty(this, 'points', {value:list});
      return list;
    },
  };
  WallView.byteLength = 30*4 + 30*4 + 4;
  
  function readInteractionsV2(dv, pos) {
    var list = new Array(dv.getInt32(pos + 128, true));
    for (var i = 0; i < list.length; i++) {
      list[i] = {
        event: dv.getInt32(pos + 4*i, true),
        response: dv.getInt32(pos + 32 + 4*i, true),
        data1: dv.getInt32(pos + 64 + 4*i, true),
        data2: dv.getInt32(pos + 96 + 4*i, true),
        points: dv.getInt16(pos + 132 + 2*i, true),
      };
    }
    return list;
  }
  
  function RoomAnimStageView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  RoomAnimStageView.prototype = {
    
  };
  RoomAnimStageView.byteLength = 24;
  RoomAnimStageView.maxCount = 10;
  
  window.pic = function(pic) {
    var canvas = document.createElement('CANVAS');
    canvas.width = pic.width;
    canvas.height = pic.height;
    var ctx = canvas.getContext('2d');
    var imageData = ctx.createImageData(pic.width, pic.height);
    pic.setImageData(imageData);
    ctx.putImageData(imageData, 0, 0);
    canvas.style.position = 'fixed';
    canvas.style.right = '0px';
    canvas.style.top = '0px';
    document.body.appendChild(canvas);
  };
  
  return RoomView;

});
