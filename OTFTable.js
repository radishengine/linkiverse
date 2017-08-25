
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
  var headerOffset = 12, bodyOffset = header.byteLength;
  parts = [header];
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
