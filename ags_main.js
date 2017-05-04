requirejs.config({
  waitSeconds: 0,
  enforceDefine: true,
});

define(['require'
  ,'storage/ia!(collection:adventuregamestudio AND mediatype:software)'
],
function(require
  ,iaItems
) {
  var identifiers = Object.keys(iaItems.set);
  for (var i = 0; i < identifiers.length; i++) {
    require(['storage/ia!'+identifiers[i]], function(item) {
      var collections = [].concat(item.collection || []).filter(function(collection) {
        if (collection === 'adventuregamestudio') return false;
        if (collection === 'classicpcgames') return false;
        if (collection === 'software') return false;
        if (collection === 'softwarelibrary') return false;
        return true;
      });
      var subjects = [].concat(item.subject || []).filter(function(subject) {
        subject = subject.toLowerCase();
        if (subject === 'adventure game studio games') return false;
        return true;
      });
      var title = item.title;
      var existingPath = false;
      if (collections.indexOf('realityonthenorm') !== -1) {
        existingPath = true;
        console.log('realityonthenorm/'+item.identifier);
      }
      if (collections.indexOf('magscompetitiongames') !== -1) {
        existingPath = true;
        console.log('magscompetitiongames/'+item.identifier);
      }
      if (!existingPath) {
        console.log((item.date+'').slice(0,4) + '/' + item.identifier, collections, subjects);
      }
    });
  }
});
