define(function() {

  'use strict';
  
  const USE_ARROW_FUNCS = (function() {
    try {
      return eval('() => 1')() === 1;
    }
    catch (e) {
      return false;
    }
  })();

  function modeval(name, def) {
    var args = [];
    def = def.replace(/\$/g, function(arg) {
      arg += args.length;
      args.push(arg);
      return arg;
    });
    const argCount = args.length;
    if (!/^\s*\{/.test(def)) def = '{ return ' + def + '; }';
    args.push('return function() '+def+';');
    console.log(args);
    const proto = Function.apply(null, args);
    return function() {
      var props = {
        op: {value:name, enumerable:true},
        length: {value:argCount, enumerable:true},
      };
      for (var i = 0; i < argCount; i++) {
        props[i] = {value:arguments[i], enumerable:true};
      }
      var bindArgs = [].slice.apply(arguments);
      return Object.defineProperties(proto.apply(null, bindArgs), props);
    };
  }

  const NO_OP = modeval('no-op', '{ return; }');
  const CONST = modeval('const', '$');

  const COMMA_CACHE = [];
  function COMMA(/* ... */) {
    var steps = [].slice.apply(arguments);
    for (var i = steps.length-1; i >= 0; i--) {
      switch (steps[i].op) {
        case 'const':
        case 'no-op':
          if (i+1 !== steps.length) {
            steps.splice(i, 1);
          }
          break;
        case ',':
          var spliceArgs = [i, 1];
          spliceArgs.push.apply(spliceArgs, steps[i]);
          steps.s
          break;
      }
    }
    if (steps.length === 0) return NO_OP;
    if (steps.length === 1) return steps[0];
    if (steps.length >= COMMA_CACHE.length) {
      COMMA_CACHE.length = Math.max(COMMA_CACHE, steps.length);
    }
    if (!COMMA_CACHE[steps.length]) {
      var def = '{ ' + new Array(steps.length).join('$(); ') + 'return $(); }';
      COMMA_CACHE[steps.length] = modeval(',', def);
    }
    return COMMA_CACHE[steps.length].apply(null, steps);
  }

  function unop(operator) {
    return modeval(operator, '('+operator+' $())');
  }

  function binop(operator) {
    return modeval(operator, '($() '+operator+' $())')
  }

  var generic = {
    CONST: CONST,
    NO_OP: NO_OP,
    COMMA: COMMA,
    IF: modeval('if', '($() ? $() : $())'),
    WHILE: modeval('while', '{ while ($()) { $(); } }'),
    INDEX: modeval('[]', '($()[$()])'),
  };

  var constants = {
    TRUE: CONST(true),
    FALSE: CONST(false),
    ONE: CONST(1),
    ZERO: CONST(0),
  };

  var bit32 = {
    B_AND: binop('&'), B_OR: binop('|'), B_XOR: binop('^'), B_NOT: unop('~'),
    B_SHL: binop('<<'), B_ASHR: binop('>>'), B_LSHR: binop('>>>'),
  };

  var boologic = {
    L_AND: modeval('&&', '{ var a=$(), b=$(); return a && b; }'),
    L_OR: modeval('||', '{ var a=$(), b=$(); return a && b; }'),
    L_NOT: unop('!'),
  };

  var comparison = {
    EQ: binop('==='), NEQ: binop('!=='),
    GT: binop('>'), GTE: binop('>='), LT: binop('<'), LTE: binop('<='),
  };

  var floatMath = {
    ADD: binop('+'), SUB: binop('-'), UNM: unop('-'),
    DIV: binop('/'), MUL: binop('*'), MOD: binop('%'),
  };

  var intMath = {
    IDIV32: modeval('(int)/', '(($() / $()) | 0)'), 
    IMUL32: modeval('(int)*', '(($() * $()) | 0)'), // TODO: imul32 overflow semantics
  };

  var dataViewAccess = {
    GETI8: modeval('getInt8', '$().getInt8($())'),
    GETU8: modeval('getUint8', '$().getUint8($())'),
    SETI8: modeval('setInt8', '$().setUint8($(), $())'),
    SETU8: modeval('setUint8', '$().setUint8($(), $())'),
  };
  
  [true, false].forEach(function(littleEndian) {
    var endianLabel = (littleEndian ? 'LE' : 'BE');
    [true, false].forEach(function(signed) {
      [32, 16].forEach(function(intSize) {
        var typeName = (signed ? 'Int' : 'Uint') + intSize;
        var typeLabel = (signed ? 'U' : 'I') + intSize + endianLabel;
        var getLabel = 'GET' + typeLabel;
        var setLabel = 'SET' + typeLabel;
        var getFuncName = 'get' + typeName;
        var setFuncName = 'set' + typeName;
        var getOpName = getFuncName + endianLabel;
        dataViewAccess[getLabel] = modeval(
          getFuncName + endianLabel,
          '$().' + getFuncName + '($(), ' + littleEndian + ')');
        dataViewAccess[setLabel] = modeval(
          setFuncName + endianLabel,
          '$().' + setFuncName + '($(), $(), ' + littleEndian + ')');
      });
    });
    [32, 64].forEach(function(floatSize) {
      var typeName = 'Float' + floatSize;
      var typeLabel = 'F' + floatSize + endianLabel;
      var getLabel = 'GET' + typeLabel;
      var setLabel = 'SET' + typeLabel;
      var getFuncName = 'get' + typeName;
      var setFuncName = 'set' + typeName;
      var getOpName = getFuncName + endianLabel;
      dataViewAccess[getLabel] = modeval(
        getFuncName + endianLabel,
        '$().' + getFuncName + '($(), ' + littleEndian + ')');
      dataViewAccess[setLabel] = modeval(
        setFuncName + endianLabel,
        '$().' + setFuncName + '($(), $(), ' + littleEndian + ')');
    });
  });

  return Object.assign(modeval, generic, constants, bit32, boologic, comparison, floatMath, intMath, dataViewAccess);
});
