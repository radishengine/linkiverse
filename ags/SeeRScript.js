define(['modeval', './util'], function(modeval, util) {

  'use strict';
  
  const OP_ARG_COUNT = new Uint8Array(0x40);
  for (var i_op = 0x01; i_op <= 0x0A; i_op++) {
    OP_ARG_COUNT[i_op] = 1;
  }
  for (var i_op = 0x0B; i_op <= 0x36; i_op++) {
    OP_ARG_COUNT[i_op] = 2;
  }
  const SLOT_INT = 0;
  const SLOT_CONST = 1;
  const SLOT_STACK = 2;
  const SLOT_DATA = 3;
  const SLOT_NAMED_OFFSET = 4;
  const SLOT_LOCAL_STACK = 5;
  
  const BASE_NAMED_OFFSET = 0;
  const BASE_CONST = 1;
  const BASE_DATA = 2;
  const BASE_STACK = 3;
  const BASE_LOCAL_STACK = 3;
  
  function BytecodeReader(code, pos) {
    this.code = code;
    this.dv = new DataView(code.buffer, code.byteOffset, code.byteLength);
    if (!isNaN(pos)) this.nextPos = pos;
  }
  BytecodeReader.prototype = {
    pos: -1,
    nextPos: 0,
    callTop: 0,
    next: function() {
      if ((this.pos = this.nextPos) >= this.code.length) return 0;
      var op = this.code[this.pos] & 0x3F;
      if (op === 0) {
        this.nextPos = this.pos + 4;
        return this.dv.getInt32(this.pos, true);
      }
      switch (op) {
        case 0x00:
          this.nextPos = this.pos + 4;
          op = this.dv.getInt32(this.pos, true);
          break;
        case 0x01: case 0x02: case 0x03: case 0x04: case 0x05:
        case 0x06: case 0x07: case 0x08: case 0x09: case 0x0A:
          var full = this.dv.getInt32(this.pos, true);
          if (this.arg1IsPointer = full & 0x100) {
            this.arg1PointerBase = (full >> 10) & 3;
          }
          if (this.arg1IsRegister = full & 0x200) {
            this.arg1Register = (full >> 16) & 7;
            this.nextPos = this.pos + 4;
          }
          else {
            this.arg1Value = this.dv.getInt32(this.pos + 4);
            this.nextPos = this.pos + 8;
          }
          break;
        default:
          var full = this.dv.getInt32(this.pos, true);
          this.nextPos = this.pos + 4;
          if (this.arg1IsPointer = full & 0x40) {
            this.arg1PointerBase = (full >> 9) & 3;
          }
          if (this.arg1IsRegister = full & 0x100) {
            this.arg1Register = (full >> 16) & 7;
          }
          else {
            this.arg1Value = this.dv.getInt32(this.nextPos, true);
            this.nextPos += 4;
          }
          if (this.arg2IsPointer = full & 0x80) {
            this.arg2PointerBase = (full >> 13) & 3;
          }
          if (this.arg2IsRegister = full & 0x1000) {
            this.arg2Register = (full >> 24) & 7;
          }
          else {
            this.arg2Value = this.dv.getInt32(this.nextPos, true);
            this.nextPos += 4;
          }
          break;
        case 0x37: case 0x38: case 0x39: case 0x3A:
        case 0x3B: case 0x3C: case 0x3D:
          this.nextPos = this.pos + 1;
          break;
        case 0x3E: case 0x3F:
          throw new Error('unknown opcode: 0x' + op.toString(16));
      }
      return this.op = op;
    },
  };
  
  function SeeRScript(buffer, byteOffset, byteLength) {
    var dv = this.dv = new DataView(buffer, byteOffset, byteLength);
    var bytes = this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
    if (!this.hasValidSignature || this.version !== 0.94) {
      throw new Error('not a valid SeeR 0.94 script');
    }
  }
  SeeRScript.prototype = {
    instantiate: function(runtime) {
      return new SeeRInstance(runtime, this);
    },
    get signature() {
      return util.byteString(this.bytes, 0, 8);
    },
    get hasValidSignature() {
      return this.signature === 'SeeRVCPU';
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
    /* not used */
    //get dataOffset() {
    //  return this.dv.getUint32(28, true);
    //},
    get constsOffset() {
      return this.dv.getUint32(32, true);
    },
    get initOffset() {
      return this.dv.getUint32(36, true);
    },
    get codeByteLength() {
      return this.dv.getUint32(40, true);
    },
    get dataByteLength() {
      return this.dv.getUint32(44, true);
    },
    get constsByteLength() {
      return this.dv.getUint32(48, true);
    },
    get stackByteLength() {
      return this.dv.getUint32(52, true);
    },
    get importsOffset() {
      return this.dv.getUint32(56, true);
    },
    get constructorCodePos() {
      return this.dv.getUint32(60, true);
    },
    get destructorCodePos() {
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
    get symbolsByEntryPoint() {
      var obj = {};
      for (var i = 0; i < this.symbols.length; i++) {
        if (this.symbols[i].entryPoint >= 0) {
          obj[this.symbols[i].entryPoint] = this.symbols[i];
        }
      }
      Object.defineProperty(this, 'symbolsByEntryPoint', {value:obj, enumerable:true});
      return obj;
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
    get codeDV() {
      var dv = new DataView(this.code.buffer, this.code.byteOffset, this.code.byteLength);
      Object.defineProperty(this, 'codeDV', {value:dv, enumerable:true});
      return dv;
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
    findBranches: function() {
      var codeDV = this.codeDV;
      var branch = this.code.subarray(), i_branch = 0;
      branch.entryPoint = 0;
      var branches = [branch];
      var entryPoints = [this.constructorCodePos, this.destructorCodePos];
      for (var i_symbol = 0; i_symbol < this.symbols.length; i_symbol++) {
        if (this.symbols[i_symbol].argAllocation !== -1) {
          entryPoints.push(this.symbols[i_symbol].entryPoint);
        }
      }
      entryPoints.sort(function(a, b){ return a > b; }); // ascending order
      visiting: for (var entryPoint = entryPoints.shift(); !isNaN(entryPoint); entryPoint = entryPoints.shift()) {
        var diff = entryPoint - branch.entryPoint;
        if (diff < 0 || diff >= branch.byteLength) {
          var i_lo = 0, i_hi = branches.length-1;
          finding: for (;;) {
            branch = branches[i_branch = (i_lo + i_hi) >> 1];
            diff = entryPoint - branch.entryPoint;
            if (diff < 0) {
              i_hi = i_branch - 1;
              continue finding;
            }
            if (diff >= branch.byteLength) {
              i_lo = i_branch + 1;
              if (i_lo > i_hi) {
                throw new RangeError('entry point of range: ' + entryPoint);
              }
              continue finding;
            }
            break finding; // we've found a suitable candidate to visit
          }
        }
        if (diff > 0) {
          var split1 = branch.subarray(0, diff), split2 = branch.subarray(diff);
          split1.entryPoint = branch.entryPoint;
          split2.entryPoint = entryPoint;
          if ('next' in branch) {
            split1.next = entryPoint;
            split2.next = branch.next;
          }
          branches.splice(i_branch, 1, split1, split2);
          branch = split2;
          i_branch++;
        }
        if ('next' in branch) {
          branch = branches[i_branch = branches.length - 1];
          continue visiting; // branch has already been visited, try the next one
        }
        var pos, nextPos;
        reading: for (pos = 0; pos < branch.length; pos = nextPos) {
          var op = branch[pos] & 0x3F;
          switch (OP_ARG_COUNT[op]) {
            case 0:
              nextPos = pos + 1;
              break;
            case 1:
              nextPos = pos + 4 + (branch[pos+1] & 2 ? 0 : 4);
              break;
            case 2:
              nextPos = pos + 4 + (branch[pos+1] & 1 ? 0 : 4) + (branch[pos+1] & 0x10 ? 0 : 4);
              break;
          }
          switch (op) {
            case 0x09: // JMP
              var jumpTo = nextPos + codeDV.getInt32(entryPoint + pos + 4, true);
              pos = nextPos;
              nextPos = jumpTo;
              break reading;
            case 0x0A: // CALL
              var callEntryPoint = codeDV.getInt32(entryPoint + pos + 4, true);
              entryPoints.unshift(nextPos);
              var symbol = this.symbolsByEntryPoint[callEntryPoint];
              pos = nextPos;
              if (symbol) {
                nextPos = {type:'call', call:symbol.name, next:entryPoint + nextPos};
              }
              else {
                nextPos = {type:'call', call:'$'+callEntryPoint, next:entryPoint + nextPos};
              }
              break reading;
            case 0x0D: // CALLEX
              var external = this.importsByRef[codeDV.getInt32(entryPoint + pos + 4, true)];
              entryPoints.unshift(entryPoint + nextPos);
              pos = nextPos;
              nextPos = {type:'call', call:external.name, next:entryPoint + nextPos};
              break reading;
            case 0x20: // JTRUE
              var register = branch[pos + 1] & 7;
              var nextIfTrue = entryPoint + nextPos + codeDV.getInt32(entryPoint+pos+4, true);
              var nextIfFalse = entryPoint + nextPos;
              entryPoints.unshift(nextIfFalse, nextIfTrue);
              pos = nextPos;
              nextPos = {type:'if', register:register, nextIfTrue:nextIfTrue, nextIfFalse:nextIfFalse};
              break reading;
            case 0x21: // JFALSE
              var register = branch[pos + 1] & 7;
              var nextIfTrue = entryPoint + nextPos;
              var nextIfFalse = entryPoint + nextPos + codeDV.getInt32(entryPoint+pos+4, true);
              entryPoints.unshift(nextIfTrue, nextIfFalse);
              pos = nextPos;
              nextPos = {type:'if', register:register, nextIfTrue:nextIfTrue, nextIfFalse:nextIfFalse};
              break reading;
            case 0x37: // RET
              pos = nextPos;
              nextPos = 'return';
              break reading;
            case 0x3B: // ENTER
              entryPoints.unshift(entryPoint + (pos = nextPos));
              nextPos = {type:'enter', next:nextPos, stackDiff:4};
              break reading;
            case 0x3C: // LEAVE
              entryPoints.unshift(entryPoint + (pos = nextPos));
              nextPos = {type:'leave', next:nextPos, stackDiff:-4};
              break reading;
          }
        }
        var next_i;
        if (pos < branch.length) {
          var split1 = branch.subarray(0, pos), split2 = branch.subarray(pos);
          split1.entryPoint = entryPoint;
          split2.entryPoint = entryPoint + pos;
          branches.splice(i_branch, 1, split1, split2);
          branch = split1;
          next_i = i_branch + 1;
        }
        else {
          next_i = branches.length - 1;
        }
        if (typeof nextPos === 'number') {
          entryPoints.unshift(branch.next = entryPoint + nextPos);
        }
        else {
          branch.next = nextPos;
        }
        branch = branches[i_branch = next_i];
      }
      return branches;
    },
  };
  
  function SeeRInstance(runtime, def) {
    this.runtime = runtime;
    this.def = def;
    this.data = new Uint8Array(def.dataByteLength);
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
    this.runFrom(def.constructorCodePos, 0);
  }
  SeeRInstance.prototype = {
    runDestructor: function() {
      this.runFrom(this.def.destructorCodePos, 0);
    },
    runFrom: function(pos, argAllocation) {
      var code = this.def.code,
          consts = this.def.consts,
          constsDV = this.def.constsDV,
          importsByRef = this.def.importsByRef,
          data = this.data,
          dataDV = this.dataDV,
          symbols = this.def.symbols,
          runtime = this.runtime,
          stack = new DataView(new ArrayBuffer(this.def.stackByteLength)),
          stackTypes = new Uint8Array(this.def.stackByteLength/4);
      var stackBytes = new Uint8Array(stack.buffer);
      var registers = new Int32Array(8);
      var registerTypes = new Uint8Array(8);
      var stackPos, callTop;
      stackPos = callTop = stack.byteLength;
      stackPos -= argAllocation + 4;
      for (var i = 2; i < arguments.length; i++) {
        // TODO: non-int args
        stack.setInt32(stackPos + (i-1) * 4, arguments[i], true);
      }
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
            for (var j = stackPos; j < stack.byteLength; j += 4) {
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
                  if (arg1Type === SLOT_INT) {
                    arg1Value = allocNamedOffset(importsByRef[arg1Value].name + '+0');
                    arg1Type = SLOT_NAMED_OFFSET;
                  }
                  break;
                case 1:
                  arg1Type = SLOT_CONST;
                  break;
                case 2:
                  arg1Type = SLOT_DATA;
                  break;
                case 3:
                  arg1Value += callTop;
                  arg1Type = SLOT_STACK;
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
              if (arg1IsPointer) switch (arg1PointerBase) {
                case 0:
                  if (arg1Type === SLOT_INT) {
                    arg1Value = allocNamedOffset(importsByRef[arg1Value].name + '+0');
                    arg1Type = SLOT_NAMED_OFFSET;
                  }
                  break;
                case 1:
                  arg1Type = SLOT_CONST;
                  break;
                case 2:
                  arg1Type = SLOT_DATA;
                  break;
                case 3:
                  arg1Value += callTop;
                  arg1Type = SLOT_STACK;
                  break;
              }
              if (arg2IsPointer) switch (arg2PointerBase) {
                case 0:
                  if (arg2Type === SLOT_INT) {
                    arg2Value = allocNamedOffset(importsByRef[arg2Value].name + '+0');
                    arg2Type = SLOT_NAMED_OFFSET;
                  }
                  break;
                case 1:
                  arg2Type = SLOT_CONST;
                  break;
                case 2:
                  arg2Type = SLOT_DATA;
                  break;
                case 3:
                  arg2Value += callTop;
                  arg2Type = SLOT_STACK;
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
              if (arg1IsRegister) {
                stack.setInt32(stackPos -= 4, arg1Value, true);
                stackTypes[stackPos >>> 2] = arg1Type;
              }
              else switch (arg1Type) {
                case SLOT_INT:
                  stack.setInt32(stackPos -= 4, arg1Value, true);
                  stackTypes[stackPos >>> 2] = SLOT_INT;
                  break;
                case SLOT_CONST:
                  stack.setInt32(stackPos -= 4, constsDV.getInt32(arg1Value, true), true);
                  stackTypes[stackPos >>> 2] = SLOT_INT;
                  break;
                case SLOT_STACK:
                  stack.setInt32(stackPos -= 4, stack.getInt32(arg1Value, true), true);
                  stackTypes[stackPos >>> 2] = stackTypes[arg1Value >>> 2];
                  break;
                case SLOT_DATA:
                  stack.setInt32(stackPos -= 4, dataDV.getInt32(arg1Value, true), true);
                  stackTypes[stackPos >>> 2] = SLOT_INT;
                  break;
                case SLOT_NAMED_OFFSET:
                  stack.setInt32(stackPos -= 4, arg1Value, true);
                  stackTypes[stackPos >>> 2] = SLOT_NAMED_OFFSET;
                  break;
                default:
                  console.error('NYI: SeeR PUSH with type ' + arg1Type);
                  return;
              }
              continue codeLoop;
            case 0x02: // PUSHADR
              stack.setInt32(stackPos -= 4, arg1Value, true);
              stackTypes[stackPos >>> 2] = arg1Type;
              continue codeLoop;
            case 0x03: // DPUSH
              return console.error('NYI: SeeR DPUSH');
              continue codeLoop;
            case 0x04: // POP
              if (!arg1IsRegister) {
                return console.error('NYI: POP to non-register');
              }
              registers[arg1Register] = stack.getInt32(stackPos, true);
              registerTypes[arg1Register] = stackTypes[stackPos >>> 2];
              stackPos += 4;
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
              stack.setInt32(stackPos -= 4, pos, true);
              pos = arg1Value;
              continue codeLoop;
            case 0x0B: // MOV  copies 4bytes
              var copyValue, copyType;
              if (arg2IsRegister && !arg2IsPointer) {
                copyValue = registers[arg2Register];
                copyType = registerTypes[arg2Register];
              }
              else switch (arg2Type) {
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
                  copyType = stackTypes[arg2Value >>> 2];
                  break;
                case SLOT_DATA:
                  copyValue = dataDV.getInt32(arg2Value, true);
                  copyType = SLOT_INT;
                  break;
                case SLOT_NAMED_OFFSET:
                  copyValue = arg2Value;
                  copyType = SLOT_NAMED_OFFSET;
                  break;
                default:
                  console.error('NYI: SeeR MOV from type ' + arg2Type);
                  copyValue = 0;
                  copyType = SLOT_INT;
                  break;
              }
              if (arg1IsRegister && !arg1IsPointer) {
                registers[arg1Register] = copyValue;
                registerTypes[arg1Register] = copyType;
              }
              else switch (arg1Type) {
                case SLOT_STACK:
                  stack.setInt32(arg1Value, copyValue, true);
                  stackTypes[arg1Value >>> 2] = copyType;
                  break;
                case SLOT_DATA:
                  dataDV.setInt32(arg1Value, copyValue, true);
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
              if (arg1Type !== SLOT_INT) {
                return console.error('NYI: SeeR CALLEX on type ' + arg1Type);
              }
              var external = importsByRef[arg1Value];
              if (!external) {
                return console.error('invalid SeeR import ref: ' + arg1Value);
              }
              var argAllocation = arg2Value & 0xffff;
              if (argAllocation !== external.argAllocation) {
                if (external.argAllocation === -1) {
                  console.error('attempt to call non-function: ' + external.name);
                }
                else {
                  console.error('wrong arg allocation (expected ' + external.argAllocation + ', got ' + argAllocation + ')');
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
              for (var i = 0; i < argAllocation; i += 4) {
                var v = stack.getInt32(stackPos + i, true);
                switch (stackTypes[(stackPos + i) >>> 2]) {
                  case SLOT_INT:
                    args.push(v);
                    break;
                  case SLOT_CONST:
                    if (consts[v] === 0) args.push('');
                    else {
                      var endPos = v;
                      do { } while (consts[++endPos] !== 0);
                      args.push(util.byteString(consts.subarray(v, endPos)));
                    }
                    break;
                  case SLOT_STACK:
                    if (runtime[external.name].passStringsByRef) {
                      args.push(stackBytes.subarray(v));
                    }
                    else {
                      if (stackBytes[v] === 0) args.push('');
                      else {
                        var endPos = v;
                        do { } while (stackBytes[++endPos] !== 0);
                        args.push(util.byteString(stackBytes.subarray(v, endPos)));
                      }
                    }
                    break;
                  case SLOT_DATA:
                    if (runtime[external.name].passStringsByRef) {
                      args.push(data.subarray(v));
                    }
                    else {
                      if (data[v] === 0) args.push('');
                      else {
                        var endPos = v;
                        do { } while (data[++endPos] !== 0);
                        args.push(util.byteString(data.subarray(v, endPos)));
                      }
                    }
                    break;
                  case SLOT_NAMED_OFFSET:
                    args.push(runtime.rawPeek(namedOffsets[v], 4));
                    break;
                  default:
                    console.error('NYI: SeeR arg type: ' + stackTypes[(stackPos >>> 2) + i]);
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
              if (arg1IsPointer) {
                switch (arg1PointerBase) {
                  case BASE_DATA:
                    if (arg2Type !== SLOT_INT) {
                      return console.error('NYI: ADD ' + arg2Type + ' to data pointer');
                    }
                    dataDV.setInt32(arg1Value, dataDV.getInt32(arg1Value, true) + arg2Value, true);
                    continue codeLoop;
                  case BASE_STACK:
                    if (arg2Type !== SLOT_INT) {
                      return console.error('NYI: ADD ' + arg2Type + ' to stack pointer');
                    }
                    stack.setInt32(arg1Value, stack.getInt32(arg1Value, true) + arg2Value, true);
                    continue codeLoop;
                }
              }
              var leftValue, leftType, rightValue;
              if (arg1IsRegister) {
                if (arg1Register === 6) {
                  arg1Value += callTop;
                  arg1Type = SLOT_STACK;
                }
                if (arg2Register === 6) {
                  arg2Value += callTop;
                  arg2Type = SLOT_STACK;
                }
                if (arg2Type === SLOT_INT) {
                  leftValue = arg1Value;
                  leftType = arg1Type;
                  rightValue = arg2Value;
                }
                else if (arg1Type === SLOT_INT) {
                  leftValue = arg2Value;
                  leftType = arg2Type;
                  rightValue = arg1Value;
                }
                registerTypes[arg1Register] = leftType;
              }
              else {
                return console.error('NYI: ADD type ' + arg2Type + ' to type ' + arg1Type);
              }
              if (rightValue === 0) {
                continue codeLoop;
              }
              switch (leftType) {
                case SLOT_NAMED_OFFSET:
                  var parts = namedOffsets[leftValue].split('+', 2);
                  if ((parts[1] = +parts[1] + rightValue) < 0) {
                    return console.error('SeeR: negative offset from ' + parts[0]);
                  }
                  leftValue = allocNamedOffset(parts.join('+'));
                  break;
                default:
                  leftValue = leftValue + rightValue;
                  break;
              }
              if (arg1IsRegister) {
                registers[arg1Register] = leftValue;
              }
              continue codeLoop;
            case 0x10: // SUB
              if (arg1IsPointer && arg1PointerBase === BASE_DATA) {
                dataDV.setInt32(arg1Value, dataDV.getInt32(arg1Value, true) - arg2Value, true);
                continue codeLoop;
              }
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
                case SLOT_NAMED_OFFSET:
                  var parts = namedOffsets[arg1Value].split('+', 2);
                  if ((parts[1] -= arg2Value) < 0) {
                    return console.error('SeeR: negative offset from ' + external.name);
                  }
                  registers[arg1Register] = allocNamedOffset(parts.join('+'));
                  break;
                default:
                  if (arg1Register === 5) {
                    stackPos -= arg2Value;
                  }
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
              if (arg1Type === SLOT_NAMED_OFFSET) {
                arg1Value = runtime.rawPeek(namedOffsets[arg1Value], 4);
                arg1Type = SLOT_INT;
              }
              registers[arg1Register] = (arg1Type === arg2Type) && (arg1Value === arg2Value);
              registerTypes[arg1Register] = SLOT_INT;
              continue codeLoop;
            case 0x14: // CMPG  x,a := x=(x>a)?1:0
              if (!arg1IsRegister) return console.error('NYI: CMPG on non-register');
              if (arg1Type === SLOT_NAMED_OFFSET) {
                arg1Value = runtime.rawPeek(namedOffsets[arg1Value], 4);
                arg1Type = SLOT_INT;
              }
              if (arg1Type !== arg2Type) return console.error('NYI: type ' + arg1Type + ' > type ' + arg2Type);
              registers[arg1Register] = arg1Value > arg2Value;
              registerTypes[arg1Register] = SLOT_INT;
              continue codeLoop;
            case 0x15: // CMPL  /x,a := x=(x<a)?1:0
              if (!arg1IsRegister) return console.error('NYI: CMPL on non-register');
              if (arg1Type === SLOT_NAMED_OFFSET) {
                arg1Value = runtime.rawPeek(namedOffsets[arg1Value], 4);
                arg1Type = SLOT_INT;
              }
              if (arg1Type !== arg2Type) return console.error('NYI: type ' + arg1Type + ' < type ' + arg2Type);
              registers[arg1Register] = arg1Value > arg2Value;
              registerTypes[arg1Register] = SLOT_INT;
              continue codeLoop;
            case 0x16: // CMPNG  x,a := x=(x<=a)?1:0
              if (!arg1IsRegister) return console.error('NYI: CMPNG on non-register');
              if (arg1Type === SLOT_NAMED_OFFSET) {
                arg1Value = runtime.rawPeek(namedOffsets[arg1Value], 4);
                arg1Type = SLOT_INT;
              }
              if (arg1Type !== arg2Type) return console.error('NYI: type ' + arg1Type + ' <= type ' + arg2Type);
              registers[arg1Register] = arg1Value <= arg2Value;
              registerTypes[arg1Register] = SLOT_INT;
              continue codeLoop;
            case 0x17: // CMPNL  x,a := x=(x>=a)?1:0
              if (!arg1IsRegister) return console.error('NYI: CMPNL on non-register');
              if (arg1Type === SLOT_NAMED_OFFSET) {
                arg1Value = runtime.rawPeek(namedOffsets[arg1Value], 4);
                arg1Type = SLOT_INT;
              }
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
              if (arg2IsRegister && !arg2IsPointer) {
                copyValue = arg2Value & 0xff;
              }
              else switch (arg2Type) {
                case SLOT_INT:
                  copyValue = arg2Value & 0xff;
                  break;
                case SLOT_CONST:
                  copyValue = consts[arg2Value];
                  break;
                case SLOT_STACK:
                  copyValue = stackBytes[arg2Value];
                  break;
                case SLOT_DATA:
                  copyValue = data[arg2Value];
                  break;
                case SLOT_NAMED_OFFSET:
                  copyValue = runtime.rawPeek(namedOffsets[arg2Value], 1);
                  copyType = SLOT_INT;
                  break;
                default:
                  return console.error('NYI: SeeR CMOV from type ' + arg2Type);
              }
              if (arg1IsRegister && !arg1IsPointer) {
                // TODO: check if the rest of the value should be cleared, not kept
                registers[arg1Register] = (arg1Value & ~0xff) | (copyValue & 0xff);
                registerTypes[arg1Register] = SLOT_INT;
              }
              else switch (arg1Type) {
                case SLOT_STACK:
                  stackBytes[arg1Value] = copyValue;
                  stackTypes[arg1Value >>> 2] = SLOT_INT;
                  break;
                case SLOT_DATA:
                  data[arg1Value] = copyValue;
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
              if (arg2IsRegister && !arg2IsPointer) {
                copyValue = arg2Value << 16 >> 16;
              }
              else switch (arg2Type) {
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
                case SLOT_NAMED_OFFSET:
                  copyValue = runtime.rawPeek(namedOffsets[arg2Value], 2);
                  break;
                default:
                  return console.error('NYI: SeeR WMOV from type ' + arg2Type);
              }
              if (arg1IsRegister && !arg1IsPointer) {
                // TODO: check if the rest of the value should be cleared, not kept
                registers[arg1Register] = (arg1Value & ~0xffff) | (copyValue & 0xffff);
                registerTypes[arg1Register] = SLOT_INT;
              }
              else switch (arg1Type) {
                case SLOT_STACK:
                  stack.setInt16(arg1Value, copyValue, true);
                  stackTypes[arg1Value >>> 2] = SLOT_INT;
                  break;
                case SLOT_DATA:
                  data.setInt16(arg1Value, copyValue, true);
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
              pos = stack.getInt32(stackPos, true);
              if (pos === 0) {
                return registers[0];
              }
              stackPos += 4;
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
              // push bp
              stack.setInt32(stackPos -= 4, callTop - stack.byteLength, true);
              stackTypes[stackPos >>> 2] = SLOT_STACK;
              // mov bp,sp
              callTop = stackPos;
              continue codeLoop;
            case 0x3C: // LEAVE
              // mov sp,bp
              stackPos = callTop;
              // pop bp
              callTop = stack.byteLength + stack.getInt32(stackPos, true);
              stackPos += 4;
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
