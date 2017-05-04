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
        if (subject === 'Adventure Game Studio games') return false;
        return true;
      });
      var title = item.title;
      var mediatype = item.mediatype;
      console.log(title, mediatype, collections, subjects);
    });
  }
});
