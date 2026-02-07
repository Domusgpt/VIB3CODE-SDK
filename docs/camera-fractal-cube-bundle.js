const J=Object.freeze([1,0,0,0]),tt=Object.freeze([1,1,1]),Y=12;function ot(i){const t=new Float32Array(i.length*Y);return i.forEach((n,o)=>{const a=o*Y,e=n.position??[0,0,0],s=n.orientation??J,r=n.color??tt,l=n.scale??1,c=n.depth??0;t[a+0]=e[0]??0,t[a+1]=e[1]??0,t[a+2]=e[2]??0,t[a+3]=l,t[a+4]=s[0]??1,t[a+5]=s[1]??0,t[a+6]=s[2]??0,t[a+7]=s[3]??0,t[a+8]=r[0]??1,t[a+9]=r[1]??1,t[a+10]=r[2]??1,t[a+11]=c}),t}function et(i,t){const n=new Float32Array(16);for(let o=0;o<4;o++)for(let a=0;a<4;a++)n[o*4+a]=i[0*4+a]*t[o*4+0]+i[1*4+a]*t[o*4+1]+i[2*4+a]*t[o*4+2]+i[3*4+a]*t[o*4+3];return n}function at(i,t,n,o){const a=1/Math.tan(i*.5),e=1/(n-o);return new Float32Array([a/t,0,0,0,0,a,0,0,0,0,(o+n)*e,-1,0,0,2*o*n*e,0])}function nt(i,t,n){let o=i[0]-t[0],a=i[1]-t[1],e=i[2]-t[2],s=Math.hypot(o,a,e)||1;o/=s,a/=s,e/=s;let r=n[1]*e-n[2]*a,l=n[2]*o-n[0]*e,c=n[0]*a-n[1]*o;s=Math.hypot(r,l,c)||1,r/=s,l/=s,c/=s;const u=a*c-e*l,m=e*r-o*c,f=o*l-a*r;return new Float32Array([r,u,o,0,l,m,a,0,c,f,e,0,-(r*i[0]+l*i[1]+c*i[2]),-(u*i[0]+m*i[1]+f*i[2]),-(o*i[0]+a*i[1]+e*i[2]),1])}const it=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);class st{constructor({fov:t=50*Math.PI/180,aspect:n=960/640,near:o=.1,far:a=100,distance:e=5,azimuth:s=0,elevation:r=.3,target:l=[0,0,0]}={}){this.fov=t,this.aspect=n,this.near=o,this.far=a,this.distance=e,this.azimuth=s,this.elevation=r,this.target=[...l],this._vp=new Float32Array(16),this._dirty=!0}get eye(){const t=Math.cos(this.elevation);return[this.target[0]+this.distance*t*Math.sin(this.azimuth),this.target[1]+this.distance*Math.sin(this.elevation),this.target[2]+this.distance*t*Math.cos(this.azimuth)]}get viewProjection(){const t=at(this.fov,this.aspect,this.near,this.far),n=nt(this.eye,this.target,[0,1,0]);return et(t,n)}static identity(){return new Float32Array(it)}attachControls(t){let n=!1,o=0,a=0;t.addEventListener("pointerdown",e=>{n=!0,o=e.clientX,a=e.clientY,t.setPointerCapture(e.pointerId)}),t.addEventListener("pointermove",e=>{if(!n)return;const s=e.clientX-o,r=e.clientY-a;this.azimuth-=s*.005,this.elevation=Math.max(-1.4,Math.min(1.4,this.elevation+r*.005)),o=e.clientX,a=e.clientY}),t.addEventListener("pointerup",()=>{n=!1}),t.addEventListener("pointerleave",()=>{n=!1}),t.addEventListener("wheel",e=>{e.preventDefault(),this.distance=Math.max(1,Math.min(30,this.distance+e.deltaY*.01))},{passive:!1})}}const rt=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),N=new Float32Array([0,0,0,0,1,1,1,1,8,.5,0,.4,.9,.85,1,.95,-8,-.3,0,1.2,1,.9,.85,.9,0,.8,8,2,.85,1,.9,.92,0,-.5,-8,2.8,1,.85,.95,.88,5.7,.2,5.7,3.6,.95,.95,1,.93,-5.7,-.4,5.7,4.4,1,.92,.88,.91,5.7,.6,-5.7,5.2,.88,1,.95,.94,-5.7,-.1,-5.7,.8,.92,.88,1,.89,0,2,0,1.6,.7,.7,.8,.75]),ct=N.length/8,lt=8,ht=`#version 300 es
precision highp float;

// Per-splat (from base buffer)
in vec3  a_position;
in float a_scale;
in vec4  a_orientation;
in vec3  a_color;
in float a_depth;

// Per-instance
in vec3  a_instanceOffset;
in float a_instanceRotY;
in vec3  a_instanceTint;
in float a_instanceScale;

// Uniforms
uniform float u_pointScale;
uniform float u_time;
uniform float u_animate;
uniform float u_intensity;
uniform mat4  u_viewProjection;

// 6D rotation angles (radians)
uniform float u_rotXY;
uniform float u_rotXZ;
uniform float u_rotYZ;
uniform float u_rotXW;
uniform float u_rotYW;
uniform float u_rotZW;
uniform float u_dimension; // 4D projection distance (3.0–5.0)

flat out vec3  v_color;
flat out float v_depth;
flat out vec2  v_axisU;
flat out vec2  v_axisV;
flat out float v_hash;
flat out float v_bloom;
flat out float v_anamorphic; // horizontal streak energy

/* --- 4D rotation matrices --- */
mat4 rotXY(float a) { float c=cos(a),s=sin(a); return mat4(c,-s,0,0, s,c,0,0, 0,0,1,0, 0,0,0,1); }
mat4 rotXZ(float a) { float c=cos(a),s=sin(a); return mat4(c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1); }
mat4 rotYZ(float a) { float c=cos(a),s=sin(a); return mat4(1,0,0,0, 0,c,-s,0, 0,s,c,0, 0,0,0,1); }
mat4 rotXW(float a) { float c=cos(a),s=sin(a); return mat4(c,0,0,-s, 0,1,0,0, 0,0,1,0, s,0,0,c); }
mat4 rotYW(float a) { float c=cos(a),s=sin(a); return mat4(1,0,0,0, 0,c,0,-s, 0,0,1,0, 0,s,0,c); }
mat4 rotZW(float a) { float c=cos(a),s=sin(a); return mat4(1,0,0,0, 0,1,0,0, 0,0,c,-s, 0,0,s,c); }

void main() {
    // Per-splat hash
    float h1 = fract(sin(dot(a_position.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float h2 = fract(sin(dot(a_position.yz, vec2(45.164, 93.721))) * 23456.789);
    float h3 = fract(sin(dot(a_position.xz, vec2(63.7264, 10.873))) * 65432.123);
    v_hash = h1;

    // --- GPU animation ---
    float animAmp = a_depth * u_animate * 0.05;
    float animSpd = 0.3 + h1 * 0.5;
    float breathe = sin(u_time * 0.12 + h3 * 6.2832) * 0.015 * u_animate;

    vec3 localPos = a_position + vec3(
        sin(u_time * animSpd + h1 * 6.2832) * animAmp,
        cos(u_time * animSpd * 0.7 + h2 * 6.2832) * animAmp * 0.35 + breathe,
        cos(u_time * animSpd + h1 * 6.2832) * animAmp
    );

    // --- Per-instance Y rotation ---
    float cy = cos(a_instanceRotY), sy = sin(a_instanceRotY);
    vec3 rotatedPos = vec3(
        localPos.x * cy + localPos.z * sy,
        localPos.y,
        -localPos.x * sy + localPos.z * cy
    );

    // --- Per-instance offset + scale ---
    vec3 worldPos = rotatedPos * a_instanceScale + a_instanceOffset;

    // --- 4D hyperspace rotation ---
    // Lift 3D position into 4D (w = 0), apply 6D rotation, project back
    vec4 p4 = vec4(worldPos, 0.0);
    mat4 rot4D = rotXY(u_rotXY) * rotXZ(u_rotXZ) * rotYZ(u_rotYZ)
               * rotXW(u_rotXW) * rotYW(u_rotYW) * rotZW(u_rotZW);
    p4 = rot4D * p4;

    // 4D perspective projection: xyz / (dimension - w)
    float projFactor = 1.0 / (u_dimension - p4.w);
    vec3 projected = p4.xyz * projFactor;

    vec4 clipPos = u_viewProjection * vec4(projected, 1.0);
    gl_Position = clipPos;

    // --- Point size ---
    float projDist = max(0.5, clipPos.w);
    float pulse = 1.0 + sin(u_time * 1.2 + h1 * 6.2832) * 0.10 * min(1.0, a_depth) * u_animate;
    float intensityBoost = 1.0 + (u_intensity - 1.0) * 0.12;
    float depthFade = 1.0 / (1.0 + a_depth * 0.12 * (1.0 - u_animate));
    float sizeScale = a_scale * a_instanceScale * pulse * intensityBoost * u_pointScale * depthFade;
    gl_PointSize = clamp(sizeScale / projDist, 1.0, 2048.0);

    // --- Bloom + anamorphic energy ---
    float luminance = dot(a_color * a_instanceTint, vec3(0.2126, 0.7152, 0.0722));
    v_bloom = smoothstep(0.4, 0.9, luminance) * u_intensity;
    v_anamorphic = smoothstep(0.6, 1.0, luminance) * u_intensity * 0.4;

    // --- Quaternion → ellipse ---
    float qw = a_orientation.x, qx = a_orientation.y;
    float qy = a_orientation.z, qz = a_orientation.w;
    float sinA = 2.0 * (qw * qz + qx * qy);
    float cosA = 1.0 - 2.0 * (qy * qy + qz * qz);
    float invLen = inversesqrt(max(1e-12, sinA * sinA + cosA * cosA));
    sinA *= invLen; cosA *= invLen;
    float tilt = abs(2.0 * (qw * qx + qy * qz));
    float aspect = 1.0 + tilt * 0.6;
    v_axisU = vec2(cosA, sinA) * aspect;
    v_axisV = vec2(-sinA, cosA);

    // --- Color with instance tint ---
    v_color = a_color * a_instanceTint;
    v_depth = a_depth;
}
`,ft=`#version 300 es
precision highp float;

flat in vec3  v_color;
flat in float v_depth;
flat in vec2  v_axisU;
flat in vec2  v_axisV;
flat in float v_hash;
flat in float v_bloom;
flat in float v_anamorphic;

uniform float u_time;
uniform float u_animate;
uniform float u_intensity;

out vec4 outColor;

// ACES filmic tone mapping
vec3 acesToneMap(vec3 x) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float u = dot(d, v_axisU);
    float v = dot(d, v_axisV);

    // Core Gaussian
    float r2 = u * u + v * v;
    float sigma = 0.19;
    float gauss = exp(-0.5 * r2 / (sigma * sigma));

    // HDR bloom (wider)
    float bloomSigma = 0.34;
    float bloomGauss = exp(-0.5 * r2 / (bloomSigma * bloomSigma));
    float bloomE = v_bloom * 0.35;

    // Anamorphic horizontal streak
    float streakSigma = 0.08;
    float hStreak = exp(-0.5 * (d.y * d.y) / (streakSigma * streakSigma))
                  * exp(-0.5 * (d.x * d.x) / (0.45 * 0.45));
    float anamorphicE = hStreak * v_anamorphic;

    // Multi-frequency twinkle
    float tw1 = sin(u_time * 2.5 + v_hash * 6.2832) * 0.5 + 0.5;
    float tw2 = sin(u_time * 5.7 + v_hash * 3.1416) * 0.5 + 0.5;
    float tw3 = sin(u_time * 0.7 + v_hash * 1.5708) * 0.5 + 0.5;
    float twinkle = mix(1.0,
        0.65 + 0.35 * (tw1 * 0.5 + tw2 * 0.3 + tw3 * 0.2),
        u_animate * min(1.0, v_depth));
    float depthAlpha = 1.0 / (1.0 + v_depth * 0.20 * (1.0 - u_animate));

    // Combine layers
    float coreAlpha = gauss * depthAlpha * twinkle;
    float totalAlpha = coreAlpha + bloomGauss * bloomE + anamorphicE;
    if (totalAlpha < 0.002) discard;

    // Chromatic shift on bloom
    vec3 color = v_color;
    float chrShift = v_bloom * 0.02;
    if (chrShift > 0.001) {
        float rOff = exp(-0.5*((u-chrShift)*(u-chrShift)+v*v)/(bloomSigma*bloomSigma));
        float bOff = exp(-0.5*((u+chrShift)*(u+chrShift)+v*v)/(bloomSigma*bloomSigma));
        color.r += rOff * bloomE * 0.35;
        color.b += bOff * bloomE * 0.35;
    }

    // Anamorphic tint (slightly blue)
    color += vec3(0.15, 0.18, 0.35) * anamorphicE;

    // Aurora shimmer: depth-driven hue shift over time
    float auroraPhase = u_time * 0.4 + v_hash * 6.2832 + v_depth * 2.0;
    vec3 aurora = vec3(
        sin(auroraPhase) * 0.5 + 0.5,
        sin(auroraPhase + 2.094) * 0.5 + 0.5,
        sin(auroraPhase + 4.189) * 0.5 + 0.5
    );
    color = mix(color, color * aurora, u_animate * 0.15 * v_depth);

    // Intensity boost
    color *= (0.4 + u_intensity * 0.6);

    // ACES tone mapping (HDR → SDR)
    color = acesToneMap(color * 1.4);

    outColor = vec4(color * totalAlpha, totalAlpha);
}
`;class ut{constructor(t,{pointScale:n=14,dimension:o=4}={}){this.gl=t,this.pointScale=n,this.intensity=1,this.animate=!0,this.blendMode="additive",this.chromatic=0,this.dimension=o,this.rotXY=0,this.rotXZ=0,this.rotYZ=0,this.rotXW=0,this.rotYW=0,this.rotZW=0,this.program=null,this.vao=null,this.splatBuffer=null,this.instanceBuffer=null,this.count=0,this.uniforms={},this._init()}_init(){const t=this.gl,n=t.createProgram(),o=this._compile(t.VERTEX_SHADER,ht),a=this._compile(t.FRAGMENT_SHADER,ft);if(t.attachShader(n,o),t.attachShader(n,a),t.linkProgram(n),!t.getProgramParameter(n,t.LINK_STATUS))throw new Error(t.getProgramInfoLog(n));this.program=n,this.vao=t.createVertexArray(),t.bindVertexArray(this.vao),this.splatBuffer=t.createBuffer(),t.bindBuffer(t.ARRAY_BUFFER,this.splatBuffer);const e=Y*4,s=(u,m,f)=>{const h=t.getAttribLocation(n,u);h<0||(t.enableVertexAttribArray(h),t.vertexAttribPointer(h,m,t.FLOAT,!1,e,f*4))};s("a_position",3,0),s("a_scale",1,3),s("a_orientation",4,4),s("a_color",3,8),s("a_depth",1,11),this.instanceBuffer=t.createBuffer(),t.bindBuffer(t.ARRAY_BUFFER,this.instanceBuffer),t.bufferData(t.ARRAY_BUFFER,N,t.STATIC_DRAW);const r=lt*4,l=(u,m,f)=>{const h=t.getAttribLocation(n,u);h<0||(t.enableVertexAttribArray(h),t.vertexAttribPointer(h,m,t.FLOAT,!1,r,f*4),t.vertexAttribDivisor(h,1))};l("a_instanceOffset",3,0),l("a_instanceRotY",1,3),l("a_instanceTint",3,4),l("a_instanceScale",1,7),t.bindVertexArray(null);const c=u=>t.getUniformLocation(n,u);this.uniforms={pointScale:c("u_pointScale"),viewProjection:c("u_viewProjection"),time:c("u_time"),animate:c("u_animate"),intensity:c("u_intensity"),dimension:c("u_dimension"),rotXY:c("u_rotXY"),rotXZ:c("u_rotXZ"),rotYZ:c("u_rotYZ"),rotXW:c("u_rotXW"),rotYW:c("u_rotYW"),rotZW:c("u_rotZW")}}_compile(t,n){const o=this.gl,a=o.createShader(t);if(o.shaderSource(a,n),o.compileShader(a),!o.getShaderParameter(a,o.COMPILE_STATUS))throw new Error(o.getShaderInfoLog(a));return a}updateSeeds(t,n){const o=this.gl;o.bindBuffer(o.ARRAY_BUFFER,this.splatBuffer),o.bufferData(o.ARRAY_BUFFER,t,o.DYNAMIC_DRAW),this.count=n}render(t,n=0){const o=this.gl;if(!this.count)return;o.viewport(0,0,o.canvas.width,o.canvas.height),o.clearColor(.005,.008,.025,1),o.clear(o.COLOR_BUFFER_BIT|o.DEPTH_BUFFER_BIT),o.enable(o.DEPTH_TEST),o.depthFunc(o.LEQUAL),o.depthMask(!1),o.enable(o.BLEND),o.blendFunc(o.ONE,o.ONE),o.useProgram(this.program),o.bindVertexArray(this.vao),o.uniform1f(this.uniforms.pointScale,this.pointScale),o.uniform1f(this.uniforms.time,n),o.uniform1f(this.uniforms.animate,this.animate?1:0),o.uniform1f(this.uniforms.intensity,this.intensity),o.uniform1f(this.uniforms.dimension,this.dimension);const a=n;o.uniform1f(this.uniforms.rotXY,this.rotXY+a*.02),o.uniform1f(this.uniforms.rotXZ,this.rotXZ+a*.015),o.uniform1f(this.uniforms.rotYZ,this.rotYZ+a*.01),o.uniform1f(this.uniforms.rotXW,this.rotXW+Math.sin(a*.08)*.3),o.uniform1f(this.uniforms.rotYW,this.rotYW+Math.sin(a*.06)*.25),o.uniform1f(this.uniforms.rotZW,this.rotZW+Math.sin(a*.05)*.2),o.uniformMatrix4fv(this.uniforms.viewProjection,!1,t||rt),o.drawArraysInstanced(o.POINTS,0,this.count,ct),o.bindVertexArray(null),o.depthMask(!0),o.disable(o.BLEND)}}const U=1.3247179572447458,p=document.getElementById("gl");p.width=window.innerWidth*devicePixelRatio;p.height=window.innerHeight*devicePixelRatio;p.style.width="100vw";p.style.height="100vh";const k=p.getContext("webgl2",{depth:!0,antialias:!1});if(!k)throw new Error("WebGL2 required");const b=new st({fov:60*Math.PI/180,distance:3,azimuth:0,elevation:0,target:[0,0,-8],aspect:p.width/p.height,near:.01,far:150});function V(){return p.height/(2*Math.tan(b.fov/2))}const _=new ut(k,{pointScale:V(),dimension:4});_.intensity=1.3;_.animate=!0;window.addEventListener("resize",()=>{p.width=window.innerWidth*devicePixelRatio,p.height=window.innerHeight*devicePixelRatio,b.aspect=p.width/p.height,_.pointScale=V()});let P=null,g=null,y=new Uint8Array(128),R=!1;async function mt(){try{P=new(window.AudioContext||window.webkitAudioContext);const i=await navigator.mediaDevices.getUserMedia({audio:!0}),t=P.createMediaStreamSource(i);g=P.createAnalyser(),g.fftSize=256,g.smoothingTimeConstant=.8,t.connect(g),y=new Uint8Array(g.frequencyBinCount),R=!0}catch(i){console.warn("Audio unavailable:",i),R=!1}}function dt(){if(!R||!g)return{bass:0,mid:0,high:0,energy:0};g.getByteFrequencyData(y);const i=y.length;let t=0,n=0,o=0;for(let e=0;e<i*.15;e++)t+=y[e];for(let e=Math.floor(i*.15);e<i*.5;e++)n+=y[e];for(let e=Math.floor(i*.5);e<i;e++)o+=y[e];t=t/(i*.15)/255,n=n/(i*.35)/255,o=o/(i*.5)/255;const a=(t+n+o)/3;return{bass:t,mid:n,high:o,energy:a}}let T=!1;const w=document.createElement("video");w.playsInline=!0;w.muted=!0;const A=96,F=document.createElement("canvas");F.width=A;F.height=A;const O=F.getContext("2d",{willReadFrequently:!0});async function pt(){try{const i=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:320},height:{ideal:320}}});w.srcObject=i,await w.play(),T=!0}catch(i){console.warn("Camera unavailable:",i),T=!1}}function _t(i,t,n){const o=new Float32Array(t*n);for(let a=0;a<t*n;a++){const e=i[a*4]/255,s=i[a*4+1]/255,r=i[a*4+2]/255;o[a]=.2126*e+.7152*s+.0722*r}return o}function vt(i,t,n,o,a){const e=(l,c)=>{const u=Math.min(t-1,Math.max(0,o+l)),m=Math.min(n-1,Math.max(0,a+c));return i[m*t+u]},s=-e(-1,-1)+e(1,-1)-2*e(-1,0)+2*e(1,0)-e(-1,1)+e(1,1),r=-e(-1,-1)-2*e(0,-1)-e(1,-1)+e(-1,1)+2*e(0,1)+e(1,1);return Math.sqrt(s*s+r*r)}function gt(i,t,n){const o=[];if(!i)return o;const{width:a,height:e,data:s}=i,r=_t(s,a,e),l=a/e,c=d=>(d/a-.5)*2*l,u=d=>-(d/e-.5)*2,m=1+t.bass*.4,f=t.mid*.3,h=2;for(let d=0;d<e;d+=h)for(let v=0;v<a;v+=h){const S=(d*a+v)*4,x=s[S]/255,E=s[S+1]/255,M=s[S+2]/255,D=r[d*a+v],I=vt(r,a,e,v,d),z=I>.15,G=z?3:1,C=(1-D)*2;for(let L=0;L<G;L++){const W=z?.02:.01,$=(Math.random()-.5)*W,K=(Math.random()-.5)*W,Q=(Math.random()-.5)*.1;let X=x,B=E,Z=M;f>.1&&(X=x*(1-f)+(Math.sin(n+x*6.28)*.5+.5)*f,B=E*(1-f)+(Math.sin(n+E*6.28+2.09)*.5+.5)*f,Z=M*(1-f)+(Math.sin(n+M*6.28+4.18)*.5+.5)*f),o.push({position:[c(v)+$,u(d)+K,C+Q],orientation:[1,0,0,0],scale:(.025+I*.02+D*.015)*m,color:[X,B,Z],depth:C*.2+t.high*.5})}}return o}function yt(i,t,n){const o=[];for(let e=0;e<8;e++){const s=Math.pow(U,-e),r=-e*4,l=e*(Math.PI*2/U),c=Math.pow(.85,e),u=1+Math.sin(n*2+e)*t.bass*.2,m=Math.cos(l),f=Math.sin(l);for(const h of i){const d=h.position[0]*m-h.position[1]*f,v=h.position[0]*f+h.position[1]*m,S=h.position[2]+r;o.push({position:[d*s*u,v*s*u,S],orientation:h.orientation,scale:h.scale*s*u,color:[h.color[0]*c,h.color[1]*c,h.color[2]*c],depth:h.depth+e*.5})}}return o}function At(i){const t=[],o=1+i.energy*2;for(let a=0;a<2e4;a++){const e=Math.random(),s=Math.random()*Math.PI*2,r=-e*40,l=.8+e*5,c=Math.cos(s)*l*(.3+Math.random()*.7),u=Math.sin(s)*l*(.3+Math.random()*.7),m=Math.random()+i.mid*.5,f=.15+Math.sin(m*6.28)*.15+i.bass*.2,h=.15+Math.sin(m*6.28+2.09)*.15,d=.4+Math.sin(m*6.28+4.18)*.3+i.high*.2;t.push({position:[c,u,r],orientation:[1,0,0,0],scale:(.008+Math.random()*.015)*o,color:[f,h,d],depth:e*2})}return t}let q=0;const wt=80,St=performance.now(),j=document.getElementById("hud");function H(){requestAnimationFrame(H);const i=performance.now(),t=(i-St)*.001,n=dt();if(i-q>wt){let o=null;T&&w.readyState>=2&&(O.drawImage(w,0,0,A,A),o=O.getImageData(0,0,A,A));const a=gt(o,n,t),e=yt(a,n,t),s=At(n),r=[...e,...s];if(r.length>0){const l=ot(r);_.updateSeeds(l,r.length)}if(q=i,j){const l=r.length*10;j.textContent=`${(l/1e3).toFixed(0)}K splats | bass:${(n.bass*100).toFixed(0)} mid:${(n.mid*100).toFixed(0)} high:${(n.high*100).toFixed(0)}`}}_.rotXW=Math.sin(t*.08)*.3+n.bass*.2,_.rotYW=Math.cos(t*.06)*.25+n.mid*.15,_.rotZW=Math.sin(t*.1)*.2+n.high*.1,_.intensity=1.2+n.energy*.5,b.azimuth=Math.sin(t*.03)*.08,b.elevation=Math.sin(t*.05)*.04,_.render(b.viewProjection,t)}document.getElementById("startBtn").addEventListener("click",async()=>{document.getElementById("startOverlay").classList.add("hidden"),await Promise.all([pt(),mt()]),requestAnimationFrame(H)});
