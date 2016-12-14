
// SUDZ: Some Uncompressed Data in a Zip

// utility for reading and writing a subset of zip files
// - no file comment
// - no multi-part archives
// - no compression

define(function() {

  'use strict';
  
  // percent-encode same as encodeURIComponent except add . * and leave space
  function encodePathComponent(str) {
    return str.replace(/[^ ]+/g, encodeURIComponent).replace(/[\.\*]/g, function(c) {
      return '%' + ('0' + c.charCodeAt(0).toString(16)).slice(-2);
    });
  }
  
  function fetchBlobBytes(blob, offset, length) {
    if (arguments.length > 1) {
      if (offset < 0) {
        if (-offset > blob.size) {
          return Promise.reject('expected ' + (-offset) + ' bytes, got ' + blob.size);
        }
        offset += blob.size;
      }
      if (arguments.length > 2) {
        if ((offset + length) > blob.size) {
          return Promise.reject('expected ' + length + ' bytes, got ' + (blob.size - offset));
        }
        blob = blob.slice(offset, offset + length);
      }
      else if (offset > 0) {
        if (offset > blob.size) {
          return Promise.reject('offset ' + offset + ' beyond maximum (' + blob.size + ')');
        }
        blob = blob.slice(offset);
      }
    }
    return new Promise(function(resolve, reject) {
      var fr = new FileReader();
      function onError(e) {
        fr.removeEventListener('error', onError);
        fr.removeEventListener('loadend', onLoadEnd);
        reject(e.message);
      }
      function onLoadEnd(e) {
        fr.removeEventListener('error', onError);
        fr.removeEventListener('loadend', onLoadEnd);
        resolve(new Uint8Array(this.result));
      }
      fr.addEventListener('error', onError);
      fr.addEventListener('loadend', onLoadEnd);
      fr.readAsArrayBuffer(blob);
    });
  }
  
  function fetchBlobText(blob) {
    return new Promise(function(resolve, reject) {
      var fr = new FileReader();
      function onError(e) {
        fr.removeEventListener('error', onError);
        fr.removeEventListener('loadend', onLoadEnd);
        reject(e.message);
      }
      function onLoadEnd(e) {
        fr.removeEventListener('error', onError);
        fr.removeEventListener('loadend', onLoadEnd);
        resolve(this.result);
      }
      fr.addEventListener('error', onError);
      fr.addEventListener('loadend', onLoadEnd);
      fr.readAsText(blob);
    });
  }
  
  var promiseCRCTable = new Promise(function(resolve, reject) {
    var CRC = new Int32Array(256);
    for (var i = 0; i < 256; i++) {
      CRC[i] = i;
      for (var j = 0; j < 8; j++) {
        CRC[i] = CRC[i] & 1 ? 0xEDB88320 ^ (CRC[i] >>> 1) : (CRC[i] >>> 1);
      }
    }
    resolve(CRC);
  });
  
  Blob.prototype.getCRC32 = function() {
    var self = this;
    return Promise.all([fetchBlobBytes(this), promiseCRCTable])
    .then(function(values) {
      var bytes = values[0], CRC = values[1];
      var crc = -1;
      for (var i = 0; i < bytes.length; i++) {
        crc = CRC[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
      }
      crc ^= -1;
      self.getCRC32 = Promise.resolve(crc);
      return crc;
    });
  };
  
  var decodeUTF8, encodeUTF8;
  var utf8dec = new TextDecoder('utf-8'), utf8enc = new TextEncoder('utf-8');
  decodeUTF8 = function(bytes) {
    return utf8dec.decode(bytes);
  };
  encodeUTF8 = function(str) {
    return utf8enc.encode(str);
  };
  
  function SudzWriter() {
    this.files = {};
  }
  SudzWriter.prototype = {
    createBlob: function() {
      var localRecords = [], centralRecords = [];
      localRecords.byteLength = centralRecords.byteLength = 0;
      var localTemplate = new Uint8Array(0x1E);
      var centralTemplate = new Uint8Array(0x2E);
      localTemplate.set([
        0x50, 0x4B, 0x03, 0x04, // PK signature
        0x0A, 0x00, // zip spec version
        0x00, 0x08, // flags: utf-8
      ]);
      centralTemplate.set([
        0x50, 0x4B, 0x01, 0x02, // PK signature
        0x0A, 0x00, // zip spec version, creating system
        0x0A, 0x00, // required zip spec version
        0x00, 0x08, // flags: utf-8
      ]);
      var allPaths = Object.keys(this.files);
      var now = new Date();
      var promisedCRCs = [];
      function setCRC(file, localDV, centralDV) {
        promisedCRCs.push(file.getCRC32().then(function(crc) {
          localDV.setInt32(0xE, crc, true);
          centralDV.setInt32(0x10, crc, true);
        }));
      }
        
      for (var i = 0; i < allPaths.length; i++) {
        var path = allPaths[i];
        var file = this.files[path];
        var pathBytes = encodeUTF8(path);
        
        var lastModified;
        if (typeof file.lastModifiedISO8601 === 'string') {
          lastModified = new Date(file.lastModifiedISO8601);
        }
        else if (typeof file.lastModified === 'number') {
          lastModified = new Date(file.lastModified);
        }
        else {
          lastModified = file.lastModifiedDate || now;
        }
        var dosDate = lastModified.getUTCDate()
            | ((lastModified.getUTCMonth() + 1) << 5)
            | (((lastModified.getUTCFullYear() - 1980) & 0x31) << 9);
        var dosTime = (lastModified.getUTCSeconds() >> 1)
            | (lastModified.getUTCMinutes() << 5)
            | (lastModified.getUTCHours() << 11);
        
        var local = new Uint8Array(localTemplate);
        var central = new Uint8Array(centralTemplate);
        
        var localDV = new DataView(local.buffer, local.byteOffset, local.byteLength);
        var centralDV = new DataView(central.buffer, central.byteOffset, central.byteLength);
        
        centralDV.setUint16(0x0C, dosTime, true);
        centralDV.setUint16(0x0E, dosDate, true);
        centralDV.setUint32(0x14, file.size, true);
        centralDV.setUint32(0x18, file.size, true);
        centralDV.setUint16(0x1C, pathBytes.length, true);
        centralDV.setUint32(0x2A, localRecords.byteLength, true);
        
        centralRecords.push(central, pathBytes);
        centralRecords.byteLength += central.length + pathBytes.length;
        
        localDV.setUint16(0x0A, dosTime, true);
        localDV.setUint16(0x0C, dosDate, true);
        localDV.setUint32(0x12, file.size, true);
        localDV.setUint32(0x16, file.size, true);
        localDV.setUint16(0x1A, pathBytes.length, true);
        
        localRecords.push(local, pathBytes, file);
        localRecords.byteLength += local.length + pathBytes.length + file.size;
        
        setCRC(file, localDV, centralDV);
      }
      var suffix = new Uint8Array(0x16);
      suffix.set([
        0x50, 0x4B, 0x05, 0x06, // PK signature
      ]);
      var suffixDV = new DataView(suffix.buffer, suffix.byteOffset, suffix.byteLength);
      suffixDV.setUint16(0x08, allPaths.length, true);
      suffixDV.setUint16(0x0A, allPaths.length, true);
      suffixDV.setUint32(0x0C, centralRecords.byteLength, true);
      suffixDV.setUint32(0x10, localRecords.byteLength, true);
      var parts = localRecords.concat(centralRecords, [suffix]);
      return Promise.all(promisedCRCs).then(function() {
        return new Blob(parts, {type:'application/zip'});
      });
    },
  };
  
  var sudz = {
    fromBlob: function(blob) {
      var result = {};
      
      function readLocalRecord(localOffset, fileName, extra) {
        return fetchBlobBytes(blob, localOffset, 0x1E)
        .then(function(rawLocal) {
          if (String.fromCharCode(rawLocal[0], rawLocal[1], rawLocal[2], rawLocal[3]) !== 'PK\x03\x04') {
            return Promise.reject('not a valid sudz file: local record does not have valid PK signature');
          }
          var dv = new DataView(rawLocal.buffer, rawLocal.byteOffset, rawLocal.byteLength);
          if (dv.getUint16(0x8, true) !== 0) {
            return Promise.reject('not a valid sudz file: all files must be uncompressed');
          }
          var uncompressedSize = dv.getUint32(0x16, true);
          if (uncompressedSize === 0xffffffff) {
            return Promise.reject('not a valid sudz file: 64-bit archives are not supported');
          }
          var flags = dv.getUint16(0x6, true);
          if (flags & (1 << 3)) {
            return Promise.reject('not a valid sudz file: data descriptor mode is not supported');
          }
          if (flags & (1 | (1 << 6))) {
            return Promise.reject('not a valid sudz file: encryption is not supported');
          }
          if (flags & (1 << 11) === 0) {
            return Promise.reject('not a valid sudz file: text encoding must be UTF-8');
          }
          var nameLength = dv.getUint16(0x1A, true);
          var extraLength = dv.getUint16(0x1C, true);
          var data_offset = localOffset + 0x1E + nameLength + extraLength;
          var data_blob = blob.slice(data_offset, data_offset + uncompressedSize);
          var gotExtra;
          var dosTime = dv.getUint16(0xA, true);
          var dosDate = dv.getUint16(0xC, true);
          var second = (dosTime & 31) * 2;
          var minute = (dosTime >> 5) & 63;
          var hour = (dosTime >> 11) & 31;
          var day = dosDate & 31;
          var month = (dosDate >> 5) & 15;
          var year = 1980 + ((dosDate >> 9) & 127);
          month = ('0' + month).slice(-2);
          day = ('0' + day).slice(-2);
          second = ('0' + second).slice(-2);
          minute = ('0' + minute).slice(-2);
          hour = ('0' + hour).slice(-2);
          data_blob.iso8601 = year + '-' + month + '-' + day + 'T' + hour + ':' + minute + ':' + second;
          result[fileName] = data_blob;
          data_blob.extra = extra;
          if (extraLength === 0 || Object.keys(extra).length > 0) return;
          return fetchBlobBytes(blob, localOffset + 0xE + nameLength, extraLength)
          .then(function(rawExtra) {
            var pos = 0;
            var dv = new DataView(rawExtra.buffer, rawExtra.byteOffset, rawExtra.byteLength);
            do {
              var extra_code = String.fromCharCode.apply(rawExtra[pos], rawExtra[pos + 1]);
              var extra_len = dv.getUint16(pos + 2, true);
              pos += 4;
              extra[extra_code] = rawExtra.subarray(pos, pos + extra_len);
              pos += extra_len;
            } while (pos < rawExtra.length);
          });
        });
      }
    
      var entryPromises;
      return fetchBlobBytes(blob, -22)
      .then(function(suffix) {
        if (String.fromCharCode.apply(null, suffix.subarray(0, 8)) !== 'PK\x05\x06\x00\x00\x00\x00' || suffix[20] || suffix[21]) {
          return Promise.reject('not a valid sudz file: must be a single-part zip with no file comment');
        }
        var dv = new DataView(suffix.buffer, suffix.byteOffset, suffix.byteLength);
        var recordCount = dv.getUint16(8, true);
        if (recordCount !== dv.getUint16(10, true)) {
          return Promise.reject('not a valid sudz file: local record count does not match global record count');
        }
        entryPromises = new Array(recordCount);
        var recordsByteLength = dv.getUint32(12, true);
        var recordsByteOffset = dv.getUint32(16, true);
        if ((recordsByteOffset + recordsByteLength) > (blob.size - 22)) {
          return Promise.reject('not a valid sudz file: record data is too long');
        }
        return fetchBlobBytes(blob, recordsByteOffset, recordsByteLength);
      })
      .then(function(rawRecords) {
        var dv = new DataView(rawRecords.buffer, rawRecords.byteOffset, rawRecords.byteLength);
        var pos = 0;
        for (var i = 0; i < entryPromises.length; i++) {
          if (pos > rawRecords.length) {
            return Promise.reject('not a valid sudz file: expecting ' + recordCount + ' records, only found data for ' + i);
          }
          if (String.fromCharCode.apply(null, rawRecords.subarray(pos, pos + 4)) !== 'PK\x01\x02') {
            return Promise.reject('not a valid sudz file: central record ' + i + ' does not have valid PK signature');
          }
          var localOffset = dv.getUint32(pos + 0x2A, true);
          var nameLength = dv.getUint16(pos + 0x1C, true);
          var extraLength = dv.getUint16(pos + 0x1E, true);
          var commentLength = dv.getUint16(pos + 0x20, true);
          var fileName = decodeUTF8(rawRecords.subarray(pos + 0x2E, pos + 0x2E + nameLength));
          var extra = {};
          if (extraLength > 0) {
            var extra_pos = pos + 0x2E + nameLength;
            var extra_end = extra_pos + extraLength;
            do {
              var extra_code = String.fromCharCode(rawRecords[extra_pos], rawRecords[extra_pos + 1]);
              var extra_len = dv.getUint16(extra_pos + 2, true);
              extra_pos += 4;
              extra[extra_code] = rawRecords.subarray(extra_pos, extra_pos + extra_len);
              extra_pos += extra_len;
            } while (extra_pos < extra_end);
          }
          entryPromises[i] = readLocalRecord(localOffset, fileName, extra);
          pos += 0x2E + nameLength + extraLength + commentLength;
        }
        return Promise.all(entryPromises);
      })
      .then(function() {
        var files = {};
        var allPaths = Object.keys(result);
        for (var i = 0; i < allPaths.length; i++) {
          var path = allPaths[i].match(/^files\/((?:[^\/]*\/)*)([^\/]*)\.([^\/\.]+)$/);
          if (!path) continue;
          var folders = path[1], fileBase = path[2], fileExtension = path[3];
          var context = files;
          if (folders) {
            folders = folders.substring(0, folders.length - 1).split(/\//g);
            for (var j = 0; j < folders.length; j++) {
              var folderName = decodeURIComponent(folders[j]);
              if (Object.prototype.hasOwnProperty.call(context, folderName)) {
                context = context[folderName];
              }
              else {
                context = context[folderName] = {};
              }
            }
          }
          fileBase = decodeURIComponent(fileBase);
          context[fileBase] = result[allPaths[i]];
        }
        var finalResult = Promise.resolve(files);
        var valuesJsonBlob = result['values.json'];
        if (valuesJsonBlob) {
          finalResult = Promise.all([finalResult, fetchBlobText(valuesJsonBlob)])
          .then(function(values) {
            var files = values[0], valuesJsonText = values[1];
            function merge(target, source) {
              var keys = Object.keys(source);
              for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                var value = source[key];
                if (typeof value === 'object' && value !== null && Object.prototype.hasOwnProperty.call(target, key)) {
                  merge(target[key], value);
                }
                else {
                  target[key] = value;
                }
              }
            }
            merge(files, JSON.parse(valuesJsonText));
            return files;
          });
        }
        return finalResult;
      });
    },
    makeBlob: function(source) {
      var writer = new SudzWriter();
      writer.files['data.json'] = new Blob([JSON.stringify(source)], {type:'application/json'});
      return writer.createBlob();
    },
  };
  
  return sudz;

});
