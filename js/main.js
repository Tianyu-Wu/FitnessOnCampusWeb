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
          // assume that all valid users have duration no less than zero
          queryUserId.where = 'duration >= 0';
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
        var option = document.createElement('option');
        // set the text as the user_id
        option.text = userId;
        // add the option to filter
        filterUser.add(option);
      });
      // reinitialize the dropdown to show the populated user_id
      M.FormSelect.init(filterUser);

      // get the min and max duration from previous result
      var min = info[1];
      var max = info[2];

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

      // get the selected user_id and duration range
      userId = filterUser.value;
      duration = slider.noUiSlider.get();
      minDurationValue = parseInt(duration[0]);
      maxDurationValue = parseInt(duration[1]);
      // query tracks based on the selected conditions
      return queryTracks(userId, minDurationValue, maxDurationValue);
    }

    /**
     * query tracks with respect to currently selected user_id and duration range
     * when no user_id is selected (select the "choose all user_id" option), 
     * query for all tracks within the duration range
     * 
     * @param {numbers} userId the selected user_id, if select "choose all user_id", the value is null
     * @param {double} minDurationValue lower bound for duration
     * @param {double} maxDurationValue upper bound for duration
     */
    function queryTracks(userId, minDurationValue, maxDurationValue) {
      // clear previous results
      trackFeatures = [];
      map.remove(resultLayer);
      fl_trajectories.visible = false;
      console.log('query tracks');

      // set default query to show all the tracks within duration range
      const query = {
        outFields: ['*'],
        returnGeometry: true
      };
      var where = 'duration >= ' + minDurationValue + ' AND duration <= ' + maxDurationValue;

      // if have selected a user_id, add user_id condition to default query
      if (userId) {
        where += ' AND user_id = ' + userId;
      }

      query.where = where;
      // query track features with constructed query
      fl_tracks
        .queryFeatures(query)
        .then(result => {
          var features = result.features;
          // if no features returned, notify the user
          if (!features) throw 'No tracks founded!';
          // create an array storing returned user_id and track_id
          var result = new Array();
          features.forEach(feature => {
            // only show tracks with geometry
            if (feature.geometry) {
              var id = feature.attributes.user_id;
              var track = feature.attributes.track_id;
              result.push({ user_id: id, track_id: track });
              // split each track into individual segments
              createTrackFeature(feature);
            }
          });

          // display queried tracks with speed color-coding style
          displayResult(result);
        })
        .catch(err => {
          console.error(err);
          M.toast({
            html: err
          });
        });
    }

    /**
     * split the track into each individual segments, create a graphic for each segment and add to trackFeature list 
     * @param {feature} polyline a polyline feature
     */
    function createTrackFeature(polyline) {
      // get the paths of the track (a list of points that constructs the polyline feature)
      var segments = polyline.geometry.paths[0];
      // denotes the spatial reference of the feature
      const sr = polyline.geometry.spatialReference;

      // find the start and end poi of the track
      var start_end = findStartEnd(
        segments[0],
        segments[segments.length - 1],
        sr
      );

      // loop through segments and create a line feature for each two consecutive points
      for (let i = 0; i < segments.length - 1; i++) {
        // create a polyline with same spatial reference as the original
        var subline = new Polyline({
          paths: [segments[i], segments[i + 1]],
          spatialReference: sr
        });
        // as the intervals of all trajectory points are the same, the speed of each segment is indicated by the distance between two points
        var dist = geometryEngine.geodesicLength(subline, 'meters');

        // populate attributes for the newly created feature
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

        // combines polyline geometry and attributes
        var t = new Graphic({
          geometry: subline,
          attributes: attributes
        });
        // add the graphic to the list
        trackFeatures.push(t);
      }
    }

    /**
     * find the start and end poi of the track
     * @param {list of doubles} start_coord the [x, y] coordinates of the first trajectory point of the track
     * @param {list of doubles} end_coord the [x, y] coordinates of the last trajectory point of the track
     * @param {*} spatial_reference spatial reference of the coordinate
     */
    function findStartEnd(start_coord, end_coord, spatial_reference) {
      // get the x, y coordinates of the poi
      var currentPoi = webMercatorUtils.lngLatToXY(
        poi[0].longitude,
        poi[0].latitude
      );

      // create two polylines that connects current poi and the start/end trajectory points for distance calculation
      var toStart = new Polyline({
        paths: [start_coord, currentPoi],
        spatialReference: spatial_reference
      });

      var toEnd = new Polyline({
        paths: [end_coord, currentPoi],
        spatialReference: spatial_reference
      });

      // initialize the min and max distance with the first poi
      var minStartDist = geometryEngine.geodesicLength(toStart, 'meters');
      var minEndDist = geometryEngine.geodesicLength(toEnd, 'meters');
      // keep track of the poi names
      var start = poi[0].name;
      var end = poi[0].name;

      // loop through the rest pois and find the two pois that are closest to the start and end trajectory points
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

      // return the start and end poi name
      return [start, end];
    }
    /**
     * display the queried track features with a speed color-coding style 
     * and query for corresponding trajectory features
     * @param {list} result 
     */
    function displayResult(result) {
      try {
        // if none of the return tracks has geometry, notify users
        if (result.length == 0) throw 'No reasonable track features found';

        // create track featurelayer from a collection for graphics
        // define popup template that shows track id, user id, start and end poi, total duration and speed of the segment
        var popupTemplate = {
          title: 'Track <b>{track_id}</b> of User <b>{user_id}</b>',
          content:
            '<ul><li>Start POI: {start_poi}</li><li>End POI: {end_poi}</li><li>Total Duration: {duration}</li><li>Total Length: {length}</li><li>Speed: {speed}</li><li>Score Earned: {score}</li></ul>'
        };

        // define a symbology for different classes of speed
        // segments with lower speed is represented in green
        const slowSymbol = {
          type: "simple-line", // autocasts as new SimpleLineSymbol()
          color: [115, 192, 91],
          width: "3px",
          style: "solid",
          cap: 'round'
        };
        // segments with moderate speed are represented in orange
        const moderateSymbol = {
          type: "simple-line", // autocasts as new SimpleLineSymbol()
          color: [255, 154, 8],
          width: "3px",
          style: "solid",
          cap: 'round'
        };
        // segments with higher speed are represent in red
        const fastSymbol = {
          type: "simple-line", // autocasts as new SimpleLineSymbol()
          color: [255, 73, 0],
          width: "3px",
          style: "solid",
          cap: 'round'
        };
        // segments without speed information are represented in grey
        const defaultSymbol = {
          type: "simple-line", // autocasts as new SimpleLineSymbol()
          color: [139, 139, 139],
          width: "3px",
          style: "solid",
          cap: 'round'
        }
        // define a classBreak renderer that color-codes the segments based on speed
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

        // define the field of the featurelayer
        var fields = [new Field({
          name: "FID",
          alias: "FID",
          type: "oid"
        }), new Field({
          name: "duration", // denotes the total duration of the track that this segment belongs to
          alias: "duration",
          type: "double"
        }),
        new Field({
          name: "end_poi", // denotes the end of the track that this segment belongs to
          alias: "end_poi",
          type: "string"
        }),
        new Field({
          name: "length", // the length denotes the total length of the track that this segment belongs to
          alias: "length",
          type: "double"
        }),
        new Field({
          name: "score", // the score denotes the score earned for the track that this segment belongs to
          alias: "score",
          type: "double"
        }), new Field({
          name: "speed", // denotes the speed of this segment
          alias: "speed",
          type: "double"
        }),
        new Field({
          name: "start_poi", // denotes the start of the track that this segment belongs to
          alias: "start_poi",
          type: "string"
        }),
        new Field({
          name: "track_id", // denotes the track_id that this segment belongs to
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
        // create resultlayer from a collection of track segments
        resultLayer = new FeatureLayer({
          popupTemplate: popupTemplate,
          fields: fields,
          objectIdField: "FID",
          source: trackFeatures,
          renderer: trackRenderer
        });
        // add the resultlayer to the map under the layer of trajectory
        map.add(resultLayer, 0);

        // zoom to resultlayer
        zoomToLayer(resultLayer);

        // get the pair of user_id and its track_id list
        var resultMap = organizeResults(result);
        // query for corresponding trajectory points
        queryTrajectories(resultMap);
      } catch (error) {
        M.toast({
          html: error
        });
      }
    }

    /**
     * merge track_ids into a list of track_id for each user_id
     * 
     * @param {list of user_id and track_id} result 
     * result: [{user_id: 1, track_id: 1}, {user_id: 1, track_id: 2}, {user_id: 2, track_id: 1}]
     * resultMap: [{user_id: 1, track_id:[1, 2]}, {user_id: 2, track_id: 1}]
     */
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

    /**
     * query for trajectory points correspond to the filtered tracks
     * @param {list of user_id and track_ids} resultMap 
     */
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

        // if only one user_id, render trajectory points on track_id
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
        // refresh the legend to show latest symbology of trajectory layer
        refreshLegend();
      })
    }

    /**
     * construct sql for a pair of user_id and track_ids
     * @param {key-value map of user_id and a list of track_ids} result 
     * e.g. result: {user_id: 1, track_id: [1, 2, 3, 4]}
     *      sql: user_id = 1 AND track_id IN (1, 2, 3, 4)
     */
    function combineQueryWithUserTrack(result) {
      var sql = '(user_id = ' + result.user_id + ' AND track_id IN (';
      var trackIds = result.track_id;
      for (let i = 0; i < trackIds.length; i++) {
        if (i === trackIds.length - 1) sql += trackIds[i] + '))';
        else sql += trackIds[i] + ',';
      }
      return sql;
    }

    /**
     * generate random color
     */
    function randomColor() {
      var letters = '0123456789ABCDEF';
      var color = '#';
      for (var i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
      }
      return color;
    }

    // get information for leaderboard
    // construct statistic query for total length
    var distanceSum = {
      onStatisticField: 'Shape__Length', // length
      outStatisticFieldName: 'total_length',
      statisticType: 'sum'
    };
    // construct statistic query for total duration
    var durationSum = {
      onStatisticField: 'duration', // length
      outStatisticFieldName: 'total_duration',
      statisticType: 'sum'
    };

    // construct query that calculates the total length and total duration for each user_id
    const statQuery = fl_tracks.createQuery();
    // assume that all valid users have a duration no less than 0
    statQuery.where = 'duration >= 0';
    statQuery.outStatistics = [distanceSum, durationSum];
    statQuery.groupByFieldsForStatistics = ['user_id'];

    // query on track features
    fl_tracks
      .queryFeatures(statQuery)
      .then(result => {
        console.log('number of users', result.features.length);
        var users = result.features;
        // get a list of user_id, total_length, total_duration and calculated scores with previous two fields
        var leaderboard = users.map(user => {
          return [user.attributes.user_id, user.attributes.total_length, user.attributes.total_duration, user.attributes.total_length * 10 + user.attributes.total_duration];
        })

        // sort leaderboard by score in descending order
        leaderboard.sort(function (a, b) {
          return b[3] - a[3];
        });
        // populate information into the leaderboard section in HTML and show on web
        populateLeaderboard(leaderboard);
      })
      .catch(err => {
        console.error(err);
        M.toast({
          html: err
        });
      });

    /**
     * populate information into the leaderboard section in HTML and show on web
     * the result will show as an avatar collections
     * @param {list of user_id, total_length, total_duration and score} leaderboard
     * e.g. leaderboard: [1, 100.23, 23456, 24458.3]
     */
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

    /**
     * listen to the change of selected user_id for filtering
     * once the value of selected user_id is changed, fire a new query for tracks
     */
    filterUser.addEventListener('change', () => {
      console.log('select changed');
      userId = event.target.value;
      queryTracks(userId, minDurationValue, maxDurationValue);
    });

    /**
     * listen to the change of duration range slider
     * once the range has been changed, get the duration value of the changed handle
     * and fire a new query for tracks
     */
    slider.noUiSlider.on('change', function (values, handle) {
      console.log('on slider change');
      // depending on which handle is changed, modify the min or max duration value
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