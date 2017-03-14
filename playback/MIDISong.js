define(['./note'], function(noteData) {

  'use strict';
  
  function MIDISong(track) {
    this.track = track;
  }
  MIDISong.prototype = {
    beatsPerMinute: 120,
    tickDenominator: 'beats',
    get usedNotes() {
      var notes = {};
      var pos = 0;
      var track = this.track;
      function nextVarint() {
        var value = 0;
        var b = track[pos++];
        while (b & 0x80) {
          value = (value << 7) | (b & 0x7f);
          b = track[pos++];
        }
        return (value << 7) | b;
      }
      var lastCommand = -1;
      var channels = new Array(16);
      for (var i = 0; i < channels.length; i++) {
        channels[i] = {
          program: 0,
          control: new Uint8Array(128),
          isPercussion: (i === 9),
        };
      }
      while (pos < track.length) {
        do { } while (track[pos++] & 0x80);
        var command = track[pos++];
        if (command < 0x80) {
          command = lastCommand;
          --pos;
        }
        else {
          lastCommand = command;
        }
        switch (command & 0xF0) {
          case 0x90:
            var key = track[pos++];
            var velocity = track[pos++];
            if (velocity !== 0) {
              var channel = channels[command & 0xf];
              var name = (channel.isPercussion ? 'p' : 'm') +
                ('0' + channel.program.toString(16).toUpperCase()).slice(-2);
              if (channel.control[0x00] || channel.control[0x32]) {
                name += '_' + ('0' + channel.control[0x00].toString(16).toUpperCase()).slice(-2);
                if (channel.control[0x32]) {
                  name += '_' + ('0' + channel.control[0x32].toString(16).toUpperCase()).slice(-2);
                }
              }
              if (channel.isPercussion) {
                name += ':' + ('0' + key.toString(16).toUpperCase()).slice(-2);
              }
              notes[name] = true;
            }
            break;
          case 0xC0:
            channels[command & 0xf].program = track[pos++];
            break;
          case 0xB0:
            var control = track[pos++];
            channels[command & 0xf].control[control] = track[pos++];
            break;
          case 0x80:
          case 0xA0:
          case 0xE0:
            pos += 2;
            break;
          case 0xD0:
            pos++;
            break;
          case 0xF0:
            if (command === 0xFF) {
              if (track[pos++] === 0x2F) {
                break;
              }
              var metaLength = nextVarint();
              pos += metaLength;
            }
            else if (command === 0xF0 || command === 0xF7) {
              while (track[pos++] !== 0xF7) {
                if (pos >= track.length) {
                  throw new Error('unterminated sysex section');
                }
              }
            }
            else {
              throw new Error('unknown midi command: 0x' + command.toString(16));
            }
            break;
        }
      }
      Object.defineProperty(this, 'usedNotes', {value:notes});
      return notes;
    },
    createRecital: function(destination) {
      var masterNode = destination.context.createGain();
      masterNode.connect(destination);
      var recital = new MIDISongRecital(masterNode, this);
      return recital;
    },
  };
  
  function MIDISongChannel(number) {
    this.number = number;
    this.control = new Uint8Array(128);
  }
  MIDISongChannel = {
    program: 0,
    pitchBend: 0,
    get isPercussion() {
      return this.number === 9;
    },
  };
  
  function MIDISongRecital(song, masterNode) {
    this.song = song;
    this.masterNode = masterNode;
    this.baseTime = masterNode.context.currentTime;
    this.active = new Set();
    this.channels = new Array(16);
    for (var i = 0; i < this.channels.length; i++) {
      this.channels[i] = new MIDISongChannel(i);
    }
  }
  MIDISongRecital.prototype = {
    pos: 0,
    nextVarint: function() {
      var value = 0;
      var b = this.song.track[this.pos++];
      while (b & 0x80) {
        value = (value << 7) | (b & 0x7f);
        b = this.song.track[this.pos++];
      }
      return (value << 7) | b;
    },
    deltaSeconds: function(d) {
      throw new Error('NYI');
    },
    save: function() {
      return {
        pos: this.pos,
        lastCommand: this.lastCommand,
      };
    },
    restore: function(savePoint) {
      Object.assign(this, savePoint);
    },
    playNote: function(channel, key, velocity) {
      throw new Error('NYI');
    },
    update: function() {
      this.frontierTime = this.masterNode.context.currentTime + 3;
      var nextEventNote, nextEventListener;
      while (this.active.size === 0 || this.baseTime < this.frontierTime) {
        this.baseTime += this.deltaSeconds(this.nextVarint());
        var command = this.song.track[this.pos++];
        if (command < 0x80) {
          command = this.lastCommand;
          --this.pos;
        }
        else {
          this.lastCommand = command;
        }
        switch (command & 0xF0) {
          case 0x80: // note off
          case 0xA0: // key pressure
            this.pos += 2;
            break;
          case 0x90: // note on
            var key = this.song.track[this.pos++];
            var velocity = this.song.track[this.pos++];
            if (velocity > 0) {
              var savePoint = this.save();
              var notePlay = this.playNote(this.channels[command & 0x0F], key, velocity);
              this.restore(savePoint);
            }
            break;
          case 0xB0: // control change
            var control = this.song.track[this.pos++];
            this.channels[command & 0xF].control[control] = this.song.track[this.pos++];
            break;
          case 0xC0: // program change
            this.channels[command & 0xF].program = this.song.track[this.pos++];
            break;
          case 0xD0: // channel pressure
            this.channels[command & 0xF].pressure = this.song.track[this.pos++];
            break;
          case 0xE0: // pitch bend
            var range = this.song.track[this.pos++];
            range = (range << 7) | this.song.track[this.pos++];
            this.channels[command & 0xF].pitchBend = (range - 8192) / 8192;
            break;
          case 0xF0:
            if (command === 0xFF) {
              command = this.song.track[this.pos++];
              if (command === 0x2F) {
                this.pos = this.song.track.length;
                break;
              }
              var metaLen = this.nextVarint();
              var metaData = this.song.track.subarray(this.pos, this.pos + metaLen);
              this.pos += metaLen;
              switch (command) {
                case 0x00:
                  this.sequenceNumber = (metaData[0] << 8) | metaData[1];
                  break;
                case 0x01: // text
                case 0x02: // copyright
                case 0x03: // sequence/track name
                case 0x04: // instrument name
                case 0x05: // lyric
                case 0x06: // marker
                case 0x07: // cue point
                  break;
                case 0x20:
                  var channelPrefix = metaData[0];
                  break;
                case 0x51:
                  var microsecondsPerQuarterNote = (metaData[0] << 16) | (metaData[1] << 8) | metaData[2];
                  break;
                case 0x54: // smpte starting offset
                  var hours = metaData[0],
                      minutes = metaData[1],
                      seconds = metaData[2],
                      frames = metaData[3],
                      framesDiv100 = metaData[4];
                  break;
                case 0x58: // time signature
                  var numerator = metaData[0],
                      denominator = metaData[1],
                      clocksPerTick = metaData[2],
                      speedRatio = metaData[3] / 8;
                  break;
                case 0x59: // key signature
                  var sharpsOrFlats = metaData[0], // -ve:flats 0:C +ve:sharps
                      key = metaData[1] === 0 ? 'major' : 'minor';
                  break;
                case 0x7F: // sequencer specific (like sysex)
                  break;
              }
              break;
            }
            if (command === 0xF0 || command === 0xF7) {
              var startPos = this.pos - (command == 0xF0 ? 1 : 0);
              do {
                if (this.pos >= this.song.track.length) {
                  throw new Error('unterminated sysex');
                }
              } while (this.song.track[this.pos++] !== 0xF7);
              var sysex = this.song.track.subarray(startPos, this.pos);
              break;
            }
            throw new Error('unknown MIDI message: 0x' + command.toString(16));
        }
        if (this.pos >= this.song.track.length) {
          if (nextEventNote) nextEventNote.removeEventLi
          this.masterNode.dispatchEvent(new CustomEvent('ended'));
          return;
        }
      }
    },
  };
  
  return Object.assign(MIDISong, {
    Recital: MIDISongRecital,
    getAll: function(bytes) {
      if (bytes instanceof Blob) {
        return new Promise(function(resolve, reject) {
          var fr = new FileReader();
          fr.addEventListener('load', function() {
            resolve(new Uint8Array(this.result));
          });
          fr.readAsArrayBuffer(bytes);
        })
        .then(this.getAll);
      }
      var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (String.fromCharCode.apply(null, bytes.subarray(0, 8)) !== 'MThd\x00\x00\x00\x06') {
        throw new Error('invalid MIDI file');
      }
      var format = dv.getUint16(8, false);
      switch (format) {
        case 0: format = 'track'; break;
        case 1: format = 'tracks'; break;
        case 2: format = 'songs'; break;
        default: throw new Error('invalid MIDI file');
      }
      var trackCount = dv.getUint16(10, false);
      if (format === 'track' && trackCount !== 1) {
        throw new Error('invalid number of tracks');
      }
      var tickDenominator = 'beats';
      var tickMultiplier = dv.getUint16(12, false);
      if (tickMultiplier < 0) {
        tickMultiplier = -tickMultiplier;
        tickDenominator = 'seconds';
      }
      var tracks = new Array(trackCount);
      var pos = 14;
      for (var i = 0; i < trackCount; i++) {
        if (String.fromCharCode.apply(null, bytes.subarray(pos, pos+4)) !== 'MTrk') {
          throw new Error('invalid MIDI file');
        }
        var trackLength = dv.getUint32(pos+4, false);
        tracks[i] = bytes.subarray(pos+8, pos+8+trackLength);
        pos += 8 + trackLength;
      }
      if (format === 'tracks') {
        tracks.splice(0, tracks.length, MIDISong.mergeTracks(tracks));
      }
      var songs = new Array(tracks.length);
      for (var i = 0; i < songs.length; i++) {
        songs[i] = new MIDISong(tracks[i]);
        songs[i].tickDenominator = tickDenominator;
        songs[i].tickMultiplier = tickMultiplier;
      }
      return songs;
    },
    mergeTracks: function(tracks) {
      var totalSize = 0;
      for (var i = 0; i < tracks.length; i++) {
        totalSize += tracks[i].length;
      }
      var combined = new Uint8Array(totalSize);
      function extend() {
        var extended = new Uint8Array(Math.ceil(combined.length * 1.5));
        extended.set(combined);
        extended.pos = combined.pos;
        extended.remaining = combined.remaining;
        extended.lastCommand = combined.lastCommand;
        combined = extended;
      }
      combined.pos = 0;
      combined.lastCommand = -1;
      function writeVarint(v, highBit) {
        if (v >= 0x80) {
          writeVarint(v >>> 7, true);
        }
        combined[combined.pos++] = (v & 0x7f) | (highBit ? 0x80 : 0);
      }
      function varintLen(v) {
        var len = 1;
        while ((v >>>= 7) > 0) len++;
        return len;
      }
      function nextVarint(track) {
        var value = 0;
        var b = track[track.pos++];
        while (b & 0x80) {
          value = (value << 7) | (b & 0x7f);
          b = track[track.pos++];
        }
        return (value << 7) | b;
      };
      for (var i = 0; i < tracks.length; i++) {
        tracks[i] = new Uint8Array(tracks[i].buffer, tracks[i].byteOffset, tracks[i].byteLength);
        tracks[i].pos = 0;
        tracks[i].remaining = nextVarint(tracks[i]);
      }
      while (tracks.length > 0) {
        var i = 0, j = 1;
        while (tracks[i].remaining > 0 && j < tracks.length) {
          if (tracks[j].remaining < tracks[i].remaining) {
            i = j;
          }
          j++;
        }
        var track = tracks[i];
        if (track.remaining !== 0) {
          for (j = 0; j < tracks.length; j++) {
            if (i === j) continue;
            tracks[j].remaining -= track.remaining;
          }
        }
        var command = track[track.pos++];
        if (command < 0x80) {
          command = track.lastCommand;
          --track.pos;
        }
        else {
          track.lastCommand = command;
        }
        var done = false;
        var startPos = track.pos;
        switch (command & 0xF0) {
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
              if (track[track.pos++] === 0x2F) {
                done = true;
                break;
              }
              var metaLength = nextVarint(track);
              track.pos += metaLength;
            }
            else if (command === 0xF0 || command === 0xF7) {
              while (track[track.pos++] !== 0xF7) {
                if (track.pos >= track.length) {
                  throw new Error('unterminated sysex section');
                }
              }
            }
            else {
              throw new Error('unknown midi command: 0x' + command.toString(16));
            }
            break;
        }
        if (done) {
          tracks.splice(i, 1);
          if (tracks.length === 0) {
            while ((combined.pos + varintLen(track.remaining) + 3) > combined.length) {
              extend();
            }
            writeVarint(track.remaining);
            combined[combined.pos++] = 0xFF;
            combined[combined.pos++] = 0x2F;
            combined[combined.pos++] = 0x00;
            break;
          }
          continue;
        }
        if ((command & 0xF0) !== 0xF0 && command === combined.lastCommand) {
          command = -1;
        }
        if (command !== -1) {
          combined.lastCommand = command;
        }
        var segment = track.subarray(startPos, track.pos);
        var len = varintLen(track.remaining) + (command === -1 ? 0 : 1) + segment.length;
        while ((combined.pos + len) > combined.length) {
          extend();
        }
        writeVarint(track.remaining);
        if (command !== -1) {
          combined[combined.pos++] = command;
        }
        combined.set(segment, combined.pos);
        combined.pos += segment.length;
        if (track.pos >= track.length) {
          tracks.splice(i, 1);
        }
        else {
          track.remaining = nextVarint(track);
        }
      }
      return combined.subarray(0, combined.pos);    
    },
  });

});
