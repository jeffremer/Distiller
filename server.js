Evaluator = {
	get: function(url, options, callback) {
		rest = require('./lib/restler/restler.js');		
		rest.get(url, options).addListener('complete', callback).addListener('error', function(err) {console.log(err)});		
	}
};

var
  sys = require('sys'),
  path = require('path'),
  http = require('http'),
  url = require('url'),

  paperboy = require('./lib/node-paperboy/lib/paperboy.js'),

  PORT = 8003,
  WEBROOT = path.join(path.dirname(__filename), 'webroot')

  _ = require('./lib/underscore.js');

  

http.createServer(function(request, response) {
  var ip = request.connection.remoteAddress;

  paperboy
    .deliver(WEBROOT, request, response)
    .addHeader('Expires', 300)
    .addHeader('X-PaperRoute', 'Node')
    .before(function() {
      sys.log('Received Request')
    })
    .after(function(statCode) {
      log(statCode, request.url, ip);
    })
    .error(function(statCode,msg) {
      response.writeHead(statCode, {'Content-Type': 'text/plain'});
      response.write("Error: " + statCode);
      response.end();
      log(statCode, request.url, ip, msg);
    })
   	.otherwise(function(err){
		var code,
			sourceUrl,
			token,
			username,
			password,
			contentType = 'text/plain',
			inSandbox = false,
			urlObj = url.parse(request.url, true);	
		
		// Required query string parameters
		var hasErrors = false;
		var errorString = '';
		try {
			sourceUrl = urlObj.query["url"];
			if(sourceUrl == undefined) throw "Source URL not set";
		} catch (err) {
			errorString += 'Source URL is required\n';
			hasErrors = true;
		}

		try {
			code = urlObj.query["code"];
			if(code == undefined) throw "Code not set";
		} catch (err) {
			errorString += 'Code block is required\n';
			hasErrors = true;
		}
		
		try {
			token = urlObj.query["token"];
			if(token == undefined) throw "Token not set";
		} catch (err) {
			errorString += 'Token is required\n';
			hasErrors = true;
		}
	
		// Optional query string parameters
		try {
			username = urlObj.query["username"];			
		} catch (err) {}
		try {
			password = urlObj.query["password"];			
		} catch (err) {}
		try {
			urlCode = urlObj.query["urlCode"];
		} catch (err) {}
		try {
			contentType = urlObj.query["contentType"];
		} catch (err) {}
		try {
			inSandbox = (urlObj.query["sandbox"] == "true");
		} catch (err) {}

		if(hasErrors) {
			response.writeHead(401, {'Content-Type': 'text/plain'});
			response.end(errorString);
			log(400, request.url, ip);				
		} else {
			// Transform the source URL
			try {
				var Script = process.binding('evals').Script;
				var urlSandbox = {
					URL: sourceUrl
				}
				if(urlCode != undefined) {
					Script.runInNewContext(urlCode, urlSandbox);
				}
				sourceUrl = urlSandbox.URL;
				console.log("Source URL " + sourceUrl);
			} catch (err) {
				console.log("Problem running code on sourceUrl\n" + err);
			}
			Evaluator.get(sourceUrl, {username: username, password: password}, function(data) {
				try {
					var codeSandbox = {
					      DATA: data,
					      RESULT: '',
						  _:_
					};
					if(code != undefined) {
						Script.runInNewContext(code, codeSandbox);
					}
					response.writeHead(200, {'Content-Type': contentType});
					if(inSandbox) {
						var resp = {
							result: codeSandbox.RESULT,
							success: true,
							url: request.url.replace('/','').replace(/&sandbox=true/,'')
						}
						//console.log(sys.inspect(resp));
						response.end(JSON.stringify(resp));						
					} else {
						response.end(codeSandbox.RESULT + '\n');						
					}   				
				} catch (err) {
					response.writeHead(500, {'Content-Type': 'text/plain'});	
					console.log("Problem running code\n" + data, " Error " + err.stack);
					response.end('Error\n');
				}
			});
		}
	});
}).listen(PORT);

function log(statCode, url, ip,err) {
  var logStr = statCode + ' - ' + url + ' - ' + ip
  if (err)
    logStr += ' - ' + err;
  sys.log(logStr);
}
