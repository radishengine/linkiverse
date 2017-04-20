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
  
  function RuntimeGraphics(runtime, screenCanvas) {
    this.runtime = runtime;
    this.screen = screenCanvas;
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
    var sceneSprites = this.sceneSprites = [];
    runtime.eventTarget.addEventListener('leaving-room', function() {
      sceneSprites.splice(0, sceneSprites.length);
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
    set viewportCenterY(cy) {
      this.viewportY = cy - (this.viewportHeight/2) | 0;
    },
    redraw: function() {
      this.screenCtx.save();
      this.screenCtx.scale(this.viewportScale, this.viewportScale);
      
      /* <scene> */ {
        this.screenCtx.save();
        this.screenCtx.translate(-this.viewportX, -this.viewportY);
        /* <background> */ {
          this.screenCtx.save();
          this.screenCtx.scale(
            this._bg.viewportScale,
            this._bg.viewportScale);
          this.screenCtx.drawImage(this._bg, 0, 0);
          this.screenCtx.restore();
        } /* </background> */
        for (var i = 0; i < this.sceneSprites.length; i++) {
          this.sceneSprites[i].drawTo(this.screenCtx, this.scratchCtx, this.scratchpad);
        }
        this.screenCtx.restore();
      } /* </scene> */
      
      this.screenCtx.restore();
    },
    _mo: false,
    get mouseOver() {
      return this._mo;
    },
    set mouseOver(mo) {
      this._mo = mo;
    },
    createSceneSprite: function(number, x, y, xOffset, yOffset, xRatio, yRatio) {
      var spr = new Sprite(this, number, x, y, xOffset, yOffset, xRatio, yRatio);
      this.sceneSprites.push(spr);
      return spr;
    },
  };
  
  function Sprite(graphics, number, x, y, xOffset, yOffset, xRatio, yRatio) {
    this.graphics = graphics;
    this.number = number;
    this.x = x;
    this.y = y;
    this.xOffset = xOffset;
    this.yOffset = yOffset;
    this.xRatio = xRatio;
    this.yRatio = yRatio;
  }
  Sprite.prototype = {
    viewportScale: 2,
    _n: -1,
    get number() {
      return this._n;
    },
    set number(n) {
      this._n = n;
      var info = this.graphics.spriteStore.getInfo(n);
      this.width = info.width;
      this.height = info.height;
      this.pic = null;
      if (n >= 0) {
        var self = this;
        this.graphics.spriteStore.getPic(n).then(function(pic) {
          var canvas = self.pic = document.createElement('CANVAS');
          canvas.width = pic.width;
          canvas.height = pic.height;
          var ctx = canvas.getContext('2d');
          var imageData = ctx.createImageData(pic.width, pic.height);
          pic.setImageData(imageData, self.graphics.palette);
          ctx.putImageData(imageData, 0, 0);
        });
      }
    },
    width: 0,
    height: 0,
    get actualX() {
      return this.x - this.xOffset - (this.xRatio * this.width) | 0;
    },
    get actualY() {
      return this.y - this.yOffset - (this.yRatio * this.height) | 0;
    },
    visible: true,
    drawTo: function(ctx, scratchCtx, scratchpad) {
      if (this.visible && this.pic) {
        ctx.drawImage(this.pic, this.actualX, this.actualY);
      }
    },
  };
  
  RuntimeGraphics.Sprite = Sprite;
  
  return RuntimeGraphics;

});
