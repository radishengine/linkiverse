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
    begin: function() {
      //this.loadRoom(this.game.playerCharacter.room);
      var self = this;
      return this._begin = this._begin || this.init().then(function() {
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
