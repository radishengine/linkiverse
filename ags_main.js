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
  iaItems.populate();
  var identifiers = Object.keys(iaItems.set);
  var list = [];
  for (var i = 0; i < identifiers.length; i++) {
    list.push(new Promise(function(resolve, reject) {
      require(['storage/ia!'+identifiers[i]], function(item) {
        var collections = [].concat(item.collection || []).filter(function(collection) {
          if (collection === 'adventuregamestudio') return false;
          if (collection === 'classicpcgames') return false;
          if (collection === 'software') return false;
          if (collection === 'softwarelibrary') return false;
          return true;
        });
        var subjects = [].concat(item.subject || []).filter(function(subject) {
          subject = subject.toLowerCase();
          if (subject === 'adventure game studio games') return false;
          return true;
        });
        var title = item.title;
        var entries = [];
        if (collections.indexOf('realityonthenorm') !== -1) {
          entries.push('reality-on-the-norm/'+(item.date+'').slice(0,4) + '/' + item.identifier);
        }
        if (collections.indexOf('magscompetitiongames') !== -1) {
          var year, month, topic, winner, yearWinner;
          for (var i = 0; i < subjects.length; i++) {
            winner = winner || /^mags winners$/i.test(subjects[i]);
            var match = subjects[i].match(/^MAGS (\d{4})-(\d{2}) (.*)$/i);
            if (match) {
              year = +match[1];
              month = +match[2];
              topic = match[3];
            }
            if (/^mags favourite of the year$/.test(subjects[i])) {
              yearWinner = true;
            }
          }
          if (year) {
            entries.push('mags/'+year+'-'+('0' + month).slice(-2)+'/'+item.identifier + (winner?' (*)':'') + (yearWinner?' (**)':''));
          }
        }
        for (var i = 0; i < subjects.length; i++) {
          var series = subjects[i].match(/^(.*) series$/);
          if (series) {
            series = series[1].toLowerCase().replace(/ /g, '-');
            entries.push(series + '/' + item.identifier);
          }
          var fangame = subjects[i].match(/^(.*) fangames$/);
          if (fangame) {
            fangame = fangame[1].toLowerCase().replace(/ /g, '-');
            entries.push('fangames/' + fangame + '/' + item.identifier);
          }
          if (/^ags award nominees$/i.test(subjects[i])) {
            var year;
            var categories = [];
            var winCategories = [];
            for (var j = 0; j < subjects.length; j++) {
              var match = subjects[j].match(/^AGS Awards (\d+)$/i);
              if (match) year = +match[1];
              match = subjects[j].match(/^AGS (.+) Award (nominees|winners)$/i);
              if (match) {
                if (match[2]) {
                  winCategories.push(match[1]);
                }
                if (categories.indexOf(match[1]) === -1) {
                  categories.push(match[1]);
                }
              }
            }
            if (year) {
              if (winCategories.length !== 0) {
                entries.push('awards/'+year+'/winners/' + item.identifier);
                for (var j = 0; j < winCategories.length; j++) {
                  entries.push('awards/' + winCategories[j].toLowerCase().replace(/ /g, '-') + '/' + item.identifier);
                }
              }
              for (var j = 0; j < categories.length; j++) {
                entries.push(
                  'awards/'+year+'/nominees/'+categories[j].toLowerCase().replace(/ /g, '-')
                  +'/'+item.identifier
                  +(winCategories.indexOf(categories[j])!==-1?' (*)':'')))
              }
            }
          }
        }
        if (entries.length === 0) {
          entries.push((item.date+'').slice(0,4) + '/' + item.identifier);
        }
        resolve(entries.join('\n'));
      });
    }));
  }
  Promise.all(list).then(function(list) {
    list = list.join('\n').split('\n').sort();
    for (var i = 0; i < list.length; i++) {
      console.log(list[i]);
    }
  });
});
