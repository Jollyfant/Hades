var map,
    degreeCircle,
    polyLine;

// Configuration
const APPLICATION_VERSION = "Alpha 0.3.0";
const HADES_SERVER = "127.0.0.1:8080";

const EARTH_RADIUS = 6371.0;

document.getElementById("application-version").innerHTML = APPLICATION_VERSION;
document.getElementById("exampleModalLabel").innerHTML = APPLICATION_VERSION;

function createMarker(label) {

  /*
   * Function createMarker
   * Creates google maps marker
   */

  return {
    "map": map,
    "label": {
      "text": label,
      "fontSize": "12px",
      "fontWeight": "bold",
      "fontFamily": "helvetica",
      "color": "white"
    },
    "draggable": true
  }

}

function initMap() {

  /*
   * Function initMap
   * Initializes the Google Maps application
   */

  function toggleOverlay(bool) {

    /*
     * Function initMap::toggleOverlay
     * Toggles plate layer
     */

    bool ? plateLayer.setMap(map) : plateLayer.setMap(null);

  }

  // Update local storage with current version
  if(window.localStorage) {
    if(localStorage.getItem("__version__") !== APPLICATION_VERSION) {
      $('#exampleModal').modal();
    }
    localStorage.setItem("__version__", APPLICATION_VERSION);
  }

  // Add a KML layer
  plateLayer = new google.maps.KmlLayer({
    "url": "http://www.orfeus-eu.org/extra/tectonic_plates.kml",
    "suppressInfoWindows": true,
    "preserveViewport": true,
  });

  // Satellite map
  $("#show-satellite").change(function () {
    if(document.getElementById("show-satellite").checked) {
      map.setMapTypeId("satellite");
    } else {
      map.setMapTypeId("terrain");
    }
  });

  $("#show-plate-boundaries").change(function () {
    toggleOverlay(document.getElementById("show-plate-boundaries").checked);
  });

  // Create a map object and specify the DOM element for display.
  map = new google.maps.Map(document.getElementById("map"), {
    "center": {"lat": 0, "lng": -70},
    "zoom": 3,
    "disableDefaultUI": true
  });

  firstMarker = new google.maps.Marker(createMarker("L"));
  secondMarker = new google.maps.Marker(createMarker("R"));

  degreeCircle = new google.maps.Circle({
    "map": map,
    "radius": (40).Radians() * 6371E3,
    "strokeColor": "grey",
    "fillColor": "transparent",
    "strokeWeight": 0.25,
  });

  degreeCircle.bindTo("center", firstMarker, "position");

  // Add listeners to the markers
  google.maps.event.addListener(firstMarker, "dragend", getCrossSection);
  google.maps.event.addListener(secondMarker, "dragend", getCrossSection); 

  // When the preset select menu is changed
  document.getElementById("select-preset").addEventListener("change", selectEvent);
  document.getElementById("lock-degrees").addEventListener("change", getCrossSection);
  document.getElementById("high-resolution").addEventListener("change", getCrossSection);
  document.getElementById("high-contrast").addEventListener("change", getCrossSection);
  document.getElementById("model-type").addEventListener("change", getCrossSection);

  function selectEvent() {

    /*
     * Function initMap::selectEvent
     * Pans map over preset of selected plate
     */

    function setPreset(first, second, model) {
    
      /*
       * Function initMap::selectEvent::setPreset
       * Puts markers to position one and two
       */

      // The preset may be for a particular model 
      if(model !== undefined) {
        document.getElementById("model-type").value = model;
      }
    
      // Move the markers
      firstMarker.setPosition(first);
      secondMarker.setPosition(second);
      zoomCamera(first, second);

      // Create the cross section
      getCrossSection();
    
    }

    // Magic number of profiles
    switch(document.getElementById("select-preset").value) {
      case "Banda":
        return setPreset({"lat": -5.08, "lng": 91.7}, {"lat": -5.08, "lng": 167});
      case "Scotia":
        return setPreset({"lat": -54.8, "lng": -59.0}, {"lat": -54.8, "lng": -12.3});
      case "Chile":
        return setPreset({"lat": -16.15, "lng": -95.6}, {"lat": -16.15, "lng": -21.1});
      case "Gibraltar":
        return setPreset({"lat": 30.46, "lng": -19.2}, {"lat": 39.17, "lng": 8.77});
      case "Hawaii":
        return setPreset({"lat": 12.31, "lng": -173.6}, {"lat": 28.13, "lng": -138.4});
      case "Faralon":
        return setPreset({"lat": 37.25, "lng": -134.2}, {"lat": 41.07, "lng": -101.7});
      case "Aegean":
        return setPreset({"lat": 37.34, "lng": 15.3}, {"lat": 37.93, "lng": 54.19});
     }

  }

  // Trigger the first automatic select
  selectEvent();

}

function getPositionAtDistanceAndBearing(first, bearing, degrees) {

  /*
   * Function getPositionAtDistanceAndBearing
   * returns the position from another position at bearing & distance
   * https://www.movable-type.co.uk/scripts/latlong.html#destPoint
   */

  // Initial position
  var phi1 = first.position.toJSON().lat.Radians();
  var lam1 = first.position.toJSON().lng.Radians();

  // Add distance at bearing to initial position
  var phi2 = Math.asin(Math.sin(phi1) * Math.cos(degrees) + Math.cos(phi1) * Math.sin(degrees) * Math.cos(bearing));
  var lam2 = lam1 + Math.atan2(Math.sin(bearing) * Math.sin(degrees) * Math.cos(phi1), Math.cos(degrees) - Math.sin(phi1) * Math.sin(phi2));

  return new google.maps.LatLng({
    "lat": phi2.Degrees(),
    "lng": lam2.Degrees()
  }); 

}

function getLockedMarkerPosition(first, second) {

 /*
  * Function getLockedMarkerPosition
  * Returns the current bearing between two points
  * https://www.movable-type.co.uk/scripts/latlong.html#bearing
  */

  const DISTANCE_DEGREES = 40;

  // Get the latitudes, longitudes
  var phi1 = first.position.toJSON().lat.Radians();
  var phi2 = second.position.toJSON().lat.Radians();
  var lam1 = first.position.toJSON().lng.Radians();
  var lam2 = second.position.toJSON().lng.Radians();

  var y = Math.sin(lam2 - lam1) * Math.cos(phi2);
  var x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(lam2 - lam1);
  var bearing = Math.atan2(y, x);

  // Get the position at a given distance and bearing
  return getPositionAtDistanceAndBearing(
    first,
    bearing,
    DISTANCE_DEGREES.Radians()
  );

}

function zoomCamera(first, second) {

  /*
   * Function zoomCamera
   * Adds both markers within camera bounds
   */

  var bounds = new google.maps.LatLngBounds();

  bounds.extend(first);
  bounds.extend(second);

  // Fit the bounds and draw the cross section
  map.fitBounds(bounds);

}

function getCrossSection() {

  /*
   * Function getCrossSection
   * Makes API call to HADES to get the cross section between two markers
   */

  function formatLocationString(first, second) {

    /*
     * Function getProgressBarMessage
     * Returns a loading message
     */

  return "<b>Geodesic Section</b><br>" + first.lat.toFixed(2) + "°N " + first.lng.toFixed(2) + "°E <b>to</b> " + second.lat.toFixed(2) + "°N " + second.lng.toFixed(2) + "°E";

  }

  function getProgressBarMessage() {

    /*
     * Function getProgressBarMessage
     * Returns a loading message
     */

    return (Math.random() < 0.05) ? "<b>Evicting any remaining mantle goblins.</b>" : "<b>Creating tomographic section.</b>";

  }

  // Set the arrow symbol
  const ARROW_SYMBOL = {"path": google.maps.SymbolPath.FORWARD_OPEN_ARROW};

  // Set 40 degree circle to visible
  degreeCircle.setVisible(document.getElementById("lock-degrees").checked);

  // Lock the marker to 40 degree distance
  if(document.getElementById("lock-degrees").checked) {
    secondMarker.setPosition(getLockedMarkerPosition(firstMarker, secondMarker));
  }

  // Remove the previous line
  if(polyLine) {
    polyLine.setMap(null);
  }

  // Add polyline to map
  polyLine = new google.maps.Polyline({
    "path": [firstMarker.position, secondMarker.position],
    "icons": [{
      "icon": ARROW_SYMBOL,
      "offset": "25%"
    }, {
      "icon": ARROW_SYMBOL,
      "offset": "50%"
    }, {
      "icon": ARROW_SYMBOL,
      "offset": "75%"
    }],
    "geodesic": true,
    "reversed": true,
    "strokeColor": "green",
    "strokeOpacity": 0.75,
    "strokeWeight": 2,
    "map": map
  });

  // Create the querystring
  var queryString = "?" + [
    "phi1=" + firstMarker.position.toJSON().lat,
    "lam1=" + firstMarker.position.toJSON().lng,
    "phi2=" + secondMarker.position.toJSON().lat,
    "lam2=" + secondMarker.position.toJSON().lng,
    "model=" + document.getElementById("model-type").value,
    "resolution=" + (document.getElementById("high-resolution").checked ? "high" : "low")
  ].join("&");

  document.getElementById("location-information").innerHTML = formatLocationString(firstMarker.position.toJSON(), secondMarker.position.toJSON());
  document.getElementById("progress-bar-text").innerHTML = getProgressBarMessage(); 
  document.getElementById("progress-bar").style.visibility = "visible";

  $.ajax({
    "url": "http://" + HADES_SERVER + "/" + queryString,
    "dataType": "json",
    "type": "GET",
    "success": drawCrossSection, 
    "error": function(json) {
      drawCrossSection(null);
    }
  });

}

function drawCrossSection(json) {

  /*
   * Function drawCrossSection
   * Draws the cross section based on the returned JSON
   */

  // Hades is offline
  if(json === null) {
    return alert("Hades could not serve the request.");
  }

  // Hide the progress bar
  document.getElementById("progress-bar").style.visibility = "hidden";

  // Create radial chart
  document.getElementById("svg-container").innerHTML = "";
  new HadesArced(json);

  var distance;
  var heatmapData = new Array();

  // Prepare heatmap data array
  for(var i = 0; i < json.crossSection.length; i++) {
    distance = json.distance * (i / (json.crossSection.length - 1)) * EARTH_RADIUS;
    json.crossSection[i].data.forEach(function(x) {
      heatmapData.push([
        distance,
        x.depth,
        x.delta
      ]);
    })
  }

  Highcharts.chart("container", {
    "chart": {
      "type": "heatmap"
    },
    "title": {
      "text": ""
    },
    "subtitle": {
      "text": ""
    },
    "xAxis": {
      "min": 0,
      "max": json.distance * EARTH_RADIUS - (EARTH_RADIUS / json.crossSection.length - 1),
      "labels": {
        "format": "{value}"
      },
      "title": {
        "text": "Distance (km)"
      }
    },
    "yAxis": {
      "min": 0,
      "max": 3000,
      "tickInterval": 500,
      "plotLines": [{
        "label": {
          "text": 660,
          "style": {
            "color": "white",
            "fontWeight": "bold"
          }
        },
        "value": 660,
        "color": "white",
        "dashStyle": "shortdash",
        "width": 2,
        "zIndex": 4
      }, {
        "label": {
          "text": 410,
          "style": {
            "color": "white",
            "fontWeight": "bold"
          }
        },
        "value": 410,
        "color": "white",
        "dashStyle": "shortdash",
        "width": 2,
        "zIndex": 4
      }],
      "reversed": true,
      "title": {
        "text": "Depth (km)"
      }
    },
    "legend": {
      "layout": "vertical",
      "align": "right",
      "verticalAlign": "middle"
    },
    "colorAxis": {
      "min": document.getElementById("high-contrast").checked ? -0.5 : -1,
      "max": document.getElementById("high-contrast").checked ? 0.5 : 1,
      "labels": {
        "format": "{value}%"
      },
      "stops": [
          [0, "#c4463a"],
          [0.25, "orange"],
          [0.5, "#fffbbc"],
          [0.75, "aquamarine"],
          [1, '#3060cf']
      ]
    },
    "credits": {
      "text": "HADES Tomography Explorer (" + document.getElementById("model-type").value + ")"
    },
    "tooltip": {
      "formatter": function() {
        return [
          "<b>Distance:</b> " + this.point.x.toFixed(1) + "km",
          "<b>Depth:</b> " + this.point.y.toFixed(1) + "km",
          "<b>δv:</b> " + this.point.value.toFixed(1) + "%"
        ].join("<br>");
      }
    },
    "series": [{
      "name": document.getElementById("model-type").value + " Tomographic Model",
        "data": heatmapData,
        "borderWidth": 0.1,
        "nullColor": '#EFEFEF',
        "colsize": json.colSize * EARTH_RADIUS,
        "rowsize": json.rowSize,
        "turboThreshold": Number.MAX_VALUE
    }]
  
  });

}
