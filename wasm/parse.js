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

  function nextInt(t) {
    if (Math.floor(t[t.i]) !== t[t.i]) return NaN;
    return t[t.i++];
  }
  
  function requireInt(t) {
    var v = nextInt(t);
    if (isNaN(v)) throw new Error('('+t.type+' ...): expecting int');
    return v;
  }

  function nextRef(t, set) {
    var ref;
    if (typeof t[t.i] === 'number' && t[t.i] === Math.floor(t[t.i])) ref = t[t.i++];
    else if (typeof t[t.i] === 'string' && t[t.i][0] === '$') ref = t[t.i++];
    else return null;
    if (!(ref in set)) {
      throw new Exception('(' + t.type + ' ...): undefined ' + set.element_kind + ' ref ' + ref);
    }
    return (typeof ref === 'string') return set[ref] : ref;
  }

  function requireRef(t, set) {
    var v = nextRef(t, set);
    if (v === null) throw new Error('('+t.type+' ...): expected '+set.element_kind+' ref, got ' + t[t.i]);
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
  
  function readOp(scope, output, code) {
    var op = requireWord(code);
    var type, cast, signed;
    var modifiers = op.match(/^([if](32|64)\.)(.*?)(8|16|32|\/[if](32|64))?(_[su])?$/);
    if (modifiers) {
      type = modifiers[1];
      op = modifiers[2];
      cast = modifiers[3];
      signed = modifiers[4] === '_s';
    }
    switch (op) {
      case 'if': case 'else': case 'end': case 'block': case 'loop':
        throw new Error('readOp() is the wrong place to handle "'+op+'"');
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
        output.push(op);
        return;
      case 'br': case 'br_if':
        var ref = requireRef(code);
        // TODO: verify correct block stack checking
        if (typeof ref === 'string') {
          ref = scope[ref];
          if (ref && ref.type === 'blocklevel') {
            ref = scope.blockLevels.length - ref.id;
          }
          else {
            throw new Error('invalid break label');
          }
        }
        else {
          if (ref > scope.blockLevels.length) {
            throw new Error('invalid break label');
          }
        }
        output.push(op, ref);
        return;
      case 'call':
      case 'call_indirect':
        var ref = requireRef(code);
        if (typeof ref === 'string') {
          ref = scope[ref];
          if (ref && ref.type === 'func') {
            ref = ref.id;
          }
          else {
            throw new Error('invalid func ref');
          }
        }
        else {
          // TODO: func number checking
        }
        output.push(op, ref);
        return;
      case 'get_local': case 'set_local': case 'tee_local':
        var ref = requireRef(code);
        if (typeof ref === 'string') {
          ref = scope[ref];
          if (ref && ref.type === 'local') {
            ref = ref.id;
          }
          else {
            throw new Error('invalid local ref');
          }
        }
        else {
          // TODO: local number checking
        }
        output.push(op, ref);
        return;
      case 'get_global': case 'set_global':
        var ref = requireRef(code);
        if (typeof ref === 'string') {
          ref = scope[ref];
          if (ref && ref.type === 'global') {
            ref = ref.id;
          }
          else {
            throw new Error('invalid global ref');
          }
        }
        else {
          // TODO: global number checking
        }
        output.push(op, ref);
        return;
      case 'br_table':
        output.push(op);
        var label;
        while (label = nextRef(code)) {
          if (typeof label === 'string') {
            label = scope[label];
            if (label && label.type === 'blocklevel') {
              // TODO: verify correct diff calculation
              label = scope.blockLevels.length - label.id;
            }
            else {
              throw new Error('invalid block ref');
            }
          }
          else {
            // TODO: label number checking
          }
          output.push(label);
        }
        return;
      case 'load': case 'store':
        output.push(op);
        output.push(nextWord(output, /^offset=\d+$/) || 'offset=0');
        output.push(nextWord(output, /^align=\d+$/) || ('align='+op.match(/\d+/)[0]/8));
        return;
      case 'const':
        var num = code[code.i++];
        if (isNaN(num)) throw new Error(op + ': numeric value required');
        output.push(op, num);
        return;
      default:
        throw new Error('unknown op: ' + op);
    }
  }
  
  function pushBlock(scope, name) {
    var def = {id:scope.blockLevels.length+1, name:name, type:'blocklevel'};
    scope.blockLevels.push(def);
    scope.push(def);
    if (name) {
      if (name in scope) def.hiding = true;
      scope[name] = def;
    }
  }
  
  function popBlock(scope) {
    var def = scope.blockLevels.pop();
    if (!def) throw new Error('mismatched block/end instructions');
    scope.splice(scope.lastIndexOf(def), 1);
    if (!def.name) return;
    delete scope[def.name];
    if (def.hiding) for (var i = 0; i < scope.length; i++) {
      scope[scope[i].name] = scope[i];
    }
  }
  
  function readExpression(scope, output, code) {
    var expr = requireSection(code);
    var dataType;
    switch (expr.type) {
      case 'block':
      case 'loop':
        output.push(nextWord(expr.type));
        pushBlock(scope, nextName(expr));
        while (dataType = nextWord(/^[if](32|64)$/)) {
          output.push(dataType);
        }
        readInstructions(scope, output, expr);
        output.push('end');
        popBlock(scope);
        break;
      case 'if':
        var blockName = nextName(expr);
        var blockTypes = [];
        while (dataType = nextWord(/^[if](32|64)$/)) {
          blockTypes.push(dataType);
        }
        var _then = nextSection(expr, 'then');
        if (!_then) {
          // condition must be specified first
          readExpression(scope, output, requireSection(expr));
          _then = nextSection(expr, 'then');
        }
        output.push('if');
        output.push.apply(output, blockTypes);
        pushBlock(scope, blockName);
        if (_then) {
          readInstructions(scope, output, _then);
          var _else = nextSection(expr, 'else');
          if (_else) {
            output.push('else');
            readInstructions(scope, output, _else);
          }
        }
        else {
          // clause(s) are <expr>s instead of (then ...) (else ...)
          // kinda like (select (<then_expr>) (<else_expr>) (<condition_expr>))
          readExpression(scope, output, requireSection(code));
          var i_else = output.length;
          if (readExpression(scope, output, expr)) {
            output.splice(i_else, 0, 'else');
          }
        }
        output.push('end');
        popBlock(scope);
        requireEnd(expr);
        return expr;
      default:
        expr.unshift(expr.name);
        var splicer = [output.length, 0];
        readOp(scope, output, expr);
        while (expr.i < expr.length) {
          readExpression(scope, splicer, expr);
        }
        output.splice.apply(output, splicer);
        return expr;
    }
  }
  
  function readInstructions(scope, output, code) {
    var blockName, dataType;
    var initialBlockLevel = scope.blockLevels.length;
    reading: for (;;) {
      switch (code[code.i]) {
        case 'block':
        case 'loop':
        case 'if':
          output.push(nextWord(code));
          pushBlock(scope, nextName(code));
          while (dataType = nextWord(/^[if](32|64)$/)) {
            output.push(dataType);
          }
          var depth = 0;
          var j = code.i;
          endFinding: while (j < code.length) switch (code[j++]) {
            case 'block': case 'loop': case 'if':
              depth++;
              continue endFinding;
            case 'end':
              if (--depth < 0) break endFinding;
              continue endFinding;
          }
          if (typeof code[j] === 'string' && code[j][0] === '$') {
            var block = scope.blockLevels[scope.blockLevels.length-1];
            if (code[j] in scope) {
              block.hiding = true;
            }
            scope[code[j]] = block;
          }
          continue reading;
        case 'else':
          var block = scope.blockLevels[scope.blockLevels.length-1];
          // TODO: check block type
          if (!block) throw new Error('else without matching if');
          output.push(nextWord(code));
          if (blockName = nextName(code)) {
            if (block.name) {
              delete scope[block.name];
            }
            if (blockName in scope) {
              block.hiding = true;
            }
            block.name = blockName;
            scope[blockName] = block;
          }
          continue reading;
        case 'end':
          output.push(nextWord(code));
          nextName(code); // ignore, handled earlier
          popBlock(scope);
          if (scope.blockLevels.length < initialBlockLevel) {
            throw new Error('end for unopened block');
          }
          continue reading;
        default:
          if (code.i === code.length) {
            if (scope.blockLevels.length !== initialBlockLevel) {
              throw new Error('unterminated block');
            }
            return output;
          }
          var instr;
          if (typeof code[code.i] === 'string') {
            readOp(scope, output, code);
          }
          else {
            readExpression(scope, output, requireSection(code));
          }
          continue reading;
      }
    }
  }
  
  function readFuncTypedef(output, section) {
    output.params = [];
    output.results = [];
    var subsection;
    while (subsection = nextSection(section, 'param')) {
      var name = nextName(subsection);
      if (name) {
        output.params[name] = output.params.length;
        output.params.push(requireWord(subsection, /^[if](32|64)$/));
        requireEnd(subsection);
      }
      else while (subsection.i < subsection.length) {
        output.params.push(requireWord(subsection, /^[if](32|64)$/));
      }
    }
    while (subsection = nextSection(section, 'result')) {
      output.results.push(requireWord(subsection, /^[if](32|64)$/));
    }
    if (output.results.length > 1) {
      throw new Error('more than 1 result is not currently supported');
    }
    output.signature = [
      output.params.join(',') || 'void',
      output.results.join(',') || 'void',
    ].join(' -> ');
    return output;
  }

  function wasm_parse(wat) {
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
      typedefs: Object.assign([], {element_kind:'type'}),
      exports: [],
      imports: [],
      funcs: Object.assign([], {element_kind:'func'}),
      tables: Object.assign([], {element_kind:'table'}),
      memorySections: Object.assign([], {element_kind:'memory'}),
      codeSections: [],
      globals: Object.assign([], {element_kind:'global'}),
      dataSections: [],
      elems: [],
    });
    
    var section, name, specifier, subsection, def;
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
      module.typedefs.push(def = {
        type: 'type',
        id: module.typedefs.length,
      });
      if (name = nextName(section)) {
        if (name in module.typedefs) {
          throw new Error('typedef name conflict: ' + name);
        }
        module.typedefs[name] = def.id;
      }
      // assume that (type (type ...)) is not valid, even though it currently
      // appears to be, according to the grammar
      readFuncTypedef(def, requireSection(section, 'func'));
      requireEnd(section);
      if (!(def.signature in module.typedefs)) {
        module.typedefs[def.signature] = def.id;
      }
    }
    while (section = nextSection(doc, 'import')) {
      module.imports.push(def = {type:'import'});
      def.moduleName = requireString(section);
      def.fieldName = requireString(section);
      subsection = requireSection(section, ['func','global','table','memory']);
      requireEnd(section);
      section = null;
      var imported;
      switch (def.import_type = subsection.type) {
        case 'func':
          if (module.funcs.length > 0 && !module.funcs[module.funcs.length-1].isImported) {
            throw new Error('imported functions must be declared before the first non-imported function');
          }
          module.funcs.push(imported = {type:'func', id:module.funcs.length, isImported:true});
          if (name = nextName(subsection)) {
            if (name in module.funcs) {
              throw new Error('duplicate func name: ' + name);
            }
            module.funcs[name] = imported.id;
          }
          if (section = nextSection(subsection, 'type')) {
            def.typedef_id = requireRef(section, module.typedefs);
            requireEnd(section);
            section = null;
          }
          else {
            var typedef = readFuncTypedef({}, subsection);
            if (typedef.signature in module.typedefs) {
              def.typedef_id = module.typedefs[typedef.signature];
            }
            else {
              module.typedefs[typedef.signature] = typedef.id = module.typedefs.length;
              module.typedefs.push(typedef);
            }
          }
          break;
        case 'global':
          if (module.globals.length > 0 && !module.globals[module.globals.length-1].isImported) {
            throw new Error('imported globals must be declared before the first non-imported global');
          }
          module.globals.push(imported = {type:'global', id:module.globals.length, isImported:true});
          if (name = nextName(subsection)) {
            if (name in module.globals) {
              throw new Error('duplicate global name: ' + name);
            }
            module.globals[name] = imported.id;
          }
          if (section = nextSection(subsection, 'mut')) {
            def.mutable = true;
            requireEnd(subsection);
            subsection = section;
          }
          else {
            def.mutable = false;
          }
          def.kind = requireWord(subsection, ['i32','i64','f32','f64']);
          break;
        case 'table':
          if (module.tables.length > 0 && !module.tables[module.tables.length-1].isImported) {
            throw new Error('imported tables must be declared before the first non-imported global');
          }
          module.tables.push(imported = {type:'table', id:module.tables.length, isImported:true});
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
      requireEnd(subsection);
      def.import_id = imported.id;
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
        var typedef = readFuncTypedef({}, section);
        var typedef_id;
        if (typedef.signature in module.typedefs) {
          typedef_id = module.typedefs[typedef.signature];
        }
        else {
          module.typedefs[typedef.signature] = typedef.id = module.typedefs.length;
          module.typedefs.push(typedef);
          typedef_id = typedef.id;
        }
        module.funcs.push({
          type: 'func',
          id: module.funcs.length,
          code_id: module.codeSections.length,
          typedef_id: typedef_id,
        });
        section.localNames = typedef.paramNames.slice();
        for (var i = 0; i < section.localNames.length; i++) {
          if (section.localNames[i]) {
            section.localNames[section.localNames[i]] = i;
          }
        }
        section.localTypes = typedef.paramTypes.slice();
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
      module.exports.push(def = {
        type: 'export',
        id: module.exports.length,
        export_symbol: requireString(section),
      });
      specifier = requireSection(section, ['func','global','table','memory']);
      def.export_type = specifier.type;
      def.export_id = requireRef(specifier, ({
        func: module.funcs,
        global: module.globals,
        table: module.tables,
        memory: module.memorySections,
      })[specifier.type]);
      requireEnd(specifier);
    }
    if (section = nextSection(doc, 'start')) {
      module.start = requireRef(section, module.funcs);
      requireEnd(section);
    }
    while (section = nextSection(doc, 'elem')) {
      module.elems.push(section);
    }
    while (section = nextSection(doc, 'data')) {
      module.dataSections.push(def = {
        type: 'data',
        id: module.dataSections.length,
        memory_id: nextRef(section, module.memorySections),
      });
      def.offset = requireSection(section);
      var start_i = section.i;
      while (section.i < section.length) requireString(section);
      var byteString = section.slice(start_i).join('');
      def.bytes = new Uint8Array(byteString.length);
      for (var i = 0; i < byteString.length; i++) {
        def.bytes[i] = byteString.charCodeAt(i);
      }
    }
    if (module.tables.length > 1) throw new Error('only 1 table section is allowed currently');
    if (module.memorySections.length > 1) throw new Error('only 1 memory section is allowed currently');
    for (var i = 0; i < module.codeSections.length; i++) {
      var code = module.codeSections[i];
      var scope = Object.assign([], module.named, {blockLevels:[], module:module});
      for (var k in module.named) {
        if (k[0] === '$') {
          scope.push({name:k, type:module.named[k].type, id:module.named[k].id});
        }
      }
      for (var j = 0; j < code.localNames.length; i++) {
        if (section.localNames[j]) {
          var local = {type:'local', id:j, name:section.localNames[j]};
          scope.push(scope[local.name] = local);
        }
      }
      module.codeSections[i] = readInstructions(scope, [], code);
      module.codeSections[i].localTypes = code.localTypes;
    }
    return module;
  }

  return wasm_parse;

});
