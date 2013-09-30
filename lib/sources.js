var sources = require("./sources.json");
var util = require('util');
var events = require("events");
var $ = require('jquery');
var request = require('request');
var async = require('async')
var fs = require('fs')
var redis = require('redis');
var _ = require('underscore'); 
var fb = require('fb');
var cloudinary = require('cloudinary');
cloudinary.config({ 
  cloud_name: 'iulogy', 
  api_key: '364843429717494', 
  api_secret: 'pLykCoyoLCcq8FFvFc9OVIRGLUk' 
});
function postImage(img, fn){
	cloudinary.uploader.upload(img, fn, {format:'jpg'});
}

function cleanArray(arr){
	var tmp = [];
	for(var i=0;i<arr.length;i++){
		if(arr[i] === null)
			continue
		tmp.push(arr[i]);
	}
	return tmp;
}
function Scraper(source){
	this.limit = 10; //articles to scrape
	this.history = 24; //articles to save in db
	this.success = [];
	this.label = source.label;
	this.data = source;
	events.EventEmitter.call(this);
}

util.inherits(Scraper, events.EventEmitter);

Scraper.prototype.evaluate = function(url, object){
	var url = url;
	for(var i in object){
		if(url.indexOf(":" + i) !== -1){
			url = url.replace(":" + i, eval(object[i]));
		}
	}
	console.log(url);
	return url;
}
Scraper.prototype.getList = function(fn){
	var self = this;
	var link = self.data.evaluate ? this.evaluate(self.data.listing, self.data.evaluate) : self.data.listing;
	request(link, function(err, res, body){
		if(err || res.statusCode == 404){
			console.log("404 " + self.data.listing);
			return fn(err || ("404 " + self.data.listing));
		}
		body = body.replace(/link/g, "lin");
		
		var doc = $(body);
		var urls = doc.find(self.data.enumerate_dom);
		urls = _.map(urls, function(e){
			var url = self.data.attribute ? $(e).attr(self.data.attribute) : $(e).text() ; 
			return self.data.url_prepend ? self.data.url_prepend + url : url;
		}).reverse();
		return fn(null, urls);
	})
}
Scraper.prototype.generateSequence = function(urls){
	var list = this.data.lastfetch;
	return _.difference(urls, list);
}
Scraper.prototype.updateLastFetch = function(fetch){
	//this.data.lastfetch += val - (this.data.not_found ? this.data.not_found.length : 0);
	this.data.lastfetch = fetch;
	fs.writeFile(__dirname + '/sources.json', JSON.stringify(sources, true, 3), function(err){
		if(err) throw err;
	});
}
Scraper.prototype.scrape = function(fn){
	
	var self = this;
	if(!this.label){
		throw Error('label not defined')
	}
	
	//instantiate redis
	var client = redis.createClient();
	client.sadd('articles::sources', self.label, redis.print)
	//fetch data
	this.getList(function(err, new_urls){
		var urls = self.generateSequence(new_urls);
		console.log(urls);
		if(urls.length == 0){
			client.quit();
			return fn(null, {});
		}
		fetch = [];
		async.mapSeries( 
			urls,
			function(item, callback){
				if(self.data.lastfetch && self.data.lastfetch.indexOf(item) !== -1){
					return callback(null,null);
				}
				request(item, function(err, res, body){
					console.log('Scraping ');
					if(err || res.statusCode == 404){
						item.tries = item.tries ? item.tries + 1 : 1;
						return callback(null, null);
					}
					//add date
					var result = {};
					result._raw = body;
					result.fetchDate = new Date();
					
					var doc = $(body);
					
					//remove
					if(self.data.remove){
						$(self.data.remove).remove()
					}
					
					result.url = item;
					//TODO: retrieve contents
					for(var attr in self.data.scrape){
						var att = self.data.scrape[attr];
						if(typeof att == 'string'){
							var html = doc.find(att).html();
							result[attr] = html ? html.trim() : '';
						}else if(typeof att == "object" && att.selector){
							var els = [];
							doc.find(att.selector[0]).each(function(){
								var self = $(this);
								if(att.attribute){
									var t = self.attr(att.attribute);
									if(att.replace){
										t = t.replace(new RegExp(att.replace[0],"g"), att.replace[1]);
									}
									els.push(t);
								}else{
									els.push(self.get(0).outerHTML);
								}
								
							});
							result[attr] = els;
						}
					}
					
					self.emit("new item", result);
					return callback(err, result);
					/*
					end();
					var article = result.article.toString();
					delete result.article;
					
					//add to last batch
					fetch.push(item);
					client.hget(self.label, result.url, function(err,data){
						if(data){
							data = JSON.parse(data);
							//add only content to redis
							client.hset(self.label, result.url, JSON.stringify({article:article}), redis.print);
							return callback(err, null);
						}
						if(result.image_origin.length == 0){
								client.lpush('articles:' + self.label, JSON.stringify(result), redis.print);
								client.hset(self.label, result.url, JSON.stringify({article:article}), redis.print);
								return callback(err, result);
						}

						postImage(result.image_origin, function(res){
							if(res.public_id){
								result.image = res.secure_url;
								result.image_id = res.public_id + ".jpg";
								//add to redis
								client.lpush('articles:' + self.label, JSON.stringify(result), redis.print);
								client.hset(self.label, result.url, JSON.stringify({article:article}), redis.print);
								callback(err, result);
							}else{
								client.lpush('articles:' + self.label, JSON.stringify(result), redis.print);
								client.hset(self.label, result.url, JSON.stringify({article:article}), redis.print);
								return callback(err, result);
							}
						})
						
					});
					*/
				
				})
			},
			function(err, data){
				if(err) throw err;
				console.log(data);
				//remove old values and close redis
				/*
				
				client.lrange('articles:' + self.label, self.history + 1, self.history + 100,  function(err, data){
					data.forEach(function(obj){
						var obj = JSON.parse(obj);
						client.hdel(self.label, obj.url, redis.print);
					});
				});
				
				*/
				
				client.ltrim('articles:' + self.label, 0, self.history, function(){
					client.quit();
				});
				var obj = {};
				obj[self.label] = data
				//self.updateLastFetch(new_urls);
				fn(err, obj);
			}
		)
	});
}

exports.Scraper = Scraper;

