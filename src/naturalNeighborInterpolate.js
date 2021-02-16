import {
    Delaunay
} from 'd3-delaunay';
import {
    polygon
} from 'polygon-tools';



export function naturalNeighborInterpolate(x, y, colPoints, points, aDelaunay, bounds, 
    cache = {
        miniIndexes : [],
        insertedDelaunay : {},
        insertedVoronoi : {},
        prevFound : 0,
        voronoiAreas : []
      }
    ) {

    const NNDebug = false;

    let miniIndexesBefore = cache.miniIndexes.length; //might not be needed?

    //if there's already a mini Delaunay, try updating insertedVoronoi to check for new Neighbours
    if (miniIndexesBefore > 0) {
        if (NNDebug) console.log(`tried update`);

        cache.insertedDelaunay.points[cache.insertedDelaunay.points.length - 2] = x;
        cache.insertedDelaunay.points[cache.insertedDelaunay.points.length - 1] = y;
        cache.insertedVoronoi.update();
        addNeighborsNeighbors(cache.insertedDelaunay, aDelaunay, cache.miniIndexes, NNDebug);
    } else if (NNDebug) console.log(`didn't try update`);

    //if there are new neighbours, OR no mini Delaunay, start a new mini Delaunay
    if ((cache.miniIndexes.length > miniIndexesBefore) || (miniIndexesBefore < 1)) {
        if (NNDebug) console.log(`didn't skip new Delaunay`)

        cache.miniIndexes = [];
        let foundMiniCell = aDelaunay.find(x, y, cache.prevFound);
        cache.prevFound = foundMiniCell;
        cache.miniIndexes.push(foundMiniCell);
        for (let n of aDelaunay.neighbors(foundMiniCell)) {
            cache.miniIndexes.push(n);
        }

        miniIndexesBefore = cache.miniIndexes.length;
        if (NNDebug) console.log(`about to enter do while loop`);
        do {
            miniIndexesBefore = cache.miniIndexes.length;
            //make mini Voronoi, taking point co-ordinates from main Voronoi plus new inserted point x,y
            let NNPoints = [];
            for (let c of cache.miniIndexes) {
                NNPoints.push(points[c]);
            }
            NNPoints.push([x, y]);
            cache.insertedDelaunay = Delaunay.from(NNPoints);

            addNeighborsNeighbors();

        } while (cache.miniIndexes.length > miniIndexesBefore); //loop if new neighbor's neighbors added
        //If the newly added neighbor's neighbors also turn out to be 1st degree neighbors of inserted cell
        //then their neighbors will be added on the next loop, until no new neighbor's neighbors can be found
        if (NNDebug) console.log(`done do while loop`);

        cache.insertedVoronoi = cache.insertedDelaunay.voronoi(bounds);
        let miniPoints = [];
        cache.voronoiAreas = [];
        for (let c of cache.miniIndexes) {
            miniPoints.push(points[c]);
        }
        let miniDelaunay = Delaunay.from(miniPoints);
        let miniVoronoi = miniDelaunay.voronoi(bounds);
        for (let i = 0; i < miniPoints.length; i++) {
            let miniPolyVor = miniVoronoi.cellPolygon(i);
            miniPolyVor.pop();
            let miniPolyVorArea = polygon.area(miniPolyVor);
            cache.voronoiAreas.push(miniPolyVorArea);
        }

    } else if (NNDebug) console.log(`skipped new Delaunay`);

    let insertedPoly = cache.insertedVoronoi.cellPolygon(cache.miniIndexes.length);

    if (NNDebug) console.log(`insertedPoly:`);
    if (NNDebug) console.log(insertedPoly);

    let insertionFailed = false;

    //If new inserted polygon array is null or undefined, log it
    //formerly got poly by index to original delaunay cell for this point
    if (insertedPoly) {
        if (typeof insertedPoly[0][0] == 'undefined') {
            console.log('undefined');
        }
    } else {
        if (NNDebug) console.log('!insertedPoly');
    }

    insertedPoly.pop(); //remove duplicate vertex

    if (!insertedPoly) console.log(`no inserted poly`);

    const insertedPolyArea = (polygon.area(insertedPoly));

    let weightedColor = [0, 0, 0];
    let totalWeight = 0;

    if (NNDebug) console.log('Neighbor loop ahead...');

    for (let n of cache.insertedDelaunay.neighbors(cache.miniIndexes.length)) {

        if (NNDebug) console.log('Neighbor loop starting');

        if (NNDebug) console.log(`n: `);
        if (NNDebug) console.log(n);

        let neighborPolyAfter = cache.insertedVoronoi.cellPolygon(n);

        let neighborBeforeArea = cache.voronoiAreas[n];

        if (NNDebug) console.log('   neighborBeforeArea: ' + neighborBeforeArea);

        let intersectionArea = 0;

        if (neighborPolyAfter) {
            neighborPolyAfter.pop();
            //faster to compare areas of the reduced polygons in cache.insertedDelaunay with original versions, rather than intersect
            intersectionArea = neighborBeforeArea - polygon.area(neighborPolyAfter);
        }


        if (!neighborPolyAfter) {
            console.log(`no neighborPolyAfter at neighbor ` + n + ` of ` + x + `,` + y + ` , should be at ` + points[n]);
        }

        if (NNDebug) console.log(`insertedPoly: `);
        if (NNDebug) console.log(insertedPoly);
        //if (NNDebug) drawPolygon(insertedPoly);
        if (NNDebug) console.log('intersectionArea');

        if (intersectionArea > 0) {
            let relativeWeight = intersectionArea / insertedPolyArea;
            //n is the neighbor's index in insertedVoronoi, cache.miniIndexes[n] has the index to original colPoints
            let neighborColor = colPoints[cache.miniIndexes[n]][2];
            weightedColor[0] = weightedColor[0] + (neighborColor[0] * relativeWeight);
            weightedColor[1] = weightedColor[1] + (neighborColor[1] * relativeWeight);
            weightedColor[2] = weightedColor[2] + (neighborColor[2] * relativeWeight);

            totalWeight = totalWeight + relativeWeight;

        }

        if (NNDebug) console.log('Neighbor loop ending');

    }

    if (NNDebug) console.log('Done neighbor loop');

    //if the inserted cell is the same as the original cell, or something else goes wrong, it won't overlap with its neighbors

    if (totalWeight < 1.0) {
        const remainingWeight = Math.min(Math.max((1.0 - totalWeight), 0.0), 1.0);
        let foundCell = aDelaunay.find(x, y, cache.prevFound);
        const originalCellColor = colPoints[foundCell][2];
        cache.prevFound = foundCell;

        weightedColor[0] = weightedColor[0] + (originalCellColor[0] * remainingWeight);
        weightedColor[1] = weightedColor[1] + (originalCellColor[1] * remainingWeight);
        weightedColor[2] = weightedColor[2] + (originalCellColor[2] * remainingWeight);
    }

    if (NNDebug) {
        if (totalWeight < 0.9) {
            console.log(`position: ` + x + `, ` + y);
            console.log(`insertionFailed:`);
            console.log(insertionFailed);
            console.log(`insertedPolyArea:`);
            console.log(insertedPolyArea);
            console.log(`totalWeight:`);
            console.log(totalWeight);

        }
    }


    return weightedColor;

    function addNeighborsNeighbors() {

        if (NNDebug) logInsertedDelaunay();
        //find neighboring cells of inserted cell in cache.insertedDelaunay
        for (let n of cache.insertedDelaunay.neighbors(cache.miniIndexes.length)) {
            // and add all the neighbor's neighbors from main voronoi to miniIndexes
            for (let nn of aDelaunay.neighbors(cache.miniIndexes[n])) {
                //...if they haven't been included already
                if (!cache.miniIndexes.includes(nn)) {
                    cache.miniIndexes.push(nn);
                }
            }
        }
    }

    function logInsertedDelaunay() {
        console.log(`aDelaunay.points:`);
        console.log(aDelaunay.points);
        console.log(`miniIndexes :`);
        console.log(cache.miniIndexes);
        console.log(`cache.insertedDelaunay.points:`);
        console.log(cache.insertedDelaunay.points);
    }

}


// export {
//     naturalNeighborInterpolate,
//     logInsertedDelaunay
// };