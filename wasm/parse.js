define(function() {
  
  'use strict';
  
  function nextWord(t, checkWord) {
    if (typeof t[t.i] === 'string') return null;
    if (typeof checkWord === 'string' && checkWord !== t[t.i]) return null;
    if (Array.isArray(checkWord) && !checkWord.indexOf(t[t.i])) return null;
    if (checkWord instanceof RegExp) {
      var match = t[t.i].match(checkWord);
      if (match) {
        t[t.i++];
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

  function nextVar(t) {
    if (typeof t[t.i] === 'number' && t[t.i] === Math.floor(t[t.i])) return t[t.i++];
    if (typeof t[t.i] === 'string' && t[t.i][0] === '$') return t[t.i++];
    return null;
  }
  
  function nextInt(t) {
    if (Math.floor(this[t.i]) !== this[t.i]) return NaN;
    return this[t.i++];
  }
  
  function requireInt(t) {
    var v = nextInt(t);
    if (isNaN(v)) throw new Exception('('+t.type+' ...): expecting int');
  }

  function requireVar(t) {
    var v = nextVar(t);
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

  function requireEnum(t, values) {
    if (values.indexOf(t[t.i] === -1)) {
      throw new Error('('+t.kind+'...): expecting ' + values.join('/'));
    }
    return t[t.i++];
  }

  function requireSection(t, typeCheck) {
    var s = nextSection(t, typeCheck);
    if (!s) {
      var expecting = '';
      if (typeof typeCheck === 'string') expecting = typeCheck;
      if (Array.isArray(typeCheck)) expecting = typeCheck.join('/');
      if (typeCheck instanceof RegExp) expecting = typeCheck.toString();
      throw new Error('('+t.kind+' ...): expecting ('+expecting+' ...)');
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
        var ref = requireVar(t);
        return {op:op, ref:ref};
      case 'br_table':
        var labels = [];
        var label;
        while (label = nextVar(t)) labels.push(label);
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

  var readers = {
    module: function() {
      var module = {name: nextName(this)};
      if (nextString(this)) {
        var start_i = this.i-1;
        do { } while (nextString(this));
        if (this.i !== this.length) {
          throw new Error('binary mode (module...) must only contain string values');
        }
        var dataString = this.slice(start_i).join('');
        module.bytes = new Uint8Array(dataString.length);
        for (var j = 0; j < dataString.length; j++) module.bytes[j] = dataString.charCodeAt(j);
        return module;
      }
      var section;
      var globalNames = module.globalNames = {};
      module.exports = [];
      function addName(type, list) {
        var name = nextName(section);
        if (!name) return;
        if (name in globalNames) {
          throw new Error('name conflict: ' + name);
        }
        globalNames[name] = {type:type, id:list.length};
      }
      function addExport(type, list) {
        var def = nextSection(section, 'export');
        if (!def) return;
        module.exports.push({
          type: type,
          id: list.length,
          symbol: requireString(def),
        });
        requireEnd(def);
      }
      module.typedefs = [];
      while (section = nextSection(this, 'type')) {
        addName('type', module.typedefs);
        module.typedefs.push(section);
      }
      module.funcs = [];
      while (section = nextSection(this, 'func')) {
        addName('func', module.funcs);
        addExport('func', module.funcs);
        module.funcs.push(section);
      }
      module.imports = [];
      while (section = nextSection(this, 'import')) {
        module.imports.push(section);
      }
      while (section = nextSection(this, 'export')) {
        module.exports.push(section);
      }
      module.tables = [];
      if (section = nextSection(this, 'table')) {
        addName('table', []);
        addExport('table', []);
        module.tables.push(section);
      }
      module.memorySections = [];
      if (section = nextSection(this, 'memory')) {
        addName('memory', []);
        addExport('memory', []);
        module.memorySections.push(section);
      }
      module.globals = [];
      while (section = nextSection(this, 'global')) {
        addName('global', module.globals);
        addExport('global', module.globals);
        module.globals.push(section);
      }
      module.elems = [];
      while (section = nextSection(this, 'elem')) {
        module.elems.push(section);
      }
      module.dataSections = [];
      while (section = nextSection(this, 'data')) {
        module.dataSections.push(section, true);
      }
      if (section = nextSection(this, 'start')) {
        var start = readSection(section, true);
        if (typeof start === 'string') {
          if (globalNames[start] && globalNames[start].type === 'func') {
            start = globalNames[start].id;
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
      for (var i = 0; i < module.exports.length; i++) {
        section = module.exports[i];
        if ('id' in section) continue;
        var def = module.exports[i] = {symbol: requireString(section)};
        var kind = requireSection(section, ['func','global','table','memory']);
        def.type = kind.type;
        var ref = requireVar(kind);
        requireEnd(kind);
        requireEnd(section);
        if (typeof ref === 'string') {
          ref = globalNames[ref];
          if (ref && ref.type === def.type) {
            def.id = ref.id;
          }
          else {
            throw new Error('(export (' + kind.type + ' ...)): invalid ' + kind.type + ' reference');
          }
        }
        else {
          var max;
          switch (kind.type) {
            case 'func': max = module.funcs.length-1; break;
            case 'global': max = module.globals.length-1; break;
            case 'table': max = module.tables.length-1; break;
            case 'memory': max = module.memory.length-1; break;
          }
          if (ref < 0 || ref > max) {
            throw new Error('(export (' + kind.type + ' ...)): invalid ' + kind.type + ' reference');
          }
          def.id = ref;
        }
      }
      if (module.tables.length > 1) throw new Error('only 1 table section is allowed currently');
      if (module.memorySections.length > 1) throw new Error('only 1 memory section is allowed currently');
      return module;
    },
    type: function(isTopLevel) {
      if (!isTopLevel) {
        this.ref = requireVar(this);
        return;
      }
      this.name = nextName(this);
      this.signature = readSection(requireSection(this, 'func'));
    },
    func: function() {
      this.name = nextName(this);
      var section;
      if (section = nextString(this, 'export')) {
        this.export = readSection(section);
      }
      else if (section = nextString(this, 'import')) {
        this.import = readSection(section);
      }
      if (section = nextSection(this, 'type')) {
        this.typeRef = readSection(section).ref;
      }
      this.params = [];
      while (section = nextSection(this, 'param')) {
        this.params.push(readSection(section));
      }
      this.results = [];
      while (section = nextSection('result')) {
        this.results.push(readSection(section));
      }
      if (this.import) return;
      this.locals = [];
      while (section = nextSection('local')) {
        this.locals.push(readSection(section));
      }
      this.instructions = [];
      readInstructions([], this.instructions, this);
    },
    import: function(isTopLevel) {
      this.module = nextString(this);
      this.field = nextString(this);
      if (isTopLevel) {
        this.import = readSection(requireSection(this, ['func', 'global', 'table', 'memory']));
      }
    },
    table: function() {
      this.name = nextName(this);
      var section;
      if (section = nextSection(this, 'export')) {
        this.export = readSection(section);
      }
      else if (section = nextSection(this, 'import')) {
        this.import = readSection(section);
      }
      if (this[this.i] === 'anyfunc') {
        if (this.import) throw new Error('(table (import ...) ...): not expecting <elem_type>');
        this.i++;
        this.elems = [];
        section = requireSection(this, 'elem');
        while (section.i < section.length) {
          this.elems.push({
            type: 'anyfunc',
            elem: requireVar(section),
          });
        }
      }
    },
    elem: function() {
      this.ref = nextVar(this);
      this.instructions = [];
      var section, instruction;
      this.offset = [];
      if (section = nextSection(this, 'offset')) {
        readInstructions([], this.offset, section);
      }
      else {
        if (!readExpression([], this.offset, this)) {
          throw new Error('(elem ...): expecting offset expression');
        }
      }
      var instructionSection = nextSection(this, 'offset') || this;
      this.funcs = [];
      while (this.i < this.length) {
        this.funcs.push(requireVar(this));
      }
    },
    memory: function() {
      this.name = nextName(this);
      var section;
      if (section = nextSection(this, 'export')) {
        this.export = readSection(section);
      }
      else if (section = nextSection(this, 'import')) {
        this.import = readSection(section);
      }
      if (section = nextSection(this, 'data')) {
        if (this.import) throw new Error('(memory (import ...) ...): not expecting (data ...)');
        this.data = readSection(section).data;
      }
      else {
        this.initialSize = requireInt(this);
        this.maximumSize = nextInt(this);
      }
    },
    global: function() {
      this.name = nextName(this);
      var section;
      if (section = nextSection(this, 'export')) {
        this.export = readSection(section);
      }
      else if (section = nextSection(this, 'import')) {
        this.import = readSection(section);
      }
      var typeSection;
      if (section = nextSection(this, 'mut')) {
        this.mut = true;
        typeSection = section;
      }
      else {
        this.mut = false;
        typeSection = this;
      }
      this.type = requireWord(typeSection, ['i32','i64','f32','f64']);
      if (this.import) return;
      this.initValue = [];
      readInstructions([], this.initValue, this);
    },
    data: function() {
      this.memoryRef = nextInt(this) || 0;
      this.offset = [];
      var section;
      if (section = nextSection(this, 'offset')) {
        readInstructions([], this.offset, section);
      }
      else {
        if (!readExpression([], this.offset, this)) {
          throw new Error('(data ...): expecting offset expression');
        }
      }
      var start_i = this.i;
      while (this[this.i] instanceof String) ++this.i;
      var dataString = this.slice(start_i, this.i).join('');
      this.data = new Uint8Array(dataString.length);
      for (var i = 0; i < dataString.length; i++) {
        this.data[i] = dataString.charCodeAt(i);
      }
    },
    start: function() {
      return requireVar(this);
    },
  };
  
  function readSection(section, isTopLevel) {
    if (!readers.hasOwnProperty(section.type)) {
      throw new Error('unknown section: ' + section.type);
    }
    var result = readers[section.type].call(section, isTopLevel) || section;
    if (section.i !== section.length) {
      throw new Error('unexpected content in ' + section.type + ' section')
    }
    return result;
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
    return readSection(doc);
  }

  return parse;

});
