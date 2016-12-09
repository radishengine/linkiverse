
require(['commando'], function(commando) {
  
  'use strict';
  
  console.log('hello linkiworld');

  commando = commando.open(document.body, 'Linkiverse');
  
  commando.suggest('var lc = LinkConstraint.domain("youtube.com");');
  
  commando.onvar(function(varName, varValue) {
    commando.suggest('console.log(' + varName + ');');
  });
  
  window.uploads = [];
  commando.addEventListener('upload', function commando_upload(e) {
    window.uploads.push(window.uploads.last = e.detail.upload);
  });

});
