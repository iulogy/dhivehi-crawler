var spawn = require('child_process').spawn;

setInterval(x, 1000 * 60 * 5)

function x (){
	app = spawn('node', ['app.js']);
	app.stdout.setEncoding('utf8');
	app.stdout.on('data', function(data){
		console.log(data);
	})
}
x();
