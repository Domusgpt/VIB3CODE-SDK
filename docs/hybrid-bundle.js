const Ir=Object.freeze([1,0,0,0]),Cr=Object.freeze([1,1,1]),at=12;function Zt(i){const e=new Float32Array(i.length*at);return i.forEach((r,t)=>{const a=t*at,s=r.position??[0,0,0],l=r.orientation??Ir,n=r.color??Cr,c=r.scale??1,h=r.depth??0;e[a+0]=s[0]??0,e[a+1]=s[1]??0,e[a+2]=s[2]??0,e[a+3]=c,e[a+4]=l[0]??1,e[a+5]=l[1]??0,e[a+6]=l[2]??0,e[a+7]=l[3]??0,e[a+8]=n[0]??1,e[a+9]=n[1]??1,e[a+10]=n[2]??1,e[a+11]=h}),e}const Xr=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),Or=`#version 300 es
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
`,Nr=`#version 300 es
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
`;class $t{constructor(e,{pointScale:r=14,blendMode:t="premultiplied",animate:a=!1,intensity:s=1,chromatic:l=0}={}){if(!e)throw new Error("GaussianSplatRenderer requires a WebGL2 context.");this.gl=e,this.pointScale=r,this.blendMode=t,this.animate=a,this.intensity=s,this.chromatic=l,this.program=null,this.vao=null,this.buffer=null,this.count=0,this.uniforms={},this._init()}_init(){const e=this.gl,r=e.createProgram(),t=this._compileShader(e.VERTEX_SHADER,Or),a=this._compileShader(e.FRAGMENT_SHADER,Nr);if(e.attachShader(r,t),e.attachShader(r,a),e.linkProgram(r),!e.getProgramParameter(r,e.LINK_STATUS))throw new Error(e.getProgramInfoLog(r));this.program=r,this.vao=e.createVertexArray(),e.bindVertexArray(this.vao),this.buffer=e.createBuffer(),e.bindBuffer(e.ARRAY_BUFFER,this.buffer);const s=at*4,l=e.getAttribLocation(r,"a_position");e.enableVertexAttribArray(l),e.vertexAttribPointer(l,3,e.FLOAT,!1,s,0);const n=e.getAttribLocation(r,"a_scale");e.enableVertexAttribArray(n),e.vertexAttribPointer(n,1,e.FLOAT,!1,s,3*4);const c=e.getAttribLocation(r,"a_orientation");e.enableVertexAttribArray(c),e.vertexAttribPointer(c,4,e.FLOAT,!1,s,4*4);const h=e.getAttribLocation(r,"a_color");e.enableVertexAttribArray(h),e.vertexAttribPointer(h,3,e.FLOAT,!1,s,8*4);const f=e.getAttribLocation(r,"a_depth");e.enableVertexAttribArray(f),e.vertexAttribPointer(f,1,e.FLOAT,!1,s,11*4),e.bindVertexArray(null),this.uniforms.pointScale=e.getUniformLocation(r,"u_pointScale"),this.uniforms.viewProjection=e.getUniformLocation(r,"u_viewProjection"),this.uniforms.time=e.getUniformLocation(r,"u_time"),this.uniforms.animate=e.getUniformLocation(r,"u_animate"),this.uniforms.intensity=e.getUniformLocation(r,"u_intensity"),this.uniforms.chromatic=e.getUniformLocation(r,"u_chromatic")}_compileShader(e,r){const t=this.gl,a=t.createShader(e);if(t.shaderSource(a,r),t.compileShader(a),!t.getShaderParameter(a,t.COMPILE_STATUS))throw new Error(t.getShaderInfoLog(a));return a}updateSeeds(e,r){const t=this.gl;t.bindBuffer(t.ARRAY_BUFFER,this.buffer),t.bufferData(t.ARRAY_BUFFER,e,t.DYNAMIC_DRAW),this.count=r}render(e,r=0){const t=this.gl;this.count&&(t.viewport(0,0,t.canvas.width,t.canvas.height),t.clearColor(.012,.02,.05,1),t.clear(t.COLOR_BUFFER_BIT|t.DEPTH_BUFFER_BIT),t.enable(t.DEPTH_TEST),t.depthFunc(t.LEQUAL),t.depthMask(!1),t.enable(t.BLEND),this.blendMode==="additive"?t.blendFunc(t.ONE,t.ONE):t.blendFunc(t.ONE,t.ONE_MINUS_SRC_ALPHA),t.useProgram(this.program),t.bindVertexArray(this.vao),t.uniform1f(this.uniforms.pointScale,this.pointScale),t.uniform1f(this.uniforms.time,r),t.uniform1f(this.uniforms.animate,this.animate?1:0),t.uniform1f(this.uniforms.intensity,this.intensity),t.uniform1f(this.uniforms.chromatic,this.chromatic),t.uniformMatrix4fv(this.uniforms.viewProjection,!1,e||Xr),t.drawArrays(t.POINTS,0,this.count),t.bindVertexArray(null),t.depthMask(!0),t.disable(t.BLEND))}}const Wr=`#version 300 es
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
`,jr=`#version 300 es
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
`;function Vr(i,e,r){const t=i.createFramebuffer();i.bindFramebuffer(i.FRAMEBUFFER,t);const a=i.createTexture();i.bindTexture(i.TEXTURE_2D,a),i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,e,r,0,i.RGBA,i.UNSIGNED_BYTE,null),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,a,0);const s=i.createTexture();i.bindTexture(i.TEXTURE_2D,s);let l=i.RGBA8,n=i.UNSIGNED_BYTE;(i.getExtension("EXT_color_buffer_half_float")||i.getExtension("EXT_color_buffer_float"))&&(l=i.RGBA16F,n=i.HALF_FLOAT),i.texImage2D(i.TEXTURE_2D,0,l,e,r,0,i.RGBA,n,null),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT1,i.TEXTURE_2D,s,0);const c=i.createTexture();i.bindTexture(i.TEXTURE_2D,c),i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,e,r,0,i.RGBA,i.UNSIGNED_BYTE,null),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.NEAREST),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT2,i.TEXTURE_2D,c,0);const h=i.createRenderbuffer();return i.bindRenderbuffer(i.RENDERBUFFER,h),i.renderbufferStorage(i.RENDERBUFFER,i.DEPTH_COMPONENT24,e,r),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.DEPTH_ATTACHMENT,i.RENDERBUFFER,h),i.drawBuffers([i.COLOR_ATTACHMENT0,i.COLOR_ATTACHMENT1,i.COLOR_ATTACHMENT2]),i.bindFramebuffer(i.FRAMEBUFFER,null),{framebuffer:t,colorTexture:a,normalTexture:s,objectIDTexture:c,depthRenderbuffer:h,width:e,height:r}}function vt(i,e){i.deleteFramebuffer(e.framebuffer),i.deleteTexture(e.colorTexture),i.deleteTexture(e.normalTexture),i.deleteTexture(e.objectIDTexture),i.deleteRenderbuffer(e.depthRenderbuffer)}class Gr{constructor(e,{lightDir:r=[.4,.8,.3],lightColor:t=[1,.98,.95],ambientColor:a=[.12,.12,.18],specularPower:s=32}={}){this.gl=e,this.lightDir=r,this.lightColor=t,this.ambientColor=a,this.specularPower=s,this.opacity=1,this.objectID=0,this.morphWeight=0,this._hasMorphTarget=!1,this._program=null,this._vao=null,this._posBuf=null,this._nrmBuf=null,this._uvBuf=null,this._colBuf=null,this._morphPosBuf=null,this._morphNrmBuf=null,this._idxBuf=null,this._indexCount=0,this._vertexCount=0,this._indexType=0,this._diffuseTexture=null,this._hasTexture=!1,this._gbuffer=null,this._gbufferWidth=0,this._gbufferHeight=0,this._uniforms={},this._init()}_init(){const e=this.gl;this._program=this._createProgram(Wr,jr);const r=h=>e.getUniformLocation(this._program,h);this._uniforms={modelView:r("u_modelView"),projection:r("u_projection"),normalMatrix:r("u_normalMatrix"),rotation4D:r("u_rotation4D"),projDistance:r("u_projDistance"),use4D:r("u_use4D"),morphWeight:r("u_morphWeight"),hasMorphTarget:r("u_hasMorphTarget"),diffuseMap:r("u_diffuseMap"),hasTexture:r("u_hasTexture"),lightDir:r("u_lightDir"),lightColor:r("u_lightColor"),ambientColor:r("u_ambientColor"),specularPower:r("u_specularPower"),opacity:r("u_opacity"),objectID:r("u_objectID")},this._vao=e.createVertexArray(),e.bindVertexArray(this._vao),this._posBuf=e.createBuffer();const t=e.getAttribLocation(this._program,"a_position");e.bindBuffer(e.ARRAY_BUFFER,this._posBuf),e.enableVertexAttribArray(t),e.vertexAttribPointer(t,3,e.FLOAT,!1,0,0),this._nrmBuf=e.createBuffer();const a=e.getAttribLocation(this._program,"a_normal");e.bindBuffer(e.ARRAY_BUFFER,this._nrmBuf),e.enableVertexAttribArray(a),e.vertexAttribPointer(a,3,e.FLOAT,!1,0,0),this._uvBuf=e.createBuffer();const s=e.getAttribLocation(this._program,"a_uv");e.bindBuffer(e.ARRAY_BUFFER,this._uvBuf),e.enableVertexAttribArray(s),e.vertexAttribPointer(s,2,e.FLOAT,!1,0,0),this._colBuf=e.createBuffer();const l=e.getAttribLocation(this._program,"a_color");e.bindBuffer(e.ARRAY_BUFFER,this._colBuf),e.enableVertexAttribArray(l),e.vertexAttribPointer(l,4,e.FLOAT,!1,0,0),this._morphPosBuf=e.createBuffer();const n=e.getAttribLocation(this._program,"a_morphPosition");n>=0&&(e.bindBuffer(e.ARRAY_BUFFER,this._morphPosBuf),e.enableVertexAttribArray(n),e.vertexAttribPointer(n,3,e.FLOAT,!1,0,0)),this._morphNrmBuf=e.createBuffer();const c=e.getAttribLocation(this._program,"a_morphNormal");c>=0&&(e.bindBuffer(e.ARRAY_BUFFER,this._morphNrmBuf),e.enableVertexAttribArray(c),e.vertexAttribPointer(c,3,e.FLOAT,!1,0,0)),this._idxBuf=e.createBuffer(),e.bindVertexArray(null)}uploadGeometry({positions:e,normals:r,uvs:t,colors:a,indices:s}){const l=this.gl,n=e.length/3;if(this._vertexCount=n,l.bindBuffer(l.ARRAY_BUFFER,this._posBuf),l.bufferData(l.ARRAY_BUFFER,e,l.DYNAMIC_DRAW),r)l.bindBuffer(l.ARRAY_BUFFER,this._nrmBuf),l.bufferData(l.ARRAY_BUFFER,r,l.DYNAMIC_DRAW);else{const c=new Float32Array(n*3);for(let h=0;h<n;h++)c[h*3+1]=1;l.bindBuffer(l.ARRAY_BUFFER,this._nrmBuf),l.bufferData(l.ARRAY_BUFFER,c,l.DYNAMIC_DRAW)}if(t?(l.bindBuffer(l.ARRAY_BUFFER,this._uvBuf),l.bufferData(l.ARRAY_BUFFER,t,l.DYNAMIC_DRAW)):(l.bindBuffer(l.ARRAY_BUFFER,this._uvBuf),l.bufferData(l.ARRAY_BUFFER,new Float32Array(n*2),l.DYNAMIC_DRAW)),a)l.bindBuffer(l.ARRAY_BUFFER,this._colBuf),l.bufferData(l.ARRAY_BUFFER,a,l.DYNAMIC_DRAW);else{const c=new Float32Array(n*4);for(let h=0;h<n;h++)c[h*4]=1,c[h*4+1]=1,c[h*4+2]=1,c[h*4+3]=1;l.bindBuffer(l.ARRAY_BUFFER,this._colBuf),l.bufferData(l.ARRAY_BUFFER,c,l.DYNAMIC_DRAW)}l.bindBuffer(l.ARRAY_BUFFER,this._morphPosBuf),l.bufferData(l.ARRAY_BUFFER,e,l.DYNAMIC_DRAW),l.bindBuffer(l.ARRAY_BUFFER,this._morphNrmBuf),l.bufferData(l.ARRAY_BUFFER,r||new Float32Array(n*3),l.DYNAMIC_DRAW),s?(l.bindBuffer(l.ELEMENT_ARRAY_BUFFER,this._idxBuf),l.bufferData(l.ELEMENT_ARRAY_BUFFER,s,l.STATIC_DRAW),this._indexCount=s.length,this._indexType=s instanceof Uint32Array?l.UNSIGNED_INT:l.UNSIGNED_SHORT):this._indexCount=0}uploadMorphTarget(e,r){const t=this.gl;t.bindBuffer(t.ARRAY_BUFFER,this._morphPosBuf),t.bufferData(t.ARRAY_BUFFER,e,t.DYNAMIC_DRAW),r&&(t.bindBuffer(t.ARRAY_BUFFER,this._morphNrmBuf),t.bufferData(t.ARRAY_BUFFER,r,t.DYNAMIC_DRAW)),this._hasMorphTarget=!0}uploadTexture(e){const r=this.gl;this._diffuseTexture||(this._diffuseTexture=r.createTexture()),r.bindTexture(r.TEXTURE_2D,this._diffuseTexture),e instanceof ImageData?r.texImage2D(r.TEXTURE_2D,0,r.RGBA,e.width,e.height,0,r.RGBA,r.UNSIGNED_BYTE,e.data):r.texImage2D(r.TEXTURE_2D,0,r.RGBA,r.RGBA,r.UNSIGNED_BYTE,e),r.generateMipmap(r.TEXTURE_2D),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR_MIPMAP_LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.REPEAT),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.REPEAT),this._hasTexture=!0}_ensureGBuffer(e,r){this._gbuffer&&this._gbufferWidth===e&&this._gbufferHeight===r||(this._gbuffer&&vt(this.gl,this._gbuffer),this._gbuffer=Vr(this.gl,e,r),this._gbufferWidth=e,this._gbufferHeight=r)}get gbuffer(){return this._gbuffer}render(e,r,{rotation4D:t=null,projDistance:a=2,width:s=0,height:l=0,clearBuffer:n=!0}={}){const c=this.gl,h=s||c.canvas.width,f=l||c.canvas.height;if(this._ensureGBuffer(h,f),c.bindFramebuffer(c.FRAMEBUFFER,this._gbuffer.framebuffer),c.viewport(0,0,h,f),n&&(c.clearColor(0,0,0,0),c.clear(c.COLOR_BUFFER_BIT|c.DEPTH_BUFFER_BIT)),this._vertexCount===0&&this._indexCount===0)return c.bindFramebuffer(c.FRAMEBUFFER,null),this._gbuffer;c.enable(c.DEPTH_TEST),c.depthFunc(c.LEQUAL),c.depthMask(!0),c.enable(c.CULL_FACE),c.cullFace(c.BACK),c.disable(c.BLEND),c.useProgram(this._program),c.bindVertexArray(this._vao),this._indexCount>0&&c.bindBuffer(c.ELEMENT_ARRAY_BUFFER,this._idxBuf);const u=this._uniforms,d=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);return c.uniformMatrix4fv(u.modelView,!1,e||d),c.uniformMatrix4fv(u.projection,!1,r||d),c.uniformMatrix4fv(u.normalMatrix,!1,e||d),c.uniformMatrix4fv(u.rotation4D,!1,t||d),c.uniform1f(u.projDistance,a),c.uniform1f(u.use4D,t?1:0),c.uniform1f(u.morphWeight,this.morphWeight),c.uniform1f(u.hasMorphTarget,this._hasMorphTarget?1:0),c.uniform3fv(u.lightDir,this.lightDir),c.uniform3fv(u.lightColor,this.lightColor),c.uniform3fv(u.ambientColor,this.ambientColor),c.uniform1f(u.specularPower,this.specularPower),c.uniform1f(u.opacity,this.opacity),c.uniform1f(u.objectID,this.objectID),this._hasTexture&&this._diffuseTexture?(c.activeTexture(c.TEXTURE0),c.bindTexture(c.TEXTURE_2D,this._diffuseTexture),c.uniform1i(u.diffuseMap,0),c.uniform1f(u.hasTexture,1)):c.uniform1f(u.hasTexture,0),this._indexCount>0?c.drawElements(c.TRIANGLES,this._indexCount,this._indexType,0):c.drawArrays(c.TRIANGLES,0,this._vertexCount),c.bindVertexArray(null),c.bindFramebuffer(c.FRAMEBUFFER,null),c.disable(c.CULL_FACE),this._gbuffer}_createProgram(e,r){const t=this.gl,a=t.createProgram(),s=this._compile(t.VERTEX_SHADER,e),l=this._compile(t.FRAGMENT_SHADER,r);if(t.attachShader(a,s),t.attachShader(a,l),t.linkProgram(a),!t.getProgramParameter(a,t.LINK_STATUS))throw new Error("MeshRenderer link error: "+t.getProgramInfoLog(a));return a}_compile(e,r){const t=this.gl,a=t.createShader(e);if(t.shaderSource(a,r),t.compileShader(a),!t.getShaderParameter(a,t.COMPILE_STATUS))throw new Error("MeshRenderer compile error: "+t.getShaderInfoLog(a));return a}dispose(){const e=this.gl;e.deleteProgram(this._program),e.deleteVertexArray(this._vao),e.deleteBuffer(this._posBuf),e.deleteBuffer(this._nrmBuf),e.deleteBuffer(this._uvBuf),e.deleteBuffer(this._colBuf),e.deleteBuffer(this._morphPosBuf),e.deleteBuffer(this._morphNrmBuf),e.deleteBuffer(this._idxBuf),this._diffuseTexture&&e.deleteTexture(this._diffuseTexture),this._gbuffer&&vt(e,this._gbuffer)}}const bt=`#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
    float x = float((gl_VertexID & 1) << 2) - 1.0;
    float y = float((gl_VertexID & 2) << 1) - 1.0;
    v_uv = vec2(x, y) * 0.5 + 0.5;
    gl_Position = vec4(x, y, 0.0, 1.0);
}
`,kr=`#version 300 es
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
`,Yr=`#version 300 es
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
`;function xt(i,e,r){const t=i.createTexture();i.bindTexture(i.TEXTURE_2D,t),i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,e,r,0,i.RGBA,i.UNSIGNED_BYTE,null),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE);const a=i.createFramebuffer();return i.bindFramebuffer(i.FRAMEBUFFER,a),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,t,0),i.bindFramebuffer(i.FRAMEBUFFER,null),{framebuffer:a,texture:t,width:e,height:r}}function ye(i,e){i.deleteFramebuffer(e.framebuffer),i.deleteTexture(e.texture)}const Rt=[[.2,.6,1],[.8,.3,1],[1,.5,.2],[.3,1,.6],[1,.2,.5],[.4,.9,.9],[.9,.8,.2],[.5,.3,1],[.2,1,.4],[1,.4,0],[.6,.2,.9],[0,.8,.8],[1,.6,.6],[.3,.5,1],[.8,1,.3],[.9,.3,.6]];function yt(i,e){const r=e>1?i/(e-1):0;return{geometry:i*3%24,thickness:.3+r*.5,opacity:.9-r*.5,color:Rt[i%Rt.length],patternScale:3+i*.5,patternSpeed:.3+i*.05,rotOffset:i*.4}}class zr{constructor(e,{layerCount:r=4,depthSensitivity:t=8,normalSensitivity:a=2,globalThickness:s=.6,layers:l=null}={}){if(this.gl=e,this.layerCount=Math.min(16,Math.max(1,r)),this.depthSensitivity=t,this.normalSensitivity=a,this.globalThickness=s,this.rot4dXY=0,this.rot4dXZ=0,this.rot4dYZ=0,this.rot4dXW=0,this.rot4dYW=0,this.rot4dZW=0,this.bass=0,this.mid=0,this.high=0,this.energy=0,this.layers=l||[],this.layers.length===0)for(let n=0;n<this.layerCount;n++)this.layers.push(yt(n,this.layerCount));this._edgeProgram=null,this._inscriptionProgram=null,this._quadVao=null,this._edgeFBO=null,this._compositeFBO=null,this._width=0,this._height=0,this._blackTexture=null,this._edgeUniforms={},this._inscUniforms={},this._init()}_init(){const e=this.gl;this._edgeProgram=this._createProgram(bt,kr),this._inscriptionProgram=this._createProgram(bt,Yr),this._quadVao=e.createVertexArray(),this._blackTexture=e.createTexture(),e.bindTexture(e.TEXTURE_2D,this._blackTexture),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,new Uint8Array([0,0,0,0])),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),this._cacheEdgeUniforms(),this._cacheInscriptionUniforms()}_cacheEdgeUniforms(){const e=this.gl,r=this._edgeProgram;this._edgeUniforms={normalDepth:e.getUniformLocation(r,"u_normalDepth"),objectID:e.getUniformLocation(r,"u_objectID"),texelSize:e.getUniformLocation(r,"u_texelSize"),depthSensitivity:e.getUniformLocation(r,"u_depthSensitivity"),normalSensitivity:e.getUniformLocation(r,"u_normalSensitivity"),hasObjectID:e.getUniformLocation(r,"u_hasObjectID")}}_cacheInscriptionUniforms(){const e=this.gl,r=this._inscriptionProgram,t=a=>e.getUniformLocation(r,a);this._inscUniforms={edgeMap:t("u_edgeMap"),normalDepth:t("u_normalDepth"),time:t("u_time"),layerCount:t("u_layerCount"),resolution:t("u_resolution"),dpr:t("u_dpr"),globalThickness:t("u_globalThickness"),rot4dXY:t("u_rot4dXY"),rot4dXZ:t("u_rot4dXZ"),rot4dYZ:t("u_rot4dYZ"),rot4dXW:t("u_rot4dXW"),rot4dYW:t("u_rot4dYW"),rot4dZW:t("u_rot4dZW"),bass:t("u_bass"),mid:t("u_mid"),high:t("u_high"),energy:t("u_energy"),geometries:[],thicknesses:[],opacities:[],colors:[],patternScales:[],patternSpeeds:[],rotOffsets:[]};for(let a=0;a<16;a++)this._inscUniforms.geometries[a]=t(`u_layerGeometries[${a}]`),this._inscUniforms.thicknesses[a]=t(`u_layerThicknesses[${a}]`),this._inscUniforms.opacities[a]=t(`u_layerOpacities[${a}]`),this._inscUniforms.colors[a]=t(`u_layerColors[${a}]`),this._inscUniforms.patternScales[a]=t(`u_layerPatternScales[${a}]`),this._inscUniforms.patternSpeeds[a]=t(`u_layerPatternSpeeds[${a}]`),this._inscUniforms.rotOffsets[a]=t(`u_layerRotOffsets[${a}]`)}_ensureFBOs(e,r){if(this._width===e&&this._height===r)return;const t=this.gl;this._edgeFBO&&ye(t,this._edgeFBO),this._compositeFBO&&ye(t,this._compositeFBO),this._edgeFBO=xt(t,e,r),this._compositeFBO=xt(t,e,r),this._width=e,this._height=r}setLayerCount(e){for(e=Math.min(16,Math.max(1,e));this.layers.length<e;)this.layers.push(yt(this.layers.length,e));this.layerCount=e}setLayerConfig(e,r){e>=0&&e<this.layers.length&&Object.assign(this.layers[e],r)}setAudio(e,r,t,a){this.bass=e||0,this.mid=r||0,this.high=t||0,this.energy=a||0}render(e,r,{width:t=0,height:a=0,objectIDTexture:s=null,dpr:l=1}={}){const n=this.gl,c=t||n.canvas.width,h=a||n.canvas.height;this._ensureFBOs(c,h),n.bindFramebuffer(n.FRAMEBUFFER,this._edgeFBO.framebuffer),n.viewport(0,0,c,h),n.disable(n.DEPTH_TEST),n.disable(n.BLEND),n.useProgram(this._edgeProgram),n.bindVertexArray(this._quadVao);const f=this._edgeUniforms;n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,e),n.uniform1i(f.normalDepth,0),n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,s||this._blackTexture),n.uniform1i(f.objectID,1),n.uniform2f(f.texelSize,1/c,1/h),n.uniform1f(f.depthSensitivity,this.depthSensitivity),n.uniform1f(f.normalSensitivity,this.normalSensitivity),n.uniform1f(f.hasObjectID,s?1:0),n.drawArrays(n.TRIANGLES,0,3),n.bindFramebuffer(n.FRAMEBUFFER,this._compositeFBO.framebuffer),n.viewport(0,0,c,h),n.clearColor(0,0,0,0),n.clear(n.COLOR_BUFFER_BIT),n.disable(n.BLEND),n.useProgram(this._inscriptionProgram),n.bindVertexArray(this._quadVao);const u=this._inscUniforms;n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,this._edgeFBO.texture),n.uniform1i(u.edgeMap,0),n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,e),n.uniform1i(u.normalDepth,1),n.uniform1f(u.time,r),n.uniform1i(u.layerCount,this.layerCount),n.uniform2f(u.resolution,c,h),n.uniform1f(u.dpr,l),n.uniform1f(u.globalThickness,this.globalThickness),n.uniform1f(u.rot4dXY,this.rot4dXY),n.uniform1f(u.rot4dXZ,this.rot4dXZ),n.uniform1f(u.rot4dYZ,this.rot4dYZ),n.uniform1f(u.rot4dXW,this.rot4dXW),n.uniform1f(u.rot4dYW,this.rot4dYW),n.uniform1f(u.rot4dZW,this.rot4dZW),n.uniform1f(u.bass,this.bass),n.uniform1f(u.mid,this.mid),n.uniform1f(u.high,this.high),n.uniform1f(u.energy,this.energy);for(let d=0;d<this.layerCount;d++){const m=this.layers[d];n.uniform1f(u.geometries[d],m.geometry),n.uniform1f(u.thicknesses[d],m.thickness),n.uniform1f(u.opacities[d],m.opacity),n.uniform3fv(u.colors[d],m.color),n.uniform1f(u.patternScales[d],m.patternScale),n.uniform1f(u.patternSpeeds[d],m.patternSpeed),n.uniform1f(u.rotOffsets[d],m.rotOffset)}return n.drawArrays(n.TRIANGLES,0,3),n.bindFramebuffer(n.FRAMEBUFFER,null),this._compositeFBO}get edgeTexture(){return this._edgeFBO?this._edgeFBO.texture:null}get compositeTexture(){return this._compositeFBO?this._compositeFBO.texture:null}_createProgram(e,r){const t=this.gl,a=t.createProgram(),s=this._compile(t.VERTEX_SHADER,e),l=this._compile(t.FRAGMENT_SHADER,r);if(t.attachShader(a,s),t.attachShader(a,l),t.linkProgram(a),!t.getProgramParameter(a,t.LINK_STATUS))throw new Error("EdgeInscriptionLayer link error: "+t.getProgramInfoLog(a));return a}_compile(e,r){const t=this.gl,a=t.createShader(e);if(t.shaderSource(a,r),t.compileShader(a),!t.getShaderParameter(a,t.COMPILE_STATUS))throw new Error("EdgeInscriptionLayer compile error: "+t.getShaderInfoLog(a));return a}dispose(){const e=this.gl;e.deleteProgram(this._edgeProgram),e.deleteProgram(this._inscriptionProgram),e.deleteVertexArray(this._quadVao),e.deleteTexture(this._blackTexture),this._edgeFBO&&ye(e,this._edgeFBO),this._compositeFBO&&ye(e,this._compositeFBO)}}const At=`#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
    float x = float((gl_VertexID & 1) << 2) - 1.0;
    float y = float((gl_VertexID & 2) << 1) - 1.0;
    v_uv = vec2(x, y) * 0.5 + 0.5;
    gl_Position = vec4(x, y, 0.0, 1.0);
}
`,Hr=`#version 300 es
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
`,qr=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 outColor;
void main() {
    outColor = texture(u_texture, v_uv);
}
`;function St(i,e,r){const t=i.createTexture();i.bindTexture(i.TEXTURE_2D,t),i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,e,r,0,i.RGBA,i.UNSIGNED_BYTE,null),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE);const a=i.createRenderbuffer();i.bindRenderbuffer(i.RENDERBUFFER,a),i.renderbufferStorage(i.RENDERBUFFER,i.DEPTH_COMPONENT24,e,r);const s=i.createFramebuffer();return i.bindFramebuffer(i.FRAMEBUFFER,s),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,t,0),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.DEPTH_ATTACHMENT,i.RENDERBUFFER,a),i.bindFramebuffer(i.FRAMEBUFFER,null),{framebuffer:s,texture:t,depthRb:a,width:e,height:r}}function Ae(i,e){i.deleteFramebuffer(e.framebuffer),i.deleteTexture(e.texture),i.deleteRenderbuffer(e.depthRb)}const Ie=Object.freeze({ALPHA:0,ADDITIVE:1,MULTIPLY:2,SCREEN:3});function Se(i={}){return{enabled:!0,opacity:1,blendMode:Ie.ALPHA,...i}}class Zr{constructor(e,{exposure:r=1.2,gamma:t=2.2}={}){this.gl=e,this.exposure=r,this.gamma=t,this._meshRenderer=null,this._sceneRenderer=null,this._splatRenderer=null,this._proceduralRenderer=null,this._edgeInscription=null,this._inscriptionChannel=null,this._dpr=1,this.meshLayer=Se(),this.splatLayer=Se({blendMode:Ie.ADDITIVE,opacity:.9}),this.proceduralLayer=Se({blendMode:Ie.SCREEN,opacity:.5}),this.inscriptionLayer=Se({blendMode:Ie.ADDITIVE,opacity:.8}),this._compositeProgram=null,this._blitProgram=null,this._quadVao=null,this._splatFBO=null,this._proceduralFBO=null,this._width=0,this._height=0,this._blackTexture=null,this._init()}_init(){const e=this.gl;this._compositeProgram=this._createProgram(At,Hr),this._blitProgram=this._createProgram(At,qr),this._quadVao=e.createVertexArray(),this._blackTexture=e.createTexture(),e.bindTexture(e.TEXTURE_2D,this._blackTexture),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,new Uint8Array([0,0,0,0])),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST)}_ensureFBOs(e,r){if(this._width===e&&this._height===r)return;const t=this.gl;this._splatFBO&&Ae(t,this._splatFBO),this._proceduralFBO&&Ae(t,this._proceduralFBO),this._splatFBO=St(t,e,r),this._proceduralFBO=St(t,e,r),this._width=e,this._height=r}setMeshRenderer(e){this._meshRenderer=e}setSceneRenderer(e){this._sceneRenderer=e}setSplatRenderer(e){this._splatRenderer=e}setProceduralRenderer(e){this._proceduralRenderer=e}setEdgeInscription(e){this._edgeInscription=e}setInscriptionChannel(e){this._inscriptionChannel=e}setDPR(e){this._dpr=e}render(e,r,t,{viewProjection:a=null,rotation4D:s=null,projDistance:l=2}={}){const n=this.gl,c=n.canvas.width,h=n.canvas.height;this._ensureFBOs(c,h);const f={meshRendered:!1,splatRendered:!1,proceduralRendered:!1,inscriptionRendered:!1,layersComposited:0};let u=this._blackTexture,d=this._blackTexture,m=this._blackTexture,E=this._blackTexture,p=null,v=null,T=null;if(this._sceneRenderer&&this.meshLayer.enabled){const g=this._sceneRenderer.render(r,t,{rotation4D:s,projDistance:l,width:c,height:h});T=g.gbuffer,T&&(u=T.colorTexture,p=T.normalTexture,v=T.objectIDTexture||null,f.meshRendered=!0,f.objectCount=g.objectCount)}else if(this._meshRenderer&&this.meshLayer.enabled){const g=this._meshRenderer.render(r,t,{rotation4D:s,projDistance:l,width:c,height:h});T=g,u=g.colorTexture,p=g.normalTexture,v=g.objectIDTexture||null,f.meshRendered=!0}if(this._splatRenderer&&this.splatLayer.enabled){n.bindFramebuffer(n.FRAMEBUFFER,this._splatFBO.framebuffer),n.viewport(0,0,c,h),n.clearColor(0,0,0,0),n.clear(n.COLOR_BUFFER_BIT|n.DEPTH_BUFFER_BIT),f.meshRendered&&T&&(n.bindFramebuffer(n.READ_FRAMEBUFFER,T.framebuffer),n.bindFramebuffer(n.DRAW_FRAMEBUFFER,this._splatFBO.framebuffer),n.blitFramebuffer(0,0,c,h,0,0,c,h,n.DEPTH_BUFFER_BIT,n.NEAREST),n.bindFramebuffer(n.FRAMEBUFFER,this._splatFBO.framebuffer));const g=a||new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),b=this._splatFBO.framebuffer;n.bindFramebuffer(n.FRAMEBUFFER,b),n.viewport(0,0,c,h),this._splatRenderer.render&&(this._splatRenderer.render(g,e),n.bindFramebuffer(n.FRAMEBUFFER,this._splatFBO.framebuffer),this._splatRenderer._drawSplats&&(n.viewport(0,0,c,h),n.clearColor(0,0,0,0),n.clear(n.COLOR_BUFFER_BIT),this._splatRenderer._drawSplats(g,e))),d=this._splatFBO.texture,f.splatRendered=!0}if(this._proceduralRenderer&&this.proceduralLayer.enabled&&(n.bindFramebuffer(n.FRAMEBUFFER,this._proceduralFBO.framebuffer),n.viewport(0,0,c,h),n.clearColor(0,0,0,0),n.clear(n.COLOR_BUFFER_BIT),this._proceduralRenderer(this._proceduralFBO,e),m=this._proceduralFBO.texture,f.proceduralRendered=!0),this._edgeInscription&&this.inscriptionLayer.enabled&&p){if(this._inscriptionChannel){const b=this._inscriptionChannel.registeredObjects,R=b.length>0?b[0]:0;this._inscriptionChannel.applyToLayer(this._edgeInscription,R)}E=this._edgeInscription.render(p,e,{width:c,height:h,objectIDTexture:v,dpr:this._dpr}).texture,f.inscriptionRendered=!0}n.bindFramebuffer(n.FRAMEBUFFER,null),n.viewport(0,0,c,h),n.disable(n.DEPTH_TEST),n.disable(n.BLEND),n.useProgram(this._compositeProgram),n.bindVertexArray(this._quadVao);const _=this._compositeProgram;return n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,u),n.uniform1i(n.getUniformLocation(_,"u_meshLayer"),0),n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,d),n.uniform1i(n.getUniformLocation(_,"u_splatLayer"),1),n.activeTexture(n.TEXTURE2),n.bindTexture(n.TEXTURE_2D,m),n.uniform1i(n.getUniformLocation(_,"u_proceduralLayer"),2),n.activeTexture(n.TEXTURE3),n.bindTexture(n.TEXTURE_2D,E),n.uniform1i(n.getUniformLocation(_,"u_inscriptionLayer"),3),n.uniform1f(n.getUniformLocation(_,"u_meshOpacity"),this.meshLayer.opacity),n.uniform1f(n.getUniformLocation(_,"u_splatOpacity"),this.splatLayer.opacity),n.uniform1f(n.getUniformLocation(_,"u_proceduralOpacity"),this.proceduralLayer.opacity),n.uniform1f(n.getUniformLocation(_,"u_inscriptionOpacity"),this.inscriptionLayer.opacity),n.uniform1f(n.getUniformLocation(_,"u_meshEnabled"),this.meshLayer.enabled&&f.meshRendered?1:0),n.uniform1f(n.getUniformLocation(_,"u_splatEnabled"),this.splatLayer.enabled&&f.splatRendered?1:0),n.uniform1f(n.getUniformLocation(_,"u_proceduralEnabled"),this.proceduralLayer.enabled&&f.proceduralRendered?1:0),n.uniform1f(n.getUniformLocation(_,"u_inscriptionEnabled"),this.inscriptionLayer.enabled&&f.inscriptionRendered?1:0),n.uniform1f(n.getUniformLocation(_,"u_meshBlend"),this.meshLayer.blendMode),n.uniform1f(n.getUniformLocation(_,"u_splatBlend"),this.splatLayer.blendMode),n.uniform1f(n.getUniformLocation(_,"u_proceduralBlend"),this.proceduralLayer.blendMode),n.uniform1f(n.getUniformLocation(_,"u_inscriptionBlend"),this.inscriptionLayer.blendMode),n.uniform1f(n.getUniformLocation(_,"u_exposure"),this.exposure),n.uniform1f(n.getUniformLocation(_,"u_gamma"),this.gamma),n.drawArrays(n.TRIANGLES,0,3),f.layersComposited=(f.meshRendered?1:0)+(f.splatRendered?1:0)+(f.proceduralRendered?1:0)+(f.inscriptionRendered?1:0),f}renderSplatOnly(e,r){this._splatRenderer&&this._splatRenderer.render(e,r)}_createProgram(e,r){const t=this.gl,a=t.createProgram(),s=this._compile(t.VERTEX_SHADER,e),l=this._compile(t.FRAGMENT_SHADER,r);if(t.attachShader(a,s),t.attachShader(a,l),t.linkProgram(a),!t.getProgramParameter(a,t.LINK_STATUS))throw new Error("HybridRenderPipeline link error: "+t.getProgramInfoLog(a));return a}_compile(e,r){const t=this.gl,a=t.createShader(e);if(t.shaderSource(a,r),t.compileShader(a),!t.getShaderParameter(a,t.COMPILE_STATUS))throw new Error("HybridRenderPipeline compile error: "+t.getShaderInfoLog(a));return a}dispose(){const e=this.gl;e.deleteProgram(this._compositeProgram),e.deleteProgram(this._blitProgram),e.deleteVertexArray(this._quadVao),e.deleteTexture(this._blackTexture),this._splatFBO&&Ae(e,this._splatFBO),this._proceduralFBO&&Ae(e,this._proceduralFBO)}}function Ee(i,e,r){return .2126*i+.7152*e+.0722*r}function ze(i,e,r,t,a){const s=(c,h)=>{const f=Math.min(e-1,Math.max(0,t+c)),u=Math.min(r-1,Math.max(0,a+h));return i[u*e+f]},l=-s(-1,-1)+s(1,-1)-2*s(-1,0)+2*s(1,0)-s(-1,1)+s(1,1),n=-s(-1,-1)-2*s(0,-1)-s(1,-1)+s(-1,1)+2*s(0,1)+s(1,1);return Math.sqrt(l*l+n*n)}function Ft(i,e,r,t,a){const s=1-t-a;return[i[0]*s+e[0]*t+r[0]*a,i[1]*s+e[1]*t+r[1]*a,i[2]*s+e[2]*t+r[2]*a]}function Dt(i,e,r,t,a){const s=1-t-a;return[i[0]*s+e[0]*t+r[0]*a,i[1]*s+e[1]*t+r[1]*a]}function He(i,e,r,t,a){t=t-Math.floor(t),a=a-Math.floor(a);const s=t*(e-1),l=a*(r-1),n=Math.floor(s),c=Math.floor(l),h=Math.min(e-1,n+1),f=Math.min(r-1,c+1),u=s-n,d=l-c,m=(A,F)=>(F*e+A)*4,E=m(n,c),p=m(h,c),v=m(n,f),T=m(h,f),_=(i[E]*(1-u)*(1-d)+i[p]*u*(1-d)+i[v]*(1-u)*d+i[T]*u*d)/255,g=(i[E+1]*(1-u)*(1-d)+i[p+1]*u*(1-d)+i[v+1]*(1-u)*d+i[T+1]*u*d)/255,b=(i[E+2]*(1-u)*(1-d)+i[p+2]*u*(1-d)+i[v+2]*(1-u)*d+i[T+2]*u*d)/255,R=(i[E+3]*(1-u)*(1-d)+i[p+3]*u*(1-d)+i[v+3]*(1-u)*d+i[T+3]*u*d)/255;return[_,g,b,R]}function Oe(i){const e=Math.sqrt(i[0]*i[0]+i[1]*i[1]+i[2]*i[2]);return e>1e-8&&(i[0]/=e,i[1]/=e,i[2]/=e),i}function Kt(i,e){return[i[1]*e[2]-i[2]*e[1],i[2]*e[0]-i[0]*e[2],i[0]*e[1]-i[1]*e[0]]}function $r(i){const e=Oe([...i]),r=[0,0,1],t=e[0]*r[0]+e[1]*r[1]+e[2]*r[2];let a=r;Math.abs(t)>.999&&(a=[0,1,0]);const s=Oe(Kt(a,e)),n=Math.acos(Math.max(-1,Math.min(1,t)))*.5,c=Math.sin(n);return[Math.cos(n),s[0]*c,s[1]*c,s[2]*c]}class Kr{constructor(){this.samplesPerTriangle=8,this.edgeBoostFactor=4,this.edgeThreshold=.1,this.baseScale=.04,this.jitter=.3,this.alphaThreshold=.1,this.normalInfluence=.8,this.specularToDepth=2}convert({positions:e,normals:r,uvs:t,indices:a,diffusePixels:s,diffuseWidth:l,diffuseHeight:n,normalPixels:c=null,normalWidth:h=0,normalHeight:f=0,specularPixels:u=null,specularWidth:d=0,specularHeight:m=0}){const E=new Float32Array(l*n);for(let _=0;_<l*n;_++)E[_]=Ee(s[_*4]/255,s[_*4+1]/255,s[_*4+2]/255);const p=new Float32Array(l*n);for(let _=0;_<n;_++)for(let g=0;g<l;g++)p[_*l+g]=ze(E,l,n,g,_);const v=[],T=a.length/3;for(let _=0;_<T;_++){const g=a[_*3],b=a[_*3+1],R=a[_*3+2],A=[e[g*3],e[g*3+1],e[g*3+2]],F=[e[b*3],e[b*3+1],e[b*3+2]],P=[e[R*3],e[R*3+1],e[R*3+2]],X=[r[g*3],r[g*3+1],r[g*3+2]],ee=[r[b*3],r[b*3+1],r[b*3+2]],te=[r[R*3],r[R*3+1],r[R*3+2]],Y=[t[g*2],t[g*2+1]],z=[t[b*2],t[b*2+1]],y=[t[R*2],t[R*2+1]],gr=[F[0]-A[0],F[1]-A[1],F[2]-A[2]],Tr=[P[0]-A[0],P[1]-A[1],P[2]-A[2]],ue=Kt(gr,Tr),vr=.5*Math.sqrt(ue[0]*ue[0]+ue[1]*ue[1]+ue[2]*ue[2]),br=Math.max(1,Math.round(this.samplesPerTriangle*Math.sqrt(vr))),ft=Dt(Y,z,y,1/3,1/3),xr=Math.min(l-1,Math.max(0,Math.floor(ft[0]*l))),Rr=Math.min(n-1,Math.max(0,Math.floor(ft[1]*n))),dt=p[Rr*l+xr],yr=dt>this.edgeThreshold?Math.round(this.edgeBoostFactor*(dt/1)):0,Ar=br+yr;for(let mt=0;mt<Ar;mt++){let j=Math.random(),k=Math.random();j+k>1&&(j=1-j,k=1-k),j+=(Math.random()-.5)*this.jitter*.1,k+=(Math.random()-.5)*this.jitter*.1,j=Math.max(0,Math.min(1,j)),k=Math.max(0,Math.min(1-j,k));const je=Ft(A,F,P,j,k),Sr=Oe(Ft(X,ee,te,j,k)),H=Dt(Y,z,y,j,k),[_t,pt,Et,Fr]=He(s,l,n,H[0],H[1]);if(Fr<this.alphaThreshold)continue;let q=[...Sr];if(c){const[Ge,ke,Ye]=He(c,h,f,H[0],H[1]),Br=Ge*2-1,Lr=ke*2-1,wr=Ye*2-1;q[0]+=Br*this.normalInfluence,q[1]+=Lr*this.normalInfluence,q[2]+=wr*this.normalInfluence,Oe(q)}const Dr=$r(q);let gt=0;if(u){const[Ge,ke,Ye]=He(u,d,m,H[0],H[1]);gt=Ee(Ge,ke,Ye)*this.specularToDepth}const Mr=Ee(_t,pt,Et),Pr=ze(E,l,n,Math.floor(H[0]*l)%l,Math.floor(H[1]*n)%n),Ur=1-Math.min(1,Pr*2),Tt=this.baseScale*(.5+Mr*.5)*(.4+Ur*.6),Ve=Tt*.1;v.push({position:[je[0]+q[0]*Ve,je[1]+q[1]*Ve,je[2]+q[2]*Ve],orientation:Dr,scale:Tt,color:[_t,pt,Et],depth:gt})}}return v}convertFromImages({positions:e,normals:r,uvs:t,indices:a,diffuseImage:s,normalImage:l,specularImage:n}){const c=d=>{if(!d)return null;const m=document.createElement("canvas"),E=d.naturalWidth||d.width,p=d.naturalHeight||d.height;m.width=E,m.height=p;const v=m.getContext("2d");return v.drawImage(d,0,0),{pixels:v.getImageData(0,0,E,p).data,width:E,height:p}},h=c(s),f=c(l),u=c(n);return this.convert({positions:e,normals:r,uvs:t,indices:a,diffusePixels:h.pixels,diffuseWidth:h.width,diffuseHeight:h.height,...f?{normalPixels:f.pixels,normalWidth:f.width,normalHeight:f.height}:{},...u?{specularPixels:u.pixels,specularWidth:u.width,specularHeight:u.height}:{}})}convertFlat(e,r,t,a={}){const s=a.gridStep||3,l=a.scale||this.baseScale,n=a.depthFromLum||1,c=new Float32Array(r*t);for(let u=0;u<r*t;u++)c[u]=Ee(e[u*4]/255,e[u*4+1]/255,e[u*4+2]/255);const h=r/t,f=[];for(let u=0;u<t;u+=s)for(let d=0;d<r;d+=s){const m=(u*r+d)*4;if(e[m+3]/255<this.alphaThreshold)continue;const E=e[m]/255,p=e[m+1]/255,v=e[m+2]/255,T=Ee(E,p,v),_=ze(c,r,t,d,u),g=1+(_>this.edgeThreshold?this.edgeBoostFactor:0),b=(1-T)*n,R=(d/r-.5)*2*h,A=-(u/t-.5)*2;for(let F=0;F<g;F++){const P=(Math.random()-.5)*this.jitter*(s/r)*2*h,X=(Math.random()-.5)*this.jitter*(s/t)*2;f.push({position:[R+P,A+X,b+(Math.random()-.5)*.05],orientation:[1,0,0,0],scale:l*(.5+T*.5)*(1-Math.min(1,_)*.5),color:[E,p,v],depth:b*.3})}}return f}}const he={idle:{priority:0,opacityMultiplier:.3,thicknessMultiplier:.5,speedMultiplier:.5,glowIntensity:.1,colorShift:[0,0,0],rotationSpeed:.1,patternOverride:null},active:{priority:1,opacityMultiplier:.8,thicknessMultiplier:1,speedMultiplier:1,glowIntensity:.5,colorShift:[.1,.1,.2],rotationSpeed:.3,patternOverride:null},selected:{priority:2,opacityMultiplier:1,thicknessMultiplier:1.2,speedMultiplier:.8,glowIntensity:.8,colorShift:[0,.2,.3],rotationSpeed:.5,patternOverride:7},powered:{priority:2,opacityMultiplier:1,thicknessMultiplier:1.5,speedMultiplier:1.5,glowIntensity:1,colorShift:[.3,0,.5],rotationSpeed:1,patternOverride:6},damaged:{priority:3,opacityMultiplier:.9,thicknessMultiplier:.8,speedMultiplier:2,glowIntensity:.7,colorShift:[.5,-.2,-.2],rotationSpeed:2,patternOverride:5},destroyed:{priority:4,opacityMultiplier:.4,thicknessMultiplier:2,speedMultiplier:3,glowIntensity:.3,colorShift:[.3,-.1,-.3],rotationSpeed:3,patternOverride:5}};function Qr(i,e=4){const r=a=>{let s=a*2654435761;return s=(s>>>16^s)*2246822507,s=(s>>>16^s)*3266489909,s=s>>>16^s,(s&2147483647)/2147483647},t=[];for(let a=0;a<e;a++){const s=i*1e3+a;t.push({geometry:Math.floor(r(s)*24),thickness:.3+r(s+100)*.4,opacity:.7+r(s+200)*.3,color:[.3+r(s+300)*.7,.3+r(s+400)*.7,.3+r(s+500)*.7],patternScale:2+r(s+600)*4,patternSpeed:.2+r(s+700)*.4,rotOffset:r(s+800)*Math.PI*2})}return{layers:t,baseRotationSpeed:r(i*31)*.5,baseHue:r(i*47)*360}}const O={bass:{rot4dXW:.5,thickness:.3},mid:{rot4dYW:.3,speed:.5},high:{rot4dZW:.6,patternScale:.3,hueShift:30},energy:{allRotation:.3,intensity:.5,glow:.3}};class Jr{constructor({layerCount:e=4,transitionDuration:r=.5}={}){this.layerCount=e,this.transitionDuration=r,this._objectStates=new Map,this._audio={bass:0,mid:0,high:0,energy:0},this._time=0}registerObject(e,r="idle"){const t=Qr(e,this.layerCount),a=he[r]||he.idle;this._objectStates.set(e,{currentState:r,targetState:r,transitionProgress:1,currentPreset:{...a},targetPreset:{...a},identity:t})}setObjectState(e,r){const t=this._objectStates.get(e);if(!t){this.registerObject(e,r);return}if(t.targetState===r)return;const a=he[r];if(!a)return;const s=(he[t.currentState]||he.idle).priority;a.priority<s&&t.transitionProgress<.5||(t.currentPreset=this._interpolatePresets(t.currentPreset,t.targetPreset,t.transitionProgress),t.targetPreset={...a},t.currentState=t.targetState,t.targetState=r,t.transitionProgress=0)}setAudio(e,r,t,a){this._audio.bass=Math.max(0,Math.min(1,e||0)),this._audio.mid=Math.max(0,Math.min(1,r||0)),this._audio.high=Math.max(0,Math.min(1,t||0)),this._audio.energy=Math.max(0,Math.min(1,a||0))}update(e){this._time+=e;for(const r of this._objectStates.values())r.transitionProgress<1&&(r.transitionProgress=Math.min(1,r.transitionProgress+e/this.transitionDuration))}getInscriptionConfig(e){let r=this._objectStates.get(e);r||(this.registerObject(e),r=this._objectStates.get(e));const t=this._interpolatePresets(r.currentPreset,r.targetPreset,r.transitionProgress),a=r.identity,s=this._audio,l=[];for(let u=0;u<this.layerCount;u++){const d=a.layers[u],m=t.patternOverride!==null?t.patternOverride:d.geometry,E=d.opacity*t.opacityMultiplier+s.energy*O.energy.intensity*.3,p=d.thickness*t.thicknessMultiplier+s.bass*O.bass.thickness,v=d.patternSpeed*t.speedMultiplier+s.mid*O.mid.speed,T=s.high*O.high.hueShift/360,_=[Math.min(1,Math.max(0,d.color[0]+t.colorShift[0]+T*.5)),Math.min(1,Math.max(0,d.color[1]+t.colorShift[1]+T*.3)),Math.min(1,Math.max(0,d.color[2]+t.colorShift[2]+T))],g=d.patternScale+s.high*O.high.patternScale,b=d.rotOffset+this._time*(a.baseRotationSpeed+t.rotationSpeed*.5);l.push({geometry:m,thickness:Math.min(1,Math.max(0,p)),opacity:Math.min(1,Math.max(0,E)),color:_,patternScale:g,patternSpeed:v,rotOffset:b})}const n=s.bass*O.bass.rot4dXW+s.energy*O.energy.allRotation,c=s.mid*O.mid.rot4dYW+s.energy*O.energy.allRotation,h=s.high*O.high.rot4dZW+s.energy*O.energy.allRotation,f=.6*t.thicknessMultiplier+s.bass*.2;return{layers:l,rot4dXW:n,rot4dYW:c,rot4dZW:h,globalThickness:f,glowIntensity:t.glowIntensity+s.energy*O.energy.glow,bass:s.bass,mid:s.mid,high:s.high,energy:s.energy}}applyToLayer(e,r){const t=this.getInscriptionConfig(r);e.rot4dXW=t.rot4dXW,e.rot4dYW=t.rot4dYW,e.rot4dZW=t.rot4dZW,e.globalThickness=t.globalThickness,e.setAudio(t.bass,t.mid,t.high,t.energy);for(let a=0;a<t.layers.length&&a<e.layerCount;a++)e.setLayerConfig(a,t.layers[a])}_interpolatePresets(e,r,t){const a=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;return{priority:r.priority,opacityMultiplier:e.opacityMultiplier+(r.opacityMultiplier-e.opacityMultiplier)*a,thicknessMultiplier:e.thicknessMultiplier+(r.thicknessMultiplier-e.thicknessMultiplier)*a,speedMultiplier:e.speedMultiplier+(r.speedMultiplier-e.speedMultiplier)*a,glowIntensity:e.glowIntensity+(r.glowIntensity-e.glowIntensity)*a,colorShift:[e.colorShift[0]+(r.colorShift[0]-e.colorShift[0])*a,e.colorShift[1]+(r.colorShift[1]-e.colorShift[1])*a,e.colorShift[2]+(r.colorShift[2]-e.colorShift[2])*a],rotationSpeed:e.rotationSpeed+(r.rotationSpeed-e.rotationSpeed)*a,patternOverride:a>.5?r.patternOverride:e.patternOverride}}getObjectState(e){const r=this._objectStates.get(e);return r?r.targetState:null}get registeredObjects(){return Array.from(this._objectStates.keys())}get stateNames(){return Object.keys(he)}dispose(){this._objectStates.clear()}}class ei{constructor(e,r={}){this.gl=e,this.resolution=r.resolution??1024,this.bias=r.bias??.005,this.normalBias=r.normalBias??.02,this.pcfRadius=r.pcfRadius??2,this.filterMode=r.filterMode??"pcf",this.frustumSize=r.frustumSize??10,this.near=r.near??.1,this.far=r.far??50,this.lightDir=new Float32Array(r.lightDir||[.5,1,.3]),this._normalizeLightDir(),this.lightViewMatrix=new Float32Array(16),this.lightProjMatrix=new Float32Array(16),this.lightSpaceMatrix=new Float32Array(16),this._fbo=null,this._depthTexture=null,this._shadowProgram=null,this._initialized=!1}init(){if(this._initialized)return;const e=this.gl;this._fbo=e.createFramebuffer(),this._depthTexture=e.createTexture(),e.bindTexture(e.TEXTURE_2D,this._depthTexture),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT32F,this.resolution,this.resolution,0,e.DEPTH_COMPONENT,e.FLOAT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_COMPARE_MODE,e.COMPARE_REF_TO_TEXTURE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_COMPARE_FUNC,e.LEQUAL),e.bindFramebuffer(e.FRAMEBUFFER,this._fbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,this._depthTexture,0),e.drawBuffers([e.NONE]),e.readBuffer(e.NONE),e.bindFramebuffer(e.FRAMEBUFFER,null),this._shadowProgram=this._createShadowProgram(),this._initialized=!0}setLightDirection(e,r,t){this.lightDir[0]=e,this.lightDir[1]=r,this.lightDir[2]=t,this._normalizeLightDir()}updateMatrices(e){const r=e?e[0]:0,t=e?e[1]:0,a=e?e[2]:0,s=this.lightDir[0],l=this.lightDir[1],n=this.lightDir[2],c=this.far*.5,h=r+s*c,f=t+l*c,u=a+n*c;this._lookAt(this.lightViewMatrix,h,f,u,r,t,a);const d=this.frustumSize;this._ortho(this.lightProjMatrix,-d,d,-d,d,this.near,this.far),this._multiplyMat4(this.lightSpaceMatrix,this.lightProjMatrix,this.lightViewMatrix)}beginShadowPass(){this._initialized||this.init();const e=this.gl;e.bindFramebuffer(e.FRAMEBUFFER,this._fbo),e.viewport(0,0,this.resolution,this.resolution),e.clear(e.DEPTH_BUFFER_BIT),e.enable(e.DEPTH_TEST),e.depthFunc(e.LESS),e.enable(e.CULL_FACE),e.cullFace(e.FRONT)}renderShadowCaster(e,r,t){const a=this.gl,s=this._shadowProgram;a.useProgram(s.program),a.uniformMatrix4fv(s.u_lightSpaceMatrix,!1,this.lightSpaceMatrix),a.uniformMatrix4fv(s.u_modelMatrix,!1,t||ti);const l=a.createVertexArray();a.bindVertexArray(l);const n=a.createBuffer();if(a.bindBuffer(a.ARRAY_BUFFER,n),a.bufferData(a.ARRAY_BUFFER,e,a.STREAM_DRAW),a.enableVertexAttribArray(0),a.vertexAttribPointer(0,3,a.FLOAT,!1,0,0),r){const c=a.createBuffer();a.bindBuffer(a.ELEMENT_ARRAY_BUFFER,c),a.bufferData(a.ELEMENT_ARRAY_BUFFER,r,a.STREAM_DRAW),a.drawElements(a.TRIANGLES,r.length,a.UNSIGNED_INT,0),a.deleteBuffer(c)}else a.drawArrays(a.TRIANGLES,0,e.length/3);a.bindVertexArray(null),a.deleteVertexArray(l),a.deleteBuffer(n)}endShadowPass(){const e=this.gl;e.cullFace(e.BACK),e.bindFramebuffer(e.FRAMEBUFFER,null)}getShadowTexture(){return this._depthTexture}getLightSpaceMatrix(){return this.lightSpaceMatrix}static getShadowSamplerSrc(){return`
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
`}_normalizeLightDir(){const e=this.lightDir,r=Math.sqrt(e[0]*e[0]+e[1]*e[1]+e[2]*e[2])||1;e[0]/=r,e[1]/=r,e[2]/=r}_createShadowProgram(){const e=this.gl,r=`#version 300 es
precision highp float;
layout(location = 0) in vec3 a_position;
uniform mat4 u_lightSpaceMatrix;
uniform mat4 u_modelMatrix;
void main() {
    gl_Position = u_lightSpaceMatrix * u_modelMatrix * vec4(a_position, 1.0);
}`,t=`#version 300 es
precision highp float;
void main() {
    // Depth is written automatically
}`,a=e.createShader(e.VERTEX_SHADER);e.shaderSource(a,r),e.compileShader(a);const s=e.createShader(e.FRAGMENT_SHADER);e.shaderSource(s,t),e.compileShader(s);const l=e.createProgram();return e.attachShader(l,a),e.attachShader(l,s),e.linkProgram(l),e.deleteShader(a),e.deleteShader(s),{program:l,u_lightSpaceMatrix:e.getUniformLocation(l,"u_lightSpaceMatrix"),u_modelMatrix:e.getUniformLocation(l,"u_modelMatrix")}}_lookAt(e,r,t,a,s,l,n){let c=s-r,h=l-t,f=n-a,u=Math.sqrt(c*c+h*h+f*f)||1;c/=u,h/=u,f/=u;let d=h*0-f*1,m=f*0-c*0,E=c*1-h*0;Math.abs(d)+Math.abs(m)+Math.abs(E)<.001&&(d=1,m=0,E=0),u=Math.sqrt(d*d+m*m+E*E)||1,d/=u,m/=u,E/=u;const p=m*f-E*h,v=E*c-d*f,T=d*h-m*c;e[0]=d,e[1]=p,e[2]=-c,e[3]=0,e[4]=m,e[5]=v,e[6]=-h,e[7]=0,e[8]=E,e[9]=T,e[10]=-f,e[11]=0,e[12]=-(d*r+m*t+E*a),e[13]=-(p*r+v*t+T*a),e[14]=-(-c*r+-h*t+-f*a),e[15]=1}_ortho(e,r,t,a,s,l,n){const c=1/(r-t),h=1/(a-s),f=1/(l-n);e[0]=-2*c,e[1]=0,e[2]=0,e[3]=0,e[4]=0,e[5]=-2*h,e[6]=0,e[7]=0,e[8]=0,e[9]=0,e[10]=2*f,e[11]=0,e[12]=(r+t)*c,e[13]=(s+a)*h,e[14]=(n+l)*f,e[15]=1}_multiplyMat4(e,r,t){for(let a=0;a<4;a++)for(let s=0;s<4;s++)e[a*4+s]=r[0*4+s]*t[a*4+0]+r[1*4+s]*t[a*4+1]+r[2*4+s]*t[a*4+2]+r[3*4+s]*t[a*4+3]}dispose(){const e=this.gl;this._fbo&&e.deleteFramebuffer(this._fbo),this._depthTexture&&e.deleteTexture(this._depthTexture),this._shadowProgram&&e.deleteProgram(this._shadowProgram.program),this._fbo=null,this._depthTexture=null,this._shadowProgram=null,this._initialized=!1}}const ti=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);class ri{constructor(e,r={}){this.gl=e,this.maxParticles=r.maxParticles??1e4,this.emitRate=r.emitRate??100,this.lifetime=r.lifetime??3,this.lifetimeVariance=r.lifetimeVariance??.5,this.speed=r.speed??1,this.speedVariance=r.speedVariance??.3,this.gravity=r.gravity??-2,this.drag=r.drag??.98,this.splatScale=r.splatScale??.02,this.splatScaleDecay=r.splatScaleDecay??.5,this.trailLength=r.trailLength??0,this.emitterType=r.emitterType??"point",this.emitterPosition=new Float32Array(r.emitterPosition||[0,0,0]),this.emitterRadius=r.emitterRadius??.5,this.emitterDirection=new Float32Array(r.emitterDirection||[0,1,0]),this.emitterSpread=r.emitterSpread??.5,this.colorStart=new Float32Array(r.colorStart||[0,1,1]),this.colorEnd=new Float32Array(r.colorEnd||[1,0,1]),this.colorMode=r.colorMode??"lerp",this.burstConfigs=new Map,this._setupDefaultBursts(),this._stride=12,this._data=new Float32Array(this.maxParticles*this._stride),this._aliveCount=0,this._emitAccumulator=0,this._trailHistory=this.trailLength>0?new Float32Array(this.maxParticles*this.trailLength*7):null,this._splatBuffer=null,this._splatCount=0,this._rng=12345}setBurstConfig(e,r){this.burstConfigs.set(e,r)}burst(e,r){const t=this.burstConfigs.get(e);if(!t)return;const a=r||this.emitterPosition,s=t.speed??this.speed*2,l=t.spread??1;for(let n=0;n<t.count;n++)this._emitOne(a,s,l,t.color)}setPosition(e,r,t){this.emitterPosition[0]=e,this.emitterPosition[1]=r,this.emitterPosition[2]=t}setSurfaceEmitter(e,r,t){this.emitterType="surface",this._surfacePositions=e,this._surfaceNormals=r,this._surfaceIndices=t}update(e){for((e<=0||e>.1)&&(e=.016),this._emitAccumulator+=this.emitRate*e;this._emitAccumulator>=1&&this._aliveCount<this.maxParticles;)this._emitAccumulator-=1,this._emitParticle();let r=0;for(let t=0;t<this._aliveCount;t++){const a=t*this._stride;if(this._data[a+9]+=e,this._data[a+9]>=this._data[a+10])continue;this._trailHistory&&this._pushTrail(t),this._data[a+4]+=this.gravity*e,this._data[a+3]*=this.drag,this._data[a+4]*=this.drag,this._data[a+5]*=this.drag,this._data[a+0]+=this._data[a+3]*e,this._data[a+1]+=this._data[a+4]*e,this._data[a+2]+=this._data[a+5]*e;const s=this._data[a+9]/this._data[a+10];this._data[a+6]=this.colorStart[0]*(1-s)+this.colorEnd[0]*s,this._data[a+7]=this.colorStart[1]*(1-s)+this.colorEnd[1]*s,this._data[a+8]=this.colorStart[2]*(1-s)+this.colorEnd[2]*s,this._data[a+11]=this.splatScale*(1-s*this.splatScaleDecay),r!==t&&this._data.copyWithin(r*this._stride,a,a+this._stride),r++}this._aliveCount=r,this._buildSplatBuffer()}getSplatBuffer(){return{buffer:this._splatBuffer,count:this._splatCount}}getAliveCount(){return this._aliveCount}_setupDefaultBursts(){this.burstConfigs.set("powered",{count:50,speed:2,spread:.3,color:[.5,0,1]}),this.burstConfigs.set("damaged",{count:100,speed:3,spread:1,color:[1,.3,0]}),this.burstConfigs.set("destroyed",{count:500,speed:5,spread:1,color:[1,.1,.1]}),this.burstConfigs.set("selected",{count:20,speed:.5,spread:.8,color:[0,1,1]}),this.burstConfigs.set("active",{count:30,speed:1,spread:.5,color:[0,1,.5]})}_emitParticle(){const e=this._getEmitPosition();this._emitOne(e,this.speed,this.emitterSpread)}_emitOne(e,r,t,a){if(this._aliveCount>=this.maxParticles)return;const s=this._aliveCount*this._stride;this._data[s+0]=e[0],this._data[s+1]=e[1],this._data[s+2]=e[2];const l=this._randomConeDirection(this.emitterDirection,t),n=r+(this._rand()-.5)*this.speedVariance*2;this._data[s+3]=l[0]*n,this._data[s+4]=l[1]*n,this._data[s+5]=l[2]*n,a?(this._data[s+6]=a[0],this._data[s+7]=a[1],this._data[s+8]=a[2]):(this._data[s+6]=this.colorStart[0],this._data[s+7]=this.colorStart[1],this._data[s+8]=this.colorStart[2]),this._data[s+9]=0,this._data[s+10]=this.lifetime+(this._rand()-.5)*this.lifetimeVariance*2,this._data[s+11]=this.splatScale,this._aliveCount++}_getEmitPosition(){if(this.emitterType==="surface"&&this._surfaceIndices)return this._randomSurfacePoint();if(this.emitterType==="sphere"){const e=this._rand()*Math.PI*2,r=Math.acos(2*this._rand()-1),t=this.emitterRadius*Math.cbrt(this._rand());return[this.emitterPosition[0]+t*Math.sin(r)*Math.cos(e),this.emitterPosition[1]+t*Math.cos(r),this.emitterPosition[2]+t*Math.sin(r)*Math.sin(e)]}return this.emitterPosition}_randomSurfacePoint(){const e=this._surfaceIndices.length/3,r=Math.floor(this._rand()*e),t=this._surfaceIndices[r*3]*3,a=this._surfaceIndices[r*3+1]*3,s=this._surfaceIndices[r*3+2]*3;let l=this._rand(),n=this._rand();l+n>1&&(l=1-l,n=1-n);const c=1-l-n;return[this._surfacePositions[t]*c+this._surfacePositions[a]*l+this._surfacePositions[s]*n,this._surfacePositions[t+1]*c+this._surfacePositions[a+1]*l+this._surfacePositions[s+1]*n,this._surfacePositions[t+2]*c+this._surfacePositions[a+2]*l+this._surfacePositions[s+2]*n]}_randomConeDirection(e,r){const t=this._rand()*Math.PI*2,a=1-this._rand()*r,s=Math.sqrt(1-a*a),l=e[0],n=e[1],c=e[2];let h,f,u;Math.abs(n)<.99?(h=n*0-c*0,f=c*1-l*0,u=l*0-n*1,h=0,f=-c,u=n):(h=-c,f=0,u=l);const d=Math.sqrt(h*h+f*f+u*u)||1;h/=d,f/=d,u/=d;const m=n*u-c*f,E=c*h-l*u,p=l*f-n*h;return[l*a+(h*Math.cos(t)+m*Math.sin(t))*s,n*a+(f*Math.cos(t)+E*Math.sin(t))*s,c*a+(u*Math.cos(t)+p*Math.sin(t))*s]}_pushTrail(e){if(!this._trailHistory)return;const r=e*this._stride,t=7,a=e*this.trailLength*t;for(let s=this.trailLength-1;s>0;s--){const l=a+s*t,n=a+(s-1)*t;for(let c=0;c<t;c++)this._trailHistory[l+c]=this._trailHistory[n+c]}this._trailHistory[a+0]=this._data[r+0],this._trailHistory[a+1]=this._data[r+1],this._trailHistory[a+2]=this._data[r+2],this._trailHistory[a+3]=this._data[r+6],this._trailHistory[a+4]=this._data[r+7],this._trailHistory[a+5]=this._data[r+8],this._trailHistory[a+6]=this._data[r+11]}_buildSplatBuffer(){const r=this._aliveCount*(1+this.trailLength);(!this._splatBuffer||this._splatBuffer.length<r*12)&&(this._splatBuffer=new Float32Array(r*12));let t=0;for(let a=0;a<this._aliveCount;a++){const s=a*this._stride,l=t*12;if(this._splatBuffer[l+0]=this._data[s+0],this._splatBuffer[l+1]=this._data[s+1],this._splatBuffer[l+2]=this._data[s+2],this._splatBuffer[l+3]=this._data[s+11],this._splatBuffer[l+4]=1,this._splatBuffer[l+5]=0,this._splatBuffer[l+6]=0,this._splatBuffer[l+7]=0,this._splatBuffer[l+8]=this._data[s+6],this._splatBuffer[l+9]=this._data[s+7],this._splatBuffer[l+10]=this._data[s+8],this._splatBuffer[l+11]=.5,t++,this._trailHistory){const n=a*this.trailLength*7;for(let c=0;c<this.trailLength;c++){const h=n+c*7,f=t*12,u=1-(c+1)/(this.trailLength+1);this._splatBuffer[f+0]=this._trailHistory[h+0],this._splatBuffer[f+1]=this._trailHistory[h+1],this._splatBuffer[f+2]=this._trailHistory[h+2],this._splatBuffer[f+3]=this._trailHistory[h+6]*u,this._splatBuffer[f+4]=1,this._splatBuffer[f+5]=0,this._splatBuffer[f+6]=0,this._splatBuffer[f+7]=0,this._splatBuffer[f+8]=this._trailHistory[h+3]*u,this._splatBuffer[f+9]=this._trailHistory[h+4]*u,this._splatBuffer[f+10]=this._trailHistory[h+5]*u,this._splatBuffer[f+11]=.3*u,t++}}}this._splatCount=t}_rand(){return this._rng=this._rng*1664525+1013904223&2147483647,this._rng/2147483647}dispose(){this._data=null,this._splatBuffer=null,this._trailHistory=null}}class ii{constructor(e,r={}){this.gl=e,this.maxSteps=r.maxSteps??24,this.stepSize=r.stepSize??.05,this.density=r.density??2,this.absorption=r.absorption??1.5,this.emissionStrength=r.emissionStrength??1,this.noiseScale=r.noiseScale??3,this.geometry=r.geometry??0,this.primaryColor=new Float32Array(r.primaryColor||[0,1,1]),this.secondaryColor=new Float32Array(r.secondaryColor||[1,0,1]),this.rot4dXY=0,this.rot4dXZ=0,this.rot4dYZ=0,this.rot4dXW=0,this.rot4dYW=0,this.rot4dZW=0,this.bass=0,this.mid=0,this.high=0,this.energy=0,this.sliceEnabled=!1,this.slicePlane=new Float32Array([0,1,0,0]),this._program=null,this._fbo=null,this._texture=null,this._vao=null,this._initialized=!1}init(){if(this._initialized)return;const e=this.gl;this._program=this._createProgram(),this._fbo=e.createFramebuffer(),this._texture=e.createTexture(),this._vao=e.createVertexArray(),e.bindVertexArray(this._vao);const r=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,r),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null),this._initialized=!0}setAudio(e,r,t,a){this.bass=e,this.mid=r,this.high=t,this.energy=a}render(e,r,t,a){this._initialized||this.init();const s=this.gl,{width:l,height:n}=a;return this._ensureTexture(l,n),s.bindFramebuffer(s.FRAMEBUFFER,this._fbo),s.viewport(0,0,l,n),s.clearColor(0,0,0,0),s.clear(s.COLOR_BUFFER_BIT),s.useProgram(this._program.program),s.activeTexture(s.TEXTURE0),s.bindTexture(s.TEXTURE_2D,e),s.uniform1i(this._program.u_depthTex,0),s.activeTexture(s.TEXTURE1),s.bindTexture(s.TEXTURE_2D,r),s.uniform1i(this._program.u_normalTex,1),s.uniform1f(this._program.u_time,t),s.uniform2f(this._program.u_resolution,l,n),s.uniform1i(this._program.u_maxSteps,this.maxSteps),s.uniform1f(this._program.u_stepSize,this.stepSize),s.uniform1f(this._program.u_density,this.density),s.uniform1f(this._program.u_absorption,this.absorption),s.uniform1f(this._program.u_emissionStrength,this.emissionStrength),s.uniform1f(this._program.u_noiseScale,this.noiseScale),s.uniform1f(this._program.u_geometry,this.geometry),s.uniform3fv(this._program.u_primaryColor,this.primaryColor),s.uniform3fv(this._program.u_secondaryColor,this.secondaryColor),s.uniform1f(this._program.u_rot4dXY,this.rot4dXY),s.uniform1f(this._program.u_rot4dXZ,this.rot4dXZ),s.uniform1f(this._program.u_rot4dYZ,this.rot4dYZ),s.uniform1f(this._program.u_rot4dXW,this.rot4dXW+this.bass*.3),s.uniform1f(this._program.u_rot4dYW,this.rot4dYW+this.mid*.2),s.uniform1f(this._program.u_rot4dZW,this.rot4dZW+this.high*.4),s.uniform1i(this._program.u_sliceEnabled,this.sliceEnabled?1:0),s.uniform4fv(this._program.u_slicePlane,this.slicePlane),a.invViewProj&&s.uniformMatrix4fv(this._program.u_invViewProj,!1,a.invViewProj),a.cameraPos&&s.uniform3fv(this._program.u_cameraPos,a.cameraPos),s.enable(s.BLEND),s.blendFunc(s.ONE,s.ONE_MINUS_SRC_ALPHA),s.bindVertexArray(this._vao),s.drawArrays(s.TRIANGLES,0,3),s.bindVertexArray(null),s.disable(s.BLEND),s.bindFramebuffer(s.FRAMEBUFFER,null),{texture:this._texture,framebuffer:this._fbo}}_ensureTexture(e,r){const t=this.gl;this._texW===e&&this._texH===r||(this._texW=e,this._texH=r,t.bindTexture(t.TEXTURE_2D,this._texture),t.texImage2D(t.TEXTURE_2D,0,t.RGBA16F,e,r,0,t.RGBA,t.HALF_FLOAT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,this._fbo),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,this._texture,0),t.bindFramebuffer(t.FRAMEBUFFER,null))}_createProgram(){const e=this.gl,r=`#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`,t=`#version 300 es
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
}`,a=e.createShader(e.VERTEX_SHADER);e.shaderSource(a,r),e.compileShader(a);const s=e.createShader(e.FRAGMENT_SHADER);e.shaderSource(s,t),e.compileShader(s),e.getShaderParameter(s,e.COMPILE_STATUS)||console.warn("VolumetricInscription fragment shader error:",e.getShaderInfoLog(s));const l=e.createProgram();e.attachShader(l,a),e.attachShader(l,s),e.linkProgram(l),e.deleteShader(a),e.deleteShader(s);const n=c=>e.getUniformLocation(l,c);return{program:l,u_depthTex:n("u_depthTex"),u_normalTex:n("u_normalTex"),u_time:n("u_time"),u_resolution:n("u_resolution"),u_maxSteps:n("u_maxSteps"),u_stepSize:n("u_stepSize"),u_density:n("u_density"),u_absorption:n("u_absorption"),u_emissionStrength:n("u_emissionStrength"),u_noiseScale:n("u_noiseScale"),u_geometry:n("u_geometry"),u_primaryColor:n("u_primaryColor"),u_secondaryColor:n("u_secondaryColor"),u_rot4dXY:n("u_rot4dXY"),u_rot4dXZ:n("u_rot4dXZ"),u_rot4dYZ:n("u_rot4dYZ"),u_rot4dXW:n("u_rot4dXW"),u_rot4dYW:n("u_rot4dYW"),u_rot4dZW:n("u_rot4dZW"),u_sliceEnabled:n("u_sliceEnabled"),u_slicePlane:n("u_slicePlane"),u_invViewProj:n("u_invViewProj"),u_cameraPos:n("u_cameraPos")}}dispose(){const e=this.gl;this._program&&e.deleteProgram(this._program.program),this._fbo&&e.deleteFramebuffer(this._fbo),this._texture&&e.deleteTexture(this._texture),this._vao&&e.deleteVertexArray(this._vao)}}class oi{constructor(e,r={}){this.gl=e,this.lightDir=new Float32Array(r.lightDir||[.5,1,.3]),this.lightColor=new Float32Array(r.lightColor||[1,.95,.9]),this.ambientStrength=r.ambientStrength??.15,this.specularPower=r.specularPower??64,this.specularStrength=r.specularStrength??.5,this.inscriptionEmission=r.inscriptionEmission??.3,this.fresnelPower=r.fresnelPower??3,this.shadowEnabled=!1,this.shadowTexture=null,this.lightSpaceMatrix=null,this._program=null,this._fbo=null,this._texture=null,this._vao=null,this._initialized=!1}init(){if(this._initialized)return;const e=this.gl;this._program=this._createProgram(),this._fbo=e.createFramebuffer(),this._texture=e.createTexture(),this._vao=e.createVertexArray(),e.bindVertexArray(this._vao);const r=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,r),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null),this._initialized=!0}setShadow(e,r){this.shadowEnabled=!0,this.shadowTexture=e,this.lightSpaceMatrix=r}render(e,r,t){this._initialized||this.init();const a=this.gl,{width:s,height:l}=t;this._ensureTexture(s,l),a.bindFramebuffer(a.FRAMEBUFFER,this._fbo),a.viewport(0,0,s,l),a.clearColor(0,0,0,0),a.clear(a.COLOR_BUFFER_BIT),a.useProgram(this._program.program),a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,e),a.uniform1i(this._program.u_inscriptionTex,0),a.activeTexture(a.TEXTURE1),a.bindTexture(a.TEXTURE_2D,r),a.uniform1i(this._program.u_normalDepthTex,1),a.uniform1i(this._program.u_shadowEnabled,this.shadowEnabled?1:0),this.shadowEnabled&&this.shadowTexture&&(a.activeTexture(a.TEXTURE2),a.bindTexture(a.TEXTURE_2D,this.shadowTexture),a.uniform1i(this._program.u_shadowTex,2),this.lightSpaceMatrix&&a.uniformMatrix4fv(this._program.u_lightSpaceMatrix,!1,this.lightSpaceMatrix)),a.uniform2f(this._program.u_resolution,s,l);const n=this.lightDir,c=Math.sqrt(n[0]*n[0]+n[1]*n[1]+n[2]*n[2])||1;return a.uniform3f(this._program.u_lightDir,n[0]/c,n[1]/c,n[2]/c),a.uniform3fv(this._program.u_lightColor,this.lightColor),a.uniform1f(this._program.u_ambientStrength,this.ambientStrength),a.uniform1f(this._program.u_specularPower,this.specularPower),a.uniform1f(this._program.u_specularStrength,this.specularStrength),a.uniform1f(this._program.u_inscriptionEmission,this.inscriptionEmission),a.uniform1f(this._program.u_fresnelPower,this.fresnelPower),t.viewDir?a.uniform3fv(this._program.u_viewDir,t.viewDir):a.uniform3f(this._program.u_viewDir,0,0,-1),a.bindVertexArray(this._vao),a.drawArrays(a.TRIANGLES,0,3),a.bindVertexArray(null),a.bindFramebuffer(a.FRAMEBUFFER,null),{texture:this._texture}}_ensureTexture(e,r){if(this._texW===e&&this._texH===r)return;const t=this.gl;this._texW=e,this._texH=r,t.bindTexture(t.TEXTURE_2D,this._texture),t.texImage2D(t.TEXTURE_2D,0,t.RGBA16F,e,r,0,t.RGBA,t.HALF_FLOAT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,this._fbo),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,this._texture,0),t.bindFramebuffer(t.FRAMEBUFFER,null)}_createProgram(){const e=this.gl,r=`#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`,t=`#version 300 es
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
}`,a=e.createShader(e.VERTEX_SHADER);e.shaderSource(a,r),e.compileShader(a);const s=e.createShader(e.FRAGMENT_SHADER);e.shaderSource(s,t),e.compileShader(s),e.getShaderParameter(s,e.COMPILE_STATUS)||console.warn("DeferredInscriptionLighting fragment shader error:",e.getShaderInfoLog(s));const l=e.createProgram();e.attachShader(l,a),e.attachShader(l,s),e.linkProgram(l),e.deleteShader(a),e.deleteShader(s);const n=c=>e.getUniformLocation(l,c);return{program:l,u_inscriptionTex:n("u_inscriptionTex"),u_normalDepthTex:n("u_normalDepthTex"),u_shadowTex:n("u_shadowTex"),u_resolution:n("u_resolution"),u_lightDir:n("u_lightDir"),u_lightColor:n("u_lightColor"),u_viewDir:n("u_viewDir"),u_ambientStrength:n("u_ambientStrength"),u_specularPower:n("u_specularPower"),u_specularStrength:n("u_specularStrength"),u_inscriptionEmission:n("u_inscriptionEmission"),u_fresnelPower:n("u_fresnelPower"),u_shadowEnabled:n("u_shadowEnabled"),u_lightSpaceMatrix:n("u_lightSpaceMatrix")}}dispose(){const e=this.gl;this._program&&e.deleteProgram(this._program.program),this._fbo&&e.deleteFramebuffer(this._fbo),this._texture&&e.deleteTexture(this._texture),this._vao&&e.deleteVertexArray(this._vao)}}class ai{constructor(e,r={}){this.gl=e,this.maxTextures=r.maxTextures??8,this._textures=new Map,this._glTextures=new Map}setLayerTexture(e,r,t={}){const a=this.gl;let s=this._glTextures.get(e);s||(s=a.createTexture(),this._glTextures.set(e,s)),a.bindTexture(a.TEXTURE_2D,s),a.texImage2D(a.TEXTURE_2D,0,a.RGBA,a.RGBA,a.UNSIGNED_BYTE,r),a.generateMipmap(a.TEXTURE_2D),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MIN_FILTER,a.LINEAR_MIPMAP_LINEAR),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MAG_FILTER,a.LINEAR),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_S,a.REPEAT),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_T,a.REPEAT),a.bindTexture(a.TEXTURE_2D,null),this._textures.set(e,{texture:s,uvMode:t.uvMode??"screen",blend:t.blend??.5,tileX:t.tileX??1,tileY:t.tileY??1,offsetX:t.offsetX??0,offsetY:t.offsetY??0,rotation:t.rotation??0,channel:t.channel??"r",invert:t.invert??!1,width:r.width||r.naturalWidth,height:r.height||r.naturalHeight})}async loadLayerTexture(e,r,t={}){return new Promise((a,s)=>{const l=new Image;l.crossOrigin="anonymous",l.onload=()=>{this.setLayerTexture(e,l,t),a()},l.onerror=s,l.src=r})}setLayerText(e,r,t={}){const a=t.canvasSize??512,s=document.createElement("canvas");s.width=a,s.height=a;const l=s.getContext("2d");l.fillStyle="black",l.fillRect(0,0,a,a),l.fillStyle=t.color??"white",l.font=t.font??"32px monospace",l.textAlign="center",l.textBaseline="middle";const n=r.split(" "),c=[];let h="";const f=a*.8;for(const m of n){const E=h?h+" "+m:m;l.measureText(E).width>f&&h?(c.push(h),h=m):h=E}h&&c.push(h);const u=parseInt(l.font)*1.4,d=a/2-(c.length-1)*u/2;for(let m=0;m<c.length;m++)l.fillText(c[m],a/2,d+m*u);this.setLayerTexture(e,s,{channel:"luminance",...t})}setLayerCircuitPattern(e,r={}){const t=r.canvasSize??512,a=document.createElement("canvas");a.width=t,a.height=t;const s=a.getContext("2d");s.fillStyle="black",s.fillRect(0,0,t,t),s.strokeStyle="white",s.lineWidth=2;const l=r.gridSize??32;let c=r.seed??42;const h=()=>(c=c*1664525+1013904223&4294967295,(c>>>0)/4294967295);for(let f=0;f<t;f+=l){let u=h()>.3;for(let d=0;d<t;d+=l)h()>.6&&(u=!u),u&&(s.beginPath(),s.moveTo(f,d),h()>.5?s.lineTo(f+l,d):s.lineTo(f,d+l),s.stroke()),h()>.7&&(s.beginPath(),s.arc(f,d,3,0,Math.PI*2),s.fillStyle="white",s.fill())}this.setLayerTexture(e,a,{channel:"luminance",...r})}removeLayerTexture(e){const r=this._glTextures.get(e);r&&(this.gl.deleteTexture(r),this._glTextures.delete(e)),this._textures.delete(e)}getLayerConfig(e){return this._textures.get(e)||null}hasTexture(e){return this._textures.has(e)}bind(e,r){const t=this._textures.get(e);if(!t)return!1;const a=this.gl;return a.activeTexture(a.TEXTURE0+r),a.bindTexture(a.TEXTURE_2D,t.texture),!0}static getShaderSrc(){return`
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
`}dispose(){for(const[,e]of this._glTextures)this.gl.deleteTexture(e);this._glTextures.clear(),this._textures.clear()}}class ni{constructor(e,r={}){this.gl=e,this.maxSteps=r.maxSteps??64,this.maxDistance=r.maxDistance??10,this.thickness=r.thickness??.1,this.stride=r.stride??2,this.jitter=r.jitter??.5,this.fadeEdge=r.fadeEdge??.1,this.reflectionStrength=r.reflectionStrength??.8,this._program=null,this._fbo=null,this._texture=null,this._vao=null,this._initialized=!1}init(){if(this._initialized)return;const e=this.gl;this._program=this._createProgram(),this._fbo=e.createFramebuffer(),this._texture=e.createTexture(),this._vao=e.createVertexArray(),e.bindVertexArray(this._vao);const r=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,r),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null),this._initialized=!0}render(e){this._initialized||this.init();const r=this.gl,{width:t,height:a}=e;return this._ensureTexture(t,a),r.bindFramebuffer(r.FRAMEBUFFER,this._fbo),r.viewport(0,0,t,a),r.clearColor(0,0,0,0),r.clear(r.COLOR_BUFFER_BIT),r.useProgram(this._program.program),r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,e.colorTexture),r.uniform1i(this._program.u_colorTex,0),r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,e.normalDepthTexture),r.uniform1i(this._program.u_normalDepthTex,1),r.uniform2f(this._program.u_resolution,t,a),r.uniform1f(this._program.u_time,e.time||0),r.uniform1i(this._program.u_maxSteps,this.maxSteps),r.uniform1f(this._program.u_maxDistance,this.maxDistance),r.uniform1f(this._program.u_thickness,this.thickness),r.uniform1f(this._program.u_stride,this.stride),r.uniform1f(this._program.u_jitter,this.jitter),r.uniform1f(this._program.u_fadeEdge,this.fadeEdge),r.uniform1f(this._program.u_reflectionStrength,this.reflectionStrength),e.projMatrix&&r.uniformMatrix4fv(this._program.u_projMatrix,!1,e.projMatrix),e.invProjMatrix&&r.uniformMatrix4fv(this._program.u_invProjMatrix,!1,e.invProjMatrix),e.viewMatrix&&r.uniformMatrix4fv(this._program.u_viewMatrix,!1,e.viewMatrix),r.bindVertexArray(this._vao),r.drawArrays(r.TRIANGLES,0,3),r.bindVertexArray(null),r.bindFramebuffer(r.FRAMEBUFFER,null),{texture:this._texture}}_ensureTexture(e,r){if(this._texW===e&&this._texH===r)return;const t=this.gl;this._texW=e,this._texH=r,t.bindTexture(t.TEXTURE_2D,this._texture),t.texImage2D(t.TEXTURE_2D,0,t.RGBA16F,e,r,0,t.RGBA,t.HALF_FLOAT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,this._fbo),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,this._texture,0),t.bindFramebuffer(t.FRAMEBUFFER,null)}_createProgram(){const e=this.gl,r=`#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`,t=`#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_colorTex;
uniform sampler2D u_normalDepthTex;
uniform vec2 u_resolution;
uniform float u_time;

uniform int u_maxSteps;
uniform float u_maxDistance;
uniform float u_thickness;
uniform float u_stride;
uniform float u_jitter;
uniform float u_fadeEdge;
uniform float u_reflectionStrength;

uniform mat4 u_projMatrix;
uniform mat4 u_invProjMatrix;
uniform mat4 u_viewMatrix;

// Hash for jitter
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// Reconstruct view-space position from UV + depth
vec3 viewPosFromUV(vec2 uv, float depth) {
    vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 view = u_invProjMatrix * clip;
    return view.xyz / view.w;
}

void main() {
    vec4 normalDepth = texture(u_normalDepthTex, v_uv);
    vec3 normal = normalDepth.xyz * 2.0 - 1.0;
    float depth = normalDepth.a;

    if (depth <= 0.0 || length(normal) < 0.5) {
        fragColor = vec4(0.0);
        return;
    }

    normal = normalize(normal);

    // View-space position
    vec3 viewPos = viewPosFromUV(v_uv, depth);
    vec3 viewNormal = normalize(mat3(u_viewMatrix) * normal);

    // Reflect view direction
    vec3 viewDir = normalize(viewPos);
    vec3 reflectDir = reflect(viewDir, viewNormal);

    // March in screen space
    vec3 startPos = viewPos;
    vec3 endPos = viewPos + reflectDir * u_maxDistance;

    // Project to screen
    vec4 startClip = u_projMatrix * vec4(startPos, 1.0);
    vec4 endClip = u_projMatrix * vec4(endPos, 1.0);

    vec2 startScreen = (startClip.xy / startClip.w) * 0.5 + 0.5;
    vec2 endScreen = (endClip.xy / endClip.w) * 0.5 + 0.5;

    vec2 delta = endScreen - startScreen;
    float maxLen = max(abs(delta.x) * u_resolution.x, abs(delta.y) * u_resolution.y);

    if (maxLen < 1.0) {
        fragColor = vec4(0.0);
        return;
    }

    vec2 step = delta / maxLen * u_stride;

    // Jitter start position for temporal stability
    float jitterOffset = hash12(v_uv * u_resolution + vec2(u_time * 1000.0)) * u_jitter;

    vec2 marchUV = startScreen + step * jitterOffset;
    float marchDepth = startClip.w;
    float depthStep = (endClip.w - startClip.w) / maxLen * u_stride;

    vec3 hitColor = vec3(0.0);
    float hitAlpha = 0.0;

    for (int i = 0; i < 128; i++) {
        if (i >= u_maxSteps) break;

        marchUV += step;
        marchDepth += depthStep;

        // Bounds check
        if (marchUV.x < 0.0 || marchUV.x > 1.0 || marchUV.y < 0.0 || marchUV.y > 1.0) break;

        // Sample depth at march position
        float sampleDepth = texture(u_normalDepthTex, marchUV).a;
        if (sampleDepth <= 0.0) continue;

        float depthDiff = marchDepth - sampleDepth;

        // Hit test
        if (depthDiff > 0.0 && depthDiff < u_thickness) {
            hitColor = texture(u_colorTex, marchUV).rgb;

            // Edge fade
            vec2 edgeFade = smoothstep(vec2(0.0), vec2(u_fadeEdge), marchUV) *
                           smoothstep(vec2(0.0), vec2(u_fadeEdge), 1.0 - marchUV);
            float fade = edgeFade.x * edgeFade.y;

            // Distance fade
            float marchDist = float(i) / float(u_maxSteps);
            fade *= 1.0 - marchDist;

            hitAlpha = fade * u_reflectionStrength;
            break;
        }
    }

    fragColor = vec4(hitColor * hitAlpha, hitAlpha);
}`,a=e.createShader(e.VERTEX_SHADER);e.shaderSource(a,r),e.compileShader(a);const s=e.createShader(e.FRAGMENT_SHADER);e.shaderSource(s,t),e.compileShader(s),e.getShaderParameter(s,e.COMPILE_STATUS)||console.warn("SSR fragment shader error:",e.getShaderInfoLog(s));const l=e.createProgram();e.attachShader(l,a),e.attachShader(l,s),e.linkProgram(l),e.deleteShader(a),e.deleteShader(s);const n=c=>e.getUniformLocation(l,c);return{program:l,u_colorTex:n("u_colorTex"),u_normalDepthTex:n("u_normalDepthTex"),u_resolution:n("u_resolution"),u_time:n("u_time"),u_maxSteps:n("u_maxSteps"),u_maxDistance:n("u_maxDistance"),u_thickness:n("u_thickness"),u_stride:n("u_stride"),u_jitter:n("u_jitter"),u_fadeEdge:n("u_fadeEdge"),u_reflectionStrength:n("u_reflectionStrength"),u_projMatrix:n("u_projMatrix"),u_invProjMatrix:n("u_invProjMatrix"),u_viewMatrix:n("u_viewMatrix")}}dispose(){const e=this.gl;this._program&&e.deleteProgram(this._program.program),this._fbo&&e.deleteFramebuffer(this._fbo),this._texture&&e.deleteTexture(this._texture),this._vao&&e.deleteVertexArray(this._vao)}}function si(i,e,r,t){const a=[],s=[],l=[],n=[];for(let c=0;c<=t;c++)for(let h=0;h<=r;h++){const f=h/r*Math.PI*2,u=c/t*Math.PI*2;a.push((i+e*Math.cos(u))*Math.cos(f),e*Math.sin(u),(i+e*Math.cos(u))*Math.sin(f)),s.push(Math.cos(u)*Math.cos(f),Math.sin(u),Math.cos(u)*Math.sin(f)),l.push(h/r,c/t)}for(let c=0;c<t;c++)for(let h=0;h<r;h++){const f=c*(r+1)+h,u=f+r+1;n.push(f,u,f+1,u,u+1,f+1)}return{positions:new Float32Array(a),normals:new Float32Array(s),uvs:new Float32Array(l),indices:new Uint16Array(n),triCount:n.length/3}}function li(i,e,r){const t=[],a=[],s=[],l=[];for(let n=0;n<=r;n++)for(let c=0;c<=e;c++){const h=c/e,f=n/r,u=h*Math.PI*2,d=f*Math.PI,m=-i*Math.cos(u)*Math.sin(d),E=i*Math.cos(d),p=i*Math.sin(u)*Math.sin(d),v=Math.sqrt(m*m+E*E+p*p)||1;t.push(m,E,p),a.push(m/v,E/v,p/v),s.push(h,f)}for(let n=0;n<r;n++)for(let c=0;c<e;c++){const h=n*(e+1)+c,f=h+e+1;l.push(h,f,h+1,f,f+1,h+1)}return{positions:new Float32Array(t),normals:new Float32Array(a),uvs:new Float32Array(s),indices:new Uint16Array(l),triCount:l.length/3}}function ci(i){const e=i/2,r=[-e,-e,e,e,-e,e,e,e,e,-e,e,e,e,-e,-e,-e,-e,-e,-e,e,-e,e,e,-e,-e,e,e,e,e,e,e,e,-e,-e,e,-e,-e,-e,-e,e,-e,-e,e,-e,e,-e,-e,e,e,-e,e,e,-e,-e,e,e,-e,e,e,e,-e,-e,-e,-e,-e,e,-e,e,e,-e,e,-e],t=[0,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0],a=[0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1],s=[];for(let l=0;l<6;l++){const n=l*4;s.push(n,n+1,n+2,n,n+2,n+3)}return{positions:new Float32Array(r),normals:new Float32Array(t),uvs:new Float32Array(a),indices:new Uint16Array(s),triCount:s.length/3}}function ui(i,e,r,t){const a=[],s=[],l=[],n=[];function c(h){return h*=Math.PI*2,[(Math.sin(h)+2*Math.sin(2*h))*i,(Math.cos(h)-2*Math.cos(2*h))*i,-Math.sin(3*h)*i]}for(let h=0;h<=t;h++)for(let f=0;f<=r;f++){const u=f/r,d=h/t*Math.PI*2,m=c(u),E=c(u+.001),p=[E[0]-m[0],E[1]-m[1],E[2]-m[2]],v=Math.sqrt(p[0]*p[0]+p[1]*p[1]+p[2]*p[2])||1;p[0]/=v,p[1]/=v,p[2]/=v;let T=[0,1,0];Math.abs(p[1])>.99&&(T=[1,0,0]);const _=[p[1]*T[2]-p[2]*T[1],p[2]*T[0]-p[0]*T[2],p[0]*T[1]-p[1]*T[0]],g=Math.sqrt(_[0]*_[0]+_[1]*_[1]+_[2]*_[2])||1;_[0]/=g,_[1]/=g,_[2]/=g;const b=[_[1]*p[2]-_[2]*p[1],_[2]*p[0]-_[0]*p[2],_[0]*p[1]-_[1]*p[0]],R=Math.cos(d),A=Math.sin(d),F=R*b[0]+A*_[0],P=R*b[1]+A*_[1],X=R*b[2]+A*_[2];a.push(m[0]+e*F,m[1]+e*P,m[2]+e*X),s.push(F,P,X),l.push(u,h/t)}for(let h=0;h<t;h++)for(let f=0;f<r;f++){const u=h*(r+1)+f,d=u+r+1;n.push(u,d,u+1,d,d+1,u+1)}return{positions:new Float32Array(a),normals:new Float32Array(s),uvs:new Float32Array(l),indices:new Uint16Array(n),triCount:n.length/3}}function hi(i){const e=document.createElement("canvas");e.width=i,e.height=i;const r=e.getContext("2d"),t=r.createRadialGradient(i/2,i/2,0,i/2,i/2,i*.5);t.addColorStop(0,"#ff6b35"),t.addColorStop(.35,"#d63384"),t.addColorStop(.65,"#6f42c1"),t.addColorStop(1,"#0d6efd"),r.fillStyle=t,r.fillRect(0,0,i,i),r.globalCompositeOperation="multiply";const a=8,s=i/a;for(let l=0;l<a;l++)for(let n=0;n<a;n++)r.fillStyle=(l+n)%2===0?"rgba(255,255,255,0.85)":"rgba(60,60,80,0.85)",r.fillRect(n*s,l*s,s,s);r.globalCompositeOperation="screen";for(let l=1;l<=6;l++)r.beginPath(),r.arc(i/2,i/2,l*i*.07,0,Math.PI*2),r.lineWidth=2,r.strokeStyle=`hsla(${l*50},80%,70%,0.4)`,r.stroke();return r.globalCompositeOperation="source-over",r.getImageData(0,0,i,i)}const ce=`#version 300 es
precision highp float; out vec2 v_uv;
void main(){float x=float((gl_VertexID&1)<<2)-1.0;float y=float((gl_VertexID&2)<<1)-1.0;v_uv=vec2(x,y)*0.5+0.5;gl_Position=vec4(x,y,0.0,1.0);}`,fi=`#version 300 es
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
}`;function di(i,e){const r=new Float32Array(16);for(let t=0;t<4;t++)for(let a=0;a<4;a++)r[t*4+a]=i[a]*e[t*4]+i[4+a]*e[t*4+1]+i[8+a]*e[t*4+2]+i[12+a]*e[t*4+3];return r}function mi(i,e,r,t){const a=1/Math.tan(i*.5),s=1/(r-t);return new Float32Array([a/e,0,0,0,0,a,0,0,0,0,(t+r)*s,-1,0,0,2*t*r*s,0])}function _i(i,e,r){let t=i[0]-e[0],a=i[1]-e[1],s=i[2]-e[2],l=Math.hypot(t,a,s)||1;t/=l,a/=l,s/=l;let n=r[1]*s-r[2]*a,c=r[2]*t-r[0]*s,h=r[0]*a-r[1]*t;l=Math.hypot(n,c,h)||1,n/=l,c/=l,h/=l;const f=a*h-s*c,u=s*n-t*h,d=t*c-a*n;return new Float32Array([n,f,t,0,c,u,a,0,h,d,s,0,-(n*i[0]+c*i[1]+h*i[2]),-(f*i[0]+u*i[1]+d*i[2]),-(t*i[0]+a*i[1]+s*i[2]),1])}class pi{constructor(e){this.distance=5,this.azimuth=.5,this.elevation=.35,this.fov=Math.PI/4,this.near=.1,this.far=100,this.target=[0,0,0],this.canvas=e,this._dragging=!1,this._lastX=0,this._lastY=0,e.addEventListener("pointerdown",r=>{this._dragging=!0,this._lastX=r.clientX,this._lastY=r.clientY,e.setPointerCapture(r.pointerId)}),e.addEventListener("pointermove",r=>{this._dragging&&(this.azimuth+=(r.clientX-this._lastX)*.005,this.elevation+=(r.clientY-this._lastY)*.005,this.elevation=Math.max(-1.5,Math.min(1.5,this.elevation)),this._lastX=r.clientX,this._lastY=r.clientY)}),e.addEventListener("pointerup",()=>{this._dragging=!1}),e.addEventListener("wheel",r=>{r.preventDefault(),this.distance*=1+r.deltaY*.001,this.distance=Math.max(1,Math.min(30,this.distance))},{passive:!1})}get isDragging(){return this._dragging}get eye(){const e=Math.cos(this.elevation),r=Math.sin(this.elevation),t=Math.cos(this.azimuth),a=Math.sin(this.azimuth);return[this.target[0]+this.distance*e*a,this.target[1]+this.distance*r,this.target[2]+this.distance*e*t]}get aspect(){return this.canvas.width/this.canvas.height}get viewMatrix(){return _i(this.eye,this.target,[0,1,0])}get projectionMatrix(){return mi(this.fov,this.aspect,this.near,this.far)}get viewProjection(){return di(this.projectionMatrix,this.viewMatrix)}}const C=document.getElementById("canvas");C.width=window.innerWidth*devicePixelRatio;C.height=window.innerHeight*devicePixelRatio;const o=C.getContext("webgl2",{depth:!0,antialias:!1,preserveDrawingBuffer:!0});if(!o)throw document.body.innerHTML='<h2 style="color:#fff;text-align:center;margin-top:40vh">WebGL2 required</h2>',new Error("WebGL2 required");o.getExtension("EXT_color_buffer_half_float");o.getExtension("EXT_color_buffer_float");const D=new pi(C);window.addEventListener("resize",()=>{C.width=window.innerWidth*devicePixelRatio,C.height=window.innerHeight*devicePixelRatio});const be=new Gr(o,{lightDir:[.5,.8,.3],lightColor:[1,.98,.95],ambientColor:[.15,.15,.22],specularPower:48}),st=new $t(o,{pointScale:C.height/(2*Math.tan(Math.PI/8)),blendMode:"additive",animate:!0,intensity:1,chromatic:.4}),M=new zr(o,{layerCount:4,geometry:3,thickness:.6,patternScale:3,patternSpeed:.3,depthSensitivity:8,normalSensitivity:2,opacity:.8}),x=new Zr(o,{exposure:1.2,gamma:2.2});x.setMeshRenderer(be);x.setSplatRenderer(st);x.setEdgeInscription(M);const Ne=new Jr({layerCount:4,transitionDuration:.5});Ne.registerObject(1,"active");let fe=.3,W=null,Qt=null,We=3;{const i=o.createShader(o.VERTEX_SHADER);o.shaderSource(i,ce),o.compileShader(i);const e=o.createShader(o.FRAGMENT_SHADER);o.shaderSource(e,fi),o.compileShader(e),o.getShaderParameter(i,o.COMPILE_STATUS)&&o.getShaderParameter(e,o.COMPILE_STATUS)&&(W=o.createProgram(),o.attachShader(W,i),o.attachShader(W,e),o.linkProgram(W),o.getProgramParameter(W,o.LINK_STATUS)?Qt=o.createVertexArray():W=null)}x.setProceduralRenderer((i,e)=>{W&&(o.useProgram(W),o.bindVertexArray(Qt),o.uniform1f(o.getUniformLocation(W,"u_time"),e),o.uniform1f(o.getUniformLocation(W,"u_geometry"),We),o.uniform2f(o.getUniformLocation(W,"u_resolution"),i.width,i.height),o.drawArrays(o.TRIANGLES,0,3))});let Ce=null,pe=!0,Jt=.7,er=.5;try{Ce=new ei(o,{resolution:1024,bias:.003,pcfRadius:2,frustumSize:6,lightDir:[.5,.8,.3]}),Ce.init()}catch(i){console.warn("ShadowMap init failed:",i),Ce=null}let S=null,ne=!0,qe=50,Ze=.8,Mt="surface";try{S=new ri(o,{maxParticles:1e4,emitRate:50,lifetime:2.5,speed:.3,speedVariance:.15,gravity:[0,-.1,0],drag:.02,splatScale:.015,emitterType:"sphere",emitterRadius:1.2,colorStart:[.4,.7,1],colorEnd:[.8,.3,1],colorMode:"lerp"})}catch(i){console.warn("ParticleSystem init failed:",i),S=null}let $=null,xe=!1,tr=.8,rr=.4;try{$=new ii(o,{maxSteps:48,density:.8,absorption:.4,geometry:3,primaryColor:[.3,.6,1],secondaryColor:[.8,.2,.9]}),$.init()}catch(i){console.warn("VolumetricInscription init failed:",i),$=null}let K=null,Re=!0,ir=.6,or=.4;try{K=new oi(o,{lightDir:[.5,.8,.3],lightColor:[1,.98,.95],specularPower:32,specularStrength:.6,fresnelPower:3,inscriptionEmission:1.5}),K.init()}catch(i){console.warn("DeferredInscriptionLighting init failed:",i),K=null}let Fe=null;try{Fe=new ai(o),Fe.setLayerCircuitPattern(0,{density:12,color:"#5b9cf5"}),Fe.setLayerText(1,"VIB3+",{fontSize:48,color:"#a78bfa"})}catch(i){console.warn("InscriptionTexture init failed:",i),Fe=null}let Q=null,se=!0,ar=.6;try{Q=new ni(o,{maxSteps:48,maxDistance:8,thickness:.15,stride:2,jitter:.4,fadeEdge:.12,reflectionStrength:.6}),Q.init()}catch(i){console.warn("SSR init failed:",i),Q=null}let le=!0,nr=.65,sr=.45,lr=.35,cr=.003,nt=!0,$e=0,Ei=12,Ke=3,De=3;const gi={torus:()=>si(1,.4,64,32),sphere:()=>li(1.2,48,32),cube:()=>ci(1.8),knot:()=>ui(.35,.12,128,24)};let ur="torus",re=null,Me=[];const Ti=new Kr,Pe=hi(256);function lt(i){ur=i;const e=gi[i];e&&(re=e(),be.uploadGeometry(re),be.uploadTexture(Pe),Me=Ti.convert({positions:re.positions,normals:re.normals,uvs:re.uvs,indices:re.indices,diffusePixels:Pe.data,diffuseWidth:Pe.width,diffuseHeight:Pe.height}),st.updateSeeds(Zt(Me),Me.length),document.getElementById("meshTris").textContent=re.triCount.toLocaleString(),document.getElementById("splatCount").textContent=Me.length.toLocaleString(),document.querySelectorAll(".mesh-btn").forEach(r=>r.classList.toggle("active",r.dataset.mesh===i)))}let hr="showcase";const vi={showcase:{m:!0,s:!0,p:!0,i:!0,shadow:!0,particles:!0,volumetric:!1,deferred:!0,bloom:!0,ssr:!0,autoShow:!0,l:"v3 Showcase"},hybrid:{m:!0,s:!0,p:!0,i:!0,shadow:!1,particles:!1,volumetric:!1,deferred:!1,bloom:!1,ssr:!1,autoShow:!1,l:"Full Hybrid"},shadows:{m:!0,s:!1,p:!1,i:!0,shadow:!0,particles:!1,volumetric:!1,deferred:!0,bloom:!0,ssr:!1,autoShow:!1,l:"Shadows"},particles:{m:!0,s:!1,p:!1,i:!0,shadow:!1,particles:!0,volumetric:!1,deferred:!1,bloom:!0,ssr:!1,autoShow:!1,l:"Particles"},volumetric:{m:!0,s:!1,p:!1,i:!1,shadow:!1,particles:!1,volumetric:!0,deferred:!1,bloom:!0,ssr:!1,autoShow:!1,l:"Volumetric"},inscFX:{m:!0,s:!1,p:!1,i:!0,shadow:!0,particles:!0,volumetric:!1,deferred:!0,bloom:!0,ssr:!0,autoShow:!1,l:"Inscription FX"},cinematic:{m:!0,s:!0,p:!0,i:!0,shadow:!0,particles:!0,volumetric:!1,deferred:!0,bloom:!0,ssr:!0,autoShow:!0,l:"Cinematic"},benchmark:{m:!0,s:!0,p:!0,i:!0,shadow:!0,particles:!0,volumetric:!1,deferred:!0,bloom:!0,ssr:!1,autoShow:!1,l:"Benchmark"}};function ct(i){hr=i;const e=vi[i];if(!e)return;x.meshLayer.enabled=e.m,x.splatLayer.enabled=e.s,x.proceduralLayer.enabled=e.p,x.inscriptionLayer.enabled=e.i,pe=e.shadow,ne=e.particles,xe=e.volumetric,Re=e.deferred,le=e.bloom!==!1,se=e.ssr===!0,nt=e.autoShow===!0,document.getElementById("toggleMesh").checked=e.m,document.getElementById("toggleSplat").checked=e.s,document.getElementById("toggleProcedural").checked=e.p,document.getElementById("toggleInscription").checked=e.i,document.getElementById("toggleShadows").checked=e.shadow,document.getElementById("toggleParticles").checked=e.particles,document.getElementById("toggleVolumetric").checked=e.volumetric,document.getElementById("toggleDeferredLit").checked=e.deferred;const r=document.getElementById("toggleBloom");r&&(r.checked=le);const t=document.getElementById("toggleSSR");t&&(t.checked=se),document.getElementById("compositorMode").textContent=e.l,document.getElementById("benchmarkPanel").classList.toggle("hidden",i!=="benchmark"),document.querySelectorAll(".tab-btn").forEach(a=>a.classList.toggle("active",a.dataset.tab===i)),J()}function J(){const i=(e,r)=>{const t=document.getElementById(e);t&&(t.className="feature-badge "+(r?"on":"off"))};i("badgeShadows",pe&&Ce),i("badgeParticles",ne&&S),i("badgeVolumetric",xe&&$),i("badgeDeferredLit",Re&&K),i("badgeInscription",x.inscriptionLayer.enabled),i("badgeBloom",le),i("badgeSSR",se&&Q)}document.querySelectorAll(".tab-btn").forEach(i=>i.addEventListener("click",()=>ct(i.dataset.tab)));document.querySelectorAll(".mesh-btn").forEach(i=>i.addEventListener("click",()=>lt(i.dataset.mesh)));const Pt=document.getElementById("controlsToggle"),bi=document.getElementById("controls");Pt.addEventListener("click",()=>{const i=bi.classList.toggle("collapsed");Pt.classList.toggle("active",!i)});document.getElementById("toggleMesh").addEventListener("change",i=>x.meshLayer.enabled=i.target.checked);document.getElementById("toggleSplat").addEventListener("change",i=>x.splatLayer.enabled=i.target.checked);document.getElementById("toggleProcedural").addEventListener("change",i=>x.proceduralLayer.enabled=i.target.checked);document.getElementById("toggleInscription").addEventListener("change",i=>{x.inscriptionLayer.enabled=i.target.checked,J()});function L(i,e,r){const t=document.getElementById(i),a=document.getElementById(e);!t||!a||t.addEventListener("input",()=>{const s=t.value/100;a.textContent=s.toFixed(2),r(s)})}L("sliderMeshOpacity","valMeshOpacity",i=>x.meshLayer.opacity=i);L("sliderSplatOpacity","valSplatOpacity",i=>x.splatLayer.opacity=i);L("sliderProcOpacity","valProcOpacity",i=>x.proceduralLayer.opacity=i);L("sliderInscOpacity","valInscOpacity",i=>x.inscriptionLayer.opacity=i);const Qe=document.getElementById("sliderThickness"),xi=document.getElementById("valThickness");Qe&&Qe.addEventListener("input",()=>{const i=Qe.value/100;xi.textContent=i.toFixed(2),M.thickness=i});const Ue=document.getElementById("sliderPattern"),Ri=document.getElementById("valPattern");Ue&&Ue.addEventListener("input",()=>{Ri.textContent=Ue.value,M.geometry=parseInt(Ue.value)});const ge=document.getElementById("sliderLayerCount"),yi=document.getElementById("valLayerCount");ge&&ge.addEventListener("input",()=>{yi.textContent=ge.value,M.layerCount=parseInt(ge.value),document.getElementById("inscLayers").textContent=ge.value});const Be=document.getElementById("sliderGeometry"),Ai=document.getElementById("valGeometry");Be&&Be.addEventListener("input",()=>{Ai.textContent=Be.value,We=parseInt(Be.value)});const Je=document.getElementById("sliderExposure"),Si=document.getElementById("valExposure");Je&&Je.addEventListener("input",()=>{const i=Je.value/100;Si.textContent=i.toFixed(2),x.exposure=i});function ut(i,e,r){const t=document.getElementById(i),a=document.getElementById(e);!t||!a||t.addEventListener("input",()=>{const s=t.value/100;a.textContent=s.toFixed(2),M[r]=s})}ut("slider4DXW","val4DXW","rot4dXW");ut("slider4DYW","val4DYW","rot4dYW");ut("slider4DZW","val4DZW","rot4dZW");const Ut=document.getElementById("selectState");Ut&&Ut.addEventListener("change",i=>{Ne.setObjectState(1,i.target.value);const e=document.getElementById("currentState");e&&(e.textContent=i.target.value)});const et=document.getElementById("sliderAudioSim"),Bt=document.getElementById("valAudioSim");et&&et.addEventListener("input",()=>{const i=et.value/100;Bt&&(Bt.textContent=i.toFixed(2)),fe=i});document.getElementById("toggleShadows").addEventListener("change",i=>{pe=i.target.checked,J()});L("sliderShadowInt","valShadowInt",i=>Jt=i);L("sliderShadowSoft","valShadowSoft",i=>er=i);document.getElementById("toggleParticles").addEventListener("change",i=>{ne=i.target.checked,J()});{const i=document.getElementById("sliderParticleRate"),e=document.getElementById("valParticleRate");i&&i.addEventListener("input",()=>{qe=parseInt(i.value),e.textContent=qe,S&&(S.emitRate=qe)});const r=document.getElementById("sliderParticleSize"),t=document.getElementById("valParticleSize");r&&r.addEventListener("input",()=>{Ze=r.value/100,t.textContent=Ze.toFixed(2),S&&(S.splatScale=Ze*.02)});const a=document.getElementById("selectParticleMode");a&&a.addEventListener("change",s=>{Mt=s.target.value,S&&(S.emitterType=Mt==="surface"?"sphere":"point")})}document.getElementById("toggleVolumetric").addEventListener("change",i=>{xe=i.target.checked,J()});L("sliderVolDensity","valVolDensity",i=>{tr=i,$&&($.density=i)});L("sliderVolAbsorb","valVolAbsorb",i=>{rr=i,$&&($.absorption=i)});document.getElementById("toggleDeferredLit").addEventListener("change",i=>{Re=i.target.checked,J()});L("sliderSpecular","valSpecular",i=>{ir=i,K&&(K.specularStrength=i)});L("sliderFresnel","valFresnel",i=>{or=i,K&&(K.fresnelPower=i*8)});const Lt=document.getElementById("toggleBloom");Lt&&Lt.addEventListener("change",i=>{le=i.target.checked,J()});L("sliderBloomThreshold","valBloomThreshold",i=>nr=i);L("sliderBloomIntensity","valBloomIntensity",i=>sr=i);const wt=document.getElementById("toggleSSR");wt&&wt.addEventListener("change",i=>{se=i.target.checked,J()});L("sliderSSRStrength","valSSRStrength",i=>{ar=i,Q&&(Q.reflectionStrength=i)});L("sliderVignette","valVignette",i=>lr=i);L("sliderChromatic","valChromatic",i=>cr=i*.01);document.getElementById("selectSplatSource").addEventListener("change",i=>{const e=i.target.value;if(e==="texture")lt(ur);else{const r=[],t=e==="galaxy"?2e5:15e4;for(let a=0;a<t;a++){const s=Math.random()*Math.PI*2,l=Math.pow(Math.random(),.5)*3;if(e==="galaxy"){const n=Math.floor(Math.random()*3)*(Math.PI*2/3),c=s*.5;r.push({position:[l*Math.cos(s+n+c)+(Math.random()-.5)*.3,(Math.random()-.5)*.2*(1-l/3),l*Math.sin(s+n+c)+(Math.random()-.5)*.3],orientation:[1,0,0,0],scale:.015+Math.random()*.02,color:[.6+Math.random()*.4,.4+Math.random()*.4,.8+Math.random()*.2],depth:l*.3})}else{const n=(Math.random()-.5)*Math.PI;r.push({position:[l*Math.cos(s)*Math.cos(n),l*Math.sin(n)*.6,l*Math.sin(s)*Math.cos(n)],orientation:[1,0,0,0],scale:.02+Math.random()*.03,color:[.8+Math.random()*.2,.2+Math.random()*.3,.5+Math.random()*.5],depth:l*.2})}}st.updateSeeds(Zt(r),r.length),document.getElementById("splatCount").textContent=r.length.toLocaleString()}});const Fi=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_sceneColor;
uniform sampler2D u_shadowMap;
uniform sampler2D u_normalDepth;
uniform float u_shadowIntensity;
uniform float u_shadowSoftness;
uniform vec3 u_lightDir;
out vec4 outColor;
void main() {
    vec4 scene = texture(u_sceneColor, v_uv);
    vec4 nd = texture(u_normalDepth, v_uv);
    vec3 normal = nd.rgb * 2.0 - 1.0;
    float depth = nd.a;
    // Simulated shadow: use normal-based shadowing + depth
    float NdL = max(dot(normal, normalize(u_lightDir)), 0.0);
    float shadow = smoothstep(0.0, 0.3 + u_shadowSoftness * 0.5, NdL);
    shadow = mix(1.0, shadow, u_shadowIntensity);
    // Cool/warm shadow tinting (v3 inscription shadow modulation)
    vec3 coolTint = vec3(0.7, 0.8, 1.0);
    vec3 warmTint = vec3(1.0, 0.95, 0.9);
    vec3 shadowColor = mix(coolTint, warmTint, shadow);
    outColor = vec4(scene.rgb * shadowColor * (0.5 + 0.5 * shadow), scene.a);
}`;let w=null,fr=null;{const i=o.createShader(o.VERTEX_SHADER);o.shaderSource(i,ce),o.compileShader(i);const e=o.createShader(o.FRAGMENT_SHADER);o.shaderSource(e,Fi),o.compileShader(e),o.getShaderParameter(i,o.COMPILE_STATUS)&&o.getShaderParameter(e,o.COMPILE_STATUS)&&(w=o.createProgram(),o.attachShader(w,i),o.attachShader(w,e),o.linkProgram(w),o.getProgramParameter(w,o.LINK_STATUS)?fr=o.createVertexArray():(console.warn("Shadow comp link:",o.getProgramInfoLog(w)),w=null))}const Di=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_inscriptionTex;
uniform sampler2D u_normalDepth;
uniform vec3 u_lightDir;
uniform float u_specularStrength;
uniform float u_fresnelPower;
uniform float u_time;
out vec4 outColor;
void main() {
    vec4 insc = texture(u_inscriptionTex, v_uv);
    if (insc.a < 0.01) { outColor = insc; return; }
    vec4 nd = texture(u_normalDepth, v_uv);
    vec3 N = normalize(nd.rgb * 2.0 - 1.0);
    vec3 L = normalize(u_lightDir);
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 H = normalize(L + V);

    // NdotL diffuse
    float NdL = max(dot(N, L), 0.0);

    // Anisotropic specular along edge tangent
    vec3 dNdx = dFdx(N), dNdy = dFdy(N);
    vec3 tangent = normalize(dNdx + dNdy);
    float TdH = dot(tangent, H);
    float anisoSpec = pow(max(0.0, sqrt(1.0 - TdH * TdH)), 32.0) * u_specularStrength;

    // Fresnel rim
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), u_fresnelPower * 8.0);
    fresnel *= 0.5;

    // Combine
    vec3 lit = insc.rgb * (0.4 + 0.6 * NdL) + vec3(anisoSpec) * insc.rgb + vec3(fresnel) * insc.rgb * 0.5;
    // Pulsing glow
    lit += insc.rgb * 0.15 * (0.5 + 0.5 * sin(u_time * 2.0 + v_uv.x * 10.0));
    outColor = vec4(lit, insc.a);
}`;let U=null,dr=null;{const i=o.createShader(o.VERTEX_SHADER);o.shaderSource(i,ce),o.compileShader(i);const e=o.createShader(o.FRAGMENT_SHADER);o.shaderSource(e,Di),o.compileShader(e),o.getShaderParameter(i,o.COMPILE_STATUS)&&o.getShaderParameter(e,o.COMPILE_STATUS)&&(U=o.createProgram(),o.attachShader(U,i),o.attachShader(U,e),o.linkProgram(U),o.getProgramParameter(U,o.LINK_STATUS)?dr=o.createVertexArray():(console.warn("Deferred lit link:",o.getProgramInfoLog(U)),U=null))}const Mi=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_normalDepth;
uniform float u_time;
uniform float u_density;
uniform float u_absorption;
uniform float u_geometry;
uniform vec2 u_resolution;
out vec4 outColor;

// Rotation matrices for 4D
mat4 rXW(float a){float c=cos(a),s=sin(a);return mat4(c,0,0,-s,0,1,0,0,0,0,1,0,s,0,0,c);}
mat4 rYW(float a){float c=cos(a),s=sin(a);return mat4(1,0,0,0,0,c,0,-s,0,0,1,0,0,s,0,c);}
mat4 rZW(float a){float c=cos(a),s=sin(a);return mat4(1,0,0,0,0,1,0,0,0,0,c,-s,0,0,s,c);}

float hash3(vec3 p){
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p){
    vec3 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash3(i), hash3(i+vec3(1,0,0)), f.x),
                   mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)), f.x),
                   mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)), f.x), f.y), f.z);
}

float getPattern(vec3 p, float g) {
    float t = u_time * 0.3, b = mod(g, 8.0), pat = 0.0;
    if(b < 0.5) pat = abs(sin(p.x*6.0+t)*sin(p.y*6.0-t)*sin(p.z*6.0+t*0.5));
    else if(b < 1.5) { vec3 q = fract(p*3.0)-0.5; pat = 1.0-smoothstep(0.15,0.25,length(max(abs(q)-0.15,0.0))); }
    else if(b < 2.5) { float r = length(p); pat = smoothstep(0.5,0.3,r)*abs(sin(atan(p.y,p.x)*4.0+t*2.0)); }
    else if(b < 3.5) { float r = length(p.xy); pat = abs(sin((r)*12.0+t*2.0))*smoothstep(0.6,0.2,r); }
    else if(b < 4.5) { float a = atan(p.y,p.x)+t; pat = abs(sin(a*3.0+p.z*5.0)); }
    else if(b < 5.5) { vec3 q = p*2.0; for(int i=0;i<3;i++){q=abs(q)-0.8;q*=1.5;} pat = 1.0-smoothstep(0.0,0.3,length(q)*0.05); }
    else if(b < 6.5) { pat = noise3(p*4.0+t*0.5)*noise3(p*8.0-t*0.3); }
    else { vec3 q = abs(fract(p*3.0)-0.5); pat = 1.0-smoothstep(0.0,0.06,min(min(q.x,q.y),q.z)); }
    if(g >= 8.0 && g < 16.0) pat *= smoothstep(0.6,0.2,length(p));
    else if(g >= 16.0) pat *= smoothstep(0.5,0.1,abs(max(abs(p.x+p.y)-p.z,abs(p.x-p.y)+p.z)*0.5));
    return clamp(pat, 0.0, 1.0);
}

void main() {
    vec4 nd = texture(u_normalDepth, v_uv);
    float sceneDepth = nd.a;
    if(sceneDepth < 0.001) { outColor = vec4(0); return; }

    vec2 uv = (v_uv * 2.0 - 1.0) * vec2(u_resolution.x / u_resolution.y, 1.0);
    vec3 rayOri = vec3(uv, -2.0);
    vec3 rayDir = normalize(vec3(uv * 0.3, 1.0));

    float t = u_time;
    mat4 rot = rXW(t*0.2) * rYW(t*0.15) * rZW(t*0.1);

    vec3 acc = vec3(0.0);
    float transmittance = 1.0;
    int steps = 48;
    float stepSize = 4.0 / float(steps);

    for(int i = 0; i < 48; i++) {
        vec3 pos = rayOri + rayDir * float(i) * stepSize;
        float dist = length(pos);
        if(dist > 2.0) continue;

        vec4 p4 = rot * vec4(pos, 0.0);
        vec3 rp = p4.xyz / (2.0 - p4.w);

        float pat = getPattern(rp, u_geometry) * u_density;
        pat *= smoothstep(2.0, 0.5, dist); // Fade at edges

        vec3 emission = mix(vec3(0.3, 0.6, 1.0), vec3(0.8, 0.2, 0.9), pat) * pat * 2.0;
        acc += emission * transmittance * stepSize;
        transmittance *= exp(-pat * u_absorption * stepSize);
        if(transmittance < 0.01) break;
    }

    outColor = vec4(acc, 1.0 - transmittance);
}`;let B=null,mr=null;{const i=o.createShader(o.VERTEX_SHADER);o.shaderSource(i,ce),o.compileShader(i);const e=o.createShader(o.FRAGMENT_SHADER);o.shaderSource(e,Mi),o.compileShader(e),o.getShaderParameter(i,o.COMPILE_STATUS)&&o.getShaderParameter(e,o.COMPILE_STATUS)?(B=o.createProgram(),o.attachShader(B,i),o.attachShader(B,e),o.linkProgram(B),o.getProgramParameter(B,o.LINK_STATUS)?mr=o.createVertexArray():(console.warn("Volumetric link:",o.getProgramInfoLog(B)),B=null)):console.warn("Volumetric shader compile failed")}let Te=null,ae=null,It=0,Ct=0;try{Te=new $t(o,{pointScale:C.height/(2*Math.tan(Math.PI/8)),blendMode:"additive",animate:!0,intensity:1.5,chromatic:.6})}catch(i){console.warn("Particle splat renderer init failed:",i)}function Pi(i,e){if(It===i&&Ct===e&&ae)return;ae&&(o.deleteFramebuffer(ae.framebuffer),o.deleteTexture(ae.texture));const r=o.createTexture();o.bindTexture(o.TEXTURE_2D,r),o.texImage2D(o.TEXTURE_2D,0,o.RGBA8,i,e,0,o.RGBA,o.UNSIGNED_BYTE,null),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE);const t=o.createRenderbuffer();o.bindRenderbuffer(o.RENDERBUFFER,t),o.renderbufferStorage(o.RENDERBUFFER,o.DEPTH_COMPONENT24,i,e);const a=o.createFramebuffer();o.bindFramebuffer(o.FRAMEBUFFER,a),o.framebufferTexture2D(o.FRAMEBUFFER,o.COLOR_ATTACHMENT0,o.TEXTURE_2D,r,0),o.framebufferRenderbuffer(o.FRAMEBUFFER,o.DEPTH_ATTACHMENT,o.RENDERBUFFER,t),o.bindFramebuffer(o.FRAMEBUFFER,null),ae={framebuffer:a,texture:r,depthRb:t},It=i,Ct=e}function Xt(i,e,r){const t=i.createTexture();i.bindTexture(i.TEXTURE_2D,t),i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,e,r,0,i.RGBA,i.UNSIGNED_BYTE,null),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE);const a=i.createFramebuffer();return i.bindFramebuffer(i.FRAMEBUFFER,a),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,t,0),i.bindFramebuffer(i.FRAMEBUFFER,null),{framebuffer:a,texture:t,width:e,height:r}}let N=null,Le=null,Ot=0,Nt=0;function we(i,e){Ot===i&&Nt===e||(N&&(o.deleteFramebuffer(N.framebuffer),o.deleteTexture(N.texture)),Le&&(o.deleteFramebuffer(Le.framebuffer),o.deleteTexture(Le.texture)),N=Xt(o,i,e),Le=Xt(o,i,e),Ot=i,Nt=e)}const Ui=`#version 300 es
precision highp float; in vec2 v_uv; uniform sampler2D u_texture; uniform float u_opacity; out vec4 outColor;
void main(){vec4 c=texture(u_texture,v_uv);outColor=vec4(c.rgb,c.a*u_opacity);}`;let V=null,_r=null;{const i=o.createShader(o.VERTEX_SHADER);o.shaderSource(i,ce),o.compileShader(i);const e=o.createShader(o.FRAGMENT_SHADER);o.shaderSource(e,Ui),o.compileShader(e),o.getShaderParameter(i,o.COMPILE_STATUS)&&o.getShaderParameter(e,o.COMPILE_STATUS)&&(V=o.createProgram(),o.attachShader(V,i),o.attachShader(V,e),o.linkProgram(V),o.getProgramParameter(V,o.LINK_STATUS)?_r=o.createVertexArray():V=null)}function Wt(i,e=1){V&&(o.useProgram(V),o.bindVertexArray(_r),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,i),o.uniform1i(o.getUniformLocation(V,"u_texture"),0),o.uniform1f(o.getUniformLocation(V,"u_opacity"),e),o.drawArrays(o.TRIANGLES,0,3))}const Bi=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_threshold;
out vec4 outColor;
void main() {
    vec3 c = texture(u_texture, v_uv).rgb;
    float brightness = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 bright = c * smoothstep(u_threshold, u_threshold + 0.3, brightness);
    outColor = vec4(bright, 1.0);
}`,Li=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform vec2 u_direction;
uniform vec2 u_resolution;
out vec4 outColor;
void main() {
    vec2 texel = u_direction / u_resolution;
    vec3 c = vec3(0.0);
    float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
    c += texture(u_texture, v_uv).rgb * weights[0];
    for (int i = 1; i < 5; i++) {
        vec2 off = texel * float(i) * 1.5;
        c += texture(u_texture, v_uv + off).rgb * weights[i];
        c += texture(u_texture, v_uv - off).rgb * weights[i];
    }
    outColor = vec4(c, 1.0);
}`,wi=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_bloomIntensity;
out vec4 outColor;
void main() {
    vec3 scene = texture(u_scene, v_uv).rgb;
    vec3 bloom = texture(u_bloom, v_uv).rgb;
    outColor = vec4(scene + bloom * u_bloomIntensity, 1.0);
}`;let ve=null,Z=null,de=null,Xe=null,G=null,me=null,_e=null,jt=0,Vt=0;{let i=function(e){const r=o.createShader(o.VERTEX_SHADER);o.shaderSource(r,ce),o.compileShader(r);const t=o.createShader(o.FRAGMENT_SHADER);if(o.shaderSource(t,e),o.compileShader(t),!o.getShaderParameter(r,o.COMPILE_STATUS)||!o.getShaderParameter(t,o.COMPILE_STATUS))return console.warn("Bloom shader compile failed:",o.getShaderInfoLog(t)),null;const a=o.createProgram();return o.attachShader(a,r),o.attachShader(a,t),o.linkProgram(a),o.getProgramParameter(a,o.LINK_STATUS)?a:(console.warn("Bloom link failed"),null)};var Vi=i;ve=i(Bi),Z=i(Li),de=i(wi),Xe=o.createVertexArray()}function tt(i,e,r){const t=r?Math.floor(i/2):i,a=r?Math.floor(e/2):e,s=o.createTexture();o.bindTexture(o.TEXTURE_2D,s),o.texImage2D(o.TEXTURE_2D,0,o.RGBA16F,t,a,0,o.RGBA,o.HALF_FLOAT,null),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE);const l=o.createFramebuffer();return o.bindFramebuffer(o.FRAMEBUFFER,l),o.framebufferTexture2D(o.FRAMEBUFFER,o.COLOR_ATTACHMENT0,o.TEXTURE_2D,s,0),o.bindFramebuffer(o.FRAMEBUFFER,null),{framebuffer:l,texture:s,width:t,height:a}}function Ii(i,e){jt===i&&Vt===e||(G&&(o.deleteFramebuffer(G.framebuffer),o.deleteTexture(G.texture)),me&&(o.deleteFramebuffer(me.framebuffer),o.deleteTexture(me.texture)),_e&&(o.deleteFramebuffer(_e.framebuffer),o.deleteTexture(_e.texture)),G=tt(i,e,!0),me=tt(i,e,!0),_e=tt(i,e,!1),jt=i,Vt=e)}function Ci(i,e,r){if(!ve||!Z||!de)return i;Ii(e,r);const t=G.width,a=G.height;o.bindFramebuffer(o.FRAMEBUFFER,G.framebuffer),o.viewport(0,0,t,a),o.useProgram(ve),o.bindVertexArray(Xe),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,i),o.uniform1i(o.getUniformLocation(ve,"u_texture"),0),o.uniform1f(o.getUniformLocation(ve,"u_threshold"),nr),o.drawArrays(o.TRIANGLES,0,3);for(let s=0;s<3;s++)o.bindFramebuffer(o.FRAMEBUFFER,me.framebuffer),o.viewport(0,0,t,a),o.useProgram(Z),o.bindVertexArray(Xe),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,G.texture),o.uniform1i(o.getUniformLocation(Z,"u_texture"),0),o.uniform2f(o.getUniformLocation(Z,"u_direction"),1+s*.5,0),o.uniform2f(o.getUniformLocation(Z,"u_resolution"),t,a),o.drawArrays(o.TRIANGLES,0,3),o.bindFramebuffer(o.FRAMEBUFFER,G.framebuffer),o.viewport(0,0,t,a),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,me.texture),o.uniform1i(o.getUniformLocation(Z,"u_texture"),0),o.uniform2f(o.getUniformLocation(Z,"u_direction"),0,1+s*.5),o.drawArrays(o.TRIANGLES,0,3);return o.bindFramebuffer(o.FRAMEBUFFER,_e.framebuffer),o.viewport(0,0,e,r),o.useProgram(de),o.bindVertexArray(Xe),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,i),o.uniform1i(o.getUniformLocation(de,"u_scene"),0),o.activeTexture(o.TEXTURE1),o.bindTexture(o.TEXTURE_2D,G.texture),o.uniform1i(o.getUniformLocation(de,"u_bloom"),1),o.uniform1f(o.getUniformLocation(de,"u_bloomIntensity"),sr),o.drawArrays(o.TRIANGLES,0,3),_e.texture}const Xi=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_vignetteStrength;
uniform float u_chromaticStrength;
uniform vec2 u_resolution;
uniform float u_time;
out vec4 outColor;

// ACES filmic tone mapping (more cinematic than Reinhard)
vec3 acesTonemap(vec3 x) {
    float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
    vec2 uv = v_uv;

    // Chromatic aberration
    vec3 color;
    if (u_chromaticStrength > 0.0001) {
        vec2 center = uv - 0.5;
        float dist = length(center);
        float ca = u_chromaticStrength * dist;
        color.r = texture(u_texture, uv + center * ca).r;
        color.g = texture(u_texture, uv).g;
        color.b = texture(u_texture, uv - center * ca).b;
    } else {
        color = texture(u_texture, v_uv).rgb;
    }

    // Film grain (subtle)
    float grain = fract(sin(dot(uv * u_resolution + u_time * 100.0, vec2(12.9898, 78.233))) * 43758.5453) * 0.02 - 0.01;
    color += grain;

    // ACES tonemapping
    color = acesTonemap(color * 1.1);

    // Gamma correction
    color = pow(color, vec3(1.0 / 2.2));

    // Vignette
    if (u_vignetteStrength > 0.001) {
        vec2 vc = uv - 0.5;
        float vDist = dot(vc, vc);
        float vFactor = 1.0 - vDist * u_vignetteStrength * 2.5;
        color *= max(vFactor, 0.0);
    }

    outColor = vec4(color, 1.0);
}`;let I=null,pr=null;{const i=o.createShader(o.VERTEX_SHADER);o.shaderSource(i,ce),o.compileShader(i);const e=o.createShader(o.FRAGMENT_SHADER);o.shaderSource(e,Xi),o.compileShader(e),o.getShaderParameter(i,o.COMPILE_STATUS)&&o.getShaderParameter(e,o.COMPILE_STATUS)?(I=o.createProgram(),o.attachShader(I,i),o.attachShader(I,e),o.linkProgram(I),o.getProgramParameter(I,o.LINK_STATUS)?pr=o.createVertexArray():(console.warn("Final pass link:",o.getProgramInfoLog(I)),I=null)):console.warn("Final pass compile failed:",o.getShaderInfoLog(e))}let ie=null,Gt=0,kt=0;function Oi(i,e){if(Gt===i&&kt===e&&ie)return;ie&&(o.deleteFramebuffer(ie.framebuffer),o.deleteTexture(ie.texture),ie.depthRb&&o.deleteRenderbuffer(ie.depthRb));const r=o.createTexture();o.bindTexture(o.TEXTURE_2D,r),o.texImage2D(o.TEXTURE_2D,0,o.RGBA16F,i,e,0,o.RGBA,o.HALF_FLOAT,null),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE);const t=o.createRenderbuffer();o.bindRenderbuffer(o.RENDERBUFFER,t),o.renderbufferStorage(o.RENDERBUFFER,o.DEPTH_COMPONENT24,i,e);const a=o.createFramebuffer();o.bindFramebuffer(o.FRAMEBUFFER,a),o.framebufferTexture2D(o.FRAMEBUFFER,o.COLOR_ATTACHMENT0,o.TEXTURE_2D,r,0),o.framebufferRenderbuffer(o.FRAMEBUFFER,o.DEPTH_ATTACHMENT,o.RENDERBUFFER,t),o.bindFramebuffer(o.FRAMEBUFFER,null),ie={framebuffer:a,texture:r,depthRb:t,width:i,height:e},Gt=i,kt=e}let oe=null,rt=[];document.getElementById("btnScreenshot").addEventListener("click",()=>{C.toBlob(i=>{const e=document.createElement("a");e.href=URL.createObjectURL(i),e.download=`vib3-screenshot-${Date.now()}.png`,e.click(),URL.revokeObjectURL(e.href)},"image/png")});document.getElementById("btnRecord").addEventListener("click",()=>{const i=document.getElementById("btnRecord");if(oe&&oe.state==="recording"){oe.stop(),i.classList.remove("recording"),i.innerHTML='<span class="dot red"></span>Record';return}rt=[];const e=C.captureStream(30);oe=new MediaRecorder(e,{mimeType:"video/webm;codecs=vp9"}),oe.ondataavailable=r=>{r.data.size>0&&rt.push(r.data)},oe.onstop=()=>{const r=new Blob(rt,{type:"video/webm"}),t=document.createElement("a");t.href=URL.createObjectURL(r),t.download=`vib3-recording-${Date.now()}.webm`,t.click(),URL.revokeObjectURL(t.href)},oe.start(),i.classList.add("recording"),i.innerHTML='<span class="dot red"></span>Stop'});document.getElementById("btnGIF").addEventListener("click",()=>{const i=document.getElementById("btnGIF");i.textContent="Capturing...",i.disabled=!0;let e=0;const r=60;function t(){if(e>=r){C.toBlob(a=>{const s=document.createElement("a");s.href=URL.createObjectURL(a),s.download=`vib3-gif-frame-${Date.now()}.png`,s.click(),URL.revokeObjectURL(s.href),i.textContent="GIF",i.disabled=!1},"image/png");return}e++,requestAnimationFrame(t)}requestAnimationFrame(t)});async function Ni(){const i=document.getElementById("runBenchmark"),e=document.getElementById("benchResults");i.disabled=!0,i.textContent="Running...",e.innerHTML="";const r=[{name:"Mesh Only",m:!0,s:!1,p:!1,i:!1,sh:!1,pt:!1},{name:"Splat Only",m:!1,s:!0,p:!1,i:!1,sh:!1,pt:!1},{name:"Mesh + Inscription",m:!0,s:!1,p:!1,i:!0,sh:!1,pt:!1},{name:"Full Hybrid (v2)",m:!0,s:!0,p:!0,i:!0,sh:!1,pt:!1},{name:"+ Shadows (v3)",m:!0,s:!0,p:!0,i:!0,sh:!0,pt:!1},{name:"+ Particles (v3)",m:!0,s:!0,p:!0,i:!0,sh:!0,pt:!0},{name:"Full v3 Pipeline",m:!0,s:!0,p:!0,i:!0,sh:!0,pt:!0}],t=60,a=[];for(const n of r){x.meshLayer.enabled=n.m,x.splatLayer.enabled=n.s,x.proceduralLayer.enabled=n.p,x.inscriptionLayer.enabled=n.i,pe=n.sh,ne=n.pt;for(let d=0;d<5;d++){const m=performance.now()*.001;x.render(m,D.viewMatrix,D.projectionMatrix,{viewProjection:D.viewProjection})}o.finish();const c=performance.now();for(let d=0;d<t;d++){const m=performance.now()*.001;x.render(m,D.viewMatrix,D.projectionMatrix,{viewProjection:D.viewProjection})}o.finish();const h=performance.now()-c,f=h/t,u=1e3/f;a.push({name:n.name,avgMs:f,fps:u}),await new Promise(d=>setTimeout(d,10))}ct(hr);const s=Math.max(...a.map(n=>n.avgMs));let l='<div class="bench-row bench-header"><span>Configuration</span><span>ms/frame</span><span>FPS</span></div>';for(const n of a){const c=Math.round(n.avgMs/s*100),h=n.name.includes("v3");l+=`<div class="bench-row ${n.name==="Full v3 Pipeline"?"bench-total":""}"><span class="bench-label">${n.name}</span><span class="bench-value">${n.avgMs.toFixed(2)}</span><span class="bench-value">${Math.round(n.fps)}</span></div><div class="bench-bar" style="width:${c}%;${h?"background:rgba(167,139,250,0.5)":""}"></div>`}e.innerHTML=l,i.disabled=!1,i.textContent="Run Benchmark"}document.getElementById("runBenchmark").addEventListener("click",Ni);let it=0,ot=performance.now(),ht=!0,Wi=performance.now(),Yt=0;const zt=document.getElementById("fps"),Ht=document.getElementById("frameTime"),qt=document.getElementById("activeLayers");C.addEventListener("pointerdown",()=>{ht=!1});C.addEventListener("pointerup",()=>{setTimeout(()=>{ht=!0},3e3)});function ji(i){const e=new Float32Array(16),r=i[0],t=i[1],a=i[2],s=i[3],l=i[4],n=i[5],c=i[6],h=i[7],f=i[8],u=i[9],d=i[10],m=i[11],E=i[12],p=i[13],v=i[14],T=i[15],_=r*n-t*l,g=r*c-a*l,b=r*h-s*l,R=t*c-a*n,A=t*h-s*n,F=a*h-s*c,P=f*p-u*E,X=f*v-d*E,ee=f*T-m*E,te=u*v-d*p,Y=u*T-m*p,z=d*T-m*v;let y=_*z-g*Y+b*te+R*ee-A*X+F*P;return y?(y=1/y,e[0]=(n*z-c*Y+h*te)*y,e[1]=(a*Y-t*z-s*te)*y,e[2]=(p*F-v*A+T*R)*y,e[3]=(d*A-u*F-m*R)*y,e[4]=(c*ee-l*z-h*X)*y,e[5]=(r*z-a*ee+s*X)*y,e[6]=(v*b-E*F-T*g)*y,e[7]=(f*F-d*b+m*g)*y,e[8]=(l*Y-n*ee+h*P)*y,e[9]=(t*ee-r*Y-s*P)*y,e[10]=(E*A-p*b+T*_)*y,e[11]=(u*b-f*A-m*_)*y,e[12]=(n*X-l*te-c*P)*y,e[13]=(r*te-t*X+a*P)*y,e[14]=(p*g-E*R-v*_)*y,e[15]=(f*R-u*g+d*_)*y,e):null}function Er(){const i=performance.now(),e=(performance.now()-Wi)*.001,r=Math.min(e-Yt,.1);Yt=e;const t=o.canvas.width,a=o.canvas.height;if(ht&&!D.isDragging){const u=.002+.001*Math.sin(e*.2);D.azimuth+=u,nt&&(D.elevation=.35+.15*Math.sin(e*.15),D.distance=5+.5*Math.sin(e*.1))}const s={XY:e*.12,XZ:e*.08,YZ:e*.07,XW:e*.15+.3*Math.sin(e*.4),YW:e*.11+.2*Math.sin(e*.35),ZW:e*.09+.25*Math.sin(e*.5)};if(M.rot4dXY=s.XY,M.rot4dXZ=s.XZ,M.rot4dYZ=s.YZ,M.rot4dXW=s.XW,M.rot4dYW=s.YW,M.rot4dZW=s.ZW,nt&&($e+=r,$e>Ei&&($e=0,Ke=(Ke+1)%24,De=Ke),Math.abs(We-De)>.1&&(We=De),M.geometry=De),Ne.update(r),fe>0){const u=fe*(.5+.5*Math.sin(e*2.1)),d=fe*(.5+.5*Math.sin(e*3.7)),m=fe*(.5+.5*Math.sin(e*5.3)),E=fe*(.6+.4*Math.sin(e*1.3));Ne.setAudio(u,d,m,E),M.rot4dXW+=u*.5,M.rot4dYW+=d*.3,M.rot4dZW+=m*.4}if(ne&&S){S.colorStart[0]=.3+.3*Math.sin(e*.7),S.colorStart[1]=.5+.3*Math.sin(e*.9+1),S.colorStart[2]=.8+.2*Math.sin(e*1.1+2),S.colorEnd[0]=.8+.2*Math.sin(e*.5+3),S.colorEnd[1]=.2+.2*Math.sin(e*.6+4),S.colorEnd[2]=.7+.3*Math.sin(e*.8+5),S.update(Math.min(r,.05));const{buffer:u,count:d}=S.getSplatBuffer();Te&&d>0&&Te.updateSeeds(u,d);const m=document.getElementById("particleCount");m&&(m.textContent=S.getAliveCount())}else{const u=document.getElementById("particleCount");u&&(u.textContent="0")}Oi(t,a);const l=x.render(e,D.viewMatrix,D.projectionMatrix,{viewProjection:D.viewProjection}),n=be.gbuffer?be.gbuffer.normalTexture:null;if(pe&&w&&n&&(we(t,a),o.bindFramebuffer(o.READ_FRAMEBUFFER,null),o.bindFramebuffer(o.DRAW_FRAMEBUFFER,N.framebuffer),o.blitFramebuffer(0,0,t,a,0,0,t,a,o.COLOR_BUFFER_BIT,o.NEAREST),o.bindFramebuffer(o.FRAMEBUFFER,null),o.viewport(0,0,t,a),o.disable(o.DEPTH_TEST),o.useProgram(w),o.bindVertexArray(fr),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,N.texture),o.uniform1i(o.getUniformLocation(w,"u_sceneColor"),0),n&&(o.activeTexture(o.TEXTURE1),o.bindTexture(o.TEXTURE_2D,n),o.uniform1i(o.getUniformLocation(w,"u_normalDepth"),1)),o.uniform1f(o.getUniformLocation(w,"u_shadowIntensity"),Jt),o.uniform1f(o.getUniformLocation(w,"u_shadowSoftness"),er),o.uniform3f(o.getUniformLocation(w,"u_lightDir"),.5,.8,.3),o.drawArrays(o.TRIANGLES,0,3)),Re&&U&&n&&(we(t,a),o.bindFramebuffer(o.READ_FRAMEBUFFER,null),o.bindFramebuffer(o.DRAW_FRAMEBUFFER,N.framebuffer),o.blitFramebuffer(0,0,t,a,0,0,t,a,o.COLOR_BUFFER_BIT,o.NEAREST),o.bindFramebuffer(o.FRAMEBUFFER,null),o.viewport(0,0,t,a),o.disable(o.DEPTH_TEST),o.enable(o.BLEND),o.blendFunc(o.ONE,o.ONE),o.useProgram(U),o.bindVertexArray(dr),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,N.texture),o.uniform1i(o.getUniformLocation(U,"u_inscriptionTex"),0),o.activeTexture(o.TEXTURE1),o.bindTexture(o.TEXTURE_2D,n),o.uniform1i(o.getUniformLocation(U,"u_normalDepth"),1),o.uniform3f(o.getUniformLocation(U,"u_lightDir"),.5,.8,.3),o.uniform1f(o.getUniformLocation(U,"u_specularStrength"),ir),o.uniform1f(o.getUniformLocation(U,"u_fresnelPower"),or),o.uniform1f(o.getUniformLocation(U,"u_time"),e),o.drawArrays(o.TRIANGLES,0,3),o.disable(o.BLEND)),ne&&Te&&S&&S.getAliveCount()>0&&(Pi(t,a),o.bindFramebuffer(o.FRAMEBUFFER,ae.framebuffer),o.viewport(0,0,t,a),Te.render(D.viewProjection,e),o.bindFramebuffer(o.FRAMEBUFFER,null),o.viewport(0,0,t,a),o.enable(o.BLEND),o.blendFunc(o.ONE,o.ONE),o.disable(o.DEPTH_TEST),Wt(ae.texture,1),o.disable(o.BLEND)),xe&&B){we(t,a),o.enable(o.BLEND),o.blendFunc(o.ONE,o.ONE),o.useProgram(B),o.bindVertexArray(mr),n&&(o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,n),o.uniform1i(o.getUniformLocation(B,"u_normalDepth"),0)),o.uniform1f(o.getUniformLocation(B,"u_time"),e),o.uniform1f(o.getUniformLocation(B,"u_density"),tr),o.uniform1f(o.getUniformLocation(B,"u_absorption"),rr),o.uniform1f(o.getUniformLocation(B,"u_geometry"),M.geometry),o.uniform2f(o.getUniformLocation(B,"u_resolution"),t,a),o.drawArrays(o.TRIANGLES,0,3),o.disable(o.BLEND);const u=document.getElementById("volSteps");u&&(u.textContent="48")}else{const u=document.getElementById("volSteps");u&&(u.textContent="0")}if(se&&Q&&n){const u=ji(D.projectionMatrix);if(u)try{const d=Q.render({colorTexture:N?N.texture:n,normalDepthTexture:n,projMatrix:D.projectionMatrix,invProjMatrix:u,viewMatrix:D.viewMatrix,width:t,height:a,time:e});d&&d.texture&&(o.bindFramebuffer(o.FRAMEBUFFER,null),o.viewport(0,0,t,a),o.enable(o.BLEND),o.blendFunc(o.ONE,o.ONE),o.disable(o.DEPTH_TEST),Wt(d.texture,ar),o.disable(o.BLEND))}catch{}}if(I){we(t,a),o.bindFramebuffer(o.READ_FRAMEBUFFER,null),o.bindFramebuffer(o.DRAW_FRAMEBUFFER,N.framebuffer),o.blitFramebuffer(0,0,t,a,0,0,t,a,o.COLOR_BUFFER_BIT,o.NEAREST);let u=N.texture;le&&(u=Ci(u,t,a)),o.bindFramebuffer(o.FRAMEBUFFER,null),o.viewport(0,0,t,a),o.disable(o.DEPTH_TEST),o.disable(o.BLEND),o.useProgram(I),o.bindVertexArray(pr),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,u),o.uniform1i(o.getUniformLocation(I,"u_texture"),0),o.uniform1f(o.getUniformLocation(I,"u_vignetteStrength"),lr),o.uniform1f(o.getUniformLocation(I,"u_chromaticStrength"),cr),o.uniform2f(o.getUniformLocation(I,"u_resolution"),t,a),o.uniform1f(o.getUniformLocation(I,"u_time"),e),o.drawArrays(o.TRIANGLES,0,3)}it++;const c=performance.now();c-ot>500&&(zt&&(zt.textContent=Math.round(it/((c-ot)/1e3))),Ht&&(Ht.textContent=(c-i).toFixed(1)+" ms"),it=0,ot=c);let h=l?l.layersComposited:0;h+=ne?1:0,h+=xe?1:0,h+=pe?1:0,h+=Re?1:0,h+=le?1:0,h+=se?1:0,qt&&(qt.textContent=h);const f=document.getElementById("postPasses");if(f){let u=0;le&&u++,u++,se&&u++,f.textContent=u}requestAnimationFrame(Er)}lt("torus");ct("showcase");Er();
