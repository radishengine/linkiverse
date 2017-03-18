define(function() {

  'use strict';
  
  function readBlob(blob) {
    return new Promise(function(resolve, reject) {
      var fr = new FileReader();
      fr.addEventListener('load', function() {
        resolve(this.result);
      });
      fr.readAsArrayBuffer(blob);
    });
  }
  
  function SpriteStore(isCompressed, blobs) {
    this.isCompressed = isCompressed;
    this.blobs = blobs;
  }
  SpriteStore.prototype = {
    getData: function(n) {
      var blob = this.blobs[n];
      if (!blob) {
        return Promise.reject('sprite not found');
      }
      var getData = readBlob(blob);
      if (this.isCompressed) {
        var pix = blob.bytesPerPixel;
        var fullBuffer = new ArrayBuffer(blob.width * blob.height * pix);
        getData = getData.then(function(buffer) {
          var cmp = new Int8Array(buffer);
          var unc = new Uint8Array(fullBuffer);
          var unc_pos = 0;
          for (var cmp_pos = 0; cmp_pos < cmp.length;) {
            var cx = cmp[cmp_pos++];
            if (cx === -128) {
              cx = 0;
            }
            if (cx < 0) {
              cx = 1 - cx;
              var rep = new Uint8Array(buffer, cmp_pos, cmp_pos + pix);
              cmp_pos += pix;
              do {
                unc.set(rep, unc_pos);
                unc_pos += pix;
              } while (--cx);
            }
            else {
              cx++;
              unc.set(new Uint8Array(buffer, cmp_pos, cmp_pos + cx), unc_pos);
              cmp_pos += cx;
              unc_pos += cx;
            }
          }
          return fullBuffer;
        });
      }
      return getData.then(function(buffer) {
        buffer.width = blob.width;
        buffer.height = blob.height;
        buffer.bytesPerPixel = blob.bytesPerPixel;
        return buffer;
      });
    },
    getPic: function(n) {
      return this.getData(n)
      .then(function(buffer) {
        buffer.data = new Uint8Array(buffer);
        buffer.setImageData = function (imageData) {
          var w = this.width, h = this.height, data = this.data;
          var pix4 = new Int32Array(imageData.data.buffer, imageData.data.byteOffset, this.width * this.height);
          switch (this.bytesPerPixel) {
            case 1:
              var pal4 = new Int32Array(this.palette.buffer, this.palette.byteOffset, 256);
              for (var y = 0; y < this.height; y++) {
                for (var x = 0; x < this.width; x++) {
                  pix4[y*w + x] = pal4[data[y*w + x]];
                }
              }
              break;
            case 2:
              var dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
              for (var y = 0; y < this.height; y++) {
                for (var x = 0; x < this.width; x++) {
                  var rgb = dv.getUint16(2 * (y*w + x), true);
                  var b = rgb & ((1 << 5) - 1);
                  var g = (rgb >> 5) & ((1 << 6) - 1);
                  var r = rgb >> 11;
                  b = (b << 3) | (b >> 2);
                  g = (g << 2) | (g >> 4);
                  r = (r << 3) | (r >> 2);
                  imageData.data[(y*w + x) * 4] = r;
                  imageData.data[(y*w + x) * 4 + 1] = g;
                  imageData.data[(y*w + x) * 4 + 2] = b;
                }
              }
              break;
            case 3:
              for (var y = 0; y < this.height; y++) {
                for (var x = 0; x < this.width; x++) {
                  imageData.data[(y*w + x) * 4] = data[(y*w + x) * 3];
                  imageData.data[(y*w + x) * 4 + 1] = data[(y*w + x) * 3 + 1];
                  imageData.data[(y*w + x) * 4 + 2] = data[(y*w + x) * 3 + 2];
                }
              }
              break;
            case 4:
              imageData.data.set(data);
              break;
            default:
              throw new Error('unknown pixel format: ' + (this.bytesPerPixel * 8) + 'bpp');
          }
          for (var i = 3; i < imageData.data.length; i += 4) {
            imageData.data[i] = 0xff;
          }
        };
        return buffer;
      });
    },
  };
  
  function HeaderView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
    
    this.formatVersion = this.dv.getUint16(0, true);
    
    if (String.fromCharCode.apply(null, this.bytes.subarray(2, 2 + ' Sprite File '.length)) !== ' Sprite File ') {
      throw new Error('not a sprite store file');
    }
    
    this.endOffset = 2 + ' Sprite File '.length;
    
    if (this.formatVersion >= 6) {
      this.isCompressed = !!this.bytes[this.endOffset++];
      this.fileId = this.dv.getInt32(this.endOffset);
      this.endOffset += 4;
      this.palette = null;
    }
    else {
      this.isCompressed = (this.formatVersion === 5);
      this.fileId = null;
      if (this.formatVersion < 5) {
        this.palette = this.bytes.subarray(this.endOffset, this.endOffset + 256 * 3);
        this.endOffset += 256 * 3;
      }
      else {
        this.palette = null;
      }
    }
    this.lastNumber = this.dv.getInt16(this.endOffset, true);
    this.endOffset += 2;
  }
  HeaderView.maxByteLength = 2 + ' Sprite File '.length + 256 * 3 + 2;
  
  function PrefixView(compressed, buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.isCompressed = compressed;
  }
  PrefixView.prototype = {
    get isDeleted() {
      return this.bytesPerPixel === 0;
    },
    get bytesPerPixel() {
      return this.dv.getUint16(0, true);
    },
    get width() {
      return this.dv.getUint16(2, true);
    },
    get height() {
      return this.dv.getUint16(4, true);
    },
    get contentOffset() {
      if (this.isDeleted) return 2;
      if (this.isCompressed) return 10;
      return 6;
    },
    get contentLength() {
      if (this.isDeleted) return 0;
      if (this.isCompressed) return this.dv.getUint32(6, true);
      return this.width * this.height * this.bytesPerPixel;
    },
  };
  PrefixView.uncompressedByteLength = 6;
  PrefixView.compressedByteLength = 10;
  
  SpriteStore.get = function(blob) {
    var headerBlob = (blob.size > HeaderView.maxByteLength) ? blob.slice(0, HeaderView.maxByteLength) : blob;
    return readBlob(headerBlob).then(function(buffer) {
      var header = new HeaderView(buffer, 0, buffer.byteLength);
      var list = new Array(header.lastNumber + 1);
      var prefixLen = header.isCompressed ? PrefixView.compressedByteLength : PrefixView.uncompressedByteLength;
      function onPart(i, pos) {
        if (i >= list.length) {
          return new SpriteStore(header.isCompressed, list);
        }
        return readBlob(blob.slice(pos, Math.min(blob.size, pos + prefixLen)))
        .then(function(buffer) {
          var prefix = new PrefixView(buffer, 0, buffer.byteLength);
          if (!prefix.isDeleted) {
            list[i] = blob.slice(pos + prefix.contentOffset, pos + prefix.contentOffset + prefix.contentLength);
            list[i].width = prefix.width;
            list[i].height = prefix.height;
            list[i].bytesPerPixel = prefix.bytesPerPixel;
          }
          return onPart(i+1, pos + prefix.contentOffset + prefix.contentLength);
        });
      }
      return onPart(0, header.byteLength);
    });
  };
  
  return SpriteStore;

});
