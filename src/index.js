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

    EdgeDetector.extractPoints(colPoints, sourceImage, p.mouseX, 1 + parseInt(p.mouseY / 10));

    for (let i = 0; i < colPoints.length; i++) {
      let v = colPoints[i];
      points.push([parseInt(v[0]), parseInt(v[1])]);
    }

    var adelaunay = Delaunay.from(points);

    var triangles = adelaunay.triangles;

    const bounds = [0, 0, 800, 800];

    var avoronoi = adelaunay.voronoi(bounds);

    p.background(200);

    p.noStroke();

    for (let t = 0; t < triangles.length; t += 3) {

      var p0 = [adelaunay.points[triangles[t] * 2], adelaunay.points[(triangles[t] * 2) + 1]];
      var p1 = [adelaunay.points[triangles[t + 1] * 2], adelaunay.points[(triangles[t + 1] * 2) + 1]];
      var p2 = [adelaunay.points[triangles[t + 2] * 2], adelaunay.points[(triangles[t + 2] * 2) + 1]];

      //just uses colour from first vertex
      var triFill = colPoints[triangles[t]][2];

      p.fill(triFill[0], triFill[1], triFill[2]);
      p.triangle(p0[0], p0[1], p1[0], p1[1], p2[0], p2[1]);

    }

    for (let g of avoronoi.cellPolygons()) {

      p.stroke(255);
      p.noFill();
      p.beginShape();

      for (let n of g) {
        p.vertex((n)[0], (n)[1]);
      }

      p.endShape();

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

      //console.log(`colpoints is: ${colPoints}`);
      console.log('colpoints is: ' + colPoints);

    }

  }

};

new p5(sketch, containerElement);