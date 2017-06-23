define(function() {

  'use strict';
  
  return {
    load: function(name, parentRequire, onload, config) {
      parentRequire(name + '_idb', function(lib) {
        var req = lib.requestDBConnection();
        req.addEventListener('success', function onsuccess() {
          onload(req.result);
          req.removeEventListener('success', onsuccess);
        });
        req.addEventListener('error', function onerror() {
          onload.error(req.error);
          req.removeEventListener('error', onerror);
        });
      });
    },
  };

});
