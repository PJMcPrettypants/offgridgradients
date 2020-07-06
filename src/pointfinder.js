function findPoints(img, imgWidth, imgHeight, threshold, stride) {
    //Sobel/Scharr Edge Detector

    console.log("pointfinder");

    console.log("Threshold: " + threshold);
    console.log("Stride: " + stride);

    let colR = 0;
    let colG = 0;
    let colB = 0;
    let colGrey = 0;

    let colSum = 0;
    const W = imgWidth - 1;
    const H = imgHeight - 1;
    let extractedColPoints = [];

    const kernel = [
        [6, 10, 0],
        [10, 0, -10],
        [0, -10, -6]
    ];

    for (let Y = 1; Y < H; Y += stride) {
        for (let X = 1; X < W; X += stride) {

            for (let y = -1; y <= 1; y++) {
                for (let x = -1; x <= 1; x++) {

                    colR = img[4 * (((Y + y) * imgWidth) + (X + x))];
                    colG = img[4 * (((Y + y) * imgWidth) + (X + x)) + 1];
                    colB = img[4 * (((Y + y) * imgWidth) + (X + x)) + 2];
                    colGrey = 255 * (colR + colG + colB);
                    colSum += kernel[x + 1][y + 1] * colGrey;
                }
            }
            if (Math.abs(colSum) > threshold) {

                colR = img[4 * ((Y * imgWidth) + X)];
                colG = img[4 * ((Y * imgWidth) + X) + 1];
                colB = img[4 * ((Y * imgWidth) + X) + 2];
                extractedColPoints.push([X, Y, [colR, colG, colB]]);
            }
            colSum = 0;
        }
    }

    return extractedColPoints;

}

export {findPoints};