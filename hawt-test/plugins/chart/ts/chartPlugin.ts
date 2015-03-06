/// <reference path="../../includes.ts"/>
/// <reference path="chartGlobals.ts"/>
module Chart {

  export var _module = angular.module(Chart.pluginName, []);

  var tab:any = undefined;

  _module.config(['$locationProvider', '$routeProvider', 'HawtioNavBuilderProvider', ($locationProvider, $routeProvider:ng.route.IRouteProvider, builder:HawtioMainNav.BuilderFactory) => {
    tab = builder.create()
      .id(Chart.pluginName)
      .title(() => "Charts")
      .href(() => "/charts")
      .subPath("Sample", "sample", builder.join(Chart.templatePath, 'chart.html'))
      .build();
    builder.configureRouting($routeProvider, tab);
    $locationProvider.html5Mode(true);
  }]);

  _module.run(['HawtioNav', (HawtioNav:HawtioMainNav.Registry) => {
    HawtioNav.add(tab);
    log.debug("loaded");
  }]);


  hawtioPluginLoader.addModule(Chart.pluginName);
}
