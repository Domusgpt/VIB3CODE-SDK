const _=document.getElementById("gl");_.width=window.innerWidth*devicePixelRatio;_.height=window.innerHeight*devicePixelRatio;_.style.width="100vw";_.style.height="100vh";const t=_.getContext("webgl2",{depth:!0,antialias:!0,alpha:!1,premultipliedAlpha:!1});if(!t)throw new Error("WebGL2 required");const bt=`#version 300 es
precision highp float;

// Per-vertex
in vec3 a_position;
in vec2 a_uv;
in vec3 a_normal;

// Per-instance
in mat4 a_model;
in float a_brightness;
in float a_hueShift;
in float a_wCoord;  // W coordinate for 4D

uniform mat4 u_viewProj;
uniform float u_time;

// 4D rotation uniforms
uniform float u_rotXW;
uniform float u_rotYW;
uniform float u_rotZW;
uniform float u_dimension;

out vec2 v_uv;
out vec3 v_normal;
out float v_brightness;
out float v_hueShift;
out float v_depth;
out float v_4dDepth;

// 4D to 3D projection
vec3 project4Dto3D(vec4 p4d, float dim) {
  float w = p4d.w + dim;
  return p4d.xyz / max(w, 0.1);
}

void main() {
  // Get world position from model matrix
  vec4 worldPos = a_model * vec4(a_position, 1.0);

  // Create 4D position
  vec4 pos4D = vec4(worldPos.xyz, a_wCoord);

  // Apply 4D rotations (XW, YW, ZW planes)
  // Rotate XW
  float cxw = cos(u_rotXW), sxw = sin(u_rotXW);
  vec4 p1 = vec4(
    pos4D.x * cxw - pos4D.w * sxw,
    pos4D.y,
    pos4D.z,
    pos4D.x * sxw + pos4D.w * cxw
  );

  // Rotate YW
  float cyw = cos(u_rotYW), syw = sin(u_rotYW);
  vec4 p2 = vec4(
    p1.x,
    p1.y * cyw - p1.w * syw,
    p1.z,
    p1.y * syw + p1.w * cyw
  );

  // Rotate ZW
  float czw = cos(u_rotZW), szw = sin(u_rotZW);
  vec4 p3 = vec4(
    p2.x,
    p2.y,
    p2.z * czw - p2.w * szw,
    p2.z * szw + p2.w * czw
  );

  // Project 4D to 3D
  vec3 projected = project4Dto3D(p3, u_dimension);

  gl_Position = u_viewProj * vec4(projected, 1.0);
  v_uv = a_uv;
  v_normal = mat3(a_model) * a_normal;
  v_brightness = a_brightness;
  v_hueShift = a_hueShift;
  v_depth = -projected.z * 0.015;
  v_4dDepth = p3.w * 0.1; // W-depth for effects
}
`,At=`#version 300 es
precision highp float;

in vec2 v_uv;
in vec3 v_normal;
in float v_brightness;
in float v_hueShift;
in float v_depth;
in float v_4dDepth;

uniform sampler2D u_cameraTexture;
uniform float u_time;
uniform float u_bass;
uniform float u_energy;
uniform float u_glitch;
uniform float u_moireScale;

out vec4 fragColor;

vec3 hueShift(vec3 color, float shift) {
  float angle = shift * 6.28318;
  float s = sin(angle);
  float c = cos(angle);
  vec3 weights = vec3(0.57735);
  return vec3(
    dot(color, weights + c * (vec3(1.0, 0.0, 0.0) - weights) + s * vec3(0.0, -0.57735, 0.57735)),
    dot(color, weights + c * (vec3(0.0, 1.0, 0.0) - weights) + s * vec3(0.57735, 0.0, -0.57735)),
    dot(color, weights + c * (vec3(0.0, 0.0, 1.0) - weights) + s * vec3(-0.57735, 0.57735, 0.0))
  );
}

// Moiré pattern
float moire(vec2 uv, float scale1, float scale2) {
  float p1 = sin(uv.x * scale1 * 50.0) * sin(uv.y * scale1 * 50.0);
  float p2 = sin(uv.x * scale2 * 50.0) * sin(uv.y * scale2 * 50.0);
  return abs(p1 - p2);
}

void main() {
  vec2 uv = v_uv;

  // Glitch effect - RGB split
  float glitchAmount = u_glitch * 0.02;
  vec2 rOffset = vec2(glitchAmount, 0.0);
  vec2 bOffset = vec2(-glitchAmount, 0.0);

  float r = texture(u_cameraTexture, uv + rOffset).r;
  float g = texture(u_cameraTexture, uv).g;
  float b = texture(u_cameraTexture, uv + bOffset).b;
  vec3 camColor = vec3(r, g, b);

  // Moiré overlay based on 4D depth
  float moireEffect = moire(uv, 1.0, u_moireScale) * 0.15;
  moireEffect *= (0.5 + abs(v_4dDepth));

  // Apply hue shift from audio mid + 4D position
  float totalHueShift = v_hueShift + v_4dDepth * 0.1;
  if (abs(totalHueShift) > 0.01) {
    camColor = hueShift(camColor, totalHueShift);
  }

  // Add moiré color tint
  vec3 moireColor = vec3(0.0, 0.8, 1.0) * moireEffect;
  camColor = mix(camColor, camColor + moireColor, 0.3);

  // Simple lighting
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.8));
  float diffuse = max(dot(normalize(v_normal), lightDir), 0.0);
  float ambient = 0.35;
  float light = ambient + diffuse * 0.65;

  // Bass-reactive glow + 4D depth effect
  float glow = 1.0 + u_bass * 0.6;
  float depthGlow = 1.0 + abs(v_4dDepth) * 0.3;

  // Apply lighting and brightness
  vec3 color = camColor * light * v_brightness * glow * depthGlow;

  // Edge glow effect (stronger when emerging from 4D)
  float edgeFactor = 1.0 - abs(dot(normalize(v_normal), vec3(0.0, 0.0, 1.0)));
  vec3 edgeColor = mix(vec3(0.0, 1.0, 1.0), vec3(1.0, 0.0, 1.0), 0.5 + v_4dDepth * 0.5);
  color += edgeColor * pow(edgeFactor, 2.5) * (0.3 + u_energy * 0.5);

  // Depth fog toward black
  color = mix(color, vec3(0.0), clamp(v_depth, 0.0, 0.92));

  fragColor = vec4(color, 1.0);
}
`,xt=`#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.999, 1.0);
}
`,yt=`#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform float u_time;
uniform vec2 u_resolution;
uniform float u_rotX;
uniform float u_rotY;
uniform float u_rotXW;
uniform float u_rotYW;
uniform float u_rotZW;
uniform float u_dimension;
uniform float u_bass;
uniform float u_mid;
uniform float u_gridDensity;
uniform float u_moireScale;

// 4D rotation matrices
mat4 rotateXW(float t) {
  float c = cos(t), s = sin(t);
  return mat4(c,0,0,-s, 0,1,0,0, 0,0,1,0, s,0,0,c);
}
mat4 rotateYW(float t) {
  float c = cos(t), s = sin(t);
  return mat4(1,0,0,0, 0,c,0,-s, 0,0,1,0, 0,s,0,c);
}
mat4 rotateZW(float t) {
  float c = cos(t), s = sin(t);
  return mat4(1,0,0,0, 0,1,0,0, 0,0,c,-s, 0,0,s,c);
}

vec3 project4Dto3D(vec4 p, float d) {
  return p.xyz / max(p.w + d, 0.1);
}

float hypercubeLattice(vec3 p, float morph, float grid) {
  vec4 p4d = vec4(p * grid, morph * u_dimension);

  p4d = rotateXW(u_rotXW * u_dimension) * p4d;
  p4d = rotateYW(u_rotYW * u_dimension) * p4d;
  p4d = rotateZW(u_rotZW * u_dimension) * p4d;

  vec4 lattice = fract(p4d) - 0.5;
  float dist = max(max(abs(lattice.x), abs(lattice.y)),
                   max(abs(lattice.z), abs(lattice.w)));

  return 1.0 - smoothstep(0.4, 0.5, dist);
}

float generateMoire(vec3 p, float morph, float grid) {
  float g1 = hypercubeLattice(p, morph, grid);
  float g2 = hypercubeLattice(p, morph, grid * u_moireScale);

  float r4d = length(vec4(p, morph * u_dimension));
  float s1 = sin(r4d * grid * 3.14159);
  float s2 = sin(r4d * grid * u_moireScale * 3.14159);
  float spherical = abs(s1 - s2) * 0.25;

  return abs(g1 - g2) * 0.4 + spherical;
}

void main() {
  vec2 uv = (v_uv - 0.5) * 2.0;
  uv.x *= u_resolution.x / u_resolution.y;

  vec3 rayDir = normalize(vec3(uv, 1.0));

  float morph = u_bass * 0.8;
  float lattice = hypercubeLattice(rayDir, morph, u_gridDensity);
  float moire = generateMoire(rayDir, morph, u_gridDensity);

  float combined = lattice + moire * 0.5;

  vec3 c1 = vec3(0.0, 0.4, 0.6);
  vec3 c2 = vec3(0.4, 0.0, 0.5);
  vec3 c3 = vec3(0.1, 0.1, 0.2);

  vec3 color = mix(mix(c1, c2, combined), c3, 1.0 - moire);
  color *= 0.3 + combined * 0.4;
  color *= 0.5 + u_bass * 0.3 + u_mid * 0.2;

  fragColor = vec4(color * 0.6, 1.0);
}
`,Mt=`#version 300 es
precision highp float;

in vec3 a_position;
in vec3 a_color;
in float a_size;

uniform mat4 u_viewProj;
uniform float u_pointScale;

out vec3 v_color;

void main() {
  vec4 pos = u_viewProj * vec4(a_position, 1.0);
  gl_Position = pos;
  gl_PointSize = clamp(a_size * u_pointScale / pos.w, 1.0, 64.0);
  v_color = a_color;
}
`,Et=`#version 300 es
precision highp float;

in vec3 v_color;
out vec4 fragColor;

void main() {
  vec2 cxy = 2.0 * gl_PointCoord - 1.0;
  float r = dot(cxy, cxy);
  if (r > 1.0) discard;
  float alpha = exp(-r * 3.0);
  fragColor = vec4(v_color * alpha, alpha);
}
`;function tt(e,a){const r=t.createShader(e);return t.shaderSource(r,a),t.compileShader(r),t.getShaderParameter(r,t.COMPILE_STATUS)?r:(console.error(t.getShaderInfoLog(r)),null)}function $(e,a){const r=tt(t.VERTEX_SHADER,e),s=tt(t.FRAGMENT_SHADER,a),n=t.createProgram();return t.attachShader(n,r),t.attachShader(n,s),t.linkProgram(n),t.getProgramParameter(n,t.LINK_STATUS)||console.error(t.getProgramInfoLog(n)),n}const v=$(bt,At),w=$(xt,yt),R=$(Mt,Et),f={a_position:t.getAttribLocation(v,"a_position"),a_uv:t.getAttribLocation(v,"a_uv"),a_normal:t.getAttribLocation(v,"a_normal"),a_model:t.getAttribLocation(v,"a_model"),a_brightness:t.getAttribLocation(v,"a_brightness"),a_hueShift:t.getAttribLocation(v,"a_hueShift"),a_wCoord:t.getAttribLocation(v,"a_wCoord"),u_viewProj:t.getUniformLocation(v,"u_viewProj"),u_cameraTexture:t.getUniformLocation(v,"u_cameraTexture"),u_time:t.getUniformLocation(v,"u_time"),u_bass:t.getUniformLocation(v,"u_bass"),u_energy:t.getUniformLocation(v,"u_energy"),u_glitch:t.getUniformLocation(v,"u_glitch"),u_moireScale:t.getUniformLocation(v,"u_moireScale"),u_rotXW:t.getUniformLocation(v,"u_rotXW"),u_rotYW:t.getUniformLocation(v,"u_rotYW"),u_rotZW:t.getUniformLocation(v,"u_rotZW"),u_dimension:t.getUniformLocation(v,"u_dimension")},b={a_position:t.getAttribLocation(w,"a_position"),u_time:t.getUniformLocation(w,"u_time"),u_resolution:t.getUniformLocation(w,"u_resolution"),u_rotX:t.getUniformLocation(w,"u_rotX"),u_rotY:t.getUniformLocation(w,"u_rotY"),u_rotXW:t.getUniformLocation(w,"u_rotXW"),u_rotYW:t.getUniformLocation(w,"u_rotYW"),u_rotZW:t.getUniformLocation(w,"u_rotZW"),u_dimension:t.getUniformLocation(w,"u_dimension"),u_bass:t.getUniformLocation(w,"u_bass"),u_mid:t.getUniformLocation(w,"u_mid"),u_gridDensity:t.getUniformLocation(w,"u_gridDensity"),u_moireScale:t.getUniformLocation(w,"u_moireScale")},E={a_position:t.getAttribLocation(R,"a_position"),a_color:t.getAttribLocation(R,"a_color"),a_size:t.getAttribLocation(R,"a_size"),u_viewProj:t.getUniformLocation(R,"u_viewProj"),u_pointScale:t.getUniformLocation(R,"u_pointScale")},Dt=new Float32Array([-.5,-.5,.5,0,0,0,0,1,.5,-.5,.5,1,0,0,0,1,.5,.5,.5,1,1,0,0,1,-.5,.5,.5,0,1,0,0,1,.5,-.5,-.5,0,0,0,0,-1,-.5,-.5,-.5,1,0,0,0,-1,-.5,.5,-.5,1,1,0,0,-1,.5,.5,-.5,0,1,0,0,-1,-.5,.5,.5,0,0,0,1,0,.5,.5,.5,1,0,0,1,0,.5,.5,-.5,1,1,0,1,0,-.5,.5,-.5,0,1,0,1,0,-.5,-.5,-.5,0,0,0,-1,0,.5,-.5,-.5,1,0,0,-1,0,.5,-.5,.5,1,1,0,-1,0,-.5,-.5,.5,0,1,0,-1,0,.5,-.5,.5,0,0,1,0,0,.5,-.5,-.5,1,0,1,0,0,.5,.5,-.5,1,1,1,0,0,.5,.5,.5,0,1,1,0,0,-.5,-.5,-.5,0,0,-1,0,0,-.5,-.5,.5,1,0,-1,0,0,-.5,.5,.5,1,1,-1,0,0,-.5,.5,-.5,0,1,-1,0,0]),Tt=new Uint16Array([0,1,2,0,2,3,4,5,6,4,6,7,8,9,10,8,10,11,12,13,14,12,14,15,16,17,18,16,18,19,20,21,22,20,22,23]),at=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,at);t.bufferData(t.ARRAY_BUFFER,Dt,t.STATIC_DRAW);const rt=t.createBuffer();t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,rt);t.bufferData(t.ELEMENT_ARRAY_BUFFER,Tt,t.STATIC_DRAW);const nt=500,K=19,L=new Float32Array(nt*K),st=t.createBuffer(),ct=t.createVertexArray();t.bindVertexArray(ct);t.bindBuffer(t.ARRAY_BUFFER,at);t.enableVertexAttribArray(f.a_position);t.vertexAttribPointer(f.a_position,3,t.FLOAT,!1,32,0);t.enableVertexAttribArray(f.a_uv);t.vertexAttribPointer(f.a_uv,2,t.FLOAT,!1,32,12);t.enableVertexAttribArray(f.a_normal);t.vertexAttribPointer(f.a_normal,3,t.FLOAT,!1,32,20);t.bindBuffer(t.ARRAY_BUFFER,st);const O=K*4;for(let e=0;e<4;e++)t.enableVertexAttribArray(f.a_model+e),t.vertexAttribPointer(f.a_model+e,4,t.FLOAT,!1,O,e*16),t.vertexAttribDivisor(f.a_model+e,1);t.enableVertexAttribArray(f.a_brightness);t.vertexAttribPointer(f.a_brightness,1,t.FLOAT,!1,O,64);t.vertexAttribDivisor(f.a_brightness,1);t.enableVertexAttribArray(f.a_hueShift);t.vertexAttribPointer(f.a_hueShift,1,t.FLOAT,!1,O,68);t.vertexAttribDivisor(f.a_hueShift,1);t.enableVertexAttribArray(f.a_wCoord);t.vertexAttribPointer(f.a_wCoord,1,t.FLOAT,!1,O,72);t.vertexAttribDivisor(f.a_wCoord,1);t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,rt);t.bindVertexArray(null);const Rt=new Float32Array([-1,-1,1,-1,-1,1,1,-1,1,1,-1,1]),Xt=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,Xt);t.bufferData(t.ARRAY_BUFFER,Rt,t.STATIC_DRAW);const lt=t.createVertexArray();t.bindVertexArray(lt);t.enableVertexAttribArray(b.a_position);t.vertexAttribPointer(b.a_position,2,t.FLOAT,!1,0,0);t.bindVertexArray(null);const ut=4e4,y=new Float32Array(ut*7),ht=t.createBuffer(),ft=t.createVertexArray();t.bindVertexArray(ft);t.bindBuffer(t.ARRAY_BUFFER,ht);t.enableVertexAttribArray(E.a_position);t.vertexAttribPointer(E.a_position,3,t.FLOAT,!1,28,0);t.enableVertexAttribArray(E.a_color);t.vertexAttribPointer(E.a_color,3,t.FLOAT,!1,28,12);t.enableVertexAttribArray(E.a_size);t.vertexAttribPointer(E.a_size,1,t.FLOAT,!1,28,24);t.bindVertexArray(null);const j=t.createTexture();t.bindTexture(t.TEXTURE_2D,j);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);t.texImage2D(t.TEXTURE_2D,0,t.RGBA,1,1,0,t.RGBA,t.UNSIGNED_BYTE,new Uint8Array([100,100,120,255]));let Z=null,D=null,X=new Uint8Array(128),mt=!1;async function Pt(){try{Z=new(window.AudioContext||window.webkitAudioContext);const e=await navigator.mediaDevices.getUserMedia({audio:!0}),a=Z.createMediaStreamSource(e);D=Z.createAnalyser(),D.fftSize=256,D.smoothingTimeConstant=.8,a.connect(D),X=new Uint8Array(D.frequencyBinCount),mt=!0}catch(e){console.warn("Audio unavailable:",e)}}function Lt(){if(!mt||!D)return{bass:0,mid:0,high:0,energy:0};D.getByteFrequencyData(X);const e=X.length;let a=0,r=0,s=0;for(let n=0;n<e*.15;n++)a+=X[n];for(let n=Math.floor(e*.15);n<e*.5;n++)r+=X[n];for(let n=Math.floor(e*.5);n<e;n++)s+=X[n];return a=a/(e*.15)/255,r=r/(e*.35)/255,s=s/(e*.5)/255,{bass:a,mid:r,high:s,energy:(a+r+s)/3}}let G=!1;const P=document.createElement("video");P.playsInline=!0;P.muted=!0;async function Yt(){try{const e=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:512},height:{ideal:512}}});P.srcObject=e,await P.play(),G=!0}catch(e){console.warn("Camera unavailable:",e)}}let i={rotVelX:0,rotVelY:0,isDragging:!1,lastX:0,lastY:0,pinchScale:1,pinchTarget:1,lastPinchDist:0,impulseX:0,impulseY:0,impulseZ:0,shockwave:0,shockwaveOrigin:[0,0],swipeVelX:0,swipeVelY:0},dt={};_.addEventListener("touchstart",e=>{for(let a of e.changedTouches)dt[a.identifier]={x:a.clientX,y:a.clientY,startX:a.clientX,startY:a.clientY};if(e.touches.length===1)i.isDragging=!0,i.lastX=e.touches[0].clientX,i.lastY=e.touches[0].clientY;else if(e.touches.length===2){const a=e.touches[0].clientX-e.touches[1].clientX,r=e.touches[0].clientY-e.touches[1].clientY;i.lastPinchDist=Math.sqrt(a*a+r*r)}e.preventDefault()},{passive:!1});_.addEventListener("touchmove",e=>{if(e.touches.length===1&&i.isDragging){const a=e.touches[0].clientX-i.lastX,r=e.touches[0].clientY-i.lastY;i.rotVelY+=a*.008,i.rotVelX+=r*.008,i.swipeVelX=a*.02,i.swipeVelY=r*.02,i.lastX=e.touches[0].clientX,i.lastY=e.touches[0].clientY}else if(e.touches.length===2){const a=e.touches[0].clientX-e.touches[1].clientX,r=e.touches[0].clientY-e.touches[1].clientY,s=Math.sqrt(a*a+r*r);if(i.lastPinchDist>0){const n=s/i.lastPinchDist;i.pinchTarget*=n,i.pinchTarget=Math.max(.3,Math.min(3,i.pinchTarget)),n>1.05&&(i.impulseZ+=.3),n<.95&&(i.impulseZ-=.3)}i.lastPinchDist=s}e.preventDefault()},{passive:!1});_.addEventListener("touchend",e=>{for(let r of e.changedTouches)delete dt[r.identifier];e.touches.length===0&&(i.isDragging=!1),i.lastPinchDist=0;const a=Date.now();i.lastTap||(i.lastTap=0),a-i.lastTap<300&&(i.shockwave=1,e.changedTouches.length>0&&(i.shockwaveOrigin=[(e.changedTouches[0].clientX/window.innerWidth-.5)*4,-(e.changedTouches[0].clientY/window.innerHeight-.5)*4])),i.lastTap=a,e.preventDefault()},{passive:!1});_.addEventListener("mousedown",e=>{i.isDragging=!0,i.lastX=e.clientX,i.lastY=e.clientY});_.addEventListener("mousemove",e=>{if(!i.isDragging)return;const a=e.clientX-i.lastX,r=e.clientY-i.lastY;i.rotVelY+=a*.005,i.rotVelX+=r*.005,i.swipeVelX=a*.015,i.swipeVelY=r*.015,i.lastX=e.clientX,i.lastY=e.clientY});_.addEventListener("mouseup",()=>{i.isDragging=!1});_.addEventListener("mouseleave",()=>{i.isDragging=!1});_.addEventListener("dblclick",e=>{i.shockwave=1,i.shockwaveOrigin=[(e.clientX/window.innerWidth-.5)*4,-(e.clientY/window.innerHeight-.5)*4]});const M=80,C=[];function St(){for(let e=0;e<M;e++)C.push({x:0,y:0,z:-5,vx:0,vy:0,vz:0,rotX:Math.random()*6.28,rotY:Math.random()*6.28,rotVelX:(Math.random()-.5)*.02,rotVelY:(Math.random()-.5)*.02,scale:.5,scaleVel:0,phase:Math.random()*6.28,homeX:0,homeY:0,homeZ:-5,mass:.8+Math.random()*.4,springK:2+Math.random()*1,damping:.92})}St();function Vt(e,a){const r=a*.1;for(let s=0;s<M;s++){const n=C[s],l=s/M;switch(e){case"SPIRAL":{const m=l*Math.PI*8+r,c=.5+l*3;n.homeX=Math.cos(m)*c,n.homeY=Math.sin(m)*c,n.homeZ=-3-l*15;break}case"SPHERE":{const m=Math.acos(1-2*l),c=Math.PI*(1+Math.sqrt(5))*s,h=2.5+Math.sin(r+s)*.5;n.homeX=h*Math.sin(m)*Math.cos(c),n.homeY=h*Math.sin(m)*Math.sin(c),n.homeZ=-5+h*Math.cos(m);break}case"GRID":{const h=s%8,p=Math.floor(s/8);n.homeX=(h-8/2+.5)*.8,n.homeY=(p-10/2+.5)*.8,n.homeZ=-4+Math.sin(h+p+r)*.5;break}case"EXPLOSION":{const m=l*Math.PI*6,c=l*Math.PI*3,h=1+l*8;n.homeX=Math.cos(m)*Math.sin(c)*h,n.homeY=Math.sin(m)*Math.sin(c)*h,n.homeZ=-5+Math.cos(c)*h*.5;break}case"DNA":{const m=s%2,c=Math.floor(s/2)/(M/2),h=c*Math.PI*6+m*Math.PI+r,p=1.5+Math.sin(c*10)*.3;n.homeX=Math.cos(h)*p,n.homeY=Math.sin(h)*p,n.homeZ=-2-c*16;break}case"VORTEX":{const m=l*Math.PI*12+r*2,c=.3+Math.pow(l,.7)*4,h=Math.sin(l*20+r*3)*.5;n.homeX=Math.cos(m)*c,n.homeY=Math.sin(m)*c+h,n.homeZ=-2-l*18;break}default:const o=Math.floor(s/12),d=s%12/12*Math.PI*2+r*(1+o*.3),g=1+o*1.2;n.homeX=Math.cos(d)*g,n.homeY=Math.sin(d)*g*(.6+o*.1),n.homeZ=-3-o*3}}}let Y=0,S=0,_t=0,vt=0,H=!1;function Ft(){typeof DeviceOrientationEvent<"u"&&(typeof DeviceOrientationEvent.requestPermission=="function"?DeviceOrientationEvent.requestPermission().then(e=>{e==="granted"&&(window.addEventListener("deviceorientation",et),H=!0)}).catch(console.error):(window.addEventListener("deviceorientation",et),H=!0))}function et(e){e.beta!==null&&e.gamma!==null&&(_t=e.beta/90*Math.PI,vt=e.gamma/45*Math.PI)}function Ut(e,a,r,s){const n=1/Math.tan(e/2),l=1/(r-s);return new Float32Array([n/a,0,0,0,0,n,0,0,0,0,(s+r)*l,-1,0,0,2*s*r*l,0])}function Wt(e,a,r){const s=e[0]-a[0],n=e[1]-a[1],l=e[2]-a[2];let o=1/Math.sqrt(s*s+n*n+l*l);const u=[s*o,n*o,l*o],d=r[1]*u[2]-r[2]*u[1],g=r[2]*u[0]-r[0]*u[2],m=r[0]*u[1]-r[1]*u[0];o=1/Math.sqrt(d*d+g*g+m*m);const c=[d*o,g*o,m*o],h=[u[1]*c[2]-u[2]*c[1],u[2]*c[0]-u[0]*c[2],u[0]*c[1]-u[1]*c[0]];return new Float32Array([c[0],h[0],u[0],0,c[1],h[1],u[1],0,c[2],h[2],u[2],0,-(c[0]*e[0]+c[1]*e[1]+c[2]*e[2]),-(h[0]*e[0]+h[1]*e[1]+h[2]*e[2]),-(u[0]*e[0]+u[1]*e[1]+u[2]*e[2]),1])}function V(e,a){const r=new Float32Array(16);for(let s=0;s<4;s++)for(let n=0;n<4;n++)r[n*4+s]=e[s]*a[n*4]+e[s+4]*a[n*4+1]+e[s+8]*a[n*4+2]+e[s+12]*a[n*4+3];return r}function Bt(e,a,r){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,e,a,r,1])}function It(e){return new Float32Array([e,0,0,0,0,e,0,0,0,0,e,0,0,0,0,1])}function Ot(e){const a=Math.cos(e),r=Math.sin(e);return new Float32Array([1,0,0,0,0,a,r,0,0,-r,a,0,0,0,0,1])}function Ct(e){const a=Math.cos(e),r=Math.sin(e);return new Float32Array([a,0,-r,0,0,1,0,0,r,0,a,0,0,0,0,1])}function zt(e){const a=Math.cos(e),r=Math.sin(e);return new Float32Array([a,r,0,0,-r,a,0,0,0,0,1,0,0,0,0,1])}let I="VORTEX",F=0;const q=["VORTEX","SPIRAL","SPHERE","DNA","EXPLOSION","GRID"];let U=0;function kt(e,a,r){e=Math.min(e,.05),F+=e,F>15&&(F=0,U=(U+1)%q.length,I=q[U]),Vt(I,a);const s=Math.sin(a*.8)*.1,n=r.bass>.6?(r.bass-.6)*5:0;r.mid*.3,i.rotVelX*=.96,i.rotVelY*=.96,i.swipeVelX*=.94,i.swipeVelY*=.94,i.impulseX*=.9,i.impulseY*=.9,i.impulseZ*=.9,i.shockwave*=.92,i.pinchScale+=(i.pinchTarget-i.pinchScale)*.1;for(let l=0;l<M;l++){const o=C[l],u=l/M,d=o.homeX-o.x,g=o.homeY-o.y,m=o.homeZ-o.z,c=o.springK*(1+n*.5);o.vx+=d*c*e,o.vy+=g*c*e,o.vz+=m*c*e;const h=1.5*(1-u*.5);o.vx+=S*h*e*2,o.vy+=Y*h*e*2;const p=u*.3,W=Math.sin(a*4-p);o.vx+=i.swipeVelX*W*.5,o.vy+=i.swipeVelY*W*.5;const z=i.pinchTarget-1;if(o.scaleVel+=z*e*2,o.vx+=i.impulseX*(1-u)*e*3,o.vy+=i.impulseY*(1-u)*e*3,o.vz+=i.impulseZ*(1-u)*e*3,i.shockwave>.01){const B=Math.sqrt(Math.pow(o.x-i.shockwaveOrigin[0],2)+Math.pow(o.y-i.shockwaveOrigin[1],2)),T=i.shockwave*3/(1+B*.5),Q=Math.atan2(o.y-i.shockwaveOrigin[1],o.x-i.shockwaveOrigin[0]);o.vx+=Math.cos(Q)*T*e,o.vy+=Math.sin(Q)*T*e,o.vz-=T*.3*e}if(n>0){const B=Math.sqrt(o.x*o.x+o.y*o.y),T=Math.atan2(o.y,o.x);o.vx+=Math.cos(T)*n*.8/(1+B*.2),o.vy+=Math.sin(T)*n*.8/(1+B*.2),o.vz+=n*.3}o.rotVelX+=r.mid*.02,o.rotVelY+=r.mid*.015;const x=r.high*.15;o.vx+=(Math.random()-.5)*x,o.vy+=(Math.random()-.5)*x;const J=Math.sin(a*3+u*10)*.02;o.rotVelX+=J,o.rotVelY+=J*.7,o.x+=o.vx*e,o.y+=o.vy*e,o.z+=o.vz*e,o.rotX+=o.rotVelX+i.rotVelX*.3,o.rotY+=o.rotVelY+i.rotVelY*.3;const wt=(.3+(1-u)*.5)*i.pinchScale*(1+s);o.scaleVel+=(wt-o.scale)*5*e,o.scaleVel*=.9,o.scale+=o.scaleVel*e,o.scale=Math.max(.1,Math.min(2,o.scale));const k=o.damping-r.energy*.05;o.vx*=k,o.vy*=k,o.vz*=k,o.rotVelX*=.98,o.rotVelY*=.98}}function Zt(e,a,r){let s=0;const n=Math.pow(Math.sin(e*2.5),8)*.3;for(let l=0;l<M&&s<nt;l++){const o=C[l],u=l/M;let d=Bt(o.x,o.y,o.z);d=V(d,Ot(o.rotX)),d=V(d,Ct(o.rotY)),d=V(d,zt(o.phase+e*.05)),d=V(d,It(o.scale));const g=s*K;for(let p=0;p<16;p++)L[g+p]=d[p];const m=.5+(1-u)*1;L[g+16]=m*(1+a.bass*.4+n),L[g+17]=a.mid*.3+u*.2+Math.sin(e*.2+l)*.1;const c=Math.sin(o.phase+e*.3)*1.5,h=a.bass*.8;L[g+18]=c+h+(o.scale-.5)*.5,s++}return s}function Nt(e,a){let r=0;const s=25e3;for(let n=0;n<s&&r<ut;n++){const l=n/s,o=l*Math.PI*18+e*.15,u=.4+l*6,d=-28+l*30,g=Math.cos(o)*u*(.4+Math.random()*.6),m=Math.sin(o)*u*(.4+Math.random()*.6),c=l+a.mid*.25,h=.2+Math.sin(c*6.28)*.25+a.bass*.25,p=.3+Math.sin(c*6.28+2.09)*.25,W=.6+Math.sin(c*6.28+4.18)*.3+a.high*.25,z=(.015+Math.random()*.03)*(1+a.energy*.4),x=r*7;y[x]=g,y[x+1]=m,y[x+2]=d,y[x+3]=h,y[x+4]=p,y[x+5]=W,y[x+6]=z,r++}return r}const gt=performance.now();let ot=gt;const it=document.getElementById("hud");let A={xw:0,yw:0,zw:0},N=0;function pt(){requestAnimationFrame(pt);const e=performance.now(),a=(e-gt)*.001,r=(e-ot)*.001;ot=e;const s=Lt();kt(r,a,s),Y+=(_t-Y)*.08,S+=(vt-S)*.08,A.xw=Y*.5+Math.sin(a*.15)*.3+s.bass*.4+i.rotVelX*2,A.yw=S*.5+Math.cos(a*.12)*.25+s.mid*.3+i.rotVelY*2,A.zw=Math.sin(a*.1)*.2+s.high*.2+i.shockwave*.5,N=1.01+Math.sin(a*1.5)*.005+Math.sin(a*.7)*.003;const n=.1+s.high*.5;G&&P.readyState>=2&&(t.bindTexture(t.TEXTURE_2D,j),t.texImage2D(t.TEXTURE_2D,0,t.RGBA,t.RGBA,t.UNSIGNED_BYTE,P));const l=_.width/_.height,o=Ut(70*Math.PI/180,l,.1,100),u=Wt([0,0,5],[0,0,-10],[0,1,0]),d=V(o,u);t.viewport(0,0,_.width,_.height),t.clearColor(.01,.01,.03,1),t.clear(t.COLOR_BUFFER_BIT|t.DEPTH_BUFFER_BIT),t.disable(t.DEPTH_TEST),t.useProgram(w),t.uniform1f(b.u_time,a),t.uniform2f(b.u_resolution,_.width,_.height),t.uniform1f(b.u_rotX,Y),t.uniform1f(b.u_rotY,S),t.uniform1f(b.u_rotXW,A.xw),t.uniform1f(b.u_rotYW,A.yw),t.uniform1f(b.u_rotZW,A.zw),t.uniform1f(b.u_dimension,3.5),t.uniform1f(b.u_bass,s.bass),t.uniform1f(b.u_mid,s.mid),t.uniform1f(b.u_gridDensity,12),t.uniform1f(b.u_moireScale,N),t.bindVertexArray(lt),t.drawArrays(t.TRIANGLES,0,6),t.enable(t.DEPTH_TEST);const g=Zt(a,s);t.bindBuffer(t.ARRAY_BUFFER,st),t.bufferData(t.ARRAY_BUFFER,L,t.DYNAMIC_DRAW),t.useProgram(v),t.uniformMatrix4fv(f.u_viewProj,!1,d),t.uniform1i(f.u_cameraTexture,0),t.uniform1f(f.u_time,a),t.uniform1f(f.u_bass,s.bass),t.uniform1f(f.u_energy,s.energy),t.uniform1f(f.u_glitch,n),t.uniform1f(f.u_moireScale,N),t.uniform1f(f.u_rotXW,A.xw),t.uniform1f(f.u_rotYW,A.yw),t.uniform1f(f.u_rotZW,A.zw),t.uniform1f(f.u_dimension,3.5),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,j),t.bindVertexArray(ct),t.drawElementsInstanced(t.TRIANGLES,36,t.UNSIGNED_SHORT,0,g);const m=Nt(a,s);if(t.bindBuffer(t.ARRAY_BUFFER,ht),t.bufferData(t.ARRAY_BUFFER,y,t.DYNAMIC_DRAW),t.enable(t.BLEND),t.blendFunc(t.SRC_ALPHA,t.ONE),t.depthMask(!1),t.useProgram(R),t.uniformMatrix4fv(E.u_viewProj,!1,d),t.uniform1f(E.u_pointScale,_.height*.5),t.bindVertexArray(ft),t.drawArrays(t.POINTS,0,m),t.depthMask(!0),t.disable(t.BLEND),t.bindVertexArray(null),it){const c=G?"CAM":"NO-CAM",h=H?"GYRO":"MOUSE",p=Math.ceil(15-F);it.textContent=`${g} cubes | ${I} (${p}s) | ${c} | ${h} | 4D: ${A.xw.toFixed(1)},${A.yw.toFixed(1)},${A.zw.toFixed(1)}`}}document.getElementById("startBtn").addEventListener("click",async()=>{document.getElementById("startOverlay").classList.add("hidden"),Ft(),await Promise.all([Yt(),Pt()]),requestAnimationFrame(pt)});window.addEventListener("resize",()=>{_.width=window.innerWidth*devicePixelRatio,_.height=window.innerHeight*devicePixelRatio});window.addEventListener("keydown",e=>{switch(e.key){case"1":case"2":case"3":case"4":case"5":case"6":U=parseInt(e.key)-1,I=q[U],F=0;break;case" ":i.shockwave=1,i.shockwaveOrigin=[0,0];break;case"ArrowLeft":i.swipeVelX=-2;break;case"ArrowRight":i.swipeVelX=2;break;case"ArrowUp":i.swipeVelY=2;break;case"ArrowDown":i.swipeVelY=-2;break;case"z":case"Z":i.pinchTarget=Math.min(3,i.pinchTarget*1.2),i.impulseZ+=.5;break;case"x":case"X":i.pinchTarget=Math.max(.3,i.pinchTarget*.8),i.impulseZ-=.5;break}});
