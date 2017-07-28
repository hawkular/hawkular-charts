import { Component, OnInit } from '@angular/core';

declare const d3: any;

@Component({
  selector: 'app-samples',
  templateUrl: './samples.component.html',
  styleUrls: ['./samples.component.css']
})
export class SamplesComponent implements OnInit {
  timerange = {};

  // set the alert threshold to whatever
  alertThreshold = 2000;
  dataPoints = 120;
  hideHighLowValues = false;
  rawData = [];
  statsData = [];

  myForecastData = [
    {'timestamp': 1434480361167, 'value': 1780, 'min': 1740, 'max': 1790},
    {'timestamp': 1434480511167, 'value': 1680, 'min': 1640, 'max': 1760},
    {'timestamp': 1434480571167, 'value': 1630, 'min': 1570, 'max': 1730},
    {'timestamp': 1434480661167, 'value': 1600, 'min': 1500, 'max': 1720},
    {'timestamp': 1434480781167, 'value': 1570, 'min': 1460, 'max': 1710},
    {'timestamp': 1434480931167, 'value': 1550, 'min': 1460, 'max': 1720},
    {'timestamp': 1434481111167, 'value': 1560, 'min': 1480, 'max': 1700}
  ];

  constructor() {
    // load a captured Hawkular Feed for sample data -- simulates loading data
    d3.json('./test-data/metrics-raw-data.json', (error, jsonData) => this.rawData = jsonData);
    d3.json('./test-data/metrics-stats-data.json', (error, jsonData) => this.statsData = jsonData);
  }

  //   $scope.originalData = jsonData;
  //   $scope.myData = jsonData;

  //   // this is simply a d3 function to return the beginning and ending values
  //   var myTimeRange = d3.extent($scope.myData, function (value) {
  //     return value.timestamp;
  //   });

  //   // set our initial timerange based on the data bounds
  //   $scope.timerange.startTimestamp = myTimeRange[0];
  //   $scope.timerange.endTimestamp = myTimeRange[1];
  //   console.log('Starting time range values: ' + new Date(myTimeRange[0]) + ' - ' + new Date(myTimeRange[1]));
  //   $scope.refreshChartWithDateRange();

  // });

  // $scope.toggleHighLow = function () {
  //   console.log('hideHighLowValues: ' + $scope.hideHighLowValues);
  //   $scope.hideHighLowValues = !$scope.hideHighLowValues;
  // };

  // $scope.$watch('dataPoints', function (dataPoints) {
  //   if (dataPoints && $scope.originalData) {
  //     console.log('dataPoints changed to: ' + dataPoints);
  //     $scope.myData = $scope.originalData.slice(0, dataPoints);
  //   }
  // });

  // $scope.refreshChartWithDateRange = function () {
  //   console.log('refreshChartWithDateRange');
  //   // we already have the data, but perhaps the data is stale and you want to requery
  //   // also, by just changing the data the charts will automatically update themselves
  //   $scope.myData = $scope.originalData.filter(function (value) {
  //     return value.timestamp >= $scope.timerange.startTimestamp && value.timestamp <= $scope.timerange.endTimestamp;
  //   });
  //   $scope.$digest();

  // };

  // // Drag event on a normal chart
  // $scope.$on('ChartTimeRangeChanged', function (event, data) {
  //   console.log('Received ChartTimeRangeChanged event: ' + data[0] + ' - ' + data[1]);
  //   $scope.timerange.startTimestamp = data[0];
  //   $scope.timerange.endTimestamp = data[1];
  //   // forecast data not relevant in the past
  //   $scope.myForecastData = [];
  //   $scope.refreshChartWithDateRange();
  //   $scope.$digest();
  // });

  // // Drag event on a context chart
  // $scope.$on('ContextChartTimeRangeChanged', function (event, data) {
  //   console.info('Received ContextChartTimeRangeChanged event: ' + data[0] + ' - ' + data[1]);
  //   $rootScope.$broadcast('ChartTimeRangeChanged', data);
  // });

  ngOnInit() {
  }

}
