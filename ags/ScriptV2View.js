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
    for (var cc = dv.getInt32(pos, true); cc !== END_4CC; cc = dv.getInt32(pos, true)) {
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
      var ref = pos - importBase;
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
    pos += 4 + suffixOffset;
    this.code = new Int32Array((pos - codeBase) / 4);
    for (var i = 0; i < this.code.length; i++) {
      this.code[i] = dv.getInt32(codeBase + i * 4, true);
    }
    if (dv.getInt32(pos, true) !== 0x3D373C3B) {
      throw new Error('unexpected suffix');
    }
    pos += 8;
    this.unknown1 = bytes.subarray(pos, pos + dv.getInt32(pos - 4, true));
    pos += this.unknown1.length + 4;
    this.unknown2 = bytes.subarray(pos, pos + dv.getInt32(pos - 4, true));
    pos += this.unknown2.length;
    this.strings = bytes.subarray(pos);
  }
  ScriptV2View.prototype = {
    instantiate: function(runtime) {
      return new SeerInstance(runtime, this);
    },
  };
  
  function SeerInstance(runtime, def) {
    this.runtime = runtime;
    this.def = def;
    this.exports = {};
    for (var k in def.exports) {
      var xport = def.exports[k];
      if (xport.entryPoint >= 0) {
        this.exports[k] = this.runFrom.bind(this, xport.entryPoint/4);
      }
    }
  }
  SeerInstance.prototype = {
    runFrom: function(pos) {
      var strings = this.def.strings;
      var code = this.def.code;
      var imports = this.def.imports;
      if (code[pos++] !== 0x3D3D3D3B) {
        if (code[pos-1] !== 0x3D373C3B) {
          console.log('unexpected prefix: 0x' + code[pos - 1].toString(16));
        }
        return;
      }
      var stack = [];
      var calling;
      var runtime = this.runtime;
      function next_step() {
        codeLoop: for (;;) {
          var op = code[pos++];
          switch (op) {
            case 0x3D3D373C:
              return;
            case 0x00000001:
              stack.unshift(code[pos++]);
              continue codeLoop;
            case 0x00000D01:
              var local_var_address = code[pos++];
              // TODO
              continue codeLoop;
            case 0x0000000D:
              calling = imports[code[pos++]];
              var argSize = code[pos++];
              var flags = argSize & 0xffff0000;
              argSize &= 0xffff;
              var args = stack.splice(-argSize/4);
              if (typeof runtime[calling.name] === 'function') {
                var result = runtime[calling.name].apply(runtime, args);
                if (result instanceof Promise) {
                  if (flags & 0x00200000) {
                    // throw away result
                  }
                  else {
                    result = result.then(function(result) {
                      stack.unshift(result);
                    });
                  }
                  return result.then(next_step);
                }
                else {
                  if (flags & 0x00200000) {
                    // throw away result
                  }
                  else {
                    stack.unshift(result);
                  }
                }
              }
              else {
                console.log(calling, args);
                if (flags & 0x00200000) {
                  // throw away result
                }
                else {
                  stack.unshift(0);
                }
              }
              continue codeLoop;
            case 0x00000502:
              var startPos = code[pos++];
              var endPos = startPos;
              while (strings[endPos] !== 0) endPos++;
              stack.unshift(String.fromCharCode.apply(null, strings.subarray(startPos, endPos)));
              continue codeLoop;
            case 0x0002018B:
              var imported = imports[code[pos++]];
              // TODO
              continue codeLoop;
            case 0x00F50110:
              var alloc_str_len = code[pos++];
              // TODO
              continue codeLoop;
            case 0x0002010B:
              var str_buf_offset = code[pos++]; // negative for local
              var unknown1 = code[pos++];
              var unknown2 = code[pos++];
              // TODO: something to do with pushing string buffer as a func arg
              continue codeLoop;
            case 0x0003010B:
              var array_offset = code[pos++];
              // TODO
              continue codeLoop;
            case 0x0002010F:
              var add_value = code[pos++];
              // TODO
              continue codeLoop;
            case 0x0003010F:
              var field_offset = code[pos++];
              // TODO
              continue codeLoop;
            case 0x030411AE:
              // TODO: load int value from previously specified struct field into register?
              continue codeLoop;
            case 0x0203110F:
            case 0x0304118B:
              // TODO: work out what this does?
              continue codeLoop;
            case 0x0003014B:
              var store_value = code[pos++];
              // TODO
              continue codeLoop;
            case 0x0002418B:
            case 0x0003418B:
            case 0x0200144B:
              var script_var_offset = code[pos++];
              // TODO
              continue codeLoop;
            case 0x0000044B:
              var script_var_offset = code[pos++];
              var store_value = code[pos++];
              // TODO
              continue codeLoop;
            case 0x0000044F:
              var script_var_offset = code[pos++];
              var increase_value = code[pos++];
              // TODO
              continue codeLoop;
            case 0x0002110B:
              var unknown = code[pos++];
              if (unknown === 0x00020201) {
                // TODO: work this out (local var vs. script var?)
              }
              else {
                var script_var_offset = code[pos++];
              }
              // TODO
              continue codeLoop;
            case 0x00020113:
            case 0x00020117: // >=
            case 0x00030113:
            case 0x00040113:
            case 0x00040115:
              var value = code[pos++];
              // TODO
              continue codeLoop;
            case 0x00020121:
            case 0x00040121:
            case 0x00000009:
              var jump = code[pos++];
              // TODO
              pos += jump / 4;
              continue codeLoop;
            default:
              console.error('unknown op: ' + op.toString(16));
              return;
          }
        }
      }
      return next_step();
    }
  };
  
  return ScriptV2View;

});
