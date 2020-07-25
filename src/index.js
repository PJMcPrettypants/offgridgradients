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
  polygonArea
} from 'd3-polygon';

p5.disableFriendlyErrors = true;

const containerElement = document.getElementById('p5-container');

const sketch = (p) => {

  let colPoints = []; //Stores image data as point positions alongside corresponding colors [x,y,[r,g,b]] 
  let linearImage = []; //stores linear image, as the p5.js image object only stores 8 bit color
  let points = []; //points array is the point positions only [x,y], extracted for feeding into d3-delaunay, but with indexes matching colPoints

  let bounds = [];
  let dt; //density, detected in setup
  let aDelaunay;
  let aVoronoi;
  let sourceImage;
  let renderedNNImage;
  let renderedDistImage;
  let vorDebug = false;
  let drawDelaunayState = false;
  let drawVoronoiState = false;
  let fillVoronoiState = false;
  let drawTestInsertState = false;
  let renderingNNState = false;

  let renderNNCounter = 0;
  let renderNNSteps = 50;
  let prevFound = 0; //speed up finding voronoi cells
  let voronoiAreas = []; //cache of areas of voronoi cells

  let insertedDelaunay;
  let insertedVoronoi;

  let timeToModifyPoints = 0;
  let timeToUpdateDelaunay = 0;
  let timeToUpdateVoronoi = 0;
  let timeToGetWeightsFromPolys = 0;

  const decimalPlaces = 11; //rounding to prevent errors

  p.preload = function () {
    sourceImage = p.loadImage('assets/r.jpg');
  }

  p.setup = function () {
    console.log(`setup version: keep subdiv within bounds`)
    p.createCanvas(800, 800);
    dt = p.pixelDensity();
    bounds = [p.width * -10, p.height * -10, p.width * 11, p.height * 11];
    //bounds = [p.width, p.height, p.width, p.height];
    renderedNNImage = p.createImage(p.width, p.height);
    renderedDistImage = p.createImage(p.width, p.height);
    p.background(0);
    p.fill(128);
    p.rect(50, 50, 50, 50);
  }

  p.draw = function () {

    p.background(0);
    p.image(renderedNNImage, 0, 0);
    p.image(renderedDistImage, 0, 0);

    drawVoronoi();

    if (drawDelaunayState) drawDelaunay();

    if (drawTestInsertState) testInsert(p.mouseX, p.mouseY);

    if (renderingNNState) createNNInterpolation(1);
  }
  // p.mouseClicked = function () {
  // }

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
    } else if (p.key === 'o') {
      vorDebug = !vorDebug;
    } else if (p.key === 'j') {
      pointsFromImage(parseInt(p.mouseX * 4), 1 + parseInt(p.mouseY / 20));
    } else if (p.key === 'q') {
      calculateDelaunay();
    } else if (p.key === 'b') {
      circumcenterSubdivision();
    } else if (p.key === 'p') {
      logVoronoiPolys();
    } else if (p.key === 'y') {
      logInsertedDelaunay();
    } else if (p.key === 'r') {
      randomPoints(p.width, p.height, 5)
    }

    //to prevent any default behavior
    return false;
  }

  function pointsFromImage(pointStride, pointThreshold) {

    //clear arrays
    colPoints = [];
    linearImage = [];
    voronoiAreas = [];

    let copiedImage = [];
    sourceImage.loadPixels();
    for (let px = 0; px < (sourceImage.width * sourceImage.height * 4); px++) {
      copiedImage.push(sourceImage.pixels[px]);
    }

    linearImage = makeImageLinear(copiedImage, sourceImage.width, sourceImage.height);

    colPoints = findPoints(linearImage, sourceImage.width, sourceImage.height, pointStride, pointThreshold);
    console.log(colPoints.length + " points");
  }

  function calculateDelaunay() {

    points = [];
    voronoiAreas = [];

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

    for (let i = 0; i < points.length; i++) {

      let aPolyVor = aVoronoi.cellPolygon(i);
      aPolyVor.pop();
      let aPolyVorArea = polygon.area(aPolyVor);
      voronoiAreas.push(aPolyVorArea);

    }

    //add separate delaunay/voronoi for natural neighbour interpolation, where last point will be changed
    let NNPoints = points.slice();
    NNPoints.push([111.11111, 111.11111]);

    if (vorDebug) console.log(`NNPoints:`);
    if (vorDebug) console.log(NNPoints);

    insertedDelaunay = Delaunay.from(NNPoints);
    insertedVoronoi = insertedDelaunay.voronoi(bounds);

    if (vorDebug) console.log(`insertedDelaunay.points:`);
    if (vorDebug) console.log(insertedDelaunay.points);
    if (vorDebug) console.log(`aDelaunay.points:`);
    if (vorDebug) console.log(aDelaunay.points);

    console.log(`calculated Delaunay`);

  }

  function createNNInterpolation(strideVP) {

    renderedNNImage.loadPixels();

    let stepEnd = renderNNCounter + parseInt(p.height / renderNNSteps);

    for (let y = renderNNCounter;
      (y < (stepEnd - 1)) && (y < p.height); y += strideVP) {

      console.log(`Natural neighbour rendering: ` + y);

      for (let x = 0; x < p.width; x += strideVP) {

        let NNweightedColor = linearTosRGB((naturalNeighbourInterpolate(x, y, prevFound)));
        if (vorDebug) console.log(`Natural neighbour rendered: ` + x + `, ` + y);
        renderedNNImage.set(x, y, p.color(NNweightedColor));
      }
      renderNNCounter++;
      if (y > p.height - 2) {
        renderingNNState = false;
        renderNNCounter = 0;
        readOutTimers();
      }

    }
    renderedNNImage.updatePixels();

  }

  function circumcenterSubdivision() {

    console.log(`circumcenterSubdivision...`);

    prevFound = 0;

    let subdivColPoints = [];

    for (let c = 0; c < aVoronoi.circumcenters.length; c += 2) {

      let cxLonger = aVoronoi.circumcenters[c];
      let cyLonger = aVoronoi.circumcenters[c + 1];

      //only add new point if it is within bounds
      if ((cxLonger > bounds[0]) && (cxLonger < bounds[2]) && (cyLonger > bounds[1]) && (cyLonger < bounds[3])) {

        let cxShort = parseFloat(cxLonger.toFixed(decimalPlaces));
        let cyShort = parseFloat(cyLonger.toFixed(decimalPlaces));

        if (vorDebug) console.log(`circ loop insertedDelaunay.points:`);
        if (vorDebug) console.log(insertedDelaunay.points);

        let subdividedColor = naturalNeighbourInterpolate(cxShort, cyShort, prevFound);

        if (vorDebug) console.log(`subdividedColor:`);
        if (vorDebug) console.log(subdividedColor);

        subdivColPoints.push([cxShort, cyShort, subdividedColor]);

      }

    }

    for (let i = 0; i < subdivColPoints.length; i++) {

      if (pointWontBeDuplicate(colPoints, subdivColPoints[i])) colPoints.push(subdivColPoints[i]);
    }

    readOutTimers();

  }

  function naturalNeighbourInterpolate(x, y, prevFound) {

    if (vorDebug) console.log(`NN func insertedDelaunay.points:`);
    if (vorDebug) console.log(insertedDelaunay.points);
    if (vorDebug) console.log(`aDelaunay.points:`);
    if (vorDebug) console.log(aDelaunay.points);

    const tPreModify = performance.now();

    insertedDelaunay.points[insertedDelaunay.points.length - 2] = x;
    insertedDelaunay.points[insertedDelaunay.points.length - 1] = y;

    const tPostModify = performance.now();
    timeToModifyPoints = timeToModifyPoints + (tPostModify - tPreModify);

    const tPreDelaunay = performance.now();
    //insertedDelaunay.update();
    const tPostDelaunay = performance.now();
    timeToUpdateDelaunay = timeToUpdateDelaunay + (tPostDelaunay - tPreDelaunay);

    const tPreVoronoi = performance.now();
    insertedVoronoi.update();
    const tPostVoronoi = performance.now();
    timeToUpdateVoronoi = timeToUpdateVoronoi + (tPostVoronoi - tPreVoronoi);

    const tPrePolyWeight = performance.now();

    let insertedPoly = insertedVoronoi.cellPolygon(points.length);

    if (vorDebug) console.log(`insertedPoly:`);
    if (vorDebug) console.log(insertedPoly);

    let insertionFailed = false;

    //If new inserted polygon array is null or undefined, get poly by index to original delaunay cell for this point
    if (insertedPoly) {

      if (typeof insertedPoly[0][0] == 'undefined') {
        let foundCell = aDelaunay.find(x, y, prevFound);
        insertedPoly = insertedVoronoi.cellPolygon(foundCell);
        insertionFailed = true;
        prevFound = foundCell;
        if (vorDebug) console.log('undefined');
      }
    } else {
      if (vorDebug) console.log('!insertedPoly');
      let foundCell = aDelaunay.find(x, y, prevFound);
      insertedPoly = insertedVoronoi.cellPolygon(foundCell);
      insertionFailed = true;
      prevFound = foundCell;
    }

    insertedPoly.pop(); //remove duplicate vertex

    if (!insertedPoly) console.log(`no inserted poly`);

    const insertedPolyArea = (polygon.area(insertedPoly));


    let weightedColor = [0, 0, 0];
    let totalWeight = 0;

    if (vorDebug) console.log('Neighbour loop ahead...');

    for (let n of insertedDelaunay.neighbors(points.length)) {

      if (vorDebug) console.log('Neighbour loop starting');

      if (vorDebug) console.log(`n: `);
      if (vorDebug) console.log(n);

      //let neighborPoly = aVoronoi.cellPolygon(n);
      let neighborPolyAfter = insertedVoronoi.cellPolygon(n);

      let neighborPoly = aVoronoi.cellPolygon(n);
      neighborPoly.pop();
      let oldNeighborBeforeArea = polygon.area(neighborPoly);

      let neighborBeforeArea = voronoiAreas[n];

      if (vorDebug) console.log('oldNeighborBeforeArea: ' + oldNeighborBeforeArea);
      if (vorDebug) console.log('   neighborBeforeArea: ' + neighborBeforeArea);

      let intersectionArea = 0;

      if (neighborPolyAfter) {

        //neighborPoly.pop();
        neighborPolyAfter.pop();

        //faster to compare areas of the reduced polygons in insertedDelaunay with original versions, rather than intersect
        intersectionArea = neighborBeforeArea - polygon.area(neighborPolyAfter);

      }


      // if (!neighborPoly) {
      //   console.log(`no neighborPoly at neighbour ` + n + ` of ` + x + `,` + y + ` , should be at ` + points[n]);
      // }

      if (!neighborPolyAfter) {
        console.log(`no neighborPolyAfter at neighbour ` + n + ` of ` + x + `,` + y + ` , should be at ` + points[n]);
      }

      if (vorDebug) console.log(`insertedPoly: `);
      if (vorDebug) console.log(insertedPoly);

      if (vorDebug) p.stroke(0, 0, 255);
      if (vorDebug) drawPolygon(insertedPoly);

      // if (vorDebug) console.log(`neighborpoly: `);
      // if (vorDebug) console.log(neighborPoly);

      // if (vorDebug) p.stroke(255, 0, 0);
      // if (vorDebug) drawPolygon(neighborPoly);

      if (vorDebug) console.log('intersectionArea');

      if (intersectionArea > 0) {
        let relativeWeight = intersectionArea / insertedPolyArea;

        let neighborColor = colPoints[n][2];
        weightedColor[0] = weightedColor[0] + (neighborColor[0] * relativeWeight);
        weightedColor[1] = weightedColor[1] + (neighborColor[1] * relativeWeight);
        weightedColor[2] = weightedColor[2] + (neighborColor[2] * relativeWeight);

        totalWeight = totalWeight + relativeWeight;

      }

      if (vorDebug) console.log('Neighbour loop ending');

    }

    if (vorDebug) console.log('Done neighbour loop');

    //if the inserted cell is the same as the original cell, or something else goes wrong, it won't overlap with its neighbours

    if (totalWeight < 1.0) {
      const remainingWeight = Math.min(Math.max((1.0 - totalWeight), 0.0), 1.0);
      let foundCell = aDelaunay.find(x, y, prevFound);
      const originalCellColor = colPoints[foundCell][2];
      prevFound = foundCell;

      weightedColor[0] = weightedColor[0] + (originalCellColor[0] * remainingWeight);
      weightedColor[1] = weightedColor[1] + (originalCellColor[1] * remainingWeight);
      weightedColor[2] = weightedColor[2] + (originalCellColor[2] * remainingWeight);
    }


    if (vorDebug) {
      if (totalWeight < 0.9) {
        console.log(`position: ` + x + `, ` + y);
        console.log(`insertionFailed:`);
        console.log(insertionFailed);
        console.log(`insertedPolyArea:`);
        console.log(insertedPolyArea);
        console.log(`totalWeight:`);
        console.log(totalWeight);


        p.noFill();
        drawPolygon(insertedPoly);
        p.stroke(255, 0, 0, 128);
      }
    }

    const tPostPolyWeight = performance.now();
    timeToGetWeightsFromPolys = timeToGetWeightsFromPolys + (tPostPolyWeight - tPrePolyWeight);
    return weightedColor;

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

      p.stroke(0, 0, 255);
      p.noFill()

      console.log(`testInsert`);

      //let insertedPoints = points.slice();
      //insertedPoints.push([x, y]);
      //let insertedDelaunay = Delaunay.from(insertedPoints);
      insertedDelaunay.points[insertedDelaunay.points.length - 2] = x;
      insertedDelaunay.points[insertedDelaunay.points.length - 1] = y;

      insertedDelaunay.update();
      insertedVoronoi.update();

      //could be speeded up by reducing bounds?
      //insertedVoronoi = insertedDelaunay.voronoi(bounds);

      let insertedPoly = insertedVoronoi.cellPolygon(points.length);

      let insertionFailed = false;

      //If new inserted polygon array is null or undefined, get poly by index to original delaunay cell for this point
      if (insertedPoly) {

        if (typeof insertedPoly[0][0] == 'undefined') {
          let foundCell = aDelaunay.find(x, y);
          insertedPoly = insertedVoronoi.cellPolygon(foundCell);
          insertionFailed = true;
          p.stroke(255, 255, 0);
        }
      } else {
        let foundCell = aDelaunay.find(x, y);
        insertedPoly = insertedVoronoi.cellPolygon(foundCell);
        insertionFailed = true;
        p.stroke(0, 255, 255);
      }

      drawPolygon(insertedPoly);

      let currentCell = aDelaunay.find(x, y);

      console.log(`insert ` + x + `,` + y + ` cell: ` + currentCell);

      p.stroke(255, 255, 0);

      if (!insertedPoly) console.log(`no inserted poly`);

      //for (let n of insertedDelaunay.neighbors(insertedPoints.length - 1)) {
      for (let n of insertedDelaunay.neighbors(points.length)) {

        let neighborPoly = aVoronoi.cellPolygon(n);

        if (!neighborPoly) {
          console.log(`no neighborPoly`);
          console.log(`n: `);
          console.log(n);

        }

        drawPolygon(neighborPoly);
      }

    }
  }

  function randomPoints(w, h, count) {

    colPoints = [];

    for (let i = 0; i < count; i++) {

      let pointColor = [Math.random(), Math.random(), Math.random()];

      //let pointx = Math.random() * w;
      //let pointy = Math.random() * h;
      let pointx = (Math.random() * (w / 2)) + (w / 4);
      let pointy = (Math.random() * (h / 2)) + (h / 4);

      colPoints.push([pointx, pointy, pointColor]);

    }
    console.log(`colPoints:`);
    console.log(colPoints);
  }

  function logVoronoiPolys() {
    for (let polyVor of aVoronoi.cellPolygons()) {
      console.log(polyVor);
    }
  }

  function logInsertedDelaunay() {
    console.log(`insertedDelaunay.points:`);
    console.log(insertedDelaunay.points);
    console.log(`aDelaunay.points:`);
    console.log(aDelaunay.points);
  }

  function savePointsToFile() {
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

      let cxLong = parsedColPoint[0];
      let cyLong = parsedColPoint[1];

      //only add points that are within bounds
      if ((cxLong > bounds[0]) && (cxLong < bounds[2]) && (cyLong > bounds[1]) && (cyLong < bounds[3])){

        parsedColPoint[0] = parseFloat(cxLong.toFixed(decimalPlaces));
        parsedColPoint[1] = parseFloat(cyLong.toFixed(decimalPlaces));

        if (pointWontBeDuplicate(colPoints, parsedColPoint)) colPoints.push(parsedColPoint);

      }
      else console.log(cxLong +`,` + cyLong + ` omitted as out of bounds` );

    }
  }

  function readOutTimers() {

    console.log(`       timeToModifyPoints: ` + timeToModifyPoints);
    console.log(`     timeToUpdateDelaunay: ` + timeToUpdateDelaunay);
    console.log(`      timeToUpdateVoronoi: ` + timeToUpdateVoronoi);
    console.log(`timeToGetWeightsFromPolys: ` + timeToGetWeightsFromPolys);

    timeToModifyPoints = 0;
    timeToUpdateDelaunay = 0;
    timeToUpdateVoronoi = 0;
    timeToGetWeightsFromPolys = 0;

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