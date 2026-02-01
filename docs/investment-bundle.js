const Lt=Object.freeze([1,0,0,0]),Ct=Object.freeze([1,1,1]),Me=12;function ot(o){const e=new Float32Array(o.length*Me);return o.forEach((t,r)=>{const i=r*Me,s=t.position??[0,0,0],n=t.orientation??Lt,a=t.color??Ct,l=t.scale??1,h=t.depth??0;e[i+0]=s[0]??0,e[i+1]=s[1]??0,e[i+2]=s[2]??0,e[i+3]=l,e[i+4]=n[0]??1,e[i+5]=n[1]??0,e[i+6]=n[2]??0,e[i+7]=n[3]??0,e[i+8]=a[0]??1,e[i+9]=a[1]??1,e[i+10]=a[2]??1,e[i+11]=h}),e}const It=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),Xt=`#version 300 es
precision highp float;

// Per-seed attributes (interleaved, stride = 12 floats)
in vec3  a_position;      // offset  0
in float a_scale;         // offset  3
in vec4  a_orientation;   // offset  4  (quaternion w,x,y,z)
in vec3  a_color;         // offset  8
in float a_depth;         // offset 11

uniform float u_pointScale;
uniform float u_time;
uniform float u_animate;     // 0.0 = static, 1.0 = GPU-animated
uniform float u_intensity;   // 0.0-2.0, audio/parameter driven brightness
uniform float u_chromatic;   // 0.0-1.0, chromatic aberration strength
uniform mat4  u_viewProjection;

flat out vec3  v_color;
flat out float v_depth;
flat out vec2  v_axisU;
flat out vec2  v_axisV;
flat out float v_hash;    // per-splat hash for fragment twinkle
flat out float v_bloom;   // bloom energy (brighter splats bloom more)

void main() {
    // ---- per-splat deterministic hash ------------------------------
    float h1 = fract(sin(dot(a_position.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float h2 = fract(sin(dot(a_position.yz, vec2(45.164, 93.721))) * 23456.789);
    float h3 = fract(sin(dot(a_position.xz, vec2(63.7264, 10.873))) * 65432.123);
    v_hash = h1;

    // ---- GPU animation (zero CPU cost) -----------------------------
    // Multi-frequency orbital motion with depth-driven amplitude
    float animAmp = a_depth * u_animate * 0.06;
    float animSpd = 0.4 + h1 * 0.6;
    float breathe = sin(u_time * 0.15 + h3 * 6.2832) * 0.02 * u_animate;

    vec3 pos = a_position + vec3(
        sin(u_time * animSpd + h1 * 6.2832) * animAmp,
        cos(u_time * animSpd * 0.7 + h2 * 6.2832) * animAmp * 0.4 + breathe,
        cos(u_time * animSpd + h1 * 6.2832) * animAmp
    );

    vec4 clipPos = u_viewProjection * vec4(pos, 1.0);
    gl_Position = clipPos;

    // ---- depth-aware point size ------------------------------------
    float projDist = max(0.5, clipPos.w);

    // Scale pulse (animated) + intensity boost
    float pulse = 1.0 + sin(u_time * 1.5 + h1 * 6.2832)
                        * 0.12 * min(1.0, a_depth) * u_animate;
    float intensityBoost = 1.0 + (u_intensity - 1.0) * 0.15;
    float depthFade = 1.0 / (1.0 + a_depth * 0.15 * (1.0 - u_animate));

    gl_PointSize = clamp(
        a_scale * pulse * intensityBoost * u_pointScale * depthFade / projDist,
        1.0,
        2048.0
    );

    // ---- bloom energy (bright splats glow more) --------------------
    float luminance = dot(a_color, vec3(0.2126, 0.7152, 0.0722));
    v_bloom = smoothstep(0.5, 1.0, luminance) * u_intensity;

    // ---- quaternion -> 2D ellipse ----------------------------------
    float qw = a_orientation.x;
    float qx = a_orientation.y;
    float qy = a_orientation.z;
    float qz = a_orientation.w;

    float sinA = 2.0 * (qw * qz + qx * qy);
    float cosA = 1.0 - 2.0 * (qy * qy + qz * qz);
    float invLen = inversesqrt(max(1e-12, sinA * sinA + cosA * cosA));
    sinA *= invLen;
    cosA *= invLen;

    float tilt   = abs(2.0 * (qw * qx + qy * qz));
    float aspect = 1.0 + tilt * 0.6;

    v_axisU = vec2(cosA, sinA) * aspect;
    v_axisV = vec2(-sinA, cosA);

    v_color = a_color;
    v_depth = a_depth;
}
`,Ot=`#version 300 es
precision highp float;

flat in vec3  v_color;
flat in float v_depth;
flat in vec2  v_axisU;
flat in vec2  v_axisV;
flat in float v_hash;
flat in float v_bloom;

uniform float u_time;
uniform float u_animate;
uniform float u_intensity;
uniform float u_chromatic;

out vec4 outColor;

void main() {
    vec2 d = gl_PointCoord - vec2(0.5);

    float u = dot(d, v_axisU);
    float v = dot(d, v_axisV);

    // True Gaussian falloff
    float r2    = u * u + v * v;
    float sigma = 0.20;
    float gauss = exp(-0.5 * r2 / (sigma * sigma));

    // HDR bloom: wider secondary Gaussian for bright splats
    float bloomSigma = 0.35;
    float bloomGauss = exp(-0.5 * r2 / (bloomSigma * bloomSigma));
    float bloomEnergy = v_bloom * 0.3;

    // Twinkle (animated) with multi-frequency shimmer
    float twinkle1 = sin(u_time * 3.0 + v_hash * 6.2832) * 0.5 + 0.5;
    float twinkle2 = sin(u_time * 7.1 + v_hash * 3.1416) * 0.5 + 0.5;
    float twinkle = mix(
        1.0,
        0.75 + 0.25 * mix(twinkle1, twinkle2, 0.3),
        u_animate * min(1.0, v_depth)
    );
    float depthAlpha = 1.0 / (1.0 + v_depth * 0.25 * (1.0 - u_animate));

    // Combine core + bloom
    float coreAlpha = gauss * depthAlpha * twinkle;
    float totalAlpha = coreAlpha + bloomGauss * bloomEnergy;

    if (totalAlpha < 0.003) discard;

    // Chromatic aberration: slight RGB offset on bloom
    vec3 color = v_color;
    if (u_chromatic > 0.01 && v_bloom > 0.1) {
        float chromaticShift = u_chromatic * 0.015 * v_bloom;
        float rOff = exp(-0.5 * ((u - chromaticShift) * (u - chromaticShift) + v * v) / (bloomSigma * bloomSigma));
        float bOff = exp(-0.5 * ((u + chromaticShift) * (u + chromaticShift) + v * v) / (bloomSigma * bloomSigma));
        color.r += rOff * bloomEnergy * 0.4;
        color.b += bOff * bloomEnergy * 0.4;
    }

    // Intensity-driven color boost (audio reactive)
    color *= (0.5 + u_intensity * 0.5);

    // Premultiplied output (works for both blend modes)
    outColor = vec4(color * totalAlpha, totalAlpha);
}
`;class at{constructor(e,{pointScale:t=14,blendMode:r="premultiplied",animate:i=!1,intensity:s=1,chromatic:n=0}={}){if(!e)throw new Error("GaussianSplatRenderer requires a WebGL2 context.");this.gl=e,this.pointScale=t,this.blendMode=r,this.animate=i,this.intensity=s,this.chromatic=n,this.program=null,this.vao=null,this.buffer=null,this.count=0,this.uniforms={},this._init()}_init(){const e=this.gl,t=e.createProgram(),r=this._compileShader(e.VERTEX_SHADER,Xt),i=this._compileShader(e.FRAGMENT_SHADER,Ot);if(e.attachShader(t,r),e.attachShader(t,i),e.linkProgram(t),!e.getProgramParameter(t,e.LINK_STATUS))throw new Error(e.getProgramInfoLog(t));this.program=t,this.vao=e.createVertexArray(),e.bindVertexArray(this.vao),this.buffer=e.createBuffer(),e.bindBuffer(e.ARRAY_BUFFER,this.buffer);const s=Me*4,n=e.getAttribLocation(t,"a_position");e.enableVertexAttribArray(n),e.vertexAttribPointer(n,3,e.FLOAT,!1,s,0);const a=e.getAttribLocation(t,"a_scale");e.enableVertexAttribArray(a),e.vertexAttribPointer(a,1,e.FLOAT,!1,s,3*4);const l=e.getAttribLocation(t,"a_orientation");e.enableVertexAttribArray(l),e.vertexAttribPointer(l,4,e.FLOAT,!1,s,4*4);const h=e.getAttribLocation(t,"a_color");e.enableVertexAttribArray(h),e.vertexAttribPointer(h,3,e.FLOAT,!1,s,8*4);const f=e.getAttribLocation(t,"a_depth");e.enableVertexAttribArray(f),e.vertexAttribPointer(f,1,e.FLOAT,!1,s,11*4),e.bindVertexArray(null),this.uniforms.pointScale=e.getUniformLocation(t,"u_pointScale"),this.uniforms.viewProjection=e.getUniformLocation(t,"u_viewProjection"),this.uniforms.time=e.getUniformLocation(t,"u_time"),this.uniforms.animate=e.getUniformLocation(t,"u_animate"),this.uniforms.intensity=e.getUniformLocation(t,"u_intensity"),this.uniforms.chromatic=e.getUniformLocation(t,"u_chromatic")}_compileShader(e,t){const r=this.gl,i=r.createShader(e);if(r.shaderSource(i,t),r.compileShader(i),!r.getShaderParameter(i,r.COMPILE_STATUS))throw new Error(r.getShaderInfoLog(i));return i}updateSeeds(e,t){const r=this.gl;r.bindBuffer(r.ARRAY_BUFFER,this.buffer),r.bufferData(r.ARRAY_BUFFER,e,r.DYNAMIC_DRAW),this.count=t}render(e,t=0){const r=this.gl;this.count&&(r.viewport(0,0,r.canvas.width,r.canvas.height),r.clearColor(.012,.02,.05,1),r.clear(r.COLOR_BUFFER_BIT|r.DEPTH_BUFFER_BIT),r.enable(r.DEPTH_TEST),r.depthFunc(r.LEQUAL),r.depthMask(!1),r.enable(r.BLEND),this.blendMode==="additive"?r.blendFunc(r.ONE,r.ONE):r.blendFunc(r.ONE,r.ONE_MINUS_SRC_ALPHA),r.useProgram(this.program),r.bindVertexArray(this.vao),r.uniform1f(this.uniforms.pointScale,this.pointScale),r.uniform1f(this.uniforms.time,t),r.uniform1f(this.uniforms.animate,this.animate?1:0),r.uniform1f(this.uniforms.intensity,this.intensity),r.uniform1f(this.uniforms.chromatic,this.chromatic),r.uniformMatrix4fv(this.uniforms.viewProjection,!1,e||It),r.drawArrays(r.POINTS,0,this.count),r.bindVertexArray(null),r.depthMask(!0),r.disable(r.BLEND))}}const Nt=`#version 300 es
precision highp float;

in vec3  a_position;
in vec3  a_normal;
in vec2  a_uv;
in vec4  a_color;

// Morph target attributes
in vec3  a_morphPosition;
in vec3  a_morphNormal;

uniform mat4  u_modelView;
uniform mat4  u_projection;
uniform mat4  u_normalMatrix;
uniform mat4  u_rotation4D;
uniform float u_projDistance;
uniform float u_use4D;
uniform float u_morphWeight;    // 0.0 = base, 1.0 = fully morphed
uniform float u_hasMorphTarget; // 0.0 = no morph, 1.0 = blend

out vec3  v_position;
out vec3  v_normal;
out vec2  v_uv;
out vec4  v_color;
out float v_depth;

void main() {
    // Morph target blending
    vec3 pos = a_position;
    vec3 nrm = a_normal;
    if (u_hasMorphTarget > 0.5) {
        pos = mix(a_position, a_morphPosition, u_morphWeight);
        nrm = normalize(mix(a_normal, a_morphNormal, u_morphWeight));
    }

    // Optional 4D rotation
    if (u_use4D > 0.5) {
        vec4 p4 = u_rotation4D * vec4(pos, 0.0);
        float w  = u_projDistance - p4.w;
        if (abs(w) < 0.0001) w = 0.0001;
        pos = p4.xyz / w;

        vec4 n4 = u_rotation4D * vec4(nrm, 0.0);
        nrm = normalize(n4.xyz);
    }

    vec4 viewPos = u_modelView * vec4(pos, 1.0);
    v_position = viewPos.xyz;
    v_normal   = normalize((u_normalMatrix * vec4(nrm, 0.0)).xyz);
    v_uv       = a_uv;
    v_color    = a_color;
    v_depth    = -viewPos.z;

    gl_Position = u_projection * viewPos;
}
`,Wt=`#version 300 es
precision highp float;

in vec3  v_position;
in vec3  v_normal;
in vec2  v_uv;
in vec4  v_color;
in float v_depth;

uniform sampler2D u_diffuseMap;
uniform float     u_hasTexture;
uniform vec3      u_lightDir;
uniform vec3      u_lightColor;
uniform vec3      u_ambientColor;
uniform float     u_specularPower;
uniform float     u_opacity;
uniform float     u_objectID;       // per-object ID (0-255 encoded as float)

layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outNormal;
layout(location = 2) out vec4 outObjectID;

void main() {
    vec4 baseColor = v_color;
    if (u_hasTexture > 0.5) {
        baseColor *= texture(u_diffuseMap, v_uv);
    }

    // Blinn-Phong
    vec3 N = normalize(v_normal);
    vec3 L = normalize(u_lightDir);
    vec3 V = normalize(-v_position);
    vec3 H = normalize(L + V);

    float NdotL = max(dot(N, L), 0.0);
    float NdotH = max(dot(N, H), 0.0);
    float spec  = pow(NdotH, u_specularPower);

    vec3 diffuse  = u_lightColor * NdotL;
    vec3 specular = u_lightColor * spec * 0.3;
    vec3 ambient  = u_ambientColor;

    vec3 finalColor = baseColor.rgb * (ambient + diffuse) + specular;

    outColor    = vec4(finalColor, baseColor.a * u_opacity);
    outNormal   = vec4(N * 0.5 + 0.5, v_depth / 100.0);
    outObjectID = vec4(u_objectID / 255.0, 0.0, 0.0, 1.0);
}
`;function jt(o,e,t){const r=o.createFramebuffer();o.bindFramebuffer(o.FRAMEBUFFER,r);const i=o.createTexture();o.bindTexture(o.TEXTURE_2D,i),o.texImage2D(o.TEXTURE_2D,0,o.RGBA8,e,t,0,o.RGBA,o.UNSIGNED_BYTE,null),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE),o.framebufferTexture2D(o.FRAMEBUFFER,o.COLOR_ATTACHMENT0,o.TEXTURE_2D,i,0);const s=o.createTexture();o.bindTexture(o.TEXTURE_2D,s);let n=o.RGBA8,a=o.UNSIGNED_BYTE;(o.getExtension("EXT_color_buffer_half_float")||o.getExtension("EXT_color_buffer_float"))&&(n=o.RGBA16F,a=o.HALF_FLOAT),o.texImage2D(o.TEXTURE_2D,0,n,e,t,0,o.RGBA,a,null),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.NEAREST),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.NEAREST),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE),o.framebufferTexture2D(o.FRAMEBUFFER,o.COLOR_ATTACHMENT1,o.TEXTURE_2D,s,0);const l=o.createTexture();o.bindTexture(o.TEXTURE_2D,l),o.texImage2D(o.TEXTURE_2D,0,o.RGBA8,e,t,0,o.RGBA,o.UNSIGNED_BYTE,null),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.NEAREST),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.NEAREST),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE),o.framebufferTexture2D(o.FRAMEBUFFER,o.COLOR_ATTACHMENT2,o.TEXTURE_2D,l,0);const h=o.createRenderbuffer();return o.bindRenderbuffer(o.RENDERBUFFER,h),o.renderbufferStorage(o.RENDERBUFFER,o.DEPTH_COMPONENT24,e,t),o.framebufferRenderbuffer(o.FRAMEBUFFER,o.DEPTH_ATTACHMENT,o.RENDERBUFFER,h),o.drawBuffers([o.COLOR_ATTACHMENT0,o.COLOR_ATTACHMENT1,o.COLOR_ATTACHMENT2]),o.bindFramebuffer(o.FRAMEBUFFER,null),{framebuffer:r,colorTexture:i,normalTexture:s,objectIDTexture:l,depthRenderbuffer:h,width:e,height:t}}function Ge(o,e){o.deleteFramebuffer(e.framebuffer),o.deleteTexture(e.colorTexture),o.deleteTexture(e.normalTexture),o.deleteTexture(e.objectIDTexture),o.deleteRenderbuffer(e.depthRenderbuffer)}class Gt{constructor(e,{lightDir:t=[.4,.8,.3],lightColor:r=[1,.98,.95],ambientColor:i=[.12,.12,.18],specularPower:s=32}={}){this.gl=e,this.lightDir=t,this.lightColor=r,this.ambientColor=i,this.specularPower=s,this.opacity=1,this.objectID=0,this.morphWeight=0,this._hasMorphTarget=!1,this._program=null,this._vao=null,this._posBuf=null,this._nrmBuf=null,this._uvBuf=null,this._colBuf=null,this._morphPosBuf=null,this._morphNrmBuf=null,this._idxBuf=null,this._indexCount=0,this._vertexCount=0,this._indexType=0,this._diffuseTexture=null,this._hasTexture=!1,this._gbuffer=null,this._gbufferWidth=0,this._gbufferHeight=0,this._uniforms={},this._init()}_init(){const e=this.gl;this._program=this._createProgram(Nt,Wt);const t=h=>e.getUniformLocation(this._program,h);this._uniforms={modelView:t("u_modelView"),projection:t("u_projection"),normalMatrix:t("u_normalMatrix"),rotation4D:t("u_rotation4D"),projDistance:t("u_projDistance"),use4D:t("u_use4D"),morphWeight:t("u_morphWeight"),hasMorphTarget:t("u_hasMorphTarget"),diffuseMap:t("u_diffuseMap"),hasTexture:t("u_hasTexture"),lightDir:t("u_lightDir"),lightColor:t("u_lightColor"),ambientColor:t("u_ambientColor"),specularPower:t("u_specularPower"),opacity:t("u_opacity"),objectID:t("u_objectID")},this._vao=e.createVertexArray(),e.bindVertexArray(this._vao),this._posBuf=e.createBuffer();const r=e.getAttribLocation(this._program,"a_position");e.bindBuffer(e.ARRAY_BUFFER,this._posBuf),e.enableVertexAttribArray(r),e.vertexAttribPointer(r,3,e.FLOAT,!1,0,0),this._nrmBuf=e.createBuffer();const i=e.getAttribLocation(this._program,"a_normal");e.bindBuffer(e.ARRAY_BUFFER,this._nrmBuf),e.enableVertexAttribArray(i),e.vertexAttribPointer(i,3,e.FLOAT,!1,0,0),this._uvBuf=e.createBuffer();const s=e.getAttribLocation(this._program,"a_uv");e.bindBuffer(e.ARRAY_BUFFER,this._uvBuf),e.enableVertexAttribArray(s),e.vertexAttribPointer(s,2,e.FLOAT,!1,0,0),this._colBuf=e.createBuffer();const n=e.getAttribLocation(this._program,"a_color");e.bindBuffer(e.ARRAY_BUFFER,this._colBuf),e.enableVertexAttribArray(n),e.vertexAttribPointer(n,4,e.FLOAT,!1,0,0),this._morphPosBuf=e.createBuffer();const a=e.getAttribLocation(this._program,"a_morphPosition");a>=0&&(e.bindBuffer(e.ARRAY_BUFFER,this._morphPosBuf),e.enableVertexAttribArray(a),e.vertexAttribPointer(a,3,e.FLOAT,!1,0,0)),this._morphNrmBuf=e.createBuffer();const l=e.getAttribLocation(this._program,"a_morphNormal");l>=0&&(e.bindBuffer(e.ARRAY_BUFFER,this._morphNrmBuf),e.enableVertexAttribArray(l),e.vertexAttribPointer(l,3,e.FLOAT,!1,0,0)),this._idxBuf=e.createBuffer(),e.bindVertexArray(null)}uploadGeometry({positions:e,normals:t,uvs:r,colors:i,indices:s}){const n=this.gl,a=e.length/3;if(this._vertexCount=a,n.bindBuffer(n.ARRAY_BUFFER,this._posBuf),n.bufferData(n.ARRAY_BUFFER,e,n.DYNAMIC_DRAW),t)n.bindBuffer(n.ARRAY_BUFFER,this._nrmBuf),n.bufferData(n.ARRAY_BUFFER,t,n.DYNAMIC_DRAW);else{const l=new Float32Array(a*3);for(let h=0;h<a;h++)l[h*3+1]=1;n.bindBuffer(n.ARRAY_BUFFER,this._nrmBuf),n.bufferData(n.ARRAY_BUFFER,l,n.DYNAMIC_DRAW)}if(r?(n.bindBuffer(n.ARRAY_BUFFER,this._uvBuf),n.bufferData(n.ARRAY_BUFFER,r,n.DYNAMIC_DRAW)):(n.bindBuffer(n.ARRAY_BUFFER,this._uvBuf),n.bufferData(n.ARRAY_BUFFER,new Float32Array(a*2),n.DYNAMIC_DRAW)),i)n.bindBuffer(n.ARRAY_BUFFER,this._colBuf),n.bufferData(n.ARRAY_BUFFER,i,n.DYNAMIC_DRAW);else{const l=new Float32Array(a*4);for(let h=0;h<a;h++)l[h*4]=1,l[h*4+1]=1,l[h*4+2]=1,l[h*4+3]=1;n.bindBuffer(n.ARRAY_BUFFER,this._colBuf),n.bufferData(n.ARRAY_BUFFER,l,n.DYNAMIC_DRAW)}n.bindBuffer(n.ARRAY_BUFFER,this._morphPosBuf),n.bufferData(n.ARRAY_BUFFER,e,n.DYNAMIC_DRAW),n.bindBuffer(n.ARRAY_BUFFER,this._morphNrmBuf),n.bufferData(n.ARRAY_BUFFER,t||new Float32Array(a*3),n.DYNAMIC_DRAW),s?(n.bindBuffer(n.ELEMENT_ARRAY_BUFFER,this._idxBuf),n.bufferData(n.ELEMENT_ARRAY_BUFFER,s,n.STATIC_DRAW),this._indexCount=s.length,this._indexType=s instanceof Uint32Array?n.UNSIGNED_INT:n.UNSIGNED_SHORT):this._indexCount=0}uploadMorphTarget(e,t){const r=this.gl;r.bindBuffer(r.ARRAY_BUFFER,this._morphPosBuf),r.bufferData(r.ARRAY_BUFFER,e,r.DYNAMIC_DRAW),t&&(r.bindBuffer(r.ARRAY_BUFFER,this._morphNrmBuf),r.bufferData(r.ARRAY_BUFFER,t,r.DYNAMIC_DRAW)),this._hasMorphTarget=!0}uploadTexture(e){const t=this.gl;this._diffuseTexture||(this._diffuseTexture=t.createTexture()),t.bindTexture(t.TEXTURE_2D,this._diffuseTexture),e instanceof ImageData?t.texImage2D(t.TEXTURE_2D,0,t.RGBA,e.width,e.height,0,t.RGBA,t.UNSIGNED_BYTE,e.data):t.texImage2D(t.TEXTURE_2D,0,t.RGBA,t.RGBA,t.UNSIGNED_BYTE,e),t.generateMipmap(t.TEXTURE_2D),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR_MIPMAP_LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.REPEAT),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.REPEAT),this._hasTexture=!0}_ensureGBuffer(e,t){this._gbuffer&&this._gbufferWidth===e&&this._gbufferHeight===t||(this._gbuffer&&Ge(this.gl,this._gbuffer),this._gbuffer=jt(this.gl,e,t),this._gbufferWidth=e,this._gbufferHeight=t)}get gbuffer(){return this._gbuffer}render(e,t,{rotation4D:r=null,projDistance:i=2,width:s=0,height:n=0,clearBuffer:a=!0}={}){const l=this.gl,h=s||l.canvas.width,f=n||l.canvas.height;if(this._ensureGBuffer(h,f),l.bindFramebuffer(l.FRAMEBUFFER,this._gbuffer.framebuffer),l.viewport(0,0,h,f),a&&(l.clearColor(0,0,0,0),l.clear(l.COLOR_BUFFER_BIT|l.DEPTH_BUFFER_BIT)),this._vertexCount===0&&this._indexCount===0)return l.bindFramebuffer(l.FRAMEBUFFER,null),this._gbuffer;l.enable(l.DEPTH_TEST),l.depthFunc(l.LEQUAL),l.depthMask(!0),l.enable(l.CULL_FACE),l.cullFace(l.BACK),l.disable(l.BLEND),l.useProgram(this._program),l.bindVertexArray(this._vao),this._indexCount>0&&l.bindBuffer(l.ELEMENT_ARRAY_BUFFER,this._idxBuf);const u=this._uniforms,d=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);return l.uniformMatrix4fv(u.modelView,!1,e||d),l.uniformMatrix4fv(u.projection,!1,t||d),l.uniformMatrix4fv(u.normalMatrix,!1,e||d),l.uniformMatrix4fv(u.rotation4D,!1,r||d),l.uniform1f(u.projDistance,i),l.uniform1f(u.use4D,r?1:0),l.uniform1f(u.morphWeight,this.morphWeight),l.uniform1f(u.hasMorphTarget,this._hasMorphTarget?1:0),l.uniform3fv(u.lightDir,this.lightDir),l.uniform3fv(u.lightColor,this.lightColor),l.uniform3fv(u.ambientColor,this.ambientColor),l.uniform1f(u.specularPower,this.specularPower),l.uniform1f(u.opacity,this.opacity),l.uniform1f(u.objectID,this.objectID),this._hasTexture&&this._diffuseTexture?(l.activeTexture(l.TEXTURE0),l.bindTexture(l.TEXTURE_2D,this._diffuseTexture),l.uniform1i(u.diffuseMap,0),l.uniform1f(u.hasTexture,1)):l.uniform1f(u.hasTexture,0),this._indexCount>0?l.drawElements(l.TRIANGLES,this._indexCount,this._indexType,0):l.drawArrays(l.TRIANGLES,0,this._vertexCount),l.bindVertexArray(null),l.bindFramebuffer(l.FRAMEBUFFER,null),l.disable(l.CULL_FACE),this._gbuffer}_createProgram(e,t){const r=this.gl,i=r.createProgram(),s=this._compile(r.VERTEX_SHADER,e),n=this._compile(r.FRAGMENT_SHADER,t);if(r.attachShader(i,s),r.attachShader(i,n),r.linkProgram(i),!r.getProgramParameter(i,r.LINK_STATUS))throw new Error("MeshRenderer link error: "+r.getProgramInfoLog(i));return i}_compile(e,t){const r=this.gl,i=r.createShader(e);if(r.shaderSource(i,t),r.compileShader(i),!r.getShaderParameter(i,r.COMPILE_STATUS))throw new Error("MeshRenderer compile error: "+r.getShaderInfoLog(i));return i}dispose(){const e=this.gl;e.deleteProgram(this._program),e.deleteVertexArray(this._vao),e.deleteBuffer(this._posBuf),e.deleteBuffer(this._nrmBuf),e.deleteBuffer(this._uvBuf),e.deleteBuffer(this._colBuf),e.deleteBuffer(this._morphPosBuf),e.deleteBuffer(this._morphNrmBuf),e.deleteBuffer(this._idxBuf),this._diffuseTexture&&e.deleteTexture(this._diffuseTexture),this._gbuffer&&Ge(e,this._gbuffer)}}const Ye=`#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
    float x = float((gl_VertexID & 1) << 2) - 1.0;
    float y = float((gl_VertexID & 2) << 1) - 1.0;
    v_uv = vec2(x, y) * 0.5 + 0.5;
    gl_Position = vec4(x, y, 0.0, 1.0);
}
`,Yt=`#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_normalDepth;  // GBuffer: rgb = normal*0.5+0.5, a = depth/100
uniform sampler2D u_objectID;     // GBuffer attachment 2: object ID (or black if N/A)
uniform vec2      u_texelSize;
uniform float     u_depthSensitivity;
uniform float     u_normalSensitivity;
uniform float     u_hasObjectID;

out vec4 outEdge;

float sampleDepth(vec2 uv) {
    return texture(u_normalDepth, uv).a;
}

vec3 sampleNormal(vec2 uv) {
    return texture(u_normalDepth, uv).rgb * 2.0 - 1.0;
}

float sampleObjectID(vec2 uv) {
    return texture(u_objectID, uv).r;
}

void main() {
    vec2 ts = u_texelSize;

    // Sobel on depth
    float d00 = sampleDepth(v_uv + vec2(-ts.x, -ts.y));
    float d10 = sampleDepth(v_uv + vec2( 0.0,  -ts.y));
    float d20 = sampleDepth(v_uv + vec2( ts.x, -ts.y));
    float d01 = sampleDepth(v_uv + vec2(-ts.x,  0.0));
    float d21 = sampleDepth(v_uv + vec2( ts.x,  0.0));
    float d02 = sampleDepth(v_uv + vec2(-ts.x,  ts.y));
    float d12 = sampleDepth(v_uv + vec2( 0.0,   ts.y));
    float d22 = sampleDepth(v_uv + vec2( ts.x,  ts.y));

    float sobelX = -d00 + d20 - 2.0*d01 + 2.0*d21 - d02 + d22;
    float sobelY = -d00 - 2.0*d10 - d20 + d02 + 2.0*d12 + d22;
    float depthEdge = sqrt(sobelX * sobelX + sobelY * sobelY) * u_depthSensitivity;

    // Normal discontinuity (dot product difference from neighbors)
    vec3 nc = sampleNormal(v_uv);
    float normalEdge = 0.0;
    normalEdge += 1.0 - max(0.0, dot(nc, sampleNormal(v_uv + vec2( ts.x, 0.0))));
    normalEdge += 1.0 - max(0.0, dot(nc, sampleNormal(v_uv + vec2(-ts.x, 0.0))));
    normalEdge += 1.0 - max(0.0, dot(nc, sampleNormal(v_uv + vec2(0.0,  ts.y))));
    normalEdge += 1.0 - max(0.0, dot(nc, sampleNormal(v_uv + vec2(0.0, -ts.y))));
    normalEdge *= u_normalSensitivity * 0.25;

    // Object ID edge (boundary between different objects)
    float objEdge = 0.0;
    if (u_hasObjectID > 0.5) {
        float centerID = sampleObjectID(v_uv);
        objEdge += abs(centerID - sampleObjectID(v_uv + vec2( ts.x, 0.0)));
        objEdge += abs(centerID - sampleObjectID(v_uv + vec2(-ts.x, 0.0)));
        objEdge += abs(centerID - sampleObjectID(v_uv + vec2(0.0,  ts.y)));
        objEdge += abs(centerID - sampleObjectID(v_uv + vec2(0.0, -ts.y)));
        objEdge = step(0.001, objEdge);  // binary: is there an ID boundary?
    }

    // Combined edge strength (silhouettes boosted by object boundaries)
    float edge = clamp(depthEdge + normalEdge + objEdge * 0.5, 0.0, 1.0);

    outEdge = vec4(edge, depthEdge, normalEdge, objEdge);
}
`,zt=`#version 300 es
precision highp float;

#define MAX_LAYERS 16

in vec2 v_uv;

uniform sampler2D u_edgeMap;      // from edge detection pass
uniform sampler2D u_normalDepth;  // GBuffer normals for pattern orientation
uniform float     u_time;
uniform int       u_layerCount;
uniform vec2      u_resolution;
uniform float     u_dpr;          // device pixel ratio for resolution scaling

// Per-layer arrays
uniform float u_layerGeometries[MAX_LAYERS];
uniform float u_layerThicknesses[MAX_LAYERS];
uniform float u_layerOpacities[MAX_LAYERS];
uniform vec3  u_layerColors[MAX_LAYERS];
uniform float u_layerPatternScales[MAX_LAYERS];
uniform float u_layerPatternSpeeds[MAX_LAYERS];

// Base 4D rotation + per-layer offsets
uniform float u_rot4dXY;
uniform float u_rot4dXZ;
uniform float u_rot4dYZ;
uniform float u_rot4dXW;
uniform float u_rot4dYW;
uniform float u_rot4dZW;
uniform float u_layerRotOffsets[MAX_LAYERS]; // angular offset per layer

// Audio-reactive inputs
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_energy;

// Global edge thickness multiplier
uniform float u_globalThickness;

out vec4 outColor;

// --- 4D rotation matrices ---
mat4 rotateXY(float a) { float c=cos(a),s=sin(a); return mat4(c,-s,0,0, s,c,0,0, 0,0,1,0, 0,0,0,1); }
mat4 rotateXZ(float a) { float c=cos(a),s=sin(a); return mat4(c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1); }
mat4 rotateYZ(float a) { float c=cos(a),s=sin(a); return mat4(1,0,0,0, 0,c,-s,0, 0,s,c,0, 0,0,0,1); }
mat4 rotateXW(float a) { float c=cos(a),s=sin(a); return mat4(c,0,0,-s, 0,1,0,0, 0,0,1,0, s,0,0,c); }
mat4 rotateYW(float a) { float c=cos(a),s=sin(a); return mat4(1,0,0,0, 0,c,0,-s, 0,0,1,0, 0,s,0,c); }
mat4 rotateZW(float a) { float c=cos(a),s=sin(a); return mat4(1,0,0,0, 0,1,0,0, 0,0,c,-s, 0,0,s,c); }

mat4 buildRotation4D(float offset) {
    // Audio modulates 4D rotation in hyperspace planes
    float audioXW = u_bass * 0.3;
    float audioYW = u_mid * 0.2;
    float audioZW = u_high * 0.4;

    return rotateXY(u_rot4dXY + offset * 0.1)
         * rotateXZ(u_rot4dXZ + offset * 0.15)
         * rotateYZ(u_rot4dYZ + offset * 0.05)
         * rotateXW(u_rot4dXW + audioXW + offset * 0.2)
         * rotateYW(u_rot4dYW + audioYW + offset * 0.12)
         * rotateZW(u_rot4dZW + audioZW + offset * 0.08);
}

// --- Procedural SDF patterns (24 VIB3 geometry variants) ---
float sdTorus(vec3 p, float R, float r) {
    vec2 q = vec2(length(p.xz) - R, p.y);
    return length(q) - r;
}

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdSphere(vec3 p, float r) { return length(p) - r; }

float sdTetrahedron(vec3 p) {
    float d = max(abs(p.x + p.y) - p.z, abs(p.x - p.y) + p.z) * 0.5;
    return max(d, -p.z - 0.5) - 0.2;
}

float sdOctahedron(vec3 p, float s) {
    p = abs(p);
    return (p.x + p.y + p.z - s) * 0.57735027;
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

float getPattern(vec3 p, float geom, float speed) {
    float t = u_time * speed;
    float energyPulse = 1.0 + u_energy * 0.3;

    // Base geometry (0-7)
    float base = mod(geom, 8.0);
    float pattern = 0.0;

    if (base < 0.5) {
        // Tetrahedron lattice
        pattern = abs(sdTetrahedron(p * 3.0 * energyPulse + vec3(sin(t), cos(t*0.7), 0.0)));
    } else if (base < 1.5) {
        // Hypercube grid
        vec3 q = fract(p * 4.0 + t * 0.1) - 0.5;
        pattern = sdBox(q, vec3(0.3));
    } else if (base < 2.5) {
        // Sphere harmonics
        float r = length(p);
        float theta = atan(p.y, p.x) + t * 0.3;
        float phi = acos(clamp(p.z / max(r, 0.001), -1.0, 1.0));
        pattern = abs(sin(theta * 3.0) * sin(phi * 4.0 + t) * cos(phi * 2.0 - t * 0.5));
    } else if (base < 3.5) {
        // Torus rings
        pattern = abs(sdTorus(p, 0.5, 0.15 + sin(t) * 0.05));
    } else if (base < 4.5) {
        // Klein bottle twist
        float a = atan(p.y, p.x) + t * 0.2;
        float r = length(p.xy);
        pattern = abs(sin(a * 3.0 + p.z * 5.0 + t) * cos(a * 2.0 - t * 0.3));
    } else if (base < 5.5) {
        // Fractal (Sierpinski-like)
        vec3 q = p * 2.0;
        float s = 1.0;
        for (int i = 0; i < 4; i++) {
            q = abs(q) - vec3(1.0, 1.0, 1.0);
            q *= 2.0; s *= 2.0;
            q -= vec3(1.0, 1.0, 1.0);
        }
        pattern = length(q) / s;
    } else if (base < 6.5) {
        // Wave interference
        pattern = sin(p.x * 8.0 + t) * sin(p.y * 8.0 + t * 0.7) * sin(p.z * 8.0 + t * 1.3);
        pattern = abs(pattern);
    } else {
        // Crystal lattice (octahedral)
        vec3 q = abs(fract(p * 3.0 + t * 0.05) - 0.5);
        float crystal = min(min(q.x, q.y), q.z);
        float octD = sdOctahedron(fract(p * 2.0) - 0.5, 0.4);
        pattern = mix(crystal, abs(octD), 0.5);
    }

    // Core type warp (8-15: hypersphere, 16-23: hypertetrahedron)
    if (geom >= 8.0 && geom < 16.0) {
        // Hopf fibration-inspired radial modulation
        float r = length(p);
        float fibAngle = atan(p.y, p.x) * 2.0 + r * 6.2832;
        pattern *= smoothstep(0.0, 1.0, 1.0 - abs(r - 0.5)) * (0.8 + 0.2 * sin(fibAngle + t));
    } else if (geom >= 16.0) {
        // Pentatope proximity warp
        float d = sdTetrahedron(p * 1.5);
        float pentD = sdOctahedron(p * 1.2, 0.6);
        pattern *= smoothstep(0.2, 0.0, abs(min(d, pentD)));
    }

    return clamp(pattern, 0.0, 1.0);
}

void main() {
    vec4 edgeData = texture(u_edgeMap, v_uv);
    float edge = edgeData.r;

    // Early exit if no edge
    if (edge < 0.01) {
        outColor = vec4(0.0);
        return;
    }

    // Resolution-aware scaling
    float resScale = max(1.0, u_dpr);

    // Accumulate inscription from all layers
    vec3 totalColor = vec3(0.0);
    float totalAlpha = 0.0;

    for (int i = 0; i < MAX_LAYERS; i++) {
        if (i >= u_layerCount) break;

        float layerT = float(i) / max(1.0, float(u_layerCount) - 1.0);
        float thickness = u_layerThicknesses[i] * u_globalThickness;

        // Adaptive edge band: silhouettes get thicker (depth edge),
        // creases get thinner (normal edge)
        float silhouetteBoost = edgeData.g * 0.3; // depth edges wider
        float creaseNarrow = edgeData.b * 0.15;    // normal edges tighter
        float adaptiveThickness = thickness * (1.0 + silhouetteBoost - creaseNarrow);

        // Edge mask for this layer
        float innerThreshold = layerT * adaptiveThickness;
        float outerThreshold = (layerT + 1.0 / float(u_layerCount)) * adaptiveThickness;

        float mask = smoothstep(innerThreshold, innerThreshold + 0.02 / resScale, edge)
                   * (1.0 - smoothstep(outerThreshold, outerThreshold + 0.02 / resScale, edge));

        if (mask < 0.001) continue;

        // Generate procedural pattern in edge-aligned UV space
        vec2 aspect = vec2(1.0, u_resolution.y / u_resolution.x);
        float pScale = u_layerPatternScales[i] * resScale;
        vec3 patternPos = vec3(
            (v_uv * 2.0 - 1.0) * aspect * pScale,
            float(i) * 0.5
        );

        // Apply 4D rotation with per-layer offset
        mat4 rot = buildRotation4D(u_layerRotOffsets[i]);
        vec4 p4 = rot * vec4(patternPos, 0.0);
        vec3 projected = p4.xyz / (2.0 - p4.w);

        // Evaluate VIB3 procedural pattern
        float pattern = getPattern(projected, u_layerGeometries[i], u_layerPatternSpeeds[i]);

        // Layer color with iridescent hue shift
        float hueShift = layerT * 0.3 + u_time * 0.05 + u_energy * 0.1;
        vec3 iridescentColor = u_layerColors[i];
        iridescentColor.r *= 0.8 + 0.2 * sin(hueShift * 6.2832);
        iridescentColor.g *= 0.8 + 0.2 * sin(hueShift * 6.2832 + 2.094);
        iridescentColor.b *= 0.8 + 0.2 * sin(hueShift * 6.2832 + 4.189);

        // Audio-reactive glow boost
        float audioGlow = u_bass * 0.3 + u_energy * 0.2;

        // Composite inscription
        float alpha = mask * pattern * u_layerOpacities[i];
        vec3 color = iridescentColor * (0.6 + pattern * 0.4);

        // Glow at edge peak (boosted by audio)
        float glowStrength = smoothstep(0.3, 0.8, edge) * pattern * (0.5 + audioGlow);
        color += vec3(glowStrength) * u_layerColors[i];

        // Additive accumulation
        totalColor += color * alpha;
        totalAlpha += alpha;
    }

    totalAlpha = clamp(totalAlpha, 0.0, 1.0);
    outColor = vec4(totalColor, totalAlpha);
}
`;function ze(o,e,t){const r=o.createTexture();o.bindTexture(o.TEXTURE_2D,r),o.texImage2D(o.TEXTURE_2D,0,o.RGBA8,e,t,0,o.RGBA,o.UNSIGNED_BYTE,null),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE);const i=o.createFramebuffer();return o.bindFramebuffer(o.FRAMEBUFFER,i),o.framebufferTexture2D(o.FRAMEBUFFER,o.COLOR_ATTACHMENT0,o.TEXTURE_2D,r,0),o.bindFramebuffer(o.FRAMEBUFFER,null),{framebuffer:i,texture:r,width:e,height:t}}function ee(o,e){o.deleteFramebuffer(e.framebuffer),o.deleteTexture(e.texture)}const Ve=[[.2,.6,1],[.8,.3,1],[1,.5,.2],[.3,1,.6],[1,.2,.5],[.4,.9,.9],[.9,.8,.2],[.5,.3,1],[.2,1,.4],[1,.4,0],[.6,.2,.9],[0,.8,.8],[1,.6,.6],[.3,.5,1],[.8,1,.3],[.9,.3,.6]];function ke(o,e){const t=e>1?o/(e-1):0;return{geometry:o*3%24,thickness:.3+t*.5,opacity:.9-t*.5,color:Ve[o%Ve.length],patternScale:3+o*.5,patternSpeed:.3+o*.05,rotOffset:o*.4}}class Vt{constructor(e,{layerCount:t=4,depthSensitivity:r=8,normalSensitivity:i=2,globalThickness:s=.6,layers:n=null}={}){if(this.gl=e,this.layerCount=Math.min(16,Math.max(1,t)),this.depthSensitivity=r,this.normalSensitivity=i,this.globalThickness=s,this.rot4dXY=0,this.rot4dXZ=0,this.rot4dYZ=0,this.rot4dXW=0,this.rot4dYW=0,this.rot4dZW=0,this.bass=0,this.mid=0,this.high=0,this.energy=0,this.layers=n||[],this.layers.length===0)for(let a=0;a<this.layerCount;a++)this.layers.push(ke(a,this.layerCount));this._edgeProgram=null,this._inscriptionProgram=null,this._quadVao=null,this._edgeFBO=null,this._compositeFBO=null,this._width=0,this._height=0,this._blackTexture=null,this._edgeUniforms={},this._inscUniforms={},this._init()}_init(){const e=this.gl;this._edgeProgram=this._createProgram(Ye,Yt),this._inscriptionProgram=this._createProgram(Ye,zt),this._quadVao=e.createVertexArray(),this._blackTexture=e.createTexture(),e.bindTexture(e.TEXTURE_2D,this._blackTexture),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,new Uint8Array([0,0,0,0])),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),this._cacheEdgeUniforms(),this._cacheInscriptionUniforms()}_cacheEdgeUniforms(){const e=this.gl,t=this._edgeProgram;this._edgeUniforms={normalDepth:e.getUniformLocation(t,"u_normalDepth"),objectID:e.getUniformLocation(t,"u_objectID"),texelSize:e.getUniformLocation(t,"u_texelSize"),depthSensitivity:e.getUniformLocation(t,"u_depthSensitivity"),normalSensitivity:e.getUniformLocation(t,"u_normalSensitivity"),hasObjectID:e.getUniformLocation(t,"u_hasObjectID")}}_cacheInscriptionUniforms(){const e=this.gl,t=this._inscriptionProgram,r=i=>e.getUniformLocation(t,i);this._inscUniforms={edgeMap:r("u_edgeMap"),normalDepth:r("u_normalDepth"),time:r("u_time"),layerCount:r("u_layerCount"),resolution:r("u_resolution"),dpr:r("u_dpr"),globalThickness:r("u_globalThickness"),rot4dXY:r("u_rot4dXY"),rot4dXZ:r("u_rot4dXZ"),rot4dYZ:r("u_rot4dYZ"),rot4dXW:r("u_rot4dXW"),rot4dYW:r("u_rot4dYW"),rot4dZW:r("u_rot4dZW"),bass:r("u_bass"),mid:r("u_mid"),high:r("u_high"),energy:r("u_energy"),geometries:[],thicknesses:[],opacities:[],colors:[],patternScales:[],patternSpeeds:[],rotOffsets:[]};for(let i=0;i<16;i++)this._inscUniforms.geometries[i]=r(`u_layerGeometries[${i}]`),this._inscUniforms.thicknesses[i]=r(`u_layerThicknesses[${i}]`),this._inscUniforms.opacities[i]=r(`u_layerOpacities[${i}]`),this._inscUniforms.colors[i]=r(`u_layerColors[${i}]`),this._inscUniforms.patternScales[i]=r(`u_layerPatternScales[${i}]`),this._inscUniforms.patternSpeeds[i]=r(`u_layerPatternSpeeds[${i}]`),this._inscUniforms.rotOffsets[i]=r(`u_layerRotOffsets[${i}]`)}_ensureFBOs(e,t){if(this._width===e&&this._height===t)return;const r=this.gl;this._edgeFBO&&ee(r,this._edgeFBO),this._compositeFBO&&ee(r,this._compositeFBO),this._edgeFBO=ze(r,e,t),this._compositeFBO=ze(r,e,t),this._width=e,this._height=t}setLayerCount(e){for(e=Math.min(16,Math.max(1,e));this.layers.length<e;)this.layers.push(ke(this.layers.length,e));this.layerCount=e}setLayerConfig(e,t){e>=0&&e<this.layers.length&&Object.assign(this.layers[e],t)}setAudio(e,t,r,i){this.bass=e||0,this.mid=t||0,this.high=r||0,this.energy=i||0}render(e,t,{width:r=0,height:i=0,objectIDTexture:s=null,dpr:n=1}={}){const a=this.gl,l=r||a.canvas.width,h=i||a.canvas.height;this._ensureFBOs(l,h),a.bindFramebuffer(a.FRAMEBUFFER,this._edgeFBO.framebuffer),a.viewport(0,0,l,h),a.disable(a.DEPTH_TEST),a.disable(a.BLEND),a.useProgram(this._edgeProgram),a.bindVertexArray(this._quadVao);const f=this._edgeUniforms;a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,e),a.uniform1i(f.normalDepth,0),a.activeTexture(a.TEXTURE1),a.bindTexture(a.TEXTURE_2D,s||this._blackTexture),a.uniform1i(f.objectID,1),a.uniform2f(f.texelSize,1/l,1/h),a.uniform1f(f.depthSensitivity,this.depthSensitivity),a.uniform1f(f.normalSensitivity,this.normalSensitivity),a.uniform1f(f.hasObjectID,s?1:0),a.drawArrays(a.TRIANGLES,0,3),a.bindFramebuffer(a.FRAMEBUFFER,this._compositeFBO.framebuffer),a.viewport(0,0,l,h),a.clearColor(0,0,0,0),a.clear(a.COLOR_BUFFER_BIT),a.disable(a.BLEND),a.useProgram(this._inscriptionProgram),a.bindVertexArray(this._quadVao);const u=this._inscUniforms;a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,this._edgeFBO.texture),a.uniform1i(u.edgeMap,0),a.activeTexture(a.TEXTURE1),a.bindTexture(a.TEXTURE_2D,e),a.uniform1i(u.normalDepth,1),a.uniform1f(u.time,t),a.uniform1i(u.layerCount,this.layerCount),a.uniform2f(u.resolution,l,h),a.uniform1f(u.dpr,n),a.uniform1f(u.globalThickness,this.globalThickness),a.uniform1f(u.rot4dXY,this.rot4dXY),a.uniform1f(u.rot4dXZ,this.rot4dXZ),a.uniform1f(u.rot4dYZ,this.rot4dYZ),a.uniform1f(u.rot4dXW,this.rot4dXW),a.uniform1f(u.rot4dYW,this.rot4dYW),a.uniform1f(u.rot4dZW,this.rot4dZW),a.uniform1f(u.bass,this.bass),a.uniform1f(u.mid,this.mid),a.uniform1f(u.high,this.high),a.uniform1f(u.energy,this.energy);for(let d=0;d<this.layerCount;d++){const p=this.layers[d];a.uniform1f(u.geometries[d],p.geometry),a.uniform1f(u.thicknesses[d],p.thickness),a.uniform1f(u.opacities[d],p.opacity),a.uniform3fv(u.colors[d],p.color),a.uniform1f(u.patternScales[d],p.patternScale),a.uniform1f(u.patternSpeeds[d],p.patternSpeed),a.uniform1f(u.rotOffsets[d],p.rotOffset)}return a.drawArrays(a.TRIANGLES,0,3),a.bindFramebuffer(a.FRAMEBUFFER,null),this._compositeFBO}get edgeTexture(){return this._edgeFBO?this._edgeFBO.texture:null}get compositeTexture(){return this._compositeFBO?this._compositeFBO.texture:null}_createProgram(e,t){const r=this.gl,i=r.createProgram(),s=this._compile(r.VERTEX_SHADER,e),n=this._compile(r.FRAGMENT_SHADER,t);if(r.attachShader(i,s),r.attachShader(i,n),r.linkProgram(i),!r.getProgramParameter(i,r.LINK_STATUS))throw new Error("EdgeInscriptionLayer link error: "+r.getProgramInfoLog(i));return i}_compile(e,t){const r=this.gl,i=r.createShader(e);if(r.shaderSource(i,t),r.compileShader(i),!r.getShaderParameter(i,r.COMPILE_STATUS))throw new Error("EdgeInscriptionLayer compile error: "+r.getShaderInfoLog(i));return i}dispose(){const e=this.gl;e.deleteProgram(this._edgeProgram),e.deleteProgram(this._inscriptionProgram),e.deleteVertexArray(this._quadVao),e.deleteTexture(this._blackTexture),this._edgeFBO&&ee(e,this._edgeFBO),this._compositeFBO&&ee(e,this._compositeFBO)}}const He=`#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
    float x = float((gl_VertexID & 1) << 2) - 1.0;
    float y = float((gl_VertexID & 2) << 1) - 1.0;
    v_uv = vec2(x, y) * 0.5 + 0.5;
    gl_Position = vec4(x, y, 0.0, 1.0);
}
`,kt=`#version 300 es
precision highp float;

in vec2 v_uv;

// Layer textures
uniform sampler2D u_meshLayer;         // Layer 0: mesh color
uniform sampler2D u_splatLayer;        // Layer 1: splat color
uniform sampler2D u_proceduralLayer;   // Layer 2: procedural VIB3
uniform sampler2D u_inscriptionLayer;  // Layer 3: edge inscription

// Per-layer control
uniform float u_meshOpacity;
uniform float u_splatOpacity;
uniform float u_proceduralOpacity;
uniform float u_inscriptionOpacity;

uniform float u_meshEnabled;
uniform float u_splatEnabled;
uniform float u_proceduralEnabled;
uniform float u_inscriptionEnabled;

// Blend modes: 0 = alpha, 1 = additive, 2 = multiply, 3 = screen
uniform float u_meshBlend;
uniform float u_splatBlend;
uniform float u_proceduralBlend;
uniform float u_inscriptionBlend;

// Global post-process
uniform float u_exposure;
uniform float u_gamma;

out vec4 outColor;

vec3 blendLayers(vec3 base, vec4 layer, float mode) {
    vec3 lc = layer.rgb;
    float la = layer.a;

    if (la < 0.001) return base;

    if (mode < 0.5) {
        // Alpha blend
        return mix(base, lc, la);
    } else if (mode < 1.5) {
        // Additive
        return base + lc * la;
    } else if (mode < 2.5) {
        // Multiply
        return mix(base, base * lc, la);
    } else {
        // Screen
        return mix(base, 1.0 - (1.0 - base) * (1.0 - lc), la);
    }
}

void main() {
    vec3 color = vec3(0.012, 0.02, 0.05);   // base background

    // Layer 0: Mesh (base)
    if (u_meshEnabled > 0.5) {
        vec4 mesh = texture(u_meshLayer, v_uv);
        mesh.a *= u_meshOpacity;
        color = blendLayers(color, mesh, u_meshBlend);
    }

    // Layer 1: Splats
    if (u_splatEnabled > 0.5) {
        vec4 splat = texture(u_splatLayer, v_uv);
        splat.a *= u_splatOpacity;
        color = blendLayers(color, splat, u_splatBlend);
    }

    // Layer 2: Procedural
    if (u_proceduralEnabled > 0.5) {
        vec4 proc = texture(u_proceduralLayer, v_uv);
        proc.a *= u_proceduralOpacity;
        color = blendLayers(color, proc, u_proceduralBlend);
    }

    // Layer 3: Edge Inscription (always additive by default for glow)
    if (u_inscriptionEnabled > 0.5) {
        vec4 insc = texture(u_inscriptionLayer, v_uv);
        insc.a *= u_inscriptionOpacity;
        color = blendLayers(color, insc, u_inscriptionBlend);
    }

    // Tone mapping (simple Reinhard)
    color *= u_exposure;
    color = color / (color + vec3(1.0));

    // Gamma correction
    color = pow(color, vec3(1.0 / u_gamma));

    outColor = vec4(color, 1.0);
}
`,Ht=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 outColor;
void main() {
    outColor = texture(u_texture, v_uv);
}
`;function qe(o,e,t){const r=o.createTexture();o.bindTexture(o.TEXTURE_2D,r),o.texImage2D(o.TEXTURE_2D,0,o.RGBA8,e,t,0,o.RGBA,o.UNSIGNED_BYTE,null),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE);const i=o.createRenderbuffer();o.bindRenderbuffer(o.RENDERBUFFER,i),o.renderbufferStorage(o.RENDERBUFFER,o.DEPTH_COMPONENT24,e,t);const s=o.createFramebuffer();return o.bindFramebuffer(o.FRAMEBUFFER,s),o.framebufferTexture2D(o.FRAMEBUFFER,o.COLOR_ATTACHMENT0,o.TEXTURE_2D,r,0),o.framebufferRenderbuffer(o.FRAMEBUFFER,o.DEPTH_ATTACHMENT,o.RENDERBUFFER,i),o.bindFramebuffer(o.FRAMEBUFFER,null),{framebuffer:s,texture:r,depthRb:i,width:e,height:t}}function te(o,e){o.deleteFramebuffer(e.framebuffer),o.deleteTexture(e.texture),o.deleteRenderbuffer(e.depthRb)}const he=Object.freeze({ALPHA:0,ADDITIVE:1,MULTIPLY:2,SCREEN:3});function re(o={}){return{enabled:!0,opacity:1,blendMode:he.ALPHA,...o}}class qt{constructor(e,{exposure:t=1.2,gamma:r=2.2}={}){this.gl=e,this.exposure=t,this.gamma=r,this._meshRenderer=null,this._sceneRenderer=null,this._splatRenderer=null,this._proceduralRenderer=null,this._edgeInscription=null,this._inscriptionChannel=null,this._dpr=1,this.meshLayer=re(),this.splatLayer=re({blendMode:he.ADDITIVE,opacity:.9}),this.proceduralLayer=re({blendMode:he.SCREEN,opacity:.5}),this.inscriptionLayer=re({blendMode:he.ADDITIVE,opacity:.8}),this._compositeProgram=null,this._blitProgram=null,this._quadVao=null,this._splatFBO=null,this._proceduralFBO=null,this._width=0,this._height=0,this._blackTexture=null,this._init()}_init(){const e=this.gl;this._compositeProgram=this._createProgram(He,kt),this._blitProgram=this._createProgram(He,Ht),this._quadVao=e.createVertexArray(),this._blackTexture=e.createTexture(),e.bindTexture(e.TEXTURE_2D,this._blackTexture),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,new Uint8Array([0,0,0,0])),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST)}_ensureFBOs(e,t){if(this._width===e&&this._height===t)return;const r=this.gl;this._splatFBO&&te(r,this._splatFBO),this._proceduralFBO&&te(r,this._proceduralFBO),this._splatFBO=qe(r,e,t),this._proceduralFBO=qe(r,e,t),this._width=e,this._height=t}setMeshRenderer(e){this._meshRenderer=e}setSceneRenderer(e){this._sceneRenderer=e}setSplatRenderer(e){this._splatRenderer=e}setProceduralRenderer(e){this._proceduralRenderer=e}setEdgeInscription(e){this._edgeInscription=e}setInscriptionChannel(e){this._inscriptionChannel=e}setDPR(e){this._dpr=e}render(e,t,r,{viewProjection:i=null,rotation4D:s=null,projDistance:n=2}={}){const a=this.gl,l=a.canvas.width,h=a.canvas.height;this._ensureFBOs(l,h);const f={meshRendered:!1,splatRendered:!1,proceduralRendered:!1,inscriptionRendered:!1,layersComposited:0};let u=this._blackTexture,d=this._blackTexture,p=this._blackTexture,g=this._blackTexture,_=null,v=null,T=null;if(this._sceneRenderer&&this.meshLayer.enabled){const E=this._sceneRenderer.render(t,r,{rotation4D:s,projDistance:n,width:l,height:h});T=E.gbuffer,T&&(u=T.colorTexture,_=T.normalTexture,v=T.objectIDTexture||null,f.meshRendered=!0,f.objectCount=E.objectCount)}else if(this._meshRenderer&&this.meshLayer.enabled){const E=this._meshRenderer.render(t,r,{rotation4D:s,projDistance:n,width:l,height:h});T=E,u=E.colorTexture,_=E.normalTexture,v=E.objectIDTexture||null,f.meshRendered=!0}if(this._splatRenderer&&this.splatLayer.enabled){a.bindFramebuffer(a.FRAMEBUFFER,this._splatFBO.framebuffer),a.viewport(0,0,l,h),a.clearColor(0,0,0,0),a.clear(a.COLOR_BUFFER_BIT|a.DEPTH_BUFFER_BIT),f.meshRendered&&T&&(a.bindFramebuffer(a.READ_FRAMEBUFFER,T.framebuffer),a.bindFramebuffer(a.DRAW_FRAMEBUFFER,this._splatFBO.framebuffer),a.blitFramebuffer(0,0,l,h,0,0,l,h,a.DEPTH_BUFFER_BIT,a.NEAREST),a.bindFramebuffer(a.FRAMEBUFFER,this._splatFBO.framebuffer));const E=i||new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),b=this._splatFBO.framebuffer;a.bindFramebuffer(a.FRAMEBUFFER,b),a.viewport(0,0,l,h),this._splatRenderer.render&&(this._splatRenderer.render(E,e),a.bindFramebuffer(a.FRAMEBUFFER,this._splatFBO.framebuffer),this._splatRenderer._drawSplats&&(a.viewport(0,0,l,h),a.clearColor(0,0,0,0),a.clear(a.COLOR_BUFFER_BIT),this._splatRenderer._drawSplats(E,e))),d=this._splatFBO.texture,f.splatRendered=!0}if(this._proceduralRenderer&&this.proceduralLayer.enabled&&(a.bindFramebuffer(a.FRAMEBUFFER,this._proceduralFBO.framebuffer),a.viewport(0,0,l,h),a.clearColor(0,0,0,0),a.clear(a.COLOR_BUFFER_BIT),this._proceduralRenderer(this._proceduralFBO,e),p=this._proceduralFBO.texture,f.proceduralRendered=!0),this._edgeInscription&&this.inscriptionLayer.enabled&&_){if(this._inscriptionChannel){const b=this._inscriptionChannel.registeredObjects,y=b.length>0?b[0]:0;this._inscriptionChannel.applyToLayer(this._edgeInscription,y)}g=this._edgeInscription.render(_,e,{width:l,height:h,objectIDTexture:v,dpr:this._dpr}).texture,f.inscriptionRendered=!0}a.bindFramebuffer(a.FRAMEBUFFER,null),a.viewport(0,0,l,h),a.disable(a.DEPTH_TEST),a.disable(a.BLEND),a.useProgram(this._compositeProgram),a.bindVertexArray(this._quadVao);const m=this._compositeProgram;return a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,u),a.uniform1i(a.getUniformLocation(m,"u_meshLayer"),0),a.activeTexture(a.TEXTURE1),a.bindTexture(a.TEXTURE_2D,d),a.uniform1i(a.getUniformLocation(m,"u_splatLayer"),1),a.activeTexture(a.TEXTURE2),a.bindTexture(a.TEXTURE_2D,p),a.uniform1i(a.getUniformLocation(m,"u_proceduralLayer"),2),a.activeTexture(a.TEXTURE3),a.bindTexture(a.TEXTURE_2D,g),a.uniform1i(a.getUniformLocation(m,"u_inscriptionLayer"),3),a.uniform1f(a.getUniformLocation(m,"u_meshOpacity"),this.meshLayer.opacity),a.uniform1f(a.getUniformLocation(m,"u_splatOpacity"),this.splatLayer.opacity),a.uniform1f(a.getUniformLocation(m,"u_proceduralOpacity"),this.proceduralLayer.opacity),a.uniform1f(a.getUniformLocation(m,"u_inscriptionOpacity"),this.inscriptionLayer.opacity),a.uniform1f(a.getUniformLocation(m,"u_meshEnabled"),this.meshLayer.enabled&&f.meshRendered?1:0),a.uniform1f(a.getUniformLocation(m,"u_splatEnabled"),this.splatLayer.enabled&&f.splatRendered?1:0),a.uniform1f(a.getUniformLocation(m,"u_proceduralEnabled"),this.proceduralLayer.enabled&&f.proceduralRendered?1:0),a.uniform1f(a.getUniformLocation(m,"u_inscriptionEnabled"),this.inscriptionLayer.enabled&&f.inscriptionRendered?1:0),a.uniform1f(a.getUniformLocation(m,"u_meshBlend"),this.meshLayer.blendMode),a.uniform1f(a.getUniformLocation(m,"u_splatBlend"),this.splatLayer.blendMode),a.uniform1f(a.getUniformLocation(m,"u_proceduralBlend"),this.proceduralLayer.blendMode),a.uniform1f(a.getUniformLocation(m,"u_inscriptionBlend"),this.inscriptionLayer.blendMode),a.uniform1f(a.getUniformLocation(m,"u_exposure"),this.exposure),a.uniform1f(a.getUniformLocation(m,"u_gamma"),this.gamma),a.drawArrays(a.TRIANGLES,0,3),f.layersComposited=(f.meshRendered?1:0)+(f.splatRendered?1:0)+(f.proceduralRendered?1:0)+(f.inscriptionRendered?1:0),f}renderSplatOnly(e,t){this._splatRenderer&&this._splatRenderer.render(e,t)}_createProgram(e,t){const r=this.gl,i=r.createProgram(),s=this._compile(r.VERTEX_SHADER,e),n=this._compile(r.FRAGMENT_SHADER,t);if(r.attachShader(i,s),r.attachShader(i,n),r.linkProgram(i),!r.getProgramParameter(i,r.LINK_STATUS))throw new Error("HybridRenderPipeline link error: "+r.getProgramInfoLog(i));return i}_compile(e,t){const r=this.gl,i=r.createShader(e);if(r.shaderSource(i,t),r.compileShader(i),!r.getShaderParameter(i,r.COMPILE_STATUS))throw new Error("HybridRenderPipeline compile error: "+r.getShaderInfoLog(i));return i}dispose(){const e=this.gl;e.deleteProgram(this._compositeProgram),e.deleteProgram(this._blitProgram),e.deleteVertexArray(this._quadVao),e.deleteTexture(this._blackTexture),this._splatFBO&&te(e,this._splatFBO),this._proceduralFBO&&te(e,this._proceduralFBO)}}function Z(o,e,t){return .2126*o+.7152*e+.0722*t}function be(o,e,t,r,i){const s=(l,h)=>{const f=Math.min(e-1,Math.max(0,r+l)),u=Math.min(t-1,Math.max(0,i+h));return o[u*e+f]},n=-s(-1,-1)+s(1,-1)-2*s(-1,0)+2*s(1,0)-s(-1,1)+s(1,1),a=-s(-1,-1)-2*s(0,-1)-s(1,-1)+s(-1,1)+2*s(0,1)+s(1,1);return Math.sqrt(n*n+a*a)}function Ze(o,e,t,r,i){const s=1-r-i;return[o[0]*s+e[0]*r+t[0]*i,o[1]*s+e[1]*r+t[1]*i,o[2]*s+e[2]*r+t[2]*i]}function $e(o,e,t,r,i){const s=1-r-i;return[o[0]*s+e[0]*r+t[0]*i,o[1]*s+e[1]*r+t[1]*i]}function ye(o,e,t,r,i){r=r-Math.floor(r),i=i-Math.floor(i);const s=r*(e-1),n=i*(t-1),a=Math.floor(s),l=Math.floor(n),h=Math.min(e-1,a+1),f=Math.min(t-1,l+1),u=s-a,d=n-l,p=(R,S)=>(S*e+R)*4,g=p(a,l),_=p(h,l),v=p(a,f),T=p(h,f),m=(o[g]*(1-u)*(1-d)+o[_]*u*(1-d)+o[v]*(1-u)*d+o[T]*u*d)/255,E=(o[g+1]*(1-u)*(1-d)+o[_+1]*u*(1-d)+o[v+1]*(1-u)*d+o[T+1]*u*d)/255,b=(o[g+2]*(1-u)*(1-d)+o[_+2]*u*(1-d)+o[v+2]*(1-u)*d+o[T+2]*u*d)/255,y=(o[g+3]*(1-u)*(1-d)+o[_+3]*u*(1-d)+o[v+3]*(1-u)*d+o[T+3]*u*d)/255;return[m,E,b,y]}function de(o){const e=Math.sqrt(o[0]*o[0]+o[1]*o[1]+o[2]*o[2]);return e>1e-8&&(o[0]/=e,o[1]/=e,o[2]/=e),o}function st(o,e){return[o[1]*e[2]-o[2]*e[1],o[2]*e[0]-o[0]*e[2],o[0]*e[1]-o[1]*e[0]]}function Zt(o){const e=de([...o]),t=[0,0,1],r=e[0]*t[0]+e[1]*t[1]+e[2]*t[2];let i=t;Math.abs(r)>.999&&(i=[0,1,0]);const s=de(st(i,e)),a=Math.acos(Math.max(-1,Math.min(1,r)))*.5,l=Math.sin(a);return[Math.cos(a),s[0]*l,s[1]*l,s[2]*l]}class $t{constructor(){this.samplesPerTriangle=8,this.edgeBoostFactor=4,this.edgeThreshold=.1,this.baseScale=.04,this.jitter=.3,this.alphaThreshold=.1,this.normalInfluence=.8,this.specularToDepth=2}convert({positions:e,normals:t,uvs:r,indices:i,diffusePixels:s,diffuseWidth:n,diffuseHeight:a,normalPixels:l=null,normalWidth:h=0,normalHeight:f=0,specularPixels:u=null,specularWidth:d=0,specularHeight:p=0}){const g=new Float32Array(n*a);for(let m=0;m<n*a;m++)g[m]=Z(s[m*4]/255,s[m*4+1]/255,s[m*4+2]/255);const _=new Float32Array(n*a);for(let m=0;m<a;m++)for(let E=0;E<n;E++)_[m*n+E]=be(g,n,a,E,m);const v=[],T=i.length/3;for(let m=0;m<T;m++){const E=i[m*3],b=i[m*3+1],y=i[m*3+2],R=[e[E*3],e[E*3+1],e[E*3+2]],S=[e[b*3],e[b*3+1],e[b*3+2]],w=[e[y*3],e[y*3+1],e[y*3+2]],G=[t[E*3],t[E*3+1],t[E*3+2]],pt=[t[b*3],t[b*3+1],t[b*3+2]],_t=[t[y*3],t[y*3+1],t[y*3+2]],Be=[r[E*2],r[E*2+1]],we=[r[b*2],r[b*2+1]],Ue=[r[y*2],r[y*2+1]],gt=[S[0]-R[0],S[1]-R[1],S[2]-R[2]],Et=[w[0]-R[0],w[1]-R[1],w[2]-R[2]],Y=st(gt,Et),Tt=.5*Math.sqrt(Y[0]*Y[0]+Y[1]*Y[1]+Y[2]*Y[2]),vt=Math.max(1,Math.round(this.samplesPerTriangle*Math.sqrt(Tt))),Le=$e(Be,we,Ue,1/3,1/3),bt=Math.min(n-1,Math.max(0,Math.floor(Le[0]*n))),yt=Math.min(a-1,Math.max(0,Math.floor(Le[1]*a))),Ce=_[yt*n+bt],xt=Ce>this.edgeThreshold?Math.round(this.edgeBoostFactor*(Ce/1)):0,Rt=vt+xt;for(let Ie=0;Ie<Rt;Ie++){let D=Math.random(),U=Math.random();D+U>1&&(D=1-D,U=1-U),D+=(Math.random()-.5)*this.jitter*.1,U+=(Math.random()-.5)*this.jitter*.1,D=Math.max(0,Math.min(1,D)),U=Math.max(0,Math.min(1-D,U));const _e=Ze(R,S,w,D,U),At=de(Ze(G,pt,_t,D,U)),I=$e(Be,we,Ue,D,U),[Xe,Oe,Ne,St]=ye(s,n,a,I[0],I[1]);if(St<this.alphaThreshold)continue;let X=[...At];if(l){const[Ee,Te,ve]=ye(l,h,f,I[0],I[1]),Bt=Ee*2-1,wt=Te*2-1,Ut=ve*2-1;X[0]+=Bt*this.normalInfluence,X[1]+=wt*this.normalInfluence,X[2]+=Ut*this.normalInfluence,de(X)}const Ft=Zt(X);let We=0;if(u){const[Ee,Te,ve]=ye(u,d,p,I[0],I[1]);We=Z(Ee,Te,ve)*this.specularToDepth}const Mt=Z(Xe,Oe,Ne),Dt=be(g,n,a,Math.floor(I[0]*n)%n,Math.floor(I[1]*a)%a),Pt=1-Math.min(1,Dt*2),je=this.baseScale*(.5+Mt*.5)*(.4+Pt*.6),ge=je*.1;v.push({position:[_e[0]+X[0]*ge,_e[1]+X[1]*ge,_e[2]+X[2]*ge],orientation:Ft,scale:je,color:[Xe,Oe,Ne],depth:We})}}return v}convertFromImages({positions:e,normals:t,uvs:r,indices:i,diffuseImage:s,normalImage:n,specularImage:a}){const l=d=>{if(!d)return null;const p=document.createElement("canvas"),g=d.naturalWidth||d.width,_=d.naturalHeight||d.height;p.width=g,p.height=_;const v=p.getContext("2d");return v.drawImage(d,0,0),{pixels:v.getImageData(0,0,g,_).data,width:g,height:_}},h=l(s),f=l(n),u=l(a);return this.convert({positions:e,normals:t,uvs:r,indices:i,diffusePixels:h.pixels,diffuseWidth:h.width,diffuseHeight:h.height,...f?{normalPixels:f.pixels,normalWidth:f.width,normalHeight:f.height}:{},...u?{specularPixels:u.pixels,specularWidth:u.width,specularHeight:u.height}:{}})}convertFlat(e,t,r,i={}){const s=i.gridStep||3,n=i.scale||this.baseScale,a=i.depthFromLum||1,l=new Float32Array(t*r);for(let u=0;u<t*r;u++)l[u]=Z(e[u*4]/255,e[u*4+1]/255,e[u*4+2]/255);const h=t/r,f=[];for(let u=0;u<r;u+=s)for(let d=0;d<t;d+=s){const p=(u*t+d)*4;if(e[p+3]/255<this.alphaThreshold)continue;const g=e[p]/255,_=e[p+1]/255,v=e[p+2]/255,T=Z(g,_,v),m=be(l,t,r,d,u),E=1+(m>this.edgeThreshold?this.edgeBoostFactor:0),b=(1-T)*a,y=(d/t-.5)*2*h,R=-(u/r-.5)*2;for(let S=0;S<E;S++){const w=(Math.random()-.5)*this.jitter*(s/t)*2*h,G=(Math.random()-.5)*this.jitter*(s/r)*2;f.push({position:[y+w,R+G,b+(Math.random()-.5)*.05],orientation:[1,0,0,0],scale:n*(.5+T*.5)*(1-Math.min(1,m)*.5),color:[g,_,v],depth:b*.3})}}return f}}const z={idle:{priority:0,opacityMultiplier:.3,thicknessMultiplier:.5,speedMultiplier:.5,glowIntensity:.1,colorShift:[0,0,0],rotationSpeed:.1,patternOverride:null},active:{priority:1,opacityMultiplier:.8,thicknessMultiplier:1,speedMultiplier:1,glowIntensity:.5,colorShift:[.1,.1,.2],rotationSpeed:.3,patternOverride:null},selected:{priority:2,opacityMultiplier:1,thicknessMultiplier:1.2,speedMultiplier:.8,glowIntensity:.8,colorShift:[0,.2,.3],rotationSpeed:.5,patternOverride:7},powered:{priority:2,opacityMultiplier:1,thicknessMultiplier:1.5,speedMultiplier:1.5,glowIntensity:1,colorShift:[.3,0,.5],rotationSpeed:1,patternOverride:6},damaged:{priority:3,opacityMultiplier:.9,thicknessMultiplier:.8,speedMultiplier:2,glowIntensity:.7,colorShift:[.5,-.2,-.2],rotationSpeed:2,patternOverride:5},destroyed:{priority:4,opacityMultiplier:.4,thicknessMultiplier:2,speedMultiplier:3,glowIntensity:.3,colorShift:[.3,-.1,-.3],rotationSpeed:3,patternOverride:5}};function Kt(o,e=4){const t=i=>{let s=i*2654435761;return s=(s>>>16^s)*2246822507,s=(s>>>16^s)*3266489909,s=s>>>16^s,(s&2147483647)/2147483647},r=[];for(let i=0;i<e;i++){const s=o*1e3+i;r.push({geometry:Math.floor(t(s)*24),thickness:.3+t(s+100)*.4,opacity:.7+t(s+200)*.3,color:[.3+t(s+300)*.7,.3+t(s+400)*.7,.3+t(s+500)*.7],patternScale:2+t(s+600)*4,patternSpeed:.2+t(s+700)*.4,rotOffset:t(s+800)*Math.PI*2})}return{layers:r,baseRotationSpeed:t(o*31)*.5,baseHue:t(o*47)*360}}const F={bass:{rot4dXW:.5,thickness:.3},mid:{rot4dYW:.3,speed:.5},high:{rot4dZW:.6,patternScale:.3,hueShift:30},energy:{allRotation:.3,intensity:.5,glow:.3}};class Qt{constructor({layerCount:e=4,transitionDuration:t=.5}={}){this.layerCount=e,this.transitionDuration=t,this._objectStates=new Map,this._audio={bass:0,mid:0,high:0,energy:0},this._time=0}registerObject(e,t="idle"){const r=Kt(e,this.layerCount),i=z[t]||z.idle;this._objectStates.set(e,{currentState:t,targetState:t,transitionProgress:1,currentPreset:{...i},targetPreset:{...i},identity:r})}setObjectState(e,t){const r=this._objectStates.get(e);if(!r){this.registerObject(e,t);return}if(r.targetState===t)return;const i=z[t];if(!i)return;const s=(z[r.currentState]||z.idle).priority;i.priority<s&&r.transitionProgress<.5||(r.currentPreset=this._interpolatePresets(r.currentPreset,r.targetPreset,r.transitionProgress),r.targetPreset={...i},r.currentState=r.targetState,r.targetState=t,r.transitionProgress=0)}setAudio(e,t,r,i){this._audio.bass=Math.max(0,Math.min(1,e||0)),this._audio.mid=Math.max(0,Math.min(1,t||0)),this._audio.high=Math.max(0,Math.min(1,r||0)),this._audio.energy=Math.max(0,Math.min(1,i||0))}update(e){this._time+=e;for(const t of this._objectStates.values())t.transitionProgress<1&&(t.transitionProgress=Math.min(1,t.transitionProgress+e/this.transitionDuration))}getInscriptionConfig(e){let t=this._objectStates.get(e);t||(this.registerObject(e),t=this._objectStates.get(e));const r=this._interpolatePresets(t.currentPreset,t.targetPreset,t.transitionProgress),i=t.identity,s=this._audio,n=[];for(let u=0;u<this.layerCount;u++){const d=i.layers[u],p=r.patternOverride!==null?r.patternOverride:d.geometry,g=d.opacity*r.opacityMultiplier+s.energy*F.energy.intensity*.3,_=d.thickness*r.thicknessMultiplier+s.bass*F.bass.thickness,v=d.patternSpeed*r.speedMultiplier+s.mid*F.mid.speed,T=s.high*F.high.hueShift/360,m=[Math.min(1,Math.max(0,d.color[0]+r.colorShift[0]+T*.5)),Math.min(1,Math.max(0,d.color[1]+r.colorShift[1]+T*.3)),Math.min(1,Math.max(0,d.color[2]+r.colorShift[2]+T))],E=d.patternScale+s.high*F.high.patternScale,b=d.rotOffset+this._time*(i.baseRotationSpeed+r.rotationSpeed*.5);n.push({geometry:p,thickness:Math.min(1,Math.max(0,_)),opacity:Math.min(1,Math.max(0,g)),color:m,patternScale:E,patternSpeed:v,rotOffset:b})}const a=s.bass*F.bass.rot4dXW+s.energy*F.energy.allRotation,l=s.mid*F.mid.rot4dYW+s.energy*F.energy.allRotation,h=s.high*F.high.rot4dZW+s.energy*F.energy.allRotation,f=.6*r.thicknessMultiplier+s.bass*.2;return{layers:n,rot4dXW:a,rot4dYW:l,rot4dZW:h,globalThickness:f,glowIntensity:r.glowIntensity+s.energy*F.energy.glow,bass:s.bass,mid:s.mid,high:s.high,energy:s.energy}}applyToLayer(e,t){const r=this.getInscriptionConfig(t);e.rot4dXW=r.rot4dXW,e.rot4dYW=r.rot4dYW,e.rot4dZW=r.rot4dZW,e.globalThickness=r.globalThickness,e.setAudio(r.bass,r.mid,r.high,r.energy);for(let i=0;i<r.layers.length&&i<e.layerCount;i++)e.setLayerConfig(i,r.layers[i])}_interpolatePresets(e,t,r){const i=r<.5?2*r*r:1-Math.pow(-2*r+2,2)/2;return{priority:t.priority,opacityMultiplier:e.opacityMultiplier+(t.opacityMultiplier-e.opacityMultiplier)*i,thicknessMultiplier:e.thicknessMultiplier+(t.thicknessMultiplier-e.thicknessMultiplier)*i,speedMultiplier:e.speedMultiplier+(t.speedMultiplier-e.speedMultiplier)*i,glowIntensity:e.glowIntensity+(t.glowIntensity-e.glowIntensity)*i,colorShift:[e.colorShift[0]+(t.colorShift[0]-e.colorShift[0])*i,e.colorShift[1]+(t.colorShift[1]-e.colorShift[1])*i,e.colorShift[2]+(t.colorShift[2]-e.colorShift[2])*i],rotationSpeed:e.rotationSpeed+(t.rotationSpeed-e.rotationSpeed)*i,patternOverride:i>.5?t.patternOverride:e.patternOverride}}getObjectState(e){const t=this._objectStates.get(e);return t?t.targetState:null}get registeredObjects(){return Array.from(this._objectStates.keys())}get stateNames(){return Object.keys(z)}dispose(){this._objectStates.clear()}}class Jt{constructor(e,t={}){this.gl=e,this.resolution=t.resolution??1024,this.bias=t.bias??.005,this.normalBias=t.normalBias??.02,this.pcfRadius=t.pcfRadius??2,this.filterMode=t.filterMode??"pcf",this.frustumSize=t.frustumSize??10,this.near=t.near??.1,this.far=t.far??50,this.lightDir=new Float32Array(t.lightDir||[.5,1,.3]),this._normalizeLightDir(),this.lightViewMatrix=new Float32Array(16),this.lightProjMatrix=new Float32Array(16),this.lightSpaceMatrix=new Float32Array(16),this._fbo=null,this._depthTexture=null,this._shadowProgram=null,this._initialized=!1}init(){if(this._initialized)return;const e=this.gl;this._fbo=e.createFramebuffer(),this._depthTexture=e.createTexture(),e.bindTexture(e.TEXTURE_2D,this._depthTexture),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT32F,this.resolution,this.resolution,0,e.DEPTH_COMPONENT,e.FLOAT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_COMPARE_MODE,e.COMPARE_REF_TO_TEXTURE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_COMPARE_FUNC,e.LEQUAL),e.bindFramebuffer(e.FRAMEBUFFER,this._fbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,this._depthTexture,0),e.drawBuffers([e.NONE]),e.readBuffer(e.NONE),e.bindFramebuffer(e.FRAMEBUFFER,null),this._shadowProgram=this._createShadowProgram(),this._initialized=!0}setLightDirection(e,t,r){this.lightDir[0]=e,this.lightDir[1]=t,this.lightDir[2]=r,this._normalizeLightDir()}updateMatrices(e){const t=e?e[0]:0,r=e?e[1]:0,i=e?e[2]:0,s=this.lightDir[0],n=this.lightDir[1],a=this.lightDir[2],l=this.far*.5,h=t+s*l,f=r+n*l,u=i+a*l;this._lookAt(this.lightViewMatrix,h,f,u,t,r,i);const d=this.frustumSize;this._ortho(this.lightProjMatrix,-d,d,-d,d,this.near,this.far),this._multiplyMat4(this.lightSpaceMatrix,this.lightProjMatrix,this.lightViewMatrix)}beginShadowPass(){this._initialized||this.init();const e=this.gl;e.bindFramebuffer(e.FRAMEBUFFER,this._fbo),e.viewport(0,0,this.resolution,this.resolution),e.clear(e.DEPTH_BUFFER_BIT),e.enable(e.DEPTH_TEST),e.depthFunc(e.LESS),e.enable(e.CULL_FACE),e.cullFace(e.FRONT)}renderShadowCaster(e,t,r){const i=this.gl,s=this._shadowProgram;i.useProgram(s.program),i.uniformMatrix4fv(s.u_lightSpaceMatrix,!1,this.lightSpaceMatrix),i.uniformMatrix4fv(s.u_modelMatrix,!1,r||er);const n=i.createVertexArray();i.bindVertexArray(n);const a=i.createBuffer();if(i.bindBuffer(i.ARRAY_BUFFER,a),i.bufferData(i.ARRAY_BUFFER,e,i.STREAM_DRAW),i.enableVertexAttribArray(0),i.vertexAttribPointer(0,3,i.FLOAT,!1,0,0),t){const l=i.createBuffer();i.bindBuffer(i.ELEMENT_ARRAY_BUFFER,l),i.bufferData(i.ELEMENT_ARRAY_BUFFER,t,i.STREAM_DRAW),i.drawElements(i.TRIANGLES,t.length,i.UNSIGNED_INT,0),i.deleteBuffer(l)}else i.drawArrays(i.TRIANGLES,0,e.length/3);i.bindVertexArray(null),i.deleteVertexArray(n),i.deleteBuffer(a)}endShadowPass(){const e=this.gl;e.cullFace(e.BACK),e.bindFramebuffer(e.FRAMEBUFFER,null)}getShadowTexture(){return this._depthTexture}getLightSpaceMatrix(){return this.lightSpaceMatrix}static getShadowSamplerSrc(){return`
uniform sampler2DShadow u_shadowMap;
uniform mat4 u_lightSpaceMatrix;
uniform float u_shadowBias;
uniform float u_shadowNormalBias;
uniform int u_pcfRadius;

float computeShadow(vec3 worldPos, vec3 worldNormal) {
    // Apply normal bias
    vec3 biasedPos = worldPos + worldNormal * u_shadowNormalBias;
    vec4 lightSpacePos = u_lightSpaceMatrix * vec4(biasedPos, 1.0);
    vec3 projCoords = lightSpacePos.xyz / lightSpacePos.w;
    projCoords = projCoords * 0.5 + 0.5;

    if (projCoords.z > 1.0) return 1.0;

    float currentDepth = projCoords.z - u_shadowBias;

    // PCF soft shadows
    float shadow = 0.0;
    vec2 texelSize = 1.0 / vec2(textureSize(u_shadowMap, 0));
    int radius = u_pcfRadius;
    float sampleCount = 0.0;

    for (int x = -radius; x <= radius; x++) {
        for (int y = -radius; y <= radius; y++) {
            vec3 sampleCoord = vec3(projCoords.xy + vec2(x, y) * texelSize, currentDepth);
            shadow += texture(u_shadowMap, sampleCoord);
            sampleCount += 1.0;
        }
    }

    return shadow / sampleCount;
}
`}static getInscriptionShadowSrc(){return`
// Shadow-aware inscription: shadowed edges get cooler tint, lit edges get warmer
vec3 modulateInscriptionByShadow(vec3 inscriptionColor, float shadowFactor) {
    // shadowFactor: 1.0 = fully lit, 0.0 = fully shadowed
    vec3 coolTint = vec3(0.4, 0.6, 1.0);   // Blue-ish for shadow
    vec3 warmTint = vec3(1.0, 0.9, 0.7);   // Warm for lit
    vec3 tint = mix(coolTint, warmTint, shadowFactor);
    float intensity = mix(0.3, 1.0, shadowFactor);
    return inscriptionColor * tint * intensity;
}
`}_normalizeLightDir(){const e=this.lightDir,t=Math.sqrt(e[0]*e[0]+e[1]*e[1]+e[2]*e[2])||1;e[0]/=t,e[1]/=t,e[2]/=t}_createShadowProgram(){const e=this.gl,t=`#version 300 es
precision highp float;
layout(location = 0) in vec3 a_position;
uniform mat4 u_lightSpaceMatrix;
uniform mat4 u_modelMatrix;
void main() {
    gl_Position = u_lightSpaceMatrix * u_modelMatrix * vec4(a_position, 1.0);
}`,r=`#version 300 es
precision highp float;
void main() {
    // Depth is written automatically
}`,i=e.createShader(e.VERTEX_SHADER);e.shaderSource(i,t),e.compileShader(i);const s=e.createShader(e.FRAGMENT_SHADER);e.shaderSource(s,r),e.compileShader(s);const n=e.createProgram();return e.attachShader(n,i),e.attachShader(n,s),e.linkProgram(n),e.deleteShader(i),e.deleteShader(s),{program:n,u_lightSpaceMatrix:e.getUniformLocation(n,"u_lightSpaceMatrix"),u_modelMatrix:e.getUniformLocation(n,"u_modelMatrix")}}_lookAt(e,t,r,i,s,n,a){let l=s-t,h=n-r,f=a-i,u=Math.sqrt(l*l+h*h+f*f)||1;l/=u,h/=u,f/=u;let d=h*0-f*1,p=f*0-l*0,g=l*1-h*0;Math.abs(d)+Math.abs(p)+Math.abs(g)<.001&&(d=1,p=0,g=0),u=Math.sqrt(d*d+p*p+g*g)||1,d/=u,p/=u,g/=u;const _=p*f-g*h,v=g*l-d*f,T=d*h-p*l;e[0]=d,e[1]=_,e[2]=-l,e[3]=0,e[4]=p,e[5]=v,e[6]=-h,e[7]=0,e[8]=g,e[9]=T,e[10]=-f,e[11]=0,e[12]=-(d*t+p*r+g*i),e[13]=-(_*t+v*r+T*i),e[14]=-(-l*t+-h*r+-f*i),e[15]=1}_ortho(e,t,r,i,s,n,a){const l=1/(t-r),h=1/(i-s),f=1/(n-a);e[0]=-2*l,e[1]=0,e[2]=0,e[3]=0,e[4]=0,e[5]=-2*h,e[6]=0,e[7]=0,e[8]=0,e[9]=0,e[10]=2*f,e[11]=0,e[12]=(t+r)*l,e[13]=(s+i)*h,e[14]=(a+n)*f,e[15]=1}_multiplyMat4(e,t,r){for(let i=0;i<4;i++)for(let s=0;s<4;s++)e[i*4+s]=t[0*4+s]*r[i*4+0]+t[1*4+s]*r[i*4+1]+t[2*4+s]*r[i*4+2]+t[3*4+s]*r[i*4+3]}dispose(){const e=this.gl;this._fbo&&e.deleteFramebuffer(this._fbo),this._depthTexture&&e.deleteTexture(this._depthTexture),this._shadowProgram&&e.deleteProgram(this._shadowProgram.program),this._fbo=null,this._depthTexture=null,this._shadowProgram=null,this._initialized=!1}}const er=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);class tr{constructor(e,t={}){this.gl=e,this.maxParticles=t.maxParticles??1e4,this.emitRate=t.emitRate??100,this.lifetime=t.lifetime??3,this.lifetimeVariance=t.lifetimeVariance??.5,this.speed=t.speed??1,this.speedVariance=t.speedVariance??.3,this.gravity=t.gravity??-2,this.drag=t.drag??.98,this.splatScale=t.splatScale??.02,this.splatScaleDecay=t.splatScaleDecay??.5,this.trailLength=t.trailLength??0,this.emitterType=t.emitterType??"point",this.emitterPosition=new Float32Array(t.emitterPosition||[0,0,0]),this.emitterRadius=t.emitterRadius??.5,this.emitterDirection=new Float32Array(t.emitterDirection||[0,1,0]),this.emitterSpread=t.emitterSpread??.5,this.colorStart=new Float32Array(t.colorStart||[0,1,1]),this.colorEnd=new Float32Array(t.colorEnd||[1,0,1]),this.colorMode=t.colorMode??"lerp",this.burstConfigs=new Map,this._setupDefaultBursts(),this._stride=12,this._data=new Float32Array(this.maxParticles*this._stride),this._aliveCount=0,this._emitAccumulator=0,this._trailHistory=this.trailLength>0?new Float32Array(this.maxParticles*this.trailLength*7):null,this._splatBuffer=null,this._splatCount=0,this._rng=12345}setBurstConfig(e,t){this.burstConfigs.set(e,t)}burst(e,t){const r=this.burstConfigs.get(e);if(!r)return;const i=t||this.emitterPosition,s=r.speed??this.speed*2,n=r.spread??1;for(let a=0;a<r.count;a++)this._emitOne(i,s,n,r.color)}setPosition(e,t,r){this.emitterPosition[0]=e,this.emitterPosition[1]=t,this.emitterPosition[2]=r}setSurfaceEmitter(e,t,r){this.emitterType="surface",this._surfacePositions=e,this._surfaceNormals=t,this._surfaceIndices=r}update(e){for((e<=0||e>.1)&&(e=.016),this._emitAccumulator+=this.emitRate*e;this._emitAccumulator>=1&&this._aliveCount<this.maxParticles;)this._emitAccumulator-=1,this._emitParticle();let t=0;for(let r=0;r<this._aliveCount;r++){const i=r*this._stride;if(this._data[i+9]+=e,this._data[i+9]>=this._data[i+10])continue;this._trailHistory&&this._pushTrail(r),this._data[i+4]+=this.gravity*e,this._data[i+3]*=this.drag,this._data[i+4]*=this.drag,this._data[i+5]*=this.drag,this._data[i+0]+=this._data[i+3]*e,this._data[i+1]+=this._data[i+4]*e,this._data[i+2]+=this._data[i+5]*e;const s=this._data[i+9]/this._data[i+10];this._data[i+6]=this.colorStart[0]*(1-s)+this.colorEnd[0]*s,this._data[i+7]=this.colorStart[1]*(1-s)+this.colorEnd[1]*s,this._data[i+8]=this.colorStart[2]*(1-s)+this.colorEnd[2]*s,this._data[i+11]=this.splatScale*(1-s*this.splatScaleDecay),t!==r&&this._data.copyWithin(t*this._stride,i,i+this._stride),t++}this._aliveCount=t,this._buildSplatBuffer()}getSplatBuffer(){return{buffer:this._splatBuffer,count:this._splatCount}}getAliveCount(){return this._aliveCount}_setupDefaultBursts(){this.burstConfigs.set("powered",{count:50,speed:2,spread:.3,color:[.5,0,1]}),this.burstConfigs.set("damaged",{count:100,speed:3,spread:1,color:[1,.3,0]}),this.burstConfigs.set("destroyed",{count:500,speed:5,spread:1,color:[1,.1,.1]}),this.burstConfigs.set("selected",{count:20,speed:.5,spread:.8,color:[0,1,1]}),this.burstConfigs.set("active",{count:30,speed:1,spread:.5,color:[0,1,.5]})}_emitParticle(){const e=this._getEmitPosition();this._emitOne(e,this.speed,this.emitterSpread)}_emitOne(e,t,r,i){if(this._aliveCount>=this.maxParticles)return;const s=this._aliveCount*this._stride;this._data[s+0]=e[0],this._data[s+1]=e[1],this._data[s+2]=e[2];const n=this._randomConeDirection(this.emitterDirection,r),a=t+(this._rand()-.5)*this.speedVariance*2;this._data[s+3]=n[0]*a,this._data[s+4]=n[1]*a,this._data[s+5]=n[2]*a,i?(this._data[s+6]=i[0],this._data[s+7]=i[1],this._data[s+8]=i[2]):(this._data[s+6]=this.colorStart[0],this._data[s+7]=this.colorStart[1],this._data[s+8]=this.colorStart[2]),this._data[s+9]=0,this._data[s+10]=this.lifetime+(this._rand()-.5)*this.lifetimeVariance*2,this._data[s+11]=this.splatScale,this._aliveCount++}_getEmitPosition(){if(this.emitterType==="surface"&&this._surfaceIndices)return this._randomSurfacePoint();if(this.emitterType==="sphere"){const e=this._rand()*Math.PI*2,t=Math.acos(2*this._rand()-1),r=this.emitterRadius*Math.cbrt(this._rand());return[this.emitterPosition[0]+r*Math.sin(t)*Math.cos(e),this.emitterPosition[1]+r*Math.cos(t),this.emitterPosition[2]+r*Math.sin(t)*Math.sin(e)]}return this.emitterPosition}_randomSurfacePoint(){const e=this._surfaceIndices.length/3,t=Math.floor(this._rand()*e),r=this._surfaceIndices[t*3]*3,i=this._surfaceIndices[t*3+1]*3,s=this._surfaceIndices[t*3+2]*3;let n=this._rand(),a=this._rand();n+a>1&&(n=1-n,a=1-a);const l=1-n-a;return[this._surfacePositions[r]*l+this._surfacePositions[i]*n+this._surfacePositions[s]*a,this._surfacePositions[r+1]*l+this._surfacePositions[i+1]*n+this._surfacePositions[s+1]*a,this._surfacePositions[r+2]*l+this._surfacePositions[i+2]*n+this._surfacePositions[s+2]*a]}_randomConeDirection(e,t){const r=this._rand()*Math.PI*2,i=1-this._rand()*t,s=Math.sqrt(1-i*i),n=e[0],a=e[1],l=e[2];let h,f,u;Math.abs(a)<.99?(h=a*0-l*0,f=l*1-n*0,u=n*0-a*1,h=0,f=-l,u=a):(h=-l,f=0,u=n);const d=Math.sqrt(h*h+f*f+u*u)||1;h/=d,f/=d,u/=d;const p=a*u-l*f,g=l*h-n*u,_=n*f-a*h;return[n*i+(h*Math.cos(r)+p*Math.sin(r))*s,a*i+(f*Math.cos(r)+g*Math.sin(r))*s,l*i+(u*Math.cos(r)+_*Math.sin(r))*s]}_pushTrail(e){if(!this._trailHistory)return;const t=e*this._stride,r=7,i=e*this.trailLength*r;for(let s=this.trailLength-1;s>0;s--){const n=i+s*r,a=i+(s-1)*r;for(let l=0;l<r;l++)this._trailHistory[n+l]=this._trailHistory[a+l]}this._trailHistory[i+0]=this._data[t+0],this._trailHistory[i+1]=this._data[t+1],this._trailHistory[i+2]=this._data[t+2],this._trailHistory[i+3]=this._data[t+6],this._trailHistory[i+4]=this._data[t+7],this._trailHistory[i+5]=this._data[t+8],this._trailHistory[i+6]=this._data[t+11]}_buildSplatBuffer(){const t=this._aliveCount*(1+this.trailLength);(!this._splatBuffer||this._splatBuffer.length<t*12)&&(this._splatBuffer=new Float32Array(t*12));let r=0;for(let i=0;i<this._aliveCount;i++){const s=i*this._stride,n=r*12;if(this._splatBuffer[n+0]=this._data[s+0],this._splatBuffer[n+1]=this._data[s+1],this._splatBuffer[n+2]=this._data[s+2],this._splatBuffer[n+3]=this._data[s+11],this._splatBuffer[n+4]=1,this._splatBuffer[n+5]=0,this._splatBuffer[n+6]=0,this._splatBuffer[n+7]=0,this._splatBuffer[n+8]=this._data[s+6],this._splatBuffer[n+9]=this._data[s+7],this._splatBuffer[n+10]=this._data[s+8],this._splatBuffer[n+11]=.5,r++,this._trailHistory){const a=i*this.trailLength*7;for(let l=0;l<this.trailLength;l++){const h=a+l*7,f=r*12,u=1-(l+1)/(this.trailLength+1);this._splatBuffer[f+0]=this._trailHistory[h+0],this._splatBuffer[f+1]=this._trailHistory[h+1],this._splatBuffer[f+2]=this._trailHistory[h+2],this._splatBuffer[f+3]=this._trailHistory[h+6]*u,this._splatBuffer[f+4]=1,this._splatBuffer[f+5]=0,this._splatBuffer[f+6]=0,this._splatBuffer[f+7]=0,this._splatBuffer[f+8]=this._trailHistory[h+3]*u,this._splatBuffer[f+9]=this._trailHistory[h+4]*u,this._splatBuffer[f+10]=this._trailHistory[h+5]*u,this._splatBuffer[f+11]=.3*u,r++}}}this._splatCount=r}_rand(){return this._rng=this._rng*1664525+1013904223&2147483647,this._rng/2147483647}dispose(){this._data=null,this._splatBuffer=null,this._trailHistory=null}}class rr{constructor(e,t={}){this.gl=e,this.maxSteps=t.maxSteps??24,this.stepSize=t.stepSize??.05,this.density=t.density??2,this.absorption=t.absorption??1.5,this.emissionStrength=t.emissionStrength??1,this.noiseScale=t.noiseScale??3,this.geometry=t.geometry??0,this.primaryColor=new Float32Array(t.primaryColor||[0,1,1]),this.secondaryColor=new Float32Array(t.secondaryColor||[1,0,1]),this.rot4dXY=0,this.rot4dXZ=0,this.rot4dYZ=0,this.rot4dXW=0,this.rot4dYW=0,this.rot4dZW=0,this.bass=0,this.mid=0,this.high=0,this.energy=0,this.sliceEnabled=!1,this.slicePlane=new Float32Array([0,1,0,0]),this._program=null,this._fbo=null,this._texture=null,this._vao=null,this._initialized=!1}init(){if(this._initialized)return;const e=this.gl;this._program=this._createProgram(),this._fbo=e.createFramebuffer(),this._texture=e.createTexture(),this._vao=e.createVertexArray(),e.bindVertexArray(this._vao);const t=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,t),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null),this._initialized=!0}setAudio(e,t,r,i){this.bass=e,this.mid=t,this.high=r,this.energy=i}render(e,t,r,i){this._initialized||this.init();const s=this.gl,{width:n,height:a}=i;return this._ensureTexture(n,a),s.bindFramebuffer(s.FRAMEBUFFER,this._fbo),s.viewport(0,0,n,a),s.clearColor(0,0,0,0),s.clear(s.COLOR_BUFFER_BIT),s.useProgram(this._program.program),s.activeTexture(s.TEXTURE0),s.bindTexture(s.TEXTURE_2D,e),s.uniform1i(this._program.u_depthTex,0),s.activeTexture(s.TEXTURE1),s.bindTexture(s.TEXTURE_2D,t),s.uniform1i(this._program.u_normalTex,1),s.uniform1f(this._program.u_time,r),s.uniform2f(this._program.u_resolution,n,a),s.uniform1i(this._program.u_maxSteps,this.maxSteps),s.uniform1f(this._program.u_stepSize,this.stepSize),s.uniform1f(this._program.u_density,this.density),s.uniform1f(this._program.u_absorption,this.absorption),s.uniform1f(this._program.u_emissionStrength,this.emissionStrength),s.uniform1f(this._program.u_noiseScale,this.noiseScale),s.uniform1f(this._program.u_geometry,this.geometry),s.uniform3fv(this._program.u_primaryColor,this.primaryColor),s.uniform3fv(this._program.u_secondaryColor,this.secondaryColor),s.uniform1f(this._program.u_rot4dXY,this.rot4dXY),s.uniform1f(this._program.u_rot4dXZ,this.rot4dXZ),s.uniform1f(this._program.u_rot4dYZ,this.rot4dYZ),s.uniform1f(this._program.u_rot4dXW,this.rot4dXW+this.bass*.3),s.uniform1f(this._program.u_rot4dYW,this.rot4dYW+this.mid*.2),s.uniform1f(this._program.u_rot4dZW,this.rot4dZW+this.high*.4),s.uniform1i(this._program.u_sliceEnabled,this.sliceEnabled?1:0),s.uniform4fv(this._program.u_slicePlane,this.slicePlane),i.invViewProj&&s.uniformMatrix4fv(this._program.u_invViewProj,!1,i.invViewProj),i.cameraPos&&s.uniform3fv(this._program.u_cameraPos,i.cameraPos),s.enable(s.BLEND),s.blendFunc(s.ONE,s.ONE_MINUS_SRC_ALPHA),s.bindVertexArray(this._vao),s.drawArrays(s.TRIANGLES,0,3),s.bindVertexArray(null),s.disable(s.BLEND),s.bindFramebuffer(s.FRAMEBUFFER,null),{texture:this._texture,framebuffer:this._fbo}}_ensureTexture(e,t){const r=this.gl;this._texW===e&&this._texH===t||(this._texW=e,this._texH=t,r.bindTexture(r.TEXTURE_2D,this._texture),r.texImage2D(r.TEXTURE_2D,0,r.RGBA16F,e,t,0,r.RGBA,r.HALF_FLOAT,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindFramebuffer(r.FRAMEBUFFER,this._fbo),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,this._texture,0),r.bindFramebuffer(r.FRAMEBUFFER,null))}_createProgram(){const e=this.gl,t=`#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`,r=`#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_depthTex;
uniform sampler2D u_normalTex;
uniform float u_time;
uniform vec2 u_resolution;

uniform int u_maxSteps;
uniform float u_stepSize;
uniform float u_density;
uniform float u_absorption;
uniform float u_emissionStrength;
uniform float u_noiseScale;
uniform float u_geometry;

uniform vec3 u_primaryColor;
uniform vec3 u_secondaryColor;

uniform float u_rot4dXY, u_rot4dXZ, u_rot4dYZ;
uniform float u_rot4dXW, u_rot4dYW, u_rot4dZW;

uniform int u_sliceEnabled;
uniform vec4 u_slicePlane;

uniform mat4 u_invViewProj;
uniform vec3 u_cameraPos;

// 3D hash
float hash3(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
}

// 3D value noise
float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x),
            mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
            mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y),
        f.z
    );
}

// Apply 4D rotation and project to 3D pattern value
float sample4DPattern(vec3 pos, float geometry) {
    // Lift to 4D
    vec4 p4 = vec4(pos, 0.0);

    // Apply 4D rotations (simplified for performance)
    float cXW = cos(u_rot4dXW), sXW = sin(u_rot4dXW);
    float cYW = cos(u_rot4dYW), sYW = sin(u_rot4dYW);
    float cZW = cos(u_rot4dZW), sZW = sin(u_rot4dZW);

    // XW rotation
    float tmpX = p4.x * cXW - p4.w * sXW;
    float tmpW = p4.x * sXW + p4.w * cXW;
    p4.x = tmpX; p4.w = tmpW;

    // YW rotation
    float tmpY = p4.y * cYW - p4.w * sYW;
    tmpW = p4.y * sYW + p4.w * cYW;
    p4.y = tmpY; p4.w = tmpW;

    // ZW rotation
    float tmpZ = p4.z * cZW - p4.w * sZW;
    tmpW = p4.z * sZW + p4.w * cZW;
    p4.z = tmpZ; p4.w = tmpW;

    // Project back to 3D with perspective
    float projDist = 3.5;
    vec3 proj = p4.xyz / (projDist - p4.w);

    // Geometry-dependent pattern
    int geomType = int(mod(geometry, 8.0));
    float pattern;

    if (geomType == 0) {
        // Tetrahedral lattice
        pattern = abs(sin(proj.x * 5.0) * sin(proj.y * 5.0) * sin(proj.z * 5.0));
    } else if (geomType == 1) {
        // Hypercube grid
        vec3 g = abs(fract(proj * 3.0) - 0.5);
        pattern = 1.0 - smoothstep(0.0, 0.1, min(min(g.x, g.y), g.z));
    } else if (geomType == 2) {
        // Sphere harmonics
        float r = length(proj);
        pattern = abs(sin(r * 10.0 + u_time * 0.5));
    } else if (geomType == 3) {
        // Toroidal
        float r = length(proj.xy) - 1.0;
        pattern = abs(sin(atan(proj.y, proj.x) * 8.0 + proj.z * 6.0 + u_time));
    } else if (geomType == 4) {
        // Klein-like twist
        float twist = atan(proj.y, proj.x) + proj.z * 2.0;
        pattern = abs(sin(twist * 4.0 + u_time * 0.3));
    } else if (geomType == 5) {
        // Fractal noise
        pattern = noise3D(proj * 2.0) * 0.5 + noise3D(proj * 4.0) * 0.25 + noise3D(proj * 8.0) * 0.125;
    } else if (geomType == 6) {
        // Wave interference
        pattern = sin(proj.x * 8.0 + u_time) * sin(proj.y * 6.0 - u_time * 0.7) * sin(proj.z * 10.0 + u_time * 0.3);
        pattern = abs(pattern);
    } else {
        // Crystal lattice
        vec3 g = abs(sin(proj * 4.0));
        pattern = max(max(g.x * g.y, g.y * g.z), g.x * g.z);
    }

    // Core type warp (hypersphere / hypertetra)
    float coreType = floor(geometry / 8.0);
    if (coreType == 1.0) {
        // Hypersphere warp
        float r = length(proj);
        pattern *= smoothstep(1.5, 0.5, r);
        pattern += abs(sin(r * 15.0 + u_time)) * 0.3;
    } else if (coreType == 2.0) {
        // Hypertetra warp
        float tetra = abs(proj.x + proj.y + proj.z) + abs(proj.x - proj.y - proj.z);
        pattern *= smoothstep(3.0, 1.0, tetra);
    }

    return clamp(pattern, 0.0, 1.0);
}

void main() {
    // Reconstruct world position from depth
    vec4 ndcInfo = texture(u_normalTex, v_uv);
    float depth = ndcInfo.a; // Linear depth

    if (depth <= 0.0) {
        fragColor = vec4(0.0);
        return;
    }

    vec3 normal = ndcInfo.xyz * 2.0 - 1.0;

    // Reconstruct world position (approximate from depth)
    vec2 ndc = v_uv * 2.0 - 1.0;
    vec4 clipPos = vec4(ndc, depth, 1.0);
    vec4 worldPos = u_invViewProj * clipPos;
    vec3 rayEnd = worldPos.xyz / worldPos.w;

    // Ray setup
    vec3 rayDir = normalize(rayEnd - u_cameraPos);
    vec3 rayStart = u_cameraPos;

    // Scale the position for pattern evaluation
    vec3 pos = rayEnd * u_noiseScale;

    // Raymarch from surface inward
    vec3 accumColor = vec3(0.0);
    float accumAlpha = 0.0;
    float t = 0.0;

    for (int i = 0; i < 32; i++) {
        if (i >= u_maxSteps) break;
        if (accumAlpha > 0.95) break;

        vec3 samplePos = pos - rayDir * t * u_noiseScale;

        // Slice plane test
        if (u_sliceEnabled == 1) {
            float planeDist = dot(samplePos / u_noiseScale, u_slicePlane.xyz) + u_slicePlane.w;
            if (planeDist > 0.0) {
                t += u_stepSize;
                continue;
            }
        }

        // Sample 4D inscription pattern
        float pattern = sample4DPattern(samplePos + u_time * 0.1, u_geometry);

        // Apply density
        float sampleDensity = pattern * u_density * u_stepSize;

        // Emission-absorption model
        vec3 emission = mix(u_primaryColor, u_secondaryColor, pattern) * u_emissionStrength * pattern;
        accumColor += emission * sampleDensity * (1.0 - accumAlpha);
        accumAlpha += sampleDensity * u_absorption * (1.0 - accumAlpha);

        t += u_stepSize;
    }

    accumAlpha = clamp(accumAlpha, 0.0, 1.0);
    fragColor = vec4(accumColor * accumAlpha, accumAlpha);
}`,i=e.createShader(e.VERTEX_SHADER);e.shaderSource(i,t),e.compileShader(i);const s=e.createShader(e.FRAGMENT_SHADER);e.shaderSource(s,r),e.compileShader(s),e.getShaderParameter(s,e.COMPILE_STATUS)||console.warn("VolumetricInscription fragment shader error:",e.getShaderInfoLog(s));const n=e.createProgram();e.attachShader(n,i),e.attachShader(n,s),e.linkProgram(n),e.deleteShader(i),e.deleteShader(s);const a=l=>e.getUniformLocation(n,l);return{program:n,u_depthTex:a("u_depthTex"),u_normalTex:a("u_normalTex"),u_time:a("u_time"),u_resolution:a("u_resolution"),u_maxSteps:a("u_maxSteps"),u_stepSize:a("u_stepSize"),u_density:a("u_density"),u_absorption:a("u_absorption"),u_emissionStrength:a("u_emissionStrength"),u_noiseScale:a("u_noiseScale"),u_geometry:a("u_geometry"),u_primaryColor:a("u_primaryColor"),u_secondaryColor:a("u_secondaryColor"),u_rot4dXY:a("u_rot4dXY"),u_rot4dXZ:a("u_rot4dXZ"),u_rot4dYZ:a("u_rot4dYZ"),u_rot4dXW:a("u_rot4dXW"),u_rot4dYW:a("u_rot4dYW"),u_rot4dZW:a("u_rot4dZW"),u_sliceEnabled:a("u_sliceEnabled"),u_slicePlane:a("u_slicePlane"),u_invViewProj:a("u_invViewProj"),u_cameraPos:a("u_cameraPos")}}dispose(){const e=this.gl;this._program&&e.deleteProgram(this._program.program),this._fbo&&e.deleteFramebuffer(this._fbo),this._texture&&e.deleteTexture(this._texture),this._vao&&e.deleteVertexArray(this._vao)}}class ir{constructor(e,t={}){this.gl=e,this.lightDir=new Float32Array(t.lightDir||[.5,1,.3]),this.lightColor=new Float32Array(t.lightColor||[1,.95,.9]),this.ambientStrength=t.ambientStrength??.15,this.specularPower=t.specularPower??64,this.specularStrength=t.specularStrength??.5,this.inscriptionEmission=t.inscriptionEmission??.3,this.fresnelPower=t.fresnelPower??3,this.shadowEnabled=!1,this.shadowTexture=null,this.lightSpaceMatrix=null,this._program=null,this._fbo=null,this._texture=null,this._vao=null,this._initialized=!1}init(){if(this._initialized)return;const e=this.gl;this._program=this._createProgram(),this._fbo=e.createFramebuffer(),this._texture=e.createTexture(),this._vao=e.createVertexArray(),e.bindVertexArray(this._vao);const t=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,t),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null),this._initialized=!0}setShadow(e,t){this.shadowEnabled=!0,this.shadowTexture=e,this.lightSpaceMatrix=t}render(e,t,r){this._initialized||this.init();const i=this.gl,{width:s,height:n}=r;this._ensureTexture(s,n),i.bindFramebuffer(i.FRAMEBUFFER,this._fbo),i.viewport(0,0,s,n),i.clearColor(0,0,0,0),i.clear(i.COLOR_BUFFER_BIT),i.useProgram(this._program.program),i.activeTexture(i.TEXTURE0),i.bindTexture(i.TEXTURE_2D,e),i.uniform1i(this._program.u_inscriptionTex,0),i.activeTexture(i.TEXTURE1),i.bindTexture(i.TEXTURE_2D,t),i.uniform1i(this._program.u_normalDepthTex,1),i.uniform1i(this._program.u_shadowEnabled,this.shadowEnabled?1:0),this.shadowEnabled&&this.shadowTexture&&(i.activeTexture(i.TEXTURE2),i.bindTexture(i.TEXTURE_2D,this.shadowTexture),i.uniform1i(this._program.u_shadowTex,2),this.lightSpaceMatrix&&i.uniformMatrix4fv(this._program.u_lightSpaceMatrix,!1,this.lightSpaceMatrix)),i.uniform2f(this._program.u_resolution,s,n);const a=this.lightDir,l=Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2])||1;return i.uniform3f(this._program.u_lightDir,a[0]/l,a[1]/l,a[2]/l),i.uniform3fv(this._program.u_lightColor,this.lightColor),i.uniform1f(this._program.u_ambientStrength,this.ambientStrength),i.uniform1f(this._program.u_specularPower,this.specularPower),i.uniform1f(this._program.u_specularStrength,this.specularStrength),i.uniform1f(this._program.u_inscriptionEmission,this.inscriptionEmission),i.uniform1f(this._program.u_fresnelPower,this.fresnelPower),r.viewDir?i.uniform3fv(this._program.u_viewDir,r.viewDir):i.uniform3f(this._program.u_viewDir,0,0,-1),i.bindVertexArray(this._vao),i.drawArrays(i.TRIANGLES,0,3),i.bindVertexArray(null),i.bindFramebuffer(i.FRAMEBUFFER,null),{texture:this._texture}}_ensureTexture(e,t){if(this._texW===e&&this._texH===t)return;const r=this.gl;this._texW=e,this._texH=t,r.bindTexture(r.TEXTURE_2D,this._texture),r.texImage2D(r.TEXTURE_2D,0,r.RGBA16F,e,t,0,r.RGBA,r.HALF_FLOAT,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.bindFramebuffer(r.FRAMEBUFFER,this._fbo),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,this._texture,0),r.bindFramebuffer(r.FRAMEBUFFER,null)}_createProgram(){const e=this.gl,t=`#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`,r=`#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_inscriptionTex;
uniform sampler2D u_normalDepthTex;
uniform sampler2D u_shadowTex;

uniform vec2 u_resolution;
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform vec3 u_viewDir;
uniform float u_ambientStrength;
uniform float u_specularPower;
uniform float u_specularStrength;
uniform float u_inscriptionEmission;
uniform float u_fresnelPower;

uniform int u_shadowEnabled;
uniform mat4 u_lightSpaceMatrix;

void main() {
    vec4 inscription = texture(u_inscriptionTex, v_uv);

    // Skip empty inscription pixels
    if (inscription.a < 0.01) {
        fragColor = vec4(0.0);
        return;
    }

    // Get surface normal from GBuffer
    vec4 normalDepth = texture(u_normalDepthTex, v_uv);
    vec3 normal = normalize(normalDepth.xyz * 2.0 - 1.0);
    float depth = normalDepth.a;

    if (depth <= 0.0) {
        fragColor = inscription;
        return;
    }

    // Diffuse lighting (NdotL)
    float NdotL = max(dot(normal, u_lightDir), 0.0);

    // Edge tangent for thin specular (perpendicular to normal in screen space)
    vec2 texelSize = 1.0 / u_resolution;
    vec3 normalRight = texture(u_normalDepthTex, v_uv + vec2(texelSize.x, 0.0)).xyz * 2.0 - 1.0;
    vec3 normalUp = texture(u_normalDepthTex, v_uv + vec2(0.0, texelSize.y)).xyz * 2.0 - 1.0;
    vec3 edgeTangent = normalize(cross(normalRight - normal, normalUp - normal));

    // Anisotropic specular along edge tangent
    vec3 halfVec = normalize(u_lightDir + normalize(-u_viewDir));
    float TdotH = dot(edgeTangent, halfVec);
    float anisotropicSpec = pow(sqrt(max(1.0 - TdotH * TdotH, 0.0)), u_specularPower);

    // Fresnel rim effect
    float fresnel = pow(1.0 - max(dot(normal, normalize(-u_viewDir)), 0.0), u_fresnelPower);

    // Shadow factor
    float shadow = 1.0;
    if (u_shadowEnabled == 1) {
        // Approximate shadow lookup (would need world pos reconstruction for accuracy)
        shadow = mix(0.3, 1.0, NdotL);
    }

    // Combine lighting
    vec3 ambient = inscription.rgb * u_ambientStrength;
    vec3 diffuse = inscription.rgb * NdotL * u_lightColor * shadow;
    vec3 specular = u_lightColor * anisotropicSpec * u_specularStrength * shadow;
    vec3 emission = inscription.rgb * u_inscriptionEmission;
    vec3 rim = inscription.rgb * fresnel * 0.3;

    // Shadow modulation: shadowed inscription gets cooler tint
    vec3 shadowTint = mix(vec3(0.5, 0.6, 1.0), vec3(1.0), shadow);

    vec3 litInscription = (ambient + diffuse + specular + emission + rim) * shadowTint;

    fragColor = vec4(litInscription, inscription.a);
}`,i=e.createShader(e.VERTEX_SHADER);e.shaderSource(i,t),e.compileShader(i);const s=e.createShader(e.FRAGMENT_SHADER);e.shaderSource(s,r),e.compileShader(s),e.getShaderParameter(s,e.COMPILE_STATUS)||console.warn("DeferredInscriptionLighting fragment shader error:",e.getShaderInfoLog(s));const n=e.createProgram();e.attachShader(n,i),e.attachShader(n,s),e.linkProgram(n),e.deleteShader(i),e.deleteShader(s);const a=l=>e.getUniformLocation(n,l);return{program:n,u_inscriptionTex:a("u_inscriptionTex"),u_normalDepthTex:a("u_normalDepthTex"),u_shadowTex:a("u_shadowTex"),u_resolution:a("u_resolution"),u_lightDir:a("u_lightDir"),u_lightColor:a("u_lightColor"),u_viewDir:a("u_viewDir"),u_ambientStrength:a("u_ambientStrength"),u_specularPower:a("u_specularPower"),u_specularStrength:a("u_specularStrength"),u_inscriptionEmission:a("u_inscriptionEmission"),u_fresnelPower:a("u_fresnelPower"),u_shadowEnabled:a("u_shadowEnabled"),u_lightSpaceMatrix:a("u_lightSpaceMatrix")}}dispose(){const e=this.gl;this._program&&e.deleteProgram(this._program.program),this._fbo&&e.deleteFramebuffer(this._fbo),this._texture&&e.deleteTexture(this._texture),this._vao&&e.deleteVertexArray(this._vao)}}class or{constructor(e,t={}){this.gl=e,this.maxTextures=t.maxTextures??8,this._textures=new Map,this._glTextures=new Map}setLayerTexture(e,t,r={}){const i=this.gl;let s=this._glTextures.get(e);s||(s=i.createTexture(),this._glTextures.set(e,s)),i.bindTexture(i.TEXTURE_2D,s),i.texImage2D(i.TEXTURE_2D,0,i.RGBA,i.RGBA,i.UNSIGNED_BYTE,t),i.generateMipmap(i.TEXTURE_2D),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.LINEAR_MIPMAP_LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.REPEAT),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.REPEAT),i.bindTexture(i.TEXTURE_2D,null),this._textures.set(e,{texture:s,uvMode:r.uvMode??"screen",blend:r.blend??.5,tileX:r.tileX??1,tileY:r.tileY??1,offsetX:r.offsetX??0,offsetY:r.offsetY??0,rotation:r.rotation??0,channel:r.channel??"r",invert:r.invert??!1,width:t.width||t.naturalWidth,height:t.height||t.naturalHeight})}async loadLayerTexture(e,t,r={}){return new Promise((i,s)=>{const n=new Image;n.crossOrigin="anonymous",n.onload=()=>{this.setLayerTexture(e,n,r),i()},n.onerror=s,n.src=t})}setLayerText(e,t,r={}){const i=r.canvasSize??512,s=document.createElement("canvas");s.width=i,s.height=i;const n=s.getContext("2d");n.fillStyle="black",n.fillRect(0,0,i,i),n.fillStyle=r.color??"white",n.font=r.font??"32px monospace",n.textAlign="center",n.textBaseline="middle";const a=t.split(" "),l=[];let h="";const f=i*.8;for(const p of a){const g=h?h+" "+p:p;n.measureText(g).width>f&&h?(l.push(h),h=p):h=g}h&&l.push(h);const u=parseInt(n.font)*1.4,d=i/2-(l.length-1)*u/2;for(let p=0;p<l.length;p++)n.fillText(l[p],i/2,d+p*u);this.setLayerTexture(e,s,{channel:"luminance",...r})}setLayerCircuitPattern(e,t={}){const r=t.canvasSize??512,i=document.createElement("canvas");i.width=r,i.height=r;const s=i.getContext("2d");s.fillStyle="black",s.fillRect(0,0,r,r),s.strokeStyle="white",s.lineWidth=2;const n=t.gridSize??32;let l=t.seed??42;const h=()=>(l=l*1664525+1013904223&4294967295,(l>>>0)/4294967295);for(let f=0;f<r;f+=n){let u=h()>.3;for(let d=0;d<r;d+=n)h()>.6&&(u=!u),u&&(s.beginPath(),s.moveTo(f,d),h()>.5?s.lineTo(f+n,d):s.lineTo(f,d+n),s.stroke()),h()>.7&&(s.beginPath(),s.arc(f,d,3,0,Math.PI*2),s.fillStyle="white",s.fill())}this.setLayerTexture(e,i,{channel:"luminance",...t})}removeLayerTexture(e){const t=this._glTextures.get(e);t&&(this.gl.deleteTexture(t),this._glTextures.delete(e)),this._textures.delete(e)}getLayerConfig(e){return this._textures.get(e)||null}hasTexture(e){return this._textures.has(e)}bind(e,t){const r=this._textures.get(e);if(!r)return!1;const i=this.gl;return i.activeTexture(i.TEXTURE0+t),i.bindTexture(i.TEXTURE_2D,r.texture),!0}static getShaderSrc(){return`
// Inscription texture uniforms
uniform sampler2D u_inscriptionTex[8];
uniform int u_inscTexEnabled[8];        // 0=procedural only, 1=texture enabled
uniform float u_inscTexBlend[8];        // 0=procedural, 1=texture
uniform vec4 u_inscTexTransform[8];     // xy=tile, zw=offset
uniform float u_inscTexRotation[8];     // UV rotation angle
uniform int u_inscTexUVMode[8];         // 0=screen, 1=object, 2=cylindrical, 3=spherical
uniform int u_inscTexChannel[8];        // 0=r, 1=g, 2=b, 3=a, 4=luminance
uniform int u_inscTexInvert[8];         // 0=normal, 1=inverted

vec2 getInscriptionUV(int uvMode, vec2 screenUV, vec3 worldNormal, float objectID) {
    if (uvMode == 0) {
        // Screen-space
        return screenUV;
    } else if (uvMode == 1) {
        // Object-space (approximate from screen + objectID)
        float hash = fract(objectID * 127.1) * 6.28318;
        vec2 rotated = vec2(
            screenUV.x * cos(hash) - screenUV.y * sin(hash),
            screenUV.x * sin(hash) + screenUV.y * cos(hash)
        );
        return rotated;
    } else if (uvMode == 2) {
        // Cylindrical projection from normals
        float theta = atan(worldNormal.z, worldNormal.x);
        float phi = worldNormal.y * 0.5 + 0.5;
        return vec2(theta / 6.28318 + 0.5, phi);
    } else {
        // Spherical projection from normals
        float theta = atan(worldNormal.z, worldNormal.x);
        float phi = acos(clamp(worldNormal.y, -1.0, 1.0));
        return vec2(theta / 6.28318 + 0.5, phi / 3.14159);
    }
}

float sampleInscriptionTexture(int layerIndex, vec2 screenUV, vec3 worldNormal, float objectID) {
    if (layerIndex >= 8 || u_inscTexEnabled[layerIndex] == 0) return -1.0; // No texture

    vec2 uv = getInscriptionUV(u_inscTexUVMode[layerIndex], screenUV, worldNormal, objectID);

    // Apply transform (tile + offset)
    vec4 transform = u_inscTexTransform[layerIndex];
    uv = uv * transform.xy + transform.zw;

    // Apply rotation
    float angle = u_inscTexRotation[layerIndex];
    if (abs(angle) > 0.001) {
        vec2 center = vec2(0.5);
        uv -= center;
        float c = cos(angle), s = sin(angle);
        uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
        uv += center;
    }

    vec4 texColor = texture(u_inscriptionTex[layerIndex], uv);

    // Channel selection
    float value;
    int ch = u_inscTexChannel[layerIndex];
    if (ch == 0) value = texColor.r;
    else if (ch == 1) value = texColor.g;
    else if (ch == 2) value = texColor.b;
    else if (ch == 3) value = texColor.a;
    else value = dot(texColor.rgb, vec3(0.299, 0.587, 0.114)); // luminance

    // Invert
    if (u_inscTexInvert[layerIndex] == 1) value = 1.0 - value;

    return value;
}

// Mix procedural and texture inscription
float blendInscription(float procedural, int layerIndex, vec2 screenUV, vec3 worldNormal, float objectID) {
    float texValue = sampleInscriptionTexture(layerIndex, screenUV, worldNormal, objectID);
    if (texValue < 0.0) return procedural; // No texture, pure procedural

    float blend = u_inscTexBlend[layerIndex];
    return mix(procedural, texValue, blend);
}
`}dispose(){for(const[,e]of this._glTextures)this.gl.deleteTexture(e);this._glTextures.clear(),this._textures.clear()}}function ar(o,e){const t=new Float32Array(16);for(let r=0;r<4;r++)for(let i=0;i<4;i++)t[r*4+i]=o[i]*e[r*4]+o[4+i]*e[r*4+1]+o[8+i]*e[r*4+2]+o[12+i]*e[r*4+3];return t}function sr(o,e,t,r){const i=1/Math.tan(o*.5),s=1/(t-r);return new Float32Array([i/e,0,0,0,0,i,0,0,0,0,(r+t)*s,-1,0,0,2*r*t*s,0])}function nr(o,e,t){let r=o[0]-e[0],i=o[1]-e[1],s=o[2]-e[2],n=Math.hypot(r,i,s)||1;r/=n,i/=n,s/=n;let a=t[1]*s-t[2]*i,l=t[2]*r-t[0]*s,h=t[0]*i-t[1]*r;n=Math.hypot(a,l,h)||1,a/=n,l/=n,h/=n;const f=i*h-s*l,u=s*a-r*h,d=r*l-i*a;return new Float32Array([a,f,r,0,l,u,i,0,h,d,s,0,-(a*o[0]+l*o[1]+h*o[2]),-(f*o[0]+u*o[1]+d*o[2]),-(r*o[0]+i*o[1]+s*o[2]),1])}function lr(o,e,t,r){const i=[],s=[],n=[],a=[];for(let l=0;l<=r;l++)for(let h=0;h<=t;h++){const f=h/t*Math.PI*2,u=l/r*Math.PI*2;i.push((o+e*Math.cos(u))*Math.cos(f),e*Math.sin(u),(o+e*Math.cos(u))*Math.sin(f)),s.push(Math.cos(u)*Math.cos(f),Math.sin(u),Math.cos(u)*Math.sin(f)),n.push(h/t,l/r)}for(let l=0;l<r;l++)for(let h=0;h<t;h++){const f=l*(t+1)+h,u=f+t+1;a.push(f,u,f+1,u,u+1,f+1)}return{positions:new Float32Array(i),normals:new Float32Array(s),uvs:new Float32Array(n),indices:new Uint16Array(a),triCount:a.length/3}}function cr(o,e,t){const r=[],i=[],s=[],n=[];for(let a=0;a<=t;a++)for(let l=0;l<=e;l++){const h=l/e,f=a/t,u=h*Math.PI*2,d=f*Math.PI,p=-o*Math.cos(u)*Math.sin(d),g=o*Math.cos(d),_=o*Math.sin(u)*Math.sin(d),v=Math.sqrt(p*p+g*g+_*_)||1;r.push(p,g,_),i.push(p/v,g/v,_/v),s.push(h,f)}for(let a=0;a<t;a++)for(let l=0;l<e;l++){const h=a*(e+1)+l,f=h+e+1;n.push(h,f,h+1,f,f+1,h+1)}return{positions:new Float32Array(r),normals:new Float32Array(i),uvs:new Float32Array(s),indices:new Uint16Array(n),triCount:n.length/3}}function ur(o){const e=o/2,t=[-e,-e,e,e,-e,e,e,e,e,-e,e,e,e,-e,-e,-e,-e,-e,-e,e,-e,e,e,-e,-e,e,e,e,e,e,e,e,-e,-e,e,-e,-e,-e,-e,e,-e,-e,e,-e,e,-e,-e,e,e,-e,e,e,-e,-e,e,e,-e,e,e,e,-e,-e,-e,-e,-e,e,-e,e,e,-e,e,-e],r=[0,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0],i=[0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1],s=[];for(let n=0;n<6;n++){const a=n*4;s.push(a,a+1,a+2,a,a+2,a+3)}return{positions:new Float32Array(t),normals:new Float32Array(r),uvs:new Float32Array(i),indices:new Uint16Array(s),triCount:s.length/3}}function hr(o,e,t,r){const i=[],s=[],n=[],a=[];function l(h){return h*=Math.PI*2,[(Math.sin(h)+2*Math.sin(2*h))*o,(Math.cos(h)-2*Math.cos(2*h))*o,-Math.sin(3*h)*o]}for(let h=0;h<=r;h++)for(let f=0;f<=t;f++){const u=f/t,d=h/r*Math.PI*2,p=l(u),g=l(u+.001),_=[g[0]-p[0],g[1]-p[1],g[2]-p[2]],v=Math.sqrt(_[0]*_[0]+_[1]*_[1]+_[2]*_[2])||1;_[0]/=v,_[1]/=v,_[2]/=v;let T=[0,1,0];Math.abs(_[1])>.99&&(T=[1,0,0]);const m=[_[1]*T[2]-_[2]*T[1],_[2]*T[0]-_[0]*T[2],_[0]*T[1]-_[1]*T[0]],E=Math.sqrt(m[0]*m[0]+m[1]*m[1]+m[2]*m[2])||1;m[0]/=E,m[1]/=E,m[2]/=E;const b=[m[1]*_[2]-m[2]*_[1],m[2]*_[0]-m[0]*_[2],m[0]*_[1]-m[1]*_[0]],y=Math.cos(d),R=Math.sin(d),S=y*b[0]+R*m[0],w=y*b[1]+R*m[1],G=y*b[2]+R*m[2];i.push(p[0]+e*S,p[1]+e*w,p[2]+e*G),s.push(S,w,G),n.push(u,h/r)}for(let h=0;h<r;h++)for(let f=0;f<t;f++){const u=h*(t+1)+f,d=u+t+1;a.push(u,d,u+1,d,d+1,u+1)}return{positions:new Float32Array(i),normals:new Float32Array(s),uvs:new Float32Array(n),indices:new Uint16Array(a),triCount:a.length/3}}function fr(o){const e=document.createElement("canvas");e.width=o,e.height=o;const t=e.getContext("2d"),r=t.createRadialGradient(o/2,o/2,0,o/2,o/2,o*.5);r.addColorStop(0,"#ff6b35"),r.addColorStop(.35,"#d63384"),r.addColorStop(.65,"#6f42c1"),r.addColorStop(1,"#0d6efd"),t.fillStyle=r,t.fillRect(0,0,o,o),t.globalCompositeOperation="multiply";const i=8,s=o/i;for(let n=0;n<i;n++)for(let a=0;a<i;a++)t.fillStyle=(n+a)%2===0?"rgba(255,255,255,0.85)":"rgba(60,60,80,0.85)",t.fillRect(a*s,n*s,s,s);t.globalCompositeOperation="screen";for(let n=1;n<=6;n++)t.beginPath(),t.arc(o/2,o/2,n*o*.07,0,Math.PI*2),t.lineWidth=2,t.strokeStyle=`hsla(${n*50},80%,70%,0.4)`,t.stroke();return t.globalCompositeOperation="source-over",t.getImageData(0,0,o,o)}const me=`#version 300 es
precision highp float; out vec2 v_uv;
void main(){float x=float((gl_VertexID&1)<<2)-1.0;float y=float((gl_VertexID&2)<<1)-1.0;v_uv=vec2(x,y)*0.5+0.5;gl_Position=vec4(x,y,0.0,1.0);}`,dr=`#version 300 es
precision highp float; in vec2 v_uv; uniform float u_time,u_geometry; uniform vec2 u_resolution; out vec4 outColor;
mat4 rXW(float a){float c=cos(a),s=sin(a);return mat4(c,0,0,-s,0,1,0,0,0,0,1,0,s,0,0,c);}
mat4 rYW(float a){float c=cos(a),s=sin(a);return mat4(1,0,0,0,0,c,0,-s,0,0,1,0,0,s,0,c);}
mat4 rZW(float a){float c=cos(a),s=sin(a);return mat4(1,0,0,0,0,1,0,0,0,0,c,-s,0,0,s,c);}
void main(){
    vec2 uv=(v_uv*2.0-1.0)*vec2(u_resolution.x/u_resolution.y,1.0); float t=u_time*0.3;
    vec4 p=rXW(t*0.4)*rYW(t*0.3)*rZW(t*0.2)*vec4(uv,0,0); vec3 pos=p.xyz/(2.0-p.w);
    float b=mod(u_geometry,8.0),pat=0.0;
    if(b<0.5)pat=abs(sin(pos.x*6.0+t)*sin(pos.y*6.0-t));
    else if(b<1.5){vec3 q=fract(pos*4.0)-0.5;pat=1.0-smoothstep(0.2,0.3,length(max(abs(q)-0.2,0.0)));}
    else if(b<2.5){pat=1.0-smoothstep(0.3,0.5,length(pos));pat*=abs(sin(atan(pos.y,pos.x)*5.0+t*2.0));}
    else if(b<3.5){float r=length(pos.xy);pat=abs(sin((r-0.35)*30.0+t*2.0))*smoothstep(0.5,0.3,abs(r-0.35));}
    else if(b<4.5){float a=atan(pos.y,pos.x)+t;pat=abs(sin(a*3.0+pos.x*5.0));}
    else if(b<5.5){vec2 q=pos.xy*3.0;for(int i=0;i<4;i++){q=abs(q)-1.0;q*=1.5;}pat=1.0-smoothstep(0.0,0.2,length(q)*0.1);}
    else if(b<6.5){pat=sin(pos.x*10.0+t)*sin(pos.y*10.0+t*0.7);pat=pat*0.5+0.5;}
    else{vec2 q=abs(fract(pos.xy*4.0)-0.5);pat=1.0-smoothstep(0.0,0.05,min(q.x,q.y));}
    if(u_geometry>=8.0&&u_geometry<16.0)pat*=smoothstep(0.6,0.3,length(pos));
    else if(u_geometry>=16.0)pat*=smoothstep(0.5,0.2,abs(max(abs(pos.x+pos.y)-pos.x,abs(pos.x-pos.y)+pos.x)*0.5));
    vec3 col=vec3(0.2,0.5,1.0)*pat+vec3(0.8,0.2,0.5)*(1.0-pat)*0.3; col*=pat;
    outColor=vec4(col,pat*0.7);
}`,Ke=`#version 300 es
precision highp float; in vec2 v_uv;
uniform sampler2D u_normalDepth; uniform float u_time,u_density,u_absorption,u_geometry;
uniform vec2 u_resolution; out vec4 outColor;
mat4 rXW(float a){float c=cos(a),s=sin(a);return mat4(c,0,0,-s,0,1,0,0,0,0,1,0,s,0,0,c);}
mat4 rYW(float a){float c=cos(a),s=sin(a);return mat4(1,0,0,0,0,c,0,-s,0,0,1,0,0,s,0,c);}
mat4 rZW(float a){float c=cos(a),s=sin(a);return mat4(1,0,0,0,0,1,0,0,0,0,c,-s,0,0,s,c);}
float hash3(vec3 p){p=fract(p*vec3(443.897,441.423,437.195));p+=dot(p,p.yzx+19.19);return fract((p.x+p.y)*p.z);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float getPattern(vec3 p,float g){float t=u_time*0.3,b=mod(g,8.0),pat=0.0;
if(b<0.5)pat=abs(sin(p.x*6.0+t)*sin(p.y*6.0-t)*sin(p.z*6.0+t*0.5));
else if(b<1.5){vec3 q=fract(p*3.0)-0.5;pat=1.0-smoothstep(0.15,0.25,length(max(abs(q)-0.15,0.0)));}
else if(b<2.5){float r=length(p);pat=smoothstep(0.5,0.3,r)*abs(sin(atan(p.y,p.x)*4.0+t*2.0));}
else if(b<3.5){float r=length(p.xy);pat=abs(sin(r*12.0+t*2.0))*smoothstep(0.6,0.2,r);}
else if(b<4.5){float a=atan(p.y,p.x)+t;pat=abs(sin(a*3.0+p.z*5.0));}
else if(b<5.5){vec3 q=p*2.0;for(int i=0;i<3;i++){q=abs(q)-0.8;q*=1.5;}pat=1.0-smoothstep(0.0,0.3,length(q)*0.05);}
else if(b<6.5){pat=noise3(p*4.0+t*0.5)*noise3(p*8.0-t*0.3);}
else{vec3 q=abs(fract(p*3.0)-0.5);pat=1.0-smoothstep(0.0,0.06,min(min(q.x,q.y),q.z));}
if(g>=8.0&&g<16.0)pat*=smoothstep(0.6,0.2,length(p));
else if(g>=16.0)pat*=smoothstep(0.5,0.1,abs(max(abs(p.x+p.y)-p.z,abs(p.x-p.y)+p.z)*0.5));
return clamp(pat,0.0,1.0);}
void main(){vec4 nd=texture(u_normalDepth,v_uv);float sceneDepth=nd.a;
if(sceneDepth<0.001){outColor=vec4(0);return;}
vec2 uv=(v_uv*2.0-1.0)*vec2(u_resolution.x/u_resolution.y,1.0);
vec3 rayOri=vec3(uv,-2.0);vec3 rayDir=normalize(vec3(uv*0.3,1.0));
float t=u_time;mat4 rot=rXW(t*0.2)*rYW(t*0.15)*rZW(t*0.1);
vec3 acc=vec3(0.0);float transmittance=1.0;float stepSize=4.0/48.0;
for(int i=0;i<48;i++){vec3 pos=rayOri+rayDir*float(i)*stepSize;float dist=length(pos);if(dist>2.0)continue;
vec4 p4=rot*vec4(pos,0.0);vec3 rp=p4.xyz/(2.0-p4.w);
float pat=getPattern(rp,u_geometry)*u_density;pat*=smoothstep(2.0,0.5,dist);
vec3 emission=mix(vec3(0.3,0.6,1.0),vec3(0.8,0.2,0.9),pat)*pat*2.0;
acc+=emission*transmittance*stepSize;transmittance*=exp(-pat*u_absorption*stepSize);if(transmittance<0.01)break;}
outColor=vec4(acc,1.0-transmittance);}`,mr=`#version 300 es
precision highp float; in vec2 v_uv; uniform sampler2D u_texture; uniform float u_opacity; out vec4 outColor;
void main(){vec4 c=texture(u_texture,v_uv);outColor=vec4(c.rgb,c.a*u_opacity);}`,B=document.getElementById("canvas"),pe=Math.min(devicePixelRatio,2);B.width=window.innerWidth*pe;B.height=window.innerHeight*pe;B.style.width="100%";B.style.height="100%";const c=B.getContext("webgl2",{depth:!0,antialias:!1,preserveDrawingBuffer:!0});if(!c)throw document.body.innerHTML='<h2 style="color:#fff;text-align:center;margin-top:40vh">WebGL2 required</h2>',new Error("WebGL2 required");c.getExtension("EXT_color_buffer_half_float");c.getExtension("EXT_color_buffer_float");window.addEventListener("resize",()=>{B.width=window.innerWidth*pe,B.height=window.innerHeight*pe});class pr{constructor(e){this.distance=5,this.azimuth=.5,this.elevation=.35,this.fov=Math.PI/4,this.near=.1,this.far=100,this.target=[0,0,0],this.canvas=e,this._dragging=!1,this._userControl=!1,this._targetDistance=5,this._targetAzimuth=.5,this._targetElevation=.35,this._lerpSpeed=.03,e.addEventListener("pointerdown",t=>{this._dragging=!0,this._lastX=t.clientX,this._lastY=t.clientY,e.setPointerCapture(t.pointerId),this._userControl=!0}),e.addEventListener("pointermove",t=>{this._dragging&&(this.azimuth+=(t.clientX-this._lastX)*.005,this.elevation+=(t.clientY-this._lastY)*.005,this.elevation=Math.max(-1.5,Math.min(1.5,this.elevation)),this._lastX=t.clientX,this._lastY=t.clientY)}),e.addEventListener("pointerup",()=>{this._dragging=!1}),e.addEventListener("wheel",t=>{t.preventDefault(),this.distance*=1+t.deltaY*.001,this.distance=Math.max(1,Math.min(30,this.distance)),this._userControl=!0},{passive:!1})}setTarget(e,t,r,i=.03){this._targetAzimuth=e,this._targetElevation=t,this._targetDistance=r,this._lerpSpeed=i,this._userControl=!1}update(){!this._userControl&&!this._dragging&&(this.azimuth+=(this._targetAzimuth-this.azimuth)*this._lerpSpeed,this.elevation+=(this._targetElevation-this.elevation)*this._lerpSpeed,this.distance+=(this._targetDistance-this.distance)*this._lerpSpeed,this._targetAzimuth+=.002)}get eye(){const e=Math.cos(this.elevation),t=Math.sin(this.elevation),r=Math.cos(this.azimuth),i=Math.sin(this.azimuth);return[this.target[0]+this.distance*e*i,this.target[1]+this.distance*t,this.target[2]+this.distance*e*r]}get aspect(){return this.canvas.width/this.canvas.height}get viewMatrix(){return nr(this.eye,this.target,[0,1,0])}get projectionMatrix(){return sr(this.fov,this.aspect,this.near,this.far)}get viewProjection(){return ar(this.projectionMatrix,this.viewMatrix)}}const V=new pr(B),Q=new Gt(c,{lightDir:[.5,.8,.3],lightColor:[1,.98,.95],ambientColor:[.15,.15,.22],specularPower:48}),De=new at(c,{pointScale:B.height/(2*Math.tan(Math.PI/8)),blendMode:"additive",animate:!0,intensity:1,chromatic:.4}),fe=new Vt(c,{layerCount:4,geometry:3,thickness:.6,patternScale:3,patternSpeed:.3,depthSensitivity:8,normalSensitivity:2,opacity:.8}),x=new qt(c,{exposure:1.2,gamma:2.2});x.setMeshRenderer(Q);x.setSplatRenderer(De);x.setEdgeInscription(fe);const $=new Qt({layerCount:4,transitionDuration:.5});$.registerObject(1,"active");let M=null,nt=null,lt=3;{const o=c.createShader(c.VERTEX_SHADER);c.shaderSource(o,me),c.compileShader(o);const e=c.createShader(c.FRAGMENT_SHADER);c.shaderSource(e,dr),c.compileShader(e),c.getShaderParameter(o,c.COMPILE_STATUS)&&c.getShaderParameter(e,c.COMPILE_STATUS)&&(M=c.createProgram(),c.attachShader(M,o),c.attachShader(M,e),c.linkProgram(M),c.getProgramParameter(M,c.LINK_STATUS)?nt=c.createVertexArray():M=null)}x.setProceduralRenderer((o,e)=>{M&&(c.useProgram(M),c.bindVertexArray(nt),c.uniform1f(c.getUniformLocation(M,"u_time"),e),c.uniform1f(c.getUniformLocation(M,"u_geometry"),lt),c.uniform2f(c.getUniformLocation(M,"u_resolution"),o.width,o.height),c.drawArrays(c.TRIANGLES,0,3))});let xe=null;try{xe=new Jt(c,{resolution:1024,bias:.003,pcfRadius:2,frustumSize:6,lightDir:[.5,.8,.3]}),xe.init()}catch{xe=null}let O=null;try{O=new tr(c,{maxParticles:1e4,emitRate:50,lifetime:2.5,speed:.3,speedVariance:.15,gravity:[0,-.1,0],drag:.02,splatScale:.015,emitterType:"sphere",emitterRadius:1.2,colorStart:[.4,.7,1],colorEnd:[.8,.3,1],colorMode:"lerp"})}catch{O=null}let Re=null;try{Re=new rr(c,{maxSteps:48,density:.8,absorption:.4,geometry:3,primaryColor:[.3,.6,1],secondaryColor:[.8,.2,.9]}),Re.init()}catch{Re=null}let Ae=null;try{Ae=new ir(c,{lightDir:[.5,.8,.3],lightColor:[1,.98,.95],specularPower:32,specularStrength:.6,fresnelPower:3,inscriptionEmission:1.5}),Ae.init()}catch{Ae=null}let ie=null;try{ie=new or(c),ie.setLayerCircuitPattern(0,{density:12,color:"#5b9cf5"}),ie.setLayerText(1,"VIB3+",{fontSize:48,color:"#a78bfa"})}catch{ie=null}let k=null;try{k=new at(c,{pointScale:B.height/(2*Math.tan(Math.PI/8)),blendMode:"additive",animate:!0,intensity:1.5,chromatic:.6})}catch{k=null}let W=null,Qe=0,Je=0;function _r(o,e){if(Qe===o&&Je===e&&W)return;W&&(c.deleteFramebuffer(W.framebuffer),c.deleteTexture(W.texture));const t=c.createTexture();c.bindTexture(c.TEXTURE_2D,t),c.texImage2D(c.TEXTURE_2D,0,c.RGBA8,o,e,0,c.RGBA,c.UNSIGNED_BYTE,null),c.texParameteri(c.TEXTURE_2D,c.TEXTURE_MIN_FILTER,c.LINEAR),c.texParameteri(c.TEXTURE_2D,c.TEXTURE_MAG_FILTER,c.LINEAR),c.texParameteri(c.TEXTURE_2D,c.TEXTURE_WRAP_S,c.CLAMP_TO_EDGE),c.texParameteri(c.TEXTURE_2D,c.TEXTURE_WRAP_T,c.CLAMP_TO_EDGE);const r=c.createRenderbuffer();c.bindRenderbuffer(c.RENDERBUFFER,r),c.renderbufferStorage(c.RENDERBUFFER,c.DEPTH_COMPONENT24,o,e);const i=c.createFramebuffer();c.bindFramebuffer(c.FRAMEBUFFER,i),c.framebufferTexture2D(c.FRAMEBUFFER,c.COLOR_ATTACHMENT0,c.TEXTURE_2D,t,0),c.framebufferRenderbuffer(c.FRAMEBUFFER,c.DEPTH_ATTACHMENT,c.RENDERBUFFER,r),c.bindFramebuffer(c.FRAMEBUFFER,null),W={framebuffer:i,texture:t,depthRb:r},Qe=o,Je=e}let A=null,ct=null;{const o=c.createShader(c.VERTEX_SHADER);c.shaderSource(o,(Ke.includes("v_uv"),me)),c.compileShader(o);const e=c.createShader(c.FRAGMENT_SHADER);c.shaderSource(e,Ke),c.compileShader(e),c.getShaderParameter(o,c.COMPILE_STATUS)&&c.getShaderParameter(e,c.COMPILE_STATUS)&&(A=c.createProgram(),c.attachShader(A,o),c.attachShader(A,e),c.linkProgram(A),c.getProgramParameter(A,c.LINK_STATUS)?ct=c.createVertexArray():A=null)}let P=null,ut=null;{const o=c.createShader(c.VERTEX_SHADER);c.shaderSource(o,me),c.compileShader(o);const e=c.createShader(c.FRAGMENT_SHADER);c.shaderSource(e,mr),c.compileShader(e),c.getShaderParameter(o,c.COMPILE_STATUS)&&c.getShaderParameter(e,c.COMPILE_STATUS)&&(P=c.createProgram(),c.attachShader(P,o),c.attachShader(P,e),c.linkProgram(P),c.getProgramParameter(P,c.LINK_STATUS)?ut=c.createVertexArray():P=null)}function gr(o,e=1){P&&(c.useProgram(P),c.bindVertexArray(ut),c.activeTexture(c.TEXTURE0),c.bindTexture(c.TEXTURE_2D,o),c.uniform1i(c.getUniformLocation(P,"u_texture"),0),c.uniform1f(c.getUniformLocation(P,"u_opacity"),e),c.drawArrays(c.TRIANGLES,0,3))}const Er={torus:()=>lr(1,.4,64,32),sphere:()=>cr(1.2,48,32),cube:()=>ur(1.8),knot:()=>hr(.35,.12,128,24)};let N=null,oe=[];const Tr=new $t,ae=fr(256);function ht(o){const e=Er[o];e&&(N=e(),Q.uploadGeometry(N),Q.uploadTexture(ae),oe=Tr.convert({positions:N.positions,normals:N.normals,uvs:N.uvs,indices:N.indices,diffusePixels:ae.data,diffuseWidth:ae.width,diffuseHeight:ae.height}),De.updateSeeds(ot(oe),oe.length),L("meshTris",N.triCount.toLocaleString()),L("splatCount",oe.length.toLocaleString()))}function vr(){const o=[];for(let t=0;t<2e5;t++){const r=Math.random()*Math.PI*2,i=Math.pow(Math.random(),.5)*3,s=Math.floor(Math.random()*3)*(Math.PI*2/3),n=r*.5;o.push({position:[i*Math.cos(r+s+n)+(Math.random()-.5)*.3,(Math.random()-.5)*.2*(1-i/3),i*Math.sin(r+s+n)+(Math.random()-.5)*.3],orientation:[1,0,0,0],scale:.015+Math.random()*.02,color:[.6+Math.random()*.4,.4+Math.random()*.4,.8+Math.random()*.2],depth:i*.3})}De.updateSeeds(ot(o),o.length),L("splatCount",2e5.toLocaleString())}const j=[{id:"hybrid-pipeline",title:"Hybrid Render Pipeline",desc:"Four compositing layers — Mesh, Gaussian Splats, Procedural Shader, Edge Inscription — rendered simultaneously into a unified framebuffer with per-layer blend modes and tonemapping.",tags:["WebGL 2.0","MRT GBuffer","4-Layer Compositor","Tone Mapping"],mesh:"knot",camera:{azimuth:.5,elevation:.35,distance:5},layers:{mesh:!0,splat:!0,procedural:!0,inscription:!0},v3:{shadows:!0,particles:!1,volumetric:!1,deferred:!0},procGeometry:3,state:"active",usecaseHighlight:0,capMetric:{key:"capLayers",value:"4"}},{id:"gaussian-splats",title:"200K Gaussian Splats",desc:"Real-time point cloud rendering with per-splat orientation quaternions, GPU-driven orbital animation, chromatic aberration, and HDR bloom — all at 60fps.",tags:["200K Points","GPU Animation","Chromatic Aberration","HDR Bloom","Quaternion Orientation"],mesh:null,camera:{azimuth:1,elevation:.15,distance:4},layers:{mesh:!1,splat:!0,procedural:!1,inscription:!1},v3:{shadows:!1,particles:!1,volumetric:!1,deferred:!1},procGeometry:3,state:"active",usecaseHighlight:4,capMetric:{key:"capLayers",value:"200K"}},{id:"edge-inscription",title:"Edge Inscription System",desc:"GBuffer-driven Sobel edge detection feeds a 4-layer procedural inscription system with 24 geometry variants, 4D rotation, and per-layer color, opacity, and pattern control.",tags:["Sobel Edge Detection","4 Inscription Layers","24 Geometries","4D Rotation","Audio Reactive"],mesh:"torus",camera:{azimuth:-.5,elevation:.4,distance:4.5},layers:{mesh:!0,splat:!1,procedural:!1,inscription:!0},v3:{shadows:!0,particles:!1,volumetric:!1,deferred:!0},procGeometry:7,state:"active",usecaseHighlight:1,capMetric:{key:"capGeometries",value:"24"}},{id:"state-machine",title:"Semantic State Machine",desc:"Object-aware inscription transitions between semantic states — idle, active, powered, damaged, destroyed — with smooth interpolation, priority overrides, and audio-reactive modulation.",tags:["5 Semantic States","Smooth Transitions","Priority System","Audio Mapping","Per-Object Identity"],mesh:"sphere",camera:{azimuth:.2,elevation:.3,distance:4.8},layers:{mesh:!0,splat:!0,procedural:!1,inscription:!0},v3:{shadows:!0,particles:!0,volumetric:!1,deferred:!0},procGeometry:5,state:"idle",usecaseHighlight:2,capMetric:{key:"capLayers",value:"5"}},{id:"volumetric-4d",title:"4D Volumetric Fields",desc:"Raymarched volumetric inscription with 48-step integration through 4D-rotated noise fields. Emission-absorption model constrained by GBuffer depth for physically-grounded volumetric effects.",tags:["48 Ray Steps","4D Noise Field","Emission-Absorption","Depth Constrained","Volumetric Rendering"],mesh:"cube",camera:{azimuth:.8,elevation:.25,distance:5.5},layers:{mesh:!0,splat:!1,procedural:!0,inscription:!0},v3:{shadows:!1,particles:!1,volumetric:!0,deferred:!1},procGeometry:1,state:"powered",usecaseHighlight:3,capMetric:{key:"capRotation",value:"6D"}},{id:"full-pipeline",title:"Full v3 Pipeline",desc:"All 15 features active simultaneously: Mesh renderer, Gaussian splats, procedural shader, edge inscription, shadow mapping, particle system, volumetric inscription, deferred lighting, and inscription textures — production-ready at 60fps.",tags:["15 Features","All Layers Active","Shadow + Particles","Volumetric","Deferred Lighting","60fps"],tagType:"purple",mesh:"knot",camera:{azimuth:0,elevation:.3,distance:4.8},layers:{mesh:!0,splat:!0,procedural:!0,inscription:!0},v3:{shadows:!0,particles:!0,volumetric:!1,deferred:!0},procGeometry:3,state:"active",usecaseHighlight:5,capMetric:{key:"capLayers",value:"15"}}];let C=0,q=0;const br=9;let H=!0,ft=!1,K=!1;const Se=["idle","active","powered","damaged","destroyed"];let se=0,et=0;function J(o){const e=j[o];if(!e)return;e.mesh?ht(e.mesh):vr(),x.meshLayer.enabled=e.layers.mesh,x.splatLayer.enabled=e.layers.splat,x.proceduralLayer.enabled=e.layers.procedural,x.inscriptionLayer.enabled=e.layers.inscription,lt=e.procGeometry,V.setTarget(e.camera.azimuth,e.camera.elevation,e.camera.distance,.02),$.setObjectState(1,e.state),xr(o),Rr(o),Ar(e.usecaseHighlight),e.capMetric&&Sr(e.capMetric.key,e.capMetric.value);const t=document.createElement("div");t.className="scene-flash",document.body.appendChild(t),setTimeout(()=>t.remove(),1500)}function yr(){C=(C+1)%j.length,q=performance.now()*.001,J(C)}function L(o,e){const t=document.getElementById(o);t&&(t.textContent=e)}function xr(o){const e=j[o],t=document.getElementById("narrative");t.classList.remove("visible"),t.classList.add("exit"),setTimeout(()=>{document.getElementById("sceneCounter").textContent=`${String(o+1).padStart(2,"0")} / ${String(j.length).padStart(2,"0")}`,document.getElementById("sceneTitle").textContent=e.title,document.getElementById("sceneDesc").textContent=e.desc;const r=document.getElementById("techTags");r.innerHTML=e.tags.map(i=>`<span class="tech-tag${e.tagType==="purple"?" purple":""}">${i}</span>`).join(""),t.classList.remove("exit"),t.classList.add("visible")},400)}function Rr(o){document.querySelectorAll(".progress-dot").forEach((e,t)=>{e.classList.toggle("active",t===o),e.classList.toggle("visited",t<o)}),document.getElementById("progressLabel").textContent=`Scene ${o+1} of ${j.length}`}function Ar(o){document.querySelectorAll(".usecase-tag").forEach(e=>{e.classList.toggle("highlight",parseInt(e.dataset.idx)===o)})}function Sr(o,e){const t=document.getElementById(o);t&&(t.textContent=e)}function Pe(){["top-bar","narrative","stats","progress-bar","usecases","capabilities"].forEach(o=>{document.getElementById(o).classList.add("visible")})}function dt(){["narrative","progress-bar","capabilities","usecases"].forEach(o=>{const e=document.getElementById(o);e&&e.classList.remove("visible")})}document.getElementById("btnContact").addEventListener("click",()=>{document.getElementById("contact-panel").classList.add("visible")});document.getElementById("btnCloseContact").addEventListener("click",()=>{document.getElementById("contact-panel").classList.remove("visible")});document.getElementById("btnReplay").addEventListener("click",()=>{K=!1,H=!0,C=0,q=performance.now()*.001,document.getElementById("interactive-cta").classList.remove("visible"),Pe(),J(0)});document.getElementById("btnControls").addEventListener("click",()=>{K=!K,K?(H=!1,dt(),document.getElementById("interactive-cta").classList.remove("visible"),x.meshLayer.enabled=!0,x.splatLayer.enabled=!0,x.proceduralLayer.enabled=!0,x.inscriptionLayer.enabled=!0):(H=!0,q=performance.now()*.001,Pe(),J(C))});document.getElementById("btnInteractive").addEventListener("click",()=>{K=!0,H=!1,document.getElementById("interactive-cta").classList.remove("visible"),dt(),x.meshLayer.enabled=!0,x.splatLayer.enabled=!0,x.proceduralLayer.enabled=!0,x.inscriptionLayer.enabled=!0});document.querySelectorAll(".progress-dot").forEach(o=>{o.addEventListener("click",()=>{const e=parseInt(o.dataset.scene);C=e,q=performance.now()*.001,J(e)})});function Fr(){ht("knot"),setTimeout(()=>{document.getElementById("opening").classList.add("fade-out"),setTimeout(()=>{document.getElementById("opening").classList.add("hidden"),ft=!0,q=performance.now()*.001,Pe(),J(0)},1500)},3e3)}let ne=0,le=performance.now(),Mr=performance.now(),tt=0,rt=!0,ce=!1,Fe=!1,it=!0,ue=.4;function mt(){const o=performance.now(),e=(o-Mr)*.001,t=e-tt;tt=e;const r=c.canvas.width,i=c.canvas.height;V.update(),fe.rot4dXY=e*.1,fe.rot4dYZ=e*.07,$.update(t);{const n=ue*(.5+.5*Math.sin(e*2.1)),a=ue*(.5+.5*Math.sin(e*3.7)),l=ue*(.5+.5*Math.sin(e*5.3)),h=ue*(.6+.4*Math.sin(e*1.3));$.setAudio(n,a,l,h)}if(H&&ft){const n=e-q;C===3&&n>1.5&&e-et>1.8&&(se=(se+1)%Se.length,$.setObjectState(1,Se[se]),L("currentState",Se[se]),et=e),n>br&&(C<j.length-1?yr():(H=!1,document.getElementById("interactive-cta").classList.add("visible")));const a=j[C];a&&(rt=a.v3.shadows,ce=a.v3.particles,Fe=a.v3.volumetric,it=a.v3.deferred)}if(ce&&O){O.update(Math.min(t,.05));const{buffer:n,count:a}=O.getSplatBuffer();k&&a>0&&k.updateSeeds(n,a),L("particleCount",O.getAliveCount())}else L("particleCount","0");const s=x.render(e,V.viewMatrix,V.projectionMatrix,{viewProjection:V.viewProjection});if(ce&&k&&O&&O.getAliveCount()>0&&(_r(r,i),c.bindFramebuffer(c.FRAMEBUFFER,W.framebuffer),c.viewport(0,0,r,i),k.render(V.viewProjection,e),c.bindFramebuffer(c.FRAMEBUFFER,null),c.viewport(0,0,r,i),c.enable(c.BLEND),c.blendFunc(c.ONE,c.ONE),c.disable(c.DEPTH_TEST),gr(W.texture,1),c.disable(c.BLEND)),Fe&&A){c.enable(c.BLEND),c.blendFunc(c.ONE,c.ONE),c.useProgram(A),c.bindVertexArray(ct);const n=Q.gbuffer?Q.gbuffer.normalTexture:null;n&&(c.activeTexture(c.TEXTURE0),c.bindTexture(c.TEXTURE_2D,n),c.uniform1i(c.getUniformLocation(A,"u_normalDepth"),0)),c.uniform1f(c.getUniformLocation(A,"u_time"),e),c.uniform1f(c.getUniformLocation(A,"u_density"),.8),c.uniform1f(c.getUniformLocation(A,"u_absorption"),.4),c.uniform1f(c.getUniformLocation(A,"u_geometry"),fe.geometry||3),c.uniform2f(c.getUniformLocation(A,"u_resolution"),r,i),c.drawArrays(c.TRIANGLES,0,3),c.disable(c.BLEND)}if(ne++,o-le>500){const n=Math.round(ne/((o-le)/1e3)),a=((o-le)/ne).toFixed(1);L("fps",n),L("frameTime",a+" ms"),document.getElementById("capFps").textContent=n;const l=(s?s.layersComposited:0)+(ce?1:0)+(Fe?1:0)+(rt?1:0)+(it?1:0);L("activeLayers",l),ne=0,le=o}requestAnimationFrame(mt)}Fr();mt();
