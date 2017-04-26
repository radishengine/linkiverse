define(function() {
  
  'use strict';

  function next(t) {
    return t[t.i++];
  }

  function nextName(t) {
    if (typeof t[t.i] === 'string' && t[t.i][0] === '$') return t[t.i++];
  }

  function nextVar(t) {
    if (typeof t[t.i] === 'number' && t[t.i] === Math.floor(t[t.i])) return t[t.i++];
    if (typeof t[t.i] === 'string' && t[t.i][0] === '$') return t[t.i++];
    return null;
  }

  function requireVar(t) {
    var v = nextVar(t);
    if (v === null) throw new Error('('+t.name+' ...): expecting number or $name');
    return v;
  }

  function nextSection(t, typeCheck) {
    if (!Array.isArray(t[t.i])) return null;
    if (typeof typeCheck === 'string' && t[t.i].type === typeCheck) return null;
    if (Array.isArray(typeCheck) && typeCheck.indexOf(t[t.i].type) === -1) return null;
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
      throw new Error('('+t.kind+' ...): expecting ('+expecting+' ...)');
    }
    return s;
  }

  function isName(v) {
    return (typeof v === 'string' && v[0] === '$');
  }

  function nextString(t) {
    if (t[t.i] instanceof String) return t[t.i++];
  }

  var readers = {
    module: function() {
      this.name = nextName(this);
      if (nextString(this)) {
        var start_i = this.i-1;
        do { } while (nextString(this));
        if (this.i !== this.length) {
          throw new Error('binary mode (module...) must only contain string values');
        }
        var dataString = this.slice(start_i).join('');
        this.data = new Uint8Array(dataString.length);
        for (var j = 0; j < data.length; j++) data[j] = dataString.charCodeAt(j);
        return this;
      }
      var section;
      this.typedefs = [];
      while (section = nextSection(this, 'type')) {
        this.typedefs.push(readSection(section, true));
      }
      this.funcs = [];
      while (section = nextSection(module, 'func')) {
        this.funcs.push(readSection(section, true));
      }
      this.imports = [];
      while (section = nextSection(module, 'import')) {
        this.imports.push(readSection(section, true));
      }
      this.exports = [];
      while (section = nextSection(module, 'export')) {
        this.exports.push(readSection(section, true));
      }
      if (section = nextSection(module, 'table')) {
        this.table = readSection(section, true);
      }
      if (section = nextSection(module, 'memory')) {
        this.memory = readSection(section, true);
      }
      this.globals = [];
      while (section = nextSection(module, 'global')) {
        this.globals.push(readSection(section, true));
      }
      this.elems = [];
      while (section = nextSection(module, 'elem')) {
        this.elems.push(readSection(section, true));
      }
      this.datas = [];
      while (section = nextSection(module, 'data')) {
        this.datas.push(readSection(section, true));
      }
      if (section = nextSection(module, 'start')) {
        this.start = readSection(section, true);
      }
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
      while (section = nextInstruction()) {
        this.instructions.push(section);
      }
    },
    export: function(isTopLevel) {
      this.name = nextString(this);
      if (isTopLevel) {
        var kind = requireSection(this, ['func', 'global', 'table', 'memory']);
        this.kind = kind.type;
        this.ref = requireVar(kind);
        if (kind.i !== kind.length) {
          throw new Error('(export (' + kind.type + ' ...)): unexpected content');
        }
      }
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

      }
      else if (section = nextSection(this, 'import')) {

      }
    },
  };

  function readSection(section, isTopLevel) {
    if (!readers.hasOwnProperty(section.type)) {
      throw new Error('unknown section: ' + section.type);
    }
    readers[section.type].call(section, isTopLevel);
    if (section.i !== section.length) {
      throw new Error('unexpected content in ' + section.type + ' section')
    }
    return section;
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

  return {
    parse: parse,
  };

});
