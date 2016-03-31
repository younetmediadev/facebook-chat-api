var login = require('../index');
login({email: "ynmedia.test.004@gmail.com", password: "ynmedia123"}, function(err, account) {
    if (err) {
        console.log('onLogin', err);
        return;
    }

    account.sendComment('cmt6', 1483435788651394, function(err, res) {
        console.log('comment', err, res);
    });
});