define(function() {

  'use strict';
  
  function ScomScript(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  ScomScript.prototype = {
    get signature() {
      return String.fromCharCode(this.bytes[0], this.bytes[1], this.bytes[2], this.bytes[3]);
    },
    get hasValidSignature() {
      return this.signature === 'SCOM';
    },
    get scomVersion() {
      return this.dv.getUint32(4, true);
    },
    get dataByteLength() {
      return this.dv.getUint32(8, true);
    },
    get codeLength() {
      return this.dv.getUint32(12, true);
    },
    get codeByteLength() {
      return this.codeLength * 4;
    },
    get stringTableByteLength() {
      return this.dv.getUint32(16, true);
    },
    get dataOffset() {
      return 20;
    },
    get data() {
      var bytes = this.bytes.subarray(this.dataOffset, this.dataOffset + this.dataByteLength);
      Object.defineProperty(this, 'data', {value:bytes, enumerable:true});
      return bytes;
    },
    get codeOffset() {
      return this.dataOffset + this.dataByteLength;
    },
    get code() {
      var ints = new Int32Array(this.codeLength);
      var pos = this.codeOffset;
      for (var i = 0; i < ints.length; i++) {
        ints[i] = this.dv.getInt32(pos, true);
        pos += 4;
      }
      Object.defineProperty(this, 'code', {value:ints, enumerable:true});
      return ints;
    },
    get stringTableOffset() {
      return this.codeOffset + this.codeByteLength;
    },
    get stringTable() {
      var bytes = this.bytes.subarray(this.stringTableOffset, this.stringTableOffset + this.stringTableByteLength);
      Object.defineProperty(this, 'stringTable', {value:bytes, enumerable:true});
      return bytes;
    },
    get fixupsOffset() {
      return this.stringTableOffset + this.stringTableByteLength;
    },
    get fixupCount() {
      return this.dv.getUint32(this.fixupsOffset, true);
    },
    get importsOffset() {
      return this.fixupsOffset + 4 + this.fixupCount * (1 + 4);
    },
    get imports() {
      var pos = this.importsOffset;
      var offsetCount = this.dv.getUint32(pos, true);
      var list = [];
      pos += 4;
      for (var i = 0; i < offsetCount; i++) {
        if (this.bytes[pos] === 0) {
          pos++;
          continue;
        }
        var startPos = pos;
        do { } while (this.bytes[++pos] !== 0);
        var name = String.fromCharCode.apply(this.bytes.subarray(startPos, pos));
        pos++;
        list.push({name:name, offset:i});
      }
      list.afterPos = pos;
      Object.defineProperty(this, 'imports', {value:list, enumerable:true});
      return list;
    },
    get exportsOffset() {
      return this.imports.afterPos;
    },
    get exports() {
      var pos = this.exportsOffset;
      var list = new Array(this.dv.getUint32(pos, true));
      pos += 4;
      for (var i = 0; i < list.length; i++) {
        var export = list[i] = {};
        var startPos = pos;
        while (this.bytes[pos] !== 0) pos++;
        export.name = String.fromCharCode.apply(this.bytes.subarray(startPos, pos));
        pos++;
        export.offset = this.dv.getUint32(pos, true);
        pos += 4;
        var mangled = export.name.match(/^([^\$]+)\$(\d+)$/);
        if (mangled) {
          export.name = mangled[1];
          export.argCount = +mangled[2];
        }
        export.type = export.offset >>> 24;
        if (export.type === 1) export.type = 'function';
        else if (export.type === 2) export.type = 'data';
        export.offset &= 0xffffff;
      }
      list.afterPos = pos;
      Object.defineProperty(this, 'exports', {value:list, enumerable:true});
      return list;
    },
    get sectionsOffset() {
      return this.exports.afterPos;
    },
    get sections() {
      if (this.scomVersion < 83) {
        var list = [];
        list.afterPos = this.sectionsOffset;
        Object.defineProperty(this, 'sections', {value:list, enumerable:true});
        return list;
      }
      throw new Error('NYI');
    },
    get endSignature() {
      return this.dv.getUint32(this.sections.afterPos, true);
    },
    get hasValidEndSignature() {
      return this.endSignature === 0xbeefcafe;
    },
    get endOffset() {
      return this.sections.afterPos + 4;
    },
  };
  
  return ScomScript;

});
