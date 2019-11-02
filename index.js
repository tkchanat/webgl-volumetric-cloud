function vertexShader() {
    return `
    varying vec2 frag_uv; 
  
    void main() {
        frag_uv = uv; 
        gl_Position = vec4(2.0 * uv - 1.0, 0.0, 1.0); 
    }
`
}

function fragmentShader() {
    return `
    #define EPSILON 0.0001
    #define PI 3.14159
    #define MAX_ITERATION 512

    uniform vec3 min;
    uniform vec3 max;
    uniform vec2 resolution;
    uniform sampler2D weather_map;
    varying vec2 frag_uv;

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
        // apply weather_map density
        ret_val *= map.a * 2.0;
        // reduce density for the anvil
        // ret_val *= LERP(1, SAT(R(pow(ph, 0.5), 0.4, 0.95, 1.0, 0.2)), cloud_anvil_amount);
        // reduce density at top
        ret_val *= SAT(R(ph, 0.9, 1.0, 1.0, 0.0));
        return ret_val;
    }

    const float interval = 0.02;
    float ray_march(vec3 ro, vec3 rd) {
        float d = 0.0;
        float alpha = 0.0;
        for(int i = 0; i < MAX_ITERATION; ++i) {
            vec3 p = ro + d * rd;
            if(p.x > min.x && p.x < max.x && p.y > min.y && p.y < max.y && p.z > min.z && p.z < max.z) {
                float u = R(p.x, min.x, max.x, 0.0, 1.0);
                float v = R(p.y, min.y, max.y, 0.0, 1.0);
                float w = R(p.z, min.z, max.z, 0.0, 1.0);
                vec4 map = texture2D(weather_map, vec2(u, w));
                float sample = HeightAlter(v, map) * DensityAlter(v, map) * map.r;
                alpha += sample / 5.0;
                if(alpha >= 1.0) {
                    break;
                }
                d += interval / 4.0;
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
        gl_FragColor = vec4(1, 1, 1, alpha);
    }
`
}

var canvas = document.getElementById("myCanvas");
var scene = new THREE.Scene();
var sceneOrtho = new THREE.Scene();
var resolution = new THREE.Vector2(canvas.width, canvas.height);
var camera = new THREE.PerspectiveCamera(75, resolution.x / resolution.y, 0.1, 1000);
camera.position.z = 3;
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

var renderer = new THREE.WebGLRenderer({
    canvas: myCanvas,
    alpha: true
});

// textures
var textureSize = 512;
var data = new Uint8Array(textureSize * textureSize * 3);
var texture = new THREE.DataTexture(data, textureSize, textureSize, THREE.RGBFormat);
texture.minFilter = THREE.NearestFilter;
texture.magFilter = THREE.NearestFilter;
var weather_map = new THREE.TextureLoader().load( 'res/textures/weather_map.png' );

// uniforms
var min = new THREE.Vector3(-10, 1, -10);
var max = new THREE.Vector3(10, 1.1, 10);

var planeGeometry = new THREE.PlaneGeometry(1, 1);
var uniforms = {
    min: new THREE.Uniform(min),
    max: new THREE.Uniform(max),
    resolution: new THREE.Uniform(resolution),
    weather_map: new THREE.Uniform(weather_map)
}
var planeMaterial = new THREE.ShaderMaterial({
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

var stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);
var animate = function () {
    stats.begin();
    renderer.clear();
    renderer.render(scene, camera);
    stats.end();

    requestAnimationFrame(animate);
};

animate();