var spawn = require('child_process').spawn;
var arg = require('optimist').argv;


function x (){
	app = spawn('node', ['app.js', '--limit', arg.limit || 3]);
	app.stdout.setEncoding('utf8');
	app.stdout.on('data', function(data){
		console.log(data);
	})
	app.on('exit', function(){
		setTimeout(x, 1000 * 60 * 5);
	});
}
x();
