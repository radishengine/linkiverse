
require(['commando'], function(commando) {
  
  'use strict';
  
  console.log('hello linkiworld');

  commando = commando.open(document.body, 'Linkiverse');
  
  commando.suggest('var lc = LinkConstraint.domain("youtube.com");');

});
