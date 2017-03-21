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
    this.mainExec = new ExecutionChannel(this);
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
    textSpeed: 15,
    getTextDisplayTicks: function(str) {
      return (1 + Math.floor(str.length / this.textSpeed)) * this.ticksPerSecond;
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
    wait: function(ticks) {
      var eventTarget = this.eventTarget;
      return new Promise(function(resolve, reject) {
        eventTarget.addEventListener('update', function on_tick() {
          if (--ticks < 1) {
            this.removeEventListener('update', on_tick);
            resolve();
          }
        });
      });
    },
    graphicalTimerRemaining: 0,
    graphicalTimerUpdate: null,
    runGraphicalScript: function(n) {
      return this.runGraphicalScriptBlock(this.room.main.graphicalScripts[n], 0);
    },
    goToRoom: function(n) {
      this.eventTarget.dispatchEvent(new CustomEvent('leaving-room'));
      var self = this;
      return this.loadRoom(n).then(function(room) {
        self.room = room;
        self.eventTarget.dispatchEvent(new CustomEvent('entering-room'));
      });
    },
    display: function(text) {
      console.log(text);
      return this.wait(this.getTextDisplayTicks(text));
    },
    runDialog: function(n) {
      var dialog = this.game.dialogs[n];
      var messages = this.game.dialogs.messages;
      var code = dialog.script.compiled;
      var pos = dialog.entryPoint;
      function nextArg() {
        pos += 2;
        return code[pos - 2] | (code[pos - 1] << 8);
      }
      var self = this;
      function next_step() {
        for (;;) {
          if (pos >= code.length) return;
          switch (code[pos++]) {
            case 1:
              var speaker = nextArg();
              var text = nextArg();
              text = messages[text];
              return self.display(text).then(next_step);
            case 2:
              var option = nextArg();
              console.log('option off', option);
              continue;
            case 3:
              var option = nextArg();
              console.log('option on', option);
              continue;
            case 4:
              console.log('return');
              return;
            case 5:
              return;
            case 6:
              var option = nextArg();
              console.log('option off forever', option);
              continue;
            case 7:
              var arg = nextArg();
              console.log('run text script', arg);
              continue;
            case 8:
              var dialog = nextArg();
              console.log('go to dialog', dialog);
              return;
            case 9:
              var sound = nextArg();
              console.log('play sound', option);
              self.playSound(sound);
              continue;
            case 10:
              var item = nextArg();
              console.log('add inventory', item);
              continue;
            case 11:
              var character = nextArg();
              var view = nextArg();
              console.log('set speech view', character, view);
              continue;
            case 12:
              var room = nextArg();
              console.log('go to room', room);
              return self.goToRoom(room).then(next_step);
            case 13:
              var id = nextArg();
              var value = nextArg();
              console.log('set global var', id, value);
              continue;
            case 14:
              var points = nextArg();
              console.log('add score', points);
              continue;
            case 15:
              console.log('go to previous');
              return;
            case 16:
              var item = nextArg();
              console.log('lose inventory', item);
              continue;
            case 0xff:
              console.log('end script');
              return;
            default: throw new Error('unknown dialog opcode: ' + code[pos - 1]);
          }
        }
      }
      return next_step();
    },
    runGraphicalScriptBlock: function(script, n) {
      var block = script.blocks[n];
      var self = this;
      var i = 0;
      function next_step() {
        for (;;) {
          if (i >= block.length) return;
          var step = block[i++];
          switch (step.actionType) {
            case 'play_sound':
              self.playSound(step.data1);
              continue;
            case 'set_timer':
              self.graphicalTimerRemaining = step.data1;
              if (!self.graphicalTimerUpdate) {
                self.eventTarget.addEventListener('update', self.graphicalTimerUpdate = function timer_update() {
                  if (--self.graphicalTimerRemaining <= 0) {
                    self.eventTarget.removeEventListener('update', timer_update);
                    self.graphicalTimerUpdate = null;
                  }
                });
              }
              continue;
            case 'if_timer_expired':
              if (self.graphicalTimerRemaining <= 0) {
                var promise = self.runGraphicalScriptBlock(script, step.thenGoToBlock);
                if (promise) {
                  return promise.then(next_step);
                }
              }
              continue;
            case 'go_to_screen':
              return self.goToRoom(step.data1).then(next_step);
            case 'run_dialog_topic':
              var promise = self.runDialog(step.data1);
              if (promise) {
                return promise.then(next_step);
              }
              continue;
          }
        }
      }
      return next_step();
    },
    runScriptV2: function(script, funcName) {
      var exported = script.exports[funcName];
      var strings = script.strings;
      var pos = exported.entryPoint/4;
      var code = script.code;
      if (code[pos++] !== 0x3D3D3D3B) {
        if (code[pos-1] !== 0x3D373C3B) {
          console.log('unexpected prefix: 0x' + code[pos - 1].toString(16));
        }
        return;
      }
      var stack = [];
      var calling;
      var self = this;
      function next_step() {
        for (;;) {
          var op = code[pos++];
          switch (op) {
            case 0x3D3D373C:
              return;
            case 0x00000001:
              stack.unshift(code[pos++]);
              continue;
            case 0x00000D01:
              var local_var_address = code[pos++];
              // TODO
              continue;
            case 0x0000000D:
              calling = script.imports[code[pos++]];
              var argSize = code[pos++];
              var flags = argSize & 0xffff0000;
              argSize &= 0xffff;
              var args = stack.splice(-argSize/4);
              var promise;
              switch (calling.name) {
                case 'NewRoomEx':
                  promise = self.goToRoom(args[0]);
                  break;
                case 'NewRoom':
                  promise = self.goToRoom(args[0]);
                  break;
                case 'Wait':
                  promise = self.wait(args[0]);
                  break;
                case 'Display':
                  promise = self.display(args[0]);
                  break;
                case 'DisplayMessage':
                  var number = args[0];
                  var text = number < 500 ? self.room.main.messages[number] : self.game.globalMessages[number];
                  promise = self.display(text);
                  break;
                case 'DisplaySpeech':
                  promise = self.display(args[1]);
                  break;
                case 'SetGameSpeed':
                  self.ticksPerSecond = args[0];
                  break;
                case 'RunDialog':
                  promise = self.runDialog(args[0]);
                default:
                  console.log(calling, args);
                  break;
              }
              if (promise) {
                if (flags & 0x00200000) {
                  // throw away result
                }
                else {
                  promise = promise.then(function(value) {
                    stack.unshift(value);
                  });
                }
                promise = promise.then(next_step);
                return promise;
              }
              continue;
            case 0x00000502:
              var startPos = code[pos++];
              var endPos = startPos;
              while (strings[endPos] !== 0) endPos++;
              stack.unshift(String.fromCharCode.apply(null, strings.subarray(startPos, endPos)));
              continue;
            case 0x0002018B:
              var imported = script.imports[code[pos++]];
              // TODO
              continue;
            case 0x00F50110:
              var alloc_str_len = code[pos++];
              // TODO
              continue;
            case 0xF602110F:
              var unknown = code[pos++];
              // TODO: something to do with pushing string buffer as a func arg
              continue;
            case 0x0002010B:
            case 0x0003010B:
              var array_offset = code[pos++];
              // TODO
              continue;
            case 0x0003010F:
              var field_offset = code[pos++];
              // TODO
              continue;
            case 0x030411AE:
              // TODO: load int value from previously specified struct field into register?
              continue;
            case 0x0203110F:
            case 0x0304118B:
              // TODO: work out what this does?
              continue;
            case 0x0003014B:
              var store_value = code[pos++];
              // TODO
              continue;
            case 0x0002418B:
            case 0x0003418B:
              var script_var_offset = code[pos++];
              // TODO
              continue;
            case 0x0000044B:
              var script_var_offset = code[pos++];
              var store_value = code[pos++];
              // TODO
              continue;
            case 0x0000044F:
              var script_var_offset = code[pos++];
              var increase_value = code[pos++];
              // TODO
              continue;
            case 0x0002110B:
              var unknown = code[pos++];
              if (unknown === 0x00020201) {
                // TODO: work this out (local var vs. script var?)
              }
              else {
                var script_var_offset = code[pos++];
              }
              // TODO
              continue;
            case 0x00020113:
            case 0x00020117: // >=
            case 0x00030113:
            case 0x00040113:
            case 0x00040115:
              var value = code[pos++];
              // TODO
              continue;
            case 0x00020121:
            case 0x00040121:
            case 0x00000009:
              var jump = code[pos++];
              // TODO
              pos += jump / 4;
              continue;
            default:
              console.error('unknown op: ' + op.toString(16));
              return;
          }
        }
      }
      return next_step();
    },
    performInteractionV2: function(interaction) {
      switch (interaction.response) {
        case 'run_graphical_script':
          return this.runGraphicalScript(interaction.data1);
        case 'run_dialog_topic':
          return this.runDialog(interaction.data1);
        case 'run_script':
          return this.runScriptV2(this.room.scriptCompiled_v2, interaction.funcName);
        case 'go_to_screen':
          return this.goToRoom(interaction.data1);
        case 'display_message':
          var number = interaction.data1;
          if (number < 500) {
            return this.display(this.room.main.messages[number]);
          }
          return this.display(this.game.globalMessages[number]);
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
          if (interactions[i].event === 'player_enters_screen') {
            this.mainExec.queueAction(this.performInteractionV2.bind(this, interactions[i]));
          }
        }
        for (var i = 0; i < interactions.length; i++) {
          if (interactions[i].event === 'first_time_enters_screen') {
            this.mainExec.queueAction(this.performInteractionV2.bind(this, interactions[i]));
          }
        }
        for (var i = 0; i < interactions.length; i++) {
          if (interactions[i].event === 'enter_screen_after_fadein') {
            this.mainExec.queueAction(this.performInteractionV2.bind(this, interactions[i]));
          }
        }
        for (var i = 0; i < interactions.length; i++) {
          if (interactions[i].event === 'repeatedly_execute') {
            // TODO: set up on idle, remove on busy, until leaving room
            var tick = this.performInteractionV2.bind(this, interactions[i]);
            var eventTarget = this.eventTarget;
            this.mainExec.queueAction(function() {
              eventTarget.addEventListener('update', tick);
              eventTarget.addEventListener('leaving-room', (function(tick) {
                return function onLeavingRoom() {
                  this.removeEventListener('update', tick);
                  this.removeEventListener('leaving-room', onLeavingRoom);
                };
              })(tick));
            });
          }
        }
      }
    },
    begin: function() {
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
  
  function ExecutionChannel(runtime) {
    this.runtime = runtime;
    this.busyEvent = new CustomEvent('busy', {detail:{channel:this}});
    this.idleEvent = new CustomEvent('idle', {detail:{channel:this}});
    this.decrementBusyCount = this.decrementBusyCount.bind(this);
  }
  ExecutionChannel.prototype = {
    chain: Promise.resolve(),
    busyCount: 0,
    get isBusy() {
      return this.busyCount > 0;
    },
    queueAction: function(nextAction) {
      if (++this.busyCount === 1) {
        var promise = nextAction();
        if (!promise) {
          if (--this.busyCount > 0) {
            // nextAction() called this.queueAction() itself
            this.runtime.eventTarget.dispatchEvent(this.busyEvent);
          }
          return;
        }
        this.runtime.eventTarget.dispatchEvent(this.busyEvent);
        this.chain = promise;
        return;
      }
      this.chain = this.chain.then(nextAction).then(this.decrementBusyCount);
    },
    decrementBusyCount: function() {
      if (--this.busyCount === 0) {
        this.runtime.eventTarget.dispatchEvent(this.idleEvent);
      }
    },
  };
  
  return Runtime;

});
