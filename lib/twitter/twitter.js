var twitter = require('ntwitter');
var settings = require("../../settings");
var util = require("util");
var async = require('async');
var mongoose = require('mongoose');
var redis = require("redis");
var rediscon = redis.createClient();
var db = mongoose.createConnection("mongodb://127.0.0.1/tweets");
var user_schema = new mongoose.Schema({
	id:{type:'number', unique:true}
},{strict:false});
var Users = mongoose.model("users", user_schema);
var arg = settings.twitter[0];

var twit_index = 0;
var twit_max = settings.twitter.length;


var twit = new twitter({
    consumer_key: arg.ck,
    consumer_secret: arg.cs,
    access_token_key: arg.atk,
    access_token_secret: arg.ats
});

function Twitter(){
}
Twitter.prototype.friends = function(users, fn){
	async.eachSeries(users, function(user, done){
		twit.getFriendsIds(user, function(err ,res){
			if(err) throw err;
			rediscon.sadd(user, res, function(err, replies){
				done();
			});
		});		
	},function(err){
		rediscon.sinter(users, function(err, common){
			console.log(common.length + " common friends");
			process.exit();
		});
	});
}

Twitter.prototype.info = function(user, fn) {
		twit.getFriendsIds(user, function(err ,res){
			if(err) throw err;
			console.log(res);
			console.log(res.length);
			//Users.save(res);
		});
	// twit.showUser(user, function(err, res){
	// 	console.log(util.inspect(res,3,true));
	// 	console.log("finding users following");
	// 	twit.getFriendsIds(user, function(err ,res){
	// 		console.log(user);
	// 		//Users.save(res);
	// 	});
	// 	console.log("fetching tweets");
	// 	var tweets_count = res.statuses_count;
	// 	var timeline = {
	// 		screen_name:user,
	// 		include_rts:true,
	// 		count:200
	// 	}
	// 	// twit.getUserTimeline(timeline, function(err,res){
	// 	// 	console.log(res.length);
	// 	// })
	// });
};

module.exports = new Twitter();
