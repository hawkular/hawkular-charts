import { Component } from '@angular/core';

declare const d3: any;

@Component({
  selector: 'app-multi-chart',
  templateUrl: './multi-chart.component.html',
  styleUrls: ['./multi-chart.component.css']
})
export class MultiChartComponent {
  nestedData: any[] = [];
  timeRange = {
    start: 0,
    end: 1
  };

  constructor() {
    d3.json('./test-data/multi-chart-data.json', (error: any, jsonData: any[]) => {
      const start = jsonData[0].values[0].start;
      const end = jsonData[2].values[jsonData[2].values.length - 1].end;

      // manipulate data so that upmost timestamp is now
      const diff = new Date().getTime() - end;
      this.timeRange = {
        start: start + diff,
        end: end + diff
      }
      jsonData.forEach(oneSeries => oneSeries.values.forEach((dp: any) => {
        dp.start += diff;
        dp.end += diff;
      }));
      this.nestedData = jsonData;
    });
  }
}
