
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
        return el;
      },
      events: {
        click: function suggestion_click(e) {
          if (e.button !== 0) return;
          var range = document.createRange();
          range.selectNodeContents(this);
          window.getSelection().addRange(range);
          if (document.execCommand('copy')) {
            window.getSelection().removeAllRanges();
          }
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
      for (var e in commando.events) {
        div.addEventListener(e, commando.events[e]);
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
        var el = commando.suggestion.create(suggestion);
        this.appendChild(el);
        return el;
      },
      onvar: function(callback) {
        function onNewVar(e) {
          callback(e.detail.name, e.detail.value);
        }
        window.addEventListener('newvar', onNewVar);
      },
      dragCount: 0,
    },
    complexProperties: {
    },
    events: {
      dragenter: function commando_dragenter(e) {
        e.preventDefault();
        if (++this.dragCount === 1) {
          this.classList.add('dropping');
        }
      },
      dragleave: function commando_dragleave(e) {
        e.preventDefault();
        if (--this.dragCount === 0) {
          this.classList.remove('dropping');
        }
      },
      dragover: function commando_dragover(e) {
        e.preventDefault();
      },
      drop: function commando_drop(e) {
        e.preventDefault();
        this.dragCount = 0;
        this.classList.remove('dropping');
        var files = e.target.files || e.dataTransfer.files;
        for (var i = 0; i < files.length; i++) {
          this.dispatchEvent(new CustomEvent('upload', {
            detail: { upload: files[i], },
          }));
        }
      },
    },
  };
  
  return commando;
  
});
