define(['./note'], function(noteData) {

  'use strict';
  
  var audioContext = new AudioContext();
  
  var baseTime, updateInterval = null;
  
  var activeTracks = [];
  
  var ticksPerSecond;
  
  var timing = {
    recalc: function() {
      ticksPerSecond = this.speedMultiplier * (this.ticksPerBeat * this.beatsPerMinute) / 60;
    },
    get beatsPerMinute() { return this._bpm; },
    set beatsPerMinute(value) {
      this._bpm = value;
      this.recalc();
    },
    get ticksPerBeat() { return this._tpb; },
    set ticksPerBeat(value) {
      this._tpb = value;
      this.recalc();
    },
    get speedMultiplier() { return this._mul; },
    set speedMultiplier(value) {
      this._mul = value;
      this.recalc();
    },
    _bpm: 120,
    _tpb: 5,
    _mul: 1,
  };
  
  var channels = new Array(16);
  
  function Channel() {
    this.volumeControl = audioContext.createGain();
    this.firstNode = this.volumeControl;
    this.panControl = audioContext.createStereoPanner();
    this.volumeControl.connect(this.panControl);
    this.finalNode = this.panControl;
    this.keys = new Array(128);
    this.finalNode.connect(audioContext.destination);
  }
  Channel.prototype = {
    isPercussionChannel: false,
    on: function(key, velocity) {
      if (velocity === 0) return this.off(key, velocity);
      if (this.isPercussionChannel) return;
      var startTime = audioContext.currentTime;
      var bufferSource = audioContext.createBufferSource();
      var mul = audioContext.createGain();
      this.off(key, 0);
      this.keys[key] = mul;
      mul.bufferNode = bufferSource;
      mul.gain.value = velocity/127;
      bufferSource.connect(mul);
      mul.connect(this.firstNode);
      var self = this;
      bufferSource.addEventListener('ended', function() {
        if (self.keys[key] === mul) {
          self.keys[key] = null;
        }
        mul.disconnect();
      });
      bufferSource.start(startTime);
      noteData.loadBuffer(bufferSource, key, false, this.program, this.cc0);
      /*
      var keyNode = this.keys[key];
      if (!keyNode) {
        keyNode = audioContext.createOscillator();
        keyNode.type = this.isPercussionChannel ? 'triangle' : 'square';
        keyNode.frequency.value = (440 / 32) * Math.pow(2, ((key - 9) / 12));
        keyNode.start();
        var copy = audioContext.createGain();
        copy.frequency = keyNode.frequency;
        keyNode.connect(copy);
        keyNode = copy;
        this.keys[key] = keyNode;
      }
      keyNode.gain.value = velocity/127;
      keyNode.connect(this.firstNode);
      */
    },
    off: function(key, velocity) {
      var keyNode = this.keys[key];
      if (keyNode) {
        var now = audioContext.currentTime;
        keyNode.gain.exponentialRampToValueAtTime(1e-4, now + 0.1);
        keyNode.bufferNode.stop(now + 0.1);
        this.keys[key] = null;
      }
    },
    keyPressure: function(key, pressure) {
    },
    control: function(control, value) {
      switch (control) {
        case 0: this.cc0 = value; break;
        case 7: this.volumeControl.gain.value = value/127; break;
        case 10:
          this.panControl.pan.value = (value - 64) / (value >= 64 ? 63 : 64);
          break;
      }
    },
    cc0: 0,
    program: 0,
    pressure: function(program) {
    },
    pitchBend: function(range) {
    },
  };
  
  for (var i = 0; i < channels.length; i++) {
    channels[i] = new Channel();
  }
  channels[9].isPercussionChannel = true;
  
  function systemExclusive(bytes) {
  }
  
  function onMeta(code, bytes) {
    switch (code) {
      case 0x51:
        timing.beatsPerMinute = 6e7 / (bytes[0] * 0x10000 + bytes[1] * 0x100 + bytes[2]);
        break;
      case 0x58:
        timing.speedMultiplier = bytes[3] / 8;
        break;
    }
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
      track.remainingDelta -= elapsed * ticksPerSecond;
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
            channels[command & 0xf].program = track[track.pos++];
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
              var metaLength = track.nextVarint();
              onMeta(meta, track.subarray(track.pos, track.pos + metaLength));
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
    load: function(source, selectTrackNumber, keepInitialSilence) {
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
        timing.ticksPerBeat = deltaTimeValue;
      }
      var foundTracks = [];
      for (var pos = 14; pos < bytes.length - 7; ) {
        if (String.fromCharCode(bytes[pos], bytes[pos+1], bytes[pos+2], bytes[pos+3]) !== 'MTrk') {
          if (foundTracks.length === trackCount) {
            // ignore trailing garbage
            break;
          }
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
        foundTracks = [foundTracks[selectTrackNumber]];
      }
      var minDelta = Infinity;
      for (var i = 0; i < foundTracks.length; i++) {
        foundTracks[i].pos = 0;
        foundTracks[i].nextVarint = nextVarint;
        foundTracks[i].remainingDelta = foundTracks[i].nextVarint();
        minDelta = Math.min(minDelta, foundTracks[i].remainingDelta);
      }
      if (!keepInitialSilence && isFinite(minDelta)) {
        for (var i = 0; i < foundTracks.length; i++) {
          foundTracks[i].remainingDelta -= minDelta;
        }
      }
      activeTracks = foundTracks;
      return Promise.resolve();
    },
    stop: function() {
      this.pause();
      activeTracks.splice(0, activeTracks.length);
      for (var i = 0; i < channels.length; i++) {
        for (var j = 0; j < 128; j++) {
          channels[i].off(j, 127);
        }
      }
    },
  };
  
  function mergeTracks(tracks) {
    var totalSize = 0;
    for (var i = 0; i < tracks.length; i++) {
      totalSize += tracks[i].length;
    }
    var combined = new Uint8Array(totalSize);
    combined.pos = 0;
    function writeVarint(v, highBit) {
      if (v >= 0x80) {
        writeVarint(v >>> 7, true);
      }
      combined[combined.pos++] = (v & 0x7f) | (highBit ? 0x80 : 0);
    }
    tracks = tracks.map(function(track) {
      track = new Uint8Array(track.buffer, track.byteOffset, track.byteLength);
      track.pos = 0;
      track.nextVarint = function() {
        var value = 0;
        var b = this[this.pos++];
        while (b & 0x80) {
          value = (value << 7) | (b & 0x7f);
          b = this[this.pos++];
        }
        return (value << 7) | b;
      };
      track.remainingTicks = track.nextVarint();
      return track;
    });
    do {
      var i = 0, j = 1;
      while (tracks[i].remainingTicks > 0 && j < tracks.length) {
        if (tracks[j].remainingTicks < tracks[i].remainingTicks) {
          i = j;
        }
        j++;
      }
      var track = tracks[i];
      for (j = 0; j < tracks.length; j++) {
        if (i === j) continue;
        tracks[j].remainingTicks -= track.remainingTicks;
      }
      var startPos = track.pos;
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
        case 0x90:
        case 0xA0:
        case 0xB0:
        case 0xE0:
          track.pos += 2;
          break;
        case 0xC0:
        case 0xD0:
          track.pos++;
          break;
        case 0xF0:
          if (command === 0xFF) {
            command = track[track.pos++];
            if (command === 0x2F) {
              track = null;
              break;
            }
            var metaLength = track.nextVarint();
            track.pos += metaLength;
          }
          else if (command === 0xF0 || command === 0xF7) {
            while (track[track.pos] !== 0xF7) {
              track.pos++;
            }
          }
          else {
            throw new Error('unknown midi command: 0x' + command.toString(16));
          }
          break;
      }
      if (track === null) {
        tracks.splice(i, 1);
      }
      else {
        combined.writeVarint(track.remainingTicks);
        var segment = track.subarray(startPos, track.pos);
        combined.set(segment, combined.pos);
        combined.pos += segment.length;
        if (track.pos >= track.length) {
          tracks.splice(i, 1);
        }
        else {
          track.remainingTicks = track.nextVarint();
        }
      }
    } while (tracks.length !== 0);
    return combined.subarray(0, combined.pos);
  }
  
  function MIDIChannel(number) {
    this.number = number;
    this.control = new Uint8Array(128);
    this.keyAftertouch = new Uint8Array(128);
  }
  MIDIChannel.prototype = {
    get isPercussion() { return this.number === 9; },
    number: 0,
    pressure: 1,
    program: 0,
    bank: 0,
    channelAftertouch: 0,
  };
  
  function MIDIRecital(singleTrack, destination, ticksPerSecond) {
    this.track = singleTrack;
    this.remainingTicks = this.nextVarint();
    this.destination = destination;
    this.node = destination.context.createGain();
    this.node.connect(this.destination);
    this.playingNodes = [];
    this.ticksPerSecond = ticksPerSecond;
    this.channels = new Array(16);
    for (var i = 0; i < this.channels.length; i++) {
      this.channels[i] = new MIDIChannel(i);
    }
  }
  MIDIRecital.prototype = {
    pos: 0,
    remainingTicks: 0,
    nextVarint: function() {
      var value = 0;
      var b = this.track[this.pos++];
      while (b & 0x80) {
        value = (value << 7) | (b & 0x7f);
        b = this.track[this.pos++];
      }
      return (value << 7) | b;
    },
    aheadSeconds: 3,
    get eventTarget() {
      return this.node;
    },
    start: function(startTime) {
      startTime = isNaN(startTime) ? this.node.context.currentTime : startTime;
      this.frontierTime = this.startTime = startTime;
      this.populate();
    },
    populate: function() {
      if (this.pos >= this.track.length) {
        if (this.playingNodes.length === 0) {
          this.node.disconnect();
          this.node.dispatchEvent(new CustomEvent('ended'));
        }
        return;
      }
      var maxFrontierTime = this.node.context.currentTime + this.aheadSeconds;
      do {
        if (this.remainingTicks > 0) {
          this.frontierTime += this.remainingTicks / this.ticksPerSecond;
        }
        var command = this.track[this.pos++];
        if (command < 0x80) {
          command = this.lastCommand;
          --this.pos;
        }
        else {
          this.lastCommand = command;
        }
        switch (command & 0xf0) {
          case 0x80: // note off (handled by earlier note-on handler)
            this.pos += 2;
            break;
          case 0xA0: // key aftertouch
            var key = this.track[this.pos++];
            this.channels[command & 0xf].keyAftertouch[key] = this.track[this.pos++];
            break;
          case 0x90:
            var channel = command & 0xf;
            var key = this.track[this.pos++];
            var velocity = this.track[this.pos++];
            if (velocity === 0) {
              // same as note off
              break;
            }
            var noteSource = this.node.context.createBufferSource();
            noteData.loadBuffer(noteSource, key, channel.isPercussion, channel.program, channel.control[0]);
            var noteGain = this.node.context.createGain();
            noteGain.gain.value = velocity/127;
            noteSource.connect(noteGain);
            noteGain.connect(this.node);
            noteSource.recital = this;
            noteSource.gain = noteGain;
            this.playingNodes.push(noteSource);
            noteSource.addEventListener('ended', function() {
              this.gain.disconnect();
              this.recital.playingNodes.splice(this.recital.playingNodes.indexOf(this), 1);
              this.recital.populate();
            });
            var frontierTime2 = this.frontierTime;
            noteSource.start(frontierTime2);
            var restorePos = this.pos;
            var lastCommand = command;
            var ticksPerSecond = this.ticksPerSecond;
            readLoop: while (this.pos < this.track.length) {
              var ticks = this.nextVarint();
              frontierTime2 += ticks / ticksPerSecond;
              var command = this.track[this.pos++];
              if (command < 0x80) {
                command = lastCommand;
                --this.pos;
              }
              else {
                lastCommand = command;
              }
              switch (command & 0xf0) {
                case 0x80: // note off
                case 0x90: // note on
                  var key2 = this.track[this.pos++];
                  var velocity2 = this.track[this.pos++];
                  if (key === key2 && channel === (command & 0xf)) {
                    break readLoop;
                  }
                  break;
                case 0xA0: // key aftertouch
                  this.pos += 2;
                  break;
                case 0xB0: // control
                  var control = this.track[this.pos++];
                  var value = this.track[this.pos++];
                  throw new Error('NYI');
                  break;
                case 0xC0: // channel program
                case 0xD0: // channel aftertouch
                  this.pos++;
                  break;
                case 0xF0:
                  if (command === 0xFF) {
                    command = this.track[this.pos++];
                    if (command === 0x2F) {
                      break readLoop;
                    }
                    var metaLength = this.nextVarint();
                    this.pos += metaLength;
                    throw new Error('NYI');
                  }
                  else if (command === 0xF0 || command === 0xF7) {
                    while (this.track[this.pos] !== 0xF7) {
                      this.pos++;
                    }
                  }
                  else {
                    throw new Error('unknown midi command: 0x' + command.toString(16));
                  }
                  break;
              }
            }
            this.pos = restorePos;
            noteGain.gain.setValueAtTime(velocity/127, frontierTime2 - 0.1);
            noteGain.gain.exponentialRampToValueAtTime(1e-4, frontierTime2);
            noteSource.stop(frontierTime2);
            maxFrontierTime = Math.max(maxFrontierTime, frontierTime2);
            break;
          case 0xB0:
            var control = this.track[this.pos++];
            this.channels[command & 0xf].control[control] = this.track[this.pos++];
            break;
          case 0xC0:
            this.channels[command & 0xf].program = this.track[this.pos++];
            break;
          case 0xD0:
            this.channels[command & 0xf].channelAftertouch = this.track[this.pos++];
            break;
          case 0xE0:
            var range = this.track[this.pos++];
            range |= this.track[this.pos++] << 7;
            range -= 0x2000;
            this.channels[command & 0xf].pitchBend = range;
            break;
          case 0xF0:
            if (command === 0xFF) {
              command = this.track[this.track.pos++];
              if (command === 0x2F) {
                this.pos = this.track.length + 1;
                break;
              }
              var metaLength = this.nextVarint();
              var metaData = this.track.subarray(this.pos, this.pos + metaLength);
              this.pos += metaLength;
              switch (command) {
                case 0x00: // sequence number
                  break;
                case 0x01: // text
                  break;
                case 0x02: // copyright notice
                  break;
                case 0x03: // sequence/track name
                  break;
                case 0x04: // instrument name
                  break;
                case 0x05: // lyric text
                  break;
                case 0x06: // marker text
                  break;
                case 0x07: // cue point
                  break;
                case 0x20: // channel prefix assignment
                  break;
                case 0x51: // tempo setting
                  break;
                case 0x54: // smpte offset
                  break;
                case 0x58: // time signature
                  break;
                case 0x59: // key signature
                  break;
                case 0x7F: // sequencer specific event
                  break;
                default:
                  break;
              }
            }
            else if (command === 0xF0 || command === 0xF7) {
              var firstPos = this.pos - (command === 0xF7 ? 0 : 1);
              while (this.track[this.pos] !== 0xF7) {
                this.pos++;
              }
              var systemExclusive = this.track.subarray(firstPos, this.pos - 1);
              // do something with this system exclusive data...?
            }
            else {
              throw new Error('unknown midi command: 0x' + command.toString(16));
            }
            break;
        }
        if (this.pos < this.track.length) {
          this.remainingTicks += this.nextVarint();
        }
        else {
          if (this.playingNodes.length === 0) {
            this.node.disconnect();
            this.node.dispatchEvent(new CustomEvent('ended'));
          }
          break;
        }
      } while (this.frontierTime < maxFrontierTime || this.playingNodes.length === 0);
    },
  };
  
  return midi;

});
