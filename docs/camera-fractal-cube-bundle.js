const v=document.getElementById("gl");v.width=window.innerWidth*devicePixelRatio;v.height=window.innerHeight*devicePixelRatio;v.style.width="100vw";v.style.height="100vh";const t=v.getContext("webgl2",{depth:!0,antialias:!0,alpha:!1,premultipliedAlpha:!1});if(!t)throw new Error("WebGL2 required");const kt=`#version 300 es
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
`,Nt=`#version 300 es
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
`,Zt=`#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.999, 1.0);
}
`,jt=`#version 300 es
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
`,Gt=`#version 300 es
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
`,Ht=`#version 300 es
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
`;function ht(e,r){const o=t.createShader(e);return t.shaderSource(o,r),t.compileShader(o),t.getShaderParameter(o,t.COMPILE_STATUS)?o:(console.error(t.getShaderInfoLog(o)),null)}function ut(e,r){const o=ht(t.VERTEX_SHADER,e),s=ht(t.FRAGMENT_SHADER,r),i=t.createProgram();return t.attachShader(i,o),t.attachShader(i,s),t.linkProgram(i),t.getProgramParameter(i,t.LINK_STATUS)||console.error(t.getProgramInfoLog(i)),i}const p=ut(kt,Nt),w=ut(Zt,jt),O=ut(Gt,Ht),l={a_position:t.getAttribLocation(p,"a_position"),a_uv:t.getAttribLocation(p,"a_uv"),a_normal:t.getAttribLocation(p,"a_normal"),a_model:t.getAttribLocation(p,"a_model"),a_brightness:t.getAttribLocation(p,"a_brightness"),a_hueShift:t.getAttribLocation(p,"a_hueShift"),a_wCoord:t.getAttribLocation(p,"a_wCoord"),u_viewProj:t.getUniformLocation(p,"u_viewProj"),u_cameraTexture:t.getUniformLocation(p,"u_cameraTexture"),u_time:t.getUniformLocation(p,"u_time"),u_bass:t.getUniformLocation(p,"u_bass"),u_energy:t.getUniformLocation(p,"u_energy"),u_glitch:t.getUniformLocation(p,"u_glitch"),u_moireScale:t.getUniformLocation(p,"u_moireScale"),u_rotXW:t.getUniformLocation(p,"u_rotXW"),u_rotYW:t.getUniformLocation(p,"u_rotYW"),u_rotZW:t.getUniformLocation(p,"u_rotZW"),u_dimension:t.getUniformLocation(p,"u_dimension")},x={a_position:t.getAttribLocation(w,"a_position"),u_time:t.getUniformLocation(w,"u_time"),u_resolution:t.getUniformLocation(w,"u_resolution"),u_rotX:t.getUniformLocation(w,"u_rotX"),u_rotY:t.getUniformLocation(w,"u_rotY"),u_rotXW:t.getUniformLocation(w,"u_rotXW"),u_rotYW:t.getUniformLocation(w,"u_rotYW"),u_rotZW:t.getUniformLocation(w,"u_rotZW"),u_dimension:t.getUniformLocation(w,"u_dimension"),u_bass:t.getUniformLocation(w,"u_bass"),u_mid:t.getUniformLocation(w,"u_mid"),u_gridDensity:t.getUniformLocation(w,"u_gridDensity"),u_moireScale:t.getUniformLocation(w,"u_moireScale")},X={a_position:t.getAttribLocation(O,"a_position"),a_color:t.getAttribLocation(O,"a_color"),a_size:t.getAttribLocation(O,"a_size"),u_viewProj:t.getUniformLocation(O,"u_viewProj"),u_pointScale:t.getUniformLocation(O,"u_pointScale")},qt=new Float32Array([-.5,-.5,.5,0,0,0,0,1,.5,-.5,.5,1,0,0,0,1,.5,.5,.5,1,1,0,0,1,-.5,.5,.5,0,1,0,0,1,.5,-.5,-.5,0,0,0,0,-1,-.5,-.5,-.5,1,0,0,0,-1,-.5,.5,-.5,1,1,0,0,-1,.5,.5,-.5,0,1,0,0,-1,-.5,.5,.5,0,0,0,1,0,.5,.5,.5,1,0,0,1,0,.5,.5,-.5,1,1,0,1,0,-.5,.5,-.5,0,1,0,1,0,-.5,-.5,-.5,0,0,0,-1,0,.5,-.5,-.5,1,0,0,-1,0,.5,-.5,.5,1,1,0,-1,0,-.5,-.5,.5,0,1,0,-1,0,.5,-.5,.5,0,0,1,0,0,.5,-.5,-.5,1,0,1,0,0,.5,.5,-.5,1,1,1,0,0,.5,.5,.5,0,1,1,0,0,-.5,-.5,-.5,0,0,-1,0,0,-.5,-.5,.5,1,0,-1,0,0,-.5,.5,.5,1,1,-1,0,0,-.5,.5,-.5,0,1,-1,0,0]),Kt=new Uint16Array([0,1,2,0,2,3,4,5,6,4,6,7,8,9,10,8,10,11,12,13,14,12,14,15,16,17,18,16,18,19,20,21,22,20,22,23]),pt=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,pt);t.bufferData(t.ARRAY_BUFFER,qt,t.STATIC_DRAW);const At=t.createBuffer();t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,At);t.bufferData(t.ELEMENT_ARRAY_BUFFER,Kt,t.STATIC_DRAW);const bt=500,J=19,K=new Float32Array(bt*J),wt=t.createBuffer(),xt=t.createVertexArray();t.bindVertexArray(xt);t.bindBuffer(t.ARRAY_BUFFER,pt);t.enableVertexAttribArray(l.a_position);t.vertexAttribPointer(l.a_position,3,t.FLOAT,!1,32,0);t.enableVertexAttribArray(l.a_uv);t.vertexAttribPointer(l.a_uv,2,t.FLOAT,!1,32,12);t.enableVertexAttribArray(l.a_normal);t.vertexAttribPointer(l.a_normal,3,t.FLOAT,!1,32,20);t.bindBuffer(t.ARRAY_BUFFER,wt);const et=J*4;for(let e=0;e<4;e++)t.enableVertexAttribArray(l.a_model+e),t.vertexAttribPointer(l.a_model+e,4,t.FLOAT,!1,et,e*16),t.vertexAttribDivisor(l.a_model+e,1);t.enableVertexAttribArray(l.a_brightness);t.vertexAttribPointer(l.a_brightness,1,t.FLOAT,!1,et,64);t.vertexAttribDivisor(l.a_brightness,1);t.enableVertexAttribArray(l.a_hueShift);t.vertexAttribPointer(l.a_hueShift,1,t.FLOAT,!1,et,68);t.vertexAttribDivisor(l.a_hueShift,1);t.enableVertexAttribArray(l.a_wCoord);t.vertexAttribPointer(l.a_wCoord,1,t.FLOAT,!1,et,72);t.vertexAttribDivisor(l.a_wCoord,1);t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,At);t.bindVertexArray(null);const L=1,z=[0,L*1.2,0],k=[0,-L*.4,L*1.1],N=[-L*.95,-L*.4,-L*.55],Z=[L*.95,-L*.4,-L*.55];function ot(e,r,o){const s=[r[0]-e[0],r[1]-e[1],r[2]-e[2]],i=[o[0]-e[0],o[1]-e[1],o[2]-e[2]],u=[s[1]*i[2]-s[2]*i[1],s[2]*i[0]-s[0]*i[2],s[0]*i[1]-s[1]*i[0]],a=Math.sqrt(u[0]*u[0]+u[1]*u[1]+u[2]*u[2]);return[u[0]/a,u[1]/a,u[2]/a]}const $t=ot(z,k,Z),Jt=ot(z,N,k),Qt=ot(z,Z,N),te=ot(k,N,Z);function Q(e,r,o,s){return[...e,0,1,...s,...r,0,0,...s,...o,1,0,...s]}const ee=new Float32Array([...Q(z,k,Z,$t),...Q(z,N,k,Jt),...Q(z,Z,N,Qt),...Q(k,N,Z,te)]),oe=new Uint16Array([0,1,2,3,4,5,6,7,8,9,10,11]),yt=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,yt);t.bufferData(t.ARRAY_BUFFER,ee,t.STATIC_DRAW);const Et=t.createBuffer();t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,Et);t.bufferData(t.ELEMENT_ARRAY_BUFFER,oe,t.STATIC_DRAW);const q=new Float32Array(J),Mt=t.createBuffer(),Rt=t.createVertexArray();t.bindVertexArray(Rt);t.bindBuffer(t.ARRAY_BUFFER,yt);t.enableVertexAttribArray(l.a_position);t.vertexAttribPointer(l.a_position,3,t.FLOAT,!1,32,0);t.enableVertexAttribArray(l.a_uv);t.vertexAttribPointer(l.a_uv,2,t.FLOAT,!1,32,12);t.enableVertexAttribArray(l.a_normal);t.vertexAttribPointer(l.a_normal,3,t.FLOAT,!1,32,20);t.bindBuffer(t.ARRAY_BUFFER,Mt);const at=J*4;for(let e=0;e<4;e++)t.enableVertexAttribArray(l.a_model+e),t.vertexAttribPointer(l.a_model+e,4,t.FLOAT,!1,at,e*16),t.vertexAttribDivisor(l.a_model+e,1);t.enableVertexAttribArray(l.a_brightness);t.vertexAttribPointer(l.a_brightness,1,t.FLOAT,!1,at,64);t.vertexAttribDivisor(l.a_brightness,1);t.enableVertexAttribArray(l.a_hueShift);t.vertexAttribPointer(l.a_hueShift,1,t.FLOAT,!1,at,68);t.vertexAttribDivisor(l.a_hueShift,1);t.enableVertexAttribArray(l.a_wCoord);t.vertexAttribPointer(l.a_wCoord,1,t.FLOAT,!1,at,72);t.vertexAttribDivisor(l.a_wCoord,1);t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,Et);t.bindVertexArray(null);const ae=new Float32Array([-1,-1,1,-1,-1,1,1,-1,1,1,-1,1]),re=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,re);t.bufferData(t.ARRAY_BUFFER,ae,t.STATIC_DRAW);const Tt=t.createVertexArray();t.bindVertexArray(Tt);t.enableVertexAttribArray(x.a_position);t.vertexAttribPointer(x.a_position,2,t.FLOAT,!1,0,0);t.bindVertexArray(null);const Dt=4e4,S=new Float32Array(Dt*7),Lt=t.createBuffer(),Yt=t.createVertexArray();t.bindVertexArray(Yt);t.bindBuffer(t.ARRAY_BUFFER,Lt);t.enableVertexAttribArray(X.a_position);t.vertexAttribPointer(X.a_position,3,t.FLOAT,!1,28,0);t.enableVertexAttribArray(X.a_color);t.vertexAttribPointer(X.a_color,3,t.FLOAT,!1,28,12);t.enableVertexAttribArray(X.a_size);t.vertexAttribPointer(X.a_size,1,t.FLOAT,!1,28,24);t.bindVertexArray(null);const lt=t.createTexture();t.bindTexture(t.TEXTURE_2D,lt);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);t.texImage2D(t.TEXTURE_2D,0,t.RGBA,1,1,0,t.RGBA,t.UNSIGNED_BYTE,new Uint8Array([100,100,120,255]));let st=null,V=null,I=new Uint8Array(128),St=!1;async function ne(){try{st=new(window.AudioContext||window.webkitAudioContext);const e=await navigator.mediaDevices.getUserMedia({audio:!0}),r=st.createMediaStreamSource(e);V=st.createAnalyser(),V.fftSize=256,V.smoothingTimeConstant=.8,r.connect(V),I=new Uint8Array(V.frequencyBinCount),St=!0}catch(e){console.warn("Audio unavailable:",e)}}function ie(){if(!St||!V)return{bass:0,mid:0,high:0,energy:0};V.getByteFrequencyData(I);const e=I.length;let r=0,o=0,s=0;for(let i=0;i<e*.15;i++)r+=I[i];for(let i=Math.floor(e*.15);i<e*.5;i++)o+=I[i];for(let i=Math.floor(e*.5);i<e;i++)s+=I[i];return r=r/(e*.15)/255,o=o/(e*.35)/255,s=s/(e*.5)/255,{bass:r,mid:o,high:s,energy:(r+o+s)/3}}let Ft=!1;const G=document.createElement("video");G.playsInline=!0;G.muted=!0;async function se(){try{const e=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:512},height:{ideal:512}}});G.srcObject=e,await G.play(),Ft=!0}catch(e){console.warn("Camera unavailable:",e)}}let n={rotVelX:0,rotVelY:0,isDragging:!1,lastX:0,lastY:0,pinchScale:1,pinchTarget:1,lastPinchDist:0,impulseX:0,impulseY:0,impulseZ:0,shockwave:0,shockwaveOrigin:[0,0],swipeVelX:0,swipeVelY:0},Xt={};v.addEventListener("touchstart",e=>{for(let r of e.changedTouches)Xt[r.identifier]={x:r.clientX,y:r.clientY,startX:r.clientX,startY:r.clientY};if(e.touches.length===1)n.isDragging=!0,n.lastX=e.touches[0].clientX,n.lastY=e.touches[0].clientY;else if(e.touches.length===2){const r=e.touches[0].clientX-e.touches[1].clientX,o=e.touches[0].clientY-e.touches[1].clientY;n.lastPinchDist=Math.sqrt(r*r+o*o)}e.preventDefault()},{passive:!1});v.addEventListener("touchmove",e=>{if(e.touches.length===1&&n.isDragging){const r=e.touches[0].clientX-n.lastX,o=e.touches[0].clientY-n.lastY;n.rotVelY+=r*.008,n.rotVelX+=o*.008,n.swipeVelX=r*.02,n.swipeVelY=o*.02,n.lastX=e.touches[0].clientX,n.lastY=e.touches[0].clientY}else if(e.touches.length===2){const r=e.touches[0].clientX-e.touches[1].clientX,o=e.touches[0].clientY-e.touches[1].clientY,s=Math.sqrt(r*r+o*o);if(n.lastPinchDist>0){const i=s/n.lastPinchDist;n.pinchTarget*=i,n.pinchTarget=Math.max(.3,Math.min(3,n.pinchTarget)),i>1.05&&(n.impulseZ+=.3),i<.95&&(n.impulseZ-=.3)}n.lastPinchDist=s}e.preventDefault()},{passive:!1});v.addEventListener("touchend",e=>{for(let o of e.changedTouches)delete Xt[o.identifier];e.touches.length===0&&(n.isDragging=!1),n.lastPinchDist=0;const r=Date.now();n.lastTap||(n.lastTap=0),r-n.lastTap<300&&(n.shockwave=1,e.changedTouches.length>0&&(n.shockwaveOrigin=[(e.changedTouches[0].clientX/window.innerWidth-.5)*4,-(e.changedTouches[0].clientY/window.innerHeight-.5)*4])),n.lastTap=r,e.preventDefault()},{passive:!1});v.addEventListener("mousedown",e=>{n.isDragging=!0,n.lastX=e.clientX,n.lastY=e.clientY});v.addEventListener("mousemove",e=>{if(!n.isDragging)return;const r=e.clientX-n.lastX,o=e.clientY-n.lastY;n.rotVelY+=r*.005,n.rotVelX+=o*.005,n.swipeVelX=r*.015,n.swipeVelY=o*.015,n.lastX=e.clientX,n.lastY=e.clientY});v.addEventListener("mouseup",()=>{n.isDragging=!1});v.addEventListener("mouseleave",()=>{n.isDragging=!1});v.addEventListener("dblclick",e=>{n.shockwave=1,n.shockwaveOrigin=[(e.clientX/window.innerWidth-.5)*4,-(e.clientY/window.innerHeight-.5)*4]});const T=160,rt=[],tt=1.618033988749895,$=.618033988749895,y=Math.PI*2;function ce(){for(let e=0;e<T;e++)rt.push({x:0,y:0,z:-5,vx:0,vy:0,vz:0,rotX:Math.random()*y,rotY:Math.random()*y,rotVelX:(Math.random()-.5)*.001,rotVelY:(Math.random()-.5)*.001,scale:.5,scaleVel:0,phase:Math.random()*y,homeX:0,homeY:0,homeZ:-5,mass:.8+Math.random()*.4,springK:.8+Math.random()*.4,damping:.96})}ce();function le(e,r){const o=r*.05;for(let s=0;s<T;s++){const i=rt[s],u=s/T;switch(e){case"SPIRAL":{const d=y*$,c=s*d+o*.3,h=.1+Math.pow(u,.6)*4,m=2-u*80;i.homeX=Math.cos(c)*h*(1+Math.sin(o+u*5)*.1),i.homeY=Math.sin(c)*h*(1+Math.cos(o+u*5)*.1),i.homeZ=m;break}case"SPHERE":{const h=u*y*4+o*.2,m=2+Math.cos(2*h),g=3;i.homeX=(g+m*Math.cos(3*h))*Math.cos(h)*.5,i.homeY=(g+m*Math.cos(3*h))*Math.sin(h)*.5,i.homeZ=1-m*Math.sin(3*h)*.5-u*25;break}case"GRID":{const d=Math.floor(Math.sqrt(s)),h=(s-d*d)/Math.max(1,d*6)*y+o*.15,m=d*.7,g=Math.sin(h*6+o)*.2;i.homeX=Math.cos(h)*(m+g),i.homeY=Math.sin(h)*(m+g),i.homeZ=3-d*5-Math.sin(o+d)*.5;break}case"EXPLOSION":{const c=Math.floor(s/16),m=s%16/16*y+c*tt+o*.1,g=3-Math.pow(c+1,1.5)*3,M=.8+c*.4+Math.sin(o*.5+c)*.2;i.homeX=Math.cos(m)*M,i.homeY=Math.sin(m)*M,i.homeZ=g;break}case"DNA":{const d=s%2,c=Math.floor(s/2)/(T/2),h=c*y*8*tt+d*Math.PI+o*.2,m=1.2+Math.sin(c*20)*.15,g=Math.sin(o*.5+c*3)*.1;i.homeX=Math.cos(h)*(m+g),i.homeY=Math.sin(h)*(m+g),i.homeZ=4-c*90;break}case"VORTEX":{const c=Math.floor(s/(T/20)),h=s%(T/20),m=T/20,g=h/m*y+c*$+o*(.1+c*.02),M=.3+c%4*.6+Math.sin(o+c)*.15,b=4-Math.pow(c+.5,1.3)*4,R=Math.sin(g*3+o*.3)*.3;i.homeX=Math.cos(g)*M,i.homeY=Math.sin(g)*M,i.homeZ=b+R;break}case"LOXODROME":{const c=u*y*6,h=2*Math.atan(Math.exp(.15*c)),m=2.5+Math.sin(o*.3)*.3;i.homeX=m*Math.sin(h)*Math.cos(c+o*.1),i.homeY=m*Math.sin(h)*Math.sin(c+o*.1),i.homeZ=2-m*Math.cos(h)-u*30;break}case"FERMAT":{const d=y*$,c=s*d+o*.15,h=Math.sqrt(s)*.25,m=Math.sin(c*.5+o)*.2;i.homeX=Math.cos(c)*h,i.homeY=Math.sin(c)*h+m,i.homeZ=3-u*70;break}default:const a=Math.floor(s/10),_=s%10/10*y+o*(.08-a*.005),A=Math.pow(tt,a*.5)*.6;i.homeX=Math.cos(_)*A,i.homeY=Math.sin(_)*A,i.homeZ=3-a*4}}}let C=0,W=0,Pt=0,Vt=0;function ue(){typeof DeviceOrientationEvent<"u"&&(typeof DeviceOrientationEvent.requestPermission=="function"?DeviceOrientationEvent.requestPermission().then(e=>{e==="granted"&&window.addEventListener("deviceorientation",ft)}).catch(console.error):window.addEventListener("deviceorientation",ft))}function ft(e){e.beta!==null&&e.gamma!==null&&(Pt=e.beta/90*Math.PI,Vt=e.gamma/45*Math.PI)}function he(e,r,o,s){const i=1/Math.tan(e/2),u=1/(o-s);return new Float32Array([i/r,0,0,0,0,i,0,0,0,0,(s+o)*u,-1,0,0,2*s*o*u,0])}function fe(e,r,o){const s=e[0]-r[0],i=e[1]-r[1],u=e[2]-r[2];let a=1/Math.sqrt(s*s+i*i+u*u);const f=[s*a,i*a,u*a],_=o[1]*f[2]-o[2]*f[1],A=o[2]*f[0]-o[0]*f[2],d=o[0]*f[1]-o[1]*f[0];a=1/Math.sqrt(_*_+A*A+d*d);const c=[_*a,A*a,d*a],h=[f[1]*c[2]-f[2]*c[1],f[2]*c[0]-f[0]*c[2],f[0]*c[1]-f[1]*c[0]];return new Float32Array([c[0],h[0],f[0],0,c[1],h[1],f[1],0,c[2],h[2],f[2],0,-(c[0]*e[0]+c[1]*e[1]+c[2]*e[2]),-(h[0]*e[0]+h[1]*e[1]+h[2]*e[2]),-(f[0]*e[0]+f[1]*e[1]+f[2]*e[2]),1])}function F(e,r){const o=new Float32Array(16);for(let s=0;s<4;s++)for(let i=0;i<4;i++)o[i*4+s]=e[s]*r[i*4]+e[s+4]*r[i*4+1]+e[s+8]*r[i*4+2]+e[s+12]*r[i*4+3];return o}function Bt(e,r,o){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,e,r,o,1])}function Ut(e){return new Float32Array([e,0,0,0,0,e,0,0,0,0,e,0,0,0,0,1])}function Ot(e){const r=Math.cos(e),o=Math.sin(e);return new Float32Array([1,0,0,0,0,r,o,0,0,-o,r,0,0,0,0,1])}function It(e){const r=Math.cos(e),o=Math.sin(e);return new Float32Array([r,0,-o,0,0,1,0,0,o,0,r,0,0,0,0,1])}function me(e){const r=Math.cos(e),o=Math.sin(e);return new Float32Array([r,o,0,0,-o,r,0,0,0,0,1,0,0,0,0,1])}let B="VORTEX",j=0;const Y=["VORTEX","SPIRAL","FERMAT","LOXODROME","DNA","GRID","SPHERE","EXPLOSION"];let E=0;function de(e,r,o){e=Math.min(e,.03),j+=e,j>20&&(j=0,E=(E+1)%Y.length,B=Y[E]),le(B,r);const s=Math.sin(r*.4)*.05,i=o.bass>.7?(o.bass-.7)*2:0;o.mid*.15,n.rotVelX*=.98,n.rotVelY*=.98,n.swipeVelX*=.97,n.swipeVelY*=.97,n.impulseX*=.95,n.impulseY*=.95,n.impulseZ*=.95,n.shockwave*=.96,n.pinchScale+=(n.pinchTarget-n.pinchScale)*.05;for(let u=0;u<T;u++){const a=rt[u],f=u/T,_=a.homeX-a.x,A=a.homeY-a.y,d=a.homeZ-a.z,c=a.springK*.4*(1+i*.2);a.vx+=_*c*e,a.vy+=A*c*e,a.vz+=d*c*e;const h=.5*(1-f*.5);a.vx+=W*h*e,a.vy+=C*h*e;const m=f*.5,g=Math.sin(r*2-m);a.vx+=n.swipeVelX*g*.2,a.vy+=n.swipeVelY*g*.2;const M=n.pinchTarget-1;if(a.scaleVel+=M*e*.5,a.vx+=n.impulseX*(1-f)*e,a.vy+=n.impulseY*(1-f)*e,a.vz+=n.impulseZ*(1-f)*e,n.shockwave>.01){const it=Math.sqrt(Math.pow(a.x-n.shockwaveOrigin[0],2)+Math.pow(a.y-n.shockwaveOrigin[1],2)),U=n.shockwave*3/(1+it*.5),H=Math.atan2(a.y-n.shockwaveOrigin[1],a.x-n.shockwaveOrigin[0]);a.vx+=Math.cos(H)*U*e,a.vy+=Math.sin(H)*U*e,a.vz-=U*.3*e}if(i>0){const it=Math.sqrt(a.x*a.x+a.y*a.y),U=Math.atan2(a.y,a.x),H=i*.2/(1+it*.3);a.vx+=Math.cos(U)*H,a.vy+=Math.sin(U)*H}a.rotVelX+=o.mid*5e-4,a.rotVelY+=o.mid*3e-4;const b=o.high*.02;a.vx+=(Math.random()-.5)*b,a.vy+=(Math.random()-.5)*b;const R=f*tt*10,P=Math.sin(r*.3+R)*.001;a.rotVelX+=P,a.rotVelY+=P*$,a.x+=a.vx*e,a.y+=a.vy*e,a.z+=a.vz*e,a.rotX+=(a.rotVelX+n.rotVelX*.03)*.1,a.rotY+=(a.rotVelY+n.rotVelY*.03)*.1;const zt=(.3+Math.max(.2,Math.min(1.5,(a.z+10)/15))*.5)*n.pinchScale*(1+s);a.scaleVel+=(zt-a.scale)*2*e,a.scaleVel*=.95,a.scale+=a.scaleVel*e,a.scale=Math.max(.15,Math.min(1.5,a.scale));const nt=.97-o.energy*.02;a.vx*=nt,a.vy*=nt,a.vz*=nt,a.rotVelX*=.995,a.rotVelY*=.995}}function _e(e,r,o){let s=0;const i=Math.pow(Math.sin(e*1.5),8)*.15;for(let u=0;u<T&&s<bt;u++){const a=rt[u],f=u/T;let _=Bt(a.x,a.y,a.z);_=F(_,Ot(a.rotX)),_=F(_,It(a.rotY)),_=F(_,me(a.phase+e*.005)),_=F(_,Ut(a.scale));const A=s*J;for(let m=0;m<16;m++)K[A+m]=_[m];const d=.5+(1-f)*1;K[A+16]=d*(1+r.bass*.4+i),K[A+17]=r.mid*.3+f*.2+Math.sin(e*.2+u)*.1;const c=Math.sin(a.phase+e*.3)*1.5,h=r.bass*.8;K[A+18]=c+h+(a.scale-.5)*.5,s++}return s}function ve(e,r){let o=0;const s=25e3;for(let i=0;i<s&&o<Dt;i++){const u=i/s,a=u*Math.PI*18+e*.15,f=.4+u*6,_=-28+u*30,A=Math.cos(a)*f*(.4+Math.random()*.6),d=Math.sin(a)*f*(.4+Math.random()*.6),c=u+r.mid*.25,h=.2+Math.sin(c*6.28)*.25+r.bass*.25,m=.3+Math.sin(c*6.28+2.09)*.25,g=.6+Math.sin(c*6.28+4.18)*.3+r.high*.25,M=(.015+Math.random()*.03)*(1+r.energy*.4),b=o*7;S[b]=A,S[b+1]=d,S[b+2]=_,S[b+3]=h,S[b+4]=m,S[b+5]=g,S[b+6]=M,o++}return o}const Ct=performance.now();let mt=Ct;const dt=document.getElementById("hud");let D={xw:0,yw:0,zw:0},ct=0;function Wt(){requestAnimationFrame(Wt);const e=performance.now(),r=(e-Ct)*.001,o=(e-mt)*.001;mt=e;const s=ie();de(o,r,s),C+=(Pt-C)*.08,W+=(Vt-W)*.08,D.xw=C*.5+Math.sin(r*.15)*.3+s.bass*.4+n.rotVelX*2,D.yw=W*.5+Math.cos(r*.12)*.25+s.mid*.3+n.rotVelY*2,D.zw=Math.sin(r*.1)*.2+s.high*.2+n.shockwave*.5,ct=1.01+Math.sin(r*1.5)*.005+Math.sin(r*.7)*.003;const i=.1+s.high*.5;Ft&&G.readyState>=2&&(t.bindTexture(t.TEXTURE_2D,lt),t.texImage2D(t.TEXTURE_2D,0,t.RGBA,t.RGBA,t.UNSIGNED_BYTE,G));const u=v.width/v.height,a=he(70*Math.PI/180,u,.1,100),f=fe([0,0,5],[0,0,-10],[0,1,0]),_=F(a,f);t.viewport(0,0,v.width,v.height),t.clearColor(.01,.01,.03,1),t.clear(t.COLOR_BUFFER_BIT|t.DEPTH_BUFFER_BIT),t.disable(t.DEPTH_TEST),t.useProgram(w),t.uniform1f(x.u_time,r),t.uniform2f(x.u_resolution,v.width,v.height),t.uniform1f(x.u_rotX,C),t.uniform1f(x.u_rotY,W),t.uniform1f(x.u_rotXW,D.xw),t.uniform1f(x.u_rotYW,D.yw),t.uniform1f(x.u_rotZW,D.zw),t.uniform1f(x.u_dimension,3.5),t.uniform1f(x.u_bass,s.bass),t.uniform1f(x.u_mid,s.mid),t.uniform1f(x.u_gridDensity,12),t.uniform1f(x.u_moireScale,ct),t.bindVertexArray(Tt),t.drawArrays(t.TRIANGLES,0,6),t.enable(t.DEPTH_TEST);const A=_e(r,s);t.bindBuffer(t.ARRAY_BUFFER,wt),t.bufferData(t.ARRAY_BUFFER,K,t.DYNAMIC_DRAW),t.useProgram(p),t.uniformMatrix4fv(l.u_viewProj,!1,_),t.uniform1i(l.u_cameraTexture,0),t.uniform1f(l.u_time,r),t.uniform1f(l.u_bass,s.bass),t.uniform1f(l.u_energy,s.energy),t.uniform1f(l.u_glitch,i),t.uniform1f(l.u_moireScale,ct),t.uniform1f(l.u_rotXW,D.xw),t.uniform1f(l.u_rotYW,D.yw),t.uniform1f(l.u_rotZW,D.zw),t.uniform1f(l.u_dimension,3.5),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,lt),t.bindVertexArray(xt),t.drawElementsInstanced(t.TRIANGLES,36,t.UNSIGNED_SHORT,0,A);{const g=C*.4,M=W*.4,b=r*.02;let R=Bt(0,0,1.5);R=F(R,Ot(g+b)),R=F(R,It(M+b*$)),R=F(R,Ut(2));for(let P=0;P<16;P++)q[P]=R[P];q[16]=1.5,q[17]=0,q[18]=Math.sin(r*.1)*.5,t.bindBuffer(t.ARRAY_BUFFER,Mt),t.bufferData(t.ARRAY_BUFFER,q,t.DYNAMIC_DRAW),t.bindVertexArray(Rt),t.drawElementsInstanced(t.TRIANGLES,12,t.UNSIGNED_SHORT,0,1)}const d=ve(r,s);t.bindBuffer(t.ARRAY_BUFFER,Lt),t.bufferData(t.ARRAY_BUFFER,S,t.DYNAMIC_DRAW),t.enable(t.BLEND),t.blendFunc(t.SRC_ALPHA,t.ONE),t.depthMask(!1),t.useProgram(O),t.uniformMatrix4fv(X.u_viewProj,!1,_),t.uniform1f(X.u_pointScale,v.height*.5),t.bindVertexArray(Yt),t.drawArrays(t.POINTS,0,d),t.depthMask(!0),t.disable(t.BLEND),t.bindVertexArray(null),dt&&(dt.textContent=`${A} cubes | ${B}`);const c=document.getElementById("formationName");c&&(c.textContent=B)}document.getElementById("startBtn").addEventListener("click",async()=>{document.getElementById("startOverlay").classList.add("hidden");const e=document.getElementById("touchControls");e&&e.classList.remove("hidden"),ue(),await Promise.all([se(),ne()]),requestAnimationFrame(Wt)});const _t=document.getElementById("prevBtn"),vt=document.getElementById("nextBtn"),gt=document.getElementById("formationName");document.getElementById("touchControls");_t&&_t.addEventListener("click",e=>{e.stopPropagation(),E=(E-1+Y.length)%Y.length,B=Y[E],j=0});vt&&vt.addEventListener("click",e=>{e.stopPropagation(),E=(E+1)%Y.length,B=Y[E],j=0});gt&&gt.addEventListener("click",e=>{e.stopPropagation(),n.shockwave=.8,n.shockwaveOrigin=[0,0]});window.addEventListener("resize",()=>{v.width=window.innerWidth*devicePixelRatio,v.height=window.innerHeight*devicePixelRatio});window.addEventListener("keydown",e=>{switch(e.key){case"1":case"2":case"3":case"4":case"5":case"6":case"7":case"8":E=parseInt(e.key)-1,E<Y.length&&(B=Y[E],j=0);break;case" ":n.shockwave=.5,n.shockwaveOrigin=[0,0];break;case"ArrowLeft":n.swipeVelX=-1;break;case"ArrowRight":n.swipeVelX=1;break;case"ArrowUp":n.swipeVelY=1;break;case"ArrowDown":n.swipeVelY=-1;break;case"z":case"Z":n.pinchTarget=Math.min(2,n.pinchTarget*1.1);break;case"x":case"X":n.pinchTarget=Math.max(.5,n.pinchTarget*.9);break}});
