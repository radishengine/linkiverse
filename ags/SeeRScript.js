define(['./util'], function(util) {

  'use strict';
  
  function SeeRScript(buffer, byteOffset, byteLength) {
    var dv = this.dv = new DataView(buffer, byteOffset, byteLength);
    var bytes = this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  SeeRScript.prototype = {
    instantiate: function(runtime) {
      return new SeeRInstance(runtime, this);
    },
    get signature() {
      return util.byteString(this.bytes, 0, 8);
    },
    get hasValidSignature() {
      return this.signature === 'SeeRVPCU';
    },
    get version() {
      return this.dv.getUint16(10, true) + (this.dv.getUint16(8, true) / 100);
    },
    get endOffset() {
      return this.dv.getUint32(12, true);
    },
    get headerByteLength() {
      return this.dv.getUint32(16, true);
    },
    get symbolsOffset() {
      return this.dv.getUint32(20, true);
    },
    get codeOffset() {
      return this.dv.getUint32(24, true);
    },
    get constsOffset() {
      return this.dv.getUint32(28, true);
    },
    get initOffset() {
      return this.dv.getUint32(32, true);
    },
    get codeByteLength() {
      return this.dv.getUint32(36, true);
    },
    get dataByteLength() {
      return this.dv.getUint32(40, true);
    },
    get constsByteLength() {
      return this.dv.getUint32(44, true);
    },
    get stackSize() {
      return this.dv.getUint32(48, true);
    },
    get importsOffset() {
      return this.dv.getUint32(56, true);
    },
    get constructOffset() {
      return this.dv.getUint32(60, true);
    },
    get destructOffset() {
      return this.dv.getUint32(64, true);
    },
    // TODO: TITL, AUTH
    get symbols() {
      const baseOffset = this.symbolsOffset;
      var symbols = [], bytes = this.bytes, dv = this.dv, pos = baseOffset;
      while (bytes[pos] !== 0) {
        var nameStart = pos;
        do { } while (bytes[++pos] !== 0);
        var name = String.fromCharCode.apply(null, bytes.subarray(nameStart, pos));
        do { } while ((++pos % 4) !== 0);
        var ref = pos - baseOffset;
        var entryPoint = dv.getInt32(pos, true);
        pos += 4;
        var argAllocation = dv.getInt32(pos, true);
        pos += 4;
        symbols.push({
          name: name,
          ref: ref,
          entryPoint: entryPoint,
          argAllocation: argAllocation,
        });
      }
      Object.defineProperty(this, 'symbols', {value:symbols, enumerable:true});
      return symbols;
    },
    get imports() {
      const baseOffset = this.importsOffset;
      var imports = [], bytes = this.bytes, dv = this.dv, pos = baseOffset;
      while (bytes[pos] !== 0) {
        var nameStart = pos;
        do { } while (bytes[++pos] !== 0);
        var name = String.fromCharCode.apply(null, bytes.subarray(nameStart, pos));
        do { } while ((++pos % 4) !== 0);
        var ref = pos - baseOffset;
        pos += 4;
        var argAllocation = dv.getInt32(pos, true);
        pos += 4;
        imports.push({
          name: name,
          ref: ref,
          argAllocation: argAllocation,
        });
      }
      Object.defineProperty(this, 'imports', {value:imports, enumerable:true});
      return imports;
    },
    get importsByRef() {
      var byRef = {};
      for (var i = 0; i < this.imports.length; i++) {
        byRef[this.imports[i].ref] = this.imports[i];
      }
      Object.defineProperty(this, 'importsByRef', {value:byRef, enumerable:true});
      return byRef;
    },
    get code() {
      var code = this.bytes.subarray(this.codeOffset, this.codeOffset + this.codeByteLength);
      Object.defineProperty(this, 'code', {value:code, enumerable:true});
      return code;
    },
    get data() {
      var data = this.bytes.subarray(this.dataOffset, this.dataOffset + this.dataByteLength);
      Object.defineProperty(this, 'data', {value:data, enumerable:true});
      return data;
    },
    get consts() {
      var consts = this.bytes.subarray(this.constsOffset, this.constsOffset + this.constsByteLength);
      Object.defineProperty(this, 'consts', {value:consts, enumerable:true});
      return consts;
    },
    get constsDV() {
      var dv = new DataView(this.consts.buffer, this.consts.byteOffset, this.consts.byteLength);
      Object.defineProperty(this, 'constsDV', {value:dv, enumerable:true});
      return dv;      
    },
  };
  
  function SeeRInstance(runtime, def) {
    this.runtime = runtime;
    this.def = def;
    this.data = new Uint8Array(def.data);
    this.dataDV = new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength);
    this.exports = {};
    for (var i = 0; i < def.symbols.length; i++) {
      var symbol = def.symbols[i];
      if (symbol.entryPoint >= 0) {
        this.exports[symbol.name] = this.runFrom.bind(this, symbol.entryPoint, symbol.argAllocation);
      }
      else {
        // TODO: exported variables
      }
    }
  }
  const OP_ARG_COUNT = new Uint8Array(0x40);
  for (var i = 0x01; i <= 0x0A; i++) {
    OP_ARG_COUNT[i] = 1;
  }
  for (var i = 0x0B; i <= 0x36; i++) {
    OP_ARG_COUNT[i] = 2;
  }
  const SLOT_INT = 0;
  const SLOT_CONST = 1;
  const SLOT_STACK = 2;
  const SLOT_DATA = 3;
  const SLOT_IMPORT = 4;
  const SLOT_NAMED_OFFSET = 5;
  const registerProperties = {
    cs: {
      get: function(){ return this[0]; },
      set: function(v){ this[0] = v; },
      enumerable: true,
    },
    ds: {
      get: function(){ return this[1]; },
      set: function(v){ this[1] = v; },
      enumerable: true,
    },
    es: {
      get: function(){ return this[2]; },
      set: function(v){ this[2] = v; },
      enumerable: true,
    },
    ss: {
      get: function(){ return this[3]; },
      set: function(v){ this[3] = v; },
      enumerable: true,
    },
    ip: {
      get: function(){ return this[4]; },
      set: function(v){ this[4] = v; },
      enumerable: true,
    },
    sp: {
      get: function(){ return this[5]; },
      set: function(v){ this[5] = v; },
      enumerable: true,
    },
    bp: {
      get: function(){ return this[6]; },
      set: function(v){ this[6] = v; },
      enumerable: true,
    },
    cx: {
      get: function(){ return this[7]; },
      set: function(v){ this[7] = v; },
      enumerable: true,
    },
  };
  SeeRInstance.prototype = {
    runFrom: function(pos, argAllocation) {
      var code = this.def.code,
          consts = this.def.consts,
          constsDV = this.def.constsDV,
          importsByRef = this.def.importsByRef,
          data = this.data,
          dataDV = this.dataDV,
          symbols = this.def.symbols,
          runtime = this.runtime,
          stack = new DataView(new ArrayBuffer(this.def.stackSize)),
          stackTypes = new Uint8Array(this.def.stackSize/4);
      var registers = new Int32Array(8);
      var registerTypes = new Uint8Array(8);
      Object.defineProperties(registers, registerProperties);
      Object.defineProperties(registerTypes, registerProperties);
      var namedOffsets = [];
      function allocNamedOffset(v) {
        if (v in namedOffsets) return namedOffsets[v];
        if (namedOffsets.length >= 10) {
          findingFreeSlot: for (var i = 0; i < namedOffsets.length; i++) {
            for (var j = 0; j < registers.length; j++) {
              if (registerTypes[j] === SLOT_NAMED_OFFSET && registers[j] === i) {
                continue findingFreeSlot;
              }
            }
            for (var j = registers.sp; j < registers.ss; j += 4) {
              if (stackTypes[j >>> 2] === SLOT_NAMED_OFFSET && stack.getInt32(j, true) === i) {
                continue findingFreeSlot;
              }
            }
            delete namedOffsets[namedOffsets[i]];
            namedOffsets[i] = v;
            namedOffsets[v] = i;
            return i;
          }
        }
        return namedOffsets[v] = namedOffsets.push(v) - 1;
      }
      registerTypes.ds = SLOT_DATA;
      registerTypes.es = SLOT_CONST;
      registerTypes.sp = SLOT_STACK;
      registerTypes.ss = SLOT_STACK; 
      registerTypes.bp = SLOT_STACK;
      registers.sp = registers.ss = registers.bp = stack.byteLength;
      registers.sp -= argAllocation;
      for (var i = 2; i < arguments.length; i--) {
        // TODO: non-int args
        stack.setInt32(registers.sp + (i-2) * 4, arguments[i], true);
      }
      function nextStep() {
        var arg1IsPointer, arg1PointerBase, arg1IsRegister, arg1Register, arg1Value, arg1Type,
            arg2IsPointer, arg2PointerBase, arg2IsRegister, arg2Register, arg2Value, arg2Type;
        codeLoop: for (;;) {
          var op = code[pos++];
          switch (OP_ARG_COUNT[op & 0x3F]) {
            case 0: break;
            case 1:
              arg1IsPointer = code[pos] & 1;
              arg1PointerBase = (code[pos] >> 2) & 3;
              arg1IsRegister = code[pos] & 2;
              arg1Register = code[pos + 1] & 7;
              pos += 3;
              if (arg1IsRegister) {
                arg1Value = registers[arg1Register];
                arg1Type = registerTypes[arg1Register];
              }
              else {
                arg1Value = code[pos] | (code[pos+1] << 8) | (code[pos+2] << 16) | (code[pos+3] << 24);
                arg1Type = SLOT_INT;
                pos += 4;
              }
              if (arg1IsPointer) switch (arg1PointerBase) {
                case 0:
                  arg1Type = SLOT_IMPORT;
                  break;
                case 1:
                  arg1Value += registers.es;
                  arg1Type = registerTypes.es;
                  break;
                case 2:
                  arg1Value += registers.ds;
                  arg1Type = registerTypes.ds;
                  break;
                case 3:
                  arg1Value += registers.bp;
                  arg1Type = registerTypes.bp;
                  break;
              }
              break;
            case 2:
              arg1IsPointer = op & 0x40;
              arg1PointerBase = (code[pos] >> 1) & 3;
              arg1IsRegister = code[pos] & 1;
              arg1Register = code[pos + 1] & 7;
              arg2IsPointer = op & 0x80;
              arg2PointerBase = (code[pos] >> 5) & 3;
              arg2IsRegister = code[pos] & 0x10;
              arg2Register = code[pos + 2] & 7;
              pos += 3;
              if (arg1IsRegister) {
                arg1Value = registers[arg1Register];
                arg1Type = registerTypes[arg1Register];
              }
              else {
                arg1Value = code[pos] | (code[pos+1] << 8) | (code[pos+2] << 16) | (code[pos+3] << 24);
                arg1Type = SLOT_INT;
                pos += 4;
              }
              if (arg2IsRegister) {
                arg2Value = registers[arg2Register];
                arg2Type = registerTypes[arg2Register];
              }
              else {
                arg2Value = code[pos] | (code[pos+1] << 8) | (code[pos+2] << 16) | (code[pos+3] << 24);
                arg2Type = SLOT_INT;
                pos += 4;
              }
              if (arg2IsPointer) switch (arg2PointerBase) {
                case 0:
                  arg2Type = SLOT_IMPORT;
                  break;
                case 1:
                  arg2Value += registers.es;
                  arg2Type = registerTypes.es;
                  break;
                case 2:
                  arg2Value += registers.ds;
                  arg2Type = registerTypes.ds;
                  break;
                case 3:
                  arg2Value += registers.bp;
                  arg2Type = registerTypes.bp;
                  break;
              }
              break;
          }
          switch (op & 0x3F) {
            case 0x00: // EXTENDED
              var extended = op | (code[pos] << 8) | (code[pos+1] << 16) | (code[pos+2] << 24);
              pos += 3;
              if (extended === 0x12345600 /* EXPR */) {
                // marks the end of an expression, for interrupts
              }
              else {
                console.error('unknown SeeR extended opcode: 0x' + extended.toString(16));
              }
              continue codeLoop;
            case 0x01: // PUSH
              switch (arg1Type) {
                case SLOT_INT:
                  stack.setInt32(registers.sp -= 4, arg1Value, true);
                  stackTypes[registers.sp >>> 2] = SLOT_INT;
                  break;
                case SLOT_CONST:
                  stack.setInt32(registers.sp -= 4, constsDV.getInt32(arg1Value, true), true);
                  stackTypes[registers.sp >>> 2] = SLOT_INT;
                  break;
                case SLOT_STACK:
                  stack.setInt32(registers.sp -= 4, stack.getInt32(arg1Value, true), true);
                  stackTypes[registers.sp >>> 2] = stackTypes[arg1Value >>> 2];
                  break;
                case SLOT_DATA:
                  stack.setInt32(registers.sp -= 4, dataDV.getInt32(arg1Value, true), true);
                  stackTypes[registers.sp >>> 2] = SLOT_INT;
                  break;
                case SLOT_IMPORT:
                  var external = importsByRef[arg1Value];
                  if (!external) {
                    return console.error('SeeR: invalid import ref ' + arg1Value);
                  }
                  if (external.argAllocation !== -1) {
                    return console.error('SeeR: attempt to PUSH from ' + external.name + '()');
                  }
                  stack.setInt32(registers.sp -= 4, runtime.rawPeek(external.name + '+0', 4), true);
                  stackTypes[registers.sp >>> 2] = SLOT_INT;
                  break;
                case SLOT_NAMED_OFFSET:
                  stack.setInt32(registers.sp -= 4, runtime.rawPeek(namedOffsets[arg1Value], 4), true);
                  stackTypes[registers.sp >>> 2] = SLOT_INT;
                  break;
                default:
                  console.error('NYI: SeeR PUSH with type ' + arg1Type);
                  return;
              }
              continue codeLoop;
            case 0x02: // PUSHADR
              stack.setInt32(registers.sp -= 4, arg1Value, true);
              stackTypes[registers.sp >>> 2] = arg1Type;
              continue codeLoop;
            case 0x03: // DPUSH
              return console.error('NYI: SeeR DPUSH');
              continue codeLoop;
            case 0x04: // POP
              if (!arg1IsRegister) {
                return console.error('NYI: POP to non-register');
              }
              registers[arg1Register] = stack.getInt32(registers.sp, true);
              registerTypes[arg1Register] = stackTypes[registers.sp >>> 2];
              registers.sp += 4;
              continue codeLoop;
            case 0x05: // NEG  bin:-1-ARG+1=-ARG
              if (!arg1IsRegister) {
                return console.error('NYI: NEG non-register');
              }
              if (arg1Type !== SLOT_INT) {
                return console.error('NYI: NEG type ' + arg1Type);
              }
              registers[arg1Register] = -arg1Value;
              continue codeLoop;
            case 0x06: // DNEG
              return console.error('NYI: SeeR DNEG');
              continue codeLoop;
            case 0x07: // NOT  !
              if (!arg1IsRegister) {
                return console.error('NYI: NOT non-register');
              }
              registers[arg1Register] = !arg1Value;
              registerTypes[arg1Register] = SLOT_INT;
              continue codeLoop;
            case 0x08: // OPTIONS  optionvcpu* set or not
              return console.error('NYI: SeeR OPTIONS');
              continue codeLoop;
            case 0x09: // JMP
              pos += arg1Value;
              continue codeLoop;
            case 0x0A: // CALL
              console.warn('SeeR local CALL');
              stack.setInt32(registers.sp -= 4, pos, true);
              pos = arg1Value;
              continue codeLoop;
            case 0x0B: // MOV  copies 4bytes
              var copyValue, copyType;
              switch (arg2Type) {
                case SLOT_INT:
                  copyValue = arg2Value;
                  copyType = SLOT_INT;
                  break;
                case SLOT_CONST:
                  copyValue = constsDV.getInt32(arg2Value, true);
                  copyType = SLOT_INT;
                  break;
                case SLOT_STACK:
                  copyValue = stack.getInt32(arg2Value, true);
                  copyType = stackTypes[registers.sp/4];
                  break;
                case SLOT_DATA:
                  copyValue = dataDV.getInt32(arg2Value, true);
                  copyType = SLOT_INT;
                  break;
                case SLOT_IMPORT:
                  copyType = SLOT_INT;
                  var external = importsByRef[arg2Value];
                  if (!external) {
                    return console.error('SeeR: invalid import address ' + arg2Value);
                  }
                  if (external.argAllocation !== -1) {
                    return console.error('SeeR: attempt to MOV from ' + external.name + '()');
                  }
                  copyValue = runtime.rawPeek(external.name+'+0', 4);
                  break;
                case SLOT_NAMED_OFFSET:
                  copyValue = runtime.rawPeek(namedOffsets[arg2Value], 4);
                  copyType = SLOT_INT;
                  break;
                default:
                  console.error('NYI: SeeR MOV from type ' + arg2Type);
                  copyValue = 0;
                  copyType = SLOT_INT;
                  break;
              }
              switch (arg1Type) {
                case SLOT_STACK:
                  stack.setInt32(arg1Value, copyValue, true);
                  stackTypes[arg1Value/4] = copyType;
                  break;
                case SLOT_DATA:
                  dataDV.setInt32(arg1Value, copyValue, true);
                  break;
                case SLOT_IMPORT:
                  var external = importsByRef[arg1Value];
                  if (!external) {
                    return console.error('SeeR: invalid import address ' + arg1Value);
                  }
                  if (external.argAllocation !== -1) {
                    return console.error('SeeR: attempt to MOV to ' + external.name + '()');
                  }
                  runtime.rawPoke(external.name+'0', 4, copyValue);
                  break;
                case SLOT_NAMED_OFFSET:
                  runtime.rawPoke(namedOffsets[arg1Value], 4, copyValue);
                  break;
                default:
                  console.error('NYI: SeeR MOV to type ' + arg1Type);
                  return;
              }
              continue codeLoop;
            case 0x0C: // XCHG
              return console.error('NYI: SeeR XCHG');
              continue codeLoop;
            case 0x0D: // CALLEX
              if (arg1Type !== SLOT_IMPORT) {
                return console.error('NYI: SeeR CALLEX on type ' + arg1Type);
              }
              var external = importsByRef[arg1Value];
              if (!external) {
                return console.error('invalid SeeR import ref: ' + arg1Value);
              }
              var argCount = arg2Value & 0xffff;
              if (argCount !== external.argAllocation) {
                if (external.argAllocation === -1) {
                  console.error('attempt to call non-function: ' + external.name);
                }
                else {
                  console.error('wrong arg allocation (expected ' + external.argAllocation + ', got ' + argCount + ')');
                }
                return;
              }
              var isVoid = arg2Value & 0x400000;
              var structMode = (arg2Value >> 23) & 7;
              structMode = (structMode < 2) ? !!structMode : 1 << (structMode - 2);
              var callingFromOtherInstance = arg2Value & 0x4000000;
              var resultType = (arg2Value & 0x8000000) ? 'double' : 'int';
              if (resultType === 'double') {
                console.error('NYI: SeeR call with double result');
                return;
              }
              var isMember = arg2Value & 0x10000000;
              var dispatcher = arg2Value >>> 29;
              if (typeof runtime[external.name] !== 'function') {
                console.error('NYI: ' + external.name + '()');
                if (!isVoid) {
                  registers[0] = 0;
                  registerTypes[0] = SLOT_INT;
                }
                continue codeLoop;
              }
              var args = [];
              for (var i = 0; i < argCount; i++) {
                var v = stack.getInt32(registers.sp + i*4, true);
                switch (stackTypes[(registers.sp >>> 2) + i]) {
                  case SLOT_INT:
                    args.push(v);
                    break;
                  case SLOT_CONST:
                    args.push(consts.subarray(v));
                    break;
                  case SLOT_STACK:
                    args.push(new Uint8Array(stack.buffer, stack.byteOffset + v, stack.byteLength - v));
                    break;
                  case SLOT_DATA:
                    args.push(data.subarray(v));
                    break;
                  default:
                    console.error('NYI: SeeR arg type: ' + stackTypes[(registers.sp >>> 2) + i]);
                    args.push(v);
                    break;
                }
              }
              var result = runtime[external.name].apply(runtime, args);
              if (result instanceof Promise) {
                if (!isVoid) {
                  result = result.then(function(result) {
                    registers[0] = result;
                    registerTypes[0] = SLOT_INT;
                  });
                }
                return result.then(nextStep);
              }
              if (!isVoid) {
                registers[0] = result;
                registerTypes[0] = SLOT_INT;
              }
              continue codeLoop;
            case 0x0E: // COPY  dest,src:copy CX-bytes from source to dest,CX=1
              return console.error('NYI: SeeR COPY');
              continue codeLoop;
            case 0x0F: // ADD
              if (!arg1IsRegister) {
                return console.error('NYI: ADD to non-register');
              }
              if (arg2Type !== SLOT_INT) {
                return console.error('NYI: ADD type ' + arg2Type + ' to type ' + arg1Type);
              }
              if (arg2Value === 0) {
                continue codeLoop;
              }
              switch (arg1Type) {
                case SLOT_IMPORT:
                  var external = importsByRef[arg1Value];
                  if (!external) {
                    return console.error('SeeR: invalid import ref ' + arg1Value);
                  }
                  if (external.argAllocation !== -1) {
                    return console.error('SeeR: attempt to add to ' + external.name + '()');
                  }
                  if (arg2Value < 0) {
                    return console.error('SeeR: negative offset from ' + external.name);
                  }
                  registers[arg1Register] = allocNamedOffset(external.name + '+' + arg2Value);
                  break;
                case SLOT_NAMED_OFFSET:
                  var parts = namedOffsets[arg1Value].split('+');
                  if ((parts[1] += arg2Value) < 0) {
                    return console.error('SeeR: negative offset from ' + parts[0]);
                  }
                  registers[arg1Register] = allocNamedOffset(parts.join('+'));
                  break;
                default:
                  registers[arg1Register] += arg2Value;
                  break;
              }
              continue codeLoop;
            case 0x10: // SUB
              if (!arg1IsRegister) {
                return console.error('NYI: SUB from non-register');
              }
              if (arg2Type !== SLOT_INT) {
                if (arg2Type !== arg1Type) {
                  return console.error('NYI: SUB type ' + arg2Type + ' from type ' + arg1Type);
                }
                registerTypes[arg1Register] = registerTypes[arg2Register] = SLOT_INT;
              }
              if (arg2Value === 0) {
                continue codeLoop;
              }
              switch (arg1Type) {
                case SLOT_IMPORT:
                  var external = importsByRef[arg1Value];
                  if (!external) {
                    return console.error('SeeR: invalid import ref ' + arg1Value);
                  }
                  if (external.argAllocation !== -1) {
                    return console.error('SeeR: attempt to add to ' + external.name + '()');
                  }
                  if (arg2Value > 0) {
                    return console.error('SeeR: negative offset from ' + external.name);
                  }
                  registers[arg1Register] = allocNamedOffset(external.name + '+' + (-arg2Value));
                  break;
                case SLOT_NAMED_OFFSET:
                  var parts = namedOffsets[arg1Value].split('+');
                  if ((parts[1] -= arg2Value) < 0) {
                    return console.error('SeeR: negative offset from ' + external.name);
                  }
                  registers[arg1Register] = allocNamedOffset(parts.join('+'));
                  break;
                default:
                  registers[arg1Register] -= arg2Value;
                  break;
              }
              continue codeLoop;
            case 0x11: // MUL
              if (!arg1IsRegister) return console.error('NYI: MUL on non-register');
              if (arg1Type !== SLOT_INT || arg2Type !== SLOT_INT) {
                console.error('NYI: MUL type ' + arg1Type + ' by type ' + arg2Type);
                return;
              }
              // TODO: imul32 overflow semantics?
              registers[arg1Register] *= arg2Value;
              continue codeLoop;
            case 0x12: // DIV
              if (!arg1IsRegister) return console.error('NYI: DIV on non-register');
              if (arg1Type !== SLOT_INT || arg2Type !== SLOT_INT) {
                console.error('NYI: DIV type ' + arg1Type + ' by type ' + arg2Type);
                return;
              }
              registers[arg1Register] /= arg2Value;
              continue codeLoop;
            case 0x13: // CMPE  x,a := x=(x==a)?1:0
              if (!arg1IsRegister) {
                console.error('NYI: CMPE on non-register');
                return;
              }
              registers[arg1Register] = (arg1Type === arg2Type) && (arg1Value === arg2Value);
              registerTypes[arg1Register] = SLOT_INT;
              continue codeLoop;
            case 0x14: // CMPG  x,a := x=(x>a)?1:0
              if (!arg1IsRegister) return console.error('NYI: CMPG on non-register');
              if (arg1Type !== arg2Type) return console.error('NYI: type ' + arg1Type + ' > type ' + arg2Type);
              registers[arg1Register] = arg1Value > arg2Value;
              registerTypes[arg1Register] = SLOT_INT;
              continue codeLoop;
            case 0x15: // CMPL  /x,a := x=(x<a)?1:0
              if (!arg1IsRegister) return console.error('NYI: CMPL on non-register');
              if (arg1Type !== arg2Type) return console.error('NYI: type ' + arg1Type + ' < type ' + arg2Type);
              registers[arg1Register] = arg1Value > arg2Value;
              registerTypes[arg1Register] = SLOT_INT;
              continue codeLoop;
            case 0x16: // CMPNG  x,a := x=(x<=a)?1:0
              if (!arg1IsRegister) return console.error('NYI: CMPNG on non-register');
              if (arg1Type !== arg2Type) return console.error('NYI: type ' + arg1Type + ' <= type ' + arg2Type);
              registers[arg1Register] = arg1Value <= arg2Value;
              registerTypes[arg1Register] = SLOT_INT;
              continue codeLoop;
            case 0x17: // CMPNL  x,a := x=(x>=a)?1:0
              if (!arg1IsRegister) return console.error('NYI: CMPNL on non-register');
              if (arg1Type !== arg2Type) {
                return console.error('NYI: type ' + arg1Type + ' >= type ' + arg2Type);
              }
              registers[arg1Register] = arg1Value >= arg2Value;
              registerTypes[arg1Register] = SLOT_INT;
              continue codeLoop;
            case 0x18: // MOD
              if (!arg1IsRegister) return console.error('NYI: MOD on non-register');
              if (arg1Type !== SLOT_INT || arg2Type !== SLOT_INT) {
                return console.error('NYI: type ' + arg1Type + ' MOD type ' + arg2Type);
              }
              registers[arg1Register] = arg1Value % arg2Value;
              continue codeLoop;
            case 0x19: // AND  &
              if (!arg1IsRegister) return console.error('NYI: AND on non-register');
              if (arg1Type !== SLOT_INT || arg2Type !== SLOT_INT) {
                return console.error('NYI: type ' + arg1Type + ' & type ' + arg2Type);
              }
              registers[arg1Register] &= arg2Value;
              continue codeLoop;
            case 0x1A: // OR  |
              if (!arg1IsRegister) return console.error('NYI: OR on non-register');
              if (arg1Type !== SLOT_INT || arg2Type !== SLOT_INT) {
                return console.error('NYI: type ' + arg1Type + ' | type ' + arg2Type);
              }
              registers[arg1Register] |= arg2Value;
              continue codeLoop;
            case 0x1B: // XOR
              if (!arg1IsRegister) return console.error('NYI: XOR on non-register');
              if (arg1Type !== SLOT_INT || arg2Type !== SLOT_INT) {
                console.error('NYI: type ' + arg1Type + ' ^ type ' + arg2Type);
                return;
              }
              registers[arg1Register] ^= arg2Value;
              continue codeLoop;
            case 0x1C: // ANDL  &&
              if (!arg1IsRegister) return console.error('NYI: ANDL on non-register');
              if (arg1Value) {
                registers[arg1Register] = arg2Value;
                registerTypes[arg1Register] = arg2Type;
              }
              continue codeLoop;
            case 0x1D: // ORL  ||
              if (!arg1IsRegister) return console.error('NYI: ORL on non-register');
              if (!arg1Value) {
                registers[arg1Register] = arg2Value;
                registerTypes[arg1Register] = arg2Type;
              }
              continue codeLoop;
            case 0x1E: // SHL
              if (!arg1IsRegister) return console.error('NYI: SHL on non-register');
              if (arg1Type !== SLOT_INT || arg2Type !== SLOT_INT) {
                return console.error('NYI: type ' + arg1Type + ' << type ' + arg2Type);
              }
              registers[arg1Register] = arg1Value << arg2Value;
              continue codeLoop;
            case 0x1F: // SHR
              if (!arg1IsRegister) return console.error('NYI: SHL on non-register');
              if (arg1Type !== SLOT_INT || arg2Type !== SLOT_INT) {
                return console.error('NYI: type ' + arg1Type + ' >> type ' + arg2Type);
              }
              registers[arg1Register] = arg1Value >> arg2Value;
              continue codeLoop;
            case 0x20: // JTRUE
              if (arg1Value) {
                pos += arg2Value;
              }
              continue codeLoop;
            case 0x21: // JFALSE
              if (!arg1Value) {
                pos += arg2Value;
              }
              continue codeLoop;
            case 0x22: // DADD
              return console.error('NYI: SeeR DADD');
              continue codeLoop;
            case 0x23: // DSUB
              return console.error('NYI: SeeR DSUB');
              continue codeLoop;
            case 0x24: // DMUL
              return console.error('NYI: SeeR DMUL');
              continue codeLoop;
            case 0x25: // DDIV
              return console.error('NYI: SeeR DDIV');
              continue codeLoop;
            case 0x26: // DCMPE  x,a := x=(x==a)?1:0
              return console.error('NYI: SeeR DCMPE');
              continue codeLoop;
            case 0x27: // DCMPG  x,a := x=(x>a)?1:0
              return console.error('NYI: SeeR DCMPG');
              continue codeLoop;
            case 0x28: // DCMPL  x,a := x=(x<a)?1:0
              return console.error('NYI: SeeR DCMPL');
              continue codeLoop;
            case 0x29: // DCMPNG  x,a := x=(x<=a)?1:0
              return console.error('NYI: SeeR DCMPNG');
              continue codeLoop;
            case 0x2A: // DCMPNL  x,a := x=(x>=a)?1:0
              return console.error('NYI: SeeR DCMPNL');
              continue codeLoop;
            case 0x2B: // FIXMUL
              return console.error('NYI: SeeR FIXMUL');
              continue codeLoop;
            case 0x2C: // FIXDIV
              return console.error('NYI: SeeR FIXDIV');
              continue codeLoop;
            case 0x2D: // CMOV: copies 1 byte
              var copyValue;
              switch (arg2Type) {
                case SLOT_INT:
                  copyValue = arg2Value & 0xff;
                  break;
                case SLOT_CONST:
                  copyValue = consts[arg2Value];
                  break;
                case SLOT_STACK:
                  copyValue = stack.getUint8(arg2Value);
                  break;
                case SLOT_DATA:
                  copyValue = data[arg2Value];
                  break;
                case SLOT_IMPORT:
                  var external = importsByRef[arg2Value];
                  if (!external) {
                    return console.error('SeeR: invalid import ref ' + arg2Value);
                  }
                  if (external.argAllocation !== -1) {
                    return console.error('SeeR: attempt to CMOV from ' + external.name + '()');
                  }
                  copyValue = runtime.rawPeek(external.name + '+0', 1);
                  copyType = SLOT_INT;
                  break;
                case SLOT_NAMED_OFFSET:
                  copyValue = runtime.rawPeek(namedOffsets[arg2Value], 1);
                  copyType = SLOT_INT;
                  break;
                default:
                  return console.error('NYI: SeeR CMOV from type ' + arg2Type);
              }
              switch (arg1Type) {
                case SLOT_STACK:
                  stack.setUint8(arg1Value, copyValue, true);
                  stackTypes[arg1Value >>> 2] = SLOT_INT;
                  break;
                case SLOT_DATA:
                  data[arg1Value] = copyValue;
                  break;
                case SLOT_IMPORT:
                  var external = importsByRef[arg2Value];
                  if (!external) {
                    return console.error('SeeR: invalid import ref ' + arg2Value);
                  }
                  if (external.argAllocation !== -1) {
                    return console.error('SeeR: attempt to CMOV to ' + external.name + '()');
                  }
                  runtime.rawPoke(external.name + '+0', 1);
                  break;
                case SLOT_NAMED_OFFSET:
                  runtime.rawPoke(namedOffsets[arg1Value], 1);
                  break;
                default:
                  return console.error('NYI: SeeR CMOV to type ' + arg1Type);
              }
              continue codeLoop;
            case 0x2E: // WMOV: copies 2 bytes
              var copyValue;
              switch (arg2Type) {
                case SLOT_INT:
                  copyValue = arg2Value << 16 >> 16;
                  break;
                case SLOT_CONST:
                  copyValue = constsDV.getInt16(arg2Value, true);
                  break;
                case SLOT_STACK:
                  copyValue = stack.getInt16(arg2Value, true);
                  break;
                case SLOT_DATA:
                  copyValue = dataDV.getInt16(arg2Value, true);
                  break;
                case SLOT_IMPORT:
                  var external = importsByRef[arg2Value];
                  if (!external) {
                    return console.error('SeeR: invalid import ref ' + arg2Value);
                  }
                  if (external.argAllocation !== -1) {
                    return console.error('SeeR: attempt to WMOV from ' + external.name + '()');
                  }
                  copyValue = runtime.rawPeek(external.name + '+0', 2);
                  break;
                default:
                  return console.error('NYI: SeeR WMOV from type ' + arg2Type);
              }
              switch (arg1Type) {
                case SLOT_STACK:
                  stack.setInt16(arg1Value, copyValue, true);
                  stackTypes[arg1Value >>> 2] = SLOT_INT;
                  break;
                case SLOT_DATA:
                  data.setInt16(arg1Value, copyValue, true);
                  break;
                case SLOT_IMPORT:
                  var external = importsByRef[arg2Value];
                  if (!external) {
                    return console.error('SeeR: invalid import ref ' + arg2Value);
                  }
                  if (external.argAllocation !== -1) {
                    return console.error('SeeR: attempt to WMOV to ' + external.name + '()');
                  }
                  runtime.rawPoke(external.name + '+0', 2, copyValue);
                  break;
                case SLOT_NAMED_OFFSET:
                  runtime.rawPoke(namedOffsets[arg1Value], 2, copyValue);
                  break;
                default:
                  return console.error('NYI: SeeR WMOV to type ' + arg1Type);
              }
              continue codeLoop;
            case 0x2F: // DMOV: copies 8 bytes
              return console.error('NYI: SeeR DMOV');
              continue codeLoop;
            case 0x30: // IDBL
              return console.error('NYI: SeeR IDBL');
              continue codeLoop;
            case 0x31: // DINT
              return console.error('NYI: SeeR DINT');
              continue codeLoop;
            case 0x32: // FDBL
              return console.error('NYI: SeeR FDBL');
              continue codeLoop;
            case 0x33: // DFLT
              return console.error('NYI: SeeR DFLT');
              continue codeLoop;
            case 0x34: // DFIX
              return console.error('NYI: SeeR DFIX');
              continue codeLoop;
            case 0x35: // FIXDBL
              return console.error('NYI: SeeR FIXDBL');
              continue codeLoop;
            case 0x36: // FORK
              return console.error('NYI: SeeR FORK');
              continue codeLoop;
            case 0x37: // RET
              if (registers.sp === stack.byteLength) {
                return registers[0];
              }
              pos = stack.getInt32(registers.sp, true);
              registers.sp += 4;
              continue codeLoop;
            case 0x38: // WAIT
              return console.error('NYI: SeeR WAIT');
              continue codeLoop;
            case 0x39: // CLI : \Turn OFF\ Multitasking
              return console.error('NYI: SeeR CLI');
              continue codeLoop;
            case 0x3A: // STI
              return console.error('NYI: SeeR STI');
              continue codeLoop;
            case 0x3B: // ENTER
              if (registerTypes.bp !== SLOT_STACK) {
                return console.error('ENTER: bp is type ' + registerTypes.bp);
              }
              // push bp
              stack.setInt32(registers.sp -= 4, registers.bp - registers.ss, true);
              stackTypes[registers.sp >>> 2] = SLOT_STACK;
              // mov bp,sp
              registers.bp = registers.sp;
              continue codeLoop;
            case 0x3C: // LEAVE
              if (registerTypes.bp !== SLOT_STACK) {
                return console.error('LEAVE: current bp is type ' + registerTypes.bp);
              }
              // mov sp,bp
              registers.sp = registers.bp;
              // pop bp
              registers.bp = registers.ss + stack.getInt32(registers.sp, true);
              if (registerTypes.bp !== SLOT_STACK) {
                return console.error('LEAVE: popped bp is type ' + registerTypes.bp);
              }
              registers.sp += 4;
              continue codeLoop;
            case 0x3D: // NOP
              continue codeLoop;
            default:
              console.error('unknown SeeR opcode: ' + code[pos-1].toString(16));
              return;
          }
        }
      }
      return nextStep();
    }
  };
  
  SeeRScript.Instance = SeeRInstance;
  
  return SeeRScript;

});
