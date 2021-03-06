define(function() {
  
  'use strict';

  function getStored(objectStore, key) {
    return new Promise(function(resolve, reject) {
      var retrieving = objectStore.get(key);
      retrieving.onerror = function() {
        reject('db error');
      };
      retrieving.onsuccess = function(e) {
        resolve(e.target.result);
      };
    });
  }

  function deleteStored(objectStore, key) {
    return new Promise(function(resolve, reject) {
      var retrieving = objectStore.delete(key);
      retrieving.onerror = function() {
        reject('db error');
      };
      retrieving.onsuccess = function(e) {
        resolve(e.target.result);
      };
    });
  }

  function eachStored(objectStore, keyRange, dir, cb) {
    if (arguments.length === 3) {
      cb = arguments[2];
      dir = 'next';
    }
    return new Promise(function(resolve, reject) {
      var cursorizing = objectState.openCursor(keyRange);
      cursorizing.onerror = function() {
        reject('db error');
      };
      cursorizing.onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor && cb(cursor.value) !== false) {
          cursor.continue();
          return;
        }
        resolve();
      };
    });
  }

  function getAllStored(storeOrIndex, keyRange, count) {
    return new Promise(function(resolve, reject) {
      var retrieving = storeOrIndex.getAll(keyRange, count);
      retrieving.onerror = function() {
        reject('db error');
      };
      retrieving.onsuccess = function(e) {
        resolve(e.target.result);
      };
    });
  }

  function readXmlBlob(blob) {
    return new Promise(function(resolve, reject) {
      var fr = new FileReader();
      fr.onload = function() {
        resolve(new DOMParser().parseFromString(this.result, 'application/xml'));
      };
      fr.readAsText(blob);
    });
  }

  function jsonp(url) {
    return new Promise(function(resolve, reject) {
      var script = document.createElement('SCRIPT');
      var callbackNumber = 0;
      var callbackName;
      while (typeof window[callbackName = 'cb'+callbackNumber] !== 'undefined') {
        callbackNumber++;
      }
      window[callbackName] = function(value) {
        delete window[callbackName];
        document.head.removeChild(script);
        resolve(value);
      };
      script.type = 'text/javascript';
      url += (url.indexOf('?') === -1 ? '?' : '&') + 'callback=' + callbackName;
      script.src = url;
      document.head.appendChild(script);
    });
  }

  var loading = {};
  
  function getItemFilePath(itemName, path) {
    return itemName + '/' + (path.match(/\//g) || []).length + '/' + path.toLowerCase();
  }

  var iaStorage = {
    load: function(name, parentRequire, onload, config) {
      var path = name.match(/^([a-zA-Z0-9\.\-_]+)(?:\/(.*))?$/);
      if (path) {
        if (path[2]) {
          this.getFileBlob(path[1], path[2]).then(onload, onload.error);
          return;
        }
        this.getItemInfo(path[1]).then(onload, onload.error);
        return;
      }
      this.getItemSet(name).then(onload, onload.error);
    },
    normalize: function(name, normalize) {
      if (/^[a-zA-Z0-9\.\-_]+(\/.*)?$/.test(name)) return name;
      try {
        return new ItemSet(name).toString();
      }
      catch (e) {
        return name;
      }
    },
    _loading: loading,
    dbAdmin: function(db, mode, newVersion, oldVersion) {
      switch (mode) {
        case 'delete':
          db.close();
          delete this._db;
          delete this.dbVersion;
          console.info('db deleted');
          break;
        case 'versionchange':
          this.dbVersion = newVersion;
          console.info('db version: ' + newVersion);
          break;
        case 'upgrade':
          if (oldVersion < 1) {
            var itemStore = db.createObjectStore('item', {keyPath:'identifier'});
            var fileStore = db.createObjectStore('file', {keyPath:'path'});
            var searchStore = db.createObjectStore('search', {keyPath:'query'});
            itemStore.createIndex('collection', 'collection', {multiEntry:true, unique:false});
            itemStore.createIndex('subject', 'subject', {multiEntry:true, unique:false});
            itemStore.createIndex('language', 'language', {multiEntry:true, unique:false});
            itemStore.createIndex('mediatype', 'mediatype', {multiEntry:false, unique:false});
            itemStore.createIndex('date', 'date', {multiEntry:false, unique:false});
            itemStore.createIndex('publicdate', 'publicdate', {multiEntry:false, unique:false});
          }
          break;
        default:
          console.warn('unhandled db admin event: ' + mode);
          break;
      }
    },
    deleteDB: function() {
      var self = this;
      return this._deleting = this._deleting || new Promise(function(resolve, reject) {
        var deleting = indexedDB.deleteDatabase('iaStorage');
        deleting.onsuccess = function() {
          delete self._deleting;
          resolve();
        };
        deleting.onerror = function() {
          delete self._deleting;
          reject('db deletion failed');
        };
        deleting.onblocked = function() {
          delete self._deleting;
          reject('db deletion blocked');
        };
      });
    },
    getDB: function() {
      if (!('indexedDB' in window)) return Promise.reject('indexedDB not available');
      return this._db = this._db || new Promise(function(resolve, reject) {
        var opening = indexedDB.open('iaStorage');
        opening.onupgradeneeded = function(e) {
          var db = e.target.result;
          db.onversionchange = function(e) {
            iaStorage.dbAdmin(
              e.target,
              e.newVersion === null ? 'delete' : 'versionchange',
              e.newVersion,
              e.oldVersion);
          };
          iaStorage.dbAdmin(db, 'upgrade', e.newVersion, e.oldVersion);
        };
        opening.onerror = function() {
          reject('error opening db');
        };
        opening.onsuccess = function(e) {
          resolve(e.target.result);
        };
        opening.onblocked = function(e) {
          reject('db blocked');
        };
      });
    },
    inTransaction: function(ioMode, storeNames, cb) {
      return this.getDB().then(function(db) {
        return new Promise(function(resolve, reject) {
          var transaction = db.transaction(storeNames, ioMode);
          var result;
          transaction.oncomplete = function() {
            if (result instanceof Promise) result.then(resolve);
            else resolve(result);
          };
          transaction.onerror = function() {
            reject('db error');
          };
          transaction.onabort = function(e) {
            reject(e.target.error || 'transaction aborted');
          };
          if (typeof storeNames === 'string') {
            result = cb.call(transaction, transaction.objectStore(storeNames));
          }
          else {
            var args = new Array(storeNames.length);
            for (var i = 0; i < storeNames.length; i++) {
              args[i] = transaction.objectStore(storeNames[i]);
            }
            result = cb.apply(transaction, args);
          }
        });
      });
    },
    getStored: function(storeName, key) {
      var self = this;
      return new Promise(function(resolve, reject) {
        self.inTransaction('readonly', storeName, function(store) {
          getStored(store, key).then(resolve, reject);
        });
      });
    },
    updateStored: function(storeName) {
      function applyPairs(store, pairs) {
        Object.keys(pairs).forEach(function(key) {
          store.get(key).onsuccess = function(e) {
            var record = e.target.result;
            if (!record) {
              if (typeof store.keyPath !== 'string') {
                throw new Error('NYI: update uninitialized record with non-string key');
              }
              record = {};
              record[store.keyPath] = key;
            }
            store.put(Object.assign(record, pairs[key]));
          };
        });
      }
      if (arguments.length === 1) {
        var pairSets = arguments[0];
        var storeNames = Object.keys(pairSets);
        return this.inTransaction('readwrite', storeNames, function() {
          var stores = arguments;
          storeNames.forEach(function(storeName, i) {
            applyPairs(stores[i], pairSets[storeName]);
          });
        });
      }
      var pairs;
      if (arguments.length === 2) {
        pairs = arguments[1];
      }
      else {
        pairs = {};
        pairs[arguments[1]] = arguments[2];
      }
      return this.inTransaction('readwrite', storeName, function(store) {
        applyPairs(store, pairs);
      });
    },
    deleteStored: function(storeName, key) {
      return this.inTransaction('readwrite', storeName, function(store) {
        return deleteStored(store, key);
      });
    },
    explodeFile: function(item, path, components) {
      var updates = {file:{}};
      updates.file[getItemFilePath(item, path)] = {blob:null};
      var filenames = Object.keys(components);
      for (var i = 0; i < filenames.length; i++) {
        var componentPath = getItemFilePath(item, path+'/'+filenames[i]);
        updates.file[componentPath] = Object.assign(
          {path:componentPath},
          components[filenames[i]]);
      }
      return this.updateStored(updates);
    },
    getFileBlob: function(item, path, mustDownload) {
      var urlPath = item+'/'+path;
      var dbPath = getItemFilePath(item, path);
      var self = this;
      function getFromServer() {
        if (urlPath in loading) return loading[urlPath];
        return loading[urlPath] = fetch('//cors.archive.org/cors/'+urlPath)
        .then(function(req) {
          if (req.status >= 200 && req.status < 300) return req.blob();
          // TODO: wait and try again a few times?
          return Promise.reject('server returned ' + req.status);
        })
        .then(function(blob) {
          var updates = {file:{}};
          updates.file[dbPath] = {blob:blob, retrieved:new Date()};
          loading[urlPath] = self.updateStored(updates).then(
            function(result) { delete loading[urlPath]; return blob; },
            function(reason) { delete loading[urlPath]; return Promise.reject(reason); });
          return blob;
        })
        .then(
          null,
          function(reason) { delete loading[urlPath]; return Promise.reject(reason); });
      }
      if (mustDownload) return getFromServer();
      return this.getStored('file', dbPath).then(function(fileRecord) {
        if (fileRecord && fileRecord.blob instanceof Blob) {
          return fileRecord.blob;
        }
        return getFromServer();
      });
    },
    deleteFileBlob: function(item, path) {
      return this.updateStored('file', getItemFilePath(item, path), {blob:null});
    },
    loadAllFileInfo: function(item, mustDownload) {
      var xmlPath = item+'_files.xml';
      var pseudopath = 'files:'+item;
      var self = this;
      return this.getStored('file', getItemFilePath(item, xmlPath)).then(function(record) {
        if (record && record.loaded && !mustDownload) return;
        if (pseudopath in loading) {
          return loading[pseudopath];
        }
        return loading[pseudopath] = self.getFileBlob(item, xmlPath)
        .then(readXmlBlob)
        .then(function(xml) {
          var updates = {file:{}};
          for (var node = xml.documentElement.firstChild; node; node = node.nextSibling) {
            if (node.nodeName !== 'file') continue;
            var path = node.getAttribute('name');
            var obj = {path:getItemFilePath(item, path), source:node.getAttribute('source')};
            for (var node2 = node.firstChild; node2; node2 = node2.nextSibling) {
              if (node2.nodeType !== 1) continue;
              var value = node2.textContent;
              switch (node2.nodeName) {
                case 'mtime':
                  obj[node2.nodeName] = new Date(+node2.textContent * 1000);
                  break;
                case 'size':
                  obj[node2.nodeName] = +node2.textContent;
                  break;
                default:
                  obj[node2.nodeName] = node2.textContent;
                  break;
              }
            }
            updates.file[getItemFilePath(item, path)] = obj;
          }
          updates.file[getItemFilePath(item, xmlPath)] = Object.assign(
            updates.file[getItemFilePath(item, xmlPath)] || {path:getItemFilePath(item, xmlPath)},
            {blob:null, loaded:new Date()});
          loading[pseudopath] = self.updateStored(updates).then(
            function(result) { delete loading[pseudopath]; },
            function(reason) { delete loading[pseudopath]; return Promise.reject(reason); });
        })
        .then(
          null,
          function(reason) { delete loading[pseudopath]; return Promise.reject(reason); });
      });
    },
    getFileInfo: function(item, path) {
      // TODO: mustDownload option
      var self = this;
      function tryNow(elseTry) {
        return self.getStored('file', getItemFilePath(item, path)).then(function(info) {
          if ('size' in info) return info;
          return elseTry();
        });
      }
      return tryNow(function elseTry() {
        return self.loadAllFileInfo(item).then(function() {
          return tryNow(function giveUp() {
            // TODO: try mustDownload? maybe with a small timestamp check?
            return undefined;
          });
        });
      });
    },
    getItemInfo: function(item, requiredFields) {
      var mustDownload = false;
      if (requiredFields === true) {
        mustDownload = true;
        requiredFields = [];
      }
      else if (typeof requiredFields === 'string') {
        requiredFields = [requiredFields];
      }
      else {
        requiredFields = requiredFields || [];
      }
      var xmlPath = item+'_meta.xml';
      var pseudopath = 'meta:'+item;
      var self = this;
      return this.getStored('item', item).then(function(record) {
        mustDownload = mustDownload || !record;
        if (!mustDownload) {
          for (var i = 0; i < requiredFields.length; i++) {
            if (!(requiredFields[i] in record)) {
              mustDownload = true;
              break;
            }
          }
        }
        if (!mustDownload) return record;
        if (pseudopath in loading) {
          return loading[pseudopath];
        }
        return loading[pseudopath] = self.getFileBlob(item, xmlPath)
        .then(readXmlBlob).then(function(xml) {
          record = record || {identifier:item};
          record.retrieved = new Date();
          if ('serverFields' in record) {
            for (var i = 0; i < record.serverFields.length; i++) {
              delete record[record.serverFields[i]];
            }
          }
          const reservedNames = /^(retrieved|serverFields)$/;
          var additions = {};
          for (var node = xml.documentElement.firstChild; node; node = node.nextSibling) {
            if (node.nodeType !== 1) continue;
            var name = node.nodeName, value = node.textContent;
            if (reservedNames.test(name)) name = '$'+name;
            if (Object.prototype.hasOwnProperty.call(additions, name)) {
              if (typeof additions[name].push === 'function') {
                additions[name].push(value);
              }
              else if (additions[name] !== value) {
                additions[name] = [additions[name], value];
              }
            }
            else additions[name] = value;
          }
          for (var i = 0; i < requiredFields.length; i++) {
            if (!(requiredFields[i] in additions)) {
              additions[requiredFields[i]] = [];
            }
          }
          record = Object.assign(record, additions, {serverFields: Object.keys(additions)});
          var updates = {item:{}, file:{}};
          updates.item[item] = record;
          updates.file[getItemFilePath(item, xmlPath)] = {blob:null};
          loading[pseudopath] = self.updateStored(updates)
          .then(
            function(result) { delete loading[pseudopath]; return result; },
            function(reason) { delete loading[pseudopath]; return Promise.reject(reason); });
          return record;
        })
        .then(
          null,
          function(reason) { delete loading[pseudopath]; return Promise.reject(reason); });
      });
    },
    getAllFilenames: function(item) {
      var self = this;
      return this.loadAllFileInfo(item).then(function() {
        return new Promise(function(resolve, reject) {
          self.inTransaction('readonly', 'file', function(fileStore) {
            fileStore.getAllKeys(IDBKeyRange.bound(item+'/', item+'~')).onsuccess = function(e) {
              resolve(e.target.result);
            };
          }).then(null, reject);
        });
      })
      .then(function(keys) {
        for (var i = 0; i < keys.length; i++) {
          keys[i] = keys[i].replace(/^[^\/]+\/\d+\//, '');
        }
        return keys;
      });
    },
    getCollection: function(item) {
      return this.getItemSet('collection:' + item);
    },
    getItemSet: function(query) {
      return new ItemSet(query).init();
    },
  };
  
  function ItemSet(query) {
    var parsed = this.parseQuery(query);
    if (parsed.length === 0) {
      throw new Error('query must have at least one term');
    }
    Object.defineProperties(this, {
      query: {value:query, enumerable:true},
      parsed: {value:parsed, enumerable:true},
    });
  }
  ItemSet.prototype = {
    toString: function() {
      return this.query; // TODO: normalize?
    },
    parseQuery: function(query) {
      var queryToken = / *(AND( NOT)?|OR|"[^"]*"|\[([^\]]*) TO ([^\]]*)\]|[\(\)]|[^ \[\]"\(\)\:]+:?) */g;
      var match, nextAt = 0;
      function rewind() {
        queryToken.lastIndex = nextAt = match.index;
      }
      function nextToken() {
        if (nextAt >= query.length) return null;
        match = queryToken.exec(query);
        if (!match || match.index !== nextAt) {
          throw new Error('invalid query');
        }
        nextAt = match.index + match[0].length;
        if (typeof match[3] === 'string') {
          return IDBKeyRange.bound(match[3], match[4]);
        }
        return match[1];
      }
      function nextExpression(fieldName) {
        var token = nextToken();
        var subFieldName = fieldName;
        if (typeof token === 'string' && token.slice(-1) === ':') {
          subFieldName = token.slice(0, -1);
          token = nextToken();
        }
        var expr;
        switch (token) {
          case null: return null;
          case '(':
            var subexpr;
            while (subexpr = nextExpression(subFieldName)) {
              if (subexpr === null) throw new Error('invalid query');
              if (expr) {
                expr = [expr, subexpr];
                expr.mode = 'AND';
              }
              else expr = subexpr;
              token = nextToken();
              if (token === ')') break;
              if (token === null) throw new Error('invalid query');
              rewind();
            }
            break;
          case ')': case 'AND': case 'OR': case 'AND NOT':
            throw new Error('invalid query');
          default:
            if (typeof token === 'string') {
              if (token[0] === '"') {
                token = token.slice(1, -1);
              }
              var glob = token.indexOf('*');
              if (glob !== -1 && subFieldName) {
                if (glob === glob.length-1) {
                  if (token.length === 1) {
                    // i.e. when used as an index key range, every item with any value
                    token = undefined;
                  }
                  else {
                    token = IDBRange.bound(
                      token.slice(0, glob),
                      token.slice(0, glob-1) + String.fromCharCode(token.charCodeAt(glob-1) + 1),
                      true,
                      false);
                  }
                }
                else {
                  var pattern = '^' + token.split('*').map(function(part) {
                    return part.replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&');
                  }).join('.*') + '$';
                  if (pattern.slice(0, 3) === '^.*') pattern = pattern.slice(3);
                  if (pattern.slice(-3) === '.*$') pattern = pattern.slice(0, 3);
                  token = new RegExp(pattern);
                }
              }
            }
            expr = token;
            if (subFieldName) {
              expr = {mode:':', field:subFieldName, value:expr};
            }
            else {
              if (typeof expr !== 'string') {
                throw new Error('invalid query');
              }
              expr = {mode:'"..."', term:expr};
            }
            break;
        }
        for (;;) switch (token = nextToken()) {
          case null: return expr;
          default: rewind(); return expr;
          case 'AND': case 'OR': case 'AND NOT':
            var rhs = nextExpression(fieldName);
            if (rhs === null) throw new Error('invalid query');
            expr = [expr, rhs];
            expr.mode = token;
            continue;
        }
      }
      var expr, parsed;
      while (expr = nextExpression()) {
        if (parsed) {
          parsed = [parsed, expr];
          parsed.mode = 'AND';
        }
        else parsed = expr;
      }
      return parsed;
    },
    onreadystatechange: function() { /* override me! */ },
    onprogress: function() { /* override me! */ },
    _readyState: 'uninitialized',
    get readyState() {
      return this._readyState;
    },
    set readyState(v) {
      if (v === this._readyState) return;
      this._readyState = v;
      this.onreadystatechange();
    },
    makeRequest: function(paramObj) {
      var queryString = '?' + Object.keys(paramObj).map(function(key) {
        var value = paramObj[key];
        if (Array.isArray(value)) {
          key += '[]';
          value = value.join(',');
        }
        return key + '=' + value;
      }).sort().join('&');
      var pseudopath = 'search:' + queryString;
      if (pseudopath in loading) return loading[pseudopath];
      return loading[pseudopath] = jsonp('//archive.org/advancedsearch.php' + queryString + '&output=json')
      .then(
        function(result) { delete loading[pseudopath]; return result; },
        function(reason) { delete loading[pseudopath]; return Promise.reject(reason); });
    },
    initFromStorage: function() {
      var self = this;
      return iaStorage.inTransaction('readonly', ['item', 'search'], function(itemStore, searchStore) {
        function doPart(part) {
          switch (part.mode) {
            case '"..."':
              // open search terms are not supported
              return Promise.resolve({isAll:false, set:{}});
            case ':':
              if ([].indexOf.call(itemStore.indexNames, part.field) === -1) {
                return Promise.resolve({isAll:false, set:{}});
              }
              var range = part.value;
              if (range instanceof RegExp) {
                // TODO
                return Promise.resolve({isAll:false, set:{}});
              }
              return new Promise(function(resolve, reject) {
                var set = {};
                itemStore.index(part.field).openKeyCursor(range).onsuccess = function(e) {
                  var cursor = e.target.result;
                  if (!cursor) {
                    resolve({set:set, isAll:true});
                    return;
                  }
                  set[cursor.primaryKey] = true;
                  cursor.continue();
                };
              });
            case 'AND': case 'OR': case 'AND NOT':
              return Promise.all([doPart(part[0]), doPart(part[1])])
              .then(function(sides) {
                var left = sides[0], right = sides[1];
                if (part.mode === 'OR') {
                  left.set = Object.assign(left.set, right.set);
                  left.isAll = left.isAll && right.isAll;
                  return left;
                }
                else if (part.mode === 'AND NOT') {
                  if (!right.isAll) {
                    // since we can't guarantee that we are excluding everything
                    // that we need to, exclude everything
                    return {isAll:false, set:{}};
                  }
                  var rightKeys = Object.keys(right.set);
                  for (var i = 0; i < rightKeys.length; i++) {
                    delete left.set[rightKeys[i]];
                  }
                  return left;
                }
                else { // AND
                  var leftKeys = Object.keys(left.set);
                  for (var i = 0; i < leftKeys.length; i++) {
                    if (!(leftKeys[i] in right.set)) {
                      delete left.set[leftKeys[i]];
                    }
                  }
                  left.isAll = left.isAll && right.isAll;
                  return left;
                }
              });
          }
        }
        return Promise.all([
          doPart(self.parsed),
          new Promise(function(resolve, reject) {
            searchStore.get(self.query).onsuccess = function(e) {
              resolve(e.target.result);
            };
          }),
        ])
        .then(function(values) {
          var storageInfo = values[0];
          storageInfo.record = values[1];
          if (storageInfo.record && storageInfo.record.items) {
            for (var i = 0; i < storageInfo.record.items.length; i++) {
              storageInfo.set[storageInfo.record.items[i]] = true;
            }
          }
          return storageInfo;
        });
      });
    },
    appendFromServer: function() {
      var query = this.query;
      var searchRecord = this.searchRecord;
      if (searchRecord.nextFrom) {
        // apologies to the year 10000
        query += ' publicdate:['+searchRecord.nextFrom+' TO 9999]';
      }
      var self = this;
      return this.makeRequest({
        q: query,
        fl: ['identifier','title','collection','mediatype','subject','date','publicdate'],
        sort: ['publicdate asc'], // sort has to be an array?
        rows: 50})
      .then(function(payload) {
        var results = payload.response.docs;
        searchRecord.isComplete = results.length === payload.response.numFound;
        var updates = {search:{}, item:{}};
        if (results.length > 0) {
          searchRecord.nextFrom = results[results.length-1].publicdate;
          if (searchRecord.items && searchRecord.items[searchRecord.items.length-1] === results[0].identifier) {
            searchRecord.items.pop();
          }
          for (var i = 0; i < results.length; i++) {
            var item = results[i].identifier;
            updates.item[item] = results[i];
            self.set[item] = true;
            if (searchRecord.items) searchRecord.items.push(item);
          }
        }
        updates.search[self.query] = searchRecord;
        return iaStorage.updateStored(updates);
      })
      .then(function() {
        self.readyState = searchRecord.isComplete ? 'complete' : 'partial';
        return self;
      });
    },
    populate: function() {
      if (this.readyState === 'complete') return Promise.resolve(this);
      if (this.readyState === 'error') return Promise.reject(this.error);
      return this.appendFromServer();
    },
    countUniqueValues: function(fieldName) {
      var items = Object.keys(this.set);
      return iaStorage.inTransaction('readonly', 'item', function(itemStore) {
        var set = {};
        function addValues(e) {
          var record = e.target.result;
          if (record && fieldName in record) {
            if (Array.isArray(record[fieldName])) {
              for (var i = 0; i < record[fieldName].length; i++) {
                set[record[fieldName][i]] = (set[record[fieldName][i]] || 0) + 1;
              }
            }
            else set[record[fieldName]] = (set[record[fieldName]] || 0) + 1;
          }
        }
        for (var i = 0; i < items.length; i++) {
          itemStore.get(items[i]).onsuccess = addValues;
        }
        return set;
      });
    },
    complete: function() {
      var self = this;
      function afterPopulate() {
        if (self.readyState === 'partial') {
          return self.populate().then(afterPopulate);
        }
        return self;
      }
      return this.populate().then(afterPopulate);
    },
    init: function() {
      if (this.readyState !== 'uninitialized') {
        if (this.readyState === 'error') {
          return Promise.reject(this.error);
        }
        return this._initializing || Promise.resolve(this);
      }
      var self = this;
      this.readyState = 'initializing';
      return this._initializing = this.initFromStorage()
      .then(function(storedInfo) {
        self.set = storedInfo.set;
        self.searchRecord = storedInfo.record || {
          query: self.query,
          items: storedInfo.isAll ? null : [],
          nextFrom: null,
          isComplete: false,
        };
        if (Object.keys(self.set).length === 0) {
          return self.appendFromServer()
          .then(function() {
            return self;
          });
        }
        self.readyState = self.searchRecord.isComplete ? 'complete' : 'partial';
        return self;
      })
      .then(
        function(result) { delete self._initializing; return result; },
        function(reason) {
          delete self._initializing;
          self.readyState = 'error';
          self.error = reason;
          return Promise.reject(reason);
        });
    },
  };
  
  iaStorage.ItemSet = ItemSet;

  return iaStorage;

});
