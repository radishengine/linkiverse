
define(function() {

  'use strict';
  
  var nodebase = {};
  
  nodebase.getDB = function() {
    return this._gotDB = this._gotDB || new Promise(function(resolve, reject) {
      var opening = indexedDB.open('nodebase', 1);
      opening.onupgradeneeded = function(e) {
        var db = e.target.result;
        var nodeStore = db.createObjectStore('nodes', {autoIncrement:true});
        nodeStore.createIndex('root', 'root', {unique:false});
        nodeStore.createIndex('root+id', ['root', 'id'], {unique:true});
        nodeStore.createIndex('root+nodeName', ['root', 'nodeName'], {unique:false});
        nodeStore.createIndex('root+classList', ['root', 'classList'], {multiEntry:true});
      };
      opening.onerror = function(e) {
        reject();
      };
      opening.onsuccess = function(e) {
        resolve(e.target.result);
      };
    });
  };
  
  nodebase.getAllRoots = function() {
    return this.getDB().then(function(db) {
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
            result.push(cursor.value);
          }
          else {
            result.push(null);
            nodeStore.openCursor(IDBKeyCursor.only(cursor.key))
            .onsuccess = function(e) {
              var cursor = e.target.result;
              if (cursor) result.push(cursor.value);
            };
          }
          cursor.continue();
        };
      });
    });
  };
  
  return nodebase;
  
});
