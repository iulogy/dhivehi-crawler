var async = require('async');
var request = require('request');

module.exports = function(fn){
	async.waterfall([
		function(cb){
			// download http://api.haveeru.com.mv/articles/list
			// parse
			// cb(null, result)
			request("http://api.haveeru.com.mv/articles/list", function(err,raw,body){
				var parsed = JSON.parse(body);
				var articles = parsed.items;
				for(var i=0; i<articles.length; i++){
					delete articles[i].image_data;
				}
				cb(null,articles);
				//console.log(JSON.stringify(articles));
			})
		},
		function(articles, cb){
			// get article of each result
			// cb(null, result)
			console.log(articles);
			cb(null,articles)
		}
	],fn);
}
