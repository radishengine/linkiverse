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
  };
  
  return Object.assign(MIDISong, {
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
                track = null;
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
        if (track === null) {
          tracks.splice(i, 1);
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
        if ((combined.pos + len) > combined.length) {
          var extended = new Uint8Array(Math.ceil(combined.length * 1.5));
          extended.set(combined);
          extended.pos = combined.pos;
          extended.remaining = combined.remaining;
          extended.lastCommand = combined.lastCommand;
          combined = extended;
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
