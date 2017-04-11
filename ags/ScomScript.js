define(function() {

  'use strict';
  
  var regProperties = {
    sp: {
      get: function(){ return this[1]; },
      set: function(v){ this[1] = v; },
      enumerable: true,
    },
    mar: {
      get: function(){ return this[2]; },
      set: function(v){ this[2] = v; },
      enumerable: true,
    },
    ax: {
      get: function(){ return this[3]; },
      set: function(v){ this[3] = v; },
      enumerable: true,
    },
    bx: {
      get: function(){ return this[4]; },
      set: function(v){ this[4] = v; },
      enumerable: true,
    },
    cx: {
      get: function(){ return this[5]; },
      set: function(v){ this[5] = v; },
      enumerable: true,
    },
    op: {
      get: function(){ return this[6]; },
      set: function(v){ this[6] = v; },
      enumerable: true,
    },
    dx: {
      get: function(){ return this[7]; },
      set: function(v){ this[7] = v; },
      enumerable: true,
    },
  };
  
  var regFloatProperties = regProperties;
  
  var regIntProperties = Object.assign({
    asFloat: {
      get: function() {
        var asFloat = Object.defineProperties(
          new Float32Array(this.buffer, this.byteOffset, this.length),
          regFloatProperties);
        Object.defineProperty(this, 'asFloat', {value:asFloat, enumerable:true});
        return asFloat;
      },
      enumerable: true,
      configurable: true,
    },
    types: {
      get: function() {
        var types = Object.defineProperties(new Uint8Array(this.length), regProperties);
        Object.defineProperty(this, 'types', {value:types, enumerable:true});
        types.sp = 6;
        return types;
      },
      enumerable: true,
      configurable: true,
    },
  }, regProperties);
  
  function allocateRegisters() {
    return Object.defineProperties(new Int32Array(8), regIntProperties);
  }
  
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
    get fixups() {
      var list = new Array(this.fixupCount);
      var typesBase = this.fixupsOffset + 4;
      var offsetBase = typesBase + list.length;
      for (var i = 0; i < list.length; i++) {
        var fixup = list[i] = {offset: this.dv.getUint32(offsetBase + i * 4, true)};
        switch (fixup.typeCode = this.bytes[typesBase + i]) {
          case 1: fixup.context = 'code'; fixup.type = 'data'; break;
          case 2: fixup.context = 'code'; fixup.type = 'code'; break;
          case 3: fixup.context = 'code'; fixup.type = 'strings'; break;
          case 4: fixup.context = 'code'; fixup.type = 'import'; break;
          case 5: fixup.context = 'data'; fixup.type = 'data'; break;
          case 6: fixup.context = 'code'; fixup.type = 'stack'; break;
        }
      }
      Object.defineProperty(this, 'fixups', {value:list, enumerable:true});
      return list;
    },
    get importsOffset() {
      return this.fixupsOffset + 4 + this.fixupCount * (1 + 4);
    },
    get imports() {
      var pos = this.importsOffset;
      var offsetCount = this.dv.getUint32(pos, true);
      var list = [];
      list.byOffset = {};
      pos += 4;
      for (var i = 0; i < offsetCount; i++) {
        if (this.bytes[pos] === 0) {
          pos++;
          continue;
        }
        var startPos = pos;
        do { } while (this.bytes[++pos] !== 0);
        var name = String.fromCharCode.apply(null, this.bytes.subarray(startPos, pos));
        pos++;
        list.push(list.byOffset[i] = {name:name, offset:i});
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
        var xport = list[i] = {};
        var startPos = pos;
        while (this.bytes[pos] !== 0) pos++;
        xport.name = String.fromCharCode.apply(null, this.bytes.subarray(startPos, pos));
        pos++;
        xport.offset = this.dv.getUint32(pos, true);
        pos += 4;
        var mangled = xport.name.match(/^([^\$]+)\$(\d+)$/);
        if (mangled) {
          xport.name = mangled[1];
          xport.argCount = +mangled[2];
        }
        xport.type = xport.offset >>> 24;
        if (xport.type === 1) xport.type = 'function';
        else if (xport.type === 2) xport.type = 'data';
        xport.offset &= 0xffffff;
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
    instantiate: function(runtime) {
      return new ScomInstance(runtime, this);
    },
  };
  
  function ScomInstance(runtime, def) {
    this.runtime = runtime;
    this.def = def;
    this.code = this.def.code;
    this.codeFloat = new Float32Array(this.code.buffer, this.code.byteOffset, this.code.length);
    this.codeType = new Uint8Array(this.code.length);
    for (var i = 0; i < def.fixups.length; i++) {
      var fixup = def.fixups[i];
      if (fixup.context === 'code') {
        this.codeType[fixup.offset] = fixup.typeCode;
      }
    }
    this.bytes = new Uint8Array(def.data);
    this.dv = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    this.exports = {};
    for (var i = 0; i < def.exports.length; i++) {
      var xport = def.exports[i];
      if (xport.type === 'function') {
        this.exports[xport.name] = this.runFrom.bind(this, xport.offset);
      }
    }
  }
  ScomInstance.prototype = {
    runFrom: function(offset) {
      const code = this.code,
            codeType = this.codeType,
            codeFloat = this.codeFloat,
            stringTable = this.def.stringTable,
            registers = allocateRegisters(),
            realStack = [],
            dv = this.dv,
            runtime = this.runtime,
            imports = this.def.imports,
            stack = new DataView(new ArrayBuffer(250 * 4)),
            stackTypes = new Uint8Array(250);
      for (var i = 1; i < arguments.length; i++) {
        stack.setInt32(registers.sp, arguments[i], true);
        registers.sp += 4;
      }
      registers.sp += 4; // slot for RET to check to know when to return completely
      var lineNumber = NaN, checkLoops = true;
      function nextStep() {
        codeLoop: for (;;) switch (code[offset++]) {
          case 0: // no-op
            continue codeLoop;
          case 1: // ADD
            var register = code[offset++];
            var value = code[offset++];
            registers[register] += value;
            continue codeLoop;
          case 2: // SUB
            var register = code[offset++];
            var value = code[offset++];
            registers[register] -= value;
            continue codeLoop;
          case 3: // REGTOREG
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers[register2] = registers[register1];
            registers.types[register2] = registers.types[register1];
            continue codeLoop;
          case 4: // WRITELIT
            var writeSize = code[offset++];
            var writeType = (writeSize === 4) ? codeType[offset] : 0;
            var writeValue = code[offset++];
            switch (registers.types.mar) {
              case 6:
                switch (writeSize) {
                  case 1:
                    stack.setUint8(registers.mar, writeValue);
                    stackTypes[registers.mar/4] = 0;
                    break;
                  case 2:
                    stack.setInt16(registers.mar, writeValue, true);
                    stackTypes[registers.mar/4] = 0;
                    break;
                  case 4:
                    stack.setInt32(registers.mar, writeValue, true);
                    stackTypes[registers.mar/4] = writeType;
                    break;
                  default:
                    throw new Error('unsupported WRITELIT value size: ' + writeSize);
                }
                break;
              default:
                console.error('unsupported WRITELIT target: ' + registers.types.mar);
                break;
            }
            continue codeLoop;
          case 5: // RET
            registers.sp -= 4;
            offset = stack.getInt32(registers.sp, true);
            if (offset === 0) {
              return registers.ax;
            }
            continue codeLoop;
          case 6: // LITTOREG
            var register = code[offset++];
            var type = codeType[offset];
            var value = code[offset++];
            registers[register] = value;
            registers.types[register] = type;
            continue codeLoop;
          case 7: // MEMREAD
            var register = code[offset++];
            switch (registers.types.mar) {
              case 1:
                registers[register] = dv.getInt32(registers.mar, true);
                registers.types[register] = 0; // TODO: in-data fixups?
                break;
              case 4:
                var i;
                for (i = imports.length-1; i >= 0; i--) {
                  if (registers.mar >= imports[i].offset) {
                    break;
                  }
                }
                if (i < 0) {
                  throw new Error('bad data access');
                }
                var dataObject = imports[i];
                var dataOffset = registers.mar - dataObject.offset;
                registers[register] = runtime.rawPeek(dataObject.name + '+' + dataOffset, 4);
                registers.types[register] = 0;
                break;
              case 6:
                registers[register] = stack.getInt32(registers.mar, true);
                registers.types[register] = stackTypes[registers.mar/4];
                break;
              default:
                console.error('NYI: read memory type ' + registers.types.mar);
                registers[register] = 0;
                registers.types[register] = 0;
                break;
            }
            continue codeLoop;
          case 8: // MEMWRITE
            var register = code[offset++];
            switch (registers.types.mar) {
              case 1:
                dv.setInt32(registers.mar, registers[register], true);
                break;
              case 4:
                var i;
                for (i = imports.length-1; i >= 0; i--) {
                  if (registers.mar >= imports[i].offset) {
                    break;
                  }
                }
                if (i < 0) {
                  throw new Error('bad data access');
                }
                var dataObject = imports[i];
                var dataOffset = registers.mar - dataObject.offset;
                runtime.rawPoke(dataObject.name + '+' + dataOffset, 4, registers[register]);
                break;
              case 6:
                stack.setInt32(registers.mar, registers[register], true);
                stackTypes[registers.mar/4] = registers.types[register];
                break;
              default:
                console.error('NYI: write memory type ' + registers.types.mar);
                break;
            }
            continue codeLoop;
          case 9: // MULREG
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers[register1] *= registers[register2];
            continue codeLoop;
          case 10: // DIVREG
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers[register1] /= registers[register2];
            continue codeLoop;
          case 11: // ADDREG
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers[register1] += registers[register2];
            continue codeLoop;
          case 12: // SUBREG
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers[register1] -= registers[register2];
            continue codeLoop;
          case 13: // BITAND
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers[register1] &= registers[register2];
            continue codeLoop;
          case 14: // BITOR
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers[register1] |= registers[register2];
            continue codeLoop;
          case 15: // ISEQUAL
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers[register1] = registers[register1] === registers[register2];
            continue codeLoop;
          case 16: // NOTEQUAL
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers[register1] = registers[register1] !== registers[register2];
            continue codeLoop;
          case 17: // GREATER
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers[register1] = registers[register1] > registers[register2];
            continue codeLoop;
          case 18: // LESSTHAN
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers[register1] = registers[register1] < registers[register2];
            continue codeLoop;
          case 19: // GTE
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers[register1] = registers[register1] >= registers[register2];
            continue codeLoop;
          case 20: // LTE
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers[register1] = registers[register1] <= registers[register2];
            continue codeLoop;
          case 21: // AND
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers[register1] = !!(registers[register1] && registers[register2]);
            continue codeLoop;
          case 22: // OR
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers[register1] = !!(registers[register1] || registers[register2]);
            continue codeLoop;
          case 23: // CALL
            var register = code[offset++];
            stack.setInt32(registers.sp, offset, true);
            registers.sp += 4;
            offset = registers[register];
            continue codeLoop;
          case 24: // MEMREADB
            var register = code[offset++];
            switch (registers.types.mar) {
              case 1:
                registers[register] = dv.getUint8(registers.mar, true);
                registers.types[register] = 0; // TODO: in-data fixups?
                break;
              default:
                console.error('NYI: read memory type ' + registers.types.mar);
                registers[register] = 0;
                registers.types[register] = 0;
                break;
            }
            continue codeLoop;
          case 25: // MEMREADW
            var register = code[offset++];
            switch (registers.types.mar) {
              case 1:
                registers[register] = dv.getInt16(registers.mar, true);
                registers.types[register] = 0; // TODO: in-data fixups?
                break;
              case 4:
                var i;
                for (i = imports.length-1; i >= 0; i--) {
                  if (registers.mar >= imports[i].offset) {
                    break;
                  }
                }
                if (i < 0) {
                  throw new Error('bad data access');
                }
                var dataObject = imports[i];
                var dataOffset = registers.mar - dataObject.offset;
                var value = 0;
                registers[register] = runtime.rawPeek(dataObject.name + '+' + dataObject, 2);
                registers.types[register] = 0;
                break;
              default:
                console.error('NYI: read memory type ' + registers.types.mar);
                registers[register] = 0;
                registers.types[register] = 0;
                break;
            }
            continue codeLoop;
          case 26: // MEMWRITEB
            var register = code[offset++];
            switch (registers.types.mar) {
              case 1:
                dv.setUint8(registers.mar, registers[register], true);
                break;
              case 4:
                var i;
                for (i = imports.length-1; i >= 0; i--) {
                  if (registers.mar >= imports[i].offset) {
                    break;
                  }
                }
                if (i < 0) {
                  throw new Error('bad data access');
                }
                var dataObject = imports[i];
                var dataOffset = registers.mar - dataObject.offset;
                runtime.rawPoke(dataObject.name + '+' + dataOffset, registers[register], 1);
                break;
              default:
                console.error('NYI: write memory type ' + registers.types.mar);
                break;
            }
            continue codeLoop;
          case 27: // MEMWRITEW
            var register = code[offset++];
            switch (registers.types.mar) {
              case 1:
                dv.setInt16(registers.mar, registers[register], true);
                break;
              default:
                console.error('NYI: write memory type ' + registers.types.mar);
                break;
            }
            continue codeLoop;
          case 28: // JZ
            var label = code[offset++];
            if (registers.ax === 0) offset += label;
            continue codeLoop;
          case 29: // PUSHREG
            var register = code[offset++];
            if (code[offset] === 30) {
              // immediate POPREG
              var register2 = code[offset + 1];
              offset += 2;
              registers[register2] = registers[register];
              registers.types[register2] = registers[register];
              continue codeLoop;
            }
            stack.setInt32(registers.sp, registers[register], true);
            stackTypes[registers.sp/4] = registers.types[register];
            registers.sp += 4;
            continue codeLoop;
          case 30: // POPREG
            var register = code[offset++];
            registers.sp -= 4;
            registers[register] = stack.getInt32(registers.sp, true);
            registers.types[register] = stackTypes[registers.sp/4];
            continue codeLoop;
          case 31: // JMP
            var label = code[offset++];
            offset += label;
            continue codeLoop;
          case 32: // MUL
            var register = code[offset++];
            var value = code[offset++];
            registers[register] *= value;
            continue codeLoop;
          case 33: // CALLEXT
            var register = code[offset++];
            var func = imports.byOffset[registers[register]];
            if (typeof runtime[func.name] === 'function') {
              var args = realStack.slice();
              for (var i = 0; i < args.length; i++) {
                if (args[i] instanceof Uint8Array && !runtime[func.name].passStringsByRef) {
                  args[i] = String.fromCharCode.apply(null, args[i].subarray(0, args[i].indexOf(0)));
                }
              }
              var result = runtime[func.name].apply(runtime, args);
              if (result instanceof Promise) {
                return result.then(function(result) {
                  // TODO: handle non-int return types
                  registers[register] = result;
                  registers.types[register] = 0;
                  return nextStep();
                });
              }
              else {
                 // TODO: handle non-int return types
                registers[register] = result;
                registers.types[register] = 0;
              }
            }
            else {
              console.log(func.name, realStack);
              registers[register] = 0;
              registers.types[register] = 0;
            }
            continue codeLoop;
          case 34: // PUSHREAL
            var register = code[offset++];
            switch (registers.types[register]) {
              case 3: // strings
                var startPos = registers[register];
                var endPos = startPos;
                while (endPos < stringTable.length && stringTable[endPos] !== 0) endPos++;
                var str = String.fromCharCode.apply(null, stringTable.subarray(startPos, endPos));
                realStack.unshift(str);
                break;
              case 6: // stack addresses
                realStack.unshift(new Uint8Array(stack.buffer, registers[register]));
                break;
              default:
                realStack.unshift(registers[register]);
                break;
            }
            continue codeLoop;
          case 35: // SUBREALSTACK
            var value = code[offset++];
            realStack.splice(-value, value);
            continue codeLoop;
          case 36: // LINENUM
            lineNumber = code[offset++];
            continue codeLoop;
          case 37: // CALLAS
            var register = code[offset++];
            console.error('NYI: CALLAS');
            continue codeLoop;
          case 38: // THISBASE
            var value = code[offset++];
            //console.error('NYI: THISBASE');
            continue codeLoop;
          case 39: // NUMFUNCARGS
            var value = code[offset++];
            console.error('NYI: NUMFUNCARGS');
            continue codeLoop;
          case 40: // MODREG
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers[register1] = registers[register1] % registers[register2];
            continue codeLoop;
          case 41: // XORREG
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers[register1] ^= registers[register2];
            continue codeLoop;
          case 42: // NOTREG
            var register = code[offset++];
            registers[register1] = !registers[register1];
            continue codeLoop;
          case 43: // SHIFTLEFT
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers[register1] <<= registers[register2];
            continue codeLoop;
          case 44: // SHIFTRIGHT
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers[register1] >>= registers[register2];
            continue codeLoop;
          case 45: // CALLOBJ
            var register = code[offset++];
            console.error('NYI: CALLOBJ');
            continue codeLoop;
          case 46: // CHECKBOUNDS
            var register = code[offset++];
            var value = code[offset++];
            if (registers[register] < 0 || registers[register] > value) {
              throw new RangeError(registers[register] + ' out of bounds (must be in range 0..' + value + ')');
            }
            continue codeLoop;
          case 47: // MEMWRITEPTR
            var register = code[offset++];
            console.error('NYI: MEMWRITEPTR');
            continue codeLoop;
          case 48: // MEMREADPTR
            var register = code[offset++];
            console.error('NYI: MEMREADPTR');
            continue codeLoop;
          case 49: // MEMZEROPTR
            console.error('NYI: MEMZEROPTR');
            continue codeLoop;
          case 50: // MEMINITPTR
            var register = code[offset++];
            console.error('NYI: MEMINITPTR');
            continue codeLoop;
          case 51: // LOADSPOFFS
            var value = code[offset++];
            console.error('NYI: LOADSPOFFS');
            continue codeLoop;
          case 52: // CHECKNULL
            if (!registers.mar) {
              throw new Error('null reference');
            }
            continue codeLoop;
          case 53: // FADD
            var register = code[offset++];
            var value = code[offset++]; // correct that arg is int, not float
            registers.asFloat[register] += value;
            continue codeLoop;
          case 54: // FSUB
            var register = code[offset++];
            var value = code[offset++]; // correct that arg is int, not float
            registers.asFloat[register] -= value;
            continue codeLoop;
          case 55: // FMULREG
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers.asFloat[register1] *= registers.asFloat[register2];
            continue codeLoop;
          case 56: // FDIVREG
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers.asFloat[register1] /= registers.asFloat[register2];
            continue codeLoop;
          case 57: // FADDREG
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers.asFloat[register1] += registers.asFloat[register2];
            continue codeLoop;
          case 58: // FSUBREG
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers.asFloat[register1] -= registers.asFloat[register2];
            continue codeLoop;
          case 59: // FGREATER
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers[register1] = registers.asFloat[register1] > registers.asFloat[register2];
            continue codeLoop;
          case 60: // FLESSTHAN
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers[register1] = registers.asFloat[register1] < registers.asFloat[register2];
            continue codeLoop;
          case 61: // FGTE
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers[register1] = registers.asFloat[register1] >= registers.asFloat[register2];
            continue codeLoop;
          case 62: // FLTE
            var register1 = code[offset++];
            var register2 = code[offset++];
            registers[register1] = registers.asFloat[register1] <= registers.asFloat[register2];
            continue codeLoop;
          case 63: // ZEROMEMORY
            var value = code[offset++];
            console.error('NYI: ZEROMEMORY');
            continue codeLoop;
          case 64: // CREATESTRING
            var register = code[offset++];
            console.error('NYI: CREATESTRING');
            continue codeLoop;
          case 65: // STRINGSEQUAL
            var register1 = code[offset++];
            var register2 = code[offset++];
            console.error('NYI: STRINGSEQUAL');
            continue codeLoop;
          case 66: // STRINGSNOTEQ
            var register1 = code[offset++];
            var register2 = code[offset++];
            console.error('NYI: STRINGSNOTEQ');
            continue codeLoop;
          case 67: // CHECKNULLREG
            var register = code[offset++];
            if (!registers[register]) {
              throw new Error('null reference');
            }
            continue codeLoop;
          case 68: // LOOPCHECKOFF
            checkLoops = false;
            continue codeLoop;
          case 69: // MEMZEROPTRND
            continue codeLoop;
          case 70: // JNZ
            var label = code[offset++];
            if (registers.ax !== 0) {
              offset += label;
            }
            continue codeLoop;
          case 71: // DYNAMICBOUNDS
            var register = code[offset++];
            console.error('NYI: DYNAMICBOUNDS');
            continue codeLoop;
          case 72: // NEWARRAY
            var register = code[offset++];
            var value1 = code[offset++];
            var value2 = code[offset++];
            console.error('NYI: NEWARRAY');
            continue codeLoop;
          default:
            throw new Error('unknown opcode: 0x' + code[--offset].toString(16));
        }
      }
      return nextStep();
    },
  };
  
  return ScomScript;

});
