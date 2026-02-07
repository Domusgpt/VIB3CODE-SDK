const $=Object.freeze([1,0,0,0]),K=Object.freeze([1,1,1]),I=12;function X(n){const o=new Float32Array(n.length*I);return n.forEach((e,t)=>{const a=t*I,i=e.position??[0,0,0],r=e.orientation??$,c=e.color??K,l=e.scale??1,s=e.depth??0;o[a+0]=i[0]??0,o[a+1]=i[1]??0,o[a+2]=i[2]??0,o[a+3]=l,o[a+4]=r[0]??1,o[a+5]=r[1]??0,o[a+6]=r[2]??0,o[a+7]=r[3]??0,o[a+8]=c[0]??1,o[a+9]=c[1]??1,o[a+10]=c[2]??1,o[a+11]=s}),o}function Q(n,o){const e=new Float32Array(16);for(let t=0;t<4;t++)for(let a=0;a<4;a++)e[t*4+a]=n[0*4+a]*o[t*4+0]+n[1*4+a]*o[t*4+1]+n[2*4+a]*o[t*4+2]+n[3*4+a]*o[t*4+3];return e}function J(n,o,e,t){const a=1/Math.tan(n*.5),i=1/(e-t);return new Float32Array([a/o,0,0,0,0,a,0,0,0,0,(t+e)*i,-1,0,0,2*t*e*i,0])}function tt(n,o,e){let t=n[0]-o[0],a=n[1]-o[1],i=n[2]-o[2],r=Math.hypot(t,a,i)||1;t/=r,a/=r,i/=r;let c=e[1]*i-e[2]*a,l=e[2]*t-e[0]*i,s=e[0]*a-e[1]*t;r=Math.hypot(c,l,s)||1,c/=r,l/=r,s/=r;const h=a*s-i*l,f=i*c-t*s,m=t*l-a*c;return new Float32Array([c,h,t,0,l,f,a,0,s,m,i,0,-(c*n[0]+l*n[1]+s*n[2]),-(h*n[0]+f*n[1]+m*n[2]),-(t*n[0]+a*n[1]+i*n[2]),1])}const ot=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);class at{constructor({fov:o=50*Math.PI/180,aspect:e=960/640,near:t=.1,far:a=100,distance:i=5,azimuth:r=0,elevation:c=.3,target:l=[0,0,0]}={}){this.fov=o,this.aspect=e,this.near=t,this.far=a,this.distance=i,this.azimuth=r,this.elevation=c,this.target=[...l],this._vp=new Float32Array(16),this._dirty=!0}get eye(){const o=Math.cos(this.elevation);return[this.target[0]+this.distance*o*Math.sin(this.azimuth),this.target[1]+this.distance*Math.sin(this.elevation),this.target[2]+this.distance*o*Math.cos(this.azimuth)]}get viewProjection(){const o=J(this.fov,this.aspect,this.near,this.far),e=tt(this.eye,this.target,[0,1,0]);return Q(o,e)}static identity(){return new Float32Array(ot)}attachControls(o){let e=!1,t=0,a=0;o.addEventListener("pointerdown",i=>{e=!0,t=i.clientX,a=i.clientY,o.setPointerCapture(i.pointerId)}),o.addEventListener("pointermove",i=>{if(!e)return;const r=i.clientX-t,c=i.clientY-a;this.azimuth-=r*.005,this.elevation=Math.max(-1.4,Math.min(1.4,this.elevation+c*.005)),t=i.clientX,a=i.clientY}),o.addEventListener("pointerup",()=>{e=!1}),o.addEventListener("pointerleave",()=>{e=!1}),o.addEventListener("wheel",i=>{i.preventDefault(),this.distance=Math.max(1,Math.min(30,this.distance+i.deltaY*.01))},{passive:!1})}}const et=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),B=new Float32Array([0,0,0,0,1,1,1,1,8,.5,0,.4,.9,.85,1,.95,-8,-.3,0,1.2,1,.9,.85,.9,0,.8,8,2,.85,1,.9,.92,0,-.5,-8,2.8,1,.85,.95,.88,5.7,.2,5.7,3.6,.95,.95,1,.93,-5.7,-.4,5.7,4.4,1,.92,.88,.91,5.7,.6,-5.7,5.2,.88,1,.95,.94,-5.7,-.1,-5.7,.8,.92,.88,1,.89,0,2,0,1.6,.7,.7,.8,.75]),it=B.length/8,nt=8,st=`#version 300 es
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
`,rt=`#version 300 es
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
`;class ct{constructor(o,{pointScale:e=14,dimension:t=4}={}){this.gl=o,this.pointScale=e,this.intensity=1,this.animate=!0,this.blendMode="additive",this.chromatic=0,this.dimension=t,this.rotXY=0,this.rotXZ=0,this.rotYZ=0,this.rotXW=0,this.rotYW=0,this.rotZW=0,this.program=null,this.vao=null,this.splatBuffer=null,this.instanceBuffer=null,this.count=0,this.uniforms={},this._init()}_init(){const o=this.gl,e=o.createProgram(),t=this._compile(o.VERTEX_SHADER,st),a=this._compile(o.FRAGMENT_SHADER,rt);if(o.attachShader(e,t),o.attachShader(e,a),o.linkProgram(e),!o.getProgramParameter(e,o.LINK_STATUS))throw new Error(o.getProgramInfoLog(e));this.program=e,this.vao=o.createVertexArray(),o.bindVertexArray(this.vao),this.splatBuffer=o.createBuffer(),o.bindBuffer(o.ARRAY_BUFFER,this.splatBuffer);const i=I*4,r=(h,f,m)=>{const d=o.getAttribLocation(e,h);d<0||(o.enableVertexAttribArray(d),o.vertexAttribPointer(d,f,o.FLOAT,!1,i,m*4))};r("a_position",3,0),r("a_scale",1,3),r("a_orientation",4,4),r("a_color",3,8),r("a_depth",1,11),this.instanceBuffer=o.createBuffer(),o.bindBuffer(o.ARRAY_BUFFER,this.instanceBuffer),o.bufferData(o.ARRAY_BUFFER,B,o.STATIC_DRAW);const c=nt*4,l=(h,f,m)=>{const d=o.getAttribLocation(e,h);d<0||(o.enableVertexAttribArray(d),o.vertexAttribPointer(d,f,o.FLOAT,!1,c,m*4),o.vertexAttribDivisor(d,1))};l("a_instanceOffset",3,0),l("a_instanceRotY",1,3),l("a_instanceTint",3,4),l("a_instanceScale",1,7),o.bindVertexArray(null);const s=h=>o.getUniformLocation(e,h);this.uniforms={pointScale:s("u_pointScale"),viewProjection:s("u_viewProjection"),time:s("u_time"),animate:s("u_animate"),intensity:s("u_intensity"),dimension:s("u_dimension"),rotXY:s("u_rotXY"),rotXZ:s("u_rotXZ"),rotYZ:s("u_rotYZ"),rotXW:s("u_rotXW"),rotYW:s("u_rotYW"),rotZW:s("u_rotZW")}}_compile(o,e){const t=this.gl,a=t.createShader(o);if(t.shaderSource(a,e),t.compileShader(a),!t.getShaderParameter(a,t.COMPILE_STATUS))throw new Error(t.getShaderInfoLog(a));return a}updateSeeds(o,e){const t=this.gl;t.bindBuffer(t.ARRAY_BUFFER,this.splatBuffer),t.bufferData(t.ARRAY_BUFFER,o,t.DYNAMIC_DRAW),this.count=e}render(o,e=0){const t=this.gl;if(!this.count)return;t.viewport(0,0,t.canvas.width,t.canvas.height),t.clearColor(.005,.008,.025,1),t.clear(t.COLOR_BUFFER_BIT|t.DEPTH_BUFFER_BIT),t.enable(t.DEPTH_TEST),t.depthFunc(t.LEQUAL),t.depthMask(!1),t.enable(t.BLEND),t.blendFunc(t.ONE,t.ONE),t.useProgram(this.program),t.bindVertexArray(this.vao),t.uniform1f(this.uniforms.pointScale,this.pointScale),t.uniform1f(this.uniforms.time,e),t.uniform1f(this.uniforms.animate,this.animate?1:0),t.uniform1f(this.uniforms.intensity,this.intensity),t.uniform1f(this.uniforms.dimension,this.dimension);const a=e;t.uniform1f(this.uniforms.rotXY,this.rotXY+a*.02),t.uniform1f(this.uniforms.rotXZ,this.rotXZ+a*.015),t.uniform1f(this.uniforms.rotYZ,this.rotYZ+a*.01),t.uniform1f(this.uniforms.rotXW,this.rotXW+Math.sin(a*.08)*.3),t.uniform1f(this.uniforms.rotYW,this.rotYW+Math.sin(a*.06)*.25),t.uniform1f(this.uniforms.rotZW,this.rotZW+Math.sin(a*.05)*.2),t.uniformMatrix4fv(this.uniforms.viewProjection,!1,o||et),t.drawArraysInstanced(t.POINTS,0,this.count,it),t.bindVertexArray(null),t.depthMask(!0),t.disable(t.BLEND)}}const T=1.3247179572447458,u=document.getElementById("gl");u.width=window.innerWidth*devicePixelRatio;u.height=window.innerHeight*devicePixelRatio;u.style.width="100vw";u.style.height="100vh";const C=u.getContext("webgl2",{depth:!0,antialias:!1});if(!C)throw new Error("WebGL2 required");const S=new at({fov:70*Math.PI/180,distance:.1,azimuth:0,elevation:0,target:[0,0,-5],aspect:u.width/u.height,near:.01,far:100});function Z(){return u.height/(2*Math.tan(S.fov/2))}const p=new ct(C,{pointScale:Z(),dimension:4.2});p.intensity=1.4;p.animate=!0;window.addEventListener("resize",()=>{u.width=window.innerWidth*devicePixelRatio,u.height=window.innerHeight*devicePixelRatio,S.aspect=u.width/u.height,p.pointScale=Z()});let D=!1;const g=document.createElement("video");g.playsInline=!0;g.muted=!0;const v=document.createElement("canvas");v.width=128;v.height=128;const L=v.getContext("2d",{willReadFrequently:!0});async function lt(){try{const n=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:256},height:{ideal:256}}});g.srcObject=n,await g.play(),D=!0}catch(n){console.warn("Camera unavailable, using procedural",n),D=!1}}function ht(){return!D||g.readyState<2?null:(L.drawImage(g,0,0,v.width,v.height),L.getImageData(0,0,v.width,v.height))}function O(n,o){const e=[],{width:t,height:a,data:i}=n||{width:64,height:64,data:null},r=12,c=4,l=800;for(let s=0;s<r;s++){const h=Math.pow(T,-s),f=-s*2.5,m=1.5*h,d=s*(2*Math.PI/T);for(let P=0;P<c;P++){const q=P/c*Math.PI*2+d;for(let E=0;E<l/c;E++){const b=E/(l/c),A=q+b*Math.PI*.5,F=m*(.3+b*.7),j=Math.cos(A)*F,V=Math.sin(A)*F,k=f-b*.5;let w=.5,M=.5,x=.5;if(i){const y=Math.cos(A)*.5+.5,H=Math.sin(A)*.5+.5,G=Math.floor(y*(t-1)),Y=(Math.floor(H*(a-1))*t+G)*4;w=i[Y]/255,M=i[Y+1]/255,x=i[Y+2]/255}else{const y=(A+o*.2)/(Math.PI*2);w=Math.sin(y*Math.PI*2)*.5+.5,M=Math.sin(y*Math.PI*2+2.094)*.5+.5,x=Math.sin(y*Math.PI*2+4.188)*.5+.5}const R=1+(1-s/r)*.5;w*=R,M*=R,x*=R,e.push({position:[j,V,k],orientation:[1,0,0,0],scale:.04*h*(.7+Math.random()*.6),color:[Math.min(1,w),Math.min(1,M),Math.min(1,x)],depth:s*.3+Math.random()*.2})}}}for(let s=0;s<200;s++){const h=Math.random()*Math.PI*2,f=Math.random()*.15;e.push({position:[Math.cos(h)*f,Math.sin(h)*f,-r*2.5-Math.random()*2],orientation:[1,0,0,0],scale:.02+Math.random()*.03,color:[1,1,1],depth:.1})}return e}function U(){const n=[];for(let e=0;e<5e4;e++){const t=Math.random(),a=Math.random()*Math.PI*2,i=-t*35,r=.5+t*4,c=Math.cos(a)*r*(.5+Math.random()),l=Math.sin(a)*r*(.5+Math.random()),s=Math.random();let h,f,m;s<.7?(h=.2+Math.random()*.2,f=.2+Math.random()*.3,m=.5+Math.random()*.5):(h=.8+Math.random()*.2,f=.3+Math.random()*.3,m=.2+Math.random()*.2),n.push({position:[c,l,i],orientation:[1,0,0,0],scale:.01+Math.random()*.02,color:[h,f,m],depth:t*2+Math.random()})}return n}let _=[],z=0;const ft=100,mt=performance.now(),W=document.getElementById("hud");function N(){requestAnimationFrame(N);const n=performance.now(),o=(n-mt)*.001;if(n-z>ft){const t=ht(),a=O(t,o),i=U();_=[...a,...i];const r=X(_);p.updateSeeds(r,_.length),z=n}p.rotXW=Math.sin(o*.1)*.4,p.rotYW=Math.cos(o*.08)*.3,p.rotZW=Math.sin(o*.12)*.25,S.azimuth=Math.sin(o*.05)*.1,S.elevation=Math.sin(o*.07)*.05;const e=S.viewProjection;p.render(e,o),W&&(W.textContent=`${(_.length/1e3).toFixed(0)}K splats × 10 instances = ${(_.length*10/1e6).toFixed(1)}M | plastic: ${T.toFixed(4)}`)}const ut=document.getElementById("startBtn"),dt=document.getElementById("startOverlay");ut.addEventListener("click",async()=>{dt.classList.add("hidden"),await lt();const n=O(null,0),o=U();_=[...n,...o];const e=X(_);p.updateSeeds(e,_.length),requestAnimationFrame(N)});
