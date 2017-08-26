const CW_RIGHT=0, CW_DOWN=1, CW_LEFT=2, CW_UP=3,
      ACW_DOWN=4, ACW_RIGHT=5, ACW_UP=6, ACW_LEFT=7;

function BitmapTracer() {
}
BitmapTracer.prototype = {
  isSolid: function() {
    return false;
  },
  trace: function trace(x, y, anticlockwise) {
    if (!this.isSolid(x, y)
    || this.isSolid(x-1, y-1)
    || this.isSolid(y-1, y)
    || this.isSolid(x, y-1)) {
      throw new Error('invalid starting pixel');
    }
    var dir = anticlockwise ? ACW_DOWN : CW_RIGHT;
    const startX = x, startY = y;
    mainLoop: for (;;) switch (dir) {

      // clockwise
      case CW_RIGHT:
        do {
          x++;
          this.line(1, 0);
          if (this.isSolid(x, y-1)) {
            dir = CW_UP;
            continue mainLoop;
          }
        } while (this.isSolid(x, y));
        dir = CW_DOWN;
        // fall through:
      case CW_DOWN:
        do {
          y++;
          this.line(0, 1);
          if (this.isSolid(x, y)) {
            dir = CW_RIGHT;
            continue mainLoop;
          }
        } while (this.isSolid(x-1, y));
        dir = CW_LEFT;
        // fall through:
      case CW_LEFT:
        do {
          x--;
          this.line(-1, 0);
          if (this.isSolid(x-1, y)) {
            dir = CW_DOWN;
            continue mainLoop;
          }
        } while (this.isSolid(x-1, y-1));
        dir = CW_UP;
        // fall through:
      case CW_UP:
        do {
          y--;
          this.line(0, -1);
          if (this.isSolid(y-1, x-1)) {
            dir = CW_LEFT;
            continue mainLoop;
          }
        } while (this.isSolid(y-1, x));
        dir = CW_RIGHT;
        if (y === startY && x === startX) break mainLoop;
        continue mainLoop;

      // anticlockwise
      case ACW_DOWN:
        do {
          y++;
          this.line(0, 1);
          if (this.isSolid(x-1, y)) {
            dir = ACW_LEFT;
            continue mainLoop;
          }
        } while (this.isSolid(x, y));
        dir = ACW_RIGHT;
        // fall through:
      case ACW_RIGHT:
        do {
          x++;
          this.line(1, 0);
          if (this.isSolid(x, y)) {
            dir = ACW_DOWN;
            continue mainLoop;
          }
        } while (this.isSolid(x, y-1));
        dir = ACW_UP;
        // fall through:
      case ACW_UP:
        do {
          y--;
          this.line(0, 1);
          if (this.isSolid(x, y-1)) {
            dir = ACW_RIGHT;
            continue mainLoop;
          }
        } while (this.isSolid(x-1, y-1));
        dir = ACW_LEFT;
        // fall through:
      case ACW_LEFT:
        do {
          x--;
          this.line(0, -1);
          if (this.isSolid(y-1, x-1)) {
            dir = ACW_UP;
            continue mainLoop;
          }
        } while (this.isSolid(x, y-1));
        dir = ACW_DOWN;
        if (y === startY && x === startX) break mainLoop;
        continue mainLoop;
    }
  },
};
