define(function() {

  'use strict';
  
  const INTERACTIONS_V2_SIZE = 148;

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
        main = new RoomMainView(this.buffer, this.byteOffset + 2, this.byteLength - 2);
      }
      else {
        for (var i = 0; i < this.chunks.length; i++) {
          if (this.chunks[i].type === 'main') {
            var data = this.chunks[i].data;
            main = new RoomMainView(data.buffer, data.byteOffset, data.byteLength);
            break;
          }
        }
      }
      if (main) {
        main.formatVersion = this.formatVersion;
      }
      Object.defineProperty(this, 'main', {value:main});
      return main;
    },
  };
  
  function RoomMainView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  RoomMainView.prototype = {
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
    get bitsPerPixel() {
      return this.formatVersion >= 12 ? this.dv.getUint16(0, true) * 8 : 8;
    },
    get walkbehindBaselines() {
      var pos = this.formatVersion >= 12 ? 2 : 0;
      var list = new Array(this.dv.getUint16(pos, true));
      pos += 2;
      for (var i = 0; i < list.length; i++) {
        list[i] = this.dv.getInt16(pos, true);
        pos += 2;
      }
      list.afterPos = pos;
      Object.defineProperty(this, 'walkbehindBaselines', {value:list});
      return list;
    },
    get hotspotCount() {
      if (this.formatVersion < 9) {
        return this.maxHotspots;
      }
      return this.dv.getInt32(this.walkbehindBaselines.afterPos, true);
    },
    get interactions_v2() {
      var obj = {};
      var pos = this.walkbehindBaselines.afterPos + (this.formatVersion < 9 ? 0 : 4);
      if (this.formatVersion >= 9 && this.formatVersion <= 14) {
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
      }
      obj.afterPos = pos;
      Object.defineProperty(this, 'interactions_v2', {value:obj});
      return obj;
    },
    get hotspotWalkToPoints() {
      var list;
      if (this.formatVersion < 9) {
        list = null;
      }
      else {
        list = new Array(this.hotspotCount);
        var pos = this.interactions_v2.afterPos;
        for (var i = 0; i < list.length; i++) {
          list[i] = {
            x: this.dv.getInt16(pos + i * 4, true),
            y: this.dv.getInt16(pos + i * 4 + 2, true),
          };
        }
        list.afterPos = pos + list.length * 4;
      }
      Object.defineProperty(this, 'hotspotWalkToPoints', {value:list});
      return list;
    },
  };
  
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
