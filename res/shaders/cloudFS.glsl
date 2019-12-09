#version 300 es
#define EPSILON 0.0001
#define PI 3.14159
#define MAX_ITERATION 256
#define SUN_STEPS 2

precision highp sampler2D;
precision highp sampler3D;
precision highp float;

in vec2 frag_uv;
in mat4 frag_viewProjMatrix;
out vec4 out_color;

uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform float time;
uniform vec3 skyMin;
uniform vec3 skyMax;
uniform vec3 sunPosition;
uniform vec3 cameraPosition;
uniform vec2 resolution;
uniform int updatePixel;
uniform sampler2D prevFrame;
uniform sampler2D weather_map;
uniform sampler2D blue_noise;
uniform float wind_speed;
uniform vec3 wind_direction;
uniform sampler3D detail_map;
uniform sampler3D detail_map_high;
uniform vec3 sun_color;
uniform float global_coverage;
uniform float global_density;
uniform float global_lightAbsorption;
uniform float cloud_in_scatter;
uniform float cloud_out_scatter;
uniform float cloud_scatter_ratio;
uniform float cloud_silver_intensity;
uniform float cloud_silver_exponent;
uniform float cloud_out_scatter_ambient;
uniform bool use_blue_noise;
uniform bool use_quarter_update;

float R(float v, float lo, float ho, float ln, float hn) {
    return ln + (v - lo) * (hn - ln) / (ho - lo);
}

float SAT(float v) {
    return clamp(v, 0.0, 1.0);
}

float LERP(float v0, float v1, float i) {
    return (1.0 - i) * v0 + i * v1;
}

float HeightAlter(float ph, vec4 map) {
    // round bottom
    float ret_val = SAT(R(ph, 0.0 , 0.07, 0.0, 1.0));
    // round top
    float stop_height = SAT(map.b + 0.12);
    ret_val *= SAT(R(ph, stop_height * 0.2, stop_height, 1.0, 0.0));
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
        float WM = max(map.r, SAT(global_coverage) * map.g * 2.0);
        float SA = HeightAlter(v, map);
        float DA = DensityAlter(v, map);

        // detail_map
        vec4 sn = texture(detail_map, .5 + .3 * vec3(p.x, p.y, p.z));
        vec4 dn = texture(detail_map_high, time * wind_speed * normalize(wind_direction) + 0.75 * vec3(p.x, p.y, p.z));
        float DN_fbm = dn.r * 0.625 + dn.g * 0.25 + dn.b * 0.125;
        float DN_mod = 1.25 * DN_fbm;// * LERP(DN_fbm, 1.0 - DN_fbm, SAT(v * 5.0));
        float SN_sample = R(sn.r, (sn.g * 0.625 + sn.b * 0.25 + sn.a * 0.125) - 1.0, 1.0, 0.0, 1.0);
        float SN_nd = SAT(R(SN_sample * SA, 1.0 - global_coverage * WM, 1.0, 0.0, 1.0));
        return SAT(R(SN_sample * SA * DN_mod, 1.0 - WM, 1.0, 0.0, 1.0)) * DA;
    }
    return density;
}

float HG(float cosTheta, float g) {
    float g2 = g * g;
    return ((1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5)) / 4.0 * PI;
}

float InOutScatter(float cosTheta, float exponent) {
    float hg1 = HG(cosTheta, cloud_in_scatter);
    float hg2 = cloud_silver_intensity * pow(SAT(cosTheta), exponent);
    float in_scatter_hg = max(hg1, hg2);
    float out_scatter_hg = HG(cosTheta, -cloud_out_scatter);
    return LERP(in_scatter_hg, out_scatter_hg, cloud_scatter_ratio);
}

float Attenuation(float densityToSun, float cosTheta) {
    float horizonFactor = pow(1.0 - abs(dot(normalize(sunPosition), vec3(0, 1, 0))), 2.0);
    float absorption = mix(0.2, global_lightAbsorption, horizonFactor);
    float prim = exp(-absorption * densityToSun);
    float scnd = exp(-absorption * 0.2) * 0.7;
    float checkval = R(cosTheta, 0.0, 1.0, scnd, scnd * 0.5);
    return max(checkval, prim);
}

float OutScatterAmbient(float density, float ph) {
    float depth = cloud_out_scatter_ambient * pow(density, R(ph, 0.3, 0.9, 0.5, 1.0));
    float vertical = pow(SAT(R(ph, 0.0, 0.3, 0.8, 1.0)), 0.8);
    float out_scatter = depth * vertical;
    return 1.0 - SAT(out_scatter);
}

float LightMarch(vec3 p, float cosTheta) {
    vec3 direction = normalize(sunPosition);
    float stepSize = 0.25 * (skyMax.y - skyMin.y) / float(SUN_STEPS);
    float totalDensity = 0.0;
    for(int step = 0; step < SUN_STEPS; ++step) {
        p += direction * stepSize;
        totalDensity += max(0.0, SampleDensity(p) * stepSize);
    }
    float transmittance = Attenuation(totalDensity, cosTheta);
    return transmittance;
}

void main() {
    // update pixel
    out_color = texture(tDiffuse, frag_uv);
    if (use_quarter_update && int(gl_FragCoord.y * 4.0 + gl_FragCoord.x) % 16 != updatePixel) {
        return;
    }

    // get ray direction into the scene
    vec2 uv = (2.0 * gl_FragCoord.xy - resolution.xy) / resolution.y;
    vec3 rayOrigin = cameraPosition;
    vec3 rayDirection = normalize(vec3(uv, -1.0));
    vec3 sunDirection = normalize(sunPosition);
    float cosTheta = dot(sunDirection, rayDirection);
    
    // ray march along the ray direction
    float stepSize = 0.1;
    float dist_start = 0.0;
    if(use_blue_noise)
        dist_start += (texture(blue_noise, uv).r - 0.5) * 2.0 * stepSize;
    float attenuation = 1.0;
    float totalDensity = 0.0;
    float distanceTravelled = dist_start;
    vec3 firstHit = vec3(1000); // far clipping plane
    for(int i = 0; i < MAX_ITERATION; ++i) {
        vec3 rayPosition = rayOrigin + rayDirection * distanceTravelled;        
        float density = SampleDensity(rayPosition);
        totalDensity += density;
        if(totalDensity >= 1.0) {
            totalDensity = 1.0;
            break;
        }
        if(density > 0.0) {
            if(firstHit == vec3(1000)) firstHit = rayPosition - rayDirection * dist_start;
            float transmittance = LightMarch(rayPosition, cosTheta);
            float scatter = OutScatterAmbient(density, R(rayPosition.y, skyMin.y, skyMax.y, 0.0, 1.0));
            attenuation *= transmittance * scatter;
        }
        distanceTravelled += stepSize;
    }
    float mountainDepth = pow(texture(tDepth, frag_uv).r, 3.0);
    vec4 cloudHomoCoord = frag_viewProjMatrix * vec4(firstHit, 1.0);
    cloudHomoCoord /= cloudHomoCoord.w;
    float cloudDepth = cloudHomoCoord.z;
    totalDensity = (cloudDepth < mountainDepth) ? totalDensity : 0.0;

    // calculate final color
    float horizonFactor = pow(1.0 - SAT(dot(sunDirection, vec3(0, 1, 0))), 2.0);
    vec3 sunColor = mix(vec3(0.93, 0.97, 1.0), vec3(0.99, 0.86, 0.69), horizonFactor);
    float exponent = mix(1.5, 2.3, horizonFactor);
    float highlight = LERP(1.0, InOutScatter(cosTheta, exponent), horizonFactor);
    vec3 color = sunColor * attenuation * highlight * pow(SAT(1.2 - horizonFactor), 0.5);

    vec3 finalColor = mix(out_color.rgb, color, totalDensity);
    out_color = vec4(finalColor, 1.0);
}