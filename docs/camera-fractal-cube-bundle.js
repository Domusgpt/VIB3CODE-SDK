const g=document.getElementById("gl");g.width=window.innerWidth*devicePixelRatio;g.height=window.innerHeight*devicePixelRatio;g.style.width="100vw";g.style.height="100vh";const t=g.getContext("webgl2",{depth:!0,antialias:!0,alpha:!1,premultipliedAlpha:!1});if(!t)throw new Error("WebGL2 required");const Mt=`#version 300 es
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
`,Et=`#version 300 es
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
`,Tt=`#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.999, 1.0);
}
`,Dt=`#version 300 es
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
`,Rt=`#version 300 es
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
`,Lt=`#version 300 es
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
`;function it(e,n){const o=t.createShader(e);return t.shaderSource(o,n),t.compileShader(o),t.getShaderParameter(o,t.COMPILE_STATUS)?o:(console.error(t.getShaderInfoLog(o)),null)}function et(e,n){const o=it(t.VERTEX_SHADER,e),s=it(t.FRAGMENT_SHADER,n),r=t.createProgram();return t.attachShader(r,o),t.attachShader(r,s),t.linkProgram(r),t.getProgramParameter(r,t.LINK_STATUS)||console.error(t.getProgramInfoLog(r)),r}const p=et(Mt,Et),b=et(Tt,Dt),Y=et(Rt,Lt),m={a_position:t.getAttribLocation(p,"a_position"),a_uv:t.getAttribLocation(p,"a_uv"),a_normal:t.getAttribLocation(p,"a_normal"),a_model:t.getAttribLocation(p,"a_model"),a_brightness:t.getAttribLocation(p,"a_brightness"),a_hueShift:t.getAttribLocation(p,"a_hueShift"),a_wCoord:t.getAttribLocation(p,"a_wCoord"),u_viewProj:t.getUniformLocation(p,"u_viewProj"),u_cameraTexture:t.getUniformLocation(p,"u_cameraTexture"),u_time:t.getUniformLocation(p,"u_time"),u_bass:t.getUniformLocation(p,"u_bass"),u_energy:t.getUniformLocation(p,"u_energy"),u_glitch:t.getUniformLocation(p,"u_glitch"),u_moireScale:t.getUniformLocation(p,"u_moireScale"),u_rotXW:t.getUniformLocation(p,"u_rotXW"),u_rotYW:t.getUniformLocation(p,"u_rotYW"),u_rotZW:t.getUniformLocation(p,"u_rotZW"),u_dimension:t.getUniformLocation(p,"u_dimension")},A={a_position:t.getAttribLocation(b,"a_position"),u_time:t.getUniformLocation(b,"u_time"),u_resolution:t.getUniformLocation(b,"u_resolution"),u_rotX:t.getUniformLocation(b,"u_rotX"),u_rotY:t.getUniformLocation(b,"u_rotY"),u_rotXW:t.getUniformLocation(b,"u_rotXW"),u_rotYW:t.getUniformLocation(b,"u_rotYW"),u_rotZW:t.getUniformLocation(b,"u_rotZW"),u_dimension:t.getUniformLocation(b,"u_dimension"),u_bass:t.getUniformLocation(b,"u_bass"),u_mid:t.getUniformLocation(b,"u_mid"),u_gridDensity:t.getUniformLocation(b,"u_gridDensity"),u_moireScale:t.getUniformLocation(b,"u_moireScale")},R={a_position:t.getAttribLocation(Y,"a_position"),a_color:t.getAttribLocation(Y,"a_color"),a_size:t.getAttribLocation(Y,"a_size"),u_viewProj:t.getUniformLocation(Y,"u_viewProj"),u_pointScale:t.getUniformLocation(Y,"u_pointScale")},Xt=new Float32Array([-.5,-.5,.5,0,0,0,0,1,.5,-.5,.5,1,0,0,0,1,.5,.5,.5,1,1,0,0,1,-.5,.5,.5,0,1,0,0,1,.5,-.5,-.5,0,0,0,0,-1,-.5,-.5,-.5,1,0,0,0,-1,-.5,.5,-.5,1,1,0,0,-1,.5,.5,-.5,0,1,0,0,-1,-.5,.5,.5,0,0,0,1,0,.5,.5,.5,1,0,0,1,0,.5,.5,-.5,1,1,0,1,0,-.5,.5,-.5,0,1,0,1,0,-.5,-.5,-.5,0,0,0,-1,0,.5,-.5,-.5,1,0,0,-1,0,.5,-.5,.5,1,1,0,-1,0,-.5,-.5,.5,0,1,0,-1,0,.5,-.5,.5,0,0,1,0,0,.5,-.5,-.5,1,0,1,0,0,.5,.5,-.5,1,1,1,0,0,.5,.5,.5,0,1,1,0,0,-.5,-.5,-.5,0,0,-1,0,0,-.5,-.5,.5,1,0,-1,0,0,-.5,.5,.5,1,1,-1,0,0,-.5,.5,-.5,0,1,-1,0,0]),Yt=new Uint16Array([0,1,2,0,2,3,4,5,6,4,6,7,8,9,10,8,10,11,12,13,14,12,14,15,16,17,18,16,18,19,20,21,22,20,22,23]),ct=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,ct);t.bufferData(t.ARRAY_BUFFER,Xt,t.STATIC_DRAW);const lt=t.createBuffer();t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,lt);t.bufferData(t.ELEMENT_ARRAY_BUFFER,Yt,t.STATIC_DRAW);const ut=500,ot=19,U=new Float32Array(ut*ot),ht=t.createBuffer(),ft=t.createVertexArray();t.bindVertexArray(ft);t.bindBuffer(t.ARRAY_BUFFER,ct);t.enableVertexAttribArray(m.a_position);t.vertexAttribPointer(m.a_position,3,t.FLOAT,!1,32,0);t.enableVertexAttribArray(m.a_uv);t.vertexAttribPointer(m.a_uv,2,t.FLOAT,!1,32,12);t.enableVertexAttribArray(m.a_normal);t.vertexAttribPointer(m.a_normal,3,t.FLOAT,!1,32,20);t.bindBuffer(t.ARRAY_BUFFER,ht);const Z=ot*4;for(let e=0;e<4;e++)t.enableVertexAttribArray(m.a_model+e),t.vertexAttribPointer(m.a_model+e,4,t.FLOAT,!1,Z,e*16),t.vertexAttribDivisor(m.a_model+e,1);t.enableVertexAttribArray(m.a_brightness);t.vertexAttribPointer(m.a_brightness,1,t.FLOAT,!1,Z,64);t.vertexAttribDivisor(m.a_brightness,1);t.enableVertexAttribArray(m.a_hueShift);t.vertexAttribPointer(m.a_hueShift,1,t.FLOAT,!1,Z,68);t.vertexAttribDivisor(m.a_hueShift,1);t.enableVertexAttribArray(m.a_wCoord);t.vertexAttribPointer(m.a_wCoord,1,t.FLOAT,!1,Z,72);t.vertexAttribDivisor(m.a_wCoord,1);t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,lt);t.bindVertexArray(null);const St=new Float32Array([-1,-1,1,-1,-1,1,1,-1,1,1,-1,1]),Pt=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,Pt);t.bufferData(t.ARRAY_BUFFER,St,t.STATIC_DRAW);const mt=t.createVertexArray();t.bindVertexArray(mt);t.enableVertexAttribArray(A.a_position);t.vertexAttribPointer(A.a_position,2,t.FLOAT,!1,0,0);t.bindVertexArray(null);const dt=4e4,D=new Float32Array(dt*7),_t=t.createBuffer(),gt=t.createVertexArray();t.bindVertexArray(gt);t.bindBuffer(t.ARRAY_BUFFER,_t);t.enableVertexAttribArray(R.a_position);t.vertexAttribPointer(R.a_position,3,t.FLOAT,!1,28,0);t.enableVertexAttribArray(R.a_color);t.vertexAttribPointer(R.a_color,3,t.FLOAT,!1,28,12);t.enableVertexAttribArray(R.a_size);t.vertexAttribPointer(R.a_size,1,t.FLOAT,!1,28,24);t.bindVertexArray(null);const J=t.createTexture();t.bindTexture(t.TEXTURE_2D,J);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);t.texImage2D(t.TEXTURE_2D,0,t.RGBA,1,1,0,t.RGBA,t.UNSIGNED_BYTE,new Uint8Array([100,100,120,255]));let $=null,L=null,S=new Uint8Array(128),vt=!1;async function Vt(){try{$=new(window.AudioContext||window.webkitAudioContext);const e=await navigator.mediaDevices.getUserMedia({audio:!0}),n=$.createMediaStreamSource(e);L=$.createAnalyser(),L.fftSize=256,L.smoothingTimeConstant=.8,n.connect(L),S=new Uint8Array(L.frequencyBinCount),vt=!0}catch(e){console.warn("Audio unavailable:",e)}}function Ft(){if(!vt||!L)return{bass:0,mid:0,high:0,energy:0};L.getByteFrequencyData(S);const e=S.length;let n=0,o=0,s=0;for(let r=0;r<e*.15;r++)n+=S[r];for(let r=Math.floor(e*.15);r<e*.5;r++)o+=S[r];for(let r=Math.floor(e*.5);r<e;r++)s+=S[r];return n=n/(e*.15)/255,o=o/(e*.35)/255,s=s/(e*.5)/255,{bass:n,mid:o,high:s,energy:(n+o+s)/3}}let Q=!1;const V=document.createElement("video");V.playsInline=!0;V.muted=!0;async function Ut(){try{const e=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:512},height:{ideal:512}}});V.srcObject=e,await V.play(),Q=!0}catch(e){console.warn("Camera unavailable:",e)}}let i={rotVelX:0,rotVelY:0,isDragging:!1,lastX:0,lastY:0,pinchScale:1,pinchTarget:1,lastPinchDist:0,impulseX:0,impulseY:0,impulseZ:0,shockwave:0,shockwaveOrigin:[0,0],swipeVelX:0,swipeVelY:0},pt={};g.addEventListener("touchstart",e=>{for(let n of e.changedTouches)pt[n.identifier]={x:n.clientX,y:n.clientY,startX:n.clientX,startY:n.clientY};if(e.touches.length===1)i.isDragging=!0,i.lastX=e.touches[0].clientX,i.lastY=e.touches[0].clientY;else if(e.touches.length===2){const n=e.touches[0].clientX-e.touches[1].clientX,o=e.touches[0].clientY-e.touches[1].clientY;i.lastPinchDist=Math.sqrt(n*n+o*o)}e.preventDefault()},{passive:!1});g.addEventListener("touchmove",e=>{if(e.touches.length===1&&i.isDragging){const n=e.touches[0].clientX-i.lastX,o=e.touches[0].clientY-i.lastY;i.rotVelY+=n*.008,i.rotVelX+=o*.008,i.swipeVelX=n*.02,i.swipeVelY=o*.02,i.lastX=e.touches[0].clientX,i.lastY=e.touches[0].clientY}else if(e.touches.length===2){const n=e.touches[0].clientX-e.touches[1].clientX,o=e.touches[0].clientY-e.touches[1].clientY,s=Math.sqrt(n*n+o*o);if(i.lastPinchDist>0){const r=s/i.lastPinchDist;i.pinchTarget*=r,i.pinchTarget=Math.max(.3,Math.min(3,i.pinchTarget)),r>1.05&&(i.impulseZ+=.3),r<.95&&(i.impulseZ-=.3)}i.lastPinchDist=s}e.preventDefault()},{passive:!1});g.addEventListener("touchend",e=>{for(let o of e.changedTouches)delete pt[o.identifier];e.touches.length===0&&(i.isDragging=!1),i.lastPinchDist=0;const n=Date.now();i.lastTap||(i.lastTap=0),n-i.lastTap<300&&(i.shockwave=1,e.changedTouches.length>0&&(i.shockwaveOrigin=[(e.changedTouches[0].clientX/window.innerWidth-.5)*4,-(e.changedTouches[0].clientY/window.innerHeight-.5)*4])),i.lastTap=n,e.preventDefault()},{passive:!1});g.addEventListener("mousedown",e=>{i.isDragging=!0,i.lastX=e.clientX,i.lastY=e.clientY});g.addEventListener("mousemove",e=>{if(!i.isDragging)return;const n=e.clientX-i.lastX,o=e.clientY-i.lastY;i.rotVelY+=n*.005,i.rotVelX+=o*.005,i.swipeVelX=n*.015,i.swipeVelY=o*.015,i.lastX=e.clientX,i.lastY=e.clientY});g.addEventListener("mouseup",()=>{i.isDragging=!1});g.addEventListener("mouseleave",()=>{i.isDragging=!1});g.addEventListener("dblclick",e=>{i.shockwave=1,i.shockwaveOrigin=[(e.clientX/window.innerWidth-.5)*4,-(e.clientY/window.innerHeight-.5)*4]});const M=160,j=[],z=1.618033988749895,I=.618033988749895,y=Math.PI*2;function Ot(){for(let e=0;e<M;e++)j.push({x:0,y:0,z:-5,vx:0,vy:0,vz:0,rotX:Math.random()*y,rotY:Math.random()*y,rotVelX:(Math.random()-.5)*.005,rotVelY:(Math.random()-.5)*.005,scale:.5,scaleVel:0,phase:Math.random()*y,homeX:0,homeY:0,homeZ:-5,mass:.8+Math.random()*.4,springK:.8+Math.random()*.4,damping:.96})}Ot();function Ct(e,n){const o=n*.05;for(let s=0;s<M;s++){const r=j[s],u=s/M;switch(e){case"SPIRAL":{const d=y*I,c=s*d+o*.3,l=.1+Math.pow(u,.6)*4,f=2-u*80;r.homeX=Math.cos(c)*l*(1+Math.sin(o+u*5)*.1),r.homeY=Math.sin(c)*l*(1+Math.cos(o+u*5)*.1),r.homeZ=f;break}case"SPHERE":{const l=u*y*4+o*.2,f=2+Math.cos(2*l),v=3;r.homeX=(v+f*Math.cos(3*l))*Math.cos(l)*.5,r.homeY=(v+f*Math.cos(3*l))*Math.sin(l)*.5,r.homeZ=1-f*Math.sin(3*l)*.5-u*25;break}case"GRID":{const d=Math.floor(Math.sqrt(s)),l=(s-d*d)/Math.max(1,d*6)*y+o*.15,f=d*.7,v=Math.sin(l*6+o)*.2;r.homeX=Math.cos(l)*(f+v),r.homeY=Math.sin(l)*(f+v),r.homeZ=3-d*5-Math.sin(o+d)*.5;break}case"EXPLOSION":{const c=Math.floor(s/16),f=s%16/16*y+c*z+o*.1,v=3-Math.pow(c+1,1.5)*3,E=.8+c*.4+Math.sin(o*.5+c)*.2;r.homeX=Math.cos(f)*E,r.homeY=Math.sin(f)*E,r.homeZ=v;break}case"DNA":{const d=s%2,c=Math.floor(s/2)/(M/2),l=c*y*8*z+d*Math.PI+o*.2,f=1.2+Math.sin(c*20)*.15,v=Math.sin(o*.5+c*3)*.1;r.homeX=Math.cos(l)*(f+v),r.homeY=Math.sin(l)*(f+v),r.homeZ=4-c*90;break}case"VORTEX":{const c=Math.floor(s/(M/20)),l=s%(M/20),f=M/20,v=l/f*y+c*I+o*(.1+c*.02),E=.3+c%4*.6+Math.sin(o+c)*.15,x=4-Math.pow(c+.5,1.3)*4,G=Math.sin(v*3+o*.3)*.3;r.homeX=Math.cos(v)*E,r.homeY=Math.sin(v)*E,r.homeZ=x+G;break}case"LOXODROME":{const c=u*y*6,l=2*Math.atan(Math.exp(.15*c)),f=2.5+Math.sin(o*.3)*.3;r.homeX=f*Math.sin(l)*Math.cos(c+o*.1),r.homeY=f*Math.sin(l)*Math.sin(c+o*.1),r.homeZ=2-f*Math.cos(l)-u*30;break}case"FERMAT":{const d=y*I,c=s*d+o*.15,l=Math.sqrt(s)*.25,f=Math.sin(c*.5+o)*.2;r.homeX=Math.cos(c)*l,r.homeY=Math.sin(c)*l+f,r.homeZ=3-u*70;break}default:const a=Math.floor(s/10),_=s%10/10*y+o*(.08-a*.005),w=Math.pow(z,a*.5)*.6;r.homeX=Math.cos(_)*w,r.homeY=Math.sin(_)*w,r.homeZ=3-a*4}}}let O=0,C=0,wt=0,bt=0,tt=!1;function Wt(){typeof DeviceOrientationEvent<"u"&&(typeof DeviceOrientationEvent.requestPermission=="function"?DeviceOrientationEvent.requestPermission().then(e=>{e==="granted"&&(window.addEventListener("deviceorientation",nt),tt=!0)}).catch(console.error):(window.addEventListener("deviceorientation",nt),tt=!0))}function nt(e){e.beta!==null&&e.gamma!==null&&(wt=e.beta/90*Math.PI,bt=e.gamma/45*Math.PI)}function Bt(e,n,o,s){const r=1/Math.tan(e/2),u=1/(o-s);return new Float32Array([r/n,0,0,0,0,r,0,0,0,0,(s+o)*u,-1,0,0,2*s*o*u,0])}function zt(e,n,o){const s=e[0]-n[0],r=e[1]-n[1],u=e[2]-n[2];let a=1/Math.sqrt(s*s+r*r+u*u);const h=[s*a,r*a,u*a],_=o[1]*h[2]-o[2]*h[1],w=o[2]*h[0]-o[0]*h[2],d=o[0]*h[1]-o[1]*h[0];a=1/Math.sqrt(_*_+w*w+d*d);const c=[_*a,w*a,d*a],l=[h[1]*c[2]-h[2]*c[1],h[2]*c[0]-h[0]*c[2],h[0]*c[1]-h[1]*c[0]];return new Float32Array([c[0],l[0],h[0],0,c[1],l[1],h[1],0,c[2],l[2],h[2],0,-(c[0]*e[0]+c[1]*e[1]+c[2]*e[2]),-(l[0]*e[0]+l[1]*e[1]+l[2]*e[2]),-(h[0]*e[0]+h[1]*e[1]+h[2]*e[2]),1])}function W(e,n){const o=new Float32Array(16);for(let s=0;s<4;s++)for(let r=0;r<4;r++)o[r*4+s]=e[s]*n[r*4]+e[s+4]*n[r*4+1]+e[s+8]*n[r*4+2]+e[s+12]*n[r*4+3];return o}function It(e,n,o){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,e,n,o,1])}function kt(e){return new Float32Array([e,0,0,0,0,e,0,0,0,0,e,0,0,0,0,1])}function Nt(e){const n=Math.cos(e),o=Math.sin(e);return new Float32Array([1,0,0,0,0,n,o,0,0,-o,n,0,0,0,0,1])}function Zt(e){const n=Math.cos(e),o=Math.sin(e);return new Float32Array([n,0,-o,0,0,1,0,0,o,0,n,0,0,0,0,1])}function jt(e){const n=Math.cos(e),o=Math.sin(e);return new Float32Array([n,o,0,0,-o,n,0,0,0,0,1,0,0,0,0,1])}let k="VORTEX",B=0;const N=["VORTEX","SPIRAL","FERMAT","LOXODROME","DNA","GRID","SPHERE","EXPLOSION"];let P=0;function Gt(e,n,o){e=Math.min(e,.03),B+=e,B>20&&(B=0,P=(P+1)%N.length,k=N[P]),Ct(k,n);const s=Math.sin(n*.4)*.05,r=o.bass>.7?(o.bass-.7)*2:0;o.mid*.15,i.rotVelX*=.98,i.rotVelY*=.98,i.swipeVelX*=.97,i.swipeVelY*=.97,i.impulseX*=.95,i.impulseY*=.95,i.impulseZ*=.95,i.shockwave*=.96,i.pinchScale+=(i.pinchTarget-i.pinchScale)*.05;for(let u=0;u<M;u++){const a=j[u],h=u/M,_=a.homeX-a.x,w=a.homeY-a.y,d=a.homeZ-a.z,c=a.springK*.4*(1+r*.2);a.vx+=_*c*e,a.vy+=w*c*e,a.vz+=d*c*e;const l=.5*(1-h*.5);a.vx+=C*l*e,a.vy+=O*l*e;const f=h*.5,v=Math.sin(n*2-f);a.vx+=i.swipeVelX*v*.2,a.vy+=i.swipeVelY*v*.2;const E=i.pinchTarget-1;if(a.scaleVel+=E*e*.5,a.vx+=i.impulseX*(1-h)*e,a.vy+=i.impulseY*(1-h)*e,a.vz+=i.impulseZ*(1-h)*e,i.shockwave>.01){const q=Math.sqrt(Math.pow(a.x-i.shockwaveOrigin[0],2)+Math.pow(a.y-i.shockwaveOrigin[1],2)),X=i.shockwave*3/(1+q*.5),F=Math.atan2(a.y-i.shockwaveOrigin[1],a.x-i.shockwaveOrigin[0]);a.vx+=Math.cos(F)*X*e,a.vy+=Math.sin(F)*X*e,a.vz-=X*.3*e}if(r>0){const q=Math.sqrt(a.x*a.x+a.y*a.y),X=Math.atan2(a.y,a.x),F=r*.2/(1+q*.3);a.vx+=Math.cos(X)*F,a.vy+=Math.sin(X)*F}a.rotVelX+=o.mid*.003,a.rotVelY+=o.mid*.002;const x=o.high*.02;a.vx+=(Math.random()-.5)*x,a.vy+=(Math.random()-.5)*x;const G=h*z*10,at=Math.sin(n*.5+G)*.005;a.rotVelX+=at,a.rotVelY+=at*I,a.x+=a.vx*e,a.y+=a.vy*e,a.z+=a.vz*e,a.rotX+=(a.rotVelX+i.rotVelX*.1)*.3,a.rotY+=(a.rotVelY+i.rotVelY*.1)*.3;const yt=(.3+Math.max(.2,Math.min(1.5,(a.z+10)/15))*.5)*i.pinchScale*(1+s);a.scaleVel+=(yt-a.scale)*2*e,a.scaleVel*=.95,a.scale+=a.scaleVel*e,a.scale=Math.max(.15,Math.min(1.5,a.scale));const H=.97-o.energy*.02;a.vx*=H,a.vy*=H,a.vz*=H,a.rotVelX*=.995,a.rotVelY*=.995}}function Ht(e,n,o){let s=0;const r=Math.pow(Math.sin(e*1.5),8)*.15;for(let u=0;u<M&&s<ut;u++){const a=j[u],h=u/M;let _=It(a.x,a.y,a.z);_=W(_,Nt(a.rotX)),_=W(_,Zt(a.rotY)),_=W(_,jt(a.phase+e*.02)),_=W(_,kt(a.scale));const w=s*ot;for(let f=0;f<16;f++)U[w+f]=_[f];const d=.5+(1-h)*1;U[w+16]=d*(1+n.bass*.4+r),U[w+17]=n.mid*.3+h*.2+Math.sin(e*.2+u)*.1;const c=Math.sin(a.phase+e*.3)*1.5,l=n.bass*.8;U[w+18]=c+l+(a.scale-.5)*.5,s++}return s}function qt(e,n){let o=0;const s=25e3;for(let r=0;r<s&&o<dt;r++){const u=r/s,a=u*Math.PI*18+e*.15,h=.4+u*6,_=-28+u*30,w=Math.cos(a)*h*(.4+Math.random()*.6),d=Math.sin(a)*h*(.4+Math.random()*.6),c=u+n.mid*.25,l=.2+Math.sin(c*6.28)*.25+n.bass*.25,f=.3+Math.sin(c*6.28+2.09)*.25,v=.6+Math.sin(c*6.28+4.18)*.3+n.high*.25,E=(.015+Math.random()*.03)*(1+n.energy*.4),x=o*7;D[x]=w,D[x+1]=d,D[x+2]=_,D[x+3]=l,D[x+4]=f,D[x+5]=v,D[x+6]=E,o++}return o}const At=performance.now();let rt=At;const st=document.getElementById("hud");let T={xw:0,yw:0,zw:0},K=0;function xt(){requestAnimationFrame(xt);const e=performance.now(),n=(e-At)*.001,o=(e-rt)*.001;rt=e;const s=Ft();Gt(o,n,s),O+=(wt-O)*.08,C+=(bt-C)*.08,T.xw=O*.5+Math.sin(n*.15)*.3+s.bass*.4+i.rotVelX*2,T.yw=C*.5+Math.cos(n*.12)*.25+s.mid*.3+i.rotVelY*2,T.zw=Math.sin(n*.1)*.2+s.high*.2+i.shockwave*.5,K=1.01+Math.sin(n*1.5)*.005+Math.sin(n*.7)*.003;const r=.1+s.high*.5;Q&&V.readyState>=2&&(t.bindTexture(t.TEXTURE_2D,J),t.texImage2D(t.TEXTURE_2D,0,t.RGBA,t.RGBA,t.UNSIGNED_BYTE,V));const u=g.width/g.height,a=Bt(70*Math.PI/180,u,.1,100),h=zt([0,0,5],[0,0,-10],[0,1,0]),_=W(a,h);t.viewport(0,0,g.width,g.height),t.clearColor(.01,.01,.03,1),t.clear(t.COLOR_BUFFER_BIT|t.DEPTH_BUFFER_BIT),t.disable(t.DEPTH_TEST),t.useProgram(b),t.uniform1f(A.u_time,n),t.uniform2f(A.u_resolution,g.width,g.height),t.uniform1f(A.u_rotX,O),t.uniform1f(A.u_rotY,C),t.uniform1f(A.u_rotXW,T.xw),t.uniform1f(A.u_rotYW,T.yw),t.uniform1f(A.u_rotZW,T.zw),t.uniform1f(A.u_dimension,3.5),t.uniform1f(A.u_bass,s.bass),t.uniform1f(A.u_mid,s.mid),t.uniform1f(A.u_gridDensity,12),t.uniform1f(A.u_moireScale,K),t.bindVertexArray(mt),t.drawArrays(t.TRIANGLES,0,6),t.enable(t.DEPTH_TEST);const w=Ht(n,s);t.bindBuffer(t.ARRAY_BUFFER,ht),t.bufferData(t.ARRAY_BUFFER,U,t.DYNAMIC_DRAW),t.useProgram(p),t.uniformMatrix4fv(m.u_viewProj,!1,_),t.uniform1i(m.u_cameraTexture,0),t.uniform1f(m.u_time,n),t.uniform1f(m.u_bass,s.bass),t.uniform1f(m.u_energy,s.energy),t.uniform1f(m.u_glitch,r),t.uniform1f(m.u_moireScale,K),t.uniform1f(m.u_rotXW,T.xw),t.uniform1f(m.u_rotYW,T.yw),t.uniform1f(m.u_rotZW,T.zw),t.uniform1f(m.u_dimension,3.5),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,J),t.bindVertexArray(ft),t.drawElementsInstanced(t.TRIANGLES,36,t.UNSIGNED_SHORT,0,w);const d=qt(n,s);if(t.bindBuffer(t.ARRAY_BUFFER,_t),t.bufferData(t.ARRAY_BUFFER,D,t.DYNAMIC_DRAW),t.enable(t.BLEND),t.blendFunc(t.SRC_ALPHA,t.ONE),t.depthMask(!1),t.useProgram(Y),t.uniformMatrix4fv(R.u_viewProj,!1,_),t.uniform1f(R.u_pointScale,g.height*.5),t.bindVertexArray(gt),t.drawArrays(t.POINTS,0,d),t.depthMask(!0),t.disable(t.BLEND),t.bindVertexArray(null),st){const c=Q?"CAM":"NO-CAM",l=tt?"GYRO":"MOUSE",f=Math.ceil(20-B);st.textContent=`${w} cubes | ${k} (${f}s) | ${c} | ${l}`}}document.getElementById("startBtn").addEventListener("click",async()=>{document.getElementById("startOverlay").classList.add("hidden"),Wt(),await Promise.all([Ut(),Vt()]),requestAnimationFrame(xt)});window.addEventListener("resize",()=>{g.width=window.innerWidth*devicePixelRatio,g.height=window.innerHeight*devicePixelRatio});window.addEventListener("keydown",e=>{switch(e.key){case"1":case"2":case"3":case"4":case"5":case"6":case"7":case"8":P=parseInt(e.key)-1,P<N.length&&(k=N[P],B=0);break;case" ":i.shockwave=.5,i.shockwaveOrigin=[0,0];break;case"ArrowLeft":i.swipeVelX=-1;break;case"ArrowRight":i.swipeVelX=1;break;case"ArrowUp":i.swipeVelY=1;break;case"ArrowDown":i.swipeVelY=-1;break;case"z":case"Z":i.pinchTarget=Math.min(2,i.pinchTarget*1.1);break;case"x":case"X":i.pinchTarget=Math.max(.5,i.pinchTarget*.9);break}});
