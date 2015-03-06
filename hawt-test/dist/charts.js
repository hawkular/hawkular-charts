/// <reference path="../libs/hawtio-utilities/defs.d.ts"/>

/// <reference path="../../includes.ts"/>
var Chart;
(function (Chart) {
    Chart.pluginName = "hawtio-assembly";
    Chart.log = Logger.get(Chart.pluginName);
    Chart.templatePath = "plugins/example/html";
})(Chart || (Chart = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="chartGlobals.ts"/>
var Chart;
(function (Chart) {
    Chart._module = angular.module(Chart.pluginName, []);
    var tab = undefined;
    Chart._module.config(['$locationProvider', '$routeProvider', 'HawtioNavBuilderProvider', function ($locationProvider, $routeProvider, builder) {
        tab = builder.create().id(Chart.pluginName).title(function () { return "Charts"; }).href(function () { return "/charts"; }).subPath("Sample", "sample", builder.join(Chart.templatePath, 'chart.html')).build();
        builder.configureRouting($routeProvider, tab);
        $locationProvider.html5Mode(true);
    }]);
    Chart._module.run(['HawtioNav', function (HawtioNav) {
        HawtioNav.add(tab);
        Chart.log.debug("loaded");
    }]);
    hawtioPluginLoader.addModule(Chart.pluginName);
})(Chart || (Chart = {}));

/// <reference path="chartPlugin.ts"/>
var Chart;
(function (Chart) {
    Chart.ChartController = Chart._module.controller("Chart.ChartController", ['$scope', function ($scope) {
        $scope.target = "World!";
    }]);
})(Chart || (Chart = {}));

angular.module("charts-templates", []).run(["$templateCache", function($templateCache) {$templateCache.put("plugins/chart/html/chart.html","<div class=\"row\">\n  <div class=\"col-md-12\" ng-controller=\"Chart.ChartController\">\n    <h1>Page 1</h1>\n    <p>Hello {{target}}</p>\n  </div>\n</div>\n");}]); hawtioPluginLoader.addModule("charts-templates");