/// <reference path="../../vendor/vendor.d.ts" />
declare namespace Charts {
    class ContextChartDirective {
        private static _CHART_WIDTH;
        private static _CHART_HEIGHT;
        restrict: string;
        replace: boolean;
        scope: {
            data: string;
            showYAxisValues: string;
        };
        link: (scope: any, element: ng.IAugmentedJQuery, attrs: any) => void;
        dataPoints: IChartDataPoint[];
        constructor($rootScope: ng.IRootScopeService);
        static Factory(): ($rootScope: ng.IRootScopeService) => ContextChartDirective;
    }
}
