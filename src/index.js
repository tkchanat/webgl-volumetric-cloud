import Stats from 'stats.js';
import * as THREE from 'three';
import dat from 'dat.gui';
import { WEBGL } from 'three/examples/jsm/WebGL.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
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
    this.cloud_in_scatter = 0.43;
    this.cloud_out_scatter = 0.47;
    this.cloud_scatter_ratio = 0.76;
    this.cloud_silver_intensity = 4.3;
    this.cloud_silver_exponent = 2.3;
};
var config = new configLayout();
var gui = new dat.GUI();
gui.add(config, "global_coverage", 0.0, 1.0).step(0.001);
gui.add(config, "global_density", 0.01, 0.5).step(0.001);
gui.add(config, "global_lightAbsorption", 0.0, 3.0).step(0.001);
gui.add(config, "cloud_in_scatter", 0.0, 1.0).step(0.001);
gui.add(config, "cloud_out_scatter", 0.0, 1.0).step(0.001);
gui.add(config, "cloud_scatter_ratio", 0.0, 1.0).step(0.001);
gui.add(config, "cloud_silver_intensity", 0.0, 10.0).step(0.001);
gui.add(config, "cloud_silver_exponent", 0.0, 10.0).step(0.001);

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
    }, null,
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
        setTimeout(() => {
            Run();
            document.body.removeChild(document.getElementById("overlay"));
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
    var skyMin = new THREE.Vector3(-50, 0.4, -50);
    var skyMax = new THREE.Vector3(50, 1.4, 50);
    // var skyMin = new THREE.Vector3(-1, -1, -1);
    // var skyMax = new THREE.Vector3(1, 1, 1);

    // Add Sky
    var sky = new Sky();
    sky.scale.setScalar(450000);
    scene.add(sky);
    // Add Sun Helper
    var sunSphere = new THREE.Mesh(
        new THREE.SphereBufferGeometry(20000, 16, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    sunSphere.position.y = - 700000;
    sunSphere.visible = false;
    scene.add(sunSphere);
    /// GUI
    var effectController = {
        turbidity: 5,
        rayleigh: 1.5,
        mieCoefficient: 0.005,
        mieDirectionalG: 0.8,
        luminance: 1,
        inclination: 0.49, // elevation / inclination
        azimuth: 0.25, // Facing front,
        sun: true
    };
    var distance = 400000;
    function guiChanged() {
        var uniforms = sky.material.uniforms;
        uniforms["turbidity"].value = effectController.turbidity;
        uniforms["rayleigh"].value = effectController.rayleigh;
        uniforms["mieCoefficient"].value = effectController.mieCoefficient;
        uniforms["mieDirectionalG"].value = effectController.mieDirectionalG;
        uniforms["luminance"].value = effectController.luminance;
    }
    var sun_gui = new dat.GUI();
    sun_gui.add(effectController, "turbidity", 1.0, 20.0, 0.1).onChange(guiChanged);
    sun_gui.add(effectController, "rayleigh", 0.0, 4, 0.001).onChange(guiChanged);
    sun_gui.add(effectController, "mieCoefficient", 0.0, 0.1, 0.001).onChange(guiChanged);
    sun_gui.add(effectController, "mieDirectionalG", 0.0, 1, 0.001).onChange(guiChanged);
    sun_gui.add(effectController, "luminance", 0.1, 1.185).onChange(guiChanged);
    sun_gui.add(effectController, "inclination", 0, 1, 0.0001).onChange(guiChanged);
    sun_gui.add(effectController, "azimuth", 0, 1, 0.0001).onChange(guiChanged);
    sun_gui.add(effectController, "sun").onChange(guiChanged);
    guiChanged();

    var planeGeometry = new THREE.PlaneGeometry(1, 1);
    var planeUniforms = {
        skyMin: new THREE.Uniform(skyMin),
        skyMax: new THREE.Uniform(skyMax),
        sunPosition: new THREE.Uniform(sunSphere.position),
        resolution: new THREE.Uniform(resolution),
        weather_map: new THREE.Uniform(weather_map),
        detail_map: new THREE.Uniform(detail_map),
        global_coverage: new THREE.Uniform(config.global_coverage),
        global_density: new THREE.Uniform(config.global_density),
        global_lightAbsorption: new THREE.Uniform(config.global_lightAbsorption),
        cloud_in_scatter: new THREE.Uniform(config.cloud_in_scatter),
        cloud_out_scatter: new THREE.Uniform(config.cloud_out_scatter),
        cloud_scatter_ratio: new THREE.Uniform(config.cloud_scatter_ratio),
        cloud_silver_intensity: new THREE.Uniform(config.cloud_silver_intensity),
        cloud_silver_exponent: new THREE.Uniform(config.cloud_silver_exponent),
    };
    var planeMaterial = new THREE.RawShaderMaterial({
        uniforms: planeUniforms,
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
        var t = clock.getElapsedTime();
        stats.begin();
        // sky uniform update
        var theta = /*-0.05 * t */ Math.PI * (effectController.inclination - 0.5);
        var phi = 2 * Math.PI * (effectController.azimuth - 0.5);
        sunSphere.position.x = distance * Math.cos(phi);
        sunSphere.position.y = distance * Math.sin(phi) * Math.sin(theta);
        sunSphere.position.z = distance * Math.sin(phi) * Math.cos(theta);
        sunSphere.visible = effectController.sun;
        sky.material.uniforms["sunPosition"].value.copy(sunSphere.position);
        // cloud uniform update
        camera.position.z += 0.05 * dt;
        planeMaterial.uniforms.sunPosition.value = sunSphere.position;
        planeMaterial.uniforms.global_coverage.value = config.global_coverage;
        planeMaterial.uniforms.global_density.value = config.global_density;
        planeMaterial.uniforms.global_lightAbsorption.value = config.global_lightAbsorption;
        planeMaterial.uniforms.cloud_in_scatter.value = config.cloud_in_scatter;
        planeMaterial.uniforms.cloud_out_scatter.value = config.cloud_out_scatter;
        planeMaterial.uniforms.cloud_scatter_ratio.value = config.cloud_scatter_ratio;
        planeMaterial.uniforms.cloud_silver_intensity.value = config.cloud_silver_intensity;
        planeMaterial.uniforms.cloud_silver_exponent.value = config.cloud_silver_exponent;
        renderer.clear();
        renderer.render(scene, camera);
        setTimeout(function () {
            requestAnimationFrame(animate);
            stats.end();
        }, 1000 / 20);
    };
    animate();
}
