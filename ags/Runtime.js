define(
['./GameView', './RoomView', './SpriteStore', './WGTFontView', 'playback/midi', 'playback/xm'],
function(GameView, RoomView, SpriteStore, WGTFontView, midi, xm) {

  'use strict';
  
  window.xm = xm;
  
  const updateEvent = new CustomEvent('update');
  
  var littleEndian = (function() {
    return new Uint16Array(new Uint8Array([1, 0]).buffer)[0] === 1;
  })();
  
  var getRGBA;
  if (littleEndian) {
    getRGBA = function(r,g,b,a) {
      return (r | (g << 8) | (b << 16) | (a << 24)) >>> 0;
    };
  }
  else {
    getRGBA = function(r,g,b,a) {
      return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
    };
  }
  
  const interfaceSubstitutions = /@(GAMENAME|OVERHOTSPOT|SCORE(TEXT)?|TOTALSCORE)@/gi;
  
  function Runtime(audioContext, fileSystem) {
    this.fileSystem = fileSystem;
    this.element = document.createElement('CANVAS');
    this.element.width = 320;
    this.element.height = 200;
    this.ctx2d = this.element.getContext('2d');
    this.eventTarget = this.element;
    this.eventTarget.runtime = this;
    this.eventTarget.addEventListener('entering-room', this.onEnteringRoom.bind(this));
    this.update = this.update.bind(this);
    this.audioContext = audioContext;
    this.mainExec = new ExecutionChannel(this);
    this.eventTarget.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();
    });
    this.eventTarget.addEventListener('keydown', function(e) {
      e.preventDefault();
      e.stopPropagation();
    });
    this.eventTarget.addEventListener('keyup', function(e) {
      e.preventDefault();
      e.stopPropagation();
    });
    this.fonts = [];
    this.overlays = [];
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
        return new RoomView(game, n, buffer, 0, buffer.byteLength);
      });
    },
    get scoreText() {
      return 'Score: ' + this.score + ' of ' + this.totalScore;
    },
    init: function() {
      var self = this;
      return this._init = this._init || Promise.all([
        
        this.fileSystem.loadAsArrayBuffer('ac2game.dta')
        .then(function(buffer) {
          self.game = new GameView(buffer, 0, buffer.byteLength);
          self.title = self.game.title;
          self.totalScore = self.game.totalScore;
          self.palette = self.game.palette.subarray();
        }),

        this.fileSystem.loadAsBlob('acsprset.spr')
        .then(SpriteStore.get)
        .then(function(sprites) {
          self.sprites = sprites;
        }),
        
        Promise.all(
          this.fileSystem.getNames(/^agsfnt\d+\.wfn$/i)
          .map(function(fileName) {
            return self.fileSystem.loadAsArrayBuffer(fileName)
            .then(function(buffer) {
              var num = +fileName.match(/\d+/)[0];
              self.fonts.length = Math.max(self.fonts.length, num + 1);
              self.fonts[num] = new WGTFontView(buffer, 0, buffer.byteLength);
            });
          })),

      ])
      .then(function() {
        self.characters = new Array(self.game.characters.length);
        for (var i = 0; i < self.characters.length; i++) {
          self.characters[i] = new RuntimeCharacter(self, i);
        }
        for (var i = 0; i < self.game.interfaces.length; i++) {
          var gui = self.game.interfaces[i];
          if (gui.isInitiallyShown) {
            new RuntimeBoxOverlay(
              self,
              gui.x, gui.y,
              gui.width, gui.height,
              gui.background_color, gui.border_color);
            for (var j = 0; j < gui.controlCount; j++) {
              var info = gui.getControlInfo(j);
              switch (info.type) {
                case 'label':
                  var label = self.game.labels[info.id];
                  var text = label.text;
                  var overlay = new RuntimeTextOverlay(
                    self,
                    gui.x + label.x, gui.y + label.y,
                    label.width, label.height,
                    self.fonts[label.font],
                    label.textColor,
                    label.xAlignment,
                    label.yAlignment,
                    text);
                  if (interfaceSubstitutions.test(text)) {
                    overlay.rawText = text;
                    overlay.update = function() {
                      var runtime = this.runtime;
                      this.text = this.rawText.replace(interfaceSubstitutions, function(sub) {
                        switch (sub) {
                          case '@OVERHOTSPOT@': return runtime.overHotspot || '';
                          case '@GAMENAME@': return runtime.title || '';
                          case '@SCORE@': return runtime.score || 0;
                          case '@TOTALSCORE@': return runtime.totalScore || 0;
                          case '@SCORETEXT@': return runtime.scoreText;
                        }
                      });
                      this.lines = this.font.wrap(this.text);
                      this.redraw();
                    };
                    overlay.update();
                  }
                  break;
              }
            }
          }
        }
        return self.loadRoom(self.game.playerCharacter.room);
      })
      .then(function(roomDef) {
        self.room = new RuntimeRoom(self, roomDef);
      });
    },
    textSpeed: 15,
    getTextDisplayTicks: function(str) {
      return (1 + Math.floor(str.length / this.textSpeed)) * this.ticksPerSecond;
    },
    renderText: function(str, fontNumber, px,py, rgba) {
      var font = this.fonts[fontNumber];
      font.put(this.ctx2d, str, px, py, rgba);
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
    Wait: function(ticks) {
      return this.wait(ticks);
    },
    wait: function(ticks, cancellers) {
      var eventTarget = this.eventTarget;
      return new Promise(function(resolve, reject) {
        function on_tick() {
          if (--ticks < 1) {
            this.removeEventListener('update', on_tick);
            this.removeEventListener('mousedown', on_click);
            this.removeEventListener('keydown', on_key);
            resolve();
          }
        }
        
        function on_click(e) {
          if (e.button !== 0 && e.button !== 2) return;
          if (typeof cancellers.mouseButtons === 'object') {
            if (e.button === 0 && !('Left' in cancellers.mouseButtons)) return;
            if (e.button === 2 && !('Right' in cancellers.mouseButtons)) return;
          }
          this.removeEventListener('update', on_tick);
          this.removeEventListener('mousedown', on_click);
          this.removeEventListener('key', on_key);
          resolve();
        }
        
        function on_key(e) {
          if (typeof cancellers.keys === 'object' && !(e.key in cancellers.keys)) return;
          this.removeEventListener('update', on_tick);
          this.removeEventListener('mousedown', on_click);
          this.removeEventListener('key', on_key);
          resolve();
        }
        
        eventTarget.addEventListener('update', on_tick);
        if (cancellers && 'mouseButtons' in cancellers) {
          eventTarget.addEventListener('mousedown', on_click);
        }
        if (cancellers && 'keys' in cancellers) {
          eventTarget.addEventListener('keydown', on_key);
        }
      });
    },
    graphicalTimerRemaining: 0,
    graphicalTimerUpdate: null,
    runGraphicalScript: function(n) {
      return this.runGraphicalScriptBlock(this.room.graphicalScripts[n], 0);
    },
    NewRoom: function(n) {
      this.goToRoom(n);
    },
    goToRoom: function(n) {
      var self = this;
      var loading = self.loadRoom(n).then(function(roomDef) {
        return new RuntimeRoom(self, roomDef);
      });
      this.mainExec.queueAction(function() {
        self.eventTarget.dispatchEvent(new CustomEvent('leaving-room'));
        return loading.then(function(room) {
          self.room = room;
          self.palette = room.backgroundBitmap.palette;
          self.eventTarget.dispatchEvent(new CustomEvent('entering-room'));
        });
      });
    },
    Display: function(text) {
      // TODO: string interpolation
      return this.display(text);
    },
    DisplaySpeech: function(characterId, text) {
      return this.characters[characterId].say(text);
    },
    PlaySound: function(number) {
      return this.playSound(number);
    },
    PlayMusic: function(number) {
      return this.playMusic(number);
    },
    display: function(text) {
      var font = this.fonts[0];
      var lines = font.wrap(text, 220);
      var boxWidth = 6;
      for (var i = 0; i < lines.length; i++) {
        boxWidth = Math.max(boxWidth, 3 + font.getTextWidth(lines[i]) + 3);
      }
      var boxHeight = 3 + lines.length * font.lineHeight + 3;
      var boxX = (320 - boxWidth) >> 1;
      var boxY = (200 - boxHeight) >> 1;
      var overlays = [new RuntimeBoxOverlay(this, boxX,boxY,boxWidth,boxHeight, 255,255,255,255, 0,0,0,255)];
      overlays.push(new RuntimeTextOverlay(this, boxX + 3, boxY + 3, boxWidth - 6, boxHeight - 6, this.fonts[0], 0, 0, 0, text));
      var self = this;
      return this
        .wait(Infinity, {mouseButtons:true, keys:true})
        .then(function() {
          for (var i = 0; i < overlays.length; i++) {
            overlays[i].remove();
          }
          return self.wait(1);
        });
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
              return self.characters[speaker].say(text).then(next_step);
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
              self.goToRoom(room);
              continue;
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
              self.goToRoom(step.data1);
              continue;
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
    getMessage: function(number) {
      return number < 500 ? this.room.messages[number] : this.game.globalMessages[number];
    },
    getColorStyle: function(colorCode) {
      var palette = this.palette;
      var r = palette[colorCode * 4];
      var g = palette[colorCode * 4 + 1];
      var b = palette[colorCode * 4 + 2];
      return 'rgb('+r+','+g+','+b+')';
    },
    getColorRGBA: function(colorCode) {
      var palette = this.palette;
      return getRGBA(
        palette[colorCode * 4],
        palette[colorCode * 4 + 1],
        palette[colorCode * 4 + 2],
        0xff);
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
                  self.goToRoom(args[0]);
                  break;
                case 'NewRoom':
                  self.goToRoom(args[0]);
                  break;
                case 'Wait':
                  promise = self.wait(args[0]);
                  break;
                case 'Display':
                  promise = self.display(args[0]);
                  break;
                case 'DisplayMessage':
                  var number = args[0];
                  var text = self.getMessage(number);
                  promise = self.display(text);
                  break;
                case 'DisplaySpeech':
                  promise = self.characters[args[0]].say(args[1]);
                  break;
                case 'SetGameSpeed':
                  self.ticksPerSecond = args[0];
                  break;
                case 'RunDialog':
                  promise = self.runDialog(args[0]);
                  break;
                case 'PlaySound':
                  self.playSound(args[0]);
                  break;
                case 'PlayMusic':
                  self.playMusic(args[0]);
                  break;
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
            case 0x0002010B:
              var str_buf_offset = code[pos++]; // negative for local
              var unknown1 = code[pos++];
              var unknown2 = code[pos++];
              // TODO: something to do with pushing string buffer as a func arg
              continue;
            case 0x0003010B:
              var array_offset = code[pos++];
              // TODO
              continue;
            case 0x0002010F:
              var add_value = code[pos++];
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
            case 0x0200144B:
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
          if (this.game.formatVersion >= 11) {
            // TODO: SCOM script
            return this.room.script.exports[interaction.funcName]();
          }
          return this.runScriptV2(this.room.scriptCompiled_v2, interaction.funcName);
        case 'go_to_screen':
          this.goToRoom(interaction.data1);
          return;
        case 'display_message':
          var number = interaction.data1;
          return this.display(this.getMessage(number));
      }
    },
    playingMusic: -1,
    playMusic: function(musicTrack) {
      if (musicTrack === this.playingMusic) return;
      this.playingMusic = musicTrack;
      var fileName = this.fileSystem.getName('music' + musicTrack + '.mid');
      if (fileName) {
        midi.stop();
        this.fileSystem.loadAsArrayBuffer(fileName).then(midi.play);
      }
    },
    redraw: function() {
      this.ctx2d.putImageData(this.room.background, -this.room.viewportX, -this.room.viewportY);
      for (var i = 0; i < this.overlays.length; i++) {
        this.overlays[i].render();
      }
    },
    onEnteringRoom: function() {
      var musicTrack = this.room.startupMusic;
      if (musicTrack !== 0) {
        this.playMusic(musicTrack);
      }
      
      var interactions = this.room.interactions_v2 && this.room.interactions_v2.forRoom;
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
            this.eventTarget.roomRepExec = this.mainExec.tryImmediateAction.bind(
              this.mainExec,
              this.performInteractionV2.bind(
                this,
                interactions[i]));
            this.eventTarget.addEventListener('update', this.eventTarget.roomRepExec);
            function onLeavingRoom() {
              this.removeEventListener('update', this.roomRepExec);
              this.roomRepExec = null;
              this.removeEventListener('leaving-room', onLeavingRoom);
            }
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
      this.redraw();
    },
    addEventfulGlobal: function(name, initialValue) {
      const internalName = '_' + name;
      const changeEvent = new CustomEvent('global-changed', {detail:name});
      this[internalName] = initialValue;
      Object.defineProperty(this, name, {
        get: function(){ return this[internalName]; },
        set: function(value) {
          if (value === this[internalName]) return;
          this[internalName] = value;
          this.eventTarget.dispatchEvent(changeEvent);
        },
        enumerable: true,
      });
    },
  };
  
  Runtime.prototype.addEventfulGlobal('score', 0);
  Runtime.prototype.addEventfulGlobal('totalScore', 0);
  Runtime.prototype.addEventfulGlobal('title', '');
  
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
    tryImmediateAction: function(nextAction) {
      if (this.isBusy) return;
      return this.queueAction(nextAction);
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
        this.chain = promise.then(this.decrementBusyCount);
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
  
  function RuntimeOverlay(runtime) {
    runtime.overlays.push(this);
    this.runtime = runtime;
  }
  RuntimeOverlay.prototype = {
    remove: function() {
      var i = this.runtime.overlays.indexOf(this);
      if (i === -1) return;
      this.runtime.overlays.splice(i, 1);
    },
  };
  
  function RuntimeBoxOverlay(runtime, x, y, width, height, r,g,b,a, br,bg,bb,ba) {
    RuntimeOverlay.call(this, runtime);
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    if (arguments.length === 7) {
      const fillColorCode = arguments[5], borderColorCode = arguments[6];
      Object.defineProperties(this, {
        fillStyle: {
          get: function() {
            return runtime.getColorStyle(fillColorCode);
          },
        },
        borderStyle: {
          get: function() {
            return runtime.getColorStyle(borderColorCode);
          },
        },
      });
    }
    else {
      this.fillStyle = 'rgba('+r+','+g+','+b+','+a/255+')';
      this.strokeStyle = 'rgba('+br+','+bg+','+bb+','+ba/255+')';
    }
  }
  RuntimeBoxOverlay.prototype = Object.create(RuntimeOverlay.prototype, {
    render: {
      value: function() {
        this.runtime.ctx2d.fillStyle = this.fillStyle;
        this.runtime.ctx2d.strokeStyle = this.strokeStyle;
        this.runtime.ctx2d.fillRect(this.x, this.y, this.width, this.height);
        this.runtime.ctx2d.strokeRect(this.x+0.5, this.y+0.5, this.width, this.height);
      },
    },
  });
  
  function RuntimeTextOverlay(runtime, x, y, width, height, font, colorCode, alignmentX, alignmentY, text) {
    RuntimeOverlay.call(this, runtime);
    this.x = x;
    this.y = y;
    this.canvas = document.createElement('CANVAS');
    this.canvas.width = width;
    this.canvas.height = height;
    this.font = font;
    this.colorCode = colorCode;
    this.alignmentX = alignmentX;
    this.alignmentY = alignmentY;
    this.text = text;
    this.lines = font.wrap(text, width);
    this.redraw();
  }
  RuntimeTextOverlay.prototype = Object.assign(Object.create(RuntimeOverlay.prototype), {
    redraw: function() {
      var ctx2d = this.canvas.getContext('2d');
      var w = this.canvas.width, h = this.canvas.height;
      var imageData = ctx2d.createImageData(w, h);
      var asU32 = new Uint32Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength/4);
      var rgba = this.runtime.getColorRGBA(this.colorCode);
      var y = Math.floor((h - this.font.lineHeight * this.lines.length) * this.alignmentY);
      for (var i = 0; i < this.lines.length; i++) {
        var x = Math.floor((w - this.font.getTextWidth(this.lines[i])) * this.alignmentX);
        this.font.putRawPixels(asU32, x, y, w, this.lines[i], rgba);
        y += this.font.lineHeight;
      }
      ctx2d.putImageData(imageData, 0, 0);
    },
    render: function() {
      this.runtime.ctx2d.drawImage(this.canvas, this.x, this.y);
    },
  });
  
  function RuntimeRoom(runtime, def) {
    this.runtime = runtime;
    this.def = def;
    var pic = def.main.backgroundBitmap;
    var imageData = runtime.ctx2d.createImageData(pic.width, pic.height);
    pic.setImageData(imageData);
    this.background = imageData;
    if (def.scriptCompiled_v3) {
      this.script = def.scriptCompiled_v3.instantiate(runtime);
    }
  }
  RuntimeRoom.prototype = {
    viewportX: 0,
    viewportY: 0,
    get number() {
      return this.def.number;
    },
    get graphicalScripts() {
      return this.def.main.graphicalScripts;
    },
    get messages() {
      return this.def.main.messages;
    },
    get backgroundBitmap() {
      return this.def.main.backgroundBitmap;
    },
    get startupMusic() {
      return this.def.main.startupMusic;
    },
    get interactions_v2() {
      return this.def.main.interactions_v2;
    },
    get scriptCompiled_v2() {
      return this.def.scriptCompiled_v2;
    },
  };
  
  function RuntimeSprite(sprites, eventTarget, spriteNumber, x, y) {
    this.sprites = sprites;
    this.eventTarget = eventTarget;
    this.spriteNumber = spriteNumber;
    this._x = x;
    this._y = y;
    this.updateEvent = new CustomEvent('update-sprite', {detail:{sprite:this}});
  }
  RuntimeSprite.prototype = {
    _spriteNumber: -1,
    _x: 0,
    _y: 0,
    _offsetX: 0,
    _offsetY: 0,
    _offsetXRatio: 0,
    _offsetYRatio: 0,
    _visible: false,
    get spriteNumber() {
      return this._spriteNumber;
    },
    set spriteNumber(v) {
      v = Math.floor(v);
      if (isNaN(v)) return new TypeError('spriteNumber must be a number');
      if (v === this._spriteNumber) return;
      this._spriteNumber = v;
      this._info = this.sprites.getInfo(v);
      if (this._visible) this.eventTarget.dispatchEvent(this.updateEvent);
    },
    get width() {
      return this._info.width;
    },
    get height() {
      return this._info.height;
    },
    get x() {
      return this._x;
    },
    set x(v) {
      v = Math.floor(v);
      if (isNaN(v)) throw new TypeError('x must be a number');
      if (v === this._x) return;
      this._x = v;
      if (this._visible) this.eventTarget.dispatchEvent(this.updateEvent);
    },
    get y() {
      return this._y;
    },
    set y(v) {
      v = Math.floor(v);
      if (isNaN(v)) throw new TypeError('y must be a number');
      if (v === this._y) return;
      this._y = v;
      if (this._visible) this.eventTarget.dispatchEvent(this.updateEvent);
    },
    get visible() {
      return this._visible;
    },
    set visible(v) {
      v = !!v;
      if (v === this._visible) return;
      this._visible = v;
      this.eventTarget.dispatchEvent(new CustomEvent(
        v ? 'add-sprite' : 'remove-sprite',
        {detail:{sprite:this}}));
    },
    get offsetX() {
      return this._offsetX;
    },
    set offsetX(v) {
      v = Math.floor(v);
      if (isNaN(v)) throw new TypeError('offsetX must be a number');
      if (v === this._offsetX) return;
      this._offsetX = v;
      if (this._visible) this.eventTarget.dispatchEvent(this.updateEvent);
    },
    set offsetY(v) {
      v = Math.floor(v);
      if (isNaN(v)) throw new TypeError('offsetY must be a number');
      if (v === this._offsetY) return;
      this._offsetY = v;
      if (this._visible) this.eventTarget.dispatchEvent(this.updateEvent);
    },
    set offsetXRatio(v) {
      v = Math.floor(v);
      if (isNaN(v)) throw new TypeError('offsetXRatio must be a number');
      if (v === this._offsetXRatio) return;
      this._offsetXRatio = v;
      if (this._visible) this.eventTarget.dispatchEvent(this.updateEvent);
    },
    set offsetYRatio(v) {
      v = Math.floor(v);
      if (isNaN(v)) throw new TypeError('offsetYRatio must be a number');
      if (v === this._offsetY) return;
      this._offsetY = v;
      if (this._visible) this.eventTarget.dispatchEvent(this.updateEvent);
    },
    get actualX() {
      return this.x + this.offsetX + Math.ceil(this.offsetXRatio * this.width);
    },
    get actualY() {
      return this.y + this.offsetY + Math.ceil(this.offsetYRatio * this.height);
    },
    order: 0,
  };
  
  function RuntimeCharacter(runtime, n) {
    this.runtime = runtime;
    this.number = n;
    this.def = runtime.game.characters[n];
    RuntimeSprite.call(this, runtime.sprites, runtime.eventTarget, 0, this.def.x, this.def.y);
    this._room = this.def.room;
    runtime.eventTarget.addEventListener('entering-room', this.updateVisible.bind(this));
  }
  RuntimeCharacter.prototype = Object.assign(Object.create(RuntimeSprite.prototype), {
    _on: true,
    _offsetXRatio: -0.5,
    _offsetYRatio: -1,
    _baseline: -1,
    get on() {
      return this._on;
    },
    set on(v) {
      v = !!v;
      if (v === this._on) return;
      this._on = v;
      this.updateVisible();
    },
    get room() {
      return this._room;
    },
    set room(v) {
      v = Math.floor(v);
      if (isNaN(v)) throw new TypeError('room must be a number');
      if (v === this._room) return;
      this._room = v;
      this.updateVisible();
    },
    updateVisible: function() {
      this.visible = (this._room === this.runtime.room.number) && this._on;
    },
    get z() {
      return -this._offsetY;
    },
    set z(v) {
      this.offsetY = -v;
    },
    get baseline() {
      return this._baseline;
    },
    set baseline(v) {
      if (v === this._baseline) return;
      this._baseline = v;
    },
    get order() {
      var baseline = this._baseline;
      return this._baseline === -1 ? this._y : this._baseline;
    },
    say: function(text) {
      var runtime = this.runtime;
      var font = runtime.fonts[1];
      var outlineFont = runtime.fonts[2];
      var lines = font.wrap(text, 240);
      var width = 0;
      for (var i = 0; i < lines.length; i++) {
        width = Math.max(width, font.getTextWidth(lines[i]));
      }
      var height = font.lineHeight * lines.length;
      var x = Math.min(320 - width, Math.max(0, Math.floor(this.x - runtime.room.viewportX - width/2)));
      var y = Math.min(200 - height, Math.max(0, this.y - runtime.room.viewportY - this.height - height));
      var t1 = new RuntimeTextOverlay(runtime, x, y, width, height, outlineFont, 0, 0.5, 0, text);
      var t2 = new RuntimeTextOverlay(runtime, x, y, width, height, font, this.def.speechColor, 0.5, 0, text);
      return runtime.wait(runtime.getTextDisplayTicks(text), {mouseButtons:true, keys:true})
        .then(function() {
          t1.remove();
          t2.remove();
          return runtime.wait(1);
        });
    },
  });
  
  return Runtime;

});

