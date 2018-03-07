const SCALED_RADIUS = 300.0;

Number.prototype.Clamp = function(min, max) {
  return Math.max(Math.min(this, max), min);
}

Number.prototype.Degrees = function() {
  return (this * 180) / Math.PI;
}

Number.prototype.Radians = function() {
  return Math.PI * (this / 180);
}

var HadesArced = function(data) {
  
  this.rainbow = new Rainbow();
  this.rainbow.setSpectrum.apply(null, COLORBAR);

  // Create a new svg container
  this.angle = data.distance;
  this.svg = this.CreateSVGContainer();

  this.DrawData(data);
  this.drawSVG();

  // Draw the color bar
  this.CreateColorBar();

}

HadesArced.prototype.CreateSVGContainer = function() {

  var height = this.angle < 180 ? 350 : 700;

  return d3.select("#svg-container")
    .append("svg")
    .attr("width", 700)
    .attr("height", height)
    .append("g")
    .attr("transform", "translate(350, 350)");

}

HadesArced.prototype.getVelocityPercentage = function(delta) {

  if(document.getElementById("high-contrast").checked) {
    return 100 * (delta.Clamp(-0.5, 0.5) + 0.5);
  }

  return 50 * (delta.Clamp(-1, 1) + 1);

}

HadesArced.prototype.getVelocityColor = function(delta) {
  return this.getRGBAString(parseInt(this.rainbow.colourAt(this.getVelocityPercentage(delta)), 16));
}

HadesArced.prototype.getRGBAString = function(integer) { 
  return "rgba(" + ((integer >> 16) & 255) + "," + ((integer >> 8) & 255) + "," + (integer & 255) + "," + TRANSPARENCY + ")";
}

function exportSVG() {

  const FILENAME = "hades-explorer.svg";
  const HEADERS = {"type": "image/svg+xml;charset=utf-8"}
  const EXPORTING_FALLBACK = "https://orfeus-eu.org/scripts/exporting.php";

  // Get the SVG document      
  var svgData = document.getElementById("svg-container").innerHTML;

  // Create binary object
  var svgBlob = new Blob([svgData], HEADERS);

  // Create a temporary link and click
  var aLink = document.createElement("a");

  if(navigator.msSaveBlob) {
    navigator.msSaveBlob(svgBlob, HEADERS);
  } else if(URL && "download" in aLink) {
    aLink.href = URL.createObjectURL(svgBlob);
    aLink.download = FILENAME;
    document.body.appendChild(aLink);
    aLink.click();
    document.body.removeChild(aLink);
  } else {
    Highcharts.post(EXPORTING_FALLBACK, {
      "data": svgData,
      "type": HEADERS.type,
      "extension": FILENAME
    });
  }
 
}

// Create an SVG text element and append a textPath element
function fraction(distance) {
  return SCALED_RADIUS * (distance / EARTH_RADIUS);
}

HadesArced.prototype.createArc = function(inner, outer) {
  return d3.arc().innerRadius(inner).outerRadius(outer);
}

HadesArced.prototype.drawSVG = function(data) {

  const NUMBER_OF_TICKS = Math.round(24 * (this.angle / Math.PI));

  const TICK_LENGTH = 10;
  const halfAngle = 0.5 * this.angle;
  const degreeAngle = this.angle.Degrees();
  
  var ticks = new Array();
  for(var i = 0; i < NUMBER_OF_TICKS; i++) {
    ticks.push((i / (NUMBER_OF_TICKS - 1)) * degreeAngle);
  }
   
  // Create the tick positions
  var tickPositions = this.svg.append("g")
    .attr("class", "axis-labels")
    .selectAll("g")
    .data(ticks)
    .enter().append("g")
    .attr("transform", function(d) { return "rotate(" + (d - 90 - halfAngle.Degrees()) + ")"; });

  // Add tick marks
  tickPositions.append("line")
    .attr("x1", SCALED_RADIUS + TICK_LENGTH)
    .attr("x2", SCALED_RADIUS)
    .style("stroke", "darkslategrey")
    .style("stroke-width", 2);
  
  // Add text to ticks
  tickPositions.append("text")
    .attr("x", function(d) { return d.toFixed(1).length === 3 ? SCALED_RADIUS - 8 : SCALED_RADIUS - 12})
    .attr("dy", -16)
    .attr("font-family", "sans serif")
    .attr("font-weight", "bold")
    .attr("font-size", "10")
    .attr("transform", "rotate(90 " + SCALED_RADIUS + ", 0)")
    .text(parseDegree);
  
  function parseDegree(point) {
    return point.toFixed(1) + "°"
  }

  this.DrawOutlines();

}

HadesArced.prototype.DrawBoundary = function(depth) {

  var transitionZone = this.createArc(fraction(EARTH_RADIUS - depth), fraction(EARTH_RADIUS - depth));
  var transitionArc = transitionZone({
    "startAngle": -0.5 * this.angle,
    "endAngle": 0.5 * this.angle
  })

  this.svg.append("path")
    .attr("id", "arc" + depth)
    .attr("fill", "none")
    .attr("stroke-width", 1)
    .attr("stroke", "white")
    .attr("d", transitionArc);

  this.svg.append("text")
    .append("textPath")
    .attr("font-weight", "bold")
    .attr("font-size", "8")
    .attr("fill", "white")
    .attr("xlink:href", "#arc" + depth)
    .text(depth);

}

HadesArced.prototype.DrawOutlines = function() {

  this.DrawBoundary(410);
  this.DrawBoundary(660);
  
  // Create an inner and outer arc for the Earth
  var arc = this.createArc(
    fraction(EARTH_RADIUS),
    fraction(CORE_RADIUS)
  );

  var outlineArc = arc({
    "startAngle": -0.5 * this.angle,
    "endAngle": 0.5 * this.angle
  });

  this.svg.append("path")
    .attr("id", "arc")
    .attr("fill", "none")
    .attr("stroke-width", 2)
    .attr("stroke", "darkslategray")
    .attr("d", outlineArc);
  
}


HadesArced.prototype.DrawData = function(data) {

  for(var i = 0; i < data.crossSection.length; i++) {

    var f = data.colSize * i - 0.5 * this.angle;
    var column = data.crossSection[i];
        
    for(var j = 0; j < column.data.length; j++) {
                      
      var n = CORE_RADIUS - column.data[j].depth + MANTLE_RADIUS;
      var pos = new Position(n, f);   

      var arcPointFactory = this.createArc(pos.r - 0.5 * fraction(data.rowSize), (pos.r + 0.5 * fraction(data.rowSize)).Clamp(0, SCALED_RADIUS));

      // Make sure to offset
      var pointArc = arcPointFactory({
        "startAngle": pos.phi - (0.5 * data.colSize),
        "endAngle": Math.min(pos.phi + 0.5 * data.colSize, 0.5 * this.angle) 
      })

      this.DrawDataPoint(pointArc, column.data[j].delta);

    }

  }

}

HadesArced.prototype.CreateColorBar = function() {

  const COLORBAR_WIDTH = 110;
  const COLORBAR_HEIGHT = 12;
  const COLORBAR_OFFSET = -125;

  // Append linear gradient
  var linearGradient = this.svg.append("linearGradient")
    .attr("id", "linear-gradient");

  // The color scale
  var colorScale = d3.scaleLinear().range(COLORBAR)

  // Append multiple color stops by using D3's data/enter step
  linearGradient.selectAll("stop") 
    .data(colorScale.range()) 
    .enter().append("stop")
    .attr("offset", function(d, i) { return i / (colorScale.range().length - 1); })
    .attr("stop-color", function(d) { return d; });

  // Container for the color bar
  var rectangle = this.svg.append("rect")
    .attr("x", -0.5 * COLORBAR_WIDTH)
    .attr("y", COLORBAR_OFFSET)
    .attr("width", COLORBAR_WIDTH)
    .attr("height", COLORBAR_HEIGHT)
    .attr("fill", "url(#linear-gradient)")
    .style("stroke", "darkslategrey")
    .style("stroke-width", "2px");

  var value = document.getElementById("high-contrast").checked ? 0.5 : 1;

  this.svg.append("text")
    .attr("x", -0.4 * COLORBAR_WIDTH)
    .attr("y", COLORBAR_OFFSET + COLORBAR_HEIGHT + 14)
    .attr("font-family", "sans serif")
    .attr("font-weight", "bold")
    .attr("font-size", "10")
    .attr("text-anchor", "end").text("-" + value + "%")

  this.svg.append("text")
    .attr("x", 0.4 * COLORBAR_WIDTH)
    .attr("y", COLORBAR_OFFSET + COLORBAR_HEIGHT + 14)
    .attr("font-family", "sans serif")
    .attr("font-weight", "bold")
    .attr("font-size", "10")
    .attr("text-anchor", "start").text("+" + value + "%")

  this.svg.append("text")
    .attr("y", COLORBAR_OFFSET + COLORBAR_HEIGHT + 34)
    .attr("font-family", "sans serif")
    .attr("font-weight", "bold")
    .attr("font-size", "10")
    .attr("text-anchor", "middle").text("HADES Tomography Explorer (UUP07)")

}

HadesArced.prototype.DrawDataPoint = function(arc, delta) {

  this.svg.append("path")
    .attr("fill", this.getVelocityColor(delta))
    .attr("class", "Wow")
    .attr("d", arc);

}

var Position = function(R, phi) {

  this.R = R;
  this.phi = phi;
  this.r = fraction(R);

}
