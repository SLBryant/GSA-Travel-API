angular.module('starter.controllers', [])

.service("userSearch", function() {
    return {
        params: {
            showCP: true,
            showSP: true,
            showWeather: true
        },
    };
})

.service('perDiemCalculator', function() {
    this.months = function(startDate, endDate) {
        var months = [];
        for (var date = startDate; date.isBefore(endDate); date.add(1, 'days')) {
            var month = date.format('M');
            if (months.indexOf(month) === -1) {
                months.push(month);
            }
        }
        return months;
    };
    this.calculate = function(startDate, endDate, rate) {
        //single day trip
        if (startDate === endDate) {
            //mie only, at 75%
            var total = rate.meals * 0.75;
        } else {
            var total = 0;
            var months = [];
            for (var date = startDate; date.isBefore(endDate); date.add(1, 'days')) {
                //add perdiem rate for month
                total += rate.months.month[date.format('M')].value;
                //add mie at 75% for first and last day (using first two days since it's only a sum)
                if (date === startDate || date === startDate.add(1, 'days')) {
                    total += rate.meals * 0.75;
                } else {
                    //mie at 100% for all other days
                    total += rate.meals
                }
            }
        }
        return total;
    };
})

.controller('AppCtrl', function($scope) {


})

.constant('moment', moment)

.controller('SearchCtrl', function($scope, $http, $state, $ionicLoading, $ionicPopup, moment, userSearch) {
    $scope.userSearch = userSearch;

    $scope.userSearch.params.startDate = new Date();
    $scope.userSearch.params.endDate = new Date();

    $scope.datePickerCallback = function(val) {
        if (typeof(val) === 'undefined') {
            console.log('Date not selected');
        } else {
            console.log('Selected date is : ', val);
        }
    };

    $scope.showAlert = function() {
        var alertPopup = $ionicPopup.alert({
            title: 'API Error'
        });
    };

    $scope.searchForm = function() {
        $ionicLoading.show({
            template: '<ion-spinner></ion-spinner><br>Loading Data from GSA APIs',
            hideOnStateChange: true
        });
        var req = 'http://localhost:3000/search?origin=' + $scope.userSearch.params.origin + '&destination=' + $scope.userSearch.params.destination;
        $http({
            method: 'GET',
            url: req
        }).
        success(function(data, status, headers, config) {
            apiResponse = data;
            $scope.userSearch.response = apiResponse;
            //sort perdiem months
            for (i in $scope.userSearch.response.perDiem) {
                var months = $scope.userSearch.response.perDiem[i].months.month;
                months = months.sort(function(a, b) {
                    return a.number > b.number
                })
            }
            $scope.userSearch.params.startDate = moment($scope.userSearch.params.startDate);
            $scope.userSearch.params.endDate = moment($scope.userSearch.params.endDate);
            $state.go('app.results');
        }).
        error(function(data, status, headers, config) {
            $ionicLoading.hide();
            $scope.showAlert();
        });
    }
})

.controller('ResultsCtrl', function($scope, $state, userSearch, perDiemCalculator) {
    $scope.userSearch = userSearch;
    console.log($scope.userSearch.response);
    console.log(perDiemCalculator.months($scope.userSearch.params.startDate, $scope.userSearch.params.endDate));
    console.log(perDiemCalculator.calculate($scope.userSearch.params.startDate, $scope.userSearch.params.endDate, $scope.userSearch.response.perDiem[0]))
});