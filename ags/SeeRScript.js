define(['modeval', './util'], function(modeval, util) {

  'use strict';
  
  const OP_ARG_COUNT = new Uint8Array(0x40);
  for (var i_op = 0x01; i_op <= 0x0A; i_op++) {
    OP_ARG_COUNT[i_op] = 1;
  }
  for (var i_op = 0x0B; i_op <= 0x36; i_op++) {
    OP_ARG_COUNT[i_op] = 2;
  }
  const SLOT_INT = 0,
        SLOT_CONST = 1,
        SLOT_STACK = 2,
        SLOT_DATA = 3,
        SLOT_NAMED_OFFSET = 4,
        SLOT_LOCAL_STACK = 5,
  
        BASE_NAMED_OFFSET = 0,
        BASE_CONST = 1,
        BASE_DATA = 2,
        BASE_STACK = 3,
        BASE_LOCAL_STACK = 4,
  
        OP_EOF = 0,
        OP_PUSH = 0x01,
        OP_PUSHADR = 0x02,
        OP_DPUSH = 0x03,
        OP_POP = 0x04,
        OP_NEG = 0x05,
        OP_DNEG = 0x06,
        OP_NOT = 0x07,
        OP_OPTIONS = 0x08,
        OP_JMP = 0x09,
        OP_CALL = 0x0A,
        OP_MOV = 0x0B,
        OP_XCHG = 0x0C,
        OP_CALLEX = 0x0D,
        OP_COPY = 0x0E,
        OP_ADD = 0x0F,
        OP_SUB = 0x10,
        OP_MUL = 0x11,
        OP_DIV = 0x12,
        OP_CMPE = 0x13,
        OP_CMPG = 0x14,
        OP_CMPL = 0x15,
        OP_CMPNG = 0x16,
        OP_CMPNL = 0x17,
        OP_MOD = 0x18,
        OP_AND = 0x19,
        OP_OR = 0x1A,
        OP_XOR = 0x1B,
        OP_ANDL = 0x1C,
        OP_ORL = 0x1D,
        OP_SHL = 0x1E,
        OP_SHR = 0x1F,
        OP_JTRUE = 0x20,
        OP_JFALSE = 0x21,
        OP_DADD = 0x22,
        OP_DSUB = 0x23,
        OP_DMUL = 0x24,
        OP_DDIV = 0x25,
        OP_DCMPE = 0x26,
        OP_DCMPG = 0x27,
        OP_DCMPL = 0x28,
        OP_DCMPNG = 0x29,
        OP_DCMPNL = 0x2A,
        OP_FIXMUL = 0x2B,
        OP_FIXDIV = 0x2C,
        OP_CMOV = 0x2D,
        OP_WMOV = 0x2E,
        OP_DMOV = 0x2F,
        OP_IDBL = 0x30,
        OP_DINT = 0x31,
        OP_FDBL = 0x32,
        OP_DFLT = 0x33,
        OP_DFIX = 0x34,
        OP_FIXDBL = 0x35,
        OP_FORK = 0x36,
        OP_RET = 0x37,
        OP_WAIT = 0x38,
        OP_CLI = 0x39,
        OP_STI = 0x3A,
        OP_ENTER = 0x3B,
        OP_LEAVE = 0x3C,
        OP_NOP = 0x3D,
        OP_INVALID_1 = 0x3E,
        OP_INVALID_2 = 0x3F;
  
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
      if ((this.pos = this.nextPos) >= this.code.length) return OP_EOF;
      var op = this.code[this.pos] & 0x3F;
      switch (op) {
        case 0x00:
          this.nextPos = this.pos + 4;
          op = this.dv.getInt32(this.pos, true);
          break;
        case OP_PUSH: case OP_PUSHADR: case OP_DPUSH: case OP_POP: case OP_NEG:
        case OP_DNEG: case OP_NOT: case OP_OPTIONS: case OP_JMP: case OP_CALL:
          var full = this.dv.getInt32(this.pos, true);
          if (this.arg1IsPointer = full & 0x100) {
            this.arg1PointerBase = (full >> 10) & 3;
          }
          if (this.arg1IsRegister = full & 0x200) {
            this.arg1Register = (full >> 16) & 7;
            this.nextPos = this.pos + 4;
          }
          else {
            this.arg1Value = this.dv.getInt32(this.pos + 4, true);
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
        case OP_RET: case OP_WAIT: case OP_CLI: case OP_STI:
        case OP_ENTER: case OP_LEAVE: case OP_NOP:
          this.nextPos = this.pos + 1;
          break;
        case OP_INVALID_1: case OP_INVALID_2:
          throw new Error('unknown opcode: 0x' + op.toString(16));
      }
      return this.op = op;
    },
    get callexArgAllocation() {
      return this.arg2Value & 0xffff;
    },
    get callexIsVoid() {
      return this.arg2Value & 0x400000;
    },
    get callexStructMode() {
      var structMode = (this.arg2Value >> 23) & 7;
      return (structMode < 2) ? !!structMode : 1 << (structMode - 2);
    },
    get callexIsFromOtherInstance() {
      return this.arg2Value & 0x4000000;
    },
    get callexResultType() {
      return (this.arg2Value & 0x8000000) ? 'double' : 'int';
    },
    get callexIsMember() {
      return this.arg2Value & 0x10000000;
    },
    get callexDispatcher() {
      return this.arg2Value >>> 29;
    },
  };
  
  function branchSearch(entryPoint) {
    if (entryPoint < 0) return null;
    var i_lo = 0, i_hi = this.length-1;
    for (;;) {
      var i = (i_lo + i_hi) >> 1;
      var diff = entryPoint - this[i].entryPoint;
      if (diff < 0) {
        i_hi = i - 1;
        continue;
      }
      if (diff >= this[i].byteLength) {
        i_lo = i + 1;
        if (i_lo > i_hi) {
          return null;
        }
        continue;
      }
      return this[i];
    }
  }
  
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
    get entryPoints() {
      var entryPoints = [this.constructorCodePos, this.destructorCodePos];
      for (var i_symbol = 0; i_symbol < this.symbols.length; i_symbol++) {
        if (this.symbols[i_symbol].argAllocation !== -1) {
          entryPoints.push(this.symbols[i_symbol].entryPoint);
        }
      }
      entryPoints.sort(function(a, b){ return a - b; }); // ascending order
      Object.freeze(entryPoints);
      Object.defineProperty(this, 'entryPoints', {value:entryPoints, enumerable:true});
      return entryPoints;
    },
    get branches() {
      var branch = this.code.subarray(), i_branch = 0;
      branch.entryPoint = 0;
      var branches = [branch];
      var entryPoints = this.entryPoints.slice();
      var terp = new BytecodeReader(this.code);
    visiting:
      for (var entryPoint = entryPoints.shift();
           !isNaN(entryPoint);
           entryPoint = entryPoints.shift()) {
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
        terp.nextPos = entryPoint;
        var endPoint = entryPoint + branch.byteLength;
      reading:
        for (;;) {
          if (terp.nextPos >= endPoint) {
            terp.pos = terp.nextPos = endPoint;
            break;
          }
          switch (terp.next()) {
            case OP_EOF:
              terp.pos = terp.nextPos;
              break reading;
            case OP_JMP:
              terp.pos = terp.nextPos;
              terp.nextPos += terp.arg1Value;
              break reading;
            case OP_JTRUE:
              terp.pos = terp.nextPos;
              terp.nextPos = {
                type: 'if',
                register: terp.arg1Register,
                nextIfTrue: terp.nextPos + terp.arg2Value,
                nextIfFalse: terp.nextPos,
              };
              entryPoints.unshift(terp.nextPos.nextIfFalse, terp.nextPos.nextIfTrue);
              break reading;
            case OP_JFALSE:
              terp.pos = terp.nextPos;
              terp.nextPos = {
                type: 'if',
                register: terp.arg1Register,
                nextIfTrue: terp.nextPos,
                nextIfFalse: terp.nextPos + terp.arg2Value,
              };
              entryPoints.unshift(terp.nextPos.nextIfTrue, terp.nextPos.nextIfFalse);
              break reading;
            case OP_RET:
              terp.pos = terp.nextPos;
              terp.nextPos = 'return';
              break reading;
          }
        }
        var next_i;
        if (terp.pos < endPoint) {
          var split1 = this.code.subarray(entryPoint, terp.pos);
          var split2 = this.code.subarray(terp.pos, endPoint);
          split1.entryPoint = entryPoint;
          split2.entryPoint = terp.pos;
          branches.splice(i_branch, 1, split1, split2);
          branch = split1;
          next_i = i_branch + 1;
        }
        else {
          next_i = branches.length - 1;
        }
        if (typeof terp.nextPos === 'number') {
          entryPoints.unshift(branch.next = terp.nextPos);
        }
        else {
          branch.next = terp.nextPos;
        }
        branch = branches[i_branch = next_i];
      }
      branches.find = branchSearch;
      for (var i = branches.length-1; i >= 0; i--) {
        var branch = branches[i];
        if ('next' in branch) {
          if (typeof branch.next === 'number' && branch.next <= branch.entryPoint) {
            var backBranch = branches.find(branch.next);
            if ('loopEndPoints' in backBranch) {
              backBranch.loopEndPoints.unshift(branch.entryPoint + branch.byteLength);
            }
            else {
              backBranch.loopEndPoints = [branch.entryPoint + branch.byteLength];
            }
          }
        }
        else branches.splice(i, 1);
      }
      Object.defineProperty(this, 'branches', {value:branches, enumerable:true});
      return branches;
    },
    getControlFlow: function() {
      var self = this;
      function addToBlock(block, breakPos) {
        var pos = block.entryPoint;
        while (pos < block.endPoint) {
          var branch = self.branches.find(pos);
          if ('loopEndPoints' in branch) {
            var i_end = branch.loopEndPoints.indexOf(block.endPoint);
            if (i_end !== -1 && block.entryPoint === branch.entryPoint) {
              block.type = 'loop';
              breakPos = block.endPoint;
            }
            if (i_end !== 0) {
              if (i_end === -1) i_end = branch.loopEndPoints.length;
              var loop = [];
              loop.entryPoint = branch.entryPoint;
              pos = loop.endPoint = branch.loopEndPoints[i_end - 1];
              addToBlock(loop, loop.endPoint);
              continue;
            }
          }
          block.push(branch);
          if (typeof branch.next === 'number') {
            if (branch.next <= branch.entryPoint) {
              block.endPoint = 'continue';
              return;
            }
            if (branch.next === breakPos) {
              block.endPoint = 'break';
              return;
            }
            pos = branch.next;
            continue;
          }
          if (branch.next === 'return') {
            block.endPoint = 'return';
            return;
          }
          if (branch.next.type === 'if') {
            if (branch.next.nextIfTrue === branch.entryPoint + branch.byteLength) {
              // jump if false
              if (branch.next.nextIfFalse <= branch.entryPoint) {
                throw new Error('NYI: backwards JFALSE');
              }
              var trueBlock = [];
              trueBlock.entryPoint = branch.next.nextIfTrue;
              trueBlock.endPoint = branch.next.nextIfFalse;
              addToBlock(trueBlock, breakPos);
              if (branch.next.nextIfFalse === breakPos) {
                block.push({
                  type: 'if',
                  register: branch.next.register,
                  onTrue: trueBlock,
                  onFalse: Object.assign([], {endPoint:'break'}),
                });
                if (!isNaN(trueBlock.endPoint)) {
                  throw new Error('unterminated loop');
                }
                return;
              }
              else {
                var falseBlock = [];
                falseBlock.entryPoint = branch.next.nextIfFalse;
                falseBlock.endPoint = isNaN(trueBlock.endPoint) ? branch.next.nextIfFalse : trueBlock.endPoint;
                addToBlock(falseBlock, breakPos);
                block.push({
                  type: 'if',
                  register: branch.next.register,
                  onTrue: trueBlock,
                  onFalse: falseBlock,
                });
                if (isNaN(falseBlock.endPoint)) {
                  if (isNaN(trueBlock.endPoint)) return;
                  else pos = trueBlock.endPoint;
                }
                else pos = falseBlock.endPoint;
                continue;
              }
            }
            else {
              throw new Error('NYI: JTRUE');
            }
          }
          throw new Error('unknown "next": ' + branch.next);
        }
        block.endPoint = pos;
      }
      var flow = {};
      for (var i = 0; i < this.entryPoints.length; i++) {
        var entryPoint = this.entryPoints[i];
        var block = flow[entryPoint] = [];
        block.entryPoint = entryPoint;
        if (i+1 === this.entryPoints.length) {
          block.endPoint = this.code.length;
        }
        else {
          block.endPoint = this.entryPoints[i+1];
        }
        addToBlock(block);
      }
      return flow;
    },
    getBranchInfo: function(branch, localDepth) {
      if (isNaN(localDepth)) localDepth = 0;
      var info = {
        registers: [{}, {}, {}, {}],
        stackDiff: 0,
        maxStackDiff: 0,
        stack: {},
      };
      var terp = new BytecodeReader(branch);
      function stackSlot(localPos) {
        localPos += localDepth;
        return info.stack[localPos] = info.stack[localPos] || {};
      }
      reading: for (;;) switch (terp.next()) {
        case OP_EOF:
        case OP_JMP:
          break reading;
        case OP_PUSH:
          info.maxStackDiff = Math.min(info.maxStackDiff, info.stackDiff -= 4);
          if (terp.arg1IsRegister) {
            if (!info.registers[terp.arg1Register].out) {
              info.registers[terp.arg1Register].in = true;
            }
          }
          else if (terp.arg1IsPointer) switch (terp.arg1PointerBase) {
            case BASE_STACK:
              stackSlot(terp.arg1Value).out = true;
              break;
          }
          stackSlot(info.stackDiff).out = true;
          continue reading;
        case OP_PUSHADR:
          info.maxStackDiff = Math.min(info.maxStackDiff, info.stackDiff -= 4);
          switch (terp.arg1PointerBase) {
            case BASE_STACK:
              throw new Error('pushing register pointer');
          }
          stackSlot(info.stackDiff).out = true;
          continue reading;
        case OP_DPUSH:
        case OP_DNEG:
          throw new Error('NYI: double operations');
        case OP_POP:
          var slot = stackSlot(info.stackDiff);
          if (slot.out) delete slot.out;
          info.stackDiff += 4;
          info.registers[terp.arg1Register].out = true;
          continue reading;
        case OP_NEG:
        case OP_NOT:
          Object.assign(info.registers[terp.arg1Register], {in:true, out:true});
          continue reading;
        case OP_CALL:
          var symbol = this.symbolsByEntryPoint[terp.arg1Value];
          for (var argPos = 0; argPos < symbol.argAllocation; argPos += 4) {
            stackSlot(info.stackDiff + argPos).in = true;
          }
          info.maxStackDiff = Math.min(info.maxStackDiff, info.stackDiff -= 4);
          stackSlot(info.stackDiff).out = true;
          info.registers[0].out = true;
          break reading;
        case OP_MOV:
          if (terp.arg2IsPointer) switch (terp.arg2PointerBase) {
            case BASE_STACK:
              if (terp.arg2IsRegister) {
                throw new Error('MOV from stack pointer in register');
              }
              break;
          }
          else if (terp.arg2IsRegister) {
            
          }
          continue reading;
        case OP_CALLEX:
          var external = this.importsByRef[terp.arg1Value];
          for (var argPos = 0; argPos < external.argAllocation; argPos += 4) {
            stackSlot(info.stackDiff + argPos).in = true;
          }
          if (!terp.callexIsVoid) {
            info.registers[0].out = true;
          }
          break reading;
        case OP_JTRUE:
        case OP_JFALSE:
          if (!info.registers[terp.arg1Register].out) {
            info.registers[terp.arg1Register].in = true;
          }
          break reading;
        case OP_RET:
          stackSlot(info.stackDiff).in = true;
          info.stackDiff += 4;
          if (info.registers[0].out) {
            delete info.registers[0].out;
          }
          else {
            info.registers[0].in = true;
          }
          break reading;
      }
      return info;
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
            case OP_PUSH:
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
            case OP_PUSHADR:
              stack.setInt32(stackPos -= 4, arg1Value, true);
              stackTypes[stackPos >>> 2] = arg1Type;
              continue codeLoop;
            case OP_DPUSH:
              return console.error('NYI: SeeR DPUSH');
              continue codeLoop;
            case OP_POP:
              if (!arg1IsRegister) {
                return console.error('NYI: POP to non-register');
              }
              registers[arg1Register] = stack.getInt32(stackPos, true);
              registerTypes[arg1Register] = stackTypes[stackPos >>> 2];
              stackPos += 4;
              continue codeLoop;
            case OP_NEG: //  bin:-1-ARG+1=-ARG
              if (!arg1IsRegister) {
                return console.error('NYI: NEG non-register');
              }
              if (arg1Type !== SLOT_INT) {
                return console.error('NYI: NEG type ' + arg1Type);
              }
              registers[arg1Register] = -arg1Value;
              continue codeLoop;
            case OP_DNEG:
              return console.error('NYI: SeeR DNEG');
              continue codeLoop;
            case OP_NOT: //  !
              if (!arg1IsRegister) {
                return console.error('NYI: NOT non-register');
              }
              registers[arg1Register] = !arg1Value;
              registerTypes[arg1Register] = SLOT_INT;
              continue codeLoop;
            case OP_OPTIONS: //  optionvcpu* set or not
              return console.error('NYI: SeeR OPTIONS');
              continue codeLoop;
            case OP_JMP:
              pos += arg1Value;
              continue codeLoop;
            case OP_CALL:
              console.warn('SeeR local CALL');
              stack.setInt32(stackPos -= 4, pos, true);
              pos = arg1Value;
              continue codeLoop;
            case OP_MOV: //  copies 4bytes
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
            case OP_XCHG:
              return console.error('NYI: SeeR XCHG');
              continue codeLoop;
            case OP_CALLEX:
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
            case OP_COPY: //  dest,src:copy CX-bytes from source to dest,CX=1
              return console.error('NYI: SeeR COPY');
              continue codeLoop;
            case OP_ADD:
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
            case OP_SUB:
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
            case OP_MUL:
              if (!arg1IsRegister) return console.error('NYI: MUL on non-register');
              if (arg1Type !== SLOT_INT || arg2Type !== SLOT_INT) {
                console.error('NYI: MUL type ' + arg1Type + ' by type ' + arg2Type);
                return;
              }
              // TODO: imul32 overflow semantics?
              registers[arg1Register] *= arg2Value;
              continue codeLoop;
            case OP_DIV:
              if (!arg1IsRegister) return console.error('NYI: DIV on non-register');
              if (arg1Type !== SLOT_INT || arg2Type !== SLOT_INT) {
                console.error('NYI: DIV type ' + arg1Type + ' by type ' + arg2Type);
                return;
              }
              registers[arg1Register] /= arg2Value;
              continue codeLoop;
            case OP_CMPE: //  x,a := x=(x==a)?1:0
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
            case OP_CMPG: //  x,a := x=(x>a)?1:0
              if (!arg1IsRegister) return console.error('NYI: CMPG on non-register');
              if (arg1Type === SLOT_NAMED_OFFSET) {
                arg1Value = runtime.rawPeek(namedOffsets[arg1Value], 4);
                arg1Type = SLOT_INT;
              }
              if (arg1Type !== arg2Type) return console.error('NYI: type ' + arg1Type + ' > type ' + arg2Type);
              registers[arg1Register] = arg1Value > arg2Value;
              registerTypes[arg1Register] = SLOT_INT;
              continue codeLoop;
            case OP_CMPL: //  /x,a := x=(x<a)?1:0
              if (!arg1IsRegister) return console.error('NYI: CMPL on non-register');
              if (arg1Type === SLOT_NAMED_OFFSET) {
                arg1Value = runtime.rawPeek(namedOffsets[arg1Value], 4);
                arg1Type = SLOT_INT;
              }
              if (arg1Type !== arg2Type) return console.error('NYI: type ' + arg1Type + ' < type ' + arg2Type);
              registers[arg1Register] = arg1Value > arg2Value;
              registerTypes[arg1Register] = SLOT_INT;
              continue codeLoop;
            case OP_CMPNG: //  x,a := x=(x<=a)?1:0
              if (!arg1IsRegister) return console.error('NYI: CMPNG on non-register');
              if (arg1Type === SLOT_NAMED_OFFSET) {
                arg1Value = runtime.rawPeek(namedOffsets[arg1Value], 4);
                arg1Type = SLOT_INT;
              }
              if (arg1Type !== arg2Type) return console.error('NYI: type ' + arg1Type + ' <= type ' + arg2Type);
              registers[arg1Register] = arg1Value <= arg2Value;
              registerTypes[arg1Register] = SLOT_INT;
              continue codeLoop;
            case OP_CMPNL: //  x,a := x=(x>=a)?1:0
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
            case OP_MOD:
              if (!arg1IsRegister) return console.error('NYI: MOD on non-register');
              if (arg1Type !== SLOT_INT || arg2Type !== SLOT_INT) {
                return console.error('NYI: type ' + arg1Type + ' MOD type ' + arg2Type);
              }
              registers[arg1Register] = arg1Value % arg2Value;
              continue codeLoop;
            case OP_AND: //  &
              if (!arg1IsRegister) return console.error('NYI: AND on non-register');
              if (arg1Type !== SLOT_INT || arg2Type !== SLOT_INT) {
                return console.error('NYI: type ' + arg1Type + ' & type ' + arg2Type);
              }
              registers[arg1Register] &= arg2Value;
              continue codeLoop;
            case OP_OR: //  |
              if (!arg1IsRegister) return console.error('NYI: OR on non-register');
              if (arg1Type !== SLOT_INT || arg2Type !== SLOT_INT) {
                return console.error('NYI: type ' + arg1Type + ' | type ' + arg2Type);
              }
              registers[arg1Register] |= arg2Value;
              continue codeLoop;
            case OP_XOR:
              if (!arg1IsRegister) return console.error('NYI: XOR on non-register');
              if (arg1Type !== SLOT_INT || arg2Type !== SLOT_INT) {
                console.error('NYI: type ' + arg1Type + ' ^ type ' + arg2Type);
                return;
              }
              registers[arg1Register] ^= arg2Value;
              continue codeLoop;
            case OP_ANDL: //  &&
              if (!arg1IsRegister) return console.error('NYI: ANDL on non-register');
              if (arg1Value) {
                registers[arg1Register] = arg2Value;
                registerTypes[arg1Register] = arg2Type;
              }
              continue codeLoop;
            case OP_ORL: //  ||
              if (!arg1IsRegister) return console.error('NYI: ORL on non-register');
              if (!arg1Value) {
                registers[arg1Register] = arg2Value;
                registerTypes[arg1Register] = arg2Type;
              }
              continue codeLoop;
            case OP_SHL:
              if (!arg1IsRegister) return console.error('NYI: SHL on non-register');
              if (arg1Type !== SLOT_INT || arg2Type !== SLOT_INT) {
                return console.error('NYI: type ' + arg1Type + ' << type ' + arg2Type);
              }
              registers[arg1Register] = arg1Value << arg2Value;
              continue codeLoop;
            case OP_SHR:
              if (!arg1IsRegister) return console.error('NYI: SHL on non-register');
              if (arg1Type !== SLOT_INT || arg2Type !== SLOT_INT) {
                return console.error('NYI: type ' + arg1Type + ' >> type ' + arg2Type);
              }
              registers[arg1Register] = arg1Value >> arg2Value;
              continue codeLoop;
            case OP_JTRUE:
              if (arg1Value) {
                pos += arg2Value;
              }
              continue codeLoop;
            case OP_JFALSE:
              if (!arg1Value) {
                pos += arg2Value;
              }
              continue codeLoop;
            case OP_DADD:
              return console.error('NYI: SeeR DADD');
              continue codeLoop;
            case OP_DSUB:
              return console.error('NYI: SeeR DSUB');
              continue codeLoop;
            case OP_DMUL:
              return console.error('NYI: SeeR DMUL');
              continue codeLoop;
            case OP_DDIV:
              return console.error('NYI: SeeR DDIV');
              continue codeLoop;
            case OP_DCMPE: //  x,a := x=(x==a)?1:0
              return console.error('NYI: SeeR DCMPE');
              continue codeLoop;
            case OP_DCMPG: //  x,a := x=(x>a)?1:0
              return console.error('NYI: SeeR DCMPG');
              continue codeLoop;
            case OP_DCMPL: //  x,a := x=(x<a)?1:0
              return console.error('NYI: SeeR DCMPL');
              continue codeLoop;
            case OP_DCMPNG: //  x,a := x=(x<=a)?1:0
              return console.error('NYI: SeeR DCMPNG');
              continue codeLoop;
            case OP_DCMPNL: //  x,a := x=(x>=a)?1:0
              return console.error('NYI: SeeR DCMPNL');
              continue codeLoop;
            case OP_FIXMUL:
              return console.error('NYI: SeeR FIXMUL');
              continue codeLoop;
            case OP_FIXDIV:
              return console.error('NYI: SeeR FIXDIV');
              continue codeLoop;
            case OP_CMOV: // copies 1 byte
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
            case OP_WMOV: // copies 2 bytes
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
            case OP_DMOV: // copies 8 bytes
              return console.error('NYI: SeeR DMOV');
              continue codeLoop;
            case OP_IDBL:
              return console.error('NYI: SeeR IDBL');
              continue codeLoop;
            case OP_DINT:
              return console.error('NYI: SeeR DINT');
              continue codeLoop;
            case OP_FDBL:
              return console.error('NYI: SeeR FDBL');
              continue codeLoop;
            case OP_DFLT:
              return console.error('NYI: SeeR DFLT');
              continue codeLoop;
            case OP_DFIX:
              return console.error('NYI: SeeR DFIX');
              continue codeLoop;
            case OP_FIXDBL:
              return console.error('NYI: SeeR FIXDBL');
              continue codeLoop;
            case OP_FORK:
              return console.error('NYI: SeeR FORK');
              continue codeLoop;
            case OP_RET:
              pos = stack.getInt32(stackPos, true);
              if (pos === 0) {
                return registers[0];
              }
              stackPos += 4;
              continue codeLoop;
            case OP_WAIT:
              return console.error('NYI: SeeR WAIT');
              continue codeLoop;
            case OP_CLI: // \Turn OFF\ Multitasking
              return console.error('NYI: SeeR CLI');
              continue codeLoop;
            case OP_STI:
              return console.error('NYI: SeeR STI');
              continue codeLoop;
            case OP_ENTER:
              stack.setInt32(stackPos -= 4, callTop - stack.byteLength, true);
              stackTypes[stackPos >>> 2] = SLOT_STACK;
              callTop = stackPos;
              continue codeLoop;
            case OP_LEAVE:
              stackPos = callTop;
              callTop = stack.byteLength + stack.getInt32(stackPos, true);
              stackPos += 4;
              continue codeLoop;
            case OP_NOP:
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
