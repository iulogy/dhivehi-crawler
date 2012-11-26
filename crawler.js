var spawn = require('child_process').spawn;
var arg = require('optimist').argv;

setInterval(x, 1000 * 60 * arg.interval);

function x (){
	app = spawn('node', ['app.js']);
	app.stdout.setEncoding('utf8');
	app.stdout.on('data', function(data){
		console.log(data);
	})
}
x();
