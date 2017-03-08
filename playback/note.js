define(['require'], function(require) {

  'use strict';
  
  function noteFreq(note) {
    return (440 / 32) * Math.pow(2, ((note - 9) / 12));
  }
  
  var littleEndianMode = (function() {
    var n = new Uint8Array([1, 0]);
    return new Uint16Array(n.buffer, n.byteOffset, 1)[0] === 1;
  })();
  
  function Note(audioContext, audioBuffer) {
    this.audioContext = audioContext;
    this.audioBuffer = audioBuffer;
  }
  Note.prototype = {
    createSourceNode: function(destination, baseTime, startTime, endTime, velocity) {
      if (isNaN(velocity)) velocity = 1;
      if (velocity <= 0) return;
      var node = this.audioContext.createBufferSource();
      node.buffer = this.audioBuffer;
      if (this.loop) {
        node.loop = true;
        if (!isNaN(this.loop.start)) node.loopStart = this.loop.start / this.audioBuffer.sampleRate;
        if (!isNaN(this.loop.end)) node.loopEnd = this.loop.end / this.audioBuffer.sampleRate;
      }
      node.playbackRate.value = noteFreq(this.note) / noteFreq(this.unityNote);
      node.detune.value = this.detune;
      node.start(baseTime + startTime);
      node.stop(baseTime + endTime);
      var gain = this.audioContext.createGain();
      gain.gain.value = velocity * this.gain;
      var fadeStart = endTime - 0.1;
      if (fadeStart > startTime) {
        gain.gain.setValueAtTime(gain.gain.value, baseTime + fadeStart);
      }
      gain.gain.exponentialRampToValueAtTime(1e-4, baseTime + endTime);
      gain.connect(destination);
      node.addEventListener('ended', gain.disconnect.bind(gain));
      node.connect(gain);
    },
    note: 69,
    unityNote: 69,
    loop: null,
    detune: 0,
    gain: 1,
  };
  
  function loadNoteData(number) {
    return fetch(require.toUrl('./note'+number+'.wav'), {cache:'force-cache'})
    .then(function(req) {
      return req.arrayBuffer();
    })
    .then(function(data) {
      var samples = new Float32Array((data.byteLength - 44) / 2);
      if (littleEndianMode) {
        var samples16 = new Int16Array(data, 44, samples.length);
        for (var i = 0; i < samples.length; i++) {
          samples[i] = samples16[i] / 32768;
        }
      }
      else {
        var dv = new DataView(data);
        for (var i = 0; i < samples.length; i++) {
          samples[i] = dv.getInt16(44 + i * 2, true) / 32768;
        }
      }
      return samples;
    });
  }
  
  var note = {
    load: function(audioContext, program, bank) {
      var noteNumber, parts;
      switch (program) {
        case 0x00: default:
          switch (bank) {
            case 0x00: default:
              noteNumber = 1;
              parts = [
                [38, 13672, 36, 11989, 1682, -11.3, -4],
                [43, 13103, 41, 10830, 2272, -9.98, -1],
                [50, 11168, 48, 9313, 1854, -12.3, 0],
                [59, 9797, 56, 8309, 1487, -9.8, 0],
                [67, 10516, 64, 9176, 1139, -6.7, 1],
                [74, 7588, 73, 6194, 1393, -7.2, 1],
                [81, 7669, 78, 6447, 1221, -7.7, -1],
                [88, 7345, 84, 5976, 1368, -7.2, -2],
                [97, 6442, 92, 5392, 1049, -8.2, 1],
                [127, 4842, 103, 4686, 155, -9.425, 3],
              ];
              break;
          }
          break;
        case 0x03:
          noteNumber = 2;
          parts = [
            [49, 5996, 42, 5284, 711, -9.02, -10],
            [67, 2924, 62, 2699, 224, -5.04, -10],
            [78, 2938, 71, 2848, 89, -5.04, -6],
            [90, 2607, 84, 2585, 21, -5.04, -6],
            [127, 2004, 96, 1802, 201, -5.04, 7],
          ];
          break;
        case 0x04:
          switch (bank) {
            case 0x00: default:
              noteNumber = 3;
              parts = [
                [46, 961, 49, 800, 160, -4.5, 10],
                [66, 839, 56, 731, 107, -4.5, 13],
                [80, 418, 67, 361, 56, -4.5, -8],
                [101, 496, 80, 442, 53, -4.5, -3],
                [127, 115, 97, 104, 10, -8.2, 10],
              ];
              break;
            case 0x01:
              noteNumber = 4;
              parts = [
                [47, 6934, 60, 6178, 755, -4.15, -8],
                [72, -6934, 60, 6178, 755, -7.13, -8],
                [103, 2218, 84, 2112, 105, -4.2, -6],
                [127, -2218, 84, 2112, 105, -6.2, -6],
              ];
              break;
            case 0x02:
              // 0x00 with minor changes to attenuation & key ranges
              noteNumber = 3;
              parts = [
                [46, 961, 49, 800, 160, -5.6, 10],
                [66, 839, 56, 731, 107, -5.6, 13],
                [80, 418, 67, 361, 56, -5.6, -8],
                [93, 496, 80, 442, 53, -5.6, -3],
                [127, 115, 97, 104, 10, -5.6, 10],
              ];
              break;
            case 0x03:
              noteNumber = 5;
              parts = [
                [45, 1096, 48, 927, 168, -6.88, -6],
                [53, 655, 53, 402, 252, -6.2, -4],
                [63, 1044, 64, 909, 134, -6.2, 3],
                [75, 1041, 70, 946, 94, -6.2, -11],
                [83, 1004, 83, 936, 67, -6.2, 1],
                [91, 958, 87, 904, 53, -7.5, -5],
                [127, 771, 93, 695, 75, -8.2, -4],
              ];
              break;
          }
          break;
      }
      return loadNoteData(noteNumber).then(function(samples) {
        var keys = new Array(128);
        var i = -1;
        function doKeys(toKey, len, unity, loopStart, loopLen, attenuation_dB, tune_cents) {
          var sliceBuffer;
          if (len < 0) {
            len = -len;
            sliceBuffer = audioContext.createBuffer(1, len, 22050);
            sliceBuffer.copyToChannel(new Float32Array(samples.buffer, samples.byteOffset - len * 4, len), 0);
          }
          else {
            sliceBuffer = audioContext.createBuffer(1, len, 22050);
            sliceBuffer.copyToChannel(samples.subarray(0, len), 0);
            samples = samples.subarray(len);
          }
          var playbackRateDenominator = noteFreq(unity);
          var gain = Math.pow(10, attenuation_dB / 20);
          for (; i <= toKey; i++) {
            var key = keys[i] = new Note(audioContext, sliceBuffer);
            key.note = i;
            key.unityNote = unity;
            key.loop = {start:loopStart, end:loopStart+loopLen};
            key.detune = tune_cents;
            key.gain = gain;
          }
        }
        for (var j = 0; j < parts.length; j++) {
          doKeys.apply(null, parts[j]);
        }
        return keys;
      });
    },
  };
  
  return note;
  
});
