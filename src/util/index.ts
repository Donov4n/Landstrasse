// @author Crossbar.io Technologies GmbH and contributors
// @see https://github.com/crossbario/autobahn-js/blob/v20.9.2/packages/autobahn/lib/util.js#L92
export const normalRand = (mean: number, sd: number): number => {
    // Derive a Gaussian from Uniform random variables
    // http://en.wikipedia.org/wiki/Box%E2%80%93Muller_transform
    let x1, x2, rad;
    do {
       x1 = 2 * Math.random() - 1;
       x2 = 2 * Math.random() - 1;
       rad = x1 * x1 + x2 * x2;
    } while (rad >= 1 || rad == 0);

    const c = Math.sqrt(-2 * Math.log(rad) / rad);
    return (mean || 0) + (x1 * c) * (sd || 1);
};
