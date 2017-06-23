
define(['idb!nodebase'], function(db) {

  'use strict';
  
  var nodebase = {};
  
  nodebase.findRoot = function(node) {
    for (; node; node = node.parentNode) {
      if ('nodebaseRoot' in node) return node.nodebaseRoot;
    }
    return Promise.resolve(null);
  };
  
  nodebase.initRoot = function(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      throw new TypeError('not an element');
    }
    if ('nodebaseRoot' in element) return element.nodebaseRoot;
    return element.nodebaseRoot = new Promise(function(resolve, reject) {
      if ('key' in element.dataset) {
        
      }
    });
  };
  
  function DomVersion(rootElement) {
    this.rootElement = rootElement;
  }
  DomVersion.prototype = {
    init: function() {
    },
  };
  
  nodebase.Doc = Doc;
  
  nodebase.db = db;
  
  nodebase.getAllRoots = function() {
    return new Promise(function(resolve, reject) {
      var transaction = db.transaction('readonly');
      var result = [];
      transaction.oncomplete = function() {
        resolve(result);
      };
      transaction.onabort = function() {
        reject();
      };
      var nodeStore = transaction.objectStore('nodes');
      nodeStore.index('root').openKeyCursor().onsuccess = function(e) {
        var cursor = e.target.result;
        if (!cursor) return;
        if (cursor.key === cursor.primaryKey) {
          result.push({key:cursor.key, record:cursor.value});
        }
        else {
          nodeStore.openCursor(IDBKeyRange.only(cursor.key))
          .onsuccess = function(e) {
            var cursor = e.target.result;
            if (cursor) result.push({key:cursor.key, record:cursor.value});
          };
        }
        cursor.continue();
      };
    });
  };
  
  nodebase.getRootById = function(id) {
    return new Promise(function(resolve, reject) {
      var transaction = db.transaction('readonly');
      var nodesById = transaction.objectStore('nodes').index('id');
      nodesById.openCursor(IDBKeyRange.only(id)).onsuccess = function(e) {
        var cursor = e.target.result;
        if (!cursor) {
          resolve(null);
        }
        else if (cursor.primaryKey !== cursor.value.root) {
          cursor.continue();
        }
        else {
          resolve({key:cursor.key, record:cursor.value});
        }
      };
    });
  };
  
  nodebase.getRootByKey = function(key) {
    return new Promise(function(resolve, reject) {
      var transaction = db.transaction('readonly');
      var nodes = transaction.objectStore('nodes');
      nodes.openCursor(IDBKeyRange.only(key)).onsuccess = function(e) {
        var cursor = e.target.result;
        resolve(cursor ? {key:cursor.key, record:cursor.value} : null);
      };
    });
  };
  
  nodebase.createRecord = function(element) {
    var record = {nodeName:element.nodeName};
    for (var i = 0; i < element.attributes.length; i++) {
      var attr = element.attributes[i];
      if (!attr.specified || /^(?:class|contenteditable|data-key)$/i.test(attr.name)) continue;
      record[attr.name] = attr.value;
    }
    record.classList = [].slice.apply(element.classList);
    return record;
  };
  
  nodebase.deleteNode = function(transaction, node) {
    var nodes = transaction.objectStore('nodes');
    if (!isNaN(node.dataset.key)) {
      nodes.delete(+node.dataset.key);
    }
    var subnodes = node.querySelector('[data-key]');
    for (var i = 0; i < subnodes.length; i++) {
      nodes.delete(+subnodes[i].dataset.key);
    }
  };
  
  nodebase.initElement = function(el, src) {
    Object.keys(src.record).forEach(function(k) {
      if (/^(?:contenteditable|root|innerHTML|classList)$/i.test(k)) return;
      el.setAttribute(k, src.record[k]);
    });
    el.innerHTML = src.record.innerHTML || '';
    el.dataset.key = src.key;
    return el;
  };
  
  nodebase.createElement = function(src) {
    return this.initElement(document.createElement(src.record.nodeName || 'DIV'));
  };
  
  return nodebase;
  
});
