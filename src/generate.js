const PERMUTATION = [
    151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225,
    140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148,
    247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32,
    57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175,
    74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122,
    60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54,
    65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169,
    200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64,
    52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212,
    207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213,
    119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9,
    129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104,
    218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241,
    81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157,
    184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93,
    222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180
];
const P = [...PERMUTATION, ...PERMUTATION];
class Perlin {
    constructor(seed = 3000) {
        this._seedValue = Perlin.xorshift(seed);

        this.noise = this.noise.bind(this);
        this.setSeed = this.setSeed.bind(this);
    }

    static xorshift(value) {
        let x = value ^ (value >> 12);
        x = x ^ (x << 25);
        x = x ^ (x >> 27);
        return x * 2;
    }

    static lerp(t, a, b) {
        return a + t * (b - a);
    }

    static fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    static grad(hash, x, y, z) {
        var h = hash & 15,
            u = h < 8 ? x : y,
            v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    setSeed(seed = 3000) {
        this._seedValue = Perlin.xorshift(seed);
    }

    noise(a, b, c) {
        let x = a + this._seedValue;
        let y = b + this._seedValue;
        let z = c + this._seedValue;

        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;

        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);

        const u = Perlin.fade(x);
        const v = Perlin.fade(y);
        const w = Perlin.fade(z);

        const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z;
        const B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;

        return Perlin.lerp(w,
            Perlin.lerp(v,
                Perlin.lerp(u, Perlin.grad(P[AA], x, y, z), Perlin.grad(P[BA], x - 1, y, z)),
                Perlin.lerp(u, Perlin.grad(P[AB], x, y - 1, z), Perlin.grad(P[BB], x - 1, y - 1, z))
            ),
            Perlin.lerp(v,
                Perlin.lerp(u, Perlin.grad(P[AA + 1], x, y, z - 1), Perlin.grad(P[BA + 1], x - 1, y, z - 1)),
                Perlin.lerp(u, Perlin.grad(P[AB + 1], x, y - 1, z - 1), Perlin.grad(P[BB + 1], x - 1, y - 1, z - 1))
            )
        )
    }
}
class Worley {
    constructor(seed = 3000) {
        this._seedValue = seed;

        this.setSeed = this.setSeed.bind(this);
        this.noise = this.noise.bind(this);
        this.Euclidean = this.Euclidean.bind(this);
        this.Manhattan = this.Manhattan.bind(this);
    }

    static xorshift(value) {
        let x = value ^ (value >> 12);
        x = x ^ (x << 25);
        x = x ^ (x >> 27);
        return x * 2;
    }

    static hash(i, j, k) {
        return (((((2166136261 ^ i) * 16777619) ^ j) * 16777619) ^ k) * 16777619 & 0xffffffff;
    }

    static d(p1, p2) {
        return [p1.x - p2.x, p1.y - p2.y, p1.z - p2.z];
    }

    static EuclideanDistance(p1, p2) {
        return Worley.d(p1, p2).reduce((sum, x) => sum + (x * x), 0);
    }

    static ManhattanDistance(p1, p2) {
        return Worley.d(p1, p2).reduce((sum, x) => sum + Math.abs(x), 0)
    }

    static probLookup(value) {
        value = value & 0xffffffff;
        if (value < 393325350) return 1;
        if (value < 1022645910) return 2;
        if (value < 1861739990) return 3;
        if (value < 2700834071) return 4;
        if (value < 3372109335) return 5;
        if (value < 3819626178) return 6;
        if (value < 4075350088) return 7;
        if (value < 4203212043) return 8;
        return 9;
    }

    static insert(arr, value) {
        let temp;
        for (let i = arr.length - 1; i >= 0; i--) {
            if (value > arr[i]) break;
            temp = arr[i];
            arr[i] = value;
            if (i + 1 < arr.length) arr[i + 1] = temp;
        }
    }

    noise(input, distanceFunc) {
        let lastRandom,
            numberFeaturePoints,
            randomDiff = { x: 0, y: 0, z: 0 },
            featurePoint = { x: 0, y: 0, z: 0 };
        let cubeX, cubeY, cubeZ;
        let distanceArray = [9999999, 9999999, 9999999];

        for (let i = -1; i < 2; ++i)
            for (let j = -1; j < 2; ++j)
                for (let k = -1; k < 2; ++k) {
                    cubeX = Math.floor(input.x) + i;
                    cubeY = Math.floor(input.y) + j;
                    cubeZ = Math.floor(input.z) + k;
                    lastRandom = Worley.xorshift(
                        Worley.hash(
                            (cubeX + this._seedValue) & 0xffffffff,
                            (cubeY) & 0xffffffff,
                            (cubeZ) & 0xffffffff
                        )
                    );
                    numberFeaturePoints = Worley.probLookup(lastRandom);
                    for (let l = 0; l < numberFeaturePoints; ++l) {
                        lastRandom = Worley.xorshift(lastRandom);
                        randomDiff.X = lastRandom / 0x100000000;

                        lastRandom = Worley.xorshift(lastRandom);
                        randomDiff.Y = lastRandom / 0x100000000;

                        lastRandom = Worley.xorshift(lastRandom);
                        randomDiff.Z = lastRandom / 0x100000000;

                        featurePoint = {
                            x: randomDiff.X + cubeX,
                            y: randomDiff.Y + cubeY,
                            z: randomDiff.Z + cubeZ
                        };
                        Worley.insert(distanceArray, distanceFunc(input, featurePoint));
                    }
                }

        return distanceArray.map(x => x < 0 ? 0 : x > 1 ? 1 : x);
    }

    setSeed(seed = 3000) {
        this._seedValue = seed;
    }

    Euclidean(x, y, z) {
        return this.noise({ x: x, y: y, z: z }, Worley.EuclideanDistance);
    }

    Manhattan(x, y, z) {
        return this.noise({ x: x, y: y, z: z }, Worley.ManhattanDistance);
    }
}
class Fractal {
    static noise(x, y, z, octaves, noiseCallback) {
        let t = 0, f = 1, n = 0;
        for (let i = 0; i < octaves; i++) {
            n += noiseCallback(x * f, y * f, z * f) / f;
            t += 1 / f;
            f *= 2;
        }
        return n / t;
    }
}

// declare
Number.prototype.clamp = function (min, max) {
    return Math.min(Math.max(this, min), max);
};
const worley = new Worley();
const perlin = new Perlin();

const perlinCallback = (x, y, z) => {
    return perlin.noise(x, y, z);
}
const worleyCallback = (x, y, z) => {
    return worley.Euclidean(x, y, z)[0];
}
function myPerlin(x, y, z, octaves) {
    var n = 0.5 + Fractal.noise(x * octaves / 128, y * octaves / 128, z * octaves / 128, 4, perlinCallback);
    var w = Fractal.noise(x * octaves / 128, y * octaves / 128, z * octaves / 128, 2, worleyCallback);
    return (255 * (n + w) / 2.0).clamp(0, 255);
}
function myWorley(x, y, z, octaves) {
    var w = Fractal.noise(x * octaves / 128, y * octaves / 128, z * octaves / 128, 2, worleyCallback);
    return (255 - 255 * w).clamp(0, 255);
}

// generate noise textures
var data = new Uint8Array(128 * 128 * 128 * 4);
for (var z = 0; z < 128; ++z) {
    for (var y = 0; y < 128; ++y) {
        for (var x = 0; x < 128; ++x) {
            var octaves = 16;
            data[z * 128 * 128 * 4 + y * 128 * 4 + x * 4 + 0] = myPerlin(x, y, z, 8);
            data[z * 128 * 128 * 4 + y * 128 * 4 + x * 4 + 1] = myWorley(x, y, z, 16);
            data[z * 128 * 128 * 4 + y * 128 * 4 + x * 4 + 2] = myWorley(x, y, z, 24);
            data[z * 128 * 128 * 4 + y * 128 * 4 + x * 4 + 3] = myWorley(x, y, z, 32);
        }
    }
}
var buf = Buffer.from(data);
console.log("Buffer size is: " + buf.length);

// save data
const fs = require('fs');
fs.writeFile("./res/detail_noise.bin", buf, function (err) {
    if (err) {
        return console.log(err);
    }
    console.log("Output is saved as ./res/detail_noise.bin");
});