define(function() {

  'use strict';
  
  const MIN_VIBRATO_HZ = 0.5, MAX_VIBRATO_HZ = 10, MAX_VIBRATO_DIFF = 0.5;
  const MIN_TREMOLO_HZ = 0.5, MAX_TREMOLO_HZ = 10;
  
  return {
    initBufferSourceVibrato:
      // sets up an AudioBufferSourceNode:
      // node.vibratoSpeed: 0 (slow) to 1 (fast)
      // node.vibratoDepth: 0 (none) to 1 (strongest intensity)
      function initBufferSourceVibrato(bufferSource) {
        const audioContext = bufferSource.context;
        const vibratoOscillator = audioContext.createOscillator(),
              vibratoGain = audioContext.createGain();
        vibratoOscillator.frequency.value = 2;
        vibratoGain.gain.value = 0;
        Object.defineProperties(bufferSource, {
          vibratoOscillator: {
            value: vibratoOscillator,
            enumerable: true,
          },
          vibratoGain: {
            value: vibratoGain,
            enumerable: true,
          },
          vibratoSpeed: {
            get: function() {
              return (vibratoOscillator.frequency.value - MIN_VIBRATO_HZ) / (MAX_VIBRATO_HZ - MIN_VIBRATO_HZ);
            },
            set: function(v) {
              vibratoOscillator.frequency.value = MIN_VIBRATO_HZ + v * (MAX_VIBRATO_HZ - MIN_VIBRATO_HZ);
            },
            enumerable: true,
          },
          vibratoDepth: {
            get: function() {
              return vibratoGain.gain.value / MAX_VIBRATO_DIFF;
            },
            set: function(v) {
              vibratoGain.gain.value = v * MAX_VIBRATO_DIFF;
            },
            enumerable: true,
          },
        });
      },
    createTremolo:
      // returns a gain node to connect to:
      // node.tremoloSpeed: 0 (slow) to 1 (fast)
      // node.tremoloDepth: 0 (none) to 1 (strongest intensity)
      function createTremolo(audioContext) {
        const tremoloOscillator = audioContext.createOscillator(),
          tremoloGain = audioContext.createGain(),
          outputGain = audioContext.createGain();
        tremoloOscillator.frequency.value = 2;
        tremoloOscillator.start();
        tremoloOscillator.connect(tremoloGain);
        tremoloGain.gain.value = 0;
        tremoloGain.connect(outputGain.gain);
        return Object.defineProperties(outputGain, {
          tremoloOscillator: {
            value: tremoloOscillator,
            enumerable: true,
          },
          tremoloGain: {
            value: tremoloGain,
            enumerable: true,
          },
          tremoloSpeed: {
            set: function(v) {
              tremoloOscillator.frequency.value = MIN_TREMOLO_HZ + v/(MAX_TREMOLO_HZ - MIN_TREMOLO_HZ);
            },
            get: function() {
              return (tremoloOscillator.frequency.value - MIN_TREMOLO_HZ) / (MAX_TREMOLO_HZ - MIN_TREMOLO_HZ);
            },
            enumerable: true,
          },
          tremoloDepth: {
            set: function(v) {
              tremoloGain.gain.value = v * 0.25;
              outputGain.gain.value = 1 - v * 0.25;
            },
            get: function() {
              return tremoloGain.gain.value / 0.25;
            },
            enumerable: true,
          },
        });
      },
  };

});
