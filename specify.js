define(function() {

  'use strict';

  function specify(def) {
    var spec = Object.create(specify.factory);
    return def ? Object.assign(spec, def) : spec;
  }
  
  function Dot(object, memberName) {
    this.object = object;
    this.memberName = memberName;
    Object.freeze(this);
  }
  Dot.prototype = {
    toString: function() {
      return this.object + '.' + this.memberName;
    },
  };
  
  function SquareIndex(object, index) {
    this.object = object;
    this.index = index;
    Object.freeze(this);
  }
  SquareIndex.prototype = {
    toString: function() {
      return isNaN(this.index) ? this.object+'[]' : this.object+'['+this.index+']';
    },
  };
  
  function demangle(name) {
    var dot = name.match(/^(.*)\.([^\.\[\]]+)$/);
    if (dot) {
      return Dot(demangle(dot[1]), dot[2]);
    }
    var sqIdx = name.match(/^(.*?)\[(\d+)?\]$/);
    if (sqIdx) {
      return SquareIndex(demangle(sqIdx[1]), +sqIdx[2]));
    }
    return name;
  }
  
  specify.factory = {
    endOffset: 0,
    littleEndian: true,
    $objectGetter: function(target) {
      if (typeof target === 'string') {
        var prop = Object.getOwnPropertyDescriptor(this, target);
        if (!prop) {
          Object.defineProperty(this, target, {
            get: function() {
              var obj = {};
              Object.defineProperty(this, target, {
                value: obj,
                enumerable: true,
                configurable: true,
              });
              return obj;
            },
            enumerable: true,
            configurable: true,
          });
          
        }
      }
      if (target instanceof Dot) {
        return this.$getObject(target.object)
      }
    },
    $: function(name, byteLength, def) {
      const offset = this.endOffset;
      this.endOffset += byteLength;
      def = def(offset);
      name = demangle(name);
      var context = this;
      while (typeof name !== 'string') {
        while (name instanceof Dot) {
          var spec = Object.getOwnPropertyDescriptor(context, name.memberName);
          if (spec) {
            if ('value' in spec) {
              context = spec.value;
            }
            else {
              spec.get
              Object.defineProperty(context, 
            }
          }
          else {
            var newContext = {};
            Object.defineProperty(context, name, {
              value: newContext,
              enumerable: true,
              configurable: true,
            });
            context = newContext;
          }
        }
      }
      if (typeof def === 'function') {
        if (context !== this) def = def.bind(this);
        if (def.noCache) {
          Object.defineProperty(this, name, {
            get: def,
            enumerable: true,
            configurable: true,
          });
        }
        else {
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
        function get() {
          return getter.call(this.dv, offset, this.littleEndian);
        }
        get.noCache = true;
        return get;
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
      ].join('\n'))();
      Func.prototype = Object.create(this);
      return Func;
    },
  };
  
  return specify;

});
