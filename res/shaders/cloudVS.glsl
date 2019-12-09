#version 300 es
in vec2 uv;
out vec2 frag_uv;
out mat4 frag_viewProjMatrix;

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

void main() {
    frag_uv = uv;
    frag_viewProjMatrix = projectionMatrix * viewMatrix;
    gl_Position = vec4(2.0 * uv - 1.0, 0.0, 1.0); 
}