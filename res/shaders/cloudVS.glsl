#version 300 es
in vec2 uv;
out vec2 frag_uv; 

void main() {
    frag_uv = uv; 
    gl_Position = vec4(2.0 * uv - 1.0, 0.0, 1.0); 
}