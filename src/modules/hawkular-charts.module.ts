import { NgModule } from '@angular/core';
import { HttpModule } from '@angular/http';

import { MetricChartComponent } from '../components/metric-chart.component';
import { AvailChartComponent } from '../components/avail-chart.component';

@NgModule({
  declarations: [
    MetricChartComponent,
    AvailChartComponent
  ],
  imports: [
    HttpModule
  ],
  exports: [
    MetricChartComponent,
    AvailChartComponent
  ]
})
export class HawkularChartsModule {
}
