var w = require('../');
var t = require('tap').test;

var reply = w.create({
  user: { screen_name: 'waltfy' },
  id_str: 'RANDOM_ID'
});

t('generated reply', function (t) {
  t.equal(reply.status[0], '@', 'has user');
  t.assert(reply.status.indexOf(w.IMG_BASE), 'has image url');
  t.assert(reply.status.indexOf('#') > -1, 'has hashtag');
  t.end();
});
