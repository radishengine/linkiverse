
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
  
  var globalNames = {};
  var globalNameList = Object.getOwnPropertyNames(window);
  for (var i = 0; i < globalNameList.length; i++) {
    globalNames[globalNameList[i]] = true;
  }
  globalNames.hasOwnProperty = window.hasOwnProperty;
  window.setInterval(function() {
    for (var k in window) {
      if (globalNames.hasOwnProperty(k) || !window.hasOwnProperty(k)) continue;
      globalNames[k] = true;
      window.dispatchEvent(new CustomEvent('newvar', {
        detail: { name:k, value:window[k], },
      }));
    }
  }, 250);
  
  var commando = {
    suggestion: {
      create: function(suggestion) {
        var el = document.createElement('DIV');
        el.className = 'suggestion';
        el.innerText = suggestion;
        Object.assign(el, commando.suggestion.simpleProperties);
        Object.defineProperties(el, commando.suggestion.complexProperties);
        for (var e in commando.suggestion.events) {
          el.addEventListener(e, commando.suggestion.events[e]);
        }
        this.appendChild(el);
      },
      events: {
        click: function suggestion_click(e) {
          this.select();
          document.execCommand('copy');
        },
      },
      simpleProperties: {
      },
      complexProperties: {
      },
    },
    open: function open(container, heading) {
      var div = document.createElement('DIV');
      div.className = 'commando';
      Object.assign(div, commando.simpleProperties);
      Object.defineProperties(div, commando.complexProperties);
      if (heading) {
        div.addHeading(heading);
      }
      container.appendChild(div);
      return div;
    },
    simpleProperties: {
      addHeading: function(heading) {
        var el = document.createElement('H3');
        el.innerText = heading;
        this.appendChild(el);
      },
      suggest: function(suggestion) {
        return commando.suggestion.create(suggestion);
      },
      onvar: function(callback) {
        function onNewVar(e) {
          callback(e.detail.name, e.detail.value);
        }
        window.addEventListener('newvar', onNewVar);
      },
    },
    complexProperties: {
    },
  };
  
  return commando;
  
});
