import { Component } from '@angular/core';

declare const d3: any;

@Component({
  selector: 'app-samples',
  templateUrl: './samples.component.html',
  styleUrls: ['./samples.component.css']
})
export class SamplesComponent {
  // set the alert threshold to whatever
  alertThreshold = 2000;
  dataPoints = 120;
  hideHighLowValues = false;
  rawData: any[] = [];
  statsData: any[] = [];
  timeRange = {
    start: 0,
    end: 1
  };

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
    d3.json('./test-data/metrics-raw-data.json', (error: any, jsonData: any[]) => {
      // this is simply a d3 function to return the beginning and ending values
      const d3TimeRange = d3.extent(jsonData, (value: any) => value.timestamp);

      // manipulate data so that upmost timestamp is now
      const diff = new Date().getTime() - d3TimeRange[1];
      this.timeRange = {
        start: d3TimeRange[0] + diff,
        end: d3TimeRange[1] + diff
      }
      this.rawData = jsonData.map(dp => {
        dp.timestamp += diff;
        return dp;
      });
      d3.json('./test-data/metrics-stats-data.json', (error: any, jsonData: any[]) => {
        let last = jsonData[0].timestamp - 3000;
        this.statsData = jsonData.map(dp => {
          dp.start = dp.start + diff;
          dp.end = dp.end + diff;
          return dp;
        });
      });
      this.myForecastData = this.myForecastData.map(dp => {
        dp.timestamp += diff;
        return dp;
      });
    });
  }
}
