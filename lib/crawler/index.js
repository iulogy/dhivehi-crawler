var kue = require('kue');
var jobs = kue.createQueue();
var cheerio = require('cheerio');
var domain = require('domain');
var colors = require('colors');
var request = require('request');
var md5 = require('MD5');
var _ = require('underscore');
var lock = require('lockfile');


var lockfile = __dirname + "file.lock";
exports.start = function(fn){
	jobs.process('haveeru', 10, function(job, done){
		download(
			job,
			function(data){
				job.state('completed').save(function(){
					job.remove(function(err){
						if(err) throw err;
						done();
					});
				});
			},
			function(data){
				fn(data);
			},
			function(){
				job.state('inactive').save(function(){
					done("failed");
				});
			}
		);
	});
}

		

function download(job, done, fn, fail){
	var d = domain.create();
	d.on('error', function(er) {
		console.log("ERROR!".red + " " + job.data.url || job.data, er);
		fail();
	});
	d.run(function(){
		var item;
		if(typeof job == 'object'){
			item = job.data.url;
		}else{
			item = job;
		}
		console.log("GET".grey + " " + item);
		request.get(
			{
				timeout:1000*10,
				url:item
			}, function(err, res, body){
			if(err){
				console.log("ERROR!".red + " " + job.data.url || job.data, err);
				fail();
				return fn(null);
			}
			console.log("GET 200".grey + " " + item);
			if(typeof job == 'string'){
				//TODO
				console.log(body);
				if(done){
					return done(null);
				}else{
					return;
				}
			}
			if(job){
				var result = scrape(body, job.data || job, item);
				fn(result);
				return done();
			}
			done();
		});
	});
}
function scrape(body, self, url){
	var result = {}
	if(!self) throw Error("No schema supplied");

	result.label = self.label;	

	var doc = cheerio.load(body);
	
	if(!self.data){
		self.data = self;
	}
	
	if(self.data.remove){
		doc(self.data.remove).remove()
	}
	result.url = url;
	
	//TODO: retrieve contents
	for(var attr in self.data.scrape){
		var att = self.data.scrape[attr];
		if(typeof att == 'string'){
			var html = doc(att).html();
			result[attr] = html ? html.trim() : '';
		}else if(typeof att == "object" && att.selector){
			var els = [];
			var sel = typeof att.selector != 'string' ? att.selector[0] : att.selector;
			doc(sel).each(function(){
				var self = cheerio(this);
				if(att.attribute){
					var attrs = _.compact(att.attribute.split(","));
					attrs.forEach(function(a){
						var t = self.attr(a);
						if(att.replace){
							t = t.replace(new RegExp(att.replace[0],"g"), att.replace[1]);
						}
						if(t){
							els.push(t);
						}
					});
				}else{
					els.push(self.html());
				}

			});
			for(var i=0;i<els.length;i++){
				var text = els[i];
				if(att.clean){
					text = text.match(new RegExp(att.clean));
					els[i] = text[0];
				}
			}
			if(att.flatten){
				els = els.join("");
			}
			if(att.remove){
				doc(att.remove).remove()
			}
			result[attr] = els;
		}
	}
	
	result._resHash = md5(JSON.stringify(result));
	result._rawHash = md5(body);
	result._raw = body;
	result.fetchDate = new Date();
	
	return result;
}
function select(raw, selector){
	var $ = cheerio.load(raw);
	var sel = $(selector);
	return sel;
}
exports.select = select;
exports.scrape = scrape;
exports.download = download;
