requirejs.config({
  waitSeconds: 0,
  enforceDefine: true,
});

requirejs(['require'
  ,'storage/ia!(collection:adventuregamestudio AND mediatype:software)'
],
function(require
  ,iaItems
) {
  console.log(iaItems);
});
