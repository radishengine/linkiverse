define(function() {

  'use strict';
  
  const INTERACTIONS_V2_SIZE = 148;
  
  function nullTerminated(bytes, offset, length) {
    return String.fromCharCode.apply(null, bytes.subarray(offset, offset + length)).match(/^[^\0]*/)[0];
  }
  
  function RoomView(buffer, byteOffset, byteLength) {
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
    get main() {
      var main;
      if (this.chunks === null) {
        main = new RoomMainView(this.formatVersion, this.bytes.buffer, this.bytes.byteOffset + 2, this.bytes.byteLength - 2);
      }
      else {
        for (var i = 0; i < this.chunks.length; i++) {
          if (this.chunks[i].type === 'main') {
            var data = this.chunks[i].data;
            main = new RoomMainView(this.formatVersion, data.buffer, data.byteOffset, data.byteLength);
            break;
          }
        }
      }
      Object.defineProperty(this, 'main', {value:main});
      return main;
    },
  };
  
  function RoomMainView(formatVersion, buffer, byteOffset, byteLength) {
    this.formatVersion = formatVersion;
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
    
    this.endOffset = 0;
    
    this.member('bytesPerPixel', function() {
      if (this.formatVersion < 12) {
        return 8;
      }
      const offset = this.endOffset;
      this.endOffset += 2;
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
        return this.dv.getInt32(offset, true);
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
        return this.dv.getUint32(offset, true);
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
  
  return RoomView;

});
