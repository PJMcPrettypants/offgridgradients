import * as p5 from './libraries/p5.js';
import {
  Delaunay
} from "d3-delaunay";
import {
  polygon
} from 'polygon-tools';
import {
  logToLin,
  linToLog
} from 'srgb-logarithmic-and-linear-colour-conversion';


var sourceImage;

//colPoints is the most important array, it stores image data as point positions alongside corresponding colors [x,y,[r,g,b]] 
var colPoints = [];

//this is an array to store linear image data, as the p5.js image object stores 8 bit color
var linearImage = [];

//points array is the point positions only [x,y], extracted for feeding into d3-delaunay, but with indexes matching colPoints
var points = [];

const vorDebug = false;
var imageMadeLinear = false;

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

    const dt = p.pixelDensity();

    //clear arrays
    colPoints = [];
    points = [];
    var linearImage = [];

    if (!imageMadeLinear) makeImageLinear();

    EdgeDetector.extractPoints(colPoints, sourceImage, parseInt(p.mouseX * 4), 1 + parseInt(p.mouseY / 20));

    //makeLinearImagesRGB();

    //p.image(sourceImage, 0, 0);

    console.log(colPoints.length + " points");

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
      //p.stroke(vorColor[0], vorColor[1], vorColor[2]);
      p.stroke(255, 255, 0);

      let cellPoly = aVoronoi.cellPolygon(i);

      //drawPolygon(cellPoly);

    }

    //p.background(0);

    p.loadPixels();

    const strideVP = 1;
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

        for (let i = 0; i < dt; i++) {
          for (let j = 0; j < dt; j++) {
            // loop over
            let pixIndex = 4 * ((y * dt + j) * p.width * dt + (x * dt + i));

            p.pixels[pixIndex] = weightedColor[0]; //r
            p.pixels[pixIndex + 1] = weightedColor[1]; //g
            p.pixels[pixIndex + 2] = weightedColor[2]; //b
            //p.pixels[pixIndex + 3] = 255; //a
          }
        }

      }

      if (y % 10 == 0) p.updatePixels();
    }
    p.updatePixels();


  }

  //Sobel/Scharr Edge Detector

  let EdgeDetector = {

    extractPoints: function (colPoints, img, threshold, stride) {

      console.log("threshold:" + threshold);
      console.log("stride :" + stride);

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

        for (let Y = 1; Y < H; Y += stride) {
        for (let X = 1; X < W; X += stride) {

          for (let y = -1; y <= 1; y++) {
            for (let x = -1; x <= 1; x++) {

              colR = linearImage[4 * (((Y + y) * img.width) + (X + x))];
              colG = linearImage[4 * (((Y + y) * img.width) + (X + x)) + 1];
              colB = linearImage[4 * (((Y + y) * img.width) + (X + x)) + 2];
              //colGrey = colR + colG + colB;
              colGrey = 255 * (colR + colG + colB);
              colSum += kernel[x + 1][y + 1] * colGrey;
            }
          }
          if (Math.abs(colSum) > threshold) {

            colR = linearImage[4 * ((Y * img.width) + X)];
            colG = linearImage[4 * ((Y * img.width) + X) + 1];
            colB = linearImage[4 * ((Y * img.width) + X) + 2]; 
            colPoints.push([X, Y, [colR, colG, colB]]);
          }
          colSum = 0;
        }
      }

      //console.log('colpoints is: ' + colPoints);

    }



  }

  function makeImageLinear(){
    sourceImage.loadPixels();
    for (let y = 0; y < sourceImage.height; y ++) {
      for (let x = 0; x < sourceImage.width; x ++) {
        let pixIndex =  4 * ((y * sourceImage.width) + x);
        let linearColor = sRGBtoLinear([sourceImage.pixels[pixIndex], sourceImage.pixels[pixIndex + 1], sourceImage.pixels[pixIndex + 2]]);
        linearImage[pixIndex] = linearColor[0]; //r
        linearImage[pixIndex + 1] = linearColor[1]; //g
        linearImage[pixIndex + 2] = linearColor[2]; //b
      }
    }
    console.log("made linear image");
    imageMadeLinear = true;
  }

  function makeLinearImagesRGB(){
    sourceImage.loadPixels();
    for (let y = 0; y < sourceImage.height; y ++) {
      for (let x = 0; x < sourceImage.width; x ++) {
        let pixIndex =  4 * ((y * sourceImage.width) + x);
        let sRGBColor = linearTosRGB([sourceImage.pixels[pixIndex], sourceImage.pixels[pixIndex + 1], sourceImage.pixels[pixIndex + 2]]);
        sourceImage.pixels[pixIndex] = sRGBColor[0]; //r
        sourceImage.pixels[pixIndex + 1] = sRGBColor[1]; //g
        sourceImage.pixels[pixIndex + 2] = sRGBColor[2]; //b
      }
    }
    sourceImage.updatePixels();
    console.log("used lin to log");
    imageMadeLinear = true;
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


function sRGBtoLinear(sRGBArray) {
  let linearArray = [];
  for (let s8bit of sRGBArray) {
    let linear = logToLin(s8bit);
    // let linear;
    // let s = s8bit/255;
    // if (s <= 0.04045) linear = s / 12.92;
    // else linear = Math.pow((s + 0.055) / 1.055, 2.4);
    linearArray.push(linear);
  }
  return linearArray;
}

function linearTosRGB(linearArray) {
  let sRGBArray = [];
  for (let linear of linearArray) {
    let s8bit = linToLog(linear);
    // if (linear <= 0.0031308) s = linear * 12.92;
    // else s = 1.055 * Math.pow(linear, 1.0/2.4) - 0.055;
    // let s8bit = s * 255;
    sRGBArray.push(s8bit);
  }
  return sRGBArray;
}


new p5(sketch, containerElement);