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
        case 0x05:
          switch (bank) {
            case 0x00: default:
              noteNumber = 6;
              parts = [
                [60, 2004, 48, 1835, 168, -9.56, -6],
                [68, 1313, 56, 1206, 106, -9.56, -3],
                [76, 965, 64, 897, 67, -8.07, 3],
                [84, 544, 72, 501, 42, -8, -6],
                [92, 405, 80, 351, 53, -9, -3],
                [100, 354, 88, 303, 50, -11, -6],
                [127, 286, 96, 190, 95, -12.4, 3],
              ];
              break;
            case 0x01:
              noteNumber = 7;
              parts = [
                [83, 5048, 78, 1365, 3682, -9.3, -6],
                [95, -5048, 78, 1365, 3682, -13.3, -6],
                [127, -5048, 78, 1365, 3682, -16.3, -6],
              ];
              break;
            case 0x02:
              // same as 0x00 with some attenuation differences
              noteNumber = 6;
              parts = [
                [60, 2004, 48, 1835, 168, -10.2, -6],
                [68, 1313, 56, 1206, 106, -10.2, -3],
                [76, 965, 64, 897, 67, -8.72, 3],
                [84, 544, 72, 501, 42, -8.03, -6],
                [92, 405, 80, 351, 53, -8.03, -3],
                [100, 354, 88, 303, 50, -9, -6],
                [127, 286, 96, 190, 95, -10, 3],
              ];
              break;
          }
          break;
        case 0x06:
          switch (bank) {
            case 0x00: default:
              noteNumber = 8;
              parts = [
                [54, 6687, 48, 5506, 1180, -7.62, 0],
                [66, 5176, 60, 4501, 674, -7.62, -1],
                [80, 4008, 72, 3291, 716, -7.62, -1],
                [100, 3666, 87, 3169, 496, -8.6, 0],
                [127, -3666, 87, 3169, 496, -9.6, 0],
              ];
              break;
            case 0x01:
              // same as 0x00 with attenuation and key range differences
              noteNumber = 8;
              parts = [
                [51, 6687, 48, 5506, 1180, -9.62, 0],
                [63, 5176, 60, 4501, 674, -9.62, -1],
                [77, 4008, 72, 3291, 716, -9.62, -1],
                [97, 3666, 87, 3169, 496, -9.62, 0],
                [127, -3666, 87, 3169, 496, -9.62, 0],
              ];
              break;
            case 0x02:
              // same as 0x00 with attenuation differences
              noteNumber = 8;
              parts = [
                [54, 6687, 48, 5506, 1180, -7.12, 0],
                [66, 5176, 60, 4501, 674, -7.12, -1],
                [80, 4008, 72, 3291, 716, -7.12, -1],
                [100, 3666, 87, 3169, 496, -8.1, 0],
                [127, -3666, 87, 3169, 496, -9.1, 0],
              ];
              break;
            case 0x03:
              // same as 0x00 with attenuation and key range differences
              noteNumber = 8;
              parts = [
                [54, 6687, 48, 5506, 1180, -10.35, 0],
                [66, 5176, 60, 4501, 674, -10.35, -1],
                [80, 4008, 72, 3291, 716, -10.35, -1],
                [100, 3666, 87, 3169, 496, -11.3, 0],
                [127, -3666, 87, 3169, 496, -12.3, 0],
              ];
              break;
          }
          break;
        case 0x07:
          noteNumber = 9;
          parts = [
            1630,
            [46, 636, 48, 467, 168, -5.58, -6],
            [65, 375, 60, 290, 84, -4.57, -6],
            [78, 249, 72, 206, 42, -4.15, -6],
            [95, 98, 84, 76, 21, -6.2, -6],
            1523,
            [127, 227, 103, 212, 14, -11, -8],
          ];
          break;
        case 0x08:
          noteNumber = 9;
          parts = [
            1630 + 636 + 375 + 249 + 98 + 1523 + 227,
            [98, 545, 77, 292, 252, -4.2, -4],
            797,
            [102, 144, 101, 81, 62, -5.1, -32],
            1085 + 595 + 5466 + 3196 + 1912 + 1603,
            [127, 315, 90, 299, 15, -5, 12],
          ];
          break;
        case 0x09:
          noteNumber = 10;
          parts = [
            [87, 445, 85, 326, 118, -0.3, -19],
            [91, 317, 91, 232, 84, -5.9, -8],
            [127, 170, 102, 125, 44, -6.7, -27],
          ];
          break;
        case 0x0A:
          noteNumber = 9;
          parts = [
            1630 + 636 + 375 + 249 + 98 + 1523 + 227 + 545,
            [57, 797, 82, 583, 213, -2.5, 1],
            [88, -797, 82, 583, 213, -4.2, 1],
            [102, 144, 101, 81, 62, -3.1, -32],
            1085 + 595 + 5466 + 3196 + 1912 + 1603,
            [127, 315, 90, 299, 15, -5, 12],
          ];
          break;
        case 0x0B:
          noteNumber = 11;
          parts = [
            [57, 6548, 52, 5878, 669, -3, 0],
            [70, 5973, 64, 5704, 268, -4, 3],
            [82, 3536, 76, 3300, 235, -6.03, 6],
            [93, 2383, 88, 2264, 118, -4.15, 14],
            [127, 2488, 100, 2428, 59, -8.2, 14],
          ];
          break;
        case 0x0C:
          noteNumber = 9;
          parts = [
            1630 + 636 + 375 + 249 + 98 + 1523 + 227 + 545 + 797 + 144 + 1085 + 595 + 5466 + 3196,
            [48, 1912, 54, 1317, 594, -6.62, -6],
            [81, 1603, 62, 1528, 74, -6.9, -25],
            [127, 315, 90, 299, 15, -5, 12],
          ];
          break;
        case 0x0D:
          noteNumber = 9;
          parts = [
            1630 + 636 + 375 + 249 + 98 + 1523 + 227 + 545 + 797 + 144,
            [88, 1085, 72, 959, 125, -0.91, -20],
            [101, 595, 93, 545, 49, 0, -39],
            5466 + 3196 + 1912 + 1603,
            [127, 315, 90, 299, 15, -9, 12],
          ];
          break;
        case 0x0E:
          noteNumber = 10;
          switch (bank) {
            case 0: default:
              parts = [
                445 + 317 + 170,
                [89, 1167, 84, 294, 872, -7.2, -5],
                [96, -1167, 84, 294, 872, -10, -5],
                [127, -1167, 84, 294, 872, -13, -5],
              ];
              break;
            case 1:
              // same as 0 with different attenuation
              // there's also a duplicate entry with: -7.6, -15, -20
              parts = [
                445 + 317 + 170,
                [89, 1167, 84, 294, 872, -8.1, -5],
                [96, -1167, 84, 294, 872, -11, -5],
                [127, -1167, 84, 294, 872, -16, -5],
              ];
              break;
          }
          break;
        case 0x0F:
          noteNumber = 9;
          parts = [
            1630 + 636 + 375 + 249 + 98,
            [55, 1523, 74, 1112, 410, 0, -13],
            [87, -1523, 74, 1112, 410, -4.5, -13],
            [127, 227, 103, 212, 14, -7.2, -8],
          ];
          break;
        case 0x10:
          switch (bank) {
            case 0: default:
              noteNumber = 10;
              parts = [
                445 + 317 + 170 + 1167,
                [79, 545, 73, 465, 79, -5.6, -12],
                [92, 277, 85, 236, 40, -9.5, 10],
                [127, 145, 97, 124, 20, -11.5, 10],
              ];
              break;
            case 1:
              noteNumber = 12;
              parts = [
                [64, 4669, 90, 903, 3766, -2.5, -2],
                [127, -4669, 90, 903, 3766, -5.47, -2],
              ];
              break;
            case 2:
              noteNumber = 10;
              parts = [
                445 + 317 + 170 + 1167 + 545 + 277 + 145,
                [55, 244, 67, 187, 56, -4.8, -8],
                [84, -244, 67, 187, 56, -7.5, -8],
                [93, 101, 91, 86, 14, -4.8, -8],
                [96, 98, 97, 87, 10, -4.8, 10],
                [127, -98, 97, 87, 10, -9.2, 10],
              ];
              break;
            case 4:
              // 0 with different attenuation
              noteNumber = 10;
              parts = [
                445 + 317 + 170 + 1167,
                [79, 545, 73, 465, 79, -5.3, -12],
                [92, 277, 85, 236, 40, -5.7, 10],
                [127, 145, 97, 124, 20, -6, 10],
              ];
              break;
          }
          break;
        case 0x11:
          switch (bank) {
            case 0: default:
              noteNumber = 13;
              parts = [
                [64, 3936, 53, 3682, 253, -1.8, 3],
                [82, 1771, 68, 1663, 107, -1.3, 13],
                [127, 1416, 86, 1340, 75, -3.3, -2],
              ];
              break;
            case 1:
              // 0 with different attenuation (including an additional key range)
              noteNumber = 13;
              parts = [
                [64, 3936, 53, 3682, 253, 0, 3],
                [82, 1771, 68, 1663, 107, 0, 13],
                [94, 1416, 86, 1340, 75, -4.5, -2],
                [127, -1416, 86, 1340, 75, -8.3, -2],
              ];
              break;
            case 4:
              // 0x10 bank 0 with different attenuation and key range
              noteNumber = 10;
              parts = [
                445 + 317 + 170 + 1167,
                [76, 545, 73, 465, 79, -0.7, -12],
                [92, 277, 85, 236, 40, -1.11, 10],
                [127, 145, 97, 124, 20, -1.4, 10],
              ];
              break;              
          }
          break;
        case 0x12:
          noteNumber = 14;
          parts = [
            [55, 3498, 71, 1236, 2261, -3.6, 22],
            [69, 3671, 83, 1353, 2317, -2.14, -3],
            [127, 3445, 95, 1260, 2184, -2.14, -3],
          ];
          break;
        case 0x13:
          noteNumber = 15;
          switch (bank) {
            case 0: default:
              parts = [
                [52, 2125, 46, 1752, 372, -10.53, -30],
                [60, 1542, 56, 914, 627, -10.53, -28],
                [73, 829, 66, 593, 235, -10.5, -25],
                [86, 1271, 78, 1211, 59, -10.5, -17],
                [127, 794, 90, 764, 29, -9.5, -47],
              ];
              break;
            case 1: // 0 with +/- attenuation
              parts = [
                [52, 2125, 46, 1752, 372, -9.9, -30],
                [60, 1542, 56, 914, 627, -9.9, -28],
                [73, 829, 66, 593, 235, -9.9, -25],
                [86, 1271, 78, 1211, 59, -9.9, -17],
                [127, 794, 90, 764, 29, -9.9, -47],
              ];
              break;
            case 2: // 0 with +/- attenuation, key ranges
              parts = [
                [49, 2125, 46, 1752, 372, -10.53, -30],
                [57, 1542, 56, 914, 627, -10.53, -28],
                [69, 829, 66, 593, 235, -10.5, -25],
                [86, 1271, 78, 1211, 59, -10.5, -17],
                [127, 794, 90, 764, 29, -9.5, -47],
              ];
              break;
          }
          break;
        case 0x14:
          noteNumber = 16;
          parts = [
            791 + 589,
            [46, 296, 53, 41, 254, -8.2, 10],
            [68, -296, 53, 41, 254, -10.6, 10],
            [83, 56, 72, 12, 43, -5.4, 35],
            [92, -56, 72, 12, 43, -7.4, 35],
            [127, 101, 88, 50, 50, -8, -6],
          ];
          break;
        case 0x15:
          noteNumber = 17;
          switch (bank) {
            case 0x00: default:
              parts = [
                [48, 3762, 68, 2752, 1009, -2.8, 0],
                [84, -3762, 68, 2752, 1009, -6.1, 0],
                [95, 2160, 96, 2075, 84, -1.4, -6],
                101,
                [127, 415, 95, 403, 11, -4, -25],
              ];
              break;
            case 1:
              parts = [
                [48, 3762, 68, 2752, 1009, -4.24, 0],
                [84, -3762, 68, 2752, 1009, -7.5, 0],
                [95, 2160, 96, 2075, 84, -2.8, -6],
                [127, 101, 88, 50, 50, -5, -6],
              ];
              break;
          }
          break;
        case 0x16:
          noteNumber = 16;
          parts = [
            791 + 589 + 296 + 56 + 101,
            [68, 109, 56, 2, 106, -7.9, -3],
            [76, 69, 64, 1, 67, -7.17, 3],
            [84, 46, 72, 3, 42, -6.475, -6],
            [92, 56, 80, 2, 53, -6.2, -3],
            [101, 52, 88, 1, 50, -6.2, -6],
            [127, 23, 96, 1, 21, -6.3, -6],
          ];
          break;
        case 0x17:
          noteNumber = 16;
          parts = [
            [44, 791, 64, 723, 67, -2.5, 3],
            [71, -791, 64, 723, 67, -4.7, 3],
            [82, 589, 74, 512, 76, -5, 21],
            296,
            [95, 56, 72, 12, 43, -5.4, 35],
            [127, 101, 88, 50, 50, -5, -6],
          ];
          break;
        case 0x18:
          noteNumber = 18;
          switch (bank) {
            case 0: default:
              parts = [
                1410 + 1075 + 511,
                [52, 4472, 48, 3460, 1011, -4.57, -1],
                [66, 4168, 57, 3565, 602, -4.57, 2],
                [76, 3341, 70, 2820, 520, -4.15, -1],
                [89, 2901, 79, 2787, 113, -4.15, 8],
                [91, 1812, 88, 1727, 84, -5.43, 8],
                [99, 1089, 97, 1008, 80, -6.3, 10],
                3322,
                [127, 2491, 101, 1843, 647, -9.8, 0],
              ];
              break;
            case 1:
              parts = [
                1410 + 1075 + 511,
                [44, 4472, 48, 3460, 1011, -6.57, -1],
                [58, 4168, 57, 3565, 602, -6.57, 2],
                [68, 3341, 70, 2820, 520, -6.15, -1],
                [81, 2901, 79, 2787, 113, -6.15, 8],
                [83, 1812, 88, 1727, 84, -7.42, 8],
                [92, 1089, 97, 1008, 80, -8.34, 10],
                [127, 3322, 104, 3308, 13, -7.88, -36],
              ];
              break;
            case 2:
              // case 0 with +/- attenuation
              parts = [
                1410 + 1075 + 511,
                [52, 4472, 48, 3460, 1011, -3.72, -1],
                [66, 4168, 57, 3565, 602, -3.72, 2],
                [76, 3341, 70, 2820, 520, -3.3, -1],
                [89, 2901, 79, 2787, 113, -3.3, 8],
                [91, 1812, 88, 1727, 84, -4.58, 8],
                [99, 1089, 97, 1008, 80, -5.5, 10],
                3322,
                [127, 2491, 101, 1843, 647, -9.8, 0],
              ];
              break;
            case 4:
              parts = [
                1410 + 1075 + 511,
                [52, 4472, 48, 3460, 1011, -2.73, -1],
                [66, 4168, 57, 3565, 602, -2.73, 2],
                [76, 3341, 70, 2820, 520, -2.32, -1],
                [89, 2901, 79, 2787, 113, -2.32, 8],
                [91, 1812, 88, 1727, 84, -3.59, 8],
                [99, 1089, 97, 1008, 80, -4.5, 10],
                3322,
                [127, 2491, 101, 1843, 647, -9.3, 0],
              ];
              break;
          }
          break;
        case 0x19:
          noteNumber = 19;
          switch (bank) {
            case 0: default:
              parts = [
                [44, 9361, 41, 8352, 1008, -4.3, -4],
                [52, 5905, 49, 4790, 1114, -4.3, 0],
                [60, 5026, 57, 4724, 301, -4.3, 2],
                [69, 5140, 65, 4886, 253, -3.3, 3],
                [81, 3785, 74, 3596, 188, -3.3, 3],
                [88, 2954, 84, 2763, 190, -5.7, 3],
                [127, -2954, 84, 2763, 190, -8, 3],
              ];
              break;
            case 1:
              parts = [
                9361,
                [47, 5905, 49, 4790, 1114, -6.5, 0],
                5026 + 5140 + 3785 + 2954,
                [69, 6012, 55, 5448, 563, -7.7, 2],
                [86, 3125, 79, 2337, 787, -5, -1],
                [127, 2410, 89, 1827, 582, -5.47, -6],
              ];
              break;
            case 2:
              parts = [
                [36, 9361, 41, 8352, 1008, -2.7, -4],
                [44, 5905, 49, 4790, 1114, -2.7, 0],
                [52, 5026, 57, 4724, 301, -2.7, 2],
                [61, 5140, 65, 4886, 253, -1.72, 3],
                [73, 3785, 74, 3596, 188, -1.72, 3],
                [127, 2954, 84, 2763, 190, -3.45, 3],
              ];
              break;
          }
          break;
        case 0x1A:
          noteNumber = 20;
          switch (bank) {
            case 0: default:
              parts = [
                [54, 6485, 50, 4982, 1502, -1.72, 0],
                [63, 6394, 59, 4518, 1875, -1.72, 0],
                [71, 5460, 68, 4663, 796, -1.72, -1],
                [79, 4422, 74, 3895, 526, -1.72, 1],
                [88, 4989, 84, 4102, 886, -3.44, 2],
                [97, 3560, 93, 2882, 677, -5.2, 1],
                [127, 2491, 101, 1843, 647, -6.2, 0],
              ];
              break;
            case 1:
              // case 0 with +/- attenuation, key ranges
              parts = [
                [66, 6485, 50, 4982, 1502, -7.71, 0],
                [75, 6394, 59, 4518, 1875, -7.71, 0],
                [83, 5460, 68, 4663, 796, -7.71, -1],
                [91, 4422, 74, 3895, 526, -7.71, 1],
                [100, 4989, 84, 4102, 886, -9.43, 2],
                [109, 3560, 93, 2882, 677, -10.6, 1],
                [127, 2491, 101, 1843, 647, -11, 0],
              ];
              break;
          }
          break;
        case 0x1B:
          noteNumber = 21;
          switch (bank) {
            case 0: default:
              parts = [
                [54, 5025, 48, 4686, 338, -4.48, 4],
                [62, 3771, 60, 3433, 337, -4.8, -1],
                [70, 3104, 67, 2877, 226, -4.8, 8],
                [80, 2351, 72, 2013, 337, -4.48, -1],
                [99, 2286, 83, 2263, 22, -4.5, -25],
                [127, 2954, 84, 2763, 190, -8.7, 3],
              ];
              break;
            case 1:
              // case 0 with +/i attenuation, key ranges
              parts = [
                [54, 5025, 48, 4686, 338, -5.1, 4],
                [63, 3771, 60, 3433, 337, -6.1, -1],
                [70, 3104, 67, 2877, 226, -8.82, 8],
                [80, 2351, 72, 2013, 337, -8.54, -1],
                [99, 2286, 83, 2263, 22, -8.5, -25],
                [127, 2954, 84, 2763, 190, -8.7, 3],
              ];
              break;
          }
          break;
        case 0x1C:
          noteNumber = 18;
          switch (bank) {
            case 0: default:
              parts = [
                [69, 1410, 43, 1184, 225, -4.1, 0],
                [72, 1075, 64, 1007, 67, -3.3, 3],
                [86, 511, 81, 485, 25, -3.3, -4],
                4472 + 4168 + 3341 + 2901,
                [91, 1812, 88, 1727, 84, -5.4, 8],
                [99, 1089, 97, 1008, 80, -6.3, 10],
                3322,
                [127, 2491, 101, 1843, 647, -9.2, 0],
              ];
              break;
            case 1:
              // case 0 with +/- attenuation and key ranges
              parts = [
                [56, 1410, 43, 1184, 225, -7.3, 0],
                [68, 1075, 64, 1007, 67, -4.8, 3],
                [86, 511, 81, 485, 25, -4.8, -4],
                4472 + 4168 + 3341 + 2901,
                [91, 1812, 88, 1727, 84, -4.8, 8],
                [99, 1089, 97, 1008, 80, -5.7, 10],
                3322,
                [127, 2491, 101, 1843, 647, -8.6, 0],
              ];
              break;
            case 2:
              // case 0 with +/- attenuation
              parts = [
                [69, 1410, 43, 1184, 225, -6.8, 0],
                [72, 1075, 64, 1007, 67, -5.3, 3],
                [86, 511, 81, 485, 25, -5.3, -4],
                4472 + 4168 + 3341 + 2901,
                [91, 1812, 88, 1727, 84, -4.4, 8],
                [99, 1089, 97, 1008, 80, -5.3, 10],
                3322,
                [127, 2491, 101, 1843, 647, -8.2, 0],
              ];
              break;
          }
          break;
        case 0x1F:
          switch (bank) {
            case 0: default:
              noteNumber = 10;
              parts = [
                445 + 317 + 170 + 1167 + 545 + 277 + 145 + 244 + 101 + 98,
                [64, 856, 67, 784, 71, -4.43, 27],
                [80, 710, 82, 691, 18, -0.28, 26],
                [95, -710, 82, 691, 18, -4.7, 26],
                [127, -710, 99, 691, 18, -7.8, 26], // 99 seems like a mistake here?
              ];
              break;
          }
          break;
        case 0x58:
          noteNumber = 9;
          parts = [
            1630 + 636 + 375 + 249 + 98 + 1523 + 227 + 545 + 797 + 144 + 1085 + 595,
            [71, 5466, 53, 3820, 1645, -5.63, 4],
            [83, 3196, 81, 2374, 821, -3.5, -12],
            [99, -3196, 81, 2374, 821, -6.5, -12],
            1912 + 1603,
            [127, 315, 90, 299, 15, -8, 12],
          ];
          break;
        case 0x62:
          noteNumber = 9;
          parts = [
            [102, 1630, 88, 1428, 201, -1, 3],
            636 + 375 + 249 + 98 + 1523 + 227 + 545 + 797 + 144 + 1085 + 595 + 5466,
            [127, 3196, 81, 2374, 821, -4.1, -12],
          ];
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
          if (typeof parts[j] === 'number') {
            samples = samples.subarray(parts[j]);
            continue;
          }
          doKeys.apply(null, parts[j]);
        }
        return keys;
      });
    },
  };
  
  return note;
  
});
