define(['./GameView', './RoomView'], function(GameView, RoomView) {

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
      var promise = this.fileSystem.loadAsArrayBuffer('room' + n + '.crm');
      var self = this;
      if (n === 0) {
        promise = promise.then(null, function() {
          return self.fileSystem.loadAsArrayBuffer('intro.crm');
        });
      }
      return promise.then(function(buffer) {
        return new RoomView(self.game, buffer, 0, buffer.byteLength);
      });
    },
    init: function() {
      var self = this;
      return this._init = this._init ||
        this.fileSystem.loadAsArrayBuffer('ac2game.dta')
        .then(function(buffer) {
          self.game = new GameView(buffer, 0, buffer.byteLength);
          return self.loadRoom(self.game.playerCharacter.room)
        })
        .then(function(room) {
          self.room = room;
        });
    },
    playSound: function(n) {
      var audioContext = this.audioContext;
      this.fileSystem.getAsArrayBuffer('sound' + n + '.wav')
      .then(this.audioContext.decodeAudioData.bind(this.audioContext))
      .then(function(buffer) {
        var source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start();
      });
    },
    runGraphicalScript: function(n) {
      var script = this.room.main.graphicalScripts[n];
      var self = this;
      function runBlock(n) {
        var block = script.blocks[n];
        for (var i = 0; i < block.length; i++) {
          var step = block[i];
          switch (step.action) {
            case 'play_sound':
              self.playSound(step.data1);
              break;
          }
        }
      }
      runBlock(0);
    },
    onEnteringRoom: function() {
      var interactions = this.room.main.interactions_v2 && this.room.main.interactions_v2.forRoom;
      if (interactions) {
        for (var i = 0; i < interactions.length; i++) {
          if (interactions[i].event === 'player_enters_screen') {
            switch (interactions[i].response) {
              case 'run_graphical_script':
                this.runGraphicalScript(interactions[i].data1);
                break;
            }
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
