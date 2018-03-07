const Filesystem = require("fs");
const Http = require("http");
const Url = require("url");

const CONFIG = require("./config");

// Number of 3D grid points used for indexing
const EARTH_RADIUS = 6371;
const MAXIMUM_DEPTH = 2815.50;
const NUMBER_OF_POINTS = 60 * 2;
const NUMBER_OF_DEPTHS = 60;

const Logger = Filesystem.createWriteStream(CONFIG.LOGFILE, {"flags": "a"});

var Hades = function(db, callback) {
 
  // Save evocation context
  var self = this;

  Filesystem.readFile(db, function(error, data) {

    // Fatal error reading the database
    if(error) {
      throw("Could not read database file " + db +  " from disk.");
    }

    self.MODEL = JSON.parse(data.toString());

    callback();

  });

}

/* FUNC Hades.BinarySearchUpper
 *
 * Complete a binary search in a sorted array and return
 * the closest index (ROUNDED UP)
 *
 */
Hades.prototype.BinarySearchUpper = function(haystack, needle) {

  var minIndex = 0;
  var maxIndex = haystack.length - 1;
  var currentIndex, value;

  while(minIndex <= maxIndex) {

    currentIndex = 0.5 * (minIndex + maxIndex) | 0;
    value = haystack[currentIndex];

    if(needle <= value) {
      maxIndex = currentIndex - 1;
    } else if(needle > value) {
      minIndex = currentIndex + 1;
    }

  }

  return Math.max(maxIndex, minIndex);

}

/* FUNC GetCrossSection
 *
 * Returns the cross section
 *
 */
Hades.prototype.GetCrossSection = function(first, second) {

  var crossSection = new Array();

  for(var i = 0; i < NUMBER_OF_POINTS; i++) {
    crossSection.push(this.GetProfile(this.FractionalHaversine(first, second, i / (NUMBER_OF_POINTS - 1))));
  }

  const arcDistance = this.Haversine(first, second);

  return {
    "distance": arcDistance,
    "crossSection": crossSection,
    "rowSize": MAXIMUM_DEPTH / (NUMBER_OF_DEPTHS - 1),
    "colSize": arcDistance / (NUMBER_OF_POINTS - 1)
  }

}

Number.prototype.Degrees = function() {
  return (this * 180) / Math.PI;
}

Number.prototype.Radians = function() {
  return (this * Math.PI) / 180;
}

/* FUNC Hades.Haversine
 *
 * Returns the great circle distance in degrees between two points
 *
 */
Hades.prototype.Haversine = function(first, second) {

  var phi1 = first.lat.Radians();
  var phi2 = second.lat.Radians();

  var delPhi = (second.lat - first.lat).Radians();
  var delLam = (second.lng - first.lng).Radians();

  var a = Math.pow(Math.sin(0.5 * delPhi), 2) + Math.cos(phi1) * Math.cos(phi2) * Math.pow(Math.sin(0.5 * delLam), 2);

  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

}

/* FUNC Hades.FractionalHaversine
 *
 * Returns position of fractional distance on a great circle between two points
 *
 */
Hades.prototype.FractionalHaversine = function(first, second, fraction) {

  var delta = this.Haversine(first, second);

  var a = Math.sin((1 - fraction) * delta) / Math.sin(delta);
  var b = Math.sin(fraction * delta) / Math.sin(delta);

  var x = a * Math.cos(first.lat.Radians()) * Math.cos(first.lng.Radians()) + b * Math.cos(second.lat.Radians()) * Math.cos(second.lng.Radians());
  var y = a * Math.cos(first.lat.Radians()) * Math.sin(first.lng.Radians()) + b * Math.cos(second.lat.Radians()) * Math.sin(second.lng.Radians());
  var z = a * Math.sin(first.lat.Radians()) + b * Math.sin(second.lat.Radians());

  return {
    "lat": Math.atan2(z, Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2))).Degrees(),
    "lng": Math.atan2(y, x).Degrees()
  }

}

/* Hades.prototype.CreateModel
 * Creates the data model from a data buffer
 */
Hades.prototype.CreateModel = function(data) {

  return JSON.parse(data.toString())

}

/* Hades.prototype.CalculateProfile
 *
 * Returns the tomographical depth profile
 * for a position on the surface
 *
 */
Hades.prototype.GetProfile = function(position) {

  const START = 5;
  const DEPTH = (MAXIMUM_DEPTH - START);

  // Set up an empty profile
  var profile = new Array();

  // Get the surface index
  var surfaceIndex = this.GetSurfaceIndex(position);

  // Go over all the depths
  for(var i = 0; i < NUMBER_OF_DEPTHS; i++) {

    // Depth we are interpolating in
    var iDepth = START + (i / (NUMBER_OF_DEPTHS - 1)) * DEPTH;

    // Add each depth to the profile
    profile.push({
      "depth": iDepth,
      "delta": this.Interpolate(surfaceIndex, iDepth, position)
    });

  }

  return {
    "position": position,
    "data": profile
  }

}

function linear(x1, x2, f) {
  return x1 + f * (x2 - x1);
}

Hades.prototype.Interpolate = function(surfaceIndex, depth, position) {

  // Determine the depth belonging to a given depth
  var depthIndex = this.GetDepthIndex(depth);

  // Get the top and bottom nodes above this depth
  var topNodes = this.GetNearestNodes(surfaceIndex, depthIndex - 1);
  var bottomNodes = this.GetNearestNodes(surfaceIndex, depthIndex);

  // Do a simple bilinear interpolation on a 2D plane
  // Note: the interpolation should not be done linearly but 
  // the errors are sufficiently small and can be ignored
  var topInterpolation = bilinear(bottomNodes, position);
  var bottomInterpolation = bilinear(topNodes, position);

  // Do a linear interpolation between the two bilinear interpolations
  return linear(bottomInterpolation, topInterpolation, fraction(topNodes[0].depth, bottomNodes[0].depth, depth));

}

Hades.prototype.GetNearestNodes = function(index, depth) {

  // Index of the previous node (CONSIDER WRAP AROUND!)
  var iMin = (index.i === 0 ? this.MODEL.longitudes.length : index.i) - 1;
  var jMin = (index.j === 0 ? this.MODEL.latitudes.length : index.j) - 1;

  return [
    this.GetModel(index.i, index.j, depth),
    this.GetModel(iMin, index.j, depth),
    this.GetModel(index.i, jMin, depth),
    this.GetModel(iMin, jMin, depth)
  ];

}

function fraction(min, max, value) {

  return (value - min) / (max - min);

}

function bilinear(nodes, position) {

  // Simplication by using unit square [0, 1] see:
  // https://en.wikipedia.org/wiki/Bilinear_interpolation#Unit_square
  var x = fraction(nodes[1].lng, nodes[0].lng, position.lng);
  var y = fraction(nodes[2].lat, nodes[0].lat, position.lat);

  return (nodes[3].delta * (1 - x) * (1 - y)) + (nodes[1].delta * (1 - x) * y) + (nodes[2].delta * (1 - y) * x) + (nodes[0].delta * x * y);

}

/* Hades.prototype.GetDeltaIndex
 * Returns the index of delta value at a given node
 */
Hades.prototype.GetDeltaIndex = function(i, j, k) {
  return i + (j * this.MODEL.longitudes.length) + (k * this.MODEL.longitudes.length * this.MODEL.latitudes.length);
}

Hades.prototype.GetModel = function(i, j, k) {

  var deltaIndex = this.GetDeltaIndex(i, j, k);

  return {
    "lng": this.MODEL.longitudes[i],
    "lat": this.MODEL.latitudes[j],
    "depth": this.MODEL.depths[k],
    "delta": this.MODEL.delta[deltaIndex]
  }

}

Hades.prototype.GetDepthIndex = function(depth) {

  return this.BinarySearchUpper(this.MODEL.depths, depth) || (this.MODEL.depths.length - 1);

}

/*
 * FUNC Hades.GetSurfaceIndex
 *
 * Returns the indices of the surface nodes of
 * the cross section 
 *
 */
Hades.prototype.GetSurfaceIndex = function(position) {

  // Get indices through binary search
  var i = this.BinarySearchUpper(this.MODEL.longitudes, position.lng);
  var j = this.BinarySearchUpper(this.MODEL.latitudes, position.lat);

  return {
    "i": (i % this.MODEL.longitudes.length),
    "j": (j % this.MODEL.latitudes.length)
  }

}

const hades = new Hades(CONFIG.DATABASE_FILE, function() {

  const webserver = Http.createServer(function(req, res) {
  	
    var url = Url.parse(req.url, true);

    if(url.query.phi1 === undefined || url.query.phi2 === undefined || url.query.lam1 === undefined || url.query.lam2 === undefined) {
      res.writeHead(400);
      return res.end();
    }

    var start = Date.now()
  
    Logger.write(JSON.stringify({
      "message": "HTTP Request",
      "client": req.connection.remoteAddress,
      "time": Date.now() - start,
      "url": url.query,
      "model": "UUP07",
      "version": CONFIG.VERSION,
      "timestamp": new Date().toISOString()
    }) + "\n");
    
    var response = JSON.stringify(hades.GetCrossSection(
      {"lat": Number(url.query.phi1), "lng": Number(url.query.lam1)},
      {"lat": Number(url.query.phi2), "lng": Number(url.query.lam2)}
    ));

  
    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "X-Requested-With");

    res.end(response);
  
  });

  webserver.listen(CONFIG.PORT, CONFIG.HOST, function() {
    console.log("Hades is listening.");
  });

});
