var express = require('express');
var request = require('request');
var cheerio = require('cheerio');
var _ = require('underscore');

var app = express();

var cpp = [];
var pd = [];
var sp = {
    'html': null,
};
var googleGeo = {};
var fullResponse = {};
var cppQuery = {};

app.use('/', express.static(__dirname + '/gsa-travel/www'));

app.get('/search', function(req, res) {
    console.log('===========\n')
    var origin = req.query.origin;
    var destination = req.query.destination;
    console.log('googleGeocache', destination)
    var destinationReq = 'https://maps.googleapis.com/maps/api/geocode/json?address=' + destination;
    console.log('googleRequest', destinationReq)
    request(destinationReq, function(error, response, data) {
        if (!error && response.statusCode == 200) {
            googleGeo.destination = JSON.parse(data);
            data = googleGeo.destination;
            var formattedAddress = data.results[0].formatted_address;
            formattedAddress = formattedAddress.replace(/ /g, '').split(',');
            var cpMatches = [];
            for (i in cpCities) {
                if (cpCities[i][0].toLowerCase().indexOf(formattedAddress[0].toLowerCase()) > -1 /*&& cpCities[i].indexOf(formattedAddress[1] > -1*/ ) {
                    cpMatches.push(cpCities[i][1]);
                }
            }
            cppQuery.destAPCode = cpMatches[0]
            var originReq = 'https://maps.googleapis.com/maps/api/geocode/json?address=' + origin;
            request(originReq, function(error, response, data) {
                if (!error && response.statusCode == 200) {
                    googleGeo.origin = JSON.parse(data);
                    data = googleGeo.origin;
                    var formattedAddress = data.results[0].formatted_address;
                    formattedAddress = formattedAddress.replace(/ /g, '').split(',')
                    var cpMatches = [];
                    for (i in cpCities) {
                        if (cpCities[i][0].toLowerCase().indexOf(formattedAddress[0].toLowerCase()) > -1 /*&& cpCities[i].indexOf(formattedAddress[1] > -1*/ ) {
                            cpMatches.push(cpCities[i][1]);
                        }
                    }
                    cppQuery.originAPCode = cpMatches[0]
                    getCPP(cppQuery,res)
                }
            });
        }
    });
});

function getCPP(cppQuery,res) {
    cppQuery.fiscalYear = "Search+FY+15"
    console.log('get CPP',cppQuery)
    request.post({
        url: 'http://cpsearch.fas.gsa.gov/cpsearch/mainList.do',
        form: cppQuery,
    }, function(error, response, html) {
        if (!error && response.statusCode == 200) {
            console.log('GOT CPP RESPONSE')
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
        else{
            console.log('ERROR',response.statusCode)
        }
    });
}

function getAwardDetails(i, res) {
    if (i < cpp.length) {
        request(cpp[i]['info_urls']['awardDetails'], function(error, response, html) {
            if (!error && response.statusCode == 200) {
                var $ = cheerio.load(html);
                $('.fareTable tr:not(:first-child)').each(function() {
                    var label = $(this).find('td:first-child').text().replace(/\s\n/g, '-').replace(/^-/g, '').replace(/\s{2,}/g, '').replace(/--$/g, '').replace(/--/g, '-').replace(/\r?\n|\r|\t|/g, '').replace(/\'/g, '').replace(/:/g, '').replace(/[ \t]+$/, '').replace(/ /g, '_').toLowerCase();
                    var value = $(this).find('td:last-child').text().replace(/\s\n/g, '-').replace(/^-/g, '').replace(/\s{2,}/g, '').replace(/--$/g, '').replace(/--/g, '-').replace(/\r?\n|\r|\t/g, '').replace(/\'/g, '').replace(/\$|\.00/g, '').replace(/[ \t]+$/, '').replace(/-$/g, '').replace(/^-/g, '').replace(/\(|\)/g, '');
                    if (value === '0') value = null;
                    if (label === 'origin' | label === 'destination') {
                        console.log(value)
                        //console.log(value.split('-'))
                        var locationInfo = value.split('-');
                        var locationInfoLength = locationInfo.length - 1;
                        if(locationInfoLength === 3){
                            value = {
                            'airport_code': locationInfo[2],
                            'airport_name': locationInfo[0],
                            'city': locationInfo[1].replace(',', ', ')
                        }
                        }
                        else{
                            value = {
                            'airport_code': locationInfo[1],
                            'airport_name': locationInfo[0].replace(',', ', '),
                            'city': locationInfo[0].replace(',', ', ')
                        }
                        }

                    }
                    if (label === 'airline') {
                        //console.log(value)
                        //console.log(value.split('-'))
                        var airlineInfo = value.split('-');
                        value = {
                            'name': airlineInfo[0],
                            'code': airlineInfo[1],
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
    console.log('getLuggageRates\n')
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
        getPerDiemRates(cppQuery.destAPCode, res)
    }
}

function getPerDiemRates(destination, res) {
    console.log('getPerDiemRates\n')
    /*console.log('googleGeocache', destination)
    var req = 'https://maps.googleapis.com/maps/api/geocode/json?address=' + destination;
    request(req, function(error, response, data) {
        if (!error && response.statusCode == 200) {*/
            //data = JSON.parse(data)
            data = googleGeo.destination;
            //console.log(data)
            var addressComponents = data.results[0].address_components;
            console.log(addressComponents)
            for (i in addressComponents) {
                if (addressComponents[i].types.indexOf('postal_code') > -1) {
                    var zip = addressComponents[i].short_name;
                }
            }
            if(zip){
                console.log(zip)
                var req = 'http://m.gsa.gov/api/rs/perdiem/zip/' + zip + '/year/2015/'
            }
            else{
                console.log('no zip')
                for (i in addressComponents) {
                    console.log('looping address components',addressComponents[i].types)
                    if (addressComponents[i].types.indexOf('administrative_area_level_1') > -1) {
                        console.log('administrative_area_level_1')
                        var state = addressComponents[i].short_name;
                    }
                    if (addressComponents[i].types.indexOf('locality') > -1) {
                        var city = addressComponents[i].long_name;
                    }
                }
                console.log(city,state)
                if(city){
                    var req = 'http://m.gsa.gov/api/rs/perdiem/city/' + city + '/state/' + state + '/year/2015/'
                }
                else{
                    var req = 'http://m.gsa.gov/api/rs/perdiem/state/' + state + '/year/2015/'
                }
                
            }
            console.log('getPerDiemRates', zip, city, state, '\n')
            request(req, function(error, response, json) {
                if (!error && response.statusCode == 200) {
                    pd = JSON.parse(json).rates[0].rate;
                    fullResponse.perDiem = pd;
                    //res.json(fullResponse);
                    /*for (i in addressComponents) {

                        if (addressComponents[i].types.indexOf('administrative_area_level_1') > -1) {
                            var state = addressComponents[i].long_name.toLowerCase();*/
                            console.log('getSmartPay', state)
                            request('https://smartpay.gsa.gov/program-coordinators/tax-information/' + state + '?mobile=1', function(error, response, html) {
                                if (!error && response.statusCode == 200) {
                                    console.log(html)
                                    var $ = cheerio.load(html);
                                    $('img').remove();
                                    var smartPay = $('#mainBody').html().replace(/\t/g, '').replace(/\s\s+/g, ' ').replace(/<!--(.*?)-->/g, '');
                                    console.log(smartPay)
                                    sp.html = smartPay;
                                    fullResponse.smartPay = sp;
                                } else {
                                    console.log('smartpay failed')
                                }
                                res.json(fullResponse);
                                console.log('returned JSON')
                            })
                        //}
                    //}

                }
            })
        //}

    //})
}

var cpCities = [
    ["ABERDEEN, SD", "ABR"],
    ["ABILENE, TX", "ABI"],
    ["ABU DHABI, AUH UNITED ARAB EMIRATES", "AUH"],
    ["ABUJA, ABV NIGERIA", "ABV"],
    ["ACCRA, ACC GHANA", "ACC"],
    ["ADDIS ABABA, ADD ETHIOPIA", "ADD"],
    ["ADELAIDE, S. AUSTRALIA, ADL AUSTRALIA", "ADL"],
    ["AGUADILLA, PR", "BQN"],
    ["AKRON, OH", "CAK"],
    ["ALBANY, GA", "ABY"],
    ["ALBANY, NY", "ALB"],
    ["ALBUQUERQUE, NM", "ABQ"],
    ["ALEXANDRIA, LA", "AEX"],
    ["ALLENTOWN, PA", "ABE"],
    ["ALMATY, ALA KAZAKHSTAN", "ALA"],
    ["ALPENA, MI", "APN"],
    ["AMARILLO, TX", "AMA"],
    ["AMMAN, AMM JORDAN", "AMM"],
    ["AMSTERDAM, AMS NETHERLANDS", "AMS"],
    ["ANCHORAGE, AK", "ANC"],
    ["ANKARA, ANK TURKEY", "ANK"],
    ["ANKARA, ESB TURKEY", "ESB"],
    ["ANTIGUA, ANU LEEWARD ISLANDS", "ANU"],
    ["APPLETON, WI", "ATW"],
    ["ARCATA/EUREKA, CA", "ACV"],
    ["ARUBA, AUA ARUBA", "AUA"],
    ["ASHEVILLE, NC", "AVL"],
    ["ASPEN, CO", "ASE"],
    ["ASTANA, TSE KAZAKHSTAN", "TSE"],
    ["ASUNCION, ASU PARAGUAY", "ASU"],
    ["ATHENS, ATH GREECE", "ATH"],
    ["ATLANTA, GA", "ATL"],
    ["ATLANTIC CITY, NJ", "ACY"],
    ["AUCKLAND, AKL NEW ZEALAND", "AKL"],
    ["AUGUSTA, GA", "AGS"],
    ["AUSTIN, TX", "AUS"],
    ["BAHRAIN, BAH BAHRAIN", "BAH"],
    ["BAKERSFIELD, CA", "BFL"],
    ["BAKU, BAK AZERBAIJAN", "BAK"],
    ["BAKU, GYD AZERBAIJAN", "GYD"],
    ["BANGALORE, BLR INDIA", "BLR"],
    ["BANGKOK, BKK THAILAND", "BKK"],
    ["BANGOR, ME", "BGR"],
    ["BARBADOS, BGI BARBADOS", "BGI"],
    ["BARCELONA, BCN SPAIN", "BCN"],
    ["BARROW, AK", "BRW"],
    ["BATON ROUGE, LA", "BTR"],
    ["BECKLEY, WV", "BKW"],
    ["BEIJING, BJS CHINA", "BJS"],
    ["BEIJING, PEK CHINA", "PEK"],
    ["BELFAST, BFS N. IRELAND", "BFS"],
    ["BELGRADE, BEG YUGOSLAVIA", "BEG"],
    ["BELIZE CITY, BZE BELIZE", "BZE"],
    ["BELLINGHAM, WA", "BLI"],
    ["BEMIDJI, MN", "BJI"],
    ["BERGEN, BGO NORWAY", "BGO"],
    ["BERLIN, BER GERMANY", "BER"],
    ["BERMUDA, BDA BERMUDA", "BDA"],
    ["BETHEL, AK", "BET"],
    ["BILLINGS, MT", "BIL"],
    ["BINGHAMTON, NY", "BGM"],
    ["BIRMINGHAM, AL", "BHM"],
    ["BISMARCK, ND", "BIS"],
    ["BLOOMINGTON, IL", "BMI"],
    ["BOGOTA, BOG COLOMBIA", "BOG"],
    ["BOISE, ID", "BOI"],
    ["BOMBAY, BOM INDIA", "BOM"],
    ["BOSTON, MA", "BOS"],
    ["BOZEMAN, MT", "BZN"],
    ["BRAINERD, MN", "BRD"],
    ["BRASILIA, BSB BRAZIL", "BSB"],
    ["BRAZZAVILLE, BZV CONGO", "BZV"],
    ["BREMEN, BRE GERMANY", "BRE"],
    ["BRISBANE, QUEENSLAND, BNE AUSTRALIA", "BNE"],
    ["BROWNSVILLE, TX", "BRO"],
    ["BRUNSWICK, GA", "BQK"],
    ["BRUSSELS, BRU BELGIUM", "BRU"],
    ["BUCHAREST, BUH ROMANIA", "BUH"],
    ["BUDAPEST, BUD HUNGARY", "BUD"],
    ["BUENOS AIRES, BUE ARGENTINA", "BUE"],
    ["BUFFALO, NY", "BUF"],
    ["BURLINGTON, VT", "BTV"],
    ["BUTTE, MT", "BTM"],
    ["CAIRO, CAI EGYPT", "CAI"],
    ["CALGARY, ALBERTA, YYC CANADA", "YYC"],
    ["CALI, CLO COLOMBIA", "CLO"],
    ["CANBERRA, AUST. CAP. TERR., CBR AUSTRALIA", "CBR"],
    ["CANCUN, CUN MEXICO", "CUN"],
    ["CAPE TOWN, CPT SOUTH AFRICA", "CPT"],
    ["CARACAS, CCS VENEZUELA", "CCS"],
    ["CARLSBAD, CA", "CLD"],
    ["CASABLANCA, CAS MOROCCO", "CAS"],
    ["CASPER, WY", "CPR"],
    ["CATANIA, CTA ITALY", "CTA"],
    ["CEDAR CITY, UT", "CDC"],
    ["CEDAR RAPIDS, IA", "CID"],
    ["CHAMPAIGN, IL", "CMI"],
    ["CHARLESTON, SC", "CHS"],
    ["CHARLESTON, WV", "CRW"],
    ["CHARLOTTE, NC", "CLT"],
    ["CHARLOTTESVILLE, VA", "CHO"],
    ["CHATTANOOGA, TN", "CHA"],
    ["CHENGDU, CTU CHINA", "CTU"],
    ["CHENNAI, MAA INDIA", "MAA"],
    ["CHICAGO, IL", "CHI"],
    ["CHICAGO, IL", "MDW"],
    ["CHICAGO, IL", "ORD"],
    ["CHUUK, CAROLINE ISLANDS, TKK MICRONESIA", "TKK"],
    ["CINCINNATI, OH", "CVG"],
    ["CLEVELAND, OH", "CLE"],
    ["CODY, WY", "COD"],
    ["COLLEGE STATION, TX", "CLL"],
    ["COLOGNE, CGN GERMANY", "CGN"],
    ["COLOMBO, CMB SRI LANKA", "CMB"],
    ["COLORADO SPRINGS, CO", "COS"],
    ["COLUMBIA, MO", "COU"],
    ["COLUMBIA, SC", "CAE"],
    ["COLUMBUS, GA", "CSG"],
    ["COLUMBUS, MS", "GTR"],
    ["COLUMBUS, OH", "CMH"],
    ["COPENHAGEN, CPH DENMARK", "CPH"],
    ["CORDOVA, AK", "CDV"],
    ["CORPUS CHRISTI, TX", "CRP"],
    ["COTONOU, COO BENIN", "COO"],
    ["COZUMEL, CZM MEXICO", "CZM"],
    ["CURACAO, CUR NETHERLANDS ANTILLES", "CUR"],
    ["DAKAR, DKR SENEGAL", "DKR"],
    ["DALLAS-FT. WORTH, TX", "DAL"],
    ["DALLAS-FT. WORTH, TX", "DFW"],
    ["DAR ES SALAAM, DAR TANZANIA", "DAR"],
    ["DARWIN, NORTHERN TERR., DRW AUSTRALIA", "DRW"],
    ["DAYTON, OH", "DAY"],
    ["DAYTONA BEACH, FL", "DAB"],
    ["DELHI, DEL INDIA", "DEL"],
    ["DENVER, CO", "DEN"],
    ["DES MOINES, IA", "DSM"],
    ["DETROIT, MI", "DTW"],
    ["DICKINSON, ND", "DIK"],
    ["DILLINGHAM, AK", "DLG"],
    ["DOHA, DOH QATAR", "DOH"],
    ["DOTHAN, AL", "DHN"],
    ["DOUALA, DLA CAMEROON", "DLA"],
    ["DRESDEN, DRS GERMANY", "DRS"],
    ["DUBAI, DXB UNITED ARAB EMIRATES", "DXB"],
    ["DUBLIN, DUB IRELAND", "DUB"],
    ["DUBUQUE, IA", "DBQ"],
    ["DULUTH, MN", "DLH"],
    ["DURANGO, CO", "DRO"],
    ["DURBAN, DUR SOUTH AFRICA", "DUR"],
    ["DUSSELDORF, DUS GERMANY", "DUS"],
    ["DUTCH HARBOR, AK", "DUT"],
    ["EAU CLAIRE, WI", "EAU"],
    ["EDINBURGH, EDI SCOTLAND UK", "EDI"],
    ["EDMONTON, ALBERTA, YEA CANADA", "YEA"],
    ["EDMONTON, ALBERTA, YEG CANADA", "YEG"],
    ["EL PASO, TX", "ELP"],
    ["ELKO, NV", "EKO"],
    ["ELMIRA, NY", "ELM"],
    ["ENTEBBE, EBB UGANDA", "EBB"],
    ["ERIE, PA", "ERI"],
    ["EUGENE, OR", "EUG"],
    ["EUROAIRPORT, EAP SWITZERLAND", "EAP"],
    ["EVANSVILLE, IN", "EVV"],
    ["FAIRBANKS, AK", "FAI"],
    ["FARGO, ND", "FAR"],
    ["FAYETTEVILLE, AR", "XNA"],
    ["FAYETTEVILLE, NC", "FAY"],
    ["FLAGSTAFF, AZ", "FLG"],
    ["FLINT, MI", "FNT"],
    ["FLORENCE, FLR ITALY", "FLR"],
    ["FLORENCE, SC", "FLO"],
    ["FRANKFURT, FRA GERMANY", "FRA"],
    ["FREEPORT, FPO BAHAMAS", "FPO"],
    ["FRESNO, CA", "FAT"],
    ["FT. LAUDERDALE, FL", "FLL"],
    ["FT. MYERS, FL", "RSW"],
    ["FT. SMITH, AR", "FSM"],
    ["FT. WALTON BEACH, FL", "VPS"],
    ["FT. WAYNE, IN", "FWA"],
    ["FUKUOKA, FUK JAPAN", "FUK"],
    ["GAINESVILLE, FL", "GNV"],
    ["GDANSK, GDN POLAND", "GDN"],
    ["GENEVA, GVA SWITZERLAND", "GVA"],
    ["GENOA, GOA ITALY", "GOA"],
    ["GILLETTE, WY", "GCC"],
    ["GLASGOW, GLA SCOTLAND UK", "GLA"],
    ["GOTHENBURG, GOT SWEDEN", "GOT"],
    ["GRAND CAYMAN ISLAND, GCM CAYMAN ISLANDS", "GCM"],
    ["GRAND FORKS, ND", "GFK"],
    ["GRAND JUNCTION, CO", "GJT"],
    ["GRAND RAPIDS, MI", "GRR"],
    ["GREAT FALLS, MT", "GTF"],
    ["GREEN BAY, WI", "GRB"],
    ["GREENSBORO, NC", "GSO"],
    ["GREENVILLE, SC", "GSP"],
    ["GUADALAJARA, GDL MEXICO", "GDL"],
    ["GUAM, GUM GUAM", "GUM"],
    ["GUANGZHOU, CAN CHINA", "CAN"],
    ["GUATEMALA CITY, GUA GUATEMALA", "GUA"],
    ["GUAYAQUIL, GYE ECUADOR", "GYE"],
    ["GULFPORT, MS", "GPT"],
    ["HALIFAX, NOVA SCOTIA, YHZ CANADA", "YHZ"],
    ["HAMBURG, HAM GERMANY", "HAM"],
    ["HANCOCK, MI", "CMX"],
    ["HARARE, HRE ZIMBABWE", "HRE"],
    ["HARLINGEN, TX", "HRL"],
    ["HARRISBURG, PA", "MDT"],
    ["HARTFORD, CT", "BDL"],
    ["HELENA, MT", "HLN"],
    ["HELSINKI, HEL FINLAND", "HEL"],
    ["HILO, HI", "ITO"],
    ["HILTON HEAD ISLAND, SC", "HHH"],
    ["HIROSHIMA, HIJ JAPAN", "HIJ"],
    ["HO CHI MINH CITY, SGN VIET NAM", "SGN"],
    ["HOBBS, NM", "HOB"],
    ["HONG KONG, HKG CHINA", "HKG"],
    ["HONOLULU, HI", "HNL"],
    ["HOUSTON, TX", "HOU"],
    ["HOUSTON, TX", "IAH"],
    ["HUNTSVILLE, AL", "HSV"],
    ["HYDERABAD, HYD INDIA", "HYD"],
    ["IDAHO FALLS, ID", "IDA"],
    ["INDIANAPOLIS, IN", "IND"],
    ["INYOKERN, CA", "IYK"],
    ["ISLAMABAD, ISB PAKISTAN", "ISB"],
    ["ISLIP, NY", "ISP"],
    ["ISTANBUL, IST TURKEY", "IST"],
    ["ITHACA, NY", "ITH"],
    ["JACKSON, MS", "JAN"],
    ["JACKSON HOLE, WY", "JAC"],
    ["JACKSONVILLE, FL", "JAX"],
    ["JACKSONVILLE, NC", "OAJ"],
    ["JAKARTA, JKT INDONESIA", "JKT"],
    ["JEREZ DE LA FRONTERA, XRY SPAIN", "XRY"],
    ["JOHANNESBURG, JNB SOUTH AFRICA", "JNB"],
    ["JUNEAU, AK", "JNU"],
    ["KAHULUI, HI", "OGG"],
    ["KALAMAZOO, MI", "AZO"],
    ["KALISPELL, MT", "FCA"],
    ["KANSAS CITY, MO", "MCI"],
    ["KARACHI, KHI PAKISTAN", "KHI"],
    ["KAUAI, HI", "LIH"],
    ["KAUNAKAKAI, HI", "MKK"],
    ["KETCHIKAN, AK", "KTN"],
    ["KEY WEST, FL", "EYW"],
    ["KIEV, IEV UKRAINE", "IEV"],
    ["KIGALI, KGL RWANDA", "KGL"],
    ["KILIMANJARO, JRO TANZANIA", "JRO"],
    ["KILLEEN GRAY AAF, TX", "GRK"],
    ["KING SALMON, AK", "AKN"],
    ["KINGSTON, KIN JAMAICA", "KIN"],
    ["KINSHASA, FIH CONGO", "FIH"],
    ["KLAMATH FALLS, OR", "LMT"],
    ["KNOXVILLE, TN", "TYS"],
    ["KODIAK, AK", "ADQ"],
    ["KONA, HI", "KOA"],
    ["KOROR, ROR PALAU", "ROR"],
    ["KOTZEBUE, AK", "OTZ"],
    ["KRAKOW, KRK POLAND", "KRK"],
    ["KUALA LUMPUR, KUL MALAYSIA", "KUL"],
    ["KUWAIT, KWI KUWAIT", "KWI"],
    ["KWAJALEIN, KWA MARSHALL ISLANDS", "KWA"],
    ["LA CROSSE, WI", "LSE"],
    ["LA PAZ, LPB BOLIVIA", "LPB"],
    ["LAFAYETTE, LA", "LFT"],
    ["LAGOS, LOS NIGERIA", "LOS"],
    ["LAHORE, LHE PAKISTAN", "LHE"],
    ["LAKE CHARLES, LA", "LCH"],
    ["LANAI CITY, HI", "LNY"],
    ["LANSING, MI", "LAN"],
    ["LAREDO, TX", "LRD"],
    ["LARNACA, LCA CYPRUS", "LCA"],
    ["LAS VEGAS, NV", "LAS"],
    ["LAWTON, OK", "LAW"],
    ["LEEDS/BRADFORD, LBA ENGLAND UK", "LBA"],
    ["LEWISTON, ID", "LWS"],
    ["LEXINGTON, KY", "LEX"],
    ["LIBERIA, LIR COSTA RICA", "LIR"],
    ["LIBREVILLE, LBV GABON", "LBV"],
    ["LIMA, LIM PERU", "LIM"],
    ["LINCOLN, NE", "LNK"],
    ["LISBON, LIS PORTGUAL", "LIS"],
    ["LITTLE ROCK, AR", "LIT"],
    ["LOME, LFW TOGO", "LFW"],
    ["LONDON, LON ENGLAND UK", "LON"],
    ["LOS ANGELES, CA", "BUR"],
    ["LOS ANGELES, CA", "LAX"],
    ["LOS ANGELES, CA", "LGB"],
    ["LOS ANGELES, CA", "ONT"],
    ["LOS CABOS, SJD MEXICO", "SJD"],
    ["LOUISVILLE, KY", "SDF"],
    ["LUBBOCK, TX", "LBB"],
    ["LUSAKA, LUN ZAMBIA", "LUN"],
    ["LUXEMBOURG, LUX LUXEMBOURG", "LUX"],
    ["LYON, LYS FRANCE", "LYS"],
    ["MADISON, WI", "MSN"],
    ["MADRID, MAD SPAIN", "MAD"],
    ["MAJURO, MAJ MARSHALL ISLANDS", "MAJ"],
    ["MALTA, MLA MALTA", "MLA"],
    ["MANAGUA, MGA NICARAGUA", "MGA"],
    ["MANCHESTER, MAN ENGLAND UK", "MAN"],
    ["MANCHESTER, NH", "MHT"],
    ["MANHATTAN, KS", "MHK"],
    ["MANILA, MNL PHILIPPINES", "MNL"],
    ["MARQUETTE, MI", "MQT"],
    ["MARSEILLE, MRS FRANCE", "MRS"],
    ["MCALLEN, TX", "MFE"],
    ["MEDELLIN, MDE COLOMBIA", "MDE"],
    ["MEDFORD, OR", "MFR"],
    ["MELBOURNE, FL", "MLB"],
    ["MELBOURNE, VICTORIA, MEL AUSTRALIA", "MEL"],
    ["MEMPHIS, TN", "MEM"],
    ["MERIDA, MID MEXICO", "MID"],
    ["MEXICO CITY, MEX MEXICO", "MEX"],
    ["MIAMI, FL", "MIA"],
    ["MIDLAND-ODESSA, TX", "MAF"],
    ["MILAN, MIL ITALY", "MIL"],
    ["MILWAUKEE, WI", "MKE"],
    ["MINNEAPOLIS-ST.PAUL, MN", "MSP"],
    ["MINOT, ND", "MOT"],
    ["MISSOULA, MT", "MSO"],
    ["MOBILE, AL", "MOB"],
    ["MODESTO, CA", "MOD"],
    ["MOLINE, IL", "MLI"],
    ["MONROE, LA", "MLU"],
    ["MONROVIA, MLW LIBERIA", "MLW"],
    ["MONTEGO BAY, MBJ JAMAICA", "MBJ"],
    ["MONTEREY, CA", "MRY"],
    ["MONTERREY, MTY MEXICO", "MTY"],
    ["MONTEVIDEO, MVD URUGUAY", "MVD"],
    ["MONTGOMERY, AL", "MGM"],
    ["MONTREAL, QUEBEC, YMQ CANADA", "YMQ"],
    ["MONTREAL, QUEBEC, YUL CANADA", "YUL"],
    ["MORGANTOWN, WV", "MGW"],
    ["MOSCOW, MOW RUSSIA", "MOW"],
    ["MUNICH, MUC GERMANY", "MUC"],
    ["MUSCAT, MCT OMAN", "MCT"],
    ["NADI, NAN FIJI", "NAN"],
    ["NAGOYA, NGO JAPAN", "NGO"],
    ["NAIROBI, NBO KENYA", "NBO"],
    ["NAPLES, NAP ITALY", "NAP"],
    ["NASHVILLE, TN", "BNA"],
    ["NASSAU, NAS BAHAMAS", "NAS"],
    ["NDJAMENA, NDJ CHAD", "NDJ"],
    ["NEW BERN, NC", "EWN"],
    ["NEW ORLEANS, LA", "MSY"],
    ["NEW YORK, NY", "JFK"],
    ["NEW YORK, NY", "LGA"],
    ["NEW YORK, NY", "NYC"],
    ["NEWARK, NJ", "EWR"],
    ["NEWBURGH, NY", "SWF"],
    ["NEWPORT NEWS, VA", "PHF"],
    ["NIAMEY, NIM NIGER", "NIM"],
    ["NICE, NCE FRANCE", "NCE"],
    ["NOME, AK", "OME"],
    ["NORFOLK, VA", "ORF"],
    ["NORTH BEND, OR", "OTH"],
    ["NUREMBERG, NUE GERMANY", "NUE"],
    ["OKINAWA, OKA JAPAN", "OKA"],
    ["OKLAHOMA CITY, OK", "OKC"],
    ["OMAHA, NE", "OMA"],
    ["ORANGE COUNTY, CA", "SNA"],
    ["ORLANDO, FL", "MCO"],
    ["OSAKA, OSA JAPAN", "OSA"],
    ["OSLO, OSL NORWAY", "OSL"],
    ["OTTAWA, ONTARIO, YOW CANADA", "YOW"],
    ["PALM SPRINGS, CA", "PSP"],
    ["PANAMA CITY, PTY PANAMA", "PTY"],
    ["PANAMA CITY, FL", "ECP"],
    ["PARIS, PAR FRANCE", "PAR"],
    ["PASCO, WA", "PSC"],
    ["PELLSTON, MI", "PLN"],
    ["PENSACOLA, FL", "PNS"],
    ["PEORIA, IL", "PIA"],
    ["PERTH, PER AUSTRALIA", "PER"],
    ["PETERSBURG, AK", "PSG"],
    ["PHILADELPHIA, PA", "PHL"],
    ["PHNOM PENH, PNH CAMBODIA", "PNH"],
    ["PHOENIX/SCOTTSDALE, AZ", "PHX"],
    ["PISA, PSA ITALY", "PSA"],
    ["PITTSBURGH, PA", "PIT"],
    ["POCATELLO, ID", "PIH"],
    ["POHNPEI ISLAND, PNI MICRONESIA", "PNI"],
    ["PORT OF SPAIN, POS TRINIDAD &amp; TOBAGO", "POS"],
    ["PORT-AU-PRINCE, PAP HAITI", "PAP"],
    ["PORTLAND, ME", "PWM"],
    ["PORTLAND, OR", "PDX"],
    ["PRAGUE, PRG CZECH REPUBLIC", "PRG"],
    ["PROVIDENCE, RI", "PVD"],
    ["PROVIDENCIALES, PLS TURKS AND CAICOS", "PLS"],
    ["PUEBLO, CO", "PUB"],
    ["PUERTO VALLARTA, PVR MEXICO", "PVR"],
    ["PULLMAN, WA", "PUW"],
    ["PUNTA CANA, PUJ DOMINICAN REPUBLIC", "PUJ"],
    ["PUSAN, PUS KOREA", "PUS"],
    ["QUEBEC, QUEBEC, YQB CANADA", "YQB"],
    ["QUERETARO, QRO MEXICO", "QRO"],
    ["QUITO, UIO ECUADOR", "UIO"],
    ["RABAT, RBA MOROCCO", "RBA"],
    ["RALEIGH-DURHAM, NC", "RDU"],
    ["RAPID CITY, SD", "RAP"],
    ["RECIFE, REC BRAZIL", "REC"],
    ["REDDING, CA", "RDD"],
    ["REDMOND, OR", "RDM"],
    ["RENO, NV", "RNO"],
    ["RICHMOND, VA", "RIC"],
    ["RIGA, RIX LATVIA", "RIX"],
    ["RIO DE JANIERO, RIO BRAZIL", "RIO"],
    ["ROANOKE, VA", "ROA"],
    ["ROCHESTER, MN", "RST"],
    ["ROCHESTER, NY", "ROC"],
    ["ROME, ROM ITALY", "ROM"],
    ["ROSWELL, NM", "ROW"],
    ["SACRAMENTO, CA", "SMF"],
    ["SAGINAW, MI", "MBS"],
    ["SAIPAN, SPN MARIANA ISLANDS", "SPN"],
    ["SALISBURY, MD", "SBY"],
    ["SALT LAKE CITY, UT", "SLC"],
    ["SAN ANGELO, TX", "SJT"],
    ["SAN ANTONIO, TX", "SAT"],
    ["SAN DIEGO, CA", "SAN"],
    ["SAN FRANCISCO, CA", "OAK"],
    ["SAN FRANCISCO, CA", "SFO"],
    ["SAN JOSE, SJO COSTA RICA", "SJO"],
    ["SAN JOSE, CA", "SJC"],
    ["SAN JUAN, PR", "SJU"],
    ["SAN LUIS OBISPO, CA", "SBP"],
    ["SAN PEDRO, SAP HONDURAS", "SAP"],
    ["SAN SALVADOR, SAL EL SALVADOR", "SAL"],
    ["SANTA BARBARA, CA", "SBA"],
    ["SANTA CRUZ, SRZ BOLIVIA", "SRZ"],
    ["SANTA FE, NM", "SAF"],
    ["SANTA MARIA, CA", "SMX"],
    ["SANTA ROSA, CA", "STS"],
    ["SANTIAGO, SCL CHILE", "SCL"],
    ["SANTO DOMINGO, SDQ DOMINICAN REPUBLIC", "SDQ"],
    ["SAO PAULO, SAO BRAZIL", "SAO"],
    ["SAPPORO, SPK JAPAN", "SPK"],
    ["SARAJEVO, SJJ BOSNIA", "SJJ"],
    ["SARASOTA-BRADENTON, FL", "SRQ"],
    ["SASKATOON, YXE CANADA", "YXE"],
    ["SAVANNAH, GA", "SAV"],
    ["SCRANTON, PA", "AVP"],
    ["SEATTLE-TACOMA, WA", "SEA"],
    ["SENDAI, SDJ JAPAN", "SDJ"],
    ["SEOUL, SEL KOREA", "SEL"],
    ["SHANGHAI, SHA CHINA", "SHA"],
    ["SHANNON, SNN IRELAND", "SNN"],
    ["SHREVEPORT, LA", "SHV"],
    ["SINGAPORE, SIN SINGAPORE", "SIN"],
    ["SIOUX CITY, IA", "SUX"],
    ["SIOUX FALLS, SD", "FSD"],
    ["SITKA, AK", "SIT"],
    ["SKOPJE, SKP MACEDONIA", "SKP"],
    ["SOFIA, SOF BULGARIA", "SOF"],
    ["SOUTH BEND, IN", "SBN"],
    ["SPOKANE, WA", "GEG"],
    ["SPRINGFIELD, IL", "SPI"],
    ["SPRINGFIELD, MO", "SGF"],
    ["ST. CROIX, VI", "STX"],
    ["ST. GEORGE, UT", "SGU"],
    ["ST. KITT'S, SKB NEVIS", "SKB"],
    ["ST. LOUIS, MO", "STL"],
    ["ST. LUCIA, SLU SAINT LUCIA", "SLU"],
    ["ST. MAARTEN, SXM NETHERLANDS ANTILLES", "SXM"],
    ["ST. THOMAS, VI", "STT"],
    ["STATE COLLEGE, PA", "SCE"],
    ["STAVANGER, SVG NORWAY", "SVG"],
    ["STOCKHOLM, STO SWEDEN", "STO"],
    ["STUTTGART, STR GERMANY", "STR"],
    ["SYDNEY, NEW  S. WALES, SYD AUSTRALIA", "SYD"],
    ["SYRACUSE, NY", "SYR"],
    ["TAIPEI, TPE TAIWAN", "TPE"],
    ["TALLAHASSEE, FL", "TLH"],
    ["TALLINN, TLL ESTONIA", "TLL"],
    ["TAMPA, FL", "TPA"],
    ["TEGUCIGALPA, TGU HONDURAS", "TGU"],
    ["TEL AVIV, TLV ISRAEL", "TLV"],
    ["TEXARKANA, TX", "TXK"],
    ["TIRANA, TIA ALBANIA", "TIA"],
    ["TOKYO, NRT JAPAN", "NRT"],
    ["TOKYO, TYO JAPAN", "TYO"],
    ["TOLEDO, OH", "TOL"],
    ["TORONTO, ONTARIO, YTO CANADA", "YTO"],
    ["TORONTO, ONTARIO, YYZ CANADA", "YYZ"],
    ["TOULOUSE, TLS FRANCE", "TLS"],
    ["TRAVERSE CITY, MI", "TVC"],
    ["TRI-CITIES, TN", "TRI"],
    ["TRONDHEIM, TRD NORWAY", "TRD"],
    ["TUCSON, AZ", "TUS"],
    ["TULSA, OK", "TUL"],
    ["TUNIS, TUN TUNISIA", "TUN"],
    ["TURIN, TRN ITALY", "TRN"],
    ["TYLER, TX", "TYR"],
    ["VAIL, CO", "EGE"],
    ["VALDOSTA, GA", "VLD"],
    ["VANCOUVER, B.C., YVR CANADA", "YVR"],
    ["VENICE, VCE ITALY", "VCE"],
    ["VERONA, VER ITALY", "VER"],
    ["VICTORIA, B.C., YYJ CANADA", "YYJ"],
    ["VIENNA, VIE AUSTRIA", "VIE"],
    ["VILNIUS, VNO LITHUANIA", "VNO"],
    ["WACO, TX", "ACT"],
    ["WALLA WALLA, WA", "ALW"],
    ["WARSAW, WAW POLAND", "WAW"],
    ["WASHINGTON, DC", "BWI"],
    ["WASHINGTON, DC", "DCA"],
    ["WASHINGTON, DC", "IAD"],
    ["WASHINGTON, DC", "WAS"],
    ["WATERLOO, IA", "ALO"],
    ["WATERTOWN, NY", "ART"],
    ["WAUSAU, WI", "CWA"],
    ["WENATCHEE, WA", "EAT"],
    ["WEST PALM BEACH, FL", "PBI"],
    ["WHITE PLAINS, NY", "HPN"],
    ["WICHITA, KS", "ICT"],
    ["WICHITA FALLS, TX", "SPS"],
    ["WILLISTON, ND", "ISN"],
    ["WILMINGTON, NC", "ILM"],
    ["WINNEPEG, MANITOBA, YWG CANADA", "YWG"],
    ["WORCESTER, MA", "ORH"],
    ["WRANGELL, AK", "WRG"],
    ["YAKIMA, WA", "YKM"],
    ["YAKUTAT, AK", "YAK"],
    ["YAOUNDE, NSI CAMEROON", "NSI"],
    ["YEREVAN, EVN ARMENIA", "EVN"],
    ["YUMA, AZ", "YUM"],
    ["ZAGREB, ZAG CROATIA", "ZAG"],
    ["ZURICH, ZRH SWITZERLAND", "ZRH)"]
];

app.listen(process.env.PORT || 3000);