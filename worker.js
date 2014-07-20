var MEM_BASE = './memory.json';

var argv = require('minimist')(process.argv.slice(2));
var memory = require(MEM_BASE);
var OAuth = require('oauth');
var http = require('http');
var fs = require('fs');

var API_BASE = 'https://api.twitter.com/1.1';
var IMG_BASE = 'https://pic.twitter.com';

var HASHTAGS = ['THUMBELICIOUS', 'FLIPATHUMB', 'THUMB', 'DECISIONS' , 'HMMMM', 'FOLLOWTHETHUMB'];

var IMAGES = {
    yes: '/Y6ylDTHV24',
    no: '/7PE2iPOMVF'
};

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
 * save() persists the current state of `memory` to a file (`MEM_BASE`)
 */
function save() {
    console.log('saving', memory);
    fs.writeFileSync(MEM_BASE, JSON.stringify(memory));
}

/**
 * template() TODO: TOM
 */
function template(str, o) {
    return str.replace(/{{([a-z_$]+)}}/gi, function (m, k) {
        return (typeof o[k] !== 'undefined' ? o[k] : '');
    });
}

/**
 * twitter() TODO: TOM
 */
function twitter(path, extra) {
    return template('{{base}}{{path}}', {
        base: API_BASE,
        path: path
    });
}

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
 * createReplyTweet() creates a reply tweet with any of the images on `IMAGES`
 *
 * mention      Object - tweet we're replying to (or answering).
 *
 * returns      Object - the tweet to be used as a reply
 */
function createReplyTweet(mention) {
    if (typeof mention === 'undefined') return;

    var keys = Object.keys(IMAGES);

    // the answer from @flipathumb
    return {
        status: template('@{{user}} {{base}}{{id}} #{{hashtag}}', {
            user: mention.user.screen_name,
            base: IMG_BASE,
            id: IMAGES[keys[~~(Math.random() * keys.length)]], // gets a random image url
            hashtag: HASHTAGS[~~(Math.random() * HASHTAGS.length)] // gets a random hashtag
        }),
        in_reply_to_status_id: mention.id_str || ''
    };
}

/**
 * replyToTweet() exactly what it says on the tin
 *
 * mention      Object the tweet to be posted
 */
function replyToTweet(mention) {
    if (argv.no_tweet) {
        return;
    }
    var tweet = createReplyTweet(mention);

    oauth.post(
        twitter('/statuses/update.json?') + tweetToQueryString(tweet),
        argv.user_token,
        argv.user_secret,
        '',
        'application/x-www-form-urlencoded',
        function (err, data, res) {
            console.log('replying to', mention.user.screen_name, 'with', tweet.status);
            memory.answer += 1;
            save();

            console.log(data);
        }
    );
}

/**
 * get() TODO: TOM describe it
 *
 * lastSinceId String - the last mention ID we have processed (to avoid re-processing mentions)
 * TODO: returns?
 */
function get() {
    console.log('=== get ================');
    // console.log(memory.lastSinceId);
    // console.log('memory.lastSinceId', memory.lastSinceId);
    oauth.get(
        twitter(
            template('/statuses/mentions_timeline.json?since_id={{since}}', {
                since: (memory.lastSinceId || '1')
            })
        ),
        argv.user_token,
        argv.user_secret,
        function (err, data, res) {
            // console.log('headers === \n', res.headers);
            try {
                data = JSON.parse(data);
            } catch (e) {
                data = { errors: [ { message: e.stack, code: '' } ] };
            }

            if (data.errors) {
                // Errors :(
                console.error.apply(console, data.errors.map(function (e) {
                    return template('Error {{code}}: {{message}}', e);
                }));
            } else {
                // Reply to relevant tweets
                data.filter(function (tweet) {
                    return !!tweet.text.match(/\#ask/);
                }).forEach(replyToTweet);
            }

            // Remember what Tweets we have processed
            memory.lastSinceId = (data.length ? data[0].id_str : memory.lastSinceId);
            save();

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
                get.bind(null, memory.lastSinceId),
                pollInterval
            );
        }
    );
}

module.exports = {
    IMG_BASE: IMG_BASE,
    HASHTAGS: HASHTAGS,
    create: createReplyTweet,
    run: get
};
