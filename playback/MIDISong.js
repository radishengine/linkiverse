define(['./note'], function(noteData) {

  'use strict';
  
  function MIDISong(track) {
    this.track = track;
  }
  MIDISong.prototype = {
    beatsPerMinute: 120,
    tickDenominator: 'beats',
  };
  
  return Object.assign(MIDISong, {
    getAll: function(bytes) {
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
        tracks[i] = bytes.subarray(pos+4, pos+4+trackLength);
        pos += 4 + trackLength;
      }
      if (format === 'tracks') {
        tracks.splice(0, tracks.length, this.mergeTracks(tracks));
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
      function writeVarint(v, highBit) {
        if (v >= 0x80) {
          writeVarint(v >>> 7, true);
        }
        combined[combined.pos++] = (v & 0x7f) | (highBit ? 0x80 : 0);
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
        tracks[i] = new Uint8Array(tracks[i].buffer, tracks[i].byteOffset, track.byteLength);
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
        var startPos = track.pos;
        var command = track[track.pos++];
        if (command < 0x80) {
          command = track.lastCommand;
          --track.pos;
        }
        else {
          track.lastCommand = command;
        }
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
              command = track[track.pos++];
              if (command === 0x2F) {
                track = null;
                break;
              }
              var metaLength = track.nextVarint();
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
        }
        else {
          writeVarint(track.remainingTicks);
          var segment = track.subarray(startPos, track.pos);
          combined.set(segment, combined.pos);
          combined.pos += segment.length;
          if (track.pos >= track.length) {
            tracks.splice(i, 1);
          }
          else {
            track.remainingTicks = nextVarint(track);
          }
        }
      }
      return combined.subarray(0, combined.pos);    
    },
  });

});
