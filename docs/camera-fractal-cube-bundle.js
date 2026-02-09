const v=document.getElementById("gl");v.width=window.innerWidth*devicePixelRatio;v.height=window.innerHeight*devicePixelRatio;v.style.width="100vw";v.style.height="100vh";const t=v.getContext("webgl2",{depth:!0,antialias:!0,alpha:!1,premultipliedAlpha:!1});if(!t)throw new Error("WebGL2 required");const dt=`#version 300 es
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
`,vt=`#version 300 es
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
`,gt=`#version 300 es
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
`,At=`#version 300 es
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
`;function tt(e,o){const r=t.createShader(e);return t.shaderSource(r,o),t.compileShader(r),t.getShaderParameter(r,t.COMPILE_STATUS)?r:(console.error(t.getShaderInfoLog(r)),null)}function Q(e,o){const r=tt(t.VERTEX_SHADER,e),a=tt(t.FRAGMENT_SHADER,o),n=t.createProgram();return t.attachShader(n,r),t.attachShader(n,a),t.linkProgram(n),t.getProgramParameter(n,t.LINK_STATUS)||console.error(t.getProgramInfoLog(n)),n}const _=Q(dt,vt),A=Q(ht,gt),W=Q(At,pt),c={a_position:t.getAttribLocation(_,"a_position"),a_uv:t.getAttribLocation(_,"a_uv"),a_normal:t.getAttribLocation(_,"a_normal"),a_model:t.getAttribLocation(_,"a_model"),a_brightness:t.getAttribLocation(_,"a_brightness"),a_hueShift:t.getAttribLocation(_,"a_hueShift"),a_wCoord:t.getAttribLocation(_,"a_wCoord"),u_viewProj:t.getUniformLocation(_,"u_viewProj"),u_cameraTexture:t.getUniformLocation(_,"u_cameraTexture"),u_time:t.getUniformLocation(_,"u_time"),u_bass:t.getUniformLocation(_,"u_bass"),u_energy:t.getUniformLocation(_,"u_energy"),u_glitch:t.getUniformLocation(_,"u_glitch"),u_moireScale:t.getUniformLocation(_,"u_moireScale"),u_rotXW:t.getUniformLocation(_,"u_rotXW"),u_rotYW:t.getUniformLocation(_,"u_rotYW"),u_rotZW:t.getUniformLocation(_,"u_rotZW"),u_dimension:t.getUniformLocation(_,"u_dimension")},p={a_position:t.getAttribLocation(A,"a_position"),u_time:t.getUniformLocation(A,"u_time"),u_resolution:t.getUniformLocation(A,"u_resolution"),u_rotX:t.getUniformLocation(A,"u_rotX"),u_rotY:t.getUniformLocation(A,"u_rotY"),u_rotXW:t.getUniformLocation(A,"u_rotXW"),u_rotYW:t.getUniformLocation(A,"u_rotYW"),u_rotZW:t.getUniformLocation(A,"u_rotZW"),u_dimension:t.getUniformLocation(A,"u_dimension"),u_bass:t.getUniformLocation(A,"u_bass"),u_mid:t.getUniformLocation(A,"u_mid"),u_gridDensity:t.getUniformLocation(A,"u_gridDensity"),u_moireScale:t.getUniformLocation(A,"u_moireScale")},D={a_position:t.getAttribLocation(W,"a_position"),a_color:t.getAttribLocation(W,"a_color"),a_size:t.getAttribLocation(W,"a_size"),u_viewProj:t.getUniformLocation(W,"u_viewProj"),u_pointScale:t.getUniformLocation(W,"u_pointScale")},bt=new Float32Array([-.5,-.5,.5,0,0,0,0,1,.5,-.5,.5,1,0,0,0,1,.5,.5,.5,1,1,0,0,1,-.5,.5,.5,0,1,0,0,1,.5,-.5,-.5,0,0,0,0,-1,-.5,-.5,-.5,1,0,0,0,-1,-.5,.5,-.5,1,1,0,0,-1,.5,.5,-.5,0,1,0,0,-1,-.5,.5,.5,0,0,0,1,0,.5,.5,.5,1,0,0,1,0,.5,.5,-.5,1,1,0,1,0,-.5,.5,-.5,0,1,0,1,0,-.5,-.5,-.5,0,0,0,-1,0,.5,-.5,-.5,1,0,0,-1,0,.5,-.5,.5,1,1,0,-1,0,-.5,-.5,.5,0,1,0,-1,0,.5,-.5,.5,0,0,1,0,0,.5,-.5,-.5,1,0,1,0,0,.5,.5,-.5,1,1,1,0,0,.5,.5,.5,0,1,1,0,0,-.5,-.5,-.5,0,0,-1,0,0,-.5,-.5,.5,1,0,-1,0,0,-.5,.5,.5,1,1,-1,0,0,-.5,.5,-.5,0,1,-1,0,0]),wt=new Uint16Array([0,1,2,0,2,3,4,5,6,4,6,7,8,9,10,8,10,11,12,13,14,12,14,15,16,17,18,16,18,19,20,21,22,20,22,23]),rt=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,rt);t.bufferData(t.ARRAY_BUFFER,bt,t.STATIC_DRAW);const it=t.createBuffer();t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,it);t.bufferData(t.ELEMENT_ARRAY_BUFFER,wt,t.STATIC_DRAW);const Y=500,z=19,w=new Float32Array(Y*z),nt=t.createBuffer(),at=t.createVertexArray();t.bindVertexArray(at);t.bindBuffer(t.ARRAY_BUFFER,rt);t.enableVertexAttribArray(c.a_position);t.vertexAttribPointer(c.a_position,3,t.FLOAT,!1,32,0);t.enableVertexAttribArray(c.a_uv);t.vertexAttribPointer(c.a_uv,2,t.FLOAT,!1,32,12);t.enableVertexAttribArray(c.a_normal);t.vertexAttribPointer(c.a_normal,3,t.FLOAT,!1,32,20);t.bindBuffer(t.ARRAY_BUFFER,nt);const V=z*4;for(let e=0;e<4;e++)t.enableVertexAttribArray(c.a_model+e),t.vertexAttribPointer(c.a_model+e,4,t.FLOAT,!1,V,e*16),t.vertexAttribDivisor(c.a_model+e,1);t.enableVertexAttribArray(c.a_brightness);t.vertexAttribPointer(c.a_brightness,1,t.FLOAT,!1,V,64);t.vertexAttribDivisor(c.a_brightness,1);t.enableVertexAttribArray(c.a_hueShift);t.vertexAttribPointer(c.a_hueShift,1,t.FLOAT,!1,V,68);t.vertexAttribDivisor(c.a_hueShift,1);t.enableVertexAttribArray(c.a_wCoord);t.vertexAttribPointer(c.a_wCoord,1,t.FLOAT,!1,V,72);t.vertexAttribDivisor(c.a_wCoord,1);t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,it);t.bindVertexArray(null);const xt=new Float32Array([-1,-1,1,-1,-1,1,1,-1,1,1,-1,1]),yt=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,yt);t.bufferData(t.ARRAY_BUFFER,xt,t.STATIC_DRAW);const ct=t.createVertexArray();t.bindVertexArray(ct);t.enableVertexAttribArray(p.a_position);t.vertexAttribPointer(p.a_position,2,t.FLOAT,!1,0,0);t.bindVertexArray(null);const st=4e4,R=new Float32Array(st*7),lt=t.createBuffer(),ut=t.createVertexArray();t.bindVertexArray(ut);t.bindBuffer(t.ARRAY_BUFFER,lt);t.enableVertexAttribArray(D.a_position);t.vertexAttribPointer(D.a_position,3,t.FLOAT,!1,28,0);t.enableVertexAttribArray(D.a_color);t.vertexAttribPointer(D.a_color,3,t.FLOAT,!1,28,12);t.enableVertexAttribArray(D.a_size);t.vertexAttribPointer(D.a_size,1,t.FLOAT,!1,28,24);t.bindVertexArray(null);const K=t.createTexture();t.bindTexture(t.TEXTURE_2D,K);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);t.texImage2D(t.TEXTURE_2D,0,t.RGBA,1,1,0,t.RGBA,t.UNSIGNED_BYTE,new Uint8Array([100,100,120,255]));let G=null,P=null,C=new Uint8Array(128),ft=!1;async function Et(){try{G=new(window.AudioContext||window.webkitAudioContext);const e=await navigator.mediaDevices.getUserMedia({audio:!0}),o=G.createMediaStreamSource(e);P=G.createAnalyser(),P.fftSize=256,P.smoothingTimeConstant=.8,o.connect(P),C=new Uint8Array(P.frequencyBinCount),ft=!0}catch(e){console.warn("Audio unavailable:",e)}}function Rt(){if(!ft||!P)return{bass:0,mid:0,high:0,energy:0};P.getByteFrequencyData(C);const e=C.length;let o=0,r=0,a=0;for(let n=0;n<e*.15;n++)o+=C[n];for(let n=Math.floor(e*.15);n<e*.5;n++)r+=C[n];for(let n=Math.floor(e*.5);n<e;n++)a+=C[n];return o=o/(e*.15)/255,r=r/(e*.35)/255,a=a/(e*.5)/255,{bass:o,mid:r,high:a,energy:(o+r+a)/3}}let J=!1;const B=document.createElement("video");B.playsInline=!0;B.muted=!0;async function Dt(){try{const e=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:512},height:{ideal:512}}});B.srcObject=e,await B.play(),J=!0}catch(e){console.warn("Camera unavailable:",e)}}let S=0,F=0,N=0,j=0,I=!1;function Tt(){typeof DeviceOrientationEvent<"u"&&(typeof DeviceOrientationEvent.requestPermission=="function"?DeviceOrientationEvent.requestPermission().then(e=>{e==="granted"&&(window.addEventListener("deviceorientation",et),I=!0)}).catch(console.error):(window.addEventListener("deviceorientation",et),I=!0))}function et(e){e.beta!==null&&e.gamma!==null&&(N=e.beta/90*Math.PI,j=e.gamma/45*Math.PI)}v.addEventListener("mousemove",e=>{if(I)return;const o=e.clientX/window.innerWidth;N=(e.clientY/window.innerHeight-.5)*Math.PI*2,j=(o-.5)*Math.PI*2});v.addEventListener("touchmove",e=>{if(I)return;const o=e.touches[0],r=o.clientX/window.innerWidth;N=(o.clientY/window.innerHeight-.5)*Math.PI*2,j=(r-.5)*Math.PI*2,e.preventDefault()},{passive:!1});function Lt(e,o,r,a){const n=1/Math.tan(e/2),d=1/(r-a);return new Float32Array([n/o,0,0,0,0,n,0,0,0,0,(a+r)*d,-1,0,0,2*a*r*d,0])}function Pt(e,o,r){const a=e[0]-o[0],n=e[1]-o[1],d=e[2]-o[2];let h=1/Math.sqrt(a*a+n*n+d*d);const i=[a*h,n*h,d*h],u=r[1]*i[2]-r[2]*i[1],m=r[2]*i[0]-r[0]*i[2],f=r[0]*i[1]-r[1]*i[0];h=1/Math.sqrt(u*u+m*m+f*f);const s=[u*h,m*h,f*h],g=[i[1]*s[2]-i[2]*s[1],i[2]*s[0]-i[0]*s[2],i[0]*s[1]-i[1]*s[0]];return new Float32Array([s[0],g[0],i[0],0,s[1],g[1],i[1],0,s[2],g[2],i[2],0,-(s[0]*e[0]+s[1]*e[1]+s[2]*e[2]),-(g[0]*e[0]+g[1]*e[1]+g[2]*e[2]),-(i[0]*e[0]+i[1]*e[1]+i[2]*e[2]),1])}function E(e,o){const r=new Float32Array(16);for(let a=0;a<4;a++)for(let n=0;n<4;n++)r[n*4+a]=e[a]*o[n*4]+e[a+4]*o[n*4+1]+e[a+8]*o[n*4+2]+e[a+12]*o[n*4+3];return r}function Z(e,o,r){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,e,o,r,1])}function H(e){return new Float32Array([e,0,0,0,0,e,0,0,0,0,e,0,0,0,0,1])}function q(e){const o=Math.cos(e),r=Math.sin(e);return new Float32Array([1,0,0,0,0,o,r,0,0,-r,o,0,0,0,0,1])}function k(e){const o=Math.cos(e),r=Math.sin(e);return new Float32Array([o,0,-r,0,0,1,0,0,r,0,o,0,0,0,0,1])}function St(e,o,r){let a=0;const n=[[-2,-1.5,-2],[2,-1.5,-2],[-2,1.5,-2],[2,1.5,-2],[-2.5,0,-2.5],[2.5,0,-2.5],[0,-2,-2],[0,2,-2],[-1.3,-1,-1.5],[1.3,-1,-1.5],[-1.3,1,-1.5],[1.3,1,-1.5]];for(let i=0;i<n.length&&a<Y;i++){const[u,m,f]=n[i],s=Math.sin(e*.25+i*.5)*.7,g=e*.1+S*.4+i*.4,T=e*.08+F*.4+i*.3;let b=Z(u,m,f);b=E(b,q(g)),b=E(b,k(T)),b=E(b,H(.7+o.bass*.15));const y=a*z;for(let l=0;l<16;l++)w[y+l]=b[l];w[y+16]=1.4,w[y+17]=o.mid*.08,w[y+18]=s,a++}const d=6,h=10;for(let i=0;i<d&&a<Y;i++){const u=i/d*Math.PI*2+e*.03;for(let m=0;m<h&&a<Y;m++){const f=m/h,s=u+f*1.2,g=1.2+f*2,T=Math.cos(s)*g,b=Math.sin(s)*g,y=-4-f*6,l=Math.sin(f*6.28+e*.35+i)*.9,M=.45-f*.2,U=e*.12+S*.3+m*.15+i*.5,mt=e*.1+F*.3+i*1.05;let L=Z(T,b,y);L=E(L,q(U)),L=E(L,k(mt)),L=E(L,H(M));const X=a*z;for(let O=0;O<16;O++)w[X+O]=L[O];w[X+16]=(.7+(1-f)*.3)*(1+o.bass*.2),w[X+17]=o.mid*.1+l*.02,w[X+18]=l,a++}}for(let i=0;i<20&&a<Y;i++){const u=i/20,m=u*Math.PI*5+e*.06,f=.2+u*.8,s=Math.cos(m)*f,g=Math.sin(m)*f,T=-8-u*10,b=.3-u*.18,y=Math.sin(u*9.42+e*.4)*.5;let l=Z(s,g,T);l=E(l,q(e*.06+S*.15+i*.25)),l=E(l,k(e*.08+F*.15)),l=E(l,H(b));const M=a*z;for(let U=0;U<16;U++)w[M+U]=l[U];w[M+16]=.5+(1-u)*.5,w[M+17]=o.mid*.06,w[M+18]=y,a++}return a}function Ft(e,o){let r=0;const a=25e3;for(let n=0;n<a&&r<st;n++){const d=n/a,h=d*Math.PI*18+e*.15,i=.4+d*6,u=-28+d*30,m=Math.cos(h)*i*(.4+Math.random()*.6),f=Math.sin(h)*i*(.4+Math.random()*.6),s=d+o.mid*.25,g=.2+Math.sin(s*6.28)*.25+o.bass*.25,T=.3+Math.sin(s*6.28+2.09)*.25,b=.6+Math.sin(s*6.28+4.18)*.3+o.high*.25,y=(.015+Math.random()*.03)*(1+o.energy*.4),l=r*7;R[l]=m,R[l+1]=f,R[l+2]=u,R[l+3]=g,R[l+4]=T,R[l+5]=b,R[l+6]=y,r++}return r}const Mt=performance.now(),ot=document.getElementById("hud");let x={xw:0,yw:0,zw:0},$=0;function _t(){requestAnimationFrame(_t);const o=(performance.now()-Mt)*.001,r=Rt();S+=(N-S)*.08,F+=(j-F)*.08,x.xw=S*.5+Math.sin(o*.15)*.3+r.bass*.4,x.yw=F*.5+Math.cos(o*.12)*.25+r.mid*.3,x.zw=Math.sin(o*.1)*.2+r.high*.2,$=1.01+Math.sin(o*1.5)*.005+Math.sin(o*.7)*.003;const a=.1+r.high*.5;J&&B.readyState>=2&&(t.bindTexture(t.TEXTURE_2D,K),t.texImage2D(t.TEXTURE_2D,0,t.RGBA,t.RGBA,t.UNSIGNED_BYTE,B));const n=v.width/v.height,d=Lt(70*Math.PI/180,n,.1,100),h=Pt([0,0,5],[0,0,-10],[0,1,0]),i=E(d,h);t.viewport(0,0,v.width,v.height),t.clearColor(.01,.01,.03,1),t.clear(t.COLOR_BUFFER_BIT|t.DEPTH_BUFFER_BIT),t.disable(t.DEPTH_TEST),t.useProgram(A),t.uniform1f(p.u_time,o),t.uniform2f(p.u_resolution,v.width,v.height),t.uniform1f(p.u_rotX,S),t.uniform1f(p.u_rotY,F),t.uniform1f(p.u_rotXW,x.xw),t.uniform1f(p.u_rotYW,x.yw),t.uniform1f(p.u_rotZW,x.zw),t.uniform1f(p.u_dimension,3.5),t.uniform1f(p.u_bass,r.bass),t.uniform1f(p.u_mid,r.mid),t.uniform1f(p.u_gridDensity,12),t.uniform1f(p.u_moireScale,$),t.bindVertexArray(ct),t.drawArrays(t.TRIANGLES,0,6),t.enable(t.DEPTH_TEST);const u=St(o,r);t.bindBuffer(t.ARRAY_BUFFER,nt),t.bufferData(t.ARRAY_BUFFER,w,t.DYNAMIC_DRAW),t.useProgram(_),t.uniformMatrix4fv(c.u_viewProj,!1,i),t.uniform1i(c.u_cameraTexture,0),t.uniform1f(c.u_time,o),t.uniform1f(c.u_bass,r.bass),t.uniform1f(c.u_energy,r.energy),t.uniform1f(c.u_glitch,a),t.uniform1f(c.u_moireScale,$),t.uniform1f(c.u_rotXW,x.xw),t.uniform1f(c.u_rotYW,x.yw),t.uniform1f(c.u_rotZW,x.zw),t.uniform1f(c.u_dimension,3.5),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,K),t.bindVertexArray(at),t.drawElementsInstanced(t.TRIANGLES,36,t.UNSIGNED_SHORT,0,u);const m=Ft(o,r);if(t.bindBuffer(t.ARRAY_BUFFER,lt),t.bufferData(t.ARRAY_BUFFER,R,t.DYNAMIC_DRAW),t.enable(t.BLEND),t.blendFunc(t.SRC_ALPHA,t.ONE),t.depthMask(!1),t.useProgram(W),t.uniformMatrix4fv(D.u_viewProj,!1,i),t.uniform1f(D.u_pointScale,v.height*.5),t.bindVertexArray(ut),t.drawArrays(t.POINTS,0,m),t.depthMask(!0),t.disable(t.BLEND),t.bindVertexArray(null),ot){const f=J?"CAM":"NO-CAM",s=I?"GYRO":"MOUSE";ot.textContent=`${u} cubes | ${(m/1e3).toFixed(0)}K splats | ${f} | ${s} | 4D: ${x.xw.toFixed(1)},${x.yw.toFixed(1)},${x.zw.toFixed(1)}`}}document.getElementById("startBtn").addEventListener("click",async()=>{document.getElementById("startOverlay").classList.add("hidden"),Tt(),await Promise.all([Dt(),Et()]),requestAnimationFrame(_t)});window.addEventListener("resize",()=>{v.width=window.innerWidth*devicePixelRatio,v.height=window.innerHeight*devicePixelRatio});
