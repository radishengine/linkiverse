define(function() {
  
  'use strict';

  function storePut(objectStore, record) {
    return new Promise(function(resolve, reject) {
      var storing = objectStore.put(record);
      storing.onerror = function() {
        reject('db error');
      };
      storing.onsuccess = function(e) {
        resolve(e.target.result); // key
      };
    });
  }

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

  function getAllStoredKeys(objectStore, keyRange, count) {
    return new Promise(function(resolve, reject) {
      var retrieving = objectStore.getAllKeys(keyRange, count);
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

  var iaStorage = {
    deleteDB: function() {
      var self = this;
      return this._deleting = this._deleting || this.getDB().then(function(db) {
        var req = indexedDB.delete(db);
        req.onsuccess = function() {
          delete self._deleting;
          delete self._db;
          resolve();
        };
        req.onerror = function() {
          delete self._deleting;
          reject('db deletion failed');
        };
      });
    },
    getDB: function() {
      if (!('indexedDB' in window)) return Promise.reject('indexedDB not available');
      return this._db = this._db || new Promise(function(resolve, reject) {
        var opening = indexedDB.open('iaStorage');
        opening.onupgradeneeded = function(e) {
          var db = e.target.result;
          var itemStore = db.createObjectStore('item', {keyPath:'identifier'});
          itemStore.createIndex('collection', 'collection', {multiEntry:true, unique:false});
          itemStore.createIndex('subject', 'subject', {multiEntry:true, unique:false});
          itemStore.createIndex('mediatype', 'mediatype', {multiEntry:false, unique:false});
          db.createObjectStore('file', {keyPath:'path'});
          db.createObjectStore('search', {keyPath:'query'});
          resolve(db);
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
          transaction.onsuccess = function() {
            if (result instanceof Promise) result.then(resolve);
            else resolve(result);
          };
          transaction.onerror = function() {
            reject('db error');
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
      return this.inTransaction('readonly', storeName, function(store) {
        return getStored(store, key);
      });
    },
    updateStored: function(storeName) {
      function applyPairs(store, pairs) {
        return Promise.all(Object.keys(pairs).map(function(key) {
          return getStored(store, key).then(function(record) {
            if (!record) {
              if (typeof store.keyPath !== 'string') {
                throw new Error('NYI: update uninitialized record with non-string key');
              }
              record = {};
              record[store.keyPath] = key;
            }
            return storePut(store, Object.assign(record, pairs[key]));
          });
        }));
      }
      if (arguments.length === 1) {
        var pairSets = arguments[0];
        var storeNames = Object.keys(pairSets);
        return this.inTransaction('readwrite', storeNames, function() {
          var stores = arguments;
          return Promise.all(storeNames.map(function(storeName, i) {
            return applyPairs(stores[i], pairSets[storeName]);
          }));
        });
      }
      if (arguments.length === 2) {
        var pairs = arguments[1];
        return this.inTransaction('readwrite', storeName, function(store) {
          return applyPairs(store, pairs);
        });
      }
      var key = arguments[1];
      if (typeof arguments[2] === 'function') {
        var cb = arguments[2];
        return this.inTransaction('readwrite', storeName, function(store) {
          return getStored(store, key).then(function(record) {
            store.put(cb(record));
          });
        });
      }
      var value = arguments[2];
      return this.inTransaction('readwrite', storeName, function(store) {
        return getStored(store, key).then(function(record) {
          if (!record) {
            if (typeof store.keyPath !== 'string') {
              throw new Error('NYI: assign to uninitialized record with non-string key');
            }
            record = {};
            record[store.keyPath] = key;
          }
          store.put(Object.assign(record, pairs[key]));
        });
      });
    },
    deleteStored: function(storeName, key) {
      return this.inTransaction('readwrite', storeName, function(store) {
        return deleteStored(store, key);
      });
    },
    explodeFile: function(item, path, components) {
      var updates = {file:{}};
      updates.file[item+'/'+path] = {blob:null};
      var filenames = Object.keys(components);
      for (var i = 0; i < filenames.length; i++) {
        var componentPath = item+'/'+path+'/'+filenames[i];
        updates.file[componentPath] = Object.assign(
          {path:componentPath},
          components[filenames[i]]);
      }
      return this.updateStored(updates);
    },
    getFileBlob: function(item, path, mustDownload) {
      path = item + '/' + path;
      var self = this;
      function getFromServer() {
        return loading[path] = fetch('//cors.archive.org/cors/' + path)
        .then(function(req) {
          if (req.status >= 200 && req.status < 300) return req.blob();
          // TODO: wait and try again a few times?
          return Promise.reject('server returned ' + req.status);
        })
        .then(function(blob) {
          self.assignStored('file', item+'/'+path, {blob:blob, downloaded:new Date()});
          return blob;
        });
      }
      if (mustDownload) return getFromServer();
      return this.getStored('file', item+'/'+path).then(function(fileRecord) {
        if (fileRecord && fileRecord.blob instanceof Blob) {
          return fileRecord.blob;
        }
        if (path in loading) return loading[path];
        loading[path] = getFromServer().then(
          function(result) { delete loading[path]; return result; },
          function(reason) { delete loading[path]; return Promise.reject(reason); });
      });
    },
    deleteFileBlob: function(item, path) {
      return this.updateStored('file', item+'/'+path, {blob:null});
    },
    loadAllFileInfo: function(item, mustDownload) {
      var xmlPath = item+'_files.xml';
      var pseudopath = 'files:'+item;
      var self = this;
      return this.getStored('file', item+'/'+xmlPath).then(function(record) {
        if (record && record.loaded && !mustDownload) return;
        if (pseudopath in loading) {
          return loading[pseudopath];
        }
        return loading[pseudopath] = self.getFile(item, xmlPath)
        .then(readXmlBlob).then(function(xml) {
          var updates = {};
          for (var node = xml.documentElement.firstChild; node; node = node.nextSibling) {
            if (node.nodeName !== 'file') continue;
            var obj = {source: node.getAttribute('source')};
            for (var node2 = node.firstChild; node2; node2 = node2.nextSibling) {
              if (node2.nodeType !== 1) continue;
              obj[node2.nodeName] = node2.textContent;
            }
            updates[item + '/' + node.getAttribute('name')] = obj;
          }
          updates[item+'/'+xmlPath] = Object.assign(updates[item+'/'+xmlPath] || {}, {
            blob: null,
            loaded: new Date(),
          });
          return self.assignStored('file', updates);
        })
        .then(
          function(result) { delete loading[pseudopath]; return result; },
          function(reason) { delete loading[pseudopath]; return Promise.reject(reason); });
      });
    },
    getFileInfo: function(item, path) {
      // TODO: mustDownload option
      var self = this;
      function tryNow(elseTry) {
        return this.getStored('file', item+'/'+path).then(function(info) {
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
        return loading[pseudopath] = self.getFile(item, xmlPath)
        .then(readXmlBlob).then(function(xml) {
          var updates = {item:{}, file:{}};
          updates.item[item] = {retrieved:new Date()};
          updates.file[xmlPath] = {blob:null};
          const reservedNames = /^(retrieved)$/;
          for (var node = xml.documentElement.firstChild; node; node = node.nextSibling) {
            if (node.nodeType !== 1) continue;
            var name = node.nodeName, value = node.textContent;
            if (reservedNames.test(name)) name = '$' + name;
            if (Object.prototype.hasOwnProperty.call(updates.item, name)) {
              if (typeof updates.item[name].push === 'function') {
                updates.item[name].push(value);
              }
              else {
                updates.item[name] = [updates.item[name], value];
              }
            }
            else updates.item[name] = value;
          }
          for (var i = 0; i < requiredFields.length; i++) {
            if (!(requiredFields[i] in updates)) {
              updates[requiredFields[i]] = [];
            }
          }
          self.updateStored(updates);
          return Object.assign({}, record, updates.item);
        })
        .then(
          function(result) { delete loading[pseudopath]; return result; },
          function(reason) { delete loading[pseudopath]; return Promise.reject(reason); });
      });
    },
    getFileKeyRange: function(item) {
      return IDBKeyRange.bound(
        item + '/',
        item.slice(0, -2) + String.fromCharCode(item.charCodeAt(item.length-1) + 1) + '/',
        true,
        true);
    },
    getAllFilenames: function(item) {
      var self = this;
      return this.loadAllFileInfo(item)
      .then(function() {
        return self.inTransaction('readonly', 'file', function(fileStore) {
          return getAllStoredKeys(fileStore, self.getItemFileKeyRange(item));
        });
      })
      .then(function(keys) {
        for (var i = 0; i < keys.length; i++) {
          keys[i] = keys[i].slice(item.length + 1);
        }
        return keys;
      });
    },
    getCollection: function(item) {
      return new ItemSet('collection', item);
    },
  };
  
  function ItemSetBase() {
  }
  ItemSetBase.prototype = {
    load: function() {
      var self = this;
      return iaStorage.inTransaction('readonly', ['item', 'search'], function(itemStore, searchStore) {
        return self.loadFromStore(itemStore, searchStore);
      });
    },
    loadFromStore: function() {
      throw new Error('NYI');
    },
    where: function(right) {
      if (typeof arguments[0] === 'string') {
        right = new ItemSet(arguments[0], arguments[1]);
      }
      return new ItemSetOp(this, 'AND', right);
    },
    or: function(right) {
      if (typeof arguments[0] === 'string') {
        right = new ItemSet(arguments[0], arguments[1]);
      }
      return new ItemSetOp(this, 'OR', right);
    },
    except: function(right) {
      if (typeof arguments[0] === 'string') {
        right = new ItemSet(arguments[0], arguments[1]);
      }
      return new ItemSetOp(this, 'AND NOT', right);
    },
  };

  function ItemSetOp(left, operator, right) {
    if (typeof this[operator] !== 'function') {
      throw new Error('operator undefined: ' + operator);
    }
    this.operator = operator;
    this.left = left;
    this.right = right;
  }
  ItemSetOp.prototype = Object.assign(new ItemSetBase, {
    toString: function(bare) {
      var leftBare = this.operator.replace(/ NOT$/, '') === this.left.operator;
      var str = this.left.toString(leftBare) + ' ' + this.operator + ' ' + this.right;
      return bare ? str : '(' + str + ')';
    },
    AND: function(values) {
      var left = values[0], right = values[1];
      var leftKeys = Object.keys(left);
      for (var i = 0; i < leftKeys.length; i++) {
        if (!(leftKeys[i] in right)) {
          delete left[leftKeys[i]];
        }
      }
      return left;
    },
    OR: function(values) {
      var left = values[0], right = values[1];
      var rightKeys = Object.keys(right);
      for (var i = 0; i < rightKeys.length; i++) {
        if (!(rightKeys[i] in left)) {
          left[rightKeys[i]] = right[rightKeys[i]];
        }
      }
      return left;
    },
    'AND NOT': function(values) {
      var left = values[0], right = values[1];
      var rightKeys = Object.keys(right);
      for (var i = 0; i < rightKeys.length; i++) {
        delete left[rightKeys[i]];
      }
      return left;
    },
    loadFromStore: function(itemStore) {
      return Promise.all([
        this.left.loadFromStore(itemStore),
        this.right.loadFromStore(itemStore)])
      .then(this[this.operator]);
    },
  });

  function ItemSet(fieldName, valueRange) {
    this.fieldName = fieldName;
    if (!(valueRange instanceof IDBKeyRange)) {
      valueRange = IDBKeyRange.only(valueRange);
    }
    this.valueRange = valueRange;
  }
  ItemSet.prototype = Object.assign(new ItemSetBase, {
    getRangeString: function(range) {
      function bound(v, mode) {
        v += '';
        if (mode && v !== '') {
          v = v.slice(0, -2) + String.fromCharCode(v.charCodeAt(v.length-1) + mode);
        }
        if (/[ \[\]\(\)]|(^(AND|OR|NOT|TO)$)|^\-|^$/.test(v)) {
          v = '"' + v + '"';
        }
        return v;
      }
      if (!range.lowerOpen && !range.upperOpen && !indexedDB.cmp(range.lower, range.upper)) {
        // single value
        return bound(range.lower, 0);
      }
      return '[' + bound(range.lower, +range.lowerOpen) +
          ' TO ' + bound(range.upper, -range.upperOpen) + ']';
    },
    toString: function() {
      var fieldPrefix = this.fieldName ? this.fieldName+':' : '';
      var rangeString = this.getRangeString(this.valueRange);
      return fieldPrefix + rangeString;
    },
    loadFromStore: function(itemStore, searchStore) {
      var self = this;
      function downloadInfo(currentInfo) {
        var query = self.toString();
        var pseudopath = 'search:' + query;
        if (pseudopath in loading) return loading[pseudopath];
        return loading[pseudopath] = jsonp(
          '//archive.org/advancedsearch.php'
            + '?q=' + query
            + '&output=json'
            + '&rows=1'
            + '&fl[]=identifier'
            + '&sort=publicdate desc')
        .then(function(returned) {
          var last = returned.result.docs[0];
          var updates = {search:{}};
          updates.search[query] = {
            received: new Date(),
            query: query,
            lastItem: last && last.identifier,
            totalCount: returned.result.count,
          };
          if (currentInfo
          && currentInfo.lastItem === updates.search[query].lastItem
          && currentInfo.totalCount === updates.search[query].totalCount) {
            // nothing seems to have changed. do a non-blocking update for the timestamp
            iaStorage.updateStored(updates);
            return updates.search[query];
          }
          return jsonp(
            '//archive.org/advancedsearch.php'
            + '?q=' + query
            + '&output=json'
            + '&rows=' + updates.search[query].totalCount
            + '&fl[]=identifier,title,collection,subject'
            + '&sort=publicdate desc')
          .then(function(returned) {
            updates.item = {};
            var set = {};
            for (var i = 0; i < returned.result.docs.length; i++) {
              var doc = returned.result.docs[i];
              updates.item[doc.identifier] = doc;
              set[doc.identifier] = true;
            }
            return iaStorage.updateStored(updates)
            .then(function() {
              return set;
            });
          })
          .then(function() {
            return updates.search[query];
          });
        })
        .then(
          function(result) { delete loading[pseudopath]; return result; },
          function(reason) { delete loading[pseudopath]; return Promise.reject(reason); });
      }
      return new Promise(function(resolve, reject) {
        var req = itemStore.index(self.itemName).getAll(self.valueRange);
        var req2 = searchStore.get(self.toString());
        req.onerror = req2.onerror = function(e) {
          reject('db error');
        };
        var result = {};
        req.onsuccess = function(e) {
          var itemNames = e.target.result;
          var set = {};
          for (var i = 0; i < itemNames.length; i++) {
            set[itemNames[i]] = true;
          }
          result.set = set;
          if ('info' in result) {
            resolve(result);
          }
        };
        req2.onsuccess = function(e) {
          result.info = e.target.result;
          if ('set' in result) {
            resolve(result);
          }
        };
      })
      .then(function(result) {
        if (result.info) {
          if ((new Date() - result.info.received) > 1000*60*60*24) {
            // if it's been 24 hours, do a non-blocking check to see
            // if things have changed (for next time)
            downloadInfo(result.info, result.set);
          }
        }
        else {
          // do a full download
          // TODO: create an 'info' based on stored results?
          // e.g. for a child collection when the parent has already
          // been processed
          return downloadInfo(null);
        }
        return result.set;
      });
    },
  });
  
  iaStorage.ItemSet = ItemSet;
  iaStorage.ItemSet.Base = ItemSetBase;
  iaStorage.ItemSet.Op = ItemSetOp;

  return iaStorage;

});
