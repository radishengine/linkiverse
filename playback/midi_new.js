define(['./midiNoteData'], function(midiNoteData) {

  'use strict';
  
  const CHANNEL_COMMANDS = Object.freeze([
    'note-off',
    'note-on',
    'key-aftertouch',
    'control',
    'set-program',
    'channel-aftertouch',
    'pitch-bend',
  ]);
  
  function TrackReader(bytes) {
    this.bytes = bytes;
    this.pos = 0;
    this.command = -1;
  }
  TrackReader.prototype = {
    initFrom: function(trackReader) {
      return Object.assign(this, trackReader);
    },
    readVarint: function() {
      var value = 0;
      var b = this.bytes[this.pos++];
      while (b & 0x80) {
        value = (value << 7) | (b & 0x7f);
        b = this.bytes[this.pos++];
      }
      return (value << 7) | b;      
    },
    next: function() {
      this.delay = this.nextVarint();
      var command = this.bytes[this.pos++];
      if (isNaN(command)) return null;
      if (command < 0x80) {
        this.pos--;
        command = this.command;
      }
      else if (command & 0xf0 === 0xf0) {
        if (command === 0xff) {
          var metaEventCode = this.bytes[this.pos++];
          var metaByteLength = this.readVarint();
          this.metaData = this.bytes.subarray(this.pos, this.pos + metaByteLength);
          this.pos += metaByteLength;
          this.metaEventCode = metaEventCode;
          return this.command = 'meta';
        }
        if (command !== 0xf0 && command !== 0xf7) {
          throw new Error('unknown midi event: 0x' + command.toString(16));
        }
        var startPos = command === 0xf0 ? this.pos-1 : this.pos;
        while (this.bytes[this.pos] !== 0xf7) {
          if (++this.pos >= this.bytes.length) {
            throw new Error('unterminated sysex section');
          }
        }
        this.sysexData = this.bytes.subarray(startPos, this.pos);
        return this.command = 'sysex';
      }
      else {
        this.channel = command & 0xf;
        command = this.command = CHANNEL_COMMANDS[(command >> 4) & 7];
      }
      switch (command) {
        case 'note-off':
        case 'note-on':
          this.key = this.bytes[this.pos++];
          this.velocity = this.bytes[this.pos++];
          break;
        case 'key-aftertouch':
          this.key = this.bytes[this.pos++];
          this.aftertouch = this.bytes[this.pos++];
          break;
        case 'command':
          this.control = this.bytes[this.pos++];
          this.value = this.bytes[this.pos++];
          break;
        case 'set-program':
          this.program = this.bytes[this.pos++];
          break;
        case 'channel-aftertouch':
          this.aftertouch = this.bytes[this.pos++];
          break;
        case 'pitch-bend':
          var range = this.bytes[this.pos++];
          range |= this.bytes[this.pos++] << 7;
          range -= 0x2000;
          this.pitchBendRange = range;
          break;
      }
      return command;
    },
  };

  function ChannelState(isPercussion) {
    this.isPercussion = isPercussion;
    this.keyVelocities = new Uint8Array(128);
    this.controlValues = new Uint8Array(128);
    this.program = 0;
    this.pitchBendRange = 0;
  }
  ChannelState.prototype = {
    initFrom: function(channelState) {
      this.keyVelocities.set(channelState.keyVelocities);
      this.controlValues.set(channelState.controlValues);
      this.program = channelState.program;
      this.pitchBendRange = channelState.pitchBendRange;
    },
  };
  
  function PlayState() {
    this.channels = new Array(16);
    for (var i = 0; i < this.channels.length; i++) {
      this.channels[i] = new ChannelState(i === 9);
    }
    Object.freeze(this.channels);
  }
  PlayState.prototype = {
    timingUnit: 'beat',
    ticksPerBeat: 24,
    beatsPerMinute: 120,
    framesPerSecond: 25,
    ticksPerFrame: 2,
    speedRatio: 1,
    secondsElapsed: 0,
    get secondsPerTick() {
      switch (this.timingUnit) {
        case 'beat':
          return this.ticksPerBeat * (this.beatsPerMinute/60) / this.speedRatio;
        case 'frame':
          return this.ticksPerFrame * this.framesPerSecond / this.speedRatio;
      }
      throw new Error('invalid timing unit: must be beat or frame');
    },
    initFrom: function(playState) {
      for (var i = 0; i < this.channels.length; i++) {
        this.channels[i].initFrom(playState.channels[i]);
      }
      this.timingUnit = playState.timingUnit;
      this.ticksPerBeat = playState.ticksPerBeat;
      this.beatsPerMinute = playState.beatsPerMinute;
      this.framesPerSecond = playState.framesPerSecond;
      this.ticksPerFrame = playState.ticksPerFrame;
      this.speedRatio = playState.speedRatio;
      this.secondsElapsed = playState.secondsElapsed;
    },
    onNoteDown: function(ch, key, velocity) { },
    onNoteUp: function(ch, key) { },
    onProgram: function(ch, prog) { },
    onControl: function(ch, ctrl, v) { },
    advanceTrack: function(tkRdr) {
      this.secondsElapsed += tkRdr.delay * this.secondsPerTick;
      switch (tkRdr.command) {
        case 'note-on':
          if (tkRdr.velocity === 0) {
            this.channels[tkRdr.channel].keyVelocities[tkRdr.key] = 0;
            this.onNoteUp(tkRdr.channel, tkRdr.key);
          }
          else {
            this.onNoteDown(tkRdr.channel, tkRdr.key,
              this.channels[tkRdr.channel].keyVelocities[tkRdr.key] = tkRdr.velocity);
          }
          break;
        case 'note-off':
          this.channels[tkRdr.channel].keyVelocities[tkRdr.key] = 0;
          this.onNoteUp(tkRdr.channel, tkRdr.key);
          break;
        case 'set-program':
          this.channels[tkRdr.channel].program = tkRdr.program;
          this.onProgram(tkRdr.channel, tkRdr.program);
          break;
        case 'control':
          this.channels[tkRdr.channel].controlValues[tkRdr.control] = tkRdr.value;
          this.onControl(tkRdr.channel, tkRdr.control, tkRdr.value);
          break;
        case 'pitch-bend':
          this.channels[tkRdr.channel].pitchBendRange = tkRdr.pitchBendRange;
          this.onPitchBend(tkRdr.channel, tkRdr.pitchBendRange);
          break;
      }
    },
  }:

  return {
  };

});
