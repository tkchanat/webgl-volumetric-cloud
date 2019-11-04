import Stats from 'stats.js';
import * as THREE from 'three';
import dat from 'dat.gui';
import { WEBGL } from 'three/examples/jsm/WebGL.js';
import cloudVS from '../res/shaders/cloudVS.glsl';
import cloudFS from '../res/shaders/cloudFS.glsl';
if (WEBGL.isWebGL2Available === false) {
    document.body.appendChild(WEBGL.getWebGL2ErrorMessage());
}

// stats.js
var stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);
// dat.gui.js
var configLayout = function () {
    this.global_coverage = 0.27;
    this.global_density = 0.16;
    this.global_lightAbsorption = 1.0;
    this.sun_color = 0xe8f5ff;
};
var config = new configLayout();
var gui = new dat.GUI();
gui.add(config, "global_coverage", 0.0, 1.0).step(0.001);
gui.add(config, "global_density", 0.01, 0.5).step(0.001);
gui.add(config, "global_lightAbsorption", 0.0, 3.0).step(0.001);
gui.addColor(config, 'sun_color');

// resources declaration
var resourceStatus = {
    "cloudVS.glsl": true,
    "cloudFS.glsl": true,
    "detail_noise.bin": false
};

// three.js resource initialization
THREE.Cache.enabled = false;
var canvas = document.getElementById("myCanvas");
var context = canvas.getContext('webgl2');
var renderer = new THREE.WebGLRenderer({
    canvas: myCanvas,
    context: context,
    alpha: true
});
var scene = new THREE.Scene();
var resolution = new THREE.Vector2(canvas.width, canvas.height);
var camera = new THREE.PerspectiveCamera(75, resolution.x / resolution.y, 0.1, 1000);
scene.background = new THREE.Color(0x000000);
scene.background = new THREE.CubeTextureLoader()
    .setPath('res/textures/')
    .load([
        'px.png',
        'nx.png',
        'py.png',
        'ny.png',
        'pz.png',
        'nz.png'
    ]);


/**
 * Resources
 */
var fileLoader = new THREE.FileLoader();
// weather_map
var weather_map = new THREE.TextureLoader().load('res/textures/weather_map.png');
// detail_map
var detail_map;
// detail_noise.bin
fileLoader.setResponseType("arraybuffer");
fileLoader.load(
    "res/detail_noise.bin",
    function (buf) {
        var data = new Uint8Array(buf);
        detail_map = new THREE.DataTexture3D(data, 128, 128, 128);
        detail_map.type = THREE.UnsignedByteType;
        detail_map.wrapR = detail_map.wrapS = detail_map.wrapT = THREE.MirroredRepeatWrapping;
        detail_map.minFilter = detail_map.magFilter = THREE.LinearFilter;
        resourceStatus["detail_noise.bin"] = true;
        console.log("detail_noise.bin loaded");
    },
    function (xhr) {
        console.log("detail_noise.bin" + (xhr.loaded / xhr.total * 100) + '% loaded');
    },
    function (err) {
        console.error('detail_noise cannot be loaded: ' + err);
    }
);

var overlay = document.getElementById("overlay").getContext("2d");
overlay.font = "30px Arial";
overlay.textAlign = "center";
function WaitAllResources() {
    var allTrue = true;
    overlay.clearRect(0, 0, canvas.width, canvas.height);
    Object.keys(resourceStatus).forEach(function (value, i) {
        var loaded = resourceStatus[value];
        allTrue &= loaded;
        overlay.fillText(value + (loaded ? " ✓" : "..."), canvas.width / 2, canvas.height / 2 + i * 30);
    });
    if (allTrue) {
        setTimeout(()=> {
            Run();
            overlay.clearRect(0, 0, canvas.width, canvas.height);
        }, 10);
    }
    else setTimeout(WaitAllResources, 10);
}
WaitAllResources();

/**
 * Application Loop
 */
function Run() {
    /**
     * Uniforms
     */
    var sunPosition = new THREE.Vector3(0, 2, -6);
    var skyMin = new THREE.Vector3(-50, 0.4, -50);
    var skyMax = new THREE.Vector3(50, 1.4, 50);
    // var skyMin = new THREE.Vector3(-1, -1, -1);
    // var skyMax = new THREE.Vector3(1, 1, 1);

    var planeGeometry = new THREE.PlaneGeometry(1, 1);
    var uniforms = {
        skyMin: new THREE.Uniform(skyMin),
        skyMax: new THREE.Uniform(skyMax),
        sunPosition: new THREE.Uniform(sunPosition),
        resolution: new THREE.Uniform(resolution),
        weather_map: new THREE.Uniform(weather_map),
        detail_map: new THREE.Uniform(detail_map),
        sun_color: new THREE.Uniform(new THREE.Color(config.sun_color)),
        global_coverage: new THREE.Uniform(config.global_coverage),
        global_density: new THREE.Uniform(config.global_density),
        global_lightAbsorption: new THREE.Uniform(config.global_lightAbsorption),
    }
    var planeMaterial = new THREE.RawShaderMaterial({
        uniforms: uniforms,
        vertexShader: cloudVS,
        fragmentShader: cloudFS,
        blending: THREE.NormalBlending,
        transparent: true,
        depthWrite: false,
        depthTest: true
    });
    var plane = new THREE.Mesh(planeGeometry, planeMaterial);
    scene.add(plane);


    /**
     * Render Loop
     */
    var clock = new THREE.Clock();
    var animate = function () {
        var dt = clock.getDelta();
        stats.begin();
        camera.position.z += 0.05 * dt;
        planeMaterial.uniforms.sun_color.value = new THREE.Color(config.sun_color);
        planeMaterial.uniforms.global_coverage.value = config.global_coverage;
        planeMaterial.uniforms.global_density.value = config.global_density;
        planeMaterial.uniforms.global_lightAbsorption.value = config.global_lightAbsorption;
        renderer.clear();
        renderer.render(scene, camera);
        setTimeout(function () {
            requestAnimationFrame(animate);
            stats.end();
        }, 1000 / 30);
    };
    animate();
}
