// ArcGIS uses requirejs to manage libraries and dependencies. We load some libraries related to
// feature layers and maps. Use this html file by visiting
// http://host:port/mobile-gis/?track_id=0&user_id=0 (replace host with 127.0.0.1 and the port for
// example with 5000 for testing).
let fl_trajectories;
let fl_tracks;
let polyline;
let graphicsLayer;
let resultLayer;

const text =
  '{ "poi" : [' +
  '{ "name":"HIL Building" , "id":"POI1" , "latitude": 47.408303, "longitude": 8.5073332},' +
  '{ "name":"Food Market" , "id":"POI2" , "latitude": 47.407757, "longitude": 8.5080608},' +
  '{ "name":"Fusion" , "id":"POI3" , "latitude": 47.407896, "longitude": 8.507917},' +
  '{ "name":"ASVZ" , "id":"POI4" , "latitude": 47.406734, "longitude": 8.510735},' +
  '{ "name":"Bikes" , "id":"POI5" , "latitude": 47.407856, "longitude": 8.506630} ]}';

const poi = JSON.parse(text).poi;
console.log('TCL: poi', poi);

require([
  'esri/Map',
  'esri/views/MapView',
  'esri/layers/FeatureLayer',
  'esri/layers/GraphicsLayer',
  'esri/tasks/support/Query',
  'esri/Graphic',
  'esri/geometry/Point',
  'esri/geometry/Polyline',
  'esri/symbols/SimpleMarkerSymbol',
  'esri/symbols/SimpleLineSymbol',
  'esri/widgets/Legend',
  "esri/widgets/Expand",
  'esri/geometry/geometryEngine',
  'esri/geometry/support/webMercatorUtils',
  'esri/renderers/UniqueValueRenderer',
  "esri/renderers/ClassBreaksRenderer",
  "esri/layers/support/Field",
  'dojo/domReady!'
], function (
  Map,
  MapView,
  FeatureLayer,
  GraphicsLayer,
  Query,
  Graphic,
  Point,
  Polyline,
  SimpleMarkerSymbol,
  SimpleLineSymbol,
  Legend,
  Expand,
  geometryEngine,
  webMercatorUtils,
  UniqueValueRenderer,
  ClassBreaksRenderer,
  Field
) {
    // Here we retrieve URL parameters (the parts in the URL after the ? sign).
    var url = new URL(window.location.href);
    var trackId = url.searchParams.get('track_id');
    var userId = url.searchParams.get('user_id');
    console.log('Retrieving track ' + trackId + ' for user ' + userId + '.');
    // var queryString = 'track_id=' + trackId + ' AND user_id=' + userId;
    var queryString = 'track_id=0 and user_id=1';
    var duration = [];

    var slider = document.getElementById('slider');
    var leftLabel = document.getElementById('left-label');
    var rightLabel = document.getElementById('right-label');

    var filterUser = document.getElementById('user-id');

    var collection = document.getElementById('leaderboard');

    var trackFeatures = [];

    // Set up the second feature layer, which shows the line where someone walked.
    fl_tracks = new FeatureLayer({
      url:
        'https://services1.arcgis.com/i9MtZ1vtgD3gTnyL/arcgis/rest/services/tracks/FeatureServer/0',
      visible: false
    });

    // Set up the first feature layer, the points where someone collected treasures.
    fl_trajectories = new FeatureLayer({
      url:
        'https://services1.arcgis.com/i9MtZ1vtgD3gTnyL/arcgis/rest/services/trajectories/FeatureServer/0',
      visible: false
    });

    // Set up graphicLayer for displaying filtered tracks
    graphicsLayer = new GraphicsLayer();

    var map = new Map({
      basemap: 'osm',
      layers: [fl_tracks, fl_trajectories]
    });

    var view = new MapView({
      container: 'viewDiv', // This is a reference to the DOM node that contains the map view.
      map: map,
      // set the center of view to honngerberg with a zoom level of 18
      center: [8.507392, 47.408445],
      zoom: 18
    });

    // We use the above defined query string to restrict the shown features.
    console.log('TCL: fl_trajectories', fl_trajectories);
    fl_trajectories.definitionExpression = queryString;
    map.add(fl_trajectories);

    // var legend = new Legend({
    //   view: view,
    //   container: document.createElement("div")
    // });
    // view.ui.add(legend, 'bottom-left');

    var expandLegend = new Expand({
      view: view,
      content: new Legend({
        view: view
      })
    });
    view.ui.add(expandLegend, "top-right");

    view
      .when(() => {
        console.log('view is ready');
        return fl_tracks.when(() => {
          console.log('tracks layer is ready');
          var minDurationByUser = {
            onStatisticField: 'duration',
            outStatisticFieldName: 'min_duration',
            statisticType: 'min'
          };

          var maxDurationByUser = {
            onStatisticField: 'duration',
            outStatisticFieldName: 'max_duration',
            statisticType: 'max'
          };

          var queryUserId = fl_tracks.createQuery();
          queryUserId.outStatistics = [minDurationByUser, maxDurationByUser];
          queryUserId.groupByFieldsForStatistics = ['user_id'];

          return fl_tracks.queryFeatures(queryUserId);
        });
      })
      .then(getInfo)
      .then(addToFilter)
      .catch(err => {
        console.error(err);
      });

    function getInfo(result) {
      var features = result.features;
      console.log('TCL: getUserId -> features', features);

      var userIds = features.map(feature => {
        return feature.attributes.user_id;
      });

      if (features) {
        var min = features[0].attributes.min_duration;
        var max = features[0].attributes.max_duration;
        features.forEach(feature => {
          if (feature.attributes.min_duration < min) {
            min = feature.attributes.min_duration;
          }
          if (feature.attributes.max_duration > max) {
            max = feature.attributes.max_duration;
          }
        });
      } else {
        M.toast({
          html: 'No track features uploaded'
        });
      }
      return [userIds, min, max];
    }

    function addToFilter(info) {
      console.log('info to filter div');
      // add user_id to select
      var userIds = info[0];
      userIds.sort();
      userIds.forEach(userId => {
        console.log('TCL: addToFilter -> userId', userId);
        var option = document.createElement('option');
        option.text = userId;
        filterUser.add(option);
        M.FormSelect.init(filterUser);
        console.log('TCL: addToFilter -> filterUser', filterUser);
      });
      console.log('TCL: addToFilter -> filterUser.value', filterUser.value);

      // add duration range to slider
      leftLabel.innerHTML = info[1];
      rightLabel.innerHTML = info[2];

      slider.noUiSlider.updateOptions({
        range: {
          'min': info[1],
          'max': info[2]
        },
        start: [info[1], info[2]]
      });
      slider.removeAttribute('disabled');
      userId = filterUser.value;
      duration = slider.noUiSlider.get();
      console.log('TCL: addToFilter -> duration', duration);
      minDurationValue = parseInt(duration[0]);
      maxDurationValue = parseInt(duration[1]);
      return queryTracks(userId, minDurationValue, maxDurationValue);
    }

    function queryTracks(userId, minDurationValue, maxDurationValue) {
      // clear previous results
      graphicsLayer.graphics = [];
      trackFeatures = [];
      map.remove(resultLayer);
      fl_trajectories.visible = false;
      console.log('query tracks');

      const query = {
        outFields: ['*'],
        returnGeometry: true
      };
      var where = '1=1';
      if (userId) {
        where = 'user_id = ' + userId;
        if (minDurationValue) {
          where += 'AND duration >= ' + minDurationValue;
        }
        if (maxDurationValue) {
          where += 'AND duration <= ' + maxDurationValue;
        }
      } else if (maxDurationValue) {
        where = 'duration >= ' + minDurationValue;
        if (maxDurationValue) {
          where += 'AND duration <= ' + maxDurationValue;
        }
      } else if (maxDurationValue) {
        where = 'duration <= ' + maxDurationValue;
      }

      query.where = where;
      console.log('TCL: queryTracks -> where', where);

      fl_tracks
        .queryFeatures(query)
        .then(result => {
          console.log('TCL: result TRACKS', result.features.length);
          var features = result.features;

          var result = new Array();
          features.forEach(feature => {
            if (feature.geometry) {
              console.log("TCL: queryTracks -> feature", feature)
              var id = feature.attributes.user_id;
              var track = feature.attributes.track_id;
              result.push({ user_id: id, track_id: track });
              colorCodeTracks(feature);
            }
          });

          console.log("colorcoded features", features);
          //create a feature collection for trackfeatures
          var popupTemplate = {
            title: 'Track <b>{track_id}</b> of User <b>{user_id}</b>',
            content:
              '<ul><li>Start POI: {start_poi}</li><li>End POI: {end_poi}</li><li>Total Duration: {duration}</li><li>Total Length: {length}</li><li>Speed: {speed}</li><li>Score Earned: {score}</li></ul>'
          };

          console.log("TRACK FEATURES: ", trackFeatures);

          const slowSymbol = {
            type: "simple-line", // autocasts as new SimpleLineSymbol()
            color: [115, 192, 91],
            width: "3px",
            style: "solid",
            cap: 'round'
          };
          const moderateSymbol = {
            type: "simple-line", // autocasts as new SimpleLineSymbol()
            color: [255, 154, 8],
            width: "3px",
            style: "solid",
            cap: 'round'
          };
          const fastSymbol = {
            type: "simple-line", // autocasts as new SimpleLineSymbol()
            color: [255, 73, 0],
            width: "3px",
            style: "solid",
            cap: 'round'
          };
          const defaultSymbol = {
            type: "simple-line", // autocasts as new SimpleLineSymbol()
            color: [139, 139, 139],
            width: "3px",
            style: "solid",
            cap: 'round'
          }

          trackRenderer = new ClassBreaksRenderer({
            field: "speed",
            legendOptions: {
              title: "Speed"
            },
            defaultSymbol: defaultSymbol,
            defaultLabel: "unknown",
            classBreakInfos: [
              {
                symbol: slowSymbol,
                label: "0 to 10",
                minValue: 0,
                maxValue: 10
              },
              {
                symbol: moderateSymbol,
                label: "10 to 16.5",
                minValue: 10,
                maxValue: 16.5
              },
              {
                symbol: fastSymbol,
                label: "> 16.5",
                minValue: 16.5,
                maxValue: 310
              }
            ]
          });

          var fields = [new Field({
            name: "FID",
            alias: "FID",
            type: "oid"
          }), new Field({
            name: "duration",
            alias: "duration",
            type: "double"
          }),
          new Field({
            name: "end_poi",
            alias: "end_poi",
            type: "string"
          }),
          new Field({
            name: "length",
            alias: "length",
            type: "double"
          }),
          new Field({
            name: "score",
            alias: "score",
            type: "double"
          }), new Field({
            name: "speed",
            alias: "speed",
            type: "double"
          }),
          new Field({
            name: "start_poi",
            alias: "start_poi",
            type: "string"
          }),
          new Field({
            name: "track_id",
            alias: "track_id",
            type: "double"
          }),
          new Field({
            name: "user_id",
            alias: "user_id",
            type: "integer"
          })
          ];

          console.log("create featurelayer for track features");
          resultLayer = new FeatureLayer({
            popupTemplate: popupTemplate,
            fields: fields,
            objectIdField: "FID",
            source: trackFeatures,
            renderer: trackRenderer
          });
          map.add(resultLayer);
          resultLayer.when(() => {
            var max_speed = {
              onStatisticField: 'speed',
              outStatisticFieldName: 'max_speed',
              statisticType: 'max'
            };
            var minSpeed = {
              onStatisticField: 'speed',
              outStatisticFieldName: 'min_speed',
              statisticType: 'min'
            };

            var query = resultLayer.createQuery();
            query.outStatistics = [minSpeed, max_speed];

            resultLayer.queryFeatures(query).then((result) => {
              console.log(result.features);
            }).catch((err) => {

            });
            console.log("renderer", resultLayer.renderer);
            // resultLayer.renderer = trackRenderer;
            console.log("renderer", resultLayer.renderer);

          })

          if (result.length == 0) {
            M.toast({
              html: 'No reasonable track features found'
            });
          } else {
            var resultMap = organizeResults(result);
            console.log('TCL: queryTracks -> resultMap', resultMap);
            queryTrajectories(resultMap);
          }

        })
        .catch(err => {
          console.error(err);
        });
    }

    function organizeResults(result) {
      var resultMap = new Array();
      result.forEach(item => {
        var existing = resultMap.filter(function (v, i) {
          return v.user_id == item.user_id;
        });
        if (existing.length) {
          var existingIndex = resultMap.indexOf(existing[0]);
          resultMap[existingIndex].track_id = resultMap[
            existingIndex
          ].track_id.concat(item.track_id);
        } else {
          if (typeof item.track_id == 'number') item.track_id = [item.track_id];
          resultMap.push(item);
        }
      });

      // ids.forEach((id, i) => {
      //   resultMap.id = result[i];
      // });
      console.log('TCL: queryTracks -> result', result);
      // console.log('TCL: queryTracks -> resultMap', resultMap);
      return resultMap;
    }

    function queryTrajectories(resultMap) {
      console.log('query trajectories');
      // construct sql query and renderer
      var tRenderer = new UniqueValueRenderer();
      var sql = '';
      if (resultMap.length == 1) {
        // only one user_id
        // construct sql that combines conditions on user_id and tracks
        sql = combineQueryWithUserTrack(resultMap[0]);
        // create uniqueValueRenderer for trajectory on field track_id
        tRenderer.field = 'track_id';
        var tracks = resultMap[0].track_id;
        tracks.forEach(track => {
          tRenderer.addUniqueValueInfo({
            value: track,
            symbol: {
              type: 'simple-marker', // autocasts as new SimpleFillSymbol()
              size: 5,
              color: randomColor(),
              outline: null
            },
            label: "Track " + track
          });
        });
      } else {
        // multiple user_ids -- create uniqueValueRenderer for trajectory on field user_id
        tRenderer.field = 'user_id';
        for (let i = 0; i < resultMap.length; i++) {
          const entry = resultMap[i];
          sql += combineQueryWithUserTrack(entry);
          if (i != resultMap.length - 1) {
            sql += ' OR ';
          }
          tRenderer.addUniqueValueInfo({
            value: entry.user_id,
            symbol: {
              type: 'simple-marker', // autocasts as new SimpleFillSymbol()
              size: 5,
              color: randomColor(),
              outline: null
            },
            label: "User " + entry.user_id
          });
        }
      }

      console.log('TCL: queryTrajectories -> sql', sql);

      // query trajectories based on constructed sql and render the layer with defined tRenderer
      fl_trajectories.definitionExpression = sql;
      fl_trajectories.renderer = tRenderer;
      // display query result
      if (!fl_trajectories.visible) fl_trajectories.visible = true;
      // add legend
      fl_trajectories.when(() => {
        console.log("trajectory layer loaded");
        legend.refresh();
      })
    }

    function combineQueryWithUserTrack(result) {
      var sql = '(user_id = ' + result.user_id + ' AND track_id IN (';
      var trackIds = result.track_id;
      for (let i = 0; i < trackIds.length; i++) {
        if (i === trackIds.length - 1) sql += trackIds[i] + '))';
        else sql += trackIds[i] + ',';
      }
      return sql;
    }

    function randomColor() {
      var letters = '0123456789ABCDEF';
      var color = '#';
      for (var i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
      }
      return color;
    }

    filterUser.addEventListener('change', () => {
      console.log('select changed');
      userId = event.target.value;
      queryTracks(userId, minDurationValue, maxDurationValue);
    });

    slider.noUiSlider.on('change', function (values, handle) {
      console.log('on slider change');
      if (handle == 0) {
        minDurationValue = values[handle];
      } else {
        maxDurationValue = values[handle];
      }
      queryTracks(userId, minDurationValue, maxDurationValue);
    });

    var distanceSum = {
      onStatisticField: 'Shape__Length', // length
      outStatisticFieldName: 'total_length',
      statisticType: 'sum'
    };
    var durationSum = {
      onStatisticField: 'duration', // length
      outStatisticFieldName: 'total_duration',
      statisticType: 'sum'
    };

    const statQuery = fl_tracks.createQuery();
    statQuery.outStatistics = [distanceSum, durationSum];
    statQuery.groupByFieldsForStatistics = ['user_id'];

    fl_tracks
      .queryFeatures(statQuery)
      .then(result => {
        console.log('number of users', result.features.length);
        var users = result.features;
        users.forEach(user => {
          var stats = user.attributes;
          console.log('LEADERBOARD STATS FOR', stats.user_id);
          console.log(' total distance', stats.total_length);
          console.log(' total duration', stats.total_duration);
          console.log(
            ' leaderboard score',
            stats.total_length * 10 + stats.total_duration
          );
        });

        var leaderboard = users.map(user => {
          return [user.attributes.user_id, user.attributes.total_length, user.attributes.total_duration, user.attributes.total_length * 10 + user.attributes.total_duration];
        })

        // sort leaderboard by score
        leaderboard.sort(function (a, b) {
          return b[3] - a[3];
        });

        console.log("TCL: leaderboard AFTER SORT", leaderboard)

        populateLeaderboard(leaderboard);

      })
      .catch(err => {
        console.error(err);
      });

    function populateLeaderboard(leaderboard) {
      if (leaderboard) {
        leaderboard.forEach(entry => {
          console.log("TCL: populateLeaderboard -> entry", entry)
          var li = document.createElement('li');
          li.className = "collection-item avatar";
          var img = document.createElement('img');
          img.src = "https://source.unsplash.com/50x50/?friends/" + (leaderboard.indexOf(entry) + 1);
          img.className = "circle responsive-img";
          li.appendChild(img);
          var span = document.createElement('span');
          span.className = "title";
          span.innerHTML = "User " + entry[0];
          li.appendChild(span);
          var p1 = document.createElement('p');
          p1.innerHTML = "Total Distance: " + parseFloat(entry[1]).toFixed(2);
          li.appendChild(p1);
          var p2 = document.createElement('p');
          p2.innerHTML = "Total Duration: " + entry[2];
          li.appendChild(p2);
          var div = document.createElement('div');
          div.className = "secondary-content";
          var p3 = document.createElement('p');
          p3.innerHTML = parseFloat(entry[3]).toFixed(2);
          p3.className = "flow-text";
          div.appendChild(p3);
          var rank = document.createElement('h6');
          rank.innerHTML = "RANK " + (leaderboard.indexOf(entry) + 1);
          rank.className = "right-align";
          div.appendChild(rank);
          li.appendChild(div);
          collection.appendChild(li);
          console.log("TCL: populateLeaderboard -> collection", collection)

        });
      }
      else {
        M.toast({
          html: 'No track features uploaded'
        });
      }
    }

    function findStartEnd(start_coord, end_coord, spatial_reference) {
      var currentPoi = webMercatorUtils.lngLatToXY(
        poi[0].longitude,
        poi[0].latitude
      );
      // console.log('TCL: findStartEnd -> currentPoi projected', currentPoi);

      var toStart = new Polyline({
        paths: [start_coord, currentPoi],
        spatialReference: spatial_reference
      });

      var toEnd = new Polyline({
        paths: [end_coord, currentPoi],
        spatialReference: spatial_reference
      });

      var minStartDist = geometryEngine.geodesicLength(toStart, 'meters');
      var minEndDist = geometryEngine.geodesicLength(toEnd, 'meters');
      var start = poi[0].name;
      var end = poi[0].name;

      for (let i = 1; i < poi.length; i++) {
        currentPoi = webMercatorUtils.lngLatToXY(
          poi[i].longitude,
          poi[i].latitude
        );

        toStart.paths = [start_coord, currentPoi];

        toEnd.paths = [end_coord, currentPoi];

        var startDist = geometryEngine.geodesicLength(toStart, 'meters');
        var endDist = geometryEngine.geodesicLength(toEnd, 'meters');

        if (startDist < minStartDist) {
          minStartDist = startDist;
          start = poi[i].name;
        }
        if (endDist < minEndDist) {
          minEndDist = endDist;
          end = poi[i].name;
        }
      }

      return [start, end];
    }

    function colorCodeTracks(polyline) {
      console.log('color code tracks');
      var segments = polyline.geometry.paths[0];
      const sr = polyline.geometry.spatialReference;
      var slowSymbol = new SimpleLineSymbol({
        color: [115, 192, 91],
        width: 4,
        cap: 'round'
      });
      var moderateSymbol = new SimpleLineSymbol({
        color: [255, 154, 8],
        width: 4,
        cap: 'round'
      });
      var fastSymbol = new SimpleLineSymbol({
        color: [255, 73, 0],
        width: 4,
        cap: 'round'
      });

      var start_end = findStartEnd(
        segments[0],
        segments[segments.length - 1],
        sr
      );

      var popupTemplate = {
        title: 'Track <b>{track_id}</b> of User <b>{user_id}</b>',
        content:
          '<ul><li>Start POI: {start_poi}</li><li>End POI: {end_poi}</li><li>Duration: {duration}</li><li>Total Length: {length}</li><li>Score Earned: {score}</li></ul>'
      };

      for (let i = 0; i < segments.length - 1; i++) {
        console.log("TRACK FEATURE LENGTH", trackFeatures.length);
        var subline = new Polyline({
          paths: [segments[i], segments[i + 1]],
          spatialReference: sr
        });
        var dist = geometryEngine.geodesicLength(subline, 'meters');
        var attributes = {
          FID: trackFeatures.length,
          user_id: polyline.attributes.user_id,
          track_id: polyline.attributes.track_id,
          duration: polyline.attributes.duration,
          length: polyline.attributes.Shape__Length,
          score:
            polyline.attributes.Shape__Length * 10 + polyline.attributes.duration,
          start_poi: start_end[0],
          end_poi: start_end[1],
          speed: dist
        };

        var g = new Graphic({
          geometry: subline,
          attributes: attributes,
          popupTemplate: popupTemplate
        });

        var t = new Graphic({
          geometry: subline,
          attributes: attributes
        });
        trackFeatures.push(t);

        // console.log('TCL: colorCodeTracks -> dist', dist);
        if (dist < 10) {
          g.symbol = slowSymbol;
        } else if (dist < 16.5) {
          g.symbol = moderateSymbol;
        } else {
          g.symbol = fastSymbol;
        }
        graphicsLayer.graphics.add(g);
      }
    }

    // Finally, we want to zoom to the respective line (but only if the query actually retreived one).
    const query = new Query();
    query.where = queryString;
    fl_tracks.queryFeatureCount(query).then(function (numResults) {
      if (numResults > 0) {
        fl_tracks
          .when(function () {
            return fl_tracks.queryExtent();
          })
          .then(function (response) {
            view.goTo(response.extent);
          });
      }
    });
  });
