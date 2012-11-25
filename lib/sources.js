var sources = require("./sources.json");
var util = require('util');
var $ = require('jquery');
var request = require('request');
var async = require('async')
var fs = require('fs')
var redis = require('redis');


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
	this.limit = 20; //articles to scrape
	this.history = 100; //articles to save in db
	this.success = [];
}
Scraper.prototype.urlExists = function(url){
	if(!this.data.not_found) return false;
	for(var i=0; i<this.data.not_found.length; i++){
		if(this.data.not_found[i].url == url)
			return true;
	}
	return false;
}
Scraper.prototype.generateSequence = function(){
	var start = this.data.lastfetch;
	var end = start+this.limit;
	var url = this.data.url;
	var urls = this.urls = [];
	var self = this;
	for(var i=start+1;i<end; i++){
		var _url = url.replace(/:id/, i);
		if(this.urlExists(_url) === false)
			urls.push({url:_url, num:i}); 
	}
	//add not found urls
	if(this.data.not_found){
		urls = urls.concat(this.data.not_found);
		this.data.not_found.length = 0;
	}
	//remove duplicates and expired from retrying
	urls = urls.filter(function(elem,pos){
		return urls.indexOf(elem) == pos;
	})
	urls = urls.filter(function(elem){
		console.log(self.data.retry_threshold, elem)
		if(elem.tries){
			if(elem.tries >= self.data.retry_threshold){
				return false;
			}
		}
		return true;
	})
	
	//remove if retry limit is reached
	console.log(urls);
	return urls;
}
Scraper.prototype.updateLastFetch = function(){
	//this.data.lastfetch += val - (this.data.not_found ? this.data.not_found.length : 0);
	var max = this.maxScraped();
	this.data.lastfetch = max ? max : this.data.lastfetch;
	fs.writeFile(__dirname + '/sources.json', JSON.stringify(sources, true, 3), function(err){
		if(err) throw err;
	});
}
//find the lastdocument fetched of the batch
Scraper.prototype.maxScraped = function(){
	var nums = [];
	for(var i=0; i<this.urls.length; i++)
		nums.push(this.urls[i].num);
	var sort = nums.sort(function(a,b){return a-b;});
	var max = sort.pop();
	return max;
}
Scraper.prototype.scrape = function(fn){
	var self = this;
	var urls = this.generateSequence();
	self.data.not_found = [];
	if(!this.label){
		throw Error('label not defined')
	}
	
	//instantiate redis
	var client = redis.createClient();
	client.sadd('articles::sources', self.label, redis.print)
	//fetch data  
	async.mapSeries( 
		urls,
		function(item, callback){
			request(item, function(err, res, body){
				console.log('Scraping ' + item.url);
				if(err || res.statusCode == 404){
					item.tries = item.tries ? item.tries + 1 : 1;
					self.data.not_found.push(item);
					console.log(item.url.red,err);
					return callback(null, null);
				}

				var result = {};
				var doc = $(body);
				//get title
				result.url = item.url;
				if(typeof self.scrapeArticle == 'function'){
					//remove empty tags
					var filter = doc.find('p, div');
					filter.filter(function(){
					    var html = $.trim(this.innerHTML);
					    return html  == "";
					}).remove();
					//trim paragraphs
					doc.find('p, div').each(function(){
						
					})
					result.article = self.scrapeArticle(doc);
					if(result.article === 404){
						item.tries = item.tries ? item.tries + 1 : 1;
						self.data.not_found.push(item);
						console.log((item.url + ' not found').red)
						return callback(err, null);
					}
				}
				if(typeof self.scrapeAuthor == 'function'){
					result.author = self.scrapeAuthor(doc);
				}
				if(typeof self.scrapeDate == 'function'){
					result.date = self.scrapeDate(doc);
				}
				if(typeof self.scrapeTitle == 'function'){
					result.title = self.scrapeTitle(doc);
				}else{
					result.title = doc.find('title').text()
				}
				if(typeof self.scrapeImage == 'function'){
					var img = self.scrapeImage(doc);
					if(img){
						result.images = img;
					}
				}
				if(typeof self.scrapeCategory == 'function'){
					result.category = self.scrapeCategory(doc);
				}
				if(typeof self.scrapeVideo == 'function'){
					var video = self.scrapeVideo(doc);
					result.videos = video;
				}
				self.success.push(item.num);
				//add to redis
				client.lpush('articles:' + self.label, JSON.stringify(result), redis.print);
				//return result
				callback(err, result);
			})
		},
		function(err, data){
			if(err) throw err;
			//remove null values
			
			//remove old values and close redis
			client.ltrim('articles:' + self.label, 0, self.history, function(){
				console.log(arguments);
				client.quit();
			});
			
			data = cleanArray(data);
			self.updateLastFetch();
			var obj = {};
			obj[self.label] = data
			fn(err, obj);
		}
	)
}

/**
 *
 *
 * Haveeru
 *
 */
function Haveeru(){
	//required for parent constructor
	Scraper.call(this);
}
util.inherits(Haveeru, Scraper);
Haveeru.prototype.data = sources.haveeru;
Haveeru.prototype.label = 'haveeru';
Haveeru.prototype.scrapeTitle = function(dom){
	var title = dom.find('title').text().replace('Haveeru Online - ', '');
	return title;
}
Haveeru.prototype.scrapeImage = function(dom){
	var img = dom.find('.gallery li img');
	img = img.attr('src');
	return img;
}
Haveeru.prototype.scrapeArticle = function(dom){
	var article = dom.find('#article').html();
	if(!article){
		article = dom.find('.post-frame').html();
	}
	if(article){
		article = article.replace(/\n|\r/g, "")		
		article = article.replace(/\t/g, "")		
	}else{
		article = 404;
	}
	return article;
}
Haveeru.prototype.scrapeAuthor = function(dom){
	var author = dom.find('.subttl.waheed').text();
	if(author){
		author = author.replace(/\n|\r/g, "")
	}
	return author;
}
Haveeru.prototype.scrapeDate = function(dom){
	var date = dom.find('.date.waheed').text();
	if(date){
		date = date.replace(/\n|\r/g, "")
	}
	return date;
}
Haveeru.prototype.scrapeCategory = function(dom){
	var category = dom.find('.text-theme a').text();
	if(category){
		category = category.replace(/\n|\r/g, "")
	}
	return category;
}
exports.haveeru = Haveeru;

/**
 *
 *
 * Sun
 *
 */
function Sun(){
	//required for parent constructor
	Scraper.call(this);
}
util.inherits(Sun, Scraper);
Sun.prototype.data = sources.sun;
Sun.prototype.label = 'sun';
Sun.prototype.scrapeImage = function(dom){
	var img = dom.find('#gallery_slide img');
	img = img.attr('src');
	return img;
}
Sun.prototype.scrapeArticle = function(dom){
	dom.find(".block.related").remove();
	dom.find("font").remove();
	var article = dom.find('.article_body').html();
	if(article){
		article = article.replace(/\n|\r/g, "")		
		article = article.replace(/\t/g, "")		
	}else{
		article = 404;
	}
	return article;
}
Sun.prototype.scrapeAuthor = function(dom){
	var author = dom.find('.authorinformation .boldtext').text();
	if(author){
		author = author.replace(/\n|\r/g, "")
	}
	return author;
}
Sun.prototype.scrapeDate = function(dom){
	var date = dom.find('.article_attributes.thaana ol').text();
	if(date){
		date = date.replace(/\n|\r/g, "")
	}
	return date;
}
exports.sun = Sun;



/**
 *
 *
 * DhiTV
 *
 */
function DhiTV(){
	//required for parent constructor
	Scraper.call(this);
}
util.inherits(DhiTV, Scraper);
DhiTV.prototype.data = sources.dhitv;
DhiTV.prototype.label = 'dhitv';
DhiTV.prototype.scrapeImage = function(dom){
	var img = dom.find('.sphoto img');
	img = img.attr('src');
	return img;
}
DhiTV.prototype.scrapeArticle = function(dom){
	var article = dom.find('.news').html();
	if(article){
		article = article.replace(/\n|\r/g, "")		
		article = article.replace(/\t/g, "")		
	}else{
		article = 404;
	}
	return article;
}

DhiTV.prototype.scrapeDate = function(dom){
	var date = dom.find('#twipsy').attr("rel");
	if(date){
		date = date.replace(/\n|\r/g, "")
	}
	return date;
}
DhiTV.prototype.scrapeVideo = function(dom){
	var videos = [];
	dom.find('iframe').each(function(){
		if($(this).attr('src').indexOf('youtube.com') !== -1){
			videos.push($(this).attr('src'));
		}
	})
	dom.find('iframe').remove();
	return videos;
}
DhiTV.prototype.scrapeTitle = function(dom){
	var title = dom.find('title').text().replace('- DhiTV', '');
	return title;
}
exports.dhitv = DhiTV;


/**
 *
 *
 * MVYouth
 *
 */
function MVYouth(){
	//required for parent constructor
	Scraper.call(this);
}
util.inherits(MVYouth, Scraper);
MVYouth.prototype.data = sources.mvyouth;
MVYouth.prototype.label = 'mvyouth';
MVYouth.prototype.scrapeImage = function(dom){
	var img = dom.find('#article-image img');
	img = img.attr('src');
	return img;
}
MVYouth.prototype.scrapeArticle = function(dom){
	//remove all attributes
	dom.find('p').each(function(){
		var attributes = this.attributes;
		var i = attributes.length;
		while( i-- ) {
			var attr = attributes[i];
			this.removeAttributeNode(attr);
		}
	});
	var article = dom.find('.content').html();
	if(article){
		article = article.replace(/\n|\r/g, "")		
		article = article.replace(/\t/g, "")		
	}
	if(dom.find('.attachment, .attachment-medium').length > 0){
		console.log('found')
		article = 404;
	}
	return article;
}

MVYouth.prototype.scrapeDate = function(dom){
	var date = dom.find('time').text();
	if(date){
		date = date.replace(/\n|\r/g, "")
	}
	return date;
}

MVYouth.prototype.scrapeTitle = function(dom){
	var title = dom.find('title').text().replace('MvYouth Online |', '');
	return title;
}
exports.mvyouth = MVYouth;

/**
 *
 *
 * VMedia
 *
 */
function VMedia(){
	//required for parent constructor
	Scraper.call(this);
}
util.inherits(VMedia, Scraper);
VMedia.prototype.data = sources.vmedia;
VMedia.prototype.label = 'vmedia';
VMedia.prototype.scrapeImage = function(dom){
	var img = dom.find('.news_view_img img');
	img = img.attr('src');
	return img;
}
VMedia.prototype.scrapeArticle = function(dom){
	var article = dom.find('.news_view_detail:first div').html();
	if(article){
		article = article.replace(/\n|\r/g, "")		
		article = article.replace(/\t/g, "")		
	}else{
		article = 404;
	}
	return article;
}

VMedia.prototype.scrapeDate = function(dom){
	var date = dom.find('.news_view_title div:last').text().trim();
	if(date){
		date = date.replace(/\n|\r/g, "")
	}
	return date;
}

VMedia.prototype.scrapeTitle = function(dom){
	var title = dom.find('title').text().replace('vMedia Online -', '');
	return title;
}
exports.vmedia = VMedia;
