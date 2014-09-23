(function() {
	module.exports = function(link) {
		link = link.toLowerCase();
		return {
			server: link.slice(7, link.indexOf(".koalabeast")),
			group: link.slice(-8)
		};
	}
}).call(this);
