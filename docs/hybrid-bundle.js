const Qr=Object.freeze([1,0,0,0]),Jr=Object.freeze([1,1,1]),Et=12;function we(r){const e=new Float32Array(r.length*Et);return r.forEach((i,t)=>{const a=t*Et,n=i.position??[0,0,0],l=i.orientation??Qr,s=i.color??Jr,c=i.scale??1,h=i.depth??0;e[a+0]=n[0]??0,e[a+1]=n[1]??0,e[a+2]=n[2]??0,e[a+3]=c,e[a+4]=l[0]??1,e[a+5]=l[1]??0,e[a+6]=l[2]??0,e[a+7]=l[3]??0,e[a+8]=s[0]??1,e[a+9]=s[1]??1,e[a+10]=s[2]??1,e[a+11]=h}),e}const ei=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),ti=`#version 300 es
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
`,ri=`#version 300 es
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
`;class cr{constructor(e,{pointScale:i=14,blendMode:t="premultiplied",animate:a=!1,intensity:n=1,chromatic:l=0}={}){if(!e)throw new Error("GaussianSplatRenderer requires a WebGL2 context.");this.gl=e,this.pointScale=i,this.blendMode=t,this.animate=a,this.intensity=n,this.chromatic=l,this.program=null,this.vao=null,this.buffer=null,this.count=0,this.uniforms={},this._init()}_init(){const e=this.gl,i=e.createProgram(),t=this._compileShader(e.VERTEX_SHADER,ti),a=this._compileShader(e.FRAGMENT_SHADER,ri);if(e.attachShader(i,t),e.attachShader(i,a),e.linkProgram(i),!e.getProgramParameter(i,e.LINK_STATUS))throw new Error(e.getProgramInfoLog(i));this.program=i,this.vao=e.createVertexArray(),e.bindVertexArray(this.vao),this.buffer=e.createBuffer(),e.bindBuffer(e.ARRAY_BUFFER,this.buffer);const n=Et*4,l=e.getAttribLocation(i,"a_position");e.enableVertexAttribArray(l),e.vertexAttribPointer(l,3,e.FLOAT,!1,n,0);const s=e.getAttribLocation(i,"a_scale");e.enableVertexAttribArray(s),e.vertexAttribPointer(s,1,e.FLOAT,!1,n,3*4);const c=e.getAttribLocation(i,"a_orientation");e.enableVertexAttribArray(c),e.vertexAttribPointer(c,4,e.FLOAT,!1,n,4*4);const h=e.getAttribLocation(i,"a_color");e.enableVertexAttribArray(h),e.vertexAttribPointer(h,3,e.FLOAT,!1,n,8*4);const f=e.getAttribLocation(i,"a_depth");e.enableVertexAttribArray(f),e.vertexAttribPointer(f,1,e.FLOAT,!1,n,11*4),e.bindVertexArray(null),this.uniforms.pointScale=e.getUniformLocation(i,"u_pointScale"),this.uniforms.viewProjection=e.getUniformLocation(i,"u_viewProjection"),this.uniforms.time=e.getUniformLocation(i,"u_time"),this.uniforms.animate=e.getUniformLocation(i,"u_animate"),this.uniforms.intensity=e.getUniformLocation(i,"u_intensity"),this.uniforms.chromatic=e.getUniformLocation(i,"u_chromatic")}_compileShader(e,i){const t=this.gl,a=t.createShader(e);if(t.shaderSource(a,i),t.compileShader(a),!t.getShaderParameter(a,t.COMPILE_STATUS))throw new Error(t.getShaderInfoLog(a));return a}updateSeeds(e,i){const t=this.gl;t.bindBuffer(t.ARRAY_BUFFER,this.buffer),t.bufferData(t.ARRAY_BUFFER,e,t.DYNAMIC_DRAW),this.count=i}render(e,i=0){const t=this.gl;this.count&&(t.viewport(0,0,t.canvas.width,t.canvas.height),t.clearColor(.012,.02,.05,1),t.clear(t.COLOR_BUFFER_BIT|t.DEPTH_BUFFER_BIT),t.enable(t.DEPTH_TEST),t.depthFunc(t.LEQUAL),t.depthMask(!1),t.enable(t.BLEND),this.blendMode==="additive"?t.blendFunc(t.ONE,t.ONE):t.blendFunc(t.ONE,t.ONE_MINUS_SRC_ALPHA),t.useProgram(this.program),t.bindVertexArray(this.vao),t.uniform1f(this.uniforms.pointScale,this.pointScale),t.uniform1f(this.uniforms.time,i),t.uniform1f(this.uniforms.animate,this.animate?1:0),t.uniform1f(this.uniforms.intensity,this.intensity),t.uniform1f(this.uniforms.chromatic,this.chromatic),t.uniformMatrix4fv(this.uniforms.viewProjection,!1,e||ei),t.drawArrays(t.POINTS,0,this.count),t.bindVertexArray(null),t.depthMask(!0),t.disable(t.BLEND))}}const ii=`#version 300 es
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
`,oi=`#version 300 es
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
`;function ai(r,e,i){const t=r.createFramebuffer();r.bindFramebuffer(r.FRAMEBUFFER,t);const a=r.createTexture();r.bindTexture(r.TEXTURE_2D,a),r.texImage2D(r.TEXTURE_2D,0,r.RGBA8,e,i,0,r.RGBA,r.UNSIGNED_BYTE,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,a,0);const n=r.createTexture();r.bindTexture(r.TEXTURE_2D,n);let l=r.RGBA8,s=r.UNSIGNED_BYTE;(r.getExtension("EXT_color_buffer_half_float")||r.getExtension("EXT_color_buffer_float"))&&(l=r.RGBA16F,s=r.HALF_FLOAT),r.texImage2D(r.TEXTURE_2D,0,l,e,i,0,r.RGBA,s,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT1,r.TEXTURE_2D,n,0);const c=r.createTexture();r.bindTexture(r.TEXTURE_2D,c),r.texImage2D(r.TEXTURE_2D,0,r.RGBA8,e,i,0,r.RGBA,r.UNSIGNED_BYTE,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.NEAREST),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT2,r.TEXTURE_2D,c,0);const h=r.createRenderbuffer();return r.bindRenderbuffer(r.RENDERBUFFER,h),r.renderbufferStorage(r.RENDERBUFFER,r.DEPTH_COMPONENT24,e,i),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.RENDERBUFFER,h),r.drawBuffers([r.COLOR_ATTACHMENT0,r.COLOR_ATTACHMENT1,r.COLOR_ATTACHMENT2]),r.bindFramebuffer(r.FRAMEBUFFER,null),{framebuffer:t,colorTexture:a,normalTexture:n,objectIDTexture:c,depthRenderbuffer:h,width:e,height:i}}function Pt(r,e){r.deleteFramebuffer(e.framebuffer),r.deleteTexture(e.colorTexture),r.deleteTexture(e.normalTexture),r.deleteTexture(e.objectIDTexture),r.deleteRenderbuffer(e.depthRenderbuffer)}class si{constructor(e,{lightDir:i=[.4,.8,.3],lightColor:t=[1,.98,.95],ambientColor:a=[.12,.12,.18],specularPower:n=32}={}){this.gl=e,this.lightDir=i,this.lightColor=t,this.ambientColor=a,this.specularPower=n,this.opacity=1,this.objectID=0,this.morphWeight=0,this._hasMorphTarget=!1,this._program=null,this._vao=null,this._posBuf=null,this._nrmBuf=null,this._uvBuf=null,this._colBuf=null,this._morphPosBuf=null,this._morphNrmBuf=null,this._idxBuf=null,this._indexCount=0,this._vertexCount=0,this._indexType=0,this._diffuseTexture=null,this._hasTexture=!1,this._gbuffer=null,this._gbufferWidth=0,this._gbufferHeight=0,this._uniforms={},this._init()}_init(){const e=this.gl;this._program=this._createProgram(ii,oi);const i=h=>e.getUniformLocation(this._program,h);this._uniforms={modelView:i("u_modelView"),projection:i("u_projection"),normalMatrix:i("u_normalMatrix"),rotation4D:i("u_rotation4D"),projDistance:i("u_projDistance"),use4D:i("u_use4D"),morphWeight:i("u_morphWeight"),hasMorphTarget:i("u_hasMorphTarget"),diffuseMap:i("u_diffuseMap"),hasTexture:i("u_hasTexture"),lightDir:i("u_lightDir"),lightColor:i("u_lightColor"),ambientColor:i("u_ambientColor"),specularPower:i("u_specularPower"),opacity:i("u_opacity"),objectID:i("u_objectID")},this._vao=e.createVertexArray(),e.bindVertexArray(this._vao),this._posBuf=e.createBuffer();const t=e.getAttribLocation(this._program,"a_position");e.bindBuffer(e.ARRAY_BUFFER,this._posBuf),e.enableVertexAttribArray(t),e.vertexAttribPointer(t,3,e.FLOAT,!1,0,0),this._nrmBuf=e.createBuffer();const a=e.getAttribLocation(this._program,"a_normal");e.bindBuffer(e.ARRAY_BUFFER,this._nrmBuf),e.enableVertexAttribArray(a),e.vertexAttribPointer(a,3,e.FLOAT,!1,0,0),this._uvBuf=e.createBuffer();const n=e.getAttribLocation(this._program,"a_uv");e.bindBuffer(e.ARRAY_BUFFER,this._uvBuf),e.enableVertexAttribArray(n),e.vertexAttribPointer(n,2,e.FLOAT,!1,0,0),this._colBuf=e.createBuffer();const l=e.getAttribLocation(this._program,"a_color");e.bindBuffer(e.ARRAY_BUFFER,this._colBuf),e.enableVertexAttribArray(l),e.vertexAttribPointer(l,4,e.FLOAT,!1,0,0),this._morphPosBuf=e.createBuffer();const s=e.getAttribLocation(this._program,"a_morphPosition");s>=0&&(e.bindBuffer(e.ARRAY_BUFFER,this._morphPosBuf),e.enableVertexAttribArray(s),e.vertexAttribPointer(s,3,e.FLOAT,!1,0,0)),this._morphNrmBuf=e.createBuffer();const c=e.getAttribLocation(this._program,"a_morphNormal");c>=0&&(e.bindBuffer(e.ARRAY_BUFFER,this._morphNrmBuf),e.enableVertexAttribArray(c),e.vertexAttribPointer(c,3,e.FLOAT,!1,0,0)),this._idxBuf=e.createBuffer(),e.bindVertexArray(null)}uploadGeometry({positions:e,normals:i,uvs:t,colors:a,indices:n}){const l=this.gl,s=e.length/3;if(this._vertexCount=s,l.bindBuffer(l.ARRAY_BUFFER,this._posBuf),l.bufferData(l.ARRAY_BUFFER,e,l.DYNAMIC_DRAW),i)l.bindBuffer(l.ARRAY_BUFFER,this._nrmBuf),l.bufferData(l.ARRAY_BUFFER,i,l.DYNAMIC_DRAW);else{const c=new Float32Array(s*3);for(let h=0;h<s;h++)c[h*3+1]=1;l.bindBuffer(l.ARRAY_BUFFER,this._nrmBuf),l.bufferData(l.ARRAY_BUFFER,c,l.DYNAMIC_DRAW)}if(t?(l.bindBuffer(l.ARRAY_BUFFER,this._uvBuf),l.bufferData(l.ARRAY_BUFFER,t,l.DYNAMIC_DRAW)):(l.bindBuffer(l.ARRAY_BUFFER,this._uvBuf),l.bufferData(l.ARRAY_BUFFER,new Float32Array(s*2),l.DYNAMIC_DRAW)),a)l.bindBuffer(l.ARRAY_BUFFER,this._colBuf),l.bufferData(l.ARRAY_BUFFER,a,l.DYNAMIC_DRAW);else{const c=new Float32Array(s*4);for(let h=0;h<s;h++)c[h*4]=1,c[h*4+1]=1,c[h*4+2]=1,c[h*4+3]=1;l.bindBuffer(l.ARRAY_BUFFER,this._colBuf),l.bufferData(l.ARRAY_BUFFER,c,l.DYNAMIC_DRAW)}l.bindBuffer(l.ARRAY_BUFFER,this._morphPosBuf),l.bufferData(l.ARRAY_BUFFER,e,l.DYNAMIC_DRAW),l.bindBuffer(l.ARRAY_BUFFER,this._morphNrmBuf),l.bufferData(l.ARRAY_BUFFER,i||new Float32Array(s*3),l.DYNAMIC_DRAW),n?(l.bindBuffer(l.ELEMENT_ARRAY_BUFFER,this._idxBuf),l.bufferData(l.ELEMENT_ARRAY_BUFFER,n,l.STATIC_DRAW),this._indexCount=n.length,this._indexType=n instanceof Uint32Array?l.UNSIGNED_INT:l.UNSIGNED_SHORT):this._indexCount=0}uploadMorphTarget(e,i){const t=this.gl;t.bindBuffer(t.ARRAY_BUFFER,this._morphPosBuf),t.bufferData(t.ARRAY_BUFFER,e,t.DYNAMIC_DRAW),i&&(t.bindBuffer(t.ARRAY_BUFFER,this._morphNrmBuf),t.bufferData(t.ARRAY_BUFFER,i,t.DYNAMIC_DRAW)),this._hasMorphTarget=!0}uploadTexture(e){const i=this.gl;this._diffuseTexture||(this._diffuseTexture=i.createTexture()),i.bindTexture(i.TEXTURE_2D,this._diffuseTexture),e instanceof ImageData?i.texImage2D(i.TEXTURE_2D,0,i.RGBA,e.width,e.height,0,i.RGBA,i.UNSIGNED_BYTE,e.data):i.texImage2D(i.TEXTURE_2D,0,i.RGBA,i.RGBA,i.UNSIGNED_BYTE,e),i.generateMipmap(i.TEXTURE_2D),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.LINEAR_MIPMAP_LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.REPEAT),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.REPEAT),this._hasTexture=!0}_ensureGBuffer(e,i){this._gbuffer&&this._gbufferWidth===e&&this._gbufferHeight===i||(this._gbuffer&&Pt(this.gl,this._gbuffer),this._gbuffer=ai(this.gl,e,i),this._gbufferWidth=e,this._gbufferHeight=i)}get gbuffer(){return this._gbuffer}render(e,i,{rotation4D:t=null,projDistance:a=2,width:n=0,height:l=0,clearBuffer:s=!0}={}){const c=this.gl,h=n||c.canvas.width,f=l||c.canvas.height;if(this._ensureGBuffer(h,f),c.bindFramebuffer(c.FRAMEBUFFER,this._gbuffer.framebuffer),c.viewport(0,0,h,f),s&&(c.clearColor(0,0,0,0),c.clear(c.COLOR_BUFFER_BIT|c.DEPTH_BUFFER_BIT)),this._vertexCount===0&&this._indexCount===0)return c.bindFramebuffer(c.FRAMEBUFFER,null),this._gbuffer;c.enable(c.DEPTH_TEST),c.depthFunc(c.LEQUAL),c.depthMask(!0),c.enable(c.CULL_FACE),c.cullFace(c.BACK),c.disable(c.BLEND),c.useProgram(this._program),c.bindVertexArray(this._vao),this._indexCount>0&&c.bindBuffer(c.ELEMENT_ARRAY_BUFFER,this._idxBuf);const u=this._uniforms,d=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);return c.uniformMatrix4fv(u.modelView,!1,e||d),c.uniformMatrix4fv(u.projection,!1,i||d),c.uniformMatrix4fv(u.normalMatrix,!1,e||d),c.uniformMatrix4fv(u.rotation4D,!1,t||d),c.uniform1f(u.projDistance,a),c.uniform1f(u.use4D,t?1:0),c.uniform1f(u.morphWeight,this.morphWeight),c.uniform1f(u.hasMorphTarget,this._hasMorphTarget?1:0),c.uniform3fv(u.lightDir,this.lightDir),c.uniform3fv(u.lightColor,this.lightColor),c.uniform3fv(u.ambientColor,this.ambientColor),c.uniform1f(u.specularPower,this.specularPower),c.uniform1f(u.opacity,this.opacity),c.uniform1f(u.objectID,this.objectID),this._hasTexture&&this._diffuseTexture?(c.activeTexture(c.TEXTURE0),c.bindTexture(c.TEXTURE_2D,this._diffuseTexture),c.uniform1i(u.diffuseMap,0),c.uniform1f(u.hasTexture,1)):c.uniform1f(u.hasTexture,0),this._indexCount>0?c.drawElements(c.TRIANGLES,this._indexCount,this._indexType,0):c.drawArrays(c.TRIANGLES,0,this._vertexCount),c.bindVertexArray(null),c.bindFramebuffer(c.FRAMEBUFFER,null),c.disable(c.CULL_FACE),this._gbuffer}_createProgram(e,i){const t=this.gl,a=t.createProgram(),n=this._compile(t.VERTEX_SHADER,e),l=this._compile(t.FRAGMENT_SHADER,i);if(t.attachShader(a,n),t.attachShader(a,l),t.linkProgram(a),!t.getProgramParameter(a,t.LINK_STATUS))throw new Error("MeshRenderer link error: "+t.getProgramInfoLog(a));return a}_compile(e,i){const t=this.gl,a=t.createShader(e);if(t.shaderSource(a,i),t.compileShader(a),!t.getShaderParameter(a,t.COMPILE_STATUS))throw new Error("MeshRenderer compile error: "+t.getShaderInfoLog(a));return a}dispose(){const e=this.gl;e.deleteProgram(this._program),e.deleteVertexArray(this._vao),e.deleteBuffer(this._posBuf),e.deleteBuffer(this._nrmBuf),e.deleteBuffer(this._uvBuf),e.deleteBuffer(this._colBuf),e.deleteBuffer(this._morphPosBuf),e.deleteBuffer(this._morphNrmBuf),e.deleteBuffer(this._idxBuf),this._diffuseTexture&&e.deleteTexture(this._diffuseTexture),this._gbuffer&&Pt(e,this._gbuffer)}}const Ut=`#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
    float x = float((gl_VertexID & 1) << 2) - 1.0;
    float y = float((gl_VertexID & 2) << 1) - 1.0;
    v_uv = vec2(x, y) * 0.5 + 0.5;
    gl_Position = vec4(x, y, 0.0, 1.0);
}
`,ni=`#version 300 es
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
`,li=`#version 300 es
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
`;function Lt(r,e,i){const t=r.createTexture();r.bindTexture(r.TEXTURE_2D,t),r.texImage2D(r.TEXTURE_2D,0,r.RGBA8,e,i,0,r.RGBA,r.UNSIGNED_BYTE,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE);const a=r.createFramebuffer();return r.bindFramebuffer(r.FRAMEBUFFER,a),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,t,0),r.bindFramebuffer(r.FRAMEBUFFER,null),{framebuffer:a,texture:t,width:e,height:i}}function Ie(r,e){r.deleteFramebuffer(e.framebuffer),r.deleteTexture(e.texture)}const Bt=[[.2,.6,1],[.8,.3,1],[1,.5,.2],[.3,1,.6],[1,.2,.5],[.4,.9,.9],[.9,.8,.2],[.5,.3,1],[.2,1,.4],[1,.4,0],[.6,.2,.9],[0,.8,.8],[1,.6,.6],[.3,.5,1],[.8,1,.3],[.9,.3,.6]];function wt(r,e){const i=e>1?r/(e-1):0;return{geometry:r*3%24,thickness:.3+i*.5,opacity:.9-i*.5,color:Bt[r%Bt.length],patternScale:3+r*.5,patternSpeed:.3+r*.05,rotOffset:r*.4}}class ci{constructor(e,{layerCount:i=4,depthSensitivity:t=8,normalSensitivity:a=2,globalThickness:n=.6,layers:l=null}={}){if(this.gl=e,this.layerCount=Math.min(16,Math.max(1,i)),this.depthSensitivity=t,this.normalSensitivity=a,this.globalThickness=n,this.rot4dXY=0,this.rot4dXZ=0,this.rot4dYZ=0,this.rot4dXW=0,this.rot4dYW=0,this.rot4dZW=0,this.bass=0,this.mid=0,this.high=0,this.energy=0,this.layers=l||[],this.layers.length===0)for(let s=0;s<this.layerCount;s++)this.layers.push(wt(s,this.layerCount));this._edgeProgram=null,this._inscriptionProgram=null,this._quadVao=null,this._edgeFBO=null,this._compositeFBO=null,this._width=0,this._height=0,this._blackTexture=null,this._edgeUniforms={},this._inscUniforms={},this._init()}_init(){const e=this.gl;this._edgeProgram=this._createProgram(Ut,ni),this._inscriptionProgram=this._createProgram(Ut,li),this._quadVao=e.createVertexArray(),this._blackTexture=e.createTexture(),e.bindTexture(e.TEXTURE_2D,this._blackTexture),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,new Uint8Array([0,0,0,0])),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),this._cacheEdgeUniforms(),this._cacheInscriptionUniforms()}_cacheEdgeUniforms(){const e=this.gl,i=this._edgeProgram;this._edgeUniforms={normalDepth:e.getUniformLocation(i,"u_normalDepth"),objectID:e.getUniformLocation(i,"u_objectID"),texelSize:e.getUniformLocation(i,"u_texelSize"),depthSensitivity:e.getUniformLocation(i,"u_depthSensitivity"),normalSensitivity:e.getUniformLocation(i,"u_normalSensitivity"),hasObjectID:e.getUniformLocation(i,"u_hasObjectID")}}_cacheInscriptionUniforms(){const e=this.gl,i=this._inscriptionProgram,t=a=>e.getUniformLocation(i,a);this._inscUniforms={edgeMap:t("u_edgeMap"),normalDepth:t("u_normalDepth"),time:t("u_time"),layerCount:t("u_layerCount"),resolution:t("u_resolution"),dpr:t("u_dpr"),globalThickness:t("u_globalThickness"),rot4dXY:t("u_rot4dXY"),rot4dXZ:t("u_rot4dXZ"),rot4dYZ:t("u_rot4dYZ"),rot4dXW:t("u_rot4dXW"),rot4dYW:t("u_rot4dYW"),rot4dZW:t("u_rot4dZW"),bass:t("u_bass"),mid:t("u_mid"),high:t("u_high"),energy:t("u_energy"),geometries:[],thicknesses:[],opacities:[],colors:[],patternScales:[],patternSpeeds:[],rotOffsets:[]};for(let a=0;a<16;a++)this._inscUniforms.geometries[a]=t(`u_layerGeometries[${a}]`),this._inscUniforms.thicknesses[a]=t(`u_layerThicknesses[${a}]`),this._inscUniforms.opacities[a]=t(`u_layerOpacities[${a}]`),this._inscUniforms.colors[a]=t(`u_layerColors[${a}]`),this._inscUniforms.patternScales[a]=t(`u_layerPatternScales[${a}]`),this._inscUniforms.patternSpeeds[a]=t(`u_layerPatternSpeeds[${a}]`),this._inscUniforms.rotOffsets[a]=t(`u_layerRotOffsets[${a}]`)}_ensureFBOs(e,i){if(this._width===e&&this._height===i)return;const t=this.gl;this._edgeFBO&&Ie(t,this._edgeFBO),this._compositeFBO&&Ie(t,this._compositeFBO),this._edgeFBO=Lt(t,e,i),this._compositeFBO=Lt(t,e,i),this._width=e,this._height=i}setLayerCount(e){for(e=Math.min(16,Math.max(1,e));this.layers.length<e;)this.layers.push(wt(this.layers.length,e));this.layerCount=e}setLayerConfig(e,i){e>=0&&e<this.layers.length&&Object.assign(this.layers[e],i)}setAudio(e,i,t,a){this.bass=e||0,this.mid=i||0,this.high=t||0,this.energy=a||0}render(e,i,{width:t=0,height:a=0,objectIDTexture:n=null,dpr:l=1}={}){const s=this.gl,c=t||s.canvas.width,h=a||s.canvas.height;this._ensureFBOs(c,h),s.bindFramebuffer(s.FRAMEBUFFER,this._edgeFBO.framebuffer),s.viewport(0,0,c,h),s.disable(s.DEPTH_TEST),s.disable(s.BLEND),s.useProgram(this._edgeProgram),s.bindVertexArray(this._quadVao);const f=this._edgeUniforms;s.activeTexture(s.TEXTURE0),s.bindTexture(s.TEXTURE_2D,e),s.uniform1i(f.normalDepth,0),s.activeTexture(s.TEXTURE1),s.bindTexture(s.TEXTURE_2D,n||this._blackTexture),s.uniform1i(f.objectID,1),s.uniform2f(f.texelSize,1/c,1/h),s.uniform1f(f.depthSensitivity,this.depthSensitivity),s.uniform1f(f.normalSensitivity,this.normalSensitivity),s.uniform1f(f.hasObjectID,n?1:0),s.drawArrays(s.TRIANGLES,0,3),s.bindFramebuffer(s.FRAMEBUFFER,this._compositeFBO.framebuffer),s.viewport(0,0,c,h),s.clearColor(0,0,0,0),s.clear(s.COLOR_BUFFER_BIT),s.disable(s.BLEND),s.useProgram(this._inscriptionProgram),s.bindVertexArray(this._quadVao);const u=this._inscUniforms;s.activeTexture(s.TEXTURE0),s.bindTexture(s.TEXTURE_2D,this._edgeFBO.texture),s.uniform1i(u.edgeMap,0),s.activeTexture(s.TEXTURE1),s.bindTexture(s.TEXTURE_2D,e),s.uniform1i(u.normalDepth,1),s.uniform1f(u.time,i),s.uniform1i(u.layerCount,this.layerCount),s.uniform2f(u.resolution,c,h),s.uniform1f(u.dpr,l),s.uniform1f(u.globalThickness,this.globalThickness),s.uniform1f(u.rot4dXY,this.rot4dXY),s.uniform1f(u.rot4dXZ,this.rot4dXZ),s.uniform1f(u.rot4dYZ,this.rot4dYZ),s.uniform1f(u.rot4dXW,this.rot4dXW),s.uniform1f(u.rot4dYW,this.rot4dYW),s.uniform1f(u.rot4dZW,this.rot4dZW),s.uniform1f(u.bass,this.bass),s.uniform1f(u.mid,this.mid),s.uniform1f(u.high,this.high),s.uniform1f(u.energy,this.energy);for(let d=0;d<this.layerCount;d++){const m=this.layers[d];s.uniform1f(u.geometries[d],m.geometry),s.uniform1f(u.thicknesses[d],m.thickness),s.uniform1f(u.opacities[d],m.opacity),s.uniform3fv(u.colors[d],m.color),s.uniform1f(u.patternScales[d],m.patternScale),s.uniform1f(u.patternSpeeds[d],m.patternSpeed),s.uniform1f(u.rotOffsets[d],m.rotOffset)}return s.drawArrays(s.TRIANGLES,0,3),s.bindFramebuffer(s.FRAMEBUFFER,null),this._compositeFBO}get edgeTexture(){return this._edgeFBO?this._edgeFBO.texture:null}get compositeTexture(){return this._compositeFBO?this._compositeFBO.texture:null}_createProgram(e,i){const t=this.gl,a=t.createProgram(),n=this._compile(t.VERTEX_SHADER,e),l=this._compile(t.FRAGMENT_SHADER,i);if(t.attachShader(a,n),t.attachShader(a,l),t.linkProgram(a),!t.getProgramParameter(a,t.LINK_STATUS))throw new Error("EdgeInscriptionLayer link error: "+t.getProgramInfoLog(a));return a}_compile(e,i){const t=this.gl,a=t.createShader(e);if(t.shaderSource(a,i),t.compileShader(a),!t.getShaderParameter(a,t.COMPILE_STATUS))throw new Error("EdgeInscriptionLayer compile error: "+t.getShaderInfoLog(a));return a}dispose(){const e=this.gl;e.deleteProgram(this._edgeProgram),e.deleteProgram(this._inscriptionProgram),e.deleteVertexArray(this._quadVao),e.deleteTexture(this._blackTexture),this._edgeFBO&&Ie(e,this._edgeFBO),this._compositeFBO&&Ie(e,this._compositeFBO)}}const It=`#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
    float x = float((gl_VertexID & 1) << 2) - 1.0;
    float y = float((gl_VertexID & 2) << 1) - 1.0;
    v_uv = vec2(x, y) * 0.5 + 0.5;
    gl_Position = vec4(x, y, 0.0, 1.0);
}
`,ui=`#version 300 es
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
`,hi=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 outColor;
void main() {
    outColor = texture(u_texture, v_uv);
}
`;function Ct(r,e,i){const t=r.createTexture();r.bindTexture(r.TEXTURE_2D,t),r.texImage2D(r.TEXTURE_2D,0,r.RGBA8,e,i,0,r.RGBA,r.UNSIGNED_BYTE,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE);const a=r.createRenderbuffer();r.bindRenderbuffer(r.RENDERBUFFER,a),r.renderbufferStorage(r.RENDERBUFFER,r.DEPTH_COMPONENT24,e,i);const n=r.createFramebuffer();return r.bindFramebuffer(r.FRAMEBUFFER,n),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,t,0),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.RENDERBUFFER,a),r.bindFramebuffer(r.FRAMEBUFFER,null),{framebuffer:n,texture:t,depthRb:a,width:e,height:i}}function Ce(r,e){r.deleteFramebuffer(e.framebuffer),r.deleteTexture(e.texture),r.deleteRenderbuffer(e.depthRb)}const ze=Object.freeze({ALPHA:0,ADDITIVE:1,MULTIPLY:2,SCREEN:3});function Xe(r={}){return{enabled:!0,opacity:1,blendMode:ze.ALPHA,...r}}class fi{constructor(e,{exposure:i=1.2,gamma:t=2.2}={}){this.gl=e,this.exposure=i,this.gamma=t,this._meshRenderer=null,this._sceneRenderer=null,this._splatRenderer=null,this._proceduralRenderer=null,this._edgeInscription=null,this._inscriptionChannel=null,this._dpr=1,this.meshLayer=Xe(),this.splatLayer=Xe({blendMode:ze.ADDITIVE,opacity:.9}),this.proceduralLayer=Xe({blendMode:ze.SCREEN,opacity:.5}),this.inscriptionLayer=Xe({blendMode:ze.ADDITIVE,opacity:.8}),this._compositeProgram=null,this._blitProgram=null,this._quadVao=null,this._splatFBO=null,this._proceduralFBO=null,this._width=0,this._height=0,this._blackTexture=null,this._init()}_init(){const e=this.gl;this._compositeProgram=this._createProgram(It,ui),this._blitProgram=this._createProgram(It,hi),this._quadVao=e.createVertexArray(),this._blackTexture=e.createTexture(),e.bindTexture(e.TEXTURE_2D,this._blackTexture),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,new Uint8Array([0,0,0,0])),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST)}_ensureFBOs(e,i){if(this._width===e&&this._height===i)return;const t=this.gl;this._splatFBO&&Ce(t,this._splatFBO),this._proceduralFBO&&Ce(t,this._proceduralFBO),this._splatFBO=Ct(t,e,i),this._proceduralFBO=Ct(t,e,i),this._width=e,this._height=i}setMeshRenderer(e){this._meshRenderer=e}setSceneRenderer(e){this._sceneRenderer=e}setSplatRenderer(e){this._splatRenderer=e}setProceduralRenderer(e){this._proceduralRenderer=e}setEdgeInscription(e){this._edgeInscription=e}setInscriptionChannel(e){this._inscriptionChannel=e}setDPR(e){this._dpr=e}render(e,i,t,{viewProjection:a=null,rotation4D:n=null,projDistance:l=2}={}){const s=this.gl,c=s.canvas.width,h=s.canvas.height;this._ensureFBOs(c,h);const f={meshRendered:!1,splatRendered:!1,proceduralRendered:!1,inscriptionRendered:!1,layersComposited:0};let u=this._blackTexture,d=this._blackTexture,m=this._blackTexture,E=this._blackTexture,p=null,v=null,T=null;if(this._sceneRenderer&&this.meshLayer.enabled){const g=this._sceneRenderer.render(i,t,{rotation4D:n,projDistance:l,width:c,height:h});T=g.gbuffer,T&&(u=T.colorTexture,p=T.normalTexture,v=T.objectIDTexture||null,f.meshRendered=!0,f.objectCount=g.objectCount)}else if(this._meshRenderer&&this.meshLayer.enabled){const g=this._meshRenderer.render(i,t,{rotation4D:n,projDistance:l,width:c,height:h});T=g,u=g.colorTexture,p=g.normalTexture,v=g.objectIDTexture||null,f.meshRendered=!0}if(this._splatRenderer&&this.splatLayer.enabled){s.bindFramebuffer(s.FRAMEBUFFER,this._splatFBO.framebuffer),s.viewport(0,0,c,h),s.clearColor(0,0,0,0),s.clear(s.COLOR_BUFFER_BIT|s.DEPTH_BUFFER_BIT),f.meshRendered&&T&&(s.bindFramebuffer(s.READ_FRAMEBUFFER,T.framebuffer),s.bindFramebuffer(s.DRAW_FRAMEBUFFER,this._splatFBO.framebuffer),s.blitFramebuffer(0,0,c,h,0,0,c,h,s.DEPTH_BUFFER_BIT,s.NEAREST),s.bindFramebuffer(s.FRAMEBUFFER,this._splatFBO.framebuffer));const g=a||new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),b=this._splatFBO.framebuffer;s.bindFramebuffer(s.FRAMEBUFFER,b),s.viewport(0,0,c,h),this._splatRenderer.render&&(this._splatRenderer.render(g,e),s.bindFramebuffer(s.FRAMEBUFFER,this._splatFBO.framebuffer),this._splatRenderer._drawSplats&&(s.viewport(0,0,c,h),s.clearColor(0,0,0,0),s.clear(s.COLOR_BUFFER_BIT),this._splatRenderer._drawSplats(g,e))),d=this._splatFBO.texture,f.splatRendered=!0}if(this._proceduralRenderer&&this.proceduralLayer.enabled&&(s.bindFramebuffer(s.FRAMEBUFFER,this._proceduralFBO.framebuffer),s.viewport(0,0,c,h),s.clearColor(0,0,0,0),s.clear(s.COLOR_BUFFER_BIT),this._proceduralRenderer(this._proceduralFBO,e),m=this._proceduralFBO.texture,f.proceduralRendered=!0),this._edgeInscription&&this.inscriptionLayer.enabled&&p){if(this._inscriptionChannel){const b=this._inscriptionChannel.registeredObjects,R=b.length>0?b[0]:0;this._inscriptionChannel.applyToLayer(this._edgeInscription,R)}E=this._edgeInscription.render(p,e,{width:c,height:h,objectIDTexture:v,dpr:this._dpr}).texture,f.inscriptionRendered=!0}s.bindFramebuffer(s.FRAMEBUFFER,null),s.viewport(0,0,c,h),s.disable(s.DEPTH_TEST),s.disable(s.BLEND),s.useProgram(this._compositeProgram),s.bindVertexArray(this._quadVao);const _=this._compositeProgram;return s.activeTexture(s.TEXTURE0),s.bindTexture(s.TEXTURE_2D,u),s.uniform1i(s.getUniformLocation(_,"u_meshLayer"),0),s.activeTexture(s.TEXTURE1),s.bindTexture(s.TEXTURE_2D,d),s.uniform1i(s.getUniformLocation(_,"u_splatLayer"),1),s.activeTexture(s.TEXTURE2),s.bindTexture(s.TEXTURE_2D,m),s.uniform1i(s.getUniformLocation(_,"u_proceduralLayer"),2),s.activeTexture(s.TEXTURE3),s.bindTexture(s.TEXTURE_2D,E),s.uniform1i(s.getUniformLocation(_,"u_inscriptionLayer"),3),s.uniform1f(s.getUniformLocation(_,"u_meshOpacity"),this.meshLayer.opacity),s.uniform1f(s.getUniformLocation(_,"u_splatOpacity"),this.splatLayer.opacity),s.uniform1f(s.getUniformLocation(_,"u_proceduralOpacity"),this.proceduralLayer.opacity),s.uniform1f(s.getUniformLocation(_,"u_inscriptionOpacity"),this.inscriptionLayer.opacity),s.uniform1f(s.getUniformLocation(_,"u_meshEnabled"),this.meshLayer.enabled&&f.meshRendered?1:0),s.uniform1f(s.getUniformLocation(_,"u_splatEnabled"),this.splatLayer.enabled&&f.splatRendered?1:0),s.uniform1f(s.getUniformLocation(_,"u_proceduralEnabled"),this.proceduralLayer.enabled&&f.proceduralRendered?1:0),s.uniform1f(s.getUniformLocation(_,"u_inscriptionEnabled"),this.inscriptionLayer.enabled&&f.inscriptionRendered?1:0),s.uniform1f(s.getUniformLocation(_,"u_meshBlend"),this.meshLayer.blendMode),s.uniform1f(s.getUniformLocation(_,"u_splatBlend"),this.splatLayer.blendMode),s.uniform1f(s.getUniformLocation(_,"u_proceduralBlend"),this.proceduralLayer.blendMode),s.uniform1f(s.getUniformLocation(_,"u_inscriptionBlend"),this.inscriptionLayer.blendMode),s.uniform1f(s.getUniformLocation(_,"u_exposure"),this.exposure),s.uniform1f(s.getUniformLocation(_,"u_gamma"),this.gamma),s.drawArrays(s.TRIANGLES,0,3),f.layersComposited=(f.meshRendered?1:0)+(f.splatRendered?1:0)+(f.proceduralRendered?1:0)+(f.inscriptionRendered?1:0),f}renderSplatOnly(e,i){this._splatRenderer&&this._splatRenderer.render(e,i)}_createProgram(e,i){const t=this.gl,a=t.createProgram(),n=this._compile(t.VERTEX_SHADER,e),l=this._compile(t.FRAGMENT_SHADER,i);if(t.attachShader(a,n),t.attachShader(a,l),t.linkProgram(a),!t.getProgramParameter(a,t.LINK_STATUS))throw new Error("HybridRenderPipeline link error: "+t.getProgramInfoLog(a));return a}_compile(e,i){const t=this.gl,a=t.createShader(e);if(t.shaderSource(a,i),t.compileShader(a),!t.getShaderParameter(a,t.COMPILE_STATUS))throw new Error("HybridRenderPipeline compile error: "+t.getShaderInfoLog(a));return a}dispose(){const e=this.gl;e.deleteProgram(this._compositeProgram),e.deleteProgram(this._blitProgram),e.deleteVertexArray(this._quadVao),e.deleteTexture(this._blackTexture),this._splatFBO&&Ce(e,this._splatFBO),this._proceduralFBO&&Ce(e,this._proceduralFBO)}}function Se(r,e,i){return .2126*r+.7152*e+.0722*i}function rt(r,e,i,t,a){const n=(c,h)=>{const f=Math.min(e-1,Math.max(0,t+c)),u=Math.min(i-1,Math.max(0,a+h));return r[u*e+f]},l=-n(-1,-1)+n(1,-1)-2*n(-1,0)+2*n(1,0)-n(-1,1)+n(1,1),s=-n(-1,-1)-2*n(0,-1)-n(1,-1)+n(-1,1)+2*n(0,1)+n(1,1);return Math.sqrt(l*l+s*s)}function Xt(r,e,i,t,a){const n=1-t-a;return[r[0]*n+e[0]*t+i[0]*a,r[1]*n+e[1]*t+i[1]*a,r[2]*n+e[2]*t+i[2]*a]}function Ot(r,e,i,t,a){const n=1-t-a;return[r[0]*n+e[0]*t+i[0]*a,r[1]*n+e[1]*t+i[1]*a]}function it(r,e,i,t,a){t=t-Math.floor(t),a=a-Math.floor(a);const n=t*(e-1),l=a*(i-1),s=Math.floor(n),c=Math.floor(l),h=Math.min(e-1,s+1),f=Math.min(i-1,c+1),u=n-s,d=l-c,m=(S,P)=>(P*e+S)*4,E=m(s,c),p=m(h,c),v=m(s,f),T=m(h,f),_=(r[E]*(1-u)*(1-d)+r[p]*u*(1-d)+r[v]*(1-u)*d+r[T]*u*d)/255,g=(r[E+1]*(1-u)*(1-d)+r[p+1]*u*(1-d)+r[v+1]*(1-u)*d+r[T+1]*u*d)/255,b=(r[E+2]*(1-u)*(1-d)+r[p+2]*u*(1-d)+r[v+2]*(1-u)*d+r[T+2]*u*d)/255,R=(r[E+3]*(1-u)*(1-d)+r[p+3]*u*(1-d)+r[v+3]*(1-u)*d+r[T+3]*u*d)/255;return[_,g,b,R]}function He(r){const e=Math.sqrt(r[0]*r[0]+r[1]*r[1]+r[2]*r[2]);return e>1e-8&&(r[0]/=e,r[1]/=e,r[2]/=e),r}function ur(r,e){return[r[1]*e[2]-r[2]*e[1],r[2]*e[0]-r[0]*e[2],r[0]*e[1]-r[1]*e[0]]}function di(r){const e=He([...r]),i=[0,0,1],t=e[0]*i[0]+e[1]*i[1]+e[2]*i[2];let a=i;Math.abs(t)>.999&&(a=[0,1,0]);const n=He(ur(a,e)),s=Math.acos(Math.max(-1,Math.min(1,t)))*.5,c=Math.sin(s);return[Math.cos(s),n[0]*c,n[1]*c,n[2]*c]}class mi{constructor(){this.samplesPerTriangle=8,this.edgeBoostFactor=4,this.edgeThreshold=.1,this.baseScale=.04,this.jitter=.3,this.alphaThreshold=.1,this.normalInfluence=.8,this.specularToDepth=2}convert({positions:e,normals:i,uvs:t,indices:a,diffusePixels:n,diffuseWidth:l,diffuseHeight:s,normalPixels:c=null,normalWidth:h=0,normalHeight:f=0,specularPixels:u=null,specularWidth:d=0,specularHeight:m=0}){const E=new Float32Array(l*s);for(let _=0;_<l*s;_++)E[_]=Se(n[_*4]/255,n[_*4+1]/255,n[_*4+2]/255);const p=new Float32Array(l*s);for(let _=0;_<s;_++)for(let g=0;g<l;g++)p[_*l+g]=rt(E,l,s,g,_);const v=[],T=a.length/3;for(let _=0;_<T;_++){const g=a[_*3],b=a[_*3+1],R=a[_*3+2],S=[e[g*3],e[g*3+1],e[g*3+2]],P=[e[b*3],e[b*3+1],e[b*3+2]],B=[e[R*3],e[R*3+1],e[R*3+2]],W=[i[g*3],i[g*3+1],i[g*3+2]],le=[i[b*3],i[b*3+1],i[b*3+2]],ce=[i[R*3],i[R*3+1],i[R*3+2]],K=[t[g*2],t[g*2+1]],Q=[t[b*2],t[b*2+1]],y=[t[R*2],t[R*2+1]],Ir=[P[0]-S[0],P[1]-S[1],P[2]-S[2]],Cr=[B[0]-S[0],B[1]-S[1],B[2]-S[2]],Ee=ur(Ir,Cr),Xr=.5*Math.sqrt(Ee[0]*Ee[0]+Ee[1]*Ee[1]+Ee[2]*Ee[2]),Or=Math.max(1,Math.round(this.samplesPerTriangle*Math.sqrt(Xr))),xt=Ot(K,Q,y,1/3,1/3),Nr=Math.min(l-1,Math.max(0,Math.floor(xt[0]*l))),Wr=Math.min(s-1,Math.max(0,Math.floor(xt[1]*s))),Rt=p[Wr*l+Nr],jr=Rt>this.edgeThreshold?Math.round(this.edgeBoostFactor*(Rt/1)):0,Vr=Or+jr;for(let yt=0;yt<Vr;yt++){let k=Math.random(),$=Math.random();k+$>1&&(k=1-k,$=1-$),k+=(Math.random()-.5)*this.jitter*.1,$+=(Math.random()-.5)*this.jitter*.1,k=Math.max(0,Math.min(1,k)),$=Math.max(0,Math.min(1-k,$));const Ke=Xt(S,P,B,k,$),Gr=He(Xt(W,le,ce,k,$)),J=Ot(K,Q,y,k,$),[At,St,Ft,zr]=it(n,l,s,J[0],J[1]);if(zr<this.alphaThreshold)continue;let ee=[...Gr];if(c){const[Je,et,tt]=it(c,h,f,J[0],J[1]),Zr=Je*2-1,$r=et*2-1,Kr=tt*2-1;ee[0]+=Zr*this.normalInfluence,ee[1]+=$r*this.normalInfluence,ee[2]+=Kr*this.normalInfluence,He(ee)}const kr=di(ee);let Dt=0;if(u){const[Je,et,tt]=it(u,d,m,J[0],J[1]);Dt=Se(Je,et,tt)*this.specularToDepth}const Yr=Se(At,St,Ft),Hr=rt(E,l,s,Math.floor(J[0]*l)%l,Math.floor(J[1]*s)%s),qr=1-Math.min(1,Hr*2),Mt=this.baseScale*(.5+Yr*.5)*(.4+qr*.6),Qe=Mt*.1;v.push({position:[Ke[0]+ee[0]*Qe,Ke[1]+ee[1]*Qe,Ke[2]+ee[2]*Qe],orientation:kr,scale:Mt,color:[At,St,Ft],depth:Dt})}}return v}convertFromImages({positions:e,normals:i,uvs:t,indices:a,diffuseImage:n,normalImage:l,specularImage:s}){const c=d=>{if(!d)return null;const m=document.createElement("canvas"),E=d.naturalWidth||d.width,p=d.naturalHeight||d.height;m.width=E,m.height=p;const v=m.getContext("2d");return v.drawImage(d,0,0),{pixels:v.getImageData(0,0,E,p).data,width:E,height:p}},h=c(n),f=c(l),u=c(s);return this.convert({positions:e,normals:i,uvs:t,indices:a,diffusePixels:h.pixels,diffuseWidth:h.width,diffuseHeight:h.height,...f?{normalPixels:f.pixels,normalWidth:f.width,normalHeight:f.height}:{},...u?{specularPixels:u.pixels,specularWidth:u.width,specularHeight:u.height}:{}})}convertFlat(e,i,t,a={}){const n=a.gridStep||3,l=a.scale||this.baseScale,s=a.depthFromLum||1,c=new Float32Array(i*t);for(let u=0;u<i*t;u++)c[u]=Se(e[u*4]/255,e[u*4+1]/255,e[u*4+2]/255);const h=i/t,f=[];for(let u=0;u<t;u+=n)for(let d=0;d<i;d+=n){const m=(u*i+d)*4;if(e[m+3]/255<this.alphaThreshold)continue;const E=e[m]/255,p=e[m+1]/255,v=e[m+2]/255,T=Se(E,p,v),_=rt(c,i,t,d,u),g=1+(_>this.edgeThreshold?this.edgeBoostFactor:0),b=(1-T)*s,R=(d/i-.5)*2*h,S=-(u/t-.5)*2;for(let P=0;P<g;P++){const B=(Math.random()-.5)*this.jitter*(n/i)*2*h,W=(Math.random()-.5)*this.jitter*(n/t)*2;f.push({position:[R+B,S+W,b+(Math.random()-.5)*.05],orientation:[1,0,0,0],scale:l*(.5+T*.5)*(1-Math.min(1,_)*.5),color:[E,p,v],depth:b*.3})}}return f}}const ge={idle:{priority:0,opacityMultiplier:.3,thicknessMultiplier:.5,speedMultiplier:.5,glowIntensity:.1,colorShift:[0,0,0],rotationSpeed:.1,patternOverride:null},active:{priority:1,opacityMultiplier:.8,thicknessMultiplier:1,speedMultiplier:1,glowIntensity:.5,colorShift:[.1,.1,.2],rotationSpeed:.3,patternOverride:null},selected:{priority:2,opacityMultiplier:1,thicknessMultiplier:1.2,speedMultiplier:.8,glowIntensity:.8,colorShift:[0,.2,.3],rotationSpeed:.5,patternOverride:7},powered:{priority:2,opacityMultiplier:1,thicknessMultiplier:1.5,speedMultiplier:1.5,glowIntensity:1,colorShift:[.3,0,.5],rotationSpeed:1,patternOverride:6},damaged:{priority:3,opacityMultiplier:.9,thicknessMultiplier:.8,speedMultiplier:2,glowIntensity:.7,colorShift:[.5,-.2,-.2],rotationSpeed:2,patternOverride:5},destroyed:{priority:4,opacityMultiplier:.4,thicknessMultiplier:2,speedMultiplier:3,glowIntensity:.3,colorShift:[.3,-.1,-.3],rotationSpeed:3,patternOverride:5}};function _i(r,e=4){const i=a=>{let n=a*2654435761;return n=(n>>>16^n)*2246822507,n=(n>>>16^n)*3266489909,n=n>>>16^n,(n&2147483647)/2147483647},t=[];for(let a=0;a<e;a++){const n=r*1e3+a;t.push({geometry:Math.floor(i(n)*24),thickness:.3+i(n+100)*.4,opacity:.7+i(n+200)*.3,color:[.3+i(n+300)*.7,.3+i(n+400)*.7,.3+i(n+500)*.7],patternScale:2+i(n+600)*4,patternSpeed:.2+i(n+700)*.4,rotOffset:i(n+800)*Math.PI*2})}return{layers:t,baseRotationSpeed:i(r*31)*.5,baseHue:i(r*47)*360}}const j={bass:{rot4dXW:.5,thickness:.3},mid:{rot4dYW:.3,speed:.5},high:{rot4dZW:.6,patternScale:.3,hueShift:30},energy:{allRotation:.3,intensity:.5,glow:.3}};class pi{constructor({layerCount:e=4,transitionDuration:i=.5}={}){this.layerCount=e,this.transitionDuration=i,this._objectStates=new Map,this._audio={bass:0,mid:0,high:0,energy:0},this._time=0}registerObject(e,i="idle"){const t=_i(e,this.layerCount),a=ge[i]||ge.idle;this._objectStates.set(e,{currentState:i,targetState:i,transitionProgress:1,currentPreset:{...a},targetPreset:{...a},identity:t})}setObjectState(e,i){const t=this._objectStates.get(e);if(!t){this.registerObject(e,i);return}if(t.targetState===i)return;const a=ge[i];if(!a)return;const n=(ge[t.currentState]||ge.idle).priority;a.priority<n&&t.transitionProgress<.5||(t.currentPreset=this._interpolatePresets(t.currentPreset,t.targetPreset,t.transitionProgress),t.targetPreset={...a},t.currentState=t.targetState,t.targetState=i,t.transitionProgress=0)}setAudio(e,i,t,a){this._audio.bass=Math.max(0,Math.min(1,e||0)),this._audio.mid=Math.max(0,Math.min(1,i||0)),this._audio.high=Math.max(0,Math.min(1,t||0)),this._audio.energy=Math.max(0,Math.min(1,a||0))}update(e){this._time+=e;for(const i of this._objectStates.values())i.transitionProgress<1&&(i.transitionProgress=Math.min(1,i.transitionProgress+e/this.transitionDuration))}getInscriptionConfig(e){let i=this._objectStates.get(e);i||(this.registerObject(e),i=this._objectStates.get(e));const t=this._interpolatePresets(i.currentPreset,i.targetPreset,i.transitionProgress),a=i.identity,n=this._audio,l=[];for(let u=0;u<this.layerCount;u++){const d=a.layers[u],m=t.patternOverride!==null?t.patternOverride:d.geometry,E=d.opacity*t.opacityMultiplier+n.energy*j.energy.intensity*.3,p=d.thickness*t.thicknessMultiplier+n.bass*j.bass.thickness,v=d.patternSpeed*t.speedMultiplier+n.mid*j.mid.speed,T=n.high*j.high.hueShift/360,_=[Math.min(1,Math.max(0,d.color[0]+t.colorShift[0]+T*.5)),Math.min(1,Math.max(0,d.color[1]+t.colorShift[1]+T*.3)),Math.min(1,Math.max(0,d.color[2]+t.colorShift[2]+T))],g=d.patternScale+n.high*j.high.patternScale,b=d.rotOffset+this._time*(a.baseRotationSpeed+t.rotationSpeed*.5);l.push({geometry:m,thickness:Math.min(1,Math.max(0,p)),opacity:Math.min(1,Math.max(0,E)),color:_,patternScale:g,patternSpeed:v,rotOffset:b})}const s=n.bass*j.bass.rot4dXW+n.energy*j.energy.allRotation,c=n.mid*j.mid.rot4dYW+n.energy*j.energy.allRotation,h=n.high*j.high.rot4dZW+n.energy*j.energy.allRotation,f=.6*t.thicknessMultiplier+n.bass*.2;return{layers:l,rot4dXW:s,rot4dYW:c,rot4dZW:h,globalThickness:f,glowIntensity:t.glowIntensity+n.energy*j.energy.glow,bass:n.bass,mid:n.mid,high:n.high,energy:n.energy}}applyToLayer(e,i){const t=this.getInscriptionConfig(i);e.rot4dXW=t.rot4dXW,e.rot4dYW=t.rot4dYW,e.rot4dZW=t.rot4dZW,e.globalThickness=t.globalThickness,e.setAudio(t.bass,t.mid,t.high,t.energy);for(let a=0;a<t.layers.length&&a<e.layerCount;a++)e.setLayerConfig(a,t.layers[a])}_interpolatePresets(e,i,t){const a=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;return{priority:i.priority,opacityMultiplier:e.opacityMultiplier+(i.opacityMultiplier-e.opacityMultiplier)*a,thicknessMultiplier:e.thicknessMultiplier+(i.thicknessMultiplier-e.thicknessMultiplier)*a,speedMultiplier:e.speedMultiplier+(i.speedMultiplier-e.speedMultiplier)*a,glowIntensity:e.glowIntensity+(i.glowIntensity-e.glowIntensity)*a,colorShift:[e.colorShift[0]+(i.colorShift[0]-e.colorShift[0])*a,e.colorShift[1]+(i.colorShift[1]-e.colorShift[1])*a,e.colorShift[2]+(i.colorShift[2]-e.colorShift[2])*a],rotationSpeed:e.rotationSpeed+(i.rotationSpeed-e.rotationSpeed)*a,patternOverride:a>.5?i.patternOverride:e.patternOverride}}getObjectState(e){const i=this._objectStates.get(e);return i?i.targetState:null}get registeredObjects(){return Array.from(this._objectStates.keys())}get stateNames(){return Object.keys(ge)}dispose(){this._objectStates.clear()}}class Ei{constructor(e,i={}){this.gl=e,this.resolution=i.resolution??1024,this.bias=i.bias??.005,this.normalBias=i.normalBias??.02,this.pcfRadius=i.pcfRadius??2,this.filterMode=i.filterMode??"pcf",this.frustumSize=i.frustumSize??10,this.near=i.near??.1,this.far=i.far??50,this.lightDir=new Float32Array(i.lightDir||[.5,1,.3]),this._normalizeLightDir(),this.lightViewMatrix=new Float32Array(16),this.lightProjMatrix=new Float32Array(16),this.lightSpaceMatrix=new Float32Array(16),this._fbo=null,this._depthTexture=null,this._shadowProgram=null,this._initialized=!1}init(){if(this._initialized)return;const e=this.gl;this._fbo=e.createFramebuffer(),this._depthTexture=e.createTexture(),e.bindTexture(e.TEXTURE_2D,this._depthTexture),e.texImage2D(e.TEXTURE_2D,0,e.DEPTH_COMPONENT32F,this.resolution,this.resolution,0,e.DEPTH_COMPONENT,e.FLOAT,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_COMPARE_MODE,e.COMPARE_REF_TO_TEXTURE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_COMPARE_FUNC,e.LEQUAL),e.bindFramebuffer(e.FRAMEBUFFER,this._fbo),e.framebufferTexture2D(e.FRAMEBUFFER,e.DEPTH_ATTACHMENT,e.TEXTURE_2D,this._depthTexture,0),e.drawBuffers([e.NONE]),e.readBuffer(e.NONE),e.bindFramebuffer(e.FRAMEBUFFER,null),this._shadowProgram=this._createShadowProgram(),this._initialized=!0}setLightDirection(e,i,t){this.lightDir[0]=e,this.lightDir[1]=i,this.lightDir[2]=t,this._normalizeLightDir()}updateMatrices(e){const i=e?e[0]:0,t=e?e[1]:0,a=e?e[2]:0,n=this.lightDir[0],l=this.lightDir[1],s=this.lightDir[2],c=this.far*.5,h=i+n*c,f=t+l*c,u=a+s*c;this._lookAt(this.lightViewMatrix,h,f,u,i,t,a);const d=this.frustumSize;this._ortho(this.lightProjMatrix,-d,d,-d,d,this.near,this.far),this._multiplyMat4(this.lightSpaceMatrix,this.lightProjMatrix,this.lightViewMatrix)}beginShadowPass(){this._initialized||this.init();const e=this.gl;e.bindFramebuffer(e.FRAMEBUFFER,this._fbo),e.viewport(0,0,this.resolution,this.resolution),e.clear(e.DEPTH_BUFFER_BIT),e.enable(e.DEPTH_TEST),e.depthFunc(e.LESS),e.enable(e.CULL_FACE),e.cullFace(e.FRONT)}renderShadowCaster(e,i,t){const a=this.gl,n=this._shadowProgram;a.useProgram(n.program),a.uniformMatrix4fv(n.u_lightSpaceMatrix,!1,this.lightSpaceMatrix),a.uniformMatrix4fv(n.u_modelMatrix,!1,t||gi);const l=a.createVertexArray();a.bindVertexArray(l);const s=a.createBuffer();if(a.bindBuffer(a.ARRAY_BUFFER,s),a.bufferData(a.ARRAY_BUFFER,e,a.STREAM_DRAW),a.enableVertexAttribArray(0),a.vertexAttribPointer(0,3,a.FLOAT,!1,0,0),i){const c=a.createBuffer();a.bindBuffer(a.ELEMENT_ARRAY_BUFFER,c),a.bufferData(a.ELEMENT_ARRAY_BUFFER,i,a.STREAM_DRAW),a.drawElements(a.TRIANGLES,i.length,a.UNSIGNED_INT,0),a.deleteBuffer(c)}else a.drawArrays(a.TRIANGLES,0,e.length/3);a.bindVertexArray(null),a.deleteVertexArray(l),a.deleteBuffer(s)}endShadowPass(){const e=this.gl;e.cullFace(e.BACK),e.bindFramebuffer(e.FRAMEBUFFER,null)}getShadowTexture(){return this._depthTexture}getLightSpaceMatrix(){return this.lightSpaceMatrix}static getShadowSamplerSrc(){return`
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
}`,a=e.createShader(e.VERTEX_SHADER);e.shaderSource(a,i),e.compileShader(a);const n=e.createShader(e.FRAGMENT_SHADER);e.shaderSource(n,t),e.compileShader(n);const l=e.createProgram();return e.attachShader(l,a),e.attachShader(l,n),e.linkProgram(l),e.deleteShader(a),e.deleteShader(n),{program:l,u_lightSpaceMatrix:e.getUniformLocation(l,"u_lightSpaceMatrix"),u_modelMatrix:e.getUniformLocation(l,"u_modelMatrix")}}_lookAt(e,i,t,a,n,l,s){let c=n-i,h=l-t,f=s-a,u=Math.sqrt(c*c+h*h+f*f)||1;c/=u,h/=u,f/=u;let d=h*0-f*1,m=f*0-c*0,E=c*1-h*0;Math.abs(d)+Math.abs(m)+Math.abs(E)<.001&&(d=1,m=0,E=0),u=Math.sqrt(d*d+m*m+E*E)||1,d/=u,m/=u,E/=u;const p=m*f-E*h,v=E*c-d*f,T=d*h-m*c;e[0]=d,e[1]=p,e[2]=-c,e[3]=0,e[4]=m,e[5]=v,e[6]=-h,e[7]=0,e[8]=E,e[9]=T,e[10]=-f,e[11]=0,e[12]=-(d*i+m*t+E*a),e[13]=-(p*i+v*t+T*a),e[14]=-(-c*i+-h*t+-f*a),e[15]=1}_ortho(e,i,t,a,n,l,s){const c=1/(i-t),h=1/(a-n),f=1/(l-s);e[0]=-2*c,e[1]=0,e[2]=0,e[3]=0,e[4]=0,e[5]=-2*h,e[6]=0,e[7]=0,e[8]=0,e[9]=0,e[10]=2*f,e[11]=0,e[12]=(i+t)*c,e[13]=(n+a)*h,e[14]=(s+l)*f,e[15]=1}_multiplyMat4(e,i,t){for(let a=0;a<4;a++)for(let n=0;n<4;n++)e[a*4+n]=i[0*4+n]*t[a*4+0]+i[1*4+n]*t[a*4+1]+i[2*4+n]*t[a*4+2]+i[3*4+n]*t[a*4+3]}dispose(){const e=this.gl;this._fbo&&e.deleteFramebuffer(this._fbo),this._depthTexture&&e.deleteTexture(this._depthTexture),this._shadowProgram&&e.deleteProgram(this._shadowProgram.program),this._fbo=null,this._depthTexture=null,this._shadowProgram=null,this._initialized=!1}}const gi=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);class Ti{constructor(e,i={}){this.gl=e,this.maxParticles=i.maxParticles??1e4,this.emitRate=i.emitRate??100,this.lifetime=i.lifetime??3,this.lifetimeVariance=i.lifetimeVariance??.5,this.speed=i.speed??1,this.speedVariance=i.speedVariance??.3,this.gravity=i.gravity??-2,this.drag=i.drag??.98,this.splatScale=i.splatScale??.02,this.splatScaleDecay=i.splatScaleDecay??.5,this.trailLength=i.trailLength??0,this.emitterType=i.emitterType??"point",this.emitterPosition=new Float32Array(i.emitterPosition||[0,0,0]),this.emitterRadius=i.emitterRadius??.5,this.emitterDirection=new Float32Array(i.emitterDirection||[0,1,0]),this.emitterSpread=i.emitterSpread??.5,this.colorStart=new Float32Array(i.colorStart||[0,1,1]),this.colorEnd=new Float32Array(i.colorEnd||[1,0,1]),this.colorMode=i.colorMode??"lerp",this.burstConfigs=new Map,this._setupDefaultBursts(),this._stride=12,this._data=new Float32Array(this.maxParticles*this._stride),this._aliveCount=0,this._emitAccumulator=0,this._trailHistory=this.trailLength>0?new Float32Array(this.maxParticles*this.trailLength*7):null,this._splatBuffer=null,this._splatCount=0,this._rng=12345}setBurstConfig(e,i){this.burstConfigs.set(e,i)}burst(e,i){const t=this.burstConfigs.get(e);if(!t)return;const a=i||this.emitterPosition,n=t.speed??this.speed*2,l=t.spread??1;for(let s=0;s<t.count;s++)this._emitOne(a,n,l,t.color)}setPosition(e,i,t){this.emitterPosition[0]=e,this.emitterPosition[1]=i,this.emitterPosition[2]=t}setSurfaceEmitter(e,i,t){this.emitterType="surface",this._surfacePositions=e,this._surfaceNormals=i,this._surfaceIndices=t}update(e){for((e<=0||e>.1)&&(e=.016),this._emitAccumulator+=this.emitRate*e;this._emitAccumulator>=1&&this._aliveCount<this.maxParticles;)this._emitAccumulator-=1,this._emitParticle();let i=0;for(let t=0;t<this._aliveCount;t++){const a=t*this._stride;if(this._data[a+9]+=e,this._data[a+9]>=this._data[a+10])continue;this._trailHistory&&this._pushTrail(t),this._data[a+4]+=this.gravity*e,this._data[a+3]*=this.drag,this._data[a+4]*=this.drag,this._data[a+5]*=this.drag,this._data[a+0]+=this._data[a+3]*e,this._data[a+1]+=this._data[a+4]*e,this._data[a+2]+=this._data[a+5]*e;const n=this._data[a+9]/this._data[a+10];this._data[a+6]=this.colorStart[0]*(1-n)+this.colorEnd[0]*n,this._data[a+7]=this.colorStart[1]*(1-n)+this.colorEnd[1]*n,this._data[a+8]=this.colorStart[2]*(1-n)+this.colorEnd[2]*n,this._data[a+11]=this.splatScale*(1-n*this.splatScaleDecay),i!==t&&this._data.copyWithin(i*this._stride,a,a+this._stride),i++}this._aliveCount=i,this._buildSplatBuffer()}getSplatBuffer(){return{buffer:this._splatBuffer,count:this._splatCount}}getAliveCount(){return this._aliveCount}_setupDefaultBursts(){this.burstConfigs.set("powered",{count:50,speed:2,spread:.3,color:[.5,0,1]}),this.burstConfigs.set("damaged",{count:100,speed:3,spread:1,color:[1,.3,0]}),this.burstConfigs.set("destroyed",{count:500,speed:5,spread:1,color:[1,.1,.1]}),this.burstConfigs.set("selected",{count:20,speed:.5,spread:.8,color:[0,1,1]}),this.burstConfigs.set("active",{count:30,speed:1,spread:.5,color:[0,1,.5]})}_emitParticle(){const e=this._getEmitPosition();this._emitOne(e,this.speed,this.emitterSpread)}_emitOne(e,i,t,a){if(this._aliveCount>=this.maxParticles)return;const n=this._aliveCount*this._stride;this._data[n+0]=e[0],this._data[n+1]=e[1],this._data[n+2]=e[2];const l=this._randomConeDirection(this.emitterDirection,t),s=i+(this._rand()-.5)*this.speedVariance*2;this._data[n+3]=l[0]*s,this._data[n+4]=l[1]*s,this._data[n+5]=l[2]*s,a?(this._data[n+6]=a[0],this._data[n+7]=a[1],this._data[n+8]=a[2]):(this._data[n+6]=this.colorStart[0],this._data[n+7]=this.colorStart[1],this._data[n+8]=this.colorStart[2]),this._data[n+9]=0,this._data[n+10]=this.lifetime+(this._rand()-.5)*this.lifetimeVariance*2,this._data[n+11]=this.splatScale,this._aliveCount++}_getEmitPosition(){if(this.emitterType==="surface"&&this._surfaceIndices)return this._randomSurfacePoint();if(this.emitterType==="sphere"){const e=this._rand()*Math.PI*2,i=Math.acos(2*this._rand()-1),t=this.emitterRadius*Math.cbrt(this._rand());return[this.emitterPosition[0]+t*Math.sin(i)*Math.cos(e),this.emitterPosition[1]+t*Math.cos(i),this.emitterPosition[2]+t*Math.sin(i)*Math.sin(e)]}return this.emitterPosition}_randomSurfacePoint(){const e=this._surfaceIndices.length/3,i=Math.floor(this._rand()*e),t=this._surfaceIndices[i*3]*3,a=this._surfaceIndices[i*3+1]*3,n=this._surfaceIndices[i*3+2]*3;let l=this._rand(),s=this._rand();l+s>1&&(l=1-l,s=1-s);const c=1-l-s;return[this._surfacePositions[t]*c+this._surfacePositions[a]*l+this._surfacePositions[n]*s,this._surfacePositions[t+1]*c+this._surfacePositions[a+1]*l+this._surfacePositions[n+1]*s,this._surfacePositions[t+2]*c+this._surfacePositions[a+2]*l+this._surfacePositions[n+2]*s]}_randomConeDirection(e,i){const t=this._rand()*Math.PI*2,a=1-this._rand()*i,n=Math.sqrt(1-a*a),l=e[0],s=e[1],c=e[2];let h,f,u;Math.abs(s)<.99?(h=s*0-c*0,f=c*1-l*0,u=l*0-s*1,h=0,f=-c,u=s):(h=-c,f=0,u=l);const d=Math.sqrt(h*h+f*f+u*u)||1;h/=d,f/=d,u/=d;const m=s*u-c*f,E=c*h-l*u,p=l*f-s*h;return[l*a+(h*Math.cos(t)+m*Math.sin(t))*n,s*a+(f*Math.cos(t)+E*Math.sin(t))*n,c*a+(u*Math.cos(t)+p*Math.sin(t))*n]}_pushTrail(e){if(!this._trailHistory)return;const i=e*this._stride,t=7,a=e*this.trailLength*t;for(let n=this.trailLength-1;n>0;n--){const l=a+n*t,s=a+(n-1)*t;for(let c=0;c<t;c++)this._trailHistory[l+c]=this._trailHistory[s+c]}this._trailHistory[a+0]=this._data[i+0],this._trailHistory[a+1]=this._data[i+1],this._trailHistory[a+2]=this._data[i+2],this._trailHistory[a+3]=this._data[i+6],this._trailHistory[a+4]=this._data[i+7],this._trailHistory[a+5]=this._data[i+8],this._trailHistory[a+6]=this._data[i+11]}_buildSplatBuffer(){const i=this._aliveCount*(1+this.trailLength);(!this._splatBuffer||this._splatBuffer.length<i*12)&&(this._splatBuffer=new Float32Array(i*12));let t=0;for(let a=0;a<this._aliveCount;a++){const n=a*this._stride,l=t*12;if(this._splatBuffer[l+0]=this._data[n+0],this._splatBuffer[l+1]=this._data[n+1],this._splatBuffer[l+2]=this._data[n+2],this._splatBuffer[l+3]=this._data[n+11],this._splatBuffer[l+4]=1,this._splatBuffer[l+5]=0,this._splatBuffer[l+6]=0,this._splatBuffer[l+7]=0,this._splatBuffer[l+8]=this._data[n+6],this._splatBuffer[l+9]=this._data[n+7],this._splatBuffer[l+10]=this._data[n+8],this._splatBuffer[l+11]=.5,t++,this._trailHistory){const s=a*this.trailLength*7;for(let c=0;c<this.trailLength;c++){const h=s+c*7,f=t*12,u=1-(c+1)/(this.trailLength+1);this._splatBuffer[f+0]=this._trailHistory[h+0],this._splatBuffer[f+1]=this._trailHistory[h+1],this._splatBuffer[f+2]=this._trailHistory[h+2],this._splatBuffer[f+3]=this._trailHistory[h+6]*u,this._splatBuffer[f+4]=1,this._splatBuffer[f+5]=0,this._splatBuffer[f+6]=0,this._splatBuffer[f+7]=0,this._splatBuffer[f+8]=this._trailHistory[h+3]*u,this._splatBuffer[f+9]=this._trailHistory[h+4]*u,this._splatBuffer[f+10]=this._trailHistory[h+5]*u,this._splatBuffer[f+11]=.3*u,t++}}}this._splatCount=t}_rand(){return this._rng=this._rng*1664525+1013904223&2147483647,this._rng/2147483647}dispose(){this._data=null,this._splatBuffer=null,this._trailHistory=null}}class vi{constructor(e,i={}){this.gl=e,this.maxSteps=i.maxSteps??24,this.stepSize=i.stepSize??.05,this.density=i.density??2,this.absorption=i.absorption??1.5,this.emissionStrength=i.emissionStrength??1,this.noiseScale=i.noiseScale??3,this.geometry=i.geometry??0,this.primaryColor=new Float32Array(i.primaryColor||[0,1,1]),this.secondaryColor=new Float32Array(i.secondaryColor||[1,0,1]),this.rot4dXY=0,this.rot4dXZ=0,this.rot4dYZ=0,this.rot4dXW=0,this.rot4dYW=0,this.rot4dZW=0,this.bass=0,this.mid=0,this.high=0,this.energy=0,this.sliceEnabled=!1,this.slicePlane=new Float32Array([0,1,0,0]),this._program=null,this._fbo=null,this._texture=null,this._vao=null,this._initialized=!1}init(){if(this._initialized)return;const e=this.gl;this._program=this._createProgram(),this._fbo=e.createFramebuffer(),this._texture=e.createTexture(),this._vao=e.createVertexArray(),e.bindVertexArray(this._vao);const i=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,i),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null),this._initialized=!0}setAudio(e,i,t,a){this.bass=e,this.mid=i,this.high=t,this.energy=a}render(e,i,t,a){this._initialized||this.init();const n=this.gl,{width:l,height:s}=a;return this._ensureTexture(l,s),n.bindFramebuffer(n.FRAMEBUFFER,this._fbo),n.viewport(0,0,l,s),n.clearColor(0,0,0,0),n.clear(n.COLOR_BUFFER_BIT),n.useProgram(this._program.program),n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,e),n.uniform1i(this._program.u_depthTex,0),n.activeTexture(n.TEXTURE1),n.bindTexture(n.TEXTURE_2D,i),n.uniform1i(this._program.u_normalTex,1),n.uniform1f(this._program.u_time,t),n.uniform2f(this._program.u_resolution,l,s),n.uniform1i(this._program.u_maxSteps,this.maxSteps),n.uniform1f(this._program.u_stepSize,this.stepSize),n.uniform1f(this._program.u_density,this.density),n.uniform1f(this._program.u_absorption,this.absorption),n.uniform1f(this._program.u_emissionStrength,this.emissionStrength),n.uniform1f(this._program.u_noiseScale,this.noiseScale),n.uniform1f(this._program.u_geometry,this.geometry),n.uniform3fv(this._program.u_primaryColor,this.primaryColor),n.uniform3fv(this._program.u_secondaryColor,this.secondaryColor),n.uniform1f(this._program.u_rot4dXY,this.rot4dXY),n.uniform1f(this._program.u_rot4dXZ,this.rot4dXZ),n.uniform1f(this._program.u_rot4dYZ,this.rot4dYZ),n.uniform1f(this._program.u_rot4dXW,this.rot4dXW+this.bass*.3),n.uniform1f(this._program.u_rot4dYW,this.rot4dYW+this.mid*.2),n.uniform1f(this._program.u_rot4dZW,this.rot4dZW+this.high*.4),n.uniform1i(this._program.u_sliceEnabled,this.sliceEnabled?1:0),n.uniform4fv(this._program.u_slicePlane,this.slicePlane),a.invViewProj&&n.uniformMatrix4fv(this._program.u_invViewProj,!1,a.invViewProj),a.cameraPos&&n.uniform3fv(this._program.u_cameraPos,a.cameraPos),n.enable(n.BLEND),n.blendFunc(n.ONE,n.ONE_MINUS_SRC_ALPHA),n.bindVertexArray(this._vao),n.drawArrays(n.TRIANGLES,0,3),n.bindVertexArray(null),n.disable(n.BLEND),n.bindFramebuffer(n.FRAMEBUFFER,null),{texture:this._texture,framebuffer:this._fbo}}_ensureTexture(e,i){const t=this.gl;this._texW===e&&this._texH===i||(this._texW=e,this._texH=i,t.bindTexture(t.TEXTURE_2D,this._texture),t.texImage2D(t.TEXTURE_2D,0,t.RGBA16F,e,i,0,t.RGBA,t.HALF_FLOAT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,this._fbo),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,this._texture,0),t.bindFramebuffer(t.FRAMEBUFFER,null))}_createProgram(){const e=this.gl,i=`#version 300 es
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
}`,a=e.createShader(e.VERTEX_SHADER);e.shaderSource(a,i),e.compileShader(a);const n=e.createShader(e.FRAGMENT_SHADER);e.shaderSource(n,t),e.compileShader(n),e.getShaderParameter(n,e.COMPILE_STATUS)||console.warn("VolumetricInscription fragment shader error:",e.getShaderInfoLog(n));const l=e.createProgram();e.attachShader(l,a),e.attachShader(l,n),e.linkProgram(l),e.deleteShader(a),e.deleteShader(n);const s=c=>e.getUniformLocation(l,c);return{program:l,u_depthTex:s("u_depthTex"),u_normalTex:s("u_normalTex"),u_time:s("u_time"),u_resolution:s("u_resolution"),u_maxSteps:s("u_maxSteps"),u_stepSize:s("u_stepSize"),u_density:s("u_density"),u_absorption:s("u_absorption"),u_emissionStrength:s("u_emissionStrength"),u_noiseScale:s("u_noiseScale"),u_geometry:s("u_geometry"),u_primaryColor:s("u_primaryColor"),u_secondaryColor:s("u_secondaryColor"),u_rot4dXY:s("u_rot4dXY"),u_rot4dXZ:s("u_rot4dXZ"),u_rot4dYZ:s("u_rot4dYZ"),u_rot4dXW:s("u_rot4dXW"),u_rot4dYW:s("u_rot4dYW"),u_rot4dZW:s("u_rot4dZW"),u_sliceEnabled:s("u_sliceEnabled"),u_slicePlane:s("u_slicePlane"),u_invViewProj:s("u_invViewProj"),u_cameraPos:s("u_cameraPos")}}dispose(){const e=this.gl;this._program&&e.deleteProgram(this._program.program),this._fbo&&e.deleteFramebuffer(this._fbo),this._texture&&e.deleteTexture(this._texture),this._vao&&e.deleteVertexArray(this._vao)}}class bi{constructor(e,i={}){this.gl=e,this.lightDir=new Float32Array(i.lightDir||[.5,1,.3]),this.lightColor=new Float32Array(i.lightColor||[1,.95,.9]),this.ambientStrength=i.ambientStrength??.15,this.specularPower=i.specularPower??64,this.specularStrength=i.specularStrength??.5,this.inscriptionEmission=i.inscriptionEmission??.3,this.fresnelPower=i.fresnelPower??3,this.shadowEnabled=!1,this.shadowTexture=null,this.lightSpaceMatrix=null,this._program=null,this._fbo=null,this._texture=null,this._vao=null,this._initialized=!1}init(){if(this._initialized)return;const e=this.gl;this._program=this._createProgram(),this._fbo=e.createFramebuffer(),this._texture=e.createTexture(),this._vao=e.createVertexArray(),e.bindVertexArray(this._vao);const i=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,i),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null),this._initialized=!0}setShadow(e,i){this.shadowEnabled=!0,this.shadowTexture=e,this.lightSpaceMatrix=i}render(e,i,t){this._initialized||this.init();const a=this.gl,{width:n,height:l}=t;this._ensureTexture(n,l),a.bindFramebuffer(a.FRAMEBUFFER,this._fbo),a.viewport(0,0,n,l),a.clearColor(0,0,0,0),a.clear(a.COLOR_BUFFER_BIT),a.useProgram(this._program.program),a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,e),a.uniform1i(this._program.u_inscriptionTex,0),a.activeTexture(a.TEXTURE1),a.bindTexture(a.TEXTURE_2D,i),a.uniform1i(this._program.u_normalDepthTex,1),a.uniform1i(this._program.u_shadowEnabled,this.shadowEnabled?1:0),this.shadowEnabled&&this.shadowTexture&&(a.activeTexture(a.TEXTURE2),a.bindTexture(a.TEXTURE_2D,this.shadowTexture),a.uniform1i(this._program.u_shadowTex,2),this.lightSpaceMatrix&&a.uniformMatrix4fv(this._program.u_lightSpaceMatrix,!1,this.lightSpaceMatrix)),a.uniform2f(this._program.u_resolution,n,l);const s=this.lightDir,c=Math.sqrt(s[0]*s[0]+s[1]*s[1]+s[2]*s[2])||1;return a.uniform3f(this._program.u_lightDir,s[0]/c,s[1]/c,s[2]/c),a.uniform3fv(this._program.u_lightColor,this.lightColor),a.uniform1f(this._program.u_ambientStrength,this.ambientStrength),a.uniform1f(this._program.u_specularPower,this.specularPower),a.uniform1f(this._program.u_specularStrength,this.specularStrength),a.uniform1f(this._program.u_inscriptionEmission,this.inscriptionEmission),a.uniform1f(this._program.u_fresnelPower,this.fresnelPower),t.viewDir?a.uniform3fv(this._program.u_viewDir,t.viewDir):a.uniform3f(this._program.u_viewDir,0,0,-1),a.bindVertexArray(this._vao),a.drawArrays(a.TRIANGLES,0,3),a.bindVertexArray(null),a.bindFramebuffer(a.FRAMEBUFFER,null),{texture:this._texture}}_ensureTexture(e,i){if(this._texW===e&&this._texH===i)return;const t=this.gl;this._texW=e,this._texH=i,t.bindTexture(t.TEXTURE_2D,this._texture),t.texImage2D(t.TEXTURE_2D,0,t.RGBA16F,e,i,0,t.RGBA,t.HALF_FLOAT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,this._fbo),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,this._texture,0),t.bindFramebuffer(t.FRAMEBUFFER,null)}_createProgram(){const e=this.gl,i=`#version 300 es
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
}`,a=e.createShader(e.VERTEX_SHADER);e.shaderSource(a,i),e.compileShader(a);const n=e.createShader(e.FRAGMENT_SHADER);e.shaderSource(n,t),e.compileShader(n),e.getShaderParameter(n,e.COMPILE_STATUS)||console.warn("DeferredInscriptionLighting fragment shader error:",e.getShaderInfoLog(n));const l=e.createProgram();e.attachShader(l,a),e.attachShader(l,n),e.linkProgram(l),e.deleteShader(a),e.deleteShader(n);const s=c=>e.getUniformLocation(l,c);return{program:l,u_inscriptionTex:s("u_inscriptionTex"),u_normalDepthTex:s("u_normalDepthTex"),u_shadowTex:s("u_shadowTex"),u_resolution:s("u_resolution"),u_lightDir:s("u_lightDir"),u_lightColor:s("u_lightColor"),u_viewDir:s("u_viewDir"),u_ambientStrength:s("u_ambientStrength"),u_specularPower:s("u_specularPower"),u_specularStrength:s("u_specularStrength"),u_inscriptionEmission:s("u_inscriptionEmission"),u_fresnelPower:s("u_fresnelPower"),u_shadowEnabled:s("u_shadowEnabled"),u_lightSpaceMatrix:s("u_lightSpaceMatrix")}}dispose(){const e=this.gl;this._program&&e.deleteProgram(this._program.program),this._fbo&&e.deleteFramebuffer(this._fbo),this._texture&&e.deleteTexture(this._texture),this._vao&&e.deleteVertexArray(this._vao)}}class xi{constructor(e,i={}){this.gl=e,this.maxTextures=i.maxTextures??8,this._textures=new Map,this._glTextures=new Map}setLayerTexture(e,i,t={}){const a=this.gl;let n=this._glTextures.get(e);n||(n=a.createTexture(),this._glTextures.set(e,n)),a.bindTexture(a.TEXTURE_2D,n),a.texImage2D(a.TEXTURE_2D,0,a.RGBA,a.RGBA,a.UNSIGNED_BYTE,i),a.generateMipmap(a.TEXTURE_2D),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MIN_FILTER,a.LINEAR_MIPMAP_LINEAR),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MAG_FILTER,a.LINEAR),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_S,a.REPEAT),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_T,a.REPEAT),a.bindTexture(a.TEXTURE_2D,null),this._textures.set(e,{texture:n,uvMode:t.uvMode??"screen",blend:t.blend??.5,tileX:t.tileX??1,tileY:t.tileY??1,offsetX:t.offsetX??0,offsetY:t.offsetY??0,rotation:t.rotation??0,channel:t.channel??"r",invert:t.invert??!1,width:i.width||i.naturalWidth,height:i.height||i.naturalHeight})}async loadLayerTexture(e,i,t={}){return new Promise((a,n)=>{const l=new Image;l.crossOrigin="anonymous",l.onload=()=>{this.setLayerTexture(e,l,t),a()},l.onerror=n,l.src=i})}setLayerText(e,i,t={}){const a=t.canvasSize??512,n=document.createElement("canvas");n.width=a,n.height=a;const l=n.getContext("2d");l.fillStyle="black",l.fillRect(0,0,a,a),l.fillStyle=t.color??"white",l.font=t.font??"32px monospace",l.textAlign="center",l.textBaseline="middle";const s=i.split(" "),c=[];let h="";const f=a*.8;for(const m of s){const E=h?h+" "+m:m;l.measureText(E).width>f&&h?(c.push(h),h=m):h=E}h&&c.push(h);const u=parseInt(l.font)*1.4,d=a/2-(c.length-1)*u/2;for(let m=0;m<c.length;m++)l.fillText(c[m],a/2,d+m*u);this.setLayerTexture(e,n,{channel:"luminance",...t})}setLayerCircuitPattern(e,i={}){const t=i.canvasSize??512,a=document.createElement("canvas");a.width=t,a.height=t;const n=a.getContext("2d");n.fillStyle="black",n.fillRect(0,0,t,t),n.strokeStyle="white",n.lineWidth=2;const l=i.gridSize??32;let c=i.seed??42;const h=()=>(c=c*1664525+1013904223&4294967295,(c>>>0)/4294967295);for(let f=0;f<t;f+=l){let u=h()>.3;for(let d=0;d<t;d+=l)h()>.6&&(u=!u),u&&(n.beginPath(),n.moveTo(f,d),h()>.5?n.lineTo(f+l,d):n.lineTo(f,d+l),n.stroke()),h()>.7&&(n.beginPath(),n.arc(f,d,3,0,Math.PI*2),n.fillStyle="white",n.fill())}this.setLayerTexture(e,a,{channel:"luminance",...i})}removeLayerTexture(e){const i=this._glTextures.get(e);i&&(this.gl.deleteTexture(i),this._glTextures.delete(e)),this._textures.delete(e)}getLayerConfig(e){return this._textures.get(e)||null}hasTexture(e){return this._textures.has(e)}bind(e,i){const t=this._textures.get(e);if(!t)return!1;const a=this.gl;return a.activeTexture(a.TEXTURE0+i),a.bindTexture(a.TEXTURE_2D,t.texture),!0}static getShaderSrc(){return`
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
`}dispose(){for(const[,e]of this._glTextures)this.gl.deleteTexture(e);this._glTextures.clear(),this._textures.clear()}}class Ri{constructor(e,i={}){this.gl=e,this.maxSteps=i.maxSteps??64,this.maxDistance=i.maxDistance??10,this.thickness=i.thickness??.1,this.stride=i.stride??2,this.jitter=i.jitter??.5,this.fadeEdge=i.fadeEdge??.1,this.reflectionStrength=i.reflectionStrength??.8,this._program=null,this._fbo=null,this._texture=null,this._vao=null,this._initialized=!1}init(){if(this._initialized)return;const e=this.gl;this._program=this._createProgram(),this._fbo=e.createFramebuffer(),this._texture=e.createTexture(),this._vao=e.createVertexArray(),e.bindVertexArray(this._vao);const i=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,i),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null),this._initialized=!0}render(e){this._initialized||this.init();const i=this.gl,{width:t,height:a}=e;return this._ensureTexture(t,a),i.bindFramebuffer(i.FRAMEBUFFER,this._fbo),i.viewport(0,0,t,a),i.clearColor(0,0,0,0),i.clear(i.COLOR_BUFFER_BIT),i.useProgram(this._program.program),i.activeTexture(i.TEXTURE0),i.bindTexture(i.TEXTURE_2D,e.colorTexture),i.uniform1i(this._program.u_colorTex,0),i.activeTexture(i.TEXTURE1),i.bindTexture(i.TEXTURE_2D,e.normalDepthTexture),i.uniform1i(this._program.u_normalDepthTex,1),i.uniform2f(this._program.u_resolution,t,a),i.uniform1f(this._program.u_time,e.time||0),i.uniform1i(this._program.u_maxSteps,this.maxSteps),i.uniform1f(this._program.u_maxDistance,this.maxDistance),i.uniform1f(this._program.u_thickness,this.thickness),i.uniform1f(this._program.u_stride,this.stride),i.uniform1f(this._program.u_jitter,this.jitter),i.uniform1f(this._program.u_fadeEdge,this.fadeEdge),i.uniform1f(this._program.u_reflectionStrength,this.reflectionStrength),e.projMatrix&&i.uniformMatrix4fv(this._program.u_projMatrix,!1,e.projMatrix),e.invProjMatrix&&i.uniformMatrix4fv(this._program.u_invProjMatrix,!1,e.invProjMatrix),e.viewMatrix&&i.uniformMatrix4fv(this._program.u_viewMatrix,!1,e.viewMatrix),i.bindVertexArray(this._vao),i.drawArrays(i.TRIANGLES,0,3),i.bindVertexArray(null),i.bindFramebuffer(i.FRAMEBUFFER,null),{texture:this._texture}}_ensureTexture(e,i){if(this._texW===e&&this._texH===i)return;const t=this.gl;this._texW=e,this._texH=i,t.bindTexture(t.TEXTURE_2D,this._texture),t.texImage2D(t.TEXTURE_2D,0,t.RGBA16F,e,i,0,t.RGBA,t.HALF_FLOAT,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.bindFramebuffer(t.FRAMEBUFFER,this._fbo),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,this._texture,0),t.bindFramebuffer(t.FRAMEBUFFER,null)}_createProgram(){const e=this.gl,i=`#version 300 es
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
}`,a=e.createShader(e.VERTEX_SHADER);e.shaderSource(a,i),e.compileShader(a);const n=e.createShader(e.FRAGMENT_SHADER);e.shaderSource(n,t),e.compileShader(n),e.getShaderParameter(n,e.COMPILE_STATUS)||console.warn("SSR fragment shader error:",e.getShaderInfoLog(n));const l=e.createProgram();e.attachShader(l,a),e.attachShader(l,n),e.linkProgram(l),e.deleteShader(a),e.deleteShader(n);const s=c=>e.getUniformLocation(l,c);return{program:l,u_colorTex:s("u_colorTex"),u_normalDepthTex:s("u_normalDepthTex"),u_resolution:s("u_resolution"),u_time:s("u_time"),u_maxSteps:s("u_maxSteps"),u_maxDistance:s("u_maxDistance"),u_thickness:s("u_thickness"),u_stride:s("u_stride"),u_jitter:s("u_jitter"),u_fadeEdge:s("u_fadeEdge"),u_reflectionStrength:s("u_reflectionStrength"),u_projMatrix:s("u_projMatrix"),u_invProjMatrix:s("u_invProjMatrix"),u_viewMatrix:s("u_viewMatrix")}}dispose(){const e=this.gl;this._program&&e.deleteProgram(this._program.program),this._fbo&&e.deleteFramebuffer(this._fbo),this._texture&&e.deleteTexture(this._texture),this._vao&&e.deleteVertexArray(this._vao)}}function yi(r,e,i,t){const a=[],n=[],l=[],s=[];for(let c=0;c<=t;c++)for(let h=0;h<=i;h++){const f=h/i*Math.PI*2,u=c/t*Math.PI*2;a.push((r+e*Math.cos(u))*Math.cos(f),e*Math.sin(u),(r+e*Math.cos(u))*Math.sin(f)),n.push(Math.cos(u)*Math.cos(f),Math.sin(u),Math.cos(u)*Math.sin(f)),l.push(h/i,c/t)}for(let c=0;c<t;c++)for(let h=0;h<i;h++){const f=c*(i+1)+h,u=f+i+1;s.push(f,u,f+1,u,u+1,f+1)}return{positions:new Float32Array(a),normals:new Float32Array(n),uvs:new Float32Array(l),indices:new Uint16Array(s),triCount:s.length/3}}function Ai(r,e,i){const t=[],a=[],n=[],l=[];for(let s=0;s<=i;s++)for(let c=0;c<=e;c++){const h=c/e,f=s/i,u=h*Math.PI*2,d=f*Math.PI,m=-r*Math.cos(u)*Math.sin(d),E=r*Math.cos(d),p=r*Math.sin(u)*Math.sin(d),v=Math.sqrt(m*m+E*E+p*p)||1;t.push(m,E,p),a.push(m/v,E/v,p/v),n.push(h,f)}for(let s=0;s<i;s++)for(let c=0;c<e;c++){const h=s*(e+1)+c,f=h+e+1;l.push(h,f,h+1,f,f+1,h+1)}return{positions:new Float32Array(t),normals:new Float32Array(a),uvs:new Float32Array(n),indices:new Uint16Array(l),triCount:l.length/3}}function Si(r){const e=r/2,i=[-e,-e,e,e,-e,e,e,e,e,-e,e,e,e,-e,-e,-e,-e,-e,-e,e,-e,e,e,-e,-e,e,e,e,e,e,e,e,-e,-e,e,-e,-e,-e,-e,e,-e,-e,e,-e,e,-e,-e,e,e,-e,e,e,-e,-e,e,e,-e,e,e,e,-e,-e,-e,-e,-e,e,-e,e,e,-e,e,-e],t=[0,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0],a=[0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1],n=[];for(let l=0;l<6;l++){const s=l*4;n.push(s,s+1,s+2,s,s+2,s+3)}return{positions:new Float32Array(i),normals:new Float32Array(t),uvs:new Float32Array(a),indices:new Uint16Array(n),triCount:n.length/3}}function Fi(r,e,i,t){const a=[],n=[],l=[],s=[];function c(h){return h*=Math.PI*2,[(Math.sin(h)+2*Math.sin(2*h))*r,(Math.cos(h)-2*Math.cos(2*h))*r,-Math.sin(3*h)*r]}for(let h=0;h<=t;h++)for(let f=0;f<=i;f++){const u=f/i,d=h/t*Math.PI*2,m=c(u),E=c(u+.001),p=[E[0]-m[0],E[1]-m[1],E[2]-m[2]],v=Math.sqrt(p[0]*p[0]+p[1]*p[1]+p[2]*p[2])||1;p[0]/=v,p[1]/=v,p[2]/=v;let T=[0,1,0];Math.abs(p[1])>.99&&(T=[1,0,0]);const _=[p[1]*T[2]-p[2]*T[1],p[2]*T[0]-p[0]*T[2],p[0]*T[1]-p[1]*T[0]],g=Math.sqrt(_[0]*_[0]+_[1]*_[1]+_[2]*_[2])||1;_[0]/=g,_[1]/=g,_[2]/=g;const b=[_[1]*p[2]-_[2]*p[1],_[2]*p[0]-_[0]*p[2],_[0]*p[1]-_[1]*p[0]],R=Math.cos(d),S=Math.sin(d),P=R*b[0]+S*_[0],B=R*b[1]+S*_[1],W=R*b[2]+S*_[2];a.push(m[0]+e*P,m[1]+e*B,m[2]+e*W),n.push(P,B,W),l.push(u,h/t)}for(let h=0;h<t;h++)for(let f=0;f<i;f++){const u=h*(i+1)+f,d=u+i+1;s.push(u,d,u+1,d,d+1,u+1)}return{positions:new Float32Array(a),normals:new Float32Array(n),uvs:new Float32Array(l),indices:new Uint16Array(s),triCount:s.length/3}}function Di(r){const e=document.createElement("canvas");e.width=r,e.height=r;const i=e.getContext("2d"),t=i.createRadialGradient(r/2,r/2,0,r/2,r/2,r*.5);t.addColorStop(0,"#ff6b35"),t.addColorStop(.35,"#d63384"),t.addColorStop(.65,"#6f42c1"),t.addColorStop(1,"#0d6efd"),i.fillStyle=t,i.fillRect(0,0,r,r),i.globalCompositeOperation="multiply";const a=8,n=r/a;for(let l=0;l<a;l++)for(let s=0;s<a;s++)i.fillStyle=(l+s)%2===0?"rgba(255,255,255,0.85)":"rgba(60,60,80,0.85)",i.fillRect(s*n,l*n,n,n);i.globalCompositeOperation="screen";for(let l=1;l<=6;l++)i.beginPath(),i.arc(r/2,r/2,l*r*.07,0,Math.PI*2),i.lineWidth=2,i.strokeStyle=`hsla(${l*50},80%,70%,0.4)`,i.stroke();return i.globalCompositeOperation="source-over",i.getImageData(0,0,r,r)}const pe=`#version 300 es
precision highp float; out vec2 v_uv;
void main(){float x=float((gl_VertexID&1)<<2)-1.0;float y=float((gl_VertexID&2)<<1)-1.0;v_uv=vec2(x,y)*0.5+0.5;gl_Position=vec4(x,y,0.0,1.0);}`,Mi=`#version 300 es
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
}`;function Pi(r,e){const i=new Float32Array(16);for(let t=0;t<4;t++)for(let a=0;a<4;a++)i[t*4+a]=r[a]*e[t*4]+r[4+a]*e[t*4+1]+r[8+a]*e[t*4+2]+r[12+a]*e[t*4+3];return i}function Ui(r,e,i,t){const a=1/Math.tan(r*.5),n=1/(i-t);return new Float32Array([a/e,0,0,0,0,a,0,0,0,0,(t+i)*n,-1,0,0,2*t*i*n,0])}function Li(r,e,i){let t=r[0]-e[0],a=r[1]-e[1],n=r[2]-e[2],l=Math.hypot(t,a,n)||1;t/=l,a/=l,n/=l;let s=i[1]*n-i[2]*a,c=i[2]*t-i[0]*n,h=i[0]*a-i[1]*t;l=Math.hypot(s,c,h)||1,s/=l,c/=l,h/=l;const f=a*h-n*c,u=n*s-t*h,d=t*c-a*s;return new Float32Array([s,f,t,0,c,u,a,0,h,d,n,0,-(s*r[0]+c*r[1]+h*r[2]),-(f*r[0]+u*r[1]+d*r[2]),-(t*r[0]+a*r[1]+n*r[2]),1])}class Bi{constructor(e){this.azimuth=.5,this.elevation=.35,this.distance=5,this.fov=Math.PI/4,this.near=.1,this.far=100,this.target=[0,0,0],this.canvas=e,this._vAz=0,this._vEl=0,this._vDist=0,this._friction=.93,this._zoomFriction=.87,this._sensitivity=.004,this._zoomSens=.001,this._springK=3.5,this._springDamp=.88,this._autopilot=!0,this._autoTimer=null,this._tAz=.5,this._tEl=.35,this._tDist=5,this._orbitSpeed=.12,this._choroElAmp=.08,this._choroElFreq=.4,this._choroDistAmp=.3,this._choroDistFreq=.25,this._pointers=new Map,this._pinchDist=0,this._minDist=1.5,this._maxDist=20,e.style.touchAction="none",e.style.userSelect="none",e.style.webkitUserSelect="none",e.addEventListener("pointerdown",this._down.bind(this)),e.addEventListener("pointermove",this._move.bind(this)),e.addEventListener("pointerup",this._up.bind(this)),e.addEventListener("pointercancel",this._up.bind(this)),e.addEventListener("wheel",this._wheel.bind(this),{passive:!1})}_down(e){if(this.canvas.setPointerCapture(e.pointerId),this._pointers.set(e.pointerId,{x:e.clientX,y:e.clientY}),this._vAz*=.3,this._vEl*=.3,this._autopilot=!1,clearTimeout(this._autoTimer),this._pointers.size===2){const[i,t]=[...this._pointers.values()];this._pinchDist=Math.hypot(t.x-i.x,t.y-i.y)}}_move(e){const i=this._pointers.get(e.pointerId);if(!i)return;const t=e.clientX-i.x,a=e.clientY-i.y;if(i.x=e.clientX,i.y=e.clientY,this._pointers.size===1){const n=t*this._sensitivity,l=a*this._sensitivity;this.azimuth+=n,this.elevation=Math.max(-1.4,Math.min(1.4,this.elevation+l)),this._vAz=this._vAz*.5+n*.5,this._vEl=this._vEl*.5+l*.5}else if(this._pointers.size===2){const[n,l]=[...this._pointers.values()],s=Math.hypot(l.x-n.x,l.y-n.y);if(this._pinchDist>10){const c=this._pinchDist/s;this.distance*=c,this._vDist=(c-1)*this.distance*.5}this._pinchDist=s,this.azimuth+=t*this._sensitivity*.3,this.elevation=Math.max(-1.4,Math.min(1.4,this.elevation+a*this._sensitivity*.3))}}_up(e){this._pointers.delete(e.pointerId),this._pinchDist=0,this._pointers.size===0&&this._scheduleAutoResume()}_wheel(e){e.preventDefault();const i=e.deltaY*this._zoomSens;this._vDist+=i*this.distance,this.distance*=1+i,this._autopilot=!1,clearTimeout(this._autoTimer),this._scheduleAutoResume()}_scheduleAutoResume(){clearTimeout(this._autoTimer),this._autoTimer=setTimeout(()=>{this._tAz=this.azimuth,this._tEl=this.elevation,this._tDist=this.distance,this._autopilot=!0},3500)}setTarget(e,i,t,a=.12,n=null){this._tAz=e,this._tEl=i,this._tDist=t,this._orbitSpeed=a,this._autopilot=!0,clearTimeout(this._autoTimer),n?(this._choroElAmp=n.elAmp||0,this._choroElFreq=n.elFreq||0,this._choroDistAmp=n.distAmp||0,this._choroDistFreq=n.distFreq||0):(this._choroElAmp=0,this._choroElFreq=0,this._choroDistAmp=0,this._choroDistFreq=0)}releaseAutopilot(){this._autopilot=!1,clearTimeout(this._autoTimer)}update(e,i){e=Math.min(e,.05);const t=Math.pow(this._friction,e*60),a=Math.pow(this._zoomFriction,e*60);if(this._pointers.size===0)if(this._autopilot){const n=this._choroElAmp*Math.sin(i*this._choroElFreq),l=this._choroDistAmp*Math.sin(i*this._choroDistFreq),s=this._springK*e;this._vAz+=(this._tAz-this.azimuth)*s,this._vEl+=(this._tEl+n-this.elevation)*s,this._vDist+=(this._tDist+l-this.distance)*s,this.azimuth+=this._vAz,this.elevation+=this._vEl,this.distance+=this._vDist,this._vAz*=this._springDamp,this._vEl*=this._springDamp,this._vDist*=this._springDamp,this._tAz+=this._orbitSpeed*e}else this.azimuth+=this._vAz,this.elevation+=this._vEl,this.distance+=this._vDist,this.elevation=Math.max(-1.4,Math.min(1.4,this.elevation)),this._vAz*=t,this._vEl*=t,this._vDist*=a,Math.abs(this._vAz)<1e-6&&(this._vAz=0),Math.abs(this._vEl)<1e-6&&(this._vEl=0),Math.abs(this._vDist)<1e-5&&(this._vDist=0);this.distance<this._minDist?(this.distance+=(this._minDist-this.distance)*.12,this._vDist*=.5):this.distance>this._maxDist&&(this.distance+=(this._maxDist-this.distance)*.12,this._vDist*=.5)}get isDragging(){return this._pointers.size>0}get eye(){const e=Math.cos(this.elevation),i=Math.sin(this.elevation),t=Math.cos(this.azimuth),a=Math.sin(this.azimuth);return[this.target[0]+this.distance*e*a,this.target[1]+this.distance*i,this.target[2]+this.distance*e*t]}get aspect(){return this.canvas.width/this.canvas.height}get viewMatrix(){return Li(this.eye,this.target,[0,1,0])}get projectionMatrix(){return Ui(this.fov,this.aspect,this.near,this.far)}get viewProjection(){return Pi(this.projectionMatrix,this.viewMatrix)}}const z=document.getElementById("canvas");z.width=window.innerWidth*devicePixelRatio;z.height=window.innerHeight*devicePixelRatio;const o=z.getContext("webgl2",{depth:!0,antialias:!1,preserveDrawingBuffer:!0});if(!o)throw document.body.innerHTML='<h2 style="color:#fff;text-align:center;margin-top:40vh">WebGL2 required</h2>',new Error("WebGL2 required");o.getExtension("EXT_color_buffer_half_float");o.getExtension("EXT_color_buffer_float");const M=new Bi(z);window.addEventListener("resize",()=>{z.width=window.innerWidth*devicePixelRatio,z.height=window.innerHeight*devicePixelRatio});const Z=new si(o,{lightDir:[.5,.8,.3],lightColor:[1,.98,.95],ambientColor:[.15,.15,.22],specularPower:48}),ye=new cr(o,{pointScale:z.height/(2*Math.tan(Math.PI/8)),blendMode:"additive",animate:!0,intensity:1,chromatic:.4}),L=new ci(o,{layerCount:4,geometry:3,thickness:.6,patternScale:3,patternSpeed:.3,depthSensitivity:8,normalSensitivity:2,opacity:.8}),x=new fi(o,{exposure:1.2,gamma:2.2});x.setMeshRenderer(Z);x.setSplatRenderer(ye);x.setEdgeInscription(L);const qe=new pi({layerCount:4,transitionDuration:.5});qe.registerObject(1,"active");let Te=.3,G=null,hr=null,Ze=3;{const r=o.createShader(o.VERTEX_SHADER);o.shaderSource(r,pe),o.compileShader(r);const e=o.createShader(o.FRAGMENT_SHADER);o.shaderSource(e,Mi),o.compileShader(e),o.getShaderParameter(r,o.COMPILE_STATUS)&&o.getShaderParameter(e,o.COMPILE_STATUS)&&(G=o.createProgram(),o.attachShader(G,r),o.attachShader(G,e),o.linkProgram(G),o.getProgramParameter(G,o.LINK_STATUS)?hr=o.createVertexArray():G=null)}x.setProceduralRenderer((r,e)=>{G&&(o.useProgram(G),o.bindVertexArray(hr),o.uniform1f(o.getUniformLocation(G,"u_time"),e),o.uniform1f(o.getUniformLocation(G,"u_geometry"),Ze),o.uniform2f(o.getUniformLocation(G,"u_resolution"),r.width,r.height),o.drawArrays(o.TRIANGLES,0,3))});let ke=null,Re=!0,fr=.7,dr=.5;try{ke=new Ei(o,{resolution:1024,bias:.003,pcfRadius:2,frustumSize:6,lightDir:[.5,.8,.3]}),ke.init()}catch(r){console.warn("ShadowMap init failed:",r),ke=null}let F=null,de=!0,ot=50,at=.8,Nt="surface";try{F=new Ti(o,{maxParticles:1e4,emitRate:50,lifetime:2.5,speed:.3,speedVariance:.15,gravity:[0,-.1,0],drag:.02,splatScale:.015,emitterType:"sphere",emitterRadius:1.2,colorStart:[.4,.7,1],colorEnd:[.8,.3,1],colorMode:"lerp"})}catch(r){console.warn("ParticleSystem init failed:",r),F=null}let ie=null,Pe=!1,mr=.8,_r=.4;try{ie=new vi(o,{maxSteps:48,density:.8,absorption:.4,geometry:3,primaryColor:[.3,.6,1],secondaryColor:[.8,.2,.9]}),ie.init()}catch(r){console.warn("VolumetricInscription init failed:",r),ie=null}let oe=null,Ue=!0,pr=.6,Er=.4;try{oe=new bi(o,{lightDir:[.5,.8,.3],lightColor:[1,.98,.95],specularPower:32,specularStrength:.6,fresnelPower:3,inscriptionEmission:1.5}),oe.init()}catch(r){console.warn("DeferredInscriptionLighting init failed:",r),oe=null}let Oe=null;try{Oe=new xi(o),Oe.setLayerCircuitPattern(0,{density:12,color:"#5b9cf5"}),Oe.setLayerText(1,"VIB3+",{fontSize:48,color:"#a78bfa"})}catch(r){console.warn("InscriptionTexture init failed:",r),Oe=null}let ae=null,me=!0,gr=.6;try{ae=new Ri(o,{maxSteps:48,maxDistance:8,thickness:.15,stride:2,jitter:.4,fadeEdge:.12,reflectionStrength:.6}),ae.init()}catch(r){console.warn("SSR init failed:",r),ae=null}let _e=!0,Tr=.65,vr=.45,br=.35,xr=.003,gt=!0,st=0,wi=12,nt=3,Ne=3;const Ii={torus:()=>yi(1,.4,64,32),sphere:()=>Ai(1.2,48,32),cube:()=>Si(1.8),knot:()=>Fi(.35,.12,128,24)};let Rr="torus",A=null,U=[];const Le=new mi,re=Di(256);function Tt(r){Rr=r;const e=Ii[r];e&&(A=e(),Z.uploadGeometry(A),Z.uploadTexture(re),U=Le.convert({positions:A.positions,normals:A.normals,uvs:A.uvs,indices:A.indices,diffusePixels:re.data,diffuseWidth:re.width,diffuseHeight:re.height}),ye.updateSeeds(we(U),U.length),document.getElementById("meshTris").textContent=A.triCount.toLocaleString(),document.getElementById("splatCount").textContent=U.length.toLocaleString(),document.querySelectorAll(".mesh-btn").forEach(i=>i.classList.toggle("active",i.dataset.mesh===r)))}let se="none",D=null,X=null,Be=null,q=null,yr="surface",Ci=6,lt=0,Ae=!1;X=document.createElement("canvas");X.width=256;X.height=256;Be=X.getContext("2d",{willReadFrequently:!0});async function Xi(){try{q&&q.getTracks().forEach(r=>r.stop()),q=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:512},height:{ideal:512},facingMode:"user"}}),D||(D=document.createElement("video"),D.playsInline=!0,D.muted=!0),D.srcObject=q,await D.play(),se="webcam",Ae=!0,$e()}catch(r){console.warn("Webcam access denied:",r),alert("Camera access denied. Check browser permissions.")}}function Ar(){if(q&&(q.getTracks().forEach(r=>r.stop()),q=null),D&&(D.pause(),D.srcObject=null),se="none",Ae=!1,A){Z.uploadTexture(re),U=Le.convert({positions:A.positions,normals:A.normals,uvs:A.uvs,indices:A.indices,diffusePixels:re.data,diffuseWidth:re.width,diffuseHeight:re.height}),ye.updateSeeds(we(U),U.length);const r=document.getElementById("splatCount");r&&(r.textContent=U.length.toLocaleString())}$e()}function Sr(r){const e=new Image;e.onload=()=>{X.width=Math.min(e.width,512),X.height=Math.min(e.height,512),Be.drawImage(e,0,0,X.width,X.height);const i=Be.getImageData(0,0,X.width,X.height);if(Z.uploadTexture(i),A){U=Le.convert({positions:A.positions,normals:A.normals,uvs:A.uvs,indices:A.indices,diffusePixels:i.data,diffuseWidth:X.width,diffuseHeight:X.height}),ye.updateSeeds(we(U),U.length);const t=document.getElementById("splatCount");t&&(t.textContent=U.length.toLocaleString())}se="image",Ae=!0,$e(),URL.revokeObjectURL(e.src)},e.src=URL.createObjectURL(r)}function Fr(r){D||(D=document.createElement("video"),D.playsInline=!0,D.muted=!0,D.loop=!0),q&&(q.getTracks().forEach(e=>e.stop()),q=null),D.srcObject=null,D.src=URL.createObjectURL(r),D.play(),se="video",Ae=!0,$e()}function $e(){const r=document.getElementById("badgeMedia");r&&(r.className="feature-badge "+(Ae?"on":"off"));const e=document.getElementById("mediaSourceLabel");if(e){const i={none:"None",webcam:"Webcam",image:"Image",video:"Video"};e.textContent=i[se]||"None"}}function Oi(){if(!Ae||se==="none"||se==="image"||!D||D.readyState<2)return;const r=Z.gl;if(Z._diffuseTexture&&(r.bindTexture(r.TEXTURE_2D,Z._diffuseTexture),r.texImage2D(r.TEXTURE_2D,0,r.RGBA,r.RGBA,r.UNSIGNED_BYTE,D),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR)),lt++,lt>=Ci&&A){lt=0,X.width=256,X.height=256,Be.drawImage(D,0,0,256,256);const e=Be.getImageData(0,0,256,256);yr==="surface"?U=Le.convert({positions:A.positions,normals:A.normals,uvs:A.uvs,indices:A.indices,diffusePixels:e.data,diffuseWidth:256,diffuseHeight:256}):U=Le.convertFlat(e.data,256,256,{gridStep:2,scale:.015,depthFromLum:1.5}),ye.updateSeeds(we(U),U.length);const i=document.getElementById("splatCount");i&&(i.textContent=U.length.toLocaleString())}}function Ni(){const r=document.getElementById("dropOverlay"),e=document.getElementById("canvas");e.addEventListener("dragover",i=>{i.preventDefault(),i.dataTransfer.dropEffect="copy",r&&r.classList.add("visible")}),e.addEventListener("dragleave",()=>{r&&r.classList.remove("visible")}),e.addEventListener("drop",i=>{i.preventDefault(),r&&r.classList.remove("visible");const t=i.dataTransfer.files[0];t&&(t.type.startsWith("image/")?Sr(t):t.type.startsWith("video/")&&Fr(t))})}Ni();const Wt=document.getElementById("btnWebcam");Wt&&Wt.addEventListener("click",()=>{se==="webcam"?Ar():Xi()});const jt=document.getElementById("btnStopMedia");jt&&jt.addEventListener("click",Ar);const Vt=document.getElementById("selectSplatMode");Vt&&Vt.addEventListener("change",r=>{yr=r.target.value});const Gt=document.getElementById("btnMediaFile"),ct=document.getElementById("mediaFileInput");Gt&&ct&&(Gt.addEventListener("click",()=>ct.click()),ct.addEventListener("change",r=>{const e=r.target.files[0];e&&(e.type.startsWith("image/")?Sr(e):e.type.startsWith("video/")&&Fr(e))}));let Dr="showcase";const Wi={showcase:{m:!0,s:!0,p:!0,i:!0,shadow:!0,particles:!0,volumetric:!1,deferred:!0,bloom:!0,ssr:!0,autoShow:!0,l:"v3 Showcase"},hybrid:{m:!0,s:!0,p:!0,i:!0,shadow:!1,particles:!1,volumetric:!1,deferred:!1,bloom:!1,ssr:!1,autoShow:!1,l:"Full Hybrid"},shadows:{m:!0,s:!1,p:!1,i:!0,shadow:!0,particles:!1,volumetric:!1,deferred:!0,bloom:!0,ssr:!1,autoShow:!1,l:"Shadows"},particles:{m:!0,s:!1,p:!1,i:!0,shadow:!1,particles:!0,volumetric:!1,deferred:!1,bloom:!0,ssr:!1,autoShow:!1,l:"Particles"},volumetric:{m:!0,s:!1,p:!1,i:!1,shadow:!1,particles:!1,volumetric:!0,deferred:!1,bloom:!0,ssr:!1,autoShow:!1,l:"Volumetric"},inscFX:{m:!0,s:!1,p:!1,i:!0,shadow:!0,particles:!0,volumetric:!1,deferred:!0,bloom:!0,ssr:!0,autoShow:!1,l:"Inscription FX"},cinematic:{m:!0,s:!0,p:!0,i:!0,shadow:!0,particles:!0,volumetric:!1,deferred:!0,bloom:!0,ssr:!0,autoShow:!0,l:"Cinematic"},benchmark:{m:!0,s:!0,p:!0,i:!0,shadow:!0,particles:!0,volumetric:!1,deferred:!0,bloom:!0,ssr:!1,autoShow:!1,l:"Benchmark"}};function vt(r){Dr=r;const e=Wi[r];if(!e)return;x.meshLayer.enabled=e.m,x.splatLayer.enabled=e.s,x.proceduralLayer.enabled=e.p,x.inscriptionLayer.enabled=e.i,Re=e.shadow,de=e.particles,Pe=e.volumetric,Ue=e.deferred,_e=e.bloom!==!1,me=e.ssr===!0,gt=e.autoShow===!0,document.getElementById("toggleMesh").checked=e.m,document.getElementById("toggleSplat").checked=e.s,document.getElementById("toggleProcedural").checked=e.p,document.getElementById("toggleInscription").checked=e.i,document.getElementById("toggleShadows").checked=e.shadow,document.getElementById("toggleParticles").checked=e.particles,document.getElementById("toggleVolumetric").checked=e.volumetric,document.getElementById("toggleDeferredLit").checked=e.deferred;const i=document.getElementById("toggleBloom");i&&(i.checked=_e);const t=document.getElementById("toggleSSR");t&&(t.checked=me),document.getElementById("compositorMode").textContent=e.l,document.getElementById("benchmarkPanel").classList.toggle("hidden",r!=="benchmark"),document.querySelectorAll(".tab-btn").forEach(a=>a.classList.toggle("active",a.dataset.tab===r)),ne()}function ne(){const r=(e,i)=>{const t=document.getElementById(e);t&&(t.className="feature-badge "+(i?"on":"off"))};r("badgeShadows",Re&&ke),r("badgeParticles",de&&F),r("badgeVolumetric",Pe&&ie),r("badgeDeferredLit",Ue&&oe),r("badgeInscription",x.inscriptionLayer.enabled),r("badgeBloom",_e),r("badgeSSR",me&&ae)}document.querySelectorAll(".tab-btn").forEach(r=>r.addEventListener("click",()=>vt(r.dataset.tab)));document.querySelectorAll(".mesh-btn").forEach(r=>r.addEventListener("click",()=>Tt(r.dataset.mesh)));const zt=document.getElementById("controlsToggle"),ji=document.getElementById("controls");zt.addEventListener("click",()=>{const r=ji.classList.toggle("collapsed");zt.classList.toggle("active",!r)});document.getElementById("toggleMesh").addEventListener("change",r=>x.meshLayer.enabled=r.target.checked);document.getElementById("toggleSplat").addEventListener("change",r=>x.splatLayer.enabled=r.target.checked);document.getElementById("toggleProcedural").addEventListener("change",r=>x.proceduralLayer.enabled=r.target.checked);document.getElementById("toggleInscription").addEventListener("change",r=>{x.inscriptionLayer.enabled=r.target.checked,ne()});function C(r,e,i){const t=document.getElementById(r),a=document.getElementById(e);!t||!a||t.addEventListener("input",()=>{const n=t.value/100;a.textContent=n.toFixed(2),i(n)})}C("sliderMeshOpacity","valMeshOpacity",r=>x.meshLayer.opacity=r);C("sliderSplatOpacity","valSplatOpacity",r=>x.splatLayer.opacity=r);C("sliderProcOpacity","valProcOpacity",r=>x.proceduralLayer.opacity=r);C("sliderInscOpacity","valInscOpacity",r=>x.inscriptionLayer.opacity=r);const ut=document.getElementById("sliderThickness"),Vi=document.getElementById("valThickness");ut&&ut.addEventListener("input",()=>{const r=ut.value/100;Vi.textContent=r.toFixed(2),L.thickness=r});const We=document.getElementById("sliderPattern"),Gi=document.getElementById("valPattern");We&&We.addEventListener("input",()=>{Gi.textContent=We.value,L.geometry=parseInt(We.value)});const Fe=document.getElementById("sliderLayerCount"),zi=document.getElementById("valLayerCount");Fe&&Fe.addEventListener("input",()=>{zi.textContent=Fe.value,L.layerCount=parseInt(Fe.value),document.getElementById("inscLayers").textContent=Fe.value});const je=document.getElementById("sliderGeometry"),ki=document.getElementById("valGeometry");je&&je.addEventListener("input",()=>{ki.textContent=je.value,Ze=parseInt(je.value)});const ht=document.getElementById("sliderExposure"),Yi=document.getElementById("valExposure");ht&&ht.addEventListener("input",()=>{const r=ht.value/100;Yi.textContent=r.toFixed(2),x.exposure=r});function bt(r,e,i){const t=document.getElementById(r),a=document.getElementById(e);!t||!a||t.addEventListener("input",()=>{const n=t.value/100;a.textContent=n.toFixed(2),L[i]=n})}bt("slider4DXW","val4DXW","rot4dXW");bt("slider4DYW","val4DYW","rot4dYW");bt("slider4DZW","val4DZW","rot4dZW");const kt=document.getElementById("selectState");kt&&kt.addEventListener("change",r=>{qe.setObjectState(1,r.target.value);const e=document.getElementById("currentState");e&&(e.textContent=r.target.value)});const ft=document.getElementById("sliderAudioSim"),Yt=document.getElementById("valAudioSim");ft&&ft.addEventListener("input",()=>{const r=ft.value/100;Yt&&(Yt.textContent=r.toFixed(2)),Te=r});document.getElementById("toggleShadows").addEventListener("change",r=>{Re=r.target.checked,ne()});C("sliderShadowInt","valShadowInt",r=>fr=r);C("sliderShadowSoft","valShadowSoft",r=>dr=r);document.getElementById("toggleParticles").addEventListener("change",r=>{de=r.target.checked,ne()});{const r=document.getElementById("sliderParticleRate"),e=document.getElementById("valParticleRate");r&&r.addEventListener("input",()=>{ot=parseInt(r.value),e.textContent=ot,F&&(F.emitRate=ot)});const i=document.getElementById("sliderParticleSize"),t=document.getElementById("valParticleSize");i&&i.addEventListener("input",()=>{at=i.value/100,t.textContent=at.toFixed(2),F&&(F.splatScale=at*.02)});const a=document.getElementById("selectParticleMode");a&&a.addEventListener("change",n=>{Nt=n.target.value,F&&(F.emitterType=Nt==="surface"?"sphere":"point")})}document.getElementById("toggleVolumetric").addEventListener("change",r=>{Pe=r.target.checked,ne()});C("sliderVolDensity","valVolDensity",r=>{mr=r,ie&&(ie.density=r)});C("sliderVolAbsorb","valVolAbsorb",r=>{_r=r,ie&&(ie.absorption=r)});document.getElementById("toggleDeferredLit").addEventListener("change",r=>{Ue=r.target.checked,ne()});C("sliderSpecular","valSpecular",r=>{pr=r,oe&&(oe.specularStrength=r)});C("sliderFresnel","valFresnel",r=>{Er=r,oe&&(oe.fresnelPower=r*8)});const Ht=document.getElementById("toggleBloom");Ht&&Ht.addEventListener("change",r=>{_e=r.target.checked,ne()});C("sliderBloomThreshold","valBloomThreshold",r=>Tr=r);C("sliderBloomIntensity","valBloomIntensity",r=>vr=r);const qt=document.getElementById("toggleSSR");qt&&qt.addEventListener("change",r=>{me=r.target.checked,ne()});C("sliderSSRStrength","valSSRStrength",r=>{gr=r,ae&&(ae.reflectionStrength=r)});C("sliderVignette","valVignette",r=>br=r);C("sliderChromatic","valChromatic",r=>xr=r*.01);document.getElementById("selectSplatSource").addEventListener("change",r=>{const e=r.target.value;if(e==="texture")Tt(Rr);else{const i=[],t=e==="galaxy"?2e5:15e4;for(let a=0;a<t;a++){const n=Math.random()*Math.PI*2,l=Math.pow(Math.random(),.5)*3;if(e==="galaxy"){const s=Math.floor(Math.random()*3)*(Math.PI*2/3),c=n*.5;i.push({position:[l*Math.cos(n+s+c)+(Math.random()-.5)*.3,(Math.random()-.5)*.2*(1-l/3),l*Math.sin(n+s+c)+(Math.random()-.5)*.3],orientation:[1,0,0,0],scale:.015+Math.random()*.02,color:[.6+Math.random()*.4,.4+Math.random()*.4,.8+Math.random()*.2],depth:l*.3})}else{const s=(Math.random()-.5)*Math.PI;i.push({position:[l*Math.cos(n)*Math.cos(s),l*Math.sin(s)*.6,l*Math.sin(n)*Math.cos(s)],orientation:[1,0,0,0],scale:.02+Math.random()*.03,color:[.8+Math.random()*.2,.2+Math.random()*.3,.5+Math.random()*.5],depth:l*.2})}}ye.updateSeeds(we(i),i.length),document.getElementById("splatCount").textContent=i.length.toLocaleString()}});const Hi=`#version 300 es
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
}`;let O=null,Mr=null;{const r=o.createShader(o.VERTEX_SHADER);o.shaderSource(r,pe),o.compileShader(r);const e=o.createShader(o.FRAGMENT_SHADER);o.shaderSource(e,Hi),o.compileShader(e),o.getShaderParameter(r,o.COMPILE_STATUS)&&o.getShaderParameter(e,o.COMPILE_STATUS)&&(O=o.createProgram(),o.attachShader(O,r),o.attachShader(O,e),o.linkProgram(O),o.getProgramParameter(O,o.LINK_STATUS)?Mr=o.createVertexArray():(console.warn("Shadow comp link:",o.getProgramInfoLog(O)),O=null))}const qi=`#version 300 es
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
}`;let w=null,Pr=null;{const r=o.createShader(o.VERTEX_SHADER);o.shaderSource(r,pe),o.compileShader(r);const e=o.createShader(o.FRAGMENT_SHADER);o.shaderSource(e,qi),o.compileShader(e),o.getShaderParameter(r,o.COMPILE_STATUS)&&o.getShaderParameter(e,o.COMPILE_STATUS)&&(w=o.createProgram(),o.attachShader(w,r),o.attachShader(w,e),o.linkProgram(w),o.getProgramParameter(w,o.LINK_STATUS)?Pr=o.createVertexArray():(console.warn("Deferred lit link:",o.getProgramInfoLog(w)),w=null))}const Zi=`#version 300 es
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
}`;let I=null,Ur=null;{const r=o.createShader(o.VERTEX_SHADER);o.shaderSource(r,pe),o.compileShader(r);const e=o.createShader(o.FRAGMENT_SHADER);o.shaderSource(e,Zi),o.compileShader(e),o.getShaderParameter(r,o.COMPILE_STATUS)&&o.getShaderParameter(e,o.COMPILE_STATUS)?(I=o.createProgram(),o.attachShader(I,r),o.attachShader(I,e),o.linkProgram(I),o.getProgramParameter(I,o.LINK_STATUS)?Ur=o.createVertexArray():(console.warn("Volumetric link:",o.getProgramInfoLog(I)),I=null)):console.warn("Volumetric shader compile failed")}let De=null,fe=null,Zt=0,$t=0;try{De=new cr(o,{pointScale:z.height/(2*Math.tan(Math.PI/8)),blendMode:"additive",animate:!0,intensity:1.5,chromatic:.6})}catch(r){console.warn("Particle splat renderer init failed:",r)}function $i(r,e){if(Zt===r&&$t===e&&fe)return;fe&&(o.deleteFramebuffer(fe.framebuffer),o.deleteTexture(fe.texture));const i=o.createTexture();o.bindTexture(o.TEXTURE_2D,i),o.texImage2D(o.TEXTURE_2D,0,o.RGBA8,r,e,0,o.RGBA,o.UNSIGNED_BYTE,null),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE);const t=o.createRenderbuffer();o.bindRenderbuffer(o.RENDERBUFFER,t),o.renderbufferStorage(o.RENDERBUFFER,o.DEPTH_COMPONENT24,r,e);const a=o.createFramebuffer();o.bindFramebuffer(o.FRAMEBUFFER,a),o.framebufferTexture2D(o.FRAMEBUFFER,o.COLOR_ATTACHMENT0,o.TEXTURE_2D,i,0),o.framebufferRenderbuffer(o.FRAMEBUFFER,o.DEPTH_ATTACHMENT,o.RENDERBUFFER,t),o.bindFramebuffer(o.FRAMEBUFFER,null),fe={framebuffer:a,texture:i,depthRb:t},Zt=r,$t=e}function Kt(r,e,i){const t=r.createTexture();r.bindTexture(r.TEXTURE_2D,t),r.texImage2D(r.TEXTURE_2D,0,r.RGBA8,e,i,0,r.RGBA,r.UNSIGNED_BYTE,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE);const a=r.createFramebuffer();return r.bindFramebuffer(r.FRAMEBUFFER,a),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,t,0),r.bindFramebuffer(r.FRAMEBUFFER,null),{framebuffer:a,texture:t,width:e,height:i}}let V=null,Ve=null,Qt=0,Jt=0;function Ge(r,e){Qt===r&&Jt===e||(V&&(o.deleteFramebuffer(V.framebuffer),o.deleteTexture(V.texture)),Ve&&(o.deleteFramebuffer(Ve.framebuffer),o.deleteTexture(Ve.texture)),V=Kt(o,r,e),Ve=Kt(o,r,e),Qt=r,Jt=e)}const Ki=`#version 300 es
precision highp float; in vec2 v_uv; uniform sampler2D u_texture; uniform float u_opacity; out vec4 outColor;
void main(){vec4 c=texture(u_texture,v_uv);outColor=vec4(c.rgb,c.a*u_opacity);}`;let Y=null,Lr=null;{const r=o.createShader(o.VERTEX_SHADER);o.shaderSource(r,pe),o.compileShader(r);const e=o.createShader(o.FRAGMENT_SHADER);o.shaderSource(e,Ki),o.compileShader(e),o.getShaderParameter(r,o.COMPILE_STATUS)&&o.getShaderParameter(e,o.COMPILE_STATUS)&&(Y=o.createProgram(),o.attachShader(Y,r),o.attachShader(Y,e),o.linkProgram(Y),o.getProgramParameter(Y,o.LINK_STATUS)?Lr=o.createVertexArray():Y=null)}function er(r,e=1){Y&&(o.useProgram(Y),o.bindVertexArray(Lr),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,r),o.uniform1i(o.getUniformLocation(Y,"u_texture"),0),o.uniform1f(o.getUniformLocation(Y,"u_opacity"),e),o.drawArrays(o.TRIANGLES,0,3))}const Qi=`#version 300 es
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
}`,Ji=`#version 300 es
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
}`,eo=`#version 300 es
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
}`;let Me=null,te=null,ve=null,Ye=null,H=null,be=null,xe=null,tr=0,rr=0;{let r=function(e){const i=o.createShader(o.VERTEX_SHADER);o.shaderSource(i,pe),o.compileShader(i);const t=o.createShader(o.FRAGMENT_SHADER);if(o.shaderSource(t,e),o.compileShader(t),!o.getShaderParameter(i,o.COMPILE_STATUS)||!o.getShaderParameter(t,o.COMPILE_STATUS))return console.warn("Bloom shader compile failed:",o.getShaderInfoLog(t)),null;const a=o.createProgram();return o.attachShader(a,i),o.attachShader(a,t),o.linkProgram(a),o.getProgramParameter(a,o.LINK_STATUS)?a:(console.warn("Bloom link failed"),null)};var lo=r;Me=r(Qi),te=r(Ji),ve=r(eo),Ye=o.createVertexArray()}function dt(r,e,i){const t=i?Math.floor(r/2):r,a=i?Math.floor(e/2):e,n=o.createTexture();o.bindTexture(o.TEXTURE_2D,n),o.texImage2D(o.TEXTURE_2D,0,o.RGBA16F,t,a,0,o.RGBA,o.HALF_FLOAT,null),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE);const l=o.createFramebuffer();return o.bindFramebuffer(o.FRAMEBUFFER,l),o.framebufferTexture2D(o.FRAMEBUFFER,o.COLOR_ATTACHMENT0,o.TEXTURE_2D,n,0),o.bindFramebuffer(o.FRAMEBUFFER,null),{framebuffer:l,texture:n,width:t,height:a}}function to(r,e){tr===r&&rr===e||(H&&(o.deleteFramebuffer(H.framebuffer),o.deleteTexture(H.texture)),be&&(o.deleteFramebuffer(be.framebuffer),o.deleteTexture(be.texture)),xe&&(o.deleteFramebuffer(xe.framebuffer),o.deleteTexture(xe.texture)),H=dt(r,e,!0),be=dt(r,e,!0),xe=dt(r,e,!1),tr=r,rr=e)}function ro(r,e,i){if(!Me||!te||!ve)return r;to(e,i);const t=H.width,a=H.height;o.bindFramebuffer(o.FRAMEBUFFER,H.framebuffer),o.viewport(0,0,t,a),o.useProgram(Me),o.bindVertexArray(Ye),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,r),o.uniform1i(o.getUniformLocation(Me,"u_texture"),0),o.uniform1f(o.getUniformLocation(Me,"u_threshold"),Tr),o.drawArrays(o.TRIANGLES,0,3);for(let n=0;n<3;n++)o.bindFramebuffer(o.FRAMEBUFFER,be.framebuffer),o.viewport(0,0,t,a),o.useProgram(te),o.bindVertexArray(Ye),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,H.texture),o.uniform1i(o.getUniformLocation(te,"u_texture"),0),o.uniform2f(o.getUniformLocation(te,"u_direction"),1+n*.5,0),o.uniform2f(o.getUniformLocation(te,"u_resolution"),t,a),o.drawArrays(o.TRIANGLES,0,3),o.bindFramebuffer(o.FRAMEBUFFER,H.framebuffer),o.viewport(0,0,t,a),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,be.texture),o.uniform1i(o.getUniformLocation(te,"u_texture"),0),o.uniform2f(o.getUniformLocation(te,"u_direction"),0,1+n*.5),o.drawArrays(o.TRIANGLES,0,3);return o.bindFramebuffer(o.FRAMEBUFFER,xe.framebuffer),o.viewport(0,0,e,i),o.useProgram(ve),o.bindVertexArray(Ye),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,r),o.uniform1i(o.getUniformLocation(ve,"u_scene"),0),o.activeTexture(o.TEXTURE1),o.bindTexture(o.TEXTURE_2D,H.texture),o.uniform1i(o.getUniformLocation(ve,"u_bloom"),1),o.uniform1f(o.getUniformLocation(ve,"u_bloomIntensity"),vr),o.drawArrays(o.TRIANGLES,0,3),xe.texture}const io=`#version 300 es
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
}`;let N=null,Br=null;{const r=o.createShader(o.VERTEX_SHADER);o.shaderSource(r,pe),o.compileShader(r);const e=o.createShader(o.FRAGMENT_SHADER);o.shaderSource(e,io),o.compileShader(e),o.getShaderParameter(r,o.COMPILE_STATUS)&&o.getShaderParameter(e,o.COMPILE_STATUS)?(N=o.createProgram(),o.attachShader(N,r),o.attachShader(N,e),o.linkProgram(N),o.getProgramParameter(N,o.LINK_STATUS)?Br=o.createVertexArray():(console.warn("Final pass link:",o.getProgramInfoLog(N)),N=null)):console.warn("Final pass compile failed:",o.getShaderInfoLog(e))}let ue=null,ir=0,or=0;function oo(r,e){if(ir===r&&or===e&&ue)return;ue&&(o.deleteFramebuffer(ue.framebuffer),o.deleteTexture(ue.texture),ue.depthRb&&o.deleteRenderbuffer(ue.depthRb));const i=o.createTexture();o.bindTexture(o.TEXTURE_2D,i),o.texImage2D(o.TEXTURE_2D,0,o.RGBA16F,r,e,0,o.RGBA,o.HALF_FLOAT,null),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MIN_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_MAG_FILTER,o.LINEAR),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_S,o.CLAMP_TO_EDGE),o.texParameteri(o.TEXTURE_2D,o.TEXTURE_WRAP_T,o.CLAMP_TO_EDGE);const t=o.createRenderbuffer();o.bindRenderbuffer(o.RENDERBUFFER,t),o.renderbufferStorage(o.RENDERBUFFER,o.DEPTH_COMPONENT24,r,e);const a=o.createFramebuffer();o.bindFramebuffer(o.FRAMEBUFFER,a),o.framebufferTexture2D(o.FRAMEBUFFER,o.COLOR_ATTACHMENT0,o.TEXTURE_2D,i,0),o.framebufferRenderbuffer(o.FRAMEBUFFER,o.DEPTH_ATTACHMENT,o.RENDERBUFFER,t),o.bindFramebuffer(o.FRAMEBUFFER,null),ue={framebuffer:a,texture:i,depthRb:t,width:r,height:e},ir=r,or=e}let he=null,mt=[];document.getElementById("btnScreenshot").addEventListener("click",()=>{z.toBlob(r=>{const e=document.createElement("a");e.href=URL.createObjectURL(r),e.download=`vib3-screenshot-${Date.now()}.png`,e.click(),URL.revokeObjectURL(e.href)},"image/png")});document.getElementById("btnRecord").addEventListener("click",()=>{const r=document.getElementById("btnRecord");if(he&&he.state==="recording"){he.stop(),r.classList.remove("recording"),r.innerHTML='<span class="dot red"></span>Record';return}mt=[];const e=z.captureStream(30);he=new MediaRecorder(e,{mimeType:"video/webm;codecs=vp9"}),he.ondataavailable=i=>{i.data.size>0&&mt.push(i.data)},he.onstop=()=>{const i=new Blob(mt,{type:"video/webm"}),t=document.createElement("a");t.href=URL.createObjectURL(i),t.download=`vib3-recording-${Date.now()}.webm`,t.click(),URL.revokeObjectURL(t.href)},he.start(),r.classList.add("recording"),r.innerHTML='<span class="dot red"></span>Stop'});document.getElementById("btnGIF").addEventListener("click",()=>{const r=document.getElementById("btnGIF");r.textContent="Capturing...",r.disabled=!0;let e=0;const i=60;function t(){if(e>=i){z.toBlob(a=>{const n=document.createElement("a");n.href=URL.createObjectURL(a),n.download=`vib3-gif-frame-${Date.now()}.png`,n.click(),URL.revokeObjectURL(n.href),r.textContent="GIF",r.disabled=!1},"image/png");return}e++,requestAnimationFrame(t)}requestAnimationFrame(t)});async function ao(){const r=document.getElementById("runBenchmark"),e=document.getElementById("benchResults");r.disabled=!0,r.textContent="Running...",e.innerHTML="";const i=[{name:"Mesh Only",m:!0,s:!1,p:!1,i:!1,sh:!1,pt:!1},{name:"Splat Only",m:!1,s:!0,p:!1,i:!1,sh:!1,pt:!1},{name:"Mesh + Inscription",m:!0,s:!1,p:!1,i:!0,sh:!1,pt:!1},{name:"Full Hybrid (v2)",m:!0,s:!0,p:!0,i:!0,sh:!1,pt:!1},{name:"+ Shadows (v3)",m:!0,s:!0,p:!0,i:!0,sh:!0,pt:!1},{name:"+ Particles (v3)",m:!0,s:!0,p:!0,i:!0,sh:!0,pt:!0},{name:"Full v3 Pipeline",m:!0,s:!0,p:!0,i:!0,sh:!0,pt:!0}],t=60,a=[];for(const s of i){x.meshLayer.enabled=s.m,x.splatLayer.enabled=s.s,x.proceduralLayer.enabled=s.p,x.inscriptionLayer.enabled=s.i,Re=s.sh,de=s.pt;for(let d=0;d<5;d++){const m=performance.now()*.001;x.render(m,M.viewMatrix,M.projectionMatrix,{viewProjection:M.viewProjection})}o.finish();const c=performance.now();for(let d=0;d<t;d++){const m=performance.now()*.001;x.render(m,M.viewMatrix,M.projectionMatrix,{viewProjection:M.viewProjection})}o.finish();const h=performance.now()-c,f=h/t,u=1e3/f;a.push({name:s.name,avgMs:f,fps:u}),await new Promise(d=>setTimeout(d,10))}vt(Dr);const n=Math.max(...a.map(s=>s.avgMs));let l='<div class="bench-row bench-header"><span>Configuration</span><span>ms/frame</span><span>FPS</span></div>';for(const s of a){const c=Math.round(s.avgMs/n*100),h=s.name.includes("v3");l+=`<div class="bench-row ${s.name==="Full v3 Pipeline"?"bench-total":""}"><span class="bench-label">${s.name}</span><span class="bench-value">${s.avgMs.toFixed(2)}</span><span class="bench-value">${Math.round(s.fps)}</span></div><div class="bench-bar" style="width:${c}%;${h?"background:rgba(167,139,250,0.5)":""}"></div>`}e.innerHTML=l,r.disabled=!1,r.textContent="Run Benchmark"}document.getElementById("runBenchmark").addEventListener("click",ao);let _t=0,pt=performance.now(),so=performance.now(),ar=0;const sr=document.getElementById("fps"),nr=document.getElementById("frameTime"),lr=document.getElementById("activeLayers");function no(r){const e=new Float32Array(16),i=r[0],t=r[1],a=r[2],n=r[3],l=r[4],s=r[5],c=r[6],h=r[7],f=r[8],u=r[9],d=r[10],m=r[11],E=r[12],p=r[13],v=r[14],T=r[15],_=i*s-t*l,g=i*c-a*l,b=i*h-n*l,R=t*c-a*s,S=t*h-n*s,P=a*h-n*c,B=f*p-u*E,W=f*v-d*E,le=f*T-m*E,ce=u*v-d*p,K=u*T-m*p,Q=d*T-m*v;let y=_*Q-g*K+b*ce+R*le-S*W+P*B;return y?(y=1/y,e[0]=(s*Q-c*K+h*ce)*y,e[1]=(a*K-t*Q-n*ce)*y,e[2]=(p*P-v*S+T*R)*y,e[3]=(d*S-u*P-m*R)*y,e[4]=(c*le-l*Q-h*W)*y,e[5]=(i*Q-a*le+n*W)*y,e[6]=(v*b-E*P-T*g)*y,e[7]=(f*P-d*b+m*g)*y,e[8]=(l*K-s*le+h*B)*y,e[9]=(t*le-i*K-n*B)*y,e[10]=(E*S-p*b+T*_)*y,e[11]=(u*b-f*S-m*_)*y,e[12]=(s*W-l*ce-c*B)*y,e[13]=(i*ce-t*W+a*B)*y,e[14]=(p*g-E*R-v*_)*y,e[15]=(f*R-u*g+d*_)*y,e):null}function wr(){const r=performance.now(),e=(performance.now()-so)*.001,i=Math.min(e-ar,.1);ar=e;const t=o.canvas.width,a=o.canvas.height;M.update(i,e),gt&&M._autopilot&&(M._choroElAmp=.08,M._choroElFreq=.4,M._choroDistAmp=.3,M._choroDistFreq=.25),Oi();const n={XY:e*.12,XZ:e*.08,YZ:e*.07,XW:e*.15+.3*Math.sin(e*.4),YW:e*.11+.2*Math.sin(e*.35),ZW:e*.09+.25*Math.sin(e*.5)};if(L.rot4dXY=n.XY,L.rot4dXZ=n.XZ,L.rot4dYZ=n.YZ,L.rot4dXW=n.XW,L.rot4dYW=n.YW,L.rot4dZW=n.ZW,gt&&(st+=i,st>wi&&(st=0,nt=(nt+1)%24,Ne=nt),Math.abs(Ze-Ne)>.1&&(Ze=Ne),L.geometry=Ne),qe.update(i),Te>0){const u=Te*(.5+.5*Math.sin(e*2.1)),d=Te*(.5+.5*Math.sin(e*3.7)),m=Te*(.5+.5*Math.sin(e*5.3)),E=Te*(.6+.4*Math.sin(e*1.3));qe.setAudio(u,d,m,E),L.rot4dXW+=u*.5,L.rot4dYW+=d*.3,L.rot4dZW+=m*.4}if(de&&F){F.colorStart[0]=.3+.3*Math.sin(e*.7),F.colorStart[1]=.5+.3*Math.sin(e*.9+1),F.colorStart[2]=.8+.2*Math.sin(e*1.1+2),F.colorEnd[0]=.8+.2*Math.sin(e*.5+3),F.colorEnd[1]=.2+.2*Math.sin(e*.6+4),F.colorEnd[2]=.7+.3*Math.sin(e*.8+5),F.update(Math.min(i,.05));const{buffer:u,count:d}=F.getSplatBuffer();De&&d>0&&De.updateSeeds(u,d);const m=document.getElementById("particleCount");m&&(m.textContent=F.getAliveCount())}else{const u=document.getElementById("particleCount");u&&(u.textContent="0")}oo(t,a);const l=x.render(e,M.viewMatrix,M.projectionMatrix,{viewProjection:M.viewProjection}),s=Z.gbuffer?Z.gbuffer.normalTexture:null;if(Re&&O&&s&&(Ge(t,a),o.bindFramebuffer(o.READ_FRAMEBUFFER,null),o.bindFramebuffer(o.DRAW_FRAMEBUFFER,V.framebuffer),o.blitFramebuffer(0,0,t,a,0,0,t,a,o.COLOR_BUFFER_BIT,o.NEAREST),o.bindFramebuffer(o.FRAMEBUFFER,null),o.viewport(0,0,t,a),o.disable(o.DEPTH_TEST),o.useProgram(O),o.bindVertexArray(Mr),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,V.texture),o.uniform1i(o.getUniformLocation(O,"u_sceneColor"),0),s&&(o.activeTexture(o.TEXTURE1),o.bindTexture(o.TEXTURE_2D,s),o.uniform1i(o.getUniformLocation(O,"u_normalDepth"),1)),o.uniform1f(o.getUniformLocation(O,"u_shadowIntensity"),fr),o.uniform1f(o.getUniformLocation(O,"u_shadowSoftness"),dr),o.uniform3f(o.getUniformLocation(O,"u_lightDir"),.5,.8,.3),o.drawArrays(o.TRIANGLES,0,3)),Ue&&w&&s&&(Ge(t,a),o.bindFramebuffer(o.READ_FRAMEBUFFER,null),o.bindFramebuffer(o.DRAW_FRAMEBUFFER,V.framebuffer),o.blitFramebuffer(0,0,t,a,0,0,t,a,o.COLOR_BUFFER_BIT,o.NEAREST),o.bindFramebuffer(o.FRAMEBUFFER,null),o.viewport(0,0,t,a),o.disable(o.DEPTH_TEST),o.enable(o.BLEND),o.blendFunc(o.ONE,o.ONE),o.useProgram(w),o.bindVertexArray(Pr),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,V.texture),o.uniform1i(o.getUniformLocation(w,"u_inscriptionTex"),0),o.activeTexture(o.TEXTURE1),o.bindTexture(o.TEXTURE_2D,s),o.uniform1i(o.getUniformLocation(w,"u_normalDepth"),1),o.uniform3f(o.getUniformLocation(w,"u_lightDir"),.5,.8,.3),o.uniform1f(o.getUniformLocation(w,"u_specularStrength"),pr),o.uniform1f(o.getUniformLocation(w,"u_fresnelPower"),Er),o.uniform1f(o.getUniformLocation(w,"u_time"),e),o.drawArrays(o.TRIANGLES,0,3),o.disable(o.BLEND)),de&&De&&F&&F.getAliveCount()>0&&($i(t,a),o.bindFramebuffer(o.FRAMEBUFFER,fe.framebuffer),o.viewport(0,0,t,a),De.render(M.viewProjection,e),o.bindFramebuffer(o.FRAMEBUFFER,null),o.viewport(0,0,t,a),o.enable(o.BLEND),o.blendFunc(o.ONE,o.ONE),o.disable(o.DEPTH_TEST),er(fe.texture,1),o.disable(o.BLEND)),Pe&&I){Ge(t,a),o.enable(o.BLEND),o.blendFunc(o.ONE,o.ONE),o.useProgram(I),o.bindVertexArray(Ur),s&&(o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,s),o.uniform1i(o.getUniformLocation(I,"u_normalDepth"),0)),o.uniform1f(o.getUniformLocation(I,"u_time"),e),o.uniform1f(o.getUniformLocation(I,"u_density"),mr),o.uniform1f(o.getUniformLocation(I,"u_absorption"),_r),o.uniform1f(o.getUniformLocation(I,"u_geometry"),L.geometry),o.uniform2f(o.getUniformLocation(I,"u_resolution"),t,a),o.drawArrays(o.TRIANGLES,0,3),o.disable(o.BLEND);const u=document.getElementById("volSteps");u&&(u.textContent="48")}else{const u=document.getElementById("volSteps");u&&(u.textContent="0")}if(me&&ae&&s){const u=no(M.projectionMatrix);if(u)try{const d=ae.render({colorTexture:V?V.texture:s,normalDepthTexture:s,projMatrix:M.projectionMatrix,invProjMatrix:u,viewMatrix:M.viewMatrix,width:t,height:a,time:e});d&&d.texture&&(o.bindFramebuffer(o.FRAMEBUFFER,null),o.viewport(0,0,t,a),o.enable(o.BLEND),o.blendFunc(o.ONE,o.ONE),o.disable(o.DEPTH_TEST),er(d.texture,gr),o.disable(o.BLEND))}catch{}}if(N){Ge(t,a),o.bindFramebuffer(o.READ_FRAMEBUFFER,null),o.bindFramebuffer(o.DRAW_FRAMEBUFFER,V.framebuffer),o.blitFramebuffer(0,0,t,a,0,0,t,a,o.COLOR_BUFFER_BIT,o.NEAREST);let u=V.texture;_e&&(u=ro(u,t,a)),o.bindFramebuffer(o.FRAMEBUFFER,null),o.viewport(0,0,t,a),o.disable(o.DEPTH_TEST),o.disable(o.BLEND),o.useProgram(N),o.bindVertexArray(Br),o.activeTexture(o.TEXTURE0),o.bindTexture(o.TEXTURE_2D,u),o.uniform1i(o.getUniformLocation(N,"u_texture"),0),o.uniform1f(o.getUniformLocation(N,"u_vignetteStrength"),br),o.uniform1f(o.getUniformLocation(N,"u_chromaticStrength"),xr),o.uniform2f(o.getUniformLocation(N,"u_resolution"),t,a),o.uniform1f(o.getUniformLocation(N,"u_time"),e),o.drawArrays(o.TRIANGLES,0,3)}_t++;const c=performance.now();c-pt>500&&(sr&&(sr.textContent=Math.round(_t/((c-pt)/1e3))),nr&&(nr.textContent=(c-r).toFixed(1)+" ms"),_t=0,pt=c);let h=l?l.layersComposited:0;h+=de?1:0,h+=Pe?1:0,h+=Re?1:0,h+=Ue?1:0,h+=_e?1:0,h+=me?1:0,lr&&(lr.textContent=h);const f=document.getElementById("postPasses");if(f){let u=0;_e&&u++,u++,me&&u++,f.textContent=u}requestAnimationFrame(wr)}Tt("torus");vt("showcase");wr();
