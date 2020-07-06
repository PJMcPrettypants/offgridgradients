import {
    logToLin,
    linToLog
  } from 'srgb-logarithmic-and-linear-colour-conversion';

function makeImageLinear(sRGBImage, width, height){
    let makelinearImage =[];
    for (let y = 0; y < height; y ++) {
      for (let x = 0; x < width; x ++) {
        let pixIndex =  4 * ((y * width) + x);
        let linearColor = sRGBtoLinear([sRGBImage[pixIndex], sRGBImage[pixIndex + 1], sRGBImage[pixIndex + 2]]);
        makelinearImage[pixIndex] = linearColor[0]; //r
        makelinearImage[pixIndex + 1] = linearColor[1]; //g
        makelinearImage[pixIndex + 2] = linearColor[2]; //b
      }
    }
    return makelinearImage;
  }

function sRGBtoLinear(sRGBArray) {
    let linearArray = [];
    for (let s8bit of sRGBArray) {
      let linear = logToLin(s8bit);
      linearArray.push(linear);
    }
    return linearArray;
  }
  
  function linearTosRGB(linearArray) {
    let sRGBArray = [];
    for (let linear of linearArray) {
      let s8bit = linToLog(linear);
      sRGBArray.push(s8bit);
    }
    return sRGBArray;
  }


  export {makeImageLinear, sRGBtoLinear,linearTosRGB};