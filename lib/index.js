var request = require('request');
var $ = require('jquery');
var events = require('events').EventEmitter;
var util = require('util');
var async = require('async')
var _ = require('underscore');
colors = require('colors');
var sources = require('./sources.json');
var sites = require('./sources');
var fs = require('fs');

var Site = function(){
	this.requestLimit = 10;
	events.call(this);
}
util.inherits(Site, events);

Site.prototype.fetch = function(){
	var self = this;
	var sources = self.sources || _.keys(sites);
	console.log(sources)
	async.mapSeries(
		sources, 
		function(item, callback){
			if(typeof sites[item] != 'function'){
				return self.emit('error', ('Module ' + item + ' not found').red);
			}
			var sc = new sites[item];
			sc.limit = self.requestLimit;
			//sc.getList();
			try{
				sc.scrape(function(err, data){
					callback(null, data);
				})
			} catch(e){
				callback(null, null);
			};
			
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

