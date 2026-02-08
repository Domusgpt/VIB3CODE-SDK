const vt=1.3247179572447458,d=document.getElementById("gl");d.width=window.innerWidth*devicePixelRatio;d.height=window.innerHeight*devicePixelRatio;d.style.width="100vw";d.style.height="100vh";const t=d.getContext("webgl2",{depth:!0,antialias:!0,alpha:!1,premultipliedAlpha:!1});if(!t)throw new Error("WebGL2 required");const ht=`#version 300 es
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
`,gt=`#version 300 es
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
`,At=`#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.999, 1.0);
}
`,pt=`#version 300 es
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
`,bt=`#version 300 es
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
`,wt=`#version 300 es
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
`;function k(e,o){const r=t.createShader(e);return t.shaderSource(r,o),t.compileShader(r),t.getShaderParameter(r,t.COMPILE_STATUS)?r:(console.error(t.getShaderInfoLog(r)),null)}function q(e,o){const r=k(t.VERTEX_SHADER,e),a=k(t.FRAGMENT_SHADER,o),i=t.createProgram();return t.attachShader(i,r),t.attachShader(i,a),t.linkProgram(i),t.getProgramParameter(i,t.LINK_STATUS)||console.error(t.getProgramInfoLog(i)),i}const f=q(ht,gt),v=q(At,pt),T=q(bt,wt),c={a_position:t.getAttribLocation(f,"a_position"),a_uv:t.getAttribLocation(f,"a_uv"),a_normal:t.getAttribLocation(f,"a_normal"),a_model:t.getAttribLocation(f,"a_model"),a_brightness:t.getAttribLocation(f,"a_brightness"),a_hueShift:t.getAttribLocation(f,"a_hueShift"),a_wCoord:t.getAttribLocation(f,"a_wCoord"),u_viewProj:t.getUniformLocation(f,"u_viewProj"),u_cameraTexture:t.getUniformLocation(f,"u_cameraTexture"),u_time:t.getUniformLocation(f,"u_time"),u_bass:t.getUniformLocation(f,"u_bass"),u_energy:t.getUniformLocation(f,"u_energy"),u_glitch:t.getUniformLocation(f,"u_glitch"),u_moireScale:t.getUniformLocation(f,"u_moireScale"),u_rotXW:t.getUniformLocation(f,"u_rotXW"),u_rotYW:t.getUniformLocation(f,"u_rotYW"),u_rotZW:t.getUniformLocation(f,"u_rotZW"),u_dimension:t.getUniformLocation(f,"u_dimension")},h={a_position:t.getAttribLocation(v,"a_position"),u_time:t.getUniformLocation(v,"u_time"),u_resolution:t.getUniformLocation(v,"u_resolution"),u_rotX:t.getUniformLocation(v,"u_rotX"),u_rotY:t.getUniformLocation(v,"u_rotY"),u_rotXW:t.getUniformLocation(v,"u_rotXW"),u_rotYW:t.getUniformLocation(v,"u_rotYW"),u_rotZW:t.getUniformLocation(v,"u_rotZW"),u_dimension:t.getUniformLocation(v,"u_dimension"),u_bass:t.getUniformLocation(v,"u_bass"),u_mid:t.getUniformLocation(v,"u_mid"),u_gridDensity:t.getUniformLocation(v,"u_gridDensity"),u_moireScale:t.getUniformLocation(v,"u_moireScale")},R={a_position:t.getAttribLocation(T,"a_position"),a_color:t.getAttribLocation(T,"a_color"),a_size:t.getAttribLocation(T,"a_size"),u_viewProj:t.getUniformLocation(T,"u_viewProj"),u_pointScale:t.getUniformLocation(T,"u_pointScale")},xt=new Float32Array([-.5,-.5,.5,0,0,0,0,1,.5,-.5,.5,1,0,0,0,1,.5,.5,.5,1,1,0,0,1,-.5,.5,.5,0,1,0,0,1,.5,-.5,-.5,0,0,0,0,-1,-.5,-.5,-.5,1,0,0,0,-1,-.5,.5,-.5,1,1,0,0,-1,.5,.5,-.5,0,1,0,0,-1,-.5,.5,.5,0,0,0,1,0,.5,.5,.5,1,0,0,1,0,.5,.5,-.5,1,1,0,1,0,-.5,.5,-.5,0,1,0,1,0,-.5,-.5,-.5,0,0,0,-1,0,.5,-.5,-.5,1,0,0,-1,0,.5,-.5,.5,1,1,0,-1,0,-.5,-.5,.5,0,1,0,-1,0,.5,-.5,.5,0,0,1,0,0,.5,-.5,-.5,1,0,1,0,0,.5,.5,-.5,1,1,1,0,0,.5,.5,.5,0,1,1,0,0,-.5,-.5,-.5,0,0,-1,0,0,-.5,-.5,.5,1,0,-1,0,0,-.5,.5,.5,1,1,-1,0,0,-.5,.5,-.5,0,1,-1,0,0]),yt=new Uint16Array([0,1,2,0,2,3,4,5,6,4,6,7,8,9,10,8,10,11,12,13,14,12,14,15,16,17,18,16,18,19,20,21,22,20,22,23]),ot=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,ot);t.bufferData(t.ARRAY_BUFFER,xt,t.STATIC_DRAW);const rt=t.createBuffer();t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,rt);t.bufferData(t.ELEMENT_ARRAY_BUFFER,yt,t.STATIC_DRAW);const G=500,C=19,x=new Float32Array(G*C),it=t.createBuffer(),at=t.createVertexArray();t.bindVertexArray(at);t.bindBuffer(t.ARRAY_BUFFER,ot);t.enableVertexAttribArray(c.a_position);t.vertexAttribPointer(c.a_position,3,t.FLOAT,!1,32,0);t.enableVertexAttribArray(c.a_uv);t.vertexAttribPointer(c.a_uv,2,t.FLOAT,!1,32,12);t.enableVertexAttribArray(c.a_normal);t.vertexAttribPointer(c.a_normal,3,t.FLOAT,!1,32,20);t.bindBuffer(t.ARRAY_BUFFER,it);const I=C*4;for(let e=0;e<4;e++)t.enableVertexAttribArray(c.a_model+e),t.vertexAttribPointer(c.a_model+e,4,t.FLOAT,!1,I,e*16),t.vertexAttribDivisor(c.a_model+e,1);t.enableVertexAttribArray(c.a_brightness);t.vertexAttribPointer(c.a_brightness,1,t.FLOAT,!1,I,64);t.vertexAttribDivisor(c.a_brightness,1);t.enableVertexAttribArray(c.a_hueShift);t.vertexAttribPointer(c.a_hueShift,1,t.FLOAT,!1,I,68);t.vertexAttribDivisor(c.a_hueShift,1);t.enableVertexAttribArray(c.a_wCoord);t.vertexAttribPointer(c.a_wCoord,1,t.FLOAT,!1,I,72);t.vertexAttribDivisor(c.a_wCoord,1);t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,rt);t.bindVertexArray(null);const Et=new Float32Array([-1,-1,1,-1,-1,1,1,-1,1,1,-1,1]),Rt=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,Rt);t.bufferData(t.ARRAY_BUFFER,Et,t.STATIC_DRAW);const nt=t.createVertexArray();t.bindVertexArray(nt);t.enableVertexAttribArray(h.a_position);t.vertexAttribPointer(h.a_position,2,t.FLOAT,!1,0,0);t.bindVertexArray(null);const ct=4e4,y=new Float32Array(ct*7),st=t.createBuffer(),lt=t.createVertexArray();t.bindVertexArray(lt);t.bindBuffer(t.ARRAY_BUFFER,st);t.enableVertexAttribArray(R.a_position);t.vertexAttribPointer(R.a_position,3,t.FLOAT,!1,28,0);t.enableVertexAttribArray(R.a_color);t.vertexAttribPointer(R.a_color,3,t.FLOAT,!1,28,12);t.enableVertexAttribArray(R.a_size);t.vertexAttribPointer(R.a_size,1,t.FLOAT,!1,28,24);t.bindVertexArray(null);const Z=t.createTexture();t.bindTexture(t.TEXTURE_2D,Z);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);t.texImage2D(t.TEXTURE_2D,0,t.RGBA,1,1,0,t.RGBA,t.UNSIGNED_BYTE,new Uint8Array([100,100,120,255]));let N=null,D=null,L=new Uint8Array(128),ut=!1;async function Dt(){try{N=new(window.AudioContext||window.webkitAudioContext);const e=await navigator.mediaDevices.getUserMedia({audio:!0}),o=N.createMediaStreamSource(e);D=N.createAnalyser(),D.fftSize=256,D.smoothingTimeConstant=.8,o.connect(D),L=new Uint8Array(D.frequencyBinCount),ut=!0}catch(e){console.warn("Audio unavailable:",e)}}function Tt(){if(!ut||!D)return{bass:0,mid:0,high:0,energy:0};D.getByteFrequencyData(L);const e=L.length;let o=0,r=0,a=0;for(let i=0;i<e*.15;i++)o+=L[i];for(let i=Math.floor(e*.15);i<e*.5;i++)r+=L[i];for(let i=Math.floor(e*.5);i<e;i++)a+=L[i];return o=o/(e*.15)/255,r=r/(e*.35)/255,a=a/(e*.5)/255,{bass:o,mid:r,high:a,energy:(o+r+a)/3}}let H=!1;const F=document.createElement("video");F.playsInline=!0;F.muted=!0;async function Lt(){try{const e=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:512},height:{ideal:512}}});F.srcObject=e,await F.play(),H=!0}catch(e){console.warn("Camera unavailable:",e)}}let S=0,P=0,Y=0,z=0,M=!1;function St(){typeof DeviceOrientationEvent<"u"&&(typeof DeviceOrientationEvent.requestPermission=="function"?DeviceOrientationEvent.requestPermission().then(e=>{e==="granted"&&(window.addEventListener("deviceorientation",$),M=!0)}).catch(console.error):(window.addEventListener("deviceorientation",$),M=!0))}function $(e){e.beta!==null&&e.gamma!==null&&(Y=e.beta/90*Math.PI,z=e.gamma/45*Math.PI)}d.addEventListener("mousemove",e=>{if(M)return;const o=e.clientX/window.innerWidth;Y=(e.clientY/window.innerHeight-.5)*Math.PI*2,z=(o-.5)*Math.PI*2});d.addEventListener("touchmove",e=>{if(M)return;const o=e.touches[0],r=o.clientX/window.innerWidth;Y=(o.clientY/window.innerHeight-.5)*Math.PI*2,z=(r-.5)*Math.PI*2,e.preventDefault()},{passive:!1});function Pt(e,o,r,a){const i=1/Math.tan(e/2),_=1/(r-a);return new Float32Array([i/o,0,0,0,0,i,0,0,0,0,(a+r)*_,-1,0,0,2*a*r*_,0])}function Ft(e,o,r){const a=e[0]-o[0],i=e[1]-o[1],_=e[2]-o[2];let s=1/Math.sqrt(a*a+i*i+_*_);const n=[a*s,i*s,_*s],m=r[1]*n[2]-r[2]*n[1],l=r[2]*n[0]-r[0]*n[2],A=r[0]*n[1]-r[1]*n[0];s=1/Math.sqrt(m*m+l*l+A*A);const u=[m*s,l*s,A*s],p=[n[1]*u[2]-n[2]*u[1],n[2]*u[0]-n[0]*u[2],n[0]*u[1]-n[1]*u[0]];return new Float32Array([u[0],p[0],n[0],0,u[1],p[1],n[1],0,u[2],p[2],n[2],0,-(u[0]*e[0]+u[1]*e[1]+u[2]*e[2]),-(p[0]*e[0]+p[1]*e[1]+p[2]*e[2]),-(n[0]*e[0]+n[1]*e[1]+n[2]*e[2]),1])}function E(e,o){const r=new Float32Array(16);for(let a=0;a<4;a++)for(let i=0;i<4;i++)r[i*4+a]=e[a]*o[i*4]+e[a+4]*o[i*4+1]+e[a+8]*o[i*4+2]+e[a+12]*o[i*4+3];return r}function K(e,o,r){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,e,o,r,1])}function J(e){return new Float32Array([e,0,0,0,0,e,0,0,0,0,e,0,0,0,0,1])}function Q(e){const o=Math.cos(e),r=Math.sin(e);return new Float32Array([1,0,0,0,0,o,r,0,0,-r,o,0,0,0,0,1])}function tt(e){const o=Math.cos(e),r=Math.sin(e);return new Float32Array([o,0,-r,0,0,1,0,0,r,0,o,0,0,0,0,1])}function Mt(e){const o=Math.cos(e),r=Math.sin(e);return new Float32Array([o,r,0,0,-r,o,0,0,0,0,1,0,0,0,0,1])}function Ut(e,o,r){let a=0;const i=4,_=20;for(let s=0;s<i;s++){const n=s/i*Math.PI*2;for(let m=0;m<_&&!(a>=G);m++){const l=m/_,A=n+m*(Math.PI*2/(vt*2.5))+e*.08,u=.15+l*l*8,p=Math.cos(A)*u,X=Math.sin(A)*u,O=-35+l*30,U=Math.sin(l*Math.PI*2+e*.5+s)*1.5,b=.04+l*l*.25,V=.2+o.bass*.3,_t=e*V*.3+S*.2+m*.15,mt=e*V*.25+P*.2+s*1.57,dt=e*V*.1;let w=K(p,X,O);w=E(w,Q(_t)),w=E(w,tt(mt)),w=E(w,Mt(dt)),w=E(w,J(b));const W=a*C;for(let B=0;B<16;B++)x[W+B]=w[B];x[W+16]=(.4+l*.6)*(1+o.bass*.3),x[W+17]=o.mid*.2+U*.04,x[W+18]=U,a++}}if(a<G){const s=a*C;let n=K(0,0,-8);n=E(n,Q(e*.06+S*.4+o.bass*.2)),n=E(n,tt(e*.08+P*.4));const m=.35+o.bass*.1;n=E(n,J(m));for(let l=0;l<16;l++)x[s+l]=n[l];x[s+16]=1.4,x[s+17]=o.mid*.1,x[s+18]=Math.sin(e*.25)*1.2,a++}return a}function Wt(e,o){let r=0;const a=25e3;for(let i=0;i<a&&r<ct;i++){const _=i/a,s=_*Math.PI*18+e*.15,n=.4+_*6,m=-28+_*30,l=Math.cos(s)*n*(.4+Math.random()*.6),A=Math.sin(s)*n*(.4+Math.random()*.6),u=_+o.mid*.25,p=.2+Math.sin(u*6.28)*.25+o.bass*.25,X=.3+Math.sin(u*6.28+2.09)*.25,O=.6+Math.sin(u*6.28+4.18)*.3+o.high*.25,U=(.015+Math.random()*.03)*(1+o.energy*.4),b=r*7;y[b]=l,y[b+1]=A,y[b+2]=m,y[b+3]=p,y[b+4]=X,y[b+5]=O,y[b+6]=U,r++}return r}const Bt=performance.now(),et=document.getElementById("hud");let g={xw:0,yw:0,zw:0},j=0;function ft(){requestAnimationFrame(ft);const o=(performance.now()-Bt)*.001,r=Tt();S+=(Y-S)*.08,P+=(z-P)*.08,g.xw=S*.5+Math.sin(o*.15)*.3+r.bass*.4,g.yw=P*.5+Math.cos(o*.12)*.25+r.mid*.3,g.zw=Math.sin(o*.1)*.2+r.high*.2,j=1.01+Math.sin(o*1.5)*.005+Math.sin(o*.7)*.003;const a=.1+r.high*.5;H&&F.readyState>=2&&(t.bindTexture(t.TEXTURE_2D,Z),t.texImage2D(t.TEXTURE_2D,0,t.RGBA,t.RGBA,t.UNSIGNED_BYTE,F));const i=d.width/d.height,_=Pt(70*Math.PI/180,i,.1,100),s=Ft([0,0,5],[0,0,-10],[0,1,0]),n=E(_,s);t.viewport(0,0,d.width,d.height),t.clearColor(.01,.01,.03,1),t.clear(t.COLOR_BUFFER_BIT|t.DEPTH_BUFFER_BIT),t.disable(t.DEPTH_TEST),t.useProgram(v),t.uniform1f(h.u_time,o),t.uniform2f(h.u_resolution,d.width,d.height),t.uniform1f(h.u_rotX,S),t.uniform1f(h.u_rotY,P),t.uniform1f(h.u_rotXW,g.xw),t.uniform1f(h.u_rotYW,g.yw),t.uniform1f(h.u_rotZW,g.zw),t.uniform1f(h.u_dimension,3.5),t.uniform1f(h.u_bass,r.bass),t.uniform1f(h.u_mid,r.mid),t.uniform1f(h.u_gridDensity,12),t.uniform1f(h.u_moireScale,j),t.bindVertexArray(nt),t.drawArrays(t.TRIANGLES,0,6),t.enable(t.DEPTH_TEST);const m=Ut(o,r);t.bindBuffer(t.ARRAY_BUFFER,it),t.bufferData(t.ARRAY_BUFFER,x,t.DYNAMIC_DRAW),t.useProgram(f),t.uniformMatrix4fv(c.u_viewProj,!1,n),t.uniform1i(c.u_cameraTexture,0),t.uniform1f(c.u_time,o),t.uniform1f(c.u_bass,r.bass),t.uniform1f(c.u_energy,r.energy),t.uniform1f(c.u_glitch,a),t.uniform1f(c.u_moireScale,j),t.uniform1f(c.u_rotXW,g.xw),t.uniform1f(c.u_rotYW,g.yw),t.uniform1f(c.u_rotZW,g.zw),t.uniform1f(c.u_dimension,3.5),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,Z),t.bindVertexArray(at),t.drawElementsInstanced(t.TRIANGLES,36,t.UNSIGNED_SHORT,0,m);const l=Wt(o,r);if(t.bindBuffer(t.ARRAY_BUFFER,st),t.bufferData(t.ARRAY_BUFFER,y,t.DYNAMIC_DRAW),t.enable(t.BLEND),t.blendFunc(t.SRC_ALPHA,t.ONE),t.depthMask(!1),t.useProgram(T),t.uniformMatrix4fv(R.u_viewProj,!1,n),t.uniform1f(R.u_pointScale,d.height*.5),t.bindVertexArray(lt),t.drawArrays(t.POINTS,0,l),t.depthMask(!0),t.disable(t.BLEND),t.bindVertexArray(null),et){const A=H?"CAM":"NO-CAM",u=M?"GYRO":"MOUSE";et.textContent=`${m} cubes | ${(l/1e3).toFixed(0)}K splats | ${A} | ${u} | 4D: ${g.xw.toFixed(1)},${g.yw.toFixed(1)},${g.zw.toFixed(1)}`}}document.getElementById("startBtn").addEventListener("click",async()=>{document.getElementById("startOverlay").classList.add("hidden"),St(),await Promise.all([Lt(),Dt()]),requestAnimationFrame(ft)});window.addEventListener("resize",()=>{d.width=window.innerWidth*devicePixelRatio,d.height=window.innerHeight*devicePixelRatio});
