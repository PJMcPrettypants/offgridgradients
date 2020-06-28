import * as p5 from './libraries/p5.js';
import {
  Delaunay
} from "d3-delaunay";
import {
  polygon
} from 'polygon-tools';

var sourceImage;

//colPoints is the most important array, it stores image data as point positions alongside corresponding colours [x,y,[r,g,b]] 
var colPoints = [];

//points array is the point positions only [x,y], extracted for feeding into d3-delaunay, but with indexes matching
var points = [];

const containerElement = document.getElementById('p5-container');

const sketch = (p) => {

  p.preload = function () {
    sourceImage = p.loadImage('assets/r.jpg');
  }

  p.setup = function () {
    p.createCanvas(800, 800);
    p.background(0);
    p.fill(128);
    p.rect(50, 50, 50, 50);
  }
  p.draw = function () {

  }

  p.mouseClicked = function () {

    //clear arrays
    colPoints = [];
    points = [];

    EdgeDetector.extractPoints(colPoints, sourceImage, parseInt(p.mouseX * 4), 1 + parseInt(p.mouseY / 20));

    for (let i = 0; i < colPoints.length; i++) {
      let v = colPoints[i];
      points.push([parseInt(v[0]), parseInt(v[1])]);
    }

    var aDelaunay = Delaunay.from(points);

    const bounds = [0, 0, 800, 800];

    var aVoronoi = aDelaunay.voronoi(bounds);

    for (let i = 0; i < colPoints.length; i++) {

      var vorColor = colPoints[i][2];
      p.fill(vorColor[0], vorColor[1], vorColor[2]);
      p.stroke(vorColor[0], vorColor[1], vorColor[2]);

      let cellPoly = aVoronoi.cellPolygon(i);

      drawPolygon(cellPoly);

    }

    //p.background(0);

    const strideVP = 5;
    p.noStroke();

    //loop to create voronoi for each pixel
    for (let y = 0; y < p.height; y += strideVP) {
      for (let x = 0; x < p.width; x += strideVP) {

        let insertedPoints = points.slice();
        insertedPoints.push([x, y]);
        let insertedDelaunay = Delaunay.from(insertedPoints);

        //could be speeded up by reducing bounds?
        let insertedVoronoi = insertedDelaunay.voronoi(bounds);

        let insertedPoly = insertedVoronoi.cellPolygon(insertedPoints.length - 1);

        //If new inserted polygon array is null or undefined, get poly by index to original delaunay cell for this point
        if (insertedPoly) {

          if (typeof insertedPoly[0][0] == 'undefined') {
            insertedPoly = insertedVoronoi.cellPolygon(aDelaunay.find(x, y));
          }
        } else {
          insertedPoly = insertedVoronoi.cellPolygon(aDelaunay.find(x, y));
        }

        const insertedPolyArea = (polygon.area(insertedPoly));

        if ((x == 400) && (y == 400)) {
          console.log(`insertedPolyArea:`);
          console.log(insertedPolyArea);
        }

        let weightedColor = [0, 0, 0];
        let relativeWeight = 0;
        let totalWeight = 0;

        for (let n of insertedVoronoi.neighbors(insertedPoints.length - 1)) {

          let neighborPoly = aVoronoi.cellPolygon(n);

          if ((x == 400) && (y == 400)) {
            console.log(`n:`);
            console.log(n);
            console.log(`neighborPoly:`);
            console.log(neighborPoly);
          }

          let neighborColor = colPoints[n][2];

          let intersectionPoly;
          let intersectionArea = 0;
          const intersectionPolyArray = polygon.intersection(insertedPoly, neighborPoly);

          if (intersectionPolyArray) {
            if (intersectionPolyArray[0]) {
              intersectionPoly = intersectionPolyArray[0];
              intersectionArea = polygon.area(intersectionPoly);
              if ((x == 400) && (y == 400)) {
                console.log(`intersectionPoly: `);
                console.log(intersectionPoly);
              }
            }
          }
          relativeWeight = intersectionArea / insertedPolyArea;

          if ((x == 400) && (y == 400)) {
            console.log(`intersectionArea: `);
            console.log(intersectionArea);
            console.log(`relativeWeight: `);
            console.log(relativeWeight);
          }

          weightedColor[0] = weightedColor[0] + (neighborColor[0] * relativeWeight);
          weightedColor[1] = weightedColor[1] + (neighborColor[1] * relativeWeight);
          weightedColor[2] = weightedColor[2] + (neighborColor[2] * relativeWeight);

          totalWeight += relativeWeight;

          //check polygon array isn't null or undefined
          if (intersectionPoly) {
            if (intersectionPoly[0]) {
              if (intersectionPoly[0][0]) {
                //console.log(`intersectionPoly[0][0]: `);
                //console.log(intersectionPoly[0][0]);
                //p.stroke(255, 0, 0, 128);
                //p.fill(neighborColor[0], neighborColor[1], neighborColor[2]);
                //drawPolygon(intersectionPoly);
              }
            }
          }


        }

        if ((x == 400) && (y == 400)) {
          console.log(`totalWeight :`);
          console.log(totalWeight);
          console.log(`weightedColor:`);
          console.log(weightedColor);

        }

        p.noStroke(0, 0, 255);
        p.fill(weightedColor[0], weightedColor[1], weightedColor[2]);
        drawPolygon(insertedPoly);

/* 
        const dt = p.pixelDensity();
        for (let i = 0; i < dt; i++) {
          for (let j = 0; j < dt; j++) {
            // loop over
            let pixIndex = 4 * ((y * dt + j) * p.width * dt + (x * dt + i));
            p.pixels[pixIndex] = foundColor[0]; //r
            p.pixels[pixIndex + 1] = foundColor[1]; //g
            p.pixels[pixIndex + 2] = foundColor[2]; //b
            p.pixels[pixIndex + 3] = 255; //a
          }
        } */

      }
    }

  }

  //Sobel/Scharr Edge Detector

  let EdgeDetector = {

    extractPoints: function (colPoints, img, threshold, stride) {

      console.log("threshold:" + threshold);
      console.log("stride:" + stride);

      var colR = 0;
      var colG = 0;
      var colB = 0;
      var colGrey = 0;

      var colSum = 0;
      const W = img.width - 1;
      const H = img.height - 1;

      const kernel = [
        [6, 10, 0],
        [10, 0, -10],
        [0, -10, -6]

      ];

      img.loadPixels();

      for (let Y = 1; Y < H; Y += stride) {
        for (let X = 1; X < W; X += stride) {

          for (let y = -1; y <= 1; y++) {
            for (let x = -1; x <= 1; x++) {

              colR = img.pixels[4 * (((Y + y) * img.width) + (X + x))];
              colG = img.pixels[4 * (((Y + y) * img.width) + (X + x)) + 1];
              colB = img.pixels[4 * (((Y + y) * img.width) + (X + x)) + 2];
              colGrey = colR + colG + colB;
              colSum += kernel[x + 1][y + 1] * colGrey;
            }
          }
          if (Math.abs(colSum) > threshold) {

            colR = img.pixels[4 * ((Y * img.width) + X)];
            colG = img.pixels[4 * ((Y * img.width) + X) + 1];
            colB = img.pixels[4 * ((Y * img.width) + X) + 2];
            colPoints.push([X, Y, [colR, colG, colB]]);
          }
          colSum = 0;
        }
      }

      //console.log('colpoints is: ' + colPoints);

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


};

new p5(sketch, containerElement);