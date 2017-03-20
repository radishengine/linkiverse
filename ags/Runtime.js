define(['./GameView', './RoomView', './SpriteStore'], function(GameView, RoomView, SpriteStore) {

  'use strict';
  
  const updateEvent = new CustomEvent('update');
  
  function Runtime(fileSystem) {
    this.fileSystem = fileSystem;
    this.element = document.createElement('CANVAS');
    this.element.width = 320;
    this.element.height = 200;
    this.eventTarget = this.element;
    this.eventTarget.runtime = this;
    this.eventTarget.addEventListener('entering-room', this.onEnteringRoom.bind(this));
    this.update = this.update.bind(this);
    this.audioContext = new AudioContext();
  }
  Runtime.prototype = {
    tickMillisecs: 1000/40,
    get ticksPerSecond() {
      return Math.round(1000/this.tickMillisecs);
    },
    set ticksPerSecond(v) {
      this.tickMillisecs = 1000/v;
    },
    loadRoom: function(n) {
      var promise;
      if (n === 0 && this.fileSystem.getName('intro.crm')) {
        promise = this.fileSystem.loadAsArrayBuffer('intro.crm');
      }
      else {
        promise = this.fileSystem.loadAsArrayBuffer('room' + n + '.crm');
      }
      var game = this.game;
      return promise.then(function(buffer) {
        return new RoomView(game, buffer, 0, buffer.byteLength);
      });
    },
    init: function() {
      var self = this;
      return this._init = this._init ||
        Promise.all([
        
          this.fileSystem.loadAsArrayBuffer('ac2game.dta')
          .then(function(buffer) {
            self.game = new GameView(buffer, 0, buffer.byteLength);
            return self.loadRoom(self.game.playerCharacter.room)
          })
          .then(function(room) {
            self.room = room;
          }),
        
          this.fileSystem.loadAsBlob('acsprset.spr')
          .then(SpriteStore.get)
          .then(function(sprites) {
            self.sprites = sprites;
          }),
        
        ]);
    },
    playSound: function(n) {
      var audioContext = this.audioContext;
      this.fileSystem.loadAsArrayBuffer('sound' + n + '.wav')
      .then(audioContext.decodeAudioData.bind(audioContext))
      .then(function(buffer) {
        var source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start();
      });
    },
    graphicalTimerRemaining: 0,
    graphicalTimerUpdate: null,
    runGraphicalScript: function(n) {
      this.runGraphicalScriptBlock(this.room.main.graphicalScripts[n], 0);
    },
    goToRoom: function(n) {
      this.eventTarget.dispatchEvent(new CustomEvent('leaving-room'));
      var self = this;
      this.loadRoom(n)
      .then(function(room) {
        self.room = room;
        self.eventTarget.dispatchEvent(new CustomEvent('entering-room'));
      });
    },
    runDialog: function(n) {
      var dialog = this.game.dialogs[n];
      var messages = this.game.dialogs.messages;
      var code = dialog.script.compiled.subarray();
      code.pos = dialog.entryPoint;
      code.nextArg = function() {
        var pos = this.pos;
        this.pos = pos + 2;
        return this[pos] | (this[pos+1] << 8);
      };
      dialogLoop: while (code.pos < code.length) {
        switch (code[code.pos++]) {
          case 1:
            var speaker = code.nextArg();
            var text = code.nextArg();
            text = messages[text];
            console.log('say', speaker, text);
            continue dialogLoop;
          case 2:
            var option = code.nextArg();
            console.log('option off', option);
            break dialogLoop;
          case 3:
            var option = code.nextArg();
            console.log('option on', option);
            break dialogLoop;
          case 4:
            console.log('return');
            break dialogLoop;
          case 5:
            console.log('stop dialog');
            break dialogLoop;
          case 6:
            var option = code.nextArg();
            console.log('option off forever', option);
            continue dialogLoop;
          case 7:
            var arg = code.nextArg();
            console.log('run text script', arg);
            continue dialogLoop;
          case 8:
            var dialog = code.nextArg();
            console.log('go to dialog', dialog);
            break dialogLoop;
          case 9:
            var sound = code.nextArg();
            console.log('play sound', option);
            continue dialogLoop;
          case 10:
            var item = code.nextArg();
            console.log('add inventory', item);
            continue dialogLoop;
          case 11:
            var character = code.nextArg();
            var view = code.nextArg();
            console.log('set speech view', character, view);
            continue dialogLoop;
          case 12:
            var room = code.nextArg();
            console.log('go to room', room);
            continue dialogLoop;
          case 13:
            var id = code.nextArg();
            var value = code.nextArg();
            console.log('set global var', id, value);
            continue dialogLoop;
          case 14:
            var points = code.nextArg();
            console.log('add score', points);
            continue dialogLoop;
          case 15:
            console.log('go to previous');
            break dialogLoop;
          case 16:
            var item = code.nextArg();
            console.log('lose inventory', item);
            continue dialogLoop;
          case 0xff:
            console.log('end script');
            break dialogLoop;
          default: throw new Error('unknown dialog opcode: ' + code[code.pos - 1]);
        }
      }
    },
    runGraphicalScriptBlock: function(script, n) {
      var block = script.blocks[n];
      for (var i = 0; i < block.length; i++) {
        var step = block[i];
        switch (step.actionType) {
          case 'play_sound':
            this.playSound(step.data1);
            break;
          case 'set_timer':
            this.graphicalTimerRemaining = step.data1;
            if (!this.graphicalTimerUpdate) {
              var self = this;
              this.eventTarget.addEventListener('update', this.graphicalTimerUpdate = function timer_update() {
                if (--self.graphicalTimerRemaining <= 0) {
                  self.eventTarget.removeEventListener('update', timer_update);
                  self.graphicalTimerUpdate = null;
                }
              });
            }
            break;
          case 'if_timer_expired':
            if (this.graphicalTimerRemaining <= 0) {
              this.runGraphicalScriptBlock(script, step.thenGoToBlock);
            }
            break;
          case 'go_to_screen':
            this.goToRoom(step.data1);
            break;
          case 'run_dialog_topic':
            this.runDialog(step.data1);
            break;
        }
      }
    },
    performInteractionV2: function(interaction) {
      switch (interaction.response) {
        case 'run_graphical_script':
          this.runGraphicalScript(interaction.data1);
          break;
        case 'run_dialog_topic':
          this.runDialog(interaction.data1);
          break;
        case 'run_script':
          var script = this.room.scriptCompiled_v2;
          var exported = script.exports[interaction.funcName];
          var strings = script.strings;
          var pos = exported.entryPoint/4;
          var code = script.code;
          if (code[pos++] !== 0x3D3D3D3B) {
            console.log('unexpected prefix: ' + code[pos - 1].toString(16));
            break;
          }
          var stack = [];
          var op;
          var calling;
          codeLoop: while ((op = code[pos++]) !== 0x3D3D373C) {
            if ((op & 0xffff0000) === 0x00200000) {
              var count = (op & 0xffff) / 4;
              var args = stack.splice(-count);
              console.log(calling, args);
              continue;
            }
            switch (op) {
              case 0x00000001:
                stack.unshift(code[pos++]);
                break;
              case 0x0000000D:
                calling = script.imports[code[pos++]];
                break;
              case 0x00000502:
                var startPos = code[pos++];
                var endPos = startPos;
                while (strings[endPos] !== 0) endPos++;
                stack.unshift(String.fromCharCode.apply(null, strings.subarray(startPos, endPos)));
                break;
              case 0x0002018B:
                var imported = script.imports[code[pos++]];
                // TODO
                break;
              case 0x0003010B:
                var array_offset = code[pos++];
                // TODO
                break;
              case 0x0003010F:
                var field_offset = code[pos++];
                // TODO
                break;
              case 0x0203110F:
              case 0x0304118B:
                // TODO: work out what this does?
                break;
              case 0x0003014B:
                var store_value = code[pos++];
                // TODO
                break;
              case 0x0002418B:
              case 0x0003418B:
                var script_var_offset = code[pos++];
                // TODO
                break;
              case 0x0000044B:
                var script_var_offset = code[pos++];
                var store_value = code[pos++];
                break;
              case 0x00020113:
              case 0x00030113:
              case 0x00040113:
                var value = code[pos++];
                // TODO
                break;
              case 0x00020121:
              case 0x00040121:
              case 0x00000009:
                var jump = code[pos++];
                // TODO
                pos += jump / 4;
                break;
              default:
                console.log('unknown op: ' + op.toString(16));
                break codeLoop;
            }
          }
          break;
      }
    },
    onEnteringRoom: function() {
      var pic = this.room.main.backgroundBitmap;
      var ctx = this.element.getContext('2d');
      var imageData = ctx.createImageData(pic.width, pic.height);
      pic.setImageData(imageData);
      ctx.putImageData(imageData, 0, 0);
      
      var interactions = this.room.main.interactions_v2 && this.room.main.interactions_v2.forRoom;
      if (interactions) {
        for (var i = 0; i < interactions.length; i++) {
          switch (interactions[i].event) {
            case 'player_enters_screen':
              this.performInteractionV2(interactions[i]);
              break;
            case 'repeatedly_execute':
              var tick = this.performInteractionV2.bind(this, interactions[i]);
              this.eventTarget.addEventListener('update', tick);
              this.eventTarget.addEventListener('leaving-room', (function(tick) {
                return function onLeavingRoom() {
                  this.removeEventListener('update', tick);
                  this.removeEventListener('leaving-room', onLeavingRoom);
                };
              })(tick));
              break;
          }
        }
        for (var i = 0; i < interactions.length; i++) {
          if (interactions[i].event === 'first_time_enters_screen') {
            this.performInteractionV2(interactions[i]);
          }
        }
      }
    },
    begin: function() {
      //this.loadRoom(this.game.playerCharacter.room);
      var self = this;
      return this._begin = this._begin || this.init().then(function() {
        self.eventTarget.dispatchEvent(new CustomEvent('entering-room'));
        self.nextTick = performance.now();
        requestAnimationFrame(self.update);
      });
    },
    update: function(now) {
      requestAnimationFrame(this.update);
      if (now < this.nextTick) return;
      this.nextTick += this.tickMillisecs;
      if (this.nextTick < now) {
        this.nextTick = now + this.tickMillisecs;
      }
      this.eventTarget.dispatchEvent(updateEvent);
    },
  };
  
  return Runtime;

});
