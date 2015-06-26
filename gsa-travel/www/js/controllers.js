angular.module('starter.controllers', [])

.controller('AppCtrl', function($scope, $ionicModal, $timeout) {


})

//http://stackoverflow.com/questions/13882077/angularjs-passing-scope-between-routes

.controller('SearchCtrl', function($scope,$http,$state) {
    $scope.searchData = []
    $scope.searchData.showCP = true;
    $scope.searchData.showSP = true;
    $scope.searchData.showWeather = true;

    $scope.startDate = new Date();
    $scope.endDate = new Date();

    $scope.datePickerCallback = function(val) {
        if (typeof(val) === 'undefined') {
            console.log('Date not selected');
        } else {
            console.log('Selected date is : ', val);
        }
    };

    $scope.searchFormSubmit = function() {
        console.log($scope.searchData.origin)
        console.log($scope.searchData.destination)
        var req = 'http://localhost:3000/search?origin='+$scope.searchData.origin+'&destination='+$scope.searchData.destination;
        console.log(req)
        $http({
            method: 'GET',
            url: req
        }).
        success(function(data, status, headers, config) {
            apiResponse = data;
            console.log(apiResponse)
            $state.go('app.results');
        }).
        error(function(data, status, headers, config) {
            console.log(status)
        });
    }
})

.controller('ResultsCtrl', function($scope,$state) {



});