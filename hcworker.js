
importScripts('OTFTable.js');

if (!('TextDecoder' in self)) {
  self.TextDecoder = function TextDecoder(encoding) {
    this.encoding = encoding;
    this.fileReaderSync = new FileReaderSync;
  };
  self.TextDecoder.prototype = {
    decode: function(bytes) {
      if (bytes.length < 1024 && this.encoding === 'iso-8859-1') {
        return String.fromCharCode.apply(null, bytes);
      }
      this.fileReaderSync.readAsText(new Blob([bytes]), this.encoding);
      return this.fileReaderSync.result;
    },
  };
}

var byteStringDecoder = new TextDecoder('iso-8859-1');

function download(v) {
  if (!(v instanceof Blob)) v = new Blob([v]);
  postMessage({
    headline: 'download',
    file: v,
  });
}

const BUFFER_LENGTH = 1024 * 1024 * 2;

function BlobSource(blob, useByteStrings) {
  this.blob = blob;
  this.useByteStrings = !!useByteStrings;
}
BlobSource.prototype = {
  get: function(offset, length) {
    if (!isFinite(length)) {
      length = this.blob.size - offset;
    }
    var gotBuffer = this.gotBuffer, useByteStrings = this.useByteStrings;
    if (!gotBuffer || offset > gotBuffer.start || (offset + length) > gotBuffer.end) {
      var readStart = offset;
      var readEnd = offset + length;
      var createBuffer = length <= BUFFER_LENGTH/2;
      if (createBuffer) {
        readStart = BUFFER_LENGTH * Math.floor(readStart / BUFFER_LENGTH);
        readEnd = Math.min(this.blob.size, BUFFER_LENGTH * Math.ceil(readEnd / BUFFER_LENGTH));
      }
      var self = this;
      gotBuffer = new Promise(function(resolve, reject) {
        var fr = new FileReader;
        fr.onerror = function() {
          reject('unable to read blob');
        };
        fr.onload = function() {
          var buffer = this.result;
          if (useByteStrings) buffer = {text:buffer};
          buffer.fileOffset = readStart;
          resolve(buffer);
        };
        if (useByteStrings) {
          fr.readAsText(self.blob.slice(readStart, readEnd), 'iso-8859-1');
        }
        else {
          fr.readAsArrayBuffer(self.blob.slice(readStart, readEnd));
        }
      });
      if (createBuffer) {
        gotBuffer.start = readStart;
        gotBuffer.end = readEnd;
        this.gotBuffer = gotBuffer;
      }
    }
    return gotBuffer.then(function(buffer) {
      if (useByteStrings) return buffer.text.substr(offset - buffer.fileOffset, length);
      return new Uint8Array(buffer, offset - buffer.fileOffset, length);
    });
  },
  stream: function(offset, length, callback) {
    // TODO: chunk if length is huge?
    return this.get(offset, length).then(callback);
  },
};

function OffsetSource(source, offset) {
  this.source = source;
  this.offset = offset;
}
OffsetSource.prototype = {
  get: function(offset, length) {
    return this.source.get(this.offset + offset || 0, length);
  },
  stream: function(offset, length, callback) {
    return this.source.stream(this.offset + offset || 0, length, callback);
  },
};

var chunked_proto = {
  get: function(offset, length) {
    var self = this;
    return new Promise(function(resolve, reject) {
      // finalRead() only called when length is finite
      function finalRead() {
        var i;
        for (i = 0; i < self.chunks.length; i++) {
          if (offset < self.chunks[i].length) {
            break;
          }
          offset -= self.chunks[i].length;
        }
        if (offset+length <= self.chunks[i].length) {
          if (self.useByteStrings) {
            resolve(self.chunks[i].substr(offset, length));
          }
          else {
            resolve(self.chunks[i].subarray(offset, offset+length));
          }
          return;
        }
        if (self.useByteStrings) {
          var buf = [self.chunks[i].slice(offset)];
          var bufLen = buf[0].length;
          do {
            var chunk = self.chunks[++i];
            chunk = chunk.slice(0, Math.min(chunk.length, buf.length - buf.writeOffset));
            buf.push(chunk);
            bufLen += chunk.length;
          } while (bufLen < length);
          resolve(buf.join(''));
        }
        else {
          var buf = new Uint8Array(length);
          var chunk = self.chunks[i].subarray(offset);
          buf.set(chunk);
          buf.writeOffset = chunk.length;
          do {
            chunk = self.chunks[++i];
            chunk = chunk.subarray(0, Math.min(chunk.length, buf.length - buf.writeOffset));
            buf.set(chunk, buf.writeOffset);
            buf.writeOffset += chunk.length;
          } while (buf.writeOffset < buf.length);
          resolve(buf);
        }
      }
      if (offset+length <= self.totalRead) {
        finalRead();
      }
      else self.listeners.push(function listener() {
        if (offset+length > self.totalRead) {
          if (!self.complete) return;
          if (isFinite(length)) {
            self.listeners.splice(self.listeners.indexOf(listener), 1);
            reject('not enough data');
            return;
          }
          length = self.totalRead - offset;
        }
        self.listeners.splice(self.listeners.indexOf(listener), 1);
        finalRead();
      });
    });
  },
  stream: function(offset, length, callback) {
    var self = this;
    return new Promise(function(resolve, reject) {
      var i = 0;
      function listen() {
        if (offset > 0) for (; i < self.chunks.length; i++) {
          if (offset < self.chunks[i].length) {
            break;
          }
          offset -= self.chunks[i].length;
        }
        for (; i < self.chunks.length; i++) {
          var chunk = self.chunks[i];
          if (typeof chunk === 'string') {
            chunk = chunk.substring(offset, Math.min(chunk.length, offset + length));
          }
          else {
            chunk = chunk.subarray(offset, Math.min(chunk.length, offset + length));
          }
          callback(chunk);
          if (isFinite(length)) {
            length -= chunk.length;
            if (length === 0) {
              self.listeners.splice(self.listeners.indexOf(listen), 1);
              resolve();
              return;
            }
          }
          offset = 0;
        }
        if (self.complete) {
          self.listeners.splice(self.listeners.indexOf(listen), 1);
          if (isFinite(length)) {
            reject('unexpected end of data');
          }
          else {
            resolve();
          }
        }
      }
      self.listeners.push(listen);
      listen();
    });
  },
  callListeners: function() {
    for (var i = this.listeners.length-1; i >= 0; i--) {
      this.listeners[i]();
    }
  },
};

function FetchChunkedSource(url, useByteStrings) {
  var self = this;
  useByteStrings = !!useByteStrings;
  this.useByteStrings = useByteStrings;
  this.listeners = [];
  this.chunks = [];
  this.totalRead = 0;
  this.fetched = fetch(url).then(function(req) {
    if (!req.ok) {
      self.complete = true;
      self.callListeners();
      return Promise.reject('download error');
    }
    var reader = req.body.getReader();
    function nextChunk(chunk) {
      if (chunk.done) {
        self.complete = true;
        self.callListeners();
        return;
      }
      chunk = chunk.value;
      if (useByteStrings) {
        chunk = byteStringDecoder.decode(chunk);
      }
      self.chunks.push(chunk);
      self.totalRead += chunk.length;
      self.callListeners();
      return reader.read().then(nextChunk);
    }
    return reader.read().then(nextChunk);
  });
}
FetchChunkedSource.available = (typeof self.ReadableStream === 'function' && 'getReader' in ReadableStream.prototype);
FetchChunkedSource.prototype = Object.create(chunked_proto);
    
function MozChunkedSource(url, useByteStrings) {
  this.useByteStrings = useByteStrings = !!useByteStrings;
  this.listeners = [];
  this.chunks = [];
  this.totalRead = 0;
  var self = this;
  this.fetched = new Promise(function(resolve, reject) {
    var xhr = new XMLHttpRequest;
    xhr.open('GET', url);
    if (useByteStrings) {
      xhr.overrideMimeType('text/plain; charset=iso-8859-1');
      xhr.responseType = 'moz-chunked-text';
    }
    else {
      xhr.responseType = 'moz-chunked-arraybuffer';
    }
    xhr.onprogress = function() {
      var chunk = this.response;
      if (!useByteStrings) {
        chunk = new Uint8Array(this.response);
      }
      self.chunks.push(chunk);
      self.totalRead += this.response.byteLength;
      self.callListeners();
    };
    xhr.onload = function() {
      self.complete = true;
      self.callListeners();
      resolve();
    };
    xhr.onerror = function() {
      reject('download error');
      self.complete = true;
      self.callListeners();
    };
    xhr.send();
  });
}
Object.defineProperty(MozChunkedSource, 'available', {
  enumerable: true,
  configurable: true,
  get: function() {
    var xhr = new XMLHttpRequest;
    xhr.open('GET', '/');
    xhr.responseType = 'moz-chunked-arraybuffer';
    var result = (xhr.responseType === 'moz-chunked-arraybuffer');
    Object.defineProperty(this, 'available', {
      enumerable: true,
      configurable: false,
      value: result,
    });
    return result;
  },
});
MozChunkedSource.prototype = Object.create(chunked_proto);

const HQX_LOOKUP = (function(b) {
  var chars = '!"#$%&\'()*+,-012345689@ABCDEFGHIJKLMNPQRSTUVXYZ[`abcdefhijklmpqr';
  for (var i = 0; i < chars.length; i++) {
    b[chars.charCodeAt(i)] = i;
  }
  return b;
})(new Uint8Array(256));

function HqxEncodedSource(source) {
  this.chunks = [];
  this.listeners = [];
  var phase = 'before', chunkPrefix = '';
  var self = this;
  function listener(chunk) {
    if (phase === 'after') return;
    if (typeof chunk !== 'string') {
      chunk = byteStringDecoder.decode(chunk);
    }
    if (chunkPrefix) chunk = chunkPrefix + chunk;
    if (phase === 'before') {
      var prefix = chunk.match(/(^|\r|\n)\(This file must be converted with BinHex[^\r\n]*[\r\n]+:/);
      if (!prefix) {
        chunkPrefix = chunk.slice(-64);
        return;
      }
      chunk = chunk.substr(prefix.index + prefix[0].length);
      phase = 'data';
    }
    var dataEnd = chunk.indexOf(':');
    if (dataEnd > -1) {
      chunk = chunk.slice(0, dataEnd);
      phase = 'after';
      self.complete = true;
    }
    chunk = chunk.replace(/\s+/g, '');
    chunkPrefix = chunk.slice(-chunk.length % 4);
    if (chunkPrefix) {
      chunk = chunk.slice(0, -chunkPrefix.length);
    }
    if (chunk === '') return;
    var buf = new Uint8Array((chunk.length/4) * 3);
    var buf_i = 0;
    function byte(b) {
      if (phase === 'rle') {
        phase = 'data';
        if (b === 0) {
          buf[buf_i++] = 0x90;
          return;
        }
        if (--b === 0) return;
        var copy = buf[buf_i-1];
        buf[buf_i++] = copy;
        if (--b === 0) return;
        buf[buf_i++] = copy;
        if (--b === 0) return;
        self.chunks.push(buf.subarray(0, buf_i));
        buf = buf.subarray(buf_i);
        buf_i = 0;
        var rep = new Uint8Array(b);
        if (copy !== 0) for (var i = 0; i < b; i++) {
          rep[i] = b;
        }
        self.chunks.push(rep);
      }
      else if (b === 0x90 && buf_i > 0) {
        phase = 'rle';
      }
      else {
        buf[buf_i++] = b;
      }
    }
    for (var i = 0; i < chunk.length; i += 4) {
      var c1 = HQX_LOOKUP[chunk.charCodeAt(i)];
      var c2 = HQX_LOOKUP[chunk.charCodeAt(i+1)];
      var c3 = HQX_LOOKUP[chunk.charCodeAt(i+2)];
      var c4 = HQX_LOOKUP[chunk.charCodeAt(i+3)];
      
      byte((c1 << 2) | (c2 >> 4));
      byte(((c2 << 4) | (c3 >> 2)) & 0xff);
      byte(((c3 << 6) | c4) & 0xff);
    }
    if (buf_i > 0) {
      self.chunks.push(buf.subarray(0, buf_i));
    }
    self.callListeners();
  }
  source.stream(0, Infinity, listener).then(function() {
    if (!self.complete) {
      console.error('unterminated hqx data');
      self.complete = true;
      self.callListeners();
    }
  });
}
HqxEncodedSource.prototype = Object.create(chunked_proto);

const MAC_CHARSET_128_255
  = '\xC4\xC5\xC7\xC9\xD1\xD6\xDC\xE1\xE0\xE2\xE4\xE3\xE5\xE7\xE9\xE8'
  + '\xEA\xEB\xED\xEC\xEE\xEF\xF1\xF3\xF2\xF4\xF6\xF5\xFA\xF9\xFB\xFC'
  + '\u2020\xB0\xA2\xA3\xA7\u2022\xB6\xDF\xAE\xA9\u2122\xB4\xA8\u2260\xC6\xD8'
  + '\u221E\xB1\u2264\u2265\xA5\xB5\u2202\u2211\u220F\u03C0\u222B\xAA\xBA\u03A9\xE6\xF8'
  + '\xBF\xA1\xAC\u221A\u0192\u2248\u2206\xAB\xBB\u2026\xA0\xC0\xC3\xD5\u0152\u0153'
  + '\u2013\u2014\u201C\u201D\u2018\u2019\xF7\u25CA\xFF\u0178\u2044\u20AC\u2039\u203A\uFB01\uFB02'
  + '\u2021\xB7\u201A\u201E\u2030\xC2\xCA\xC1\xCB\xC8\xCD\xCE\xCF\xCC\xD3\xD4'
  + '\uF8FF\xD2\xDA\xDB\xD9\u0131\u02C6\u02DC\xAF\u02D8\u02D9\u02DA\xB8\u02DD\u02DB\u02C7';

function macRoman(u8array, offset, length) {
  switch(arguments.length) {
    case 2: u8array = u8array.subarray(offset); break;
    case 3: u8array = u8array.subarray(offset, offset + length); break;
  }
  return byteStringDecoder.decode(u8array)
  .replace(/[\x80-\xFF]/g, function(c) {
    return MAC_CHARSET_128_255[c.charCodeAt(0) - 128];
  })
  .replace(/[\r\n\x11-\x14\uF8FF]/g, function(c) {
    switch (c) {
      case '\r': return '\n';
      case '\n': return '\r';
      case '\x11': return '\u2318'; // command
      case '\x12': return '\u21E7'; // shift
      case '\x13': return '\u2325'; // option
      case '\x14': return '\u2303'; // control
      case '\uF8FF': return String.fromCodePoint(0x1F34F); // green apple emoji
    }
  });
}

function macDate(dv, offset) {
  var offset = dv.getUint32(offset, false);
  if (offset === 0) return null;
  return new Date(new Date(1904, 0).getTime() + offset * 1000);
}

var fixedPoint = {
  fromInt32: function(i32) {
    var frac = 0;
    for (var i = 0; i < 16; i++) {
      if (i32 & (0x8000 >> i)) {
        frac += 1 / (2 << i);
      }
    }
    return (i32 >>> 16) + frac;
  },
  fromInt32_2_30: function(i32) {
    var frac = 0;
    for (var i = 0; i < 30; i++) {
      if (i32 & (0x20000000 >> i)) {
        frac += 1 / (2 << i);
      }
    }
    return (i32 >>> 30) + frac;
  },
  fromUint16: function(u16) {
    var frac = 0;
    for (var i = 0; i < 8; i++) {
      if (u16 & (0x80 >> i)) {
        frac += 1 / (2 << i);
      }
    }
    return (u16 >>> 8) + frac;
  },
};

function RectView(buffer, byteOffset, byteLength) {
  this.dataView = new DataView(buffer, byteOffset || 0, byteLength || RectView.byteLength);
}
RectView.prototype = {
  get top()    { return this.dataView.getInt16(0, false); },
  get left()   { return this.dataView.getInt16(2, false); },
  get bottom() { return this.dataView.getInt16(4, false); },
  get right()  { return this.dataView.getInt16(6, false); },
};
RectView.byteLength = 8;

const BLOCK_BYTES = 512;

function nullTerminate(str) {
  return str.replace(/\0.*/, '');
}

function extentDataRecord(dv, offset) {
  var record = [];
  for (var i = 0; i < 3; i++) {
    record.push({
      offset: dv.getUint16(offset + i*4, false),
      length: dv.getUint16(offset + i*4 + 2, false),
    });
  }
  return record;
}  

function MasterDirectoryBlockView(buffer, byteOffset, byteLength) {
  this.dv = new DataView(buffer, byteOffset, byteLength);
  this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
}
MasterDirectoryBlockView.prototype = {
  get signature() {
    return String.fromCharCode(this.bytes[0], this.bytes[1]);
  },
  get hasValidSignature() {
    return this.signature === 'BD';
  },
  get createdAt() {
    return macDate(this.dv, 2);
  },
  get lastModifiedAt() {
    return macDate(this.dv, 6);
  },
  get flags() {
    return this.dv.getUint16(10, false);
  },
  get isLockedByHardware() {
    return !!( this.flags & (1 << 7) );
  },
  get wasUnmountedSuccessfully() {
    return !!( this.flags & (1 << 8) );
  },
  get hasHadBadBlocksSpared() {
    return !!( this.flags & (1 << 9) );
  },
  get isLockedBySoftware() {
    return !!( this.flags & (1 << 15) );
  },
  get rootFileCount() {
    return this.dv.getUint16(12, false);
  },
  get bitmapBlockOffset() {
    return this.dv.getUint16(14, false); // always 3?
  },
  get nextAllocationSearch() {
    return this.dv.getUint16(16, false); // used internally
  },
  get allocationChunkCount() {
    return this.dv.getUint16(18, false);
  },
  get allocationChunkByteLength() {
    return this.dv.getUint32(20, false); // always multiple of BLOCK_BYTES
  },
  get allocationChunkBlockLength() {
    return this.allocationBlockByteLength / BLOCK_BYTES;
  },
  get defaultClumpSize() {
    return this.dv.getInt32(24, false);
  },
  get firstAllocationBlock() {
    return this.dv.getUint16(28, false);
  },
  get nextUnusedCatalogNodeId() {
    return this.dv.getInt32(30, false); // catalog node: file or folder
  },
  get unusedAllocationBlockCount() {
    return this.dv.getUint16(34, false);
  },
  get name() {
    return nullTerminate(macRoman(this.bytes, 36 + 1, this.bytes[36]));
  },
  get lastBackupAt() {
    return macDate(this.dv, 64);
  },
  get backupSequenceNumber() {
    return this.dv.getUint16(68, false); // used internally
  },
  get writeCount() {
    return this.dv.getInt32(70, false);
  },
  get overflowClumpSize() {
    return this.dv.getInt32(74, false);
  },
  get catalogClumpSize() {
    return this.dv.getInt32(78, false);
  },
  get rootFolderCount() {
    return this.dv.getUint16(82, false);
  },
  get fileCount() {
    return this.dv.getInt32(84, false);
  },
  get folderCount() {
    return this.dv.getInt32(88, false);
  },
  get finderInfo() {
    return new Int32Array(this.dv.buffer, this.dv.byteOffset + 92, 8);
  },
  get cacheBlockCount() {
    return this.dv.getUint16(124, false); // used internally
  },
  get bitmapCacheBlockCount() {
    return this.dv.getUint16(126, false); // used internally
  },
  get commonCacheBlockCount() {
    return this.dv.getUint16(128, false); // used internally
  },
  get overflowByteLength() {
    return this.dv.getInt32(130, false);
  },
  get overflowFirstExtents() {
    return extentDataRecord(this.dv, 134);
  },
  get catalogByteLength() {
    return this.dv.getInt32(146, false);
  },
  get catalogFirstExtents() {
    return extentDataRecord(this.dv, 150);
  },
};
MasterDirectoryBlockView.byteLength = 162;

const NODE_BYTES = 512;

function BTreeNodeView(buffer, byteOffset) {
  this.dv = new DataView(buffer, byteOffset, NODE_BYTES);
  this.bytes = new Uint8Array(buffer, byteOffset, NODE_BYTES);
}
BTreeNodeView.prototype = {
  get typeCode() {
    return this.bytes[8];
  },
  get type() {
    switch (this.typeCode) {
      case 0: return 'index';
      case 1: return 'header';
      case 2: return 'map';
      case 0xff: return 'leaf';
      default: return 'unknown';
    }
  },
  get rawRecords() {
    var records = new Array(this.dv.getUint16(10, false));
    for (var i = 0; i < records.length; i++) {
      records[i] = this.bytes.subarray(
        this.dv.getUint16(NODE_BYTES - 2*(i+1), false),
        this.dv.getUint16(NODE_BYTES - 2*(i+2), false));
    }
    Object.defineProperty(this, 'rawRecords', {value:records});
    return records;
  },
  get nextNodeNumber() {
    return this.dv.getInt32(0, false);
  },
  get previousNodeNumber() {
    return this.dv.getInt32(4, false);
  },
  get depth() {
    return this.bytes[9];
  },
  get records() {
    var records;
    switch (this.type) {
      case 'index':
        records = this.rawRecords
        .map(function(recordBytes) {
          return new IndexRecordView(
            recordBytes.buffer,
            recordBytes.byteOffset,
            recordBytes.byteLength);
        })
        .filter(function(indexRecord) {
          return !indexRecord.isDeleted;
        });
        break;
      case 'header':
        if (this.rawRecords.length !== 3) {
          throw new Error('B*Tree header node: expected 3 records, got ' + this.rawRecords.length);
        }
        var rawHeader = this.rawRecords[0], rawMap = this.rawRecords[2];
        records = [
          new HeaderRecordView(rawHeader.buffer, rawHeader.byteOffset, rawHeader.byteLength),
          'unused',
          new MapRecordView(rawMap.buffer, rawMap.byteOffset, rawMap.byteLength),
        ];
        break;
      case 'map':
        records = this.rawRecords
        .map(function(rawMap) {
          return new MapRecordView(rawMap.buffer, rawMap.byteOffset, rawMap.byteLength)
        });
        break;
      case 'leaf':
        records = this.rawRecords
        .map(function(rawLeaf) {
          return new LeafRecordView(rawLeaf.buffer, rawLeaf.byteOffset, rawLeaf.byteLength);
        })
        .filter(function(leaf) {
          return !leaf.isDeleted;
        });
        break;
      default: return null;
    }
    Object.defineProperty(this, 'records', {value:records});
    return records;
  },
};
function IndexRecordView(buffer, byteOffset, byteLength) {
  this.dv = new DataView(buffer, byteOffset, byteLength);
  this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
}
IndexRecordView.prototype = {
  get isDeleted() {
    return !(this.bytes.length > 0 && this.bytes[0]);
  },
  get parentFolderID() {
    return this.dv.getUint32(2, false);
  },
  get name() {
    return macRoman(this.bytes, 7, this.bytes[6]);
  },
  get nodeNumber() {
    return this.dv.getUint32(1 + this.bytes[0], false);
  },
};

function HeaderRecordView(buffer, byteOffset, byteLength) {
  this.dv = new DataView(buffer, byteOffset, byteLength);
}
HeaderRecordView.prototype = {
  get treeDepth() {
    return this.dv.getUint16(0, false);
  },
  get rootNodeNumber() {
    return this.dv.getUint32(2, false);
  },
  get leafRecordCount() {
    return this.dv.getUint32(6, false);
  },
  get firstLeaf() {
    return this.dv.getUint32(10, false);
  },
  get lastLeaf() {
    return this.dv.getUint32(14, false);
  },
  get nodeByteLength() {
    return this.dv.getUint16(18, false); // always 512?
  },
  get maxKeyByteLength() {
    return this.dv.getUint16(20, false);
  },
  get nodeCount() {
    return this.dv.getUint32(22, false);
  },
  get freeNodeCount() {
    return this.dv.getUint32(26, false);
  },
};

function MapRecordView(buffer, byteOffset, byteLength) {
  this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
};
MapRecordView.prototype = {
  getIsNodeUsed: function(index) {
    var byte = index >> 3, bit = (0x80 >> (index & 7));
    if (byte < 0 || byte >= this.bytes.length) {
      throw new RangeError('map index out of range: '+index+' (size: '+this.nodeCount+')');
    }
    return !!(this.bytes[byte] & bit);
  },
  get nodeCount() {
    return this.bytes.length * 8;
  },
};

function LeafRecordView(buffer, byteOffset, byteLength) {
  this.dv = new DataView(buffer, byteOffset, byteLength);
  this.bytes = new Uint8Array(buffer, byteOffset, byteLength);

  if (!this.isDeleted) {
    var dataOffset = 1 + this.bytes[0];
    dataOffset += dataOffset % 2;
    var dataLength = byteLength - dataOffset;
    this.dataBytes = new Uint8Array(buffer, byteOffset + dataOffset, dataLength);
  }
}
LeafRecordView.prototype = {
  get isDeleted() {
    return !(this.bytes.length > 0 && this.bytes[0]);
  },
  get overflowForkType() {
    switch (this.bytes[1]) {
      case 0x00: return 'data';
      case 0xFF: return 'resource';
      default: return 'unknown';
    }
  },
  get overflowFileID() {
    return this.dv.getUint32(2, false);
  },
  get parentFolderID() {
    return this.dv.getUint32(2, false);
  },
  get overflowStartingFileAllocationBlock() {
    return this.dv.getUint32(6, false);
  },
  get name() {
    return macRoman(this.bytes, 7, this.bytes[6]).replace(/\x7F+$/, '');
  },
  get overflowExtentDataRecord() {
    return extentDataRecord(this.dv, 1 + this.bytes[0]);
  },
  get leafType() {
    switch (this.dataBytes[0]) {
      case 1: return 'folder';
      case 2: return 'file';
      case 3: return 'folderthread';
      case 4: return 'filethread';
      default: return 'unknown';
    }
  },
  get fileInfo() {
    if (this.leafType !== 'file') return null;
    var fileInfo = new FileInfoView(
      this.dataBytes.buffer,
      this.dataBytes.byteOffset,
      this.dataBytes.byteLength);
    Object.defineProperty(this, 'fileInfo', {value:fileInfo});
    return fileInfo;
  },
  get folderInfo() {
    if (this.leafType !== 'folder') return null;
    var folderInfo = new FolderInfoView(
      this.dataBytes.buffer,
      this.dataBytes.byteOffset,
      this.dataBytes.byteLength);
    Object.defineProperty(this, 'folderInfo', {value:folderInfo});
    return folderInfo;
  },
  get threadInfo() {
    if (!/^(file|folder)thread$/.test(this.leafType)) return null;
    var threadInfo = new ThreadInfoView(
      this.dataBytes.buffer,
      this.dataBytes.byteOffset,
      this.dataBytes.byteLength);
    Object.defineProperty(this, 'threadInfo', {value:threadInfo});
    return threadInfo;
  },
};

function FileInfoView(buffer, byteOffset, byteLength) {
  this.dv = new DataView(buffer, byteOffset, byteLength);
  this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
}
FileInfoView.prototype = {
  get locked() {
    return  !!(record[2] & 0x01);
  },
  get hasThreadRecord() {
    return  !!(record[2] & 0x02);
  },
  get recordUsed() {
    return  !!(record[2] & 0x80);
  },
  get type() {
    var type = macRoman(this.bytes, 4, 4);
    return (type === '\0\0\0\0') ? null : type;
  },
  get creator() {
    var creator = macRoman(this.bytes, 8, 4);
    return (creator === '\0\0\0\0') ? null : creator;
  },
  get isOnDesk() {
    return !!(0x0001 & this.dv.getUint16(12, false));
  },
  get color() {
    return !!(0x000E & this.dv.getUint16(12, false));
  },
  get requireSwitchLaunch() {
    return !!(0x0020 & this.dv.getUint16(12, false));
  },
  get isShared() {
    return !!(0x0040 & this.dv.getUint16(12, false));
  },
  get hasNoINITs() {
    return !!(0x0080 & this.dv.getUint16(12, false));
  },
  get hasBeenInited() {
    return !!(0x0100 & this.dv.getUint16(12, false));
  },
  get hasCustomIcon() {
    return !!(0x0400 & this.dv.getUint16(12, false));
  },
  get isStationery() {
    return !!(0x0800 & this.dv.getUint16(12, false));
  },
  get isNameLocked() {
    return !!(0x1000 & this.dv.getUint16(12, false));
  },
  get hasBundle() {
    return !!(0x2000 & this.dv.getUint16(12, false));
  },
  get isInvisible() {
    return !!(0x4000 & this.dv.getUint16(12, false));
  },
  get isAlias() {
    return !!(0x8000 & this.dv.getUint16(12, false));
  },
  get id() {
    return this.dv.getUint32(20, false);
  },
  get iconPosition() {
    var position = {
      v: this.dv.getInt16(14, false),
      h: this.dv.getInt16(16, false),
    };
    return !(position.v && position.h) ? 'default' : position;
  },
  get dataForkInfo() {
    return new ForkInfoView(this.bytes.buffer, this.bytes.byteOffset + 24);
  },
  get resourceForkInfo() {
    return new ForkInfoView(this.bytes.buffer, this.bytes.byteOffset + 34);
  },
  get createdAt() {
    return macDate(this.dv, 44);
  },
  get modifiedAt() {
    return macDate(this.dv, 48);
  },
  get backupAt() {
    return macDate(this.dv, 52);
  },
  // 56: fxInfoReserved (8 bytes)
  get fxinfoFlags() {
    return this.dv.getUint16(64, false);
  },
  get putAwayFolderID() {
    return this.dv.getUint32(68, false);
  },
  get clumpSize() {
    return this.dv.getUint16(72, false);
  },
  get dataForkFirstExtentRecord() {
    return extentDataRecord(this.dv, 74);
  },
  get resourceForkFirstExtentRecord() {
    return extentDataRecord(this.dv, 86);
  },
};

function ForkInfoView(buffer, byteOffset) {
  this.dv = new DataView(buffer, byteOffset, 10);
}
ForkInfoView.prototype = {
  get firstAllocationBlock() {
    return this.dv.getUint16(0, false);
  },
  get logicalEOF() {
    return this.dv.getUint32(2, false);
  },
  get physicalEOF() {
    return this.dv.getUint32(6, false);
  },
};

function FolderInfoView(buffer, byteOffset, byteLength) {
  this.dv = new DataView(buffer, byteOffset, byteLength);
}
FolderInfoView.prototype = {
  get flags() {
    return this.dv.getUint16(2, false);
  },
  get id() {
    return this.dv.getUint32(6, false);
  },
  get modifiedAt() {
    return macDate(this.dv, 14);
  },
  get iconPosition() {
    var position = {
      v: this.dv.getInt16(32, false),
      h: this.dv.getInt16(34, false),
    };
    if (position.v === 0 && position.h === 0) {
      return 'default';
    }
    return position;
  },
  get windowRect() {
    return new RectView(this.dv.buffer, this.dv.byteOffset + 22);
  },
  get isOnDesk() {
    return !!(this.dv.getUint16(30, false) & 0x0001);
  },
  get isColor() {
    return !!(this.dv.getUint16(30, false) & 0x000E);
  },
  get requiresSwitchLaunch() {
    return !!(this.dv.getUint16(30, false) & 0x0020);
  },
  get hasCustomIcon() {
    return !!(this.dv.getUint16(30, false) & 0x0400);
  },
  get isNameLocked() {
    return !!(this.dv.getUint16(30, false) & 0x1000);
  },
  get hasBundle() {
    return !!(this.dv.getUint16(30, false) & 0x2000);
  },
  get isInvisible() {
    return !!(this.dv.getUint16(30, false) & 0x4000);
  },
  get scrollY() {
    return this.dv.getInt16(38, false);
  },
  get scrollX() {
    return this.dv.getInt16(40, false);
  },
  // dinfoReserved: dv.getInt16(36, false),
  // dxinfoReserved: dv.getInt32(42, false),
  get dxinfoFlags() {
    return this.dv.getUint16(46, false);
  },
  get dxinfoComment() {
    return this.dv.getUint16(48, false);
  },
  get fileCount() {
    return this.dv.getUint16(4, false);
  },
  get createdAt() {
    return macDate(this.dv, 10);
  },
  get backupAt() {
    return macDate(this.dv, 18);
  },
  get putAwayFolderID() {
    return this.dv.getInt32(50, false);
  },
};

function ThreadInfoView(buffer, byteOffset, byteLength) {
  this.dv = new DataView(buffer, byteOffset, byteLength);
  this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
}
ThreadInfoView.prototype = {
  get parentFolderID() {
    return this.dv.getUint32(10, false);
  },
  get parentFolderName() {
    return macRoman(this.bytes, 15, this.bytes[14]);
  },
};

function ResourceHeaderView(buffer, byteOffset, byteLength) {
  this.dv = new DataView(buffer, byteOffset, byteLength);
}
ResourceHeaderView.prototype = {
  get dataOffset() {
    return this.dv.getUint32(0, false);
  },
  get mapOffset() {
    return this.dv.getUint32(4, false);
  },
  get dataLength() {
    return this.dv.getUint32(8, false);
  },
  get mapLength() {
    return this.dv.getUint32(12, false);
  },
};
ResourceHeaderView.byteLength = 16;

function ResourceMapView(buffer, byteOffset, byteLength) {
  this.dv = new DataView(buffer, byteOffset, byteLength);
  this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
}
ResourceMapView.prototype = {
  get isReadOnly() {
    return !!(this.dv.getUint16(22, false) & 0x0080);
  },
  get typeListOffset() {
    var offset = this.dv.getUint16(24, false);
    Object.defineProperty(this, 'typeListOffset', {value:offset});
    return offset;
  },
  get nameListOffset() {
    var offset = this.dv.getUint16(26, false);
    Object.defineProperty(this, 'nameListOffset', {value:offset});
    return offset;
  },
  get typeCount() {
    var count = this.dv.getInt16(this.typeListOffset, false) + 1;
    Object.defineProperty(this, 'typeCount', {value:count});
    return count;
  },
  get typeList() {
    var list = new Array(this.typeCount);
    var buffer = this.dv.buffer;
    var byteOffset = this.dv.byteOffset + this.typeListOffset + 2;
    var byteLength = ResourceTypeListEntryView.byteLength;
    for (var i = 0; i < list.length; i++) {
      list[i] = new ResourceTypeListEntryView(buffer, byteOffset, byteLength);
      byteOffset += byteLength;
    }
    Object.defineProperty(this, 'typeList', {value:list});
    return list;
  },
  getReferenceList: function(offset, count) {
    var buffer = this.dv.buffer;
    var byteOffset = this.dv.byteOffset + this.typeListOffset + offset;
    var byteLength = ReferenceListEntryView.byteLength;
    var list = new Array(count);
    for (var i = 0; i < list.length; i++) {
      list[i] = new ReferenceListEntryView(buffer, byteOffset, byteLength);
      byteOffset += byteLength;
    }
    return list;
  },
  getName: function(offset) {
    if (offset === null) return null;
    offset += this.nameListOffset;
    return macRoman(this.bytes, offset + 1, this.bytes[offset]);
  },
  get resourceList() {
    var list = [];
    for (var i = 0; i < this.typeList.length; i++) {
      var typeName = this.typeList[i].typeName;
      var withType = this.getReferenceList(
        this.typeList[i].referenceListOffset,
        this.typeList[i].resourceCount);
      for (var j = 0; j < withType.length; j++) {
        var resourceInfo = withType[j];
        resourceInfo.type = typeName;
        resourceInfo.name = this.getName(resourceInfo.nameOffset);
        list.push(resourceInfo);
      }
    }
    Object.defineProperty(this, 'resourceList', {value:list});
    return list;
  },
};

function ResourceTypeListEntryView(buffer, byteOffset, byteLength) {
  this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  this.dv = new DataView(buffer, byteOffset, byteLength);
}
ResourceTypeListEntryView.prototype = {
  get typeName() {
    return macRoman(this.bytes, 0, 4);
  },
  get resourceCount() {
    return this.dv.getInt16(4, false) + 1;
  },
  get referenceListOffset() {
    return this.dv.getUint16(6, false);
  },
};
ResourceTypeListEntryView.byteLength = 8;

function ReferenceListEntryView(buffer, byteOffset, byteLength) {
  this.dv = new DataView(buffer, byteOffset, byteLength);
  this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
}
ReferenceListEntryView.prototype = {
  get id() {
    return this.dv.getInt16(0, false);
  },
  get nameOffset() {
    var offset = this.dv.getInt16(2, false);
    if (offset === -1) offset = null;
    return offset;
  },
  get isLoadedInSystemHeap() {
    return !!(this.bytes[4] & 0x40);
  },
  get mayBePagedOutOfMemory() {
    return !!(this.bytes[4] & 0x20);
  },
  get doNotMoveInMemory() {
    return !!(this.bytes[4] & 0x10);
  },
  get isReadOnly() {
    return !!(this.bytes[4] & 0x08);
  },
  get isPreloaded() {
    return !!(this.bytes[4] & 0x04);
  },
  get isCompressed() {
    return !!(this.bytes[4] & 0x01);
  },
  get dataOffset() {
    return this.dv.getUint32(4, false) & 0xffffff;
  },
};
ReferenceListEntryView.byteLength = 12;

function SoundHeaderView(buffer, byteOffset, byteLength) {
  this.dv = new DataView(buffer, byteOffset, byteLength);
  this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
}
SoundHeaderView.prototype = {
  get samplePos() {
    var pos = this.dv.getUint32(0, false);
    return (pos === 0) ? 'suffix' : pos;
  },
  get dataByteLength() {
    switch (this.encoding) {
      case 'standard': return this.dv.getUint32(4, false);
      case 'compressed': return Math.ceil((this.frameCount * this.bitsPerPacket)/8);
      case 'extended': return Math.ceil((this.frameCount * this.bitsPerSample * this.channelCount)/8);
      default: return NaN;
    }
  },
  get channelCount() {
    if (this.encoding === 'standard') return 1;
    return this.dv.getUint32(4, false);
  },
  get sampleRate() {
    return fixedPoint.fromInt32(this.dv.getInt32(8, false)); // NOTE: unsigned fixed point?
  },
  get loopStart() {
    return this.dv.getUint32(12, false);
  },
  get loopEnd() {
    return this.dv.getUint32(16, false);
  },
  get encoding() {
    switch (this.bytes[20]) {
      case 0: return 'standard';
      case 0xFE: return 'compressed';
      case 0xFF: return 'extended';
      default: return this.bytes[20];
    }
  },
  get baseFrequency() {
    return this.dv.getUint8(21); // unused
  },
  get byteLength() {
    return (this.encoding === 'standard') ? 22 : 64;
  },
  get frameCount() {
    return this.dv.getUint32(22, false);
  },
  // 80-bit sample rate
  get fixedCompressionMode() {
    // 'NONE', 'ACE2', 'ACE8', 'MAC3', 'MAC6'
    if (this.encoding !== 'compressed') return null;
    return String.fromCharCode.apply(null, this.bytes.subarray(36, 40));
  },
  get instrumentChunksPos() {
    if (this.encoding !== 'extended') return NaN;
    return this.dv.getUint32(40, false);
  },
  get aesRecordingPos() {
    if (this.encoding !== 'extended') return NaN;
    return this.dv.getUint32(44, false);
  },
  // unused: stateVars[4]
  // unused: leftOverBlock[4]
  get compression() {
    if (this.encoding !== 'compressed') return 'NONE';
    switch (this.dv.getInt16(56, false)) {
      case -2: return 'variable'; // unused
      case -1: return this.fixedCompressionMode;
      case 0: return 'NONE';
      case 3: return 'MAC3';
      case 6: return 'MAC6';
      default: return this.dv.getInt16(56, false);
    }
  },
  get bitsPerPacket() {
    if (this.encoding !== 'compressed') return this.bitsPerSample;
    var bits = this.dv.getUint16(58, false);
    if (bits !== 0) return bits;
    switch (this.compression) {
      case 'NONE': return this.bitsPerSample;
      case 'MAC3': return 16;
      case 'MAC6': return 8;
      default: throw new Error('unknown bits per packet value');
    }
  },
  // unused synthID[2]
  get bitsPerSample() {
    switch (this.encoding) {
      case 'compressed': return this.dv.getUint16(62, false);
      case 'extended': return this.dv.getUint16(48, false);
      default: return 8;
    }
  },
};

function disk_fromExtents(byteLength, extents, offset) {
  var i = 0;
  if (offset) for (;;) {
    var chunkLength = this.chunkSize * extents[i].length;
    if (offset < chunkLength) break;
    offset -= chunkLength;
    if (++i >= extents.length) {
      return Promise.reject('insufficient space in extents');
    }
  }
  else offset = 0;
  if ((offset + byteLength) <= this.chunkSize * extents[i].length) {
    var byteOffset = this.allocOffset + this.chunkSize * extents[0].offset + offset;
    return this.get(byteOffset, byteLength);
  }
  var disk = this;
  var buf = new Uint8Array(byteLength);
  buf.writeOffset = 0;
  function nextExtent(i, offset) {
    if (i >= extents.length) return Promise.reject('insufficient space in extents');
    var chunkOffset = disk.allocOffset + disk.chunkSize * extents[i].offset + offset;
    var chunkLength = Math.min(
      buf.length - buf.writeOffset,
      disk.chunkSize * extents[i].length - offset);
    return disk.get(chunkOffset, chunkLength).then(function(chunk) {
      buf.set(chunk, buf.writeOffset);
      if ((buf.writeOffset += chunk.length) < buf.length) {
        return nextExtent(i + 1, 0);
      }
      return buf;
    });
  }
  return nextExtent(i, offset);
}

function disk_streamExtents(byteLength, extents, callback) {
  if (byteLength <= this.chunkSize * extents[0].length) {
    var byteOffset = this.allocOffset + this.chunkSize * extents[0].offset;
    return this.stream(byteOffset, byteLength, callback);
  }
  var disk = this;
  function nextExtent(i) {
    if (i > extents.length) return Promise.reject('insufficient space in extents');
    var chunkOffset = disk.allocOffset + disk.chunkSize * extents[i].offset;
    var chunkLength = Math.min(
      byteLength,
      disk.chunkSize * extents[i].length);
    return disk.stream(chunkOffset, chunkLength, function(chunk) {
      callback(chunk);
      byteLength -= chunk.length;
    })
    .then(function() {
      if (byteLength > 0) return nextExtent(i + 1);
    });
  }
  return nextExtent(0);
}

var padBytes = new Uint8Array(3);
padBytes = [
  padBytes.subarray(0, 0),
  padBytes.subarray(0, 3),
  padBytes.subarray(0, 2),
  padBytes.subarray(0, 1),
];

function makeImageBlob(bytes, width, height) {
  var rowBytes = Math.ceil(width / 8);
  var padding = padBytes[rowBytes % 4];
  var header = new DataView(new ArrayBuffer(62));
  header.setUint16(0, ('B'.charCodeAt(0) << 8) | 'M'.charCodeAt(0), false);
  header.setUint32(2, header.byteLength + bytes.length + padding.length * height, true);
  header.setUint32(10, header.byteLength, true);
  header.setUint32(14, 40, true); // BITMAPINFOHEADER
  header.setUint32(18, width, true);
  header.setInt32(22, -height, true);
  header.setUint16(26, 1, true); // planes
  header.setUint16(28, 1, true); // bpp
  header.setUint32(54, 0xFFFFFF, true);
  if (padding.length > 0) {
    var parts = [header];
    for (var y = 0; y < height; y++) {
      parts.push(bytes.subarray(y * rowBytes, (y+1) * rowBytes), padding);
    }
    return new Blob(parts, {type:'image/bmp'});
  }
  else {
    return new Blob([header, bytes], {type:'image/bmp'});
  }
}

function makeWav(samples, samplingRate, channels, bytesPerSample) {
  samplingRate = Math.round(samplingRate);
  var dv = new DataView(new ArrayBuffer(44));
  dv.setUint32(0, 0x46464952, true); // RIFF
  dv.setUint32(4, dv.byteLength + samples.byteLength + (samples.byteLength % 2) - 8, true);
  dv.setUint32(8, 0x45564157, true); // WAVE
  dv.setUint32(12, 0x20746d66, true); // fmt
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, channels, true);
  dv.setUint32(24, samplingRate, true);
  dv.setUint32(28, samplingRate * channels * bytesPerSample, true);
  dv.setUint16(32, channels * bytesPerSample, true);
  dv.setUint16(34, bytesPerSample * 8, true);
  dv.setUint32(36, 0x61746164, true); // data
  dv.setUint32(40, samples.byteLength, true);
  var parts = [dv, samples];
  if (samples.byteLength % 2) {
    parts.push(new Uint8Array(1));
  }
  return new Blob(parts, {type:'audio/wav'});
}

const MAJOR_INDEX_DELTA = [-13, 8, 76, 222, 222, 76, 8, -13];  
const MINOR_INDEX_DELTA = [-18, 140, 140, -18];
const MAJOR_LEVEL_DELTA = [
  [  37,   116,   206,   330], [  39,   121,   216,   346], [   41,  127,   225,   361], [  42,   132,   235,   377],
  [  44,   137,   245,   392], [  46,   144,   256,   410], [   48,  150,   267,   428], [  51,   157,   280,   449],
  [  53,   165,   293,   470], [  55,   172,   306,   490], [   58,  179,   319,   511], [  60,   187,   333,   534],
  [  63,   195,   348,   557], [  66,   205,   364,   583], [   69,  214,   380,   609], [  72,   223,   396,   635],
  [  75,   233,   414,   663], [  79,   244,   433,   694], [   82,  254,   453,   725], [  86,   265,   472,   756],
  [  90,   278,   495,   792], [  94,   290,   516,   826], [   98,  303,   538,   862], [ 102,   316,   562,   901],
  [ 107,   331,   588,   942], [ 112,   345,   614,   983], [  117,  361,   641,  1027], [ 122,   377,   670,  1074],
  [ 127,   394,   701,  1123], [ 133,   411,   732,  1172], [  139,  430,   764,  1224], [ 145,   449,   799,  1280],
  [ 152,   469,   835,  1337], [ 159,   490,   872,  1397], [  166,  512,   911,  1459], [ 173,   535,   951,  1523],
  [ 181,   558,   993,  1590], [ 189,   584,  1038,  1663], [  197,  610,  1085,  1738], [ 206,   637,  1133,  1815],
  [ 215,   665,  1183,  1895], [ 225,   695,  1237,  1980], [  235,  726,  1291,  2068], [ 246,   759,  1349,  2161],
  [ 257,   792,  1409,  2257], [ 268,   828,  1472,  2357], [  280,  865,  1538,  2463], [ 293,   903,  1606,  2572],
  [ 306,   944,  1678,  2688], [ 319,   986,  1753,  2807], [  334, 1030,  1832,  2933], [ 349,  1076,  1914,  3065],
  [ 364,  1124,  1999,  3202], [ 380,  1174,  2088,  3344], [  398, 1227,  2182,  3494], [ 415,  1281,  2278,  3649],
  [ 434,  1339,  2380,  3811], [ 453,  1398,  2486,  3982], [  473, 1461,  2598,  4160], [ 495,  1526,  2714,  4346],
  [ 517,  1594,  2835,  4540], [ 540,  1665,  2961,  4741], [  564, 1740,  3093,  4953], [ 589,  1818,  3232,  5175],
  [ 615,  1898,  3375,  5405], [ 643,  1984,  3527,  5647], [  671, 2072,  3683,  5898], [ 701,  2164,  3848,  6161],
  [ 733,  2261,  4020,  6438], [ 766,  2362,  4199,  6724], [  800, 2467,  4386,  7024], [ 836,  2578,  4583,  7339],
  [ 873,  2692,  4786,  7664], [ 912,  2813,  5001,  8008], [  952, 2938,  5223,  8364], [ 995,  3070,  5457,  8739],
  [1039,  3207,  5701,  9129], [1086,  3350,  5956,  9537], [ 1134, 3499,  6220,  9960], [1185,  3655,  6497, 10404],
  [1238,  3818,  6788, 10869], [1293,  3989,  7091, 11355], [ 1351, 4166,  7407, 11861], [1411,  4352,  7738, 12390],
  [1474,  4547,  8084, 12946], [1540,  4750,  8444, 13522], [ 1609, 4962,  8821, 14126], [1680,  5183,  9215, 14756],
  [1756,  5415,  9626, 15415], [1834,  5657, 10057, 16104], [ 1916, 5909, 10505, 16822], [2001,  6173, 10975, 17574],
  [2091,  6448, 11463, 18356], [2184,  6736, 11974, 19175], [ 2282, 7037, 12510, 20032], [2383,  7351, 13068, 20926],
  [2490,  7679, 13652, 21861], [2601,  8021, 14260, 22834], [ 2717, 8380, 14897, 23854], [2838,  8753, 15561, 24918],
  [2965,  9144, 16256, 26031], [3097,  9553, 16982, 27193], [ 3236, 9979, 17740, 28407], [3380, 10424, 18532, 29675],
  [3531, 10890, 19359, 31000], [3688, 11375, 20222, 32382], [3853, 11883, 21125, 32767], [4025, 12414, 22069, 32767],
  [4205, 12967, 23053, 32767], [4392, 13546, 24082, 32767], [4589, 14151, 25157, 32767], [4793, 14783, 26280, 32767],
  [5007, 15442, 27452, 32767], [5231, 16132, 28678, 32767], [5464, 16851, 29957, 32767], [5708, 17603, 31294, 32767],
  [5963, 18389, 32691, 32767], [6229, 19210, 32767, 32767], [6507, 20067, 32767, 32767], [6797, 20963, 32767, 32767],
  [7101, 21899, 32767, 32767], [7418, 22876, 32767, 32767], [7749, 23897, 32767, 32767], [8095, 24964, 32767, 32767],
  [8456, 26078, 32767, 32767], [8833, 27242, 32767, 32767], [9228, 28457, 32767, 32767], [9639, 29727, 32767, 32767],
].map(function(row) {
  return row.concat(~row[3], ~row[2], ~row[1], ~row[0]);
});  
const MINOR_LEVEL_DELTA = [
  [   64,   216], [   67,   226], [   70,   236], [   74,   246], [   77,   257], [   80,   268], [   84,   280], [   88,   294],
  [   92,   307], [   96,   321], [  100,   334], [  104,   350], [  109,   365], [  114,   382], [  119,   399], [  124,   416],
  [  130,   434], [  136,   454], [  142,   475], [  148,   495], [  155,   519], [  162,   541], [  169,   564], [  176,   590],
  [  185,   617], [  193,   644], [  201,   673], [  210,   703], [  220,   735], [  230,   767], [  240,   801], [  251,   838],
  [  262,   876], [  274,   914], [  286,   955], [  299,   997], [  312,  1041], [  326,  1089], [  341,  1138], [  356,  1188],
  [  372,  1241], [  388,  1297], [  406,  1354], [  424,  1415], [  443,  1478], [  462,  1544], [  483,  1613], [  505,  1684],
  [  527,  1760], [  551,  1838], [  576,  1921], [  601,  2007], [  628,  2097], [  656,  2190], [  686,  2288], [  716,  2389],
  [  748,  2496], [  781,  2607], [  816,  2724], [  853,  2846], [  891,  2973], [  930,  3104], [  972,  3243], [ 1016,  3389],
  [ 1061,  3539], [ 1108,  3698], [ 1158,  3862], [ 1209,  4035], [ 1264,  4216], [ 1320,  4403], [ 1379,  4599], [ 1441,  4806],
  [ 1505,  5019], [ 1572,  5244], [ 1642,  5477], [ 1715,  5722], [ 1792,  5978], [ 1872,  6245], [ 1955,  6522], [ 2043,  6813],
  [ 2134,  7118], [ 2229,  7436], [ 2329,  7767], [ 2432,  8114], [ 2541,  8477], [ 2655,  8854], [ 2773,  9250], [ 2897,  9663],
  [ 3026, 10094], [ 3162, 10546], [ 3303, 11016], [ 3450, 11508], [ 3604, 12020], [ 3765, 12556], [ 3933, 13118], [ 4108, 13703],
  [ 4292, 14315], [ 4483, 14953], [ 4683, 15621], [ 4892, 16318], [ 5111, 17046], [ 5339, 17807], [ 5577, 18602], [ 5826, 19433],
  [ 6086, 20300], [ 6358, 21205], [ 6642, 22152], [ 6938, 23141], [ 7248, 24173], [ 7571, 25252], [ 7909, 26380], [ 8262, 27557],
  [ 8631, 28786], [ 9016, 30072], [ 9419, 31413], [ 9839, 32767], [10278, 32767], [10737, 32767], [11216, 32767], [11717, 32767],
  [12240, 32767], [12786, 32767], [13356, 32767], [13953, 32767], [14576, 32767], [15226, 32767], [15906, 32767], [16615, 32767],
].map(function(row) {
  return row.concat(~row[1], ~row[0]);
});

var mace = {};

mace.decompress3 = function maceDecompress3(input, channels) {
  var output = new Int16Array(input.length * 3);
  for (var channel_i = 0; channel_i < channels; channel_i++) {
    var inOffset = channel_i*2, outOffset = channel_i;
    var index = 0, level = 0;
    function decompressBits3(b, indexDelta, levelDelta) {
      var curr = levelDelta[(index >>> 4) & 127][b] + level;
      curr = (curr >  32767) ?  32767
           : (curr < -32768) ? -32767  // not a mistake
           : curr;
      level = curr - (curr >> 3);
      output[outOffset] = curr;
      outOffset += channels;
      index = Math.max(0, index + indexDelta[b] - (index >> 5));
    }
    while (inOffset < input.length && outOffset < output.length) {
      var b = input[inOffset];
      decompressBits3( b       & 7, MAJOR_INDEX_DELTA, MAJOR_LEVEL_DELTA);
      decompressBits3((b >> 3) & 3, MINOR_INDEX_DELTA, MINOR_LEVEL_DELTA);
      decompressBits3((b >> 5) & 7, MAJOR_INDEX_DELTA, MAJOR_LEVEL_DELTA);
      b = input[inOffset + 1];
      decompressBits3( b       & 7, MAJOR_INDEX_DELTA, MAJOR_LEVEL_DELTA);
      decompressBits3((b >> 3) & 3, MINOR_INDEX_DELTA, MINOR_LEVEL_DELTA);
      decompressBits3((b >> 5) & 7, MAJOR_INDEX_DELTA, MAJOR_LEVEL_DELTA);
      inOffset += channels * 2;
    }
  }
  return output;
};

mace.decompress6 = function maceDecompress6(input, channels) {
  var output = new Int16Array(input.length * 6);
  for (var channel_i = 0; channel_i < channels; channel_i++) {
    var inOffset = channel_i, outOffset = channel_i;
    var index=0, factor=0, prev2=0, prev1=0, level=0;
    function decompressBits6(b, indexDelta, levelDelta) {
      var curr = levelDelta[(index >>> 4) & 127][b];
      if ((prev1 ^ curr) >= 0) {
        factor += 506;
        if (factor > 32767) factor = 32767;
      }
      else {
        factor -= 314;
        if (factor < -32768) factor = -32767; // not a mistake
      }
      curr += level;
      curr = (curr > 32767) ? 32767
           : (curr < -32768) ? -32767 // not a mistake
           : curr;
      level = (curr * factor) >> 15;
      curr >>= 1;
      output[outOffset] = prev1 + prev2 - ((prev2 - curr) >> 2);
      outOffset += channels;
      output[outOffset] = prev1 + curr + ((prev2 - curr) >> 2);
      outOffset += channels;
      prev2 = prev1;
      prev1 = curr;
      index = Math.max(0, index + indexDelta[b] - (index >> 5));
    }
    while (inOffset < input.length && outOffset < output.length) {
      var b = input[inOffset];
      decompressBits6((b >> 5) & 7, MAJOR_INDEX_DELTA, MAJOR_LEVEL_DELTA);
      decompressBits6((b >> 3) & 3, MINOR_INDEX_DELTA, MINOR_LEVEL_DELTA);
      decompressBits6( b       & 7, MAJOR_INDEX_DELTA, MAJOR_LEVEL_DELTA);
      inOffset += channels;
    }
  }
  return output;
};

function unpackBits(packed, unpacked) {
  var pos = 0, outpos = 0;
  while (pos < packed.length && outpos < unpacked.length) {
    var op = packed[pos++];
    if (op < 128) {
      var length = op + 1;
      unpacked.set(packed.subarray(pos, pos + length), outpos);
      pos += length;
      outpos += length;
    }
    else if (op > 128) {
      var count = 257 - op;
      var rep = packed[pos++];
      if (rep === 0) {
        outpos += count;
      }
      else for (var i = 0; i < count; i++) {
        unpacked[outpos++] = rep;
      }
    }
  }
  return pos;
};

var resourceHandlers = {
  TEXT: function(item, path, data) {
    postMessage({
      item: item,
      path: path,
      headline: 'text',
      text: macRoman(data),
    });
  },
  ICON: function(item, path, data) {
    if (data.length < 128) {
      console.warn('ICON: insufficient data');
      return;
    }
    var color = data.length > 128 ? data.subarray(0, 128) : data;
    if (color !== data) {
      console.warn('ICON: mask ignored');
    }
    postMessage({
      item: item,
      path: path,
      headline: 'image',
      file: makeImageBlob(color, 32, 32),
      width: 32,
      height: 32,
    });
  },
  'ICN#': function(item, path, data) {
    if (data.length !== 256) {
      console.warn('ICN#: bad length');
      return;
    }
    console.warn('ICN#: mask ignored');
    postMessage({
      item: item,
      path: path,
      headline: 'image',
      file: makeImageBlob(data.subarray(0, 128), 32, 32),
      width: 32,
      height: 32,
    });
  },
  DLOG: function(item, path, bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var dataObject = {
      rectangle: {
        top: dv.getInt16(0, false),
        left: dv.getInt16(2, false),
        bottom: dv.getInt16(4, false),
        right: dv.getInt16(6, false),
      },
      type: dv.getUint16(8, false),
      visible: !!bytes[10],
      closeBox: !!bytes[12],
      referenceConstant: dv.getInt32(14, false),
      itemListResourceID: dv.getInt16(18, false),
    };
    switch(dataObject.type) {
      case 0: dataObject.type = 'modal'; break;
      case 4: dataObject.type = 'modeless'; break;
      case 5: dataObject.type = 'movableModal'; break;
    }
    dataObject.text = macRoman(bytes, 21, bytes[20]);
    var pos = 20 + 1 + dataObject.text.length + (1 + dataObject.text.length) % 2;
    if (pos + 2 <= bytes.length) {
      dataObject.positionCode = dv.getUint16(pos, false);
    }
    if (dataObject.text) {
      postMessage({
        item: item,
        path: path,
        headline: 'text',
        type: 'dialog',
        text: dataObject.text,
      });
    }
  },
  DITL: function(item, path, bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var len = dv.getInt16(0, false) + 1;
    if (len < 0) {
      console.warn('DITL resource has invalid length');
      return;
    }
    var dataObject = new Array(len);
    var pos = 2;
    for (var i = 0; i < dataObject.length; i++) {
      var itemType = bytes[pos + 12];
      var itemEnabled = !!(itemType & 0x80);
      itemType = {
        0: 'user',
        1: 'help',
        4: 'button',
        5: 'checkbox',
        6: 'radiobutton',
        7: 'control',
        8: 'statictext',
        16: 'editabletext',
        32: 'icon',
        64: 'picture',        
      }[itemType & 0x7f];
      if (!itemType) {
        console.warn('unknown item type: ' + (bytes[pos + 12] & 0x7f));
        return;
      }
      if (itemType === 'help') {
        var helpItemType;
        switch(helpItemType = dv.getUint16(pos + 14, false)) {
          case 1: helpItemType = 'HMScanhdlg'; break;
          case 2: helpItemType = 'HMScanhrct'; break;
          case 8: helpItemType = 'HMScanAppendhdlg'; break;
          default:
            console.warn('unknown help item type: ' + helpItemType);
            return;
        }
        dataObject[i] = {
          type: helpItemType,
          resourceID: dv.getUint16(pos + 16, false),
        };
        if (helpItemType === 'HMScanAppendhdlg') {
          dataObject[i].itemNumber = dv.getUint16(pos + 18, false);
        }
        pos += 13 + bytes[13];
        continue;
      }
      dataObject[i] = {
        type: itemType,
        rectangle: {
          top: dv.getInt16(pos + 4, false),
          left: dv.getInt16(pos + 6, false),
          bottom: dv.getInt16(pos + 8, false),
          right: dv.getInt16(pos + 10, false),
        },
      };
      switch(itemType) {
        case 'user': pos += 14; break;
        case 'control': case 'icon': case 'picture':
          dataObject[i].resourceID = dv.getUint16(pos + 14, false);
          pos += 16;
          break;
        case 'button': case 'checkbox': case 'radiobutton': case 'statictext': case 'editabletext':
          var text = macRoman(bytes, pos + 14, bytes[pos + 13]);
          dataObject[i].text = text;
          pos += 13 + 1 + text.length + (text.length % 2);
          if (dataObject[i].text) {
            postMessage({
              item: item,
              path: path,
              headline: 'text',
              text: dataObject[i].text,
            });
          }
          break;
        default:
          console.warn('unsupported item type: ' + itemType);
          return;
      }
    }    
  },
  WIND: function(item, path, bytes) {
    var dataDV = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var dataObject = {
      initialRectangle: {
        top: dataDV.getInt16(0, false),
        left: dataDV.getInt16(2, false),
        bottom: dataDV.getInt16(4, false),
        right: dataDV.getInt16(6, false),
      },
      definitionID: dataDV.getInt16(8, false),
      visible: dataDV.getInt16(10, false),
      closeBox: dataDV.getInt16(12, false),
      referenceConstant: dataDV.getInt32(14, false),
    };
    dataObject.title = macRoman(bytes, 19, bytes[18]);
    var pos = 19 + bytes[18];
    if (pos+2 <= bytes.length) {
      dataObject.positioning = dataDV.getInt16(pos);
    }
    if (dataObject.title) {
      postMessage({
        item: item,
        path: path,
        headline: 'text',
        text: dataObject.title,
      });
    }
  },
  MENU: function(item, path, bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var dataObject = {
      id: dv.getUint16(0, false),
      definitionProcedureResourceID: dv.getUint16(6, false),
      enabledState: dv.getUint32(10, false),
      title: macRoman(bytes, 15, bytes[14]),
    };
    if (dataObject.title) {
      postMessage({
        item: item,
        path: path,
        headline: 'text',
        text: dataObject.title,
      });
    }
    var pos = 15 + bytes[14];
    if (dataObject.definitionProcedureResourceID === 0) {
      delete dataObject.definitionProcedureResourceID;
      dataObject.items = [];
      while (pos < bytes.length && bytes[pos] !== 0) {
        var text = macRoman(bytes, pos + 1, bytes[pos]);
        pos += 1 + text.length;
        var menuItem = {
          text: text,
          iconNumberOrScriptCode: bytes[pos],
          keyboardEquivalent: bytes[pos + 1],
          markingCharacterOrSubmenuID: bytes[pos + 2],
          style: bytes[pos + 3],
        };
        if (menuItem.text) {
          postMessage({
            item: item,
            path: path,
            headline: 'text',
            text: menuItem.text,
          });
        }
        dataObject.items.push(menuItem);
        pos += 4;
      }
    }
    else {
      dataObject.itemData = bytes.subarray(pos);
    }
  },
  PICT: function(item, path, bytes) {
    if (!('PictRenderer' in self)) {
      importScripts('PictRenderer.js');
    }
    var renderer = new PictRenderer;
    if (renderer.load(bytes.buffer, bytes.byteOffset, bytes.byteLength)) {
      renderer.getImageFile().then(function(blob) {
        postMessage({
          item: item,
          path: path,
          headline: 'image',
          file: blob,
          width: renderer.frame.right - renderer.frame.left,
          height: renderer.frame.bottom - renderer.frame.top,
        });
      });
    }
  },
  CURS: function(item, path, bytes) {
    var hasMask;
    switch (bytes.length) {
      case 68: hasMask = true; break;
      case 37: hasMask = false; break;
      default:
        console.warn('unexpected length for CURS resource: ' + bytes.length);
        return;
    }
    var hotspot = new DataView(bytes.buffer, bytes.byteOffset + (hasMask ? 64 : 32), 4);
    hotspot = {x:hotspot.getInt16(2), y:hotspot.getInt16(0)};
    if (hasMask) {
      console.warn('TODO: CURS mask');
    }
    var pixels = bytes.subarray(0, 32);
    postMessage({
      item: item,
      path: path,
      headline: 'image',
      file: makeImageBlob(pixels, 16, 16),
      width: 16,
      height: 16,
    });
  },
  'ics#': function(item, path, bytes) {
    var hasMask;
    if (bytes.length !== 64) {
      console.warn('unexpected length for ics# resource: ' + bytes.length);
      return;
    }
    console.warn('TODO: ics# mask');
    var pixels = bytes.subarray(0, 32);
    postMessage({
      item: item,
      path: path,
      headline: 'image',
      file: makeImageBlob(pixels, 16, 16),
      width: 16,
      height: 16,
    });
  },
  'snd ': function(item, path, bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var formatNumber = dv.getUint16(0, false);
    var offset;
    switch (formatNumber) {
      case 1:
        var numOfDataFormats = dv.getUint16(2, false);
        if (numOfDataFormats !== 1) {
          console.warn('expecting 1 snd data format, got ' + numOfDataFormats);
          return;
        }
        var firstDataFormatID = dv.getUint16(4, false);
        if (firstDataFormatID !== 5) {
          console.warn('expected snd data format 5, got ' + firstDataFormatID);
          return;
        }
        var init = dv.getUint32(6, false);
        init = {
          output: ({
            0:'default', 1:'unknown', 2:'left', 3:'right',
            4:'wave0', 5:'wave1', 6:'wave2', 7:'wave3',
          })[init & 7],
          mono: (init & 0xC0) === 0x80,
          stereo: (init & 0xC0) === 0xC0,
          compression: ({3:'MACE3', 4:'MACE4', 0:false})[init >>> 4] || 'unknown',
          noLinearInterpolation: !!(init & 4),
          noDropSampleConversion: !!(init & 8),
        };
        offset = 10;
        break;
      case 2:
        offset = 4;
        break;
      default:
        console.warn('unknown "snd " format version: ' + formatNumber);
        return;
    }
    var commandCount = dv.getUint16(offset, false);
    offset += 2;
    while (commandCount > 1 && dv.getUint16(offset, false) === 0) {
      offset += 8;
      commandCount--;
    }
    if (commandCount !== 1) {
      console.warn('audio data must have 1 sound command');
      return;
    }
    var command = dv.getUint16(offset, false);
    offset += 2;
    if (command !== 0x8051 && command !== 0x8050) {
      console.warn('audio command must be bufferCmd or soundCmd');
      return;
    }
    if (dv.getUint16(offset, false) !== 0) {
      console.warn('bufferCmd parameter must be 0');
      return;
    }
    offset += 2;
    var soundHeaderOffset = dv.getUint32(offset, false);
    offset += 4;
    var header = new SoundHeaderView(dv.buffer, dv.byteOffset + soundHeaderOffset);
    if (header.samplePos > bytes.length && soundHeaderOffset > offset) {
      soundHeaderOffset = offset;
      header = new SoundHeaderView(dv.buffer, dv.byteOffset + soundHeaderOffset);
      if (header.samplePos > bytes.length) {
        console.error('snd: not enough data');
        return;
      }
    }
    var dataOffset = header.samplePos;
    if (dataOffset === 'suffix') dataOffset = soundHeaderOffset + header.byteLength;
    var dataLength = header.dataByteLength;
    if (dataOffset+dataLength > bytes.length) {
      console.warn('snd: not enough data');
      return;
    }
    var data = bytes.subarray(dataOffset, dataOffset + dataLength);
    switch (header.compression) {
      case 'NONE': break;
      case 'MAC3':
        var uncompressed = mace.decompress3(data, header.channelCount);
        if (header.bitsPerSample === 8) {
          data = new Uint8Array(uncompressed.length);
          for (var i = 0; i < data.length; i++) {
            data[i] = (uncompressed[i] + 32768) >>> 8;
          }
        }
        else {
          console.warn('snd: unsupported bits per sample value');
          return;
        }
        break;
      default:
        console.warn('snd: unsupported compression ' + header.compression);
        return;
    }
    postMessage({
      item: item,
      path: path,
      headline: 'file',
      file: makeWav(
        data,
        header.sampleRate,
        header.channelCount,
        header.bitsPerSample/8
      ),
    });
  },
  ASND: function(item, path, bytes) {
    var deltas = new Int8Array(bytes.buffer, bytes.byteOffset + 4, 16);
    bytes = bytes.subarray(20);
    var samples = new Uint8Array(2 * bytes.length);
    var value = -128;
    for (var i = 0; i < bytes.length; i++) {
      value += deltas[bytes[i] & 0xf];
      value = value << 24 >> 24;
      samples[i*2] = value & 0xff;
      value += deltas[(bytes[i] >> 4) & 0xf];
      value = value << 24 >> 24;
      samples[i*2 + 1] = value & 0xff;
    }
    postMessage({
      item: item,
      path: path,
      headline: 'file',
      file: makeWav(samples, 11000, 1, 1),
    });
  },
  'STR ': function(item, path, bytes) {
    postMessage({
      item: item,
      path: path,
      headline: 'text',
      text: macRoman(bytes, 1, bytes[0]),
    });
  },
  'STR#': function(item, path, bytes) {
    var strcount = new DataView(bytes.buffer, bytes.byteOffset, 2).getInt16(0, false);
    if (strcount < 0) {
      return Promise.reject('invalid string count for STR#');
    }
    var pos = 2;
    for (var istr = 0; istr < strcount; istr++) {
      var len = bytes[pos++];
      postMessage({
        item: item,
        path: path,
        headline: 'text',
        text: macRoman(bytes, pos, len),
      });
      pos += len;
    }
  },
  ASCN: function(item, path, bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var design = bytes.subarray(2, dv.getUint16(0, false));
    var pos = 2 + design.byteLength;
    var obj = {
      top: dv.getInt16(pos, false),
      left: dv.getInt16(pos + 2, false),
      bottom: dv.getInt16(pos + 4, false),
      right: dv.getInt16(pos + 6, false),
      worldY: dv.getInt16(pos + 8, false),
      worldX: dv.getInt16(pos + 10, false),
      northBlocked: !!bytes[pos + 12],
      southBlocked: !!bytes[pos + 13],
      eastBlocked: !!bytes[pos + 14],
      westBlocked: !!bytes[pos + 15],
      soundFrequency: dv.getInt16(pos + 16, false),
      soundType: bytes[pos + 18],
    };
    pos += 20;
    obj.northMessage = macRoman(bytes, pos+1, bytes[pos]);
    pos += 1 + obj.northMessage.length;
    obj.southMessage = macRoman(bytes, pos+1, bytes[pos]);
    pos += 1 + obj.southMessage.length;
    obj.eastMessage = macRoman(bytes, pos+1, bytes[pos]);
    pos += 1 + obj.eastMessage.length;
    obj.westMessage = macRoman(bytes, pos+1, bytes[pos]);
    pos += 1 + obj.westMessage.length;
    obj.soundName = macRoman(bytes, pos+1, bytes[pos]);
    if (obj.northMessage) postMessage({
      item: item,
      path: path,
      headline: 'text',
      text: obj.northMessage,
    });
    if (obj.southMessage) postMessage({
      item: item,
      path: path,
      headline: 'text',
      text: obj.southMessage,
    });
    if (obj.eastMessage) postMessage({
      item: item,
      path: path,
      headline: 'text',
      text: obj.eastMessage,
    });
    if (obj.westMessage) postMessage({
      item: item,
      path: path,
      headline: 'text',
      text: obj.westMessage,
    });
    if (design.length === 0) return;
    var i = 0;
    var dv = new DataView(design.buffer, design.byteOffset, design.byteLength);
    var imgX=0, imgY=0, imgWidth=512, imgHeight=342; // full screen: should it be the rect in the data above?
    var parts = [];
    parts.push([
      '<svg',
      'xmlns="http://www.w3.org/2000/svg"',
      'xmlns:xlink="http://www.w3.org/1999/xlink"',
      'width="' + imgWidth + '"',
      'height="' + imgHeight + '"',
      'viewBox="' + [imgX, imgY, imgWidth, imgHeight].join(' ') + '"',
      'shape-rendering="crispEdges"',
      'stroke-linecap="square"',
      '>',
    ].join(' '));
    while (i < design.length) {
      var fillType = design[i++];
      var borderThickness = design[i++];
      var borderFillType = design[i++];
      var type = design[i++];
      var fill, stroke, strokeWidth;
      if (fillType === 0) {
        fill = 'none';
      }
      else {
        fill = '#888'; // TODO: get pattern #(fillType-1)
      }
      if (borderThickness === 0 || borderFillType === 0) {
        stroke = 'none';
      }
      else {
        stroke = '#444'; // TODO: get pattern #(borderFillType-1)
      }
      switch (type) {
        case 4: // rect
          var top = dv.getInt16(i);
          var left = dv.getInt16(i + 2);
          var bottom = dv.getInt16(i + 4);
          var right = dv.getInt16(i + 6);
          i += 8;
          parts.push([
            '<rect',
            'x="'+left+'"',
            'y="'+top+'"',
            'width="'+(right-left)+'"',
            'height="'+(bottom-top)+'"',
            'fill="' + fill + '"',
            'stroke="' + stroke + '"',
            'stroke-width="' + borderThickness + '"',
            '/>',
          ].join(' '));
          break;
        case 8: // round rect
          var top = dv.getInt16(i);
          var left = dv.getInt16(i + 2);
          var bottom = dv.getInt16(i + 4);
          var right = dv.getInt16(i + 6);
          var arc = dv.getInt16(i + 8);
          i += 10;
          parts.push([
            '<rect',
            'x="'+left+'"',
            'y="'+top+'"',
            'width="'+(right-left)+'"',
            'height="'+(bottom-top)+'"',
            'rx="12"',
            'ry="12"',
            'fill="' + fill + '"',
            'stroke="' + stroke + '"',
            'stroke-width="' + borderThickness + '"',
            '/>',
          ].join(' '));
          break;
        case 12: // oval
          var top = dv.getInt16(i);
          var left = dv.getInt16(i + 2);
          var bottom = dv.getInt16(i + 4);
          var right = dv.getInt16(i + 6);
          i += 8;
          parts.push([
            '<ellipse',
            'cx="' + (left+right)/2 + '"',
            'cy="' + (top+bottom)/2 + '"',
            'rx="' + (right-left)/2 + '"',
            'ry="' + (bottom-top)/2 + '"',
            'fill="' + fill + '"',
            'stroke="' + stroke + '"',
            'stroke-width="' + borderThickness + '"',
            '/>',
          ].join(' '));
          break;
        case 16: // polygon
        case 20:
          var numBytes = dv.getUint16(i + 2);
          i += 2 + numBytes;
          var coords = new DataView(dv.buffer, dv.byteOffset + i + 4, numBytes - 10);
          var y = coords.getInt16(2), x = coords.getInt16(0);
          var path = ['M' + x + ',' + y];
          var j = 4;
          while (j < coords.byteLength) {
            var yb = coords.getUint8(j);
            if (yb === 0x80) {
              y = coords.getInt16(j+1);
              j += 3;
            }
            else {
              y += yb;
              j++;
            }
            var xb = coords.getUint8(j);
            if (xb === 0x80) {
              x = coords.getInt16(j+1);
              j += 3;
            }
            else {
              x += xb;
              j++;
            }
            path.push('L' + x + ',' + y);
          }
          parts.push([
            '<path',
            'd="' + path.join(' ') + '"',
            'fill="' + fill + '"',
            'stroke="' + stroke + '"',
            'stroke-width="' + borderThickness + '"',
            'stroke-linejoin="bevel"',
            '/>',
          ].join(' '));
          break;
        case 24:
          var imgDV = new DataView(dv.buffer, dv.byteOffset + i + 2, dv.getUint16(i) - 2);
          i += 2 + imgDV.byteLength;
          var top = imgDV.getInt16(0);
          var left = imgDV.getInt16(2);
          var bottom = imgDV.getInt16(4);
          var right = imgDV.getInt16(6);
          var width = right-left;
          var height = bottom-top;
          var rowBytes = Math.ceil(width/8);
          var packed = new Uint8Array(imgDV.buffer, imgDV.byteOffset + 8, imgDV.byteLength - 8);
          var unpacked = new Uint8Array(rowBytes * height);
          unpackBits(packed, unpacked);
          parts.push(
            '<image x="' + left + '" y="' + top + '" xlink:href="',
            new Promise(function(resolve, reject) {
              var fr = new FileReader;
              fr.onload = function() {
                resolve(this.result);
              };
              fr.readAsDataURL(makeImageBlob(unpacked, rowBytes*8, height));
            }),
            '"/>');
          break;
        default:
          console.error('ASCN: unknown drawing code ' + type);
          return;
      }
    }
    parts.push('</svg>');
    return Promise.all(parts).then(function(parts) {
      postMessage({
        item: item,
        path: path,
        headline: 'image',
        file: new Blob(parts, {type:'image/svg+xml'}),
        width: imgWidth,
        height: imgHeight,
      });
    });
  },
  ATXT: function(item, path, bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var top = dv.getInt16(0, false);
    var left = dv.getInt16(2, false);
    var bottom = dv.getInt16(4, false);
    var right = dv.getInt16(6, false);
    var fontType = dv.getUint16(8, false);
    var fontSize = dv.getUint16(10, false);
    var text = macRoman(bytes, 12);
    postMessage({
      item: item,
      path: path,
      headline: 'text',
      text: text,
    });
  },
  FONT: function(item, path, bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var fontType = dv.getUint16(0, false);
    var hasImageHeightTable = !!(fontType & (1 << 0));
    var hasGlyphWidthTable = !!(fontType & (1 << 1));
    var bitsPerPixel = 1 << ((fontType >> 2) & 3);
    var has_fctb = !!(fontType & (1 << 7));
    if (has_fctb) {
      console.warn('font has fctb');
    }
    var isSynthetic = !!(fontType & (1 << 8));
    if (isSynthetic) {
      console.warn('synthetic font');
    }
    var hasColorsExceptBlack = !!(fontType & (1 << 9));
    if (hasColorsExceptBlack) {
      console.warn('font has colors except black');
    }
    var isFixedWidth = !!(fontType & (1 << 13));
    var doNotScale = !!(fontType & (1 << 14));
    var firstCharacter = dv.getUint16(2, false);
    var lastCharacter = dv.getUint16(4, false);
    var maximumWidth = dv.getUint16(6, false);
    var maximumKerning = dv.getInt16(8, false);
    var negatedDescent = dv.getInt16(10, false);
    var rectWidth = dv.getUint16(12, false);
    var rectHeight = dv.getUint16(14, false);
    var widthOffsetTableOffset = dv.getUint16(16, false);
    var maximumAscent = dv.getUint16(18, false);
    var maximumDescent = dv.getUint16(20, false);
    var leading = dv.getUint16(22, false);
    var bitImageRowWords = dv.getUint16(24, false);
    var glyphBitmapPitch = bitImageRowWords * 2;
    var glyphBitmapSize = glyphBitmapPitch * rectHeight;
    var fontImage = bytes.subarray(26, 26 + glyphBitmapSize);
    postMessage({
      item: item,
      path: path,
      headline: 'image',
      file: makeImageBlob(fontImage, glyphBitmapPitch * 8, rectHeight),
      width: glyphBitmapPitch * 8,
      height: rectHeight,
    });
  },
  vers: function(item, path, bytes) {
    var dataObject = {
      major: bytes[0],
      minor: bytes[1],
      developmentStage: (function(v) {
        switch(v) {
          case 0x20: return 'development';
          case 0x40: return 'alpha';
          case 0x60: return 'beta';
          case 0x80: return 'release';
          default: return v;
        }
      })(bytes[2]),
      prereleaseRevisionLevel: bytes[3],
      region: (function getRegionName(code) {
        switch(code) {
          case 0: return 'US';
          case 1: return 'FR';
          case 2: return 'GB';
          case 3: return 'DE';
          case 4: return 'IT';
          case 5: return 'NL';
          case 6: return 'BE/LU';
          case 7: return 'SE';
          case 8: return 'ES';
          case 9: return 'DK';
          case 10: return 'PT';
          case 11: return 'fr-CA';
          case 12: return 'NO';
          case 13: return 'IL';
          case 14: return 'JP';
          case 15: return 'AU';
          case 16: return 'ar';
          case 17: return 'FI';
          case 18: return 'fr-CH';
          case 19: return 'de-CH';
          case 20: return 'GR';
          case 21: return 'IS';
          case 22: return 'MT';
          case 23: return 'CY';
          case 24: return 'TR';
          case 25: return 'hr-BA';
          case 33: return 'hi-IN';
          case 34: return 'ur-PK';
          case 41: return 'LT';
          case 42: return 'PL';
          case 43: return 'HU';
          case 44: return 'EE';
          case 45: return 'LV';
          case 46: return 'FI-10'; // Lapland
          case 47: return 'FO';
          case 48: return 'IR';
          case 49: return 'RU';
          case 50: return 'IE';
          case 51: return 'KR';
          case 52: return 'CN';
          case 53: return 'TW';
          case 54: return 'TH';
          default: return code;
        }
      })((bytes[4] << 8) | bytes[5]),
    };
    dataObject.versionNumber = macRoman(bytes, 7, bytes[6]);
    var pos = 7 + bytes[6];
    dataObject.versionMessage = macRoman(bytes, pos + 1, bytes[pos]);
    postMessage({
      item: item,
      path: path,
      headline: 'text',
      type: 'version',
      text: dataObject.major
        + '.' + dataObject.minor
        + '-' + dataObject.developmentStage
        + (dataObject.preReleaseRevisionLevel ? dataObject.preReleaseRevisionLevel : '')
        + '[' + dataObject.region + ']'
        + ' ' + dataObject.versionNumber
        + ' "' + dataObject.versionMessage + '"',
    });
  },
};
resourceHandlers.NFNT = resourceHandlers.FONT;

function handleResource(res, item, path) {
  var resourceHeader = new ResourceHeaderView(
    res.buffer,
    res.byteOffset,
    ResourceHeaderView.byteLength);
  var resourceData = new Uint8Array(
    res.buffer,
    res.byteOffset + resourceHeader.dataOffset,
    resourceHeader.dataLength);
  var resourceMap = new ResourceMapView(
    res.buffer,
    res.byteOffset + resourceHeader.mapOffset,
    resourceHeader.mapLength);
  var dv = new DataView(
    resourceData.buffer,
    resourceData.byteOffset,
    resourceData.byteLength);
  resourceMap.resourceList.forEach(function(resourceInfo) {
    var len = dv.getUint32(resourceInfo.dataOffset, false);
    if (len === 0) {
      postMessage({
        item: item,
        headline: 'empty-resource',
        path: path,
        type: resourceInfo.type,
        name: resourceInfo.name,
      });
      return;
    }
    var data = resourceData.subarray(
      resourceInfo.dataOffset + 4,
      resourceInfo.dataOffset + 4 + len);
    if (resourceInfo.type in resourceHandlers) {
      var handler = resourceHandlers[resourceInfo.type];
      handler(item, path, data);
    }
    else {
      postMessage({
        item: item,
        headline: 'resource',
        path: path,
        type: resourceInfo.type,
        name: resourceInfo.name,
        byteLength: len,
      });
    }
  });
}

var handlers = {
  TEXT: function(item, path, disk, byteLength, extents) {
    postMessage({
      item: item,
      path: path,
      headline: 'open',
      scope: 'text',
    });
    return disk.streamExtents(byteLength, extents, function(bytes) {
      postMessage({
        item: item,
        path: path,
        headline: 'write',
        text: macRoman(bytes),
      });
    })
    .then(function() {
      postMessage({
        item: item,
        path: path,
        headline: 'close',
        scope: 'text',
      });
    });
    /*
    return disk.fromExtents(byteLength, extents).then(function(bytes) {
      // sometimes non-text files have type TEXT...
      if (bytes.length > 4 && String.fromCharCode.apply(null, bytes.subarray(0, 4)).toUpperCase() === '%PDF') {
        postMessage({
          item: item,
          path: path,
          headline: 'pdf',
          file: new Blob([bytes], {type:'application/pdf'}),
        });
        return;
      }
      postMessage({
        item: item,
        headline: 'text',
        path: path,
        text: macRoman(bytes),
      });
    });
    */
  },
  GIFf: function(item, path, disk, byteLength, extents) {
    return disk.fromExtents(byteLength, extents).then(function(bytes) {
      postMessage({
        item: item,
        headline: 'image',
        path: path,
        file: new Blob([bytes], {type:'image/gif'}),
      });
    });
  },
  PICT: function(item, path, disk, byteLength, extents) {
    return disk.fromExtents(byteLength, extents).then(function(bytes) {
      return resourceHandlers.PICT(item, path, bytes.subarray(512));
    });
  },
  PNTG: function(item, path, disk, byteLength, extents) {
    return disk.fromExtents(byteLength, extents).then(function(bytes) {
      var packed = bytes.subarray(512);
      var bitmap = new Uint8Array(576/8 * 720);
      unpackBits(packed, bitmap);
      postMessage({
        item: item,
        headline: 'image',
        path: path,
        file: makeImageBlob(bitmap, 576, 720),
        width: 576,
        height: 720,
      });
    });
  },
  SCRN: function(item, path, disk, byteLength, extents) {
    if (byteLength !== 512/8 * 342) {
      console.warn('SCRN: unrecognized data fork length');
      return;
    }
    return disk.fromExtents(byteLength, extents).then(function(bytes) {
      postMessage({
        item: item,
        headline: 'image',
        path: path,
        file: makeImageBlob(bytes, 512, 342),
        width: 512,
        height: 342,
      });
    });
  },
  WORD: function(item, path, disk, byteLength, extents) {
    return disk.fromExtents(byteLength, extents).then(function(bytes) {
      if (bytes.length < 2 || bytes[0] !== 0x00 || bytes[1] !== 0x03) {
        console.warn('unsupported MacWrite version');
        return;
      }
      var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      var paraPos = dv.getUint16(2, false);
      var mainParaCount = dv.getUint16(4, false);
      var headerParaCount = dv.getUint16(6, false);
      var footerParaCount = dv.getUint16(8, false);
      var paraCount = mainParaCount + headerParaCount + footerParaCount;
      postMessage({
        item: item,
        headline: 'open',
        scope: 'text',
        path: path,
      });
      for (var para_i = 0; para_i < paraCount; para_i++) {
        var paraType = dv.getUint16(paraPos, false);
        var nextParaPos = paraPos + 4 + dv.getUint16(paraPos + 2, false);
        if (paraType === 1) {
          var textLen = dv.getUint16(paraPos + 4);
          var textPos = paraPos + 6;
          postMessage({
            item: item,
            path: path,
            headline: 'write',
            text: macRoman(bytes, textPos, textLen),
          });
        }
        paraPos = nextParaPos;
      }
      postMessage({
        item: item,
        headline: 'close',
        scope: 'text',
        path: path,
      });
    });
  },
  JPEG: function(item, path, disk, byteLength, extents) {
    return disk.fromExtents(byteLength, extents).then(function(bytes) {
      postMessage({
        item: item,
        headline: 'image',
        path: path,
        file: new Blob([bytes], {type:'image/jpeg'}),
      });
    });
  },
  'PDF ': function(item, path, disk, byteLength, extents) {
    return disk.fromExtents(byteLength, extents).then(function(bytes) {
      postMessage({
        item: item,
        headline: 'pdf',
        path: path,
        file: new Blob([bytes], {type:'application/pdf'}),
      });
    });
  },
  STAK: function(item, path, disk, byteLength, extents) {
    function onChunk(chunk) {
      switch (chunk.type) {
        case 'STAK':
          if (chunk.data[0x600]) {
            var len = 1;
            while (chunk.data[0x600+len]) len++;
            postMessage({
              item: item,
              headline: 'text',
              path: path,
              text: macRoman(chunk.data, 0x600, len),
              type: 'code',
            });
          }
          break;
        case 'BKGD':
        case 'CARD':
          var dv = new DataView(chunk.data.buffer, chunk.data.byteOffset, chunk.data.byteLength);
          var partCount = dv.getUint16(chunk.type === 'CARD' ? 40 : 36, false);
          var partContentCount = dv.getUint16(chunk.type === 'CARD' ? 48 : 44, false);
          var pos = chunk.type === 'CARD' ? 54 : 50;
          for (var i = 0; i < partCount; i++) {
            var size = dv.getUint16(pos, false);
            var namePos = pos + 30, nameLen = 0;
            while (chunk.data[namePos + nameLen]) nameLen++;
            if (nameLen > 0) {
              postMessage({
                item: item,
                headline: 'text',
                path: path,
                text: macRoman(chunk.data, namePos, nameLen),
                type: 'name',
              });
            }
            var scriptPos = namePos + nameLen + 2;
            if (chunk.data[scriptPos]) {
              var scriptLen = 1;
              while (chunk.data[scriptPos+scriptLen]) scriptLen++;
              postMessage({
                item: item,
                headline: 'text',
                path: path,
                text: macRoman(chunk.data, scriptPos, scriptLen),
                type: 'code',
              });
            }
            pos += size;
          }
          for (var i = 0; i < partContentCount; i++) {
            if (pos >= chunk.data.length) break;
            var partId = dv.getInt16(pos, false);
            var size = dv.getUint16(pos+2, false);
            var formatLength = chunk.data[pos+4] & 0x80 ? dv.getUint16(pos+4, false) & 0x7FFF : 1;
            var charPos = pos + 4 + formatLength;
            var str = macRoman(chunk.data, charPos, size - formatLength).replace(/\0.*/, '');
            if (str.length > 0) {
              postMessage({
                item: item,
                headline: 'text',
                path: path,
                text: str,
              });
            }
            pos += 4 + size;
          }
          if (chunk.data[pos]) {
            var nameLen = 1;
            while (chunk.data[pos + nameLen]) nameLen++;
            postMessage({
              item: item,
              headline: 'text',
              path: path,
              text: macRoman(chunk.data, pos, nameLen),
              type: 'name',
            });
            pos += nameLen + 1;
          }
          else pos++;
          if (chunk.data[pos]) {
            var scriptLen = 1;
            while (chunk.data[pos+scriptLen]) scriptLen++;
            postMessage({
              item: item,
              headline: 'text',
              path: path,
              text: macRoman(chunk.data, pos, scriptLen),
              type: 'code',
            });
          }
          break;
        case 'BMAP':
          var dv = new DataView(chunk.data.buffer, chunk.data.byteOffset, chunk.data.byteLength);
          var imageBounds = {
            top: dv.getInt16(40, false),
            left: dv.getInt16(42, false),
            bottom: dv.getInt16(44, false),
            right: dv.getInt16(46, false),
          };
          if (imageBounds.bottom <= imageBounds.top || imageBounds.right <= imageBounds.left) break;
          var height = imageBounds.bottom - imageBounds.top;
          var fullWidth = (Math.ceil(imageBounds.right/32) - Math.floor(imageBounds.left/32)) * 32;
          if (fullWidth*height === 0) break;
          var byteStride = fullWidth/8;
          var maskDataLen = dv.getUint32(56, false), imageDataLen = dv.getUint32(60, false);
          var ops = chunk.data.subarray(64 + maskDataLen, 64 + maskDataLen + imageDataLen);
          var bmap = new Uint8Array(byteStride * height);
          var patterns = new Uint8Array([0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55, 0xAA, 0x55]);
          var dx = 0, dy = 0, reps = 1;
          var op_i = 0, bmap_i = 0;
          var row_i = 0;
          mainLoop: while (bmap_i < bmap.length) {
            var op = ops[op_i++];
            if (op < 0x80) {
              var zeroBytes = op & 0xF;
              var dataBytes = op >>> 4;
              if ((op_i + dataBytes) > ops.length || (bmap_i + (zeroBytes + dataBytes) * reps) > bmap.length) {
                console.error('op data out of range');
                break;
              }
              if (dataBytes === 1) {
                var dataByte = ops[op_i++];
                while (reps-- > 0) {
                  bmap[bmap_i + zeroBytes] = dataByte;
                  bmap_i += zeroBytes + 1;
                }
              }
              else if (dataBytes === 0) {
                bmap_i += zeroBytes * reps;
              }
              else {
                dataBytes = ops.subarray(op_i, op_i + dataBytes);
                op_i += dataBytes.length;
                while (reps-- > 0) {
                  bmap.set(dataBytes, bmap_i + zeroBytes);
                  bmap_i += zeroBytes + dataBytes.length;
                }
              }
              reps = 1;
            }
            else if ((op & 0xE0) === 0xC0) {
              var dataBytes = (op & 0x1F) * 8;
              if ((bmap_i + dataBytes * reps) > bmap.length || (op_i + dataBytes) > ops.length) {
                console.error('bmap out of range');
                break mainLoop;
              }
              dataBytes = ops.subarray(op_i, op_i + dataBytes);
              op_i += dataBytes.length;
              while (reps-- > 0) {
                bmap.set(dataBytes, bmap_i);
                bmap_i += dataBytes.length;
              }
              reps = 1;
            }
            else if ((op & 0xE0) === 0xE0) {
              var zeroBytes = (op & 0x1F) * 16;
              bmap_i += zeroBytes * reps;
              if (bmap_i > bmap.length) {
                console.error('bmap out of range');
                break mainLoop;
              }
              reps = 1;
            }
            if ((op & 0xE0) === 0xA0) {
              reps = op & 0x1F;
            }
            else switch (op) {
              case 0x80:
                if ((bmap_i + byteStride * reps) > bmap.length) {
                  console.error('bmap out of range');
                  break mainLoop;
                }
                var dataBytes = ops.subarray(op_i, op_i + byteStride);
                op_i += byteStride;
                row_i += reps;
                while (reps-- > 0) {
                  bmap.set(dataBytes, bmap_i);
                  bmap_i += dataBytes.length;
                }
                reps = 1;
                break;
              case 0x81:
                if ((bmap_i + byteStride * reps) > bmap.length) {
                  console.error('bmap out of range');
                  break mainLoop;
                }
                row_i += reps;
                bmap_i += byteStride * reps;
                reps = 1;
                break;
              case 0x82:
                if ((bmap_i + byteStride * reps) > bmap.length) {
                  console.error('bmap out of range');
                  break mainLoop;
                }
                row_i += reps;
                var end_i = bmap_i + reps * byteStride;
                while (bmap_i < end_i) bmap[bmap_i++] = 0xFF;
                reps = 1;
                break;
              case 0x83:
                if ((bmap_i + byteStride * reps) > bmap.length) {
                  console.error('bmap out of range');
                  break mainLoop;
                }
                var pattern = ops[op_i++];
                row_i += reps;
                while (reps-- > 0) {
                  patterns[(bmap_i / byteStride)&7] = pattern;
                  var end_i = bmap_i + byteStride;
                  while (bmap_i < end_i) bmap[bmap_i++] = pattern;
                }
                reps = 1;
                break;
              case 0x84:
                if ((bmap_i + byteStride * reps) > bmap.length) {
                  console.error('bmap out of range');
                  break mainLoop;
                }
                row_i += reps;
                while (reps-- > 0) {
                  var pattern = patterns[(bmap_i / byteStride)&7];
                  var end_i = bmap_i + byteStride;
                  while (bmap_i < end_i) bmap[bmap_i++] = pattern;
                }
                reps = 1;
                break;
              case 0x85:
                if ((bmap_i + byteStride * reps) > bmap.length) {
                  console.error('bmap out of range');
                  break mainLoop;
                }
                var dataBytes = bmap.subarray(bmap_i - byteStride, bmap_i);
                row_i += reps;
                while (reps-- > 0) {
                  bmap.set(dataBytes, bmap_i);
                  bmap_i += byteStride;
                }
                reps = 1;
                break;
              case 0x86:
                if ((bmap_i + byteStride * reps) > bmap.length) {
                  console.error('bmap out of range');
                  break mainLoop;
                }
                row_i += reps;
                while (reps-- > 0) {
                  bmap.set(bmap.subarray(bmap_i - byteStride * 2, bmap_i - byteStride), bmap_i);
                  bmap_i += byteStride;
                }
                reps = 1;
                break;
              case 0x87:
                if ((bmap_i + byteStride * reps) > bmap.length) {
                  console.error('bmap out of range');
                  break mainLoop;
                }
                row_i += reps;
                while (reps-- > 0) {
                  bmap.set(bmap.subarray(bmap_i - byteStride * 3, bmap_i - byteStride * 2), bmap_i);
                  bmap_i += byteStride;
                }
                reps = 1;
                break;
              case 0x88: dx = 16; dy = 0; break;
              case 0x89: dx =  0; dy = 0; break;
              case 0x8A: dx =  0; dy = 1; break;
              case 0x8B: dx =  0; dy = 2; break;
              case 0x8C: dx =  1; dy = 0; break;
              case 0x8D: dx =  1; dy = 1; break;
              case 0x8E: dx =  2; dy = 2; break;
              case 0x8F: dx =  8; dy = 0; break;
              default:
                var row_j = Math.floor(bmap_i / byteStride);
                while (row_i < row_j) {
                  if (dx) {
                    var prev = bmap.subarray(row_i * byteStride, (row_i + 1) * byteStride);
                    var copy = new Uint8Array(prev);
                    for (var k = Math.floor(fullWidth/dx); k > 0; k--) {
                      var x = 0;
                      for (var n = 0; n < byteStride; n++) {
                        x |= prev[n] << 16 >> dx;
                        prev[n] = (x >> 16) ^ copy[n];
                        x = (x << 8) & 0xFFFF00;
                      }
                    }
                  }
                  if (dy) {
                    for (var n = 0; n < byteStride; n++) {
                      bmap[row_i * byteStride + n] ^= bmap[(row_i - dy) * byteStride + n];
                    }
                  }
                  row_i++;
                }
                break;
            }
          }
          postMessage({
            item: item,
            headline: 'image',
            path: path,
            file: makeImageBlob(bmap, fullWidth, height),
            width: fullWidth,
            height: height,
          });
          break;
      }
    }
    
    function nextChunk(nextOffset) {
      return disk.fromExtents(12, extents, nextOffset).then(function(bytes) {
        var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        var len = dv.getUint32(0, false);
        var type = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
        var id = dv.getInt32(8, false);
        var gotData = disk.fromExtents(len, extents, nextOffset).then(function(bytes) {
          onChunk({
            type: type,
            id: id,
            data: bytes,
          });
        });
        if (type === 'TAIL') return gotData;
        return Promise.all([gotData, nextChunk(nextOffset + len)]);
      });
    }
    
    return nextChunk(0);
  },
};
handlers.ttro = handlers.TEXT;

function hfs(disk, mdb, item) {
  postMessage({
    headline: 'open',
    scope: 'disk',
    item: item,
    name: mdb.name,
  });
  disk.chunkSize = mdb.allocationChunkByteLength;
  disk.allocOffset = mdb.firstAllocationBlock * 512;
  disk.fromExtents = disk_fromExtents;
  disk.streamExtents = disk_streamExtents;
  var catalog = disk.fromExtents(
    mdb.catalogByteLength,
    mdb.catalogFirstExtents);
  var overflow = disk.fromExtents(
    mdb.overflowByteLength,
    mdb.overflowFirstExtents);
  return Promise.all([catalog, overflow]).then(function(values) {
    var catalog = values[0], overflow = values[1];

    var parentPaths = {};
    parentPaths[0] = '';
    parentPaths[1] = '';
    parentPaths[2] = '$EXTENTS::';
    parentPaths[3] = '$CATALOG::';
    parentPaths[4] = '$BADALLOC::';

    var dataForkOverflowExtents = {};
    var resourceForkOverflowExtents = {};

    var overflowHeader = new BTreeNodeView(overflow.buffer, overflow.byteOffset, 512);
    if (overflowHeader.type !== 'header') {
      return Promise.reject('invalid overflow');
    }
    overflowHeader = overflowHeader.records[0];
    var overflowNodeNumber = overflowHeader.firstLeaf;
    while (overflowNodeNumber !== 0) {
      var overflowLeaf = new BTreeNodeView(
        overflow.buffer,
        overflow.byteOffset + overflowNodeNumber * 512,
        512);
      overflowLeaf.records.forEach(function(record) {
        switch (record.overflowForkType) {
          case 'data':
            dataForkOverflowExtents[record.overflowFileID] = record.overflowExtentDataRecord;
            break;
          case 'resource':
            resourceForkOverflowExtents[record.overflowFileID] = record.overflowExtentDataRecord;
            break;
        }
      });
      overflowNodeNumber = overflowLeaf.nextNodeNumber;
    }

    var catalogHeader = new BTreeNodeView(catalog.buffer, catalog.byteOffset, NODE_BYTES);
    if (catalogHeader.type !== 'header') {
      throw new Error('invalid catalog tree');
    }
    var map = catalogHeader.records[2];
    catalogHeader = catalogHeader.records[0];
    var leaf;
    for (var nodeNumber = catalogHeader.firstLeaf; nodeNumber !== 0; nodeNumber = leaf.nextNodeNumber) {
      leaf = new BTreeNodeView(catalog.buffer, catalog.byteOffset + NODE_BYTES * nodeNumber, NODE_BYTES);
      if (leaf.type !== 'leaf') throw new Error('non-leaf node in the leaf chain');
      leaf.records.forEach(function(record) {
        if (!/^(folder|file)$/.test(record.leafType)) return;
        var parentPath = parentPaths[record.parentFolderID];
        var path = parentPath + record.name;
        if (record.leafType === 'folder') {
          path += ':';
          postMessage({
            item: item,
            type: 'open',
            scope: 'folder',
            path: path,
            id: record.folderInfo.id,
            createdAt: record.folderInfo.createdAt,
            modifiedAt: record.folderInfo.modifiedAt,
            isInvisible: record.folderInfo.isInvisible,
          });
          parentPaths[record.folderInfo.id] = path;
          return;
        }
        else {
          postMessage({
            item: item,
            headline: 'open',
            scope: 'file',
            path: path,
            id: record.fileInfo.id,
            createdAt: record.fileInfo.createdAt,
            modifiedAt: record.fileInfo.modifiedAt,
            type: record.fileInfo.type,
            creator: record.fileInfo.creator,
            isInvisible: record.fileInfo.isInvisible,
          });
          var dataFork = record.fileInfo.dataForkInfo;
          var resourceFork = record.fileInfo.resourceForkInfo;
          var fileDone = [];
          if (dataFork.logicalEOF > 0) {
            var dataForkExtents = record.fileInfo.dataForkFirstExtentRecord;
            var needDataBlocks = Math.ceil(dataFork.logicalEOF / disk.chunkSize);
            needDataBlocks -= dataForkExtents.reduce(function(total,e){ return total + e.length; }, 0);
            if (needDataBlocks > 0) {
              dataForkExtents = dataForkExtents.concat(dataForkOverflowExtents[record.fileInfo.id]);
            }
            if (record.fileInfo.type in handlers) {
              var handler = handlers[record.fileInfo.type];
              fileDone.push(handler(item, path, disk, dataFork.logicalEOF, dataForkExtents));
            }
          }
          if (resourceFork.logicalEOF > 0) {
            var resourceForkExtents = record.fileInfo.resourceForkFirstExtentRecord;
            var needResourceBlocks = Math.ceil(resourceFork.logicalEOF / disk.chunkSize);
            needResourceBlocks -= resourceForkExtents.reduce(function(total,e){ return total + e.length; }, 0);
            if (needResourceBlocks > 0) {
              resourceForkExtents = resourceForkExtents.concat(resourceForkOverflowExtents[record.fileInfo.id]);
            }
            fileDone.push(disk.fromExtents(resourceFork.logicalEOF, resourceForkExtents).then(function(res) {
              return handleResource(res, item, path);
            }));
          }
          Promise.all(fileDone).then(function() {
            postMessage({
              item: item,
              headline: 'close',
              scope: 'file',
              path: path,
            });
          });
        }
      });
    }

    postMessage({
      item: item,
      headline: 'close',
      scope: 'disk',
    });
  });
}

function MFSVolumeInfoView(buffer, byteOffset, byteLength) {
  this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  this.dv = new DataView(buffer, byteOffset, byteLength);
}
MFSVolumeInfoView.prototype = {
  get hasValidSignature() {
    return this.bytes[0] === 0xD2 && this.bytes[1] === 0xD7;
  },
  get initializedAt() {
    return macDate(this.dv, 2);
  },
  get lastBackupAt() {
    return macDate(this.dv, 6);
  },
  get volumeAttributes() {
    return this.dv.getUint16(10, false);
  },
  get isWriteProtected() {
    return !!(this.volumeAttributes & (1 << 7));
  },
  get isLockedBySoftware() {
    return !!(this.volumeAttributes & (1 << 15));
  },
  get isCopyProtected() {
    return !!(this.volumeAttributes & (1 << 14));
  },
  get fileCount() {
    return this.dv.getUint16(12, false);
  },
  get firstDirBlock() {
    return this.dv.getUint16(14, false);
  },
  get dirBlockCount() {
    return this.dv.getUint16(16, false);
  },
  get allocChunkCount() {
    return this.dv.getUint16(18, false);
  },
  get allocChunkSize() {
    return this.dv.getUint32(20, false);
  },
  get bytesToAllocate() {
    return this.dv.getUint32(24, false);
  },
  get firstAllocBlock() {
    return this.dv.getUint16(28, false);
  },
  get nextUnusedFile() {
    return this.dv.getUint32(30, false);
  },
  get unusedAllocChunkCount() {
    return this.dv.getUint16(34, false);
  },
  get name() {
    return macRoman(this.bytes, 37, this.bytes[36]);
  },
};
MFSVolumeInfoView.byteLength = 64;

function MFSFileInfoView(buffer, byteOffset, byteLength) {
  this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  this.dv = new DataView(buffer, byteOffset, byteLength);
}
MFSFileInfoView.prototype = {
  get attributes() {
    return this.bytes[0];
  },
  get exists() {
    return !!this.attributes;
  },
  get isSoftwareLocked() {
    return !(this.attributes & (1 << 7));
  },
  get isCopyProtected() {
    return !!(this.attributes & (1 << 6));
  },
  get versionNumber() {
    return this.bytes[1];
  },
  get type() {
    return macRoman(this.bytes, 2, 4);
  },
  get creator() {
    return macRoman(this.bytes, 6, 4);
  },
  // 8 bytes used by Finder
  get fileNumber() {
    return this.dv.getUint32(18, false);
  },
  get firstDataChunk() {
    return this.dv.getUint16(22, false);
  },
  get dataLogicalLength() {
    return this.dv.getUint32(24, false);
  },
  get dataPhysicalLength() {
    return this.dv.getUint32(28, false);
  },
  get firstResourceChunk() {
    return this.dv.getUint16(32, false);
  },
  get resourceLogicalLength() {
    return this.dv.getUint32(34, false);
  },
  get resourcePhysicalLength() {
    return this.dv.getUint32(38, false);
  },
  get createdAt() {
    return macDate(this.dv, 42);
  },
  get modifiedAt() {
    return macDate(this.dv, 46);
  },
  get name() {
    return macRoman(this.bytes, 51, this.bytes[50]);
  },
  get byteLength() {
    var len = 51 + this.bytes[50];
    if (len & 1) len++;
    return len;
  },
};

function mfs(disk, vinfo, item) {
  disk.chunkSize = vinfo.allocChunkSize;
  disk.allocOffset = vinfo.firstAllocBlock * 512 - 2*vinfo.allocChunkSize;
  disk.fromExtents = disk_fromExtents;
  disk.streamExtents = disk_streamExtents;
  postMessage({
    headline: 'open',
    scope: 'disk',
    item: item,
    name: vinfo.name,
  });
  var mapOffset = 512 * 2 + MFSVolumeInfoView.byteLength;
  var mapLength = Math.ceil((vinfo.allocChunkCount * 12) / 8);
  return disk.get(mapOffset, mapLength).then(function(bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var map = new Array(vinfo.allocChunkCount);
    for (var i = 0; i < map.length; i++) {
      // aaaaaaaa
      // aaaabbbb
      // bbbbbbbb
      if (i % 2) {
        map[i] = dv.getUint16(Math.floor(i/2)*3+1, false) & 0xfff;
      }
      else {
        map[i] = dv.getUint16(Math.floor(i/2)*3, false) >>> 4;
      }
    }
    function getExtents(allocNumber) {
      var prev = {offset:allocNumber, length:1};
      var chain = [prev];
      for (var next = map[allocNumber-2]; next > 1; next = map[next-2]) {
        if (prev.offset + prev.length === next) {
          prev.length++;
        }
        else {
          chain.push(prev = {offset:next, length:1});
        }
      }
      return chain;
    }
    function nextDirBlock(block_i) {
      if (block_i >= vinfo.dirBlockCount) {
        postMessage({
          headline: 'close',
          scope: 'disk',
          item: item,
        });
        return;
      }
      return disk.get(
        (vinfo.firstDirBlock + block_i) * 512,
        512
      ).then(function(block) {
        var nextPos = block.byteOffset;
        var endPos = nextPos + block.byteLength;
        do {
          var fileInfo = new MFSFileInfoView(block.buffer, nextPos);
          if (!fileInfo.exists) break;
          var path = vinfo.name + ':' + fileInfo.name;
          postMessage({
            item: item,
            headline: 'open',
            scope: 'file',
            path: path,
            modifiedAt: fileInfo.modifiedAt,
            createdAt: fileInfo.createdAt,
            type: fileInfo.type,
            creator: fileInfo.creator,
          });
          var fileDone = [path];
          if (fileInfo.dataLogicalLength > 0) {
            if (fileInfo.type in handlers) {
              var handler = handlers[fileInfo.type];
              fileDone.push(handler(
                item,
                path,
                disk,
                fileInfo.dataLogicalLength,
                getExtents(fileInfo.firstDataChunk)
              ));
            }
            else {
              var handler = (function(path, bytes) {
                postMessage({
                  item: item,
                  path: path,
                  headline: 'file',
                  file: new Blob([bytes]),
                });
              }).bind(null, path);
              fileDone.push(
                disk.fromExtents(
                  fileInfo.dataLogicalLength,
                  getExtents(fileInfo.firstDataChunk))
                .then(handler)
              );
            }
          }
          if (fileInfo.resourceLogicalLength > 0) {
            var handler = (function(path, res) {
              return handleResource(res, item, path);
            }).bind(null, path);
            fileDone.push(
              disk.fromExtents(
                fileInfo.resourceLogicalLength,
                getExtents(fileInfo.firstResourceChunk))
              .then(handler)
            );
          }
          Promise.all(fileDone).then(function(values) {
            var path = values[0];
            postMessage({
              item: item,
              headline: 'close',
              scope: 'file',
              path: path,
            });
          });
          nextPos += fileInfo.byteLength;
        } while (nextPos < endPos);
        return nextDirBlock(block_i + 1);
      });
    }
    return nextDirBlock(0);
  });
}

function ondisk(disk, item) {
  return disk.get(512 * 2, 512).then(function(bytes) {
    var mdb = new MasterDirectoryBlockView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength);
    if (mdb.hasValidSignature) {
      return hfs(disk, mdb, item);
    }
    var vinfo = new MFSVolumeInfoView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength);
    if (vinfo.hasValidSignature) {
      return mfs(disk, vinfo, item);
    }
    if (!(disk instanceof OffsetSource)) {
      return ondisk(new OffsetSource(disk, 84), item);
    }
    return Promise.reject('not a recognised format');
  })
  .then(null, function(problem) {
    postMessage({
      headline: 'problem',
      item: item,
      problem: problem+'',
    });
  });
}

self.onmessage = function onmessage(e) {
  var message = e.data;
  switch (message.headline) {
    case 'load-url':
      var gotSource;
      var ChunkedSource
        = FetchChunkedSource.available ? FetchChunkedSource
        : MozChunkedSource.available ? MozChunkedSource
        : null;
      if (ChunkedSource) {
        gotSource = Promise.resolve(new ChunkedSource(message.url));
      }
      else {
        gotSource = fetch(message.url).then(function(response) {
          if (!response.ok) {
            return Promise.reject('server returned code ' + response.code);
          }
          return response.blob();
        })
        .then(function(blob) {
          return new BlobSource(blob);
        });
      }
      gotSource.then(function(source) {
        ondisk(source, message.item);
      });
      break;
    case 'load-blob':
      if (/\.hqx$/i.test(message.blob.name || '')) {
        var hqxSource = new HqxEncodedSource(new BlobSource(message.blob, true));
        hqxSource.get(0, Infinity).then(function(data) {
          download(data);
        });
      }
      else {
        ondisk(new BlobSource(message.blob), message.item);
      }
      break;
  }
};
