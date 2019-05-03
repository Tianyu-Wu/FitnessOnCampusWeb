// ArcGIS uses requirejs to manage libraries and dependencies. We load some libraries related to
// feature layers and maps. Use this html file by visiting
// http://host:port/mobile-gis/?track_id=0&user_id=0 (replace host with 127.0.0.1 and the port for
// example with 5000 for testing).


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
  'esri/Graphic',
  'esri/geometry/Polyline',
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
  Graphic,
  Polyline,
  Legend,
  Expand,
  geometryEngine,
  webMercatorUtils,
  UniqueValueRenderer,
  ClassBreaksRenderer,
  Field
) {
    // get the elements in HTML that need to be populated
    var slider = document.getElementById('duration-slider');
    var leftLabel = document.getElementById('left-label');
    var rightLabel = document.getElementById('right-label');
    var filterUser = document.getElementById('user-id');
    var collection = document.getElementById('leaderboard');

    // declare global variables
    // stores a list of track segment graphics, which will be used to generate color coded track layer
    var trackFeatures = [];
    // keeps track of currently selected user_id from the filter
    var userId;
    // keeps track of currently selected duration from the filter
    var duration = [];

    // Set up the original track feature layer, which shows the line where someone walked.
    var fl_tracks = new FeatureLayer({
      url:
        'https://services1.arcgis.com/i9MtZ1vtgD3gTnyL/arcgis/rest/services/tracks/FeatureServer/0',
      visible: false
    });

    // Set up the original trajectory feature layer, the points where someone collected treasures.
    // The trajecotries layer is initially hidden, once the query is defined, the visibility will be set to true to show the points after filter
    var fl_trajectories = new FeatureLayer({
      url:
        'https://services1.arcgis.com/i9MtZ1vtgD3gTnyL/arcgis/rest/services/trajectories/FeatureServer/0',
      visible: false
    });

    // a layer for displaying color coded tracks
    var resultLayer;

    // define the basemap as well as the layers on top
    // not that the resultlayer will be added once it's defined
    var map = new Map({
      basemap: 'osm',
      layers: [fl_trajectories]
    });

    // define a view of the map object which is centered at honggerberg campus
    var view = new MapView({
      container: 'viewDiv', // This is a reference to the DOM node that contains the map view.
      map: map,
      // set the center of view to honngerberg with a zoom level of 18
      center: [8.507392, 47.408445],
      zoom: 18
    });

    // define a legend style to be shown on large and medium devices
    var legend = new Legend({
      view: view,
      container: document.createElement("div")
    });

    // define a expandable legend to be shown on small (e.g. mobile devices)
    var expandLegend = new Expand({
      view: view,
      content: new Legend({
        view: view
      })
    });

    // keeps track whether the window size is small
    var isSmall = (view.heightBreakpoint === "xsmall" || view.widthBreakpoint === "xsmall");
    // initialize ui components with respect to window size
    if (isSmall) {
      // if the window size is very small, adapt to expandable legend
      view.ui.add(expandLegend, 'top-right');
      view.ui.components = ["attribution"];
    } else {
      // otherwise show default legend style on large window
      view.ui.add(legend, 'top-right');
    }

    // watch the window size breakpoint in order to update to corresponding legend style will be shown
    view.watch("heightBreakpoint, widthBreakpoint", () => {
      console.log("height breakpoint", view.heightBreakpoint, view.widthBreakpoint);
      isSmall = (view.heightBreakpoint === "xsmall" || view.widthBreakpoint === "xsmall");
      updateUI();
    });

    /**
     * Updating view ui with respect to window size
     * hide zoom component and use expandable legend on mobile devices
     */
    function updateUI() {
      if (isSmall) {
        view.ui.add(expandLegend, 'top-right');
        view.ui.remove(legend);
        view.ui.components = ["attribution"];
      } else {
        view.ui.add(legend, 'top-right');
        view.ui.remove(expandLegend);
        view.ui.components = ["attribution", "zoom"];
        console.log("ui components", view.ui.components);
      }
    }

    /**
     * Refresh currently active legend to show the latest symbology
     */
    function refreshLegend() {
      if (isSmall) {
        legend.refresh();
      } else {
        expandLegend.refresh();
      }
    }

    view
      .when(() => {
        // construct statistic query for min and max duration as well as list of active user ids
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

          // execute the constructed query
          return fl_tracks.queryFeatures(queryUserId);
        });
      })
      .then(getInfo)
      .then(addToFilter)
      .catch(err => {
        console.error(err);
      });

    /**
     * decompose the query result and get the information the filter needs
     * @param {*} result returned statistic summary of track features
     * return a list of user_id, the min and max duration of all the tracks
     */
    function getInfo(result) {
      try {
        var features = result.features;
        console.log('TCL: getUserId -> features', features);

        // a list of user_ids
        var userIds = features.map(feature => {
          return feature.attributes.user_id;
        });

        if (!features) throw 'No track features uploaded';

        // find the global min and max duration of all the tracks
        var min = Number.MAX_VALUE;
        var max = Number.MIN_VALUE;
        features.forEach(feature => {
          if (feature.attributes.min_duration < min) {
            min = feature.attributes.min_duration;
          }
          if (feature.attributes.max_duration > max) {
            max = feature.attributes.max_duration;
          }
        });
        return [userIds, min, max];
      } catch (error) {
        M.toast({
          html: error
        });
      }
    }

    /**
     * Parse the acquired information and populate them into filter
     * @param {list} info 
     * [0] a list of active user_ids
     * [1] min duration
     * [2] max duration
     */
    function addToFilter(info) {
      console.log('info to filter div');
      // the list of user_ids to be added
      var userIds = info[0];
      userIds.sort();
      userIds.forEach(userId => {
        // for each user_id, create an option within the <select></select>
        console.log('TCL: addToFilter -> userId', userId);
        var option = document.createElement('option');
        // set the text as the user_id
        option.text = userId;
        // add the option to filter
        filterUser.add(option);
      });
      // reinitialize the dropdown to show the populated user_id
      M.FormSelect.init(filterUser);
      console.log('TCL: addToFilter -> filterUser', filterUser);
      console.log('TCL: addToFilter -> filterUser.value', filterUser.value);

      // get the min and max duration from previous result
      var min = info[1];
      var max = info[2];


      if (!min || !max) {
        if (!min) {
          // if min duration is null, set min duration to zero 
          min = 0;
        }
        if (!max) {
          // if max duration not find, set the maximum value possible
          max = Number.MAX_VALUE;
        }
        // add duration range to slider and populate the min and max value in labels
        leftLabel.innerHTML = min;
        rightLabel.innerHTML = max;

        // update the slider to show min and max value
        // set the start and end of the slider to min and max value
        slider.noUiSlider.updateOptions({
          range: {
            'min': min,
            'max': max
          },
          start: [min, max]
        });
        // enable slider
        slider.removeAttribute('disabled');
      }

      // get the selected user_id and duration range
      userId = filterUser.value;
      duration = slider.noUiSlider.get();
      console.log('TCL: addToFilter -> duration', duration);
      minDurationValue = parseInt(duration[0]);
      maxDurationValue = parseInt(duration[1]);
      // query tracks based on the selected conditions
      return queryTracks(userId, minDurationValue, maxDurationValue);
    }

    function queryTracks(userId, minDurationValue, maxDurationValue) {
      // clear previous results
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
      fl_tracks
        .queryFeatures(query)
        .then(result => {
          var features = result.features;

          if (!features) throw 'No tracks founded!';

          var result = new Array();
          features.forEach(feature => {
            if (feature.geometry) {
              var id = feature.attributes.user_id;
              var track = feature.attributes.track_id;
              result.push({ user_id: id, track_id: track });
              createTrackFeature(feature);
            }
          });

          console.log("colorcoded features", features);
          displayResult(result);
        })
        .catch(err => {
          console.error(err);
          M.toast({
            html: err
          });
        });
    }

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
        var leaderboard = users.map(user => {
          return [user.attributes.user_id, user.attributes.total_length, user.attributes.total_duration, user.attributes.total_length * 10 + user.attributes.total_duration];
        })

        // sort leaderboard by score
        leaderboard.sort(function (a, b) {
          return b[3] - a[3];
        });
        populateLeaderboard(leaderboard);
      })
      .catch(err => {
        console.error(err);
        M.toast({
          html: err
        });
      });

    function populateLeaderboard(leaderboard) {
      try {
        if (!leaderboard) throw 'No information found';
        leaderboard.forEach(entry => {
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
          div.className = "secondary-content deep-orange-text text-lighten-1";
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
        });
      } catch (error) {
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

    function createTrackFeature(polyline) {
      var segments = polyline.geometry.paths[0];
      const sr = polyline.geometry.spatialReference;

      var start_end = findStartEnd(
        segments[0],
        segments[segments.length - 1],
        sr
      );

      for (let i = 0; i < segments.length - 1; i++) {
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

        var t = new Graphic({
          geometry: subline,
          attributes: attributes
        });
        trackFeatures.push(t);
      }
    }

    function randomColor() {
      var letters = '0123456789ABCDEF';
      var color = '#';
      for (var i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
      }
      return color;
    }

    function displayResult(result) {
      try {
        if (result.length == 0) throw 'No reasonable track features found';
        //create a feature collection for trackfeatures
        var popupTemplate = {
          title: 'Track <b>{track_id}</b> of User <b>{user_id}</b>',
          content:
            '<ul><li>Start POI: {start_poi}</li><li>End POI: {end_poi}</li><li>Total Duration: {duration}</li><li>Total Length: {length}</li><li>Speed: {speed}</li><li>Score Earned: {score}</li></ul>'
        };

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
        map.add(resultLayer, 0);

        // zoom to resultlayer
        zoomToLayer(resultLayer);

        var resultMap = organizeResults(result);
        queryTrajectories(resultMap);
      } catch (error) {
        M.toast({
          html: error
        });
      }
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
      // refresh legend
      fl_trajectories.when(() => {
        console.log("trajectory layer loaded");
        fl_trajectories.queryFeatureCount().then(function (numFeatures) {
          // prints the total count to the console
          console.log("number of trajectories: " + numFeatures);
        });

        refreshLegend();
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

    // Finally, we want to zoom to the respective line (but only if the query actually retreived one).
    function zoomToLayer(layer) {
      return layer.queryExtent().then(function (response) {
        view.goTo(response.extent);
      });
    }
  });