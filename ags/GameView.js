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
      list.afterPos = pos + 3 * 5 + 3;
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
