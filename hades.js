/*
 * file: hades.js
 *
 * Server-side code for Heteregenous Anomalies in Deep Earth Structures
 * Tomography profile server
 *
 * Author: Mathijs Koymnas, 2019
 * Licensed under MIT.
 * All Rights Reserved.
 *
 */

const fs = require("fs");
const { join } = require("path");
const { createServer } = require("http");
const { parse } = require("url");

// Load the configuration
const CONFIG = require("./config");

const HadesServer = function(callback) {
 
  /*
   * Class HadesServer
   * Wrapper for a hades server
   */

  this.logger = fs.createWriteStream(CONFIG.LOGFILE, {"flags": "a"});

  // Save all models
  this.models = new Object();

  // Read the models
  fs.readdirSync(CONFIG.DATABASE_DIRECTORY).forEach(this.readModel, this);

  // Create the webserver handler
  this.webserver = createServer(this.requestHandler.bind(this));

  // Listen for incoming connections
  this.webserver.listen(CONFIG.PORT, CONFIG.HOST, callback);

}

HadesServer.prototype.HTTPError = function(response, error) {

  /*
   * Function HadesServer::HTTPError
   * Returns HTTP error with error message
   */

  response.statusCode = 400;
  response.setHeader("Content-Type", "text/plain");
  response.end(error);

}

HadesServer.prototype.requestHandler = function(request, response) {

  /*
   * Function HadesServer::requestHandler
   * Handles incoming HTTP requests
   */

  const url = parse(request.url, true);

  // Default resolution is low
  const resolution = url.query.resolution;
  const depth = url.query.depth;

  // Requested resolution is not supported
  if(resolution !== "low" && resolution !== "high" && resolution !== "ultra") {
    return this.HTTPError(response, "The requested resolution is not supported.");
  }

  if(depth !== "full" && depth !== "mantle") {
    return this.HTTPError(response, "The requested depth is not supported.");
  }

  // Location of the markers are missing
  if(url.query.phi1 === undefined || url.query.phi2 === undefined || url.query.lam1 === undefined || url.query.lam2 === undefined) {
    return this.HTTPError(response, "Could not determine the requested cross section endpoints.");
  }

  // The requested model is not available
  if(!this.models.hasOwnProperty(url.query.model)) {
    return this.HTTPError(response, "The requested model is not supported.");
  }

  const start = Date.now()

  this.logger.write(JSON.stringify({
    "message": "HTTP Request",
    "client": request.connection.remoteAddress,
    "time": Date.now() - start,
    "url": url.query,
    "model": url.query.model,
    "version": CONFIG.VERSION,
    "timestamp": new Date().toISOString()
  }) + "\n");

  // Create the cross section payload
  var payload = JSON.stringify(this.getCrossSection(
    {"lat": Number(url.query.phi1), "lng": Number(url.query.lam1)},
    {"lat": Number(url.query.phi2), "lng": Number(url.query.lam2)},
    url.query.model,
    resolution,
    depth
  ));


  // HTTP OK
  response.statusCode = 200;

  // Allow CORS headers
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "X-Requested-With");

  // Set proper content-type
  response.setHeader("Content-Type", "application/json");

  response.end(payload);
 
}

HadesServer.prototype.readModel = function(filename) {

  /*
   * Function HadesServer::readModel
   * Reads a particular model from disk and saves to available model object
   */

  function readModeFile(filename) {

    /*
     * Function HadesServer::readModel::readModelFile
     * Reads and parses a single tomographic JSON model file
     */

    return JSON.parse(fs.readFileSync(join(CONFIG.DATABASE_DIRECTORY, filename)).toString());

  }

  // Skip anything that does not end with the .db extension
  if(!filename.endsWith(".db")) {
    return;
  }

  console.log("Reading tomographic model " + filename + " to memory.");

  // Save particular model without the '.db' extension
  this.models[filename.slice(0, -3)] = readModeFile(filename);

}

HadesServer.prototype.binarySearchUpper = function(haystack, needle) {

  /*
   * Function Hades::binarySearchUpper
   * Complete a binary search in a sorted array and return the closest index
   */

  var minIndex = 0;
  var maxIndex = haystack.length - 1;
  var currentIndex, value;

  while(minIndex <= maxIndex) {

    // Truncate to integer
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

HadesServer.prototype.getCrossSection = function(first, second, model, resolution, depth) {

  /* 
   * Function Hades::getCrossSection
   * Returns the cross section
   */

  var NUMBER_OF_DEPTHS,
      NUMBER_OF_POINTS;
 
  const arcDistance = this.haversine(first, second);

  // Determine number of points based on the resolution
  switch(resolution) {
    case "low":
      NUMBER_OF_DEPTHS = 40;
      NUMBER_OF_POINTS = Math.ceil(arcDistance.toDegrees());
      break;
    case "high":
      NUMBER_OF_DEPTHS = 80;
      NUMBER_OF_POINTS = Math.ceil(2 * arcDistance.toDegrees());
      break;
    case "ultra":
      NUMBER_OF_DEPTHS = 160;
      NUMBER_OF_POINTS = Math.ceil(4 * arcDistance.toDegrees());
      break;
  }

  // Get the model
  var model = this.getModel(model);

  // Determine the start and end depth of the model
  var startDepth = model.depths[0];

  // Determine the end depth based on a query parameter
  if(depth === "full") {
    var endDepth = model.depths[model.depths.length - 1];
  } else if(depth === "mantle") {
    var endDepth = 660;
  }

  // Go over N sampled depths
  var depths = new Array();
  for(var i = 0; i < NUMBER_OF_DEPTHS; i++) {
    depths.push(startDepth + (i / (NUMBER_OF_DEPTHS - 1)) * (endDepth - startDepth));
  }

  // Sample points along a profile
  var crossSection = new Array();
  for(var i = 0; i < NUMBER_OF_POINTS; i++) {
    crossSection.push(this.getProfile(model, this.fractionalHaversine(first, second, i / (NUMBER_OF_POINTS - 1)), depths));
  }

  var maximumDepth = depths[depths.length - 1] - depths[0];

  return {
    "distance": arcDistance,
    "crossSection": crossSection,
    "depths": depths,
    "rowSize": maximumDepth / (NUMBER_OF_DEPTHS - 1),
    "colSize": arcDistance / (NUMBER_OF_POINTS - 1)
  }

}

HadesServer.prototype.haversine = function(first, second) {

  /*
   * Function HadesServer::haversine
   * Returns the great circle distance in degrees between two points
   */

  var phi1 = first.lat.toRadians();
  var phi2 = second.lat.toRadians();

  var delPhi = (second.lat - first.lat).toRadians();
  var delLam = (second.lng - first.lng).toRadians();

  var a = Math.pow(Math.sin(0.5 * delPhi), 2) + Math.cos(phi1) * Math.cos(phi2) * Math.pow(Math.sin(0.5 * delLam), 2);

  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

}

HadesServer.prototype.fractionalHaversine = function(first, second, fraction) {

  /*
   * Function HadesServer::fractionalHaversine
   * Returns position of fractional distance on a great circle between two points
   */

  var delta = this.haversine(first, second);

  var a = Math.sin((1 - fraction) * delta) / Math.sin(delta);
  var b = Math.sin(fraction * delta) / Math.sin(delta);

  var x = a * Math.cos(first.lat.toRadians()) * Math.cos(first.lng.toRadians()) + b * Math.cos(second.lat.toRadians()) * Math.cos(second.lng.toRadians());
  var y = a * Math.cos(first.lat.toRadians()) * Math.sin(first.lng.toRadians()) + b * Math.cos(second.lat.toRadians()) * Math.sin(second.lng.toRadians());
  var z = a * Math.sin(first.lat.toRadians()) + b * Math.sin(second.lat.toRadians());

  return {
    "lat": Math.atan2(z, Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2))).toDegrees(),
    "lng": Math.atan2(y, x).toDegrees()
  }

}

HadesServer.prototype.getProfile = function(model, position, depths) {

  /*
   * Function Hades::getProfile
   * Returns the tomographical depth profile for a position on the surface
   */

  const PRECISION = 2;

  // Get the surface index of the position
  var surfaceIndex = this.getSurfaceIndex(position, model);

  // Calculate the profile
  var profile = depths.map(function(depth) {
    return parseFloat(this.interpolate(surfaceIndex, depth, position, model).toPrecision(PRECISION));
  }, this);

  return {
    "position": position,
    "data": profile
  }

}

HadesServer.prototype.interpolate = function(surfaceIndex, depth, position, model) {

  /*
   * Function HadesServer::interpolate
   * Interpolates value between eight grid points
   */

  function fraction(min, max, value) {
  
    /*
     * Function HadesServer::interpolate::fraction
     * Returns the fraction of a value between min and max
     */

    return (value - min) / (max - min);
  
  }

  function bilinear(nodes, position) {
  
    /*
     * Function HadesServer::interpolate::bilinear
     * Does a bilinear interpolation
     */

    // Simplication by using unit square [0, 1] see:
    // https://en.wikipedia.org/wiki/Bilinear_interpolation#Unit_square
    var x = fraction(nodes[1].lng, nodes[0].lng, position.lng);
    var y = fraction(nodes[2].lat, nodes[0].lat, position.lat);
  
    return (nodes[3].delta * (1 - x) * (1 - y)) + (nodes[1].delta * (1 - x) * y) + (nodes[2].delta * (1 - y) * x) + (nodes[0].delta * x * y);
  
  }

  function linear(x1, x2, f) {

    /*
     * Function HadesServer::interpolate::linear
     * Does a linear interpolation
     */

    return x1 + f * (x2 - x1);

  }

  // Determine the depth belonging to a given depth
  var depthIndex = this.getDepthIndex(depth, model);

  // Get the top and bottom nodes above this depth
  var topNodes = this.getNearestNodes(surfaceIndex, depthIndex - 1, model);
  var bottomNodes = this.getNearestNodes(surfaceIndex, depthIndex, model);

  // Do a simple bilinear interpolation on a 2D plane
  // Note: the interpolation should not be done linearly but 
  // the errors are sufficiently small and can be ignored
  var topInterpolation = bilinear(bottomNodes, position);
  var bottomInterpolation = bilinear(topNodes, position);

  // Do a linear interpolation between the two bilinear interpolations
  return linear(bottomInterpolation, topInterpolation, fraction(topNodes[0].depth, bottomNodes[0].depth, depth));

}

HadesServer.prototype.getNearestNodes = function(index, depth, model) {

  /*
   * Function HadesServer::getNearestNodes 
   * Returns the four nearest nodes to a given point
   */

  // Index of the previous node (CONSIDER WRAP AROUND!)
  var iMin = (index.i === 0 ? model.longitudes.length : index.i) - 1;
  var jMin = (index.j === 0 ? model.latitudes.length : index.j) - 1;

  return [
    this.getModelValue(index.i, index.j, depth, model),
    this.getModelValue(iMin, index.j, depth, model),
    this.getModelValue(index.i, jMin, depth, model),
    this.getModelValue(iMin, jMin, depth, model)
  ];

}

HadesServer.prototype.getDeltaIndex = function(i, j, k, model) {

  /*
   * HadesServer.getDeltaIndex
   * Returns delta (velocity) index from the requested model
   */

  return i + (j * model.longitudes.length) + (k * model.longitudes.length * model.latitudes.length);

}

HadesServer.prototype.getModelValue = function(i, j, k, model) {

  /*
   * HadesServer.getModelValue
   * Returns an object from the model containing lat, lng, depth, and delta
   */

  // Get the index from the 1D array
  var deltaIndex = this.getDeltaIndex(i, j, k, model);

  return {
    "lng": model.longitudes[i],
    "lat": model.latitudes[j],
    "depth": model.depths[k],
    "delta": model.delta[deltaIndex]
  }

}

HadesServer.prototype.getModel = function(model) {

  /*
   * Function HadesServer::getModel
   * Returns model with a particular name
   */

  return this.models[model];

}

HadesServer.prototype.getDepthIndex = function(depth, model) {

  /*
   * Function HadesServer::getDepthIndex
   * Returns the index of a given depth
   */

  return this.binarySearchUpper(model.depths, depth) || (model.depths.length - 1);

}

HadesServer.prototype.getSurfaceIndex = function(position, model) {

  /*
   * Function HadesServer::getSurfaceIndex
   * Returns the indices of the surface nodes of the cross section 
   */

  // Get model indices through binary search
  var i = this.binarySearchUpper(model.longitudes, position.lng);
  var j = this.binarySearchUpper(model.latitudes, position.lat);

  return {
    "i": (i % model.longitudes.length),
    "j": (j % model.latitudes.length)
  }

}

Number.prototype.toDegrees = function() {
  return (this * 180) / Math.PI;
}

Number.prototype.toRadians = function() {
  return (this * Math.PI) / 180;
}

// Initialize a server
new HadesServer(function() {

  // Show memory usage
  var heapUsed = Math.round(process.memoryUsage().heapUsed / (Math.pow(1024, 2)));

  console.log("Hades is listening. Memory usage: " + heapUsed + " MB.");

});
