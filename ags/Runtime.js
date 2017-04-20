define(
['./RuntimeGraphics', './GameView', './RoomView', './SpriteStore', './WGTFontView', 'playback/smf', 'playback/xm'],
function(Graphics, GameView, RoomView, SpriteStore, WGTFontView, smf, xm) {

  'use strict';
  
  window.xm = xm;
  
  const updateEventWithAnim = new CustomEvent('update', {detail:{animate:true}});
  const updateEventNoAnim = new CustomEvent('update', {detail:{animate:false}});
  
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
  
  var keyCodeMap = {
    Enter: 13,
    Escape: 27,
    ' ': 32,
    '0': 48,
    ArrowUp: 372, ArrowLeft: 375, ArrowRight: 377, ArrowDown: 380,
    F11: 433, F12: 434,
    Home: 371, PageUp: 373, End: 379, PageDown: 381,
  };
  var numericKeypadKeyMap = {
    '5': 376,
  };
  var ctrlKeyCodeMap = {};
  var altKeyCodeMap = {};
  'QWERTYUIOP'.split('').forEach(function(c, i) {
    altKeyCodeMap[c] = altKeyCodeMap[c.toLowerCase()] = 316 + i;
  });
  'ASDFGHJKL'.split('').forEach(function(c, i) {
    altKeyCodeMap[c] = altKeyCodeMap[c.toLowerCase()] = 330 + i;
  });
  'ZXCVBNM'.split('').forEach(function(c, i) {
    altKeyCodeMap[c] = altKeyCodeMap[c.toLowerCase()] = 344 + i;
  });
  for (var i = 0; i < 26; i++) {
    var upper = String.fromCharCode('A'.charCodeAt(0) + i);
    var lower = String.fromCharCode('a'.charCodeAt(0) + i);
    keyCodeMap[lower] = keyCodeMap[upper] = 65 + i;
    ctrlKeyCodeMap[lower] = ctrlKeyCodeMap[upper] = 1 + i;
  }
  for (var i = 0; i < 10; i++) {
    keyCodeMap[''+i] = 48 + i;
    keyCodeMap['F'+(i+1)] = 359 + i;
  }
  
  function Runtime(audioContext, fileSystem) {
    this.fileSystem = fileSystem;
    this.graphics = new Graphics(this);
    this.graphics.setViewport(640, 400, 2);
    this.element = this.graphics.screen;
    this.element.tabIndex = 0;
    this.ctx2d = this.element.getContext('2d');
    this.eventTarget = this.element;
    this.eventTarget.runtime = this;
    this.eventTarget.addEventListener('entering-room', this.onEnteringRoom.bind(this));
    this.update = this.update.bind(this);
    this.audioContext = audioContext;
    this.mainExec = new ExecutionChannel(this);
    var self = this;
    function on_click(e) {
      e.preventDefault();
      e.stopPropagation();
      this.focus();
      if (e.button === 0) {
        self.onClick(1);
      }
      else if (e.button === 2) {
        self.onClick(2);
      }
    }
    this.eventTarget.addEventListener('mousedown', on_click);
    this.eventTarget.addEventListener('contextmenu', on_click);
    var pressedMap = this.pressedMap = {};
    this.eventTarget.addEventListener('keydown', function(e) {
      switch (e.key) {
        case 'Control': pressedMap[e.location === 2 ? 406 : 405] = true; return;
        case 'Shift': pressedMap[e.location === 2 ? 404 : 403] = true; return;
        case 'Alt': pressedMap[407] = true; return;
      }
      var keycode = 0;
      if (e.ctrlKey && e.key in ctrlKeyCodeMap) {
        keycode = ctrlKeyCodeMap[e.key];
      }
      else if (e.altKey && e.key in altKeyCodeMap) {
        keycode = altKeyCodeMap[e.key];
      }
      else if (e.location === 3 && e.key in numericKeypadKeyMap) {
        keycode = numericKeypadKeyMap[e.key];
      }
      else if (e.key in keyCodeMap) {
        keycode = keyCodeMap[e.key];
      }
      if (keycode !== 0) {
        e.preventDefault();
        e.stopPropagation();
        pressedMap[keycode] = true;
        self.onKey(keycode);
      }
    });
    this.eventTarget.addEventListener('keyup', function(e) {
      switch (e.key) {
        case 'Control': delete pressedMap[e.location === 2 ? 406 : 405]; return;
        case 'Shift': delete pressedMap[e.location === 2 ? 404 : 403]; return;
        case 'Alt': delete pressedMap[407]; return;
      }
      if (e.key in ctrlKeyCodeMap) {
        e.preventDefault();
        e.stopPropagation();
        delete pressedMap[ctrlKeyCodeMap[e.key]];
      }
      if (e.key in altKeyCodeMap) {
        e.preventDefault();
        e.stopPropagation();
        delete pressedMap[altKeyCodeMap[e.key]];
      }
      if (e.location === 3 && e.key in numericKeypadKeyMap) {
        e.preventDefault();
        e.stopPropagation();
        delete pressedMap[numericKeypadKeyMap[e.key]];
      }
      else if (e.key in keyCodeMap) {
        e.preventDefault();
        e.stopPropagation();
        delete pressedMap[keyCodeMap[e.key]];
      }
    });
    this.fonts = [];
    this.overlays = [];
    audioContext.addEventListener('song-start', function(e) {
      if ('song' in self) self.song.stop();
      self.song = e.detail.song;
    });
  }
  Runtime.prototype = {
    on_key_press: function() { },
    on_mouse_click: function() { },
    tickMillisecs: 1000/40,
    get ticksPerSecond() {
      return Math.round(1000/this.tickMillisecs);
    },
    set ticksPerSecond(v) {
      this.tickMillisecs = 1000/v;
    },
    SetGameSpeed: function(v) {
      this.ticksPerSecond = v;
    },
    GetGameSpeed: function() {
      return this.ticksPerSecond;
    },
    StrCopy: Object.assign(function StrCopy(buffer, str) {
      if (!(buffer instanceof Uint8Array)) {
        throw new Error('StrCopy: arg 1 must be a memory buffer, got ' + buffer);
      }
      if (str instanceof Uint8Array) {
        for (var i = 0; ; i++) {
          if ((buffer[i] = str[i]) === 0) return;
        }
      }
      str = ''+str;
      for (var i = 0; i < str.length; i++) {
        buffer[i] = str.charCodeAt(i);
      }
      buffer[str.length] = 0;
    }, {passStringsByRef:true}),
    StrCat: Object.assign(function StrCat(buffer, str) {
      if (!(buffer instanceof Uint8Array)) {
        throw new Error('StrCat: arg 1 must be a memory buffer, got ' + buffer);
      }
      var i_start = buffer.indexOf(0);
      if (i_start === -1) {
        console.error('StrCat: buffer has no null terminator');
        return;
      }
      this.StrCopy(buffer.subarray(i_start), str);
    }, {passStringsByRef:true}),
    InputBox: Object.assign(function InputBox(requestMessage, buffer) {
      if (requestMessage instanceof Uint8Array) {
        requestMessage = String.fromCharCode.apply(null, requestMessage.subarray(0, requestMessage.indexOf(0)));
      }
      else requestMessage = ''+requestMessage;
      if (!(buffer instanceof Uint8Array)) {
        throw new Error('InputBox: arg 2 must be a memory buffer, got ' + buffer);
      }
      var currentValue = String.fromCharCode.apply(null, buffer.subarray(0, buffer.indexOf(0)));
      this.StrCopy(buffer, window.prompt(requestMessage, currentValue) || '');
    }, {passStringsByRef:true}),
    StrComp: Object.assign(function StrComp(buffer, str) {
      if (str instanceof Uint8Array) {
        str = String.fromCharCode.apply(null, str.subarray(0, str.indexOf(0)));
      }
      else str = ''+str;
      if (typeof buffer === 'string') {
        return (buffer < str) ? -1 : (buffer > str) ? 1 : 0;
      }
      if (!(buffer instanceof Uint8Array)) {
        throw new Error('StrComp: arg 1 must be a string or memory buffer, got ' + buffer);
      }
      for (var i = 0; i < str.length; i++) {
        if (buffer[i] === 0) return -1;
        var diff = str.charCodeAt(i) - buffer[i];
        if (diff !== 0) return diff;
      }
      return (buffer[i] !== 0) ? 1 : 0;
    }, {passStringsByRef:true}),
    GetLocationName: Object.assign(function GetLocationName(x, y, buffer) {
      if (!(buffer instanceof Uint8Array)) {
        throw new Error('GetLocationName: arg 3 must be a memory buffer, got ' + buffer);
      }
      console.error('NYI: GetLocationName');
      this.StrCopy(buffer, '');
    }, {passStringsByRef:true}),
    SetLabelText: function(gui, label, text) {
      console.error('NYI: SetLabelText: ' + gui + ',' + label + ',' + text);
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
    get inventoryWindowItemCount() {
      console.error('NYI: inventoryWindowItemCount');
      return 0;
    },
    set inventoryWindowItemCount(v) {
      console.error('NYI: inventoryWindowItemCount');
    },
    get inventoryWindowItemsPerLine() {
      console.error('NYI: inventoryWindowItemsPerLine');
      return 0;
    },
    set inventoryWindowItemsPerLine(v) {
      console.error('NYI: inventoryWindowItemsPerLine');
    },
    definePeekProperty(nameAndOffset, dataSize) {
      var parts = nameAndOffset.split('+', 2);
      var name = parts[0], offset = +parts[1];
      switch (name) {
        case 'player':
          Object.defineProperty(this, nameAndOffset, {
            get: function() {
              return this.rawPeek('character+' + (this.player * this.player.def.byteLength + offset), dataSize);
            },
            set: function(v) {
              this.rawPoke('character+' + (this.player * this.player.def.byteLength + offset), dataSize, v);
            },
          });
          return true;
        case 'gs_globals':
          var index = offset >> 2;
          Object.defineProperty(this, nameAndOffset, {
            get: function() { return this.gs_globals[index]; },
            set: function(v) { this.gs_globals[index] = v; },
          });
          return true;
        case 'game':
          if (offset >= 20 && offset < 220) {
            var index = (offset - 20) >> 2;
            Object.defineProperty(this, nameAndOffset, {
              get: function() { return this.globalscriptvars[index]; },
              set: function(v) { this.globalscriptvars[index] = v; },
            });
            return true;
          }
          switch (offset) {
            case 0:
              Object.defineProperty(this, nameAndOffset, {
                get: function() { return this.score; },
                set: function(v) { this.score = v; },
              });
              return true;
            case 232:
              Object.defineProperty(this, nameAndOffset, {
                get: function() { return this.inventoryWindowItemCount; },
                set: function(v) { this.inventoryWindowItemCount = v; },
              });
              return true;
            case 240:
              Object.defineProperty(this, nameAndOffset, {
                get: function() { return this.inventoryWindowItemsPerLine; },
                set: function(v) { this.inventoryWindowItemsPerLine = v; },
              });
              return true;
            case 244:
              Object.defineProperty(this, nameAndOffset, {
                get: function() { return this.textSpeed; },
                set: function(v) { this.textSpeed = v; },
              });
              return true;
          }
          break;
        case 'character':
          var structSize = this.game.characters[0].byteLength;
          var characterNumber = (offset / structSize) | 0;
          var fieldOffset = offset % structSize;
          const character = this.characters[characterNumber];
          if (fieldOffset < 56) {
            switch (fieldOffset) {
              case 0:
                Object.defineProperty(this, nameAndOffset, {
                  get: function() { return character.normalView; },
                  set: function(v) { character.normalView = v; },
                });
                return true;
              case 4:
                Object.defineProperty(this, nameAndOffset, {
                  get: function() { return character.speechView; },
                  set: function(v) { character.speechView = v; },
                });
                return true;
              case 8:
                Object.defineProperty(this, nameAndOffset, {
                  get: function() { return character.currentView; },
                  set: function(v) { character.currentView = v; },
                });
                return true;
              case 12:
                Object.defineProperty(this, nameAndOffset, {
                  get: function() { return character.room; },
                  set: function(v) { character.room = v; },
                });
                return true;
              case 16:
                Object.defineProperty(this, nameAndOffset, {
                  get: function() { return character.previousRoom; },
                  set: function(v) { character.previousRoom = v; },
                });
                return true;
              case 20:
                Object.defineProperty(this, nameAndOffset, {
                  get: function() { return character.x; },
                  set: function(v) { character.x = v; },
                });
                return true;
              case 24:
                Object.defineProperty(this, nameAndOffset, {
                  get: function() { return character.y; },
                  set: function(v) { character.y = v; },
                });
                return true;
              case 52:
                Object.defineProperty(this, nameAndOffset, {
                  get: function() { return character.activeInventoryItem; },
                  set: function(v) { character.activeInventoryItem = v; },
                });
                return true;
            }
          }
          else if (this.game.formatVersion >= 13 && fieldOffset < 100) {
            // TODO
          }
          else {
            fieldOffset -= (this.game.formatVersion >= 13) ? 100 : 56;
            var itemCount = (this.game.formatVersion >= 13) ? 301 : 100;
            if (fieldOffset >= 12 && fieldOffset < 12 + (itemCount * 2)) {
              var itemNumber = (fieldOffset - 12) >>> 2;
              Object.defineProperty(this, nameAndOffset, {
                get: function() { return character.getInventoryCount(itemNumber); },
                set: function(v) { character.setInventoryCount(itemNumber, v); },
              });
              return true;
            }
            switch (fieldOffset) {
              case 0:
                Object.defineProperty(this, nameAndOffset, {
                  get: function() { return character.currentLoop; },
                  set: function(v) { character.currentLoop = v; },
                });
                return true;
              case 2:
                Object.defineProperty(this, nameAndOffset, {
                  get: function() { return character.currentFrame; },
                  set: function(v) { character.currentFrame = v; },
                });
                return true;
              case 4:
                Object.defineProperty(this, nameAndOffset, {
                  get: function() { return character.isWalking; },
                  set: function(v) { character.isWalking = v; },
                });
                return true;
              case 6:
                Object.defineProperty(this, nameAndOffset, {
                  get: function() { return character.isAnimating; },
                  set: function(v) { character.isAnimating = v; },
                });
                return true;
            }
          }
          break;
      }
      return false;
    },
    rawPeek: function(nameAndOffset, dataSize) {
      if (nameAndOffset in this || this.definePeekProperty(nameAndOffset, dataSize)) {
        return this[nameAndOffset];
      }
      console.error('NYI: rawPeek ' + nameAndOffset);
      return 0;
    },
    rawPoke: function(nameAndOffset, dataSize, value) {
      if (nameAndOffset in this || this.definePeekProperty(nameAndOffset, dataSize)) {
        this[nameAndOffset] = value;
        return;
      }
      console.error('NYI: rawPoke ' + nameAndOffset + ' = ' + value);
    },
    get scoreText() {
      return 'Score: ' + this.score + ' of ' + this.totalScore;
    },
    onKey: function(keycode) {
      this.mainExec.tryImmediateAction(this.on_key_press.bind(this, keycode));
    },
    onClick: function(buttonNumber) {
      this.mainExec.tryImmediateAction(this.on_mouse_click.bind(this, buttonNumber));
    },
    GiveScore: function(n) {
      this.score += n;
      // TODO: on_event(GOT_SCORE)
      if (n >= 0) {
        // TODO: score sound
      }
    },
    get idMap() {
      var map = {};
      Object.defineProperty(this, 'idMap', {value:map, enumerable:true});
      return map;
    },
    generateId: function(object) {
      var id;
      do { id = (Math.random() * 0x7fffffff) | 0; } while (id in this.idMap);
      this.idMap[id] = object;
      return id;
    },
    get gs_globals() {
      var ints = new Int32Array(50);
      Object.defineProperty(this, 'gs_globals', {value:ints, enumerable:true});
      return ints;
    },
    get globalscriptvars() {
      var ints = new Int32Array(500);
      Object.defineProperty(this, 'globalscriptvars', {value:ints, enumerable:true});
      return ints;
    },
    GetGlobalInt: function(n) {
      return this.globalscriptvars[n];
    },
    SetGlobalInt: function(n, v) {
      this.globalscriptvars[n] = v;
    },
    CreateTextOverlay: function(x, y, width, fontNumber, color, text) {
      var font = this.fonts[fontNumber];
      var height = font.wrap(text, width).length * font.lineHeight;
      var overlay = new RuntimeTextOverlay(
        this,
        x, y,
        width, height,
        font,
        color,
        0,
        0,
        text);
      return this.generateId(overlay);
    },
    RemoveOverlay: function(id) {
      var overlay = this.idMap[id];
      if (overlay instanceof RuntimeOverlay) {
        delete this.idMap[id];
        overlay.remove();
      }
    },
    SetViewport: function(x, y) {
      this.graphics.viewportX = x;
      this.graphics.viewportY = y;
    },
    SetTextOverlay: function(id, x, y, width, fontNumber, color, text) {
      this.RemoveOverlay(id);
      var font = this.fonts[fontNumber];
      var height = font.wrap(text, width).length * font.lineHeight;
      this.idMap[id] = new RuntimeTextOverlay(
        this,
        x, y,
        width, height,
        font,
        color,
        0,
        0,
        text);
      return id;
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
          self.script = self.game.globalScript.instantiate(self);
          self.dialogScript = self.game.dialogScript.instantiate(self);
          for (var k in self.script.exports) {
            self[k] = self.script.exports[k];
          }
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
        self.player = self.characters[self.game.playerCharacterId];
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
                    self.fonts[label.font] || self.fonts[0],
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
                      this.lines = this.font.wrap(this.text, this.width);
                      this.redraw();
                    };
                    overlay.update();
                  }
                  break;
              }
            }
          }
        }
        if ('repeatedly_execute' in self.script.exports) {
          self.eventTarget.addEventListener('update', function() {
            self.mainExec.tryImmediateAction(self.script.exports.repeatedly_execute);
          });
        }
        if ('game_start' in self.script.exports) {
          return self.script.exports.game_start();
        }
      })
      .then(function() {
        return self.loadRoom(self.game.playerCharacter.room);
      })
      .then(function(roomDef) {
        return (self.room = new RuntimeRoom(self, roomDef)).loaded;
      })
      .then(function(room) {
        self.palette = room.backgroundBitmap.palette;
        self.graphics.background = room.background;
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
    WaitKey: function(ticks) {
      return this.wait(ticks, {keys:true});
    },
    animDelay: function(ticks) {
      var eventTarget = this.eventTarget;
      return new Promise(function(resolve, reject) {
        function on_tick(e) {
          if (e.detail.animate && --ticks < 1) {
            this.removeEventListener('update', on_tick);
            resolve();
          }
        }
        eventTarget.addEventListener('update', on_tick);
      });
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
    NewRoom: function(n) {
      this.goToRoom(n);
    },
    NewRoomEx: function(n, x, y) {
      // TODO: support player co-ords
      this.goToRoom(n);
    },
    IsGamePaused: function() {
      console.error('NYI: IsGamePaused');
      return false;
    },
    QuitGame: function(ask) {
      // TODO
      console.warn('QuitGame called');
    },
    StopMoving: function(character) {
      // TODO
      console.error('NYI: StopMoving');
    },
    ObjectOff: function(roomObject) {
      console.error('NYI: ObjectOff');
    },
    ObjectOn: function(roomObject) {
      console.error('NYI: ObjectOn');
    },
    AddInventory: function(item) {
      console.error('NYI: AddInventory');
    },
    LoseInventory: function(item) {
      console.error('NYI: LoseInventory');
    },
    RunAnimation: function(anim) {
      console.error('NYI: RunAnimation');
    },
    onNthLoop: function(n) {
      // TODO: set up a counter
      console.error('NYI: onNthLoop');
      return false;
    },
    PlayAnimation: function(number) {
      console.error('NYI: PlayAnimation');
    },
    GetPlayerCharacter: function() {
      return this.player;
    },
    PlayFlic: function(which, maySkip) {
      console.error('NYI: PlayFlic');
    },
    goToRoom: function(n) {
      var self = this;
      var loading = self.loadRoom(n).then(function(roomDef) {
        return new RuntimeRoom(self, roomDef).loaded;
      });
      this.mainExec.onNextIdle(function() {
        self.eventTarget.dispatchEvent(new CustomEvent('leaving-room'));
        return loading.then(function(room) {
          self.graphics.background = room.background;
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
    DisplaySpeechBackground: function(characterId, text) {
      return this.characters[characterId].say(text, true);
    },
    PlaySound: function(number) {
      return this.playSound(number);
    },
    PlayMusic: function(number) {
      return this.playMusic(number);
    },
    InventoryScreen: function() {
      console.error('NYI: InventoryScreen');
    },
    ProcessClick: function(x, y, mode) {
      console.error('NYI: ProcessClick');
    },
    SaveGameDialog: function() {
      console.error('NYI: SaveGameDialog');
    },
    RestartGame: function() {
      console.error('NYI: RestartGame()');
    },
    SaveScreenShot: function(filename) {
      console.error('NYI: SaveScreenShot()');
    },
    Debug: function(mode, data) {
      switch (mode) {
        case 0:
          console.error('NYI: give all inventory');
          break;
        case 1:
          console.error('NYI: display interpreter version');
          break;
        case 2:
          console.error('NYI: show reachable walk regions');
          break;
        case 3:
          console.error('NYI: teleport');
          break;
        case 4:
          var enable = !!data;
          console.error('NYI: show fps');
          break;
        default:
          console.warn('unknown Debug() mode: ' + mode);
          break;
      }
    },

    display: function(text) {
      text = ''+text;
      if (!/[^ ]/.test(text)) {
        return this.wait(this.getTextDisplayTicks(text), {mouseButtons:true, keys:true});
      }
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
    SetDialogOption: function(i_dialog, i_option, state) {
      console.error('NYI: SetDialogOption');
    },
    DisplayMessage: function(number) {
      var message = this.getMessage(number);
      if (!message) return;
      var promise;
      if (message.isShownAsSpeech) {
        promise = this.player.say(message.text);
      }
      else {
        promise = this.display(message.text); // TODO: auto remove after timeout
      }
      if (message.continuesToNext) {
        promise = Promise.all([promise]).then(this.DisplayMessage.bind(this, number + 1));
      }
      return promise;
    },
    RunDialog: function(number) {
      this.mainExec.onNextIdle(this.dialogScript.exports['$'+number]);
    },
    getMessage: function(number) {
      return number < 500 ? this.room.messages[number] : {text:this.game.globalMessages[number]};
    },
    Random: function(max) {
      return (Math.random() * (max + 1)) | 0;
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
    performInteractionV2: function(interaction) {
      switch (interaction.response) {
        case 'run_graphical_script':
          return this.room.graphicalScript.exports['$' + interaction.data1]();
        case 'run_dialog_topic':
          return this.RunDialog(interaction.data1);
        case 'run_script':
          return this.room.script.exports[interaction.funcName]();
        case 'go_to_screen':
          this.goToRoom(interaction.data1);
          return;
        case 'display_message':
          var number = interaction.data1;
          return this.DisplayMessage(number);
      }
    },
    playingMusic: -1,
    playMusic: function(musicTrack) {
      if (musicTrack === this.playingMusic) return;
      this.playingMusic = musicTrack;
      var fileName = this.fileSystem.getName('music' + musicTrack + '.mid');
      var self = this;
      if (fileName) {
        this.fileSystem.loadAsArrayBuffer(fileName)
        .then(function(ab) {
          smf.play(self.audioContext.destination, ab);
        });
        return;
      }
      fileName = this.fileSystem.getName('music' + musicTrack + '.xm');
      if (fileName) {
        this.fileSystem.loadAsBlob(fileName)
        .then(function(blob) {
          new xm.Module(blob).play(self.audioContext.destination);
        });
        return;
      }
    },
    redraw: function() {
      this.graphics.redraw();
      for (var i = 0; i < this.overlays.length; i++) {
        this.ctx2d.save();
        this.ctx2d.scale(this.graphics.viewportScale, this.graphics.viewportScale);
        this.overlays[i].render();
        this.ctx2d.restore();
      }
    },
    onEnteringRoom: function() {
      this.player.room = this.room.number;
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
        interactions.forEach(function(interaction) {
          if (interaction.event !== 'repeatedly_execute') return;
          var roomRepExec = this.mainExec.tryImmediateAction.bind(
            this.mainExec,
            this.performInteractionV2.bind(
              this,
              interaction));
          this.eventTarget.addEventListener('update', roomRepExec);
          this.eventTarget.addEventListener('leaving-room', function onLeavingRoom() {
            this.removeEventListener('update', roomRepExec);
            this.removeEventListener('leaving-room', onLeavingRoom);
          });
        }, this);
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
    paused: false,
    IsGamePaused: function() {
      return this.paused;
    },
    update: function(now) {
      requestAnimationFrame(this.update);
      if (now < this.nextTick) return;
      this.nextTick += this.tickMillisecs;
      if (this.nextTick < now) {
        this.nextTick = now + this.tickMillisecs;
      }
      this.eventTarget.dispatchEvent(this.paused ? updateEventNoAnim : updateEventWithAnim);
      this.redraw();
    },
    cursorMode: 0,
    GetCursorMode: function() {
      return this.cursorMode;
    },
    SetCursorMode: function(v) {
      this.cursorMode = v;
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
  
  Object.defineProperties(Runtime.prototype, {
    'mouse+0': {
      get: function() { return this.graphics.mouseX; },
    },
    'mouse+4': {
      get: function() { return this.graphics.mouseY; },
    },
  });
  
  Runtime.prototype.addEventfulGlobal('score', 0);
  Runtime.prototype.addEventfulGlobal('totalScore', 0);
  Runtime.prototype.addEventfulGlobal('title', '');
  
  function ExecutionChannel(runtime) {
    this.runtime = runtime;
    this.busyEvent = new CustomEvent('busy', {detail:{channel:this}});
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
      if (++this.busyCount > 1) {
        this.chain = this.chain.then(nextAction).then(this.decrementBusyCount);
        return;
      }
      this.runtime.eventTarget.dispatchEvent(this.busyEvent);
      var self = this;
      this.chain = new Promise(function(resolve, reject) {
        var result = nextAction();
        if (result instanceof Promise) {
          result.then(self.decrementBusyCount).then(resolve);
        }
        else {
          self.decrementBusyCount();
          resolve();
        }
      });
    },
    decrementBusyCount: function() {
      if (--this.busyCount === 0) {
        this.runtime.eventTarget.dispatchEvent(new CustomEvent('idle', {detail:{channel:this}}));
      }
    },
    onNextIdle: function(callback) {
      if (!this.isBusy) {
        this.queueAction(callback);
        return;
      }
      var self = this;
      this.runtime.eventTarget.addEventListener('idle', function on_idle(e) {
        if (e.detail.channel !== self || self.isBusy) return;
        this.removeEventListener('idle', on_idle);
        self.queueAction(callback);
        if (self.isBusy) e.stopImmediatePropagation();
      });
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
        this.runtime.ctx2d.fillStyle = this.strokeStyle;
        this.runtime.ctx2d.fillRect(this.x, this.y, this.width, this.height);
        this.runtime.ctx2d.fillStyle = this.fillStyle;
        this.runtime.ctx2d.fillRect(this.x + 1, this.y + 1, this.width - 2, this.height - 2);
      },
    },
  });
  
  function RuntimeTextOverlay(runtime, x, y, width, height, font, colorCode, alignmentX, alignmentY, text) {
    RuntimeOverlay.call(this, runtime);
    this.x = x;
    this.y = y;
    this.canvas = document.createElement('CANVAS');
    this.width = this.canvas.width = width;
    this.height = this.canvas.height = height;
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
      ctx2d.clearRect(0, 0, w, h);
      ctx2d.globalCompositeOperation = 'source-over';
      if (w === 0 || h === 0) return;
      var y = Math.floor((h - this.font.lineHeight * this.lines.length) * this.alignmentY);
      for (var i = 0; i < this.lines.length; i++) {
        var x = Math.floor((w - this.font.getTextWidth(this.lines[i])) * this.alignmentX);
        this.font.drawText(ctx2d, this.lines[i], x, y);
        y += this.font.lineHeight;
      }
      ctx2d.globalCompositeOperation = 'source-in';
      ctx2d.fillStyle = this.runtime.getColorStyle(this.colorCode);
      ctx2d.fillRect(0, 0, w, h);
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
    var self = this;
    this.loaded = Promise.all([
      this.loaded,
      window.createImageBitmap(imageData).then(function(background) {
        background.viewportScale = pic.viewportScale;
        self.background = background;
      }),
    ]).then(function(){ return self; });
    if (def.scriptCompiled_v3) {
      this.script = def.scriptCompiled_v3.instantiate(runtime);
    }
    else if (def.scriptCompiled_v2) {
      this.script = def.scriptCompiled_v2.instantiate(runtime);
    }
    if (this.def.main.graphicalScript) {
      this.graphicalScript = this.def.main.graphicalScript.instantiate(runtime);
    }
  }
  RuntimeRoom.prototype = {
    loaded: Promise.resolve(),
    get number() {
      return this.def.number;
    },
    get messages() {
      var flags = this.def.main.messageFlags;
      var list = this.def.main.messages.map(function(msg, i) {
        return Object.assign({text:msg}, flags[i]);
      });
      Object.defineProperty(this, 'messages', {value:list, enumerable:true});
      return list;
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
    var def = this.def = runtime.game.characters[n];
    var view = runtime.game.views[def.normal_view];
    var loop = view[def.loop];
    var frame = loop[def.frame];
    this.sprite = runtime.graphics.createSceneSprite(frame.spriteNumber, def.x, def.y, 0, 0, 0.5, 1.0);
    this._room = this.def.room;
    runtime.eventTarget.addEventListener('entering-room', this.updateVisible.bind(this));
  }
  RuntimeCharacter.prototype = {
    valueOf: function() {
      return this.number;
    },
    toString: function() {
      return this.def.name;
    },
    _on: true,
    updateVisible: function() {
      this.sprite.visible = (this._room === this.runtime.room.number) && this._on;
    },
    getInventoryCount: function(itemNumber) {
      // TODO
      return 0;
    },
    say: function(text, background) {
      var runtime = this.runtime;
      var font = runtime.fonts[1];
      var outlineFont = runtime.fonts[2];
      var lines = font.wrap(text, 240);
      var width = 0;
      for (var i = 0; i < lines.length; i++) {
        width = Math.max(width, font.getTextWidth(lines[i]));
      }
      var height = font.lineHeight * lines.length;
      var x = Math.min(320 - width, Math.max(0, Math.floor(this.sprite.x - runtime.graphics.viewportX - width/2)));
      var y = Math.min(200 - height, Math.max(0, this.sprite.y - runtime.graphics.viewportY - this.sprite.height - height));
      var t1 = new RuntimeTextOverlay(runtime, x, y, width, height, outlineFont, 0, 0.5, 0, text);
      var t2 = new RuntimeTextOverlay(runtime, x, y, width, height, font, this.def.speechColor, 0.5, 0, text);
      if (background) {
        runtime.wait(runtime.getTextDisplayTicks(text))
          .then(function() {
            t1.remove();
            t2.remove();
          });
        return;
      }
      return runtime.wait(runtime.getTextDisplayTicks(text), {mouseButtons:true, keys:true})
        .then(function() {
          t1.remove();
          t2.remove();
          return runtime.wait(1);
        });
    },
    get on() {
      return this._on;
    },
    set: function(v) {
      v = !!v;
      if (v === this._on) return;
      this._on = v;
      this.updateVisible();
    },
    get room() {
      return this._room;
    },
    set: function(v) {
      v = Math.floor(v);
      if (isNaN(v)) throw new TypeError('room must be a number');
      if (v === this._room) return;
      this._room = v;
      this.updateVisible();
    },
    get z() {
      return this.sprite.yOffset;
    },
    set z(z) {
      this.sprite.yOffset = z;
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
      return this._baseline === -1 ? this.sprite.y : this._baseline;
    },
  };
  
  return Runtime;

});

