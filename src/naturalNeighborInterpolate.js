import {
    Delaunay
} from 'd3-delaunay';
import {
    polygon
} from 'polygon-tools';

function naturalNeighborInterpolate(x, y, miniIndexes, colPoints, points, aDelaunay, insertedDelaunay, insertedVoronoi, voronoiAreas, vorDebug, prevFound, bounds) {

    let oldMiniIndexes = miniIndexes.slice();
    let miniIndexesBefore = miniIndexes.length; //might not be needed?

    //if there's already a mini Delaunay, try updating insertedVoronoi to check for new Neighbours
    if (miniIndexesBefore > 0) {
        if (vorDebug) console.log(`tried update`);

        insertedDelaunay.points[insertedDelaunay.points.length - 2] = x;
        insertedDelaunay.points[insertedDelaunay.points.length - 1] = y;
        insertedVoronoi.update();
        addNeighborsNeighbors(insertedDelaunay, aDelaunay, miniIndexes, vorDebug);
    } else if (vorDebug) console.log(`didn't try update`);

    //if there are new neighbours, OR no mini Delaunay, start a new mini Delaunay
    if ((miniIndexes.length > miniIndexesBefore) || (miniIndexesBefore < 1)) {
        if (vorDebug) console.log(`didn't skip new Delaunay`)

        miniIndexes = [];
        let foundMiniCell = aDelaunay.find(x, y, prevFound);
        prevFound = foundMiniCell;
        miniIndexes.push(foundMiniCell);
        for (let n of aDelaunay.neighbors(foundMiniCell)) {
            miniIndexes.push(n);
        }

        miniIndexesBefore = miniIndexes.length;
        if (vorDebug) console.log(`about to enter do while loop`);
        do {
            miniIndexesBefore = miniIndexes.length;
            //make mini Voronoi, taking point co-ordinates from main Voronoi plus new inserted point x,y
            let NNPoints = [];
            for (let c of miniIndexes) {
                NNPoints.push(points[c]);
            }
            NNPoints.push([x, y]);
            insertedDelaunay = Delaunay.from(NNPoints);

            addNeighborsNeighbors(insertedDelaunay, aDelaunay, miniIndexes, vorDebug);

        } while (miniIndexes.length > miniIndexesBefore); //loop if new neighbor's neighbors added
        //If the newly added neighbor's neighbors also turn out to be 1st degree neighbors of inserted cell
        //then their neighbors will be added on the next loop, until no new neighbor's neighbors can be found
        if (vorDebug) console.log(`done do while loop`);

        insertedVoronoi = insertedDelaunay.voronoi(bounds);
        let miniPoints = [];
        voronoiAreas = [];
        for (let c of miniIndexes) {
            miniPoints.push(points[c]);
        }
        let miniDelaunay = Delaunay.from(miniPoints);
        let miniVoronoi = miniDelaunay.voronoi(bounds);
        for (let i = 0; i < miniPoints.length; i++) {
            let miniPolyVor = miniVoronoi.cellPolygon(i);
            miniPolyVor.pop();
            let miniPolyVorArea = polygon.area(miniPolyVor);
            voronoiAreas.push(miniPolyVorArea);
        }

    } else if (vorDebug) console.log(`skipped new Delaunay`);

    let insertedPoly = insertedVoronoi.cellPolygon(miniIndexes.length);

    if (vorDebug) console.log(`insertedPoly:`);
    if (vorDebug) console.log(insertedPoly);

    let insertionFailed = false;

    //If new inserted polygon array is null or undefined, log it
    //formerly got poly by index to original delaunay cell for this point
    if (insertedPoly) {
        if (typeof insertedPoly[0][0] == 'undefined') {
            console.log('undefined');
        }
    } else {
        if (vorDebug) console.log('!insertedPoly');
    }

    insertedPoly.pop(); //remove duplicate vertex

    if (!insertedPoly) console.log(`no inserted poly`);

    const insertedPolyArea = (polygon.area(insertedPoly));

    let weightedColor = [0, 0, 0];
    let totalWeight = 0;

    if (vorDebug) console.log('Neighbor loop ahead...');

    for (let n of insertedDelaunay.neighbors(miniIndexes.length)) {

        if (vorDebug) console.log('Neighbor loop starting');

        if (vorDebug) console.log(`n: `);
        if (vorDebug) console.log(n);

        let neighborPolyAfter = insertedVoronoi.cellPolygon(n);

        let neighborBeforeArea = voronoiAreas[n];

        if (vorDebug) console.log('oldNeighborBeforeArea: ' + oldNeighborBeforeArea);
        if (vorDebug) console.log('   neighborBeforeArea: ' + neighborBeforeArea);

        let intersectionArea = 0;

        if (neighborPolyAfter) {
            neighborPolyAfter.pop();
            //faster to compare areas of the reduced polygons in insertedDelaunay with original versions, rather than intersect
            intersectionArea = neighborBeforeArea - polygon.area(neighborPolyAfter);
        }


        if (!neighborPolyAfter) {
            console.log(`no neighborPolyAfter at neighbor ` + n + ` of ` + x + `,` + y + ` , should be at ` + points[n]);
        }

        if (vorDebug) console.log(`insertedPoly: `);
        if (vorDebug) console.log(insertedPoly);
        if (vorDebug) p.stroke(0, 0, 255);
        if (vorDebug) drawPolygon(insertedPoly);
        if (vorDebug) console.log('intersectionArea');

        if (intersectionArea > 0) {
            let relativeWeight = intersectionArea / insertedPolyArea;
            //n is the neighbor's index in insertedVoronoi, miniIndexes[n] has the index to original colPoints
            let neighborColor = colPoints[miniIndexes[n]][2];
            weightedColor[0] = weightedColor[0] + (neighborColor[0] * relativeWeight);
            weightedColor[1] = weightedColor[1] + (neighborColor[1] * relativeWeight);
            weightedColor[2] = weightedColor[2] + (neighborColor[2] * relativeWeight);

            totalWeight = totalWeight + relativeWeight;

        }

        if (vorDebug) console.log('Neighbor loop ending');

    }

    if (vorDebug) console.log('Done neighbor loop');

    //if the inserted cell is the same as the original cell, or something else goes wrong, it won't overlap with its neighbors

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


    return weightedColor;

}

function addNeighborsNeighbors(insertedDelaunay, aDelaunay, miniIndexes, vorDebug) {

    if (vorDebug) logInsertedDelaunay();
    //find neighboring cells of inserted cell in insertedDelaunay
    for (let n of insertedDelaunay.neighbors(miniIndexes.length)) {
        // and add all the neighbor's neighbors from main voronoi to miniIndexes
        for (let nn of aDelaunay.neighbors(miniIndexes[n])) {
            //...if they haven't been included already
            if (!miniIndexes.includes(nn)) {
                miniIndexes.push(nn);
            }
        }
    }
}

function logInsertedDelaunay(aDelaunay, insertedDelaunay, miniIndexes) {
    console.log(`aDelaunay.points:`);
    console.log(aDelaunay.points);
    console.log(`miniIndexes :`);
    console.log(miniIndexes);
    console.log(`insertedDelaunay.points:`);
    console.log(insertedDelaunay.points);
}

export {
    naturalNeighborInterpolate,
    addNeighborsNeighbors,
    logInsertedDelaunay
};