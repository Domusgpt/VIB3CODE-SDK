const Zt=Object.freeze([1,0,0,0]),$t=Object.freeze([1,1,1]),Ce=12;function Et(r){const e=new Float32Array(r.length*Ce);return r.forEach((i,t)=>{const o=t*Ce,s=i.position??[0,0,0],n=i.orientation??Zt,a=i.color??$t,c=i.scale??1,u=i.depth??0;e[o+0]=s[0]??0,e[o+1]=s[1]??0,e[o+2]=s[2]??0,e[o+3]=c,e[o+4]=n[0]??1,e[o+5]=n[1]??0,e[o+6]=n[2]??0,e[o+7]=n[3]??0,e[o+8]=a[0]??1,e[o+9]=a[1]??1,e[o+10]=a[2]??1,e[o+11]=u}),e}const Kt=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),Qt=`#version 300 es
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
`,Jt=`#version 300 es
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
`;class Tt{constructor(e,{pointScale:i=14,blendMode:t="premultiplied",animate:o=!1,intensity:s=1,chromatic:n=0}={}){if(!e)throw new Error("GaussianSplatRenderer requires a WebGL2 context.");this.gl=e,this.pointScale=i,this.blendMode=t,this.animate=o,this.intensity=s,this.chromatic=n,this.program=null,this.vao=null,this.buffer=null,this.count=0,this.uniforms={},this._init()}_init(){const e=this.gl,i=e.createProgram(),t=this._compileShader(e.VERTEX_SHADER,Qt),o=this._compileShader(e.FRAGMENT_SHADER,Jt);if(e.attachShader(i,t),e.attachShader(i,o),e.linkProgram(i),!e.getProgramParameter(i,e.LINK_STATUS))throw new Error(e.getProgramInfoLog(i));this.program=i,this.vao=e.createVertexArray(),e.bindVertexArray(this.vao),this.buffer=e.createBuffer(),e.bindBuffer(e.ARRAY_BUFFER,this.buffer);const s=Ce*4,n=e.getAttribLocation(i,"a_position");e.enableVertexAttribArray(n),e.vertexAttribPointer(n,3,e.FLOAT,!1,s,0);const a=e.getAttribLocation(i,"a_scale");e.enableVertexAttribArray(a),e.vertexAttribPointer(a,1,e.FLOAT,!1,s,3*4);const c=e.getAttribLocation(i,"a_orientation");e.enableVertexAttribArray(c),e.vertexAttribPointer(c,4,e.FLOAT,!1,s,4*4);const u=e.getAttribLocation(i,"a_color");e.enableVertexAttribArray(u),e.vertexAttribPointer(u,3,e.FLOAT,!1,s,8*4);const f=e.getAttribLocation(i,"a_depth");e.enableVertexAttribArray(f),e.vertexAttribPointer(f,1,e.FLOAT,!1,s,11*4),e.bindVertexArray(null),this.uniforms.pointScale=e.getUniformLocation(i,"u_pointScale"),this.uniforms.viewProjection=e.getUniformLocation(i,"u_viewProjection"),this.uniforms.time=e.getUniformLocation(i,"u_time"),this.uniforms.animate=e.getUniformLocation(i,"u_animate"),this.uniforms.intensity=e.getUniformLocation(i,"u_intensity"),this.uniforms.chromatic=e.getUniformLocation(i,"u_chromatic")}_compileShader(e,i){const t=this.gl,o=t.createShader(e);if(t.shaderSource(o,i),t.compileShader(o),!t.getShaderParameter(o,t.COMPILE_STATUS))throw new Error(t.getShaderInfoLog(o));return o}updateSeeds(e,i){const t=this.gl;t.bindBuffer(t.ARRAY_BUFFER,this.buffer),t.bufferData(t.ARRAY_BUFFER,e,t.DYNAMIC_DRAW),this.count=i}render(e,i=0){const t=this.gl;this.count&&(t.viewport(0,0,t.canvas.width,t.canvas.height),t.clearColor(.012,.02,.05,1),t.clear(t.COLOR_BUFFER_BIT|t.DEPTH_BUFFER_BIT),t.enable(t.DEPTH_TEST),t.depthFunc(t.LEQUAL),t.depthMask(!1),t.enable(t.BLEND),this.blendMode==="additive"?t.blendFunc(t.ONE,t.ONE):t.blendFunc(t.ONE,t.ONE_MINUS_SRC_ALPHA),t.useProgram(this.program),t.bindVertexArray(this.vao),t.uniform1f(this.uniforms.pointScale,this.pointScale),t.uniform1f(this.uniforms.time,i),t.uniform1f(this.uniforms.animate,this.animate?1:0),t.uniform1f(this.uniforms.intensity,this.intensity),t.uniform1f(this.uniforms.chromatic,this.chromatic),t.uniformMatrix4fv(this.uniforms.viewProjection,!1,e||Kt),t.drawArrays(t.POINTS,0,this.count),t.bindVertexArray(null),t.depthMask(!0),t.disable(t.BLEND))}}const er=`#version 300 es
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
`,tr=`#version 300 es
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
`;function rr(r,e,i){const t=r.createFramebuffer();r.bindFramebuffer(r.FRAMEBUFFER,t);const o=r.createTexture();r.bindTexture(r.TEXTURE_2D,o),r.texImage2D(r.TEXTURE_2D,0,r.RGBA8,e,i,0,r.RGBA,r.UNSIGNED_BYTE,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,o,0);const s=r.createTexture();r.bindTexture(r.TEXTURE_2D,s);let n=r.RGBA8,a=r.UNSIGNED_BYTE;(r.getExtension("EXT_color_buffer_half_float")||r.getExtension("EXT_color_buffer_float"))&&(n=r.RGBA16F,a=r.HALF_FLOAT),r.texImage2D(r.TEXTURE_2D,0,n,e,i,0,r.RGBA,a,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT1,r.TEXTURE_2D,s,0);const c=r.createTexture();r.bindTexture(r.TEXTURE_2D,c),r.texImage2D(r.TEXTURE_2D,0,r.RGBA8,e,i,0,r.RGBA,r.UNSIGNED_BYTE,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT2,r.TEXTURE_2D,c,0);const u=r.createRenderbuffer();return r.bindRenderbuffer(r.RENDERBUFFER,u),r.renderbufferStorage(r.RENDERBUFFER,r.DEPTH_COMPONENT24,e,i),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.RENDERBUFFER,u),r.drawBuffers([r.COLOR_ATTACHMENT0,r.COLOR_ATTACHMENT1,r.COLOR_ATTACHMENT2]),r.bindFramebuffer(r.FRAMEBUFFER,null),{framebuffer:t,colorTexture:o,normalTexture:s,objectIDTexture:c,depthRenderbuffer:u,width:e,height:i}}function Je(r,e){r.deleteFramebuffer(e.framebuffer),r.deleteTexture(e.colorTexture),r.deleteTexture(e.normalTexture),r.deleteTexture(e.objectIDTexture),r.deleteRenderbuffer(e.depthRenderbuffer)}class ir{constructor(e,{lightDir:i=[.4,.8,.3],lightColor:t=[1,.98,.95],ambientColor:o=[.12,.12,.18],specularPower:s=32}={}){this.gl=e,this.lightDir=i,this.lightColor=t,this.ambientColor=o,this.specularPower=s,this.opacity=1,this.objectID=0,this.morphWeight=0,this._hasMorphTarget=!1,this._program=null,this._vao=null,this._posBuf=null,this._nrmBuf=null,this._uvBuf=null,this._colBuf=null,this._morphPosBuf=null,this._morphNrmBuf=null,this._idxBuf=null,this._indexCount=0,this._vertexCount=0,this._indexType=0,this._diffuseTexture=null,this._hasTexture=!1,this._gbuffer=null,this._gbufferWidth=0,this._gbufferHeight=0,this._uniforms={},this._init()}_init(){const e=this.gl;this._program=this._createProgram(er,tr);const i=u=>e.getUniformLocation(this._program,u);this._uniforms={modelView:i("u_modelView"),projection:i("u_projection"),normalMatrix:i("u_normalMatrix"),rotation4D:i("u_rotation4D"),projDistance:i("u_projDistance"),use4D:i("u_use4D"),morphWeight:i("u_morphWeight"),hasMorphTarget:i("u_hasMorphTarget"),diffuseMap:i("u_diffuseMap"),hasTexture:i("u_hasTexture"),lightDir:i("u_lightDir"),lightColor:i("u_lightColor"),ambientColor:i("u_ambientColor"),specularPower:i("u_specularPower"),opacity:i("u_opacity"),objectID:i("u_objectID")},this._vao=e.createVertexArray(),e.bindVertexArray(this._vao),this._posBuf=e.createBuffer();const t=e.getAttribLocation(this._program,"a_position");e.bindBuffer(e.ARRAY_BUFFER,this._posBuf),e.enableVertexAttribArray(t),e.vertexAttribPointer(t,3,e.FLOAT,!1,0,0),this._nrmBuf=e.createBuffer();const o=e.getAttribLocation(this._program,"a_normal");e.bindBuffer(e.ARRAY_BUFFER,this._nrmBuf),e.enableVertexAttribArray(o),e.vertexAttribPointer(o,3,e.FLOAT,!1,0,0),this._uvBuf=e.createBuffer();const s=e.getAttribLocation(this._program,"a_uv");e.bindBuffer(e.ARRAY_BUFFER,this._uvBuf),e.enableVertexAttribArray(s),e.vertexAttribPointer(s,2,e.FLOAT,!1,0,0),this._colBuf=e.createBuffer();const n=e.getAttribLocation(this._program,"a_color");e.bindBuffer(e.ARRAY_BUFFER,this._colBuf),e.enableVertexAttribArray(n),e.vertexAttribPointer(n,4,e.FLOAT,!1,0,0),this._morphPosBuf=e.createBuffer();const a=e.getAttribLocation(this._program,"a_morphPosition");a>=0&&(e.bindBuffer(e.ARRAY_BUFFER,this._morphPosBuf),e.enableVertexAttribArray(a),e.vertexAttribPointer(a,3,e.FLOAT,!1,0,0)),this._morphNrmBuf=e.createBuffer();const c=e.getAttribLocation(this._program,"a_morphNormal");c>=0&&(e.bindBuffer(e.ARRAY_BUFFER,this._morphNrmBuf),e.enableVertexAttribArray(c),e.vertexAttribPointer(c,3,e.FLOAT,!1,0,0)),this._idxBuf=e.createBuffer(),e.bindVertexArray(null)}uploadGeometry({positions:e,normals:i,uvs:t,colors:o,indices:s}){const n=this.gl,a=e.length/3;if(this._vertexCount=a,n.bindBuffer(n.ARRAY_BUFFER,this._posBuf),n.bufferData(n.ARRAY_BUFFER,e,n.DYNAMIC_DRAW),i)n.bindBuffer(n.ARRAY_BUFFER,this._nrmBuf),n.bufferData(n.ARRAY_BUFFER,i,n.DYNAMIC_DRAW);else{const c=new Float32Array(a*3);for(let u=0;u<a;u++)c[u*3+1]=1;n.bindBuffer(n.ARRAY_BUFFER,this._nrmBuf),n.bufferData(n.ARRAY_BUFFER,c,n.DYNAMIC_DRAW)}if(t?(n.bindBuffer(n.ARRAY_BUFFER,this._uvBuf),n.bufferData(n.ARRAY_BUFFER,t,n.DYNAMIC_DRAW)):(n.bindBuffer(n.ARRAY_BUFFER,this._uvBuf),n.bufferData(n.ARRAY_BUFFER,new Float32Array(a*2),n.DYNAMIC_DRAW)),o)n.bindBuffer(n.ARRAY_BUFFER,this._colBuf),n.bufferData(n.ARRAY_BUFFER,o,n.DYNAMIC_DRAW);else{const c=new Float32Array(a*4);for(let u=0;u<a;u++)c[u*4]=1,c[u*4+1]=1,c[u*4+2]=1,c[u*4+3]=1;n.bindBuffer(n.ARRAY_BUFFER,this._colBuf),n.bufferData(n.ARRAY_BUFFER,c,n.DYNAMIC_DRAW)}n.bindBuffer(n.ARRAY_BUFFER,this._morphPosBuf),n.bufferData(n.ARRAY_BUFFER,e,n.DYNAMIC_DRAW),n.bindBuffer(n.ARRAY_BUFFER,this._morphNrmBuf),n.bufferData(n.ARRAY_BUFFER,i||new Float32Array(a*3),n.DYNAMIC_DRAW),s?(n.bindBuffer(n.ELEMENT_ARRAY_BUFFER,this._idxBuf),n.bufferData(n.ELEMENT_ARRAY_BUFFER,s,n.STATIC_DRAW),this._indexCount=s.length,this._indexType=s instanceof Uint32Array?n.UNSIGNED_INT:n.UNSIGNED_SHORT):this._indexCount=0}uploadMorphTarget(e,i){const t=this.gl;t.bindBuffer(t.ARRAY_BUFFER,this._morphPosBuf),t.bufferData(t.ARRAY_BUFFER,e,t.DYNAMIC_DRAW),i&&(t.bindBuffer(t.ARRAY_BUFFER,this._morphNrmBuf),t.bufferData(t.ARRAY_BUFFER,i,t.DYNAMIC_DRAW)),this._hasMorphTarget=!0}uploadTexture(e){const i=this.gl;this._diffuseTexture||(this._diffuseTexture=i.createTexture()),i.bindTexture(i.TEXTURE_2D,this._diffuseTexture),e instanceof ImageData?i.texImage2D(i.TEXTURE_2D,0,i.RGBA,e.width,e.height,0,i.RGBA,i.UNSIGNED_BYTE,e.data):i.texImage2D(i.TEXTURE_2D,0,i.RGBA,i.RGBA,i.UNSIGNED_BYTE,e),i.generateMipmap(i.TEXTURE_2D),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.LINEAR_MIPMAP_LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.REPEAT),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.REPEAT),this._hasTexture=!0}_ensureGBuffer(e,i){this._gbuffer&&this._gbufferWidth===e&&this._gbufferHeight===i||(this._gbuffer&&Je(this.gl,this._gbuffer),this._gbuffer=rr(this.gl,e,i),this._gbufferWidth=e,this._gbufferHeight=i)}get gbuffer(){return this._gbuffer}render(e,i,{rotation4D:t=null,projDistance:o=2,width:s=0,height:n=0,clearBuffer:a=!0}={}){const c=this.gl,u=s||c.canvas.width,f=n||c.canvas.height;if(this._ensureGBuffer(u,f),c.bindFramebuffer(c.FRAMEBUFFER,this._gbuffer.framebuffer),c.viewport(0,0,u,f),a&&(c.clearColor(0,0,0,0),c.clear(c.COLOR_BUFFER_BIT|c.DEPTH_BUFFER_BIT)),this._vertexCount===0&&this._indexCount===0)return c.bindFramebuffer(c.FRAMEBUFFER,null),this._gbuffer;c.enable(c.DEPTH_TEST),c.depthFunc(c.LEQUAL),c.depthMask(!0),c.enable(c.CULL_FACE),c.cullFace(c.BACK),c.disable(c.BLEND),c.useProgram(this._program),c.bindVertexArray(this._vao),this._indexCount>0&&c.bindBuffer(c.ELEMENT_ARRAY_BUFFER,this._idxBuf);const h=this._uniforms,d=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);return c.uniformMatrix4fv(h.modelView,!1,e||d),c.uniformMatrix4fv(h.projection,!1,i||d),c.uniformMatrix4fv(h.normalMatrix,!1,e||d),c.uniformMatrix4fv(h.rotation4D,!1,t||d),c.uniform1f(h.projDistance,o),c.uniform1f(h.use4D,t?1:0),c.uniform1f(h.morphWeight,this.morphWeight),c.uniform1f(h.hasMorphTarget,this._hasMorphTarget?1:0),c.uniform3fv(h.lightDir,this.lightDir),c.uniform3fv(h.lightColor,this.lightColor),c.uniform3fv(h.ambientColor,this.ambientColor),c.uniform1f(h.specularPower,this.specularPower),c.uniform1f(h.opacity,this.opacity),c.uniform1f(h.objectID,this.objectID),this._hasTexture&&this._diffuseTexture?(c.activeTexture(c.TEXTURE0),c.bindTexture(c.TEXTURE_2D,this._diffuseTexture),c.uniform1i(h.diffuseMap,0),c.uniform1f(h.hasTexture,1)):c.uniform1f(h.hasTexture,0),this._indexCount>0?c.drawElements(c.TRIANGLES,this._indexCount,this._indexType,0):c.drawArrays(c.TRIANGLES,0,this._vertexCount),c.bindVertexArray(null),c.bindFramebuffer(c.FRAMEBUFFER,null),c.disable(c.CULL_FACE),this._gbuffer}_createProgram(e,i){const t=this.gl,o=t.createProgram(),s=this._compile(t.VERTEX_SHADER,e),n=this._compile(t.FRAGMENT_SHADER,i);if(t.attachShader(o,s),t.attachShader(o,n),t.linkProgram(o),!t.getProgramParameter(o,t.LINK_STATUS))throw new Error("MeshRenderer link error: "+t.getProgramInfoLog(o));return o}_compile(e,i){const t=this.gl,o=t.createShader(e);if(t.shaderSource(o,i),t.compileShader(o),!t.getShaderParameter(o,t.COMPILE_STATUS))throw new Error("MeshRenderer compile error: "+t.getShaderInfoLog(o));return o}dispose(){const e=this.gl;e.deleteProgram(this._program),e.deleteVertexArray(this._vao),e.deleteBuffer(this._posBuf),e.deleteBuffer(this._nrmBuf),e.deleteBuffer(this._uvBuf),e.deleteBuffer(this._colBuf),e.deleteBuffer(this._morphPosBuf),e.deleteBuffer(this._morphNrmBuf),e.deleteBuffer(this._idxBuf),this._diffuseTexture&&e.deleteTexture(this._diffuseTexture),this._gbuffer&&Je(e,this._gbuffer)}}const et=`#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
    float x = float((gl_VertexID & 1) << 2) - 1.0;
    float y = float((gl_VertexID & 2) << 1) - 1.0;
    v_uv = vec2(x, y) * 0.5 + 0.5;
    gl_Position = vec4(x, y, 0.0, 1.0);
}
`,or=`#version 300 es
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
`,ar=`#version 300 es
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
`;function tt(r,e,i){const t=r.createTexture();r.bindTexture(r.TEXTURE_2D,t),r.texImage2D(r.TEXTURE_2D,0,r.RGBA8,e,i,0,r.RGBA,r.UNSIGNED_BYTE,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE);const o=r.createFramebuffer();return r.bindFramebuffer(r.FRAMEBUFFER,o),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,t,0),r.bindFramebuffer(r.FRAMEBUFFER,null),{framebuffer:o,texture:t,width:e,height:i}}function se(r,e){r.deleteFramebuffer(e.framebuffer),r.deleteTexture(e.texture)}const rt=[[.2,.6,1],[.8,.3,1],[1,.5,.2],[.3,1,.6],[1,.2,.5],[.4,.9,.9],[.9,.8,.2],[.5,.3,1],[.2,1,.4],[1,.4,0],[.6,.2,.9],[0,.8,.8],[1,.6,.6],[.3,.5,1],[.8,1,.3],[.9,.3,.6]];function it(r,e){const i=e>1?r/(e-1):0;return{geometry:r*3%24,thickness:.3+i*.5,opacity:.9-i*.5,color:rt[r%rt.length],patternScale:3+r*.5,patternSpeed:.3+r*.05,rotOffset:r*.4}}class sr{constructor(e,{layerCount:i=4,depthSensitivity:t=8,normalSensitivity:o=2,globalThickness:s=.6,layers:n=null}={}){if(this.gl=e,this.layerCount=Math.min(16,Math.max(1,i)),this.depthSensitivity=t,this.normalSensitivity=o,this.globalThickness=s,this.rot4dXY=0,this.rot4dXZ=0,this.rot4dYZ=0,this.rot4dXW=0,this.rot4dYW=0,this.rot4dZW=0,this.bass=0,this.mid=0,this.high=0,this.energy=0,this.layers=n||[],this.layers.length===0)for(let a=0;a<this.layerCount;a++)this.layers.push(it(a,this.layerCount));this._edgeProgram=null,this._inscriptionProgram=null,this._quadVao=null,this._edgeFBO=null,this._compositeFBO=null,this._width=0,this._height=0,this._blackTexture=null,this._edgeUniforms={},this._inscUniforms={},this._init()}_init(){const e=this.gl;this._edgeProgram=this._createProgram(et,or),this._inscriptionProgram=this._createProgram(et,ar),this._quadVao=e.createVertexArray(),this._blackTexture=e.createTexture(),e.bindTexture(e.TEXTURE_2D,this._blackTexture),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,new Uint8Array([0,0,0,0])),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),this._cacheEdgeUniforms(),this._cacheInscriptionUniforms()}_cacheEdgeUniforms(){const e=this.gl,i=this._edgeProgram;this._edgeUniforms={normalDepth:e.getUniformLocation(i,"u_normalDepth"),objectID:e.getUniformLocation(i,"u_objectID"),texelSize:e.getUniformLocation(i,"u_texelSize"),depthSensitivity:e.getUniformLocation(i,"u_depthSensitivity"),normalSensitivity:e.getUniformLocation(i,"u_normalSensitivity"),hasObjectID:e.getUniformLocation(i,"u_hasObjectID")}}_cacheInscriptionUniforms(){const e=this.gl,i=this._inscriptionProgram,t=o=>e.getUniformLocation(i,o);this._inscUniforms={edgeMap:t("u_edgeMap"),normalDepth:t("u_normalDepth"),time:t("u_time"),layerCount:t("u_layerCount"),resolution:t("u_resolution"),dpr:t("u_dpr"),globalThickness:t("u_globalThickness"),rot4dXY:t("u_rot4dXY"),rot4dXZ:t("u_rot4dXZ"),rot4dYZ:t("u_rot4dYZ"),rot4dXW:t("u_rot4dXW"),rot4dYW:t("u_rot4dYW"),rot4dZW:t("u_rot4dZW"),bass:t("u_bass"),mid:t("u_mid"),high:t("u_high"),energy:t("u_energy"),geometries:[],thicknesses:[],opacities:[],colors:[],patternScales:[],patternSpeeds:[],rotOffsets:[]};for(let o=0;o<16;o++)this._inscUniforms.geometries[o]=t(`u_layerGeometries[${o}]`),this._inscUniforms.thicknesses[o]=t(`u_layerThicknesses[${o}]`),this._inscUniforms.opacities[o]=t(`u_layerOpacities[${o}]`),this._inscUniforms.colors[o]=t(`u_layerColors[${o}]`),this._inscUniforms.patternScales[o]=t(`u_layerPatternScales[${o}]`),this._inscUniforms.patternSpeeds[o]=t(`u_layerPatternSpeeds[${o}]`),this._inscUniforms.rotOffsets[o]=t(`u_layerRotOffsets[${o}]`)}_ensureFBOs(e,i){if(this._width===e&&this._height===i)return;const t=this.gl;this._edgeFBO&&se(t,this._edgeFBO),this._compositeFBO&&se(t,this._compositeFBO),this._edgeFBO=tt(t,e,i),this._compositeFBO=tt(t,e,i),this._width=e,this._height=i}setLayerCount(e){for(e=Math.min(16,Math.max(1,e));this.layers.length<e;)this.layers.push(it(this.layers.length,e));this.layerCount=e}setLayerConfig(e,i){e>=0&&e<this.layers.length&&Object.assign(this.layers[e],i)}setAudio(e,i,t,o){this.bass=e||0,this.mid=i||0,this.high=t||0,this.energy=o||0}render(e,i,{width:t=0,height:o=0,objectIDTexture:s=null,dpr:n=1}={}){const a=this.gl,c=t||a.canvas.width,u=o||a.canvas.height;this._ensureFBOs(c,u),a.bindFramebuffer(a.FRAMEBUFFER,this._edgeFBO.framebuffer),a.viewport(0,0,c,u),a.disable(a.DEPTH_TEST),a.disable(a.BLEND),a.useProgram(this._edgeProgram),a.bindVertexArray(this._quadVao);const f=this._edgeUniforms;a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,e),a.uniform1i(f.normalDepth,0),a.activeTexture(a.TEXTURE1),a.bindTexture(a.TEXTURE_2D,s||this._blackTexture),a.uniform1i(f.objectID,1),a.uniform2f(f.texelSize,1/c,1/u),a.uniform1f(f.depthSensitivity,this.depthSensitivity),a.uniform1f(f.normalSensitivity,this.normalSensitivity),a.uniform1f(f.hasObjectID,s?1:0),a.drawArrays(a.TRIANGLES,0,3),a.bindFramebuffer(a.FRAMEBUFFER,this._compositeFBO.framebuffer),a.viewport(0,0,c,u),a.clearColor(0,0,0,0),a.clear(a.COLOR_BUFFER_BIT),a.disable(a.BLEND),a.useProgram(this._inscriptionProgram),a.bindVertexArray(this._quadVao);const h=this._inscUniforms;a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,this._edgeFBO.texture),a.uniform1i(h.edgeMap,0),a.activeTexture(a.TEXTURE1),a.bindTexture(a.TEXTURE_2D,e),a.uniform1i(h.normalDepth,1),a.uniform1f(h.time,i),a.uniform1i(h.layerCount,this.layerCount),a.uniform2f(h.resolution,c,u),a.uniform1f(h.dpr,n),a.uniform1f(h.globalThickness,this.globalThickness),a.uniform1f(h.rot4dXY,this.rot4dXY),a.uniform1f(h.rot4dXZ,this.rot4dXZ),a.uniform1f(h.rot4dYZ,this.rot4dYZ),a.uniform1f(h.rot4dXW,this.rot4dXW),a.uniform1f(h.rot4dYW,this.rot4dYW),a.uniform1f(h.rot4dZW,this.rot4dZW),a.uniform1f(h.bass,this.bass),a.uniform1f(h.mid,this.mid),a.uniform1f(h.high,this.high),a.uniform1f(h.energy,this.energy);for(let d=0;d<this.layerCount;d++){const m=this.layers[d];a.uniform1f(h.geometries[d],m.geometry),a.uniform1f(h.thicknesses[d],m.thickness),a.uniform1f(h.opacities[d],m.opacity),a.uniform3fv(h.colors[d],m.color),a.uniform1f(h.patternScales[d],m.patternScale),a.uniform1f(h.patternSpeeds[d],m.patternSpeed),a.uniform1f(h.rotOffsets[d],m.rotOffset)}return a.drawArrays(a.TRIANGLES,0,3),a.bindFramebuffer(a.FRAMEBUFFER,null),this._compositeFBO}get edgeTexture(){return this._edgeFBO?this._edgeFBO.texture:null}get compositeTexture(){return this._compositeFBO?this._compositeFBO.texture:null}_createProgram(e,i){const t=this.gl,o=t.createProgram(),s=this._compile(t.VERTEX_SHADER,e),n=this._compile(t.FRAGMENT_SHADER,i);if(t.attachShader(o,s),t.attachShader(o,n),t.linkProgram(o),!t.getProgramParameter(o,t.LINK_STATUS))throw new Error("EdgeInscriptionLayer link error: "+t.getProgramInfoLog(o));return o}_compile(e,i){const t=this.gl,o=t.createShader(e);if(t.shaderSource(o,i),t.compileShader(o),!t.getShaderParameter(o,t.COMPILE_STATUS))throw new Error("EdgeInscriptionLayer compile error: "+t.getShaderInfoLog(o));return o}dispose(){const e=this.gl;e.deleteProgram(this._edgeProgram),e.deleteProgram(this._inscriptionProgram),e.deleteVertexArray(this._quadVao),e.deleteTexture(this._blackTexture),this._edgeFBO&&se(e,this._edgeFBO),this._compositeFBO&&se(e,this._compositeFBO)}}const ot=`#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
    float x = float((gl_VertexID & 1) << 2) - 1.0;
    float y = float((gl_VertexID & 2) << 1) - 1.0;
    v_uv = vec2(x, y) * 0.5 + 0.5;
    gl_Position = vec4(x, y, 0.0, 1.0);
}
`,nr=`#version 300 es
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
`,lr=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 outColor;
void main() {
    outColor = texture(u_texture, v_uv);
}
`;function at(r,e,i){const t=r.createTexture();r.bindTexture(r.TEXTURE_2D,t),r.texImage2D(r.TEXTURE_2D,0,r.RGBA8,e,i,0,r.RGBA,r.UNSIGNED_BYTE,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE);const o=r.createRenderbuffer();r.bindRenderbuffer(r.RENDERBUFFER,o),r.renderbufferStorage(r.RENDERBUFFER,r.DEPTH_COMPONENT24,e,i);const s=r.createFramebuffer();return r.bindFramebuffer(r.FRAMEBUFFER,s),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,t,0),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.RENDERBUFFER,o),r.bindFramebuffer(r.FRAMEBUFFER,null),{framebuffer:s,texture:t,depthRb:o,width:e,height:i}}function ne(r,e){r.deleteFramebuffer(e.framebuffer),r.deleteTexture(e.texture),r.deleteRenderbuffer(e.depthRb)}const pe=Object.freeze({ALPHA:0,ADDITIVE:1,MULTIPLY:2,SCREEN:3});function le(r={}){return{enabled:!0,opacity:1,blendMode:pe.ALPHA,...r}}class cr{constructor(e,{exposure:i=1.2,gamma:t=2.2}={}){this.gl=e,this.exposure=i,this.gamma=t,this._meshRenderer=null,this._sceneRenderer=null,this._splatRenderer=null,this._proceduralRenderer=null,this._edgeInscription=null,this._inscriptionChannel=null,this._dpr=1,this.meshLayer=le(),this.splatLayer=le({blendMode:pe.ADDITIVE,opacity:.9}),this.proceduralLayer=le({blendMode:pe.SCREEN,opacity:.5}),this.inscriptionLayer=le({blendMode:pe.ADDITIVE,opacity:.8}),this._compositeProgram=null,this._blitProgram=null,this._quadVao=null,this._splatFBO=null,this._proceduralFBO=null,this._width=0,this._height=0,this._blackTexture=null,this._init()}_init(){const e=this.gl;this._compositeProgram=this._createProgram(ot,nr),this._blitProgram=this._createProgram(ot,lr),this._quadVao=e.createVertexArray(),this._blackTexture=e.createTexture(),e.bindTexture(e.TEXTURE_2D,this._blackTexture),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,new Uint8Array([0,0,0,0])),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST)}_ensureFBOs(e,i){if(this._width===e&&this._height===i)return;const t=this.gl;this._splatFBO&&ne(t,this._splatFBO),this._proceduralFBO&&ne(t,this._proceduralFBO),this._splatFBO=at(t,e,i),this._proceduralFBO=at(t,e,i),this._width=e,this._height=i}setMeshRenderer(e){this._meshRenderer=e}setSceneRenderer(e){this._sceneRenderer=e}setSplatRenderer(e){this._splatRenderer=e}setProceduralRenderer(e){this._proceduralRenderer=e}setEdgeInscription(e){this._edgeInscription=e}setInscriptionChannel(e){this._inscriptionChannel=e}setDPR(e){this._dpr=e}render(e,i,t,{viewProjection:o=null,rotation4D:s=null,projDistance:n=2}={}){const a=this.gl,c=a.canvas.width,u=a.canvas.height;this._ensureFBOs(c,u);const f={meshRendered:!1,splatRendered:!1,proceduralRendered:!1,inscriptionRendered:!1,layersComposited:0};let h=this._blackTexture,d=this._blackTexture,m=this._blackTexture,g=this._blackTexture,p=null,v=null,T=null;if(this._sceneRenderer&&this.meshLayer.enabled){const E=this._sceneRenderer.render(i,t,{rotation4D:s,projDistance:n,width:c,height:u});T=E.gbuffer,T&&(h=T.colorTexture,p=T.normalTexture,v=T.objectIDTexture||null,f.meshRendered=!0,f.objectCount=E.objectCount)}else if(this._meshRenderer&&this.meshLayer.enabled){const E=this._meshRenderer.render(i,t,{rotation4D:s,projDistance:n,width:c,height:u});T=E,h=E.colorTexture,p=E.normalTexture,v=E.objectIDTexture||null,f.meshRendered=!0}if(this._splatRenderer&&this.splatLayer.enabled){a.bindFramebuffer(a.FRAMEBUFFER,this._splatFBO.framebuffer),a.viewport(0,0,c,u),a.clearColor(0,0,0,0),a.clear(a.COLOR_BUFFER_BIT|a.DEPTH_BUFFER_BIT),f.meshRendered&&T&&(a.bindFramebuffer(a.READ_FRAMEBUFFER,T.framebuffer),a.bindFramebuffer(a.DRAW_FRAMEBUFFER,this._splatFBO.framebuffer),a.blitFramebuffer(0,0,c,u,0,0,c,u,a.DEPTH_BUFFER_BIT,a.NEAREST),a.bindFramebuffer(a.FRAMEBUFFER,this._splatFBO.framebuffer));const E=o||new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),x=this._splatFBO.framebuffer;a.bindFramebuffer(a.FRAMEBUFFER,x),a.viewport(0,0,c,u),this._splatRenderer.render&&(this._splatRenderer.render(E,e),a.bindFramebuffer(a.FRAMEBUFFER,this._splatFBO.framebuffer),this._splatRenderer._drawSplats&&(a.viewport(0,0,c,u),a.clearColor(0,0,0,0),a.clear(a.COLOR_BUFFER_BIT),this._splatRenderer._drawSplats(E,e))),d=this._splatFBO.texture,f.splatRendered=!0}if(this._proceduralRenderer&&this.proceduralLayer.enabled&&(a.bindFramebuffer(a.FRAMEBUFFER,this._proceduralFBO.framebuffer),a.viewport(0,0,c,u),a.clearColor(0,0,0,0),a.clear(a.COLOR_BUFFER_BIT),this._proceduralRenderer(this._proceduralFBO,e),m=this._proceduralFBO.texture,f.proceduralRendered=!0),this._edgeInscription&&this.inscriptionLayer.enabled&&p){if(this._inscriptionChannel){const x=this._inscriptionChannel.registeredObjects,y=x.length>0?x[0]:0;this._inscriptionChannel.applyToLayer(this._edgeInscription,y)}g=this._edgeInscription.render(p,e,{width:c,height:u,objectIDTexture:v,dpr:this._dpr}).texture,f.inscriptionRendered=!0}a.bindFramebuffer(a.FRAMEBUFFER,null),a.viewport(0,0,c,u),a.disable(a.DEPTH_TEST),a.disable(a.BLEND),a.useProgram(this._compositeProgram),a.bindVertexArray(this._quadVao);const _=this._compositeProgram;return a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,h),a.uniform1i(a.getUniformLocation(_,"u_meshLayer"),0),a.activeTexture(a.TEXTURE1),a.bindTexture(a.TEXTURE_2D,d),a.uniform1i(a.getUniformLocation(_,"u_splatLayer"),1),a.activeTexture(a.TEXTURE2),a.bindTexture(a.TEXTURE_2D,m),a.uniform1i(a.getUniformLocation(_,"u_proceduralLayer"),2),a.activeTexture(a.TEXTURE3),a.bindTexture(a.TEXTURE_2D,g),a.uniform1i(a.getUniformLocation(_,"u_inscriptionLayer"),3),a.uniform1f(a.getUniformLocation(_,"u_meshOpacity"),this.meshLayer.opacity),a.uniform1f(a.getUniformLocation(_,"u_splatOpacity"),this.splatLayer.opacity),a.uniform1f(a.getUniformLocation(_,"u_proceduralOpacity"),this.proceduralLayer.opacity),a.uniform1f(a.getUniformLocation(_,"u_inscriptionOpacity"),this.inscriptionLayer.opacity),a.uniform1f(a.getUniformLocation(_,"u_meshEnabled"),this.meshLayer.enabled&&f.meshRendered?1:0),a.uniform1f(a.getUniformLocation(_,"u_splatEnabled"),this.splatLayer.enabled&&f.splatRendered?1:0),a.uniform1f(a.getUniformLocation(_,"u_proceduralEnabled"),this.proceduralLayer.enabled&&f.proceduralRendered?1:0),a.uniform1f(a.getUniformLocation(_,"u_inscriptionEnabled"),this.inscriptionLayer.enabled&&f.inscriptionRendered?1:0),a.uniform1f(a.getUniformLocation(_,"u_meshBlend"),this.meshLayer.blendMode),a.uniform1f(a.getUniformLocation(_,"u_splatBlend"),this.splatLayer.blendMode),a.uniform1f(a.getUniformLocation(_,"u_proceduralBlend"),this.proceduralLayer.blendMode),a.uniform1f(a.getUniformLocation(_,"u_inscriptionBlend"),this.inscriptionLayer.blendMode),a.uniform1f(a.getUniformLocation(_,"u_exposure"),this.exposure),a.uniform1f(a.getUniformLocation(_,"u_gamma"),this.gamma),a.drawArrays(a.TRIANGLES,0,3),f.layersComposited=(f.meshRendered?1:0)+(f.splatRendered?1:0)+(f.proceduralRendered?1:0)+(f.inscriptionRendered?1:0),f}renderSplatOnly(e,i){this._splatRenderer&&this._splatRenderer.render(e,i)}_createProgram(e,i){const t=this.gl,o=t.createProgram(),s=this._compile(t.VERTEX_SHADER,e),n=this._compile(t.FRAGMENT_SHADER,i);if(t.attachShader(o,s),t.attachShader(o,n),t.linkProgram(o),!t.getProgramParameter(o,t.LINK_STATUS))throw new Error("HybridRenderPipeline link error: "+t.getProgramInfoLog(o));return o}_compile(e,i){const t=this.gl,o=t.createShader(e);if(t.shaderSource(o,i),t.compileShader(o),!t.getShaderParameter(o,t.COMPILE_STATUS))throw new Error("HybridRenderPipeline compile error: "+t.getShaderInfoLog(o));return o}dispose(){const e=this.gl;e.deleteProgram(this._compositeProgram),e.deleteProgram(this._blitProgram),e.deleteVertexArray(this._quadVao),e.deleteTexture(this._blackTexture),this._splatFBO&&ne(e,this._splatFBO),this._proceduralFBO&&ne(e,this._proceduralFBO)}}function J(r,e,i){return .2126*r+.7152*e+.0722*i}function Se(r,e,i,t,o){const s=(c,u)=>{const f=Math.min(e-1,Math.max(0,t+c)),h=Math.min(i-1,Math.max(0,o+u));return r[h*e+f]},n=-s(-1,-1)+s(1,-1)-2*s(-1,0)+2*s(1,0)-s(-1,1)+s(1,1),a=-s(-1,-1)-2*s(0,-1)-s(1,-1)+s(-1,1)+2*s(0,1)+s(1,1);return Math.sqrt(n*n+a*a)}function st(r,e,i,t,o){const s=1-t-o;return[r[0]*s+e[0]*t+i[0]*o,r[1]*s+e[1]*t+i[1]*o,r[2]*s+e[2]*t+i[2]*o]}function nt(r,e,i,t,o){const s=1-t-o;return[r[0]*s+e[0]*t+i[0]*o,r[1]*s+e[1]*t+i[1]*o]}function Fe(r,e,i,t,o){t=t-Math.floor(t),o=o-Math.floor(o);const s=t*(e-1),n=o*(i-1),a=Math.floor(s),c=Math.floor(n),u=Math.min(e-1,a+1),f=Math.min(i-1,c+1),h=s-a,d=n-c,m=(R,M)=>(M*e+R)*4,g=m(a,c),p=m(u,c),v=m(a,f),T=m(u,f),_=(r[g]*(1-h)*(1-d)+r[p]*h*(1-d)+r[v]*(1-h)*d+r[T]*h*d)/255,E=(r[g+1]*(1-h)*(1-d)+r[p+1]*h*(1-d)+r[v+1]*(1-h)*d+r[T+1]*h*d)/255,x=(r[g+2]*(1-h)*(1-d)+r[p+2]*h*(1-d)+r[v+2]*(1-h)*d+r[T+2]*h*d)/255,y=(r[g+3]*(1-h)*(1-d)+r[p+3]*h*(1-d)+r[v+3]*(1-h)*d+r[T+3]*h*d)/255;return[_,E,x,y]}function Ee(r){const e=Math.sqrt(r[0]*r[0]+r[1]*r[1]+r[2]*r[2]);return e>1e-8&&(r[0]/=e,r[1]/=e,r[2]/=e),r}function vt(r,e){return[r[1]*e[2]-r[2]*e[1],r[2]*e[0]-r[0]*e[2],r[0]*e[1]-r[1]*e[0]]}function ur(r){const e=Ee([...r]),i=[0,0,1],t=e[0]*i[0]+e[1]*i[1]+e[2]*i[2];let o=i;Math.abs(t)>.999&&(o=[0,1,0]);const s=Ee(vt(o,e)),a=Math.acos(Math.max(-1,Math.min(1,t)))*.5,c=Math.sin(a);return[Math.cos(a),s[0]*c,s[1]*c,s[2]*c]}class hr{constructor(){this.samplesPerTriangle=8,this.edgeBoostFactor=4,this.edgeThreshold=.1,this.baseScale=.04,this.jitter=.3,this.alphaThreshold=.1,this.normalInfluence=.8,this.specularToDepth=2}convert({positions:e,normals:i,uvs:t,indices:o,diffusePixels:s,diffuseWidth:n,diffuseHeight:a,normalPixels:c=null,normalWidth:u=0,normalHeight:f=0,specularPixels:h=null,specularWidth:d=0,specularHeight:m=0}){const g=new Float32Array(n*a);for(let _=0;_<n*a;_++)g[_]=J(s[_*4]/255,s[_*4+1]/255,s[_*4+2]/255);const p=new Float32Array(n*a);for(let _=0;_<a;_++)for(let E=0;E<n;E++)p[_*n+E]=Se(g,n,a,E,_);const v=[],T=o.length/3;for(let _=0;_<T;_++){const E=o[_*3],x=o[_*3+1],y=o[_*3+2],R=[e[E*3],e[E*3+1],e[E*3+2]],M=[e[x*3],e[x*3+1],e[x*3+2]],I=[e[y*3],e[y*3+1],e[y*3+2]],q=[i[E*3],i[E*3+1],i[E*3+2]],Dt=[i[x*3],i[x*3+1],i[x*3+2]],wt=[i[y*3],i[y*3+1],i[y*3+2]],Ve=[t[E*2],t[E*2+1]],Ye=[t[x*2],t[x*2+1]],Ge=[t[y*2],t[y*2+1]],Bt=[M[0]-R[0],M[1]-R[1],M[2]-R[2]],Lt=[I[0]-R[0],I[1]-R[1],I[2]-R[2]],Z=vt(Bt,Lt),Ut=.5*Math.sqrt(Z[0]*Z[0]+Z[1]*Z[1]+Z[2]*Z[2]),It=Math.max(1,Math.round(this.samplesPerTriangle*Math.sqrt(Ut))),ke=nt(Ve,Ye,Ge,1/3,1/3),Ct=Math.min(n-1,Math.max(0,Math.floor(ke[0]*n))),Xt=Math.min(a-1,Math.max(0,Math.floor(ke[1]*a))),ze=p[Xt*n+Ct],Ot=ze>this.edgeThreshold?Math.round(this.edgeBoostFactor*(ze/1)):0,Nt=It+Ot;for(let He=0;He<Nt;He++){let B=Math.random(),C=Math.random();B+C>1&&(B=1-B,C=1-C),B+=(Math.random()-.5)*this.jitter*.1,C+=(Math.random()-.5)*this.jitter*.1,B=Math.max(0,Math.min(1,B)),C=Math.max(0,Math.min(1-B,C));const be=st(R,M,I,B,C),Wt=Ee(st(q,Dt,wt,B,C)),X=nt(Ve,Ye,Ge,B,C),[qe,Ze,$e,jt]=Fe(s,n,a,X[0],X[1]);if(jt<this.alphaThreshold)continue;let O=[...Wt];if(c){const[ye,Re,Ae]=Fe(c,u,f,X[0],X[1]),zt=ye*2-1,Ht=Re*2-1,qt=Ae*2-1;O[0]+=zt*this.normalInfluence,O[1]+=Ht*this.normalInfluence,O[2]+=qt*this.normalInfluence,Ee(O)}const Vt=ur(O);let Ke=0;if(h){const[ye,Re,Ae]=Fe(h,d,m,X[0],X[1]);Ke=J(ye,Re,Ae)*this.specularToDepth}const Yt=J(qe,Ze,$e),Gt=Se(g,n,a,Math.floor(X[0]*n)%n,Math.floor(X[1]*a)%a),kt=1-Math.min(1,Gt*2),Qe=this.baseScale*(.5+Yt*.5)*(.4+kt*.6),xe=Qe*.1;v.push({position:[be[0]+O[0]*xe,be[1]+O[1]*xe,be[2]+O[2]*xe],orientation:Vt,scale:Qe,color:[qe,Ze,$e],depth:Ke})}}return v}convertFromImages({positions:e,normals:i,uvs:t,indices:o,diffuseImage:s,normalImage:n,specularImage:a}){const c=d=>{if(!d)return null;const m=document.createElement("canvas"),g=d.naturalWidth||d.width,p=d.naturalHeight||d.height;m.width=g,m.height=p;const v=m.getContext("2d");return v.drawImage(d,0,0),{pixels:v.getImageData(0,0,g,p).data,width:g,height:p}},u=c(s),f=c(n),h=c(a);return this.convert({positions:e,normals:i,uvs:t,indices:o,diffusePixels:u.pixels,diffuseWidth:u.width,diffuseHeight:u.height,...f?{normalPixels:f.pixels,normalWidth:f.width,normalHeight:f.height}:{},...h?{specularPixels:h.pixels,specularWidth:h.width,specularHeight:h.height}:{}})}convertFlat(e,i,t,o={}){const s=o.gridStep||3,n=o.scale||this.baseScale,a=o.depthFromLum||1,c=new Float32Array(i*t);for(let h=0;h<i*t;h++)c[h]=J(e[h*4]/255,e[h*4+1]/255,e[h*4+2]/255);const u=i/t,f=[];for(let h=0;h<t;h+=s)for(let d=0;d<i;d+=s){const m=(h*i+d)*4;if(e[m+3]/255<this.alphaThreshold)continue;const g=e[m]/255,p=e[m+1]/255,v=e[m+2]/255,T=J(g,p,v),_=Se(c,i,t,d,h),E=1+(_>this.edgeThreshold?this.edgeBoostFactor:0),x=(1-T)*a,y=(d/i-.5)*2*u,R=-(h/t-.5)*2;for(let M=0;M<E;M++){const I=(Math.random()-.5)*this.jitter*(s/i)*2*u,q=(Math.random()-.5)*this.jitter*(s/t)*2;f.push({position:[y+I,R+q,x+(Math.random()-.5)*.05],orientation:[1,0,0,0],scale:n*(.5+T*.5)*(1-Math.min(1,_)*.5),color:[g,p,v],depth:x*.3})}}return f}}const $={idle:{priority:0,opacityMultiplier:.3,thicknessMultiplier:.5,speedMultiplier:.5,glowIntensity:.1,colorShift:[0,0,0],rotationSpeed:.1,patternOverride:null},active:{priority:1,opacityMultiplier:.8,thicknessMultiplier:1,speedMultiplier:1,glowIntensity:.5,colorShift:[.1,.1,.2],rotationSpeed:.3,patternOverride:null},selected:{priority:2,opacityMultiplier:1,thicknessMultiplier:1.2,speedMultiplier:.8,glowIntensity:.8,colorShift:[0,.2,.3],rotationSpeed:.5,patternOverride:7},powered:{priority:2,opacityMultiplier:1,thicknessMultiplier:1.5,speedMultiplier:1.5,glowIntensity:1,colorShift:[.3,0,.5],rotationSpeed:1,patternOverride:6},damaged:{priority:3,opacityMultiplier:.9,thicknessMultiplier:.8,speedMultiplier:2,glowIntensity:.7,colorShift:[.5,-.2,-.2],rotationSpeed:2,patternOverride:5},destroyed:{priority:4,opacityMultiplier:.4,thicknessMultiplier:2,speedMultiplier:3,glowIntensity:.3,colorShift:[.3,-.1,-.3],rotationSpeed:3,patternOverride:5}};function fr(r,e=4){const i=o=>{let s=o*2654435761;return s=(s>>>16^s)*2246822507,s=(s>>>16^s)*3266489909,s=s>>>16^s,(s&2147483647)/2147483647},t=[];for(let o=0;o<e;o++){const s=r*1e3+o;t.push({geometry:Math.floor(i(s)*24),thickness:.3+i(s+100)*.4,opacity:.7+i(s+200)*.3,color:[.3+i(s+300)*.7,.3+i(s+400)*.7,.3+i(s+500)*.7],patternScale:2+i(s+600)*4,patternSpeed:.2+i(s+700)*.4,rotOffset:i(s+800)*Math.PI*2})}return{layers:t,baseRotationSpeed:i(r*31)*.5,baseHue:i(r*47)*360}}const P={bass:{rot4dXW:.5,thickness:.3},mid:{rot4dYW:.3,speed:.5},high:{rot4dZW:.6,patternScale:.3,hueShift:30},energy:{allRotation:.3,intensity:.5,glow:.3}};class dr{constructor({layerCount:e=4,transitionDuration:i=.5}={}){this.layerCount=e,this.transitionDuration=i,this._objectStates=new Map,this._audio={bass:0,mid:0,high:0,energy:0},this._time=0}registerObject(e,i="idle"){const t=fr(e,this.layerCount),o=$[i]||$.idle;this._objectStates.set(e,{currentState:i,targetState:i,transitionProgress:1,currentPreset:{...o},targetPreset:{...o},identity:t})}setObjectState(e,i){const t=this._objectStates.get(e);if(!t){this.registerObject(e,i);return}if(t.targetState===i)return;const o=$[i];if(!o)return;const s=($[t.currentState]||$.idle).priority;o.priority<s&&t.transitionProgress<.5||(t.currentPreset=this._interpolatePresets(t.currentPreset,t.targetPreset,t.transitionProgress),t.targetPreset={...o},t.currentState=t.targetState,t.targetState=i,t.transitionProgress=0)}setAudio(e,i,t,o){this._audio.bass=Math.max(0,Math.min(1,e||0)),this._audio.mid=Math.max(0,Math.min(1,i||0)),this._audio.high=Math.max(0,Math.min(1,t||0)),this._audio.energy=Math.max(0,Math.min(1,o||0))}update(e){this._time+=e;for(const i of this._objectStates.values())i.transitionProgress<1&&(i.transitionProgress=Math.min(1,i.transitionProgress+e/this.transitionDuration))}getInscriptionConfig(e){let i=this._objectStates.get(e);i||(this.registerObject(e),i=this._objectStates.get(e));const t=this._interpolatePresets(i.currentPreset,i.targetPreset,i.transitionProgress),o=i.identity,s=this._audio,n=[];for(let h=0;h<this.layerCount;h++){const d=o.layers[h],m=t.patternOverride!==null?t.patternOverride:d.geometry,g=d.opacity*t.opacityMultiplier+s.energy*P.energy.intensity*.3,p=d.thickness*t.thicknessMultiplier+s.bass*P.bass.thickness,v=d.patternSpeed*t.speedMultiplier+s.mid*P.mid.speed,T=s.high*P.high.hueShift/360,_=[Math.min(1,Math.max(0,d.color[0]+t.colorShift[0]+T*.5)),Math.min(1,Math.max(0,d.color[1]+t.colorShift[1]+T*.3)),Math.min(1,Math.max(0,d.color[2]+t.colorShift[2]+T))],E=d.patternScale+s.high*P.high.patternScale,x=d.rotOffset+this._time*(o.baseRotationSpeed+t.rotationSpeed*.5);n.push({geometry:m,thickness:Math.min(1,Math.max(0,p)),opacity:Math.min(1,Math.max(0,g)),color:_,patternScale:E,patternSpeed:v,rotOffset:x})}const a=s.bass*P.bass.rot4dXW+s.energy*P.energy.allRotation,c=s.mid*P.mid.rot4dYW+s.energy*P.energy.allRotation,u=s.high*P.high.rot4dZW+s.energy*P.energy.allRotation,f=.6*t.thicknessMultiplier+s.bass*.2;return{layers:n,rot4dXW:a,rot4dYW:c,rot4dZW:u,globalThickness:f,glowIntensity:t.glowIntensity+s.energy*P.energy.glow,bass:s.bass,mid:s.mid,high:s.high,energy:s.energy}}applyToLayer(e,i){const t=this.getInscriptionConfig(i);e.rot4dXW=t.rot4dXW,e.rot4dYW=t.rot4dYW,e.rot4dZW=t.rot4dZW,e.globalThickness=t.globalThickness,e.setAudio(t.bass,t.mid,t.high,t.energy);for(let o=0;o<t.layers.length&&o<e.layerCount;o++)e.setLayerConfig(o,t.layers[o])}_interpolatePresets(e,i,t){const o=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;return{priority:i.priority,opacityMultiplier:e.opacityMultiplier+(i.opacityMultiplier-e.opacityMultiplier)*o,thicknessMultiplier:e.thicknessMultiplier+(i.thicknessMultiplier-e.thicknessMultiplier)*o,speedMultiplier:e.speedMultiplier+(i.speedMultiplier-e.speedMultiplier)*o,glowIntensity:e.glowIntensity+(i.glowIntensity-e.glowIntensity)*o,colorShift:[e.colorShift[0]+(i.colorShift[0]-e.colorShift[0])*o,e.colorShift[1]+(i.colorShift[1]-e.colorShift[1])*o,e.colorShift[2]+(i.colorShift[2]-e.colorShift[2])*o],rotationSpeed:e.rotationSpeed+(i.rotationSpeed-e.rotationSpeed)*o,patternOverride:o>.5?i.patternOverride:e.patternOverride}}getObjectState(e){const i=this._objectStates.get(e);return i?i.targetState:null}get registeredObjects(){return Array.from(this._objectStates.keys())}get stateNames(){return Object.keys($)}dispose(){this._objectStates.clear()}}class mr{constructor(e,i={}){this.gl=e,this.resolution=i.resolution??1024,this.bias=i.bias??.005,this.normalBias=i.normalBias??.02,this.pcfRadius=i.pcfRadius??2,this.filterMode=i.filterMode??"pcf",this.frustumSize=i.frustumSize??10,this.near=i.near??.1,this.far=i.far??50,this.lightDir=new Float32Array(i.lightDir||[.5,1,.3]),this._normalizeLightDir(),this.lightViewMatrix=new Float32Array(16),this.lightProjMatrix=new Float32Array(16),this.lightSpaceMatrix=new Float32Array(16),this._fbo=null,this._depthTexture=null,this._shadowProgram=null,this._initialized=!1}init(){if(this._initialized)return;const e=this.gl;this._fbo=e.createFramebuffer(),this._depthTexture=e.createTexture(),e.bindTexture(e.TEXTURE_2D,this._depthTexture),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT32F,this.resolution,this.resolution,0,e.DEPTH_COMPONENT,e.FLOAT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_COMPARE_MODE,e.COMPARE_REF_TO_TEXTURE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_COMPARE_FUNC,e.LEQUAL),e.bindFramebuffer(e.FRAMEBUFFER,this._fbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,this._depthTexture,0),e.drawBuffers([e.NONE]),e.readBuffer(e.NONE),e.bindFramebuffer(e.FRAMEBUFFER,null),this._shadowProgram=this._createShadowProgram(),this._initialized=!0}setLightDirection(e,i,t){this.lightDir[0]=e,this.lightDir[1]=i,this.lightDir[2]=t,this._normalizeLightDir()}updateMatrices(e){const i=e?e[0]:0,t=e?e[1]:0,o=e?e[2]:0,s=this.lightDir[0],n=this.lightDir[1],a=this.lightDir[2],c=this.far*.5,u=i+s*c,f=t+n*c,h=o+a*c;this._lookAt(this.lightViewMatrix,u,f,h,i,t,o);const d=this.frustumSize;this._ortho(this.lightProjMatrix,-d,d,-d,d,this.near,this.far),this._multiplyMat4(this.lightSpaceMatrix,this.lightProjMatrix,this.lightViewMatrix)}beginShadowPass(){this._initialized||this.init();const e=this.gl;e.bindFramebuffer(e.FRAMEBUFFER,this._fbo),e.viewport(0,0,this.resolution,this.resolution),e.clear(e.DEPTH_BUFFER_BIT),e.enable(e.DEPTH_TEST),e.depthFunc(e.LESS),e.enable(e.CULL_FACE),e.cullFace(e.FRONT)}renderShadowCaster(e,i,t){const o=this.gl,s=this._shadowProgram;o.useProgram(s.program),o.uniformMatrix4fv(s.u_lightSpaceMatrix,!1,this.lightSpaceMatrix),o.uniformMatrix4fv(s.u_modelMatrix,!1,t||_r);const n=o.createVertexArray();o.bindVertexArray(n);const a=o.createBuffer();if(o.bindBuffer(o.ARRAY_BUFFER,a),o.bufferData(o.ARRAY_BUFFER,e,o.STREAM_DRAW),o.enableVertexAttribArray(0),o.vertexAttribPointer(0,3,o.FLOAT,!1,0,0),i){const c=o.createBuffer();o.bindBuffer(o.ELEMENT_ARRAY_BUFFER,c),o.bufferData(o.ELEMENT_ARRAY_BUFFER,i,o.STREAM_DRAW),o.drawElements(o.TRIANGLES,i.length,o.UNSIGNED_INT,0),o.deleteBuffer(c)}else o.drawArrays(o.TRIANGLES,0,e.length/3);o.bindVertexArray(null),o.deleteVertexArray(n),o.deleteBuffer(a)}endShadowPass(){const e=this.gl;e.cullFace(e.BACK),e.bindFramebuffer(e.FRAMEBUFFER,null)}getShadowTexture(){return this._depthTexture}getLightSpaceMatrix(){return this.lightSpaceMatrix}static getShadowSamplerSrc(){return`
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
`}_normalizeLightDir(){const e=this.lightDir,i=Math.sqrt(e[0]*e[0]+e[1]*e[1]+e[2]*e[2])||1;e[0]/=i,e[1]/=i,e[2]/=i}_createShadowProgram(){const e=this.gl,i=`#version 300 es
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
}`,o=e.createShader(e.VERTEX_SHADER);e.shaderSource(o,i),e.compileShader(o);const s=e.createShader(e.FRAGMENT_SHADER);e.shaderSource(s,t),e.compileShader(s);const n=e.createProgram();return e.attachShader(n,o),e.attachShader(n,s),e.linkProgram(n),e.deleteShader(o),e.deleteShader(s),{program:n,u_lightSpaceMatrix:e.getUniformLocation(n,"u_lightSpaceMatrix"),u_modelMatrix:e.getUniformLocation(n,"u_modelMatrix")}}_lookAt(e,i,t,o,s,n,a){let c=s-i,u=n-t,f=a-o,h=Math.sqrt(c*c+u*u+f*f)||1;c/=h,u/=h,f/=h;let d=u*0-f*1,m=f*0-c*0,g=c*1-u*0;Math.abs(d)+Math.abs(m)+Math.abs(g)<.001&&(d=1,m=0,g=0),h=Math.sqrt(d*d+m*m+g*g)||1,d/=h,m/=h,g/=h;const p=m*f-g*u,v=g*c-d*f,T=d*u-m*c;e[0]=d,e[1]=p,e[2]=-c,e[3]=0,e[4]=m,e[5]=v,e[6]=-u,e[7]=0,e[8]=g,e[9]=T,e[10]=-f,e[11]=0,e[12]=-(d*i+m*t+g*o),e[13]=-(p*i+v*t+T*o),e[14]=-(-c*i+-u*t+-f*o),e[15]=1}_ortho(e,i,t,o,s,n,a){const c=1/(i-t),u=1/(o-s),f=1/(n-a);e[0]=-2*c,e[1]=0,e[2]=0,e[3]=0,e[4]=0,e[5]=-2*u,e[6]=0,e[7]=0,e[8]=0,e[9]=0,e[10]=2*f,e[11]=0,e[12]=(i+t)*c,e[13]=(s+o)*u,e[14]=(a+n)*f,e[15]=1}_multiplyMat4(e,i,t){for(let o=0;o<4;o++)for(let s=0;s<4;s++)e[o*4+s]=i[0*4+s]*t[o*4+0]+i[1*4+s]*t[o*4+1]+i[2*4+s]*t[o*4+2]+i[3*4+s]*t[o*4+3]}dispose(){const e=this.gl;this._fbo&&e.deleteFramebuffer(this._fbo),this._depthTexture&&e.deleteTexture(this._depthTexture),this._shadowProgram&&e.deleteProgram(this._shadowProgram.program),this._fbo=null,this._depthTexture=null,this._shadowProgram=null,this._initialized=!1}}const _r=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);class pr{constructor(e,i={}){this.gl=e,this.maxParticles=i.maxParticles??1e4,this.emitRate=i.emitRate??100,this.lifetime=i.lifetime??3,this.lifetimeVariance=i.lifetimeVariance??.5,this.speed=i.speed??1,this.speedVariance=i.speedVariance??.3,this.gravity=i.gravity??-2,this.drag=i.drag??.98,this.splatScale=i.splatScale??.02,this.splatScaleDecay=i.splatScaleDecay??.5,this.trailLength=i.trailLength??0,this.emitterType=i.emitterType??"point",this.emitterPosition=new Float32Array(i.emitterPosition||[0,0,0]),this.emitterRadius=i.emitterRadius??.5,this.emitterDirection=new Float32Array(i.emitterDirection||[0,1,0]),this.emitterSpread=i.emitterSpread??.5,this.colorStart=new Float32Array(i.colorStart||[0,1,1]),this.colorEnd=new Float32Array(i.colorEnd||[1,0,1]),this.colorMode=i.colorMode??"lerp",this.burstConfigs=new Map,this._setupDefaultBursts(),this._stride=12,this._data=new Float32Array(this.maxParticles*this._stride),this._aliveCount=0,this._emitAccumulator=0,this._trailHistory=this.trailLength>0?new Float32Array(this.maxParticles*this.trailLength*7):null,this._splatBuffer=null,this._splatCount=0,this._rng=12345}setBurstConfig(e,i){this.burstConfigs.set(e,i)}burst(e,i){const t=this.burstConfigs.get(e);if(!t)return;const o=i||this.emitterPosition,s=t.speed??this.speed*2,n=t.spread??1;for(let a=0;a<t.count;a++)this._emitOne(o,s,n,t.color)}setPosition(e,i,t){this.emitterPosition[0]=e,this.emitterPosition[1]=i,this.emitterPosition[2]=t}setSurfaceEmitter(e,i,t){this.emitterType="surface",this._surfacePositions=e,this._surfaceNormals=i,this._surfaceIndices=t}update(e){for((e<=0||e>.1)&&(e=.016),this._emitAccumulator+=this.emitRate*e;this._emitAccumulator>=1&&this._aliveCount<this.maxParticles;)this._emitAccumulator-=1,this._emitParticle();let i=0;for(let t=0;t<this._aliveCount;t++){const o=t*this._stride;if(this._data[o+9]+=e,this._data[o+9]>=this._data[o+10])continue;this._trailHistory&&this._pushTrail(t),this._data[o+4]+=this.gravity*e,this._data[o+3]*=this.drag,this._data[o+4]*=this.drag,this._data[o+5]*=this.drag,this._data[o+0]+=this._data[o+3]*e,this._data[o+1]+=this._data[o+4]*e,this._data[o+2]+=this._data[o+5]*e;const s=this._data[o+9]/this._data[o+10];this._data[o+6]=this.colorStart[0]*(1-s)+this.colorEnd[0]*s,this._data[o+7]=this.colorStart[1]*(1-s)+this.colorEnd[1]*s,this._data[o+8]=this.colorStart[2]*(1-s)+this.colorEnd[2]*s,this._data[o+11]=this.splatScale*(1-s*this.splatScaleDecay),i!==t&&this._data.copyWithin(i*this._stride,o,o+this._stride),i++}this._aliveCount=i,this._buildSplatBuffer()}getSplatBuffer(){return{buffer:this._splatBuffer,count:this._splatCount}}getAliveCount(){return this._aliveCount}_setupDefaultBursts(){this.burstConfigs.set("powered",{count:50,speed:2,spread:.3,color:[.5,0,1]}),this.burstConfigs.set("damaged",{count:100,speed:3,spread:1,color:[1,.3,0]}),this.burstConfigs.set("destroyed",{count:500,speed:5,spread:1,color:[1,.1,.1]}),this.burstConfigs.set("selected",{count:20,speed:.5,spread:.8,color:[0,1,1]}),this.burstConfigs.set("active",{count:30,speed:1,spread:.5,color:[0,1,.5]})}_emitParticle(){const e=this._getEmitPosition();this._emitOne(e,this.speed,this.emitterSpread)}_emitOne(e,i,t,o){if(this._aliveCount>=this.maxParticles)return;const s=this._aliveCount*this._stride;this._data[s+0]=e[0],this._data[s+1]=e[1],this._data[s+2]=e[2];const n=this._randomConeDirection(this.emitterDirection,t),a=i+(this._rand()-.5)*this.speedVariance*2;this._data[s+3]=n[0]*a,this._data[s+4]=n[1]*a,this._data[s+5]=n[2]*a,o?(this._data[s+6]=o[0],this._data[s+7]=o[1],this._data[s+8]=o[2]):(this._data[s+6]=this.colorStart[0],this._data[s+7]=this.colorStart[1],this._data[s+8]=this.colorStart[2]),this._data[s+9]=0,this._data[s+10]=this.lifetime+(this._rand()-.5)*this.lifetimeVariance*2,this._data[s+11]=this.splatScale,this._aliveCount++}_getEmitPosition(){if(this.emitterType==="surface"&&this._surfaceIndices)return this._randomSurfacePoint();if(this.emitterType==="sphere"){const e=this._rand()*Math.PI*2,i=Math.acos(2*this._rand()-1),t=this.emitterRadius*Math.cbrt(this._rand());return[this.emitterPosition[0]+t*Math.sin(i)*Math.cos(e),this.emitterPosition[1]+t*Math.cos(i),this.emitterPosition[2]+t*Math.sin(i)*Math.sin(e)]}return this.emitterPosition}_randomSurfacePoint(){const e=this._surfaceIndices.length/3,i=Math.floor(this._rand()*e),t=this._surfaceIndices[i*3]*3,o=this._surfaceIndices[i*3+1]*3,s=this._surfaceIndices[i*3+2]*3;let n=this._rand(),a=this._rand();n+a>1&&(n=1-n,a=1-a);const c=1-n-a;return[this._surfacePositions[t]*c+this._surfacePositions[o]*n+this._surfacePositions[s]*a,this._surfacePositions[t+1]*c+this._surfacePositions[o+1]*n+this._surfacePositions[s+1]*a,this._surfacePositions[t+2]*c+this._surfacePositions[o+2]*n+this._surfacePositions[s+2]*a]}_randomConeDirection(e,i){const t=this._rand()*Math.PI*2,o=1-this._rand()*i,s=Math.sqrt(1-o*o),n=e[0],a=e[1],c=e[2];let u,f,h;Math.abs(a)<.99?(u=a*0-c*0,f=c*1-n*0,h=n*0-a*1,u=0,f=-c,h=a):(u=-c,f=0,h=n);const d=Math.sqrt(u*u+f*f+h*h)||1;u/=d,f/=d,h/=d;const m=a*h-c*f,g=c*u-n*h,p=n*f-a*u;return[n*o+(u*Math.cos(t)+m*Math.sin(t))*s,a*o+(f*Math.cos(t)+g*Math.sin(t))*s,c*o+(h*Math.cos(t)+p*Math.sin(t))*s]}_pushTrail(e){if(!this._trailHistory)return;const i=e*this._stride,t=7,o=e*this.trailLength*t;for(let s=this.trailLength-1;s>0;s--){const n=o+s*t,a=o+(s-1)*t;for(let c=0;c<t;c++)this._trailHistory[n+c]=this._trailHistory[a+c]}this._trailHistory[o+0]=this._data[i+0],this._trailHistory[o+1]=this._data[i+1],this._trailHistory[o+2]=this._data[i+2],this._trailHistory[o+3]=this._data[i+6],this._trailHistory[o+4]=this._data[i+7],this._trailHistory[o+5]=this._data[i+8],this._trailHistory[o+6]=this._data[i+11]}_buildSplatBuffer(){const i=this._aliveCount*(1+this.trailLength);(!this._splatBuffer||this._splatBuffer.length<i*12)&&(this._splatBuffer=new Float32Array(i*12));let t=0;for(let o=0;o<this._aliveCount;o++){const s=o*this._stride,n=t*12;if(this._splatBuffer[n+0]=this._data[s+0],this._splatBuffer[n+1]=this._data[s+1],this._splatBuffer[n+2]=this._data[s+2],this._splatBuffer[n+3]=this._data[s+11],this._splatBuffer[n+4]=1,this._splatBuffer[n+5]=0,this._splatBuffer[n+6]=0,this._splatBuffer[n+7]=0,this._splatBuffer[n+8]=this._data[s+6],this._splatBuffer[n+9]=this._data[s+7],this._splatBuffer[n+10]=this._data[s+8],this._splatBuffer[n+11]=.5,t++,this._trailHistory){const a=o*this.trailLength*7;for(let c=0;c<this.trailLength;c++){const u=a+c*7,f=t*12,h=1-(c+1)/(this.trailLength+1);this._splatBuffer[f+0]=this._trailHistory[u+0],this._splatBuffer[f+1]=this._trailHistory[u+1],this._splatBuffer[f+2]=this._trailHistory[u+2],this._splatBuffer[f+3]=this._trailHistory[u+6]*h,this._splatBuffer[f+4]=1,this._splatBuffer[f+5]=0,this._splatBuffer[f+6]=0,this._splatBuffer[f+7]=0,this._splatBuffer[f+8]=this._trailHistory[u+3]*h,this._splatBuffer[f+9]=this._trailHistory[u+4]*h,this._splatBuffer[f+10]=this._trailHistory[u+5]*h,this._splatBuffer[f+11]=.3*h,t++}}}this._splatCount=t}_rand(){return this._rng=this._rng*1664525+1013904223&2147483647,this._rng/2147483647}dispose(){this._data=null,this._splatBuffer=null,this._trailHistory=null}}class gr{constructor(e,i={}){this.gl=e,this.maxSteps=i.maxSteps??24,this.stepSize=i.stepSize??.05,this.density=i.density??2,this.absorption=i.absorption??1.5,this.emissionStrength=i.emissionStrength??1,this.noiseScale=i.noiseScale??3,this.geometry=i.geometry??0,this.primaryColor=new Float32Array(i.primaryColor||[0,1,1]),this.secondaryColor=new Float32Array(i.secondaryColor||[1,0,1]),this.rot4dXY=0,this.rot4dXZ=0,this.rot4dYZ=0,this.rot4dXW=0,this.rot4dYW=0,this.rot4dZW=0,this.bass=0,this.mid=0,this.high=0,this.energy=0,this.sliceEnabled=!1,this.slicePlane=new Float32Array([0,1,0,0]),this._program=null,this._fbo=null,this._texture=null,this._vao=null,this._initialized=!1}init(){if(this._initialized)return;const e=this.gl;this._program=this._createProgram(),this._fbo=e.createFramebuffer(),this._texture=e.createTexture(),this._vao=e.createVertexArray(),e.bindVertexArray(this._vao);const i=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,i),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null),this._initialized=!0}setAudio(e,i,t,o){this.bass=e,this.mid=i,this.high=t,this.energy=o}render(e,i,t,o){this._initialized||this.init();const s=this.gl,{width:n,height:a}=o;return this._ensureTexture(n,a),s.bindFramebuffer(s.FRAMEBUFFER,this._fbo),s.viewport(0,0,n,a),s.clearColor(0,0,0,0),s.clear(s.COLOR_BUFFER_BIT),s.useProgram(this._program.program),s.activeTexture(s.TEXTURE0),s.bindTexture(s.TEXTURE_2D,e),s.uniform1i(this._program.u_depthTex,0),s.activeTexture(s.TEXTURE1),s.bindTexture(s.TEXTURE_2D,i),s.uniform1i(this._program.u_normalTex,1),s.uniform1f(this._program.u_time,t),s.uniform2f(this._program.u_resolution,n,a),s.uniform1i(this._program.u_maxSteps,this.maxSteps),s.uniform1f(this._program.u_stepSize,this.stepSize),s.uniform1f(this._program.u_density,this.density),s.uniform1f(this._program.u_absorption,this.absorption),s.uniform1f(this._program.u_emissionStrength,this.emissionStrength),s.uniform1f(this._program.u_noiseScale,this.noiseScale),s.uniform1f(this._program.u_geometry,this.geometry),s.uniform3fv(this._program.u_primaryColor,this.primaryColor),s.uniform3fv(this._program.u_secondaryColor,this.secondaryColor),s.uniform1f(this._program.u_rot4dXY,this.rot4dXY),s.uniform1f(this._program.u_rot4dXZ,this.rot4dXZ),s.uniform1f(this._program.u_rot4dYZ,this.rot4dYZ),s.uniform1f(this._program.u_rot4dXW,this.rot4dXW+this.bass*.3),s.uniform1f(this._program.u_rot4dYW,this.rot4dYW+this.mid*.2),s.uniform1f(this._program.u_rot4dZW,this.rot4dZW+this.high*.4),s.uniform1i(this._program.u_sliceEnabled,this.sliceEnabled?1:0),s.uniform4fv(this._program.u_slicePlane,this.slicePlane),o.invViewProj&&s.uniformMatrix4fv(this._program.u_invViewProj,!1,o.invViewProj),o.cameraPos&&s.uniform3fv(this._program.u_cameraPos,o.cameraPos),s.enable(s.BLEND),s.blendFunc(s.ONE,s.ONE_MINUS_SRC_ALPHA),s.bindVertexArray(this._vao),s.drawArrays(s.TRIANGLES,0,3),s.bindVertexArray(null),s.disable(s.BLEND),s.bindFramebuffer(s.FRAMEBUFFER,null),{texture:this._texture,framebuffer:this._fbo}}_ensureTexture(e,i){const t=this.gl;this._texW===e&&this._texH===i||(this._texW=e,this._texH=i,t.bindTexture(t.TEXTURE_2D,this._texture),t.texImage2D(t.TEXTURE_2D,0,t.RGBA16F,e,i,0,t.RGBA,t.HALF_FLOAT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,this._fbo),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,this._texture,0),t.bindFramebuffer(t.FRAMEBUFFER,null))}_createProgram(){const e=this.gl,i=`#version 300 es
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
}`,o=e.createShader(e.VERTEX_SHADER);e.shaderSource(o,i),e.compileShader(o);const s=e.createShader(e.FRAGMENT_SHADER);e.shaderSource(s,t),e.compileShader(s),e.getShaderParameter(s,e.COMPILE_STATUS)||console.warn("VolumetricInscription fragment shader error:",e.getShaderInfoLog(s));const n=e.createProgram();e.attachShader(n,o),e.attachShader(n,s),e.linkProgram(n),e.deleteShader(o),e.deleteShader(s);const a=c=>e.getUniformLocation(n,c);return{program:n,u_depthTex:a("u_depthTex"),u_normalTex:a("u_normalTex"),u_time:a("u_time"),u_resolution:a("u_resolution"),u_maxSteps:a("u_maxSteps"),u_stepSize:a("u_stepSize"),u_density:a("u_density"),u_absorption:a("u_absorption"),u_emissionStrength:a("u_emissionStrength"),u_noiseScale:a("u_noiseScale"),u_geometry:a("u_geometry"),u_primaryColor:a("u_primaryColor"),u_secondaryColor:a("u_secondaryColor"),u_rot4dXY:a("u_rot4dXY"),u_rot4dXZ:a("u_rot4dXZ"),u_rot4dYZ:a("u_rot4dYZ"),u_rot4dXW:a("u_rot4dXW"),u_rot4dYW:a("u_rot4dYW"),u_rot4dZW:a("u_rot4dZW"),u_sliceEnabled:a("u_sliceEnabled"),u_slicePlane:a("u_slicePlane"),u_invViewProj:a("u_invViewProj"),u_cameraPos:a("u_cameraPos")}}dispose(){const e=this.gl;this._program&&e.deleteProgram(this._program.program),this._fbo&&e.deleteFramebuffer(this._fbo),this._texture&&e.deleteTexture(this._texture),this._vao&&e.deleteVertexArray(this._vao)}}class Er{constructor(e,i={}){this.gl=e,this.lightDir=new Float32Array(i.lightDir||[.5,1,.3]),this.lightColor=new Float32Array(i.lightColor||[1,.95,.9]),this.ambientStrength=i.ambientStrength??.15,this.specularPower=i.specularPower??64,this.specularStrength=i.specularStrength??.5,this.inscriptionEmission=i.inscriptionEmission??.3,this.fresnelPower=i.fresnelPower??3,this.shadowEnabled=!1,this.shadowTexture=null,this.lightSpaceMatrix=null,this._program=null,this._fbo=null,this._texture=null,this._vao=null,this._initialized=!1}init(){if(this._initialized)return;const e=this.gl;this._program=this._createProgram(),this._fbo=e.createFramebuffer(),this._texture=e.createTexture(),this._vao=e.createVertexArray(),e.bindVertexArray(this._vao);const i=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,i),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null),this._initialized=!0}setShadow(e,i){this.shadowEnabled=!0,this.shadowTexture=e,this.lightSpaceMatrix=i}render(e,i,t){this._initialized||this.init();const o=this.gl,{width:s,height:n}=t;this._ensureTexture(s,n),o.bindFramebuffer(o.FRAMEBUFFER,this._fbo),o.viewport(0,0,s,n),o.clearColor(0,0,0,0),o.clear(o.COLOR_BUFFER_BIT),o.useProgram(this._program.program),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,e),o.uniform1i(this._program.u_inscriptionTex,0),o.activeTexture(o.TEXTURE1),o.bindTexture(o.TEXTURE_2D,i),o.uniform1i(this._program.u_normalDepthTex,1),o.uniform1i(this._program.u_shadowEnabled,this.shadowEnabled?1:0),this.shadowEnabled&&this.shadowTexture&&(o.activeTexture(o.TEXTURE2),o.bindTexture(o.TEXTURE_2D,this.shadowTexture),o.uniform1i(this._program.u_shadowTex,2),this.lightSpaceMatrix&&o.uniformMatrix4fv(this._program.u_lightSpaceMatrix,!1,this.lightSpaceMatrix)),o.uniform2f(this._program.u_resolution,s,n);const a=this.lightDir,c=Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2])||1;return o.uniform3f(this._program.u_lightDir,a[0]/c,a[1]/c,a[2]/c),o.uniform3fv(this._program.u_lightColor,this.lightColor),o.uniform1f(this._program.u_ambientStrength,this.ambientStrength),o.uniform1f(this._program.u_specularPower,this.specularPower),o.uniform1f(this._program.u_specularStrength,this.specularStrength),o.uniform1f(this._program.u_inscriptionEmission,this.inscriptionEmission),o.uniform1f(this._program.u_fresnelPower,this.fresnelPower),t.viewDir?o.uniform3fv(this._program.u_viewDir,t.viewDir):o.uniform3f(this._program.u_viewDir,0,0,-1),o.bindVertexArray(this._vao),o.drawArrays(o.TRIANGLES,0,3),o.bindVertexArray(null),o.bindFramebuffer(o.FRAMEBUFFER,null),{texture:this._texture}}_ensureTexture(e,i){if(this._texW===e&&this._texH===i)return;const t=this.gl;this._texW=e,this._texH=i,t.bindTexture(t.TEXTURE_2D,this._texture),t.texImage2D(t.TEXTURE_2D,0,t.RGBA16F,e,i,0,t.RGBA,t.HALF_FLOAT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,this._fbo),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,this._texture,0),t.bindFramebuffer(t.FRAMEBUFFER,null)}_createProgram(){const e=this.gl,i=`#version 300 es
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
}`,o=e.createShader(e.VERTEX_SHADER);e.shaderSource(o,i),e.compileShader(o);const s=e.createShader(e.FRAGMENT_SHADER);e.shaderSource(s,t),e.compileShader(s),e.getShaderParameter(s,e.COMPILE_STATUS)||console.warn("DeferredInscriptionLighting fragment shader error:",e.getShaderInfoLog(s));const n=e.createProgram();e.attachShader(n,o),e.attachShader(n,s),e.linkProgram(n),e.deleteShader(o),e.deleteShader(s);const a=c=>e.getUniformLocation(n,c);return{program:n,u_inscriptionTex:a("u_inscriptionTex"),u_normalDepthTex:a("u_normalDepthTex"),u_shadowTex:a("u_shadowTex"),u_resolution:a("u_resolution"),u_lightDir:a("u_lightDir"),u_lightColor:a("u_lightColor"),u_viewDir:a("u_viewDir"),u_ambientStrength:a("u_ambientStrength"),u_specularPower:a("u_specularPower"),u_specularStrength:a("u_specularStrength"),u_inscriptionEmission:a("u_inscriptionEmission"),u_fresnelPower:a("u_fresnelPower"),u_shadowEnabled:a("u_shadowEnabled"),u_lightSpaceMatrix:a("u_lightSpaceMatrix")}}dispose(){const e=this.gl;this._program&&e.deleteProgram(this._program.program),this._fbo&&e.deleteFramebuffer(this._fbo),this._texture&&e.deleteTexture(this._texture),this._vao&&e.deleteVertexArray(this._vao)}}class Tr{constructor(e,i={}){this.gl=e,this.maxTextures=i.maxTextures??8,this._textures=new Map,this._glTextures=new Map}setLayerTexture(e,i,t={}){const o=this.gl;let s=this._glTextures.get(e);s||(s=o.createTexture(),this._glTextures.set(e,s)),o.bindTexture(o.TEXTURE_2D,s),o.texImage2D(o.TEXTURE_2D,0,o.RGBA,o.RGBA,o.UNSIGNED_BYTE,i),o.generateMipmap(o.TEXTURE_2D),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.LINEAR_MIPMAP_LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.REPEAT),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.REPEAT),o.bindTexture(o.TEXTURE_2D,null),this._textures.set(e,{texture:s,uvMode:t.uvMode??"screen",blend:t.blend??.5,tileX:t.tileX??1,tileY:t.tileY??1,offsetX:t.offsetX??0,offsetY:t.offsetY??0,rotation:t.rotation??0,channel:t.channel??"r",invert:t.invert??!1,width:i.width||i.naturalWidth,height:i.height||i.naturalHeight})}async loadLayerTexture(e,i,t={}){return new Promise((o,s)=>{const n=new Image;n.crossOrigin="anonymous",n.onload=()=>{this.setLayerTexture(e,n,t),o()},n.onerror=s,n.src=i})}setLayerText(e,i,t={}){const o=t.canvasSize??512,s=document.createElement("canvas");s.width=o,s.height=o;const n=s.getContext("2d");n.fillStyle="black",n.fillRect(0,0,o,o),n.fillStyle=t.color??"white",n.font=t.font??"32px monospace",n.textAlign="center",n.textBaseline="middle";const a=i.split(" "),c=[];let u="";const f=o*.8;for(const m of a){const g=u?u+" "+m:m;n.measureText(g).width>f&&u?(c.push(u),u=m):u=g}u&&c.push(u);const h=parseInt(n.font)*1.4,d=o/2-(c.length-1)*h/2;for(let m=0;m<c.length;m++)n.fillText(c[m],o/2,d+m*h);this.setLayerTexture(e,s,{channel:"luminance",...t})}setLayerCircuitPattern(e,i={}){const t=i.canvasSize??512,o=document.createElement("canvas");o.width=t,o.height=t;const s=o.getContext("2d");s.fillStyle="black",s.fillRect(0,0,t,t),s.strokeStyle="white",s.lineWidth=2;const n=i.gridSize??32;let c=i.seed??42;const u=()=>(c=c*1664525+1013904223&4294967295,(c>>>0)/4294967295);for(let f=0;f<t;f+=n){let h=u()>.3;for(let d=0;d<t;d+=n)u()>.6&&(h=!h),h&&(s.beginPath(),s.moveTo(f,d),u()>.5?s.lineTo(f+n,d):s.lineTo(f,d+n),s.stroke()),u()>.7&&(s.beginPath(),s.arc(f,d,3,0,Math.PI*2),s.fillStyle="white",s.fill())}this.setLayerTexture(e,o,{channel:"luminance",...i})}removeLayerTexture(e){const i=this._glTextures.get(e);i&&(this.gl.deleteTexture(i),this._glTextures.delete(e)),this._textures.delete(e)}getLayerConfig(e){return this._textures.get(e)||null}hasTexture(e){return this._textures.has(e)}bind(e,i){const t=this._textures.get(e);if(!t)return!1;const o=this.gl;return o.activeTexture(o.TEXTURE0+i),o.bindTexture(o.TEXTURE_2D,t.texture),!0}static getShaderSrc(){return`
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
`}dispose(){for(const[,e]of this._glTextures)this.gl.deleteTexture(e);this._glTextures.clear(),this._textures.clear()}}function vr(r,e,i,t){const o=[],s=[],n=[],a=[];for(let c=0;c<=t;c++)for(let u=0;u<=i;u++){const f=u/i*Math.PI*2,h=c/t*Math.PI*2;o.push((r+e*Math.cos(h))*Math.cos(f),e*Math.sin(h),(r+e*Math.cos(h))*Math.sin(f)),s.push(Math.cos(h)*Math.cos(f),Math.sin(h),Math.cos(h)*Math.sin(f)),n.push(u/i,c/t)}for(let c=0;c<t;c++)for(let u=0;u<i;u++){const f=c*(i+1)+u,h=f+i+1;a.push(f,h,f+1,h,h+1,f+1)}return{positions:new Float32Array(o),normals:new Float32Array(s),uvs:new Float32Array(n),indices:new Uint16Array(a),triCount:a.length/3}}function br(r,e,i){const t=[],o=[],s=[],n=[];for(let a=0;a<=i;a++)for(let c=0;c<=e;c++){const u=c/e,f=a/i,h=u*Math.PI*2,d=f*Math.PI,m=-r*Math.cos(h)*Math.sin(d),g=r*Math.cos(d),p=r*Math.sin(h)*Math.sin(d),v=Math.sqrt(m*m+g*g+p*p)||1;t.push(m,g,p),o.push(m/v,g/v,p/v),s.push(u,f)}for(let a=0;a<i;a++)for(let c=0;c<e;c++){const u=a*(e+1)+c,f=u+e+1;n.push(u,f,u+1,f,f+1,u+1)}return{positions:new Float32Array(t),normals:new Float32Array(o),uvs:new Float32Array(s),indices:new Uint16Array(n),triCount:n.length/3}}function xr(r){const e=r/2,i=[-e,-e,e,e,-e,e,e,e,e,-e,e,e,e,-e,-e,-e,-e,-e,-e,e,-e,e,e,-e,-e,e,e,e,e,e,e,e,-e,-e,e,-e,-e,-e,-e,e,-e,-e,e,-e,e,-e,-e,e,e,-e,e,e,-e,-e,e,e,-e,e,e,e,-e,-e,-e,-e,-e,e,-e,e,e,-e,e,-e],t=[0,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0],o=[0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1],s=[];for(let n=0;n<6;n++){const a=n*4;s.push(a,a+1,a+2,a,a+2,a+3)}return{positions:new Float32Array(i),normals:new Float32Array(t),uvs:new Float32Array(o),indices:new Uint16Array(s),triCount:s.length/3}}function yr(r,e,i,t){const o=[],s=[],n=[],a=[];function c(u){return u*=Math.PI*2,[(Math.sin(u)+2*Math.sin(2*u))*r,(Math.cos(u)-2*Math.cos(2*u))*r,-Math.sin(3*u)*r]}for(let u=0;u<=t;u++)for(let f=0;f<=i;f++){const h=f/i,d=u/t*Math.PI*2,m=c(h),g=c(h+.001),p=[g[0]-m[0],g[1]-m[1],g[2]-m[2]],v=Math.sqrt(p[0]*p[0]+p[1]*p[1]+p[2]*p[2])||1;p[0]/=v,p[1]/=v,p[2]/=v;let T=[0,1,0];Math.abs(p[1])>.99&&(T=[1,0,0]);const _=[p[1]*T[2]-p[2]*T[1],p[2]*T[0]-p[0]*T[2],p[0]*T[1]-p[1]*T[0]],E=Math.sqrt(_[0]*_[0]+_[1]*_[1]+_[2]*_[2])||1;_[0]/=E,_[1]/=E,_[2]/=E;const x=[_[1]*p[2]-_[2]*p[1],_[2]*p[0]-_[0]*p[2],_[0]*p[1]-_[1]*p[0]],y=Math.cos(d),R=Math.sin(d),M=y*x[0]+R*_[0],I=y*x[1]+R*_[1],q=y*x[2]+R*_[2];o.push(m[0]+e*M,m[1]+e*I,m[2]+e*q),s.push(M,I,q),n.push(h,u/t)}for(let u=0;u<t;u++)for(let f=0;f<i;f++){const h=u*(i+1)+f,d=h+i+1;a.push(h,d,h+1,d,d+1,h+1)}return{positions:new Float32Array(o),normals:new Float32Array(s),uvs:new Float32Array(n),indices:new Uint16Array(a),triCount:a.length/3}}function Rr(r){const e=document.createElement("canvas");e.width=r,e.height=r;const i=e.getContext("2d"),t=i.createRadialGradient(r/2,r/2,0,r/2,r/2,r*.5);t.addColorStop(0,"#ff6b35"),t.addColorStop(.35,"#d63384"),t.addColorStop(.65,"#6f42c1"),t.addColorStop(1,"#0d6efd"),i.fillStyle=t,i.fillRect(0,0,r,r),i.globalCompositeOperation="multiply";const o=8,s=r/o;for(let n=0;n<o;n++)for(let a=0;a<o;a++)i.fillStyle=(n+a)%2===0?"rgba(255,255,255,0.85)":"rgba(60,60,80,0.85)",i.fillRect(a*s,n*s,s,s);i.globalCompositeOperation="screen";for(let n=1;n<=6;n++)i.beginPath(),i.arc(r/2,r/2,n*r*.07,0,Math.PI*2),i.lineWidth=2,i.strokeStyle=`hsla(${n*50},80%,70%,0.4)`,i.stroke();return i.globalCompositeOperation="source-over",i.getImageData(0,0,r,r)}const oe=`#version 300 es
precision highp float; out vec2 v_uv;
void main(){float x=float((gl_VertexID&1)<<2)-1.0;float y=float((gl_VertexID&2)<<1)-1.0;v_uv=vec2(x,y)*0.5+0.5;gl_Position=vec4(x,y,0.0,1.0);}`,Ar=`#version 300 es
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
}`;function Sr(r,e){const i=new Float32Array(16);for(let t=0;t<4;t++)for(let o=0;o<4;o++)i[t*4+o]=r[o]*e[t*4]+r[4+o]*e[t*4+1]+r[8+o]*e[t*4+2]+r[12+o]*e[t*4+3];return i}function Fr(r,e,i,t){const o=1/Math.tan(r*.5),s=1/(i-t);return new Float32Array([o/e,0,0,0,0,o,0,0,0,0,(t+i)*s,-1,0,0,2*t*i*s,0])}function Mr(r,e,i){let t=r[0]-e[0],o=r[1]-e[1],s=r[2]-e[2],n=Math.hypot(t,o,s)||1;t/=n,o/=n,s/=n;let a=i[1]*s-i[2]*o,c=i[2]*t-i[0]*s,u=i[0]*o-i[1]*t;n=Math.hypot(a,c,u)||1,a/=n,c/=n,u/=n;const f=o*u-s*c,h=s*a-t*u,d=t*c-o*a;return new Float32Array([a,f,t,0,c,h,o,0,u,d,s,0,-(a*r[0]+c*r[1]+u*r[2]),-(f*r[0]+h*r[1]+d*r[2]),-(t*r[0]+o*r[1]+s*r[2]),1])}class Pr{constructor(e){this.distance=5,this.azimuth=.5,this.elevation=.35,this.fov=Math.PI/4,this.near=.1,this.far=100,this.target=[0,0,0],this.canvas=e,this._dragging=!1,this._lastX=0,this._lastY=0,e.addEventListener("pointerdown",i=>{this._dragging=!0,this._lastX=i.clientX,this._lastY=i.clientY,e.setPointerCapture(i.pointerId)}),e.addEventListener("pointermove",i=>{this._dragging&&(this.azimuth+=(i.clientX-this._lastX)*.005,this.elevation+=(i.clientY-this._lastY)*.005,this.elevation=Math.max(-1.5,Math.min(1.5,this.elevation)),this._lastX=i.clientX,this._lastY=i.clientY)}),e.addEventListener("pointerup",()=>{this._dragging=!1}),e.addEventListener("wheel",i=>{i.preventDefault(),this.distance*=1+i.deltaY*.001,this.distance=Math.max(1,Math.min(30,this.distance))},{passive:!1})}get isDragging(){return this._dragging}get eye(){const e=Math.cos(this.elevation),i=Math.sin(this.elevation),t=Math.cos(this.azimuth),o=Math.sin(this.azimuth);return[this.target[0]+this.distance*e*o,this.target[1]+this.distance*i,this.target[2]+this.distance*e*t]}get aspect(){return this.canvas.width/this.canvas.height}get viewMatrix(){return Mr(this.eye,this.target,[0,1,0])}get projectionMatrix(){return Fr(this.fov,this.aspect,this.near,this.far)}get viewProjection(){return Sr(this.projectionMatrix,this.viewMatrix)}}const F=document.getElementById("canvas");F.width=window.innerWidth*devicePixelRatio;F.height=window.innerHeight*devicePixelRatio;const l=F.getContext("webgl2",{depth:!0,antialias:!1,preserveDrawingBuffer:!0});if(!l)throw document.body.innerHTML='<h2 style="color:#fff;text-align:center;margin-top:40vh">WebGL2 required</h2>',new Error("WebGL2 required");l.getExtension("EXT_color_buffer_half_float");l.getExtension("EXT_color_buffer_float");const D=new Pr(F);window.addEventListener("resize",()=>{F.width=window.innerWidth*devicePixelRatio,F.height=window.innerHeight*devicePixelRatio});const re=new ir(l,{lightDir:[.5,.8,.3],lightColor:[1,.98,.95],ambientColor:[.15,.15,.22],specularPower:48}),Xe=new Tt(l,{pointScale:F.height/(2*Math.tan(Math.PI/8)),blendMode:"additive",animate:!0,intensity:1,chromatic:.4}),N=new sr(l,{layerCount:4,geometry:3,thickness:.6,patternScale:3,patternSpeed:.3,depthSensitivity:8,normalSensitivity:2,opacity:.8}),b=new cr(l,{exposure:1.2,gamma:2.2});b.setMeshRenderer(re);b.setSplatRenderer(Xe);b.setEdgeInscription(N);const Te=new dr({layerCount:4,transitionDuration:.5});Te.registerObject(1,"active");let K=.3,w=null,bt=null,xt=3;{const r=l.createShader(l.VERTEX_SHADER);l.shaderSource(r,oe),l.compileShader(r);const e=l.createShader(l.FRAGMENT_SHADER);l.shaderSource(e,Ar),l.compileShader(e),l.getShaderParameter(r,l.COMPILE_STATUS)&&l.getShaderParameter(e,l.COMPILE_STATUS)&&(w=l.createProgram(),l.attachShader(w,r),l.attachShader(w,e),l.linkProgram(w),l.getProgramParameter(w,l.LINK_STATUS)?bt=l.createVertexArray():w=null)}b.setProceduralRenderer((r,e)=>{w&&(l.useProgram(w),l.bindVertexArray(bt),l.uniform1f(l.getUniformLocation(w,"u_time"),e),l.uniform1f(l.getUniformLocation(w,"u_geometry"),xt),l.uniform2f(l.getUniformLocation(w,"u_resolution"),r.width,r.height),l.drawArrays(l.TRIANGLES,0,3))});let ge=null,ae=!0;try{ge=new mr(l,{resolution:1024,bias:.003,pcfRadius:2,frustumSize:6,lightDir:[.5,.8,.3]}),ge.init()}catch(r){console.warn("ShadowMap init failed:",r),ge=null}let S=null,H=!0,Me=50,Pe=.8,lt="surface";try{S=new pr(l,{maxParticles:1e4,emitRate:50,lifetime:2.5,speed:.3,speedVariance:.15,gravity:[0,-.1,0],drag:.02,splatScale:.015,emitterType:"sphere",emitterRadius:1.2,colorStart:[.4,.7,1],colorEnd:[.8,.3,1],colorMode:"lerp"})}catch(r){console.warn("ParticleSystem init failed:",r),S=null}let W=null,ie=!1,yt=.8,Rt=.4;try{W=new gr(l,{maxSteps:48,density:.8,absorption:.4,geometry:3,primaryColor:[.3,.6,1],secondaryColor:[.8,.2,.9]}),W.init()}catch(r){console.warn("VolumetricInscription init failed:",r),W=null}let j=null,ve=!0;try{j=new Er(l,{lightDir:[.5,.8,.3],lightColor:[1,.98,.95],specularPower:32,specularStrength:.6,fresnelPower:3,inscriptionEmission:1.5}),j.init()}catch(r){console.warn("DeferredInscriptionLighting init failed:",r),j=null}let ce=null;try{ce=new Tr(l),ce.setLayerCircuitPattern(0,{density:12,color:"#5b9cf5"}),ce.setLayerText(1,"VIB3+",{fontSize:48,color:"#a78bfa"})}catch(r){console.warn("InscriptionTexture init failed:",r),ce=null}const Dr={torus:()=>vr(1,.4,64,32),sphere:()=>br(1.2,48,32),cube:()=>xr(1.8),knot:()=>yr(.35,.12,128,24)};let At="torus",V=null,ue=[];const wr=new hr,he=Rr(256);function Oe(r){At=r;const e=Dr[r];e&&(V=e(),re.uploadGeometry(V),re.uploadTexture(he),ue=wr.convert({positions:V.positions,normals:V.normals,uvs:V.uvs,indices:V.indices,diffusePixels:he.data,diffuseWidth:he.width,diffuseHeight:he.height}),Xe.updateSeeds(Et(ue),ue.length),document.getElementById("meshTris").textContent=V.triCount.toLocaleString(),document.getElementById("splatCount").textContent=ue.length.toLocaleString(),document.querySelectorAll(".mesh-btn").forEach(i=>i.classList.toggle("active",i.dataset.mesh===r)))}let St="showcase";const Br={showcase:{m:!0,s:!0,p:!0,i:!0,shadow:!0,particles:!0,volumetric:!1,deferred:!0,l:"v3 Showcase"},hybrid:{m:!0,s:!0,p:!0,i:!0,shadow:!1,particles:!1,volumetric:!1,deferred:!1,l:"Full Hybrid"},shadows:{m:!0,s:!1,p:!1,i:!0,shadow:!0,particles:!1,volumetric:!1,deferred:!0,l:"Shadows"},particles:{m:!0,s:!1,p:!1,i:!0,shadow:!1,particles:!0,volumetric:!1,deferred:!1,l:"Particles"},volumetric:{m:!0,s:!1,p:!1,i:!1,shadow:!1,particles:!1,volumetric:!0,deferred:!1,l:"Volumetric"},inscFX:{m:!0,s:!1,p:!1,i:!0,shadow:!0,particles:!0,volumetric:!1,deferred:!0,l:"Inscription FX"},benchmark:{m:!0,s:!0,p:!0,i:!0,shadow:!0,particles:!0,volumetric:!1,deferred:!0,l:"Benchmark"}};function Ne(r){St=r;const e=Br[r];e&&(b.meshLayer.enabled=e.m,b.splatLayer.enabled=e.s,b.proceduralLayer.enabled=e.p,b.inscriptionLayer.enabled=e.i,ae=e.shadow,H=e.particles,ie=e.volumetric,ve=e.deferred,document.getElementById("toggleMesh").checked=e.m,document.getElementById("toggleSplat").checked=e.s,document.getElementById("toggleProcedural").checked=e.p,document.getElementById("toggleInscription").checked=e.i,document.getElementById("toggleShadows").checked=e.shadow,document.getElementById("toggleParticles").checked=e.particles,document.getElementById("toggleVolumetric").checked=e.volumetric,document.getElementById("toggleDeferredLit").checked=e.deferred,document.getElementById("compositorMode").textContent=e.l,document.getElementById("benchmarkPanel").classList.toggle("hidden",r!=="benchmark"),document.querySelectorAll(".tab-btn").forEach(i=>i.classList.toggle("active",i.dataset.tab===r)),Q())}function Q(){const r=(e,i)=>{const t=document.getElementById(e);t&&(t.className="feature-badge "+(i?"on":"off"))};r("badgeShadows",ae&&ge),r("badgeParticles",H&&S),r("badgeVolumetric",ie&&W),r("badgeDeferredLit",ve&&j),r("badgeInscription",b.inscriptionLayer.enabled)}document.querySelectorAll(".tab-btn").forEach(r=>r.addEventListener("click",()=>Ne(r.dataset.tab)));document.querySelectorAll(".mesh-btn").forEach(r=>r.addEventListener("click",()=>Oe(r.dataset.mesh)));const ct=document.getElementById("controlsToggle"),Lr=document.getElementById("controls");ct.addEventListener("click",()=>{const r=Lr.classList.toggle("collapsed");ct.classList.toggle("active",!r)});document.getElementById("toggleMesh").addEventListener("change",r=>b.meshLayer.enabled=r.target.checked);document.getElementById("toggleSplat").addEventListener("change",r=>b.splatLayer.enabled=r.target.checked);document.getElementById("toggleProcedural").addEventListener("change",r=>b.proceduralLayer.enabled=r.target.checked);document.getElementById("toggleInscription").addEventListener("change",r=>{b.inscriptionLayer.enabled=r.target.checked,Q()});function U(r,e,i){const t=document.getElementById(r),o=document.getElementById(e);!t||!o||t.addEventListener("input",()=>{const s=t.value/100;o.textContent=s.toFixed(2),i(s)})}U("sliderMeshOpacity","valMeshOpacity",r=>b.meshLayer.opacity=r);U("sliderSplatOpacity","valSplatOpacity",r=>b.splatLayer.opacity=r);U("sliderProcOpacity","valProcOpacity",r=>b.proceduralLayer.opacity=r);U("sliderInscOpacity","valInscOpacity",r=>b.inscriptionLayer.opacity=r);const De=document.getElementById("sliderThickness"),Ur=document.getElementById("valThickness");De&&De.addEventListener("input",()=>{const r=De.value/100;Ur.textContent=r.toFixed(2),N.thickness=r});const fe=document.getElementById("sliderPattern"),Ir=document.getElementById("valPattern");fe&&fe.addEventListener("input",()=>{Ir.textContent=fe.value,N.geometry=parseInt(fe.value)});const ee=document.getElementById("sliderLayerCount"),Cr=document.getElementById("valLayerCount");ee&&ee.addEventListener("input",()=>{Cr.textContent=ee.value,N.layerCount=parseInt(ee.value),document.getElementById("inscLayers").textContent=ee.value});const de=document.getElementById("sliderGeometry"),Xr=document.getElementById("valGeometry");de&&de.addEventListener("input",()=>{Xr.textContent=de.value,xt=parseInt(de.value)});const we=document.getElementById("sliderExposure"),Or=document.getElementById("valExposure");we&&we.addEventListener("input",()=>{const r=we.value/100;Or.textContent=r.toFixed(2),b.exposure=r});function We(r,e,i){const t=document.getElementById(r),o=document.getElementById(e);!t||!o||t.addEventListener("input",()=>{const s=t.value/100;o.textContent=s.toFixed(2),N[i]=s})}We("slider4DXW","val4DXW","rot4dXW");We("slider4DYW","val4DYW","rot4dYW");We("slider4DZW","val4DZW","rot4dZW");const ut=document.getElementById("selectState");ut&&ut.addEventListener("change",r=>{Te.setObjectState(1,r.target.value);const e=document.getElementById("currentState");e&&(e.textContent=r.target.value)});const Be=document.getElementById("sliderAudioSim"),ht=document.getElementById("valAudioSim");Be&&Be.addEventListener("input",()=>{const r=Be.value/100;ht&&(ht.textContent=r.toFixed(2)),K=r});document.getElementById("toggleShadows").addEventListener("change",r=>{ae=r.target.checked,Q()});U("sliderShadowInt","valShadowInt",r=>r);U("sliderShadowSoft","valShadowSoft",r=>r);document.getElementById("toggleParticles").addEventListener("change",r=>{H=r.target.checked,Q()});{const r=document.getElementById("sliderParticleRate"),e=document.getElementById("valParticleRate");r&&r.addEventListener("input",()=>{Me=parseInt(r.value),e.textContent=Me,S&&(S.emitRate=Me)});const i=document.getElementById("sliderParticleSize"),t=document.getElementById("valParticleSize");i&&i.addEventListener("input",()=>{Pe=i.value/100,t.textContent=Pe.toFixed(2),S&&(S.splatScale=Pe*.02)});const o=document.getElementById("selectParticleMode");o&&o.addEventListener("change",s=>{lt=s.target.value,S&&(S.emitterType=lt==="surface"?"sphere":"point")})}document.getElementById("toggleVolumetric").addEventListener("change",r=>{ie=r.target.checked,Q()});U("sliderVolDensity","valVolDensity",r=>{yt=r,W&&(W.density=r)});U("sliderVolAbsorb","valVolAbsorb",r=>{Rt=r,W&&(W.absorption=r)});document.getElementById("toggleDeferredLit").addEventListener("change",r=>{ve=r.target.checked,Q()});U("sliderSpecular","valSpecular",r=>{j&&(j.specularStrength=r)});U("sliderFresnel","valFresnel",r=>{j&&(j.fresnelPower=r*8)});document.getElementById("selectSplatSource").addEventListener("change",r=>{const e=r.target.value;if(e==="texture")Oe(At);else{const i=[],t=e==="galaxy"?2e5:15e4;for(let o=0;o<t;o++){const s=Math.random()*Math.PI*2,n=Math.pow(Math.random(),.5)*3;if(e==="galaxy"){const a=Math.floor(Math.random()*3)*(Math.PI*2/3),c=s*.5;i.push({position:[n*Math.cos(s+a+c)+(Math.random()-.5)*.3,(Math.random()-.5)*.2*(1-n/3),n*Math.sin(s+a+c)+(Math.random()-.5)*.3],orientation:[1,0,0,0],scale:.015+Math.random()*.02,color:[.6+Math.random()*.4,.4+Math.random()*.4,.8+Math.random()*.2],depth:n*.3})}else{const a=(Math.random()-.5)*Math.PI;i.push({position:[n*Math.cos(s)*Math.cos(a),n*Math.sin(a)*.6,n*Math.sin(s)*Math.cos(a)],orientation:[1,0,0,0],scale:.02+Math.random()*.03,color:[.8+Math.random()*.2,.2+Math.random()*.3,.5+Math.random()*.5],depth:n*.2})}}Xe.updateSeeds(Et(i),i.length),document.getElementById("splatCount").textContent=i.length.toLocaleString()}});const Nr=`#version 300 es
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
}`;let Y=null;{const r=l.createShader(l.VERTEX_SHADER);l.shaderSource(r,oe),l.compileShader(r);const e=l.createShader(l.FRAGMENT_SHADER);l.shaderSource(e,Nr),l.compileShader(e),l.getShaderParameter(r,l.COMPILE_STATUS)&&l.getShaderParameter(e,l.COMPILE_STATUS)&&(Y=l.createProgram(),l.attachShader(Y,r),l.attachShader(Y,e),l.linkProgram(Y),l.getProgramParameter(Y,l.LINK_STATUS)?l.createVertexArray():(console.warn("Shadow comp link:",l.getProgramInfoLog(Y)),Y=null))}const Wr=`#version 300 es
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
}`;let G=null;{const r=l.createShader(l.VERTEX_SHADER);l.shaderSource(r,oe),l.compileShader(r);const e=l.createShader(l.FRAGMENT_SHADER);l.shaderSource(e,Wr),l.compileShader(e),l.getShaderParameter(r,l.COMPILE_STATUS)&&l.getShaderParameter(e,l.COMPILE_STATUS)&&(G=l.createProgram(),l.attachShader(G,r),l.attachShader(G,e),l.linkProgram(G),l.getProgramParameter(G,l.LINK_STATUS)?l.createVertexArray():(console.warn("Deferred lit link:",l.getProgramInfoLog(G)),G=null))}const jr=`#version 300 es
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
}`;let A=null,Ft=null;{const r=l.createShader(l.VERTEX_SHADER);l.shaderSource(r,oe),l.compileShader(r);const e=l.createShader(l.FRAGMENT_SHADER);l.shaderSource(e,jr),l.compileShader(e),l.getShaderParameter(r,l.COMPILE_STATUS)&&l.getShaderParameter(e,l.COMPILE_STATUS)?(A=l.createProgram(),l.attachShader(A,r),l.attachShader(A,e),l.linkProgram(A),l.getProgramParameter(A,l.LINK_STATUS)?Ft=l.createVertexArray():(console.warn("Volumetric link:",l.getProgramInfoLog(A)),A=null)):console.warn("Volumetric shader compile failed")}let te=null,z=null,ft=0,dt=0;try{te=new Tt(l,{pointScale:F.height/(2*Math.tan(Math.PI/8)),blendMode:"additive",animate:!0,intensity:1.5,chromatic:.6})}catch(r){console.warn("Particle splat renderer init failed:",r)}function Vr(r,e){if(ft===r&&dt===e&&z)return;z&&(l.deleteFramebuffer(z.framebuffer),l.deleteTexture(z.texture));const i=l.createTexture();l.bindTexture(l.TEXTURE_2D,i),l.texImage2D(l.TEXTURE_2D,0,l.RGBA8,r,e,0,l.RGBA,l.UNSIGNED_BYTE,null),l.texParameteri(l.TEXTURE_2D,l.TEXTURE_MIN_FILTER,l.LINEAR),l.texParameteri(l.TEXTURE_2D,l.TEXTURE_MAG_FILTER,l.LINEAR),l.texParameteri(l.TEXTURE_2D,l.TEXTURE_WRAP_S,l.CLAMP_TO_EDGE),l.texParameteri(l.TEXTURE_2D,l.TEXTURE_WRAP_T,l.CLAMP_TO_EDGE);const t=l.createRenderbuffer();l.bindRenderbuffer(l.RENDERBUFFER,t),l.renderbufferStorage(l.RENDERBUFFER,l.DEPTH_COMPONENT24,r,e);const o=l.createFramebuffer();l.bindFramebuffer(l.FRAMEBUFFER,o),l.framebufferTexture2D(l.FRAMEBUFFER,l.COLOR_ATTACHMENT0,l.TEXTURE_2D,i,0),l.framebufferRenderbuffer(l.FRAMEBUFFER,l.DEPTH_ATTACHMENT,l.RENDERBUFFER,t),l.bindFramebuffer(l.FRAMEBUFFER,null),z={framebuffer:o,texture:i,depthRb:t},ft=r,dt=e}function mt(r,e,i){const t=r.createTexture();r.bindTexture(r.TEXTURE_2D,t),r.texImage2D(r.TEXTURE_2D,0,r.RGBA8,e,i,0,r.RGBA,r.UNSIGNED_BYTE,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE);const o=r.createFramebuffer();return r.bindFramebuffer(r.FRAMEBUFFER,o),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,t,0),r.bindFramebuffer(r.FRAMEBUFFER,null),{framebuffer:o,texture:t,width:e,height:i}}let me=null,_e=null,_t=0,pt=0;function Yr(r,e){_t===r&&pt===e||(me&&(l.deleteFramebuffer(me.framebuffer),l.deleteTexture(me.texture)),_e&&(l.deleteFramebuffer(_e.framebuffer),l.deleteTexture(_e.texture)),me=mt(l,r,e),_e=mt(l,r,e),_t=r,pt=e)}const Gr=`#version 300 es
precision highp float; in vec2 v_uv; uniform sampler2D u_texture; uniform float u_opacity; out vec4 outColor;
void main(){vec4 c=texture(u_texture,v_uv);outColor=vec4(c.rgb,c.a*u_opacity);}`;let L=null,Mt=null;{const r=l.createShader(l.VERTEX_SHADER);l.shaderSource(r,oe),l.compileShader(r);const e=l.createShader(l.FRAGMENT_SHADER);l.shaderSource(e,Gr),l.compileShader(e),l.getShaderParameter(r,l.COMPILE_STATUS)&&l.getShaderParameter(e,l.COMPILE_STATUS)&&(L=l.createProgram(),l.attachShader(L,r),l.attachShader(L,e),l.linkProgram(L),l.getProgramParameter(L,l.LINK_STATUS)?Mt=l.createVertexArray():L=null)}function kr(r,e=1){L&&(l.useProgram(L),l.bindVertexArray(Mt),l.activeTexture(l.TEXTURE0),l.bindTexture(l.TEXTURE_2D,r),l.uniform1i(l.getUniformLocation(L,"u_texture"),0),l.uniform1f(l.getUniformLocation(L,"u_opacity"),e),l.drawArrays(l.TRIANGLES,0,3))}let k=null,Le=[];document.getElementById("btnScreenshot").addEventListener("click",()=>{F.toBlob(r=>{const e=document.createElement("a");e.href=URL.createObjectURL(r),e.download=`vib3-screenshot-${Date.now()}.png`,e.click(),URL.revokeObjectURL(e.href)},"image/png")});document.getElementById("btnRecord").addEventListener("click",()=>{const r=document.getElementById("btnRecord");if(k&&k.state==="recording"){k.stop(),r.classList.remove("recording"),r.innerHTML='<span class="dot red"></span>Record';return}Le=[];const e=F.captureStream(30);k=new MediaRecorder(e,{mimeType:"video/webm;codecs=vp9"}),k.ondataavailable=i=>{i.data.size>0&&Le.push(i.data)},k.onstop=()=>{const i=new Blob(Le,{type:"video/webm"}),t=document.createElement("a");t.href=URL.createObjectURL(i),t.download=`vib3-recording-${Date.now()}.webm`,t.click(),URL.revokeObjectURL(t.href)},k.start(),r.classList.add("recording"),r.innerHTML='<span class="dot red"></span>Stop'});document.getElementById("btnGIF").addEventListener("click",()=>{const r=document.getElementById("btnGIF");r.textContent="Capturing...",r.disabled=!0;let e=0;const i=60;function t(){if(e>=i){F.toBlob(o=>{const s=document.createElement("a");s.href=URL.createObjectURL(o),s.download=`vib3-gif-frame-${Date.now()}.png`,s.click(),URL.revokeObjectURL(s.href),r.textContent="GIF",r.disabled=!1},"image/png");return}e++,requestAnimationFrame(t)}requestAnimationFrame(t)});async function zr(){const r=document.getElementById("runBenchmark"),e=document.getElementById("benchResults");r.disabled=!0,r.textContent="Running...",e.innerHTML="";const i=[{name:"Mesh Only",m:!0,s:!1,p:!1,i:!1,sh:!1,pt:!1},{name:"Splat Only",m:!1,s:!0,p:!1,i:!1,sh:!1,pt:!1},{name:"Mesh + Inscription",m:!0,s:!1,p:!1,i:!0,sh:!1,pt:!1},{name:"Full Hybrid (v2)",m:!0,s:!0,p:!0,i:!0,sh:!1,pt:!1},{name:"+ Shadows (v3)",m:!0,s:!0,p:!0,i:!0,sh:!0,pt:!1},{name:"+ Particles (v3)",m:!0,s:!0,p:!0,i:!0,sh:!0,pt:!0},{name:"Full v3 Pipeline",m:!0,s:!0,p:!0,i:!0,sh:!0,pt:!0}],t=60,o=[];for(const a of i){b.meshLayer.enabled=a.m,b.splatLayer.enabled=a.s,b.proceduralLayer.enabled=a.p,b.inscriptionLayer.enabled=a.i,ae=a.sh,H=a.pt;for(let d=0;d<5;d++){const m=performance.now()*.001;b.render(m,D.viewMatrix,D.projectionMatrix,{viewProjection:D.viewProjection})}l.finish();const c=performance.now();for(let d=0;d<t;d++){const m=performance.now()*.001;b.render(m,D.viewMatrix,D.projectionMatrix,{viewProjection:D.viewProjection})}l.finish();const u=performance.now()-c,f=u/t,h=1e3/f;o.push({name:a.name,avgMs:f,fps:h}),await new Promise(d=>setTimeout(d,10))}Ne(St);const s=Math.max(...o.map(a=>a.avgMs));let n='<div class="bench-row bench-header"><span>Configuration</span><span>ms/frame</span><span>FPS</span></div>';for(const a of o){const c=Math.round(a.avgMs/s*100),u=a.name.includes("v3");n+=`<div class="bench-row ${a.name==="Full v3 Pipeline"?"bench-total":""}"><span class="bench-label">${a.name}</span><span class="bench-value">${a.avgMs.toFixed(2)}</span><span class="bench-value">${Math.round(a.fps)}</span></div><div class="bench-bar" style="width:${c}%;${u?"background:rgba(167,139,250,0.5)":""}"></div>`}e.innerHTML=n,r.disabled=!1,r.textContent="Run Benchmark"}document.getElementById("runBenchmark").addEventListener("click",zr);let Ue=0,Ie=performance.now(),je=!0,Hr=performance.now(),gt=0;const qr=document.getElementById("fps"),Zr=document.getElementById("frameTime"),$r=document.getElementById("activeLayers");F.addEventListener("pointerdown",()=>{je=!1});F.addEventListener("pointerup",()=>{setTimeout(()=>{je=!0},3e3)});function Pt(){const r=performance.now(),e=(performance.now()-Hr)*.001,i=e-gt;gt=e;const t=l.canvas.width,o=l.canvas.height;if(je&&!D.isDragging&&(D.azimuth+=.003),N.rot4dXY=e*.1,N.rot4dYZ=e*.07,Te.update(i),K>0){const a=K*(.5+.5*Math.sin(e*2.1)),c=K*(.5+.5*Math.sin(e*3.7)),u=K*(.5+.5*Math.sin(e*5.3)),f=K*(.6+.4*Math.sin(e*1.3));Te.setAudio(a,c,u,f)}if(H&&S){S.update(Math.min(i,.05));const{buffer:a,count:c}=S.getSplatBuffer();te&&c>0&&te.updateSeeds(a,c),document.getElementById("particleCount").textContent=S.getAliveCount()}else document.getElementById("particleCount").textContent="0";const s=b.render(e,D.viewMatrix,D.projectionMatrix,{viewProjection:D.viewProjection});if(H&&te&&S&&S.getAliveCount()>0&&(Vr(t,o),l.bindFramebuffer(l.FRAMEBUFFER,z.framebuffer),l.viewport(0,0,t,o),te.render(D.viewProjection,e),l.bindFramebuffer(l.FRAMEBUFFER,null),l.viewport(0,0,t,o),l.enable(l.BLEND),l.blendFunc(l.ONE,l.ONE),l.disable(l.DEPTH_TEST),kr(z.texture,1),l.disable(l.BLEND)),ie&&A){Yr(t,o),l.enable(l.BLEND),l.blendFunc(l.ONE,l.ONE),l.useProgram(A),l.bindVertexArray(Ft);const a=re.gbuffer?re.gbuffer.normalTexture:null;a&&(l.activeTexture(l.TEXTURE0),l.bindTexture(l.TEXTURE_2D,a),l.uniform1i(l.getUniformLocation(A,"u_normalDepth"),0)),l.uniform1f(l.getUniformLocation(A,"u_time"),e),l.uniform1f(l.getUniformLocation(A,"u_density"),yt),l.uniform1f(l.getUniformLocation(A,"u_absorption"),Rt),l.uniform1f(l.getUniformLocation(A,"u_geometry"),N.geometry),l.uniform2f(l.getUniformLocation(A,"u_resolution"),t,o),l.drawArrays(l.TRIANGLES,0,3),l.disable(l.BLEND),document.getElementById("volSteps").textContent="48"}else document.getElementById("volSteps").textContent="0";Ue++;const n=performance.now();n-Ie>500&&(qr.textContent=Math.round(Ue/((n-Ie)/1e3)),Zr.textContent=(n-r).toFixed(1)+" ms",Ue=0,Ie=n),s&&($r.textContent=s.layersComposited+(H?1:0)+(ie?1:0)+(ae?1:0)+(ve?1:0)),requestAnimationFrame(Pt)}Oe("torus");Ne("showcase");Pt();
