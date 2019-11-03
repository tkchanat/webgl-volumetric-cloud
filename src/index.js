import Stats from 'stats.js';
import * as THREE from 'three';
import dat from 'dat.gui';

function vertexShader() {
    return `#version 300 es
    in vec2 uv;
    out vec2 frag_uv; 
  
    void main() {
        frag_uv = uv; 
        gl_Position = vec4(2.0 * uv - 1.0, 0.0, 1.0); 
    }
`
}

function fragmentShader() {
    return `#version 300 es
    #define EPSILON 0.0001
    #define PI 3.14159
    #define MAX_ITERATION 256

    precision highp sampler2D;
    precision highp sampler3D;
    precision highp float;

    in vec2 frag_uv;
    out vec4 out_color;

    uniform vec3 skyMin;
    uniform vec3 skyMax;
    uniform vec3 cameraPosition;
    uniform vec2 resolution;
    uniform sampler2D weather_map;
    uniform sampler3D detail_map;
    uniform float global_coverage;
    uniform float global_density;

    float R(float v, float lo, float ho, float ln, float hn) {
        return ln + (v - lo) * (hn - ln) / (ho - lo);
    }

    float SAT(float v) {
        return clamp(v, 0.0, 1.0);
    }

    float LERP(float v0, float v1, float i) {
        return (1.0 - i) * v0 + i * v1;
    }

    float dist_func(vec3 p) {
        vec3 sphere_position = vec3(0.0, 0.0, 0.0);
        float sphere_dist = length(p - sphere_position) - 1.0;
        return sphere_dist;
    }

    float HeightAlter(float ph, vec4 map) {
        // round bottom
        float ret_val = SAT(R(ph, 0.0, 0.07, 0.0, 1.0));
        // round top
        float stop_height = SAT(map.b + 0.12);
        ret_val *= SAT(R(ph, stop_height * 0.2, stop_height, 1.0, 0.0));
        // apply anvil
        // ret_val = pow(ret_val, SAT(R(ph, 0.65, 0.95, 1.0(1 - cloud_anvil_amount * global_coverage))));
        return ret_val;
    }

    float DensityAlter(float ph, vec4 map) {
        float ret_val = ph;
        // reduce density as base
        ret_val *= SAT(R(ph, 0.0, 0.2, 0.0, 1.0));
        // reduce density at top
        ret_val *= SAT(R(ph, 0.9, 1.0, 1.0, 0.0));
        // apply weather_map density
        ret_val *= global_density * map.a * 2.0;
        // reduce density for the anvil
        // ret_val *= LERP(1, SAT(R(pow(ph, 0.5), 0.4, 0.95, 1.0, 0.2)), cloud_anvil_amount);
        return ret_val;
    }

    const float interval = 0.005;
    float ray_march(vec3 ro, vec3 rd) {
        float d = 0.0;
        float alpha = 0.0;
        for(int i = 0; i < MAX_ITERATION; ++i) {
            vec3 p = ro + d * rd;
            if(p.x > skyMin.x && p.x < skyMax.x && p.y > skyMin.y && p.y < skyMax.y && p.z > skyMin.z && p.z < skyMax.z) {
                float u = R(p.x, skyMin.x, skyMax.x, 0.0, 1.0);
                float v = R(p.y, skyMin.y, skyMax.y, 0.0, 1.0);
                float w = R(p.z, skyMin.z, skyMax.z, 0.0, 1.0);

                // weather_map
                vec4 map = texture(weather_map, vec2(u, w));
                float WM = max(map.r, SAT(global_coverage - 0.5) * map.g * 2.0);
                float SA = HeightAlter(v, map);
                float DA = DensityAlter(v, map);
                
                // detail_map
                vec4 sn = texture(detail_map, 1.5 * vec3(p.x, p.y, p.z));
                float SN = R(sn.r, (sn.g * 0.625 + sn.b * 0.25 + sn.a * 0.125) - 1.0, 1.0, 0.0, 1.0);
                alpha += SAT(R(SN * SA, 1.0 - global_coverage * WM, 1.0, 0.0, 1.0)) * DA;
                if(alpha >= 1.0) {
                    break;
                }
                d += interval / 2.0;
                continue;
            }
            d += interval;
        }
        return alpha;
    }

    void main() {
        vec2 uv = (2.0 * gl_FragCoord.xy - resolution.xy) / resolution.y;
        vec3 ro = cameraPosition;
        vec3 rd = normalize(vec3(uv, -1.0));
        float alpha = ray_march(ro, rd);
        vec3 color = vec3(1);// * alpha;
        out_color = vec4(color, alpha);// < EPSILON ? 0 : 1);
    }
`
}

// stats.js
var stats = new Stats();
stats.showPanel(1);
document.body.appendChild(stats.dom);
// dat.gui.js
var configLayout = function () {
    this.global_coverage = 1.0;
    this.global_density = 0.2;
};
var config = new configLayout();
var gui = new dat.GUI();
gui.add(config, "global_coverage", 0.0, 1.0).step(0.001);
gui.add(config, "global_density", 0.01, 0.5).step(0.001);

import { WEBGL } from 'three/examples/jsm/WebGL.js';
if (WEBGL.isWebGL2Available === false) {
    document.body.appendChild(WEBGL.getWebGL2ErrorMessage());
}

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
camera.position.z = 2;
scene.background = new THREE.Color(0x000000);
// scene.background = new THREE.CubeTextureLoader()
//     .setPath('res/textures/')
//     .load([
//         'px.png',
//         'nx.png',
//         'py.png',
//         'ny.png',
//         'pz.png',
//         'nz.png'
//     ]);


/**
 * Textures
 */
// weather_map
var weather_map = new THREE.TextureLoader().load('res/textures/weather_map.png');
// detail_map
var fileLoader = new THREE.FileLoader();
fileLoader.setResponseType("arraybuffer");
fileLoader.load(
    "res/detail_noise.bin",
    function (buf) {
        var data = new Uint8Array(buf);
        var detail_map = new THREE.DataTexture3D(data, 128, 128, 128);
        detail_map.type = THREE.UnsignedByteType;
        detail_map.wrapR = detail_map.wrapS = detail_map.wrapT = THREE.MirroredRepeatWrapping;
        detail_map.minFilter = detail_map.magFilter = THREE.LinearFilter;
        console.log("detail_noise loaded");
        console.log(detail_map);
        /**
         * Uniforms
         */
        var skyMin = new THREE.Vector3(-5, 0.0, -5);
        var skyMax = new THREE.Vector3(5, 1.0, 5);
        // var skyMin = new THREE.Vector3(-1, -1, -1);
        // var skyMax = new THREE.Vector3(1, 1, 1);

        var planeGeometry = new THREE.PlaneGeometry(1, 1);
        var uniforms = {
            skyMin: new THREE.Uniform(skyMin),
            skyMax: new THREE.Uniform(skyMax),
            resolution: new THREE.Uniform(resolution),
            weather_map: new THREE.Uniform(weather_map),
            detail_map: new THREE.Uniform(detail_map),
            global_coverage: new THREE.Uniform(config.global_coverage),
            global_density: new THREE.Uniform(config.global_density),
        }
        var planeMaterial = new THREE.RawShaderMaterial({
            uniforms: uniforms,
            vertexShader: vertexShader(),
            fragmentShader: fragmentShader(),
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
        var animate = function () {
            stats.begin();
            planeMaterial.uniforms.global_coverage.value = config.global_coverage;
            planeMaterial.uniforms.global_density.value = config.global_density;
            renderer.clear();
            renderer.render(scene, camera);
            stats.end();
            requestAnimationFrame(animate);
        };
        animate();

    },
    function (xhr) {
        console.log((xhr.loaded / xhr.total * 100) + '% loaded');
    },
    function (err) {
        console.error('detail_noise cannot be loaded: ' + err);
    }
);