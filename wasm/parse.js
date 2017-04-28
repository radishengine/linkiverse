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
  
  function nextNumber(t) {
    if (typeof t[t.i] === 'number') return t[t.i++];
    return NaN;
  }
  
  function requireNumber(t) {
    var v = nextNumber(v);
    if (isNaN(v)) throw new Error('('+t.type+' ...): expecting number');
    return v;
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
  
  function maybeDefineRef(t, set, id) {
    var name = nextName(t);
    if (!name) return;
    if (name in set) throw new Error('duplicate '+set.element_kind+' ref: ' + name);
    set[name] = id;
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
        throw new Error('readOp() is the wrong place to handle structural delimiters like "'+op+'"');
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
        output.push(op, scope.blockLevels.length - requireRef(code, scope.blockLevels));
        return;
      case 'call':
      case 'call_indirect':
        output.push(op, requireRef(code, scope.module.funcs));
        return;
      case 'get_local': case 'set_local': case 'tee_local':
        output.push(op, requireRef(code, scope.locals));
        return;
      case 'get_global': case 'set_global':
        output.push(op, requireRef(code, scope.module.globals));
        return;
      case 'br_table':
        output.push(op, requireRef(code, scope.blockLevels));
        var ref;
        while (ref = nextRef(code, scope.blockLevels)) {
          output.push(ref);
        }
        return;
      case 'load': case 'store':
        output.push(op);
        output.push(nextWord(code, /^offset=\d+$/) || 'offset=0');
        output.push(nextWord(code, /^align=\d+$/) || ('align='+op.match(/\d+/)[0]/8));
        return;
      case 'const':
        output.push(op, requireNumber(code));
        return;
      default:
        throw new Error('unknown op: ' + op);
    }
  }
  
  function pushBlock(scope, name) {
    var def = {id:scope.blockLevels.length+1, names:[], type:'blocklevel'};
    scope.blockLevels.push(def);
    scope.push(def);
    if (name) {
      if (name in scope) def.hiding = true;
      scope[name] = def;
      scope.names.push(name);
    }
  }
  
  function popBlock(scope) {
    var def = scope.blockLevels.pop();
    if (!def) throw new Error('mismatched block/end instructions');
    scope.splice(scope.lastIndexOf(def), 1);
    for (var i = 0; i < def.names.length; i++) {
      delete scope[def.names[i]];
    }
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
            block.names.push(code[j]);
            scope[code[j]] = block;
          }
          continue reading;
        case 'else':
          var block = scope.blockLevels[scope.blockLevels.length-1];
          // TODO: check block type?
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
    
    var module = {type:'module', name:nextName(doc)};
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
      functionBodies: [],
      globals: Object.assign([], {element_kind:'global'}),
      dataSections: [],
      tableElements: [],
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
      maybeDefineRef(section, module.typedefs, def.id);
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
      section = subsection;
      var imported;
      switch (def.import_type = section.type) {
        case 'func':
          if (module.funcs.length > 0 && !module.funcs[module.funcs.length-1].isImported) {
            throw new Error('imported functions must be declared before the first non-imported function');
          }
          module.funcs.push(imported = {type:'func', id:module.funcs.length, isImported:true});
          maybeDefineRef(section, module.funcs, imported.id);
          if (subsection = nextSection(section, 'type')) {
            def.typedef_id = requireRef(section, module.typedefs);
            requireEnd(subsection);
          }
          else {
            var typedef = readFuncTypedef({}, section);
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
          maybeDefineRef(section, module.globals, imported.id);
          if (subsection = nextSection(section, 'mut')) {
            imported.mutable = true;
            imported.dataType = requireWord(subsection, ['i32','i64','f32','f64']);
            requireEnd(subsection);
          }
          else {
            imported.mutable = false;
            imported.dataType = requireWord(section, ['i32','i64','f32','f64']);
          }
          break;
        case 'table':
          if (module.tables.length > 0 && !module.tables[module.tables.length-1].isImported) {
            throw new Error('imported tables must be declared before the first non-imported global');
          }
          module.tables.push(imported = {type:'table', id:module.tables.length, isImported:true});
          maybeDefineRef(section, module.tables, imported.id);
          imported.initialSize = requireInt(section);
          imported.maximumSize = nextInt(section);
          if (isNaN(imported.maximumSize)) imported.maximumSize = Infinity;
          imported.elementType = requireWord(specifier, 'anyfunc');
          break;
        case 'memory':
          if (module.memorySections.length > 0 && !module.memorySections[module.memorySections.length-1].isImported) {
            throw new Error('imported memory sections must be declared for the first non-imported section');
          }
          module.memorySections.push(imported = {type:'memory', id:module.memorySections.length, isImported:true});
          maybeDefineRef(section, module.memorySections, imported.id);
          imported.initialSize = requireInt(specifier);
          imported.maximumSize = nextInt(specifier);
          if (isNaN(imported.maximumSize)) imported.maximumSize = Infinity;
          break;
      }
      requireEnd(section);
      def.import_id = imported.id;
    }
    while (section = nextSection(doc, 'func')) {
      module.funcs.push(def = {type:'func', id:module.funcs.length});
      maybeDefineRef(section, module.funcs, def.id);
      if (subsection = nextSection(section, 'import')) {
        if (module.funcs.length > 0 && !module.funcs[module.funcs.length-1].isImported) {
          throw new Error('all imported funcs must be defined before any non-imported');
        }
        def.isImported = true;
        readFuncTypedef(def, section);
        requireEnd(section);
        if (def.signature in module.typedefs) {
          def.typedef_id = module.typedefs[def.signature];
        }
        else {
          def.typedef_id = module.typedefs.length;
          module.typedefs.push(module[def.signature] = def);
        }
        module.imports.push(def = {
          type: 'import',
          id: module.imports.length,
          import_type: 'func',
          import_id: def.id,
        });
        def.moduleName = requireString(subsection);
        def.fieldName = requireString(subsection);
        requireEnd(subsection);
        continue;
      }
      else {
        maybeInlineExport('func', def.id);
        readFuncTypedef(def, section);
        if (def.signature in module.typedefs) {
          def.typedef_id = module.typedefs[def.signature];
        }
        else {
          def.typedef_id = module.typedefs.length;
          module.typedefs.push(module[def.signature] = def);
        }
        var code = {id:module.functionBodies.length, type:'code'};
        def.code_id = code.id;
        code.locals = typedef.params.slice();
        for (var k in typedef.params) {
          if (k[1] === '$') code.locals[k] = typedef.params[k];
        }
        while (subsection = nextSection(section, 'local')) {
          if (name = nextName(subsection)) {
            code.locals[name] = code.locals.length;
            code.locals.push(requireWord(subsection, ['i32','i64','f32','f64']));
            requireEnd(subsection);
          }
          else while (subsection.i < subsection.length) {
            code.locals.push(requireWord(specifier, ['i32','i64','f32','f64']));
          }
        }
        module.functionBodies.push(section);
      }
    }
    while (section = nextSection(doc, 'table')) {
      module.tables.push(def = {type:'table', id:module.tables.length});
      maybeDefineRef(section, module.tables, def.id);
      if (subsection = nextSection(section, 'import')) {
        if (module.tables.length > 0 && !module.tables[module.tables.length-1].isImported) {
          throw new Error('all imported tables must be defined before any non-imported');
        }
        def.isImported = true;
        def.initialSize = requireInt(section);
        def.maximumSize = nextInt(section);
        if (isNaN(def.maximumSize)) def.maximumSize = Infinity;
        def.elementType = requireWord(section, 'anyfunc');
        requireEnd(section);
        
        module.imports.push(def = {
          id: module.imports.length,
          type: 'import',
          import_id: def.id,
          import_type: 'table',
        });
        def.moduleName = requireString(subsection);
        def.fieldName = requireString(subsection);
        requireEnd(subsection);
      }
      else {
        maybeInlineExport('table', def.id);
        def.initialSize = requireInt(section);
        def.maximumSize = nextInt(section);
        if (isNaN(def.maximumSize)) def.maximumSize = Infinity;
        def.elementType = requireWord(section, 'anyfunc');
        requireEnd(section);
      }
    }
    while (section = nextSection(doc, 'memory')) {
      module.memorySections.push(def = {type:'memory', id:module.memorySections.length});
      maybeDefineRef(section, module.memorySections, def.id);
      if (subsection = nextSection(section, 'import')) {
        if (module.memorySections.length > 0 && !module.memorySections[module.memorySections.length-1].isImported) {
          throw new Error('all imported memory sections must be defined before any non-imported');
        }
        def.isImported = true;
        def.initialSize = requireInt(section);
        def.maximumSize = nextInt(section);
        if (isNaN(def.maximumSize)) def.maximumSize = Infinity;
        requireEnd(section);
        
        module.imports.push(def = {
          id: module.imports.length,
          type: 'import',
          import_id: def.id,
          import_type: 'memory',
        });
        def.moduleName = requireString(specifier);
        def.fieldName = requireString(specifier);
        requireEnd(specifier);
        module.memorySections.push({type:'import', id:def.id});
        module.imports.push(def);
      }
      else {
        maybeInlineExport('memory', def.id);
        if (subsection = nextSection(section, 'data')) {
          while (subsection.i < subsection.length) requireString(subsection);
          var dataString = subsection.join('');
          var bytes = new Uint8Array(dataString.length);
          for (var i = 0; i < dataString.length; i++) {
            bytes[i] = dataString.charCodeAt(i);
          }
          def.initialSize = def.maximumSize = bytes.length;
          module.dataSections.push({
            memory_id: def.id,
            bytes: bytes,
            offset: Object.assign([0], {type:'i32.const', i:0}),
          });
        }
        else {
          def.initialSize = requireInt(section);
          def.maximumSize = nextInt(section);
          if (isNaN(def.maximumSize)) def.maximumSize = Infinity;
        }
      }
    }
    while (section = nextSection(doc, 'global')) {
      module.globals.push(def = {type:'global', id:module.globals.length});
      maybeDefineRef(section, module.globals, def.id);
      if (subsection = nextSection(section, 'import')) {
        if (module.globals.length > 0 && !module.globals[module.globals.length-1].isImporte) {
          throw new Error('all imported globals must be defined before any non-imported');
        }
        def.isImported = true;
        if (specifier = nextSection(section, 'mut')) {
          def.mutable = true;
          def.dataType = requireWord(specifier, ['i32','i64','f32','f64']);
          requireEnd(specifier);
        }
        else {
          def.mutable = false;
          def.dataType = requireWord(section, ['i32','i64','f32','f64']);
        }
        requireEnd(section);
        
        module.imports.push(def = {
          type: 'import',
          id: module.imports.length,
          import_type: 'global',
          import_id: def.id,
        });
        def.moduleName = requireString(subsection);
        def.fieldName = requireString(subsection);
        requireEnd(subsection);
      }
      else {
        maybeInlineExport('global', def.id);
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
      }
    }
    while (section = nextSection(doc, 'export')) {
      module.exports.push(def = {
        type: 'export',
        id: module.exports.length,
        export_symbol: requireString(section),
      });
      subsection = requireSection(section, ['func','global','table','memory']);
      requireEnd(section);
      def.export_type = subsection.type;
      def.export_id = requireRef(subsection, ({
        func: module.funcs,
        global: module.globals,
        table: module.tables,
        memory: module.memorySections,
      })[subsection.type]);
      requireEnd(subsection);
    }
    if (section = nextSection(doc, 'start')) {
      module.start = requireRef(section, module.funcs);
      requireEnd(section);
    }
    while (section = nextSection(doc, 'elem')) {
      module.tableElements.push(def = {
        table_id: nextRef(section, module.tables) || 0,
      });
      def.offset = requireSection(section);
      def.func_ids = [];
      while (section.i < section.length) {
        def.funcs.push(requireRef(section, module.funcs));
      }
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
    for (var i = 0; i < module.functionBodies.length; i++) {
      var code = module.functionBodies[i];
      var scope = {blockLevels:[], module:module, locals:code.locals};
      for (var j = 0; j < code.localNames.length; i++) {
        if (section.localNames[j]) {
          var local = {type:'local', id:j, name:section.localNames[j]};
          scope.push(scope[local.name] = local);
        }
      }
      module.functionBodies[i] = readInstructions(scope, [], code);
      module.functionBodies[i].localTypes = code.locals;
    }
    return module;
  }

  return wasm_parse;

});
