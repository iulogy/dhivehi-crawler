var spawn = require('child_process').spawn;
var arg = require('optimist').argv;

//setInterval(x, 1000 * 60 * (arg.interval || 2));
setInterval(x, 15000);

function x (){
	app = spawn('node', ['app.js', '--limit', arg.limit || 3, '--sites', 'mvexposed']);
	app.stdout.setEncoding('utf8');
	app.stdout.on('data', function(data){
		console.log(data);
	})
	app.on('exit', function(){
		console.log("***********\nDONE\n***********")
	});
}
x();
