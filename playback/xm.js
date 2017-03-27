define(function() {

  'use strict';
  
  const BUFFER_SIZE = 32 * 1024;
  
  function getBuffered(blob, offset, length) {
    var buffer = blob.buffer;
    if (buffer && offset >= buffer.byteOffset && (offset + length) <= (buffer.byteOffset + buffer.byteLength)) {
      return Promise.resolve(new Uint8Array(buffer, offset - buffer.byteOffset, length));
    }
    return new Promise(function(resolve, reject) {
      var fr = new FileReader();
      fr.addEventListener('load', function() {
        if (length < BUFFER_SIZE) {
          blob.buffer = this.result;
          blob.buffer.byteOffset = offset;
        }
        resolve(new Uint8Array(this.result, 0, length));
      });
      fr.readAsArrayBuffer(blob.slice(offset, Math.min(blob.size, offset + Math.max(BUFFER_SIZE, length))));
    });
  }
  
  function XMHeaderView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  XMHeaderView.prototype = {
    get signature() {
      return String.fromCharCode.apply(null, this.bytes.subarray(0, 17));
    },
    get hasValidSignature() {
      return this.signature === 'Extended Module: ';
    },
    get name() {
      return String.fromCharCode.apply(null, this.bytes.subarray(17, 37));
    },
    // byte at offset 37: always 0x1a
    get trackerName() {
      return String.fromCharCode.apply(null, this.bytes.subarray(38, 58));
    },
    get versionMinor() {
      return this.bytes[58];
    },
    get versionMajor() {
      return this.bytes[59];
    },
    get byteLength() {
      return 60 + this.dv.getUint32(60, true);
    },
    get patternOrderSize() {
      return this.dv.getUint16(64, true);
    },
    get restartPosition() {
      return this.dv.getUint16(66, true);
    },
    get channelCount() {
      return this.dv.getUint16(68, true);
    },
    get patternCount() {
      return this.dv.getUint16(70, true);
    },
    get instrumentCount() {
      return this.dv.getUint16(72, true);
    },
    get flags() {
      return this.dv.getUint16(74, true);
    },
    get frequencyTableMode() {
      return (this.flags & 1) ? 'amiga' : 'linear';
    },
    get defaultTempo() {
      return this.dv.getUint16(76, true);      
    },
    get defaultBeatsPerMinute() {
      return this.dv.getUint16(78, true);      
    },
    get patternOrder() {
      var data = this.bytes.subarray(80, 80 + this.patternOrderSize);
      Object.defineProperty(this, 'patternOrder', {value:data});
      return data;
    },
  };
  
  function XMPatternHeaderView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  XMPatternHeaderView.prototype = {
    get headerByteLength() {
      return this.dv.getUint32(0, true);
    },
    get packingType() {
      return this.dv.getUint8(4); // always 0
    },
    get rowCount() {
      return this.dv.getUint16(5, true);
    },
    get dataByteLength() {
      return this.dv.getUint16(7, true);
    },
  };
  
  function XMInstrumentHeaderView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  XMInstrumentHeaderView.prototype = {
    get headerByteLength() {
      return this.dv.getUint32(0, true);
    },
    get name() {
      return String.fromCharCode.apply(null, this.bytes.subarray(4, 26));
    },
    get type() {
      return this.dv.getUint8(26);
    },
    get sampleCount() {
      return this.dv.getUint16(27, true);
    },
    get sampleHeaderSize() {
      return (this.sampleCount === 0) ? 0 : this.dv.getUint32(29, true);
    },
    // following are only defined if sampleCount > 0
    get noteSamples() {
      var bytes = this.bytes.subarray(33, 129);
      Object.defineProperty(this, 'noteSamples', {value:bytes});
      return bytes;
    },
    get volumeEnvelopePoints() {
      var bytes = this.bytes.subarray(129, 177);
      Object.defineProperty(this, 'volumeEnvelopePoints', {value:bytes});
      return bytes;
    },
    get panningEnvelopePoints() {
      var bytes = this.bytes.subarray(177, 225);
      Object.defineProperty(this, 'panningEnvelopePoints', {value:bytes});
      return bytes;
    },
    get volumePointCount() {
      return this.bytes[225];
    },
    get panningPointCount() {
      return this.bytes[226];
    },
    get volumeSustainPoint() {
      return this.bytes[227];
    },
    get volumeLoopStartPoint() {
      return this.bytes[228];
    },
    get volumeLoopEndPoint() {
      return this.bytes[229];
    },
    get panningSustainPoint() {
      return this.bytes[230];
    },
    get panningLoopStartPoint() {
      return this.bytes[231];
    },
    get panningLoopEndPoint() {
      return this.bytes[232];
    },
    get volumeOn() {
      return this.bytes[233] & 1;
    },
    get volumeSustain() {
      return this.bytes[233] & 2;
    },
    get volumeLoop() {
      return this.bytes[233] & 4;
    },
    get panningOn() {
      return this.bytes[234] & 1;
    },
    get panningSustain() {
      return this.bytes[234] & 2;
    },
    get panningLoop() {
      return this.bytes[234] & 4;
    },
    get vibratoType() {
      return this.bytes[235];
    },
    get vibratoSweep() {
      return this.bytes[236];
    },
    get vibratoDepth() {
      return this.bytes[237];
    },
    get vibratoRate() {
      return this.bytes[238];
    },
    get volumeFadeout() {
      return this.dv.getUint16(239, true);
    },
    // reserved uint16
  };
  
  function XMSampleHeaderView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  XMSampleHeaderView.prototype = {
    get sampleLength() {
      return this.dv.getUint32(0, true);
    },
    get loopStart() {
      return this.dv.getUint32(4, true);
    },
    get loopEnd() {
      return this.dv.getUint32(8, true);
    },
    get volume() {
      return this.bytes[12];
    },
    get finetune() {
      return this.dv.getInt8(13);
    },
    get loopType() {
      switch (this.bytes[14] & 3) {
        case 0: return 'none';
        case 1: return 'forward';
        case 2: return 'ping-pong';
      }
    },
    get bytesPerSample() {
      return (this.bytes[14] & 4) ? 2 : 1;
    },
    get panning() {
      return this.bytes[15];
    },
    get relativeNoteNumber() {
      return this.dv.getInt8(16);
    },
    // reserved byte
    get sampleName() {
      return String.fromCharCode.apply(null, this.bytes.subarray(18, 18 + 22));
    },
    createBuffer: function(audioContext) {
      var raw = this.data;
      var buffer = audioContext.createBuffer(1, raw.length, 8363);
      var samples = buffer.getChannelData(0);
      var div = 1 << (((raw.byteLength / raw.length) * 8) - 1);
      for (var i = 0; i < samples.length; i++) {
        samples[i] = raw[i] / div;
      }
      return buffer;
    },
  };
  XMSampleHeaderView.byteLength = 18 + 22;
  
  function XModule(blob) {
    this.blob = blob;
  }
  XModule.prototype = {
    getHeader: function() {
      return this._header = this._header
      || getBuffered(this.blob, 0, 336)
      .then(function(bytes) {
        return new XMHeaderView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      });
    },
    getPatterns: function() {
      var blob = this.blob;
      return this._patterns = this._patterns
      || this.getHeader().then(function(header) {
        var list = new Array(header.patternCount);
        function addPattern(i, offset) {
          if (i >= list.length) {
            return Promise.all(list)
            .then(function(list) {
              list.endOffset = offset;
              return list;
            });
          }
          return getBuffered(blob, offset, 9).then(function(bytes) {
            var pattern = new XMPatternHeaderView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            if (pattern.dataByteLength === 0) {
              list[i] = pattern;
            }
            else {
              list[i] = getBuffered(blob, offset + pattern.headerByteLength, pattern.dataByteLength)
              .then(function(data) {
                pattern.data = data;
                return pattern;
              });
            }
            return addPattern(i + 1, offset + pattern.headerByteLength + pattern.dataByteLength);
          });
        }
        return addPattern(0, header.byteLength);
      });
    },
    getInstruments: function() {
      var blob = this.blob;
      return this._instruments = this._instruments
      || Promise.all([this.getHeader(), this.getPatterns()])
      .then(function(values) {
        var header = values[0], patterns = values[1];
        var list = new Array(header.instrumentCount);
        function addInstrument(i, offset) {
          if (i >= list.length) {
            return Promise.all(list);
          }
          return getBuffered(blob, offset, Math.min(blob.size - offset, 242)).then(function(bytes) {
            var instrument = list[i] = new XMInstrumentHeaderView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            if (instrument.sampleCount === 0) {
              instrument.samples = [];
              return addInstrument(i + 1, offset + instrument.headerByteLength);
            }
            offset += instrument.headerByteLength;
            return getBuffered(blob, offset, XMSampleHeaderView.byteLength * instrument.sampleCount)
            .then(function(rawSampleHeaders) {
              offset += rawSampleHeaders.length;
              var samples = new Array(instrument.sampleCount);
              for (var j = 0; j < samples.length; j++) {
                var sample = new XMSampleHeaderView(
                  rawSampleHeaders.buffer,
                  rawSampleHeaders.byteOffset + XMSampleHeaderView.byteLength * j,
                  XMSampleHeaderView.byteLength);
                samples[j] = Promise.all([sample, getBuffered(blob, offset, sample.sampleLength * sample.bytesPerSample)])
                .then(function(values) {
                  var sample = values[0], data = values[1];
                  if (sample.bytesPerSample === 2) {
                    sample.data = new Int16Array(data.length / 2);
                    var dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
                    var old = 0;
                    for (var i = 0; i < sample.data.length; i++) {
                      sample.data[i] = old += dv.getUint16(i * 2, true);
                    }
                  }
                  else {
                    sample.data = new Int8Array(data.length);
                    var old = 0;
                    for (var i = 0; i < sample.data.length; i++) {
                      sample.data[i] = old += data[i];
                    }
                  }
                  return sample;
                });
                offset += sample.sampleLength * sample.bytesPerSample;
              }
              list[i] = Promise.all(samples).then(function(samples) {
                instrument.samples = samples;
                return instrument;
              });
              return addInstrument(i + 1, offset);
            });
          });
        }
        return addInstrument(0, patterns.endOffset);
      });
    },
  };
  
  var xm = {
    Module: XModule,
  };
  
  return xm;

});
