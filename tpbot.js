"use strict"

/* to do:
	find/fix memory leak
	text commands
	multiple connections
	clean up code
	fix channel tree system
	configurations
	remove redis?
*/

var mumble = require('mumble');
var colors = require('colors');
var Redis = require('redis');
var redis = Redis.createClient();
var childps = require("child_process");
var _ = require('lodash');
var moment = require("moment");
var async = require("async");
var parse_l = require('./parse_link');
var cliout = require('./cliout');
var userlist = require('./userlist');

var debug = true;

var buf = new cliout(debug);
var users = new userlist(debug);

var _this = {};
var channel_names = {};
var channel_tree = {};

var moved = false;

var last_send = 0;

var toType = function(obj) {
  return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1];//.toLowerCase()
}

buf.prefix('~MoneyBot');
buf.postx("Connecting...".grey);

mumble.connect('mumble.koalabeast.com', function(error, connection) {
	if(error) {
		throw new Error(error);
	}
	
	buf.postx('Connected'.green);
	connection.authenticate('MoneyBot');

	connection.on('initialized', function() {});

	connection.on('protocol-in', function(data) { dispatch(connection, data); })
});

function dispatch(con, data) {
	var message = data.message || null;

	switch(data.type) {
		default:
			buf.push([('Unhandled packet: ').yellow, data.type]);
			buf.push(('\nData: \n').blue);
			buf.push(data);
			buf.post();
			break;

		case 'ServerSync':
			_this.session = message.session;
			var state1 = { session: _this.session, selfMute: true, selfDeaf: true };
			var state2 = { session: _this.session, channelId: 1411, selfMute: true, selfDeaf: true };
			_this.channelId = findChannelByName('Money Balls');
			buf.postx(["channel id ".green, (_this.channelId).blue]);

			if(_this.channelId === null) {
				buf.postx('Unable to join Money Balls channel'.red);
				con.sendMessage('UserState', state1);
			} else {
				state2.channelId = _this.channelId;
				con.sendMessage('UserState', state2);
			}
			break;

		case 'PermissionDenied':
			buf.postx_error(message);
			break;

		case 'ChannelRemove':
		case 'PermissionQuery':
		case 'Version':
		case 'ServerConfig':
		case 'CryptSetup':
		case 'CodecVersion':
		case 'Ping':
			// do nothing for these
			break;

		case 'ChannelState':
			handle_ChannelState(message);
			break;

		case 'UserState':
			if(message.session == _this.session) {
				if(message.name != undefined) {
					// this usually doesn't happen
					buf.prefix(message.name);
				}
			}

			if(message.actor == undefined) {
				// actor undefined means the server is telling us about a new user
				users.add(message);
			}

			handle_UserState(message, con);
			break;

		case 'UserRemove':
			users.del(message.session);
			break;

		case 'TextMessage':
			handle_TextMessage(message, con);
			break;

	}

};

function handle_UserState(message, con) {
	var usr = users.get(message.session);
	var self = users.get(_this.session);
	if((message.channelId != null) && usr.session !== self.session && message.channelId.toString() == _this.channelId) {
		// user joined my channel, do a link lookup
		buf.postx(["User ".yellow, (usr.name).green, (" (" + usr.session + ")").blue, " joined, checking link".yellow]);
		var path = _this.channelId;
		return async.parallel({
			url: function(cb) {
				return redis.hget("urls", path, cb);
			},
			name: function(cb) {
				return redis.hget("names", path, cb);
			},
			time: function(cb) {
				return redis.hget("times", path, cb);
			}
		}, function(err, res) {
			var child;
			var doneNGL;
			var link_parts;

			if(err) {
				buf.push([(" [" + usr.name + "] ").magenta + " Error getting link\r".red, err]);
			}

			if(_.all(res, function(x) {
				return x != null;
			})) {
				buf.postx("Checking for group link".grey);
				link_parts = parse_l(res.url);
				child = childps.fork("./group_probe.js", [res.url, false], { execPath: "/usr/bin/node" });
				doneNGL = false;
				child.on("message", function(msg) {
					if(msg.result.exists === false) {
						doneNGL = true; // had this set in return, sometimes caused 201 to fire as well
						redis.hdel("urls", _this.channelId, function(){});
						redis.hdel("names", _this.channelId, function(){});
						redis.hdel("times", _this.channelId, function(){});

						buf.postx("200 No link stored".yellow);

						con.sendMessage("TextMessage", { message: "No group link found", session: [message.actor] });
						return;
					} else {
						buf.postx("100 Link found, sending".grey);
						var gr_link = getlink(res, link_parts, msg);
						return con.sendMessage("TextMessage", { message: gr_link, session: [message.actor] });
					}
				});

				child.on("error", function() {
					buf.postx_error(arguments);
				});

				return async.parallel({
					players: function(cb) {
						return redis.get("num:players:", + res.url, cb);
					},
					spectators: function(cb) {
						return redis.get("num:spectators:", + res.url, cb);
					}
				}, function(err, nums) {
					if(!((nums.players != null) && (nums.spectators != null))) {
						child = childps.fork("./group_probe.js", [res.url, true], { execPath: "/usr/bin/node" });

						child.on("message", function(msg) {
							if(!msg.err) {
								if(msg.result.exists === true) {
									if(msg.result.player == null) {
										msg.result.player = 0;
									}

									if(msg.result.spectator == null) {
										msg.result.spectator = 0;
									}

									buf.postx("101 Link found, sending".grey);
									//redis.setex("num:players:" + res.url, 60, msg.result.player);
									//redis.setex("num:spectators:" + res.url, 60, msg.result.spectator);

									var gr_link = getlink(res, link_parts, msg);

									return con.sendMessage("TextMessage", { message: gr_link, session: [message.actor] });
								} else if(!doneNGL) {
									redis.hdel("urls", _this.channelId, function(){});
									redis.hdel("names", _this.channelId, function(){});
									redis.hdel("times", _this.channelId, function(){});
									buf.postx("201 No link stored".yellow);
									con.sendMessage("TextMessage", { message: "No group link found", session: [message.actor] });
								}
							}
						});
						return child.on("error", function() {
							return buf.postx_error(arguments);
						});
					} else {
						buf.postx("102 Link found, sending".grey);
						var gr_link = getlink(res, link_parts, msg);
						return con.sendMessage("TextMessage", { message: gr_link, session: [message.actor] });
					}
				});
			} else {
				buf.postx("202 No link found".yellow);
				con.sendMessage("TextMessage", { message: "No group link found", session: [message.actor] });
			}
		});
	}

	//buf.post();
	return;
}

function handle_TextMessage(data, con) {
	var self = users.get(_this.session);
	var usr = users.get(data.actor);

	/*if(usr.name == 'tofucake') {
		if(/(\!clear)/.test(data.message)) {
			buf.postx('Clearing link'.yellow);
			redis.send_command("hdel", ["urls", _this.channelId], function(err, num){
				if(err != null) {
					buf.push((err).red);
					buf.post_err();
				}

				if(num >= 1) {
					con.sendMessage('TextMessage', {message: "Group cleared " + num, session: [data.actor]});
				}
			});
			redis.send_command("hdel", ["names", _this.channelId], function(){});
			redis.send_command("hdel", ["times", _this.channelId], function(){});
		}
	}*/

	if(data.channelId == null) {
		return;
	}

	if(data.channelId.toString() == _this.channelId) {
		var urls = /tagpro-[a-z]+\.koalabeast\.com\/groups\/[a-zA-Z]{8}/i.exec(data.message);
		if(urls != null) {
			var x = redis.hget("urls", _this.channelId, function(err, url) {
				var child;
				if(err) {
					buf.postx_error(err);
					return;
				}

				if(url === urls[0]) {
					return;
				}
				con.sendMessage('TextMessage', {message: "Checking group", session: [data.actor]});

				child = childps.fork('./group_probe.js', [urls[0], false], { execPath: "/usr/bin/node" });

				child.on('message', function(msg) {
					if(msg.err) {
						buf.postx(('Error in group probe: ').yellow);
						buf.postx(('Link: ' + urls[0]).yellow);
						return con.sendMessage('TextMessage', { message: "Error probing group", session: [_this.channelId] });
					} else if(msg.result.exists === true) {

						buf.push(('Storing new group link: ').blue);
						buf.push((urls[0]).green);
						buf.push((' from user ').blue);
						buf.push((usr.name).magenta);
						buf.post();
						
						var mo = moment().unix();
						redis.hset('urls', _this.channelId, urls[0]);
						redis.hset('names', _this.channelId, usr.name);
						redis.hset('times', _this.channelId, mo);

						con.sendMessage('TextMessage', { message: 'Group link stored', channelId: [_this.channelId] });
						return;
					} else if(msg.result.exists === false) {
						return con.sendMessage('TextMessage', { message: "Group does not exist", session: [_this.channelId] });
					} else {
						buf.postx_error('I don\'t know what to do here.');
						buf.postx_error(msg);
						return;
					}
				});
			});
		}
	}
}

function handle_ChannelState(data) {
	// TODO: add the tree jawn
	if(channel_names[data.channelId] == null) {
		channel_names[data.channelId] = data.name;
	}
}

function findChannelByPath(path, root) {
	var children, cid, sub;

	if(root == null) {
		console.log('findChannelByPath	set root = channel_tree');
		//console.log(channel_tree);
		root = channel_tree;
	}

	for(cid in root) {
		children = root[cid];
		if(channel_names[cid] === path[0]) {
			return cid;
		}

		if(Object.keys(children).length > 0) {
			sub = findChannelByPath(path.slice(1), children);
			if(sub !== null) {
				return sub;
			}
		}
	}

	return null;
}

function findChannelByName(channel) {
	// I haven't made the channel tree yet, so I'm going with this even though it's not
	// necessarily accurate (ie it doesn't work if there are multiple channels with the
	// same name on the server, it'll always just pick the last one in the tree)
	var cid;

	for(cid in channel_names) {
		if(channel_names[cid] === channel) {
			return cid;
		}
	}

	return null;
}

function usersInChannel(channel) {
	var user;
	var list = users.by_channel(channel);
//return;

	for(user in list) {
		console.log(
			('[' + channel_names[_this.channelId] + '] ').green,
			(list[user].name).blue,
			' is here'.green
		);
	}
}

function getlink(res, link_parts, msg) {
	// need to add a check to this later for if the server allows HTML (koalabeast does)
	var ret = '';
	//ret += '<br>\n<a href="http://i.imgur.com/RlEls3A.jpg">Click here to join group</a>'; // messing with people
	ret += '<br>\n<a href="http://' + res.url + '">Click here to join group</a>';
	ret += '\n<b>Server</b>: ' + link_parts.server;
	/* detailed stuff I don't care about right now * /
	ret += '\n<br><b>Players</b>: ' + msg.result.players;
	ret += '\n<br><b>Spectators</b>: ' + msg.result.spectators;
	ret += '\n<br><b>Link posted by</b>: ' + res.name;
	/**/
	return ret;
}