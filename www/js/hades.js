var map,
    degreeCircle,
    polyLine;

const APPLICATION_VERSION = "Alpha 0.1.1";
const HADES_SERVER = "136.144.177.195:8080";
const TRANSPARENCY = 1.0;
const EARTH_RADIUS = 6371.0;
const CORE_RADIUS = 3556.0;
const MANTLE_RADIUS = (EARTH_RADIUS - CORE_RADIUS);
const COLORBAR = ["#C4463A", "#FFA500", "#FFFBBC", "#7FFFD4", "#3060CF"];

document.getElementById("application-version").innerHTML = APPLICATION_VERSION;

function initMap() {

 plateLayer = new google.maps.KmlLayer({
    url: "http://www.orfeus-eu.org/extra/tectonic_plates.kml",
    suppressInfoWindows: true,
    preserveViewport: true,
  });

  function toggleOverlay(bool) {
    bool ? plateLayer.setMap(map) : plateLayer.setMap(null);
  }

  $("#show-satellite").change(function () {
    if($("#show-satellite").is(":checked")) {
      map.setMapTypeId("satellite");
    } else {
      map.setMapTypeId("terrain");
    }
  });

  $("#show-plate-boundaries").change(function () {
    toggleOverlay($("#show-plate-boundaries").is(':checked'));
  });

  // Create a map object and specify the DOM element for display.
  map = new google.maps.Map(document.getElementById("map"), {
    "center": {"lat": 0, "lng": -70},
    "zoom": 3,
    "disableDefaultUI": true
  });

  firstMarker = new google.maps.Marker({
    "map": map,
    "label": {
      "text": "L",
      "fontSize": "12px",
      "fontWeight": "bold",
      "fontFamily": "helvetica",
      "color": "white"
    },
    "draggable": true
  });

  secondMarker = new google.maps.Marker({
    "map": map,
    "label": {
      "text": "R",
      "fontSize": "12px",
      "fontWeight": "bold",
      "fontFamily": "helvetica",
      "color": "white"
    },
    "draggable": true
  });

  degreeCircle = new google.maps.Circle({
    "map": map,
    "radius": (40).Radians() * 6371000,
    "strokeColor": "grey",
    "fillColor": "transparent",
    "strokeWeight": 0.25,
  });

  degreeCircle.bindTo("center", firstMarker, "position");

  google.maps.event.addListener(firstMarker, "dragend", function() {
    GetCrossSection();
  });

  google.maps.event.addListener(secondMarker, "dragend", function() { 
    GetCrossSection();
  }); 

  // When the preset select menu is changed
  document.getElementById("select-preset").addEventListener("change", selectEvent);
  document.getElementById("lock-degrees").addEventListener("change", GetCrossSection);

  function selectEvent() {
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

  // Function to set markers to location
  function setPreset(first, second) {
  
    firstMarker.setPosition(first);
    secondMarker.setPosition(second);
  
    zoomCamera(first, second);
    GetCrossSection();
  
  }

  // Trigger the first automatic select
  selectEvent();

}

// function getPositionAtDistanceAndBearing
// returns the position from another position at bearing & distance
// https://www.movable-type.co.uk/scripts/latlong.html#destPoint
function getPositionAtDistanceAndBearing(first, bearing, degrees) {

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

// function getLockedMarkerPosition
// Returns the current bearing between two points
// https://www.movable-type.co.uk/scripts/latlong.html#bearing
function getLockedMarkerPosition(first, second) {

  const DISTANCE_DEGREES = 40;

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

  var bounds = new google.maps.LatLngBounds();

  bounds.extend(first);
  bounds.extend(second);

  // Fit the bounds and draw the cross section
  map.fitBounds(bounds);

}

function GetCrossSection() {

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
    "path": [
      firstMarker.position,
      secondMarker.position
    ],
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

  var queryString = "?" + [
    "phi1=" + firstMarker.position.toJSON().lat,
    "lam1=" + firstMarker.position.toJSON().lng,
    "phi2=" + secondMarker.position.toJSON().lat,
    "lam2=" + secondMarker.position.toJSON().lng
  ].join("&");

  document.getElementById("location-information").innerHTML = FormatLocationString(firstMarker.position.toJSON(), secondMarker.position.toJSON());
  document.getElementById("progress-bar").style.visibility = "visible";

  $.ajax({
    "url": "http://" + HADES_SERVER + "/" + queryString,
    "dataType": "json",
    "type": "GET",
    "success": function(json) {
      DrawCrossSection(json);
    },
    "error": function(json) {
      DrawCrossSection(null);
    }
  });

}

function FormatLocationString(first, second) {
  return "<b>Geodesic Section</b><br>" + first.lat.toFixed(2) + "°N " + first.lng.toFixed(2) + "°E <b>to</b> " + second.lat.toFixed(2) + "°N " + second.lng.toFixed(2) + "°E";
}

function DrawCrossSection(json) {

  // Hades is offline
  if(json === null) {
    return alert("Hades could not serve the request.");
  }

  // Create radial chart
  document.getElementById("svg-container").innerHTML = "";
  new HadesArced(json);

  document.getElementById("progress-bar").style.visibility = "hidden";

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
      "text": "HADES Tomography Explorer (UUP07)"
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
      "name": "UUP07 Tomographic Model",
        "data": heatmapData,
        "borderWidth": 0.1,
        "nullColor": '#EFEFEF',
        "colsize": json.colSize * EARTH_RADIUS,
        "rowsize": json.rowSize,
        "turboThreshold": Number.MAX_VALUE
    }]
  
  });

}
