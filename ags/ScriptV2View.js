define(function() {

  'use strict';
  
  function fourCC(str) {
    return str.charCodeAt(0) |
      (str.charCodeAt(1) << 8) |
      (str.charCodeAt(2) << 16) |
      (str.charCodeAt(3) << 24);
  }
  const SeeR_4CC = fourCC('SeeR');
  const VCPU_4CC = fourCC('VCPU');
  const TITL_4CC = fourCC('TITL');
  const AUTH_4CC = fourCC('AUTH');
  const END_4CC = fourCC('END!');
  const EOH_4CC = fourCC('EOH!');
  
  function ScriptV2View(buffer, byteOffset, byteLength) {
    var dv = this.dv = new DataView(buffer, byteOffset, byteLength);
    var bytes = this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
    
    if (dv.getInt32(0, true) !== SeeR_4CC) {
      throw new Error('invalid script');
    }
    var pos = 4;
    this.vcpu = [];
    for (var cc = dv.getInt32(pos, true); cc !== END_4CC; dv.getInt32(pos, true)) {
      pos += 4;
      switch (cc) {
        case VCPU_4CC:
          for (var vcpu = dv.getInt32(pos, true); vcpu !== EOH_4CC; vcpu = dv.getInt32(pos, true)) {
            this.vcpu.push(vcpu);
            pos += 4;
          }
          pos += 4;
          break;
        case TITL_4CC:
        case AUTH_4CC:
          var len = dv.getInt32(pos, true);
          pos += 4;
          var text = String.fromCharCode.apply(null, bytes.subarray(pos, pos + len)).match(/^[^\0]*/)[0];
          if (cc === TITL_4CC) this.title = text;
          else this.author = text;
          pos += len;
          break;
        default:
          throw new Error('unknown SeeR section: ' + String.fromCharCode.apply(null, bytes.subarray(pos-4, pos)));
      }
      pos += 4;
    }
    pos += 4;
    var exportBase = pos;
    this.exports = {};
    while (bytes[pos] !== 0) {
      var nameStart = pos;
      do { } while (bytes[++pos] !== 0);
      var name = String.fromCharCode.apply(null, bytes.subarray(nameStart, pos));
      do { } while ((++pos % 4) !== 0);
      var ref = pos - exportBase;
      var entryPoint = dv.getInt32(pos, true);
      pos += 4;
      var argAllocation = dv.getInt32(pos, true);
      pos += 4;
      this.exports[name] = this.exports[ref] = {
        name: name,
        ref: ref,
        entryPoint: entryPoint,
        argAllocation: argAllocation,
      };
    }
    pos += 4;
    var importBase = pos;
    this.imports = {};
    while (bytes[pos] !== 0) {
      var nameStart = pos;
      do { } while (bytes[++pos] !== 0);
      var name = String.fromCharCode.apply(null, bytes.subarray(nameStart, pos));
      do { } while ((++pos % 4) !== 0);
      var ref = pos - exportBase;
      pos += 4;
      var argAllocation = dv.getInt32(pos, true);
      pos += 4;
      this.imports[name] = this.imports[ref] = {
        name: name,
        ref: ref,
        argAllocation: argAllocation,
      };
    }
    pos++;
    var codeBase = pos;
    if (dv.getInt32(pos, true) !== 0x3D3D3D3B || dv.getInt32(pos+4, true) !== 0x3D3D373C) {
      throw new Error('unexpected code');
    }
    pos += 8;
    var suffixOffset = dv.getInt32(pos, true);
    pos += suffixOffset;
    if (dv.getInt32(pos, true) !== 0x3D373C3B
    ||  dv.getInt32(pos + 4, true) !== 0
    ||  dv.getInt32(pos + 8, true) !== 0) {
      throw new Error('unexpected suffix');
    }
    pos += 12;
    this.code = bytes.subarray(codeBase, pos);
    this.strings = bytes.subarray(pos);
  }
  
  return ScriptV2View;

});
