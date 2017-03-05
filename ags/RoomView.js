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
        }
      }
      list.afterPos = pos;
      Object.defineProperty(this, 'chunks', {value:list});
      return list;
    },
  };
  
  return RoomView;

});
