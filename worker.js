var oauth = require('oauth');
var http = require('http');
var argv = require('minimist')(process.argv.slice(2));
var fs = require('fs');

var API_BASE = 'https://api.twitter.com/1.1';
function template(str, o) {
    return str.replace(/{{([a-z_$]+)}}/gi, function (m, k) {
        return (typeof o[k] !== 'undefined' ? o[k] : '');
    });
}

function twitter(path, extra) {
    return template('{{base}}{{path}}', {
        base: API_BASE,
        path: path
    });
}

var oauth = new oauth.OAuth(
  'https://api.twitter.com/oauth/request_token',
  'https://api.twitter.com/oauth/access_token',
  argv.app_key,
  argv.app_secret,
  '1.0A',
  null,
  'HMAC-SHA1'
);

function replyToTweet() {
    var data = {};
    oauth.post(
        twitter('/statuses/update.json'),
        argv.user_token,
        argv.user_secret,
        JSON.stringify(data),
        'mime-type',
        function () {}
    );
}

function get(lastSinceId) {
    console.log('lastSinceId', lastSinceId);
    oauth.get(
        twitter(
            template('/statuses/mentions_timeline.json?since_id={{since}}', {
                since: lastSinceId
            })
        ),
        argv.user_token,
        argv.user_secret,
        function (err, data, res) {
            var ratelimit = {
                remaining: parseInt(res.headers['x-rate-limit-remaining'], 10),
                reset: parseInt(res.headers['x-rate-limit-reset'], 10) * 1000
            };
            var timeToReset = ratelimit.reset - Date.now();
            console.log('timeToReset', timeToReset);
            var pollInterval = Math.ceil(timeToReset / ratelimit.remaining);
            console.log('pollInterval', pollInterval);
            data = JSON.parse(data);
            if (data.errors) {
                console.log.apply(console, data.errors.map(function (e) {
                    return template('Error {{code}}: {{message}}', e);
                }))
            } else {
                data.filter(function (tweet) {
                    return !!tweet.text.match(/\#ask/);
                }).forEach(replyToTweet);
            }
            var newSinceId = (data.length ? data.slice(-1)[0].id_str : lastSinceId);
            fs.writeFileSync('./memory', newSinceId);
            setTimeout(
                get.bind(null, newSinceId),
                pollInterval
            );
        }
    )
}

get((fs.readFileSync('./memory').toString() || '1'));
