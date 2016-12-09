
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
  
  var refKeys = Object.keys(window);
  window.setInterval(function() {
    var i = 0;
    varloop: for (var k in window) {
      if (!window.hasOwnProperty(k)) continue;
      if (k !== refKeys[i]) {
        while (i < refKeys.length) {
          window.dispatchEvent(new CustomEvent('delvar', {
            detail: { name:refKeys.splice(i, 1)[0], },
          }));
        }
        refKeys.push(k);
        window.dispatchEvent(new CustomEvent('newvar', {
          detail: { name:k, value:window[k], },
        }));
      }
      i++;
    }
  }, 250);
  
  var commando = {
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
        var el = document.createElement('DIV');
        el.className = 'suggestion';
        el.innerText = suggestion;
        this.appendChild(el);
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
