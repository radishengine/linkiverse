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

  var iaStorage = {
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
            itemStore.createIndex('mediatype', 'mediatype', {multiEntry:false, unique:false});
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
      var fullPath = item+'/'+path;
      var self = this;
      function getFromServer() {
        if (fullPath in loading) return loading[fullPath];
        return loading[fullPath] = fetch('//cors.archive.org/cors/'+fullPath)
        .then(function(req) {
          if (req.status >= 200 && req.status < 300) return req.blob();
          // TODO: wait and try again a few times?
          return Promise.reject('server returned ' + req.status);
        })
        .then(function(blob) {
          var updates = {file:{}};
          updates.file[fullPath] = {blob:blob, retrieved:new Date()};
          loading[fullPath] = self.updateStored(updates).then(
            function(result) { delete loading[fullPath]; return blob; },
            function(reason) { delete loading[fullPath]; return Promise.reject(reason); });
          return blob;
        })
        .then(
          null,
          function(reason) { delete loading[fullPath]; return Promise.reject(reason); });
      }
      if (mustDownload) return getFromServer();
      return this.getStored('file', fullPath).then(function(fileRecord) {
        if (fileRecord && fileRecord.blob instanceof Blob) {
          return fileRecord.blob;
        }
        return getFromServer();
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
        return loading[pseudopath] = self.getFileBlob(item, xmlPath)
        .then(readXmlBlob)
        .then(function(xml) {
          var updates = {file:{}};
          for (var node = xml.documentElement.firstChild; node; node = node.nextSibling) {
            if (node.nodeName !== 'file') continue;
            var path = node.getAttribute('name');
            var obj = {path:item+'/'+path, source:node.getAttribute('source')};
            for (var node2 = node.firstChild; node2; node2 = node2.nextSibling) {
              if (node2.nodeType !== 1) continue;
              obj[node2.nodeName] = node2.textContent;
            }
            updates.file[item+'/'+path] = obj;
          }
          updates.file[item+'/'+xmlPath] = Object.assign(
            updates.file[item+'/'+xmlPath] || {path:item+'/'+xmlPath},
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
          updates.file[item+'/'+xmlPath] = {blob:null};
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
    getFileKeyRange: function(item) {
      return IDBKeyRange.bound(
        item + '/',
        item.slice(0, -2) + String.fromCharCode(item.charCodeAt(item.length-1) + 1) + '/',
        true,
        true);
    },
    getAllFilenames: function(item) {
      var self = this;
      return this.loadAllFileInfo(item).then(function() {
        return new Promise(function(resolve, reject) {
          self.inTransaction('readonly', 'file', function(fileStore) {
            fileStore.getAllKeys(self.getItemFileKeyRange(item)).onsuccess = function(e) {
              resolve(e.target.result);
            };
          }).then(null, reject);
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
