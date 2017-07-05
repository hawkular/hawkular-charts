import { NgModule } from '@angular/core';
import { HttpModule } from '@angular/http';

import { MetricChartComponent } from '../components/metric-chart.component';

@NgModule({
  declarations: [
    MetricChartComponent
  ],
  imports: [
    HttpModule
  ],
  exports: [
    MetricChartComponent
  ]
})
export class HawkularChartsModule {
}
