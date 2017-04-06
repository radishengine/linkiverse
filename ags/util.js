define(function() {

  'use strict';
  
  var decodeByteString;
  if ('TextDecoder' in window) {
    decodeByteString = new TextDecoder("iso-8859-1");
    decodeByteString = decodeByteString.decode.bind(decodeByteString);
  }
  else {
    decodeByteString = String.fromCharCode.apply.bind(null);
  }
  
  function Stack32(maxSize, initialSize) {
    if (!isNaN(maxSize)) this.maxSize = maxSize;
    this.dv = new DataView(new ArrayBuffer(isNaN(initialSize) ? 16 : initialSize));
  }
  Stack32.prototype = {
    maxSize: 4000,
    _pos: 0,
    localBase: 0,
    get absolutePos() {
      return this._pos;
    },
    set absolutePos(pos) {
      if (!(pos >= 0 && pos < this.stack.length)) {
        if (isNaN(pos)) {
          throw new TypeError('absolutePos must be a number, got ' + typeof pos);
        }
        throw new RangeError('absolutePos out of range (0-'+(this.stack.length-1)+'): '+pos);
      }
      this._pos = pos;
    },
    get topRelativePos() {
      return this._pos - this.dv.byteLength;
    },
    set topRelativePos(pos) {
      if (!(pos <= 0)) {
        if (isNaN(pos)) {
          throw new TypeError('pos must be a number');
        }
        throw new Error('stack underflow');
      }
      var newPos = this.dv.byteLength + pos;
      if (newPos < 0) {
        var newSize = this.dv.byteLength;
        do {
          if (newSize >= this.maxSize) throw new Error('stack overflow');
          newPos += newSize;
          newSize *= 2;
        } while (newPos < 0);
        var newDV = new DataView(new ArrayBuffer(newSize));
        new Uint8Array(newDV.buffer).set(
          new Uint8Array(this.dv.buffer),
          newSize - this.dv.byteLength);
      }
      this._pos = newPos;
    },
    get localPos() {
      return this.topRelativePos - this.localBase;
    },
    set localPos(pos) {
      this.topRelativePos = this.localBase + pos;
    },
    ensureBelow: function(n) {
      var diff = n - this._pos;
      if (diff <= 0) return;
      var newSize = this.dv.byteLength;
      do {
        if (newSize >= this.maxSize) throw new Error('stack overflow');
        diff -= newSize;
        this._pos += newSize;
        newSize *= 2;
      } while (diff > 0);
      var newDV = new DataView(new ArrayBuffer(newSize));
      new Uint8Array(newDV.buffer, newSize - this.dv.byteLength).set(new Uint8Array(this.dv.buffer));
      this.dv = newDV;
    },
    pushInt32: function(i) {
      this.ensureBelow(4);
      this.dv.setInt32(this._pos -= 4, i, true);
    },
    popInt32: function() {
      var i = this.dv.getInt32(this._pos, true);
      this._pos += 4;
      return i;
    },
    pushLocalBase: function() {
      this.pushInt32(this.localBase);
      this.localBase = this.topRelativePos;
    },
    popLocalBase: function() {
      this.localBase = this.popInt32();
    },
  };
  
  var util = {
    Stack32: Stack32,
    member: function(name, def) {
      var value = def.apply(this);
      if (typeof value === 'function') {
        if (value.noCache) {
          Object.defineProperty(this, name, {get:value, enumerable:true});
        }
        else {
          Object.defineProperty(this, name, {
            get: function() {
              value = value.apply(this);
              Object.defineProperty(this, name, {value:value, enumerable:true});
              return value;
            },
            enumerable: true,
            configurable: true,
          });
        }
      }
      else {
        Object.defineProperty(this, name, {value:value, enumerable:true});
      }
      return this;
    },
    byteString: function(bytes, offset, length) {
      switch (arguments.length) {
        case 0: break;
        case 1: bytes = bytes.subarray(offset); break;
        default: bytes = bytes.subarray(offset, offset + length); break;
      }
      return decodeByteString(bytes);
    },
  };
  
  return util;

});
