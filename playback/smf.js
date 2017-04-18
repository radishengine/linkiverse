define(['./midiNoteData', './audioEffects'], function(midiNoteData, audioEffects) {

  'use strict';
  
  const CC14_HI = 0, CC14_LO = 32,
        CC14_START = 0, CC14_END = 64,
          CC14_BANK = 0,
          CC14_MOD_WHEEL = 1,
          CC14_BREATH = 2,
          CC14_FOOT = 4,
          CC14_PORTAMENTO_TIME = 5,
          CC14_DATA_ENTRY = 6,
          CC14_VOLUME = 7,
          CC14_BALANCE = 8,
          CC14_PAN = 10,
          CC14_EXPRESSION = 11,
        
        CCBOOL_START = 64, CCBOOL_END = 70,
          CCBOOL_SUSTAIN = 64,
          CCBOOL_PORTAMENTO = 65,
          CCBOOL_SOSTENUTO = 66,
          CCBOOL_SOFT_PEDAL = 67,
          CCBOOL_LEGATO = 68,
          CCBOOL_HOLD_2 = 69,
       
        CC_SOUND_VARIATION = 70,
        CC_TIMBRE_HARMONIC_INTENSITY = 71,
        CC_RELEASE_TIME = 72,
        CC_ATTACK_TIME = 73,
        CC_BRIGHTNESS = 74,
        CC_DECAY_TIME = 75,
        CC_VIBRATO_RATE = 76,
        CC_VIBRATO_DEPTH = 77,
        CC_VIBRATO_DELAY = 78,
        //
        CC_GENERAL_5 = 80,
        CC_GENERAL_6 = 81,
        CC_GENERAL_7 = 82,
        CC_GENERAL_8 = 83,
        CC_PORTAMENTO_TIME = 84,
        //
        CC_PREFIX_VELOCITY_LO = 88,
        //
        CC_REVERB_DEPTH = 91,
        CC_TREMOLO_DEPTH = 92,
        CC_CHORUS_DEPTH = 93,
        CC_DETUNE_DEPTH = 94,
        CC_PHASER_DEPTH = 95,
        //
        CC_NRPN_LO = 98,
        CC_NRPN_HI = 99,
        CC_RPN_LO = 100,
        CC_RPN_HI = 101,
        
        MM_START = 120, MM_END = 128,
          MM_ALL_SOUND_OFF = 120, // ignore release time & sustain
          MM_CONTROLLER_RESET = 121,
          MM_LOCAL_CONTROL_ON = 122,
          MM_ALL_NOTES_OFF = 123, // maintain release time & sustain
          MM_OMNI_OFF = 124,
          MM_OMNI_ON = 125,
          MM_MONO_ON = 126,
          MM_POLY_ON = 127;

  const CMD_KEY_UP = 0,
        CMD_KEY_DOWN = 1,
        CMD_KEY_AFTERTOUCH = 2,
        CMD_CONTROL_CHANGE = 3,
        CMD_SET_PROGRAM = 4,
        CMD_CHANNEL_AFTERTOUCH = 5,
        CMD_PITCH_BEND = 6,
        CMD_SYSEX = 7,
        CMD_META = 8;
  const META_SEQUENCE_NUMBER = CMD_META + 0x00,
        META_TEXT = CMD_META + 0x01,
        META_COPYRIGHT = CMD_META + 0x02,
        META_TITLE = CMD_META + 0x03,
        META_INSTRUMENT_NAME = CMD_META + 0x04,
        META_LYRIC = CMD_META + 0x05,
        META_MARKER = CMD_META + 0x06,
        META_CUE_POINT = CMD_META + 0x07,
        META_CHANNEL_PREFIX = CMD_META + 0x20,
        META_END = CMD_META + 0x2F,
        META_TEMPO = CMD_META + 0x51,
        META_SMPTE_OFFSET = CMD_META + 0x54,
        META_TIME_SIGNATURE = CMD_META + 0x59,
        META_KEY_SIGNATURE = CMD_META + 0x7F;
  
  function TrackReader(bytes) {
    this.args = [];
    if (bytes) this.init(bytes);
  }
  TrackReader.prototype = {
    init: function(bytes) {
      this.bytes = bytes;
      this.byte_i = 0;
      this.command_i = META_END;
      this.args.length = 0;
      return this;
    },
    initFrom: function(trackReader) {
      this.bytes = trackReader.bytes;
      this.byte_i = trackReader.byte_i;
      this.delay = trackReader.delay;
      this.command_i = trackReader.command_i;
      this.channel_i = trackReader.channel_i;
      this.args = trackReader.args.slice();
    },
    readVarint: function() {
      var value = 0;
      var b = this.bytes[this.byte_i++];
      while (b & 0x80) {
        value = (value << 7) | (b & 0x7f);
        b = this.bytes[this.byte_i++];
      }
      return (value << 7) | b;
    },
    isKeyDown: function() {
      return this.command === CMD_KEY_DOWN && this.velocity !== 0;
    },
    get killSustain() {
      return this.command_i === CMD_CONTROL_CHANGE && this.control_i !== MM_ALL_SOUND_OFF;
    },
    next: function() {
      this.delay = this.nextVarint();
      var command_i = this.bytes[this.byte_i++];
      if (isNaN(command_i)) return this.command_i = META_END;
      if (command_i < 0x80) {
        this.byte_i--;
        command_i = this.command_i;
      }
      else if (command_i & 0xf0 === 0xf0) {
        if (command_i === 0xff) {
          command_i = this.command_i = CMD_META + this.bytes[this.byte_i++];
          var metaData = this.bytes.subarray(this.byte_i, this.byte_i + this.readVarint());
          this.byte_i += metaData.length;
          switch (command_i) {
            case META_SEQUENCE_NUMBER:
              metaData = metaData[0] << 8 | metaData[1];
              break;
            case META_CHANNEL_PREFIX:
              this.channel_i = metaData = metaData[0];
              break;
            case META_TEMPO:
              metaData = metaData[0] << 16 | metaData[1] << 8 | metaData[2];
              break;
            case META_SMPTE_OFFSET:
              metaData = {
                hours: metaData[0],
                minutes: metaData[1],
                seconds: metaData[2],
                frames: metaData[3] + metaData[4]/100,
              };
              break;
            case META_TIME_SIGNATURE:
              metaData = {
                numerator: metaData[0],
                denominator: Math.pow(2, metaData[1]),
                ticksPerBeat: metaData[2],
                speedRatio: metaData[3] / 8,
              };
              break;
            case META_TEXT:
            case META_COPYRIGHT:
            case META_TITLE:
            case META_INSTRUMENT_NAME:
            case META_LYRIC:
            case META_MARKER:
            case META_CUE_POINT:
              metaData = String.fromCharCode.apply(null, metaData);
              break;
          }
          this.args.length = 1;
          this.args[0] = metaData;
          return command_i;
        }
        if (command_i !== 0xf0 && command_i !== 0xf7) {
          throw new Error('unknown midi event: 0x' + command_i.toString(16));
        }
        var start_i = command_i === 0xf0 ? this.byte_i-1 : this.byte_i;
        while (this.bytes[this.byte_i] !== 0xf7) {
          if (++this.byte_i >= this.bytes.length) {
            throw new Error('unterminated sysex section');
          }
        }
        this.args.lengh = 1;
        this.args[0] = this.bytes.subarray(start_i, this.byte_i);
        return this.command_i = CMD_SYSEX;
      }
      else {
        this.channel_i = command_i & 0xf;
        command_i = this.command_i = (command_i >> 4) & 7;
      }
      switch (command_i) {
        case CMD_KEY_UP:
        case CMD_KEY_DOWN:
        case CMD_CONTROL_CHANGE:
          var arg1 = this.bytes[this.byte_i++];
          var arg2 = this.bytes[this.byte_i++];
          this.args.splice(0, 2, arg1, arg2);
          break;
        case CMD_SET_PROGRAM:
        case CMD_CHANNEL_AFTERTOUCH:
          this.args.splice(0, 2, this.bytes[this.byte_i++]);
          break;
        case CMD_PITCH_BEND:
          var bend = this.bytes[this.byte_i++];
          bend |= this.bytes[this.byte_i++] << 7;
          bend = (bend - 0x2000) / 0x2000;
          this.args.splice(0, 2, bend);
          break;
      }
      return command_i;
    },
    get key_i() { return this.args[0]; },
    get velocity() { return this.args[1]; },
    get control_i() { return this.args[0]; },
    get controlValue() { return this.args[1]; },
    get pitchBend() { return this.args[0]; },
    get program_i() { return this.args[0]; },
    get aftertouch() {
      return this.args[this.command_i === CMD_CHANNEL_AFTERTOUCH ? 1 : 0];
    },
    get beatsPerMinute() {
      return 60000000 / this.args[0];
    },
    get speedRatio() {
      return this.args[0].speedRatio;
    },
  };

  function ChannelState() {
    this.keyVelocities = new Uint8Array(128);
    this.controlValues = new Uint8Array(120);
  }
  ChannelState.prototype = {
    program_i: 0,
    pitchBend: 0,
    initFrom: function(channelState) {
      this.keyVelocities.set(channelState.keyVelocities);
      this.controlValues.set(channelState.controlValues);
      this.program_i = channelState.program_i;
      this.pitchBend = channelState.pitchBend;
    },
    getCC14: function(v, mode) {
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
    getCCBool: function(v) {
      return this.controlValues[v] >= 64;
    },
    get sustainOn()    { return this.getCCBool(CCBOOL_SUSTAIN); },
    get portamentoOn() { return this.getCCBool(CCBOOL_PORTAMENTO); },
    get sostenutoOn()  { return this.getCCBool(CCBOOL_SOSTENUTO); },
    get softPedalOn()  { return this.getCCBool(CCBOOL_SOFT_PEDAL); },
    get legatoOn()     { return this.getCCBool(CCBOOL_LEGATO); },
    get hold2On()      { return this.getCCBool(CCBOOL_HOLD_2); },
    get soundVariation() { return this.controlValues[CC_SOUND_VARIATION] / 0x7F; },
    get timbreHarmonicIntensity() {
      return this.controlValues[CC_TIMBRE_HARMONIC_INTENSITY];
    },
    get releaseTime() {
      return this.controlValues[CC_RELEASE_TIME];
    },
    get attackTime() {
      return this.controlValues[CC_ATTACK_TIME];
    },
    get brightness() {
      return this.controlValues[CC_BRIGHTNESS];
    },
    get decayTime() {
      return this.controlValues[CC_DECAY_TIME];
    },
    get vibratoRate() {
      return this.controlValues[CC_VIBRATO_RATE];
    },
    get vibratoDepth() {
      return this.controlValues[CC_VIBRATO_DEPTH];
    },
    get vibratoDelay() {
      return this.controlValues[CC_VIBRATO_DELAY];
    },
    get portamentoTime() {
      return this.controlValues[CC_PORTAMENTO_TIME];
    },
    get reverbDepth() {
      return this.controlValues[CC_REVERB_DEPTH];
    },
    get tremoloDepth() {
      return this.controlValues[CC_TREMOLO_DEPTH];
    },
    get chorusDepth() {
      return this.controlValues[CC_CHORUS_DEPTH];
    },
    get detuneDepth() {
      return this.controlValues[CC_DETUNE_DEPTH];
    },
    get phaserDepth() {
      return this.controlValues[CC_PHASER_DEPTH];
    },
    get nrpn() {
      return this.controlValues[CC_NRPN_LO] | (this.controlValues[CC_NRPN_HI] << 7);
    },
    get rpn() {
      return this.controlValues[CC_RPN_LO] | (this.controlValues[CC_RPN_HI] << 7);
    },
    allNotesOff: function() {
      this.keyVelocities.set(new Uint8Array(this.keyVelocities.length));
    },
    controllerReset: function() {
      var controlValues = new Uint8Array(this.controlValues.length);
      controlValues[CC14_HI | CC14_BANK] = this.controlValues[CC14_HI | CC14_BANK];
      controlValues[CC14_LO | CC14_BANK] = this.controlValues[CC14_LO | CC14_BANK];
      
      controlValues[CC14_HI | CC14_VOLUME] = this.controlValues[CC14_HI | CC14_VOLUME];
      controlValues[CC14_HI | CC14_PAN] = this.controlValues[CC14_HI | CC14_PAN];
      controlValues[CC14_HI | CC14_BALANCE] = this.controlValues[CC14_HI | CC14_BALANCE];
      controlValues[CC_REVERB_DEPTH] = this.controlValues[CC_REVERB_DEPTH];
      controlValues[CC_CHORUS_DEPTH] = this.controlValues[CC_CHORUS_DEPTH];
      controlValues[CC_TREMOLO_DEPTH] = this.controlValues[CC_TREMOLO_DEPTH];
      controlValues[CC_DETUNE_DEPTH] = this.controlValues[CC_DETUNE_DEPTH];
      controlValues[CC_PHASER_DEPTH] = this.controlValues[CC_PHASER_DEPTH];
      this.controlValues.set(controlValues);
    },
  };
  
  function PlayState() {
    this.channels = new Array(16);
    for (var i = 0; i < this.channels.length; i++) {
      this.channels[i] = new ChannelState;
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
    mutexKeyMode: false,
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
      this.omniMode = playState.omniMode;
      this.mutexKeyMode = playState.mutexKeyMode;
    },
    controllerReset: function() {
      for (var i = 0; i < this.channels.length; i++) {
        this.channels[i].controllerReset();
      }
    },
    allNotesOff: function() {
      for (var i = 0; i < this.channels.length; i++) {
        this.channels[i].allNotesOff();
      }
    },
    advanceTrack: function(tkRdr) {
      this.secondsElapsed += tkRdr.delay * this.secondsPerTick;
      switch (tkRdr.command_i) {
        case CMD_KEY_UP:
          var key_i = tkRdr.key_i;
          if (this.omniMode) {
            for (var i = 0; i < this.channels.length; i++) {
              this.channels[i].keyVelocities[key_i] = 0;
            }
          }
          else {
            this.channels[tkRdr.channel_i].keyVelocities[key_i] = 0;
          }
          break;
        case CMD_KEY_DOWN:
          var key_i = tkRdr.key_i, velocity = tkRdr.velocity;
          if (this.omniMode) {
            for (var i = 0; i < this.channels.length; i++) {
              this.channels[i].keyVelocities[key_i] = velocity;
            }
          }
          else {
            this.channels[tkRdr.channel_i].keyVelocities[key_i] = velocity;
          }
          break;
        case CMD_SET_PROGRAM:
          var program_i = tkRdr.program_i;
          if (this.omniMode) {
            for (var i = 0; i < this.channels.length; i++) {
              this.channels[i].program_i = program_i;
            }
          }
          else {
            this.channels[tkRdr.channel_i].program_i = program_i;
          }
          break;
        case CMD_CONTROL_CHANGE:
          var control_i = tkRdr.control_i, controlValue = tkRdr.controlValue;
          if (control_i >= MM_START && control_i < MM_END) {
            switch (control_i) {
              case MM_CONTROLLER_RESET:
                this.controllerReset();
                break;
              case MM_ALL_SOUND_OFF:
              case MM_ALL_NOTES_OFF:
                this.allNotesOff();
                break;
              case MM_OMNI_ON:
                this.allNotesOff();
                this.omniMode = true;
                break;
              case MM_OMNI_OFF:
                this.allNotesOff();
                this.omniMode = false;
                break;
              case MM_MONO_ON:
                this.allNotesOff();
                this.mutexKeyMode = true;
                break;
              case MM_POLY_ON:
                this.allNotesOff();
                this.mutexKeyMode = false;
                break;
            }
          }
          else if (this.omniMode) {
            for (var i = 0; i < this.channels.length; i++) {
              this.channels[i].controlValues[control_i] = controlValue;
            }
          }
          else {
            this.channels[tkRdr.channel_i].controlValues[control_i] = controlValue;
          }
          break;
        case CMD_PITCH_BEND:
          this.channels[tkRdr.channel_i].pitchBend = tkRdr.pitchBend;
          break;
        case META_END:
          return false;
        case META_TEMPO:
          this.beatsPerMinute = tkRdr.beatsPerMinute;
          this.timingUnit = 'beat';
          break;
        case META_TIME_SIGNATURE:
          this.speedRatio = tkRdr.speedRatio;
          this.timingUnit = 'beat';
          break;
      }
      return true;
    },
  };
  
  function SongReader(tracks) {
    this.tracks = [];
    this.playState = new PlayState;
    if (tracks) this.init(tracks);
  }
  SongReader.prototype = {
    init: function(tracks) {
      this.tracks.length = tracks.length;
      for (var track_i = 0; track_i < tracks.length; track_i++) {
        var trackReader = this.tracks[track_i] = this.tracks[track_i] || new TrackReader;
        trackReader.init(tracks[track_i]);
        trackReader.next();
      }
      this.track_i = -1;
    },
    initFrom: function(songReader) {
      this.playState.initFrom(songReader.playState);
      this.tracks.length = songReader.tracks.length;
      for (var i = 0; i < this.tracks.length; i++) {
        var trackReader = this.tracks[i] = this.tracks[i] || new TrackReader;
        trackReader.initFrom(songReader.tracks[i]);
      }
      this.track_i = songReader.track_i;
    },
    track_i: -1,
    get track() {
      return this.tracks[this.track_i] || null;
    },
    isKeyReleased: function(channel_i, key_i) {
      var track = this.track, playState = this.playState;
      switch (track.command_i) {
        case CMD_KEY_DOWN:
          if (track.channel_i !== channel_i && !playState.omniMode) return false;
          if (playState.mutexKeyMode) return true;
          return track.key_i === key_i && track.velocity === 0;
        case CMD_KEY_UP:
          if (track.channel_i !== channel_i && !playState.omniMode) return false;
          return track.key_i === key_i;
        case CMD_CONTROL_CHANGE:
          switch (track.command_i) {
            case MM_ALL_SOUND_OFF:
            case MM_ALL_NOTES_OFF:
            case MM_OMNI_OFF:
            case MM_OMNI_ON:
            case MM_MONO_ON:
            case MM_POLY_ON:
              return true;
            default:
              return false;
          }
        case META_END:
          return true;
        default:
          return false;
      }
    },
    advance: function() {
      if (this.track_i !== -1) {
        this.track.next();
      }
      for (;;) {
        if (this.tracks.length === 0) {
          this.track_i = -1;
          return false;
        }
        this.track_i = 0;
        // find the track with the earliest delay time,
        //   or if there are several equally-early candidates,
        //   prioritize other commands ahead of CMD_KEY_DOWN
        if ((this.track.delay > 0 || this.track.command === CMD_KEY_DOWN)
            && this.tracks.length > 1) {
          for (var track_j = 1; track_j < this.tracks.length; track_j++) {
            var diff = this.tracks[track_j].delay - this.track.delay;
            if (diff < 0 || (diff === 0 && this.track.command_i === CMD_KEY_DOWN)) {
              this.track_i = track_j;
              if (this.track.delay === 0 && this.track.command_i !== CMD_KEY_DOWN) break;
            }
          }
          var minDelay = this.track.delay;
          if (minDelay > 0) for (var track_j = 0; track_j < this.tracks.length; track_j++) {
            if (track_j === this.track_i) continue;
            this.tracks[track_j].delay -= minDelay;
          }
        }
        if (this.playState.advanceTrack(this.track)) {
          return true;
        }
        else {
          this.tracks.splice(this.track_i, 1);
          continue;
        }
      }
    },
    get totalSeconds() {
      var tempReader = new SongReader;
      tempReader.initFrom(this);
      do { } while (tempReader.advance());
      Object.defineProperty(this, 'totalSeconds', {value:tempReader.secondsElapsed, enumerable:true});
      return tempReader.secondsElapsed;
    },
    get controlPrecision() {
      var tempReader = new SongReader;
      tempReader.initFrom(this);
      var precision = 'coarse';
      do {
        if (tempReader.track.command !== 'control-change') continue;
        if (tempReader.track.control >= 32 && tempReader.track.control < 64) {
          precision = 'fine';
          break;
        }
      } while (tempReader.advance());
      Object.defineProperty(this, 'controlPrecision', {value:precision, enumerable:true});
      return precision;
    },
    get isFinished() {
      return this.tracks.length === 0;
    },
    preloadNotes: function(audioContext) {
      var tempReader = new SongReader;
      tempReader.initFrom(this);
      var temp = [Promise.resolve(), null];
      do {
        if (!tempReader.track.isNoteOn) continue;
        var channel_i = tempReader.track.channel_i;
        var isPercussion = (channel_i === 9);
        var program_i = tempReader.channels[channel_i].program_i;
        var bank_i = tempReader.channels[channel_i].bank_i;
        var key_i = tempReader.track.key_i;
        temp[1] = midiNoteData.preloadNote(audioContext, isPercussion, program_i, bank_i, key_i);
        temp[0] = Promise.all(temp);
      } while (tempReader.advance());
      return temp[0];
    },
    play: function(destination, startAt) {
      const precision = this.controlPrecision;
      const audioContext = destination.context;
      const baseTime = isNaN(startAt) ? audioContext.currentTime : startAt;
      const channelNodes = new Array(this.playState.channels.length);
      var masterPanning = audioContext.createStereoPanner();
      masterPanning.connect(destination);
      destination = masterPanning;
      for (var i = 0; i < channelNodes.length; i++) {
        var channelNode = channelNodes[i] = audioContext.createGain();
        channelNode.expression = channelNode;
        channelNode.mainVolume = audioContext.createGain();
        channelNode.panning = audioContext.createStereoPanner();
        
        channelNode.expression.connect(channelNode.mainVolume);
        channelNode.mainVolume.connect(channelNode.panning);
        channelNode.panning.connect(destination);
        
        var tremoloWave = channelNode.tremoloWave = audioContext.createOscillator();
        tremoloWave.frequency = 5;
        tremoloWave.start(baseTime);
        tremoloWave.amplitude = audioContext.createGain();
        tremoloWave.amplitude.gain.value = 0;
        tremoloWave.connect(tremoloWave.amplitude);
        
        var vibratoWave = channelNode.vibratoWave = audioContext.createOscillator();
        vibratoWave.frequency = 5;
        vibratoWave.start(baseTime);
        vibratoWave.amplitude = audioContext.createGain();
        vibratoWave.amplitude.gain.value = 0;
        vibratoWave.connect(vibratoWave.amplitude);
      }
      const self = this;
      const playState = this.playState;
      const tempReader = new SongReader;
      return new Promise(function(resolve, reject) {
        function next() {
          const sinceStarting = audioContext.currentTime - baseTime;
          const frontierTime = sinceStarting + 3;
          var doAgain = window.setTimeout(next, (3 - 0.5) * 1000);
          do {
            var track = self.track;
            switch (track.command_i) {
              case CMD_KEY_DOWN:
                if (track.velocity === 0) break;
                var channel_i = self.track.channel_i;
                var channel = self.playState.channels[channel_i];
                var channelNode = channelNodes[channel_i];
                var program_i = channel.program;
                var bank_i = channel.bank;
                var key_i = self.track.key;
                var holding2 = channel.hold2On;
                var velocityNode = audioContext.createGain();
                velocityNode.gain.value = self.track.velocity/127;
                var source = midiNoteData.createNoteSource(velocityNode, channel_i === 9, program_i, bank_i, key_i);
                source.detune.value = source.noteDetune + channel.pitchBend*200;
                channelNode.vibratoWave.amplitude.connect(source.detune);
                source.start(self.secondsElapsed - baseTime);
                tempReader.initFrom(self);
                var tempChannel = tempReader.playState.channels[channel_i];
                while (tempReader.advance()) {
                  if (tempReader.isKeyReleased(channel_i, key_i)) {
                    if (tempReader.track.killSustain) break;
                    if (tempChannel.sustainOn) {
                      do { } while (tempReader.advance() && tempChannel.sustainOn && !tempReader.track.killSustain);
                    }
                    if (holding2) {
                      do { } while (tempReader.advance() && tempChannel.hold2On && !tempReader.track.killSustain);
                    }
                    break;
                  }
                  if (tempReader.track.channel !== channel_i) continue;
                  switch (tempReader.track.command_i) {
                    case CMD_CONTROL_CHANGE:
                      if (holding2 && tempReader.track.command_i === CCBOOL_HOLD_2) {
                        holding2 = holding2 && tempChannel.hold2On;
                      }
                      break;
                    case 'pitch-bend':
                      source.detune.setValueAtTime(
                        source.noteDetune + tempReader.track.pitchBend*200,
                        baseTime + tempReader.secondsElapsed);
                      break;
                  }
                }
                source.stop(baseTime + tempReader.secondsElapsed);
                break;
              case CMD_CONTROL_CHANGE:
                if (self.track.control >= CC14_START && self.track.control < CC14_END) {
                  var cc14 = self.track.control & 31;
                  var value = channel.getCC14(cc14, precision);
                  switch (cc14) {
                    case CC14_VOLUME:
                      channelNode.mainVolume.gain.setValueAtTime(value, baseTime + self.secondsElapsed);
                      break;
                    case CC14_EXPRESSION:
                      channelNode.expression.gain.setValueAtTime(value, baseTime + self.secondsElapsed);
                      break;
                    case CC14_PAN:
                      channelNode.panning.pan.setValueAtTime(value, baseTime + self.secondsElapsed);
                      break;
                    case CC14_BALANCE:
                      masterPanning.pan.setValueAtTime(value, baseTime + self.secondsElapsed);
                      break;
                  }
                  break;
                }
                break;
            }
            if (!self.advance()) {
              window.cancelTimeout(doAgain);
              window.setTimeout(
                function() {
                  audioContext.dispatchEvent(new CustomEvent('song-stopped', {
                    detail:{song:self, reason:'complete'},
                  }));
                  resolve();
                },
                (playState.secondsElapsed - sinceStarting) * 1000
              );
              break;
            }
          } while (playState.secondsElapsed < frontierTime);
        }
        next();
      });
    },
  };
  
  function StandardMidiFile(playSettings, songs) {
    this.playSettings = playSettings;
    this.songs = songs;
  }
  StandardMidiFile.prototype = {
    openSong: function(song_i) {
      if (isNaN(song_i)) song_i = 0;
      var song = this.songs[song_i];
      if (!song) {
        throw new RangeError('song number out of range');
      }
      var songReader = new SongReader(song);
      Object.assign(songReader.playState, this.playSettings);
      do { } while (!songReader.track.isKeyDown && songReader.advance());
      return songReader;
    },
  };
  
  return {
    
    play:
      function play(destination, file, songNumber, preservePrelude) {
        return this.open(file)
        .then(function(smf) {
          var song = smf.openSong(songNumber || 0);
          if (!preservePrelude) song.playState.secondsElapsed = 0;
          return song.preloadNotes(destination.context)
          .then(function() {
            return song.play(destination);
          });
        });
      },
    
    open:
      function open(file) {
        if (file instanceof Blob) {
          var fr = new FileReader();
          return new Promise(function(resolve, reject) {
            fr.addEventListener('load', function() {
              resolve(open(this.result));
            });
            fr.readAsArrayBuffer(file);
          });
        }
        var bytes, dv;
        if (file instanceof ArrayBuffer) {
          bytes = new Uint8Array(file);
          dv = new DataView(file);
        }
        else if (file instanceof Uint8Array) {
          bytes = file;
          dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        }
        else if (file instanceof DataView) {
          dv = file;
          bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);          
        }
        else {
          return Promise.reject('expecting Blob, ArrayBuffer, Uint8Array or DataView');
        }
        if (String.fromCharCode.apply(null, bytes.subarray(0, 8)) !== 'MThd\x00\x00\x00\x06') {
          return Promise.reject('invalid midi file');
        }
        var trackMode;
        switch (dv.getUint16(8, false)) {
          case 0: trackMode = 'single'; break;
          case 1: trackMode = 'allAtOnce'; break;
          case 2: trackMode = 'separate'; break;
          default: return Promise.reject('unknown playback mode');
        }
        var playSettings = {};
        var songs = (trackMode === 'allAtOnce') ? [[]] : [];
        var deltaTimeValue = dv.getInt16(12, false);
        if (deltaTimeValue < 0) {
          playSettings.timingUnit = 'frame';
          playSettings.ticksPerFrame = -deltaTimeValue;
        }
        else {
          playSettings.timingUnit = 'beat';
          playSettings.ticksPerBeat = deltaTimeValue;
        }
        var pos = 14;
        for (var tracksLeft = dv.getUint16(10, false); tracksLeft > 0; --tracksLeft) {
          if (String.fromCharCode(bytes[pos], bytes[pos+1], bytes[pos+2], bytes[pos+3]) !== 'MTrk') {
            return Promise.reject('invalid midi file');
          }
          var trackLength = dv.getUint32(pos + 4, false);
          var trackData = bytes.subarray(pos + 8, pos + 8 + trackLength);
          if (trackData.length < trackLength) {
            return Promise.reject('invalid midi file');
          }
          if (trackMode === 'allAtOnce') {
            songs[0].push(trackData);
          }
          else {
            songs.push([trackData]);
          }
          pos += 8 + trackLength;
        }
        return Promise.resolve(new StandardMidiFile(playSettings, songs));
      },
    
  };

});
