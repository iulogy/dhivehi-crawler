#!/usr/bin/env node

var program = require('commander');
var async = require('async')
var _ = require('underscore');
var sites = require('./sources.json');
var Scraper = require('./lib/crawler');
var Indexer = require('./lib/indexer');
var mongoose = require('mongoose');
var db = mongoose.connect("mongodb://127.0.0.1/scrapes");
var colors = require('colors');
var redis = require('redis');
var url = require('url');

redis = redis.createClient();

var orig = console.log;
console.log = function(m) {
    var msgs = [];
    while(arguments.length) {
        msgs.push("wow".grey.inverse + ': ' + [].shift.call(arguments));
    }
    orig.apply(console,  msgs);
};

console.info = function(m) {
    var msgs = [];
    while(arguments.length) {
        msgs.push("wow".green.inverse + ': ' + [].shift.call(arguments));
    }
    orig.apply(console,  msgs);
};

var page_schema = mongoose.Schema({
	_id:'ObjectId',
	versions:'array'
},{strict:false});

console.log(" .----------------.  .----------------.  .----------------. ");
console.log("| .--------------. || .--------------. || .--------------. |");
console.log("| | _____  _____ | || |     ____     | || | _____  _____ | |");
console.log("| ||_   _||_   _|| || |   .'    `.   | || ||_   _||_   _|| |");
console.log("| |  | | /\\ | |  | || |  /  .--.  \\  | || |  | | /\\ | |  | |");
console.log("| |  | |/  \\| |  | || |  | |    | |  | || |  | |/  \\| |  | |");
console.log("| |  |   /\\   |  | || |  \\  `--'  /  | || |  |   /\\   |  | |");
console.log("| |  |__/  \\__|  | || |   `.____.'   | || |  |__/  \\__|  | |");
console.log("| |              | || |              | || |              | |");
console.log("| '--------------' || '--------------' || '--------------' |");
console.log(" '----------------'  '----------------'  '----------------' ");
var Page = mongoose.model('pages', page_schema);
program
.version('0.0.1')
.option('-m, --max', 'Use maximum number of cores available')

program
.command('count')
.description('count number of pages scraped')
.action(function(url){
	Page
	.count()
	.exec(function(err, count){
		console.log(count);
		process.exit();
	});
});
program
.command('fetch [url]')
.description('fetch content')
.action(function(url){
	if(url){
		Scraper.download(url);
	}else{
		fetch();
	}
});
program
.command('start')
.description('start crawling')
.action(function(url){
	console.info("starting crawler");
	Scraper.start(function(data){
		if(data == null){
			return;
		}
		Page
		.findOne({url:data.url})
		.lean()
		.exec(function(err, page){
			if(!page){
				return new Page(data).save(function(err, p){
					console.info('saved new page - ' + data.url);
				});
			}
			if(page._resHash != data._resHash){
				console.log('duplicate page - ' + data.url );
			}else{
				var pid = new String(page._id).toString();
				delete page.versions;
				delete page._id
				Page.update({_id:new mongoose.Types.ObjectId(page.pid)}, {$push:{versions:page}}, function(err,p){
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
});
program
.command('sources')
.description('Get current sources')
.action(function(time){
	for(var i in sites){
		console.log(i);
	}
	process.exit();
});
program
.command('read <url>')
.description('get url data')
.action(function(url){
	Page.findOne({url:url}, function(err, page){
		if(err) throw err;
		if(!page){
			console.error("Error".red + url + " not found");
		}else{
			console.log(page);
		}
		process.exit();
	});
});
program
.command('links <url> [query]')
.description('extract urls for crawling')
.action(function(link, query){
	console.log(new RegExp(link));
	var p = Page
	.find({url:new RegExp(link)})
	.lean()
	.stream();
	p.on('data', function(data){
		if(!data){
			console.error("Error".red + link + " not found");
		}else{
			var p = Scraper.select(data._raw, query || "a");
			var jobs = _.map(p, function(el){
				//console.log(el.attribs.href, data.url);
				return {
					url:url.resolve(link,el.attribs.href),
					title:el.attribs.href,			
					data:{}
				}
			});
			Indexer.addJobs('haveeru', jobs, function(){});

		}
	});
	p.on('close', function(){
		//process.exit();
	});
});
program
.command('test <data>')
.description('get url data')
.action(function(data){
	console.log(data);
});
program
.command('label <label> <url>')
.description('add label to matching url (regexp match)')
.action(function(label, url){
	Page.update({url:new RegExp(url)},{$set:{label:label}}, {multi:true}, function(err, res){
		if(err) throw err;
		console.log(res);
		process.exit();
	});
});
program
.command('normalize <label>')
.description('parses fetched raw data')
.action(function(label){
	
	var s = Page
	.find({label:label})
	.lean()
	.stream();
	
	var missing = [];
	var i = 0;
	
	s.on('data', function(data){
		//var p = data.url.split("/").pop();
		//missing.push(p);
		
		//console.log((i++) + " - " +  p);
		
		
		var up = Scraper.scrape(data._raw, sites[label], data.url);
		delete up['_raw'];
		delete up['_resHash'];
		delete up['fetchDate'];
		Page.update({url:data.url},{$set:up}, function(err, changed){
			if(err) throw err;
			console.log("normalized " + data.url);
		});
		
	});
	s.on('end', function(){
		process.exit();
	});
	/*
	var missing_links = [];
	redis.lrange('sorted', 0, -1, function(err, sorted){
		var len = parseInt(sorted[sorted.length-1]);
		for(var i=1; i<=len; i++){
			if(sorted.indexOf(''+i) == -1){
				missing_links.push(i);
			}
		}
		var jobs = _.map(missing_links, function(url){
			return {
				url:"http://haveeru.com.mv/dhivehi/news/" + url,
				title:"http://haveeru.com.mv/dhivehi/news/" + url,			
				data:sites.haveeru
			}
		});
		Indexer.addJobs('haveeru', jobs, function(){
			process.exit();
		});

	});
	*/
});
program
.command('sequence <url> <min> <max>')
.description('Get current sources')
.action(function(url, min, max){
	var urls = [];
	for(var i=parseInt(min); i<=parseInt(max);i++){
		urls.push(url.replace(':num',i));
	}
	var jobs = _.map(urls, function(url){
		return {
			url:url,
			title:url,			
			data:{}
		}
	});
	Indexer.addJobs('haveeru', jobs, function(){
		process.exit();
	});
});

program
.command('add <url>')
.description('add a url')
.action(function(url){
	if(!url) throw Error("No URL provided");
	console.log(url);
	var job = {
		url:url,
		title:url,			
		data:{}
	}
	Indexer.addJobs('haveeru', [job], function(){
		process.exit();
	});
});

program
.command('remove <label>')
.description('remove pages matching the label')
.action(function(label){
	if(!label) throw Error("No label provided");
	Page.remove({label:label}, function(){
		console.log(arguments);
		process.exit();
	});
});

var i = 1;

program
.command('que-clear')
.description('remove all jobs from que')
.action(function(label){
	var kue = require('kue');
	jobs = kue.createQueue();
	jobs.process('haveeru', 20, function(job, done){
		process.stderr.clearLine();
		process.stderr.cursorTo(0);
		process.stderr.write('removing ' + i);
		job.remove(function(err){
		done();
		i++;		
		});
	});
});

program.parse(process.argv);


function fetch(){
	var sources = _.keys(sites);
	sources = sources.reverse();
	async.eachLimit(
		sources,
		4,
		function(item, callback){
			var scraper = new Indexer.Scraper(sites[item]);
			scraper.scrape(function(err, data){
				callback(null, null);
			});
			scraper.on("new item", function(data){
			});
			
		},e
	)	
	function e(err, res){
		process.exit();
	}
}

