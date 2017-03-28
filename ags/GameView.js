define(['./util', './ScomScript'], function(util, ScomScript) {

  'use strict';
  
  const EVENT_BLOCK_SIZE = 8*4 + 8*4 + 8*4 + 8*4 + 4 + 8*2;
  
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
    
    this.endOffset = 0;
    
    function member_byteString(len, nullTerminate) {
      return function() {
        const offset = this.endOffset;
        this.endOffset += len;
        if (nullTerminate) {
          return function() {
            return util.byteString(this.bytes, offset, len).match(/^[^\0]*/)[0];
          };
        }
        else {
          return function() {
            return util.byteString(this.bytes, offset, len);
          };
        }
      };
    }
    
    function member_uint32() {
      const offset = this.endOffset;
      this.endOffset += 4;
      return function() {
        return this.dv.getUint32(offset, true);
      };
    }
    
    function member_int16() {
      const offset = this.endOffset;
      this.endOffset += 2;
      return function() {
        return this.dv.getInt16(offset, true);
      };
    }
    
    function member_bool32() {
      const offset = this.endOffset;
      this.endOffset += 4;
      return function() {
        return !!this.dv.getUint32(offset, true);
      };
    }
    
    function member_bytes(count) {
      return function() {
        const offset = this.endOffset;
        this.endOffset += count;
        return function() {
          return this.bytes.subarray(offset, offset + count);
        };
      };
    }
    
    this.member('signature', member_byteString('Adventure Creator Game File v2'.length));
    this.member('formatVersion', member_uint32);
    this.member('engineVersion', function() {
      if (this.formatVersion < 12) return null;
      const len = this.dv.getUint32(this.endOffset, true);
      const offset = this.endOffset + 4;
      this.endOffset = offset + len;
      return function() {
        return util.byteString(this.bytes, offset, len);
      };
    });
    
    if (this.formatVersion >= 13) {
      throw new Error('NYI');
    }
    else {
      this.member('title', member_byteString(50, true));
      this.member('palette_uses', member_bytes(256));
      this.member('palette', function() {
        const offset = this.endOffset;
        this.endOffset += 256 * 4;
        return function() {
          var palette = new Uint8Array(this.bytes.subarray(offset, offset + 256 * 4));
          for (var i = 0; i < 256; i++) {
            palette[i*4] = (palette[i*4] << 2) | (palette[i*4] >> 4);
            palette[i*4 + 1] = (palette[i*4 + 1] << 2) | (palette[i*4 + 1] >> 4);
            palette[i*4 + 2] = (palette[i*4 + 2] << 2) | (palette[i*4 + 2] >> 4);
            palette[i*4 + 3] = 0xFF;
          }
          return palette;
        };
      });
      this.endOffset += 2; // alignment
      if (this.formatVersion >= 9) {
        this.endOffset += VintageGUI.byteLength * 10 + 4;
      }
      else {
        this.member('interfaces', function() {
          const offset = this.endOffset;
          this.endOffset += VintageGUI.byteLength * 10;
          return function() {
            var list = new Array(this.interfaceCount);
            var buffer = this.dv.buffer, byteOffset = this.dv.byteOffset;
            for (var i = 0; i < list.length; i++) {
              list[i] = new VintageGUI(buffer, byteOffset + offset + i * VintageGUI.byteLength, VintageGUI.byteLength);
            }
            return list;
          };
        });
        this.member('interfaceCount', member_uint32);
      }
      this.member('viewCount', member_uint32);
      this.member('cursors', function() {
        const offset = this.endOffset;
        this.endOffset += CursorView.byteLength * 10;
        return function() {
          var list = new Array(10);
          var buffer = this.dv.buffer, byteOffset = this.dv.byteOffset;
          for (var i = 0; i < list.length; i++) {
            list[i] = new CursorView(buffer, byteOffset + offset + CursorView.byteLength * i, CursorView.byteLength);
          }
          return list;
        };
      });
      this.endOffset += 4; // globalScript pointer
      this.member('characterCount', member_uint32);
      this.endOffset += 4; // chars pointer
      function member_eventBlocks(count, identifier) {
        return function() {
          const offset = this.endOffset;
          this.endOffset += EVENT_BLOCK_SIZE * count;
          return function() {
            var list = new Array(count);
            var dv = this.dv;
            for (var i = 0; i < list.length; i++) {
              list[i] = readEventBlock(dv, offset + EVENT_BLOCK_SIZE * i, identifier.replace(/<i>/g, i));
            }
            return list;
          };
        };
      }
      this.member('characterEventBlocks', member_eventBlocks(50, 'character<i>_'));
      this.member('inventoryItemEventBlocks', member_eventBlocks(100, 'inventory<i>_'));
      this.endOffset += 4; // compiled script pointer
      this.member('playerCharacterId', member_uint32);
      this.member('spriteFlags', member_bytes(2100));
      this.member('totalScore', member_uint32);
      this.member('inventoryCount', member_uint32);
      this.member('inventoryItems', function() {
        const offset = this.endOffset;
        this.endOffset += InventoryItemView.byteLength * 100;
        return function() {
          var list = new Array(this.inventoryCount);
          var buffer = this.bytes.buffer, byteOffset = this.bytes.byteOffset + offset;
          for (var i = 0; i < list.length; i++) {
            list[i] = new InventoryItemView(
              buffer,
              byteOffset + i * InventoryItemView.byteLength,
              InventoryItemView.byteLength);
          }
          return list;
        };
      });
      this.member('dialogCount', member_uint32);
      this.member('dialogMessageCount', member_uint32);
      this.member('fontCount', member_uint32);
      this.member('colorDepth', member_uint32);
      this.member('target_win', member_uint32);
      this.member('dialog_bullet_sprite_idx', member_uint32);
      this.member('hotdot', member_int16);
      this.member('hotdot_outer', member_int16);
      this.member('unique_int32', member_uint32);
      this.endOffset += 8; // reserved int[2]
      this.member('languageCodeCount', member_int16);
      this.member('languageCodes', function() {
        const offset = this.endOffset;
        this.endOffset += 3*5 + 3;
        return function() {
          var list = new Array(this.languageCodeCount);
          for (var i = 0; i < list.length; i++) {
            list[i] = String.fromCharCode(
              this.bytes[offset + i * 3],
              this.bytes[offset + i * 3 + 1],
              this.bytes[offset + i * 3 + 2]).match(/^[^\0]*/)[0];
          }
          return list;
        };
      });
      this.member('isGlobalMessagePresent', function() {
        const offset = this.endOffset;
        this.endOffset += 500 * 4;
        return function() {
          return function isGlobalMessagePresent(idx) {
            if (idx < 500 || idx > 999) throw new RangeError('global message ID out of range');
            idx -= 500;
            return this.dv.getInt32(offset + idx * 4, true) !== 0;
          };
        };
      });
      if (this.formatVersion >= 6) {
        this.member('fontFlags', member_bytes(10));
        this.member('fontOutline', member_bytes(10));
        this.member('guiCount', member_uint32);
        this.member('hasDictionary', member_bool32);
        this.endOffset += 4 * 8; // reserved
        if (this.formatVersion >= 10) {
          this.member('spriteFlags', member_bytes(6000));
        }
      }
    }
    this.member('dictionary', function() {
      if (!this.hasDictionary) return null;
      const count = this.dv.getUint32(this.endOffset, true);
      var dict = {};
      this.endOffset += 4;
      for (var i = 0; i < count; i++) {
        var len = this.dv.getUint32(this.endOffset, true);
        this.endOffset += 4;
        var word = masked('Avis Durgan', this.bytes, this.endOffset, len);
        this.endOffset += len;
        var id = this.dv.getInt16(this.endOffset, true);
        this.endOffset += 2;
        dict[word] = id;
      }
      return dict;
    });
    this.member('globalScriptSource', function() {
      if (this.formatVersion >= 13) return null;
      const length = this.dv.getUint32(this.endOffset, true);
      const offset = this.endOffset += 4;
      this.endOffset += length;
      return function() {
        return util.byteString(this.bytes, offset, length);
      };
    });
    this.member('globalScript', function() {
      if (this.formatVersion >= 11) {
        var scom = new ScomScript(
          this.dv.buffer,
          this.dv.byteOffset + this.endOffset,
          this.dv.byteLength - this.endOffset);
        this.endOffset += scom.endOffset;
        return scom;
      }
      const length = this.dv.getUint32(this.endOffset, true);
      const offset = this.endOffset += 4;
      this.endOffset += length;
      return function() {
        return this.bytes.subarray(offset, offset + length);
      };
    });
    if (this.formatVersion >= 31) {
      if (this.formatVersion > 37) {
        this.member('dialogScript', function() {
          var scom = new ScomScript(
            this.dv.buffer,
            this.dv.byteOffset + this.endOffset,
            this.dv.byteLength - this.endOffset);
          this.endOffset += scom.endOffset;
          return scom;
        });
      }
      this.member('moduleScripts', function() {
        var list = new Array(this.dv.getUint32(this.endOffset, true));
        this.endOffset += 4;
        for (var i = 0; i < list.length; i++) {
          list[i] = new ScomScript(
            this.dv.buffer,
            this.dv.byteOffset + this.endOffset,
            this.dv.byteLength - this.endOffset);
          this.endOffset += list[i].endOffset;
        }
        return list;
      });
    }
    this.member('views', function() {
      if (this.formatVersion >= 13) throw new Error('NYI');
      const offset = this.endOffset;
      const maxLoopsPerView = 8;
      const maxFramesPerLoop = 10;
      const loopByteLength = maxFramesPerLoop * AnimFrameView.byteLength;
      const viewByteLength = 2 + 2*maxLoopsPerView + 2 + maxLoopsPerView*loopByteLength;
      this.endOffset += viewByteLength * this.viewCount;
      return function() {
        var buffer = this.dv.buffer, byteOffset = this.dv.byteOffset;
        var views = new Array(this.viewCount);
        for (var i = 0; i < views.length; i++) {
          var viewOffset = offset + i * viewByteLength;
          var framesOffset = viewOffset + 2 + 2*maxLoopsPerView + 2;
          var loops = new Array(this.dv.getUint16(viewOffset, true));
          for (var j = 0; j < loops.length; j++) {
            var frames = new Array(this.dv.getUint16(viewOffset + 2 + j*2, true));
            for (var k = 0; k < frames.length; k++) {
              frames[k] = new AnimFrameView(
                buffer,
                byteOffset + framesOffset + k * AnimFrameView.byteLength,
                AnimFrameView.byteLength);
            }
            loops[j] = frames;
          }
          views[i] = loops;
        }
      };
    });
    this.member('characters', function() {
      if (this.formatVersion <= 12) {
        var count = this.dv.getInt32(this.endOffset, true);
        this.endOffset += 4;
        var number_count, name_length;
        if (this.formatVersion >= 11) {
          number_count = 241;
          name_length = 30;
        }
        else {
          number_count = 121;
          name_length = 22;
        }
        this.endOffset += count * (4 + 2 * number_count + name_length);
      }
      else if (this.formatVersion <= 19) {
        this.endOffset += 4 * 0x204;
      }
      var buffer = this.bytes.buffer, byteOffset = this.bytes.byteOffset, byteLength = this.bytes.byteLength - this.endOffset;
      var list = new Array(this.characterCount);
      for (var i = 0; i < list.length; i++) {
        var c = list[i] = new CharacterView(buffer, byteOffset + this.endOffset, byteLength);
        c.formatVersion = this.formatVersion;
        this.endOffset += c.byteLength;
        byteLength -= c.byteLength;
      }
      return list;
    });
    this.member('lipSyncFrames', function() {
      if (this.formatVersion < 21) return null;
      const offset = this.endOffset;
      this.endOffset += 50 * 20;
      return function() {
        throw new Error('NYI');
      };
    });
    this.member('globalMessages', function() {
      var list = new Array(1000);
      list[983] = "Sorry, not now.";
      list[984] = "Restore";
      list[985] = "Cancel";
      list[986] = "Select a game to restore:";
      list[987] = "Save";
      list[988] = "Type a name to save as:";
      list[989] = "Replace";
      list[990] = "The save directory is full. You must replace an existing game:";
      list[991] = "Replace:";
      list[992] = "With:";
      list[993] = "Quit";
      list[994] = "Play";
      list[995] = "Are you sure you want to quit?";
      var isMasked = this.formatVersion >= 26;
      for (var i = 500; i < 1000; i++) {
        if (!this.isGlobalMessagePresent(i)) continue;
        else if (isMasked) {
          var len = this.dv.getInt32(this.endOffset, true);
          this.endOffset += 4;
          if (len > 0) {
            list[i] = masked('Avis Durgan', this.bytes, this.endOffset, len);
          }
          this.endOffset += len;
        }
        else {
          var endPos = this.endOffset;
          while (this.bytes[endPos] !== 0) {
            endPos++;
          }
          if (endPos !== this.endOffset) {
            list[i] = util.byteString(this.bytes.subarray(this.endOffset, endPos));
          }
          this.endOffset = endPos + 1;
        }
      }
      return list;
    });
    this.member('dialogs', function() {
      var list = new Array(this.dialogCount);
      var buffer = this.bytes.buffer, byteOffset = this.bytes.byteOffset, byteLength = this.bytes.byteLength;
      for (var i = 0; i < list.length; i++) {
        var dialog = list[i] = new DialogView(buffer, byteOffset + this.endOffset, byteLength - this.endOffset);
        dialog.formatVersion = this.formatVersion;
        this.endOffset += dialog.byteLength;
      }
      if (this.formatVersion <= 37) {
        for (var i = 0; i < list.length; i++) {
          list[i].script = {};
          list[i].script.compiled = this.bytes.subarray(this.endOffset, this.endOffset + list[i].codeSize);
          this.endOffset += list[i].codeSize;
          var compiledLen = this.dv.getInt32(this.endOffset, true);
          list[i].script.source = masked('Avis Durgan', this.bytes, this.endOffset + 4, compiledLen);
          this.endOffset += 4 + compiledLen;
        }
        list.messages = new Array(this.dialogMessageCount);
        if (this.formatVersion > 25) {
          throw new Error('NYI');
        }
        else {
          for (var i = 0; i < list.messages.length; i++) {
            var endPos = this.endOffset;
            while (this.bytes[endPos] !== 0) {
              endPos++;
            }
            if (endPos !== this.endOffset) {
              list.messages[i] = util.byteString(this.bytes.subarray(this.endOffset, endPos));
            }
            this.endOffset = endPos + 1;
          }
        }
      }
      return list;
    });
    if (this.formatVersion >= 9) {
      this.member('guiSignature', member_uint32);
      this.member('guiVersion', function() {
        var version = this.dv.getInt32(this.endOffset, true);
        if (version < 100) return 0;
        this.endOffset += 4;
        return version;
      });
      this.member('interfaceCount', member_uint32);
      this.member('interfaces', function() {
        const offset = this.endOffset;
        this.endOffset += this.interfaceCount * InterfaceView.byteLength;
        return function() {
          var list = new Array(this.interfaceCount);
          var buffer = this.dv.buffer, byteOffset = this.dv.byteOffset + offset;
          for (var i = 0; i < list.length; i++) {
            list[i] = new InterfaceView(
              buffer,
              byteOffset + i * InterfaceView.byteLength,
              InterfaceView.byteLength);
          }
          return list;
        };
      });
      this.member('buttonCount', member_uint32);
      this.member('buttons', function() {
        var list = new Array(this.buttonCount);
        var buffer = this.dv.buffer;
        var byteOffset = this.dv.byteOffset + this.endOffset;
        var byteLength = this.dv.byteLength - this.endOffset;
        for (var i = 0; i < list.length; i++) {
          list[i] = new ButtonView(this.guiVersion, buffer, byteOffset, byteLength);
          byteOffset += list[i].endOffset;
          byteLength -= list[i].endOffset;
          this.endOffset += list[i].endOffset;
        }
        return list;
      });
      this.member('labelCount', member_uint32);
      this.member('labels', function() {
        var list = new Array(this.labelCount);
        var buffer = this.dv.buffer;
        var byteOffset = this.dv.byteOffset + this.endOffset;
        var byteLength = this.dv.byteLength - this.endOffset;
        for (var i = 0; i < list.length; i++) {
          list[i] = new LabelView(this.guiVersion, buffer, byteOffset, byteLength);
          byteOffset += list[i].endOffset;
          byteLength -= list[i].endOffset;
          this.endOffset += list[i].endOffset;
        }
        return list;
      });
    }
  }
  GameView.prototype = {
    member: util.member,
    get hasValidSignature() {
      return this.signature === 'Adventure Creator Game File v2';
    },
    get playerCharacter() {
      return this.characters[this.playerCharacterId];
    },
    get hasValidGuiSignature() {
      return this.guiSignature === 0xcafebeef;
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
    get width() { return this.x2 - this.x1; },
    get height() { return this.y2 - this.y1; },
    get background_color() { return this.dv.getInt32(16, true); },
    get text_color() { return this.dv.getInt32(20, true); },
    get border_color() { return this.dv.getInt32(24, true); },
    get vtextxp() { return this.dv.getInt32(28, true); },
    get vtextyp() { return this.dv.getInt32(32, true); },
    get vtextalign() { return this.dv.getInt32(36, true); },
    get vtext() { return nullTerminated(this.bytes, 40, 40); },
    get buttonCount() { return this.dv.getInt32(80, true); },
    get buttons() {
      var list = new Array(this.buttonCount);
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
      return !!this.dv.getUint8(817);
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
  
  function InterfaceView(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    
    this.endOffset = 0;
    
    function member_byteString(len, nullTerminate) {
      return function() {
        const offset = this.endOffset;
        this.endOffset += len;
        if (nullTerminate) {
          return function() {
            return util.byteString(this.bytes, offset, len).match(/^[^\0]*/)[0];
          };
        }
        else {
          return function() {
            return util.byteString(this.bytes, offset, len);
          };
        }
      };
    }
    
    function member_int32() {
      const offset = this.endOffset;
      this.endOffset += 4;
      return function() {
        return this.dv.getInt32(offset, true);
      };
    }
    
    this.member('vtext', member_byteString(4, true));
    this.member('script_name', member_byteString(16, true));
    this.member('on_click', member_byteString(20, true));
    this.member('x', member_int32);
    this.member('y', member_int32);
    this.member('width', member_int32);
    this.member('height', function() {
      const offset = this.endOffset;
      this.endOffset += 4;
      return function() {
        return Math.max(this.dv.getInt32(offset, true), 2);
      };
    });
    this.member('focus', member_int32);
    this.member('controlCount', member_int32);
    this.member('popup', function() {
      const offset = this.endOffset;
      this.endOffset += 4;
      return function() {
        var value = this.dv.getInt32(offset, true);
        switch (value) {
          default: return value;
          case 0: return 'none';
          case 1: return 'mouseY';
          case 2: return 'script';
          case 3: return 'noAutoRem';
          case 4: return 'noneInitiallyOff';
        }
      };
    });
    this.member('popup_mouse_y', member_int32);
    this.member('background_color', member_int32);
    this.member('background_sprite', member_int32);
    this.member('border_color', member_int32);
    this.member('mouseover', member_int32);
    this.member('mousewasx', member_int32);
    this.member('mousewasy', member_int32);
    this.member('mousedownon', member_int32);
    this.member('highlightobj', member_int32);
    this.member('flags', member_int32);
    this.member('transparency', member_int32);
    this.member('z_order', member_int32);
    this.endOffset += 4; // gui_id: overridden
    this.endOffset += 6 * 4; // reserved int[4]
    this.member('on', member_int32);
    this.endOffset += 30 * 4; // unused
    this.member('getControlInfo', function() {
      const offset = this.endOffset;
      this.endOffset += 30 * 4;
      return function() {
        return function getControlInfo(i) {
          var info = this.dv.getInt32(offset + i*4, true);
          var type = info >>> 16;
          switch (type) {
            case 1: type = 'button'; break;
            case 2: type = 'label'; break;
            case 3: type = 'inventory'; break;
            case 4: type = 'slider'; break;
            case 5: type = 'textBox'; break;
            case 6: type = 'listBox'; break;
          }
          return {
            type: type,
            id: info & 0xffff,
          };
        };
      };
    });
  }
  InterfaceView.prototype = {
    member: util.member,
    get isAlwaysShown() {
      return this.popup === 'noAutoRem';
    },
    get isInitiallyShown() {
      return this.popup === 'none' || this.isAlwaysShown;
    },
    get pausesGameWhileShown() {
      return this.popup === 'script';
    },
    get isClickable() {
      return !(this.flags & 1);
    },
  };
  InterfaceView.byteLength = 4 + 16 + 20 + 4*8 + 4*12 + 4*6 + 4 + 4*30 + 4*30;
  
  var controlProperties = {
    isEnabled: {get:function(){ return !(this.flags & 4);}},
    isVisible: {get:function(){ return !(this.flags & 0x10);}},
    isClickable: {get:function(){ return !(this.flags & 0x40);}},
    isTranslated: {get:function(){ return !!(this.flags & 0x80);}, configurable:true},
    isDeleted: {get:function(){ return !!(this.flags & 0x8000);}},
  };
  
  function init_control(guiVersion, control) {
    function member_int32() {
      const offset = control.endOffset;
      control.endOffset += 4;
      return function() {
        return this.dv.getInt32(offset, true);
      };
    }
    
    control.member('flags', member_int32);
    control.member('x', member_int32);
    control.member('y', member_int32);
    control.member('width', member_int32);
    control.member('height', member_int32);
    control.member('zOrder', member_int32);
    control.member('activated', member_int32);
    
    if (guiVersion >= 106) {
      control.member('scriptName', function() {
        const startPos = this.endOffset;
        while (this.bytes[this.endOffset] !== 0) this.endOffset++;
        const endPos = this.endOffset;
        this.endOffset++;
        return function() {
          return util.byteString(this.bytes.subarray(startPos, endPos));
        };
      });
      
      if (guiVersion >= 108) {
        throw new Error('NYI'); // event handlers
      }
    }
    
    Object.defineProperties(control, controlProperties);
  }
  
  function ButtonView(guiVersion, buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
    
    init_control(guiVersion, this);
    
    // event_handlers[0]: on_click
    
    function member_int32() {
      const offset = this.endOffset;
      this.endOffset += 4;
      return function() {
        return this.dv.getInt32(offset, true);
      };
    }
    
    function member_byteString(len, nullTerminate) {
      return function() {
        const offset = this.endOffset;
        this.endOffset += len;
        if (nullTerminate) {
          return function() {
            return util.byteString(this.bytes, offset, len).match(/^[^\0]*/)[0];
          };
        }
        else {
          return function() {
            return util.byteString(this.bytes, offset, len);
          };
        }
      };
    }
    
    
    this.member('normalSprite', member_int32);
    this.member('mouseOverSprite', member_int32);
    this.member('pushedSprite', member_int32);
    this.endOffset += 4; // usepic: just copies sprite
    this.member('isPushed', member_int32);
    this.member('isOver', member_int32);
    this.member('font', member_int32);
    this.member('textColor', member_int32);
    this.member('leftClick', member_int32);
    this.member('rightClick', member_int32);
    this.member('leftClickData', member_int32);
    this.member('rightClickData', member_int32);
    this.member('text', member_byteString(50));
    if (guiVersion >= 111) {
      this.member('xAlignment', function() {
        const offset = this.endOffset;
        // yAlignment will increase endOffset
        return function() {
          switch (this.dv.getInt32(offset, true)) {
            case 1:
            case 3:
            case 6:
              return 0;
            case 2:
            case 5:
            case 8:
              return 1;
            case 0:
            case 4:
            case 7:
              return 0.5;
            default:
              console.error('unknown button alignment');
              return 0.5;
          }
        };
      });
      this.member('yAlignment', function() {
        const offset = this.endOffset;
        this.endOffset += 4;
        return function() {
          switch (this.dv.getInt32(offset, true)) {
            case 0:
            case 1:
            case 2:
              return 0;
            case 6:
            case 7:
            case 8:
              return 1;
            case 3:
            case 4:
            case 5:
              return 0.5;
            default:
              console.error('unknown button alignment');
              return 0;
          }
        };
      });
      this.endOffset += 4;
    }
    else {
      // top middle
      this.xAlignment = 0.5;
      this.yAlignment = 0;
    }
    
    Object.defineProperties(this, {
      isDefault: {get:function(){ return !!(this.flags & 1);}},
      clipsBackground: {get:function(){ return !!(this.flags & 0x20);}},
      isTranslated: {value:true},
    });
  }
  ButtonView.prototype = {
    member: util.member,
    endOffset: 0,
  };
  
  function LabelView(guiVersion, buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
    
    init_control(guiVersion, this);
    
    function member_int32() {
      const offset = this.endOffset;
      this.endOffset += 4;
      return function() {
        return this.dv.getInt32(offset, true);
      };
    }
    
    function member_byteString(len, nullTerminate) {
      if (len === true) {
        return function() {
          const startPos = this.endOffset;
          while (this.bytes[this.endOffset] === 0) ++this.endOffset;
          const endPos = this.endOffset;
          this.endOffset = endPos + 1;
          return function() {
            return util.byteString(this.bytes.subarray(startPos, endPos));
          };
        };
      }
      return function() {
        const offset = this.endOffset;
        this.endOffset += len;
        if (nullTerminate) {
          return function() {
            return util.byteString(this.bytes, offset, len).match(/^[^\0]*/)[0];
          };
        }
        else {
          return function() {
            return util.byteString(this.bytes, offset, len);
          };
        }
      };
    }
    
    if (guiVersion >= 113) {
      this.member('text', member_byteString(true));
    }
    else {
      this.member('text', member_byteString(200, true));
    }
    this.member('font', member_int32);
    this.member('textColor', member_int32);
    this.member('xAlignment', function() {
      const offset = this.endOffset;
      this.endOffset += 4;
      return function() {
        switch (this.dv.getInt32(offset, true)) {
          case 0: return 0;
          case 1: return 1;
          case 2: return 0.5;
          default:
            console.error('unknown label alignment value');
            return 0;
        }
      };
    });
    
    Object.defineProperty(this, 'isTranslated', {value:true});
  }
  LabelView.prototype = {
    member: util.member,
    endOffset: 0,
    yAlignment: 0,
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
