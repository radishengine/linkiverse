define(function() {

  'use strict';
  
  const OP_EOF=0,
    OP_PUSH=0x01, OP_PUSHADR=0x02, OP_DPUSH=0x03, OP_POP=0x04,
    OP_NEG=0x05, OP_DNEG=0x06, OP_NOT=0x07,
    OP_OPTIONS=0x08,
    OP_JMP=0x09, OP_CALL=0x0A,
    OP_MOV=0x0B,
    OP_XCHG=0x0C,
    OP_CALLEX=0x0D,
    OP_COPY=0x0E,
    OP_ADD=0x0F, OP_SUB=0x10, OP_MUL=0x11, OP_DIV=0x12,
    OP_CMPE=0x13, OP_CMPG=0x14, OP_CMPL=0x15, OP_CMPNG=0x16, OP_CMPNL=0x17,
    OP_MOD=0x18,
    OP_AND=0x19, OP_OR=0x1A, OP_XOR=0x1B,
    OP_ANDL=0x1C, OP_ORL=0x1D,
    OP_SHL=0x1E, OP_SHR=0x1F,
    OP_JTRUE=0x20, OP_JFALSE=0x21,
    OP_DADD=0x22, OP_DSUB=0x23, OP_DMUL=0x24, OP_DDIV=0x25,
    OP_DCMPE=0x26, OP_DCMPG=0x27, OP_DCMPL=0x28, OP_DCMPNG=0x29, OP_DCMPNL=0x2A,
    OP_FIXMUL=0x2B, OP_FIXDIV=0x2C,
    OP_CMOV=0x2D, OP_WMOV=0x2E, OP_DMOV=0x2F,
    OP_IDBL=0x30, OP_DINT=0x31, OP_FDBL=0x32, OP_DFLT=0x33, OP_DFIX=0x34, OP_FIXDBL=0x35,
    OP_FORK=0x36,
    OP_RET=0x37,
    OP_WAIT=0x38,
    OP_CLI=0x39, OP_STI=0x3A,
    OP_ENTER=0x3B, OP_LEAVE=0x3C,
    OP_NOP=0x3D,
    OP_UNASSIGNED_1=0x3E, OP_UNASSIGNED_2=0x3F,
    
    BASE_IMPORT = 0,
    BASE_CONST = 1,
    BASE_DATA = 2,
    BASE_STACK = 3;
    
  function ValueSlot(expert, base, offset, defer) {
    this.value = 0;
    Object.defineProperties(this, {
      expert: {value:expert, enumerable:true},
      base: {value:base, enumerable:true},
      offset: {value:isNaN(offset) ? 0 : offset, enumerable:true},
      defer: {value:!!defer, enumerable:true},
    });
    if (defer) {
      Object.defineProperty(this, 'value', {
        get: function() { return expert.getRef(base, offset); },
        set: function(v) { expert.setRef(base, offset, v); },
        enumerable: true,
      });
    }
    Object.seal(this);
  }
  ValueSlot.prototype = {
    operate: function(operator, value) {
      switch (operator) {
        case '+': return new ValueSlot(this.expert, this.base, this.offset + value, this.defer);
        case '-': return new ValueSlot(this.expert, this.base, this.offset - value, this.defer);
        default: return NaN;
      }
    },
  };
  
  function SeeR(code, pos) {
    this.code = code;
    if (!isNaN(code)) this.nextPos = pos;
    this.operands = [];
    this.stack = {};
    var self = this;
    this.registers = {
      '240': new ValueSlot(this, '@code', 0, true),
      '241': new ValueSlot(this, '@data', 0, true),
      '242': new ValueSlot(this, '@const', 0, true),
      '243': this.getStackSlot(0),
      '244': {
        get value() { return self.nextPos; },
        set value(v) { self.nextPos = v; },
      },
      '245': {
        get value() { return self.stackPos; },
        set value(v) { self.stackPos = v; },
      },
      '246': {
        get value() { return self.callStackBase; },
        set value(v) { self.callStackBase = v; },
      },
      '247': {
        get value() { return self.copyByteLength; },
        set value(v) { self.copyByteLength = v; },
      },
      '248': {
        get value() { return self.instanceStackBase; },
        set value(v) { self.instanceStackBase = v; },
      },
      '249': {
        get value() { return self.interruptBlockLevel; },
        set value(v) { self.interruptBlockLevel = v; },
      },
      '251': {
        get value() { return self.nextOpIsUnsigned ? 1 : 0; },
        set value(v) { self.nextOpIsUnsigned = !!(v & 1); },
      },
    };
    this.literalSlot1 = new ValueSlot(this, '@literal', 0, false);
    this.literalSlot2 = new ValueSlot(this, '@literal', 1, false);
  }
  SeeR.prototype = {
    /*OVERRIDEME*/ getBaseName: function(n) {
      return '@import['+n+']';
    },
    /*OVERRIDEME*/ getRef: function(base, offset) {
      return 0;
    },
    /*OVERRIDEME*/ setRef: function(base, offset, value) {
    },
    /*OVERRIDEME*/ callRef: function(base, offset, args) {
      return 0;
    },
    
    interruptBlockLevel: 0,
    get interruptsEnabled() {
      return this.interruptBlockLevel === 0;
    },
    copyByteLength: 0,
    currentPos: -1,
    nextPos: 0,
    nextOpIsUnsigned: false,
    currentOperator: OP_EOF,
    getRegisterSlot: function(n) {
      if (n in this.registers) return this.registers[n];
      return this.registers[n] = new ValueSlot(this, '@register', n, false);
    },
    getStackValue: function(n) {
      return n in this.stack ? this.stack[n].value : 0;
    },
    getStackSlot: function(n) {
      if (n in this.stack) return this.stack[n];
      return this.stack[n] = new ValueSlot(this, '@stack', n, false);
    },
    get code() {
      return this._code;
    },
    set code(v) {
      this._code = v;
      this.dv = new DataView(v.buffer, v.byteOffset, v.byteLength);
    },
    callStackBase: 0,
    instanceStackBase: 0,
    _stackPos: 0,
    get stackPos() {
      return this._stackPos;
    },
    set stackPos(v) {
      if (isNaN(v) || !isFinite(v) || v > 0 || v !== (v | 0)) {
        throw new TypeError('invalid stack pos: ' + v);
      }
      if (v > this._stackPos) {
        Object.keys(this.stack).forEach(function(key) {
          if (!isNaN(key) && v > key) delete this[key];
        }, this.stack);
      }
      this._stackPos = v;
    },
    next: function() {
      var pos;
      if ((pos = this.currentPos = this.nextPos) >= this.code.length) {
        return this.currentOperator = OP_EOF;
      }
      var op = this.code[pos] & 0x3F;
      if (op === 0) {
        this.operands.length = 0;
        return this.currentOperator = this.dv.getInt32(pos, true);
      }
      switch (this.currentOperator = op) {
        case OP_PUSH: case OP_PUSHADR: case OP_DPUSH: case OP_POP: case OP_NEG:
        case OP_DNEG: case OP_NOT:  case OP_OPTIONS: case OP_JMP: case OP_CALL:
          this.operands.length = 1;
          var full = this.dv.getInt32(pos, true);
          var nextPos = pos + 4;
          var v1IsPointer = full & 0x100;
          var v1IsRegister = full & 0x200;
          var v1Register = (full >> 16) & 0xff;
          if (v1IsPointer) {
            var ptr;
            if (v1IsRegister) {
              ptr = this.getRegisterSlot(v1Register).value;
            }
            else {
              ptr = this.dv.getInt32(nextPos, true);
              nextPos += 4;
            }
            var v1PointerBase = (full >> 10) & 3;
            if (typeof ptr === 'number') switch (v1PointerBase) {
              case BASE_IMPORT:
                ptr = new ValueSlot(this, this.getBaseName(ptr), 0, true);
                break;
              case BASE_DATA:
                ptr = new ValueSlot(this, '@data', ptr, true);
                break;
              case BASE_CONST:
                ptr = new ValueSlot(this, '@const', ptr, true);
                break;
              case BASE_STACK:
                ptr = this.getStackSlot(this.callStackBase + ptr);
                break;
            }
            this.operands[0] = ptr;
          }
          else if (v1IsRegister) {
            this.operands[0] = this.getRegisterSlot(v1Register);
          }
          else if (op === OP_DNEG || op === OP_DPUSH) {
            (this.operands[0] = this.literalSlot1).value = this.dv.getFloat64(nextPos, true);
            nextPos += 8;
          }
          else {
            (this.operands[0] = this.literalSlot1).value = this.dv.getInt32(nextPos, true);
            nextPos += 4;
          }
          this.nextPos = nextPos;
          break;
        default:
          this.operands.length = 2;
          var full = this.dv.getInt32(pos, true);
          var nextPos = pos + 4;
          var v1IsPointer = full & 0x40;
          var v1IsRegister = full & 0x100;
          var v1Register = (full >> 16) & 0xff;
          if (v1IsPointer) {
            var ptr;
            if (v1IsRegister) {
              ptr = this.getRegisterValue(v1Register);
            }
            else {
              ptr = this.dv.getInt32(nextPos, true);
              nextPos += 4;
            }
            var v1PointerBase = (full >> 10) & 3;
            if (typeof ptr === 'number') switch (v1PointerBase) {
              case BASE_IMPORT:
                ptr = new ValueSlot(this, this.getBaseName(ptr), 0, true);
                break;
              case BASE_DATA:
                ptr = new ValueSlot(this, '@data', ptr, true);
                break;
              case BASE_CONST:
                ptr = new ValueSlot(this, '@const', ptr, true);
                break;
              case BASE_STACK:
                ptr = this.getStackSlot(this.callStackBase + ptr);
                break;
            }
            this.operands[0] = ptr;
          }
          else if (v1IsRegister) {
            this.operands[0] = this.getRegisterSlot(v1Register);
          }
          else if (op === OP_DNEG || op === OP_DPUSH) {
            (this.operands[0] = this.literalSlot1).value = this.dv.getFloat64(nextPos, true);
            nextPos += 8;
          }
          else {
            (this.operands[0] = this.literalSlot1).value = this.dv.getInt32(nextPos, true);
            nextPos += 4;
          }
          var v2IsPointer = full & 0x80;
          var v2IsRegister = full & 0x1000;
          var v2Register = (full >> 24) & 0xff;
          if (v2IsPointer) {
            var ptr;
            if (v2IsRegister) {
              ptr = this.getRegisterValue(v2Register);
            }
            else {
              ptr = this.dv.getInt32(nextPos, true);
              nextPos += 4;
            }
            var v2PointerBase = (full >> 13) & 3;
            if (typeof ptr === 'number') switch (v2PointerBase) {
              case BASE_IMPORT:
                ptr = new ValueSlot(this, this.getBaseName(ptr), 0, true);
                break;
              case BASE_DATA:
                ptr = new ValueSlot(this, '@data', ptr, true);
                break;
              case BASE_CONST:
                ptr = new ValueSlot(this, '@const', ptr, true);
                break;
              case BASE_STACK:
                ptr = this.getStackSlot(this.callStackBase + ptr);
                break;
            }
            this.operands[1] = ptr;
          }
          else if (v2IsRegister) {
            this.operands[1] = this.getRegisterSlot(v2Register);
          }
          else switch (op) {
            case OP_DADD: case OP_DSUB: case OP_DMUL: case OP_DDIV:
            case OP_DCMPE: case OP_DCMPG: case OP_DCMPL: case OP_DCMPNG: case OP_DCMPNL:
            case OP_DFIX: case OP_DMOV:
              (this.operands[1] = this.literalSlot2).value = this.dv.getFloat64(nextPos, true);
              nextPos += 8;
              break;
            default:
              (this.operands[1] = this.literalSlot2).value = this.dv.getInt32(nextPos, true);
              nextPos += 4;
              break;
          }
          this.nextPos = nextPos;
          break;
        case OP_RET: case OP_WAIT: case OP_CLI: case OP_STI:
        case OP_ENTER: case OP_LEAVE: case OP_NOP:
          this.operands.length = 0;
          this.nextPos = pos + 1;
          break;
        case OP_UNASSIGNED_1: case OP_UNASSIGNED_2:
          throw new Error('unknown opcode: 0x' + op.toString(16));
      }
      return op;
    },
    pushValues: function() {
      var pos = this._stackPos -= 4 * arguments.length;
      for (var i = 0; i < arguments.length; i++) {
        this.getStackSlot(pos + i * 4).value = arguments[i];
      }
    },
    pushValue: function(v) {
      this.getStackSlot(this._stackPos -= 4).value = v;
    },
    popValue: function() {
      var v = this.getStackValue(this._stackPos);
      delete this.stack[this._stackPos];
      this._stackPos += 4;
      return v;
    },
    process: function() {
      switch (this.currentOperator) {
        case OP_EOF:
          return false;
        case OP_RET:
          if (this.stackPos === this.instanceStackBase) {
            return false;
          }
          this.nextPos = this.popValue();
          return true;
        case OP_CLI:
          this.interruptBlockLevel++;
          return true;
        case OP_STI:
          if (--this.interruptBlockLevel < 0) {
            this.interruptBlockLevel = 0;
            console.error('multitasking violation');
          }
          return true;
        case OP_WAIT:
          // NYI
          return true;
        case OP_ENTER:
          this.pushValue(this.callStackBase);
          this.callStackBase = this.stackPos;
          return true;
        case OP_LEAVE:
          this.stackPos = this.callStackBase;
          this.callStackBase = this.popValue();
          return true;
        case OP_NOP:
          return true;
          
        case OP_PUSH:
          this.pushValue(this.operands[0].value);
          return true;
        case OP_PUSHADR:
          this.pushValue(this.operands[0]);
          return true;
        case OP_DPUSH:
          this.stackPos -= 4;
          this.pushValue(this.operands[0].value);
          return true;
        case OP_POP:
          this.operands[0].value = this.popValue();
          return true;
        case OP_NEG:
        case OP_DNEG:
          this.operands[0].value = -this.operands[0].value;
          return true;
        case OP_NOT:
          this.operands[0].value = !this.operands[0].value;
          return true;
        case OP_OPTIONS:
          this.nextOpIsUnsigned = !!(this.operands[0] & 1);
          return true;
        case OP_JMP:
          this.nextPos += this.operands[0].value;
          return true;
        case OP_CALL:
          this.pushValue(this.nextPos);
          this.nextPos = this.operands[0].value;
          return true;
          
        case OP_CALLEX:
          var importNumber = this.operands[0].value, callInfo = this.operands[1].value;
          var argAllocation = callInfo & 0xffff;
          var isVoid = callInfo & 0x400000;
          var structMode = (callInfo >> 23) & 7;
          structMode = (structMode < 2) ? !!structMode : 1 << (structMode - 2);
          var callingFromOtherInstance = callInfo & 0x4000000;
          var resultType = (callInfo & 0x8000000) ? 'double' : 'int';
          var isMember = callInfo & 0x10000000;
          var dispatcher = callInfo >>> 29;
          var args = [];
          for (var i = 0; i < argAllocation; i += 4) {
            args.push(this.getStackSlot(this.stackPos + i));
          }
          var result = this.callRef('@import', importNumber, args);
          if (!isVoid) {
            this.getRegisterSlot(0).value = result;
          }
          return true;
        case OP_COPY:
          if (this.copyByteLength > 0) {
            throw new Error('NYI: OP_COPY');
          }
          return true;
        case OP_MOV:
        case OP_CMOV:
        case OP_WMOV:
        case OP_DMOV:
          this.operands[0].value = this.operands[1].value;
          return true;
        case OP_ADD:
        case OP_DADD:
          if (typeof this.operands[0].value.operate === 'function') {
            this.operands[0].value = this.operands[0].value.operate('+', this.operands[1].value);
          }
          else if (typeof this.operands[1].value.operate === 'function') {
            this.operands[0].value = this.operands[1].value.operate('+', this.operands[0].value);
          }
          else {
            this.operands[0].value += this.operands[1].value;
          }
          return true;
        case OP_SUB:
        case OP_DSUB:
          if (typeof this.operands[0].value.operate === 'function') {
            this.operands[0].value = this.operands[0].value.operate('-', this.operands[1].value);
          }
          else {
            this.operands[0].value -= this.operands[1].value;
          }
          return true;
        case OP_CMPE:
          if (typeof this.operands[0].value.operate === 'function') {
            this.operands[0].value = this.operands[0].value.operate('===', this.operands[1].value);
          }
          else {
            this.operands[0].value = this.operands[0].value === this.operands[1].value;
          }
          return true;
        case OP_CMPG:
          var value1 = this.operands[0].value, value2 = this.operands[1].value;
          if (this.nextOpIsUnsigned) {
            this.nextOpIsUnsigned = false;
            if (typeof value1.operate === 'function') {
              value1 = value1.operate('>>>', 0);
            }
            else {
              value1 >>>= 0;
            }
            if (typeof value2.operate === 'function') {
              value2 = value2.operate('>>>', 0);
            }
            else {
              value2 >>>= 0;
            }
          }
          if (typeof value1.operate === 'function') {
            this.operands[0].value = value1.operate('>', value2);
          }
          else if (typeof value2.operate === 'function') {
            this.operands[0].value = value2.operate('<', value1);
          }
          else {
            this.operands[0].value = value1 > value2;
          }
          return true;
        case OP_CMPL:
          var value1 = this.operands[0].value, value2 = this.operands[1].value;
          if (this.nextOpIsUnsigned) {
            this.nextOpIsUnsigned = false;
            if (typeof value1.operate === 'function') {
              value1 = value1.operate('>>>', 0);
            }
            else {
              value1 >>>= 0;
            }
            if (typeof value2.operate === 'function') {
              value2 = value2.operate('>>>', 0);
            }
            else {
              value2 >>>= 0;
            }
          }
          if (typeof value1.operate === 'function') {
            this.operands[0].value = value1.operate('<', value2);
          }
          else if (typeof value2.operate === 'function') {
            this.operands[0].value = value2.operate('>', value1);
          }
          else {
            this.operands[0].value = value1 < value2;
          }
          return true;
        case OP_CMPNG:
          var value1 = this.operands[0].value, value2 = this.operands[1].value;
          if (this.nextOpIsUnsigned) {
            this.nextOpIsUnsigned = false;
            if (typeof value1.operate === 'function') {
              value1 = value1.operate('>>>', 0);
            }
            else {
              value1 >>>= 0;
            }
            if (typeof value2.operate === 'function') {
              value2 = value2.operate('>>>', 0);
            }
            else {
              value2 >>>= 0;
            }
          }
          if (typeof value1.operate === 'function') {
            this.operands[0].value = value1.operate('<=', value2);
          }
          else if (typeof value2.operate === 'function') {
            this.operands[0].value = value2.operate('>', value1);
          }
          else {
            this.operands[0].value = value1 <= value2;
          }
          return true;
        case OP_CMPNL:
          var value1 = this.operands[0].value, value2 = this.operands[1].value;
          if (this.nextOpIsUnsigned) {
            this.nextOpIsUnsigned = false;
            if (typeof value1.operate === 'function') {
              value1 = value1.operate('>>>', 0);
            }
            else {
              value1 >>>= 0;
            }
            if (typeof value2.operate === 'function') {
              value2 = value2.operate('>>>', 0);
            }
            else {
              value2 >>>= 0;
            }
          }
          if (typeof value1.operate === 'function') {
            this.operands[0].value = value1.operate('>=', value2);
          }
          else if (typeof value2.operate === 'function') {
            this.operands[0].value = value2.operate('<', value1);
          }
          else {
            this.operands[0].value = value1 >= value2;
          }
          return true;
        case OP_MUL:
        case OP_DMUL:
          if (typeof this.operands[0].value.operate === 'function') {
            this.operands[0].value = this.operands[0].value.operate('*', this.operands[1].value);
          }
          else if (typeof this.operands[1].value.operate === 'function') {
            this.operands[0].value = this.operands[1].value.operate('*', this.operands[0].value);
          }
          else {
            this.operands[0].value *= this.operands[1].value;
          }
          return true;
        case OP_DIV:
          if (this.nextOpIsUnsigned) {
            var value1 = this.operands[0].value, value2 = this.operands[1].value;
            this.nextOpIsUnsigned = false;
            if (typeof value1.operate === 'function') {
              value1 = value1.operate('>>>', 0);
            }
            else {
              value1 >>>= 0;
            }
            if (typeof value2.operate === 'function') {
              value2 = value2.operate('>>>', 0);
            }
            else {
              value2 >>>= 0;
            }
            if (typeof value1.operate === 'function') {
              this.operands[0].value = value1.operate('(int)/', this.operands[1].value);
            }
            else {
              this.operands[0].value = (value1 / value2) >>> 0;
            }
          }
          else {
            if (typeof this.operands[0].value.operate === 'function') {
              this.operands[0].value = this.operands[0].value.operate('(int)/', this.operands[1].value);
            }
            else {
              this.operands[0].value = (this.operands[0].value / this.operands[1].value) | 0;
            }
          }
          return true;
        case OP_DDIV:
          if (typeof this.operands[0].value.operate === 'function') {
            this.operands[0].value = this.operands[0].value.operate('/', this.operands[1].value);
          }
          else {
            this.operands[0].value /= this.operands[1].value;
          }
          return true;
        case OP_FIXMUL:
        case OP_FIXDIV:
        case OP_DFIX:
        case OP_FIXDBL:
          throw new Error('NYI: fixed point');
        case OP_DCMPE:
          this.operands[0].value = this.operands[0].value === this.operands[1].value;
          return true;
        case OP_DCMPG:
          this.operands[0].value = this.operands[0].value > this.operands[1].value;
          return true;
        case OP_DCMPL:
          this.operands[0].value = this.operands[0].value < this.operands[1].value;
          return true;
        case OP_DCMPNG:
          this.operands[0].value = this.operands[0].value <= this.operands[1].value;
          return true;
        case OP_DCMPNL:
          this.operands[0].value = this.operands[0].value >= this.operands[1].value;
          return true;
        case OP_MOD:
          var value1 = this.operands[0].value, value2 = this.operands[1].value;
          if (this.nextOpIsUnsigned) {
            this.nextOpIsUnsigned = false;
            if (typeof value1.operate === 'function') {
              value1 = value1.operate('>>>', 0);
            }
            else {
              value1 >>>= 0;
            }
            if (typeof value2.operate === 'function') {
              value2 = value2.operate('>>>', 0);
            }
            else {
              value2 >>>= 0;
            }
          }
          if (typeof this.operands[0].value.operate === 'function') {
            this.operands[0].value = value1.operate('%', value2);
          }
          else {
            this.operands[0].value = value1 % value2;
          }
          return true;
        case OP_AND:
          this.operands[0].value &= this.operands[1].value;
          return true;
        case OP_OR:
          this.operands[0].value |= this.operands[1].value;
          return true;
        case OP_XOR:
          this.operands[0].value ^= this.operands[1].value;
          return true;
        case OP_ANDL:
          this.operands[0].value = this.operands[0].value && this.operands[1].value;
          return true;
        case OP_ORL:
          this.operands[0].value = this.operands[0].value || this.operands[1].value;
          return true;
        case OP_SHR:
          if (this.nextOpIsUnsigned) {
            this.nextOpIsUnsigned = false;
            this.operands[0].value >>>= this.operands[1].value;
          }
          else {
            this.operands[0].value >>= this.operands[1].value;
          }
          return true;
        case OP_SHL:
          this.operands[0].value <<= this.operands[1].value;
          return true;
        case OP_IDBL:
        case OP_FDBL:
        case OP_DFLT:
          this.operands[0].value = this.operands[1].value;
          return true;
        case OP_DINT:
          this.operands[0].value = this.operands[1].value | 0;
          return true;
        case OP_JTRUE:
          if (this.operands[0].value) {
            this.nextPos += this.operands[1].value;
          }
          return true;
        case OP_JFALSE:
          if (this.operands[0].value) {
            this.nextPos += this.operands[1].value;
          }
          return true;
        case OP_FORK:
          throw new Error('NYI: OP_FORK');
      }
    },
  };
  
  return Object.assign(SeeR, {ValueSlot:ValueSlot});

});
