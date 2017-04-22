define(function() {

  'use strict';
  
  const LITTLE_ENDIAN = new Uint16Array(new Uint8Array([1, 0]).buffer)[0] === 1;
  
  function readBlob(blob) {
    return new Promise(function(resolve, reject) {
      var fr = new FileReader();
      fr.addEventListener('load', function() {
        resolve(this.result);
      });
      fr.readAsArrayBuffer(blob);
    });
  }
  
  function readBlobBuffered(blob, pos, len) {
    if (blob.buffer && blob.buffer.pos <= pos && (pos+len) <= (blob.buffer.pos + blob.buffer.length)) {
      pos -= blob.buffer.pos;
      return Promise.resolve(blob.buffer.subarray(pos, pos + len));
    }
    return new Promise(function(resolve, reject) {
      var fr = new FileReader();
      fr.addEventListener('load', function() {
        blob.buffer = new Uint8Array(this.result);
        blob.buffer.pos = pos;
        resolve(blob.buffer.subarray(0, len));
      });
      fr.readAsArrayBuffer(blob.slice(pos, Math.min(blob.size, pos + 64*1024)));
    });
  }
  
  const EMPTY_INFO = Object.freeze({width:0, height:0});
  
  function SpriteStore(isCompressed, blobs) {
    this.isCompressed = isCompressed;
    this.blobs = blobs;
  }
  SpriteStore.prototype = {
    getInfo: function(n) {
      return this.blobs[n] || EMPTY_INFO;
    },
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
        buffer.setImageData = function (imageData, palette) {
          var w = this.width, h = this.height, data = this.data;
          palette = palette || this.palette;
          var pix4 = new Int32Array(imageData.data.buffer, imageData.data.byteOffset, this.width * this.height);
          switch (this.bytesPerPixel) {
            case 1:
              var pal4 = new Int32Array(palette.buffer, palette.byteOffset, 256);
              for (var y = 0; y < this.height; y++) {
                for (var x = 0; x < this.width; x++) {
                  var pal = data[y*w + x];
                  if (pal !== 0) {
                    pix4[y*w + x] = pal4[pal];
                  }
                }
              }
              break;
            case 2:
              var dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
              for (var i = 0; i < data.byteLength/2; i++) {
                var rgb = dv.getUint16(2 * i, true);
                var b = (rgb      ) & ((1 << 5) - 1);
                var g = (rgb >>  5) & ((1 << 6) - 1);
                var r = (rgb >> 11);
                b = (b << 3) | (b >> 2);
                g = (g << 2) | (g >> 4);
                r = (r << 3) | (r >> 2);
                imageData.data[4*i    ] = r;
                imageData.data[4*i + 1] = g;
                imageData.data[4*i + 2] = b;
                imageData.data[4*i + 3] = (r !== 0xff || g !== 0 || b !== 0xff) && 0xff;
              }
              break;
            case 3:
              var leftover = data.byteLength % 12;
              var in4 = new Int32Array(data.buffer, data.byteOffset, (data.byteLength - leftover) / 4);
              if (LITTLE_ENDIAN) {
                // RR GG BB rr gg bb RR GG BB rr gg bb
                //    rrBBGGRR    GGRRbbgg    bbggrrBB
                for (var i = 0; i < in4.length; i += 3) {
                  var p1 = (in4[i  ]       )                    | 0xff000000;
                  var p2 = (in4[i  ] >>> 24) | (in4[i+1] <<  8) | 0xff000000;
                  var p3 = (in4[i+1] >>> 16) | (in4[i+2] << 16) | 0xff000000;
                  var p4 = (in4[i+2] >>>  8)                    | 0xff000000;
                  pix4[4*i    ] = p1 !== 0xffff00ff && p1;
                  pix4[4*i + 1] = p2 !== 0xffff00ff && p2;
                  pix4[4*i + 2] = p3 !== 0xffff00ff && p3;
                  pix4[4*i + 3] = p4 !== 0xffff00ff && p4;
                }
              }
              else {
                // RR GG BB rr gg bb RR GG BB rr gg bb
                // RRGGBBrr    ggbbRRGG    BBrrggbb
                for (var i = 0; i < in4.length; i += 3) {
                  var p1 = (in4[i  ]      )                     | 0xff;
                  var p2 = (in4[i  ] << 24) | (in4[i+1] >>>  8) | 0xff;
                  var p3 = (in4[i+1] << 16) | (in4[i+2] >>> 16) | 0xff;
                  var p4 = (in4[i+2] <<  8)                     | 0xff;
                  pix4[4*i    ] = p1 !== 0xff00ffff && p1;
                  pix4[4*i + 1] = p2 !== 0xff00ffff && p2;
                  pix4[4*i + 2] = p3 !== 0xff00ffff && p3;
                  pix4[4*i + 3] = p4 !== 0xff00ffff && p4;
                }
              }
              leftover /= 3;
              for (var i = 0; i < leftover; i++) {
                var r = data[in4.byteLength + i*3    ];
                var g = data[in4.byteLength + i*3 + 1];
                var b = data[in4.byteLength + i*3 + 2];
                imageData.data[(in4.length + i)*4    ] = r;
                imageData.data[(in4.length + i)*4 + 1] = g;
                imageData.data[(in4.length + i)*4 + 2] = b;
                imageData.data[(in4.length + i)*4 + 3] = (r !== 0xff && g !== 0x00 && b !== 0xff) && 0xff;
              }
              break;
            case 4:
              imageData.data.set(data);
              break;
            default:
              throw new Error('unknown pixel format: ' + (this.bytesPerPixel * 8) + 'bpp');
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
    this.byteLength = this.endOffset;
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
    return readBlobBuffered(blob, 0, HeaderView.maxByteLength).then(function(bytes) {
      var header = new HeaderView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      var list = new Array(header.lastNumber + 1);
      var prefixLen = header.isCompressed ? PrefixView.compressedByteLength : PrefixView.uncompressedByteLength;
      function onPart(i, pos) {
        if (i >= list.length) {
          return new SpriteStore(header.isCompressed, list);
        }
        return readBlobBuffered(blob, pos, prefixLen)
        .then(function(bytes) {
          var prefix = new PrefixView(header.isCompressed, bytes.buffer, bytes.byteOffset, bytes.byteLength);
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
