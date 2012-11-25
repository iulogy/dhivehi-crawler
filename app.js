//clear screen
//process.stdout.write ('\u001B[2J\u001B[0;0f')

var util = require('util');

var sites = require('./lib');

var site = new sites.site();

site.sources = [];
site.sources.push('sun');
site.sources.push('haveeru');
site.sources.push('dhitv');
site.sources.push('mvyouth');
site.sources.push('vmedia');

site.on('error', function(err){
	console.log(err);
})

site.on('fetch', function(data){
	
	//[data] contains scraped batch
	// do something with data 
	
	
	//     ...
	
})

site.fetch();


