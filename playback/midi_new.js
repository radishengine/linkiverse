define(['./midiNoteData'], function(midiNoteData) {

  'use strict';
  
  const CC14_HI = 0, CC14_LO = 32,
        CC14_BANK = 0,
        CC14_MOD_WHEEL = 1,
        CC14_BREATH = 2,
        // 3 undefined
        CC14_FOOT = 4,
        CC14_PORTAMENTO_TIME = 5,
        CC14_DATA_ENTRY = 6,
        CC14_VOLUME = 7,
        CC14_BALANCE = 8,
        // 9 undefined
        CC14_PAN = 10,
        CC14_EXPRESSION = 11,
        
        CC_DAMPER_PEDAL_ON = 64,
        CC_PORTAMENTO_ON = 65,
        CC_SOSTENUTO_ON = 66,
        CC_SOFT_PEDAL_ON = 67,
        CC_LEGATO_ON = 68,
        CC_HOLD_2_ON = 69,
        MM_ALL_SOUND_OFF = 120,
        MM_RESET_ALL_CONTROLLERS = 121,
        MM_LOCAL_CONTROL_ON = 122,
        MM_ALL_NOTES_OFF = 123,
        MM_OMNI_OFF = 124,
        MM_OMNI_ON = 125,
        MM_MONO_ON = 126,
        MM_POLY_ON = 127;
  
  const CHANNEL_COMMANDS = Object.freeze([
    'note-off',
    'note-on',
    'key-aftertouch',
    'control-change',
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
        case 'control-change':
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
    this.controlValues = new Uint8Array(120);
  }
  ChannelState.prototype = {
    program: 0,
    pitchBendRange: 0,
    initFrom: function(channelState) {
      this.keyVelocities.set(channelState.keyVelocities);
      this.controlValues.set(channelState.controlValues);
      this.program = channelState.program;
      this.pitchBendRange = channelState.pitchBendRange;
    },
    getCC14(v, mode) {
      if (mode === 'coarse') return this.controlValues[CC14_HI | v] / 0x7f;
      var v = (this.controlValues[CC14_HI | v] << 7) | this.controlValues[CC14_LO | v];
      if (mode === 'fine') return v / 0x3fff;
      return v;
    },
    get bank()                { return this.getCC14(CC14_BANK               ); },
    get modWheelCoarse()      { return this.getCC14(CC14_MOD_WHEEL, 'coarse'); },
    get modWheelFine()        { return this.getCC14(CC14_MOD_WHEEL, 'fine'  ); },
    get breathControlCoarse() { return this.getCC14(CC14_BREATH,    'coarse'); },
    get breathControlFine()   { return this.getCC14(CC14_BREATH,    'fine'  ); },
    get footControlCoarse()   { return this.getCC14(CC14_FOOT,      'coarse'); },
    get footControlFine()     { return this.getCC14(CC14_FOOT,      'fine'  ); },
    get volumeCoarse()        { return this.getCC14(CC14_VOLUME,    'coarse'); },
    get volumeFine()          { return this.getCC14(CC14_VOLUME,    'fine'  ); },
    get balanceCoarse()       { return this.getCC14(CC14_BALANCE,   'coarse'); },
    get balanceFine()         { return this.getCC14(CC14_BALANCE,   'fine'  ); },
    get panCoarse()           { return this.getCC14(CC14_PAN,       'coarse'); },
    get panFine()             { return this.getCC14(CC14_PAN,       'fine'  ); },
    get expressionCoarse()    { return this.getCC14(CC14_EXPRESSION,'coarse'); },
    get expressionFine()      { return this.getCC14(CC14_EXPRESSION,'fine'  ); },
    get damperPedalOn() {
      return this.controlValues[CC_DAMPER_PEDAL_ON] >= 64;
    },
    get portamentoOn() {
      return this.controlValues[CC_PORTAMENTO_ON] >= 64;
    },
    get sostenutoOn() {
      return this.controlValues[CC_SOSTENUTO_ON] >= 64;
    },
    get softPedalOn() {
      return this.controlValues[CC_SOFT_PEDAL_ON] >= 64;
    },
    get legatoOn() {
      return this.controlValues[CC_LEGATO_ON] >= 64;
    },
    get hold2On() {
      return this.controlValues[CC_HOLD_2_ON] >= 64;
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
    omniMode: false,
    monoMode: false,
    polyMode: false,
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
    onNoteDown: function(channel_i, key, velocity) {
    },
    onNoteUp: function(channel_i, key) {
    },
    onProgram: function(channel_i, prog) {
    },
    onControlChange: function(channel_i, cc, v) {
      switch (cc) {
        case CC_DAMPER_PEDAL_ON:
          this.channels[channel_i].damperPedal = true;
          break;
      }
    },
    onPitchBendChange: function(channel_i, newRange) {
    },
    onModeMessage: function(channel_i, mm, v) {
      switch (mm) {
        case MM_ALL_NOTES_OFF:
          this.allNotesOff();
          break;
        case MM_OMNI_ON:
          this.omniMode = true;
          this.allNotesOff();
          break;
        case MM_OMNI_OFF:
          this.omniMode = false;
          this.allNotesOff();
          break;
        case MM_MONO_ON:
          this.monoMode = true;
          this.polyMode = false;
          this.allNotesOff();
          break;
        case MM_POLY_ON:
          this.polyMode = true;
          this.monoMode = false;
          this.allNotesOff();
          break;
      }
    },
    allNotesOff: function(channel_i) {
      var channel = this.channels[channel_i];
      for (var key_i = 0; key_i < channel.keyVelocities.length; key_i++) {
        if (channel.keyVelocities[key_i] !== 0) {
          channel.keyVelocities[key_i] = 0;
          this.onNoteUp(channel_i, key_i);
        }
      }
    },
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
        case 'control-change':
          if (tkRdr.control >= 120) {
            this.onModeMessage(tkRdr.channel, tkRdr.control, tkRdr.value);
          }
          else {
            this.channels[tkRdr.channel].controlValues[tkRdr.control] = tkRdr.value;
            this.onControlChange(tkRdr.channel, tkRdr.control, tkRdr.value);
          }
          break;
        case 'pitch-bend':
          this.channels[tkRdr.channel].pitchBendRange = tkRdr.pitchBendRange;
          this.onPitchBendChange(tkRdr.channel, tkRdr.pitchBendRange);
          break;
      }
    },
  }:

  return {
  };

});
