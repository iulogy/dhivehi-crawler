//clear screen
//process.stdout.write ('\u001B[2J\u001B[0;0f')

var util = require('util');
var arg = require('optimist').argv;
var sites = require('./lib');

var site = new sites.site();
if(arg.sites){
	site.sources = typeof arg.sites == 'object' ? arg.sites : new Array(arg.sites);
}
site.requestLimit = arg.limit +1 || 4;
site.on('error', function(err){
	console.log(err);
})

site.on('fetch', function(data){
	
	//[data] contains scraped batch
	// do something with data 
	
	
	//     ...
	
})

site.fetch();


