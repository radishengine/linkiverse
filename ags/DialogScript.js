define(['./util'], function(util) {

  'use strict';
  
  function DialogScript(dialogs, codes, sources, messages) {
    this.dialogs = dialogs;
    this.codes = codes;
    Object.defineProperty(this, 'sources', {
      get: function() {
        const mask = 'Avis Durgan';
        sources = sources.map(function(masked) {
          var buf = new Uint8Array(masked.length);
          for (var i = 0; i < buf.length; i++) {
            buf[i] = 0xFF & (masked[i] - mask.charCodeAt(i % mask.length));
          }
          return util.byteString(buf);
        });
        Object.defineProperty(this, 'sources', {value:sources, enumerable:true});
        return sources;
      },
    });
    this.messages = messages;
  }
  DialogScript.prototype = {
    instantiate: function(runtime) {
      return new DialogScriptInstance(runtime, this);
    },
  };
  
  function DialogScriptInstance(runtime, def) {
    this.runtime = runtime;
    this.def = def;
    this.exports = {};
    for (var i = 0; i < def.codes.length; i++) {
      this.exports['$' + i] = this.run.bind(this, i);
    }
  }
  DialogScriptInstance.prototype = {
    runEntryPoint: function(i_dialog, resumePrevious) {
      return this.runFrom(i_dialog, this.dialogs[i_dialog].entryPoint);
    },
    runOption: function(i_dialog, i_option, resumePrevious) {
      return this.runFrom(i_dialog, this.dialogs[i_dialog].options[i_option].entryPoint);
    },
    runFrom: function(i_dialog, pos) {
      var code = this.def.codes[i_dialog];
      var messages = this.def.messages;
      var runtime = this.runtime;
      var self = this;
      function nextArg() {
        pos += 2;
        return code[pos - 2] | (code[pos - 1] << 8);
      }
      function nextStep() {
        codeLoop: for (;;) {
          if (pos >= code.length) return;
          var result;
          switch (code[pos++]) {
            case 0: // do nothing
              continue codeLoop;
            case 1:
              var speaker = nextArg();
              var text = nextArg();
              text = messages[text];
              result = runtime.characters[speaker].say(text);
              break;
            case 2:
              result = runtime.SetDialogOption(i_dialog, nextArg(), 0);
              break;
            case 3:
              result = runtime.SetDialogOption(i_dialog, nextArg(), 1);
              break;
            case 4:
              console.error('NYI: dialog return');
              return;
            case 5: // stop
              return;
            case 6:
              result = runtime.SetDialogOption(i_dialog, nextArg(), 2); // off forever
              break;
            case 7:
              var arg = nextArg();
              if (typeof runtime.dialog_request === 'function') {
                result = runtime.dialog_request(arg);
              }
              break;
            case 8:
              var dialog = nextArg();
              // use a promise just to avoid infinite loop lockup
              return new Promise(function(resolve) {
                // TODO: add to stack for go-to-previous?
                resolve(self.runEntryPoint(dialog));
              });
            case 9:
              result = runtime.PlaySound(nextArg());
              break;
            case 10:
              result = runtime.AddInventory(nextArg());
              break;
            case 11:
              var character = nextArg();
              var view = nextArg();
              console.warn('character speechView set from dialog');
              runtime.characters[character].speechView = view;
              continue;
            case 12:
              // new room: the conversation is immediately stopped too
              return runtime.NewRoom(nextArg());
            case 13:
              var id = nextArg();
              var value = nextArg();
              result = runtime.SetGlobalInt(id, value);
              break;
            case 14:
              result = runtime.GiveScore(nextArg());
              break;
            case 15:
              console.error('NYI: go to previous dialog');
              return;
            case 16:
              result = runtime.LoseInventory(nextArg());
              break;
            case 0xff:
              return;
            default:
              console.error('unknown dialog opcode: ' + code[pos - 1]);
              return;
          }
          if (result instanceof Promise) return result.then(nextStep);
        }
      }
      return nextStep();
    },
  };
  
  return DialogScript;

});
