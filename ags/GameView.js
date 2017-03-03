define(function() {

  'use strict';
  
  function lenPrefixString(bytes, offset) {
    return String.fromCharCode.apply(null, bytes.subarray(offset + 1, offset + 1 + bytes[offset]));
  }
  
  function nullTerminated(bytes, offset, length) {
    return String.fromCharCode.apply(null, bytes.subarray(offset, offset + length)).replace(/\0.*$/, '');
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
      }
      else {
        header = new ModernHeader(this.dv.buffer, this.dv.byteOffset + offset, this.dv.byteLength - offset);
      }
      Object.defineProperty(this, 'header', {value:header});
      return header;
    },
  };
  
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
      var pos = this.cursors.afterPos + 8;
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
  };
  
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
  
  return GameView;

});
