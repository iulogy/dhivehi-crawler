var express = require('express');
var router = express.Router();
var compress = require('compression');
var logger = require('morgan');
var redis = require('redis');
var async = require('async');

var rediscon = redis.createClient();

var app = express();
app.use(compress({
	filter: function (req, res) {
		return /json|text|javascript|css/.test(res.getHeader('Content-Type'))
	},
	level: 9
}));
app.use(logger());
app.use(function(req,res,next){
	res.set('content-type','application/json; charset=utf-8')
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
    // intercept OPTIONS method
    if ('OPTIONS' == req.method) {
      res.send(200);
    }
    else {
      next();
    }
})
router.get('/', function(req, res){
	rediscon.keys("iulogy:sources:*", function(err, keys){
		res.json(keys);
	});
});
router.get('/sources', function(req, res){
	rediscon.keys("iulogy:sources:*", function(err, objects){

		async.mapSeries(objects, 
			function(item, done){
				rediscon.hkeys(item, function(err, keys){
					var obj = {};
					obj[item] = keys;
					done(err, obj)
				});				
			},
			function(err, results){
				//serve to client
				res.json(serve(results));
			}
		)
	});
});
router.get('/sources/:object', function(req, res){
	rediscon.hkeys("iulogy:sources:" + req.params.object, function(err, keys){
		//res.json(keys);
		async.mapSeries(keys, 
			function(item, done){
				rediscon.hget("iulogy:sources:" + req.params.object, item, function(err,data){
					done(err, JSON.parse(serve(data)));
				});				
			},
			function(err, final){
				var final = final;
				res.json(final)
			}
		)
	});
});
router.get('/sources/:object/:key', function(req, res){
	rediscon.hget("iulogy:sources:" + req.params.object, req.params.key,function(err, keys){
		var result = JSON.parse(keys);
		res.json(serve(result));
	});
});
app.use(router);
app.listen(7001);	

function serve(obj){
	delete obj['label'];
	delete obj['url'];
	delete obj['fetchDate'];
	delete obj['_rawHash'];
	delete obj['_resHash'];
	return obj;
}