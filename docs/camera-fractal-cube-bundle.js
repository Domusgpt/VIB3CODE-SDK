const x=document.getElementById("gl");x.width=window.innerWidth*devicePixelRatio;x.height=window.innerHeight*devicePixelRatio;x.style.width="100vw";x.style.height="100vh";const t=x.getContext("webgl2",{depth:!0,antialias:!0,alpha:!1,premultipliedAlpha:!1});if(!t)throw new Error("WebGL2 required");const mt=`#version 300 es
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
`,dt=`#version 300 es
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
`,ht=`#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.999, 1.0);
}
`,vt=`#version 300 es
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
`,gt=`#version 300 es
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
`,pt=`#version 300 es
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
`;function Q(e,o){const r=t.createShader(e);return t.shaderSource(r,o),t.compileShader(r),t.getShaderParameter(r,t.COMPILE_STATUS)?r:(console.error(t.getShaderInfoLog(r)),null)}function J(e,o){const r=Q(t.VERTEX_SHADER,e),n=Q(t.FRAGMENT_SHADER,o),s=t.createProgram();return t.attachShader(s,r),t.attachShader(s,n),t.linkProgram(s),t.getProgramParameter(s,t.LINK_STATUS)||console.error(t.getProgramInfoLog(s)),s}const p=J(mt,dt),y=J(ht,vt),O=J(gt,pt),f={a_position:t.getAttribLocation(p,"a_position"),a_uv:t.getAttribLocation(p,"a_uv"),a_normal:t.getAttribLocation(p,"a_normal"),a_model:t.getAttribLocation(p,"a_model"),a_brightness:t.getAttribLocation(p,"a_brightness"),a_hueShift:t.getAttribLocation(p,"a_hueShift"),a_wCoord:t.getAttribLocation(p,"a_wCoord"),u_viewProj:t.getUniformLocation(p,"u_viewProj"),u_cameraTexture:t.getUniformLocation(p,"u_cameraTexture"),u_time:t.getUniformLocation(p,"u_time"),u_bass:t.getUniformLocation(p,"u_bass"),u_energy:t.getUniformLocation(p,"u_energy"),u_glitch:t.getUniformLocation(p,"u_glitch"),u_moireScale:t.getUniformLocation(p,"u_moireScale"),u_rotXW:t.getUniformLocation(p,"u_rotXW"),u_rotYW:t.getUniformLocation(p,"u_rotYW"),u_rotZW:t.getUniformLocation(p,"u_rotZW"),u_dimension:t.getUniformLocation(p,"u_dimension")},E={a_position:t.getAttribLocation(y,"a_position"),u_time:t.getUniformLocation(y,"u_time"),u_resolution:t.getUniformLocation(y,"u_resolution"),u_rotX:t.getUniformLocation(y,"u_rotX"),u_rotY:t.getUniformLocation(y,"u_rotY"),u_rotXW:t.getUniformLocation(y,"u_rotXW"),u_rotYW:t.getUniformLocation(y,"u_rotYW"),u_rotZW:t.getUniformLocation(y,"u_rotZW"),u_dimension:t.getUniformLocation(y,"u_dimension"),u_bass:t.getUniformLocation(y,"u_bass"),u_mid:t.getUniformLocation(y,"u_mid"),u_gridDensity:t.getUniformLocation(y,"u_gridDensity"),u_moireScale:t.getUniformLocation(y,"u_moireScale")},B={a_position:t.getAttribLocation(O,"a_position"),a_color:t.getAttribLocation(O,"a_color"),a_size:t.getAttribLocation(O,"a_size"),u_viewProj:t.getUniformLocation(O,"u_viewProj"),u_pointScale:t.getUniformLocation(O,"u_pointScale")},bt=new Float32Array([-.5,-.5,.5,0,0,0,0,1,.5,-.5,.5,1,0,0,0,1,.5,.5,.5,1,1,0,0,1,-.5,.5,.5,0,1,0,0,1,.5,-.5,-.5,0,0,0,0,-1,-.5,-.5,-.5,1,0,0,0,-1,-.5,.5,-.5,1,1,0,0,-1,.5,.5,-.5,0,1,0,0,-1,-.5,.5,.5,0,0,0,1,0,.5,.5,.5,1,0,0,1,0,.5,.5,-.5,1,1,0,1,0,-.5,.5,-.5,0,1,0,1,0,-.5,-.5,-.5,0,0,0,-1,0,.5,-.5,-.5,1,0,0,-1,0,.5,-.5,.5,1,1,0,-1,0,-.5,-.5,.5,0,1,0,-1,0,.5,-.5,.5,0,0,1,0,0,.5,-.5,-.5,1,0,1,0,0,.5,.5,-.5,1,1,1,0,0,.5,.5,.5,0,1,1,0,0,-.5,-.5,-.5,0,0,-1,0,0,-.5,-.5,.5,1,0,-1,0,0,-.5,.5,.5,1,1,-1,0,0,-.5,.5,-.5,0,1,-1,0,0]),At=new Uint16Array([0,1,2,0,2,3,4,5,6,4,6,7,8,9,10,8,10,11,12,13,14,12,14,15,16,17,18,16,18,19,20,21,22,20,22,23]),rt=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,rt);t.bufferData(t.ARRAY_BUFFER,bt,t.STATIC_DRAW);const it=t.createBuffer();t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,it);t.bufferData(t.ELEMENT_ARRAY_BUFFER,At,t.STATIC_DRAW);const S=500,U=19,m=new Float32Array(S*U),nt=t.createBuffer(),at=t.createVertexArray();t.bindVertexArray(at);t.bindBuffer(t.ARRAY_BUFFER,rt);t.enableVertexAttribArray(f.a_position);t.vertexAttribPointer(f.a_position,3,t.FLOAT,!1,32,0);t.enableVertexAttribArray(f.a_uv);t.vertexAttribPointer(f.a_uv,2,t.FLOAT,!1,32,12);t.enableVertexAttribArray(f.a_normal);t.vertexAttribPointer(f.a_normal,3,t.FLOAT,!1,32,20);t.bindBuffer(t.ARRAY_BUFFER,nt);const G=U*4;for(let e=0;e<4;e++)t.enableVertexAttribArray(f.a_model+e),t.vertexAttribPointer(f.a_model+e,4,t.FLOAT,!1,G,e*16),t.vertexAttribDivisor(f.a_model+e,1);t.enableVertexAttribArray(f.a_brightness);t.vertexAttribPointer(f.a_brightness,1,t.FLOAT,!1,G,64);t.vertexAttribDivisor(f.a_brightness,1);t.enableVertexAttribArray(f.a_hueShift);t.vertexAttribPointer(f.a_hueShift,1,t.FLOAT,!1,G,68);t.vertexAttribDivisor(f.a_hueShift,1);t.enableVertexAttribArray(f.a_wCoord);t.vertexAttribPointer(f.a_wCoord,1,t.FLOAT,!1,G,72);t.vertexAttribDivisor(f.a_wCoord,1);t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,it);t.bindVertexArray(null);const wt=new Float32Array([-1,-1,1,-1,-1,1,1,-1,1,1,-1,1]),xt=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,xt);t.bufferData(t.ARRAY_BUFFER,wt,t.STATIC_DRAW);const st=t.createVertexArray();t.bindVertexArray(st);t.enableVertexAttribArray(E.a_position);t.vertexAttribPointer(E.a_position,2,t.FLOAT,!1,0,0);t.bindVertexArray(null);const ct=4e4,F=new Float32Array(ct*7),lt=t.createBuffer(),ut=t.createVertexArray();t.bindVertexArray(ut);t.bindBuffer(t.ARRAY_BUFFER,lt);t.enableVertexAttribArray(B.a_position);t.vertexAttribPointer(B.a_position,3,t.FLOAT,!1,28,0);t.enableVertexAttribArray(B.a_color);t.vertexAttribPointer(B.a_color,3,t.FLOAT,!1,28,12);t.enableVertexAttribArray(B.a_size);t.vertexAttribPointer(B.a_size,1,t.FLOAT,!1,28,24);t.bindVertexArray(null);const $=t.createTexture();t.bindTexture(t.TEXTURE_2D,$);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);t.texImage2D(t.TEXTURE_2D,0,t.RGBA,1,1,0,t.RGBA,t.UNSIGNED_BYTE,new Uint8Array([100,100,120,255]));let q=null,C=null,V=new Uint8Array(128),ft=!1;async function yt(){try{q=new(window.AudioContext||window.webkitAudioContext);const e=await navigator.mediaDevices.getUserMedia({audio:!0}),o=q.createMediaStreamSource(e);C=q.createAnalyser(),C.fftSize=256,C.smoothingTimeConstant=.8,o.connect(C),V=new Uint8Array(C.frequencyBinCount),ft=!0}catch(e){console.warn("Audio unavailable:",e)}}function Et(){if(!ft||!C)return{bass:0,mid:0,high:0,energy:0};C.getByteFrequencyData(V);const e=V.length;let o=0,r=0,n=0;for(let s=0;s<e*.15;s++)o+=V[s];for(let s=Math.floor(e*.15);s<e*.5;s++)r+=V[s];for(let s=Math.floor(e*.5);s<e;s++)n+=V[s];return o=o/(e*.15)/255,r=r/(e*.35)/255,n=n/(e*.5)/255,{bass:o,mid:r,high:n,energy:(o+r+n)/3}}let K=!1;const j=document.createElement("video");j.playsInline=!0;j.muted=!0;async function Rt(){try{const e=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:512},height:{ideal:512}}});j.srcObject=e,await j.play(),K=!0}catch(e){console.warn("Camera unavailable:",e)}}let P=0,W=0,Z=0,H=0,N=!1;function Dt(){typeof DeviceOrientationEvent<"u"&&(typeof DeviceOrientationEvent.requestPermission=="function"?DeviceOrientationEvent.requestPermission().then(e=>{e==="granted"&&(window.addEventListener("deviceorientation",tt),N=!0)}).catch(console.error):(window.addEventListener("deviceorientation",tt),N=!0))}function tt(e){e.beta!==null&&e.gamma!==null&&(Z=e.beta/90*Math.PI,H=e.gamma/45*Math.PI)}x.addEventListener("mousemove",e=>{if(N)return;const o=e.clientX/window.innerWidth;Z=(e.clientY/window.innerHeight-.5)*Math.PI*2,H=(o-.5)*Math.PI*2});x.addEventListener("touchmove",e=>{if(N)return;const o=e.touches[0],r=o.clientX/window.innerWidth;Z=(o.clientY/window.innerHeight-.5)*Math.PI*2,H=(r-.5)*Math.PI*2,e.preventDefault()},{passive:!1});function Tt(e,o,r,n){const s=1/Math.tan(e/2),w=1/(r-n);return new Float32Array([s/o,0,0,0,0,s,0,0,0,0,(n+r)*w,-1,0,0,2*n*r*w,0])}function Mt(e,o,r){const n=e[0]-o[0],s=e[1]-o[1],w=e[2]-o[2];let b=1/Math.sqrt(n*n+s*s+w*w);const u=[n*b,s*b,w*b],D=r[1]*u[2]-r[2]*u[1],i=r[2]*u[0]-r[0]*u[2],l=r[0]*u[1]-r[1]*u[0];b=1/Math.sqrt(D*D+i*i+l*l);const a=[D*b,i*b,l*b],_=[u[1]*a[2]-u[2]*a[1],u[2]*a[0]-u[0]*a[2],u[0]*a[1]-u[1]*a[0]];return new Float32Array([a[0],_[0],u[0],0,a[1],_[1],u[1],0,a[2],_[2],u[2],0,-(a[0]*e[0]+a[1]*e[1]+a[2]*e[2]),-(_[0]*e[0]+_[1]*e[1]+_[2]*e[2]),-(u[0]*e[0]+u[1]*e[1]+u[2]*e[2]),1])}function h(e,o){const r=new Float32Array(16);for(let n=0;n<4;n++)for(let s=0;s<4;s++)r[s*4+n]=e[n]*o[s*4]+e[n+4]*o[s*4+1]+e[n+8]*o[s*4+2]+e[n+12]*o[s*4+3];return r}function z(e,o,r){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,e,o,r,1])}function I(e){return new Float32Array([e,0,0,0,0,e,0,0,0,0,e,0,0,0,0,1])}function Y(e){const o=Math.cos(e),r=Math.sin(e);return new Float32Array([1,0,0,0,0,o,r,0,0,-r,o,0,0,0,0,1])}function X(e){const o=Math.cos(e),r=Math.sin(e);return new Float32Array([o,0,-r,0,0,1,0,0,r,0,o,0,0,0,0,1])}function et(e){const o=Math.cos(e),r=Math.sin(e);return new Float32Array([o,r,0,0,-r,o,0,0,0,0,1,0,0,0,0,1])}function Lt(e,o,r){let n=0;const s=Math.sin(e*.8)*.15+1,w=Math.pow(Math.sin(e*2.5),8)*.3,b=P*.8,u=W*.8;for(let i=0;i<8&&n<S;i++){const l=i/8*Math.PI*2+e*.02,a=3.5,_=Math.cos(l)*a+u*.5,R=Math.sin(l)*a+b*.5,M=-1.5-Math.sin(l*2+e)*.5,L=(1.2+Math.sin(e*.5+i)*.2)*s,v=e*.08+P*.6+i,A=e*.06+W*.6;let c=z(_,R,M);c=h(c,Y(v)),c=h(c,X(A)),c=h(c,I(L));const d=n*U;for(let g=0;g<16;g++)m[d+g]=c[g];m[d+16]=1.5+w,m[d+17]=o.mid*.15+i*.05,m[d+18]=Math.sin(e*.3+i)*1.2,n++}for(let i=0;i<12&&n<S;i++){const l=i/12*Math.PI*2+e*.15,_=2+Math.sin(e*2+i*.5)*.3,R=Math.cos(l)*_,M=Math.sin(l)*_*.7+Math.cos(e+i)*.3,L=-3+Math.sin(l*3)*1.5,v=(.55+Math.sin(e+i*.8)*.15)*s;let A=z(R+u*.3,M+b*.3,L);A=h(A,Y(e*.2+P*.4)),A=h(A,X(e*.15+i*.5)),A=h(A,et(e*.1+i)),A=h(A,I(v));const c=n*U;for(let d=0;d<16;d++)m[c+d]=A[d];m[c+16]=1.2+o.bass*.4,m[c+17]=o.mid*.2,m[c+18]=Math.cos(e*.4+i)*.8,n++}const D=[[-2.8,2.2],[2.8,2.2],[-2.8,-2.2],[2.8,-2.2],[-1.5,2.8],[1.5,2.8],[-1.5,-2.8],[1.5,-2.8],[-3.2,.8],[3.2,.8],[-3.2,-.8],[3.2,-.8],[0,3],[0,-3]];for(let i=0;i<D.length&&n<S;i++){const[l,a]=D[i],_=Math.sin(e*.5+i*1.5)*.4,R=l+_+u*.6,M=a+Math.cos(e*.3+i)*.3+b*.6,L=-2-Math.sin(e*.4+i*.7)*1.5,v=(.5+Math.sin(e*.7+i*2)*.2)*s,A=e*(.1+i%3*.05);let c=z(R,M,L);c=h(c,Y(A+P*.5)),c=h(c,X(A*.7+W*.5)),c=h(c,I(v));const d=n*U;for(let g=0;g<16;g++)m[d+g]=c[g];m[d+16]=1+w*.5,m[d+17]=i/D.length*.3,m[d+18]=Math.sin(e*.35+i*.9)*.6,n++}for(let i=0;i<2&&n<S;i++)for(let l=0;l<15&&n<S;l++){const a=l/15,_=a*Math.PI*4+i*Math.PI+e*.12,R=.3+(1-a)*1.8,M=Math.cos(_)*R,L=Math.sin(_)*R,v=-4-a*14,A=(.35-a*.2)*s;let c=z(M+u*(1-a)*.4,L+b*(1-a)*.4,v);c=h(c,Y(e*.1+a*3)),c=h(c,X(_)),c=h(c,I(A));const d=n*U;for(let g=0;g<16;g++)m[d+g]=c[g];m[d+16]=(.4+(1-a)*.6)*(1+o.bass*.3),m[d+17]=a*.2+i*.15,m[d+18]=Math.sin(a*6.28+e*.5)*(1-a),n++}for(let i=0;i<6&&n<S;i++){const l=(e*.3+i*1.05)%6.28,a=(Math.sin(l)+1)*.5,_=i*1.05,R=1.5+Math.sin(i*2)*.5,M=Math.cos(_)*R*(1-a*.5),L=Math.sin(_)*R*(1-a*.5),v=2-a*25;if(v<3&&v>-20){const A=.4+a*.3;let c=z(M,L,v);c=h(c,Y(e*.3+i)),c=h(c,X(e*.4)),c=h(c,I(A*s));const d=n*U;for(let g=0;g<16;g++)m[d+g]=c[g];m[d+16]=1.3-a*.5,m[d+17]=a*.4,m[d+18]=(1-a*2)*1.5,n++}}if(n<S){const i=.6+w*2+o.bass*.4;let l=z(u*.2,b*.2,-5);l=h(l,Y(e*.05+P*.3)),l=h(l,X(e*.07+W*.3)),l=h(l,et(e*.03)),l=h(l,I(i));const a=n*U;for(let _=0;_<16;_++)m[a+_]=l[_];m[a+16]=1.8,m[a+17]=o.mid*.3,m[a+18]=Math.sin(e*.2)*2,n++}return n}function Pt(e,o){let r=0;const n=25e3;for(let s=0;s<n&&r<ct;s++){const w=s/n,b=w*Math.PI*18+e*.15,u=.4+w*6,D=-28+w*30,i=Math.cos(b)*u*(.4+Math.random()*.6),l=Math.sin(b)*u*(.4+Math.random()*.6),a=w+o.mid*.25,_=.2+Math.sin(a*6.28)*.25+o.bass*.25,R=.3+Math.sin(a*6.28+2.09)*.25,M=.6+Math.sin(a*6.28+4.18)*.3+o.high*.25,L=(.015+Math.random()*.03)*(1+o.energy*.4),v=r*7;F[v]=i,F[v+1]=l,F[v+2]=D,F[v+3]=_,F[v+4]=R,F[v+5]=M,F[v+6]=L,r++}return r}const St=performance.now(),ot=document.getElementById("hud");let T={xw:0,yw:0,zw:0},k=0;function _t(){requestAnimationFrame(_t);const o=(performance.now()-St)*.001,r=Et();P+=(Z-P)*.08,W+=(H-W)*.08,T.xw=P*.5+Math.sin(o*.15)*.3+r.bass*.4,T.yw=W*.5+Math.cos(o*.12)*.25+r.mid*.3,T.zw=Math.sin(o*.1)*.2+r.high*.2,k=1.01+Math.sin(o*1.5)*.005+Math.sin(o*.7)*.003;const n=.1+r.high*.5;K&&j.readyState>=2&&(t.bindTexture(t.TEXTURE_2D,$),t.texImage2D(t.TEXTURE_2D,0,t.RGBA,t.RGBA,t.UNSIGNED_BYTE,j));const s=x.width/x.height,w=Tt(70*Math.PI/180,s,.1,100),b=Mt([0,0,5],[0,0,-10],[0,1,0]),u=h(w,b);t.viewport(0,0,x.width,x.height),t.clearColor(.01,.01,.03,1),t.clear(t.COLOR_BUFFER_BIT|t.DEPTH_BUFFER_BIT),t.disable(t.DEPTH_TEST),t.useProgram(y),t.uniform1f(E.u_time,o),t.uniform2f(E.u_resolution,x.width,x.height),t.uniform1f(E.u_rotX,P),t.uniform1f(E.u_rotY,W),t.uniform1f(E.u_rotXW,T.xw),t.uniform1f(E.u_rotYW,T.yw),t.uniform1f(E.u_rotZW,T.zw),t.uniform1f(E.u_dimension,3.5),t.uniform1f(E.u_bass,r.bass),t.uniform1f(E.u_mid,r.mid),t.uniform1f(E.u_gridDensity,12),t.uniform1f(E.u_moireScale,k),t.bindVertexArray(st),t.drawArrays(t.TRIANGLES,0,6),t.enable(t.DEPTH_TEST);const D=Lt(o,r);t.bindBuffer(t.ARRAY_BUFFER,nt),t.bufferData(t.ARRAY_BUFFER,m,t.DYNAMIC_DRAW),t.useProgram(p),t.uniformMatrix4fv(f.u_viewProj,!1,u),t.uniform1i(f.u_cameraTexture,0),t.uniform1f(f.u_time,o),t.uniform1f(f.u_bass,r.bass),t.uniform1f(f.u_energy,r.energy),t.uniform1f(f.u_glitch,n),t.uniform1f(f.u_moireScale,k),t.uniform1f(f.u_rotXW,T.xw),t.uniform1f(f.u_rotYW,T.yw),t.uniform1f(f.u_rotZW,T.zw),t.uniform1f(f.u_dimension,3.5),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,$),t.bindVertexArray(at),t.drawElementsInstanced(t.TRIANGLES,36,t.UNSIGNED_SHORT,0,D);const i=Pt(o,r);if(t.bindBuffer(t.ARRAY_BUFFER,lt),t.bufferData(t.ARRAY_BUFFER,F,t.DYNAMIC_DRAW),t.enable(t.BLEND),t.blendFunc(t.SRC_ALPHA,t.ONE),t.depthMask(!1),t.useProgram(O),t.uniformMatrix4fv(B.u_viewProj,!1,u),t.uniform1f(B.u_pointScale,x.height*.5),t.bindVertexArray(ut),t.drawArrays(t.POINTS,0,i),t.depthMask(!0),t.disable(t.BLEND),t.bindVertexArray(null),ot){const l=K?"CAM":"NO-CAM",a=N?"GYRO":"MOUSE";ot.textContent=`${D} cubes | ${(i/1e3).toFixed(0)}K splats | ${l} | ${a} | 4D: ${T.xw.toFixed(1)},${T.yw.toFixed(1)},${T.zw.toFixed(1)}`}}document.getElementById("startBtn").addEventListener("click",async()=>{document.getElementById("startOverlay").classList.add("hidden"),Dt(),await Promise.all([Rt(),yt()]),requestAnimationFrame(_t)});window.addEventListener("resize",()=>{x.width=window.innerWidth*devicePixelRatio,x.height=window.innerHeight*devicePixelRatio});
