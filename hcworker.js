
function download(v) {
  if (!(v instanceof Blob)) v = new Blob([v]);
  postMessage({
    headline: 'download',
    file: v,
  });
}

const BUFFER_LENGTH = 1024 * 1024 * 2;

function BlobSource(blob) {
  this.blob = blob;
}
BlobSource.prototype = {
  get: function(offset, length) {
    var gotBuffer = this.gotBuffer;
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
          buffer.fileOffset = readStart;
          resolve(buffer);
        };
        fr.readAsArrayBuffer(self.blob.slice(readStart, readEnd));
      });
      if (createBuffer) {
        gotBuffer.start = readStart;
        gotBuffer.end = readEnd;
        this.gotBuffer = gotBuffer;
      }
    }
    return gotBuffer.then(function(buffer) {
      return new Uint8Array(buffer, offset - buffer.fileOffset, length);
    });
  },
  getBlob: function() {
    return Promise.resolve(this.blob);
  },
  stream: function(offset, length, callback) {
    return this.get(offset, length).then(callback);
  },
};

function MemorySource(arrayBuffer) {
  this.arrayBuffer = arrayBuffer;
}
MemorySource.prototype = {
  get: function(offset, length) {
    return Promise.resolve(new Uint8Array(this.arrayBuffer, offset, length));
  },
  getBlob: function() {
    return Promise.resolve(new Blob([this.arrayBuffer]));
  },
  stream: function(offset, length, callback) {
    return this.get(offset, length).then(callback);
  },
};

var chunked_proto = {
  get: function(offset, length) {
    var self = this;
    return new Promise(function(resolve, reject) {
      function finalRead() {
        var i;
        for (i = 0; i < self.chunks.length; i++) {
          if (offset < self.chunks[i].length) {
            break;
          }
          offset -= self.chunks[i].length;
        }
        if (offset+length <= self.chunks[i].length) {
          resolve(self.chunks[i].subarray(offset, offset+length));
          return;
        }
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
      if (offset+length <= self.totalRead) {
        finalRead();
      }
      else self.listeners.push(function listener() {
        if (offset+length > self.totalRead) {
          if (self.complete) {
            self.listeners.splice(self.listeners.indexOf(listener), 1);
            reject('not enough data');
          }
          return;
        }
        self.listeners.splice(self.listeners.indexOf(listener), 1);
        finalRead();
      });
    });
  },
  getBlob: function() {
    var self = this;
    return this.fetched.then(function() {
      return new Blob(self.chunks);
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
          chunk = chunk.subarray(offset, Math.min(chunk.length, offset + length));
          callback(chunk);
          length -= chunk.length;
          if (length === 0) {
            self.listeners.splice(self.listeners.indexOf(listen), 1);
            resolve();
            return;
          }
          offset = 0;
        }
        if (self.complete) {
          self.listeners.splice(self.listeners.indexOf(listen), 1);
          reject('unexpected end of data');
        }
      }
      self.listeners.push(listen);
      listen();
    });
  },
};
    
function FetchChunkedSource(url) {
  var self = this;
  this.listeners = [];
  this.chunks = [];
  this.totalRead = 0;
  this.fetched = fetch(url).then(function(req) {
    if (!req.ok) {
      self.complete = true;
      self.listeners.forEach(function(listener) {
        listener();
      });
      return Promise.reject('download error');
    }
    var reader = req.body.getReader();
    function nextChunk(chunk) {
      if (chunk.done) {
        self.complete = true;
        self.listeners.forEach(function(listener) {
          listener();
        });
        return;
      }
      chunk = chunk.value;
      self.chunks.push(chunk);
      self.totalRead += chunk.length;
      self.listeners.forEach(function(listener) {
        listener();
      });
      return reader.read().then(nextChunk);
    }
    return reader.read().then(nextChunk);
  });
}
FetchChunkedSource.available = (typeof self.ReadableStream === 'function' && 'getReader' in ReadableStream.prototype);
FetchChunkedSource.prototype = Object.create(chunked_proto);
    
function MozChunkedSource(url) {
  var self = this;
  this.listeners = [];
  this.chunks = [];
  this.totalRead = 0;
  this.fetched = new Promise(function(resolve, reject) {
    var xhr = new XMLHttpRequest;
    xhr.open('GET', url);
    xhr.responseType = 'moz-chunked-arraybuffer';
    xhr.onprogress = function() {
      self.chunks.push(new Uint8Array(this.response));
      self.totalRead += this.response.byteLength;
      self.listeners.forEach(function(listener) {
        listener();
      });
    };
    xhr.onload = function() {
      self.complete = true;
      self.listeners.forEach(function(listener) {
        listener();
      });
      resolve();
    };
    xhr.onerror = function() {
      reject('download error');
      self.complete = true;
      self.listeners.forEach(function(listener) {
        listener();
      });
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

function getDB() {
  return getDB.result = getDB.result || new Promise(function(resolve, reject) {
    var opening = indexedDB.open('hctemp', 1);
    opening.onerror = function() {
      reject('db error ' + this.errorCode);
    };
    opening.onsuccess = function() {
      resolve(this.result);
    };
    opening.onupgradeneeded = function() {
      var db = this.result;
      db.createObjectStore('cache');
    };
  });
}

// TODO: enable cache only in ?debug mode
function getCache() {
  return Promise.resolve({});
  /*
  return getDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var getting = db.transaction(['cache'], 'readonly').objectStore('cache').get(1);
      getting.onerror = function(e) {
        reject('db error ' + this.errorCode);
      };
      getting.onsuccess = function(e) {
        resolve(this.result || {});
      };
    });
  });
  */
}

function setCache(record) {
  return;
  /*
  getDB().then(function(db) {
    db.transaction(['cache'], 'readwrite').objectStore('cache').put(record, 1);
  });
  */
}

function getBuffer(identifier) {
  function downloadItem() {
    var url = '//cors.archive.org/cors/' + identifier;
    var ChunkedSource
      = FetchChunkedSource.available ? FetchChunkedSource
      : MozChunkedSource.available ? MozChunkedSource
      : null;
    if (ChunkedSource) {
      var source = new ChunkedSource(url);
      source.fetched.then(function() {
        return source.getBlob();
      })
      .then(function(blob) {
        setCache({identifier:identifier, blob:blob});
      });
      return Promise.resolve(source);
    }
    return fetch('//cors.archive.org/cors/' + identifier)
    .then(function(response) {
      if (!response.ok) {
        return Promise.reject('server returned code ' + response.code);
      }
      return response.arrayBuffer();
    })
    .then(function(buffer) {
      setCache({identifier:identifier, blob:new Blob([buffer])});
      return new MemorySource(buffer);
    });
  }
  return getCache().then(function(cache) {
    if (cache.identifier === identifier) {
      return new Promise(function(resolve, reject) {
        var fr = new FileReader();
        fr.onload = function() {
          resolve(new MemorySource(this.result));
        };
        fr.readAsArrayBuffer(cache.blob);
      });
    }
    return downloadItem();
  });
}

const MAC_CHARSET_128_255
  = '\xC4\xC5\xC7\xC9\xD1\xD6\xDC\xE1\xE0\xE2\xE4\xE3\xE5\xE7\xE9\xE8'
  + '\xEA\xEB\xED\xEC\xEE\xEF\xF1\xF3\xF2\xF4\xF6\xF5\xFA\xF9\xFB\xFC'
  + '\u2020\xB0\xA2\xA3\xA7\u2022\xB6\xDF\xAE\xA9\u2122\xB4\xA8\u2260\xC6\xD8'
  + '\u221E\xB1\u2264\u2265\xA5\xB5\u2202\u2211\u220F\u03C0\u222B\xAA\xBA\u03A9\xE6\xF8'
  + '\xBF\xA1\xAC\u221A\u0192\u2248\u2206\xAB\xBB\u2026\xA0\xC0\xC3\xD5\u0152\u0153'
  + '\u2013\u2014\u201C\u201D\u2018\u2019\xF7\u25CA\xFF\u0178\u2044\u20AC\u2039\u203A\uFB01\uFB02'
  + '\u2021\xB7\u201A\u201E\u2030\xC2\xCA\xC1\xCB\xC8\xCD\xCE\xCF\xCC\xD3\xD4'
  + '\uF8FF\xD2\xDA\xDB\xD9\u0131\u02C6\u02DC\xAF\u02D8\u02D9\u02DA\xB8\u02DD\u02DB\u02C7';

var decoder = ('TextDecoder' in self) ? new TextDecoder('iso-8859-1') : {
  max: 512 * 1024,
  decode: function(bytes) {
    while (bytes.length <= this.max) {
      try {
        return String.fromCharCode.apply(null, bytes);
      }
      catch (e) {
        this.max /= 2;
      }
    }
    return this.decode(bytes.subarray(0, this.max)) +
      this.decode(bytes.subarray(this.max));
  },
};

function macRoman(u8array, offset, length) {
  switch(arguments.length) {
    case 2: u8array = u8array.subarray(offset); break;
    case 3: u8array = u8array.subarray(offset, offset + length); break;
  }
  return decoder.decode(u8array)
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
      buf.writeOffset += chunk.length;
      return nextExtent(i + 1, 0);
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

function makeImageBlob(bytes, width, height) {
  var header = new DataView(new ArrayBuffer(62));
  header.setUint16(0, ('B'.charCodeAt(0) << 8) | 'M'.charCodeAt(0), false);
  header.setUint32(2, header.byteLength + bytes.length, true);
  header.setUint32(10, header.byteLength, true);
  header.setUint32(14, 40, true); // BITMAPINFOHEADER
  header.setUint32(18, width, true);
  header.setInt32(22, -height, true);
  header.setUint16(26, 1, true); // planes
  header.setUint16(28, 1, true); // bpp
  header.setUint32(54, 0xFFFFFF, true);
  return new Blob([header, bytes], {type:'image/bmp'});
}

function makeWav(samples, samplingRate, channels, bytesPerSample) {
  var dv = new DataView(new ArrayBuffer(44));
  dv.setUint32(0, 0x46464952, true); // RIFF
  dv.setUint32(4, dv.byteLength + samples.length - 8, true);
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
  dv.setUint32(40, samples.length, true);
  return new Blob([dv, samples], {type:'audio/wav'});
}

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

function PictRenderer(frame) {
  this.frame = frame;
  this.parts = [];
}
PictRenderer.prototype = {
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
  'ICN#': function(item, data, path) {
    if (data.length !== 256) {
      console.warn('ICN#: bad length');
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
  PICT: function(item, path, bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var size = dv.getUint16(0, false);
    if (size < 24 || size > bytes.length) {
      console.error('PICT: bad length');
      return;
    }
    var renderer = new PictRenderer({
      top: dv.getInt16(2, false),
      left: dv.getInt16(4, false),
      bottom: dv.getInt16(6, false),
      right: dv.getInt16(8, false),
    });
    if (bytes[10] !== 0x11 && bytes[11] !== 0x01) {
      console.warn('PICT: unsupported version');
      return;
    }
    var op_i = 12;
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
    var clipRegion;
    pictV1Loop: for (;;) switch (bytes[op_i++]) {
      case 0xFF: break pictV1Loop;
      case 0x00: continue; // no-op
      case 0x01:
        renderer.clipRegion(region());
        continue;
      case 0x02:
        renderer.backgroundPattern(bytes.subarray(op_i, op_i + 8));
        op_i += 8;
        continue;
      case 0x03:
        renderer.fontNumber(dv.getUint16(op_i, false));
        op_i += 2;
        continue;
      case 0x04:
        renderer.fontFace(bytes[op_i++]);
        continue;
      case 0x05:
        renderer.textMode(dv.getUint16(op_i, false));
        op_i += 2;
        continue;
      case 0x06:
        renderer.extraSpace(fixedPoint.fromInt32(dv.getInt32(op_i, false)));
        op_i += 4;
        continue;
      case 0x07:
        renderer.penSize(dv.getUint16(op_i + 2, false), dv.getUint16(op_i, false));
        op_i += 4;
        continue;
      case 0x08:
        renderer.penMode(dv.getUint16(op_i, false));
        op_i += 2;
        continue;
      case 0x09:
        renderer.penPattern(bytes.subarray(op_i, op_i + 8));
        op_i += 8;
        continue;
      case 0x0A:
        renderer.fillPattern(bytes.subarray(op_i, op_i + 8));
        op_i += 8;
        continue;
      case 0x0B:
        renderer.ovalSize(dv.getUint16(op_i + 2, false), dv.getUint16(op_i, false));
        op_i += 4;
        continue;
      case 0x0C:
        renderer.origin(dv.getUint16(op_i + 2, false), dv.getUint16(op_i, false));
        op_i += 4;
        continue;
      case 0x0D:
        renderer.fontSize(dv.getUint16(op_i, false));
        op_i += 2;
        continue;
      case 0x0E:
        renderer.foregroundColor(dv.getUint32(op_i, false));
        op_i += 4;
        continue;
      case 0x0F:
        renderer.backgroundColor(dv.getUint32(op_i, false));
        op_i += 4;
        continue;
      case 0x10:
        renderer.txRatio(
          fixedPoint.fromInt32(dv.getInt32(op_i, false)),
          fixedPoint.fromInt32(dv.getInt32(op_i + 4, false)));
        op_i += 8;
        continue;
      case 0x11:
        renderer.picVersion(bytes[op_i++]);
        continue;
      case 0x20:
        renderer.startLine(dv.getInt16(op_i + 2, false), dv.getInt16(op_i, false));
        renderer.lineTo(dv.getInt16(op_i + 6, false), dv.getInt16(op_i + 4, false));
        op_i += 8;
        continue;
      case 0x21:
        renderer.lineTo(dv.getInt16(op_i + 2, false), dv.getInt16(op_i, false));
        op_i += 4;
        continue;
      case 0x22:
        renderer.startLine(dv.getInt16(op_i + 2, false), dv.getInt16(op_i, false));
        renderer.lineTo(dv.getInt8(op_i + 5, false), dv.getInt8(op_i + 4, false));
        op_i += 6;
        continue;
      case 0x23:
        renderer.lineTo(dv.getInt8(op_i + 1, false), dv.getInt8(op_i, false));
        op_i += 2;
        continue;
      case 0x28: // long text
        renderer.origin(dv.getUint16(op_i + 2, false), dv.getUint16(op_i, false));
        op_i += 4;
        renderer.text(macRoman(bytes, op_i+1, bytes[op_i]));
        op_i += 1 + bytes[op_i];
        continue;
      case 0x29:
        renderer.originOffset(dv.getInt8(op_i++), 0);
        renderer.text(macRoman(bytes, op_i+1, bytes[op_i]));
        op_i += 1 + bytes[op_i];
        continue;
      case 0x2A:
        renderer.originOffset(0, dv.getInt8(op_i++));
        renderer.text(macRoman(bytes, op_i+1, bytes[op_i]));
        op_i += 1 + bytes[op_i];
        continue;
      case 0x2B:
        renderer.originOffset(dv.getInt8(op_i), dv.getInt8(op_i + 1));
        op_i += 2;
        renderer.text(macRoman(bytes, op_i+1, bytes[op_i]));
        op_i += 1 + bytes[op_i];
        continue;
        
      case 0x30: renderer.op('rect', 'frame', renderer.rect = rect()); continue;
      case 0x31: renderer.op('rect', 'paint', renderer.rect = rect()); continue;
      case 0x32: renderer.op('rect', 'erase', renderer.rect = rect()); continue;
      case 0x33: renderer.op('rect', 'invert', renderer.rect = rect()); continue;
      case 0x34: renderer.op('rect', 'fill', renderer.rect = rect()); continue;
        
      case 0x38: renderer.op('rect', 'frame', renderer.rect); continue;
      case 0x39: renderer.op('rect', 'paint', renderer.rect); continue;
      case 0x3A: renderer.op('rect', 'erase', renderer.rect); continue;
      case 0x3B: renderer.op('rect', 'invert', renderer.rect); continue;
      case 0x3C: renderer.op('rect', 'fill', renderer.rect); continue;
        
      case 0x40: renderer.op('rrect', 'frame', renderer.rrect = rect()); continue;
      case 0x41: renderer.op('rrect', 'paint', renderer.rrect = rect()); continue;
      case 0x42: renderer.op('rrect', 'erase', renderer.rrect = rect()); continue;
      case 0x43: renderer.op('rrect', 'invert', renderer.rrect = rect()); continue;
      case 0x44: renderer.op('rrect', 'fill', renderer.rrect = rect()); continue;
        
      case 0x48: renderer.op('rrect', 'frame', renderer.rrect); continue;
      case 0x49: renderer.op('rrect', 'paint', renderer.rrect); continue;
      case 0x4A: renderer.op('rrect', 'erase', renderer.rrect); continue;
      case 0x4B: renderer.op('rrect', 'invert', renderer.rrect); continue;
      case 0x4C: renderer.op('rrect', 'fill', renderer.rrect); continue;

      case 0x50: renderer.op('oval', 'frame', renderer.oval = rect()); continue;
      case 0x51: renderer.op('oval', 'paint', renderer.oval = rect()); continue;
      case 0x52: renderer.op('oval', 'erase', renderer.oval = rect()); continue;
      case 0x53: renderer.op('oval', 'invert', renderer.oval = rect()); continue;
      case 0x54: renderer.op('oval', 'fill', renderer.oval = rect()); continue;
        
      case 0x58: renderer.op('oval', 'frame', renderer.oval); continue;
      case 0x59: renderer.op('oval', 'paint', renderer.oval); continue;
      case 0x5A: renderer.op('oval', 'erase', renderer.oval); continue;
      case 0x5B: renderer.op('oval', 'invert', renderer.oval); continue;
      case 0x5C: renderer.op('oval', 'fill', renderer.oval); continue;

      case 0x60: renderer.op('arc', 'frame', renderer.arc = arc()); continue;
      case 0x61: renderer.op('arc', 'paint', renderer.arc = arc()); continue;
      case 0x62: renderer.op('arc', 'erase', renderer.arc = arc()); continue;
      case 0x63: renderer.op('arc', 'invert', renderer.arc = arc()); continue;
      case 0x64: renderer.op('arc', 'fill', renderer.arc = arc()); continue;
        
      case 0x68: renderer.op('arc', 'frame', renderer.arc); continue;
      case 0x69: renderer.op('arc', 'paint', renderer.arc); continue;
      case 0x6A: renderer.op('arc', 'erase', renderer.arc); continue;
      case 0x6B: renderer.op('arc', 'invert', renderer.arc); continue;
      case 0x6C: renderer.op('arc', 'fill', renderer.arc); continue;

      case 0x70: renderer.op('arc', 'frame', renderer.poly = poly()); continue;
      case 0x71: renderer.op('arc', 'paint', renderer.poly = poly()); continue;
      case 0x72: renderer.op('arc', 'erase', renderer.poly = poly()); continue;
      case 0x73: renderer.op('arc', 'invert', renderer.poly = poly()); continue;
      case 0x74: renderer.op('arc', 'fill', renderer.poly = poly()); continue;
        
      case 0x78: renderer.op('arc', 'frame', renderer.poly); continue;
      case 0x79: renderer.op('arc', 'paint', renderer.poly); continue;
      case 0x7A: renderer.op('arc', 'erase', renderer.poly); continue;
      case 0x7B: renderer.op('arc', 'invert', renderer.poly); continue;
      case 0x7C: renderer.op('arc', 'fill', renderer.poly); continue;

      case 0x80: renderer.op('region', 'frame', renderer.region = region()); continue;
      case 0x81: renderer.op('region', 'paint', renderer.region = region()); continue;
      case 0x82: renderer.op('region', 'erase', renderer.region = region()); continue;
      case 0x83: renderer.op('region', 'invert', renderer.region = region()); continue;
      case 0x84: renderer.op('region', 'fill', renderer.region = region()); continue;
        
      case 0x88: renderer.op('region', 'frame', renderer.region); continue;
      case 0x89: renderer.op('region', 'paint', renderer.region); continue;
      case 0x8A: renderer.op('region', 'erase', renderer.region); continue;
      case 0x8B: renderer.op('region', 'invert', renderer.region); continue;
      case 0x8C: renderer.op('region', 'fill', renderer.region); continue;

      case 0x90:
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
        renderer.copyBits(rowBytes, bounds, srcRect, destRect, mode, rows);
        continue;
      case 0x91: console.error('copy bits to clipped region not supported'); return;
        
      case 0x98: // copy packed bits to clipped rect
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
        renderer.copyBits(rowBytes, bounds, srcRect, destRect, mode, unpacked);
        continue;
      case 0x99: console.error('PICT: copy packed bits to clipped region'); return;
      case 0xA0:
        renderer.comment(dv.getUint16(op_i, false));
        op_i += 2;
        continue;
      case 0xA1: 
        var kind = dv.getUint16(op_i, false);
        var len = dv.getUint16(op_i + 2, false);
        var commentData = bytes.subarray(op_i + 4, op_i + 4 + len);
        renderer.comment(kind, len);
        op_i += 4 + len;
        continue;
      default: console.error('PICT: unknown opcode 0x' + bytes[op_i-1].toString(16)); return;
    }
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
        var initOption = dv.getUint32(6, false);
        offset = 10;
        break;
      case 2:
        offset = 4;
        break;
      default:
        console.warn('unknown "snd " format version: ' + formatNumber);
        return;
    }
    if (dv.getUint16(offset, false) !== 1) {
      console.warn('audio data must have 1 sound command');
      return;
    }
    var command = dv.getUint16(offset + 2, false);
    if (command !== 0x8051 && command !== 0x8050) {
      console.warn('audio command must be bufferCmd or soundCmd');
      return;
    }
    if (dv.getUint16(offset + 4, false) !== 0) {
      console.warn('bufferCmd parameter must be 0');
      return;
    }
    var soundHeaderOffset = dv.getUint32(offset + 6, false);
    var headerType;
    var encoding = dv.getUint8(soundHeaderOffset + 20);
    if (encoding === 0) {
      headerType = 'standard';
    }
    else if (encoding === 0xff) {
      headerType = 'extended';
    }
    else if (encoding === 0xfe) {
      headerType = 'compressed';
    }
    else {
      console.warn('unknown encoding: 0x' + encoding.toString(16));
      return;
    }
    var dataOffset = dv.getUint32(soundHeaderOffset, false);
    var samplingRate = fixedPoint.fromInt32(dv.getInt32(soundHeaderOffset + 8, false));
    var loopStartPoint = dv.getUint32(soundHeaderOffset + 12, false);
    var loopEndPoint = dv.getUint32(soundHeaderOffset + 16, false);
    var baseFrequency = dv.getUint8(soundHeaderOffset + 21);
    var totalBytes, channels, sampleAreaOffset, bytesPerSample;
    if (headerType === 'standard') {
      totalBytes = dv.getUint32(soundHeaderOffset + 4, false);
      channels = 1;
      sampleAreaOffset = 22;
      bytesPerSample = 1;
    }
    else {
      channels = dv.getUint32(soundHeaderOffset + 4, false);
      var bitsPerSample = dv.getUint16(soundHeaderOffset + 48, false);
      if (bitsPerSample % 8 !== 0) {
        console.warn('unsupported bits per sample: ' + bitsPerSample);
        return;
      }
      bytesPerSample = bitsPerSample / 8;
      var totalFrames = dv.getUint32(soundHeaderOffset + 22, false);
      totalBytes = channels * totalFrames * bytesPerSample;
      sampleAreaOffset = 64;
    }
    var sampleDataOffset = soundHeaderOffset + sampleAreaOffset + dataOffset;
    postMessage({
      item: item,
      path: path,
      headline: 'file',
      file: makeWav(
        bytes.subarray(sampleDataOffset, sampleDataOffset + totalBytes),
        samplingRate,
        channels,
        bytesPerSample
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
};

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

function ondisk(disk, item) {
  return disk.get(512 * 2, 512).then(function(mdb) {
    mdb = new MasterDirectoryBlockView(
      mdb.buffer,
      mdb.byteOffset,
      mdb.byteLength);
    if (!mdb.hasValidSignature) {
      return Promise.reject('not an HFS volume');
    }
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
    return Promise.all([disk, catalog, overflow]);
  })
  .then(function(values) {
    var disk = values[0], catalog = values[1], overflow = values[2];

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
                  });
                }
              });
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
    case 'load':
      var item = message.item;
      ondisk(getBuffer(item + '/disk.img'), item);
      break;
    case 'load-blob':
      var item = message.item;
      ondisk(new BlobSource(message.blob), item);
      break;
  }
};
