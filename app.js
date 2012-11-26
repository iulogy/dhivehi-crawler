//clear screen
//process.stdout.write ('\u001B[2J\u001B[0;0f')

var util = require('util');
var arg = require('optimist');

var sites = require('./lib');

var site = new sites.site();

site.requestLimit = arg.limit +1 || 6
site.on('error', function(err){
	console.log(err);
})

site.on('fetch', function(data){
	
	//[data] contains scraped batch
	// do something with data 
	
	
	//     ...
	
})

site.fetch();


