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
			});
			scraper.on("new item", console.log);
			
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
