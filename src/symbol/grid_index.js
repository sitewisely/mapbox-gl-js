// @flow

/**
 * GridIndex is a data structure for testing the intersection of
 * circles and rectangles in a 2d plane.
 * It is optimized for rapid insertion and querying.
 * GridIndex splits the plane into a set of "cells" and keeps track
 * of which geometries intersect with each cell. At query time,
 * full geometry comparisons are only done for items that share
 * at least one cell. As long as the geometries are relatively
 * uniformly distributed across the plane, this greatly reduces
 * the number of comparisons necessary.
 *
 * @private
 */
class GridIndex {
    circleKeys: Array<any>;
    boxKeys: Array<any>;
    boxCells: Array<Array<number>>;
    circleCells: Array<Array<number>>;
    bboxes: Array<number>;
    circles: Array<number>;
    n: number;
    width: number;
    height: number;
    xScale: number;
    yScale: number;
    boxUid: number;
    circleUid: number;

    constructor (width: number, height: number, n: number) {
        const boxCells = this.boxCells = [];
        const circleCells = this.circleCells = [];

        for (let i = 0; i < n * n; i++) {
            boxCells.push([]);
            circleCells.push([]);
        }
        this.circleKeys = [];
        this.boxKeys = [];
        this.bboxes = [];
        this.circles = [];

        this.n = n;
        this.width = width;
        this.height = height;
        this.xScale = n / width;
        this.yScale = n / height;
        this.boxUid = 0;
        this.circleUid = 0;
    }

    keysLength() {
        return this.boxKeys.length + this.circleKeys.length;
    }

    insert(key: any, x1: number, y1: number, x2: number, y2: number) {
        this._forEachCell(x1, y1, x2, y2, this._insertBoxCell, this.boxUid++);
        this.boxKeys.push(key);
        this.bboxes.push(x1);
        this.bboxes.push(y1);
        this.bboxes.push(x2);
        this.bboxes.push(y2);
    }

    insertCircle(key: any, x: number, y: number, radius: number) {
        // Insert circle into grid for all cells in the circumscribing square
        // It's more than necessary (by a factor of 4/PI), but fast to insert
        this._forEachCell(x - radius, y - radius, x + radius, y + radius, this._insertCircleCell, this.circleUid++);
        this.circleKeys.push(key);
        this.circles.push(x);
        this.circles.push(y);
        this.circles.push(radius);
    }

    _insertBoxCell(x1: number, y1: number, x2: number, y2: number, cellIndex: number, uid: number) {
        this.boxCells[cellIndex].push(uid);
    }

    _insertCircleCell(x1: number, y1: number, x2: number, y2: number, cellIndex: number, uid: number)  {
        this.circleCells[cellIndex].push(uid);
    }

    _query(x1: number, y1: number, x2: number, y2: number, hitTest: boolean) {
        if (x2 < 0 || x1 > this.width || y2 < 0 || y1 > this.height) {
            return hitTest ? false : [];
        }
        let result = [];
        if (x1 <= 0 && y1 <= 0 && this.width <= x2 && this.height <= y2) {
            // We use `Array#slice` because `this.keys` may be a `Int32Array` and
            // some browsers (Safari and IE) do not support `TypedArray#slice`
            // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/slice#Browser_compatibility
            result = Array.prototype.slice.call(this.boxKeys).concat(this.circleKeys);
        } else {
            const queryArgs = {
                hitTest,
                seenUids: { box: {}, circle: {} }
            };
            this._forEachCell(x1, y1, x2, y2, this._queryCell, result, queryArgs);
        }
        return hitTest ? result.length > 0 : result;
    }

    _queryCircle(x: number, y: number, radius: number, hitTest: boolean) {
        // Insert circle into grid for all cells in the circumscribing square
        // It's more than necessary (by a factor of 4/PI), but fast to insert
        const x1 = x - radius;
        const x2 = x + radius;
        const y1 = y - radius;
        const y2 = y + radius;
        if (x2 < 0 || x1 > this.width || y2 < 0 || y1 > this.height) {
            return hitTest ? false : [];
        }

        // Box query early exits if the bounding box is larger than the grid, but we don't do
        // the equivalent calculation for circle queries because early exit is less likely
        // and the calculation is more expensive
        const result = [];
        const queryArgs = {
            hitTest,
            circle: { x: x, y: y, radius: radius },
            seenUids: { box: {}, circle: {} }
        };
        this._forEachCell(x1, y1, x2, y2, this._queryCellCircle, result, queryArgs);
        return hitTest ? result.length > 0 : result;
    }

    query(x1: number, y1: number, x2: number, y2: number): Array<any> {
        return (this._query(x1, y1, x2, y2, false): any);
    }

    hitTest(x1: number, y1: number, x2: number, y2: number): boolean  {
        return (this._query(x1, y1, x2, y2, true): any);
    }

    hitTestCircle(x: number, y: number, radius: number): boolean {
        return (this._queryCircle(x, y, radius, true): any);
    }

    _queryCell(x1: number, y1: number, x2: number, y2: number, cellIndex: number, result: any, queryArgs: any) {
        const seenUids = queryArgs.seenUids;
        const boxCell = this.boxCells[cellIndex];
        if (boxCell !== null) {
            const bboxes = this.bboxes;
            for (const boxUid of boxCell) {
                if (!seenUids.box[boxUid]) {
                    seenUids.box[boxUid] = true;
                    const offset = boxUid * 4;
                    if ((x1 <= bboxes[offset + 2]) &&
                        (y1 <= bboxes[offset + 3]) &&
                        (x2 >= bboxes[offset + 0]) &&
                        (y2 >= bboxes[offset + 1])) {
                        if (queryArgs.hitTest) {
                            result.push(true);
                            return true;
                        } else {
                            result.push(this.boxKeys[boxUid]);
                        }
                    }
                }
            }
        }
        const circleCell = this.circleCells[cellIndex];
        if (circleCell !== null) {
            const circles = this.circles;
            for (const circleUid of circleCell) {
                if (!seenUids.circle[circleUid]) {
                    seenUids.circle[circleUid] = true;
                    const offset = circleUid * 3;
                    if (this._circleAndRectCollide(
                        circles[offset],
                        circles[offset + 1],
                        circles[offset + 2],
                        x1,
                        y1,
                        x2,
                        y2)) {
                        if (queryArgs.hitTest) {
                            result.push(true);
                            return true;
                        } else {
                            result.push(this.circleKeys[circleUid]);
                        }
                    }
                }
            }
        }
    }

    _queryCellCircle(x1: number, y1: number, x2: number, y2: number, cellIndex: number, result: any, queryArgs: any) {
        const circle = queryArgs.circle;
        const seenUids = queryArgs.seenUids;
        const boxCell = this.boxCells[cellIndex];
        if (boxCell !== null) {
            const bboxes = this.bboxes;
            for (const boxUid of boxCell) {
                if (!seenUids.box[boxUid]) {
                    seenUids.box[boxUid] = true;
                    const offset = boxUid * 4;
                    if (this._circleAndRectCollide(
                        circle.x,
                        circle.y,
                        circle.radius,
                        bboxes[offset + 0],
                        bboxes[offset + 1],
                        bboxes[offset + 2],
                        bboxes[offset + 3])) {
                        result.push(true);
                        return true;
                    }
                }
            }
        }

        const circleCell = this.circleCells[cellIndex];
        if (circleCell !== null) {
            const circles = this.circles;
            for (const circleUid of circleCell) {
                if (!seenUids.circle[circleUid]) {
                    seenUids.circle[circleUid] = true;
                    const offset = circleUid * 3;
                    if (this._circlesCollide(
                        circles[offset],
                        circles[offset + 1],
                        circles[offset + 2],
                        circle.x,
                        circle.y,
                        circle.radius)) {
                        result.push(true);
                        return true;
                    }
                }
            }
        }
    }

    _forEachCell(x1: number, y1: number, x2: number, y2: number, fn: any, arg1: any, arg2?: any) {
        const cx1 = this._convertToXCellCoord(x1);
        const cy1 = this._convertToYCellCoord(y1);
        const cx2 = this._convertToXCellCoord(x2);
        const cy2 = this._convertToYCellCoord(y2);

        for (let x = cx1; x <= cx2; x++) {
            for (let y = cy1; y <= cy2; y++) {
                const cellIndex = this.n * y + x;
                if (fn.call(this, x1, y1, x2, y2, cellIndex, arg1, arg2)) return;
            }
        }
    }

    _convertToXCellCoord(x: number) {
        return Math.max(0, Math.min(this.n - 1, Math.floor(x * this.xScale)));
    }

    _convertToYCellCoord(y: number) {
        return Math.max(0, Math.min(this.n - 1, Math.floor(y * this.yScale)));
    }

    _circlesCollide(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number): boolean {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const bothRadii = r1 + r2;
        return (bothRadii * bothRadii) > (dx * dx + dy * dy);
    }

    _circleAndRectCollide(circleX: number, circleY: number, radius: number, x1: number, y1: number, x2: number, y2: number): boolean {
        const halfRectWidth = (x2 - x1) / 2;
        const distX = Math.abs(circleX - (x1 + halfRectWidth));
        if (distX > (halfRectWidth + radius)) {
            return false;
        }

        const halfRectHeight = (y2 - y1) / 2;
        const distY = Math.abs(circleY - (y1 + halfRectHeight));
        if (distY > (halfRectHeight + radius)) {
            return false;
        }

        if (distX <= halfRectWidth || distY <= halfRectHeight) {
            return true;
        }

        const dx = distX - halfRectWidth;
        const dy = distY - halfRectHeight;
        return (dx * dx + dy * dy <= (radius * radius));
    }
}

module.exports = GridIndex;
