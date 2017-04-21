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
      fr.loadAsText(blob);
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
      script.src = url;
      document.head.appendChild(script);
    });
  }

  var loading = {};

  var iaStorage = {
    getDB: function() {
      if (!('indexedDB' in window)) return Promise.reject('indexedDB not available');
      return this._db = this._db || new Promise(function(resolve, reject) {
        var opening = indexedDB.open('iaCache');
        opening.onupgradeneeded = function(e) {
          var db = e.target.result;
          db.createObjectStore('file', {keyPath:'path'});
          db.createObjectStore('search', {keyPath:'query'});
          resolve(db);
        };
        opening.onerror = function() {
          reject('error opening db');
        };
        opening.onsuccess = function(e) {
          resolve(db);
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
      if (arguments.length === 2) {
        var pairs = arguments[1];
        return this.inTransaction('readwrite', storeName, function(store) {
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
    explode: function(item, path, components) {
      var self = this;
      return this.inTransaction('readwrite', 'file', function(fileStore) {
        var filenames = Object.keys(components);
        for (var i = 0; i < filenames.length; i++) {
          fileStore.put(Object.assign(
            {path:item+'/'+path+'/'+filenames[i]},
            components[filenames[i]]
          ));
        }
        getStored(fileStore, item+'/'+path).then(function(record) {
          if (record && record.blob) {
            record.blob = null;
            fileStore.put(record);
          }
        });
      });
    },
    getFile: function(item, path, mustDownload) {
      path = item + '/' + path;
      var self = this;
      function getFromServer() {
        loading[path] = return fetch('//cors.archive.org/cors/' + path)
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
    deleteFile: function(item, path) {
      return this.assign('file', item+'/'+path, {blob:null});
    },
    loadingItemFileInfo: {},
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
        requiredFields = requiredFields || ['identifier'];
      }
      var xmlPath = item+'_meta.xml';
      var pseudopath = 'meta:'+item;
      var self = this;
      return this.getStored('file', item+'/'+xmlPath).then(function(record) {
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
          var updates = {blob:null};
          const reservedNames = /^(blob|downloaded)$/;
          for (var node = xml.documentElement.firstChild; node; node = node.nextSibling) {
            if (node.nodeType !== 1) continue;
            var name = node.nodeName, value = node.textContent;
            if (reservedNames.test(name)) name = '$' + name;
            if (Object.prototype.hasOwnProperty.call(updates, name)) {
              if (typeof updates[name].push === 'function') {
                updates[name].push(value);
              }
              else {
                updates[name] = [updates[name], value];
              }
            }
            else updates[name] = value;
          }
          for (var i = 0; i < requiredFields.length; i++) {
            if (!(requiredFields[i] in updates)) {
              updates[requiredFields[i]] = [];
            }
          }
          return self.assignStored('file', item+'/'+xmlPath, updates);
        })
        .then(
          function(result) { delete loading[pseudopath]; return result; },
          function(reason) { delete loading[pseudopath]; return Promise.reject(reason); });
      });
    },
    getItemFileKeyRange: function(item) {
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
    getSearchResults: function(query) {
      var pseudopath = 'search:'+query;
      function getFromServer() {
        return jsonp('//archive.org/advancedsearch.php');
      }
      return this.getStored('search', query).then(function(value) {

      });
    },
  };

  function Term(term) {
    this.term = term;
  }
  Term.prototype = {
    toString: function() {
      var str = this.term;
      if (/ |(^(AND|OR|NOT)$)/i.test(str) str='"'+str+'"';
      return str;
    },
  };

  function FieldTerm(field, subterm) {
    this.field = field;
    this.subterm = subterm;
  }
  FieldTerm.prototype = {
    toString: function() {
      return this.field + ':' + subterm;
    },
  };

  function RangeTerm(min, max) {
    this.min = min;
    this.max = max;
  }
  RangeTerm.prototype = {
    toString: function() {
      return '[' + this.min + '-' + this.max + ']';
    },
  };

  function NotTerm(subterm) {
    this.subterm = subterm;
  }
  NotTerm.prototype = {
    toString: function() {
      return 'NOT ' + this.subterm;
    },
  };

  function GroupTerm(mode, subterms) {
    this.mode = mode;
    this.subterms = [];
    for (var i = 1; i < subterms.length; i++) {
      if (subterms[i] instanceof GroupTerm && subterms[i].)
    }
  }
  GroupTerm.prototype = {
    toString: function() {
      if (this.subterms.length < 2) {
        return '' + (this.subterms[0] || '');
      }
      return '(' + this.subterms.join(' ' + this.mode + ' ') + ')';
    },
  };

  function Search() {
    this.terms = [];
    this.fields = ['identifier', 'date', 'title'];
  }
  Search.prototype = {
    initFrom: function(search) {
      this.terms = search.terms.slice();
      this.fields = search.fields.slice();
      this.sortBy = search.sortBy;
      this.sortDir = search.sortDir;
      this.requestedCount = search.requestedCount;
      return this;
    },
    term: function(field, wordOrPhrase) {
      if (arguments.length === 1) {
        this.terms.push(new Term(arguments[0]));
      }
      else {
        this.terms.push(new FieldTerm(field, new Term(wordOrPhrase)));
      }
      return this;
    },
    range: function(field, min, max) {
      if (!min) switch (field) {
        case 'identifier':
          min = '.';
          break;
        case 'date':
        case 'publicdate':
          min = '0000';
          break;
      }
      if (!max) switch (field) {
        case 'identifier':
          max = '~';
          break;
        case 'date':
        case 'publicdate':
          max = '9999';
          break;
      }
      return new FieldTerm(field, new RangeTerm(min, max));
    },
    and: function() {
      this.term.apply(this, arguments);
      this.terms.push(new GroupTerm('AND', this.terms.splice(this.terms.length-2, 2)));
      return this;
    },
    andNot: function() {
      this.term.apply(this, arguments);
      this.terms[this.terms.length-1] = new NotTerm(this.terms[this.terms.length-1]);
      this.terms.push(new GroupTerm('AND', this.terms.splice(this.terms.length-2, 2)));
      return this;
    },
    or: function() {
      this.term.apply(this, arguments);
      this.terms.push(new GroupTerm('OR', this.terms.splice(this.terms.length-2, 2)));
      return this;
    },
    orNot: function() {
      this.term.apply(this, arguments);
      this.terms[this.terms.length-1] = new NotTerm(this.terms[this.terms.length-1]);
      this.terms.push(new GroupTerm('OR', this.terms.splice(this.terms.length-2, 2)));
      return this;
    },
    getTermString: function() {
      return this.terms.sort().join(' ');
    },
    getParameters: function(mode) {
      var parameters = [
        {name:'q', value:this.getTermString()},
        {name:'output', value:'json'},
      ];
      if (mode === 'stats') parameters.push(
        {name:'fl[]', value:'identifier,publicdate'},
        {name:'rows', value:1},
      );
      else parameters.push(
        {name:'fl[]', value:this.fields.join(',')},
        {name:'rows', value:this.requestedCount}
      );
      return parameters;
    },
    sortBy: 'publicdate',
    sortDir: 'asc',
    startFrom: function(start) {
      if (this.sortDir === 'desc') {
        this.range(this.sortBy, null, start);
      }
      else {
        this.range(this.sortBy, start, null);
      }
      return this;
    },
    requestCount: function(count) {
      this.requestedCount = count;
    },
    requestedCount: 200,
    sort: function(field, dir) {
      this.sortBy = field;
      this.sortDir = dir;
      return this.required(field);
    },
    required: function() {
      for (var i = 0; i < arguments.length; i++) {
        if (this.fields.indexOf(arguments[i]) === -1) {
          this.fields.push(arguments[i]);
        }
      }
      return this;
    },
    getQueryString: function(mode) {
      return this.getParameters(mode).map(function(param) {
        return encodeURIComponent(param.name) + '=' + encodeURIComponent(param.value);
      }).join('&');
    },
    getURL: function(mode) {
      return '//archive.org/advancedsearch.php?' + this.getQueryString(mode);
    },
    get key() {
      return this.sortBy + ' ' + this.sortDir + '/' + this.getTermString();
    },
    downloadResults: function() {
      return jsonp(this.getURL())
      .then(function(data) {
        throw new Error('NYI');
      });
    },
    getStats: function() {
      return jsonp(this.getURL('stats'))
      .then(function(returned) {
        var last = returned.response.docs[0] || {};
        return {
          lastIdentifier: last.identifier,
          lastDate: last.publicdate,
          totalCount: returned.response.numFound,
        };
      });
    },
    getResults: function() {
      var self = this;
      return iaStorage.getStored('search', this.key)
      .then(function(savedSearch) {
        if (!savedSearch) return self.downloadResults();
        throw new Error('NYI');
        self.getStats().then(function(stats) {
          // if the set has changed, clear the cached results
          // TODO: if it looks like additions only, attempt to incorporate
          // them, using lastDate as the lower bound
          if (stats.lastIdentifier !== savedSearch.lastIdentifier
          || stats.totalCount !== savedSearch.totalCount) {
            iaStorage.deleteStored('search', this.key);
          }
        });
      });
    },
  };

  iaStorage.Search = Search;

  return iaStorage;

});
