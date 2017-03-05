define(function() {

  'use strict';

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
  };
  
  return RoomView;

});
