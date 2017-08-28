import { NgModule } from '@angular/core';
import { HttpModule } from '@angular/http';

import { MetricChartStaticComponent } from '../components/metric-chart-static.component';
import { MetricChartDynComponent } from '../components/metric-chart-dyn.component';
import { AvailChartComponent } from '../components/avail-chart.component';

@NgModule({
  declarations: [
    MetricChartStaticComponent,
    MetricChartDynComponent,
    AvailChartComponent
  ],
  imports: [
    HttpModule
  ],
  exports: [
    MetricChartStaticComponent,
    MetricChartDynComponent,
    AvailChartComponent
  ]
})
export class HawkularChartsModule {
}
