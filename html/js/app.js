$(function() {
    $('#submit').on('click', function() {
        var query = encodeURI($('#search').val())
        var req = '/search?q=' + query;
        $.ajax({
            url: req,
            type: 'GET',
            success: function(data) {
                var template = $('#templates .results').html();
                var html = Mustache.to_html(template, {
                    query: decodeURI(query),
                    results: data
                });
                $('.results-container').html(html);
            },
            error: function(data) {
                var template = $('#templates .error').html();
                var html = Mustache.to_html(template, {
                    error: data
                });
                $('.results-container').html(html);
            }
        });
    })
})
