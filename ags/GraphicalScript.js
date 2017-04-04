define(['./util'], function(util) {

  'use strict';
  
  function GraphicalScript(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }
  GraphicalScript.prototype = {
    get formatVersion() {
      return this.dv.getInt32(0, true);
    },
    get varNames() {
      var list = new Array(this.dv.getInt32(4, true));
      var pos = 8;
      for (var i = 0; i < list.length; i++) {
        var name = util.byteString(this.bytes, pos+1, this.bytes[pos]);
        list[i] = name;
        pos += 1 + name.length;
      }
      list.endOffset = pos;
      Object.defineProperty(this, 'varNames', {value:list, enumerable:true});
      return list;
    },
    get functions() {
      var list = [];
      var pos = this.varNames.endOffset;
      while (pos < this.bytes.length) {
        var number = this.dv.getInt32(pos, true);
        if (number === -1) break;
        var len = 8 + this.dv.getInt32(pos + 4, true);
        list.push(new GraphicalFunction(
          this.bytes.buffer,
          this.bytes.byteOffset + pos,
          len));
        pos += len;
      }
      Object.defineProperty(this, 'functions', {value:list, enumerable:true});
      return list;
    },
    instantiate: function(runtime) {
      if (!('graphicalTimerRemaining' in runtime)) {
        runtime.graphicalTimerRemaining = 0;
        runtime.graphicalTimerUpdate = null;
      }
      return new GraphicalScriptInstance(runtime, this);
    },
  };
  
  function GraphicalFunction(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  GraphicalFunction.prototype = {
    get number() {
      return this.dv.getInt32(0, true);
    },
    get bodyLength() {
      return this.dv.getInt32(4, true);
    },
    get formatVersion() {
      return this.dv.getInt32(8, true);
    },
    get blockSize() {
      return this.dv.getInt32(12, true);
    },
    get blocks() {
      var list = new Array(this.dv.getInt32(16, true));
      var pos = 20;
      for (var i = 0; i < list.length; i++) {
        var block = new Array(this.dv.getInt32(pos, true));
        for (var j = 0; j < block.length; j++) {
          block[j] = new GraphicalAction(
            this.dv.buffer,
            this.dv.byteOffset + pos + 4 + 25 * j,
            25);
        }
        list[i] = block;
        pos += this.blockSize;
      }
      Object.defineProperty(this, 'blocks', {value:list, enumerable:true});
      return list;
    },
  };
  
  function GraphicalAction(buffer, byteOffset, byteLength) {
    this.dv = new DataView(buffer, byteOffset, byteLength);
  }
  GraphicalAction.prototype = {
    get type() {
      return this.dv.getInt32(0, true);
    },
    get unknown1() {
      return this.dv.getUint8(4); // 1 for conditional, 2 for normal?
    },
    get data1() {
      return this.dv.getInt32(5, true);
    },
    get data2() {
      return this.dv.getInt32(9, true);
    },
    get unknown2() {
      return this.dv.getInt32(13, true);
    },
    get thenGoToBlock() {
      return this.dv.getInt32(17, true);
    },
    get unknown3() {
      return this.dv.getInt32(21, true);
    },
  };
    
  function GraphicalScriptInstance(runtime, def) {
    this.runtime = runtime;
    this.def = def;
    this.vars = new Int32Array(def.varNames.length);
    this.exports = {};
    for (var i = 0; i < this.def.functions.length; i++) {
      var func = this.def.functions[i];
      this[func.number] = func;
      this.exports['$' + func.number] = this.run.bind(this, func.number);
    }
  }
  GraphicalScriptInstance.prototype = {
    getVar: function(number) {
      if (number >= 100) return this.runtime.gs_globals[number - 100];
      return this.vars[number];
    },
    setVar: function(number, value) {
      if (number >= 100) this.runtime.gs_globals[number - 100] = value;
      else this.vars[number] = value;
    },
    run: function(funcNumber) {
      var self = this;
      var runtime = this.runtime;
      var func = this[funcNumber];
      var block = func.blocks[0];
      var blockStack = [];
      var posStack = [];
      var pos = 0;
      function enterBlock(n) {
        blockStack.push(block);
        posStack.push(pos);
        block = func.blocks[n];
        pos = 0;
      }
      function nextStep() {
        codeLoop: for (;;) {
          while (pos >= block.length) {
            if (blockStack.length === 0) return;
            block = blockStack.pop();
            pos = posStack.pop();
          }
          var action = block[pos++];
          var result;
          switch (action.type) {
            case 0: continue codeLoop;
            case 1: result = runtime.NewRoom(action.data1); break;
            case 2: result = runtime.GiveScore(action.data1); break;
            case 3: result = runtime.StopMoving(runtime.GetPlayerCharacter()); break;
            case 4:
              console.error('NYI: player dies (on_event text script)');
              continue codeLoop;
            case 5: result = runtime.PlayAnimation(action.data1); break;
            case 6: result = runtime.DisplayMessage(action.data1); break;
            case 7: result = runtime.ObjectOff(action.data1); break;
            case 8: result = runtime.RunDialog(action.data1); break;
            case 9: result = runtime.AddInventory(action.data1); break;
            case 10:
              if (typeof runtime.gscript_request !== 'function') {
                continue codeLoop;
              }
              result = runtime.gscript_request(action.data1);
              break;
            case 11: self.setVar(action.data1, 1); continue codeLoop;
            case 12: self.setVar(action.data1, 0); continue codeLoop;
            case 13: return;
            case 14:
              if (!self.getVar(action.data1)) {
                enterBlock(action.thenGoToBlock);
              }
              continue codeLoop;
            case 15:
              if (self.getVar(action.data1)) {
                enterBlock(action.thenGoToBlock);
              }
              continue codeLoop;
            case 16: result = runtime.PlaySound(action.data1); break;
            case 17: result = runtime.PlayFlic(action.data1, action.data2); break;
            case 18: result = runtime.ObjectOn(action.data1); break;
            case 19:
              if (runtime.player.hasInventoryItem(action.data1)) {
                enterBlock(action.thenGoToBlock);
              }
              continue codeLoop;
            case 20: result = runtime.LoseInventory(action.data1); break;
            case 21:
              if (runtime.onNthLoop(action.data1)) {
                enterBlock(action.thenGoToBlock);
              }
              continue codeLoop;
            case 22:
              if (((Math.random() * action.data1) | 0) === 0) {
                enterBlock(action.thenGoToBlock);
              }
              continue codeLoop;
            case 23:
              runtime.graphicalTimerRemaining = action.data1;
              if (!runtime.graphicalTimerUpdate) {
                runtime.eventTarget.addEventListener('update', runtime.graphicalTimerUpdate = function timer_update() {
                  if (--runtime.graphicalTimerRemaining <= 0) {
                    runtime.eventTarget.removeEventListener('update', timer_update);
                    runtime.graphicalTimerUpdate = null;
                  }
                });
              }
              continue codeLoop;
            case 24:
              if (runtime.graphicalTimerRemaining <= 0) {
                enterBlock(action.thenGoToBlock);
              }
              continue codeLoop;
            case 25:
              console.error('NYI: move_character_to_object');
              continue codeLoop;
            case 26:
              console.warn('activeInventory check');
              if (runtime.player.activeInventory == action.data1) {
                enterBlock(action.thenGoToBlock);
              }
              continue codeLoop;
            default:
              console.error('unknown graphical script action: ' + block[pos - 1]);
              continue codeLoop;
          }
          if (result instanceof Promise) return result.then(nextStep);
        }
      }
      return nextStep();
    },
  };
  
  GraphicalScript.Function = GraphicalFunction;
  GraphicalScript.Action = GraphicalAction;
  GraphicalScript.Instance = GraphicalScriptInstance;
  
  return GraphicalScript;

});
