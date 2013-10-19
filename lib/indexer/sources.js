
var util = require('util');
var events = require("events");
var $ = require('jquery');
var request = require('request');
var async = require('async')
var fs = require('fs')
var _ = require('underscore'); 
var expect = require('expect.js');
var colors = require('colors');
var jsdom = require('jsdom');
var kue = require('kue');

var jobs = kue.createQueue();

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
	if(self.archive){
		if(self.data.archive){
			var from = self.data.archive.from;
			var to = self.data.archive.to;
			var url = self.data.archive.url;
			expect(from).to.be.ok();
			expect(to).to.be.ok();
			expect(url).to.be.a('string');
			
			var urls = [];
			//var breaks = url.match(/:([\w\d]+)/g);
			//expect(breaks).to.be.ok();

			for(var i=from; i<=to;i++){
				urls.push(url.replace(':num',i));
			}
			
			return fn(null,urls);
		}
		return fn(null, []);	
	}
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
	//var client = redis.createClient();
	//client.sadd('articles::sources', self.label, redis.print)
	//fetch data
	this.getList(function(err, new_urls){
		var urls = self.generateSequence(new_urls);
		if(urls.length == 0){
			return fn(null, null);
		}
		_.each(urls, function(url){
			jobs.create('haveeru', {
				title:url,
				url:url,
				data:self.data
			}).attempts(100).save();		
		});
		console.log("added " +  urls.length + " pages for crawling");
	});
}
exports.addJobs = function(label, arr, fn){
	async.eachLimit(
		arr,
		100,
		function(job, done){
			jobs.create(label,job).attempts(100).save(done);
		}, function(err){
			if(err) throw err;
			console.log("added " + arr.length + " jobs");
			fn();
		}
	);
}
exports.Scraper = Scraper;

