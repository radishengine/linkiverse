
define(function() {

  'use strict';

  // http://requirejs.org/docs/faq-advanced.html#css
  
  function loadCss(url) {
      var link = document.createElement("link");
      link.type = "text/css";
      link.rel = "stylesheet";
      link.href = url;
      document.getElementsByTagName("head")[0].appendChild(link);
  }
  
  loadCss('commando.css');
  
});
