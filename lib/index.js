var request = require('request');
var $ = require('jquery');
var events = require('events').EventEmitter;
var util = require('util');
var async = require('async')
var _ = require('underscore');
colors = require('colors');
var sites = require('./sources.json');
var Scraper = require('./sources');
var fs = require('fs');

var Site = function(){
	this.requestLimit = 10;
	events.call(this);
}
util.inherits(Site, events);

Site.prototype.fetch = function(){
	var self = this;
	var sources = _.keys(sites);
	sources = sources.reverse();
	console.log(sources)
	async.mapSeries(
		sources, 
		function(item, callback){
			var scraper = new Scraper.Scraper(sites[item]);
			scraper.scrape(function(err, data){
				callback(null, data);
			})
			
		},e
	)	
	function e(err, res){
		var data = {};
		res.forEach(function(e){
			for(var i in e){
				data[i] = e[i];
			}
		})
		
		//expose data
		self.emit('fetch', data);
	}
}


 exports.site = Site
 
//sync commands

exports.reset = function(){
	for(var source in sources){
		delete sources[source].lastfetch;
	}
	fs.writeFileSync(__dirname + '/sources.json', JSON.stringify(sources, true, 3));
	console.log('-- reset source.json'.green.bold);
}

