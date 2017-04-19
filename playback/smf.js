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
        CC_PREFIX_VELOCITY_LO = 88, // introduced circa 2010, probably ok to ignore?
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
        META_TIME_SIGNATURE = CMD_META + 0x58,
        META_KEY_SIGNATURE = CMD_META + 0x59,
        META_CUSTOM = CMD_META + 0x7F;
  
  const DEFAULT_CC = new Uint8Array(120);
  DEFAULT_CC[CC14_HI | CC14_VOLUME] = 100;
  DEFAULT_CC[CC14_HI | CC14_EXPRESSION] = 127;
  DEFAULT_CC[CC14_HI | CC14_PAN] = 64;
  
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
      this.delay = this.readVarint();
      var command_i = this.bytes[this.byte_i++];
      if (isNaN(command_i)) return this.command_i = META_END;
      if (command_i < 0x80) {
        this.byte_i--;
        command_i = this.command_i;
      }
      else if ((command_i & 0xf0) === 0xf0) {
        if (command_i === 0xff) {
          command_i = this.command_i = CMD_META + this.bytes[this.byte_i++];
          var metaDataLen = this.readVarint();
          var metaData = this.bytes.subarray(this.byte_i, this.byte_i + metaDataLen);
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
                metronomeSpeed: metaData[2],
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
    this.controlValues = new Uint8Array(DEFAULT_CC);
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
    getCC14: function(cc14) {
      var hi = this.controlValues[CC14_HI | cc14] & 0x7F;
      var lo = this.controlValues[CC14_LO | cc14] & 0x7F;
      return (hi << 7) | lo;
    },
    getCC14Ratio: function(cc14, offset) {
      var hi = this.controlValues[CC14_HI | cc14] & 0x7F;
      var lo = this.controlValues[CC14_LO | cc14];
      if (lo & 0x80) {
        return ((hi << 7) | (lo & 0x7F)) / 0x3FFF;
      }
      return hi / 0x7F;
    },
    getCCBool: function(v) {
      return !!(this.controlValues[v] & 0x40);
    },
    get bank_i()       { return this.getCC14(CC14_BANK); },
    get modWheel()     { return this.getCC14Ratio(CC14_MOD_WHEEL); },
    get breath()       { return this.getCC14Ratio(CC14_BREATH); },
    get foot()         { return this.getCC14Ratio(CC14_FOOT); },
    get volume()       { return this.getCC14Ratio(CC14_VOLUME); },
    get balance() {
      var hi = this.controlValues[CC14_HI | CC14_BALANCE] & 0x7F;
      var lo = this.controlValues[CC14_LO | CC14_BALANCE];
      if (lo & 0x80) {
        return (((hi << 7) | (lo & 0x7F)) - 0x2000) / 0x2000;
      }
      return ((hi / 0x7F) - 0x40) / 0x40;
    },
    get pan()          { return this.getCC14Ratio(CC14_PAN); },
    get expression()   { return this.getCC14Ratio(CC14_EXPRESSION); },
    get sustainOn()    { return this.getCCBool(CCBOOL_SUSTAIN); },
    get portamentoOn() { return this.getCCBool(CCBOOL_PORTAMENTO); },
    get sostenutoOn()  { return this.getCCBool(CCBOOL_SOSTENUTO); },
    get softPedalOn()  { return this.getCCBool(CCBOOL_SOFT_PEDAL); },
    get legatoOn()     { return this.getCCBool(CCBOOL_LEGATO); },
    get hold2On()      { return this.getCCBool(CCBOOL_HOLD_2); },
    get variation()    { return this.controlValues[CC_SOUND_VARIATION] / 0x7F; },
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
      var controlValues = new Uint8Array(DEFAULT_CC);
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
    applyCommand: function(tkRdr) {
      // NOTE: does NOT check channel_i (e.g. for omni mode)
      switch (tkRdr.command_i) {
        case CMD_KEY_UP:
          this.keyVelocities[tkRdr.key_i] = 0;
          break;
        case CMD_KEY_DOWN:
        case CMD_KEY_AFTERTOUCH:
          this.keyVelocities[tkRdr.key_i] = tkRdr.velocity;
          break;
        case CMD_SET_PROGRAM:
          this.program_i = tkRdr.program_i;
          break;
        case CMD_CONTROL_CHANGE:
          var control_i = tkRdr.control_i, controlValue = tkRdr.controlValue;
          if (control_i >= 32 && control_i < 64) controlValue |= 0x80;
          this.controlValues[control_i] = controlValue;
          break;
        case CMD_PITCH_BEND:
          this.pitchBend = tkRdr.pitchBend;
          break;
      }
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
    omniMode: false,
    mutexKeyMode: false,
    pitchBendCents: 200, // TODO: support RPN 0
    initFrom: function(playState) {
      for (var i = 0; i < this.channels.length; i++) {
        this.channels[i].initFrom(playState.channels[i]);
      }
      this.omniMode = playState.omniMode;
      this.mutexKeyMode = playState.mutexKeyMode;
      this.pitchBendCents = playState.pitchBendCents;
    },
    controllerReset: function() {
      for (var i = 0; i < this.channels.length; i++) {
        this.channels[i].controllerReset();
      }
      this.pitchBendCents = 200;
    },
    allNotesOff: function() {
      for (var i = 0; i < this.channels.length; i++) {
        this.channels[i].allNotesOff();
      }
    },
    applyCommand: function(tkRdr) {
      switch (tkRdr.command_i) {
        case CMD_CONTROL_CHANGE:
          var control_i = tkRdr.control_i;
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
            break;
          }
          // FALL THROUGH:
        case CMD_KEY_UP:
        case CMD_KEY_DOWN:
        case CMD_KEY_AFTERTOUCH:
        case CMD_SET_PROGRAM:
        case CMD_PITCH_BEND:
          if (this.omniMode) {
            for (var i = 0; i < this.channels.length; i++) {
              this.channels[i].applyCommand(tkRdr);
            }
          }
          else {
            this.channels[tkRdr.channel_i].applyCommand(tkRdr);
          }
          break;
      }
    },
  };
  
  function SongReader(tracks) {
    this.tracks = [];
    this.playState = new PlayState;
    if (tracks) this.init(tracks);
  }
  SongReader.prototype = {
    timingUnit: 'beat',
    pulsesPerBeat: 24,
    beatsPerMinute: 120,
    framesPerSecond: 25,
    pulsesPerFrame: 2,
    speedRatio: 1,
    secondsElapsed: 0,
    get secondsPerPulse() {
      switch (this.timingUnit) {
        case 'beat':
          return 60 / (this.beatsPerMinute * this.pulsesPerBeat * this.speedRatio);
        case 'frame':
          return 1 / (this.framesPerSecond * this.pulsesPerFrame *  this.speedRatio);
      }
      throw new Error('invalid timing unit: must be beat or frame');
    },
    init: function(tracks) {
      this.tracks.length = tracks.length;
      for (var track_i = 0; track_i < tracks.length; track_i++) {
        var trackReader = this.tracks[track_i] = this.tracks[track_i] || new TrackReader;
        trackReader.init(tracks[track_i]);
        trackReader.next();
      }
    },
    initFrom: function(songReader) {
      this.playState.initFrom(songReader.playState);
      this.tracks.length = songReader.tracks.length;
      for (var i = 0; i < this.tracks.length; i++) {
        var trackReader = this.tracks[i] = this.tracks[i] || new TrackReader;
        trackReader.initFrom(songReader.tracks[i]);
      }
      this.timingUnit = songReader.timingUnit;
      this.pulsesPerBeat = songReader.pulsesPerBeat;
      this.beatsPerMinute = songReader.beatsPerMinute;
      this.framesPerSecond = songReader.framesPerSecond;
      this.pulsesPerFrame = songReader.pulsesPerFrame;
      this.speedRatio = songReader.speedRatio;
      this.secondsElapsed = songReader.secondsElapsed;      
    },
    isKeyBeingPressed: function(track, channel_i, key_i) {
      switch (track.command_i) {
        case CMD_KEY_DOWN:
          if (!isNaN(channel_i) && track.channel_i !== channel_i && !this.playState.omniMode) return false;
          return (isNaN(key_i) || track.key_i === key_i) && track.velocity !== 0;
        default:
          return false;
      }
    },
    isKeyBeingReleased: function(track, channel_i, key_i) {
      switch (track.command_i) {
        case CMD_KEY_DOWN:
          if (!isNaN(channel_i) && track.channel_i !== channel_i && !this.playState.omniMode) return false;
          if (this.playState.mutexKeyMode) return true;
          return (isNaN(key_i) || track.key_i === key_i) && track.velocity === 0;
        case CMD_KEY_UP:
          if (!isNaN(channel_i) && track.channel_i !== channel_i && !this.playState.omniMode) return false;
          return isNaN(key_i) || (track.key_i === key_i);
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
    chooseNextTrack: function() {
      var tracks = this.tracks;
      if (tracks.length === 0) {
        return null;
      }
      // find the track with the earliest delay time,
      //   or if there are several equally-early candidates,
      //   prioritize other commands ahead of CMD_KEY_DOWN
      var track_i = 0;
      if (tracks[track_i].delay || tracks[track_i].command_i === CMD_KEY_DOWN) {
        for (var track_j = 1; track_j < tracks.length; track_j++) {
          var diff = tracks[track_j].delay - tracks[track_i].delay;
          if (diff < 0 || (diff === 0 && tracks[track_i].command_i === CMD_KEY_DOWN)) {
            track_i = track_j;
            if (tracks[track_i].delay === 0 && tracks[track_i].command_i !== CMD_KEY_DOWN) break;
          }
        }
      }
      return tracks[track_i];
    },
    advanceTime: function(track) {
      var delay = track.delay;
      if (delay === 0) return;
      for (var i = 0; i < this.tracks.length; i++) {
        this.tracks[i].delay -= delay;
      }
      this.secondsElapsed += delay * this.secondsPerPulse;
    },
    applyCommand: function(track) {
      this.playState.applyCommand(track);
      switch (track.command_i) {
        case META_TEMPO:
          this.beatsPerMinute = track.beatsPerMinute;
          this.timingUnit = 'beat';
          break;
        case META_TIME_SIGNATURE:
          this.speedRatio = track.speedRatio;
          this.timingUnit = 'beat';
          break;
      }
    },
    advanceTrack: function(track) {
      if (track.command_i === META_END) {
        this.tracks.splice(this.tracks.indexOf(track), 1);
      }
      else {
        track.next();
      }
    },
    get totalSeconds() {
      var tempReader = new SongReader;
      tempReader.initFrom(this);
      var track;
      while (track = tempReader.chooseNextTrack()) {
        tempReader.advanceTime(track);
        tempReader.applyCommand(track);
        tempReader.advanceTrack(track);
      }
      Object.defineProperty(this, 'totalSeconds', {value:tempReader.secondsElapsed, enumerable:true});
      return tempReader.secondsElapsed;
    },
    get isFinished() {
      return this.tracks.length === 0;
    },
    preloadNotes: function(audioContext) {
      var tempReader = new SongReader;
      tempReader.initFrom(this);
      var playState = tempReader.playState;
      var promiseBuffer = [Promise.resolve(), null];
      var track;
      while (track = tempReader.chooseNextTrack()) {
        tempReader.advanceTime(track);
        if (tempReader.isKeyBeingPressed(track)) {
          var channel_start, channel_end;
          if (playState.omniMode) {
            channel_start = 0;
            channel_end = playState.channels.length;
          }
          else {
            channel_start = track.channel_i;
            channel_end = channel_start + 1;
          }
          for (var channel_i = channel_start; channel_i < channel_end; channel_i++) {
            var isPercussion = (channel_i === 9);
            var program_i = playState.channels[channel_i].program_i;
            var bank_i = playState.channels[channel_i].bank_i;
            var key_i = track.key_i;
            promiseBuffer[1] = midiNoteData.preloadNote(audioContext, isPercussion, program_i, bank_i, key_i);
            promiseBuffer[0] = Promise.all(promiseBuffer);
          }
        }
        tempReader.advanceTrack(track);
      }
      return promiseBuffer[0];
    },
    stop: function() {
      if ('playTimeout' in this) {
        window.clearTimeout(this.playTimeout);
        delete this.playTimeout;
      }
      if ('playNode' in this) {
        this.playNode.gain.setTargetAtTime(0, this.playNode.context.currentTime, 0.05);
        delete this.playNode;
      }
    },
    play: function(destination, startAt) {
      const audioContext = destination.context;
      const baseTime = isNaN(startAt) ? audioContext.currentTime : startAt;
      const channelNodes = new Array(this.playState.channels.length);
      var balanceSplitter = audioContext.createChannelSplitter(2);
      balanceSplitter.left = audioContext.createGain();
      balanceSplitter.right = audioContext.createGain();
      balanceSplitter.connect(balanceSplitter.left, 0);
      balanceSplitter.connect(balanceSplitter.right, 1);
      balanceSplitter.merge = audioContext.createChannelMerger(2);
      balanceSplitter.left.connect(balanceSplitter.merge, 0, 0);
      balanceSplitter.right.connect(balanceSplitter.merge, 0, 1);
      balanceSplitter.connect(destination);
      this.playNode = audioContext.createGain();
      balanceSplitter.connect(this.playNode);
      destination = this.playNode;
      for (var i = 0; i < channelNodes.length; i++) {
        var channelNode = channelNodes[i] = audioContext.createGain();
        channelNode.expression = channelNode;
        channelNode.expression.gain.value = this.playState.channels[i].expression;
        channelNode.mainVolume = audioContext.createGain();
        channelNode.mainVolume.gain.value = this.playState.channels[i].volume;
        channelNode.panning = audioContext.createStereoPanner();
        
        channelNode.tremolo = audioContext.createGain();
        channelNode.tremolo.gain.value = 0;
        channelNode.tremolo.wave = audioContext.createOscillator();
        channelNode.tremolo.wave.frequency.value = 5;
        channelNode.tremolo.wave.start(baseTime);
        channelNode.tremolo.wave.connect(channelNode.tremolo);
        
        channelNode.vibrato = audioContext.createGain();
        channelNode.vibrato.gain.value = 0;
        channelNode.vibrato.wave = audioContext.createOscillator();
        channelNode.vibrato.wave.frequency.value = 5;
        channelNode.vibrato.wave.start(baseTime);
        channelNode.vibrato.connect(channelNode.vibrato);
        
        channelNode.expression.connect(channelNode.mainVolume);
        channelNode.mainVolume.connect(channelNode.panning);
        channelNode.panning.connect(destination);
      }
      const mainReader = this;
      const playState = this.playState;
      const tempReader = new SongReader;
      return new Promise(function(resolve, reject) {
        function next() {
          const sinceStarting = audioContext.currentTime - baseTime;
          const frontierTime = sinceStarting + 3;
          mainReader.playTimeout = window.setTimeout(next, (3 - 0.5) * 1000);
          var track;
          while (track = mainReader.chooseNextTrack()) {
            mainReader.advanceTime(track);
            mainReader.applyCommand(track);
            switch (track.command_i) {
              case CMD_KEY_DOWN:
                // TODO: omni mode?
                if (track.velocity === 0) break;
                var channel_i = track.channel_i;
                var key_i = track.key_i;
                var channel = mainReader.playState.channels[channel_i];
                var channelNode = channelNodes[channel_i];
                var holding2 = channel.hold2On;
                var velocityNode = audioContext.createGain();
                velocityNode.gain.value = track.velocity/127;
                velocityNode.connect(channelNode);
                var source = midiNoteData.createNoteSource(
                  velocityNode,
                  channel_i === 9,
                  channel.program_i,
                  channel.bank_i,
                  key_i);
                source.detune.value = source.noteDetune + channel.pitchBend * tempReader.playState.pitchBendCents;
                channelNode.vibrato.connect(source.detune);
                source.start(baseTime + mainReader.secondsElapsed);
                tempReader.initFrom(mainReader);
                var tempChannel = tempReader.playState.channels[channel_i];
                var tempTrack;
                while (tempTrack = tempReader.chooseNextTrack()) {
                  tempReader.advanceTime(tempTrack);
                  tempReader.applyCommand(tempTrack);
                  if (tempReader.isKeyBeingReleased(tempTrack, channel_i, key_i)) {
                    if (tempTrack.killSustain) break;
                    if (tempChannel.sustainOn) {
                      while (tempTrack = tempReader.chooseNextTrack()) {
                        tempReader.advanceTime(tempTrack);
                        tempReader.applyCommand(tempTrack);
                        if (!tempChannel.sustainOn || !tempTrack.killSustain) {
                          break;
                        }
                        tempReader.advanceTrack(tempTrack);
                      }
                    }
                    if (holding2) {
                      while (tempTrack = tempReader.chooseNextTrack()) {
                        tempReader.advanceTime(tempTrack);
                        tempReader.applyCommand(tempTrack);
                        if (!tempChannel.hold2On || !tempTrack.killSustain) {
                          break;
                        }
                        tempReader.advanceTrack(tempTrack);
                      }
                    }
                    break;
                  }
                  if (tempTrack.channel_i === channel_i || tempReader.playState.omniMode) {
                    switch (tempTrack.command_i) {
                      case CMD_CONTROL_CHANGE:
                        if (holding2 && tempTrack.command_i === CCBOOL_HOLD_2) {
                          holding2 = holding2 && tempChannel.hold2On;
                        }
                        break;
                      case CMD_PITCH_BEND:
                        source.detune.setValueAtTime(
                          source.noteDetune + tempTrack.pitchBend * tempReader.playState.pitchBendCents,
                          baseTime + tempReader.secondsElapsed);
                        break;
                    }
                  }
                  tempReader.advanceTrack(tempTrack);
                }
                source.stop(baseTime + tempReader.secondsElapsed);
                break;
              case CMD_CONTROL_CHANGE:
                if (track.control >= CC14_START && track.control < CC14_END) {
                  var cc14 = track.control & 31;
                  var channel = mainReader.playState.channels[track.channel_i];
                  var value = channel.getCC14(cc14);
                  switch (cc14) {
                    case CC14_VOLUME:
                      channelNode.mainVolume.gain.setValueAtTime(value, baseTime + mainReader.secondsElapsed);
                      break;
                    case CC14_EXPRESSION:
                      channelNode.expression.gain.setValueAtTime(value, baseTime + mainReader.secondsElapsed);
                      break;
                    case CC14_PAN:
                      channelNode.panning.pan.setValueAtTime(value, baseTime + mainReader.secondsElapsed);
                      break;
                    case CC14_BALANCE:
                      var leftValue = 1, rightValue = 1;
                      if (channel.balance < 0) {
                        rightValue += channel.balance;
                      }
                      else if (channel.balance < 0) {
                        leftValue -= channel.balance;
                      }
                      balanceSplitter.left.gain.setValueAtTime(leftValue, baseTime + mainReader.secondsElapsed);
                      balanceSplitter.right.gain.setValueAtTime(rightValue, baseTime + mainReader.secondsElapsed);
                      break;
                  }
                  break;
                }
                break;
            }
            mainReader.advanceTrack(track);
            if (mainReader.secondsElapsed >= frontierTime) return;
          }
          window.clearTimeout(mainReader.playTimeout);
          delete mainReader.playTimeout;
          window.setTimeout(
            function() {
              audioContext.dispatchEvent(new CustomEvent('song-stopped', {
                detail:{song:mainReader, reason:'complete'},
              }));
              resolve();
            },
            (mainReader.secondsElapsed - sinceStarting) * 1000);
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
      Object.assign(songReader, this.playSettings);
      var track;
      while ((track = songReader.chooseNextTrack()) && !songReader.isKeyBeingPressed(track)) {
        songReader.advanceTime(track);
        songReader.applyCommand(track);
        songReader.advanceTrack(track);
      }
      return songReader;
    },
  };
  
  return {
    
    play:
      function play(destination, file, songNumber, preservePrelude) {
        return this.open(file)
        .then(function(smf) {
          var song = smf.openSong(songNumber || 0);
          if (!preservePrelude) {
            var track = song.chooseNextTrack();
            if (track) {
              song.advanceTime(track);
            }
            song.secondsElapsed = 0;
          }
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
          playSettings.pulsesPerFrame = -deltaTimeValue;
        }
        else {
          playSettings.timingUnit = 'beat';
          playSettings.pulsesPerBeat = deltaTimeValue;
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
