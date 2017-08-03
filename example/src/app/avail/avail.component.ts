import { Component } from '@angular/core';

declare const moment: any;

@Component({
  selector: 'app-avail',
  templateUrl: './avail.component.html',
  styleUrls: ['./avail.component.css']
})
export class AvailComponent {
  timeRange = {
    start: 0,
    end: 1
  };
  availAllChartData: any = [];

  constructor() {
    const baseTime = moment().hour(1).minutes(0).seconds(0);
    this.availAllChartData = [
      {'timestamp': +baseTime, 'value': 'up'},
      {'timestamp': +baseTime.add(15, 'minutes'), 'value': 'down'},
      {'timestamp': +baseTime.add( 5, 'minutes'), 'value': 'up'},
      {'timestamp': +baseTime.add(25, 'minutes'), 'value': 'unknown'},
      {'timestamp': +baseTime.add(10, 'minutes'), 'value': 'down'}
    ];
    this.timeRange.start = this.availAllChartData[0].timestamp;
    this.timeRange.end = +baseTime.add(6, 'minutes');
  }
}
