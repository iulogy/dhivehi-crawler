//clear screen
//process.stdout.write ('\u001B[2J\u001B[0;0f')


var events = require('events').EventEmitter;
var async = require('async')
var _ = require('underscore');
var sites = require('./sources.json');
var Scraper = require('./lib');
var mongoose = require('mongoose');
var arg = require('optimist').argv;
var db = mongoose.connect("mongodb://127.0.0.1/scrapes");

var page_schema = mongoose.Schema({
	_id:'ObjectId',
	versions:'array'
},{strict:false});
var Page = mongoose.model('pages', page_schema);

function fetch(){
	var sources = _.keys(sites);
	sources = sources.reverse();
	var archive = arg.archive != undefined;
	console.log(archive);
	async.eachLimit(
		sources,
		4,
		function(item, callback){
			var scraper = new Scraper.Scraper(sites[item]);
			scraper.scrape(function(err, data){
				callback(null, data);
			});
			scraper.on("new item", function(data){
				Page
				.findOne({url:data.url})
				.lean()
				.exec(function(err, page){
					if(!page){
						return new Page(data).save(function(err, p){
							console.log('saved new page - ' + data.url);
						});
					}
					if(page._resHash != data._resHash){
						console.log('duplicate page - ' + data.url );
					}else{
						var pid = new String(page._id).toString();
						delete page.versions;
						delete page._id
						Page.update({_id:new mongoose.Types.ObjectId(page.pid)}, {$push:{versions:page}}, function(err,p){
							console.log(p);
							if(p == 1){
								Page.update({_id:pid},{$set:page}, function(err, pa){
									if(err) throw err;
									console.log('updated - ' + data.url);
								});
							}
						});

					}
				});
			});
			
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
fetch();
