define(function() {

  'use strict';
  
  function wasm_encode(module) {
    // for compatibility with the binary-string form (module "...")
    // which wasm_parse() returns as {bytes:<Uint8Array>}
    if (module.bytes instanceof Uint8Array) return module.bytes;
    throw new Error('NYI');
  }
  
  return wasm_encode;

});
