const Filesystem = require("fs");
const path = require("path");
const Http = require("http");
const Url = require("url");

const CONFIG = require("./config");

// Number of 3D grid points used for indexing
const EARTH_RADIUS = 6371;
const MAXIMUM_DEPTH = 2815.50;

const Logger = Filesystem.createWriteStream(CONFIG.LOGFILE, {"flags": "a"});

var Hades = function(callback) {
 
  // Save evocation context
  var self = this;

  self.MODEL = new Object();

  Filesystem.readdirSync(CONFIG.DATABASE_DIRECTORY).forEach(function(db) {

    console.log("Reading model " + db);

    data = Filesystem.readFileSync(path.join(CONFIG.DATABASE_DIRECTORY, db));

    var data = JSON.parse(data.toString());
    self.MODEL[data.model] = data;

  });

  callback();

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
Hades.prototype.GetCrossSection = function(first, second, model, resolution) {

  var NUMBER_OF_DEPTHS,
      NUMBER_OF_POINTS;
 
  switch(resolution) {
    case "low":
      NUMBER_OF_DEPTHS = 60; break;
    case "high":
      NUMBER_OF_DEPTHS = 120; break;
    default:
      NUMBER_OF_DEPTHS = 60;
     
  }

  NUMBER_OF_POINTS = 2 * NUMBER_OF_DEPTHS;

  var crossSection = new Array();

  for(var i = 0; i < NUMBER_OF_POINTS; i++) {
    crossSection.push(this.GetProfile(this.FractionalHaversine(first, second, i / (NUMBER_OF_POINTS - 1)), model, NUMBER_OF_DEPTHS));
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
Hades.prototype.GetProfile = function(position, model, NUMBER_OF_DEPTHS) {

  const START = 5;
  const DEPTH = (MAXIMUM_DEPTH - START);

  // Set up an empty profile
  var profile = new Array();
  var model = this.GetModel(model);

  // Get the surface index
  var surfaceIndex = this.GetSurfaceIndex(position, model);

  // Go over all the depths
  for(var i = 0; i < NUMBER_OF_DEPTHS; i++) {

    // Depth we are interpolating in
    var iDepth = START + (i / (NUMBER_OF_DEPTHS - 1)) * DEPTH;

    // Add each depth to the profile
    profile.push({
      "depth": iDepth,
      "delta": this.Interpolate(surfaceIndex, iDepth, position, model)
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

Hades.prototype.Interpolate = function(surfaceIndex, depth, position, model) {

  // Determine the depth belonging to a given depth
  var depthIndex = this.GetDepthIndex(depth, model);

  // Get the top and bottom nodes above this depth
  var topNodes = this.GetNearestNodes(surfaceIndex, depthIndex - 1, model);
  var bottomNodes = this.GetNearestNodes(surfaceIndex, depthIndex, model);

  // Do a simple bilinear interpolation on a 2D plane
  // Note: the interpolation should not be done linearly but 
  // the errors are sufficiently small and can be ignored
  var topInterpolation = bilinear(bottomNodes, position);
  var bottomInterpolation = bilinear(topNodes, position);

  // Do a linear interpolation between the two bilinear interpolations
  return linear(bottomInterpolation, topInterpolation, fraction(topNodes[0].depth, bottomNodes[0].depth, depth));

}

Hades.prototype.GetNearestNodes = function(index, depth, model) {

  // Index of the previous node (CONSIDER WRAP AROUND!)
  var iMin = (index.i === 0 ? model.longitudes.length : index.i) - 1;
  var jMin = (index.j === 0 ? model.latitudes.length : index.j) - 1;

  return [
    this.GetModelValue(index.i, index.j, depth, model),
    this.GetModelValue(iMin, index.j, depth, model),
    this.GetModelValue(index.i, jMin, depth, model),
    this.GetModelValue(iMin, jMin, depth, model)
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
Hades.prototype.GetDeltaIndex = function(i, j, k, model) {
  return i + (j * model.longitudes.length) + (k * model.longitudes.length * model.latitudes.length);
}

Hades.prototype.GetModelValue = function(i, j, k, model) {

  var deltaIndex = this.GetDeltaIndex(i, j, k, model);

  return {
    "lng": model.longitudes[i],
    "lat": model.latitudes[j],
    "depth": model.depths[k],
    "delta": model.delta[deltaIndex]
  }

}

Hades.prototype.GetModel = function(model) {

  return this.MODEL[model];

}

Hades.prototype.GetDepthIndex = function(depth, model) {

  return this.BinarySearchUpper(model.depths, depth) || (model.depths.length - 1);

}

/*
 * FUNC Hades.GetSurfaceIndex
 *
 * Returns the indices of the surface nodes of
 * the cross section 
 *
 */
Hades.prototype.GetSurfaceIndex = function(position, model) {

  // Get indices through binary search
  var i = this.BinarySearchUpper(model.longitudes, position.lng);
  var j = this.BinarySearchUpper(model.latitudes, position.lat);

  return {
    "i": (i % model.longitudes.length),
    "j": (j % model.latitudes.length)
  }

}

const hades = new Hades(function() {

  const webserver = Http.createServer(function(req, res) {
  	
    var url = Url.parse(req.url, true);

    const allowedModels = [
      "UUP07",
      "SP12RTS-S",
      "SP12RTS-P"
    ];

    var resolution = url.query.resolution || "low";

    if(["low", "high"].indexOf(resolution) === -1) {
      res.writeHead(400);
      return res.end();
    }

    if(url.query.phi1 === undefined || url.query.phi2 === undefined || url.query.lam1 === undefined || url.query.lam2 === undefined) {
      res.writeHead(400);
      return res.end();
    }

    if(allowedModels.indexOf(url.query.model) === -1) {
      res.writeHead(400);
      return res.end();
    }

    var start = Date.now()
  
    Logger.write(JSON.stringify({
      "message": "HTTP Request",
      "client": req.connection.remoteAddress,
      "time": Date.now() - start,
      "url": url.query,
      "model": url.query.model,
      "version": CONFIG.VERSION,
      "timestamp": new Date().toISOString()
    }) + "\n");
    
    var response = JSON.stringify(hades.GetCrossSection(
      {"lat": Number(url.query.phi1), "lng": Number(url.query.lam1)},
      {"lat": Number(url.query.phi2), "lng": Number(url.query.lam2)},
      url.query.model,
      resolution
    ));

  
    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "X-Requested-With");

    res.end(response);
  
  });

  webserver.listen(CONFIG.PORT, CONFIG.HOST, function() {
    var heapUsed = Math.round(process.memoryUsage().heapUsed / (Math.pow(1024, 2)));
    console.log("Hades is listening. Memory usage: " + heapUsed + " MB.");
  });

});
