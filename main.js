
require(['commando', 'sudz'], function(commando, sudz) {
  
  'use strict';
  
  console.log('hello linkiworld');

  commando = commando.open(document.body, 'Linkiverse');
  
  commando.suggest('var lc = LinkConstraint.domain("youtube.com");');
  
  commando.onvar(function(varName, varValue) {
    commando.suggest('console.log(' + varName + ');');
  });
  
  window.sudz = sudz;
  
  Blob.prototype.download = function() {
    var link = document.createElement('A');
    link.href = URL.createObjectURL(this);
    document.body.appendChild(link);
    link.click();
  };
  
  sudz.download = function(value) {
    return sudz.makeBlob(value)
    .then(function(blob) {
      blob.download();
    });
  };
  
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
