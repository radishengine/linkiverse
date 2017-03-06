define(function() {

  'use strict';
  
  var audioContext = new AudioContext();
  
  var baseTime, updateInterval = null;
  
  var activeTracks = [];
  
  function secondsToDelta(sec) {
    return sec * 100;
  }
  
  var channels = new Array(16);
  
  function Channel() {
    this.volumeControl = audioContext.createGain();
    this.oscillator = audioContext.createOscillator();
    this.oscillator.type = 'square';
    this.oscillator.start();
    this.oscillator.connect(this.volumeControl);
    this.panControl = audioContext.createStereoPanner();
    this.volumeControl.connect(this.panControl);
    this.finalNode = this.panControl;
  }
  Channel.prototype = {
    on: function(key, velocity) {
      if (velocity === 0) return this.off(key, velocity);
      this.oscillator.frequency.value = (440 / 32) * Math.pow(2, ((key - 9) / 12));
      this.finalNode.connect(audioContext.destination);
    },
    off: function(key, velocity) {
      this.finalNode.disconnect();
    },
    keyPressure: function(key, pressure) {
    },
    control: function(control, value) {
      switch (control) {
        case 7: this.volumeControl.gain.value = value/127; break;
        case 10:
          this.panControl.pan.value = (value - 64) / (value >= 64 ? 63 : 64);
          break;
      }
    },
    program: function(program) {
    },
    pressure: function(program) {
    },
    pitchBend: function(range) {
    },
  };
  
  for (var i = 0; i < channels.length; i++) {
    channels[i] = new Channel();
  }
  
  function systemExclusive(bytes) {
  }
  
  function onMeta(code, bytes) {
  }
  
  function updateAudio(doNotLoop) {
    var now = audioContext.currentTime;
    var elapsed = now - baseTime;
    baseTime = now;
    var anyPlayed = false;
    for (var i = 0; i < activeTracks.length; i++) {
      var track = activeTracks[i];
      if (track.pos >= track.length) continue;
      anyPlayed = true;
      track.remainingDelta -= secondsToDelta(elapsed);
      commandLoop: while (track.remainingDelta <= 0) {
        var command = track[track.pos++];
        if (command < 0x80) {
          command = track.lastCommand;
          --track.pos;
        }
        else {
          track.lastCommand = command;
        }
        switch (command & 0xf0) {
          case 0x80:
            var key = track[track.pos++];
            var velocity = track[track.pos++];
            channels[command & 0xf].off(key, velocity);
            break;
          case 0x90:
            var key = track[track.pos++];
            var velocity = track[track.pos++];
            channels[command & 0xf].on(key, velocity);
            break;
          case 0xA0:
            var key = track[track.pos++];
            var pressure = track[track.pos++];
            channels[command & 0xf].keyPressure(key, pressure);
            break;
          case 0xB0:
            var control = track[track.pos++];
            var value = track[track.pos++];
            channels[command & 0xf].control(control, value);
            break;
          case 0xC0:
            channels[command & 0xf].program(track[track.pos++]);
            break;
          case 0xD0:
            channels[command & 0xf].pressure(track[track.pos++]);
            break;
          case 0xE0:
            var range = track[track.pos++];
            range |= track[track.pos++] << 8;
            channels[command & 0xf].pitchBend(range);
            break;
          case 0xF0:
            if (command === 0xFF) {
              var meta = track[track.pos++];
              if (meta == 0x2F) {
                track.pos = track.length + 1;
                break commandLoop;
              }
              var metaPos = track.pos;
              var metaLength = track.nextVarint();
              onMeta(meta, track.subarray(metaPos, metaPos + metaLength));
              track.pos += metaLength;
            }
            else if (command === 0xF0) {
              var firstPos = track.pos - 1;
              while (track[track.pos] !== 0xF7) {
                track.pos++;
              }
              systemExclusive(track.subarray(firstPos, track.pos - 1));
            }
            else if (command === 0xF7) {
              var firstPos = track.pos;
              while (track[track.pos] !== 0xF7) {
                track.pos++;
              }
              systemExclusive(track.subarray(firstPos, track.pos - 1));
            }
            else {
              console.error('unknown midi command: 0x' + command.toString(16));
              activeTracks = [];
            }
            break;
        }
        track.remainingDelta += track.nextVarint();
      }
    }
    if (!anyPlayed && !doNotLoop) {
      for (var i = 0; i < activeTracks.length; i++) {
        var track = activeTracks[i];
        track.pos = 0;
        track.remainingDelta = track.nextVarint();
      }
      updateAudio(true);
    }
  }
  
  function nextVarint() {
    var value = 0;
    var b = this[this.pos++];
    while (b & 0x80) {
      value = (value << 7) | (b & 0x7f);
      b = this[this.pos++];
    }
    return (value << 7) | b;
  }
  
  var midi = {
    resume: function() {
      if (updateInterval !== null || activeTracks.length === 0) return;
      baseTime = audioContext.currentTime;
      updateInterval = setInterval(updateAudio, 20);
    },
    pause: function() {
      if (updateInterval === null) return;
      clearInterval(updateInterval);
      updateInterval = null;
    },
    play: function() {
      return midi.load.apply(midi, arguments).then(midi.resume);
    },
    load: function(source, selectTrackNumber) {
      if (source instanceof Blob) {
        var fr = new FileReader();
        return new Promise(function(resolve, reject) {
          fr.addEventListener('load', function() {
            resolve(midi.load(this.result, selectTrackNumber));
          });
          fr.readAsArrayBuffer(source);
        });
      }
      var bytes, dv;
      if (source instanceof ArrayBuffer) {
        bytes = new Uint8Array(source);
        dv = new DataView(source);
      }
      else if (source instanceof Uint8Array) {
        bytes = source;
        dv = new DataView(source.buffer, source.byteOffset, source.byteLength);
      }
      else if (source instanceof DataView) {
        bytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
        dv = source;
      }
      else {
        return Promise.reject('source must be Blob, ArrayBuffer, DataView or Uint8Array');
      }
      if (String.fromCharCode.apply(null, bytes.subarray(0, 8)) !== 'MThd\x00\x00\x00\x06') {
        return Promise.reject('invalid midi file');
      }
      var trackMode;
      switch(dv.getUint16(8, false)) {
        case 0: trackMode = 'single'; break;
        case 1: trackMode = 'allAtOnce'; break;
        case 2: trackMode = 'separate'; break;
        default: return Promise.reject('unknown playback mode');
      }
      var trackCount = dv.getUint16(10, false);
      if (isNaN(selectTrackNumber)) selectTrackNumber = 0;
      if (selectTrackNumber < 0 || selectTrackNumber >= trackCount || (trackMode === 'allAtOnce' && selectTrackNumber > 0)) {
        return Promise.reject('track number out of range');
      }
      var deltaTimeUnit;
      var deltaTimeValue = dv.getInt16(12, false);
      if (deltaTimeValue < 0) {
        deltaTimeValue = -deltaTimeValue;
        deltaTimeUnit = 'smpte';
      }
      else {
        deltaTimeUnit = 'ticksPerBeat';
      }
      var foundTracks = [];
      for (var pos = 14; pos < bytes.length; ) {
        if (String.fromCharCode(bytes[pos], bytes[pos+1], bytes[pos+2], bytes[pos+3]) !== 'MTrk') {
          return Promise.reject('invalid midi file');
        }
        var trackLength = dv.getUint32(pos + 4, false);
        var trackData = bytes.subarray(pos + 8, pos + 8 + trackLength);
        foundTracks.push(trackData);
        pos += 8 + trackLength;
      }
      if (foundTracks.length !== trackCount) {
        return Promise.reject('expected ' + trackCount + ' tracks, found ' + foundTracks.length);
      }
      if (trackMode === 'separate' && trackCount > 1) {
        foundTracks = [foundTracks[selectedTrackNumber]];
      }
      for (var i = 0; i < foundTracks.length; i++) {
        foundTracks[i].pos = 0;
        foundTracks[i].nextVarint = nextVarint;
        foundTracks[i].remainingDelta = foundTracks[i].nextVarint();
      }
      activeTracks = foundTracks;
    },
    stop: function() {
      this.pause();
      activeTracks.splice(0, activeTracks.length);
      for (var i = 0; i < channels.length; i++) {
        channels[i].off();
      }
    },
  };
  
  return midi;

});
