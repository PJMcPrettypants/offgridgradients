import * as p5 from './libraries/p5.js';
import {
  Delaunay
} from "d3-delaunay";

var sourceImage;

var colPoints = new Array();
var points = new Array();

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

    colPoints = [];
    points = [];

    EdgeDetector.extractPoints(colPoints, sourceImage, parseInt(p.mouseX * 4), 1 + parseInt(p.mouseY / 20));

    for (let i = 0; i < colPoints.length; i++) {
      let v = colPoints[i];
      points.push([parseInt(v[0]), parseInt(v[1])]);
    }

    var adelaunay = Delaunay.from(points);

    const bounds = [0, 0, 800, 800];

    var avoronoi = adelaunay.voronoi(bounds);

    for (let i = 0; i < colPoints.length; i++) {

      var vorColor = colPoints[i][2];
      p.fill(vorColor[0], vorColor[1], vorColor[2]);
      p.stroke(vorColor[0], vorColor[1], vorColor[2]);

      let cellPoly = avoronoi.cellPolygon(i);

      p.beginShape();

      for (let n of cellPoly) {
        p.vertex((n)[0], (n)[1]);
      }

      p.endShape();

    }

    p.background(0);

    p.loadPixels();

    const strideV = 1;
    var prevFound = 0;
    const dt = p.pixelDensity();

    var totalFindCellTime = 0;
    var totalGetColourTime = 0;
    var totalSetColourTime = 0;

    for (let y = 0; y < p.height; y += strideV) {
      for (let x = 0; x < p.width; x += strideV) {

        const t0 = performance.now();
        let foundCell = adelaunay.find(x, y, prevFound);
        const t1 = performance.now();
        totalFindCellTime += (t1 - t0);

        prevFound = foundCell;

        //ADD: if cell different from previous, get neighbours
        //work out distances to neighbours

        const t3 = performance.now();
        const foundColor = colPoints[foundCell][2];
        const t4 = performance.now();
        totalGetColourTime += (t4 - t3);

        const t5 = performance.now();

        for (let i = 0; i < dt; i++) {
          for (let j = 0; j < dt; j++) {
            // loop over
            let pixIndex = 4 * ((y * dt + j) * p.width * dt + (x * dt + i));
            p.pixels[pixIndex] = foundColor[0]; //r
            p.pixels[pixIndex + 1] = foundColor[1]; //g
            p.pixels[pixIndex + 2] = foundColor[2]; //b
            p.pixels[pixIndex + 3] = 255; //a
          }
        }


        const t6 = performance.now();
        totalSetColourTime += (t6 - t5);

      }
    }

    console.log(`Finding cells took ${totalFindCellTime} milliseconds.`);
    console.log(`Getting colours took ${totalGetColourTime} milliseconds.`);
    console.log(`Setting pixels took ${totalSetColourTime} milliseconds.`);

    p.updatePixels();




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

      //console.log(`colpoints is: ${colPoints}`);
      console.log('colpoints is: ' + colPoints);

    }

  }

};

new p5(sketch, containerElement);