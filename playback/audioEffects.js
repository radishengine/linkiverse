define(function() {

  'use strict';
  
  return {
    createTremolo:
      // node.tremoloSpeed: 0 (slow) to 1 (fast)
      // node.tremoloDepth: 0 (none) to 1 (strongest intensity)
      function createTremolo(audioContext) {
        var tremoloOscillator = audioContext.createOscillator(),
          tremoloGain = audioContext.createGain();
          outputGain = audioContext.createGain();
        tremoloOscillator.frequency.value = 2;
        tremoloOscillator.start();
        tremoloOscillator.connect(tremoloGain);
        tremoloGain.gain.value = 0.05;
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
              tremoloOscillator.frequency.value = 0.5 + v/9.5;
            },
            get: function() {
              return (tremoloOscillator.frequency.value - 0.5) / 9.5;
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
