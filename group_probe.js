(function() {
	var colors = require('colors');
	var cookie = require('cookie');
	var http = require('http');
	var io = require('socket.io-client');
	var _ = require('lodash');

	var parse_l = require('./parse_link');

	var get_cookie;
	var check_page;
	var leave_group;
	var callback;

	var link_parts;

	get_cookie = function(server, callback) {
		return (http.get("http://tagpro-" + server + ".koalabeast.com/", function(result) {
			var cookies;
			if("set-cookie" in result.headers) {
				cookies = cookie.parse(result.headers["set-cookie"][0]);
				if("tagpro" in cookies) {
					return callback(null, cookies.tagpro);
				} else {
					return callback("Server " + server + " sent no session cookie");
				}
			} else {
				return callback("Server " + server + " sent no cookies");
			}
		})).on('error', function(err) {
			return callback(e.code);
		});
	};

	check_page = function(server, group, session, callback) {
		var req = http.get({
			hostname: "tagpro-" + server + ".koalabeast.com",
			path: "/groups/" + group + "/",
			headers: { Cookie: cookie.serialize("tagpro", session) }
		}, function(result) {
			return callback(null, result.statusCode === 200);
		});

		return req.on("error", function() { return callback("Error checking group page"); });
	}

	leave_group = function(server, session) {
		var req = http.get({
			hostname: "tagpro-" + server + ".koalabeast.com",
			path: "/groups/leave/",
			headers: { Cookie: cookie.serialize("tagpro", session) }
		}, function(result) {});
	}

	callback = _.once(function(err, result) {
		return process.send({ err: err, result: result });
	});

	link_parts = parse_l(process.argv[2]);

	get_cookie(link_parts.server, function(err, session) {
		if(err) {
			return callback(err);
		}

		return check_page(link_parts.server, link_parts.group, session, function(err, exists) {
			var is_connected = false;
			var is_full = false;
			var members = {};
			var _id = '';

			var socket;
			var socket_url;

			if(err) {
				return callback(err);
			}

			if(process.argv[3] === "false" || exists === false) {
				return callback(null, { exists: exists });
			} else {
				socket_url = "http://tagpro-" + link_parts.server + ".koalabeast.com:81/groups/" + link_parts.group;
				socket = io.connect(socket_url, { cookie: cookie.serialize("tagpro", session) });

				setTimeout(function() {
					if(!is_connected) {
						socket.disconnect();
						return callback("Couldn't connect to group");
					}
				}, 3000);

				socket.on("connect", function() {
					is_connected = true;
					socket.emit("touch", "page");
					return setTimeout(function() {
						var counts;
						if(is_full) {
							return;
						}

						counts = _(members).countBy(function(is_spec, id) {
							if(id === _id) {
								return "self";
							}

							if(is_spec) {
								return "spectator";
							}

							return "player";
						}).pick(function(count, type) {
							return type !== "self";
						}).value();
						counts.exists = true;
						socket.disconnect();
						leave_group(link_parts.server, session);
						return callback(null, counts);
					}, 2000);
				});

				socket.on("member", function(info) {
					return members[info.id || "?"] = info.spectator;
				});

				socket.on("full", function() {
					is_full = true;
					callback(null, { player: 8, spectator: 4 });
					socket.disconnect();
					return leave_group(link_parts.server, session);
				});

				socket.on("you", function(id) {
					return _id = id;
				});

				socket.on("error", function() {
					return callback("Couldn't connect to group");
				});
			}
		});
	});
}).call(this);