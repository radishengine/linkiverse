define(function() {

  'use strict';

  function specify(def) {
    var spec = Object.create(specify.factory);
    return def ? Object.assign(spec, def) : spec;
  }
  
  specify.factory = {
    endOffset: 0,
    littleEndian: true,
    $: function(name, byteLength, def) {
      const offset = this.endOffset;
      this.endOffset += byteLength;
      def = def(offset);
      if (typeof def === 'function') {
        Object.defineProperty(this, name, {
          get: function() {
            var value = def.apply(this);
            Object.defineProperty(this, name, {value:value, enumerable:true, configurable:true});
            return value;
          },
          enumerable: true,
          configurable: true,
        });
      }
      else {
        Object.defineProperty(this, name, {
          value: def,
          enumerable: true,
          configurable: true,
        });
      }
      return this;
    },
    $skip: function(byteLength) {
      this.endOffset += byteLength;
      return this;
    },
    $numeric: function(name, byteLength, dvName) {
      if (!name) return this.$skip(byteLength);
      var getter = DataView.prototype['get'+dvName];
      return this.$(name, byteLength, function(offset) {
        return function() {
          return getter.call(this.dv, offset, this.littleEndian);
        };
      });
    },
    $numericMulti: function(byteLength, dvName, list) {
      if (list.length === 0) {
        return this.$skip(byteLength);
      }
      for (var i = 0; i < list.length; i++) {
        this.$numeric(list[i], byteLength, dvName);
      }
      return this;
    },
    $i32: function(name) {
      if (arguments.length !== 1) {
        return this.$numericMulti.apply(this, [4, 'Int32'].concat(arguments));
      }
      return this.$numeric(4, 'Int32');
    },
    $i16: function(name) {
      if (arguments.length !== 1) {
        return this.$numericMulti.apply(this, [2, 'Int16'].concat(arguments));
      }
      return this.$numeric(4, 'Int16');
    },
    $i8: function(name) {
      if (arguments.length !== 1) {
        return this.$numericMulti(1, 'Int8', arguments);
      }
      return this.$numeric(4, 'Int8');
    },
    $u32: function(name) {
      if (arguments.length !== 1) {
        return this.$numericMulti(4, 'Uint32', arguments);
      }
      return this.$numeric(4, 'Uint32');
    },
    $u16: function(name) {
      if (arguments.length !== 1) {
        return this.$numericMulti(2, 'Uint16', arguments);
      }
      return this.$numeric(4, 'Uint16');
    },
    $u8: function(name) {
      if (arguments.length !== 1) {
        return this.$numericMulti(1, 'Uint8', arguments);
      }
      return this.$numeric(4, 'Uint8');
    },
    $f32: function(name) {
      if (arguments.length !== 1) {
        return this.$numericMulti(4, 'Float32', arguments);
      }
      return this.$numeric(4, 'Float32');
    },
    $f64: function(name) {
      if (arguments.length !== 1) {
        return this.$numericMulti(8, 'Float64', arguments);
      }
      return this.$numeric(4, 'Float64');
    },
    $at: function(newOffset) {
      if (newOffset < this.endOffset) {
        throw new Error('$at can only be used to go forward, not back');
      }
      this.endOffset = newOffset;
      return this;
    },
    get bytes() {
      var bytes = new Uint8Array(this.buffer, this.byteOffset, this.byteLength);
      Object.defineProperty(this, 'bytes', {value:bytes, enumerable:true});
      return bytes;
    },
    get dv() {
      var dv = new DataView(this.buffer, this.byteOffset, this.byteLength);
      Object.defineProperty(this, 'dv', {value:dv, enumerable:true});
      return dv;
    },
    createType: function(name) {
      name = name || 'CustomSpec';
      var Func = new Function([''
        ,'return function ' + name + '(buffer, byteOffset, byteLength) {'
        ,'  Object.defineProperties(this, {'
        ,'    buffer: {value:buffer, enumerable:true},'
        ,'    byteOffset: {value:byteOffset, enumerable:true},'
        ,'    byteLength: {value:byteLength, enumerable:true},'
        ,'  });'
        ,'};'
      ].join('\n'));
      Func.prototype = Object.create(this);
      return Func;
    },
  };
  
  return specify;

});
