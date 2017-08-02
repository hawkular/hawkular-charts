import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule }   from '@angular/router';

import { HawkularChartsModule } from '@hawkular/hawkular-charts';

import { AppComponent } from './app.component';
import { AlertingComponent } from './alerting/alerting.component';
import { MultiChartComponent } from './multi-chart/multi-chart.component';
import { AvailComponent } from './avail/avail.component';
import { TimelineComponent } from './timeline/timeline.component';
import { SamplesComponent } from './samples/samples.component';

@NgModule({
  declarations: [
    AppComponent,
    AlertingComponent,
    MultiChartComponent,
    AvailComponent,
    TimelineComponent,
    SamplesComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    HawkularChartsModule,
    RouterModule.forRoot([{
        path: '',
        redirectTo: '/samples',
        pathMatch: 'full'
      }, {
        path: 'samples',
        component: SamplesComponent
      }, {
        path: 'timeline',
        component: TimelineComponent
      }, {
        path: 'avail',
        component: AvailComponent
      }, {
        path: 'multi-chart',
        component: MultiChartComponent
      }, {
        path: 'alerting',
        component: AlertingComponent
      }
    ])
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
