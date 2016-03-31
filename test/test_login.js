/* global process */
/* global __dirname */
var login = require(__dirname + '/../index.js');

//Should set environment user and password here
//export FB_EMAIL=trannhathanh@outlook.xxx
//export FB_PASSWORD=xxxxxxx

var FB_EMAIL    = 'nguyenthianh3469@gmail.com';
var FB_PASSWORD = 'nguyenanh9871$ij';
// Create simple echo bot
login({email: FB_EMAIL, password: FB_PASSWORD}, function callback (err, api) {
    if(err) return console.error(err);
    api.fetchUrl('https://www.facebook.com/549340191884379', {}, function(err, res){
        console.log('fetchUrl:');
        console.log(err, res);
    });
    //Tran Nhat Hanh: 100008458995613 (global) => 1441281989497087 (fake)
	/*api.sendMessage('Phu oi.', "100003069308687", function(err, obj){
		console.log('response: ', err, obj);
	});
    api.getThreadHistory("100003069308687", 0, 20, Date.now(), function(err, data){
        console.log('getThreadHistory:', data);
    });
    api.getThreadList(0, 20, function(err, data){
        console.log('getThreadList: ', data);
    });
    api.listen(function callback(err, message) {
    	console.log(message);
        api.sendMessage(message.body, message.thread_id);
    });
    */
});