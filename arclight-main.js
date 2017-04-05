require(
['z/inflate', 'ags/GameView', 'ags/RoomView', 'ags/Runtime', 'playback/midi', 'specify'],
function(inflate, GameView, RoomView, Runtime, midi, specify) {

  'use strict';
  
  if ('KeyboardEvent' in window && !('key' in KeyboardEvent.prototype)) {
    require(['keyboardevent-key-polyfill'], function(lib){ lib.polyfill(); });
  }
  
  window.midi = midi;
  
  window.specify = specify;
  
  var audioContext = new AudioContext;
  
  function IAItem(identifier) {
    this.identifier = identifier;
  }

  IAItem.prototype = {
    getFileRequestUrl: function(filename) {
      return '//cors.archive.org/cors/' + this.identifier + '/' + filename;
    },
    pullXml: function(filename) {
      return fetch(this.getFileRequestUrl(filename), {cache:'force-cache'})
      .then(function(request) {
        return request.text();
      })
      .then(function(text) {
        return new DOMParser().parseFromString(text, 'application/xml');
      });
    },
    pullBlob: function(filename) {
      return fetch(this.getFileRequestUrl(filename), {cache:'force-cache'})
      .then(function(request) {
        return request.blob();
      });
    },
    getMetadata: function() {
      return this.pullXml(this.identifier + '_meta.xml')
      .then(function(xml) {
        var obj = {};
        for (var node = xml.documentElement.firstChild; node != null; node = node.nextSibling) {
          if (node.nodeType !== 1) continue;
          obj[node.nodeName] = node.textContent;
        }
        return Object.freeze(obj);
      });
    },
    getFiles: function() {
      return this.pullXml(this.identifier + '_files.xml')
      .then(function(xml) {
        var arr = {};
        for (var node = xml.documentElement.firstChild; node != null; node = node.nextSibling) {
          if (node.nodeName !== 'file') continue;
          var obj = {source: node.getAttribute('source')};
          for (var node2 = node.firstChild; node2 != null; node2 = node2.nextSibling) {
            if (node2.nodeType !== 1) continue;
            obj[node2.nodeName] = node2.textContent;
          }
          arr[node.getAttribute('name')] = obj;
        }
        return arr;
      });
    },
    getChildItems: function() {
      var self = this;
      return new Promise(function(resolve, reject) {
        var script = document.createElement('SCRIPT');
        var callbackNumber = 0;
        var callbackName;
        while (typeof window[callbackName = 'cb'+callbackNumber] !== 'undefined') {
          callbackNumber++;
        }
        window[callbackName] = function(data) {
          resolve(Object.freeze(data.response.docs.map(function(doc) {
            return new IAItem(doc.identifier);
          })));
          delete window[callbackName];
          document.head.removeChild(script);
        };
        script.type = 'text/javascript';
        script.src = '//archive.org/advancedsearch.php'
          + '?q='
            + 'collection:' + self.identifier
            + ' mediatype:software'
            + ' -subject:"game+creation-software"'
            + ' -ags_format_version:*'
          + '&fl[]=identifier'
          + '&sort[]=date+asc'
          + '&rows=100'
          + '&page=1'
          + '&output=json'
          + '&callback=' + callbackName
          + '&save=yes';
        document.head.appendChild(script);
      });
    },
  };

  var root = new IAItem('adventuregamestudio');

  function ZipRecord(zipBlob, localOffset) {
    this.zipBlob = zipBlob;
    this.localOffset = localOffset;
    this.localBlob = zipBlob.slice(localOffset, localOffset + 30);
  }
  ZipRecord.prototype = {
    getLocalDataView: function() {
      var self = this;
      return this._localBytes = this._localBytes
      || new Promise(function(resolve, reject) {
        var fr = new FileReader();
        fr.addEventListener('load', function() {
          resolve(new DataView(this.result));
        });
        fr.readAsArrayBuffer(self.localBlob);
      });
    },
    getCompressedBlob: function() {
      var self = this;
      return this._compressedBlob = this._compressedBlob
      || this.getLocalDataView().then(function(dv) {
        var compressedSize = dv.getUint32(18, true);
        var compressedOffset = self.localOffset + 30 + dv.getUint16(26, true) + dv.getUint16(28, true);
        return self.zipBlob.slice(compressedOffset, compressedOffset + compressedSize);
      });
    },
    getUncompressedBlob: function() {
      return this._uncompressedBlob = this._uncompressedBlob
      || Promise.all([this.getLocalDataView(), this.getCompressedBlob()])
        .then(function(values) {
          var dv = values[0], compressedBlob = values[1];
          var compressMode = dv.getUint16(8, true);
          if (compressMode === 0) return compressedBlob; // uncompressed
          if (compressMode !== 8) return Promise.reject('unsupported compression method');
          var uncompressedSize = dv.getUint32(22, true);
          return new Promise(function(resolve, reject) {
            var fr = new FileReader();
            fr.addEventListener('load', function() {
              var inflater = new inflate.State(-15);
              var output = new Uint8Array(uncompressedSize);
              inflater.next_in = new Uint8Array(this.result);
              inflater.next_out = output;
              if (inflater.inflate('finish') !== 'done') {
                reject('inflation failed');
                return;
              }
              resolve(new Blob([output]));
            });
            fr.readAsArrayBuffer(compressedBlob);
          });
        });
    },
  };
  ZipRecord.getAll = function(zipBlob) {
    var suffixOffset = Math.max(0, zipBlob.size - (0xffff + 22 + 3));
    return new Promise(function(resolve, reject) {
      var fr = new FileReader();
      fr.addEventListener('load', function() {
        resolve(new Uint8Array(this.result));
      });
      fr.readAsArrayBuffer(zipBlob.slice(suffixOffset));
    })
    .then(function(suffix) {
      var i = suffix.length - 22;
      var dv = new DataView(suffix.buffer, suffix.byteOffset, suffix.byteLength);
      findSignature: do {
        switch(suffix[i]) {
          case 0x50:
            if (dv.getUint32(i, true) === 0x06054b50 && dv.getUint16(i + 20) === (suffix.length - i - 22)) {
              break findSignature;
            }
            continue findSignature;
          case 0x4B:
            if (dv.getUint32(i-1, true) === 0x06054b50 && dv.getUint16(i + 19) === (suffix.length - i - 21)) {
              i--;
              break findSignature;
            }
            continue findSignature;
          case 0x05:
            if (dv.getUint32(i-2, true) === 0x06054b50 && dv.getUint16(i + 18) === (suffix.length - i - 20)) {
              i -= 2;
              break findSignature;
            }
            continue findSignature;
          case 0x06:
            if (dv.getUint32(i-3, true) === 0x06054b50 && dv.getUint16(i + 17) === (suffix.length - i - 19)) {
              i -= 3;
              break findSignature;
            }
            continue findSignature;
        }
        if ((i -= 4) < 4) {
          return Promise.reject('invalid zip file');
        }
      } while (1);
      if (dv.getUint16(i + 4, true) !== 0) {
        return Promise.reject('multipart zip not supported');
      }
      var centralOffset = dv.getUint32(i + 16, true);
      var centralLength = dv.getUint32(i + 12, true);
      if (centralOffset >= suffixOffset) {
        return new Uint8Array(suffix.buffer, suffix.byteOffset + centralOffset - suffixOffset, centralLength);
      }
      return new Promise(function(resolve, reject) {
        var fr = new FileReader();
        fr.addEventListener('load', function() {
          resolve(new Uint8Array(this.result));
        });
        fr.readAsArrayBuffer(zipBlob.slice(centralOffset, centralOffset + centralLength));
      });
    })
    .then(function(central) {
      var records = {};
      var pos = 0;
      var dv = new DataView(central.buffer, central.byteOffset, central.byteLength);
      while (pos < central.length) {
        if (dv.getUint32(pos, true) !== 0x02014b50) {
          return Promise.reject('invalid zip file');
        }
        var nameBytes = new Uint8Array(central.buffer, central.byteOffset + pos + 46, dv.getUint16(pos + 28, true));
        var name = String.fromCharCode.apply(null, nameBytes); // TODO: support utf-8 encoded
        records[name] = new ZipRecord(zipBlob, dv.getUint32(pos + 42, true));
        pos += 46 +
          nameBytes.length +
          dv.getUint16(pos + 30, true) +
          dv.getUint16(pos + 32, true);
      }
      return records;
    });
  }
  
  function readBlob(blob) {
    return new Promise(function(resolve, reject) {
      var fr = new FileReader();
      fr.addEventListener('load', function() {
        resolve(this.result);
      });
      fr.readAsArrayBuffer(blob);
    });
  }
  
  function loadGame(mainBlob, getRelativeBlob) {
    function onPrefix(prefix) {
      prefix = new Uint8Array(prefix);
      if (String.fromCharCode(prefix[0], prefix[1], prefix[2], prefix[3]) !== 'CLIB') {
        return Promise.reject('resource package not found');
      }
      var version = prefix[5];
      console.log('packing version: ' + version);
      switch (version) {
        default: return Promise.reject('unsupported packing format version: ' + version);
        case 6:
          return readBlob(mainBlob.slice(8, 10))
          .then(function(count) {
            count = new DataView(count).getUint16(0, true);
            var offset = 23 + count * (13 + 4 + 2);
            return readBlob(mainBlob.slice(23, offset))
            .then(function(fileData) {
              var files = {};
              var names = new Uint8Array(fileData, 0, 13 * count);
              var lengths = new DataView(fileData, names.byteLength, 4 * count);
              var flags = new DataView(fileData, names.byteLength + lengths.byteLength, 2 * count);
              for (var i = 0; i < count; i++) {
                var name = String.fromCharCode.apply(null, names.subarray(13 * i, 13 * (i + 1))).replace(/\0.*/, '');
                name = name.toLowerCase();
                var length = lengths.getUint32(i * 4, true);
                files[name] = mainBlob.slice(offset, offset + length);
                offset += length;
              }
              return files;
            });
          });
        case 10:
        case 11:
        case 15:
          return readBlob(mainBlob.slice(6, 11))
          .then(function(bytes) {
            bytes = new Uint8Array(bytes);
            if (bytes[0] !== 0) return Promise.reject('not first datafile in chain');
            var containers = new Array((bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] << 24)) >>> 0);
            var fileCountOffset = 6 + 1 + 4 + 20*containers.length;
            return readBlob(mainBlob.slice(fileCountOffset, fileCountOffset + 4))
            .then(function(bytes) {
              bytes = new Uint8Array(bytes);
              var files = new Array((bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0);
              return readBlob(mainBlob.slice(6 + 1 + 4, fileCountOffset + 4 + 25*files.length + 4*files.length + 4*files.length + files.length))
              .then(function(listData) {
                var dv = new DataView(listData);
                listData = new Uint8Array(listData);
                var pos = 0;
                for (var i = 0; i < containers.length; i++) {
                  containers[i] = String.fromCharCode.apply(null, listData.subarray(pos, pos + 20)).match(/^[^\0]*/)[0];
                  if (/^ac2game\.(dat|ags)$/i.test(containers[i])) {
                    containers[i] = Promise.resolve(mainBlob);
                  }
                  else {
                    containers[i] = getRelativeBlob(containers[i]);
                  }
                  pos += 20;
                }
                pos += 4;
                if (version === 10) {
                  for (var i = 0; i < files.length; i++) {
                    files[i] = {
                      name: String.fromCharCode.apply(null, listData.subarray(pos, pos + 25)).match(/^[^\0]*/)[0],
                    };
                    pos += 25;
                  }
                }
                else {
                  var maskbuf = new Uint8Array(25);
                  const mask = 'My\x01\xDE\x04Jibzle';
                  for (var i = 0; i < files.length; i++) {
                    for (var j = 0; j < maskbuf.length; j++) {
                      if ((maskbuf[j] = 0xFF & (listData[pos + j] - mask.charCodeAt(j % mask.length))) === 0) {
                        break;
                      }
                    }
                    files[i] = {
                      name: String.fromCharCode.apply(null, maskbuf.subarray(0, j)),
                    };
                    pos += 25;
                  }
                }
                for (var i = 0; i < files.length; i++) {
                  files[i].offset = dv.getInt32(pos, true);
                  pos += 4;
                }
                for (var i = 0; i < files.length; i++) {
                  files[i].length = dv.getInt32(pos, true);
                  pos += 4;
                }
                for (var i = 0; i < files.length; i++) {
                  files[i].container = containers[listData[pos++]];
                }
                var promises = [];
                var fileMap = {};
                function addFile(file, blob) {
                  fileMap[file.name] = blob.slice(file.offset, file.offset + file.length);
                }
                for (var i = 0; i < files.length; i++) {
                  promises.push(files[i].container.then(addFile.bind(null, files[i])));
                }
                return Promise.all(promises).then(function() {
                  return fileMap;
                });
              });
            });
          });
      }
    }
    return readBlob(mainBlob.slice(mainBlob.size - 16)).then(function(suffix) {
      if (String.fromCharCode.apply(null, new Uint8Array(suffix, 4, 12)) === 'CLIB\x01\x02\x03\x04SIGE') {
        mainBlob = mainBlob.slice(new DataView(suffix, 0, 4).getUint32(0, true), mainBlob.size - 16);
      }
      return readBlob(mainBlob.slice(0, 6)).then(onPrefix);
    });
  }
  
  function fromZip(zipRecords) {
    var filenames = Object.keys(zipRecords);
    var gameFiles = [];
    for (var i = 0; i < filenames.length; i++) {
      if (/(^|\/)ac2game.dat$/i.test(filenames[i]) || /\.exe$/i.test(filenames[i])) {
        gameFiles.push(filenames[i]);
      }
    }
    if (gameFiles.length === 0) {
      return Promise.reject('no game file found');
    }
    if (gameFiles.length > 1) {
      gameFiles = gameFiles.filter(function(path) {
        return !/(^|\/)((win)?setup|ac(win|dos)?|cwsdpmi|uninstal(l|ler)?|startup|launch(er)?)\.exe$/i.test(path);
      });
      if (gameFiles.length > 1) {
        for (var i = 1; i < gameFiles.length; i++) {
          if (/(^|\/)ac2game.dat$/i.test(gameFiles[i])) {
            gameFiles.splice(0, 0, gameFiles.splice(i, 1)[0]);
            break;
          }
        }
      }
    }
    if (gameFiles.length > 1) {
      console.warn('more than one game file found');
    }
    console.log(gameFiles[0]);
    var gameFile = zipRecords[gameFiles[0]];
    gameFile.getUncompressedBlob().then(function(uncompressed) {
      var folder = gameFiles[0].replace(/\/[^\/]*$/, '/');
      if (folder.indexOf('/') === -1) folder = '';
      return loadGame(uncompressed, function getRelativeBlob(path) {
        path = folder + path;
        var record = zipRecords[path];
        if (!record) {
          path = path.toUpperCase();
          for (var k in zipRecords) {
            if (k.toUpperCase() === path) {
              record = zipRecords[path];
              break;
            }
          }
          if (!record) {
            return Promise.reject('file not found');
          }
        }
        return record.getUncompressedBlob();
      });
    })
    .then(function(files) {
      var fileSystem = {
        getName: function(name) {
          if (name instanceof RegExp) {
            for (var k in files) {
              if (name.test(k)) return k;
            }
            return null;
          }
          if (name in files) return name;
          name = name.toUpperCase();
          if (name in files) return name;
          for (var k in files) {
            if (k.toUpperCase() === name) return k;
          }
          return null;
        },
        getNames: function(regex) {
          var list = [];
          for (var k in files) {
            if (regex.test(k)) list.push(k);
          }
          return list;
        },
        loadAsBlob: function(name) {
          name = this.getName(name);
          return name ? Promise.resolve(files[name]) : Promise.reject('file not found');
        },
        loadAsArrayBuffer: function(name) {
          return this.loadAsBlob(name).then(function(blob) {
            return new Promise(function(resolve, reject) {
              var fr = new FileReader();
              fr.addEventListener('load', function() {
                resolve(this.result);
              });
              fr.readAsArrayBuffer(blob);
            });
          });
        },
      };
      var runtime = new Runtime(audioContext, fileSystem);
      runtime.element.style.position = 'fixed';
      runtime.element.style.right = 0;
      runtime.element.style.top = 0;
      var ctx = runtime.element.getContext('2d');
      document.body.appendChild(runtime.element);
      runtime.element.focus();
      runtime.begin();
      window.runtime = runtime;
      console.dir(window.files = files);
    });
  }
  
  function getWindowsExeParts(blob) {
    var peOffset;
    return readBlob(blob.slice(60, 64)).then(function(raw) {
      peOffset = new DataView(raw).getUint32(0, true);
      if (peOffset < 64 || peOffset > blob.size - 4) {
        return Promise.reject('not a valid windows exe');
      }
      return readBlob(blob.slice(peOffset, peOffset + 24));
    })
    .then(function(raw) {
      var peHeader = new DataView(raw);
      if (peHeader.getUint32(0, true) !== 0x4550) {
        return Promise.reject('not a valid windows exe');
      }
      var optionalHeaderOffset = peOffset + peHeader.byteLength;
      var optionalHeaderSize = peHeader.getUint16(20, true);
      var sectionsOffset = optionalHeaderOffset + optionalHeaderSize;
      var sectionCount = peHeader.getUint16(6, true);
      var parts = {sections:[], dataDirs:[], overlay:null};
      var promises = [];
      promises.push(readBlob(blob.slice(sectionsOffset, sectionsOffset + sectionCount*40))
        .then(function(raw) {
          var sections = new DataView(raw);
          for (var offset = 0; offset < sections.byteLength; offset += 40) {
            var sectionOffset = sections.getUint32(offset + 20, true);
            var sectionLength = sections.getUint32(offset + 16, true);
            var sectionEnd = sectionOffset + sectionLength;
            var sectionBlob = blob.slice(sectionOffset, sectionOffset + sectionLength);
            sectionBlob.offset = sectionOffset;
            sectionBlob.name = String.fromCharCode.apply(null, new Uint8Array(raw, offset, 8)).match(/^[^\0]*/)[0];
            parts.sections.push(sectionBlob);
          }
        }));
      if (optionalHeaderSize > 96) {
        promises.push(readBlob(blob.slice(optionalHeaderOffset + 92, optionalHeaderOffset + optionalHeaderSize))
          .then(function(raw) {
            var rvaAndSizes = new DataView(raw, 4, new DataView(raw, 0, 4).getUint32(0, true) * 8);
            for (var offset = 0; offset < rvaAndSizes.byteLength; offset += 8) {
              var dirOffset = rvaAndSizes.getUint32(offset, true);
              var dirLength = rvaAndSizes.getUint32(offset + 4, true);
              var dirBlob = blob.slice(dirOffset, dirOffset + dirLength);
              dirBlob.offset = dirOffset;
              parts.dataDirs.push(dirBlob);
            }
          }));
      }
      return Promise.all(promises).then(function() {
        var endPos = 0;
        for (var i = 0; i < parts.sections.length; i++) {
          var sectionEnd = parts.sections[i].offset + parts.sections[i].size;
          if (sectionEnd <= blob.size) {
            endPos = Math.max(endPos, sectionEnd);
          }
        }
        for (var i = 0; i < parts.dataDirs.length; i++) {
          var dirEnd = parts.dataDirs[i].offset + parts.dataDirs[i].size;
          if (dirEnd <= blob.size) {
            endPos = Math.max(endPos, dirEnd);
          }
        }
        parts.overlay = blob.slice(endPos);
        parts.overlay.offset = endPos;
        return parts;
      });
    });
  }
  
  function fromExe(blob) {
    return readBlob(blob.slice(blob.size - 256 - 22)).then(function(suffix) {
      if (String.fromCharCode.apply(null, new Uint8Array(suffix, suffix.byteLength - 12, 12)) === 'CLIB\x01\x02\x03\x04SIGE') {
        return loadGame(blob, function getRelativeBlob() {
          return Promise.reject('file not found');
        });
      }
      suffix = new DataView(suffix);
      for (var i = suffix.byteLength - 4; i >= 0; i--) {
        if (suffix.getUint32(i, true) === 0x06054B50) {
          blob = blob.slice(0, (blob.size - suffix.byteLength) + i + 22 + suffix.getUint16(i + 20, true));
          return ZipRecord.getAll(blob).then(fromZip);
        }
      }
      return getWindowsExeParts(blob).then(function(parts) {
        var promises = [];
        for (var i = 0; i < parts.sections.length; i++) {
          if (parts.sections[i].name === '.data') {
            promises.push(
              readBlob(parts.sections[i]).then(function(data) {
                var dv = new DataView(data);
                for (var i = 0; i < data.byteLength - 6; i++) {
                  if (dv.getUint32(i, true) === 0x54677777 && dv.getUint16(i + 4, true) === 0x4829) {
                    var chunkHeader = new DataView(data, i + 6, 12);
                    var chunkType = chunkHeader.getUint16(0, true);
                    var chunkFlags = chunkHeader.getUint16(2, true);
                    var packedSize = chunkHeader.getUint32(4, true);
                    var unpackedSize = chunkHeader.getUint32(8, true);
                    break;
                  }
                }
              }));
          }
        }
        return Promise.all(promises);
      });
    });
  }

  function clickItem() {
    var item = this.item;
    item.getFiles().then(function(files) {
      var filenames = Object.keys(files);
      var zips = [], exes = [];
      for (var i = 0; i < filenames.length; i++) {
        if (/\.zip$/i.test(filenames[i])) {
          zips.push(filenames[i]);
        }
        else if (/\.exe$/i.test(filenames[i])) {
          exes.push(filenames[i]);
        }
      }
      if (zips.length === 0) {
        if (exes.length === 0) {
          return Promise.reject('no zip found');
        }
        if (exes.length > 1) {
          return Promise.reject('more than one exe found');
        }
        return item.pullBlob(exes[0]).then(fromExe);
      }
      if (zips.length > 1) {
        return Promise.reject('more than one zip found');
      }
      return item.pullBlob(zips[0]).then(ZipRecord.getAll).then(fromZip);
    });
  }

  root.getChildItems()
  .then(function(childItems) {
    var itemList = document.getElementById('item-list-container');
    var baseIndex = 0;
    itemList.style.height = (childItems.length * 4) + 'ex';
    for (var i = 0; i < childItems.length; i++) {
      var item = childItems[i];
      var itemEl = document.createElement('DIV');
      itemEl.item = item;
      itemEl.addEventListener('click', clickItem);
      itemEl.className = 'item';
      itemEl.innerText = item.identifier;
      itemEl.style.top = ((baseIndex + i) * 4) + 'ex'; 
      itemList.appendChild(itemEl);
    }
  });
  

});
