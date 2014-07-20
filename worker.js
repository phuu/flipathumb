var OAuth = require('oauth');
var http = require('http');
var argv = require('minimist')(process.argv.slice(2));
var fs = require('fs');

var API_BASE = 'https://api.twitter.com/1.1';
var IMG_BASE = 'https://pic.twitter.com';

var IMAGES = {
    yes: '/Y6ylDTHV24',
    no: '/4o3ABI8svx'
};

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

var oauth = new OAuth.OAuth(
    'https://api.twitter.com/oauth/request_token',
    'https://api.twitter.com/oauth/access_token',
    argv.app_key,
    argv.app_secret,
    '1.0A',
    null,
    'HMAC-SHA1'
);

/**
 * tweetToQueryString() converts a tweet Object into query string format
 *
 * tweet        Object - the tweet to be parsed as a query string
 * returns      String - the string to be appended to the POST request to the Twitter API
 */
function tweetToQueryString(tweet) {
    return Object.keys(tweet)
            .map(function (prop) { return prop + '=' + encodeURIComponent((tweet[prop] || '')); })
            .join('&');
}

/**
 * replyToTweet() replies to a tweet with any of the images on `IMAGES`
 *
 * mention      Object - the tweet we're replying to (or answering).
 */
function replyToTweet(mention) {
    if (typeof mention === 'undefined') return;

    var keys = Object.keys(IMAGES);

    // the answer from @flipathumb
    var tweet = {
        status: template('@{{user}} {{base}}{{id}} {{random}}', {
            user: mention.user.screen_name,
            base: IMG_BASE,
            id: IMAGES[keys[~~(Math.random() * keys.length)]],  // gets a random image url
            random: '?' + ~~(Math.random() * 1000000) // adds a query string with a random number to avoid duplicate tweets filter
        }),
        in_reply_to_status_id: mention.id_str || ''
    };

    oauth.post(
        twitter('/statuses/update.json?') + tweetToQueryString(tweet),
        argv.user_token,
        argv.user_secret,
        '',
        'application/x-www-form-urlencoded',
        function (err, data, res) {
            console.log('replying to', mention.user.screen_name, 'with', tweet.status);
            if (data.errors) {
                fs.writeFileSync('./errors.log', newSinceId);
            }
        }
    );
}

function get(lastSinceId) {
    console.log('=== get ================')
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
            // console.log('headers === \n', res.headers);
            data = JSON.parse(data);
            if (data.errors) {
                // Errors :(
                console.log.apply(console, data.errors.map(function (e) {
                    return template('Error {{code}}: {{message}}', e);
                }));
            } else {
                // Reply to relevant tweets
                data.filter(function (tweet) {
                    return !!tweet.text.match(/\#ask/);
                }).forEach(replyToTweet);
            }

            // Remember what Tweets we have processed
            var newSinceId = (data.length ? data[0].id_str : lastSinceId);
            fs.writeFileSync('./memory', newSinceId);

            var ratelimit = {
                remaining: parseInt(res.headers['x-rate-limit-remaining'], 10),
                reset: parseInt(res.headers['x-rate-limit-reset'], 10) * 1000
            };
            var timeToReset = ratelimit.reset - Date.now();

            // If we have been rate limited, wait until the window has been reset to poll again
            var pollInterval = Math.min(
                Math.ceil(timeToReset / ratelimit.remaining),
                timeToReset
            );

            console.log('Next poll in %ds \n', pollInterval / 1000);

            // Do the polling thang
            setTimeout(
                get.bind(null, newSinceId),
                pollInterval
            );
        }
    );
}

get((fs.readFileSync('./memory').toString() || '1'));
