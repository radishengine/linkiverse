
// SUDZ: Some Uncompressed Data in a Zip

// utility for reading and writing a subset of zip files
// - no file comment
// - no multi-part archives
// - no compression

define(function() {

  'use strict';
  
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
        resolve(new Uint8Array(this.result));
      }
      fr.addEventListener('error', onError);
      fr.addEventListener('loadend', onLoadEnd);
      fr.readAsText(blob);
    });
  }
  
  var decodeUTF8;
  var utf8dec = new TextDecoder('utf-8');
  decodeUTF8 = function(bytes) {
    return utf8dec.decode(bytes);
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
          var nameLength = dv.getUint16(0xA, true);
          var extraLength = dv.getUint16(0xC, true);
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
          var path = allPaths[i].match(/^files\/((?:[^\/]+\/)*)([^\/\.]*)(?:\.(.*))?$/);
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
          context[fileBase] = result[path];
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
            return merge(files, JSON.parse(valuesJsonText));
          });
        }
        return finalResult;
      });
    },
  };
  
  return sudz;

});
