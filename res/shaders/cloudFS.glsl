#version 300 es
#define EPSILON 0.0001
#define PI 3.14159
#define MAX_ITERATION 256
#define SUN_STEPS 4

precision highp sampler2D;
precision highp sampler3D;
precision highp float;

in vec2 frag_uv;
out vec4 out_color;

uniform vec3 skyMin;
uniform vec3 skyMax;
uniform vec3 sunPosition;
uniform vec3 cameraPosition;
uniform vec2 resolution;
uniform sampler2D weather_map;
uniform sampler3D detail_map;
uniform vec3 sun_color;
uniform float global_coverage;
uniform float global_density;
uniform float global_lightAbsorption;
uniform float cloud_in_scatter;
uniform float cloud_out_scatter;
uniform float cloud_scatter_ratio;
uniform float cloud_silver_intensity;
uniform float cloud_silver_exponent;

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

float SampleDensity(vec3 p) {
    float density = 0.0;
    if(p.x > skyMin.x && p.x < skyMax.x && p.y > skyMin.y && p.y < skyMax.y && p.z > skyMin.z && p.z < skyMax.z) {
        float u = R(p.x, skyMin.x, skyMax.x, 0.0, 1.0);
        float v = R(p.y, skyMin.y, skyMax.y, 0.0, 1.0);
        float w = R(p.z, skyMin.z, skyMax.z, 0.0, 1.0);

        // weather_map
        vec4 map = texture(weather_map, vec2(u, w));
        float WM = max(map.r, SAT(global_coverage - 0.1) * map.g * 2.0);
        float SA = HeightAlter(v, map);
        float DA = DensityAlter(v, map);

        // detail_map
        vec4 sn = texture(detail_map, .5 + .5 * vec3(p.x, p.y, p.z));
        float SN = R(sn.r, (sn.g * 0.625 + sn.b * 0.25 + sn.a * 0.125) - 1.0, 1.0, 0.0, 1.0);
        return SAT(R(SN * SA, 1.0 - WM, 1.0, 0.0, 1.0)) * DA;
    }
    return density;
}

float HG(float cosTheta, float g) {
    float g2 = g * g;
    return ((1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5)) / 4.0 * PI;
}

float InOutScatter(float cosTheta) {
    float hg1 = HG(cosTheta, cloud_in_scatter);
    float hg2 = cloud_silver_intensity * pow(SAT(cosTheta), cloud_silver_exponent);
    float in_scatter_hg = max(hg1, hg2);
    float out_scatter_hg = HG(cosTheta, -cloud_out_scatter);
    return LERP(in_scatter_hg, out_scatter_hg, cloud_scatter_ratio);
}

float LightMarch(vec3 p) {
    vec3 direction = normalize(sunPosition);
    float stepSize = 0.5 * (skyMax.y - skyMin.y) / float(SUN_STEPS);
    float totalDensity = 0.0;
    for(int step = 0; step < SUN_STEPS; ++step) {
        p += direction * stepSize;
        totalDensity += max(0.0, SampleDensity(p) * stepSize);
    }
    float transmittance = exp(-totalDensity * global_lightAbsorption);
    return transmittance;
}

void main() {
    // get ray direction into the scene
    vec2 uv = (2.0 * gl_FragCoord.xy - resolution.xy) / resolution.y;
    vec3 rayOrigin = cameraPosition;
    vec3 rayDirection = normalize(vec3(uv, -1.0));

    // ray march along the ray direction
    float stepSize = 0.1;
    stepSize = 0.1 * (1.0 - max(dot(rayDirection, vec3(0, 1, 0)), 0.0));
    float attenuation = 1.0;
    float totalDensity = 0.0;
    float distanceTravelled = 0.0;
    float distanceLimit = 25.0;
    for(int i = 0; i < MAX_ITERATION; ++i) {
        vec3 rayPosition = rayOrigin + rayDirection * distanceTravelled;
        float density = SampleDensity(rayPosition);
        totalDensity += density;
        if(density > 0.0) {
            float transmittance = LightMarch(rayPosition);
            attenuation *= transmittance;
            distanceTravelled += stepSize / 10.0;
            continue;
        }
        distanceTravelled += stepSize;
    }

    // calculate final color
    float cosTheta = dot(normalize(sunPosition), rayDirection);
    float highlight = InOutScatter(cosTheta);
    vec3 color = sun_color * attenuation * highlight;
    out_color = vec4(color, totalDensity);
}