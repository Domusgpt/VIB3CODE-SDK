const Le=Object.freeze([1,0,0,0]),Ie=Object.freeze([1,1,1]),Dt=12;function oe(o){const t=new Float32Array(o.length*Dt);return o.forEach((r,e)=>{const i=e*Dt,s=r.position??[0,0,0],n=r.orientation??Le,a=r.color??Ie,l=r.scale??1,u=r.depth??0;t[i+0]=s[0]??0,t[i+1]=s[1]??0,t[i+2]=s[2]??0,t[i+3]=l,t[i+4]=n[0]??1,t[i+5]=n[1]??0,t[i+6]=n[2]??0,t[i+7]=n[3]??0,t[i+8]=a[0]??1,t[i+9]=a[1]??1,t[i+10]=a[2]??1,t[i+11]=u}),t}const Ce=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),Xe=`#version 300 es
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
`,Oe=`#version 300 es
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
`;class ae{constructor(t,{pointScale:r=14,blendMode:e="premultiplied",animate:i=!1,intensity:s=1,chromatic:n=0}={}){if(!t)throw new Error("GaussianSplatRenderer requires a WebGL2 context.");this.gl=t,this.pointScale=r,this.blendMode=e,this.animate=i,this.intensity=s,this.chromatic=n,this.program=null,this.vao=null,this.buffer=null,this.count=0,this.uniforms={},this._init()}_init(){const t=this.gl,r=t.createProgram(),e=this._compileShader(t.VERTEX_SHADER,Xe),i=this._compileShader(t.FRAGMENT_SHADER,Oe);if(t.attachShader(r,e),t.attachShader(r,i),t.linkProgram(r),!t.getProgramParameter(r,t.LINK_STATUS))throw new Error(t.getProgramInfoLog(r));this.program=r,this.vao=t.createVertexArray(),t.bindVertexArray(this.vao),this.buffer=t.createBuffer(),t.bindBuffer(t.ARRAY_BUFFER,this.buffer);const s=Dt*4,n=t.getAttribLocation(r,"a_position");t.enableVertexAttribArray(n),t.vertexAttribPointer(n,3,t.FLOAT,!1,s,0);const a=t.getAttribLocation(r,"a_scale");t.enableVertexAttribArray(a),t.vertexAttribPointer(a,1,t.FLOAT,!1,s,3*4);const l=t.getAttribLocation(r,"a_orientation");t.enableVertexAttribArray(l),t.vertexAttribPointer(l,4,t.FLOAT,!1,s,4*4);const u=t.getAttribLocation(r,"a_color");t.enableVertexAttribArray(u),t.vertexAttribPointer(u,3,t.FLOAT,!1,s,8*4);const f=t.getAttribLocation(r,"a_depth");t.enableVertexAttribArray(f),t.vertexAttribPointer(f,1,t.FLOAT,!1,s,11*4),t.bindVertexArray(null),this.uniforms.pointScale=t.getUniformLocation(r,"u_pointScale"),this.uniforms.viewProjection=t.getUniformLocation(r,"u_viewProjection"),this.uniforms.time=t.getUniformLocation(r,"u_time"),this.uniforms.animate=t.getUniformLocation(r,"u_animate"),this.uniforms.intensity=t.getUniformLocation(r,"u_intensity"),this.uniforms.chromatic=t.getUniformLocation(r,"u_chromatic")}_compileShader(t,r){const e=this.gl,i=e.createShader(t);if(e.shaderSource(i,r),e.compileShader(i),!e.getShaderParameter(i,e.COMPILE_STATUS))throw new Error(e.getShaderInfoLog(i));return i}updateSeeds(t,r){const e=this.gl;e.bindBuffer(e.ARRAY_BUFFER,this.buffer),e.bufferData(e.ARRAY_BUFFER,t,e.DYNAMIC_DRAW),this.count=r}render(t,r=0){const e=this.gl;this.count&&(e.viewport(0,0,e.canvas.width,e.canvas.height),e.clearColor(.012,.02,.05,1),e.clear(e.COLOR_BUFFER_BIT|e.DEPTH_BUFFER_BIT),e.enable(e.DEPTH_TEST),e.depthFunc(e.LEQUAL),e.depthMask(!1),e.enable(e.BLEND),this.blendMode==="additive"?e.blendFunc(e.ONE,e.ONE):e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA),e.useProgram(this.program),e.bindVertexArray(this.vao),e.uniform1f(this.uniforms.pointScale,this.pointScale),e.uniform1f(this.uniforms.time,r),e.uniform1f(this.uniforms.animate,this.animate?1:0),e.uniform1f(this.uniforms.intensity,this.intensity),e.uniform1f(this.uniforms.chromatic,this.chromatic),e.uniformMatrix4fv(this.uniforms.viewProjection,!1,t||Ce),e.drawArrays(e.POINTS,0,this.count),e.bindVertexArray(null),e.depthMask(!0),e.disable(e.BLEND))}}const Ne=`#version 300 es
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
`,ze=`#version 300 es
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
`;function We(o,t,r){const e=o.createFramebuffer();o.bindFramebuffer(o.FRAMEBUFFER,e);const i=o.createTexture();o.bindTexture(o.TEXTURE_2D,i),o.texImage2D(o.TEXTURE_2D,0,o.RGBA8,t,r,0,o.RGBA,o.UNSIGNED_BYTE,null),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE),o.framebufferTexture2D(o.FRAMEBUFFER,o.COLOR_ATTACHMENT0,o.TEXTURE_2D,i,0);const s=o.createTexture();o.bindTexture(o.TEXTURE_2D,s);let n=o.RGBA8,a=o.UNSIGNED_BYTE;(o.getExtension("EXT_color_buffer_half_float")||o.getExtension("EXT_color_buffer_float"))&&(n=o.RGBA16F,a=o.HALF_FLOAT),o.texImage2D(o.TEXTURE_2D,0,n,t,r,0,o.RGBA,a,null),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.NEAREST),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.NEAREST),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE),o.framebufferTexture2D(o.FRAMEBUFFER,o.COLOR_ATTACHMENT1,o.TEXTURE_2D,s,0);const l=o.createTexture();o.bindTexture(o.TEXTURE_2D,l),o.texImage2D(o.TEXTURE_2D,0,o.RGBA8,t,r,0,o.RGBA,o.UNSIGNED_BYTE,null),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.NEAREST),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.NEAREST),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE),o.framebufferTexture2D(o.FRAMEBUFFER,o.COLOR_ATTACHMENT2,o.TEXTURE_2D,l,0);const u=o.createRenderbuffer();return o.bindRenderbuffer(o.RENDERBUFFER,u),o.renderbufferStorage(o.RENDERBUFFER,o.DEPTH_COMPONENT24,t,r),o.framebufferRenderbuffer(o.FRAMEBUFFER,o.DEPTH_ATTACHMENT,o.RENDERBUFFER,u),o.drawBuffers([o.COLOR_ATTACHMENT0,o.COLOR_ATTACHMENT1,o.COLOR_ATTACHMENT2]),o.bindFramebuffer(o.FRAMEBUFFER,null),{framebuffer:e,colorTexture:i,normalTexture:s,objectIDTexture:l,depthRenderbuffer:u,width:t,height:r}}function jt(o,t){o.deleteFramebuffer(t.framebuffer),o.deleteTexture(t.colorTexture),o.deleteTexture(t.normalTexture),o.deleteTexture(t.objectIDTexture),o.deleteRenderbuffer(t.depthRenderbuffer)}class je{constructor(t,{lightDir:r=[.4,.8,.3],lightColor:e=[1,.98,.95],ambientColor:i=[.12,.12,.18],specularPower:s=32}={}){this.gl=t,this.lightDir=r,this.lightColor=e,this.ambientColor=i,this.specularPower=s,this.opacity=1,this.objectID=0,this.morphWeight=0,this._hasMorphTarget=!1,this._program=null,this._vao=null,this._posBuf=null,this._nrmBuf=null,this._uvBuf=null,this._colBuf=null,this._morphPosBuf=null,this._morphNrmBuf=null,this._idxBuf=null,this._indexCount=0,this._vertexCount=0,this._indexType=0,this._diffuseTexture=null,this._hasTexture=!1,this._gbuffer=null,this._gbufferWidth=0,this._gbufferHeight=0,this._uniforms={},this._init()}_init(){const t=this.gl;this._program=this._createProgram(Ne,ze);const r=u=>t.getUniformLocation(this._program,u);this._uniforms={modelView:r("u_modelView"),projection:r("u_projection"),normalMatrix:r("u_normalMatrix"),rotation4D:r("u_rotation4D"),projDistance:r("u_projDistance"),use4D:r("u_use4D"),morphWeight:r("u_morphWeight"),hasMorphTarget:r("u_hasMorphTarget"),diffuseMap:r("u_diffuseMap"),hasTexture:r("u_hasTexture"),lightDir:r("u_lightDir"),lightColor:r("u_lightColor"),ambientColor:r("u_ambientColor"),specularPower:r("u_specularPower"),opacity:r("u_opacity"),objectID:r("u_objectID")},this._vao=t.createVertexArray(),t.bindVertexArray(this._vao),this._posBuf=t.createBuffer();const e=t.getAttribLocation(this._program,"a_position");t.bindBuffer(t.ARRAY_BUFFER,this._posBuf),t.enableVertexAttribArray(e),t.vertexAttribPointer(e,3,t.FLOAT,!1,0,0),this._nrmBuf=t.createBuffer();const i=t.getAttribLocation(this._program,"a_normal");t.bindBuffer(t.ARRAY_BUFFER,this._nrmBuf),t.enableVertexAttribArray(i),t.vertexAttribPointer(i,3,t.FLOAT,!1,0,0),this._uvBuf=t.createBuffer();const s=t.getAttribLocation(this._program,"a_uv");t.bindBuffer(t.ARRAY_BUFFER,this._uvBuf),t.enableVertexAttribArray(s),t.vertexAttribPointer(s,2,t.FLOAT,!1,0,0),this._colBuf=t.createBuffer();const n=t.getAttribLocation(this._program,"a_color");t.bindBuffer(t.ARRAY_BUFFER,this._colBuf),t.enableVertexAttribArray(n),t.vertexAttribPointer(n,4,t.FLOAT,!1,0,0),this._morphPosBuf=t.createBuffer();const a=t.getAttribLocation(this._program,"a_morphPosition");a>=0&&(t.bindBuffer(t.ARRAY_BUFFER,this._morphPosBuf),t.enableVertexAttribArray(a),t.vertexAttribPointer(a,3,t.FLOAT,!1,0,0)),this._morphNrmBuf=t.createBuffer();const l=t.getAttribLocation(this._program,"a_morphNormal");l>=0&&(t.bindBuffer(t.ARRAY_BUFFER,this._morphNrmBuf),t.enableVertexAttribArray(l),t.vertexAttribPointer(l,3,t.FLOAT,!1,0,0)),this._idxBuf=t.createBuffer(),t.bindVertexArray(null)}uploadGeometry({positions:t,normals:r,uvs:e,colors:i,indices:s}){const n=this.gl,a=t.length/3;if(this._vertexCount=a,n.bindBuffer(n.ARRAY_BUFFER,this._posBuf),n.bufferData(n.ARRAY_BUFFER,t,n.DYNAMIC_DRAW),r)n.bindBuffer(n.ARRAY_BUFFER,this._nrmBuf),n.bufferData(n.ARRAY_BUFFER,r,n.DYNAMIC_DRAW);else{const l=new Float32Array(a*3);for(let u=0;u<a;u++)l[u*3+1]=1;n.bindBuffer(n.ARRAY_BUFFER,this._nrmBuf),n.bufferData(n.ARRAY_BUFFER,l,n.DYNAMIC_DRAW)}if(e?(n.bindBuffer(n.ARRAY_BUFFER,this._uvBuf),n.bufferData(n.ARRAY_BUFFER,e,n.DYNAMIC_DRAW)):(n.bindBuffer(n.ARRAY_BUFFER,this._uvBuf),n.bufferData(n.ARRAY_BUFFER,new Float32Array(a*2),n.DYNAMIC_DRAW)),i)n.bindBuffer(n.ARRAY_BUFFER,this._colBuf),n.bufferData(n.ARRAY_BUFFER,i,n.DYNAMIC_DRAW);else{const l=new Float32Array(a*4);for(let u=0;u<a;u++)l[u*4]=1,l[u*4+1]=1,l[u*4+2]=1,l[u*4+3]=1;n.bindBuffer(n.ARRAY_BUFFER,this._colBuf),n.bufferData(n.ARRAY_BUFFER,l,n.DYNAMIC_DRAW)}n.bindBuffer(n.ARRAY_BUFFER,this._morphPosBuf),n.bufferData(n.ARRAY_BUFFER,t,n.DYNAMIC_DRAW),n.bindBuffer(n.ARRAY_BUFFER,this._morphNrmBuf),n.bufferData(n.ARRAY_BUFFER,r||new Float32Array(a*3),n.DYNAMIC_DRAW),s?(n.bindBuffer(n.ELEMENT_ARRAY_BUFFER,this._idxBuf),n.bufferData(n.ELEMENT_ARRAY_BUFFER,s,n.STATIC_DRAW),this._indexCount=s.length,this._indexType=s instanceof Uint32Array?n.UNSIGNED_INT:n.UNSIGNED_SHORT):this._indexCount=0}uploadMorphTarget(t,r){const e=this.gl;e.bindBuffer(e.ARRAY_BUFFER,this._morphPosBuf),e.bufferData(e.ARRAY_BUFFER,t,e.DYNAMIC_DRAW),r&&(e.bindBuffer(e.ARRAY_BUFFER,this._morphNrmBuf),e.bufferData(e.ARRAY_BUFFER,r,e.DYNAMIC_DRAW)),this._hasMorphTarget=!0}uploadTexture(t){const r=this.gl;this._diffuseTexture||(this._diffuseTexture=r.createTexture()),r.bindTexture(r.TEXTURE_2D,this._diffuseTexture),t instanceof ImageData?r.texImage2D(r.TEXTURE_2D,0,r.RGBA,t.width,t.height,0,r.RGBA,r.UNSIGNED_BYTE,t.data):r.texImage2D(r.TEXTURE_2D,0,r.RGBA,r.RGBA,r.UNSIGNED_BYTE,t),r.generateMipmap(r.TEXTURE_2D),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR_MIPMAP_LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.REPEAT),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.REPEAT),this._hasTexture=!0}_ensureGBuffer(t,r){this._gbuffer&&this._gbufferWidth===t&&this._gbufferHeight===r||(this._gbuffer&&jt(this.gl,this._gbuffer),this._gbuffer=We(this.gl,t,r),this._gbufferWidth=t,this._gbufferHeight=r)}get gbuffer(){return this._gbuffer}render(t,r,{rotation4D:e=null,projDistance:i=2,width:s=0,height:n=0,clearBuffer:a=!0}={}){const l=this.gl,u=s||l.canvas.width,f=n||l.canvas.height;if(this._ensureGBuffer(u,f),l.bindFramebuffer(l.FRAMEBUFFER,this._gbuffer.framebuffer),l.viewport(0,0,u,f),a&&(l.clearColor(0,0,0,0),l.clear(l.COLOR_BUFFER_BIT|l.DEPTH_BUFFER_BIT)),this._vertexCount===0&&this._indexCount===0)return l.bindFramebuffer(l.FRAMEBUFFER,null),this._gbuffer;l.enable(l.DEPTH_TEST),l.depthFunc(l.LEQUAL),l.depthMask(!0),l.enable(l.CULL_FACE),l.cullFace(l.BACK),l.disable(l.BLEND),l.useProgram(this._program),l.bindVertexArray(this._vao),this._indexCount>0&&l.bindBuffer(l.ELEMENT_ARRAY_BUFFER,this._idxBuf);const h=this._uniforms,d=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);return l.uniformMatrix4fv(h.modelView,!1,t||d),l.uniformMatrix4fv(h.projection,!1,r||d),l.uniformMatrix4fv(h.normalMatrix,!1,t||d),l.uniformMatrix4fv(h.rotation4D,!1,e||d),l.uniform1f(h.projDistance,i),l.uniform1f(h.use4D,e?1:0),l.uniform1f(h.morphWeight,this.morphWeight),l.uniform1f(h.hasMorphTarget,this._hasMorphTarget?1:0),l.uniform3fv(h.lightDir,this.lightDir),l.uniform3fv(h.lightColor,this.lightColor),l.uniform3fv(h.ambientColor,this.ambientColor),l.uniform1f(h.specularPower,this.specularPower),l.uniform1f(h.opacity,this.opacity),l.uniform1f(h.objectID,this.objectID),this._hasTexture&&this._diffuseTexture?(l.activeTexture(l.TEXTURE0),l.bindTexture(l.TEXTURE_2D,this._diffuseTexture),l.uniform1i(h.diffuseMap,0),l.uniform1f(h.hasTexture,1)):l.uniform1f(h.hasTexture,0),this._indexCount>0?l.drawElements(l.TRIANGLES,this._indexCount,this._indexType,0):l.drawArrays(l.TRIANGLES,0,this._vertexCount),l.bindVertexArray(null),l.bindFramebuffer(l.FRAMEBUFFER,null),l.disable(l.CULL_FACE),this._gbuffer}_createProgram(t,r){const e=this.gl,i=e.createProgram(),s=this._compile(e.VERTEX_SHADER,t),n=this._compile(e.FRAGMENT_SHADER,r);if(e.attachShader(i,s),e.attachShader(i,n),e.linkProgram(i),!e.getProgramParameter(i,e.LINK_STATUS))throw new Error("MeshRenderer link error: "+e.getProgramInfoLog(i));return i}_compile(t,r){const e=this.gl,i=e.createShader(t);if(e.shaderSource(i,r),e.compileShader(i),!e.getShaderParameter(i,e.COMPILE_STATUS))throw new Error("MeshRenderer compile error: "+e.getShaderInfoLog(i));return i}dispose(){const t=this.gl;t.deleteProgram(this._program),t.deleteVertexArray(this._vao),t.deleteBuffer(this._posBuf),t.deleteBuffer(this._nrmBuf),t.deleteBuffer(this._uvBuf),t.deleteBuffer(this._colBuf),t.deleteBuffer(this._morphPosBuf),t.deleteBuffer(this._morphNrmBuf),t.deleteBuffer(this._idxBuf),this._diffuseTexture&&t.deleteTexture(this._diffuseTexture),this._gbuffer&&jt(t,this._gbuffer)}}const Gt=`#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
    float x = float((gl_VertexID & 1) << 2) - 1.0;
    float y = float((gl_VertexID & 2) << 1) - 1.0;
    v_uv = vec2(x, y) * 0.5 + 0.5;
    gl_Position = vec4(x, y, 0.0, 1.0);
}
`,Ge=`#version 300 es
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
`,Ye=`#version 300 es
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
`;function Yt(o,t,r){const e=o.createTexture();o.bindTexture(o.TEXTURE_2D,e),o.texImage2D(o.TEXTURE_2D,0,o.RGBA8,t,r,0,o.RGBA,o.UNSIGNED_BYTE,null),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE);const i=o.createFramebuffer();return o.bindFramebuffer(o.FRAMEBUFFER,i),o.framebufferTexture2D(o.FRAMEBUFFER,o.COLOR_ATTACHMENT0,o.TEXTURE_2D,e,0),o.bindFramebuffer(o.FRAMEBUFFER,null),{framebuffer:i,texture:e,width:t,height:r}}function tt(o,t){o.deleteFramebuffer(t.framebuffer),o.deleteTexture(t.texture)}const Vt=[[.2,.6,1],[.8,.3,1],[1,.5,.2],[.3,1,.6],[1,.2,.5],[.4,.9,.9],[.9,.8,.2],[.5,.3,1],[.2,1,.4],[1,.4,0],[.6,.2,.9],[0,.8,.8],[1,.6,.6],[.3,.5,1],[.8,1,.3],[.9,.3,.6]];function kt(o,t){const r=t>1?o/(t-1):0;return{geometry:o*3%24,thickness:.3+r*.5,opacity:.9-r*.5,color:Vt[o%Vt.length],patternScale:3+o*.5,patternSpeed:.3+o*.05,rotOffset:o*.4}}class Ve{constructor(t,{layerCount:r=4,depthSensitivity:e=8,normalSensitivity:i=2,globalThickness:s=.6,layers:n=null}={}){if(this.gl=t,this.layerCount=Math.min(16,Math.max(1,r)),this.depthSensitivity=e,this.normalSensitivity=i,this.globalThickness=s,this.rot4dXY=0,this.rot4dXZ=0,this.rot4dYZ=0,this.rot4dXW=0,this.rot4dYW=0,this.rot4dZW=0,this.bass=0,this.mid=0,this.high=0,this.energy=0,this.layers=n||[],this.layers.length===0)for(let a=0;a<this.layerCount;a++)this.layers.push(kt(a,this.layerCount));this._edgeProgram=null,this._inscriptionProgram=null,this._quadVao=null,this._edgeFBO=null,this._compositeFBO=null,this._width=0,this._height=0,this._blackTexture=null,this._edgeUniforms={},this._inscUniforms={},this._init()}_init(){const t=this.gl;this._edgeProgram=this._createProgram(Gt,Ge),this._inscriptionProgram=this._createProgram(Gt,Ye),this._quadVao=t.createVertexArray(),this._blackTexture=t.createTexture(),t.bindTexture(t.TEXTURE_2D,this._blackTexture),t.texImage2D(t.TEXTURE_2D,0,t.RGBA,1,1,0,t.RGBA,t.UNSIGNED_BYTE,new Uint8Array([0,0,0,0])),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),this._cacheEdgeUniforms(),this._cacheInscriptionUniforms()}_cacheEdgeUniforms(){const t=this.gl,r=this._edgeProgram;this._edgeUniforms={normalDepth:t.getUniformLocation(r,"u_normalDepth"),objectID:t.getUniformLocation(r,"u_objectID"),texelSize:t.getUniformLocation(r,"u_texelSize"),depthSensitivity:t.getUniformLocation(r,"u_depthSensitivity"),normalSensitivity:t.getUniformLocation(r,"u_normalSensitivity"),hasObjectID:t.getUniformLocation(r,"u_hasObjectID")}}_cacheInscriptionUniforms(){const t=this.gl,r=this._inscriptionProgram,e=i=>t.getUniformLocation(r,i);this._inscUniforms={edgeMap:e("u_edgeMap"),normalDepth:e("u_normalDepth"),time:e("u_time"),layerCount:e("u_layerCount"),resolution:e("u_resolution"),dpr:e("u_dpr"),globalThickness:e("u_globalThickness"),rot4dXY:e("u_rot4dXY"),rot4dXZ:e("u_rot4dXZ"),rot4dYZ:e("u_rot4dYZ"),rot4dXW:e("u_rot4dXW"),rot4dYW:e("u_rot4dYW"),rot4dZW:e("u_rot4dZW"),bass:e("u_bass"),mid:e("u_mid"),high:e("u_high"),energy:e("u_energy"),geometries:[],thicknesses:[],opacities:[],colors:[],patternScales:[],patternSpeeds:[],rotOffsets:[]};for(let i=0;i<16;i++)this._inscUniforms.geometries[i]=e(`u_layerGeometries[${i}]`),this._inscUniforms.thicknesses[i]=e(`u_layerThicknesses[${i}]`),this._inscUniforms.opacities[i]=e(`u_layerOpacities[${i}]`),this._inscUniforms.colors[i]=e(`u_layerColors[${i}]`),this._inscUniforms.patternScales[i]=e(`u_layerPatternScales[${i}]`),this._inscUniforms.patternSpeeds[i]=e(`u_layerPatternSpeeds[${i}]`),this._inscUniforms.rotOffsets[i]=e(`u_layerRotOffsets[${i}]`)}_ensureFBOs(t,r){if(this._width===t&&this._height===r)return;const e=this.gl;this._edgeFBO&&tt(e,this._edgeFBO),this._compositeFBO&&tt(e,this._compositeFBO),this._edgeFBO=Yt(e,t,r),this._compositeFBO=Yt(e,t,r),this._width=t,this._height=r}setLayerCount(t){for(t=Math.min(16,Math.max(1,t));this.layers.length<t;)this.layers.push(kt(this.layers.length,t));this.layerCount=t}setLayerConfig(t,r){t>=0&&t<this.layers.length&&Object.assign(this.layers[t],r)}setAudio(t,r,e,i){this.bass=t||0,this.mid=r||0,this.high=e||0,this.energy=i||0}render(t,r,{width:e=0,height:i=0,objectIDTexture:s=null,dpr:n=1}={}){const a=this.gl,l=e||a.canvas.width,u=i||a.canvas.height;this._ensureFBOs(l,u),a.bindFramebuffer(a.FRAMEBUFFER,this._edgeFBO.framebuffer),a.viewport(0,0,l,u),a.disable(a.DEPTH_TEST),a.disable(a.BLEND),a.useProgram(this._edgeProgram),a.bindVertexArray(this._quadVao);const f=this._edgeUniforms;a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,t),a.uniform1i(f.normalDepth,0),a.activeTexture(a.TEXTURE1),a.bindTexture(a.TEXTURE_2D,s||this._blackTexture),a.uniform1i(f.objectID,1),a.uniform2f(f.texelSize,1/l,1/u),a.uniform1f(f.depthSensitivity,this.depthSensitivity),a.uniform1f(f.normalSensitivity,this.normalSensitivity),a.uniform1f(f.hasObjectID,s?1:0),a.drawArrays(a.TRIANGLES,0,3),a.bindFramebuffer(a.FRAMEBUFFER,this._compositeFBO.framebuffer),a.viewport(0,0,l,u),a.clearColor(0,0,0,0),a.clear(a.COLOR_BUFFER_BIT),a.disable(a.BLEND),a.useProgram(this._inscriptionProgram),a.bindVertexArray(this._quadVao);const h=this._inscUniforms;a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,this._edgeFBO.texture),a.uniform1i(h.edgeMap,0),a.activeTexture(a.TEXTURE1),a.bindTexture(a.TEXTURE_2D,t),a.uniform1i(h.normalDepth,1),a.uniform1f(h.time,r),a.uniform1i(h.layerCount,this.layerCount),a.uniform2f(h.resolution,l,u),a.uniform1f(h.dpr,n),a.uniform1f(h.globalThickness,this.globalThickness),a.uniform1f(h.rot4dXY,this.rot4dXY),a.uniform1f(h.rot4dXZ,this.rot4dXZ),a.uniform1f(h.rot4dYZ,this.rot4dYZ),a.uniform1f(h.rot4dXW,this.rot4dXW),a.uniform1f(h.rot4dYW,this.rot4dYW),a.uniform1f(h.rot4dZW,this.rot4dZW),a.uniform1f(h.bass,this.bass),a.uniform1f(h.mid,this.mid),a.uniform1f(h.high,this.high),a.uniform1f(h.energy,this.energy);for(let d=0;d<this.layerCount;d++){const _=this.layers[d];a.uniform1f(h.geometries[d],_.geometry),a.uniform1f(h.thicknesses[d],_.thickness),a.uniform1f(h.opacities[d],_.opacity),a.uniform3fv(h.colors[d],_.color),a.uniform1f(h.patternScales[d],_.patternScale),a.uniform1f(h.patternSpeeds[d],_.patternSpeed),a.uniform1f(h.rotOffsets[d],_.rotOffset)}return a.drawArrays(a.TRIANGLES,0,3),a.bindFramebuffer(a.FRAMEBUFFER,null),this._compositeFBO}get edgeTexture(){return this._edgeFBO?this._edgeFBO.texture:null}get compositeTexture(){return this._compositeFBO?this._compositeFBO.texture:null}_createProgram(t,r){const e=this.gl,i=e.createProgram(),s=this._compile(e.VERTEX_SHADER,t),n=this._compile(e.FRAGMENT_SHADER,r);if(e.attachShader(i,s),e.attachShader(i,n),e.linkProgram(i),!e.getProgramParameter(i,e.LINK_STATUS))throw new Error("EdgeInscriptionLayer link error: "+e.getProgramInfoLog(i));return i}_compile(t,r){const e=this.gl,i=e.createShader(t);if(e.shaderSource(i,r),e.compileShader(i),!e.getShaderParameter(i,e.COMPILE_STATUS))throw new Error("EdgeInscriptionLayer compile error: "+e.getShaderInfoLog(i));return i}dispose(){const t=this.gl;t.deleteProgram(this._edgeProgram),t.deleteProgram(this._inscriptionProgram),t.deleteVertexArray(this._quadVao),t.deleteTexture(this._blackTexture),this._edgeFBO&&tt(t,this._edgeFBO),this._compositeFBO&&tt(t,this._compositeFBO)}}const Ht=`#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
    float x = float((gl_VertexID & 1) << 2) - 1.0;
    float y = float((gl_VertexID & 2) << 1) - 1.0;
    v_uv = vec2(x, y) * 0.5 + 0.5;
    gl_Position = vec4(x, y, 0.0, 1.0);
}
`,ke=`#version 300 es
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
`,He=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 outColor;
void main() {
    outColor = texture(u_texture, v_uv);
}
`;function qt(o,t,r){const e=o.createTexture();o.bindTexture(o.TEXTURE_2D,e),o.texImage2D(o.TEXTURE_2D,0,o.RGBA8,t,r,0,o.RGBA,o.UNSIGNED_BYTE,null),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE);const i=o.createRenderbuffer();o.bindRenderbuffer(o.RENDERBUFFER,i),o.renderbufferStorage(o.RENDERBUFFER,o.DEPTH_COMPONENT24,t,r);const s=o.createFramebuffer();return o.bindFramebuffer(o.FRAMEBUFFER,s),o.framebufferTexture2D(o.FRAMEBUFFER,o.COLOR_ATTACHMENT0,o.TEXTURE_2D,e,0),o.framebufferRenderbuffer(o.FRAMEBUFFER,o.DEPTH_ATTACHMENT,o.RENDERBUFFER,i),o.bindFramebuffer(o.FRAMEBUFFER,null),{framebuffer:s,texture:e,depthRb:i,width:t,height:r}}function et(o,t){o.deleteFramebuffer(t.framebuffer),o.deleteTexture(t.texture),o.deleteRenderbuffer(t.depthRb)}const ut=Object.freeze({ALPHA:0,ADDITIVE:1,MULTIPLY:2,SCREEN:3});function rt(o={}){return{enabled:!0,opacity:1,blendMode:ut.ALPHA,...o}}class qe{constructor(t,{exposure:r=1.2,gamma:e=2.2}={}){this.gl=t,this.exposure=r,this.gamma=e,this._meshRenderer=null,this._sceneRenderer=null,this._splatRenderer=null,this._proceduralRenderer=null,this._edgeInscription=null,this._inscriptionChannel=null,this._dpr=1,this.meshLayer=rt(),this.splatLayer=rt({blendMode:ut.ADDITIVE,opacity:.9}),this.proceduralLayer=rt({blendMode:ut.SCREEN,opacity:.5}),this.inscriptionLayer=rt({blendMode:ut.ADDITIVE,opacity:.8}),this._compositeProgram=null,this._blitProgram=null,this._quadVao=null,this._splatFBO=null,this._proceduralFBO=null,this._width=0,this._height=0,this._blackTexture=null,this._init()}_init(){const t=this.gl;this._compositeProgram=this._createProgram(Ht,ke),this._blitProgram=this._createProgram(Ht,He),this._quadVao=t.createVertexArray(),this._blackTexture=t.createTexture(),t.bindTexture(t.TEXTURE_2D,this._blackTexture),t.texImage2D(t.TEXTURE_2D,0,t.RGBA,1,1,0,t.RGBA,t.UNSIGNED_BYTE,new Uint8Array([0,0,0,0])),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST)}_ensureFBOs(t,r){if(this._width===t&&this._height===r)return;const e=this.gl;this._splatFBO&&et(e,this._splatFBO),this._proceduralFBO&&et(e,this._proceduralFBO),this._splatFBO=qt(e,t,r),this._proceduralFBO=qt(e,t,r),this._width=t,this._height=r}setMeshRenderer(t){this._meshRenderer=t}setSceneRenderer(t){this._sceneRenderer=t}setSplatRenderer(t){this._splatRenderer=t}setProceduralRenderer(t){this._proceduralRenderer=t}setEdgeInscription(t){this._edgeInscription=t}setInscriptionChannel(t){this._inscriptionChannel=t}setDPR(t){this._dpr=t}render(t,r,e,{viewProjection:i=null,rotation4D:s=null,projDistance:n=2}={}){const a=this.gl,l=a.canvas.width,u=a.canvas.height;this._ensureFBOs(l,u);const f={meshRendered:!1,splatRendered:!1,proceduralRendered:!1,inscriptionRendered:!1,layersComposited:0};let h=this._blackTexture,d=this._blackTexture,_=this._blackTexture,g=this._blackTexture,p=null,v=null,T=null;if(this._sceneRenderer&&this.meshLayer.enabled){const E=this._sceneRenderer.render(r,e,{rotation4D:s,projDistance:n,width:l,height:u});T=E.gbuffer,T&&(h=T.colorTexture,p=T.normalTexture,v=T.objectIDTexture||null,f.meshRendered=!0,f.objectCount=E.objectCount)}else if(this._meshRenderer&&this.meshLayer.enabled){const E=this._meshRenderer.render(r,e,{rotation4D:s,projDistance:n,width:l,height:u});T=E,h=E.colorTexture,p=E.normalTexture,v=E.objectIDTexture||null,f.meshRendered=!0}if(this._splatRenderer&&this.splatLayer.enabled){a.bindFramebuffer(a.FRAMEBUFFER,this._splatFBO.framebuffer),a.viewport(0,0,l,u),a.clearColor(0,0,0,0),a.clear(a.COLOR_BUFFER_BIT|a.DEPTH_BUFFER_BIT),f.meshRendered&&T&&(a.bindFramebuffer(a.READ_FRAMEBUFFER,T.framebuffer),a.bindFramebuffer(a.DRAW_FRAMEBUFFER,this._splatFBO.framebuffer),a.blitFramebuffer(0,0,l,u,0,0,l,u,a.DEPTH_BUFFER_BIT,a.NEAREST),a.bindFramebuffer(a.FRAMEBUFFER,this._splatFBO.framebuffer));const E=i||new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),b=this._splatFBO.framebuffer;a.bindFramebuffer(a.FRAMEBUFFER,b),a.viewport(0,0,l,u),this._splatRenderer.render&&(this._splatRenderer.render(E,t),a.bindFramebuffer(a.FRAMEBUFFER,this._splatFBO.framebuffer),this._splatRenderer._drawSplats&&(a.viewport(0,0,l,u),a.clearColor(0,0,0,0),a.clear(a.COLOR_BUFFER_BIT),this._splatRenderer._drawSplats(E,t))),d=this._splatFBO.texture,f.splatRendered=!0}if(this._proceduralRenderer&&this.proceduralLayer.enabled&&(a.bindFramebuffer(a.FRAMEBUFFER,this._proceduralFBO.framebuffer),a.viewport(0,0,l,u),a.clearColor(0,0,0,0),a.clear(a.COLOR_BUFFER_BIT),this._proceduralRenderer(this._proceduralFBO,t),_=this._proceduralFBO.texture,f.proceduralRendered=!0),this._edgeInscription&&this.inscriptionLayer.enabled&&p){if(this._inscriptionChannel){const b=this._inscriptionChannel.registeredObjects,y=b.length>0?b[0]:0;this._inscriptionChannel.applyToLayer(this._edgeInscription,y)}g=this._edgeInscription.render(p,t,{width:l,height:u,objectIDTexture:v,dpr:this._dpr}).texture,f.inscriptionRendered=!0}a.bindFramebuffer(a.FRAMEBUFFER,null),a.viewport(0,0,l,u),a.disable(a.DEPTH_TEST),a.disable(a.BLEND),a.useProgram(this._compositeProgram),a.bindVertexArray(this._quadVao);const m=this._compositeProgram;return a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,h),a.uniform1i(a.getUniformLocation(m,"u_meshLayer"),0),a.activeTexture(a.TEXTURE1),a.bindTexture(a.TEXTURE_2D,d),a.uniform1i(a.getUniformLocation(m,"u_splatLayer"),1),a.activeTexture(a.TEXTURE2),a.bindTexture(a.TEXTURE_2D,_),a.uniform1i(a.getUniformLocation(m,"u_proceduralLayer"),2),a.activeTexture(a.TEXTURE3),a.bindTexture(a.TEXTURE_2D,g),a.uniform1i(a.getUniformLocation(m,"u_inscriptionLayer"),3),a.uniform1f(a.getUniformLocation(m,"u_meshOpacity"),this.meshLayer.opacity),a.uniform1f(a.getUniformLocation(m,"u_splatOpacity"),this.splatLayer.opacity),a.uniform1f(a.getUniformLocation(m,"u_proceduralOpacity"),this.proceduralLayer.opacity),a.uniform1f(a.getUniformLocation(m,"u_inscriptionOpacity"),this.inscriptionLayer.opacity),a.uniform1f(a.getUniformLocation(m,"u_meshEnabled"),this.meshLayer.enabled&&f.meshRendered?1:0),a.uniform1f(a.getUniformLocation(m,"u_splatEnabled"),this.splatLayer.enabled&&f.splatRendered?1:0),a.uniform1f(a.getUniformLocation(m,"u_proceduralEnabled"),this.proceduralLayer.enabled&&f.proceduralRendered?1:0),a.uniform1f(a.getUniformLocation(m,"u_inscriptionEnabled"),this.inscriptionLayer.enabled&&f.inscriptionRendered?1:0),a.uniform1f(a.getUniformLocation(m,"u_meshBlend"),this.meshLayer.blendMode),a.uniform1f(a.getUniformLocation(m,"u_splatBlend"),this.splatLayer.blendMode),a.uniform1f(a.getUniformLocation(m,"u_proceduralBlend"),this.proceduralLayer.blendMode),a.uniform1f(a.getUniformLocation(m,"u_inscriptionBlend"),this.inscriptionLayer.blendMode),a.uniform1f(a.getUniformLocation(m,"u_exposure"),this.exposure),a.uniform1f(a.getUniformLocation(m,"u_gamma"),this.gamma),a.drawArrays(a.TRIANGLES,0,3),f.layersComposited=(f.meshRendered?1:0)+(f.splatRendered?1:0)+(f.proceduralRendered?1:0)+(f.inscriptionRendered?1:0),f}renderSplatOnly(t,r){this._splatRenderer&&this._splatRenderer.render(t,r)}_createProgram(t,r){const e=this.gl,i=e.createProgram(),s=this._compile(e.VERTEX_SHADER,t),n=this._compile(e.FRAGMENT_SHADER,r);if(e.attachShader(i,s),e.attachShader(i,n),e.linkProgram(i),!e.getProgramParameter(i,e.LINK_STATUS))throw new Error("HybridRenderPipeline link error: "+e.getProgramInfoLog(i));return i}_compile(t,r){const e=this.gl,i=e.createShader(t);if(e.shaderSource(i,r),e.compileShader(i),!e.getShaderParameter(i,e.COMPILE_STATUS))throw new Error("HybridRenderPipeline compile error: "+e.getShaderInfoLog(i));return i}dispose(){const t=this.gl;t.deleteProgram(this._compositeProgram),t.deleteProgram(this._blitProgram),t.deleteVertexArray(this._quadVao),t.deleteTexture(this._blackTexture),this._splatFBO&&et(t,this._splatFBO),this._proceduralFBO&&et(t,this._proceduralFBO)}}function Z(o,t,r){return .2126*o+.7152*t+.0722*r}function bt(o,t,r,e,i){const s=(l,u)=>{const f=Math.min(t-1,Math.max(0,e+l)),h=Math.min(r-1,Math.max(0,i+u));return o[h*t+f]},n=-s(-1,-1)+s(1,-1)-2*s(-1,0)+2*s(1,0)-s(-1,1)+s(1,1),a=-s(-1,-1)-2*s(0,-1)-s(1,-1)+s(-1,1)+2*s(0,1)+s(1,1);return Math.sqrt(n*n+a*a)}function Zt(o,t,r,e,i){const s=1-e-i;return[o[0]*s+t[0]*e+r[0]*i,o[1]*s+t[1]*e+r[1]*i,o[2]*s+t[2]*e+r[2]*i]}function Kt(o,t,r,e,i){const s=1-e-i;return[o[0]*s+t[0]*e+r[0]*i,o[1]*s+t[1]*e+r[1]*i]}function yt(o,t,r,e,i){e=e-Math.floor(e),i=i-Math.floor(i);const s=e*(t-1),n=i*(r-1),a=Math.floor(s),l=Math.floor(n),u=Math.min(t-1,a+1),f=Math.min(r-1,l+1),h=s-a,d=n-l,_=(R,S)=>(S*t+R)*4,g=_(a,l),p=_(u,l),v=_(a,f),T=_(u,f),m=(o[g]*(1-h)*(1-d)+o[p]*h*(1-d)+o[v]*(1-h)*d+o[T]*h*d)/255,E=(o[g+1]*(1-h)*(1-d)+o[p+1]*h*(1-d)+o[v+1]*(1-h)*d+o[T+1]*h*d)/255,b=(o[g+2]*(1-h)*(1-d)+o[p+2]*h*(1-d)+o[v+2]*(1-h)*d+o[T+2]*h*d)/255,y=(o[g+3]*(1-h)*(1-d)+o[p+3]*h*(1-d)+o[v+3]*(1-h)*d+o[T+3]*h*d)/255;return[m,E,b,y]}function dt(o){const t=Math.sqrt(o[0]*o[0]+o[1]*o[1]+o[2]*o[2]);return t>1e-8&&(o[0]/=t,o[1]/=t,o[2]/=t),o}function se(o,t){return[o[1]*t[2]-o[2]*t[1],o[2]*t[0]-o[0]*t[2],o[0]*t[1]-o[1]*t[0]]}function Ze(o){const t=dt([...o]),r=[0,0,1],e=t[0]*r[0]+t[1]*r[1]+t[2]*r[2];let i=r;Math.abs(e)>.999&&(i=[0,1,0]);const s=dt(se(i,t)),a=Math.acos(Math.max(-1,Math.min(1,e)))*.5,l=Math.sin(a);return[Math.cos(a),s[0]*l,s[1]*l,s[2]*l]}class Ke{constructor(){this.samplesPerTriangle=8,this.edgeBoostFactor=4,this.edgeThreshold=.1,this.baseScale=.04,this.jitter=.3,this.alphaThreshold=.1,this.normalInfluence=.8,this.specularToDepth=2}convert({positions:t,normals:r,uvs:e,indices:i,diffusePixels:s,diffuseWidth:n,diffuseHeight:a,normalPixels:l=null,normalWidth:u=0,normalHeight:f=0,specularPixels:h=null,specularWidth:d=0,specularHeight:_=0}){const g=new Float32Array(n*a);for(let m=0;m<n*a;m++)g[m]=Z(s[m*4]/255,s[m*4+1]/255,s[m*4+2]/255);const p=new Float32Array(n*a);for(let m=0;m<a;m++)for(let E=0;E<n;E++)p[m*n+E]=bt(g,n,a,E,m);const v=[],T=i.length/3;for(let m=0;m<T;m++){const E=i[m*3],b=i[m*3+1],y=i[m*3+2],R=[t[E*3],t[E*3+1],t[E*3+2]],S=[t[b*3],t[b*3+1],t[b*3+2]],B=[t[y*3],t[y*3+1],t[y*3+2]],G=[r[E*3],r[E*3+1],r[E*3+2]],_e=[r[b*3],r[b*3+1],r[b*3+2]],pe=[r[y*3],r[y*3+1],r[y*3+2]],wt=[e[E*2],e[E*2+1]],Bt=[e[b*2],e[b*2+1]],Ut=[e[y*2],e[y*2+1]],ge=[S[0]-R[0],S[1]-R[1],S[2]-R[2]],Ee=[B[0]-R[0],B[1]-R[1],B[2]-R[2]],Y=se(ge,Ee),Te=.5*Math.sqrt(Y[0]*Y[0]+Y[1]*Y[1]+Y[2]*Y[2]),ve=Math.max(1,Math.round(this.samplesPerTriangle*Math.sqrt(Te))),Lt=Kt(wt,Bt,Ut,1/3,1/3),be=Math.min(n-1,Math.max(0,Math.floor(Lt[0]*n))),ye=Math.min(a-1,Math.max(0,Math.floor(Lt[1]*a))),It=p[ye*n+be],xe=It>this.edgeThreshold?Math.round(this.edgeBoostFactor*(It/1)):0,Re=ve+xe;for(let Ct=0;Ct<Re;Ct++){let M=Math.random(),U=Math.random();M+U>1&&(M=1-M,U=1-U),M+=(Math.random()-.5)*this.jitter*.1,U+=(Math.random()-.5)*this.jitter*.1,M=Math.max(0,Math.min(1,M)),U=Math.max(0,Math.min(1-M,U));const pt=Zt(R,S,B,M,U),Ae=dt(Zt(G,_e,pe,M,U)),C=Kt(wt,Bt,Ut,M,U),[Xt,Ot,Nt,Se]=yt(s,n,a,C[0],C[1]);if(Se<this.alphaThreshold)continue;let X=[...Ae];if(l){const[Et,Tt,vt]=yt(l,u,f,C[0],C[1]),we=Et*2-1,Be=Tt*2-1,Ue=vt*2-1;X[0]+=we*this.normalInfluence,X[1]+=Be*this.normalInfluence,X[2]+=Ue*this.normalInfluence,dt(X)}const Fe=Ze(X);let zt=0;if(h){const[Et,Tt,vt]=yt(h,d,_,C[0],C[1]);zt=Z(Et,Tt,vt)*this.specularToDepth}const De=Z(Xt,Ot,Nt),Me=bt(g,n,a,Math.floor(C[0]*n)%n,Math.floor(C[1]*a)%a),Pe=1-Math.min(1,Me*2),Wt=this.baseScale*(.5+De*.5)*(.4+Pe*.6),gt=Wt*.1;v.push({position:[pt[0]+X[0]*gt,pt[1]+X[1]*gt,pt[2]+X[2]*gt],orientation:Fe,scale:Wt,color:[Xt,Ot,Nt],depth:zt})}}return v}convertFromImages({positions:t,normals:r,uvs:e,indices:i,diffuseImage:s,normalImage:n,specularImage:a}){const l=d=>{if(!d)return null;const _=document.createElement("canvas"),g=d.naturalWidth||d.width,p=d.naturalHeight||d.height;_.width=g,_.height=p;const v=_.getContext("2d");return v.drawImage(d,0,0),{pixels:v.getImageData(0,0,g,p).data,width:g,height:p}},u=l(s),f=l(n),h=l(a);return this.convert({positions:t,normals:r,uvs:e,indices:i,diffusePixels:u.pixels,diffuseWidth:u.width,diffuseHeight:u.height,...f?{normalPixels:f.pixels,normalWidth:f.width,normalHeight:f.height}:{},...h?{specularPixels:h.pixels,specularWidth:h.width,specularHeight:h.height}:{}})}convertFlat(t,r,e,i={}){const s=i.gridStep||3,n=i.scale||this.baseScale,a=i.depthFromLum||1,l=new Float32Array(r*e);for(let h=0;h<r*e;h++)l[h]=Z(t[h*4]/255,t[h*4+1]/255,t[h*4+2]/255);const u=r/e,f=[];for(let h=0;h<e;h+=s)for(let d=0;d<r;d+=s){const _=(h*r+d)*4;if(t[_+3]/255<this.alphaThreshold)continue;const g=t[_]/255,p=t[_+1]/255,v=t[_+2]/255,T=Z(g,p,v),m=bt(l,r,e,d,h),E=1+(m>this.edgeThreshold?this.edgeBoostFactor:0),b=(1-T)*a,y=(d/r-.5)*2*u,R=-(h/e-.5)*2;for(let S=0;S<E;S++){const B=(Math.random()-.5)*this.jitter*(s/r)*2*u,G=(Math.random()-.5)*this.jitter*(s/e)*2;f.push({position:[y+B,R+G,b+(Math.random()-.5)*.05],orientation:[1,0,0,0],scale:n*(.5+T*.5)*(1-Math.min(1,m)*.5),color:[g,p,v],depth:b*.3})}}return f}}const V={idle:{priority:0,opacityMultiplier:.3,thicknessMultiplier:.5,speedMultiplier:.5,glowIntensity:.1,colorShift:[0,0,0],rotationSpeed:.1,patternOverride:null},active:{priority:1,opacityMultiplier:.8,thicknessMultiplier:1,speedMultiplier:1,glowIntensity:.5,colorShift:[.1,.1,.2],rotationSpeed:.3,patternOverride:null},selected:{priority:2,opacityMultiplier:1,thicknessMultiplier:1.2,speedMultiplier:.8,glowIntensity:.8,colorShift:[0,.2,.3],rotationSpeed:.5,patternOverride:7},powered:{priority:2,opacityMultiplier:1,thicknessMultiplier:1.5,speedMultiplier:1.5,glowIntensity:1,colorShift:[.3,0,.5],rotationSpeed:1,patternOverride:6},damaged:{priority:3,opacityMultiplier:.9,thicknessMultiplier:.8,speedMultiplier:2,glowIntensity:.7,colorShift:[.5,-.2,-.2],rotationSpeed:2,patternOverride:5},destroyed:{priority:4,opacityMultiplier:.4,thicknessMultiplier:2,speedMultiplier:3,glowIntensity:.3,colorShift:[.3,-.1,-.3],rotationSpeed:3,patternOverride:5}};function $e(o,t=4){const r=i=>{let s=i*2654435761;return s=(s>>>16^s)*2246822507,s=(s>>>16^s)*3266489909,s=s>>>16^s,(s&2147483647)/2147483647},e=[];for(let i=0;i<t;i++){const s=o*1e3+i;e.push({geometry:Math.floor(r(s)*24),thickness:.3+r(s+100)*.4,opacity:.7+r(s+200)*.3,color:[.3+r(s+300)*.7,.3+r(s+400)*.7,.3+r(s+500)*.7],patternScale:2+r(s+600)*4,patternSpeed:.2+r(s+700)*.4,rotOffset:r(s+800)*Math.PI*2})}return{layers:e,baseRotationSpeed:r(o*31)*.5,baseHue:r(o*47)*360}}const F={bass:{rot4dXW:.5,thickness:.3},mid:{rot4dYW:.3,speed:.5},high:{rot4dZW:.6,patternScale:.3,hueShift:30},energy:{allRotation:.3,intensity:.5,glow:.3}};class Qe{constructor({layerCount:t=4,transitionDuration:r=.5}={}){this.layerCount=t,this.transitionDuration=r,this._objectStates=new Map,this._audio={bass:0,mid:0,high:0,energy:0},this._time=0}registerObject(t,r="idle"){const e=$e(t,this.layerCount),i=V[r]||V.idle;this._objectStates.set(t,{currentState:r,targetState:r,transitionProgress:1,currentPreset:{...i},targetPreset:{...i},identity:e})}setObjectState(t,r){const e=this._objectStates.get(t);if(!e){this.registerObject(t,r);return}if(e.targetState===r)return;const i=V[r];if(!i)return;const s=(V[e.currentState]||V.idle).priority;i.priority<s&&e.transitionProgress<.5||(e.currentPreset=this._interpolatePresets(e.currentPreset,e.targetPreset,e.transitionProgress),e.targetPreset={...i},e.currentState=e.targetState,e.targetState=r,e.transitionProgress=0)}setAudio(t,r,e,i){this._audio.bass=Math.max(0,Math.min(1,t||0)),this._audio.mid=Math.max(0,Math.min(1,r||0)),this._audio.high=Math.max(0,Math.min(1,e||0)),this._audio.energy=Math.max(0,Math.min(1,i||0))}update(t){this._time+=t;for(const r of this._objectStates.values())r.transitionProgress<1&&(r.transitionProgress=Math.min(1,r.transitionProgress+t/this.transitionDuration))}getInscriptionConfig(t){let r=this._objectStates.get(t);r||(this.registerObject(t),r=this._objectStates.get(t));const e=this._interpolatePresets(r.currentPreset,r.targetPreset,r.transitionProgress),i=r.identity,s=this._audio,n=[];for(let h=0;h<this.layerCount;h++){const d=i.layers[h],_=e.patternOverride!==null?e.patternOverride:d.geometry,g=d.opacity*e.opacityMultiplier+s.energy*F.energy.intensity*.3,p=d.thickness*e.thicknessMultiplier+s.bass*F.bass.thickness,v=d.patternSpeed*e.speedMultiplier+s.mid*F.mid.speed,T=s.high*F.high.hueShift/360,m=[Math.min(1,Math.max(0,d.color[0]+e.colorShift[0]+T*.5)),Math.min(1,Math.max(0,d.color[1]+e.colorShift[1]+T*.3)),Math.min(1,Math.max(0,d.color[2]+e.colorShift[2]+T))],E=d.patternScale+s.high*F.high.patternScale,b=d.rotOffset+this._time*(i.baseRotationSpeed+e.rotationSpeed*.5);n.push({geometry:_,thickness:Math.min(1,Math.max(0,p)),opacity:Math.min(1,Math.max(0,g)),color:m,patternScale:E,patternSpeed:v,rotOffset:b})}const a=s.bass*F.bass.rot4dXW+s.energy*F.energy.allRotation,l=s.mid*F.mid.rot4dYW+s.energy*F.energy.allRotation,u=s.high*F.high.rot4dZW+s.energy*F.energy.allRotation,f=.6*e.thicknessMultiplier+s.bass*.2;return{layers:n,rot4dXW:a,rot4dYW:l,rot4dZW:u,globalThickness:f,glowIntensity:e.glowIntensity+s.energy*F.energy.glow,bass:s.bass,mid:s.mid,high:s.high,energy:s.energy}}applyToLayer(t,r){const e=this.getInscriptionConfig(r);t.rot4dXW=e.rot4dXW,t.rot4dYW=e.rot4dYW,t.rot4dZW=e.rot4dZW,t.globalThickness=e.globalThickness,t.setAudio(e.bass,e.mid,e.high,e.energy);for(let i=0;i<e.layers.length&&i<t.layerCount;i++)t.setLayerConfig(i,e.layers[i])}_interpolatePresets(t,r,e){const i=e<.5?2*e*e:1-Math.pow(-2*e+2,2)/2;return{priority:r.priority,opacityMultiplier:t.opacityMultiplier+(r.opacityMultiplier-t.opacityMultiplier)*i,thicknessMultiplier:t.thicknessMultiplier+(r.thicknessMultiplier-t.thicknessMultiplier)*i,speedMultiplier:t.speedMultiplier+(r.speedMultiplier-t.speedMultiplier)*i,glowIntensity:t.glowIntensity+(r.glowIntensity-t.glowIntensity)*i,colorShift:[t.colorShift[0]+(r.colorShift[0]-t.colorShift[0])*i,t.colorShift[1]+(r.colorShift[1]-t.colorShift[1])*i,t.colorShift[2]+(r.colorShift[2]-t.colorShift[2])*i],rotationSpeed:t.rotationSpeed+(r.rotationSpeed-t.rotationSpeed)*i,patternOverride:i>.5?r.patternOverride:t.patternOverride}}getObjectState(t){const r=this._objectStates.get(t);return r?r.targetState:null}get registeredObjects(){return Array.from(this._objectStates.keys())}get stateNames(){return Object.keys(V)}dispose(){this._objectStates.clear()}}class Je{constructor(t,r={}){this.gl=t,this.resolution=r.resolution??1024,this.bias=r.bias??.005,this.normalBias=r.normalBias??.02,this.pcfRadius=r.pcfRadius??2,this.filterMode=r.filterMode??"pcf",this.frustumSize=r.frustumSize??10,this.near=r.near??.1,this.far=r.far??50,this.lightDir=new Float32Array(r.lightDir||[.5,1,.3]),this._normalizeLightDir(),this.lightViewMatrix=new Float32Array(16),this.lightProjMatrix=new Float32Array(16),this.lightSpaceMatrix=new Float32Array(16),this._fbo=null,this._depthTexture=null,this._shadowProgram=null,this._initialized=!1}init(){if(this._initialized)return;const t=this.gl;this._fbo=t.createFramebuffer(),this._depthTexture=t.createTexture(),t.bindTexture(t.TEXTURE_2D,this._depthTexture),t.texImage2D(t.TEXTURE_2D,0,t.DEPTH_COMPONENT32F,this.resolution,this.resolution,0,t.DEPTH_COMPONENT,t.FLOAT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_COMPARE_MODE,t.COMPARE_REF_TO_TEXTURE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_COMPARE_FUNC,t.LEQUAL),t.bindFramebuffer(t.FRAMEBUFFER,this._fbo),t.framebufferTexture2D(t.FRAMEBUFFER,t.DEPTH_ATTACHMENT,t.TEXTURE_2D,this._depthTexture,0),t.drawBuffers([t.NONE]),t.readBuffer(t.NONE),t.bindFramebuffer(t.FRAMEBUFFER,null),this._shadowProgram=this._createShadowProgram(),this._initialized=!0}setLightDirection(t,r,e){this.lightDir[0]=t,this.lightDir[1]=r,this.lightDir[2]=e,this._normalizeLightDir()}updateMatrices(t){const r=t?t[0]:0,e=t?t[1]:0,i=t?t[2]:0,s=this.lightDir[0],n=this.lightDir[1],a=this.lightDir[2],l=this.far*.5,u=r+s*l,f=e+n*l,h=i+a*l;this._lookAt(this.lightViewMatrix,u,f,h,r,e,i);const d=this.frustumSize;this._ortho(this.lightProjMatrix,-d,d,-d,d,this.near,this.far),this._multiplyMat4(this.lightSpaceMatrix,this.lightProjMatrix,this.lightViewMatrix)}beginShadowPass(){this._initialized||this.init();const t=this.gl;t.bindFramebuffer(t.FRAMEBUFFER,this._fbo),t.viewport(0,0,this.resolution,this.resolution),t.clear(t.DEPTH_BUFFER_BIT),t.enable(t.DEPTH_TEST),t.depthFunc(t.LESS),t.enable(t.CULL_FACE),t.cullFace(t.FRONT)}renderShadowCaster(t,r,e){const i=this.gl,s=this._shadowProgram;i.useProgram(s.program),i.uniformMatrix4fv(s.u_lightSpaceMatrix,!1,this.lightSpaceMatrix),i.uniformMatrix4fv(s.u_modelMatrix,!1,e||tr);const n=i.createVertexArray();i.bindVertexArray(n);const a=i.createBuffer();if(i.bindBuffer(i.ARRAY_BUFFER,a),i.bufferData(i.ARRAY_BUFFER,t,i.STREAM_DRAW),i.enableVertexAttribArray(0),i.vertexAttribPointer(0,3,i.FLOAT,!1,0,0),r){const l=i.createBuffer();i.bindBuffer(i.ELEMENT_ARRAY_BUFFER,l),i.bufferData(i.ELEMENT_ARRAY_BUFFER,r,i.STREAM_DRAW),i.drawElements(i.TRIANGLES,r.length,i.UNSIGNED_INT,0),i.deleteBuffer(l)}else i.drawArrays(i.TRIANGLES,0,t.length/3);i.bindVertexArray(null),i.deleteVertexArray(n),i.deleteBuffer(a)}endShadowPass(){const t=this.gl;t.cullFace(t.BACK),t.bindFramebuffer(t.FRAMEBUFFER,null)}getShadowTexture(){return this._depthTexture}getLightSpaceMatrix(){return this.lightSpaceMatrix}static getShadowSamplerSrc(){return`
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
`}_normalizeLightDir(){const t=this.lightDir,r=Math.sqrt(t[0]*t[0]+t[1]*t[1]+t[2]*t[2])||1;t[0]/=r,t[1]/=r,t[2]/=r}_createShadowProgram(){const t=this.gl,r=`#version 300 es
precision highp float;
layout(location = 0) in vec3 a_position;
uniform mat4 u_lightSpaceMatrix;
uniform mat4 u_modelMatrix;
void main() {
    gl_Position = u_lightSpaceMatrix * u_modelMatrix * vec4(a_position, 1.0);
}`,e=`#version 300 es
precision highp float;
void main() {
    // Depth is written automatically
}`,i=t.createShader(t.VERTEX_SHADER);t.shaderSource(i,r),t.compileShader(i);const s=t.createShader(t.FRAGMENT_SHADER);t.shaderSource(s,e),t.compileShader(s);const n=t.createProgram();return t.attachShader(n,i),t.attachShader(n,s),t.linkProgram(n),t.deleteShader(i),t.deleteShader(s),{program:n,u_lightSpaceMatrix:t.getUniformLocation(n,"u_lightSpaceMatrix"),u_modelMatrix:t.getUniformLocation(n,"u_modelMatrix")}}_lookAt(t,r,e,i,s,n,a){let l=s-r,u=n-e,f=a-i,h=Math.sqrt(l*l+u*u+f*f)||1;l/=h,u/=h,f/=h;let d=u*0-f*1,_=f*0-l*0,g=l*1-u*0;Math.abs(d)+Math.abs(_)+Math.abs(g)<.001&&(d=1,_=0,g=0),h=Math.sqrt(d*d+_*_+g*g)||1,d/=h,_/=h,g/=h;const p=_*f-g*u,v=g*l-d*f,T=d*u-_*l;t[0]=d,t[1]=p,t[2]=-l,t[3]=0,t[4]=_,t[5]=v,t[6]=-u,t[7]=0,t[8]=g,t[9]=T,t[10]=-f,t[11]=0,t[12]=-(d*r+_*e+g*i),t[13]=-(p*r+v*e+T*i),t[14]=-(-l*r+-u*e+-f*i),t[15]=1}_ortho(t,r,e,i,s,n,a){const l=1/(r-e),u=1/(i-s),f=1/(n-a);t[0]=-2*l,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=-2*u,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=2*f,t[11]=0,t[12]=(r+e)*l,t[13]=(s+i)*u,t[14]=(a+n)*f,t[15]=1}_multiplyMat4(t,r,e){for(let i=0;i<4;i++)for(let s=0;s<4;s++)t[i*4+s]=r[0*4+s]*e[i*4+0]+r[1*4+s]*e[i*4+1]+r[2*4+s]*e[i*4+2]+r[3*4+s]*e[i*4+3]}dispose(){const t=this.gl;this._fbo&&t.deleteFramebuffer(this._fbo),this._depthTexture&&t.deleteTexture(this._depthTexture),this._shadowProgram&&t.deleteProgram(this._shadowProgram.program),this._fbo=null,this._depthTexture=null,this._shadowProgram=null,this._initialized=!1}}const tr=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);class er{constructor(t,r={}){this.gl=t,this.maxParticles=r.maxParticles??1e4,this.emitRate=r.emitRate??100,this.lifetime=r.lifetime??3,this.lifetimeVariance=r.lifetimeVariance??.5,this.speed=r.speed??1,this.speedVariance=r.speedVariance??.3,this.gravity=r.gravity??-2,this.drag=r.drag??.98,this.splatScale=r.splatScale??.02,this.splatScaleDecay=r.splatScaleDecay??.5,this.trailLength=r.trailLength??0,this.emitterType=r.emitterType??"point",this.emitterPosition=new Float32Array(r.emitterPosition||[0,0,0]),this.emitterRadius=r.emitterRadius??.5,this.emitterDirection=new Float32Array(r.emitterDirection||[0,1,0]),this.emitterSpread=r.emitterSpread??.5,this.colorStart=new Float32Array(r.colorStart||[0,1,1]),this.colorEnd=new Float32Array(r.colorEnd||[1,0,1]),this.colorMode=r.colorMode??"lerp",this.burstConfigs=new Map,this._setupDefaultBursts(),this._stride=12,this._data=new Float32Array(this.maxParticles*this._stride),this._aliveCount=0,this._emitAccumulator=0,this._trailHistory=this.trailLength>0?new Float32Array(this.maxParticles*this.trailLength*7):null,this._splatBuffer=null,this._splatCount=0,this._rng=12345}setBurstConfig(t,r){this.burstConfigs.set(t,r)}burst(t,r){const e=this.burstConfigs.get(t);if(!e)return;const i=r||this.emitterPosition,s=e.speed??this.speed*2,n=e.spread??1;for(let a=0;a<e.count;a++)this._emitOne(i,s,n,e.color)}setPosition(t,r,e){this.emitterPosition[0]=t,this.emitterPosition[1]=r,this.emitterPosition[2]=e}setSurfaceEmitter(t,r,e){this.emitterType="surface",this._surfacePositions=t,this._surfaceNormals=r,this._surfaceIndices=e}update(t){for((t<=0||t>.1)&&(t=.016),this._emitAccumulator+=this.emitRate*t;this._emitAccumulator>=1&&this._aliveCount<this.maxParticles;)this._emitAccumulator-=1,this._emitParticle();let r=0;for(let e=0;e<this._aliveCount;e++){const i=e*this._stride;if(this._data[i+9]+=t,this._data[i+9]>=this._data[i+10])continue;this._trailHistory&&this._pushTrail(e),this._data[i+4]+=this.gravity*t,this._data[i+3]*=this.drag,this._data[i+4]*=this.drag,this._data[i+5]*=this.drag,this._data[i+0]+=this._data[i+3]*t,this._data[i+1]+=this._data[i+4]*t,this._data[i+2]+=this._data[i+5]*t;const s=this._data[i+9]/this._data[i+10];this._data[i+6]=this.colorStart[0]*(1-s)+this.colorEnd[0]*s,this._data[i+7]=this.colorStart[1]*(1-s)+this.colorEnd[1]*s,this._data[i+8]=this.colorStart[2]*(1-s)+this.colorEnd[2]*s,this._data[i+11]=this.splatScale*(1-s*this.splatScaleDecay),r!==e&&this._data.copyWithin(r*this._stride,i,i+this._stride),r++}this._aliveCount=r,this._buildSplatBuffer()}getSplatBuffer(){return{buffer:this._splatBuffer,count:this._splatCount}}getAliveCount(){return this._aliveCount}_setupDefaultBursts(){this.burstConfigs.set("powered",{count:50,speed:2,spread:.3,color:[.5,0,1]}),this.burstConfigs.set("damaged",{count:100,speed:3,spread:1,color:[1,.3,0]}),this.burstConfigs.set("destroyed",{count:500,speed:5,spread:1,color:[1,.1,.1]}),this.burstConfigs.set("selected",{count:20,speed:.5,spread:.8,color:[0,1,1]}),this.burstConfigs.set("active",{count:30,speed:1,spread:.5,color:[0,1,.5]})}_emitParticle(){const t=this._getEmitPosition();this._emitOne(t,this.speed,this.emitterSpread)}_emitOne(t,r,e,i){if(this._aliveCount>=this.maxParticles)return;const s=this._aliveCount*this._stride;this._data[s+0]=t[0],this._data[s+1]=t[1],this._data[s+2]=t[2];const n=this._randomConeDirection(this.emitterDirection,e),a=r+(this._rand()-.5)*this.speedVariance*2;this._data[s+3]=n[0]*a,this._data[s+4]=n[1]*a,this._data[s+5]=n[2]*a,i?(this._data[s+6]=i[0],this._data[s+7]=i[1],this._data[s+8]=i[2]):(this._data[s+6]=this.colorStart[0],this._data[s+7]=this.colorStart[1],this._data[s+8]=this.colorStart[2]),this._data[s+9]=0,this._data[s+10]=this.lifetime+(this._rand()-.5)*this.lifetimeVariance*2,this._data[s+11]=this.splatScale,this._aliveCount++}_getEmitPosition(){if(this.emitterType==="surface"&&this._surfaceIndices)return this._randomSurfacePoint();if(this.emitterType==="sphere"){const t=this._rand()*Math.PI*2,r=Math.acos(2*this._rand()-1),e=this.emitterRadius*Math.cbrt(this._rand());return[this.emitterPosition[0]+e*Math.sin(r)*Math.cos(t),this.emitterPosition[1]+e*Math.cos(r),this.emitterPosition[2]+e*Math.sin(r)*Math.sin(t)]}return this.emitterPosition}_randomSurfacePoint(){const t=this._surfaceIndices.length/3,r=Math.floor(this._rand()*t),e=this._surfaceIndices[r*3]*3,i=this._surfaceIndices[r*3+1]*3,s=this._surfaceIndices[r*3+2]*3;let n=this._rand(),a=this._rand();n+a>1&&(n=1-n,a=1-a);const l=1-n-a;return[this._surfacePositions[e]*l+this._surfacePositions[i]*n+this._surfacePositions[s]*a,this._surfacePositions[e+1]*l+this._surfacePositions[i+1]*n+this._surfacePositions[s+1]*a,this._surfacePositions[e+2]*l+this._surfacePositions[i+2]*n+this._surfacePositions[s+2]*a]}_randomConeDirection(t,r){const e=this._rand()*Math.PI*2,i=1-this._rand()*r,s=Math.sqrt(1-i*i),n=t[0],a=t[1],l=t[2];let u,f,h;Math.abs(a)<.99?(u=a*0-l*0,f=l*1-n*0,h=n*0-a*1,u=0,f=-l,h=a):(u=-l,f=0,h=n);const d=Math.sqrt(u*u+f*f+h*h)||1;u/=d,f/=d,h/=d;const _=a*h-l*f,g=l*u-n*h,p=n*f-a*u;return[n*i+(u*Math.cos(e)+_*Math.sin(e))*s,a*i+(f*Math.cos(e)+g*Math.sin(e))*s,l*i+(h*Math.cos(e)+p*Math.sin(e))*s]}_pushTrail(t){if(!this._trailHistory)return;const r=t*this._stride,e=7,i=t*this.trailLength*e;for(let s=this.trailLength-1;s>0;s--){const n=i+s*e,a=i+(s-1)*e;for(let l=0;l<e;l++)this._trailHistory[n+l]=this._trailHistory[a+l]}this._trailHistory[i+0]=this._data[r+0],this._trailHistory[i+1]=this._data[r+1],this._trailHistory[i+2]=this._data[r+2],this._trailHistory[i+3]=this._data[r+6],this._trailHistory[i+4]=this._data[r+7],this._trailHistory[i+5]=this._data[r+8],this._trailHistory[i+6]=this._data[r+11]}_buildSplatBuffer(){const r=this._aliveCount*(1+this.trailLength);(!this._splatBuffer||this._splatBuffer.length<r*12)&&(this._splatBuffer=new Float32Array(r*12));let e=0;for(let i=0;i<this._aliveCount;i++){const s=i*this._stride,n=e*12;if(this._splatBuffer[n+0]=this._data[s+0],this._splatBuffer[n+1]=this._data[s+1],this._splatBuffer[n+2]=this._data[s+2],this._splatBuffer[n+3]=this._data[s+11],this._splatBuffer[n+4]=1,this._splatBuffer[n+5]=0,this._splatBuffer[n+6]=0,this._splatBuffer[n+7]=0,this._splatBuffer[n+8]=this._data[s+6],this._splatBuffer[n+9]=this._data[s+7],this._splatBuffer[n+10]=this._data[s+8],this._splatBuffer[n+11]=.5,e++,this._trailHistory){const a=i*this.trailLength*7;for(let l=0;l<this.trailLength;l++){const u=a+l*7,f=e*12,h=1-(l+1)/(this.trailLength+1);this._splatBuffer[f+0]=this._trailHistory[u+0],this._splatBuffer[f+1]=this._trailHistory[u+1],this._splatBuffer[f+2]=this._trailHistory[u+2],this._splatBuffer[f+3]=this._trailHistory[u+6]*h,this._splatBuffer[f+4]=1,this._splatBuffer[f+5]=0,this._splatBuffer[f+6]=0,this._splatBuffer[f+7]=0,this._splatBuffer[f+8]=this._trailHistory[u+3]*h,this._splatBuffer[f+9]=this._trailHistory[u+4]*h,this._splatBuffer[f+10]=this._trailHistory[u+5]*h,this._splatBuffer[f+11]=.3*h,e++}}}this._splatCount=e}_rand(){return this._rng=this._rng*1664525+1013904223&2147483647,this._rng/2147483647}dispose(){this._data=null,this._splatBuffer=null,this._trailHistory=null}}class rr{constructor(t,r={}){this.gl=t,this.maxSteps=r.maxSteps??24,this.stepSize=r.stepSize??.05,this.density=r.density??2,this.absorption=r.absorption??1.5,this.emissionStrength=r.emissionStrength??1,this.noiseScale=r.noiseScale??3,this.geometry=r.geometry??0,this.primaryColor=new Float32Array(r.primaryColor||[0,1,1]),this.secondaryColor=new Float32Array(r.secondaryColor||[1,0,1]),this.rot4dXY=0,this.rot4dXZ=0,this.rot4dYZ=0,this.rot4dXW=0,this.rot4dYW=0,this.rot4dZW=0,this.bass=0,this.mid=0,this.high=0,this.energy=0,this.sliceEnabled=!1,this.slicePlane=new Float32Array([0,1,0,0]),this._program=null,this._fbo=null,this._texture=null,this._vao=null,this._initialized=!1}init(){if(this._initialized)return;const t=this.gl;this._program=this._createProgram(),this._fbo=t.createFramebuffer(),this._texture=t.createTexture(),this._vao=t.createVertexArray(),t.bindVertexArray(this._vao);const r=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,r),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null),this._initialized=!0}setAudio(t,r,e,i){this.bass=t,this.mid=r,this.high=e,this.energy=i}render(t,r,e,i){this._initialized||this.init();const s=this.gl,{width:n,height:a}=i;return this._ensureTexture(n,a),s.bindFramebuffer(s.FRAMEBUFFER,this._fbo),s.viewport(0,0,n,a),s.clearColor(0,0,0,0),s.clear(s.COLOR_BUFFER_BIT),s.useProgram(this._program.program),s.activeTexture(s.TEXTURE0),s.bindTexture(s.TEXTURE_2D,t),s.uniform1i(this._program.u_depthTex,0),s.activeTexture(s.TEXTURE1),s.bindTexture(s.TEXTURE_2D,r),s.uniform1i(this._program.u_normalTex,1),s.uniform1f(this._program.u_time,e),s.uniform2f(this._program.u_resolution,n,a),s.uniform1i(this._program.u_maxSteps,this.maxSteps),s.uniform1f(this._program.u_stepSize,this.stepSize),s.uniform1f(this._program.u_density,this.density),s.uniform1f(this._program.u_absorption,this.absorption),s.uniform1f(this._program.u_emissionStrength,this.emissionStrength),s.uniform1f(this._program.u_noiseScale,this.noiseScale),s.uniform1f(this._program.u_geometry,this.geometry),s.uniform3fv(this._program.u_primaryColor,this.primaryColor),s.uniform3fv(this._program.u_secondaryColor,this.secondaryColor),s.uniform1f(this._program.u_rot4dXY,this.rot4dXY),s.uniform1f(this._program.u_rot4dXZ,this.rot4dXZ),s.uniform1f(this._program.u_rot4dYZ,this.rot4dYZ),s.uniform1f(this._program.u_rot4dXW,this.rot4dXW+this.bass*.3),s.uniform1f(this._program.u_rot4dYW,this.rot4dYW+this.mid*.2),s.uniform1f(this._program.u_rot4dZW,this.rot4dZW+this.high*.4),s.uniform1i(this._program.u_sliceEnabled,this.sliceEnabled?1:0),s.uniform4fv(this._program.u_slicePlane,this.slicePlane),i.invViewProj&&s.uniformMatrix4fv(this._program.u_invViewProj,!1,i.invViewProj),i.cameraPos&&s.uniform3fv(this._program.u_cameraPos,i.cameraPos),s.enable(s.BLEND),s.blendFunc(s.ONE,s.ONE_MINUS_SRC_ALPHA),s.bindVertexArray(this._vao),s.drawArrays(s.TRIANGLES,0,3),s.bindVertexArray(null),s.disable(s.BLEND),s.bindFramebuffer(s.FRAMEBUFFER,null),{texture:this._texture,framebuffer:this._fbo}}_ensureTexture(t,r){const e=this.gl;this._texW===t&&this._texH===r||(this._texW=t,this._texH=r,e.bindTexture(e.TEXTURE_2D,this._texture),e.texImage2D(e.TEXTURE_2D,0,e.RGBA16F,t,r,0,e.RGBA,e.HALF_FLOAT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,this._fbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,this._texture,0),e.bindFramebuffer(e.FRAMEBUFFER,null))}_createProgram(){const t=this.gl,r=`#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`,e=`#version 300 es
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
}`,i=t.createShader(t.VERTEX_SHADER);t.shaderSource(i,r),t.compileShader(i);const s=t.createShader(t.FRAGMENT_SHADER);t.shaderSource(s,e),t.compileShader(s),t.getShaderParameter(s,t.COMPILE_STATUS)||console.warn("VolumetricInscription fragment shader error:",t.getShaderInfoLog(s));const n=t.createProgram();t.attachShader(n,i),t.attachShader(n,s),t.linkProgram(n),t.deleteShader(i),t.deleteShader(s);const a=l=>t.getUniformLocation(n,l);return{program:n,u_depthTex:a("u_depthTex"),u_normalTex:a("u_normalTex"),u_time:a("u_time"),u_resolution:a("u_resolution"),u_maxSteps:a("u_maxSteps"),u_stepSize:a("u_stepSize"),u_density:a("u_density"),u_absorption:a("u_absorption"),u_emissionStrength:a("u_emissionStrength"),u_noiseScale:a("u_noiseScale"),u_geometry:a("u_geometry"),u_primaryColor:a("u_primaryColor"),u_secondaryColor:a("u_secondaryColor"),u_rot4dXY:a("u_rot4dXY"),u_rot4dXZ:a("u_rot4dXZ"),u_rot4dYZ:a("u_rot4dYZ"),u_rot4dXW:a("u_rot4dXW"),u_rot4dYW:a("u_rot4dYW"),u_rot4dZW:a("u_rot4dZW"),u_sliceEnabled:a("u_sliceEnabled"),u_slicePlane:a("u_slicePlane"),u_invViewProj:a("u_invViewProj"),u_cameraPos:a("u_cameraPos")}}dispose(){const t=this.gl;this._program&&t.deleteProgram(this._program.program),this._fbo&&t.deleteFramebuffer(this._fbo),this._texture&&t.deleteTexture(this._texture),this._vao&&t.deleteVertexArray(this._vao)}}class ir{constructor(t,r={}){this.gl=t,this.lightDir=new Float32Array(r.lightDir||[.5,1,.3]),this.lightColor=new Float32Array(r.lightColor||[1,.95,.9]),this.ambientStrength=r.ambientStrength??.15,this.specularPower=r.specularPower??64,this.specularStrength=r.specularStrength??.5,this.inscriptionEmission=r.inscriptionEmission??.3,this.fresnelPower=r.fresnelPower??3,this.shadowEnabled=!1,this.shadowTexture=null,this.lightSpaceMatrix=null,this._program=null,this._fbo=null,this._texture=null,this._vao=null,this._initialized=!1}init(){if(this._initialized)return;const t=this.gl;this._program=this._createProgram(),this._fbo=t.createFramebuffer(),this._texture=t.createTexture(),this._vao=t.createVertexArray(),t.bindVertexArray(this._vao);const r=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,r),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null),this._initialized=!0}setShadow(t,r){this.shadowEnabled=!0,this.shadowTexture=t,this.lightSpaceMatrix=r}render(t,r,e){this._initialized||this.init();const i=this.gl,{width:s,height:n}=e;this._ensureTexture(s,n),i.bindFramebuffer(i.FRAMEBUFFER,this._fbo),i.viewport(0,0,s,n),i.clearColor(0,0,0,0),i.clear(i.COLOR_BUFFER_BIT),i.useProgram(this._program.program),i.activeTexture(i.TEXTURE0),i.bindTexture(i.TEXTURE_2D,t),i.uniform1i(this._program.u_inscriptionTex,0),i.activeTexture(i.TEXTURE1),i.bindTexture(i.TEXTURE_2D,r),i.uniform1i(this._program.u_normalDepthTex,1),i.uniform1i(this._program.u_shadowEnabled,this.shadowEnabled?1:0),this.shadowEnabled&&this.shadowTexture&&(i.activeTexture(i.TEXTURE2),i.bindTexture(i.TEXTURE_2D,this.shadowTexture),i.uniform1i(this._program.u_shadowTex,2),this.lightSpaceMatrix&&i.uniformMatrix4fv(this._program.u_lightSpaceMatrix,!1,this.lightSpaceMatrix)),i.uniform2f(this._program.u_resolution,s,n);const a=this.lightDir,l=Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2])||1;return i.uniform3f(this._program.u_lightDir,a[0]/l,a[1]/l,a[2]/l),i.uniform3fv(this._program.u_lightColor,this.lightColor),i.uniform1f(this._program.u_ambientStrength,this.ambientStrength),i.uniform1f(this._program.u_specularPower,this.specularPower),i.uniform1f(this._program.u_specularStrength,this.specularStrength),i.uniform1f(this._program.u_inscriptionEmission,this.inscriptionEmission),i.uniform1f(this._program.u_fresnelPower,this.fresnelPower),e.viewDir?i.uniform3fv(this._program.u_viewDir,e.viewDir):i.uniform3f(this._program.u_viewDir,0,0,-1),i.bindVertexArray(this._vao),i.drawArrays(i.TRIANGLES,0,3),i.bindVertexArray(null),i.bindFramebuffer(i.FRAMEBUFFER,null),{texture:this._texture}}_ensureTexture(t,r){if(this._texW===t&&this._texH===r)return;const e=this.gl;this._texW=t,this._texH=r,e.bindTexture(e.TEXTURE_2D,this._texture),e.texImage2D(e.TEXTURE_2D,0,e.RGBA16F,t,r,0,e.RGBA,e.HALF_FLOAT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,this._fbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,this._texture,0),e.bindFramebuffer(e.FRAMEBUFFER,null)}_createProgram(){const t=this.gl,r=`#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`,e=`#version 300 es
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
}`,i=t.createShader(t.VERTEX_SHADER);t.shaderSource(i,r),t.compileShader(i);const s=t.createShader(t.FRAGMENT_SHADER);t.shaderSource(s,e),t.compileShader(s),t.getShaderParameter(s,t.COMPILE_STATUS)||console.warn("DeferredInscriptionLighting fragment shader error:",t.getShaderInfoLog(s));const n=t.createProgram();t.attachShader(n,i),t.attachShader(n,s),t.linkProgram(n),t.deleteShader(i),t.deleteShader(s);const a=l=>t.getUniformLocation(n,l);return{program:n,u_inscriptionTex:a("u_inscriptionTex"),u_normalDepthTex:a("u_normalDepthTex"),u_shadowTex:a("u_shadowTex"),u_resolution:a("u_resolution"),u_lightDir:a("u_lightDir"),u_lightColor:a("u_lightColor"),u_viewDir:a("u_viewDir"),u_ambientStrength:a("u_ambientStrength"),u_specularPower:a("u_specularPower"),u_specularStrength:a("u_specularStrength"),u_inscriptionEmission:a("u_inscriptionEmission"),u_fresnelPower:a("u_fresnelPower"),u_shadowEnabled:a("u_shadowEnabled"),u_lightSpaceMatrix:a("u_lightSpaceMatrix")}}dispose(){const t=this.gl;this._program&&t.deleteProgram(this._program.program),this._fbo&&t.deleteFramebuffer(this._fbo),this._texture&&t.deleteTexture(this._texture),this._vao&&t.deleteVertexArray(this._vao)}}class or{constructor(t,r={}){this.gl=t,this.maxTextures=r.maxTextures??8,this._textures=new Map,this._glTextures=new Map}setLayerTexture(t,r,e={}){const i=this.gl;let s=this._glTextures.get(t);s||(s=i.createTexture(),this._glTextures.set(t,s)),i.bindTexture(i.TEXTURE_2D,s),i.texImage2D(i.TEXTURE_2D,0,i.RGBA,i.RGBA,i.UNSIGNED_BYTE,r),i.generateMipmap(i.TEXTURE_2D),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.LINEAR_MIPMAP_LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.REPEAT),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.REPEAT),i.bindTexture(i.TEXTURE_2D,null),this._textures.set(t,{texture:s,uvMode:e.uvMode??"screen",blend:e.blend??.5,tileX:e.tileX??1,tileY:e.tileY??1,offsetX:e.offsetX??0,offsetY:e.offsetY??0,rotation:e.rotation??0,channel:e.channel??"r",invert:e.invert??!1,width:r.width||r.naturalWidth,height:r.height||r.naturalHeight})}async loadLayerTexture(t,r,e={}){return new Promise((i,s)=>{const n=new Image;n.crossOrigin="anonymous",n.onload=()=>{this.setLayerTexture(t,n,e),i()},n.onerror=s,n.src=r})}setLayerText(t,r,e={}){const i=e.canvasSize??512,s=document.createElement("canvas");s.width=i,s.height=i;const n=s.getContext("2d");n.fillStyle="black",n.fillRect(0,0,i,i),n.fillStyle=e.color??"white",n.font=e.font??"32px monospace",n.textAlign="center",n.textBaseline="middle";const a=r.split(" "),l=[];let u="";const f=i*.8;for(const _ of a){const g=u?u+" "+_:_;n.measureText(g).width>f&&u?(l.push(u),u=_):u=g}u&&l.push(u);const h=parseInt(n.font)*1.4,d=i/2-(l.length-1)*h/2;for(let _=0;_<l.length;_++)n.fillText(l[_],i/2,d+_*h);this.setLayerTexture(t,s,{channel:"luminance",...e})}setLayerCircuitPattern(t,r={}){const e=r.canvasSize??512,i=document.createElement("canvas");i.width=e,i.height=e;const s=i.getContext("2d");s.fillStyle="black",s.fillRect(0,0,e,e),s.strokeStyle="white",s.lineWidth=2;const n=r.gridSize??32;let l=r.seed??42;const u=()=>(l=l*1664525+1013904223&4294967295,(l>>>0)/4294967295);for(let f=0;f<e;f+=n){let h=u()>.3;for(let d=0;d<e;d+=n)u()>.6&&(h=!h),h&&(s.beginPath(),s.moveTo(f,d),u()>.5?s.lineTo(f+n,d):s.lineTo(f,d+n),s.stroke()),u()>.7&&(s.beginPath(),s.arc(f,d,3,0,Math.PI*2),s.fillStyle="white",s.fill())}this.setLayerTexture(t,i,{channel:"luminance",...r})}removeLayerTexture(t){const r=this._glTextures.get(t);r&&(this.gl.deleteTexture(r),this._glTextures.delete(t)),this._textures.delete(t)}getLayerConfig(t){return this._textures.get(t)||null}hasTexture(t){return this._textures.has(t)}bind(t,r){const e=this._textures.get(t);if(!e)return!1;const i=this.gl;return i.activeTexture(i.TEXTURE0+r),i.bindTexture(i.TEXTURE_2D,e.texture),!0}static getShaderSrc(){return`
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
`}dispose(){for(const[,t]of this._glTextures)this.gl.deleteTexture(t);this._glTextures.clear(),this._textures.clear()}}function ar(o,t){const r=new Float32Array(16);for(let e=0;e<4;e++)for(let i=0;i<4;i++)r[e*4+i]=o[i]*t[e*4]+o[4+i]*t[e*4+1]+o[8+i]*t[e*4+2]+o[12+i]*t[e*4+3];return r}function sr(o,t,r,e){const i=1/Math.tan(o*.5),s=1/(r-e);return new Float32Array([i/t,0,0,0,0,i,0,0,0,0,(e+r)*s,-1,0,0,2*e*r*s,0])}function nr(o,t,r){let e=o[0]-t[0],i=o[1]-t[1],s=o[2]-t[2],n=Math.hypot(e,i,s)||1;e/=n,i/=n,s/=n;let a=r[1]*s-r[2]*i,l=r[2]*e-r[0]*s,u=r[0]*i-r[1]*e;n=Math.hypot(a,l,u)||1,a/=n,l/=n,u/=n;const f=i*u-s*l,h=s*a-e*u,d=e*l-i*a;return new Float32Array([a,f,e,0,l,h,i,0,u,d,s,0,-(a*o[0]+l*o[1]+u*o[2]),-(f*o[0]+h*o[1]+d*o[2]),-(e*o[0]+i*o[1]+s*o[2]),1])}function lr(o,t,r,e){const i=[],s=[],n=[],a=[];for(let l=0;l<=e;l++)for(let u=0;u<=r;u++){const f=u/r*Math.PI*2,h=l/e*Math.PI*2;i.push((o+t*Math.cos(h))*Math.cos(f),t*Math.sin(h),(o+t*Math.cos(h))*Math.sin(f)),s.push(Math.cos(h)*Math.cos(f),Math.sin(h),Math.cos(h)*Math.sin(f)),n.push(u/r,l/e)}for(let l=0;l<e;l++)for(let u=0;u<r;u++){const f=l*(r+1)+u,h=f+r+1;a.push(f,h,f+1,h,h+1,f+1)}return{positions:new Float32Array(i),normals:new Float32Array(s),uvs:new Float32Array(n),indices:new Uint16Array(a),triCount:a.length/3}}function cr(o,t,r){const e=[],i=[],s=[],n=[];for(let a=0;a<=r;a++)for(let l=0;l<=t;l++){const u=l/t,f=a/r,h=u*Math.PI*2,d=f*Math.PI,_=-o*Math.cos(h)*Math.sin(d),g=o*Math.cos(d),p=o*Math.sin(h)*Math.sin(d),v=Math.sqrt(_*_+g*g+p*p)||1;e.push(_,g,p),i.push(_/v,g/v,p/v),s.push(u,f)}for(let a=0;a<r;a++)for(let l=0;l<t;l++){const u=a*(t+1)+l,f=u+t+1;n.push(u,f,u+1,f,f+1,u+1)}return{positions:new Float32Array(e),normals:new Float32Array(i),uvs:new Float32Array(s),indices:new Uint16Array(n),triCount:n.length/3}}function hr(o){const t=o/2,r=[-t,-t,t,t,-t,t,t,t,t,-t,t,t,t,-t,-t,-t,-t,-t,-t,t,-t,t,t,-t,-t,t,t,t,t,t,t,t,-t,-t,t,-t,-t,-t,-t,t,-t,-t,t,-t,t,-t,-t,t,t,-t,t,t,-t,-t,t,t,-t,t,t,t,-t,-t,-t,-t,-t,t,-t,t,t,-t,t,-t],e=[0,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0],i=[0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1],s=[];for(let n=0;n<6;n++){const a=n*4;s.push(a,a+1,a+2,a,a+2,a+3)}return{positions:new Float32Array(r),normals:new Float32Array(e),uvs:new Float32Array(i),indices:new Uint16Array(s),triCount:s.length/3}}function ur(o,t,r,e){const i=[],s=[],n=[],a=[];function l(u){return u*=Math.PI*2,[(Math.sin(u)+2*Math.sin(2*u))*o,(Math.cos(u)-2*Math.cos(2*u))*o,-Math.sin(3*u)*o]}for(let u=0;u<=e;u++)for(let f=0;f<=r;f++){const h=f/r,d=u/e*Math.PI*2,_=l(h),g=l(h+.001),p=[g[0]-_[0],g[1]-_[1],g[2]-_[2]],v=Math.sqrt(p[0]*p[0]+p[1]*p[1]+p[2]*p[2])||1;p[0]/=v,p[1]/=v,p[2]/=v;let T=[0,1,0];Math.abs(p[1])>.99&&(T=[1,0,0]);const m=[p[1]*T[2]-p[2]*T[1],p[2]*T[0]-p[0]*T[2],p[0]*T[1]-p[1]*T[0]],E=Math.sqrt(m[0]*m[0]+m[1]*m[1]+m[2]*m[2])||1;m[0]/=E,m[1]/=E,m[2]/=E;const b=[m[1]*p[2]-m[2]*p[1],m[2]*p[0]-m[0]*p[2],m[0]*p[1]-m[1]*p[0]],y=Math.cos(d),R=Math.sin(d),S=y*b[0]+R*m[0],B=y*b[1]+R*m[1],G=y*b[2]+R*m[2];i.push(_[0]+t*S,_[1]+t*B,_[2]+t*G),s.push(S,B,G),n.push(h,u/e)}for(let u=0;u<e;u++)for(let f=0;f<r;f++){const h=u*(r+1)+f,d=h+r+1;a.push(h,d,h+1,d,d+1,h+1)}return{positions:new Float32Array(i),normals:new Float32Array(s),uvs:new Float32Array(n),indices:new Uint16Array(a),triCount:a.length/3}}function fr(o){const t=document.createElement("canvas");t.width=o,t.height=o;const r=t.getContext("2d"),e=r.createRadialGradient(o/2,o/2,0,o/2,o/2,o*.5);e.addColorStop(0,"#ff6b35"),e.addColorStop(.35,"#d63384"),e.addColorStop(.65,"#6f42c1"),e.addColorStop(1,"#0d6efd"),r.fillStyle=e,r.fillRect(0,0,o,o),r.globalCompositeOperation="multiply";const i=8,s=o/i;for(let n=0;n<i;n++)for(let a=0;a<i;a++)r.fillStyle=(n+a)%2===0?"rgba(255,255,255,0.85)":"rgba(60,60,80,0.85)",r.fillRect(a*s,n*s,s,s);r.globalCompositeOperation="screen";for(let n=1;n<=6;n++)r.beginPath(),r.arc(o/2,o/2,n*o*.07,0,Math.PI*2),r.lineWidth=2,r.strokeStyle=`hsla(${n*50},80%,70%,0.4)`,r.stroke();return r.globalCompositeOperation="source-over",r.getImageData(0,0,o,o)}const mt=`#version 300 es
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
}`,$t=`#version 300 es
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
void main(){vec4 c=texture(u_texture,v_uv);outColor=vec4(c.rgb,c.a*u_opacity);}`,w=document.getElementById("canvas"),_t=Math.min(devicePixelRatio,2);w.width=window.innerWidth*_t;w.height=window.innerHeight*_t;w.style.width="100%";w.style.height="100%";const c=w.getContext("webgl2",{depth:!0,antialias:!1,preserveDrawingBuffer:!0});if(!c)throw document.body.innerHTML='<h2 style="color:#fff;text-align:center;margin-top:40vh">WebGL2 required</h2>',new Error("WebGL2 required");c.getExtension("EXT_color_buffer_half_float");c.getExtension("EXT_color_buffer_float");window.addEventListener("resize",()=>{w.width=window.innerWidth*_t,w.height=window.innerHeight*_t});class _r{constructor(t){this.azimuth=.5,this.elevation=.35,this.distance=5,this.fov=Math.PI/4,this.near=.1,this.far=100,this.target=[0,0,0],this.canvas=t,this._vAz=0,this._vEl=0,this._vDist=0,this._friction=.93,this._zoomFriction=.87,this._sensitivity=.004,this._zoomSens=.001,this._springK=3.5,this._springDamp=.88,this._autopilot=!0,this._autoTimer=null,this._tAz=.5,this._tEl=.35,this._tDist=5,this._orbitSpeed=.12,this._choroElAmp=0,this._choroElFreq=0,this._choroDistAmp=0,this._choroDistFreq=0,this._pointers=new Map,this._pinchDist=0,this._minDist=1.5,this._maxDist=20,t.style.touchAction="none",t.style.userSelect="none",t.style.webkitUserSelect="none",t.addEventListener("pointerdown",this._down.bind(this)),t.addEventListener("pointermove",this._move.bind(this)),t.addEventListener("pointerup",this._up.bind(this)),t.addEventListener("pointercancel",this._up.bind(this)),t.addEventListener("wheel",this._wheel.bind(this),{passive:!1})}_down(t){if(this.canvas.setPointerCapture(t.pointerId),this._pointers.set(t.pointerId,{x:t.clientX,y:t.clientY}),this._vAz*=.3,this._vEl*=.3,this._autopilot=!1,clearTimeout(this._autoTimer),this._pointers.size===2){const[r,e]=[...this._pointers.values()];this._pinchDist=Math.hypot(e.x-r.x,e.y-r.y)}}_move(t){const r=this._pointers.get(t.pointerId);if(!r)return;const e=t.clientX-r.x,i=t.clientY-r.y;if(r.x=t.clientX,r.y=t.clientY,this._pointers.size===1){const s=e*this._sensitivity,n=i*this._sensitivity;this.azimuth+=s,this.elevation=Math.max(-1.4,Math.min(1.4,this.elevation+n)),this._vAz=this._vAz*.5+s*.5,this._vEl=this._vEl*.5+n*.5}else if(this._pointers.size===2){const[s,n]=[...this._pointers.values()],a=Math.hypot(n.x-s.x,n.y-s.y);if(this._pinchDist>10){const l=this._pinchDist/a;this.distance*=l,this._vDist=(l-1)*this.distance*.5}this._pinchDist=a,this.azimuth+=e*this._sensitivity*.3,this.elevation=Math.max(-1.4,Math.min(1.4,this.elevation+i*this._sensitivity*.3))}}_up(t){this._pointers.delete(t.pointerId),this._pinchDist=0,this._pointers.size===0&&this._scheduleAutoResume()}_wheel(t){t.preventDefault();const r=t.deltaY*this._zoomSens;this._vDist+=r*this.distance,this.distance*=1+r,this._autopilot=!1,clearTimeout(this._autoTimer),this._scheduleAutoResume()}_scheduleAutoResume(){clearTimeout(this._autoTimer),this._autoTimer=setTimeout(()=>{this._tAz=this.azimuth,this._tEl=this.elevation,this._tDist=this.distance,this._autopilot=!0},3500)}setTarget(t,r,e,i=.12,s=null){this._tAz=t,this._tEl=r,this._tDist=e,this._orbitSpeed=i,this._autopilot=!0,clearTimeout(this._autoTimer),s?(this._choroElAmp=s.elAmp||0,this._choroElFreq=s.elFreq||0,this._choroDistAmp=s.distAmp||0,this._choroDistFreq=s.distFreq||0):(this._choroElAmp=0,this._choroElFreq=0,this._choroDistAmp=0,this._choroDistFreq=0)}releaseAutopilot(){this._autopilot=!1,clearTimeout(this._autoTimer)}update(t,r){t=Math.min(t,.05);const e=Math.pow(this._friction,t*60),i=Math.pow(this._zoomFriction,t*60);if(this._pointers.size===0)if(this._autopilot){const s=this._choroElAmp*Math.sin(r*this._choroElFreq),n=this._choroDistAmp*Math.sin(r*this._choroDistFreq),a=this._springK*t;this._vAz+=(this._tAz-this.azimuth)*a,this._vEl+=(this._tEl+s-this.elevation)*a,this._vDist+=(this._tDist+n-this.distance)*a,this.azimuth+=this._vAz,this.elevation+=this._vEl,this.distance+=this._vDist,this._vAz*=this._springDamp,this._vEl*=this._springDamp,this._vDist*=this._springDamp,this._tAz+=this._orbitSpeed*t}else this.azimuth+=this._vAz,this.elevation+=this._vEl,this.distance+=this._vDist,this.elevation=Math.max(-1.4,Math.min(1.4,this.elevation)),this._vAz*=e,this._vEl*=e,this._vDist*=i,Math.abs(this._vAz)<1e-6&&(this._vAz=0),Math.abs(this._vEl)<1e-6&&(this._vEl=0),Math.abs(this._vDist)<1e-5&&(this._vDist=0);this.distance<this._minDist?(this.distance+=(this._minDist-this.distance)*.12,this._vDist*=.5):this.distance>this._maxDist&&(this.distance+=(this._maxDist-this.distance)*.12,this._vDist*=.5)}get eye(){const t=Math.cos(this.elevation),r=Math.sin(this.elevation),e=Math.cos(this.azimuth),i=Math.sin(this.azimuth);return[this.target[0]+this.distance*t*i,this.target[1]+this.distance*r,this.target[2]+this.distance*t*e]}get aspect(){return this.canvas.width/this.canvas.height}get viewMatrix(){return nr(this.eye,this.target,[0,1,0])}get projectionMatrix(){return sr(this.fov,this.aspect,this.near,this.far)}get viewProjection(){return ar(this.projectionMatrix,this.viewMatrix)}}const N=new _r(w),Q=new je(c,{lightDir:[.5,.8,.3],lightColor:[1,.98,.95],ambientColor:[.15,.15,.22],specularPower:48}),Mt=new ae(c,{pointScale:w.height/(2*Math.tan(Math.PI/8)),blendMode:"additive",animate:!0,intensity:1,chromatic:.4}),ft=new Ve(c,{layerCount:4,geometry:3,thickness:.6,patternScale:3,patternSpeed:.3,depthSensitivity:8,normalSensitivity:2,opacity:.8}),x=new qe(c,{exposure:1.2,gamma:2.2});x.setMeshRenderer(Q);x.setSplatRenderer(Mt);x.setEdgeInscription(ft);const K=new Qe({layerCount:4,transitionDuration:.5});K.registerObject(1,"active");let D=null,ne=null,le=3;{const o=c.createShader(c.VERTEX_SHADER);c.shaderSource(o,mt),c.compileShader(o);const t=c.createShader(c.FRAGMENT_SHADER);c.shaderSource(t,dr),c.compileShader(t),c.getShaderParameter(o,c.COMPILE_STATUS)&&c.getShaderParameter(t,c.COMPILE_STATUS)&&(D=c.createProgram(),c.attachShader(D,o),c.attachShader(D,t),c.linkProgram(D),c.getProgramParameter(D,c.LINK_STATUS)?ne=c.createVertexArray():D=null)}x.setProceduralRenderer((o,t)=>{D&&(c.useProgram(D),c.bindVertexArray(ne),c.uniform1f(c.getUniformLocation(D,"u_time"),t),c.uniform1f(c.getUniformLocation(D,"u_geometry"),le),c.uniform2f(c.getUniformLocation(D,"u_resolution"),o.width,o.height),c.drawArrays(c.TRIANGLES,0,3))});let xt=null;try{xt=new Je(c,{resolution:1024,bias:.003,pcfRadius:2,frustumSize:6,lightDir:[.5,.8,.3]}),xt.init()}catch{xt=null}let O=null;try{O=new er(c,{maxParticles:1e4,emitRate:50,lifetime:2.5,speed:.3,speedVariance:.15,gravity:[0,-.1,0],drag:.02,splatScale:.015,emitterType:"sphere",emitterRadius:1.2,colorStart:[.4,.7,1],colorEnd:[.8,.3,1],colorMode:"lerp"})}catch{O=null}let Rt=null;try{Rt=new rr(c,{maxSteps:48,density:.8,absorption:.4,geometry:3,primaryColor:[.3,.6,1],secondaryColor:[.8,.2,.9]}),Rt.init()}catch{Rt=null}let At=null;try{At=new ir(c,{lightDir:[.5,.8,.3],lightColor:[1,.98,.95],specularPower:32,specularStrength:.6,fresnelPower:3,inscriptionEmission:1.5}),At.init()}catch{At=null}let it=null;try{it=new or(c),it.setLayerCircuitPattern(0,{density:12,color:"#5b9cf5"}),it.setLayerText(1,"VIB3+",{fontSize:48,color:"#a78bfa"})}catch{it=null}let k=null;try{k=new ae(c,{pointScale:w.height/(2*Math.tan(Math.PI/8)),blendMode:"additive",animate:!0,intensity:1.5,chromatic:.6})}catch{k=null}let W=null,Qt=0,Jt=0;function pr(o,t){if(Qt===o&&Jt===t&&W)return;W&&(c.deleteFramebuffer(W.framebuffer),c.deleteTexture(W.texture));const r=c.createTexture();c.bindTexture(c.TEXTURE_2D,r),c.texImage2D(c.TEXTURE_2D,0,c.RGBA8,o,t,0,c.RGBA,c.UNSIGNED_BYTE,null),c.texParameteri(c.TEXTURE_2D,c.TEXTURE_MIN_FILTER,c.LINEAR),c.texParameteri(c.TEXTURE_2D,c.TEXTURE_MAG_FILTER,c.LINEAR),c.texParameteri(c.TEXTURE_2D,c.TEXTURE_WRAP_S,c.CLAMP_TO_EDGE),c.texParameteri(c.TEXTURE_2D,c.TEXTURE_WRAP_T,c.CLAMP_TO_EDGE);const e=c.createRenderbuffer();c.bindRenderbuffer(c.RENDERBUFFER,e),c.renderbufferStorage(c.RENDERBUFFER,c.DEPTH_COMPONENT24,o,t);const i=c.createFramebuffer();c.bindFramebuffer(c.FRAMEBUFFER,i),c.framebufferTexture2D(c.FRAMEBUFFER,c.COLOR_ATTACHMENT0,c.TEXTURE_2D,r,0),c.framebufferRenderbuffer(c.FRAMEBUFFER,c.DEPTH_ATTACHMENT,c.RENDERBUFFER,e),c.bindFramebuffer(c.FRAMEBUFFER,null),W={framebuffer:i,texture:r,depthRb:e},Qt=o,Jt=t}let A=null,ce=null;{const o=c.createShader(c.VERTEX_SHADER);c.shaderSource(o,($t.includes("v_uv"),mt)),c.compileShader(o);const t=c.createShader(c.FRAGMENT_SHADER);c.shaderSource(t,$t),c.compileShader(t),c.getShaderParameter(o,c.COMPILE_STATUS)&&c.getShaderParameter(t,c.COMPILE_STATUS)&&(A=c.createProgram(),c.attachShader(A,o),c.attachShader(A,t),c.linkProgram(A),c.getProgramParameter(A,c.LINK_STATUS)?ce=c.createVertexArray():A=null)}let P=null,he=null;{const o=c.createShader(c.VERTEX_SHADER);c.shaderSource(o,mt),c.compileShader(o);const t=c.createShader(c.FRAGMENT_SHADER);c.shaderSource(t,mr),c.compileShader(t),c.getShaderParameter(o,c.COMPILE_STATUS)&&c.getShaderParameter(t,c.COMPILE_STATUS)&&(P=c.createProgram(),c.attachShader(P,o),c.attachShader(P,t),c.linkProgram(P),c.getProgramParameter(P,c.LINK_STATUS)?he=c.createVertexArray():P=null)}function gr(o,t=1){P&&(c.useProgram(P),c.bindVertexArray(he),c.activeTexture(c.TEXTURE0),c.bindTexture(c.TEXTURE_2D,o),c.uniform1i(c.getUniformLocation(P,"u_texture"),0),c.uniform1f(c.getUniformLocation(P,"u_opacity"),t),c.drawArrays(c.TRIANGLES,0,3))}const Er={torus:()=>lr(1,.4,64,32),sphere:()=>cr(1.2,48,32),cube:()=>hr(1.8),knot:()=>ur(.35,.12,128,24)};let z=null,ot=[];const Tr=new Ke,at=fr(256);function ue(o){const t=Er[o];t&&(z=t(),Q.uploadGeometry(z),Q.uploadTexture(at),ot=Tr.convert({positions:z.positions,normals:z.normals,uvs:z.uvs,indices:z.indices,diffusePixels:at.data,diffuseWidth:at.width,diffuseHeight:at.height}),Mt.updateSeeds(oe(ot),ot.length),L("meshTris",z.triCount.toLocaleString()),L("splatCount",ot.length.toLocaleString()))}function vr(){const o=[];for(let r=0;r<2e5;r++){const e=Math.random()*Math.PI*2,i=Math.pow(Math.random(),.5)*3,s=Math.floor(Math.random()*3)*(Math.PI*2/3),n=e*.5;o.push({position:[i*Math.cos(e+s+n)+(Math.random()-.5)*.3,(Math.random()-.5)*.2*(1-i/3),i*Math.sin(e+s+n)+(Math.random()-.5)*.3],orientation:[1,0,0,0],scale:.015+Math.random()*.02,color:[.6+Math.random()*.4,.4+Math.random()*.4,.8+Math.random()*.2],depth:i*.3})}Mt.updateSeeds(oe(o),o.length),L("splatCount",2e5.toLocaleString())}const j=[{id:"hybrid-pipeline",title:"Hybrid Render Pipeline",desc:"Four compositing layers — Mesh, Gaussian Splats, Procedural Shader, Edge Inscription — rendered simultaneously into a unified framebuffer with per-layer blend modes and tonemapping.",tags:["WebGL 2.0","MRT GBuffer","4-Layer Compositor","Tone Mapping"],mesh:"knot",camera:{azimuth:.5,elevation:.35,distance:5},orbitSpeed:.14,choreography:{elAmp:.08,elFreq:.4,distAmp:.3,distFreq:.25},layers:{mesh:!0,splat:!0,procedural:!0,inscription:!0},v3:{shadows:!0,particles:!1,volumetric:!1,deferred:!0},procGeometry:3,state:"active",usecaseHighlight:0,capMetric:{key:"capLayers",value:"4"}},{id:"gaussian-splats",title:"200K Gaussian Splats",desc:"Real-time point cloud rendering with per-splat orientation quaternions, GPU-driven orbital animation, chromatic aberration, and HDR bloom — all at 60fps.",tags:["200K Points","GPU Animation","Chromatic Aberration","HDR Bloom","Quaternion Orientation"],mesh:null,camera:{azimuth:1,elevation:.15,distance:4},orbitSpeed:.22,choreography:{elAmp:.12,elFreq:.3,distAmp:.5,distFreq:.18},layers:{mesh:!1,splat:!0,procedural:!1,inscription:!1},v3:{shadows:!1,particles:!1,volumetric:!1,deferred:!1},procGeometry:3,state:"active",usecaseHighlight:4,capMetric:{key:"capLayers",value:"200K"}},{id:"edge-inscription",title:"Edge Inscription System",desc:"GBuffer-driven Sobel edge detection feeds a 4-layer procedural inscription system with 24 geometry variants, 4D rotation, and per-layer color, opacity, and pattern control.",tags:["Sobel Edge Detection","4 Inscription Layers","24 Geometries","4D Rotation","Audio Reactive"],mesh:"torus",camera:{azimuth:-.5,elevation:.4,distance:4.5},orbitSpeed:.1,choreography:{elAmp:.15,elFreq:.35,distAmp:.4,distFreq:.2},layers:{mesh:!0,splat:!1,procedural:!1,inscription:!0},v3:{shadows:!0,particles:!1,volumetric:!1,deferred:!0},procGeometry:7,state:"active",usecaseHighlight:1,capMetric:{key:"capGeometries",value:"24"}},{id:"state-machine",title:"Semantic State Machine",desc:"Object-aware inscription transitions between semantic states — idle, active, powered, damaged, destroyed — with smooth interpolation, priority overrides, and audio-reactive modulation.",tags:["5 Semantic States","Smooth Transitions","Priority System","Audio Mapping","Per-Object Identity"],mesh:"sphere",camera:{azimuth:.2,elevation:.3,distance:4.8},orbitSpeed:.08,choreography:{elAmp:.06,elFreq:.5,distAmp:.2,distFreq:.3},layers:{mesh:!0,splat:!0,procedural:!1,inscription:!0},v3:{shadows:!0,particles:!0,volumetric:!1,deferred:!0},procGeometry:5,state:"idle",usecaseHighlight:2,capMetric:{key:"capLayers",value:"5"}},{id:"volumetric-4d",title:"4D Volumetric Fields",desc:"Raymarched volumetric inscription with 48-step integration through 4D-rotated noise fields. Emission-absorption model constrained by GBuffer depth for physically-grounded volumetric effects.",tags:["48 Ray Steps","4D Noise Field","Emission-Absorption","Depth Constrained","Volumetric Rendering"],mesh:"cube",camera:{azimuth:.8,elevation:.25,distance:5.5},orbitSpeed:.06,choreography:{elAmp:.1,elFreq:.2,distAmp:.6,distFreq:.15},layers:{mesh:!0,splat:!1,procedural:!0,inscription:!0},v3:{shadows:!1,particles:!1,volumetric:!0,deferred:!1},procGeometry:1,state:"powered",usecaseHighlight:3,capMetric:{key:"capRotation",value:"6D"}},{id:"full-pipeline",title:"Full v3 Pipeline",desc:"All 15 features active simultaneously: Mesh renderer, Gaussian splats, procedural shader, edge inscription, shadow mapping, particle system, volumetric inscription, deferred lighting, and inscription textures — production-ready at 60fps.",tags:["15 Features","All Layers Active","Shadow + Particles","Volumetric","Deferred Lighting","60fps"],tagType:"purple",mesh:"knot",camera:{azimuth:0,elevation:.3,distance:4.8},orbitSpeed:.18,choreography:{elAmp:.12,elFreq:.45,distAmp:.35,distFreq:.22},layers:{mesh:!0,splat:!0,procedural:!0,inscription:!0},v3:{shadows:!0,particles:!0,volumetric:!1,deferred:!0},procGeometry:3,state:"active",usecaseHighlight:5,capMetric:{key:"capLayers",value:"15"}}];let I=0,q=0;const br=9;let H=!0,fe=!1,$=!1;const St=["idle","active","powered","damaged","destroyed"];let st=0,te=0;function J(o){const t=j[o];if(!t)return;t.mesh?ue(t.mesh):vr(),x.meshLayer.enabled=t.layers.mesh,x.splatLayer.enabled=t.layers.splat,x.proceduralLayer.enabled=t.layers.procedural,x.inscriptionLayer.enabled=t.layers.inscription,le=t.procGeometry,N.setTarget(t.camera.azimuth,t.camera.elevation,t.camera.distance,t.orbitSpeed||.12,t.choreography||null),K.setObjectState(1,t.state),xr(o),Rr(o),Ar(t.usecaseHighlight),t.capMetric&&Sr(t.capMetric.key,t.capMetric.value);const r=document.createElement("div");r.className="scene-flash",document.body.appendChild(r),setTimeout(()=>r.remove(),1500)}function yr(){I=(I+1)%j.length,q=performance.now()*.001,J(I)}function L(o,t){const r=document.getElementById(o);r&&(r.textContent=t)}function xr(o){const t=j[o],r=document.getElementById("narrative");r.classList.remove("visible"),r.classList.add("exit"),setTimeout(()=>{document.getElementById("sceneCounter").textContent=`${String(o+1).padStart(2,"0")} / ${String(j.length).padStart(2,"0")}`,document.getElementById("sceneTitle").textContent=t.title,document.getElementById("sceneDesc").textContent=t.desc;const e=document.getElementById("techTags");e.innerHTML=t.tags.map(i=>`<span class="tech-tag${t.tagType==="purple"?" purple":""}">${i}</span>`).join(""),r.classList.remove("exit"),r.classList.add("visible")},400)}function Rr(o){document.querySelectorAll(".progress-dot").forEach((t,r)=>{t.classList.toggle("active",r===o),t.classList.toggle("visited",r<o)}),document.getElementById("progressLabel").textContent=`Scene ${o+1} of ${j.length}`}function Ar(o){document.querySelectorAll(".usecase-tag").forEach(t=>{t.classList.toggle("highlight",parseInt(t.dataset.idx)===o)})}function Sr(o,t){const r=document.getElementById(o);r&&(r.textContent=t)}function Pt(){["top-bar","narrative","stats","progress-bar","usecases","capabilities"].forEach(o=>{document.getElementById(o).classList.add("visible")})}function de(){["narrative","progress-bar","capabilities","usecases"].forEach(o=>{const t=document.getElementById(o);t&&t.classList.remove("visible")})}document.getElementById("btnContact").addEventListener("click",()=>{document.getElementById("contact-panel").classList.add("visible")});document.getElementById("btnCloseContact").addEventListener("click",()=>{document.getElementById("contact-panel").classList.remove("visible")});document.getElementById("btnReplay").addEventListener("click",()=>{$=!1,H=!0,I=0,q=performance.now()*.001,document.getElementById("interactive-cta").classList.remove("visible"),Pt(),J(0)});document.getElementById("btnControls").addEventListener("click",()=>{$=!$,$?(H=!1,N.releaseAutopilot(),de(),document.getElementById("interactive-cta").classList.remove("visible"),x.meshLayer.enabled=!0,x.splatLayer.enabled=!0,x.proceduralLayer.enabled=!0,x.inscriptionLayer.enabled=!0):(H=!0,q=performance.now()*.001,Pt(),J(I))});document.getElementById("btnInteractive").addEventListener("click",()=>{$=!0,H=!1,N.releaseAutopilot(),document.getElementById("interactive-cta").classList.remove("visible"),de(),x.meshLayer.enabled=!0,x.splatLayer.enabled=!0,x.proceduralLayer.enabled=!0,x.inscriptionLayer.enabled=!0});document.querySelectorAll(".progress-dot").forEach(o=>{o.addEventListener("click",()=>{const t=parseInt(o.dataset.scene);I=t,q=performance.now()*.001,J(t)})});function Fr(){ue("knot"),setTimeout(()=>{document.getElementById("opening").classList.add("fade-out"),setTimeout(()=>{document.getElementById("opening").classList.add("hidden"),fe=!0,q=performance.now()*.001,Pt(),J(0)},1500)},3e3)}let nt=0,lt=performance.now(),Dr=performance.now(),ee=0,re=!0,ct=!1,Ft=!1,ie=!0,ht=.4;function me(){const o=performance.now(),t=(o-Dr)*.001,r=t-ee;ee=t;const e=c.canvas.width,i=c.canvas.height;N.update(r,t),ft.rot4dXY=t*.1,ft.rot4dYZ=t*.07,K.update(r);{const n=ht*(.5+.5*Math.sin(t*2.1)),a=ht*(.5+.5*Math.sin(t*3.7)),l=ht*(.5+.5*Math.sin(t*5.3)),u=ht*(.6+.4*Math.sin(t*1.3));K.setAudio(n,a,l,u)}if(H&&fe){const n=t-q;I===3&&n>1.5&&t-te>1.8&&(st=(st+1)%St.length,K.setObjectState(1,St[st]),L("currentState",St[st]),te=t),n>br&&(I<j.length-1?yr():(H=!1,document.getElementById("interactive-cta").classList.add("visible")));const a=j[I];a&&(re=a.v3.shadows,ct=a.v3.particles,Ft=a.v3.volumetric,ie=a.v3.deferred)}if(ct&&O){O.update(Math.min(r,.05));const{buffer:n,count:a}=O.getSplatBuffer();k&&a>0&&k.updateSeeds(n,a),L("particleCount",O.getAliveCount())}else L("particleCount","0");const s=x.render(t,N.viewMatrix,N.projectionMatrix,{viewProjection:N.viewProjection});if(ct&&k&&O&&O.getAliveCount()>0&&(pr(e,i),c.bindFramebuffer(c.FRAMEBUFFER,W.framebuffer),c.viewport(0,0,e,i),k.render(N.viewProjection,t),c.bindFramebuffer(c.FRAMEBUFFER,null),c.viewport(0,0,e,i),c.enable(c.BLEND),c.blendFunc(c.ONE,c.ONE),c.disable(c.DEPTH_TEST),gr(W.texture,1),c.disable(c.BLEND)),Ft&&A){c.enable(c.BLEND),c.blendFunc(c.ONE,c.ONE),c.useProgram(A),c.bindVertexArray(ce);const n=Q.gbuffer?Q.gbuffer.normalTexture:null;n&&(c.activeTexture(c.TEXTURE0),c.bindTexture(c.TEXTURE_2D,n),c.uniform1i(c.getUniformLocation(A,"u_normalDepth"),0)),c.uniform1f(c.getUniformLocation(A,"u_time"),t),c.uniform1f(c.getUniformLocation(A,"u_density"),.8),c.uniform1f(c.getUniformLocation(A,"u_absorption"),.4),c.uniform1f(c.getUniformLocation(A,"u_geometry"),ft.geometry||3),c.uniform2f(c.getUniformLocation(A,"u_resolution"),e,i),c.drawArrays(c.TRIANGLES,0,3),c.disable(c.BLEND)}if(nt++,o-lt>500){const n=Math.round(nt/((o-lt)/1e3)),a=((o-lt)/nt).toFixed(1);L("fps",n),L("frameTime",a+" ms"),document.getElementById("capFps").textContent=n;const l=(s?s.layersComposited:0)+(ct?1:0)+(Ft?1:0)+(re?1:0)+(ie?1:0);L("activeLayers",l),nt=0,lt=o}requestAnimationFrame(me)}Fr();me();
