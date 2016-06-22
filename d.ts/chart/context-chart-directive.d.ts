/// <reference path="../../typings/tsd.d.ts" />
declare namespace Charts {
    import IChartDataPoint = Charts.IChartDataPoint;
    class ContextChartDirective {
        private static _CHART_WIDTH_HINT;
        private static _CHART_HEIGHT_HINT;
        private static _XAXIS_HEIGHT;
        restrict: string;
        replace: boolean;
        scope: {
            data: string;
            showYAxisValues: string;
            startTimestamp: string;
            endTimestamp: string;
        };
        link: (scope: any, element: ng.IAugmentedJQuery, attrs: any) => void;
        dataPoints: IChartDataPoint[];
        constructor($rootScope: ng.IRootScopeService);
        static Factory(): ($rootScope: ng.IRootScopeService) => ContextChartDirective;
    }
}
