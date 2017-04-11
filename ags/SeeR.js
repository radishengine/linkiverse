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
    
  function Ref(expert, base, offset) {
    this.expert = expert;
    this.base = base;
    this.offset = offset;
    Object.freeze(this);
  }
  Ref.prototype = {
    get value() {
      return this.expert.getRef(this.base, this.offset);
    },
    set value(v) {
      this.expert.setRef(this.base, this.offset, v);
    },
    add: function(n) {
      return new Ref(this.expert, this.base, this.offset + n);
    },
  };
  
  function ValueSlot(value) {
    if (arguments.length !== 0) this.value = value;
    Object.seal(this);
  }
  ValueSlot.prototype = {
    value: 0,
    perform: function(operator, value) {
      switch (operator) {
        case '=': this.value = value; break;
        case '+=':
          if (typeof this.value.add === 'function') {
            this.value = this.value.add(value);
          }
          elseif (typeof value.add === 'function') {
            this.value = value.add(this.value);
          }
          else this.value += value;
          break;
        case '-=':
          if (typeof this.value.sub === 'function') {
            this.value = this.value.sub(value);
          }
          elseif (typeof value.sub === 'function') {
            this.value = value.sub(this.value);
          }
          else this.value += value;
          break;
        case '*=': this.value *= value; break;
        case '/=': this.value /= value; break;
      }
    },
  };
  
  function SeeR(code, pos) {
    this.code = code;
    if (!isNaN(code)) this.nextPos = pos;
    this.operands = [];
    this.registers = {};
    this.stack = {};
    this.literalSlot1 = new ValueSlot;
    this.literalSlot2 = new ValueSlot;
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
    
    currentPos: -1,
    nextPos: 0,
    currentOperator: OP_EOF,
    getRegisterSlot: function(n) {
      return n in this.registers ? this.registers[n] : this.registers[n] = new ValueSlot;
    },
    getStackValue: function(n) {
      n += this.stackBase;
      return n in this.stack ? this.stack[n].value : 0;
    },
    getStackSlot: function(n) {
      n += this.stackBase;
      return n in this.stack ? this.stack[n] : this.stack[n] = new ValueSlot;
    },
    get code() {
      return this._code;
    },
    set code(v) {
      this._code = v;
      this.dv = new DataView(v.buffer, v.byteOffset, v.byteLength);
    },
    stackBase: 0,
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
            if (typeof ptr === number) switch (v1PointerBase) {
              case BASE_IMPORT:
                ptr = new Ref(this.getBaseName(ptr), 0);
                break;
              case BASE_DATA:
                ptr = new Ref('@data', ptr);
                break;
              case BASE_CONST:
                ptr = new Ref('@const', ptr);
                break;
              case BASE_STACK:
                ptr = this.getStackSlot(ptr);
                break;
            }
            this.operands[0] = operand;
          }
          else if (v1IsRegister) {
            this.operands[0] = this.getRegisterSlot(v1Register);
          }
          else if (op === OP_DNEG || op === OP_DPUSH) {
            (this.operands[0] = this.literalSlot1).value = this.dv.getFloat64(nextPos, true);
            nextPos += 8;
          }
          else {
            (this.operands[0] = this.literalSlot1).value = this.dv.getInt32(pos + 4, true);
            nextPos += 8;
          }
          this.nextPos = nextPos;
          break;
        default:
          this.operands.length = 2;
          var full = this.dv.getInt32(this.pos, true);
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
            if (typeof ptr === number) switch (v1PointerBase) {
              case BASE_IMPORT:
                ptr = new Ref(this.getBaseName(ptr), 0);
                break;
              case BASE_DATA:
                ptr = new Ref('@data', ptr);
                break;
              case BASE_CONST:
                ptr = new Ref('@const', ptr);
                break;
              case BASE_STACK:
                ptr = this.getStackSlot(ptr);
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
            (this.operands[0] = this.literalSlot1).value = this.dv.getInt32(pos + 4, true);
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
            if (typeof ptr === number) switch (v2PointerBase) {
              case BASE_IMPORT:
                ptr = new Ref(this.getBaseName(ptr), 0);
                break;
              case BASE_DATA:
                ptr = new Ref('@data', ptr);
                break;
              case BASE_CONST:
                ptr = new Ref('@const', ptr);
                break;
              case BASE_STACK:
                ptr = this.getStackSlot(ptr);
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
              (this.operands[1] = this.literalSlot2).value = this.dv.getFloat64(pos + 4, true);
              nextPos += 8;
              break;
            default:
              (this.operands[1] = this.literalSlot2).value = this.dv.getInt32(pos + 4, true);
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
  };
  
  return Object.assign(SeeR, {ValueSlot:ValueSlot, Ref:Ref});

});
