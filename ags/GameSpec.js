define(['specify'], function() {
  
  'use strict';
  
  return specify({littleEndian: true})
    .$magic('Adventure Creator Game File v2')
    .$u32('formatVersion')
    .$if('formatVersion', '>=', 12)
      .$u32('engineVersion.length')
      .$str('engineVersion')
    .$endif()
    .$if('formatVersion', '>=', 13)
    .$else()
      .$str('title', null, 50)
      .$u8('paletteUses[256]')
      .$u8('palette['+256*4+']')
      .$skip(2)
      .$if('formatVersion', '>=' 9)
        .$skip(VintageGUI.byteLength * 10)
        .$skip(4)
      .$else()
        .$(VintageGUI, 'guis[10]')
        .$u32('guis.length')
      .$endif()
      .$u32('views.length')
      .$(Cursor, 10)
      .$skip(4)
      .$u32('characters.length')
      .$skip(4)
      .$(EventBlock, 'characters[0..50].eventBlock')
      .$(EventBlock, 'inventoryItems[0..100].eventBlock')
      .$skip(4)
      .$u32('playerCharacterId')
      .$u8('spriteFlags[2100]')
      .$u32('totalScore')
      .$u32('inventoryItems.length')
      .$(InventoryItem, 'inventoryItems[100]')
      .$u32('dialogs.length')
      .$u32('dialogScript.messages.length')
      .$u32('fonts.length')
      .$u32('colorDepth', 'targetWin', 'dialogBulletSprite')
      .$i16('hotDot', 'hotDotOuter')
      .$i32('uniqueInt32')
      .$skip(4 * 2)
      .$i16('languageCodes.length')
      .$str('languageCodes[5]', 3, null)
      .$skip(3)
      .$b32('messagesPresent[500]')
      .$if('formatVersion', '>=', 6)
        .$u8('fonts[0..10].flags')
        .$u8('fonts[0..10].outline')
        .$u32('guis.length')
        .$b32('hasDictionary')
      .$endif()
    .$endif()
    .$if('hasDictionary')
      .$u32('dictionary.length')
      .$(specify()
          .$u32('word.length')
          .$u8('word[]')
          .$modify('word', avisDurgan)
          .$i16('id')
          .createType('DictionaryEntry'),
        'dictionary[]')
      .$delete('hasDictionary')
    .$endif()
    .$if('formatVersion', '>=', 13)
      .$u32('script.source.length')
      .$u8('script.source[]')
      .$modify('script.source', avisDurgan)
    .$endif()
    .$if('formatVersion', '>=', 11)
      .$(ScomScript, 'script')
    .$else()
      .$(SeeRScript, 'script') // has length prefix?
    .$endif()
    .$if('formatVersion', '>=', 31)
      .$if('formatVersion', '>=', 38)
        .$(ScomScript, 'dialogScript')
      .$endif()
      .$u32('moduleScripts.length')
      .$(ScomScript, 'moduleScripts[]')
    .$endif()
    .$if('formatVersion', '>=', 13)
    .$else()
      .$(specify()
          .$u16('loops.length')
          .$u16('loops[0..8].frames.length')
          .$skip(2)
          .$(specify()
              .$i32('spriteNumber')
              .$i16('offsetX', 'offsetY', 'delayFrames')
              .$i32('flags', 'soundNumber')
            .createType('AnimFrame'),
            'loops[0..8].frames[10]')
        .createType('AnimView'),
        'views[]')
    .$endif()
    .$if('formatVersion', '<=', 12)
      .$u32('_TEMP')
      .$delete('_TEMP')
    .$elseif('formatVersion', '<=', 19)
      .$skip(4 * 0x204)
    .$endif()
    .$(CharacterSpec, 'characters[]')
    .$if('formatVersion', '>=', 21)
      // lip sync frames
    .$endif()
    // global messages
    .$(DialogSpec, 'dialogs[]')
    .$if('formatVersion', '<=', 37)
      .$(VintageDialogScript, 'dialogScript')
    .$endif()
    .$if('formatVersion', '>=', 9)
      .$magic32(0xcafebeef)
      // gui
    .$endif()
  .createType('GameSpec');

});
