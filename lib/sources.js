var sources = require("./sources.json");
var util = require('util');
var $ = require('jquery');
var request = require('request');
var async = require('async')
var fs = require('fs')
var redis = require('redis');
var _ = require('underscore'); 
var fb = require('fb');
var cloudinary = require('cloudinary');

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
}
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
	var lastfetch = this.data.lastfetch;
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
					console.log('Scraping ' + item);
					if(err || res.statusCode == 404){
						item.tries = item.tries ? item.tries + 1 : 1;
						return callback(null, null);
					}
					//add date
					var result = {};
					result.fetchDate = new Date();
					
					var doc = $(body);
					//get title
					result.url = item;
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
						/*if(result.article === 404){
							item.tries = item.tries ? item.tries + 1 : 1;
							self.data.not_found.push(item);
							console.log((item + ' not found').red)
							return callback(err, null);
						}*/
					}
					if(typeof self.scrapeAuthor == 'function'){
						result.author = self.scrapeAuthor(doc);
					}
					if(typeof self.scrapeDate == 'function'){
						result.date = self.scrapeDate(doc);
					}
					if(typeof self.scrapeTitle == 'function'){
						result.title = self.scrapeTitle(doc);					
						if(result.title === 404){
							item.tries = item.tries ? item.tries + 1 : 1;
							self.data.not_found.push(item);
							console.log((item + ' not found').red)
							return callback(err, null);
						}
					}else{
						result.title = doc.find('title').text()
					}
					if(typeof self.scrapeImage == 'function'){
						var img = self.scrapeImage(doc);
						console.log(img);
						result.image_origin = img || "";
					}
					if(typeof self.scrapeCategory == 'function'){
						result.category = self.scrapeCategory(doc);
					}
					if(typeof self.scrapeVideo == 'function'){
						var video = self.scrapeVideo(doc);
						result.videos = video;
					}
					//remove article from main object and make it independent
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
Haveeru.prototype.scrapeTitle = function(dom){
	var title = dom.find('.post h1:first').text().trim();
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
	/*if(img.length == 0){
		img = dom.find('#featured img:first');
	}*/
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
Sun.prototype.scrapeTitle = function(dom){
	var title = dom.find('.mainheadline:first').text();
	return title;
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
	console.log(img)
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
	var i = dom.find('.news_view_img img');
	var img;
	if(i.length > 0)
		img = 'http://vmedia.mv' + i.attr('src');
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

/**
 *
 *
 * MVExposed
 *
 */
function MVExposed(){
	//required for parent constructor
	Scraper.call(this);
}
util.inherits(MVExposed, Scraper);
MVExposed.prototype.data = sources.mvexposed;
MVExposed.prototype.label = 'mvexposed';
MVExposed.prototype.scrapeImage = function(dom){
	var img = dom.find('.post_main_img');
	img = img.attr('src');
	return img;
}
MVExposed.prototype.scrapeArticle = function(dom){
	var article = dom.find('.full_text').html();
	if(article){
		article = article.replace(/\n|\r/g, "")		
		article = article.replace(/\t/g, "")		
	}else{
		article = 404;
	}
	return article;
}

MVExposed.prototype.scrapeDate = function(dom){
	var date = dom.find('#post_header small').text();
	if(date){
		date = date.replace(/\n|\r/g, "")
	}
	return date;
}

MVExposed.prototype.scrapeTitle = function(dom){
	var title = dom.find('#post_header h2').text();
	return title;
}
exports.mvexposed = MVExposed;

/**
 *
 *
 * Raajje
 *
 */
function Raajje(){
	//required for parent constructor
	Scraper.call(this);
}
util.inherits(Raajje, Scraper);
Raajje.prototype.data = sources.raajje;
Raajje.prototype.label = 'raajje';
Raajje.prototype.scrapeImage = function(dom){
	var img = dom.find("#imageholder img:first");
	img = img.attr('src');
	return "http://raajje.mv" + img;
}
Raajje.prototype.scrapeArticle = function(dom){
	//remove comment box
	dom.find(".comment-widget").remove();
	var article = dom.find('.columns.eleven').html();
	if(article){
		article = article.replace(/\n|\r/g, "")		
		article = article.replace(/\t/g, "")		
	}else{
		article = 404;
	}
	article = article.trim();
	return article;
}


Raajje.prototype.scrapeTitle = function(dom){
	var title = dom.find('.article_layout.row h1').text();
	return title;
}
exports.raajje = Raajje;

/**
 *
 *
 * AdduOnline
 *
 */
function AdduOnline(){
	//required for parent constructor
	Scraper.call(this);
}
util.inherits(AdduOnline, Scraper);
AdduOnline.prototype.data = sources.adduonline;
AdduOnline.prototype.label = 'adduonline';
AdduOnline.prototype.scrapeTitle = function(dom){
	var title = dom.find('.entry_title').text();
	return title.trim();
}
AdduOnline.prototype.scrapeImage = function(dom){
	var img = dom.find('.wp-caption2.alignnone img');
	if(img.length == 0){
		img = dom.find('.slides_container img:first');
	}
	img = img.attr('src');
	return img;
}
AdduOnline.prototype.scrapeArticle = function(dom){
	//remove image caption
	dom.find(".wp-caption-text2").remove();
	var article = dom.find(".post p");
	var container = $("<div />");
	container.append(article);
	article = container.html();
	
	if(article){
		article = article.replace(/\n|\r/g, "")		
		article = article.replace(/\t/g, "")		
	}else{
		article = 404;
	}
	return article;
}
AdduOnline.prototype.scrapeAuthor = function(dom){
	var author = dom.find('[rel="author"]').text();
	if(author){
		author = author.replace(/\n|\r/g, "")
	}
	return author;
}

exports.adduonline = AdduOnline;

/**
 *
 *
 * NewDhivehiObserver
 *
 */
function NewDhivehiObserver(){
	//required for parent constructor
	Scraper.call(this);
}
util.inherits(NewDhivehiObserver, Scraper);
NewDhivehiObserver.prototype.data = sources.newdhivehiobserver;
NewDhivehiObserver.prototype.label = 'newdhivehiobserver';
NewDhivehiObserver.prototype.scrapeTitle = function(dom){
	var title = dom.find('.entry_title').text();
	return title.trim();
}
NewDhivehiObserver.prototype.scrapeImage = function(dom){
	var img = dom.find('.wp-caption2.alignnone img');
	if(img.length == 0){
		img = dom.find('.slides_container img:first');
	}
	img = img.attr('src');
	return img;
}
NewDhivehiObserver.prototype.scrapeArticle = function(dom){
	//remove image caption
	dom.find(".wp-caption-text2").remove();
	var article = dom.find(".post p");
	var container = $("<div />");
	container.append(article);
	article = container.html();
	
	if(article){
		article = article.replace(/\n|\r/g, "")		
		article = article.replace(/\t/g, "")		
	}else{
		article = 404;
	}
	return article;
}
exports.newdhivehiobserver = NewDhivehiObserver;


/**
 *
 *
 * Police
 *
 */
function Police(){
	//required for parent constructor
	Scraper.call(this);
}
util.inherits(Police, Scraper);
Police.prototype.data = sources.police;
Police.prototype.label = 'police';
Police.prototype.scrapeTitle = function(dom){
	var title = dom.find('.title').text();
	return title.trim();
}
Police.prototype.scrapeImage = function(dom){
	var _img = dom.find('.entry img:first');
	img = _img.attr('src');
	
	//remove image
	_img.remove();
	
	return img;
}
Police.prototype.scrapeArticle = function(dom){
	
	dom.find(".clear").remove();
	
	var article = dom.find(".entry");
	article = article.html();
	
	if(article){
		article = article.replace(/\n|\r/g, "")		
		article = article.replace(/\t/g, "")		
	}else{
		article = 404;
	}
	return article;
}
exports.police = Police;

/**
 *
 *
 * Fanvai
 *
 *
 */
function Fanvai(){
	//required for parent constructor
	Scraper.call(this);
}
util.inherits(Fanvai, Scraper);
Fanvai.prototype.data = sources.fanvai;
Fanvai.prototype.label = 'fanvai';
Fanvai.prototype.scrapeTitle = function(dom){
	var title = dom.find('.contentpagetitle').text();
	return title.trim();
}
Fanvai.prototype.scrapeImage = function(dom){
	var dom = dom.find(".contentpaneopen tr:nth-child(3)");
	var _img = dom.find('img:first');
	var url =  _img.attr('src');
	var img = url.indexOf('http://fanvai.info') == -1 ? 'http://fanvai.info' + url : url;
	_img.remove();
	return img;
}
Fanvai.prototype.scrapeArticle = function(dom){
	//remove image caption
	var article = dom.find(".contentpaneopen tr:nth-child(3) td");
	article.find("#jomcomment_rap_my").remove();
	article.find("img[alt='busy']").remove();
	article.find(".pagenav").remove();
	//change links of all the images /path/img.gif to http://fanvai.info/path/img.gif
	article.find("img").each(function(){
		var e = $(this);
		var url =  e.attr('src');
		if(url.indexOf('http://fanvai.info') == -1){
			e.attr('src', 'http://fanvai.info' + url);
		}
	});
	article = article.html();
	article = article.replace(/<!--(.*?)-->/ig, '');
	if(article){
		article = article.replace(/\n|\r/g, "")		
		article = article.replace(/\t/g, "")		
	}else{
		article = 404;
	}
	return article;
}
exports.fanvai = Fanvai;


/**
 *
 *
 * DhiIslam
 *
 *
 */
function DhiIslam(){
	//required for parent constructor
	Scraper.call(this);
}
util.inherits(DhiIslam, Scraper);
DhiIslam.prototype.data = sources.dhiislam;
DhiIslam.prototype.label = 'dhiislam';
DhiIslam.prototype.scrapeTitle = function(dom){
	var title = dom.find('.singlePageTitle').text();
	return title.trim();
}
DhiIslam.prototype.scrapeImage = function(dom){
	var img = dom.find(".dhiislampost img:first");
	img = img.attr('src');
	return img;
}
DhiIslam.prototype.scrapeArticle = function(dom){
	 dom.find('.dhiislampost p:last').remove();
	var paras = this.scrapeImage(dom) ? dom.find('.dhiislampost p').splice(1) : dom.find('.dhiislampost p');
	var article = $("<div />").append(paras).html();
	article = article.replace(/<!--(.*?)-->/ig, '');
	if(article){
		article = article.replace(/\n|\r/g, "")		
		article = article.replace(/\t/g, "")		
	}else{
		article = 404;
	}
	return article;
}
exports.dhiislam = DhiIslam;


/**
 *
 *
 * MinivanNews
 *
 *
 */
function MinivanNews(){
	//required for parent constructor
	Scraper.call(this);
}
util.inherits(MinivanNews, Scraper);
MinivanNews.prototype.data = sources.minivannews;
MinivanNews.prototype.label = 'minivannews';
MinivanNews.prototype.scrapeTitle = function(dom){
	var title = dom.find('.itemtitle_inner').text();
	return title.trim();
}
MinivanNews.prototype.scrapeImage = function(dom){
	var img = dom.find("img[align='left']");
	img = img.attr('src');
	return img;
}
MinivanNews.prototype.scrapeArticle = function(dom){
	var paras = dom.find(".front2 > p");
	var article = $("<div />").append(paras).html();
	article = article.replace(/<!--(.*?)-->/ig, '');
	if(article){
		article = article.replace(/\n|\r/g, "")		
		article = article.replace(/\t/g, "")		
	}else{
		article = 404;
	}
	return article;
}
exports.minivannews = MinivanNews;
