var express = require('express');
var request = require('request');
var cheerio = require('cheerio');
var _ = require('underscore');

var app = express();

var cpp = [];
var pd = [];
var sp = {
    'html':null,
};
var fullResponse = {};
var cppQuery;

app.use('/', express.static(__dirname + '/html'));

app.get('/search', function(req, res) {
    cpp = [];
    cppQuery = {
        'originAPCode': req.query.originAPCode,
        'originCity': req.query.originCity,
        'destAPCode': req.query.destAPCode,
        'destCity': req.query.destCity,
        'fiscalYear': "Search+FY+15"
    };
    console.log('get CPP')
    request.post({
        url: 'http://cpsearch.fas.gsa.gov/cpsearch/mainList.do',
        form: cppQuery,
    }, function(error, response, html) {
        if (!error && response.statusCode == 200) {
            var $ = cheerio.load(html);
            var rootURL = 'http://cpsearch.fas.gsa.gov/cpsearch/';
            $('.displaytable tbody tr').each(function() {
                var infoURLS = {};
                infoURLS.awardDetails = rootURL + $(this).find('td:first-child a').attr('href');
                infoURLS.itemID = infoURLS.awardDetails.split('=');
                infoURLS.itemID = parseFloat(infoURLS.itemID[infoURLS.itemID.length - 1]);
                infoURLS.VCA = rootURL + $(this).find('td:nth-child(5) a').attr('href');
                infoURLS.CA = rootURL + $(this).find('td:nth-child(6) a').attr('href');
                if ($(this).find('td:nth-child(7) a').attr('href')) {
                    infoURLS.CB = rootURL + $(this).find('td:nth-child(7) a').attr('href');
                }
                var cppEntry = {
                    'info_urls': infoURLS,
                    '_id': infoURLS.itemID
                }
                cpp.push(cppEntry);
            });

            getAwardDetails(0, res);
        }
    });
});

function getAwardDetails(i, res) {
    if (i < cpp.length) {
        request(cpp[i]['info_urls']['awardDetails'], function(error, response, html) {
            if (!error && response.statusCode == 200) {
                var $ = cheerio.load(html);
                $('.fareTable tr:not(:first-child)').each(function() {
                    var label = $(this).find('td:first-child').text().replace(/\s\n/g,'-').replace(/^-/g,'').replace(/\s{2,}/g,'').replace(/--$/g,'').replace(/--/g,'-').replace(/\r?\n|\r|\t|/g, '').replace(/\'/g, '').replace(/:/g, '').replace(/[ \t]+$/, '').replace(/ /g, '_').toLowerCase();
                    var value = $(this).find('td:last-child').text().replace(/\s\n/g,'-').replace(/^-/g,'').replace(/\s{2,}/g,'').replace(/--$/g,'').replace(/--/g,'-').replace(/\r?\n|\r|\t/g, '').replace(/\'/g, '').replace(/\$|\.00/g, '').replace(/[ \t]+$/, '').replace(/-$/g,'').replace(/^-/g,'').replace(/\(|\)/g,'');
                    if (value === '0') value = null;
                    if(label === 'origin' | label === 'destination'){
                        console.log(value)
                        console.log(value.split('-'))
                        var locationInfo = value.split('-');
                        value = {
                            'airport_code':locationInfo[2],
                            'airport_name':locationInfo[0],
                            'city':locationInfo[1].replace(',',', ')
                        }

                    }
                    if(label === 'airline'){
                        console.log(value)
                        console.log(value.split('-'))
                        var airlineInfo = value.split('-');
                        value = {
                            'name':airlineInfo[0],
                            'code':airlineInfo[1],
                        }

                    }
                    cpp[i][label] = value;
                });
            }
            getAwardDetails(i + 1, res)

        })
    } else {
        getLuggageRates(0, res)
    }
}

function getLuggageRates(i, res) {
    if (i < cpp.length) {
        request(cpp[i]['info_urls']['VCA'], function(error, response, html) {
            if (!error && response.statusCode == 200) {
                var $ = cheerio.load(html);
                cpp[i]['baggage'] = {}
                var firstBag = $('.fareTable tr:nth-child(9) .row-info-text').text().replace(/\r?\n|\r|\t/g, '').replace(/\'/g, '').replace(/\$|\.00/g, '').replace(/[ \t]+$/, '');
                var secondBag = $('.fareTable tr:nth-child(9) .row-info-text').text().replace(/\r?\n|\r|\t/g, '').replace(/\'/g, '').replace(/\$|\.00/g, '').replace(/[ \t]+$/, '');
                if (firstBag === '0') firstBag = null;
                if (secondBag === '0') secondBag = null;
                cpp[i]['baggage']['first_checked_bag'] = firstBag;
                cpp[i]['baggage']['second_checked_bag'] = secondBag;
            }
            getLuggageRates(i + 1, res);

        })
    } else {
        for (i in cpp) {
            delete cpp[i]['info_urls'];
        }
        fullResponse.cityPairs = cpp;
        getPerDiemRates(cppQuery.destAPCode,res)
    }
}

function getPerDiemRates(destination,res) {
    console.log('googleGeocache',destination)
    var req = 'https://maps.googleapis.com/maps/api/geocode/json?address=' + destination;
    request(req, function(error, response, data) {
        if (!error && response.statusCode == 200) {
            data = JSON.parse(data)
            var addressComponents = data.results[0].address_components;
            for (i in addressComponents) {
                if (addressComponents[i].types.indexOf('postal_code') > -1) {
                    var zip = addressComponents[i].short_name;
                    console.log('getPerDiemRates',zip)
                    request('http://m.gsa.gov/api/rs/perdiem/zip/' + zip + '/year/2015/', function(error, response, json) {
                        if (!error && response.statusCode == 200) {
                            pd = JSON.parse(json).rates[0].rate;
                            fullResponse.perDiem = pd;
                            //res.json(fullResponse);
                            for (i in addressComponents) {

                                if (addressComponents[i].types.indexOf('administrative_area_level_1') > -1) {
                                    var state = addressComponents[i].long_name.toLowerCase();
                                    console.log('getSmartPay',state)
                                    request('https://smartpay.gsa.gov/program-coordinators/tax-information/' + state + '?mobile=1', function(error, response, html) {
                                        if (!error && response.statusCode == 200) {
                                            console.log(html)
                                            var $ = cheerio.load(html);
                                            $('img').remove();
                                            var smartPay = $('#mainBody').html().replace(/\t/g,'').replace(/\s\s+/g, ' ').replace(/<!--(.*?)-->/g,'');
                                            console.log(smartPay)
                                            sp.html = smartPay;
                                            fullResponse.smartPay = sp;
                                    }
                                    else{
                                        console.log('smartpay failed')
                                    }
                                        res.json(fullResponse);
                                        console.log('returned JSON')
                                    })
                                }
                            }
                            
                        }
                    })

                }
            }
        }

    })
}

app.listen(process.env.PORT || 3000);