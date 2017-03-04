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
  };
  
  return RoomView;

});
