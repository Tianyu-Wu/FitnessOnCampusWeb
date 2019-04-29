require([
  'esri/Map',
  'esri/views/MapView',
  'esri/tasks/support/Query',
  'esri/tasks/QueryTask',
  'esri/Graphic'
], function(Map, MapView, Query, QueryTask, Graphic) {
  var map = new Map({
    basemap: 'topo-vector'
  });

  var view = new MapView({
    container: 'viewDiv',
    map: map,
    center: [-118.80543, 34.027],
    zoom: 13
  });

  // Define query sql expression
  var query = new Query();
  query.where = '1=1';
  query.outFields = ['*'];
  query.returnGeometry = true;

  // Define the query task
  var queryTask = new QueryTask({
    url:
      'https://services1.arcgis.com/i9MtZ1vtgD3gTnyL/arcgis/rest/services/trajectories/FeatureServer/0'
  });

  // Execute the query
  queryTask
    .execute(query)
    .then(function(result) {
      result.features.forEach(function(item) {
        var g = new Graphic({
          geometry: item.geometry,
          attributes: item.attributes,
          symbol: {
            type: 'simple-line',
            color: 'black',
            width: 1.2,
            style: 'short-dot'
          },
          popupTemplate: {
            title: '{speed}',
            content: '{*}'
          }
        });
        view.graphics.add(g);
      });

      // Zoom to the data returned
      view.when(function() {
        view.goTo({
          target: view.graphics.toArray()
        });
      });
    })
    .otherwise(function(e) {
      console.log(e);
    });
});
