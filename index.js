function vertexShader() {
    return `
    varying vec3 vUv; 
  
    void main() {
        vUv = position; 
  
        vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * modelViewPosition; 
    }
`
}

function fragmentShader() {
    return `
    uniform vec3 colorA; 
    uniform vec3 colorB; 
    varying vec3 vUv;

    void main() {
      gl_FragColor = vec4(mix(colorA, colorB, vUv.z), 1.0);
    }
`
}

var canvas = document.getElementById("myCanvas");
var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(75, canvas.width / canvas.height, 0.1, 1000);
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

var renderer = new THREE.WebGLRenderer({ canvas: myCanvas });
renderer.setSize(canvas.width, canvas.height);

var uniforms = {
    colorB: {type: 'vec3', value: new THREE.Color(0xACB6E5)},
    colorA: {type: 'vec3', value: new THREE.Color(0x74ebd5)}
}
var geometry = new THREE.BoxGeometry(1, 1, 1);
var material = new THREE.ShaderMaterial({
    uniforms: uniforms,
    fragmentShader: fragmentShader(),
    vertexShader: vertexShader(),
})
var cube = new THREE.Mesh(geometry, material);
scene.add(cube);

camera.position.z = 5;

var animate = function () {
    requestAnimationFrame(animate);

    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;

    renderer.render(scene, camera);
};

animate();