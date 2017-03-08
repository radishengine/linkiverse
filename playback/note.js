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
    createSourceNode: function(destination, baseTime, startTime, endTime) {
      var node = this.audioContext.createBufferSource();
      node.buffer = this.audioBuffer;
      if (this.loop) {
        node.loop = true;
        if (!isNaN(this.loop.start)) node.loopStart = this.loop.start / this.audioBuffer.sampleRate;
        if (!isNaN(this.loop.end)) node.loopEnd = this.loop.end / this.audioBuffer.sampleRate;
      }
      node.playbackRate.value = noteFreq(this.note) / noteFreq(this.unityNote);
      node.detune.value = this.detune;
      node.connect(destination);
      node.addEventListener('ended', node.disconnect);
      node.start(baseTime + startTime);
      node.stop(baseTime + endTime);
    },
    note: 69,
    unityNote: 69,
    loop: null,
    detune: 0,
  };
  
  var note = {
    load: function(audioContext) {
      return fetch(require.toUrl('./note1.wav'), {cache:'force-cache'})
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
        var keys = new Array(128);
        var i = -1;
        function doKeys(toKey, len, unity, loopStart, loopLen, attenuation_dB, tune_cents) {
          var sliceBuffer = audioContext.createBuffer(1, len, 22050);
          sliceBuffer.copyToChannel(samples.subarray(0, len), 0);
          samples = samples.subarray(len);
          var playbackRateDenominator = noteFreq(unity);
          for (; i <= toKey; i++) {
            var key = keys[i] = new Note(audioContext, sliceBuffer);
            key.note = i;
            key.unityNote = unity;
            key.loop = {start:loopStart, end:loopStart+loopLen};
            key.detune = tune_cents;
          }
        }
        doKeys(38, 13672, 36, 11989, 1682, -11.3, -4);
        doKeys(43, 13103, 41, 10830, 2272, -9.98, -1);
        doKeys(50, 11168, 48, 9313, 1854, -12.3, 0);
        doKeys(59, 9797, 56, 8309, 1487, -9.8, 0);
        doKeys(67, 10516, 64, 9176, 1139, -6.7, 1);
        doKeys(74, 7588, 73, 6194, 1393, -7.2, 1);
        doKeys(81, 7669, 78, 6447, 1221, -7.7, -1);
        doKeys(88, 7345, 84, 5976, 1368, -7.2, -2);
        doKeys(97, 6442, 92, 5392, 1049, -8.2, 1);
        doKeys(127, 4842, 103, 4686, 155, -9.425, 3);
        return keys;
      });
    },
  };
  
  return note;
  
});
