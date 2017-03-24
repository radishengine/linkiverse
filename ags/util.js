define(function() {

  'use strict';
  
  var util = {
    member: function(name, def) {
      var value = def.apply(this);
      if (typeof value === 'function') {
        Object.defineProperty(this, name, {get:value, enumerable:true});
      }
      else {
        Object.defineProperty(this, name, {value:value, enumerable:true});
      }
      return this;
    },
  };
  
  return util;

});
