
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
  
  var decodeUTF8;
  var utf8dec = new TextDecoder('utf-8');
  decodeUTF8 = function(bytes) {
    return utf8dec.decode(bytes);
  };
  
  var sudz = {
    fromBlob: function(blob) {
      var result = {};
      
      function readLocalRecord(localOffset, nameLength, extraLength) {
        return fetchBlobBytes(blob, localOffset, 0x1E + nameLength + extraLength)
        .then(function(rawLocal) {
          if (String.fromCharCode(rawLocal[0], rawLocal[1], rawLocal[2], rawLocal[3]) !== 'PK\3\4') {
            return Promise.reject('not a valid sudz file: local record does not have valid PK signature');
          }
          var dv = new DataView(rawLocal.buffer, rawLocal.byteOffset, rawLocal.byteLength);
          if (dv.getUint16(0x8, true) !== 0) {
            return Promise.reject('not a valid sudz file: all files must be uncompressed');
          }v
          var uncompressedSize = dv.getUint32(0x18, true);
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
          if (nameLength !== dv.getUint16(0x1A)
              || extraLength !== dv.getUint16(0x1C)
              || uncompressedSize !== dv.getUint32(0x12)) {
            return Promise.reject('not a valid sudz file: local/central record data length mismatch');
          }
          var data_offset = localOffset + 0x1E + nameLength + extraLength;
          var data_blob = blob.slice(data_offset, data_offset + uncompressedSize);
          if (extraLength > 0) {
            var extra_pos = 0xE + nameLength;
            var extra_end = extra_pos + extraLength;
            data_blob.extra = {};
            do {
              var extra_code = String.fromCharCode.apply(rawLocal[extra_pos], rawLocal[extra_pos + 1]);
              var extra_len = dv.getUint16(extra_pos + 2, false);
              extra_pos += 4;
              data_blob.extra[extra_code] = rawLocal.subarray(extra_pos, extra_pos + extra_len);
              extra_pos += extra_len;
            } while (extra_pos < extra_end);
          }
          var dosTime = dv.getUint16(0xA, true);
          var dosDate = dv.getUint16(0xC, true);
          var second = (dosTime & 31) * 2;
          var minute = (dosTime >> 5) & 63;
          var hour = (dosTime >> 11) & 31;
          var day = dosDate & 31;
          var month = (dosDate >> 5) & 15;
          var year = 1980 + (dosDate >> 9) & 127;
          month = ('0' + month).slice(-2);
          day = ('0' + day).slice(-2);
          second = ('0' + second).slice(-2);
          minute = ('0' + minute).slice(-2);
          hour = ('0' + hour).slice(-2);
          data_blob.iso8601 = year + '-' + month + '-' + day + 'T' + hour + ':' + minute + ':' + second;
          var fileName = decodeUTF8(rawLocal.subarray(0xE, 0xE + nameLength));
          result[fileName] = data_blob;
        });
      }
    
      var entryPromises;
      return fetchBlobBytes(blob, -22)
      .then(function(suffix) {
        if (String.fromCharCode.apply(null, suffix.subarray(0, 8)) !== 'PK\5\6\0\0\1\0' || suffix[20] || suffix[21]) {
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
          if (String.fromCharCode.apply(null, rawRecords.subarray(pos, pos + 4)) !== 'PK\1\2') {
            return Promise.reject('not a valid sudz file: central record ' + i + ' does not have valid PK signature');
          }
          var localOffset = dv.getUint32(pos + 0x2A, true);
          var nameLength = dv.getUint16(pos + 0x1C, true);
          var extraLength = dv.getUint16(pos + 0x1E, true);
          var commentLength = dv.getUint16(pos + 0x20, true);
          entryPromises[i] = readLocalRecord(localOffset, nameLength, extraLength);
          pos += 0x2E + nameLength + extraLength + commentLength;
        }
        return Promise.all(entryPromises);
      })
      .then(function() {
        return result;
      });
    },
  };
  
  return sudz;

});
