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
      console.log(item);
    });
  }
});
