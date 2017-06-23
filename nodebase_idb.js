define(function() {

  return {
    requestConnection: function() {
      var opening = indexedDB.open('nodebase', 1);
      opening.onupgradeneeded = function(e) {
        var db = e.target.result;
        var nodeStore = db.createObjectStore('nodes', {autoIncrement:true});
        nodeStore.createIndex('id', 'id', {unique:false});
        nodeStore.createIndex('root', 'root', {unique:false});
        nodeStore.createIndex('root+id', ['root', 'id'], {unique:true});
        nodeStore.createIndex('root+nodeName', ['root', 'nodeName'], {unique:false});
        nodeStore.createIndex('root+classList', ['root', 'classList'], {multiEntry:true});
      };
      return opening;
    },
  };

});
