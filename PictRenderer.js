
function PixOrBitMapView(buffer, byteOffset, byteLength) {
  this.dv = new DataView(buffer, byteOffset, byteLength);
}
PixOrBitMapView.prototype = {
  get rowBytes() {
    return this.dv.getUint16(4) & ~0xC000;
  },
  get isPixMap() {
    return !!(this.dv.getUint16(4) & 0x8000);
  },
  get byteLength() {
    return this.isPixMap ? 50 : 14;
  },
  get top() {
    return this.dv.getInt16(6);
  },
  get left() {
    return this.dv.getInt16(8);
  },
  get bottom() {
    return this.dv.getInt16(10);
  },
  get right() {
    return this.dv.getInt16(12);
  },
  // below this point: PixMap only
  get version() {
    return this.dv.getUint16(14);
  },
  get packType() {
    return this.dv.getUint16(16);
  },
  get packedSize() {
    return this.dv.getUint32(18);
  },
  get xResolution() {
    return Fixed.fromInt32(this.dv.getInt32(22));
  },
  get yResolution() {
    return Fixed.fromInt32(this.dv.getInt32(26));
  },
  get pixelType() {
    return this.dv.getUint16(30);
  },
  get pixelSize() {
    return this.dv.getUint16(32);
  },
  get componentCount() {
    return this.dv.getUint16(34);
  },
  get componentSize() {
    return this.dv.getUint16(36);
  },
};

function ColorTableView(buffer, byteOffset, byteLength) {
  this.dv = new DataView(buffer, byteOffset, byteLength);
}
ColorTableView.prototype = {
  get id() {
    return this.dv.getUint32(0);
  },
  get flags() {
    return this.dv.getUint16(4);
  },
  get entryCount() {
    return this.dv.getUint16(6) + 1;
  },
  get byteLength() {
    return 8 + this.entryCount * 8;
  },
  get entries() {
    var list = new Array(this.entryCount);
    for (var i = 0; i < list.length; i++) {
      list[i] = {
        value: this.dv.getUint16(8 + i * 8),
        red: this.dv.getUint16(8 + i * 8 + 2),
        green: this.dv.getUint16(8 + i * 8 + 4),
        blue: this.dv.getUint16(8 + i * 8 + 6),
      };
    }
    Object.defineProperty(this, 'entries', {value:list});
    return list;
  },
};

function PictRenderer(frame) {
  this.parts = [];
}
PictRenderer.prototype = {
  load: function(buffer, byteOffset, byteLength) {
    var dv = new DataView(buffer, byteOffset, byteLength);
    var bytes = new Uint8Array(buffer, byteOffset, byteLength);
    var size = dv.getUint16(0, false);
    if (size < 24 || size > bytes.length) {
      console.error('PICT: bad length');
      return false;
    }
    this.frame = {
      top: dv.getInt16(2, false),
      left: dv.getInt16(4, false),
      bottom: dv.getInt16(6, false),
      right: dv.getInt16(8, false),
    };
    var version, op_i, nextOp;
    if (bytes[10] === 0x11 && bytes[11] === 0x01) {
      version = 1;
      op_i = 12;
      nextOp = function nextOpV1() { return bytes[op_i++]; };
    }
    else if (dv.getUint16(10, false) === 0x0011 && bytes[12] === 2) {
      version = 2;
      op_i = 14;
      nextOp = function nextOpV2() {
        return dv.getUint16((op_i += (op_i%2) + 2) - 2, false);
      };
    }
    else {
      console.warn('PICT: unsupported version');
      return false;
    }
    function rect() {
      var rect = {
        top: dv.getInt16(op_i),
        left: dv.getInt16(op_i + 2),
        bottom: dv.getInt16(op_i + 4),
        right: dv.getInt16(op_i + 6),
      };
      op_i += 8;
      return rect;
    }
    function arc() {
      var arc = {
        top: dv.getInt16(op_i),
        left: dv.getInt16(op_i + 2),
        bottom: dv.getInt16(op_i + 4),
        right: dv.getInt16(op_i + 6),
        angle1: dv.getInt16(op_i + 8),
        angle2: dv.getInt16(op_i + 10),
      };
      op_i += 12;
      return rect;
    }
    function poly() {
      var len = dv.getUint16(op_i);
      var poly = null; // TODO
      op_i += len;
      return poly;
    }
    function region() {
      var len = dv.getUint16(op_i);
      var region = {
        top: dv.getInt16(op_i+2),
        left: dv.getInt16(op_i+2 + 2),
        bottom: dv.getInt16(op_i+2 + 4),
        right: dv.getInt16(op_i+2 + 6),
      };
      if (len > 10) {
        region.extra = bytes.subarray(op_i + 10, op_i + len);
      }
      op_i += len;
      return region;
    }
    function patternV2() {
      var patType = dv.getUint16(op_i);
      op_i += 2;
      var pattern = bytes.subarray(op_i, op_i + 8);
      op_i += 8;
      switch (patType) {
        case 0: break;
        case 1:
          throw new Error('TODO: PixMap');
        case 2:
          pattern = {
            pattern: pattern,
            red: dv.getUint16(op_i),
            green: dv.getUint16(op_i + 2),
            blue: dv.getUint16(op_i + 4),
          };
          op_i += 6;
          break;
      }
      return pattern;
    }
    var clipRegion, op;
    pictLoop: for (;;) switch (op = nextOp()) {
      case 0xFF: break pictLoop;
      case 0x00: continue; // no-op
      case 0x01:
        this.clipRegion(region());
        continue;
      case 0x02:
        this.backgroundPattern(bytes.subarray(op_i, op_i + 8));
        op_i += 8;
        continue;
      case 0x03:
        this.fontNumber(dv.getUint16(op_i, false));
        op_i += 2;
        continue;
      case 0x04:
        this.fontFace(bytes[op_i++]);
        continue;
      case 0x05:
        this.textMode(dv.getUint16(op_i, false));
        op_i += 2;
        continue;
      case 0x06:
        this.extraSpace(fixedPoint.fromInt32(dv.getInt32(op_i, false)));
        op_i += 4;
        continue;
      case 0x07:
        this.penSize(dv.getUint16(op_i + 2, false), dv.getUint16(op_i, false));
        op_i += 4;
        continue;
      case 0x08:
        this.penMode(dv.getUint16(op_i, false));
        op_i += 2;
        continue;
      case 0x09:
        this.penPattern(bytes.subarray(op_i, op_i + 8));
        op_i += 8;
        continue;
      case 0x0A:
        this.fillPattern(bytes.subarray(op_i, op_i + 8));
        op_i += 8;
        continue;
      case 0x0B:
        this.ovalSize(dv.getUint16(op_i + 2, false), dv.getUint16(op_i, false));
        op_i += 4;
        continue;
      case 0x0C:
        this.origin(dv.getUint16(op_i + 2, false), dv.getUint16(op_i, false));
        op_i += 4;
        continue;
      case 0x0D:
        this.fontSize(dv.getUint16(op_i, false));
        op_i += 2;
        continue;
      case 0x0E:
        this.foregroundColor(dv.getUint32(op_i, false));
        op_i += 4;
        continue;
      case 0x0F:
        this.backgroundColor(dv.getUint32(op_i, false));
        op_i += 4;
        continue;
      case 0x10:
        this.txRatio(
          fixedPoint.fromInt32(dv.getInt32(op_i, false)),
          fixedPoint.fromInt32(dv.getInt32(op_i + 4, false)));
        op_i += 8;
        continue;
      case 0x11:
        this.picVersion(bytes[op_i++]);
        continue;
      case 0x12:
        this.colorBackgroundPattern(patternV2());
        continue;
      case 0x13:
        this.colorPenPattern(patternV2());
        continue;
      case 0x14:
        this.colorFillPattern(patternV2());
        continue;
      case 0x15:
        this.fractionalPenPosition(dv.getUint16(op_i, false));
        op_i += 2;
        continue;
      case 0x16:
        this.characterExtra(dv.getUint16(op_i, false));
        op_i += 2;
        continue;
      case 0x17:
      case 0x18:
      case 0x19:
      case 0x3D:
      case 0x3E:
      case 0x3F:
      case 0x5D:
      case 0x5E:
      case 0x5F:
      case 0x7D:
      case 0x7E:
      case 0x7F:
      case 0x8D:
      case 0x8E:
      case 0x8F:
        // reserved, no data
        continue;
      case 0x1A:
        var red = dv.getUint16(op_i, false);
        var green = dv.getUint16(op_i + 2, false);
        var blue = dv.getUint16(op_i + 4, false);
        op_i += 6;
        this.foregroundColor(red, green, blue);
        continue;
      case 0x1B:
        var red = dv.getUint16(op_i, false);
        var green = dv.getUint16(op_i + 2, false);
        var blue = dv.getUint16(op_i + 4, false);
        op_i += 6;
        this.backgroundColor(red, green, blue);
        continue;
      case 0x1C:
        this.hiliteMode();
        continue;
      case 0x1D:
        var red = dv.getUint16(op_i, false);
        var green = dv.getUint16(op_i + 2, false);
        var blue = dv.getUint16(op_i + 4, false);
        op_i += 6;
        this.hiliteColor(red, green, blue);
        continue;
      case 0x1E:
        this.hiliteColor('default');
        continue;
      case 0x1F:
        var red = dv.getUint16(op_i, false);
        var green = dv.getUint16(op_i + 2, false);
        var blue = dv.getUint16(op_i + 4, false);
        op_i += 6;
        this.opColor(red, green, blue);
        continue;
      case 0x20:
        this.startLine(dv.getInt16(op_i + 2, false), dv.getInt16(op_i, false));
        this.lineTo(dv.getInt16(op_i + 6, false), dv.getInt16(op_i + 4, false));
        op_i += 8;
        continue;
      case 0x21:
        this.lineTo(dv.getInt16(op_i + 2, false), dv.getInt16(op_i, false));
        op_i += 4;
        continue;
      case 0x22:
        this.startLine(dv.getInt16(op_i + 2, false), dv.getInt16(op_i, false));
        this.lineTo(dv.getInt8(op_i + 5, false), dv.getInt8(op_i + 4, false));
        op_i += 6;
        continue;
      case 0x23:
        this.lineTo(dv.getInt8(op_i + 1, false), dv.getInt8(op_i, false));
        op_i += 2;
        continue;
      case 0x24:
      case 0x25:
      case 0x26:
      case 0x27:
      case 0x2C:
      case 0x2D:
      case 0x2E:
      case 0x2F:
      case 0x92:
      case 0x93:
      case 0x94:
      case 0x95:
      case 0x96:
      case 0x97:
      case 0x9A:
      case 0x9B:
      case 0x9C:
      case 0x9D:
      case 0x9E:
      case 0x9F:
        // reserved with specified data length
        var dataLen = dv.getUint16(op_i, false);
        op_i += 2 + dataLen;
        continue;
      case 0x28: // long text
        this.origin(dv.getUint16(op_i + 2, false), dv.getUint16(op_i, false));
        op_i += 4;
        this.text(macRoman(bytes, op_i+1, bytes[op_i]));
        op_i += 1 + bytes[op_i];
        continue;
      case 0x29:
        this.originOffset(dv.getInt8(op_i++), 0);
        this.text(macRoman(bytes, op_i+1, bytes[op_i]));
        op_i += 1 + bytes[op_i];
        continue;
      case 0x2A:
        this.originOffset(0, dv.getInt8(op_i++));
        this.text(macRoman(bytes, op_i+1, bytes[op_i]));
        op_i += 1 + bytes[op_i];
        continue;
      case 0x2B:
        this.originOffset(dv.getInt8(op_i), dv.getInt8(op_i + 1));
        op_i += 2;
        this.text(macRoman(bytes, op_i+1, bytes[op_i]));
        op_i += 1 + bytes[op_i];
        continue;
        
      case 0x30: this.op('rect', 'frame', this.rect = rect()); continue;
      case 0x31: this.op('rect', 'paint', this.rect = rect()); continue;
      case 0x32: this.op('rect', 'erase', this.rect = rect()); continue;
      case 0x33: this.op('rect', 'invert', this.rect = rect()); continue;
      case 0x34: this.op('rect', 'fill', this.rect = rect()); continue;
        
      case 0x35:
      case 0x36:
      case 0x37:
      case 0x4D:
      case 0x4E:
      case 0x4F:
      case 0x55:
      case 0x56:
      case 0x57:
        // reserved, 8 bytes data
        op_i += 8;
        continue;
        
      case 0x38: this.op('rect', 'frame', this.rect); continue;
      case 0x39: this.op('rect', 'paint', this.rect); continue;
      case 0x3A: this.op('rect', 'erase', this.rect); continue;
      case 0x3B: this.op('rect', 'invert', this.rect); continue;
      case 0x3C: this.op('rect', 'fill', this.rect); continue;
        
      case 0x40: this.op('rrect', 'frame', this.rrect = rect()); continue;
      case 0x41: this.op('rrect', 'paint', this.rrect = rect()); continue;
      case 0x42: this.op('rrect', 'erase', this.rrect = rect()); continue;
      case 0x43: this.op('rrect', 'invert', this.rrect = rect()); continue;
      case 0x44: this.op('rrect', 'fill', this.rrect = rect()); continue;
        
      case 0x48: this.op('rrect', 'frame', this.rrect); continue;
      case 0x49: this.op('rrect', 'paint', this.rrect); continue;
      case 0x4A: this.op('rrect', 'erase', this.rrect); continue;
      case 0x4B: this.op('rrect', 'invert', this.rrect); continue;
      case 0x4C: this.op('rrect', 'fill', this.rrect); continue;

      case 0x50: this.op('oval', 'frame', this.oval = rect()); continue;
      case 0x51: this.op('oval', 'paint', this.oval = rect()); continue;
      case 0x52: this.op('oval', 'erase', this.oval = rect()); continue;
      case 0x53: this.op('oval', 'invert', this.oval = rect()); continue;
      case 0x54: this.op('oval', 'fill', this.oval = rect()); continue;
        
      case 0x58: this.op('oval', 'frame', this.oval); continue;
      case 0x59: this.op('oval', 'paint', this.oval); continue;
      case 0x5A: this.op('oval', 'erase', this.oval); continue;
      case 0x5B: this.op('oval', 'invert', this.oval); continue;
      case 0x5C: this.op('oval', 'fill', this.oval); continue;

      case 0x60: this.op('arc', 'frame', this.arc = arc()); continue;
      case 0x61: this.op('arc', 'paint', this.arc = arc()); continue;
      case 0x62: this.op('arc', 'erase', this.arc = arc()); continue;
      case 0x63: this.op('arc', 'invert', this.arc = arc()); continue;
      case 0x64: this.op('arc', 'fill', this.arc = arc()); continue;
        
      case 0x65:
      case 0x66:
      case 0x67:
        // reserved, 12 bytes data
        op_i += 12;
        continue;
        
      case 0x68: this.op('arc', 'frame', this.arc); continue;
      case 0x69: this.op('arc', 'paint', this.arc); continue;
      case 0x6A: this.op('arc', 'erase', this.arc); continue;
      case 0x6B: this.op('arc', 'invert', this.arc); continue;
      case 0x6C: this.op('arc', 'fill', this.arc); continue;
        
      case 0x6D:
      case 0x6E:
      case 0x6F:
        // reserved, 4 bytes data
        op_i += 8;
        continue;

      case 0x70: this.op('arc', 'frame', this.poly = poly()); continue;
      case 0x71: this.op('arc', 'paint', this.poly = poly()); continue;
      case 0x72: this.op('arc', 'erase', this.poly = poly()); continue;
      case 0x73: this.op('arc', 'invert', this.poly = poly()); continue;
      case 0x74: this.op('arc', 'fill', this.poly = poly()); continue;
        
      case 0x75:
      case 0x76:
      case 0x77:
        // reserved, poly
        poly();
        continue;
        
      case 0x78: this.op('arc', 'frame', this.poly); continue;
      case 0x79: this.op('arc', 'paint', this.poly); continue;
      case 0x7A: this.op('arc', 'erase', this.poly); continue;
      case 0x7B: this.op('arc', 'invert', this.poly); continue;
      case 0x7C: this.op('arc', 'fill', this.poly); continue;

      case 0x80: this.op('region', 'frame', this.region = region()); continue;
      case 0x81: this.op('region', 'paint', this.region = region()); continue;
      case 0x82: this.op('region', 'erase', this.region = region()); continue;
      case 0x83: this.op('region', 'invert', this.region = region()); continue;
      case 0x84: this.op('region', 'fill', this.region = region()); continue;
       
      case 0x75:
      case 0x76:
      case 0x77:
        // reserved, region
        region();
        continue;
        
      case 0x88: this.op('region', 'frame', this.region); continue;
      case 0x89: this.op('region', 'paint', this.region); continue;
      case 0x8A: this.op('region', 'erase', this.region); continue;
      case 0x8B: this.op('region', 'invert', this.region); continue;
      case 0x8C: this.op('region', 'fill', this.region); continue;

      case 0x90:
        if (version === 1) {
          var rowBytes = dv.getUint16(op_i, false);
          op_i += 2;
          var bounds = rect();
          var srcRect = rect();
          var destRect = rect();
          var mode = dv.getUint16(op_i, false);
          op_i += 2;
          var height = (bounds.bottom - bounds.top);
          var rows = bytes.subarray(op_i, op_i + rowBytes * height);
          op_i += rows.length;
          this.copyBits(rowBytes, bounds, srcRect, destRect, mode, rows);
        }
        else {
          console.error('copy bits v2 not supported');
          return false;
        }
        continue;
      case 0x91:
        console.error('copy bits to clipped region not supported');
        return false;
        
      case 0x98: // copy packed bits to clipped rect
        if (version === 1) {
          var rowBytes = dv.getUint16(op_i, false);
          op_i += 2;
          var bounds = rect();
          var srcRect = rect();
          var destRect = rect();
          var mode = dv.getUint16(op_i, false);
          op_i += 2;
          var height = (bounds.bottom - bounds.top);
          var unpacked = new Uint8Array(rowBytes * height);
          if (rowBytes > 250) for (var y = 0; y < height; y++) {
            var packed = bytes.subarray(op_i + 2, op_i + 2 + dv.getUint16(op_i, false));
            unpackBits(packed, unpacked.subarray(y*rowBytes, (y+1)*rowBytes));
            op_i += 2 + packed.length;
          }
          else for (var y = 0; y < height; y++) {
            var packed = bytes.subarray(op_i + 1, op_i + 1 + bytes[op_i]);
            unpackBits(packed, unpacked.subarray(y*rowBytes, (y+1)*rowBytes));
            op_i += 1 + packed.length;
          }
          this.copyBits(rowBytes, bounds, srcRect, destRect, mode, unpacked);
        }
        else {
          var pixmap = new PixOrBitMapView(dv.buffer, dv.byteOffset + op_i);
          if (!pixmap.isPixmap) {
            console.error('expecting PixMap, got BitMap');
            return false;
          }
          op_i += pixmap.byteLength;
          var colors = new ColorTableView(dv.buffer, dv.byteOffset + op_i);
          op_i += colors.byteLength;
          var srcRect = rect();
          var destRect = rect();
          var mode = dv.getUint16(op_i);
          op_i += 2;
          var unpacked;
          var rowBytes = pixmap.rowBytes;
          if (rowBytes >= 8) {
            unpacked = new Uint8Array(rowBytes * (pixmap.bottom - pixmap.top));
            if (rowBytes > 250) for (var y = 0; y < height; y++) {
              var packed = bytes.subarray(op_i + 2, op_i + 2 + dv.getUint16(op_i, false));
              unpackBits(packed, unpacked.subarray(y*rowBytes, (y+1)*rowBytes));
              op_i += 2 + packed.length;
            }
            else for (var y = 0; y < height; y++) {
              var packed = bytes.subarray(op_i + 1, op_i + 1 + bytes[op_i]);
              unpackBits(packed, unpacked.subarray(y*rowBytes, (y+1)*rowBytes));
              op_i += 1 + packed.length;
            }
          }
          else {
            unpacked = bytes.subarray(op_i, op_i + rowBytes * (pixmap.bottom - pixmap.top));
            op_i += unpacked.length;
          }
          this.copyBits(rowBytes, bounds, srcRect, destRect, mode, unpacked);
        }
        continue;
      case 0x99:
        console.error('PICT: copy packed bits to clipped region');
        return false;
      case 0xA0:
        this.comment(dv.getUint16(op_i, false));
        op_i += 2;
        continue;
      case 0xA1: 
        var kind = dv.getUint16(op_i, false);
        var len = dv.getUint16(op_i + 2, false);
        var commentData = bytes.subarray(op_i + 4, op_i + 4 + len);
        this.comment(kind, len);
        op_i += 4 + len;
        continue;
      case 0x0C00:
        op_i += 24; // reserved header
        continue;
      default:
        console.error('PICTv' + version + ': unknown opcode 0x' + op.toString(16));
        return false;
    }
    return true;
  },
  clipRegion: function(region) {
  },
  backgroundPattern: function(patternBytes) {
  },
  fontNumber: function(fontNumber) {
  },
  fontFace: function(faceNumber) {
  },
  textMode: function(modeNumber) {
  },
  extraSpace: function(v) {
  },
  penSize: function(x, y) {
  },
  penMode: function(modeNumber) {
  },
  penPattern: function(patternBytes) {
  },
  fillPattern: function(patternBytes) {
  },
  ovalSize: function(x, y) {
    // used for RRect corners
  },
  origin: function(x, y) {
  },
  originOffset: function(dx, dy) {
  },
  text: function(text) {
  },
  fontSize: function(px) {
  },
  foregroundColor: function(rgb) {
  },
  backgroundColor: function(rgb) {
  },
  txRatio: function(numerator, denominator) {
  },
  picVersion: function(versionNumber) {
  },
  startLine: function(x, y) {
  },
  lineTo: function(x, y) {
  },
  getImageFile: function() {
    var f = this.frame;
    return Promise.all(this.parts).then(function(buf) {
      buf.splice(0, 0,
        '<svg ',
        ' xmlns="http://www.w3.org/2000/svg" ',
        ' xmlns:xlink="http://www.w3.org/1999/xlink"',
        ' width="' + (f.right - f.left) + '"',
        ' height="' + (f.bottom - f.top) + '"',
        ' viewBox="' + [f.left, f.top, f.right - f.left, f.bottom - f.top].join(' ') + '"',
        '>');
      buf.push('</svg>');
      var blob = new Blob(buf, {type:'image/svg+xml'});
      return blob;
    });
  },
  copyBits: function(rowBytes, bounds, srcRect, destRect, mode, data) {
    this.parts.push(new Promise(function(resolve, reject) {
      var fr = new FileReader;
      fr.onload = function() {
        resolve(this.result);
      };
      fr.readAsDataURL(makeImageBlob(data, rowBytes * 8, bounds.bottom - bounds.top));
    }).then(function(dataURL) {
      return '<image '
        + ' xlink:href="' + dataURL + '"'
        + ' x="' + bounds.left + '"'
        + ' y="' + bounds.top + '"'
        + ' width="' + (rowBytes * 8) + '"'
        + ' height="' + (bounds.bottom - bounds.top) + '"'
        + '/>';
    }));
  },
  comment: function(commentCode, extraData) {
  },
  op: function(shapeType, drawMode, shapeDef) {
  },
  hiliteColor: function() {
  },
};
