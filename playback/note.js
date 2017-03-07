define(['require'], function(require) {

  'use strict';
  
  function noteFreq(note) {
    return (440 / 32) * Math.pow(2, ((note - 9) / 12));
  }
  
  var note = {
    load: function(audioContext) {
      fetch(require.toUrl('./note1.wav'), {cache:'force-cache'})
      .then(function(req) {
        return req.arrayBuffer();
      })
      .then(function(data) {
        return audioContext.decodeAudioData(data);
      })
      .then(function(buffer) {
        var samples = buffer.getChannelData(0);
        var keys = new Array(128);
        var i = -1;
        function doKeys(toKey, len, unity, loopStart, loopLen, attenuation_dB, tune_cents) {
          var sliceBuffer = audioContext.createBuffer(1, len, 22050);
          sliceBuffer.copyToChannel(samples.subarray(0, len), 0);
          samples = samples.subarray(len);
          var playbackRateDenominator = noteFreq(unity);
          while (++i <= toKey) {
            var key = keys[i] = audioContext.createBufferSource();
            key.buffer = sliceBuffer;
            key.loopEnd = (key.loopStart = loopStart) + loopLen;
            key.loop = true;
            key.playbackRate = noteFreq(i) / playbackRateDenominator;
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
