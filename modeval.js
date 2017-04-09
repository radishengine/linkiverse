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
  
  function modeval_toJSON() {
    var values = [].slice.apply(this);
    values.unshift(this.op);
    return values;
  }

  function modeval(name, def) {
    var args = [];
    def = def.replace(/\$/g, function(arg) {
      arg += args.length;
      args.push(arg);
      return arg;
    });
    const argCount = args.length;
    if (USE_ARROW_FUNCS) {
      def = 'return (' + args.concat(['ctx']).join(',') + ') => ' + def + ';';
    }
    else {
      def = 'return function('+args.concat(['ctx']).join(',')+') ' +
             (/^\s*\{/.test(def) ? def : '{ return '+def+'; }');
    }
    const proto = new Function(def)();
    return function() {
      var props = {
        op: {value:name, enumerable:true},
        length: {value:argCount, enumerable:true},
        toJSON: {value:modeval_toJSON, enumerable:true},
      };
      for (var i = 0; i < argCount; i++) {
        props[i] = {value:arguments[i], enumerable:true};
      }
      var bindArgs = [].slice.apply(arguments);
      bindArgs.length = argCount;
      bindArgs.unshift(null);
      return Object.defineProperties(proto.bind.apply(proto, bindArgs), props);
    };
  }

  const const_factory = modeval('const', '$');
  const if_factory = modeval('if', '($(ctx) ? $(ctx) : $(ctx))');
  function CONST(v) {
    if (isNaN(v)) return const_factory(v);
    return Object.defineProperties(const_factory(v), {
      minValue: {value:v, enumerable:true},
      maxValue: {value:v, enumerable:true},
    });
  }
  const NO_OP = CONST(undefined);
  function IF(condition, thenValue, elseValue) {
    if (condition.op === 'const') {
      return condition() ? thenValue : elseValue;
    }
    return if_factory(condition, thenValue, elseValue);
  }
  
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
          if (i+1 !== steps.length && spliceArgs[spliceArgs.length-1].op === 'const') {
            spliceArgs.pop();
          }
          steps.splice.apply(steps, spliceArgs);
          break;
      }
    }
    if (steps.length === 0) return NO_OP;
    if (steps.length === 1) return steps[0];
    if (steps.length > COMMA_CACHE.length) {
      COMMA_CACHE.length = steps.length;
    }
    if (!COMMA_CACHE[steps.length]) {
      var def = '{ ' + new Array(steps.length).join('$(ctx); ') + 'return $(ctx); }';
      COMMA_CACHE[steps.length] = modeval(',', def);
    }
    return COMMA_CACHE[steps.length].apply(null, steps);
  }

  function unop(operator) {
    var factory = modeval(operator, '('+operator+' $(ctx))');
    return function(operand) {
      if (operand.op === 'const') {
        return CONST(factory(operand)());
      }
      return factory(operand);
    };
  }

  function binop(operator) {
    var factory = modeval(operator, '($(ctx) '+operator+' $(ctx))');
    return function(left, right) {
      if (left.op === 'const' && right.op === 'const') {
        return CONST(factory(left, right)());
      }
      return factory(left, right);
    };
  }
  
  var generic = {
    CONST: CONST,
    NO_OP: NO_OP,
    CTX: modeval('ctx', 'ctx'),
    COMMA: COMMA,
    IF: IF,
    WHILE: modeval('while', '{ while ($(ctx)) { $(ctx); } }'),
    GET: modeval('[]', '($(ctx)[$(ctx)])'),
    SET: modeval('[]', '($(ctx)[$(ctx)] = $(ctx))'),
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
    L_AND: modeval('&&', '{ var a=$(ctx), b=$(ctx); return a && b; }'),
    L_OR: modeval('||', '{ var a=$(ctx), b=$(ctx); return a && b; }'),
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
    IDIV32: modeval('(int)/', '(($(ctx) / $(ctx)) | 0)'), 
    IMUL32: modeval('(int)*', '(($(ctx) * $(ctx)) | 0)'), // TODO: imul32 overflow semantics
  };

  var dataViewAccess = {
    DV_GETI8: modeval('getInt8', '$(ctx).getInt8($(ctx))'),
    DV_GETU8: modeval('getUint8', '$(ctx).getUint8($(ctx))'),
    DV_SETI8: modeval('setInt8', '$(ctx).setUint8($(ctx), $(ctx))'),
    DV_SETU8: modeval('setUint8', '$(ctx).setUint8($(ctx), $(ctx))'),
  };
  
  [true, false].forEach(function(littleEndian) {
    var endianLabel = (littleEndian ? 'LE' : 'BE');
    [true, false].forEach(function(signed) {
      [32, 16].forEach(function(intSize) {
        var typeName = (signed ? 'Int' : 'Uint') + intSize;
        var typeLabel = (signed ? 'U' : 'I') + intSize + endianLabel;
        var getLabel = 'DV_GET' + typeLabel;
        var setLabel = 'DV_SET' + typeLabel;
        var getFuncName = 'get' + typeName;
        var setFuncName = 'set' + typeName;
        var getOpName = getFuncName + endianLabel;
        dataViewAccess[getLabel] = modeval(
          getFuncName + endianLabel,
          '$(ctx).' + getFuncName + '($(ctx), ' + littleEndian + ')');
        dataViewAccess[setLabel] = modeval(
          setFuncName + endianLabel,
          '$(ctx).' + setFuncName + '($(ctx), $(ctx), ' + littleEndian + ')');
      });
    });
    [32, 64].forEach(function(floatSize) {
      var typeName = 'Float' + floatSize;
      var typeLabel = 'F' + floatSize + endianLabel;
      var getLabel = 'DV_GET' + typeLabel;
      var setLabel = 'DV_SET' + typeLabel;
      var getFuncName = 'get' + typeName;
      var setFuncName = 'set' + typeName;
      var getOpName = getFuncName + endianLabel;
      dataViewAccess[getLabel] = modeval(
        getFuncName + endianLabel,
        '$(ctx).' + getFuncName + '($(ctx), ' + littleEndian + ')');
      dataViewAccess[setLabel] = modeval(
        setFuncName + endianLabel,
        '$(ctx).' + setFuncName + '($(ctx), $(ctx), ' + littleEndian + ')');
    });
  });

  return Object.assign(modeval, generic, constants, bit32, boologic, comparison, floatMath, intMath, dataViewAccess);
});
