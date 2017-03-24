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
  
  var util = {
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
