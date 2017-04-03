define(function() {

  'use strict';
  
  const EMPTY_IMAGE_SOURCE = document.createElement('CANVAS');
  
  HTMLImageElement.prototype.viewportScale = 1;
  Object.defineProperties(HTMLImageElement.prototype, {
    viewportWidth: {
      get: function() { return this.naturalWidth * this.viewportScale; },
      enumerable: true,
    },
    viewportHeight: {
      get: function() { return this.naturalHeight * this.viewportScale; },
      enumerable: true,
    },
  });
  HTMLCanvasElement.prototype.viewportScale = 1;
  Object.defineProperties(HTMLCanvasElement.prototype, {
    viewportWidth: {
      get: function() { return this.width * this.viewportScale; },
      enumerable: true,
    },
    viewportHeight: {
      get: function() { return this.height * this.viewportScale; },
      enumerable: true,
    },
  });
  if ('ImageBitmap' in window) {
    ImageBitmap.prototype.viewportScale = 1;
    Object.defineProperties(ImageBitmap.prototype, {
      viewportWidth: {
        get: function() { return this.width * this.viewportScale; },
        enumerable: true,
      },
      viewportHeight: {
        get: function() { return this.height * this.viewportScale; },
        enumerable: true,
      },
    });
  }
  
  function RuntimeGraphics(runtime) {
    this.runtime = runtime;
    this.screen = document.createElement('CANVAS');
    this.screenCtx = this.screen.getContext('2d');
    this.scratchpad = document.createElement('CANVAS');
    this.scratchCtx = this.scratchpad.getContext('2d');
    this.setViewport(640, 400, 2);
    var self = this;
    this.screen.addEventListener('mousemove', function(e) {
      self.mouseX = (e.clientX / self.viewportScale) | 0;
      self.mouseY = (e.clientY / self.viewportScale) | 0;
    });
    this.screen.addEventListener('mouseenter', function() {
      self.mouseOver = true;
    });
    this.screen.addEventListener('mouseleave', function() {
      self.mouseOver = false;
    });
  }
  RuntimeGraphics.prototype = {
    viewportScale: 1,
    _bg: EMPTY_IMAGE_SOURCE,
    _vpx:0, _vpy:0,
    get background() {
      var bg = this._bg;
      return bg === EMPTY_IMAGE_SOURCE ? null : bg;
    },
    get viewportWidth() {
      return (this.screen.width / this.viewportScale) | 0;
    },
    get viewportHeight() {
      return (this.screen.height / this.viewportScale) | 0;
    },
    get viewportX() {
      return this._vpx;
    },
    set viewportX(x) {
      this._vpx = Math.max(0, Math.min(x, 
        (this._bg.viewportWidth/this.viewportScale | 0) - this.viewportWidth));
    },
    get viewportY() {
      return this._vpy;
    },
    set viewportY(y) {
      this._vpy = Math.max(0, Math.min(y,
        (this._bg.viewportHeight/this.viewportScale | 0) - this.viewportHeight));
    },
    set background(src) {
      this._bg = src || EMPTY_IMAGE_SOURCE;
      this.viewportX = this.viewportX;
      this.viewportY = this.viewportY;
    },
    setViewport: function(width, height, scale) {
      if (isNaN(scale)) scale = 1;
      this.viewportScale = scale;
      this.screen.width = width;
      this.screen.height = height;
      this.screenCtx.imageSmoothingEnabled = false;
      this.scratchpad.width = width;
      this.scratchpad.height = height;
      this.scratchCtx.imageSmoothingEnabled = false;
    },
    get viewportCenterX() {
      return this.viewportX + (this.viewportWidth/2) | 0;
    },
    set viewportCenterX(cx) {
      this.viewportX = cx - (this.viewportWidth/2) | 0;
    },
    get viewportCenterY() {
      return this.viewportY + (this.viewportHeight/2) | 0;
    },
    set viewportCenterX(cx) {
      this.viewportY = cy - (this.viewportHeight/2) | 0;
    },
    createDrawList: function() {
      return new DrawList(this);
    },
    createSprite: function(number, x, y, handleX, handleY, handleRatioX, handleRatioY) {
      return new Sprite(this, number, x, y, handleX, handleY, handleRatioX, handleRatioY);
    },
    redraw: function() {
      this.screenCtx.save();
      this.screenCtx.translate(
        -this.viewportX * this.viewportScale,
        -this.viewportY * this.viewportScale);
      this.screenCtx.scale(
        this._bg.viewportScale,
        this._bg.viewportScale);
      this.screenCtx.drawImage(this._bg, 0, 0);
      this.screenCtx.restore();
    },
    _mo: false,
    get mouseOver() {
      return this._mo;
    },
    set mouseOver(mo) {
      this._mo = mo;
    },
  };
  
  function DrawList(graphics) {
    this.graphics = graphics;
    this.items = [];
  }
  DrawList.prototype = {
    x:0, y:0,
  };
  
  function Sprite(graphics, number, x, y, handleX, handleY, handleRatioX, handleRatioY) {
    this.graphics = graphics;
    this.number = number;
    this.x = x;
    this.y = y;
    this.handleX = handleX;
    this.handleY = handleY;
    this.handleRatioX = handleRatioX;
    this.handleRatioY = handleRatioY;
  }
  Sprite.prototype = {
    x:0, y:0, handleX:0, handleY:0, handleRatioX:0, handleRatioY:0,
  };
  
  RuntimeGraphics.Sprite = Sprite;
  RuntimeGraphics.DrawList = DrawList;
  
  return RuntimeGraphics;

});
