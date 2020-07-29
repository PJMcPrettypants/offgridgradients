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
  let renderNNSteps = 20;
  let voronoiAreas = []; //cache of areas of voronoi cells

  let prevFound = 0; //speed up finding voronoi cells
  let miniIndexes = [] //indexes of cells to be taken from main to mini Delaunay
  let miniDelaunay;
  let miniVoronoi;

  let insertedDelaunay;
  let insertedVoronoi;

  let timeToGetWeightsFromPolys = 0;
  let timeToRenderNN = 0;

  const decimalPlaces = 11; //rounding to prevent errors

  p.preload = function () {
    sourceImage = p.loadImage('assets/r.jpg');
  }

  p.setup = function () {
    console.log(`setup version: random sampling`)
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
      timeToRenderNN = 0;
    } else if (p.key === 'o') {
      vorDebug = !vorDebug;
    } else if (p.key === 'j') {
      pointsFromImage(parseInt(p.mouseX * 4), 1 + parseInt(p.mouseY / 20), 1.0);
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

    const tPreNNRender = performance.now();

    renderedNNImage.loadPixels();

    let stepEnd = renderNNCounter + parseInt(p.height / renderNNSteps);
    console.log(`Natural neighbor rendering: ` + renderNNCounter);

    for (let y = renderNNCounter;
      (y < (stepEnd - 1)) && (y < p.height); y += strideVP) {



      for (let x = 0; x < p.width; x += strideVP) {

        let NNweightedColor = linearTosRGB((naturalNeighborInterpolate(x, y)));
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

    for (let c = 0; c < aVoronoi.circumcenters.length; c += 2) {

      let cxLonger = aVoronoi.circumcenters[c];
      let cyLonger = aVoronoi.circumcenters[c + 1];

      //only add new point if it is within bounds
      if ((cxLonger > bounds[0]) && (cxLonger < bounds[2]) && (cyLonger > bounds[1]) && (cyLonger < bounds[3])) {

        let cxShort = parseFloat(cxLonger.toFixed(decimalPlaces));
        let cyShort = parseFloat(cyLonger.toFixed(decimalPlaces));

        // if (vorDebug) console.log(`circ loop insertedDelaunay.points:`);
        // if (vorDebug) console.log(insertedDelaunay.points);

        let subdividedColor = naturalNeighborInterpolate(cxShort, cyShort);

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

  function naturalNeighborInterpolate(x, y) {

    let oldMiniIndexes = miniIndexes.slice();
    let miniIndexesBefore = miniIndexes.length; //might not be needed?

    //if there's already a mini Delaunay, try updating insertedVoronoi to check for new Neighbours
    if (miniIndexesBefore > 0) {
      if (vorDebug) console.log(`tried update`);

      insertedDelaunay.points[insertedDelaunay.points.length - 2] = x;
      insertedDelaunay.points[insertedDelaunay.points.length - 1] = y;
      insertedVoronoi.update();
      addNeighborsNeighbors();
    } else if (vorDebug) console.log(`didn't try update`);

    //if there are new neighbours, OR no mini Delaunay, start a new mini Delaunay
    if ((miniIndexes.length > miniIndexesBefore) || (miniIndexesBefore < 1)) {
      if (vorDebug) console.log(`didn't skip new Delaunay`)

      miniIndexes = [];
      let foundMiniCell = aDelaunay.find(x, y, prevFound);
      prevFound = foundMiniCell;
      miniIndexes.push(foundMiniCell);
      for (let n of aDelaunay.neighbors(foundMiniCell)) {
        miniIndexes.push(n);
      }

      miniIndexesBefore = miniIndexes.length;
      if (vorDebug) console.log(`about to enter do while loop`);
      do {
        miniIndexesBefore = miniIndexes.length;
        //make mini Voronoi, taking point co-ordinates from main Voronoi plus new inserted point x,y
        let NNPoints = [];
        for (let c of miniIndexes) {
          NNPoints.push(points[c]);
        }
        NNPoints.push([x, y]);
        insertedDelaunay = Delaunay.from(NNPoints);

        addNeighborsNeighbors();

      } while (miniIndexes.length > miniIndexesBefore); //loop if new neighbor's neighbors added
      //If the newly added neighbor's neighbors also turn out to be 1st degree neighbors of inserted cell
      //then their neighbors will be added on the next loop, until no new neighbor's neighbors can be found
      if (vorDebug) console.log(`done do while loop`);

      insertedVoronoi = insertedDelaunay.voronoi(bounds);
      let miniPoints = [];
      voronoiAreas = [];
      for (let c of miniIndexes) {
        miniPoints.push(points[c]);
      }
      miniDelaunay = Delaunay.from(miniPoints);
      miniVoronoi = miniDelaunay.voronoi(bounds);
      for (let i = 0; i < miniPoints.length; i++) {
        let miniPolyVor = miniVoronoi.cellPolygon(i);
        miniPolyVor.pop();
        let miniPolyVorArea = polygon.area(miniPolyVor);
        voronoiAreas.push(miniPolyVorArea);
      }

    } else if (vorDebug) console.log(`skipped new Delaunay`);

    const tPrePolyWeight = performance.now();

    let insertedPoly = insertedVoronoi.cellPolygon(miniIndexes.length);

    if (vorDebug) console.log(`insertedPoly:`);
    if (vorDebug) console.log(insertedPoly);

    let insertionFailed = false;

    //If new inserted polygon array is null or undefined, log it
    //formerly got poly by index to original delaunay cell for this point
    if (insertedPoly) {
      if (typeof insertedPoly[0][0] == 'undefined') {
        console.log('undefined');
      }
    } else {
      if (vorDebug) console.log('!insertedPoly');
    }

    insertedPoly.pop(); //remove duplicate vertex

    if (!insertedPoly) console.log(`no inserted poly`);

    const insertedPolyArea = (polygon.area(insertedPoly));

    let weightedColor = [0, 0, 0];
    let totalWeight = 0;

    if (vorDebug) console.log('Neighbor loop ahead...');

    for (let n of insertedDelaunay.neighbors(miniIndexes.length)) {

      if (vorDebug) console.log('Neighbor loop starting');

      if (vorDebug) console.log(`n: `);
      if (vorDebug) console.log(n);

      let neighborPolyAfter = insertedVoronoi.cellPolygon(n);

      let neighborBeforeArea = voronoiAreas[n];

      if (vorDebug) console.log('oldNeighborBeforeArea: ' + oldNeighborBeforeArea);
      if (vorDebug) console.log('   neighborBeforeArea: ' + neighborBeforeArea);

      let intersectionArea = 0;

      if (neighborPolyAfter) {
        neighborPolyAfter.pop();
        //faster to compare areas of the reduced polygons in insertedDelaunay with original versions, rather than intersect
        intersectionArea = neighborBeforeArea - polygon.area(neighborPolyAfter);
      }


      if (!neighborPolyAfter) {
        console.log(`no neighborPolyAfter at neighbor ` + n + ` of ` + x + `,` + y + ` , should be at ` + points[n]);
      }

      if (vorDebug) console.log(`insertedPoly: `);
      if (vorDebug) console.log(insertedPoly);
      if (vorDebug) p.stroke(0, 0, 255);
      if (vorDebug) drawPolygon(insertedPoly);
      if (vorDebug) console.log('intersectionArea');

      if (intersectionArea > 0) {
        let relativeWeight = intersectionArea / insertedPolyArea;
        //n is the neighbor's index in insertedVoronoi, miniIndexes[n] has the index to original colPoints
        let neighborColor = colPoints[miniIndexes[n]][2];
        weightedColor[0] = weightedColor[0] + (neighborColor[0] * relativeWeight);
        weightedColor[1] = weightedColor[1] + (neighborColor[1] * relativeWeight);
        weightedColor[2] = weightedColor[2] + (neighborColor[2] * relativeWeight);

        totalWeight = totalWeight + relativeWeight;

      }

      if (vorDebug) console.log('Neighbor loop ending');

    }

    if (vorDebug) console.log('Done neighbor loop');

    //if the inserted cell is the same as the original cell, or something else goes wrong, it won't overlap with its neighbors

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

  function addNeighborsNeighbors() {

    if (vorDebug) logInsertedDelaunay();
    //find neighboring cells of inserted cell in insertedDelaunay
    for (let n of insertedDelaunay.neighbors(miniIndexes.length)) {
      // and add all the neighbor's neighbors from main voronoi to miniIndexes
      for (let nn of aDelaunay.neighbors(miniIndexes[n])) {
        //...if they haven't been included already
        if (!miniIndexes.includes(nn)) {
          miniIndexes.push(nn);
        }
      }
    }
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

      console.log(`testInsert`);

      naturalNeighborInterpolate(x, y);
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

      let currentCell = aDelaunay.find(x, y);

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
    console.log(`aDelaunay.points:`);
    console.log(aDelaunay.points);
    console.log(`miniIndexes :`);
    console.log(miniIndexes);
    console.log(`insertedDelaunay.points:`);
    console.log(insertedDelaunay.points);
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
      if ((cxLong > bounds[0]) && (cxLong < bounds[2]) && (cyLong > bounds[1]) && (cyLong < bounds[3])) {

        parsedColPoint[0] = parseFloat(cxLong.toFixed(decimalPlaces));
        parsedColPoint[1] = parseFloat(cyLong.toFixed(decimalPlaces));

        if (pointWontBeDuplicate(colPoints, parsedColPoint)) colPoints.push(parsedColPoint);

      } else console.log(cxLong + `,` + cyLong + ` omitted as out of bounds`);

    }
  }

  function readOutTimers() {
    const timeToRenderNNinSeconds = (timeToRenderNN / 1000);
    console.log(`timeToGetWeightsFromPolys: ` + timeToGetWeightsFromPolys + `ms`);
    console.log(`           timeToRenderNN: ` + timeToRenderNNinSeconds + `s`)
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