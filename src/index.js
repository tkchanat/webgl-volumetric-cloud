import Stats from 'stats.js';
import * as THREE from 'three';
import dat from 'dat.gui';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
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
    this.wind_speed = 0.75;
    this.wind_direction_x = 0.4;
    this.wind_direction_y = 0.0;
    this.wind_direction_z = -1.0;
    this.global_coverage = 0.2;
    this.global_density = 1.0;
    this.global_lightAbsorption = 0.5;
    this.cloud_in_scatter = 0.43;
    this.cloud_out_scatter = 0.06;
    this.cloud_scatter_ratio = 0.57;
    this.cloud_silver_intensity = 5.0;
    this.cloud_silver_exponent = 2.3;
    this.cloud_out_scatter_ambient = 0.0;
    this.wind_animation = true;
    this.use_blue_noise = true;
    this.use_quarter_update = false;
    this.vSync = false;
};
var config = new configLayout();
var gui = new dat.GUI();
gui.add(config, "wind_speed", 0.0, 3.0).step(0.001);
gui.add(config, "wind_direction_x", -1.0, 1.0).step(0.01);
// gui.add(config, "wind_direction_y", -1.0, 1.0).step(0.01);
gui.add(config, "wind_direction_z", -1.0, 1.0).step(0.01);
gui.add(config, "wind_animation");
gui.add(config, "global_coverage", 0.0, 1.0).step(0.001);
gui.add(config, "global_density", 0.01, 1.0).step(0.001);
gui.add(config, "global_lightAbsorption", 0.0, 2.0).step(0.001);
gui.add(config, "use_blue_noise");
gui.add(config, "vSync");
// gui.add(config, "use_quarter_update");
// gui.add(config, "cloud_in_scatter", 0.0, 1.0).step(0.001);
// gui.add(config, "cloud_out_scatter", 0.0, 1.0).step(0.001);
// gui.add(config, "cloud_scatter_ratio", 0.0, 1.0).step(0.001);
// gui.add(config, "cloud_silver_intensity", 0.0, 10.0).step(0.001);
// gui.add(config, "cloud_silver_exponent", 0.0, 10.0).step(0.001);
// gui.add(config, "cloud_out_scatter_ambient", 0.0, 1.0).step(0.001);

// resources declaration
var resourceStatus = {
    "cloudVS.glsl": true,
    "cloudFS.glsl": true,
    "detail_noise.bin": false,
    "detail_noise_high.bin": false,
    "mountains.obj": false
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
renderer.setClearColor(new THREE.Color(0x000000));
var worldWidth = 100;
var worldDepth = 100;
var scene = new THREE.Scene();
var postScene = new THREE.Scene();
var resolution = new THREE.Vector2(canvas.width, canvas.height);
var camera = new THREE.PerspectiveCamera(75, resolution.x / resolution.y, 0.1, 1000);
var keyboard = new THREEx.KeyboardState();
var clock = new THREE.Clock();
var target = new THREE.WebGLRenderTarget(canvas.width, canvas.height);
target.texture.format = THREE.RGBFormat;
target.texture.minFilter = target.texture.magFilter = THREE.NearestFilter;
target.texture.Mipmaps = false;
target.stencilBuffer = false;
target.depthBuffer = true;
target.depthTexture = new THREE.DepthTexture();
target.depthTexture.type = THREE.UnsignedShortType;
var prevFrame = new THREE.DataTexture(new Uint8Array(canvas.width * canvas.height * 3), canvas.width, canvas.height, THREE.RGBFormat);
prevFrame.minFilter = THREE.NearestFilter;
prevFrame.maxFilter = THREE.NearestFilter;
camera.position.y = -2.0;
camera.position.z = 3.0;

/**
 * Resources
 */
var fileLoader = new THREE.FileLoader();
var textureLoader = new THREE.TextureLoader();
// weather_map
var weather_map = textureLoader.load('res/textures/weather_map2.png');
// blue_noise
var blue_noise = textureLoader.load('res/textures/blue_noise.png');
blue_noise.wrapS = blue_noise.wrapT = THREE.RepeatWrapping;
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
        console.error("detail_noise cannot be loaded: " + err);
    }
);
// detail_map_high
var detail_map_high;
// detail_noise_high.bin
fileLoader.load(
    "res/detail_noise_high.bin",
    function (buf) {
        var data = new Uint8Array(buf);
        detail_map_high = new THREE.DataTexture3D(data, 32, 32, 32);
        detail_map_high.type = THREE.UnsignedByteType;
        detail_map_high.format = THREE.RGBFormat;
        detail_map_high.wrapR = detail_map_high.wrapS = detail_map_high.wrapT = THREE.MirroredRepeatWrapping;
        detail_map_high.minFilter = detail_map_high.magFilter = THREE.LinearFilter;
        resourceStatus["detail_noise_high.bin"] = true;
        console.log("detail_noise_high.bin load");
    }, null,
    function (err) {
        console.error("detail_noise_high cannot be loaded: " + err);
    }
);

// terrain
var objloader = new OBJLoader();
objloader.load("res/models/mountains.obj",
    function (terrain) {
        var texture = textureLoader.load("res/textures/seamless_grass.jpg");
        texture.repeat = new THREE.Vector2(10, 10);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        var material = new THREE.MeshStandardMaterial(
            {
                metalness: 0.0,
                roughness: 0.8,
                flatShading: false,
                map: texture
            }
        );
        terrain.traverse(function (child) {
            if (child instanceof THREE.Mesh) {
                child.material = material;
            }
        });
        terrain.position.y = -20;
        terrain.scale.x = 1.82;
        terrain.scale.y = 1.3;
        terrain.scale.z = 1.82;
        scene.add(terrain);
        resourceStatus["mountains.obj"] = true;
    },
    null,
    function (error) {
        console.log("mountains.obj cannot be loaded: " + error);
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
    var skyMin = new THREE.Vector3(-worldWidth / 2, 1.0, -worldDepth / 2);
    var skyMax = new THREE.Vector3(worldWidth / 2, 4.0, worldDepth / 2);

    // Add Sky
    var sky = new Sky();
    sky.scale.setScalar(450000);
    scene.add(sky);
    // Add Sun Helper
    var sunSphere = new THREE.Mesh(
        new THREE.SphereBufferGeometry(20000, 16, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    var sunLight = new THREE.DirectionalLight(0xffffff);
    sunSphere.position.y = - 700000;
    sunSphere.visible = false;
    scene.add(sunSphere);
    scene.add(sunLight);
    /// GUI
    var effectController = {
        turbidity: 2.6,
        rayleigh: 1.5,
        mieCoefficient: 0.007,
        mieDirectionalG: 0.7,
        luminance: 1,
        inclination: 0.1, // elevation / inclination
        azimuth: 0.25, // Facing front,
        sun: true
    };
    var distance = 400000;
    var sun_gui = new dat.GUI();
    sun_gui.add(effectController, "inclination", 0, 0.75, 0.0001);

    var time = 0;
    var updatePixel = 0;
    var pixelSequence = [0, 10, 2, 8, 5, 15, 7, 13, 1, 11, 3, 9, 4, 14, 6, 12];
    var planeGeometry = new THREE.PlaneGeometry(1, 1);
    var planeUniforms = {
        tDepth: { value: target.depthTexture },
        tDiffuse: { value: target.texture },
        time: new THREE.Uniform(time),
        skyMin: new THREE.Uniform(skyMin),
        skyMax: new THREE.Uniform(skyMax),
        sunPosition: new THREE.Uniform(sunSphere.position),
        resolution: new THREE.Uniform(resolution),
        updatePixel: new THREE.Uniform(updatePixel),
        prevFrame: new THREE.Uniform(prevFrame),
        weather_map: new THREE.Uniform(weather_map),
        blue_noise: new THREE.Uniform(blue_noise),
        wind_animation: new THREE.Uniform(config.wind_animation),
        wind_speed: new THREE.Uniform(config.wind_speed),
        wind_direction: new THREE.Uniform(new THREE.Vector3(config.wind_direction_x, config.wind_direction_y, config.wind_direction_z)),
        detail_map: new THREE.Uniform(detail_map),
        detail_map_high: new THREE.Uniform(detail_map_high),
        global_coverage: new THREE.Uniform(config.global_coverage),
        global_density: new THREE.Uniform(config.global_density),
        global_lightAbsorption: new THREE.Uniform(config.global_lightAbsorption),
        cloud_in_scatter: new THREE.Uniform(config.cloud_in_scatter),
        cloud_out_scatter: new THREE.Uniform(config.cloud_out_scatter),
        cloud_scatter_ratio: new THREE.Uniform(config.cloud_scatter_ratio),
        cloud_silver_intensity: new THREE.Uniform(config.cloud_silver_intensity),
        cloud_silver_exponent: new THREE.Uniform(config.cloud_silver_exponent),
        cloud_out_scatter_ambient: new THREE.Uniform(config.cloud_out_scatter_ambient),
        use_blue_noise: new THREE.Uniform(config.use_blue_noise),
        use_quarter_update: new THREE.Uniform(config.use_quarter_update)
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
    postScene.add(plane);

    /**
     * Render Loop
     */
    var frame = 0;
    var animate = function () {
        var dt = clock.getDelta();
        time = clock.getElapsedTime();
        stats.begin();

        // keyboard input
        var moveDistance = 4 * dt;
        if (keyboard.pressed("W"))
            camera.position.z -= moveDistance;
        else if (keyboard.pressed("S"))
            camera.position.z += moveDistance;
        if (keyboard.pressed("A"))
            camera.position.x -= moveDistance;
        else if (keyboard.pressed("D"))
            camera.position.x += moveDistance;
        if (keyboard.pressed("shift"))
            camera.position.y -= moveDistance;
        else if (keyboard.pressed("space"))
            camera.position.y += moveDistance;

        // sky uniform update
        var theta = Math.PI * (effectController.inclination - 0.5);
        var phi = 2 * Math.PI * (effectController.azimuth - 0.5);
        sunSphere.position.x = distance * Math.cos(phi);
        sunSphere.position.y = distance * Math.sin(phi) * Math.sin(theta);
        sunSphere.position.z = distance * Math.sin(phi) * Math.cos(theta);
        sunSphere.visible = effectController.sun;
        sunLight.position.x = sunSphere.position.x;
        sunLight.position.y = sunSphere.position.y;
        sunLight.position.z = sunSphere.position.z;
        sky.material.uniforms["sunPosition"].value.copy(sunSphere.position);
        // cloud uniform update
        updatePixel = (updatePixel + 1) % 16;
        plane.position.set(camera.position);
        planeMaterial.uniforms.time.value = time;
        planeMaterial.uniforms.wind_animation.value = config.wind_animation;
        planeMaterial.uniforms.wind_speed.value = config.wind_speed;
        planeMaterial.uniforms.wind_direction.value = new THREE.Vector3(config.wind_direction_x, config.wind_direction_y, config.wind_direction_z);
        planeMaterial.uniforms.updatePixel.value = pixelSequence[updatePixel];
        planeMaterial.uniforms.sunPosition.value = sunSphere.position;
        planeMaterial.uniforms.global_coverage.value = config.global_coverage;
        planeMaterial.uniforms.global_density.value = config.global_density;
        planeMaterial.uniforms.global_lightAbsorption.value = config.global_lightAbsorption;
        planeMaterial.uniforms.cloud_in_scatter.value = config.cloud_in_scatter;
        planeMaterial.uniforms.cloud_out_scatter.value = config.cloud_out_scatter;
        planeMaterial.uniforms.cloud_scatter_ratio.value = config.cloud_scatter_ratio;
        planeMaterial.uniforms.cloud_silver_intensity.value = config.cloud_silver_intensity;
        planeMaterial.uniforms.cloud_silver_exponent.value = config.cloud_silver_exponent;
        planeMaterial.uniforms.cloud_out_scatter_ambient.value = config.cloud_out_scatter_ambient;
        planeMaterial.uniforms.use_blue_noise.value = config.use_blue_noise;
        planeMaterial.uniforms.use_quarter_update.value = config.use_quarter_update;

        renderer.setRenderTarget(target);
        renderer.render(scene, camera);

        renderer.setRenderTarget(null);
        renderer.render(postScene, camera);
        // renderer.copyFramebufferToTexture(new THREE.Vector2(0, 0), prevFrame);
        frame++;
        if(config.vSync) {
            setTimeout(function () {
                requestAnimationFrame(animate);
                stats.end();
            }, 1000 / 30);
        } else {
            requestAnimationFrame(animate);
            stats.end();
        }
    };
    animate();
    window.setInterval(function () {
        console.log(frame);
        frame = 0;
    }, 1000);
}