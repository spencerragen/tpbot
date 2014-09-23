"use strict";

var colors = require('colors');
var cliout = require('./cliout');

function userlist(debug, session) {
	this.users = [];
	this.debug = debug || false;
	this._session = session || null;
	this.buf = new cliout(debug);
}

userlist.prototype.add = function(msg) {
	// add is also update, because murmur is annoying with user info

	if(this.users === null) {
		this.users = [];
	}

	if(this.users[msg.session] == null) {
		this.users[msg.session] = { name: 'Unknown', channelId: false, mute: false, deaf: false, selfMute: false, selfDeaf: false };
	}

	if(msg.channelId !== null) {
		this.users[msg.session].channel = msg.channelId;
	}
	
	if(msg.name !== null) {
		this.users[msg.session].name = msg.name;
	}

	if(msg.mute !== null) {
		this.users[msg.session].mute = msg.mute;
	}

	if(msg.deaf !== null) {
		this.users[msg.session].deaf = msg.deaf;
	}

	if(msg.selfMute !== null) {
		this.users[msg.session].selfMute = msg.selfMute;
	}

	if(msg.selfDeaf !== null) {
		this.users[msg.session].selfDeaf = msg.selfDeaf;
	}
}

userlist.prototype.get = function(session) {
	if(this.users[session] == null) {
		// add dummy user, since requests will only come from sessions provided by the server
		// we know that the server can see this person
		this.add({ session: session });
	}

	return {
		session: session,
		name: this.users[session].name || 'Unknown',
		channelId: this.users[session].channelId || false,
		mute: this.users[session].mute || false,
		deaf: this.users[session].deaf || false,
		selfMute: this.users[session].selfMute || false,
		selfDeaf: this.users[session].selfDeaf || false
	}
}

userlist.prototype.del = function(session) {
	if(this.users[session] === null) {
		return false;
	} else {
		this.users[session] = null;
		return true;
	}
}

// i wish I had falsey or some other fuzzy logic here
userlist.prototype.samechannel = function(s_a, s_b) {
	if(s_a === s_b) {
		if(s_a !== true && s_a !== false & s_a !== null && s_a !== undefined) {			return true;
		}
	}

	// unless a and b are both crap, the answer is false
	if(s_a === true || s_a === false || s_a === null || s_a === undefined) {
		return false;
	}

	if(s_b === true || s_b === false || s_b === null || s_b === undefined) {
		return false;
	}

	if(this.users[s_a] === null || this.users[s_b] === null) {
		return false;
	}

	if(this.users[s_a].channel == this.users[s_b] && this.users[s_a] !== false) {
		return true;
	}

	return false;
}

userlist.prototype.by_channel = function(channelId) {
	var ret = [];
	var usr;

	for(usr in this.users) {
		if(this.users[usr].channelId == channelId) {
			ret.push(this.users[usr]);
		}
	}

	return ret;
}

module.exports = userlist;

var toType = function(obj) {
  return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1];//.toLowerCase()
}