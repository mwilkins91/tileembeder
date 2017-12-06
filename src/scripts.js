const $ = require('jquery');
$(function() {
	console.log('load');
	$('form').on('submit', function(e) {
		// e.preventDefault();
		$('.loaderContainer').show();
	});
});
