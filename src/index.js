import * as p5 from './libraries/p5.js';
import {
  Delaunay
} from "d3-delaunay";
import {
  polygon
} from 'polygon-tools';
import {findPoints} from './pointfinder.js';
import {makeImageLinear, sRGBtoLinear, linearTosRGB} from './linlogimageconvert.js';


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
    linearImage = [];

    let copiedImage = [];
    sourceImage.loadPixels();
    for(let px = 0; px < (sourceImage.width * sourceImage.height * 4); px++){
      copiedImage.push(sourceImage.pixels[px]);
    }
    
    if (!imageMadeLinear){
      linearImage = makeImageLinear(copiedImage, sourceImage.width, sourceImage.height);
      imageMadeLinear = true;
    }
 

    colPoints = findPoints(linearImage, sourceImage.width, sourceImage.height, parseInt(p.mouseX * 4), 1 + parseInt(p.mouseY / 20));

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

    
    }
    p.updatePixels();


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