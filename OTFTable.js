
function OTFTable(name, byteLength) {
  this.name = (name + '    ').slice(0, 4);
  this.buffer = new ArrayBuffer((byteLength + 3) & ~3);
  this.byteOffset = 0;
  this.byteLength = byteLength;
}
OTFTable.prototype = {
  getChecksum: function() {
    var checksum = 0;
    var dv = new DataView(this.buffer);
    for (var i = 0; i < dv.byteLength; i += 4) {
      checksum = (checksum + dv.getUint32(i, false)) >>> 0;
    }
    return checksum;
  },
};
OTFTable.joinToBlob = function(tables) {
  tables = tables.slice().sort(function(a, b) {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });
  var fileHeader = new DataView(new ArrayBuffer(12 + tables.length * 16));
  var searchRange = Math.floor(Math.log2(tables.length));
  fileHeader.setUint32(0, 0x4F54544F /* OTTO */, false);
  fileHeader.setUint16(4, tables.length, false);
  fileHeader.setUint16(6, Math.pow(2, searchRange) * 16, false);
  fileHeader.setUint16(8, searchRange, false);
  fileHeader.setUint16(10, tables.length * 16 - searchRange, false);
  var headerOffset = 12, bodyOffset = fileHeader.byteLength;
  var parts = [fileHeader];
  var masterChecksum = 0, fontHeader;
  for (var i = 0; i < tables.length; i++) {
    var table = tables[i];
    if (table instanceof OTFTable.FontHeader) fontHeader = table;
    var tableChecksum = table.getChecksum();
    masterChecksum = (masterChecksum + tableChecksum) >>> 0;
    fileHeader.setUint8(headerOffset + 0, table.name.charCodeAt(0));
    fileHeader.setUint8(headerOffset + 1, table.name.charCodeAt(1));
    fileHeader.setUint8(headerOffset + 2, table.name.charCodeAt(2));
    fileHeader.setUint8(headerOffset + 3, table.name.charCodeAt(3));
    fileHeader.setUint32(headerOffset + 4, tableChecksum, false);
    fileHeader.setUint32(headerOffset + 8, bodyOffset, false);
    fileHeader.setUint32(headerOffset + 12, table.byteLength, false);
    parts.push(table.buffer);
    headerOffset += 16;
    bodyOffset += table.buffer.byteLength;
  }
  masterChecksum = (masterChecksum + OTFTable.prototype.getChecksum.apply(fileHeader)) >>> 0;
  masterChecksum = (0xB1B0AFBA - masterChecksum) >>> 0;
  if (fontHeader) {
    fontHeader.masterChecksum.setUint32(0, masterChecksum, false);
  }
  return new Blob(parts, {type: 'application/font-sfnt'});
};

OTFTable.CharacterGlyphMap = function OTFCharacterGlyphMap(map) {
  var k = Object.keys(map).sort(function(a, b) {
    return a - b;
  });
  var entries = [];
  for (var i = 0; i < k.length; i++) {
    var entry = {start:k[i], end:k[i], glyph:map[k[i]]};
    while (k[i]+1 === k[i+1] && map[k[i]+1] === map[k[i+1]]) {
      entry.end++;
      i++;
    }
    entries.push(entry);
  }
  OTFTable.call(this, 'cmap', 4 + 8 + 16 + entries.length * 12);
  var dv = new DataView(this.buffer);
  dv.setUint16(2, 1, false); // encoding table count
  dv.setUint16(6, 6, false); // unicode full repertoire
  dv.setUint32(8, 12, false); // offset to next byte:
  dv.setUint16(12, 12, false); // segmented coverage
  dv.setUint32(16, 16 + entries.length * 12, false);
  dv.setUint32(24, entries.length, false);
  var offset = 28;
  for (var i = 0; i < entries.length; i++) {
    dv.setUint32(offset    , entries[i].start, false);
    dv.setUint32(offset + 4, entries[i].end,   false);
    dv.setUint32(offset + 8, entries[i].glyph, false);
    offset += 12;
  }
};
OTFTable.CharacterGlyphMap.prototype = Object.create(OTFTable.prototype);

OTFTable.FontHeader = function OTFFontHeader(info) {
  OTFTable.call(this, 'head', 54);
  var dv = new DataView(this.buffer);
  // <https://www.microsoft.com/typography/otspec/head.htm>
  dv.setUint16(0, 1, false);
  // 4: font revision as Fixed
  this.masterChecksum = new DataView(this.buffer, 8, 4);
  dv.setUint32(12, 0x5F0F3CF5, false); // magic number
  dv.setUint16(16, info.flags || 0, false);
  dv.setUint16(18, info.unitsPerEm, false); // 16 to 16384
  var created = info.createdAt || new Date;
  var modified = info.modifiedAt || created;
  dv.setUint32(24, (created - Date.UTC(4, 0)) / 1000, false);
  dv.setUint32(32, (modified - Date.UTC(4, 0)) / 1000, false);
  dv.setInt16(36, info.xMin, false);
  dv.setInt16(38, info.yMin, false);
  dv.setInt16(40, info.xMax, false);
  dv.setInt16(42, info.yMax, false);
  dv.setUint16(44, info.macStyle || 0, false);
  dv.setUint16(46, info.smallestReadablePixelSize, false);
  dv.setInt16(48, 2, false); // deprecated font direction hint
  dv.setInt16(50, !!info.longOffsets, false);
};
OTFTable.FontHeader.prototype = Object.create(OTFTable.prototype);

OTFTable.HorizontalHeader = function OTFHorizontalHeader(info) {
  OTFTable.call(this, 'hhea', 36);
  var dv = new DataView(this.buffer);
  // <https://www.microsoft.com/typography/otspec/hhea.htm>
  dv.setUint16(0, 1, false);
  dv.setInt16(4, info.ascender, false);
  dv.setInt16(6, info.descender, false);
  dv.setInt16(8, info.lineGap, false);
  dv.setUint16(10, info.advanceWidthMax, false);
  dv.setInt16(12, info.minLeftSideBearing, false);
  dv.setInt16(14, info.minRightSideBearing, false);
  dv.setInt16(16, info.xMaxExtent, false);
  dv.setInt16(18, info.caretSlopeRise, false);
  dv.setInt16(20, info.caretSlopeRun, false);
  dv.setInt16(22, info.caretOffset, false);
  dv.setInt16(34, info.glyphs.length, false);
};
OTFTable.HorizontalHeader.prototype = Object.create(OTFTable.prototype);

OTFTable.HorizontalMetrics = function OTFHorizontalMetrics(info) {
  OTFTable.call(this, 'hmtx', info.glyphs.length * 4);
  var dv = new DataView(this.buffer);
  // <https://www.microsoft.com/typography/otspec/hmtx.htm>
  for (var i = 0; i < info.glyphs.length; i++) {
    dv.setUint16(i*4, info.glyphs[i].advanceWidth, false);
    dv.setInt16(i*4 + 2, info.glyphs[i].leftSideBearing, false);
  }
};
OTFTable.HorizontalMetrics.prototype = Object.create(OTFTable.prototype);

OTFTable.MaximumProfile = function OTFMaximumProfile(info) {
  OTFTable.call(this, 'maxp', 6);
  var dv = new DataView(this.buffer);
  // <https://www.microsoft.com/typography/otspec/maxp.htm>
  dv.setUint32(0, 0x00005000, false); // format v0.5
  dv.setUint16(4, info.glyphs.length, false);
};
OTFTable.MaximumProfile.prototype = Object.create(OTFTable.prototype);

const encoder = ('TextEncoder' in self) ? new TextEncoder('utf-8') : {
  encode: function(str) {
    str = encodeURIComponent(str).replace(/%([0-9a-f]{2})/gi, function(_, c) {
      return String.fromCharCode(parseInt(c, 16));
    });
    var bytes = new Uint8Array(str.length);
    for (var i = 0; i < bytes.length; i++) {
      bytes[i] = str.charCodeAt(i);
    }
    return bytes;
  },
};

OTFTable.Naming = function OTFNamingTable(info) {
  var strings = info.strings.slice().sort(function(a, b) {
    return (a.platformId - b.platformId)
        || (a.encodingId - b.encodingId)
        || (a.languageId - b.languageId)
        || (a.nameId - b.nameId);
  });
  var storage = [];
  var offset = 0;
  for (var i = 0; i < strings.length; i++) {
    var data = encoder.encode(strings[i].text);
    data.offset = offset;
    offset += data.length;
    storage.push(data);
  }
  OTFTable.call(this, 'name', 6 + storage.length * 12 + offset);
  var dv = new DataView(this.buffer);
  var bytes = new Uint8Array(this.buffer);
  dv.setUint16(2, storage.length, false);
  dv.setUint16(4, 6 + storage.length * 12, false);
  for (var i = 0; i < strings.length; i++) {
    dv.setUint16(6 + i*8 + 0, strings[i].platformId, false);
    dv.setUint16(6 + i*8 + 2, strings[i].platformId, false);
    dv.setUint16(6 + i*8 + 4, strings[i].languageId, false);
    dv.setUint16(6 + i*8 + 6, storage[i].length, false);
    bytes.set(storage[i], storage[i].offset);
  }
};
OTFTable.Naming.prototype = Object.create(OTFTable.prototype);

OTFTable.MetricsForOS2 = function OTFMetricsForOS2(info) {
  OTFTable.call(this, 'OS/2', 98);
  var dv = new DataView(this.buffer);
  dv.setUint16(0, 5, false);
  dv.setInt16(2, info.xAvgCharWidth, false);
  dv.setUint16(4, info.usWeightClass, false);
  dv.setUint16(6, info.usWidthClass, false);
  dv.setUint16(8, info.fsType, false);
  dv.setInt16(10, info.ySubscriptXSize, false);
  dv.setInt16(12, info.ySubscriptYSize, false);
  dv.setInt16(14, info.ySubscriptXOffset, false);
  dv.setInt16(16, info.ySubscriptYOffset, false);
  dv.setInt16(18, info.ySuperscriptXSize, false);
  dv.setInt16(20, info.ySuperscriptYSize, false);
  dv.setInt16(22, info.ySuperscriptXOffset, false);
  dv.setInt16(24, info.ySuperscriptYOffset, false);
  dv.setInt16(26, info.yStrikeoutSize, false);
  dv.setInt16(28, info.yStrikeoutPosition, false);
  dv.setInt16(30, info.sFamilyClass, false);
  dv.setUint8(32, info.bFamilyType);
  dv.setUint8(33, info.bSerifStyle);
  dv.setUint8(34, info.bWeight);
  dv.setUint8(35, info.bProportion);
  dv.setUint8(36, info.bContrast);
  dv.setUint8(37, info.bStrokeVariation);
  dv.setUint8(38, info.bArmStyle);
  dv.setUint8(39, info.bLetterform);
  dv.setUint8(40, info.bMidline);
  dv.setUint8(41, info.bXHeight);
  dv.setUint32(42, info.ulUnicodeRange1, false);
  dv.setUint32(46, info.ulUnicodeRange2, false);
  dv.setUint32(50, info.ulUnicodeRange3, false);
  dv.setUint32(54, info.ulUnicodeRange4, false);
  dv.setUint8(58, info.vendor4CC.charCodeAt(0));
  dv.setUint8(59, info.vendor4CC.charCodeAt(1));
  dv.setUint8(60, info.vendor4CC.charCodeAt(2));
  dv.setUint8(61, info.vendor4CC.charCodeAt(3));
  dv.setUint16(62, info.fsSelection, false);
  dv.setUint16(64, info.usFirstCharIndex, false);
  dv.setUint16(66, info.usLastCharIndex, false);
  dv.setInt16(68, info.sTypoAscender, false);
  dv.setInt16(70, info.sTypoDescender, false);
  dv.setInt16(72, info.sTypoLineGap, false);
  dv.setUint16(74, info.usWinAscent, false);
  dv.setUint16(76, info.usWinDescent, false);
  dv.setUint32(78, info.ulCodePageRange1, false);
  dv.setUint32(82, info.ulCodePageRange2, false);
  dv.setInt16(86, info.sxHeight, false);
  dv.setInt16(88, info.sCapHeight, false);
  dv.setUint16(90, info.usDefaultChar, false);
  dv.setUint16(92, info.usMaxContext, false);
  dv.setUint16(94, info.usLowerOpticalPointSize, false);
  dv.setUint16(96, info.usUpperOpticalPointSize, false);
};
OTFTable.MetricsForOS2.prototype = Object.create(OTFTable.prototype);

OTFTable.PostScript = function OTFPostScript(info) {
  OTFTable.call(this, 'post', 32);
  var dv = new DataView(this.buffer);
  // <https://www.microsoft.com/typography/otspec/post.htm>
  dv.setUint32(0, 0x00030000, false);
  dv.setUint32(4, info.italicAngle || 0, false); // fixed
  dv.setInt16(8, info.underlinePosition, false);
  dv.setInt16(10, info.underlineThickness, false);
  dv.setUint32(12, !!info.isMonospace, false);
};
OTFTable.PostScript.prototype = Object.create(OTFTable.prototype);

const charStringOpcodes = {
  hstem: 0x01,
  vstem: 0x03,
  vmoveto: 0x04,
  rlineto: 0x05,
  hlineto: 0x06,
  vlineto: 0x07,
  rrcurveto: 0x08,
  callsubr: 0x0a,
  vsindex: 0x0f,
  blend: 0x10,
  hstemhm: 0x12,
  hintmask: 0x13,
  cntrmask: 0x14,
  rmoveto: 0x15,
  hmoveto: 0x16,
  vstemhm: 0x17,
  rcurveline: 0x18,
  rlinecurve: 0x19,
  vvcurveto: 0x1a,
  hhcurveto: 0x1b,
  callgsubr: 0x1c,
  vhcurveto: 0x1e,
  hvcurveto: 0x1f,
  hflex: 0x0c22,
  flex: 0x0c23,
  hflex1: 0x0c24,
  flex1: 0x0c25,
};

OTFTable.encodeCharString = function encodeCharString(sExpr) {
  var output = [];
  function encNumber(n) {
    if (n !== n|0) {
      output.push(255, (n >>> 8) & 0xff, n & 0xff, (n * 0x100) & 0xff, (n * 0x10000) & 0xff);
    }
    else if (n >= -107 && n <= 107) {
      output.push(n + 139);
    }
    else if (n >= 108 && n <= 1131) {
      n -= 108;
      output.push(247 + (n >> 8), n & 0xff);
    }
    else if (n >= -1131 && n <= -108) {
      n = -n - 108;
      output.push(251 + (n >> 8), n & 0xff);
    }
    else if (n >= -32768 && n <= 32767) {
      output.push(28, (n >> 8) & 0xff, n & 0xff);
    }
    else {
      throw new Error('out of range');
    }
  }
  function encOp(op) {
    for (var i = 1; i < op.length; i++) {
      if (typeof op[i] === 'number') {
        encNumber(op[i]);
      }
      else encOp(op[i]);
    }
    if (!(op[0] in charStringOpcodes)) {
      throw new Error('invalid op: ' + op[0]);
    }
    var opcode = opcodes[op[0]];
    if (opcode >= 0x100) {
      output.push(opcode >>> 8, opcode & 0xff);
    }
    else {
      output.push(opcode);
    }
  }
  for (var i = 0; i < sExpr.length; i++) {
    encOp(sExpr[i]);
  }
  return new Uint8Array(output);
};

const dictOpcodes = {
  BlueValues: 0x06,
  OtherBlues: 0x07,
  FamilyBlues: 0x08,
  FamilyOtherBlues: 0x09,
  StdHW: 0x0a,
  StdVW: 0x0b,
  CharStrings: 0x11,
  Private: 0x12,
  Subrs: 0x13,
  vsindex: 0x16,
  blend: 0x17,
  vstore: 0x18,
  BCD: 0x1e,
  FontMatrix: 0x0c07,
  BlueScale: 0x0c09,
  BlueShift: 0x0c0a,
  BlueFuzz: 0x0c0b,
  StemSnapH: 0x0c0c,
  StemSnapV: 0x0c0d,
  LanguageGroup: 0x0c11,
  ExpansionFactor: 0x0c12,
  FDArray: 0x0c24,
  FDSelect: 0x0c25,
};

OTFTable.encodeDict = function encodeDict(sExpr) {
  var output = [];
  var placeholders = Object.create(null);
  
  function encNumber(n) {
    if (n !== (n|0)) {
      n = n.toString().replace(/e-/i, 'c')
        .replace(/e\+?/i, 'b')
        .replace(/^-/, 'e')
        .replace('.', 'a');
      n += (n.length % 2) ? 'f' : 'ff';
      output.push(30);
      for (var i = 0; i < n.length; i += 2) {
        output.push(parseInt(n.slice(i, i+2), 16));
      }
    }
    else if (n >= -107 && n <= 107) {
      output.push(n + 139);
    }
    else if (n >= 108 && n <= 1131) {
      n -= 108;
      output.push(247 + (n >> 8), n & 0xff);
    }
    else if (n >= -1131 && n <= -108) {
      n = -n - 108;
      output.push(251 + (n >> 8), n & 0xff);
    }
    else if (n >= -32768 && n <= 32767) {
      output.push(28, (n >> 8) & 0xff, n & 0xff);
    }
    else {
      output.push(29, (n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff);
    }
  }

  function encOp(op) {
    if (op[0] === '@') {
      placeholders[op[1]] = output.push(29);
      output.push(0, 0, 0, 0);
      return;
    }
    for (var i = 1; i < op.length; i++) {
      if (typeof op[i] === 'number') {
        encodeNumber(op[i]);
      }
      else {
        encOp(op[i]);
      }
    }
    if (!(op[0] in dictOpcodes)) {
      throw new Error('unknown opcode ' + op[0]);
    }
    var opcode = dictOpcodes[op[0]];
    if (opcode >= 0x100) {
      output.push(opcode >> 8, opcode & 0xff);
    }
    else {
      output.push(opcode);
    }
  }

  for (var i = 0; i < sExpr.length; i++) {
    encOp(sExpr[i]);
  }
  
  output = new Uint8Array(output);
  for (var placeholder in placeholders) {
    output[placeholder] = new DataView(
      output.buffer,
      output.byteOffset + placeholders[placeholder],
      4);
  }
  return output;
};

OTFTable.encodeIndex = function(byteArrays) {
  if (byteArrays.length === 0) return new Uint8Array(4);
  var totalSize = 0;
  for (var i = 0; i < byteArrays.length; i++) {
    totalSize += byteArrays[i].length;
  }
  var endOffset = totalSize + 1;
  var offSize = (endOffset < 0x100) ? 1
              : (endOffset < 0x10000) ? 2
              : (endOffset < 0x1000000) ? 3
              : 4;
  var bytes = new Uint8Array(5 + offSize * (byteArrays.length + 1) + totalSize);
  var dv = new DataView(bytes.buffer);
  dv.setUint32(0, byteArrays.length, false);
  bytes[4] = offSize;
  var base = 5 + offSize * (byteArrays.length + 1) - 1;
  var offset = 1;
  switch (offSize) {
    case 1:
      for (var i = 0; i < byteArrays.length; i++) {
        bytes[5 + i] = offset;
        bytes.set(byteArrays[i], base + offset);
        offset += byteArrays[i].length;
      }
      bytes[5 + byteArrays.length] = offset;
      break;
    case 2:
      for (var i = 0; i < byteArrays.length; i++) {
        dv.setUint16(5 + 2*i, offset, false);
        bytes.set(byteArrays[i], base + offset);
        offset += byteArrays[i].length;
      }
      dv.setUint16(5 + 2*byteArrays.length, offset, false);
      break;
    case 3:
      for (var i = 0; i < byteArrays.length; i++) {
        dv.setUint32(5 + 3*i, (offset << 8), false);
        bytes.set(byteArrays[i], base + offset);
        offset += byteArrays[i].length;
      }
      bytes[5 + 3*byteArrays.length] = (offset >>> 16) & 0xff;
      dv.setUint16(5 + 3*byteArrays.length + 1, offset & 0xffff, false);
      break;
    case 4:
      for (var i = 0; i < byteArrays.length; i++) {
        dv.setUint32(5 + 4*i, offset, false);
        bytes.set(byteArrays[i], base + offset);
        offset += byteArrays[i].length;
      }
      dv.setUint32(5 + 4*byteArrays.length, offset, false);
      break;
  }
  return bytes;
};

OTFTable.CompactFontFormat2 = function OTFCompactFontFormat2(info) {
  var topDict = OTFTable.encodeDict([
    ['FontMatrix', 1/info.unitsPerEm, 0, 0, 1/info.unitsPerEm, 0, 0],
    ['FDArray', ['@','fontDictsAt']],
    ['CharStrings', ['@','charStringsAt']],
  ]);
  topDict.offset = 5;

  var globalSubrIndex = OTFTable.encodeIndex([ ]);
  globalSubrIndex.offset = topDict.offset + topDict.byteLength;

  var privateDict = OTFTable.encodeDict([ ]);
  privateDict.offset = globalSubrIndex.offset + globalSubrIndex.byteLength;

  var fontDictIndex = OTFTable.encodeIndex([
    OTFTable.encodeDict([
      ['Private', privateDict.byteLength, privateDict.offset],
    ]),
  ]);
  fontDictIndex.offset = privateDict.offset + privateDict.byteLength;
  topDict.fontDictsAt.setUint32(0, fontDictIndex.offset, false);

  var charStringIndex = OTFTable.encodeIndex(
    info.glyphs.map(function(glyph) {
      return OTFTable.encodeCharString(glyph.charString);
    })
  );
  charStringIndex.offset = fontDictIndex.offset + fontDictIndex.byteLength;
  topDict.charStringsAt.setUint32(0, charStringIndex.offset, false);

  OTFTable.call(this, 'CFF2', charStringIndex.offset + charStringIndex.byteLength);
  var bytes = new Uint8Array(this.buffer);
  var dv = new DataView(this.buffer);

  bytes[0] = 2; // major version
  bytes[2] = topDict.offset;
  dv.setUint16(3, topDict.byteLength, false);
  bytes.set(topDict, topDict.offset);
  bytes.set(globalSubrIndex, globalSubrIndex.offset);
  bytes.set(privateDict, privateDict.offset);
  bytes.set(fontDictIndex, fontDictIndex.offset);
  bytes.set(charStringIndex, charStringIndex.offset);
};
OTFTable.CompactFontFormat2.prototype = Object.create(OTFTable.prototype);
