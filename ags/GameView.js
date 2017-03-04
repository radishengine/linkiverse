define(function() {

  'use strict';
  
  function lenPrefixString(bytes, offset) {
    return String.fromCharCode.apply(null, bytes.subarray(offset + 1, offset + 1 + bytes[offset]));
  }
  
  function nullTerminated(bytes, offset, length) {
    return String.fromCharCode.apply(null, bytes.subarray(offset, offset + length)).match(/^[^\0]*/)[0];
  }
  
  function masked(mask, bytes, offset, length) {
    var buf = new Array(length);
    for (var i = 0; i < length; i++) {
      var b = bytes[offset + i];
      var mb = mask.charCodeAt(i % mask.length);
      buf[i] = String.fromCharCode((b - mb) & 0xff);
    }
    return buf.join('');
  }

  function GameView(buffer, byteOffset, byteLength) {
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  GameView.prototype = {
    get signature() {
      return String.fromCharCode.apply(null, this.bytes.subarray(0, 30));
    },
    get hasValidSignature() {
      return this.signature === 'Adventure Creator Game File v2';
    },
    get formatVersion() {
      return this.dv.getUint32(30, true);
    },
    get engineVersion() {
      return (this.formatVersion < 12) ? null : (function(){ throw new Error('NYI'); })(); // lenPrefixString(this.bytes, 34);
    },
    get offsetof_header() {
      return (this.formatVersion < 12) ? 34 : (function(){ throw new Error('NYI'); })(); // 38 + this.getUint32(34, true);
    },
    get header() {
      var header, offset = this.offsetof_header;
      if (this.formatVersion <= 12) {
        header = new VintageHeader(this.dv.buffer, this.dv.byteOffset + offset, this.dv.byteLength - offset);
        header.formatVersion = this.formatVersion;
      }
      else {
        header = new ModernHeader(this.dv.buffer, this.dv.byteOffset + offset, this.dv.byteLength - offset);
      }
      Object.defineProperty(this, 'header', {value:header});
      return header;
    },
    get dictionary() {
      var pos = this.offsetof_header + this.header.byteLength;
      var dict = {};
      if (this.header.hasDictionary) {
        var count = this.dv.getInt32(pos, true);
        pos += 4;
        dict.entries = {};
        for (var i = 0; i < count; i++) {
          var len = this.dv.getInt32(pos, true);
          var word = masked('Avis Durgan', this.bytes, pos + 4, len);
          var id = this.dv.getInt16(pos + 4 + len, true);
          dict.entries[word] = id;
          pos += 4 + len + 2;
        }
      }
      dict.afterPos = pos;
      Object.defineProperty(this, 'dictionary', {value:dict});
      return dict;
    },
    get globalScript() {
      var script = {};
      var pos = this.dictionary.afterPos;
      if (this.formatVersion <= 12) {
        script.source = masked('Avis Durgan', this.bytes, pos + 4, this.dv.getInt32(pos, true));
        pos += 4 + script.source.length;
      }
      if (this.formatVersion <= 9) {
        script.compiled = this.bytes.subarray(pos + 4, pos + 4 + this.dv.getInt32(pos, true));
        pos += 4 + script.compiled.length;
      }
      else {
        throw new Error('NYI');
      }
      script.afterPos = pos;
      Object.defineProperty(this, 'globalScript', {value:script});
      return script;
    },
    get views() {
      var buffer = this.bytes.buffer, byteOffset = this.bytes.byteOffset;
      var list = new Array(this.header.viewCount);
      var pos = this.globalScript.afterPos;
      if (this.formatVersion <= 12) {
        for (var i = 0; i < list.length; i++) {
          var view = list[i] = {};
          view.loops = new Array(this.dv.getUint16(pos, true));
          pos += 2;
          for (var j = 0; j < 8; j++) {
            if (j < view.loops.length) {
              view.loops[j] = {frames: new Array(this.dv.getUint16(pos, true))};
            }
            pos += 2;
          }
          pos += 2; // align to 4 byte boundary
          for (var j = 0; j < 8; j++) {
            for (var k = 0; k < 10; k++) {
              if (j < view.loops.length && k < view.loops[j].frames.length) {
                view.loops[j].frames[k] = new AnimFrameView(buffer, byteOffset + pos, AnimFrameView.byteLength);
              }
              pos += AnimFrameView.byteLength;
            }
          }
        }
      }
      else {
        throw new Error('NYI');
      }
      list.afterPos = pos;
      Object.defineProperty(this, 'views', {value:list});
      return list;
    },
    get offsetof_characters() {
      var pos = this.views.afterPos;
      if (this.formatVersion <= 12) {
        var count = this.dv.getInt32(pos, true);
        pos += 4;
        var number_count, name_length;
        if (this.formatVersion >= 11) {
          number_count = 241;
          name_length = 30;
        }
        else {
          number_count = 121;
          name_length = 22;
        }
        pos += count * (4 + 2 * number_count + name_length);
      }
      else if (this.formatVersion <= 19) {
        pos += 4 * 0x204;
      }
      Object.defineProperty(this, 'offsetof_characters', {value:pos});
      return pos;
    },
    get characters() {
      var list = new Array(this.header.characterCount);
      var pos = this.offsetof_characters;
      var buffer = this.bytes.buffer, byteOffset = this.bytes.byteOffset, byteLength = this.bytes.byteLength - pos;
      for (var i = 0; i < list.length; i++) {
        var c = list[i] = new CharacterView(buffer, byteOffset + pos, byteLength);
        c.formatVersion = this.formatVersion;
        pos += c.byteLength;
        byteLength -= c.byteLength;
      }
      list.afterPos = pos;
      Object.defineProperty(this, 'characters', {value:list});
      return list;
    },
    get offsetof_globalMessages() {
      return this.characters.afterPos + (this.formatVersion >= 21 ? 50 * 20 : 0);
    },
    get globalMessages() {
      var list = new Array(1000);
      var pos = this.offsetof_globalMessages;
      var isMasked = this.formatVersion >= 26;
      for (var i = 500; i < 1000; i++) {
        if (!this.header.isGlobalMessagePresent(i)) continue;
        else if (isMasked) {
          var len = this.dv.getInt32(pos, true);
          if (len > 0) {
            list[i] = masked('Avis Durgan', this.bytes, pos + 4, len);
          }
          pos += 4 + len;
        }
        else {
          var endPos = pos;
          while (this.bytes[endPos] !== 0) {
            endPos++;
          }
          if (endPos !== pos) {
            list[i] = String.fromCharCode.apply(null, this.bytes.subarray(pos, endPos));
          }
          pos = endPos + 1;
        }
      }
      list[983] = list[983] || "Sorry, not now.";
      list[984] = list[984] || "Restore";
      list[985] = list[985] || "Cancel";
      list[986] = list[986] || "Select a game to restore:";
      list[987] = list[987] || "Save";
      list[988] = list[988] || "Type a name to save as:";
      list[989] = list[989] || "Replace";
      list[990] = list[990] || "The save directory is full. You must replace an existing game:";
      list[991] = list[991] || "Replace:";
      list[992] = list[992] || "With:";
      list[993] = list[993] || "Quit";
      list[994] = list[994] || "Play";
      list[995] = list[995] || "Are you sure you want to quit?";
      list.afterPos = pos;
      Object.defineProperty(this, 'globalMessages', {value:list});
      return list;
    },
    get dialogs() {
      var list = new Array(this.header.dialogCount);
      var pos = this.globalMessages.afterPos;
      var buffer = this.bytes.buffer, byteOffset = this.bytes.byteOffset, byteLength = this.bytes.byteLength;
      for (var i = 0; i < list.length; i++) {
        var dialog = list[i] = new DialogView(buffer, byteOffset + pos, byteLength - pos);
        dialog.formatVersion = this.formatVersion;
        pos += dialog.byteLength;
      }
      if (this.formatVersion <= 37) {
        for (var i = 0; i < list.length; i++) {
          list[i].script = {};
          list[i].script.compiled = this.bytes.subarray(pos, pos + list[i].codeSize);
          pos += list[i].codeSize;
          var compiledLen = this.dv.getInt32(pos, true);
          list[i].script.source = masked(this.bytes, pos + 4, compiledLen);
          pos += compiledLen;
        }
        list.messages = new Array(this.header.dialogMessageCount);
        if (this.formatVersion > 25) {
          throw new Error('NYI');
        }
        else {
          for (var i = 0; i < list.messages.length; i++) {
            var endPos = pos;
            while (this.bytes[endPos] !== 0) {
              endPos++;
            }
            if (endPos !== pos) {
              list.messages[i] = String.fromCharCode.apply(null, this.bytes.subarray(pos, endPos));
            }
            pos = endPos + 1;
          }
        }
      }
      list.afterPos = pos;
      Object.defineProperty(this, 'dialogs', {value:list});
      return list;
    },
  };
    
  function AnimFrameView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  AnimFrameView.prototype = {
    get spriteNumber() {
      return this.dv.getInt32(0, true);
    },
    get offsetX() {
      return this.dv.getInt16(4, true);
    },
    get offsetY() {
      return this.dv.getInt16(6, true);
    },
    get delayFrames() {
      return this.dv.getInt16(8, true);
    },
    get flags() {
      return this.dv.getInt32(12);
    },
    get soundNumber() {
      return this.dv.getInt32(16);
    },
  };
  AnimFrameView.byteLength = 28;
  
  const EVENT_BLOCK_SIZE = 8*4 + 8*4 + 8*4 + 8*4 + 4 + 8*2;
  
  function VintageHeader(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  VintageHeader.prototype = {
    get title() {
      return nullTerminated(this.bytes, 0, 50);
    },
    get palette_uses() {
      return this.bytes.subarray(50, 50 + 256);
    },
    get palette() {
      return this.bytes.subarray(50 + 256, 50 + 256 + 256*4);
    },
    get vintageGUIs() {
      var list = new Array(10);
      var pos = 50 + 256 + 256*4 + 2; // extra 2 bytes for 32-bit align
      var buffer = this.dv.buffer, byteOffset = this.dv.byteOffset;
      for (var i = 0; i < list.length; i++) {
        list[i] = new VintageGUI(buffer, byteOffset + pos, VintageGUI.byteLength);
        pos += VintageGUI.byteLength;
      }
      list.afterPos = pos;
      Object.defineProperty(this, 'vintageGUIs', {value:list});
      return list;
    },
    get activeGUICount() {
      return this.dv.getInt32(this.vintageGUIs.afterPos, true);
    },
    get viewCount() {
      return this.dv.getInt32(this.vintageGUIs.afterPos + 4, true);
    },
    get cursors() {
      var list = new Array(10), pos = this.vintageGUIs.afterPos + 8;
      var buffer = this.dv.buffer, byteOffset = this.dv.byteOffset;
      for (var i = 0; i < list.length; i++) {
        list[i] = new CursorView(buffer, byteOffset + pos, CursorView.byteLength);
        pos += CursorView.byteLength;
      }
      list.afterPos = pos;
      Object.defineProperty(this, 'cursors', {value:list});
      return list;
    },
    get characterCount() {
      return this.dv.getInt32(this.cursors.afterPos + 4, true);
    },
    get characterEventBlocks() {
      var list = new Array(50);
      var dv = this.dv;
      var pos = this.cursors.afterPos + 12;
      list.afterPos = pos + EVENT_BLOCK_SIZE * list.length;
      for (var i = 0; i < list.length; i++) {
        list[i] = readEventBlock(dv, pos + i * EVENT_BLOCK_SIZE, 'character' + i + '_');
      }
      Object.defineProperty(this, 'characterEventBlocks', {value:list});
      return list;
    },
    get inventoryItemEventBlocks() {
      var list = new Array(100);
      var dv = this.dv;
      var pos = this.characterEventBlocks.afterPos;
      list.afterPos = pos + EVENT_BLOCK_SIZE * list.length;
      for (var i = 0; i < list.length; i++) {
        list[i] = readEventBlock(dv, pos + i * EVENT_BLOCK_SIZE, 'inventory' + i + '_');
      }
      Object.defineProperty(this, 'inventoryItemEventBlocks', {value:list});
      return list;
    },
    get playerCharacterId() {
      return this.dv.getUint8(this.inventoryItemEventBlocks.afterPos + 4, true);
    },
    get spriteFlags() {
      var pos = this.inventoryItemEventBlocks.afterPos + 8;
      var flags = this.bytes.subarray(pos, pos + 2100);
      flags.afterPos = pos + flags.byteLength;
      Object.defineProperty(this, 'spriteFlags', {value:flags});
      return flags;
    },
    get totalScore() {
      return this.dv.getInt32(this.spriteFlags.afterPos, true);
    },
    get inventoryItemCount() {
      return this.dv.getInt32(this.spriteFlags.afterPos + 4, true);
    },
    get inventoryItems() {
      var list = new Array(this.inventoryItemCount);
      var buffer = this.bytes.buffer, byteOffset = this.bytes.byteOffset;
      var pos = this.spriteFlags.afterPos + 8;
      list.afterPos = pos + InventoryItemView.byteLength * 100;
      for (var i = 0; i < list.length; i++) {
        list[i] = new InventoryItemView(buffer, byteOffset + pos, InventoryItemView.byteLength);
        list[i].eventBlock = this.inventoryItemEventBlocks[i];
        pos += InventoryItemView.byteLength;
      }
      Object.defineProperty(this, 'inventoryItems', {value:list});
      return list;
    },
    get dialogCount() {
      return this.dv.getInt32(this.inventoryItems.afterPos, true);
    },
    get dialogMessageCount() {
      return this.dv.getInt32(this.inventoryItems.afterPos + 4, true);
    },
    get fontCount() {
      return this.dv.getInt32(this.inventoryItems.afterPos + 8, true);
    },
    get colorDepth() {
      return this.dv.getInt32(this.inventoryItems.afterPos + 12, true);
    },
    get target_win() {
      return this.dv.getInt32(this.inventoryItems.afterPos + 16, true);
    },
    get dialog_bullet_sprite_idx() {
      return this.dv.getInt32(this.inventoryItems.afterPos + 20, true);
    },
    get hotdot() {
      return this.dv.getInt16(this.inventoryItems.afterPos + 24, true);
    },
    get hotdot_outer() {
      return this.dv.getInt16(this.inventoryItems.afterPos + 26, true);
    },
    get unique_int32() {
      return this.dv.getInt32(this.inventoryItems.afterPos + 28, true);
    },
    // reserved int[2]
    get languageCodes() {
      var pos = this.inventoryItems.afterPos + 40;
      var list = new Array(this.dv.getInt16(pos, true));
      list.afterPos = pos + 2 + 3 * 5 + 3;
      pos += 2;
      for (var i = 0; i < list.length; i++) {
        list[i] = nullTerminated(this.bytes, pos, 3);
        pos += 3;
      }
      Object.defineProperty(this, 'languageCodes', {value:list});
      return list;
    },
    isGlobalMessagePresent: function(idx) {
      if (idx < 500 || idx > 999) throw new RangeError('global message ID out of range');
      idx -= 500;
      return this.dv.getInt32(this.languageCodes.afterPos + idx * 4, true) !== 0;
    },
    get afterPos_globalMessageFlags() {
      return this.languageCodes.afterPos + 4 * 500;
    },
    // TODO: ...more here...
    get hasDictionary() {
      return this.dv.getInt32(this.afterPos_globalMessageFlags + 9 + 9 + 4, true) !== 0;
    },
    get byteLength() {
      return this.afterPos_globalMessageFlags +
        (this.formatVersion >= 6 ? 9 + 9 + 4 + 4 + 4*8 : 0) +
        (this.formatVersion > 9 ? 6000 : 0);
    },
  };
  
  function InventoryItemView(buffer, byteOffset, byteLength) {
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  InventoryItemView.prototype = {
    get name() {
      return nullTerminated(this.bytes, 0, 25);
    },
    get sprite() {
      return this.dv.getInt32(28, true);
    },
    get cursorSprite() {
      return this.dv.getInt32(32, true);
    },
    get handleX() {
      return this.dv.getInt32(36, true);
    },
    get handleY() {
      return this.dv.getInt32(40, true);
    },
    get flags() {
      return this.bytes[64];
    },
    get startWith() {
      return !!(this.flags & 1);
    },
  };
  InventoryItemView.byteLength = 68;
  
  function readEventBlock(dv, pos, func_name_prefix) {
    var list = new Array(dv.getUint32(pos + 8*4 + 8*4 + 8*4 + 8*4, true));
    for (var i = 0; i < list.length; i++) {
      var event_id = dv.getUint32(pos + 4 * i, true);
      var respond = dv.getUint32(pos + 4*8 + 4*i, true);
      var respondval = dv.getUint32(pos + 4*8 + 4*8 + 4*i, true);
      var data = dv.getUint32(pos + 4*8 + 4*8 + 4*8 + 4*i, true);
      var score = dv.getUint16(pos + 4*8 + 4*8 + 4*8 + 4*8 + 4 + 2*8, true);
      var handler = list[i] = {};
      switch (event_id) {
        case 0: handler.event = 'on_look_at'; break;
        case 1: handler.event = 'on_interact'; break;
        case 2: handler.event = 'on_talk_to'; break;
        case 3:
          handler.event = 'on_use_inventory';
          handler.ifUsingInventory = data;
          break;
        case 4: handler.event = 'on_any_click'; break;
        case 5: handler.event = 'on_pick_up'; break;
        case 6: handler.event = 'on_user_mode_1'; break;
        case 7: handler.event = 'on_user_mode_2'; break;
      }
      switch (respond) {
        case 0:
          handler.response = 'Player_GoToRoom';
          handler.room = respondval;
          break;
        case 1:
          handler.response = 'DoNothing';
          break;
        case 2:
          handler.response = 'Player_StopWalking';
          break;
        case 3:
          handler.response = 'RunPlayerDiesScript';
          break;
        case 4:
          handler.response = 'RunAnimation';
          handler.animation = respondval;
          break;
        case 5:
          handler.response = 'Game_DisplayMessage';
          handler.message = respondval;
          break;
        case 6:
          handler.response = 'Object_Hide';
          handler.object = respondval;
          break;
        case 7:
          handler.response = 'RemoveObjectAddInventory';
          handler.object = respondval;
          handler.inventoryItem = data;
          break;
        case 8:
          handler.response = 'Player_GiveInventory';
          handler.inventoryItem = respondval;
          break;
        case 9:
          handler.response = 'RunTextScriptFunction';
          handler.functionName = func_name_prefix + String.fromCharCode('a'.charCodeAt(0) + respondval);
          break;
        case 10:
          handler.response = 'RunGraphicalScript';
          handler.graphicalScript = respondval;
          break;
        case 11:
          handler.response = 'PlaySoundEffect';
          handler.soundEffect = respondval;
          break;
        case 12:
          handler.response = 'PlayFlic';
          handler.flic = respondval;
          break;
        case 13:
          handler.response = 'Object_Show';
          handler.object = respondval;
          break;
        case 14:
          handler.response = 'RunDialogTopic';
          handler.dialog = respondval;
          break;
      }
    }
    return list;
  }
  
  function CursorView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  CursorView.prototype = {
    get sprite() {
      return this.dv.getInt32(0, true);
    },
    get handleX() {
      return this.dv.getInt16(4, true);
    },
    get handleY() {
      return this.dv.getInt16(6, true);
    },
    get view() {
      return this.dv.getInt16(8, true); // 0 same as -1 if formatVersion < 32
    },
    get name() {
      return nullTerminated(this.bytes, 10, 10);
    },
    get flags() {
      return this.bytes[20];
    },
    get animatesWhenMoving() {
      return !!(this.flags & 1);
    },
    get isEnabled() {
      return !(this.flags & 2);
    },
    get processClick() {
      return !!(this.flags & 4);
    },
    get animatedOverHotspot() {
      return !!(this.flags & 8);
    },
    // 3 unused bytes (32-bit alignment)
  };
  CursorView.byteLength = 24;
  
  function VintageGUI(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  VintageGUI.prototype = {
    get x() { return this.dv.getInt32(0, true); },
    get y() { return this.dv.getInt32(4, true); },
    get x2() { return this.dv.getInt32(8, true); },
    get y2() { return this.dv.getInt32(12, true); },
    get bgcol() { return this.dv.getInt32(16, true); },
    get fgcol() { return this.dv.getInt32(20, true); },
    get bordercol() { return this.dv.getInt32(24, true); },
    get vtextxp() { return this.dv.getInt32(28, true); },
    get vtextyp() { return this.dv.getInt32(32, true); },
    get vtextalign() { return this.dv.getInt32(36, true); },
    get vtext() { return nullTerminated(this.bytes, 40, 40); },
    get numbuttons() { return this.dv.getInt32(80, true); },
    get buttons() {
      var list = new Array(20);
      var buffer = this.dv.buffer, byteOffset = this.dv.byteOffset;
      for (var i = 0; i < list.length; i++) {
        list[i] = new VintageGUIButton(buffer, byteOffset + 84 + i*36, 36);
      }
      Object.defineProperty(this, 'buttons', {value:list});
      return list;
    },
    get flags() {
      return this.dv.getInt32(804, true);
    },
    // unused: 4 bytes
    get popupyp() {
      return this.dv.getInt32(812, true);
    },
    get popup() {
      return this.dv.getUint8(816);
    },
    get on() {
      return this.dv.getUint8(817);
    },
  };
  VintageGUI.byteLength = 820;
  
  function VintageGUIButton(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  VintageGUIButton.prototype = {
    get x() { return this.dv.getInt32(0, true); },
    get y() { return this.dv.getInt32(4, true); },
    get pic() { return this.dv.getInt32(8, true); },
    get overpic() { return this.dv.getInt32(12, true); },
    get pushpic() { return this.dv.getInt32(16, true); },
    get leftclick() { return this.dv.getInt32(20, true); },
    get rightclick() { return this.dv.getInt32(24, true); },
    get inventoryWidth() { return this.leftclick; },
    get inventoryHeight() { return this.rightclick; },
    // unused: 4 bytes
    get flags() { return this.dv.getUint8(32); },
    // unused: 3 bytes
  };
  VintageGUIButton.byteLength = 36;  
  
  function ModernHeader() {
    throw new Error('NYI');
  }
  
  function CharacterView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  CharacterView.prototype = {
    get normal_view() {
      return this.dv.getInt32(0, true);
    },
    get speech_view() {
      return this.dv.getInt32(4, true);
    },
    get view() {
      return this.dv.getInt32(8, true);
    },
    get room() {
      return this.dv.getInt32(12, true);
    },
    get prev_room() {
      return this.dv.getInt32(16, true);
    },
    get x() {
      return this.dv.getInt32(20, true);
    },
    get y() {
      return this.dv.getInt32(24, true);
    },
    get anim_delay() {
      return this.dv.getInt32(28, true);
    },
    get flags() {
      if (this.formatVersion <= 11) {
        return this.dv.getInt32(32, true) & 0xffffff;
      }
      return this.dv.getInt32(32, true);
    },
    get ignoresScaling() {
      return !!(this.dv.getInt32(32, true) & 1);
    },
    get isClickable() {
      return !(this.dv.getInt32(32, true) & 4);
    },
    get usesDiagonalLoops() {
      return !(this.dv.getInt32(32, true) & 8);
    },
    get ignoresLighting() {
      return !!(this.dv.getInt32(32, true) & 0x20);
    },
    get turnsBeforeWorking() {
      return !(this.dv.getInt32(32, true) & 0x40);
    },
    get ignoreWalkbehinds() {
      return !(this.dv.getInt32(32, true) & 0x80);
    },
    get isSolid() {
      return (this.formatVersion >= 21) && !(this.dv.getInt32(32, true) & 0x200);
    },
    get linksSpeedToScale() {
      return !!(this.dv.getInt32(32, true) & 0x400);
    },
    get blinksWhileThinking() {
      return !(this.dv.getInt32(32, true) & 0x800);
    },
    get linksAudioVolumeToScale() {
      return !!(this.dv.getInt32(32, true) & 0x1000);
    },
    get linksMovementToAnimation() {
      if (this.formatVersion <= 12) {
        return false;
      }
      throw new Error('NYI');
    },
    get speechColor() {
      if (this.formatVersion <= 11) {
        return this.dv.getInt32(32, true) >>> 24;
      }
      throw new Error('NYI');
    },
    get following() {
      return this.dv.getInt16(36, true);
    },
    get followinfo() {
      return this.dv.getInt16(38, true);
    },
    get idleView() {
      return this.dv.getInt32(40, true);
    },
    get idleTime() {
      return this.dv.getInt16(44, true);
    },
    get idleLeft() {
      return this.dv.getInt16(46, true);
    },
    get transparency() {
      return this.dv.getInt16(48, true);
    },
    get baseline() {
      return this.dv.getInt16(50, true);
    },
    get active_inv() {
      return this.dv.getInt32(52, true);
    },
    get offsetof_loop() {
      if (this.formatVersion > 12) {
        throw new Error('NYI');
      }
      return 56;
    },
    get loop() {
      return this.dv.getInt16(this.offsetof_loop, true);
    },
    get frame() {
      return this.dv.getInt16(this.offsetof_loop + 2, true);
    },
    get walking() {
      return this.dv.getInt16(this.offsetof_loop + 4, true);
    },
    get animating() {
      return this.dv.getInt16(this.offsetof_loop + 6, true);
    },
    get walk_speed_x() {
      return this.dv.getInt16(this.offsetof_loop + 8, true);
    },
    get animspeed() {
      return this.dv.getInt16(this.offsetof_loop + 10, true);
    },
    get offsetof_inventoryCounts() {
      return this.offsetof_loop + 12;
    },
    get offsetof_act_x() {
      return this.offsetof_inventoryCounts + 2 * (this.formatVersion <= 12 ? 100 : 301);
    },
    get act_x() {
      return this.dv.getInt16(this.offsetof_act_x, true);
    },
    get act_y() {
      return this.dv.getInt16(this.offsetof_act_x + 2, true);
    },
    get nameBufferSize() {
      return this.formatVersion <= 12 ? 30 : 40;
    },
    get scriptNameBufferSize() {
      return this.formatVersion <= 12 ? 16 : 20;
    },
    get name() {
      return nullTerminated(this.bytes, this.offsetof_act_x + 4, this.nameBufferSize);
    },
    get scriptName() {
      return nullTerminated(
        this.bytes,
        this.offsetof_act_x + 4 + this.nameBufferSize,
        this.scriptNameBufferSize);
    },
    get on() {
      return this.bytes[this.offsetof_act_x + 4 + this.nameBufferSize + this.scriptNameBufferSize];
    },
    get byteLength() {
      var len = this.offsetof_act_x + 4 + this.nameBufferSize + this.scriptNameBufferSize + 2;
      Object.defineProperty(this, 'byteLength', {value:len});
      return len;
    },
  };
  
  function DialogView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  DialogView.prototype = {
    get options() {
      var maxOptionCount = this.formatVersion <= 12 ? 15 : 30;
      var maxOptionLength = this.formatVersion <= 12 ? 70 : 150;
      var afterPos_text = maxOptionCount * maxOptionLength;
      afterPos_text += afterPos_text % 4;
      var offsetof_flags = afterPos_text;
      var afterPos_flags = offsetof_flags + 4 * maxOptionCount;
      var offsetof_entryPoints = afterPos_flags + 4;
      var afterPos_entryPoints = offsetof_entryPoints + 2 * maxOptionCount;
      var offsetof_optionCount = afterPos_entryPoints + 2 + 2;
      offsetof_optionCount += offsetof_optionCount % 4;
      var list = new Array(this.dv.getInt32(offsetof_optionCount, true));
      list.afterPos_entryPoints = afterPos_entryPoints;
      for (var i = 0; i < list.length; i++) {
        var flags = this.dv.getInt32(offsetof_flags + i * 4, true);
        list[i] = {
          text: nullTerminated(this.bytes, maxOptionLength * i, maxOptionLength),
          on: !!(flags & 1),
          offForever: !!(flags & 2),
          spoken: !(flags & 4),
          hasBeenChosen: !!(flags & 8),
          entryPoint: this.dv.getInt16(offsetof_entryPoints + i * 2, true),
        };
      }
      list.afterPos = offsetof_optionCount + 4;
      Object.defineProperty(this, 'options', {value:list});
      return list;
    },
    get entryPoint() {
      return this.dv.getInt16(this.options.afterPos_entryPoints, true);
    },
    get codeSize() {
      return this.dv.getInt16(this.options.afterPos_entryPoints + 2, true);
    },
    get usesParser() {
      return (this.formatVersion > 12) && !!(this.getInt32(this.options.afterPos, true) & 1);
    },
    get byteLength() {
      return this.options.afterPos + (this.formatVersion > 12 ? 4 : 0);
    },
  };
  
  window.download = function download(b) {
    if (!(b instanceof Blob)) b = new Blob([b]);
    var link = document.createElement('A');
    link.setAttribute('download', 'file.dat');
    link.setAttribute('href', URL.createObjectURL(b));
    link.addEventListener('click', function() {
      document.body.removeChild(link);
    });
    document.body.appendChild(link);
    link.click();
  };
  
  return GameView;

});
