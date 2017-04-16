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
        CC_REVERB_SEND_LEVEL = 91,
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
          MM_RESET_ALL_CONTROLLERS = 121,
          MM_LOCAL_CONTROL_ON = 122,
          MM_ALL_NOTES_OFF = 123, // maintain release time & sustain
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
    if (bytes) this.init(bytes);
  }
  TrackReader.prototype = {
    init: function(bytes) {
      this.bytes = bytes;
      this.pos = 0;
      this.command = null;
      return this;
    },
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
    isNoteOn: function() {
      return this.command === 'note-on' && this.velocity > 0;
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
          var bend = this.bytes[this.pos++];
          bend |= this.bytes[this.pos++] << 7;
          bend = (bend - 0x2000) / 0x2000;
          this.pitchBend = bend;
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
    pitchBend: 0,
    initFrom: function(channelState) {
      this.keyVelocities.set(channelState.keyVelocities);
      this.controlValues.set(channelState.controlValues);
      this.program = channelState.program;
      this.pitchBend = channelState.pitchBend;
    },
    getCC14(v, mode) {
      if (mode === 'coarse') return this.controlValues[CC14_HI | v] / 0x7f;
      var v = (this.controlValues[CC14_HI | v] << 7) | this.controlValues[CC14_LO | v];
      if (mode === 'fine') return v / 0x3fff;
      return v;
    },
    getCCBool(v) {
      return this.controlValues[v] >= 64;
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
    get sustainOn()    { return this.getCCBool(CCBOOL_SUSTAIN); },
    get portamentoOn() { return this.getCCBool(CCBOOL_PORTAMENTO); },
    get sostenutoOn()  { return this.getCCBool(CCBOOL_SOSTENUTO); },
    get softPedalOn()  { return this.getCCBool(CCBOOL_SOFT_PEDAL); },
    get legatoOn()     { return this.getCCBool(CCBOOL_LEGATO); },
    get hold2On()      { return this.getCCBool(CCBOOL_HOLD_2); },
    get soundVariation() { return this.controlValues[CC_SOUND_VARIATION] / 0x7F; },
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
    get channel() {
      return this.channels[this.channel_i];
    },
    advanceTrack: function(tkRdr) {
      this.secondsElapsed += tkRdr.delay * this.secondsPerTick;
      var channel_i = this.channel_i = tkRdr.channel;
      switch (tkRdr.command) {
        case 'note-on':
          if (tkRdr.velocity === 0) {
            this.channel.keyVelocities[tkRdr.key] = 0;
            this.onNoteUp(channel_i, tkRdr.key);
          }
          else {
            this.onNoteDown(channel_i, tkRdr.key,
              this.channel.keyVelocities[tkRdr.key] = tkRdr.velocity);
          }
          break;
        case 'note-off':
          this.channel.keyVelocities[tkRdr.key] = 0;
          this.onNoteUp(channel_i, tkRdr.key);
          break;
        case 'set-program':
          this.channel.program = tkRdr.program;
          this.onProgram(channel_i, tkRdr.program);
          break;
        case 'control-change':
          if (tkRdr.control >= 120) {
            this.onModeMessage(channel_i, tkRdr.control, tkRdr.value);
          }
          else {
            this.channel.controlValues[tkRdr.control] = tkRdr.value;
            this.onControlChange(channel_i, tkRdr.control, tkRdr.value);
          }
          break;
        case 'pitch-bend':
          this.channel.pitchBend = tkRdr.pitchBend;
          this.onPitchBendChange(channel_i, tkRdr.pitchBend);
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
    init: function(tracks) {
      this.tracks.length = tracks.length;
      for (var i = 0; i < this.tracks.length; i++) {
        this.tracks[i] = this.tracks[i] || new TrackReader;
        this.tracks[i].init(tracks[i]);
        this.tracks[i].next();
      }
    },
    initFrom: function(songReader) {
      this.playState.initFrom(songReader.playState);
      this.tracks.length = songReader.tracks.length;
      for (var i = 0; i < this.tracks.length; i++) {
        this.tracks[i] = this.tracks[i] || new TrackReader;
        this.tracks[i].initFrom(songReader.tracks[i]);
      }
      this.track_i = songReader.track_i;
    },
    track_i: -1,
    get track() {
      return this.tracks[this.track_i];
    },
    next: function() {
      if (this.track_i !== -1 && !this.tracks[this.track_i].next()) {
        this.tracks.splice(this.track_i, 1);
      }
      if (this.tracks.length === 0) {
        this.track_i = -1;
        return false;
      }
      var i = 0;
      // find the track with the earliest delay time, or if there are several equally-early candidates,
      //  prioritizing commands that aren't note-on
      if ((this.tracks[0].delay > 0 || this.tracks[0].command === 'note-on') && this.tracks.length > 1) {
        for (var j = 1; j < this.tracks.length; j++) {
          var diff = this.tracks[j].delay - this.tracks[i].delay;
          if (diff < 0 || (diff === 0 && this.tracks[i].command === 'note-on')) {
            i = j;
            if (this.tracks[i].delay === 0 && this.tracks[0].command !== 'note-on') break;
          }
        }
        for (var j = 0; j < this.tracks.length; j++) {
          if (j === i) continue;
          this.tracks[j].delay -= this.tracks[i].delay;
        }
      }
      this.playState.advanceTrack(this.tracks[this.track_i = i]);
      return true;
    },
    get totalSeconds() {
      var tempReader = new SongReader;
      tempReader.initFrom(this);
      do { } while (tempReader.next());
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
      } while (tempReader.next());
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
        var channel_i = tempReader.track.channel;
        var isPercussion = (channel_i === 9);
        var program_i = tempReader.channels[channel_i].program;
        var bank_i = tempReader.channels[channel_i].bank;
        var key_i = tempReader.track.key;
        temp[1] = midiNoteData.preloadNote(audioContext, isPercussion, program_i, bank_i, key_i);
        temp[0] = Promise.all(temp);
      } while (tempReader.next());
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
      var self = this;
      var tempReader = new SongReader;
      function next() {
        const sinceStarting = audioContext.currentTime - baseTime;
        const frontierTime = sinceStarting + 3;
        var doAgain = window.setTimeout(next, (3 - 0.5) * 1000);
        do {
          switch (self.track.command) {
            // note-off: handled by note-on
            case 'note-on':
              var channel_i = self.track.channel;
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
              while (tempReader.next()) {
                if (tempReader.playState.isStoppingNote(channel_i, key_i)) {
                  if (tempChannel.sustainOn) {
                    do { } while (tempReader.next() && tempChannel.sustainOn);
                  }
                  if (holding2) {
                    do { } while (tempReader.next() && tempChannel.hold2On);
                  }
                  break;
                }
                if (tempReader.track.channel !== channel_i) continue;
                switch (tempReader.track.command) {
                  case 'control-change':
                    if (holding2 && tempReader.track.command === CCBOOL_HOLD_2) {
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
            case 'control-change':
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
            // pitch-bend: handled by note-on
          }
          if (!self.next()) {
            window.cancelTimeout(doAgain);
            window.setTimeout(
              function() {
                audioContext.dispatchEvent(new CustomEvent('song-stopped', {
                  detail:{song:self, reason:'complete'},
                }));
              },
              (self.playState.secondsElapsed - sinceStarting) * 1000);
            break;
          }
        } while (self.playState.secondsElapsed < frontierTime);
      }
      return next();
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
      do { } while (!songReader.track.isNoteOn && songReader.next());
      return songReader;
    },
  };
  
  return {
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
        var songs = [];
        if (trackMode !== 'allAtOnce') songs.push([]);
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
        return new StandardMidiFile(playSettings, songs);
      },
  };

});
