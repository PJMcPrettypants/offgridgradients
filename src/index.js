import * as p5 from './libraries/p5.js';
import {
  Delaunay
} from "d3-delaunay";
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


const containerElement = document.getElementById('p5-container');

const sketch = (p) => {

  let colPoints = []; //Stores image data as point positions alongside corresponding colors [x,y,[r,g,b]] 
  let linearImage = []; //stores linear image, as the p5.js image object stores 8 bit color
  let points = []; //points array is the point positions only [x,y], extracted for feeding into d3-delaunay, but with indexes matching colPoints

  let bounds = [];
  let dt; //density, detected in setup
  let aDelaunay;
  let aVoronoi;
  let sourceImage;
  let renderedImage;
  const vorDebug = false;
  let drawDelaunayState = false;
  let drawVoronoiState = false;
  let fillVoronoiState = false;
  let drawTestInsertState = false;

  p.preload = function () {
    sourceImage = p.loadImage('assets/r.jpg');
  }

  p.setup = function () {
    p.createCanvas(800, 800);
    dt = p.pixelDensity();
    bounds = [0, 0, p.width, p.height];
    renderedImage = p.createImage(p.width, p.height);
    p.background(0);
    p.fill(128);
    p.rect(50, 50, 50, 50);
  }
  
  p.draw = function () {

    p.image(renderedImage, 0, 0);

    if (drawDelaunayState) drawDelaunay();

    drawVoronoi();

    if (drawTestInsertState) testInsert(p.mouseX, p.mouseY);

    console.log(`drawVoronoiState: ` + drawVoronoiState);
    console.log(`fillVoronoiState: ` + fillVoronoiState)


  }

  p.mouseClicked = function () {

    randomPoints(p.width, p.height, 20);
    //pointsFromImage(parseInt(p.mouseX * 4), 1 + parseInt(p.mouseY / 20));
    calculateDelaunay();
    let interpolationStride = 1;
    createInterpolation(interpolationStride);

  }

  p.keyTyped = function () {
    if (p.key === 'v') {
      if (fillVoronoiState) drawVoronoiState = !drawVoronoiState;
      fillVoronoiState = !fillVoronoiState;

    } else if (p.key === 'd') {
      drawDelaunayState = !drawDelaunayState;
    } else if (p.key === 'i') {
      drawTestInsertState = !drawTestInsertState;
    }
    //to prevent any default behavior
    return false;
  }

  function pointsFromImage(pointStride, pointThreshold) {

    //clear arrays
    colPoints = [];
    points = [];
    linearImage = [];

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

    for (let i = 0; i < colPoints.length; i++) {
      let v = colPoints[i];
      points.push([parseInt(v[0]), parseInt(v[1])]);
    }

    aDelaunay = Delaunay.from(points);

    aVoronoi = aDelaunay.voronoi(bounds);

    // for (let i = 0; i < colPoints.length; i++) {
    //   var vorColor = colPoints[i][2];
    //   p.fill(vorColor[0], vorColor[1], vorColor[2]);
    //   let cellPoly = aVoronoi.cellPolygon(i);
    // }

  }

  function createInterpolation(strideVP) {

    //p.background(0);

    renderedImage.loadPixels();

    //p.noStroke();
    //p.stroke(255, 0, 0, 128);
    //loop to create voronoi for each pixel

    var prevFound = 0; //speed up finding cells

    for (let y = 0; y < p.height; y += strideVP) {
      for (let x = 0; x < p.width; x += strideVP) {

        let insertedPoints = points.slice();
        insertedPoints.push([x, y]);
        let insertedDelaunay = Delaunay.from(insertedPoints);

        //could be speeded up by reducing bounds?
        let insertedVoronoi = insertedDelaunay.voronoi(bounds);

        let insertedPoly = insertedVoronoi.cellPolygon(insertedPoints.length - 1);

        let insertionFailed = false;

        //If new inserted polygon array is null or undefined, get poly by index to original delaunay cell for this point
        if (insertedPoly) {

          if (typeof insertedPoly[0][0] == 'undefined') {
            let foundCell = aDelaunay.find(x, y, prevFound);
            insertedPoly = insertedVoronoi.cellPolygon(foundCell);
            insertionFailed = true;
            prevFound = foundCell;
            if (vorDebug) p.stroke(0, 0, 255, 128);
          }
        } else {
          let foundCell = aDelaunay.find(x, y, prevFound);
          insertedPoly = insertedVoronoi.cellPolygon(foundCell);
          insertionFailed = true;
          prevFound = foundCell;
        }

        const insertedPolyArea = (polygon.area(insertedPoly));


        let weightedColor = [0, 0, 0];
        let totalWeight = 0;



        for (let n of insertedDelaunay.neighbors(insertedPoints.length - 1)) {



          let neighborPoly = aVoronoi.cellPolygon(n);

          /*           if ((x == 400) && (y == 400)) {
                      console.log(`n:`);
                      console.log(n);
                      console.log(`neighborPoly:`);
                      console.log(neighborPoly);
                    } */



          let intersectionPoly;
          let intersectionArea = 0;

          //might be faster to compare areas in insertedDelaunay with original?
          const intersectionPolyArray = polygon.intersection(insertedPoly, neighborPoly);

          if (intersectionPolyArray) {
            if (intersectionPolyArray[0]) {
              intersectionPoly = intersectionPolyArray[0];
              intersectionArea = polygon.area(intersectionPoly);
              // if ((x == 400) && (y == 400)) {
              //   console.log(`intersectionPoly: `);
              //   console.log(intersectionPoly);
              // }
            }
          }

          if (intersectionArea > 0) {
            let relativeWeight = intersectionArea / insertedPolyArea;

            /* if ((x == 400) && (y == 400)) {
            console.log(`intersectionArea: `);
            console.log(intersectionArea);
            console.log(`relativeWeight: `);
            console.log(relativeWeight);
            } */
            let neighborColor = colPoints[n][2];

            weightedColor[0] = weightedColor[0] + (neighborColor[0] * relativeWeight);
            weightedColor[1] = weightedColor[1] + (neighborColor[1] * relativeWeight);
            weightedColor[2] = weightedColor[2] + (neighborColor[2] * relativeWeight);

            totalWeight = totalWeight + relativeWeight;

          }

          // //check polygon array isn't null or undefined
          // if (intersectionPoly) {
          //   if (intersectionPoly[0]) {
          //     if (intersectionPoly[0][0]) {
          //     }
          //   }
          // }


        }

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
        if (!vorDebug) {
          p.noStroke();
          //p.fill(weightedColor[0], weightedColor[1], weightedColor[2]);
          //drawPolygon(insertedPoly);
        }

        if ((x == 400) && (y == 400)) console.log(`weightedColor:` + weightedColor);
        weightedColor = linearTosRGB(weightedColor);
        if ((x == 400) && (y == 400)) console.log(`tosRGB weightedColor:` + weightedColor);

        // for (let i = 0; i < dt; i++) {
        //   for (let j = 0; j < dt; j++) {
        //     // loop over
        //     let pixIndex = 4 * ((y * dt + j) * p.width * dt + (x * dt + i));
        //     renderedImage.pixels[pixIndex] = weightedColor[0]; //r
        //     renderedImage.pixels[pixIndex + 1] = weightedColor[1]; //g
        //     renderedImage.pixels[pixIndex + 2] = weightedColor[2]; //b
        //     p.pixels[pixIndex + 3] = 255; //a
        //   }
        // }
        renderedImage.set(x, y, p.color(weightedColor));
      }
    }
    renderedImage.updatePixels();
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
            // console.log(`polyVor.index:`);
            // console.log(polyVor.index);
            // console.log(`colPoints[polyVor.index]:`);
            // console.log(colPoints[polyVor.index]);

            let vorColor = linearTosRGB(colPoints[polyVor.index][2]);
            // console.log(`vorColor:`);
            // console.log(vorColor);


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

      let insertedPoints = points.slice();
      insertedPoints.push([x, y]);
      let insertedDelaunay = Delaunay.from(insertedPoints);

      //could be speeded up by reducing bounds?
      let insertedVoronoi = insertedDelaunay.voronoi(bounds);

      let insertedPoly = insertedVoronoi.cellPolygon(insertedPoints.length - 1);

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
    }
  }

  function randomPoints(w, h, count) {

    colPoints = [];

    for (let i = 0; i < count; i++) {

      let pointColor = [Math.random(), Math.random(), Math.random()];

      let pointx = Math.random() * w;
      let pointy = Math.random() * h;

      colPoints.push([pointx, pointy, pointColor]);

    }
    console.log(`colPoints:`);
    console.log(colPoints);
  }

};


new p5(sketch, containerElement);