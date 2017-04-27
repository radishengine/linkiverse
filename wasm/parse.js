define(function() {
  
  'use strict';
  
  function nextWord(t, checkWord) {
    if (typeof t[t.i] !== 'string') return null;
    if (typeof checkWord === 'string' && checkWord !== t[t.i]) return null;
    if (Array.isArray(checkWord) && checkWord.indexOf(t[t.i]) < 0) return null;
    if (checkWord instanceof RegExp) {
      var match = t[t.i].match(checkWord);
      if (match) {
        t[t.i++];
        if (match[0] === match.input) return match.input;
        return match;
      }
      return null;
    }
    return t[t.i++];
  }
  
  function requireWord(t, checkWord) {
    var v = nextWord(t, checkWord);
    if (!v) {
      var expecting = '<word>';
      if (typeof checkWord === 'string') expecting = checkWord;
      if (Array.isArray(checkWord)) expecting = checkWord.join('/');
      if (checkWord instanceof RegExp) expecting = checkWord.toString();
      throw new Error('('+t.type+' ...): expecting ' + expecting);
    }
    return v;
  }

  function nextName(t) {
    if (typeof t[t.i] === 'string' && t[t.i][0] === '$') return t[t.i++];
  }

  function nextRef(t) {
    if (typeof t[t.i] === 'number' && t[t.i] === Math.floor(t[t.i])) return t[t.i++];
    if (typeof t[t.i] === 'string' && t[t.i][0] === '$') return t[t.i++];
    return null;
  }
  
  function nextInt(t) {
    if (Math.floor(t[t.i]) !== t[t.i]) return NaN;
    return t[t.i++];
  }
  
  function requireInt(t) {
    var v = nextInt(t);
    if (isNaN(v)) throw new Error('('+t.type+' ...): expecting int');
    return v;
  }

  function requireRef(t) {
    var v = nextRef(t);
    if (v === null) throw new Error('('+t.type+' ...): expecting number or $name');
    return v;
  }

  function nextSection(t, typeCheck) {
    if (!Array.isArray(t[t.i])) return null;
    if (typeof typeCheck === 'string' && t[t.i].type !== typeCheck) return null;
    if (Array.isArray(typeCheck) && typeCheck.indexOf(t[t.i].type) === -1) return null;
    if (typeCheck instanceof RegExp && !typeCheck.test(t[t.i]).type) return null;
    return t[t.i++];
  }

  function requireSection(t, typeCheck) {
    var s = nextSection(t, typeCheck);
    if (!s) {
      var expecting = '';
      if (typeof typeCheck === 'string') expecting = typeCheck;
      if (Array.isArray(typeCheck)) expecting = typeCheck.join('/');
      if (typeCheck instanceof RegExp) expecting = typeCheck.toString();
      throw new Error('('+t.type+' ...): expecting ('+expecting+' ...)');
    }
    return s;
  }

  function isName(v) {
    return (typeof v === 'string' && v[0] === '$');
  }

  function nextString(t) {
    if (t[t.i] instanceof String) return t[t.i++].valueOf();
  }
  
  function requireString(t) {
    var s = nextString(t);
    if (!s) throw new Error('('+t.type+' ...): expecting string');
    return s;
  }
  
  function requireEnd(t) {
    if (t.i !== t.length) throw new Error('('+t.type+' ...): unexpected content');
  }
  
  function nextOp(t) {
    var op = t[t.i++];
    if (typeof op !== 'string') {
      --t.i; return;
    }
    var type, cast, signed;
    var modifiers = op.match(/^([if](32|64)\.)(.*?)(8|16|32|\/[if](32|64))?(_[su])?$/);
    if (modifiers) {
      type = modifiers[1];
      op = modifiers[2];
      cast = modifiers[3];
      signed = modifiers[4] === '_s';
    }
    switch (op) {
      case 'unreachable':
      case 'nop':
      case 'return':
      case 'drop':
      case 'select':
      case 'current_memory': case 'grow_memory':
      case 'eq': case 'ne': case 'eqz':
      case 'lt': case 'gt': case 'le': case 'ge':
      case 'clz':  case 'ctz': case 'popcnt':
      case 'add': case 'sub': case 'mul': case 'div': case 'rem':
      case 'and': case 'or': case 'xor':
      case 'shl': case 'shr':
      case 'rotl': case 'rotr':
      case 'abs':
      case 'neg':
      case 'ceil': case 'floor': case 'trunc': case 'nearest':
      case 'sqrt':
      case 'min': case 'max':
      case 'copysign':
      case 'wrap':
      case 'trunc':
      case 'extend':
      case 'convert':
      case 'demote':
      case 'promote':
      case 'reinterpret':
        return op;
      case 'br': case 'br_if':
      case 'call': case 'call_indirect':
      case 'get_local': case 'set_local': case 'tee_local':
      case 'get_global': case 'set_global':
        var ref = requireRef(t);
        return {op:op, ref:ref};
      case 'br_table':
        var labels = [];
        var label;
        while (label = nextRef(t)) labels.push(label);
        return {op:op, labels:labels};
      case 'load': case 'store':
        var offset = nextWord(t, /^offset=(\d+)$/);
        offset = offset ? +offset[1] : 0;
        var align = nextWord(t, /^align=(\d+)$/);
        align = align ? +align[1] : op.match(/\d+/)[0]/8;
        return {op:op, offset:offset, align:align};
      case 'const':
        var num = t[t.i++];
        if (isNaN(num)) throw new Error(op + ': numeric value required');
        return {op:op, value:num};
    }
    t.i--;
    return null;
  }
  
  function readExpression(blockStack, output, t) {
    var expr = nextSection(t);
    if (!expr) return null;
    switch (expr.type) {
      case 'block':
      case 'loop':
        var block = {type:expr.type, pos:blockStack.length};
        blockStack.push(block);
        if (block.name = nextName(expr)) blockStack[block.name] = block;
        block.types = [];
        var type;
        while (type = nextWord(/^[if](32|64)$/)) block.types.push(type);        
        output.push(block);
        readInstructions(blockStack, output, expr);
        if (blockStack.pop() !== block) {
          throw new Error('corrupt block stack');
        }
        if (block.name) delete blockStack[block.name];
        output.push('end');
        if (expr.i !== expr.length) {
          throw new Error('(if ...): unexpected content');
        }
        break;
      case 'if':
        var _if = {type:'if', pos:blockStack.length};
        _if.name = nextName(expr);
        _if.types = [];
        var type;
        while (type = nextWord(/^[if](32|64)$/)) _if.types.push(type);
        blockStack.push(_if);
        if (_if.name) blockStack[_if.name] = _if;
        var _then = nextSection(expr, 'then');
        if (!_then) {
          // condition must be specified first
          if (!readExpression(blockStack, output, expr)) {
            throw new Error('(if ...): expecting (then ...) or condition <expr>');
          }
          _then = nextSection(expr, 'then');
        }
        output.push(_if);
        if (_then) {
          readInstructions(blockStack, output, _then);
          var _else = nextSection(expr, 'else');
          if (_else) {
            output.push('else');
            readInstructions(blockStack, output, _else);
          }
        }
        else {
          // clause(s) are <expr>s instead of (then ...) (else ...)
          // kinda like (select (<then_expr>) (<else_expr>) (<condition_expr>))
          if (!readExpression(blockStack, output, t)) {
            throw new Error('(if ...): expecting <expr> for then-clause');
          }
          var i_else = output.length;
          if (readExpression(output, t)) {
            output.splice(i_else, 0, 'else');
          }
        }
        if (blockStack.pop() !== _if) {
          throw new Error('corrupt block stack');
        }
        if (_if.name) delete blockStack[_if.name];
        output.push('end');
        if (expr.i !== expr.length) {
          throw new Error('(if ...): unexpected content');
        }
        return expr;
      default:
        expr.unshift(expr.name);
        var op = nextOp(expr);
        if (!op) {
          throw new Error('expecting op, got: ' + expr.name);
        }
        while (expr.i < expr.length) {
          if (readExpression(output, expr) === null) {
            throw new Error('invalid operand for ' + expr.name);
          }
        }
        output.push(expr);
        return expr;
    }
  }
  
  function readInstructions(blockStack, output, t) {
    reading: for (;;) {
      switch (t[t.i]) {
        case 'block':
        case 'loop':
        case 'if':
          var block = {type:t[t.i++], pos:blockStack.length};
          block.name = nextName(t);
          block.types = [];
          var type;
          while (type = nextWord(/^[if](32|64)$/)) block.types.push(type);
          blockStack.push(block);
          if (block.name) {
            blockStack[block.name] = block;
          }
          output.push(block);
          continue reading;
        case 'else':
          var block = blockStack.pop();
          if (!block || !/^(else|if)$/.test(block.type)) throw new Error('mismatched else');
          block = {type:'else', types:block.types, pos:blockStack.length};
          block.name = nextName(t);
          if (block.name) {
            blockStack[block.name] = block;
          }
          output.push(block);
          t.i++;
          continue reading;
        case 'end':
          var block = blockStack.pop();
          if (!block) throw new Error('mismatched end');
          block.endName = nextName();
          if (block.name) delete blockStack[block.name];
          t.i++;
          output.push('end');
          continue reading;
        default:
          var instr;
          if (typeof t[t.i] === 'string') {
            instr = nextOp(t);
          }
          else {
            instr = readExpression(blockStack, output, t);
          }
          if (!instr) break reading;
          output.push(instr);
          continue reading;
      }
    }
  }

  function parse(wat) {
    var activeRx = /\S|$/g;
    var nestingCommentRx = /\(;|;\)/g;
    var tokenRx = /"(?:\\.|[^\\"]+)*"|(-?\s*(?:0x[a-f0-9]+|\d+(?:\.\d+)?))(?![a-z\._\$])|[a-z\$][^\s()";]*|[()]|$/gi;
    var match, nextAt = 0;
    function rewind() {
      nextAt = tokenRx.lastIndex = match.index;
    }
    function skipPrelude() {
      for (;;) {
        activeRx.lastIndex = nextAt;
        nextAt = activeRx.exec(wat).index; // activeRx can't fail
        var startComment = wat.slice(nextAt, nextAt+2);
        if (startComment === ';;') {
          nextAt = wat.indexOf('\n', nextAt+2);
          if (nextAt < 0) nextAt = wat.length;
          continue;
        }
        if (startComment !== '(;') break;
        var depth = 1;
        nestingCommentRx.lastIndex = nextAt+2;
        var bracket;
        while (bracket = nestingCommentRx.exec(wat)) {
          if (bracket[0] === ';)') {
            if (--depth < 1) break;
          }
          else depth++;
        }
        if (depth !== 0) throw new Error('unbalanced nesting comment');
        // if depth is zero, bracket must be a match object
        nextAt = bracket.index + 2;
      }
      tokenRx.lastIndex = nextAt;
    }
    function nextToken() {
      skipPrelude();
      match = tokenRx.exec(wat);
      if (match.index !== nextAt) {
        throw new Error('unrecognized content in s-expression');
      }
      nextAt = match.index + match[0].length;
      if (match[0].length === 0) return null;
      if (match[0][0] === '"') {
        return new String(match[0].slice(1, -1)
        .replace(/\\([0-9a-f]{2}|.)/gi,
          function(escape) {
            if (escape[1].length === 2) {
              return String.fromCharCode(parseInt(escape[1], 16));
            }
            if (escape[1] === 'n') return '\n';
            if (escape[1] === 't') return '\t';
            return escape[1];
          }));
      }
      if (match[1]) return +match[1];
      return match[0];
    }
    function nextExpression() {
      var token;
      switch (token = nextToken()) {
        case null: return null;
        case '(':
          var subexpr = [];
          subexpr.type = nextExpression();
          if (typeof subexpr.type !== 'string' || !/^[a-z]/.test(subexpr.type)) {
            throw new Error('invalid section');
          }
          subexpr.i = 0;
          for (;;) {
            token = nextToken();
            if (token === ')') break;
            if (token === null) {
              throw new Error('mismatched parentheses');
            }
            rewind();
            subexpr.push(nextExpression());
          }
          return subexpr;
        case ')': throw new Error('mismatched parentheses');
        default: return token;
      }
    }
    var doc = nextExpression();
    if (doc === null) throw new Error('empty document');
    if (nextToken() !== null) throw new Error('more than one top-level element');
    if (doc.type !== 'module') throw new Error('top-level element must be (module ...)');
    
    var module = {type:'module', name:nextName(doc), named:{}};
    if (module.name) module.named[module.name] = module;
    if (doc[doc.i] instanceof String) {
      var start_i = doc.i++;
      while (doc.i < doc.length) requireString(doc);
      var dataString = doc.slice(start_i).join('');
      module.bytes = new Uint8Array(dataString.length);
      for (var j = 0; j < dataString.length; j++) {
        module.bytes[j] = dataString.charCodeAt(j);
      }
      return module;
    }
    Object.assign(module, {
      typedefs: [],
      exports: [],
      imports: [],
      funcs: [],
      tables: [],
      memorySections: [],
      codeSections: [],
      globals: [],
      dataSections: [],
      elems: [],
    });
    var section, specifier;
    function getFuncSignature(section) {
      var specifier = nextSection(section, 'type');
      var id;
      if (specifier) {
        var ref = requireRef(specifier);
        if (typeof ref === 'string') {
          ref = module.named[ref];
          if (ref && ref.type === 'type') {
            id = ref.id;
          }
        }
        else {
          id = ref;
          if (id < 0 || id >= module.typedefs.length) {
            throw new Error('('+section.name+' ...): invalid typedef ref');
          }
        }
      }
      var paramTypes = [], paramNames = [], returnTypes = [];
      while (specifier = nextSection(section, 'param')) {
        var name = nextName(specifier);
        if (name) {
          paramNames[name] = paramTypes.length;
          paramNames.push(name);
          paramTypes.push(requireWord(specifier, /^[if](32|64)$/));
          requireEnd(specifier);
        }
        else while (specifier.i < specifier.length) {
          paramNames.push(undefined);
          paramTypes.push(requireWord(specifier, /^[if](32|64)$/));
        }
      }
      if (specifier = nextSection(section, 'result')) {
        returnTypes.push(requireWord(specifier, /^[if](32|64)$/));
      }
      var signatureString = [
        paramTypes.join(',') || 'void',
        returnTypes.join(',') || 'void',
      ].join(' -> ');
      if (isNaN(id)) {
        if (signatureString in module.typedefs) {
          id = module.typedefs[signatureString];
        }
        else {
          id = module.typedefs[signatureString] = module.typedefs.length;
          module.typedefs.push(signatureString);
        }
      }
      else {
        if (module.typedefs[id] !== signatureString) {
          throw new Error(
            'func signature mismatch: expected ['
            + module.typedefs[id] + '], got ['
            + signatureString + ']');
        }
      }
      return {
        typedef_id: id,
        paramNames: paramNames,
        paramTypes: paramTypes,
      };
    }
    function addName(type, list, specifier) {
      specifier = specifier || section;
      var name = nextName(specifier);
      if (!name) return;
      if (name in module.named) {
        throw new Error('name conflict: ' + name);
      }
      module.named[name] = {type:type, id:list.length};
    }
    function maybeInlineExport(type, id) {
      var specifier = nextSection(section, 'export');
      if (!specifier) return;
      var def = {
        type: 'export',
        export_type: specifier.type,
        export_symbol: requireString(def),
      };
      def[specifier.type + '_id'] = id;
      requireEnd(specifier);
      module.exports.push(def);
    }
    while (section = nextSection(doc, 'type')) {
      addName('type', module.typedefs);
      var func = requireSection(section, 'func');
      var next_id = module.typedefs.length;
      var id = getFuncSignature(func).typedef_id;
      requireEnd(func);
      if (id !== next_id) {
        // explicitly defined redundant copies of the same typedef
        module.typedefs.push(module.typedefs[id]);
      }
    }
    while (section = nextSection(doc, 'import')) {
      var def = {id:module.imports.length};
      def.moduleName = requireString(section);
      def.fieldName = requireString(section);
      var specifier = requireSection(section, ['func','global','table','memory']);
      requireEnd(section);
      def.type = specifier.type;
      switch (specifier.type) {
        case 'func':
          addName('func', module.funcs, specifier);
          module.funcs.push({type:'import', id:def.id});
          def.typedef_id = getFuncSignature(specifier).typedef_id;
          break;
        case 'global':
          addName('global', module.globals, specifier);
          module.globals.push({type:'import', id:def.id});
          if (section = nextSection(specifier, 'mut')) {
            def.mutable = true;
            requireEnd(specifier);
            specifier = section;
          }
          else {
            def.mutable = false;
          }
          def.kind = requireWord(specifier, ['i32','i64','f32','f64']);
          break;
        case 'table':
          addName('table', module.tables, specifier);
          module.tables.push({type:'import', id:def.id});
          def.initialSize = requireInt(specifier);
          def.maximumSize = nextInt(specifier);
          if (isNaN(def.maximumSize)) def.maximumSize = Infinity;
          def.elementType = requireWord(specifier, 'anyfunc');
          break;
        case 'memory':
          addName('memory', module.memorySections, specifier);
          module.memorySections.push({type:'import', id:def.id});
          def.initialSize = requireInt(specifier);
          def.maximumSize = nextInt(specifier);
          if (isNaN(def.maximumSize)) def.maximumSize = Infinity;
          break;
      }
      module.imports.push(def);
      requireEnd(specifier);
    }
    while (section = nextSection(doc, 'func')) {
      addName('func', module.funcs);
      if (specifier = nextSection(section, 'import')) {
        if (module.funcs.length > 0 && module.funcs[module.funcs.length-1].type !== 'import') {
          throw new Error('all imported funcs must be defined before any non-imported');
        }
        var def = {
          id: module.imports.length,
          type: 'func',
          typedef_id: getFuncSignature(section).typedef_id,
        };
        requireEnd(section);
        def.moduleName = requireString(specifier);
        def.fieldName = requireString(specifier);
        requireEnd(specifier);
        module.funcs.push({type:'import', id:def.id});
        module.imports.push(def);
      }
      else {
        maybeInlineExport('func', module.funcs.length);
        var signature = getFuncSignature(section);
        module.funcs.push({
          type: 'func',
          id: module.funcs.length,
          code_id: module.codeSections.length,
          typedef_id: signature.typedef_id,
        });
        section.localNames = signature.paramNames.slice();
        for (var i = 0; i < section.localNames.length; i++) {
          if (section.localNames[i]) {
            section.localNames[section.localNames[i]] = i;
          }
        }
        section.localTypes = signature.paramTypes.slice();
        while (specifier = nextSection(section, 'local')) {
          var name;
          if (name = nextName(specifier)) {
            section.localNames[name] = section.localNames.length;
            section.localNames.push(name);
            section.localTypes.push(requireWord(specifier, ['i32','i64','f32','f64']));
            requireEnd(specifier);
          }
          else while (specifier.i < specifier.length) {
            section.localNames.push(undefined);
            section.localTypes.push(requireWord(specifier, ['i32','i64','f32','f64']));
          }
        }
        module.codeSections.push(section);
      }
    }
    while (section = nextSection(doc, 'table')) {
      addName('table', module.tables);
      if (specifier = nextSection(section, 'import')) {
        if (module.tables.length > 0 && module.tables[module.tables.length-1].type !== 'import') {
          throw new Error('all imported tables must be defined before any non-imported');
        }
        var def = {id:module.imports.length, type:'table'};
        def.initialSize = requireInt(section);
        def.maximumSize = nextInt(section);
        if (isNaN(def.maximumSize)) def.maximumSize = Infinity;
        def.elementType = requireWord(section, 'anyfunc');
        requireEnd(section);
        def.moduleName = requireString(specifier);
        def.fieldName = requireString(specifier);
        requireEnd(specifier);
        module.tables.push({type:'import', id:def.id});
        module.imports.push(def);
      }
      else {
        maybeInlineExport('table', module.tables.length);
        module.tables.push(section);
      }
    }
    while (section = nextSection(doc, 'memory')) {
      addName('memory', module.memorySections);
      if (specifier = nextSection(section, 'import')) {
        if (module.memorySections.length > 0 && module.memorySections[module.memorySections.length-1].type !== 'import') {
          throw new Error('all imported memory sections must be defined before any non-imported');
        }
        var def = {id:module.imports.length, type:'memory'};
        def.initialSize = requireInt(section);
        def.maximumSize = nextInt(section);
        if (isNaN(def.maximumSize)) def.maximumSize = Infinity;
        requireEnd(section);
        def.moduleName = requireString(specifier);
        def.fieldName = requireString(specifier);
        requireEnd(specifier);
        module.memorySections.push({type:'import', id:def.id});
        module.imports.push(def);
      }
      else {
        maybeInlineExport('memory', module.memorySections.length);
        var memorySection = {type:'memory', id:module.memorySections.length};
        if (specifier = nextSection(section, 'data')) {
          while (specifier.i < specifier.length) requireString(specifier);
          var dataString = specifier.join('');
          var bytes = new Uint8Array(dataString.length);
          for (var i = 0; i < dataString.length; i++) {
            bytes[i] = dataString.charCodeAt(i);
          }
          memorySection.initialSize = memorySection.maximumSize = bytes.length;
          module.dataSections.push({
            memory_id: memorySection.id,
            bytes: bytes,
            offset: Object.assign([0], {type:'i32.const', i:0}),
          });
        }
        else {
          memorySection.initialSize = requireInt(section);
          memorySection.maximumSize = nextInt(section);
          if (isNaN(memorySection.maximumSize)) memorySection.maximumSize = Infinity;
        }
        module.memorySections.push(memorySection);
      }
    }
    while (section = nextSection(doc, 'global')) {
      addName('global', module.globals);
      if (specifier = nextSection(section, 'import')) {
        if (module.globals.length > 0 && module.globals[module.globals.length-1].type !== 'import') {
          throw new Error('all imported globals must be defined before any non-imported');
        }
        var def = {id:module.imports.length, type:'global'};
        def.moduleName = requireString(specifier);
        def.fieldName = requireString(specifier);
        requireEnd(specifier);
        if (specifier = nextSection(section, 'mut')) {
          def.mutable = true;
          requireEnd(section);
          section = specifier;
        }
        else {
          def.mutable = false;
        }
        def.dataType = requireWord(section, ['i32','i64','f32','f64']);
        requireEnd(section);
        module.globals.push({type:'import', id:def.id});
        module.imports.push(def);
      }
      else {
        maybeInlineExport('global', module.globals.length);
        var def = {id:module.globals.length, type:'global'};
        if (specifier = nextSection(section, 'mut')) {
          def.mutable = true;
          def.dataType = requireWord(specifier, ['i32','i64','f32','f64']);
          requireEnd(specifier);
        }
        else {
          def.mutable = false;
          def.dataType = requireWord(section, ['i32','i64','f32','f64']);
        }
        def.initialValue = section;
        module.globals.push(def);
      }
    }
    while (section = nextSection(doc, 'export')) {
      var def = {
        type: 'export',
        id: module.exports.length,
        export_symbol: requireString(section),
      };
      specifier = requireSection(section, ['func', 'global', 'table', 'memory']);
      def.export_type = specifier.type;
      var ref = requireRef(specifier);
      requireEnd(specifier);
      if (typeof ref === 'string') {
        ref = module.named[ref];
        if (ref && ref.type === def.export_type) {
          def[def.export_type+'_id'] = ref.id;
        }
        else {
          throw new Error('(export (' + def.export_type + '...)): invalid ref');
        }
      }
      else {
        var max;
        switch (def.export_type) {
          case 'func': max = module.funcs.length-1; break;
          case 'global': max = module.globals.length-1; break;
          case 'table': max = module.tableSections.length-1; break;
          case 'memory': max = module.memorySections.length-1; break;
        }
        if (ref < 0 || ref >= max) {
          throw new Error('(export (' + def.export_type + '...)): invalid ref');
        }
        def[def.export_type+'_id'] = ref;
      }
      module.exports.push(def);
    }
    if (section = nextSection(doc, 'start')) {
      var start = requireRef(section);
      requireEnd(section);
      if (typeof start === 'string') {
        if (module.named[start] && module.named[start].type === 'func') {
          start = module.named[start].id;
        }
        else {
          throw new Error('(start ...): invalid func name ' + start);
        }
      }
      if (start < 0 || start >= module.funcs.length) {
        throw new Error('(start ...): func number out of range');
      }
      module.start = start;
    }
    while (section = nextSection(doc, 'elem')) {
      module.elems.push(section);
    }
    while (section = nextSection(doc, 'data')) {
      var memoryRef = nextRef(section);
      if (memoryRef === null) memoryRef = 0;
      var def = {type:'data', id:module.dataSections.length};
      if (typeof memoryRef === 'string') {
        memoryRef = module.named[memoryRef];
        if (memoryRef && memoryRef.type === 'memory') {
          // TODO: check memory is not imported?
          def.memory_id = memoryRef.id;
        }
        else {
          throw new Error('(data ...): invalid memory ref ' + memoryRef);
        }
      }
      else {
        if (memoryRef < 0 || memoryRef >= module.memorySections.length) {
          throw new Error('(data ...): invalid memory ref ' + memoryRef);
        }
        def.memory_id = memoryRef;
      }
      def.offset = requireSection(section);
      var start_i = section.i;
      while (section.i < section.length) requireString(section);
      var byteString = section.slice(start_i).join('');
      def.bytes = new Uint8Array(byteString.length);
      for (var i = 0; i < byteString.length; i++) {
        def.bytes[i] = byteString.charCodeAt(i);
      }
      module.dataSections.push(def);
    }
    if (module.tables.length > 1) throw new Error('only 1 table section is allowed currently');
    if (module.memorySections.length > 1) throw new Error('only 1 memory section is allowed currently');
    return module;
  }

  return parse;

});
