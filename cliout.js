"use strict";

var colors = require('colors');
var moment = require('moment');

/*
	need to clean this up a lot
	should have it not call itself maybe
*/

function cliout(debug) {
	this.buffer = [];
	this.debug = debug || false;
	this._prefix = null;
}

cliout.prototype.push = function(items) {
	if(typeof items == 'string' || typeof items == 'number') {
		this.buffer.push(items);
	} else if(typeof items == 'object' && items instanceof Array) {
		// instanceof wasn't reliably triggering by itself
		var i;
		for(i in items) {
			this.push(items[i]);
		}
	} else {
		if(this.debug === true) {
			console.error("Error: Unknown type".red, typeof items);
		}
	}
};

cliout.prototype.post = function(stamp) {
	if(this.buffer.length <= 0) {
		return;
	}

	var out = '';
	var i;

	if(stamp !== false) {
		var timestamp = new Date();
		out = ("[" + moment().format('YY-MM-DD HH:mm:ss') + "] ").white;
	}

	if(this._prefix != null) {
		out += ('[' + this._prefix + '] ').magenta;
	}

	for(i in this.buffer) {
		out += this.buffer[i];
	}

	console.log(out);
	this.buffer = [];
};

cliout.prototype.post_error = function(stamp) {
	if(this.buffer.length <= 0) {
		return;
	}

	var out = '';
	var i;

	if(stamp !== false) {
		var timestamp = new Date();
		out = ("[" + moment().format('YY-MM-DD HH:mm:ss') + "] ").white;
	}

	if(this._prefix != null) {
		out += ('[' + this._prefix + '] ').magenta;
	}

	for(i in this.buffer) {
		out += this.buffer[i];
	}

	console.error(out);
	this.buffer = [];
};

cliout.prototype.flush = function() {
	this.buffer = [];
};

cliout.prototype.postx = function(items, stamp) {
	var out = new cliout(this.debug);
	if(this._prefix !== null) {
		out.push(('[' + this._prefix + '] ').magenta);
	}
	out.push(items);
	out.post(stamp);
	out = null;
}

cliout.prototype.postx_error = function(items, stamp) {
	var out = new cliout(this.debug);
	if(this._prefix !== null) {
		out.push(('[' + this._prefix + '] ').magenta);
	}
	out.push(items);
	out.post_error(stamp);
	out = null;
}

cliout.prototype.prefix = function(msg) {
	this._prefix = msg;
}

module.exports = cliout;

// stack overflow is great
var toType = function(obj) {
	return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1];//.toLowerCase()
}