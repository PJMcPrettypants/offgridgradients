import * as p5 from './libraries/p5.js';
import {
  Delaunay
} from "d3-delaunay";

var sourceImage;

var colPoints = [];
var points = [];
var vorCellPix = [];


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
    vorCellPix = [];



    EdgeDetector.extractPoints(colPoints, sourceImage, parseInt(p.mouseX * 4), 1 + parseInt(p.mouseY / 20));

    for (let i = 0; i < colPoints.length; i++) {
      let v = colPoints[i];
      points.push([parseInt(v[0]), parseInt(v[1])]);
    }

    //console.log('points is: ');
    //console.log(points);

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

    //p.background(0);

    //p.loadPixels();

    const strideVC = 1;
    var prevFound = 0;
    const dt = p.pixelDensity();

    var totalFindCellTime = 0;
    var totalGetColourTime = 0;
    var totalSetColourTime = 0;

    //loop to fill array with cell indices for each pixel
    for (let y = 0; y < p.height; y += strideVC) {
      for (let x = 0; x < p.width; x += strideVC) {

        const t0 = performance.now();
        let foundCell = adelaunay.find(x, y, prevFound);
        const t1 = performance.now();
        totalFindCellTime += (t1 - t0);

        prevFound = foundCell;

        vorCellPix.push(foundCell);

      }
    }

    const strideVP = 8;
    p.noStroke();

    //loop again to create voronoi for each pixel
    for (let y = 0; y < p.height; y += strideVP) {
      for (let x = 0; x < p.width; x += strideVP) {


        const t3 = performance.now();
        const pixIndex = ((y * p.width) + x);
        const foundColor = colPoints[vorCellPix[pixIndex]][2];
        const t4 = performance.now();
        totalGetColourTime += (t4 - t3);
        const t5 = performance.now();

        let insertedPoints = points.slice();
        insertedPoints.push([x, y]);
        let insertedDelaunay = Delaunay.from(insertedPoints);

        //could be speeded up by reducing bounds?
        let insertedVoronoi = insertedDelaunay.voronoi(bounds);

        let insertedPoly = insertedVoronoi.cellPolygon(insertedPoints.length - 1);

        //handle if polygon array is null
        if (insertedPoly) {  
          //handle if polygon array exists but is empty
          if (typeof insertedPoly[0][0] == 'undefined') {
            insertedPoly = insertedVoronoi.cellPolygon(vorCellPix[pixIndex]);
          }
        } else {
          insertedPoly = insertedVoronoi.cellPolygon(vorCellPix[pixIndex]);
        }





        //TODO
        //find area of insterted polygon
        //find neighbours
        //for each neighbour
        //find colour
        //find polygon
        //find intersection of polygon with inserted
        //find ratio of intersection
        //multiply ratio by each color component
        //add colour components to total



        p.fill(foundColor[0], foundColor[1], foundColor[2], 16);
        //p.stroke(foundColor[0], foundColor[1], foundColor[2]);


        p.beginShape();
        //console.log(`drawing inserted shape`);
        for (let n of insertedPoly) {
          p.vertex((n)[0], (n)[1]);
        }

        p.endShape();


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

    console.log(`Finding cells took ${totalFindCellTime} milliseconds`);
    console.log(`Getting colours took ${totalGetColourTime} milliseconds`);
    console.log(`Setting pixels took ${totalSetColourTime} milliseconds`);

    //p.updatePixels();




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

};

new p5(sketch, containerElement);