function findPoints(img, imgWidth, imgHeight, threshold, sampleRate, jitter) {
    //Sobel/Scharr Edge Detector

    const stride = 1;

    console.log("pointfinder");

    console.log("Threshold: " + threshold);
    console.log("Stride: " + stride);
    console.log("Sample Probability: " + sampleRate);

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

            if (Math.random() < (1.0 / sampleRate)) {

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

                    //add jitter to keep it from forming a grid in detailed areas
                    const jitteredX = X + ( jitter * (Math.random() - 0.5) );
                    const jitteredY = Y + ( jitter * (Math.random() - 0.5) );

                    extractedColPoints.push([jitteredX, jitteredY, [colR, colG, colB]]);
                }
                colSum = 0;

            }
        }

    }

    return extractedColPoints;

}

export {
    findPoints
};