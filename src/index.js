import * as p5 from './libraries/p5.js';
import {
  Delaunay
} from 'd3-delaunay';
import {
  polygon
} from 'polygon-tools';
import {
  findPoints
} from './pointfinder.js';
import {
  makeImageLinear,
  sRGBtoLinear,
  linearTosRGB
} from './linlogimageconvert.js';
import {
  intersect
} from './lineIntersect.js';
import {
  polygonArea,
  polygonContains
} from 'd3-polygon';
import {
  naturalNeighborInterpolate
} from './naturalNeighborInterpolate.js';


p5.disableFriendlyErrors = true;

const containerElement = document.getElementById('p5-container');

const sketch = (p) => {

  let colPoints = []; //Stores point positions alongside corresponding colors, plus whether points are key [x,y,[r,g,b], k] 
  let linearImage = []; //stores linear image, as the p5.js image object only stores 8 bit color
  let points = []; //points array is the point positions only [x,y], extracted for feeding into d3-delaunay, but with indexes matching colPoints
  let bounds = [];
  let dt; //density, detected in setup
  let aDelaunay;
  let aVoronoi;
  let sourceImage;
  let renderedNNImage;

  let vorDebug = false;
  let drawDelaunayState = false;
  let drawVoronoiState = false;
  let fillVoronoiState = false;
  let drawTestInsertState = false;
  let renderingNNState = false;
  let editModeState = false;

  let renderNNCounter = 0;

  let timeToRenderNN = 0;

  const renderNNSteps = 20;
  let zoomFactorOnLoad = 1;
  const decimalPlaces = 11; //rounding to prevent errors
  let offGridJitter = 1.0; //used to keep points off the pixel grid
  const radiusEdgeRatioLimit = Math.sqrt(2);

  p.preload = function () {
    sourceImage = p.loadImage('assets/r.jpg');
  }

  p.setup = function () {
    console.log(`setup version: E for edit, returned voronoi areas`)
    p.createCanvas(800, 800);
    dt = p.pixelDensity();
    bounds = [p.width * -10, p.height * -10, p.width * 11, p.height * 11];
    //bounds = [p.width, p.height, p.width, p.height];
    renderedNNImage = p.createImage(p.width, p.height);
    p.background(0);
    p.fill(128);
    p.rect(50, 50, 50, 50);
  }

  p.draw = function () {

    p.background(0);

    if (editModeState) {

      p.image(sourceImage, 0, 0);

    } else {

      p.image(renderedNNImage, 0, 0);
      drawVoronoi();
      if (drawDelaunayState) drawDelaunay();
      if (drawTestInsertState) testInsert(p.mouseX, p.mouseY);
      if (renderingNNState) createNNInterpolation(1);

    }

  }

  p.mouseClicked = function () {

    if (editModeState) pickPointFromImage(p.mouseX, p.mouseY);

  }

  p.keyTyped = function () {
    if (p.key === 'v') {
      if (fillVoronoiState) drawVoronoiState = !drawVoronoiState;
      fillVoronoiState = !fillVoronoiState;
    } else if (p.key === 'd') {
      drawDelaunayState = !drawDelaunayState;
    } else if (p.key === 'i') {
      drawTestInsertState = !drawTestInsertState;
    } else if (p.key === 's') {
      savePointsToFile();
    } else if (p.key === 'l') {
      loadPointsFromFile();
    } else if (p.key === 'c') {
      console.log(`colPoints: `);
      console.log(colPoints);
    } else if (p.key === 'n') {
      renderingNNState = !renderingNNState;
      timeToRenderNN = 0;
    } else if (p.key === 'o') {
      vorDebug = !vorDebug;
    } else if (p.key === 'j') {
      pointsFromImage(parseInt(p.mouseX * 4), 1 + parseInt(p.mouseY / 20), offGridJitter);
    } else if (p.key === 'q') {
      calculateDelaunay();
    } else if (p.key === 'b') {
      circumcenterSubdivision();
    } else if (p.key === 'p') {
      logVoronoiPolys();
    } else if (p.key === 'a') {
      randomPoints(p.width, p.height, 5)
    } else if (p.key === 'e') {
      editModeState = !editModeState;
    } else if (p.key === 't') {
      iterativeSubdivision();
    } else if (p.key === 'r') {
      removalRecolor();
    }

    //to prevent any default behavior
    return false;
  }

  function calculateDelaunay() {

    points = [];

    for (let i = 0; i < colPoints.length; i++) {
      let inputPoint = colPoints[i];

      //add jitter to x
      inputPoint[0] = inputPoint[0] + ((Math.random() / 1000) - 0.0005);
      //add jitter to y
      inputPoint[1] = inputPoint[1] + ((Math.random() / 1000) - 0.0005);

      points.push([inputPoint[0], inputPoint[1]]);

    }

    aDelaunay = Delaunay.from(points);
    aVoronoi = aDelaunay.voronoi(bounds);

    console.log(`calculated Delaunay, ` + points.length + ` points`);

  }

  function createNNInterpolation(strideVP) {

    const NNInterpolationCache = {

      miniIndexes : [], //indexes of cells to be taken from main to mini Delaunay
      insertedDelaunay : {},
      insertedVoronoi : {},
      prevFound : 0, //speed up finding voronoi cells
      voronoiAreas : [] //cache of areas of voronoi cells

    };

    const tPreNNRender = performance.now();

    renderedNNImage.loadPixels();

    let stepEnd = renderNNCounter + parseInt(p.height / renderNNSteps);
    console.log(`Natural neighbor rendering: ` + renderNNCounter);

    for (let y = renderNNCounter;
      (y < (stepEnd - 1)) && (y < p.height); y += strideVP) {


      for (let x = 0; x < p.width; x += strideVP) {

        let NNweightedColor = naturalNeighborInterpolate(x, y, colPoints, points, aDelaunay, bounds, NNInterpolationCache);

        NNweightedColor = linearTosRGB(NNweightedColor);

        if (vorDebug) console.log(`Natural neighbor rendered: ` + x + `, ` + y);
        renderedNNImage.set(x, y, p.color(NNweightedColor));
      }
      renderNNCounter++;
      if (y > p.height - 2) {
        renderingNNState = false;
        renderNNCounter = 0;
      }

    }
    renderedNNImage.updatePixels();
    const tPostNNRender = performance.now();
    timeToRenderNN += (tPostNNRender - tPreNNRender);

    if (renderingNNState == false) readOutTimers();

  }

  function circumcenterSubdivision() {

    console.log(`circumcenterSubdivision...`);

    let subdivColPoints = [];

    //for (let c = 0; c < aVoronoi.circumcenters.length; c += 2) {
    for (let c = 0; c < aDelaunay.triangles.length; c += 3) {

      let cxLonger = aVoronoi.circumcenters[(c / 3) * 2];
      let cyLonger = aVoronoi.circumcenters[((c / 3) * 2) + 1];

      //get indexes for corresponding triangle
      const t0 = aDelaunay.triangles[c + 0];
      const t1 = aDelaunay.triangles[c + 1];
      const t2 = aDelaunay.triangles[c + 2];

      const point1 = [aDelaunay.points[t0 * 2], aDelaunay.points[t0 * 2 + 1]];
      const point2 = [aDelaunay.points[t1 * 2], aDelaunay.points[t1 * 2 + 1]];
      const point3 = [aDelaunay.points[t2 * 2], aDelaunay.points[t2 * 2 + 1]];

      const ccTriPoly = [point1, point2, point3];

      //only add subdivision for  triangles if at least one of the points is less than halfway to bounds
      // if point1 is inside bounds/2 OR point2 is inside bounds/2 OR point3 is inside bounds/2
      if (triNotOutOfInnerBounds(point1, point2, point3)) {

        //only add subdivision if circumcenter is outside triangle
        if (!polygonContains(ccTriPoly, [cxLonger, cxLonger])) {

          //clip to bounds
          const clippedPoint = clipToBounds(cxLonger, cyLonger);
          cxLonger = clippedPoint[0];
          cyLonger = clippedPoint[1];

          //add new point if it is now within bounds
          if ((cxLonger > bounds[0]) && (cxLonger < bounds[2]) && (cyLonger > bounds[1]) && (cyLonger < bounds[3])) {

            let cxShort = parseFloat(cxLonger.toFixed(decimalPlaces));
            let cyShort = parseFloat(cyLonger.toFixed(decimalPlaces));

            // if (vorDebug) console.log(`circ loop insertedDelaunay.points:`);
            // if (vorDebug) console.log(insertedDelaunay.points);

            let subdividedColor = naturalNeighborInterpolate(cxShort, cyShort, colPoints, points, aDelaunay, bounds);
            

            if (vorDebug) console.log(`subdividedColor:`);
            if (vorDebug) console.log(subdividedColor);

            //subdivColPoints.push([cxShort, cyShort, subdividedColor]);
            //These are not key points
            subdivColPoints.push([cxShort, cyShort, subdividedColor, false]);

          } else console.log('new point out of bounds');

        } else console.log('point not outside triangle');

      } else console.log('triangle outside inner bounds');

    }

    for (let i = 0; i < subdivColPoints.length; i++) {

      if (pointWontBeDuplicate(colPoints, subdivColPoints[i])) colPoints.push(subdivColPoints[i]);
    }


  }

  function iterativeSubdivision() {

    const tPreIterSubdiv = performance.now();

    let currentHighRatio = 100;

    while (currentHighRatio > radiusEdgeRatioLimit) {
      //for (let j = 0; j < 50; j++) {

      let radiusEdgeRatios = [];

      for (let t = 0; t < aDelaunay.triangles.length; t += 3) {

        //get indexes for corresponding triangle
        const t0 = aDelaunay.triangles[t + 0];
        const t1 = aDelaunay.triangles[t + 1];
        const t2 = aDelaunay.triangles[t + 2];

        const point1 = [aDelaunay.points[t0 * 2], aDelaunay.points[t0 * 2 + 1]];
        const point2 = [aDelaunay.points[t1 * 2], aDelaunay.points[t1 * 2 + 1]];
        const point3 = [aDelaunay.points[t2 * 2], aDelaunay.points[t2 * 2 + 1]];

        const triPoly = [point1, point2, point3];

        let shortestSide = bounds[2];


        //find shortest side of triangle if at least one of the points is within bounds/2
        if (triNotOutOfInnerBounds(point1, point2, point3)) {

          for (let s = 0; s < 3; s++) {

            const thisSide = p.dist(triPoly[s][0], triPoly[s][1], triPoly[(s + 1) % 3][0], triPoly[(s + 1) % 3][1]);

            if (thisSide < shortestSide) shortestSide = thisSide;

          }
        }

        const ccx = aVoronoi.circumcenters[(t / 3) * 2];
        const ccy = aVoronoi.circumcenters[((t / 3) * 2) + 1];

        const distToCC = p.dist(triPoly[0][0], triPoly[0][1], ccx, ccy);

        radiusEdgeRatios.push(distToCC / shortestSide);

      }

      //find highest ratio of circumcenter radius to shortest side
      let triToSubdivide = 0;
      let max = radiusEdgeRatios[0];
      for (let i = 1; i < radiusEdgeRatios.length; i++) {
        if (radiusEdgeRatios[i] > max) {
          max = radiusEdgeRatios[i];
          triToSubdivide = i;

        }
      }

      console.log('triToSubdivide:' + triToSubdivide + ' of ' + radiusEdgeRatios.length + ' with ratio: ' + radiusEdgeRatios[triToSubdivide]);

      //get circumcenter of triangle
      let cxLonger = aVoronoi.circumcenters[triToSubdivide * 2];
      let cyLonger = aVoronoi.circumcenters[(triToSubdivide * 2) + 1];

      //console.log('before clipping... cxLonger: ' + cxLonger + ', cyLonger: ' + cyLonger);

      //clip to bounds
      const clippedPoint = clipToBounds(cxLonger, cyLonger);
      cxLonger = clippedPoint[0];
      cyLonger = clippedPoint[1];

      //console.log(' after clipping... cxLonger: ' + cxLonger + ', cyLonger: ' + cyLonger);

      //add new point if it is now within bounds
      if ((cxLonger > bounds[0]) && (cxLonger < bounds[2]) && (cyLonger > bounds[1]) && (cyLonger < bounds[3])) {

        let cxShort = parseFloat(cxLonger.toFixed(decimalPlaces));
        let cyShort = parseFloat(cyLonger.toFixed(decimalPlaces));

        let subdividedColor = naturalNeighborInterpolate(cxShort, cyShort, colPoints, points, aDelaunay, bounds);
        
        if (vorDebug) console.log(`subdividedColor:`);
        if (vorDebug) console.log(subdividedColor);

        //add (but not as key point)
        colPoints.push([cxShort, cyShort, subdividedColor, false]);
        calculateDelaunay();

      } else console.log('new point out of bounds');

      currentHighRatio = radiusEdgeRatios[triToSubdivide];
    }

    const tPostIterSubdiv = performance.now();
    const iterSubdivTime = tPostIterSubdiv - tPreIterSubdiv;

    //console.log("found triangle " + triToSubdivide + " out of " + aDelaunay.triangles.length + " in " + iterSubdivTime + "ms");
    console.log("Subdivided down to ratio of " + currentHighRatio + " in " + iterSubdivTime + "ms");

    //TODO: for each non-original point, remove and recalculate colour

  }

  function removalRecolor() {

    console.log("removalRecolor");

    //create a copy, which will have original colours
    let colPointsPreRemoval = JSON.parse(JSON.stringify(colPoints));

    //for each interpolated point, make a copy of colPoints with that point removed

    for (let i = 0; i < colPointsPreRemoval.length; i++) {

      let colPointsRemoved = [];

      if (colPointsPreRemoval[i][3] == false) {

        for (let j = 0; j < colPointsPreRemoval.length; j++) {
          if (!(j == i)) colPointsRemoved.push(colPointsPreRemoval[j]);
        }


        let removalPoints = [];

        for (let p = 0; p < colPointsRemoved.length; p++) {
          let inputPoint = colPointsRemoved[p];

          //add jitter to x
          inputPoint[0] = inputPoint[0] + ((Math.random() / 1000) - 0.0005);
          //add jitter to y
          inputPoint[1] = inputPoint[1] + ((Math.random() / 1000) - 0.0005);

          removalPoints.push([inputPoint[0], inputPoint[1]]);

        }

        let rDelaunay = Delaunay.from(removalPoints);
        let rVoronoi = rDelaunay.voronoi(bounds);

        //TODO:
        //find colour at location colPoints[i][0], colPoints[i][1]
        let removalColor = naturalNeighborInterpolate(colPoints[i][0], colPoints[i][1], colPointsRemoved, removalPoints, rDelaunay, bounds);

        colPoints[i][2] = removalColor;

        //console.log("did removal recolor " + i);

      }

    }


  }


  function clipToBounds(xToClip, yToClip) {

    //if new point is out of bounds, clip the out of bounds dimension and shrink the other one to match
    //this is approximate, would be more accurate if offset to work from zero as centre of canvas
    //or existing trangle as centre

    if (xToClip < bounds[0]) {
      const shrinkRatio = xToClip / bounds[0];
      xToClip = bounds[0] + (Math.random() * offGridJitter);
      yToClip = yToClip / shrinkRatio;
    }
    if (xToClip > bounds[2]) {
      const shrinkRatio = xToClip / bounds[2];
      xToClip = bounds[2] - (Math.random() * offGridJitter);
      yToClip = yToClip / shrinkRatio;
    }
    if (yToClip < bounds[1]) {
      const shrinkRatio = yToClip / bounds[1];
      yToClip = bounds[1] + 1 + (Math.random() * offGridJitter);
      xToClip = xToClip / shrinkRatio;
    }
    if (yToClip > bounds[3]) {
      const shrinkRatio = yToClip / bounds[3];
      yToClip = bounds[3] - (Math.random() * offGridJitter);
      xToClip = xToClip / shrinkRatio;
    }

    return [xToClip, yToClip];

  }


  function drawDelaunay() {

    if (aDelaunay) {
      p.stroke(255, 0, 0);
      p.noFill();
      for (let polyTri of aDelaunay.trianglePolygons()) {
        drawPolygon(polyTri);
      }
    }
  }

  function drawVoronoi() {

    if (drawVoronoiState || fillVoronoiState) {
      if (aVoronoi) {
        if (drawVoronoiState) p.stroke(0, 255, 0);
        if (!drawVoronoiState) p.noStroke();
        if (!fillVoronoiState) p.noFill();

        for (let polyVor of aVoronoi.cellPolygons()) {

          if (fillVoronoiState) {

            let vorColor = linearTosRGB(colPoints[polyVor.index][2]);

            p.fill(vorColor[0], vorColor[1], vorColor[2]);
          }
          drawPolygon(polyVor);
        }
      }
    }
  }

  function triNotOutOfInnerBounds(point1, point2, point3) {

    //check that at least one of the points is less than halfway to bounds
    // if point1 is inside bounds/2 OR point2 is inside bounds/2 OR point3 is inside bounds/2
    if (
      ((point1[0] > bounds[0] / 2) && (point1[0] < bounds[2] / 2) && (point1[1] > bounds[1] / 2) && (point1[1] < bounds[3] / 2)) ||
      ((point2[0] > bounds[0] / 2) && (point2[0] < bounds[2] / 2) && (point2[1] > bounds[1] / 2) && (point2[1] < bounds[3] / 2)) ||
      ((point3[0] > bounds[0] / 2) && (point3[0] < bounds[2] / 2) && (point3[1] > bounds[1] / 2) && (point3[1] < bounds[3] / 2))
    ) return true;

    else return false;

  }

  function drawPolygon(drawPolyArray) {
    //takes an array of 2d points arrays [[x,y][x,y][x,y]...]
    p.beginShape();
    for (let v of drawPolyArray) {
      p.vertex((v)[0], (v)[1]);
    }
    p.endShape();
  }

  function testInsert(x, y) {

    if (points.length > 2) {

      console.log(`testInsert`);

      //naturalNeighborInterpolate(x, y);
      let insertedPoly = insertedVoronoi.cellPolygon(miniIndexes.length);

      //If new inserted polygon array is null or undefined, log it
      if (insertedPoly) {
        if (typeof insertedPoly[0][0] == 'undefined') {
          console.log('undefined');
        }
      } else {
        if (vorDebug) console.log('!insertedPoly');
      }

      if (!insertedPoly) console.log(`no inserted poly`);

      p.stroke(0, 0, 255);
      p.noFill();
      drawPolygon(insertedPoly);

      //let currentCell = aDelaunay.find(x, y);

      let currentCell = aDelaunay.find(x, y);

      const t0 = aDelaunay.triangles[currentCell * 3 + 0];
      const t1 = aDelaunay.triangles[currentCell * 3 + 1];
      const t2 = aDelaunay.triangles[currentCell * 3 + 2];
      const ccTriPoly = [
        [aDelaunay.points[t0 * 2], aDelaunay.points[t0 * 2 + 1]],
        [aDelaunay.points[t1 * 2], aDelaunay.points[t1 * 2 + 1]],
        [aDelaunay.points[t2 * 2], aDelaunay.points[t2 * 2 + 1]]
      ];

      let cCx = aVoronoi.circumcenters[currentCell * 2];
      let cCy = aVoronoi.circumcenters[(currentCell * 2) + 1];

      let testCircumCenter = [cCx, cCy];

      if (polygonContains(ccTriPoly, testCircumCenter)) {
        p.stroke(0, 255, 255)
      } else p.stroke(0, 0, 0);

      drawPolygon(ccTriPoly);

      p.ellipse(testCircumCenter[0], testCircumCenter[1], 20);

      console.log(`insert ` + x + `,` + y + ` cell: ` + currentCell);

      p.stroke(255, 255, 0);

      if (!insertedPoly) console.log(`no inserted poly`);

      //for (let n of insertedDelaunay.neighbors(insertedPoints.length - 1)) {
      for (let n of insertedDelaunay.neighbors(miniIndexes.length)) {

        let neighborPoly = aVoronoi.cellPolygon(miniIndexes[n]);

        if (!neighborPoly) {
          console.log(`no neighborPoly`);
          console.log(`n: `);
          console.log(n);

        }
        drawPolygon(neighborPoly);
      }

    }
  }

  function pointsFromImage(sampleProbability, pointThreshold, sampleJitter) {

    //clear arrays
    colPoints = [];
    linearImage = [];

    let copiedImage = [];
    sourceImage.loadPixels();
    for (let px = 0; px < (sourceImage.width * sourceImage.height * 4); px++) {
      copiedImage.push(sourceImage.pixels[px]);
    }

    linearImage = makeImageLinear(copiedImage, sourceImage.width, sourceImage.height);

    colPoints = findPoints(linearImage, sourceImage.width, sourceImage.height, sampleProbability, pointThreshold, sampleJitter);
    console.log(colPoints.length + " points");
  }

  function pickPointFromImage(x, y) {

    sourceImage.loadPixels(); //is this needed?

    let colR = sourceImage.pixels[4 * ((y * sourceImage.width) + x)];
    let colG = sourceImage.pixels[4 * ((y * sourceImage.width) + x) + 1];
    let colB = sourceImage.pixels[4 * ((y * sourceImage.width) + x) + 2];

    let pickedLinearColor = sRGBtoLinear([colR, colG, colB]);

    //add jitter to keep it from forming a grid in detailed areas
    const jitteredX = x + (offGridJitter * (Math.random() - 0.5));
    const jitteredY = y + (offGridJitter * (Math.random() - 0.5));

    const finalX = parseFloat(jitteredX.toFixed(decimalPlaces));
    const finalY = parseFloat(jitteredY.toFixed(decimalPlaces));

    //add to colPoints, with key point = true
    colPoints.push([finalX, finalY, pickedLinearColor, true]);

  }


  function randomPoints(w, h, count) {

    colPoints = [];

    for (let i = 0; i < count; i++) {

      let pointColor = [Math.random(), Math.random(), Math.random()];

      //let pointx = Math.random() * w;
      //let pointy = Math.random() * h;
      let pointx = (Math.random() * (w / 2)) + (w / 4);
      let pointy = (Math.random() * (h / 2)) + (h / 4);

      //add to colPoints, with key point = true
      colPoints.push([pointx, pointy, pointColor, true]);

    }
    console.log(`colPoints:`);
    console.log(colPoints);
  }

  function logVoronoiPolys() {
    for (let polyVor of aVoronoi.cellPolygons()) {
      console.log(polyVor);
    }
  }

  function savePointsToFile() {
    //TODO: save only kep points
    let JSONpoints = JSON.stringify(colPoints);
    p.save(JSONpoints, 'savedPoints.json');
  }

  function loadPointsFromFile() {
    colPoints = [];
    console.log(`loading points from file...`);
    p.loadJSON(`assets/savedPoints.json`, parseLoadedPoints)
    console.log(colPoints);
  }

  function parseLoadedPoints(jsonPoints) {
    console.log(`jsonPoints: `);
    console.log(jsonPoints);
    var as = JSON.parse(jsonPoints);
    for (let jp in as) {

      let parsedColPoint = as[jp];

      parsedColPoint[0] = ((parsedColPoint[0] - (bounds[2] / 20)) * zoomFactorOnLoad) + (bounds[2] / 20);
      parsedColPoint[1] = ((parsedColPoint[1] - (bounds[2] / 20)) * zoomFactorOnLoad) + (bounds[2] / 20);

      //set as key point
      parsedColPoint.push(true);

      let cxLong = parsedColPoint[0];
      let cyLong = parsedColPoint[1];

      //only add points that are within bounds
      if ((cxLong > bounds[0]) && (cxLong < bounds[2]) && (cyLong > bounds[1]) && (cyLong < bounds[3])) {

        parsedColPoint[0] = parseFloat(cxLong.toFixed(decimalPlaces));
        parsedColPoint[1] = parseFloat(cyLong.toFixed(decimalPlaces));

        if (pointWontBeDuplicate(colPoints, parsedColPoint)) colPoints.push(parsedColPoint);

      } else console.log(cxLong + `,` + cyLong + ` omitted as out of bounds`);

    }
  }

  function readOutTimers() {
    const timeToRenderNNinSeconds = (timeToRenderNN / 1000);
    console.log(`           timeToRenderNN: ` + timeToRenderNNinSeconds + `s`)

  }

};

function pointWontBeDuplicate(colPointArray, newColPoint) {
  for (const previousPoint of colPointArray) {
    if ((previousPoint[0] == newColPoint[0]) && (previousPoint[1] == newColPoint[1])) {
      return false;
    }
  }
  return true;
}




new p5(sketch, containerElement);