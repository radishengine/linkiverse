
require(['commando', 'sudz'], function(commando, sudz) {
  
  'use strict';
  
  console.log('hello linkiworld');

  commando = commando.open(document.body, 'Linkiverse');
  
  commando.suggest('var lc = LinkConstraint.domain("youtube.com");');
  
  commando.onvar(function(varName, varValue) {
    commando.suggest('console.log(' + varName + ');');
  });
  
  window.uploads = [];
  commando.addEventListener('upload', function commando_upload(e) {
    var upload = e.detail.upload;
    if (/\.sudz$/i.test(upload.name)) {
      sudz.fromBlob(upload)
      .then(function(sudzUpload) {
        window.uploads.push(window.uploads.last = sudzUpload);
      });
    }
    else {
      window.uploads.push(window.uploads.last = upload);
    }
  });

});
