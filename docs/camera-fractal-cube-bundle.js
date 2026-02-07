const rt=1.3247179572447458,d=document.getElementById("gl");d.width=window.innerWidth*devicePixelRatio;d.height=window.innerHeight*devicePixelRatio;d.style.width="100vw";d.style.height="100vh";const t=d.getContext("webgl2",{depth:!0,antialias:!0,alpha:!1,premultipliedAlpha:!1});if(!t)throw new Error("WebGL2 required");const at=`#version 300 es
precision highp float;

// Per-vertex
in vec3 a_position;
in vec2 a_uv;
in vec3 a_normal;

// Per-instance
in mat4 a_model;
in float a_brightness;
in float a_hueShift;

uniform mat4 u_viewProj;
uniform float u_time;

out vec2 v_uv;
out vec3 v_normal;
out float v_brightness;
out float v_hueShift;
out float v_depth;

void main() {
  vec4 worldPos = a_model * vec4(a_position, 1.0);
  gl_Position = u_viewProj * worldPos;
  v_uv = a_uv;
  v_normal = mat3(a_model) * a_normal;
  v_brightness = a_brightness;
  v_hueShift = a_hueShift;
  v_depth = -worldPos.z * 0.02; // For fog
}
`,nt=`#version 300 es
precision highp float;

in vec2 v_uv;
in vec3 v_normal;
in float v_brightness;
in float v_hueShift;
in float v_depth;

uniform sampler2D u_cameraTexture;
uniform float u_time;
uniform float u_bass;
uniform float u_energy;

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

void main() {
  // Sample camera texture
  vec3 camColor = texture(u_cameraTexture, v_uv).rgb;

  // Apply hue shift from audio mid
  if (v_hueShift > 0.01) {
    camColor = hueShift(camColor, v_hueShift);
  }

  // Simple lighting
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.8));
  float diffuse = max(dot(normalize(v_normal), lightDir), 0.0);
  float ambient = 0.4;
  float light = ambient + diffuse * 0.6;

  // Bass-reactive glow
  float glow = 1.0 + u_bass * 0.5;

  // Apply lighting and brightness
  vec3 color = camColor * light * v_brightness * glow;

  // Edge glow effect
  float edgeFactor = 1.0 - abs(dot(normalize(v_normal), vec3(0.0, 0.0, 1.0)));
  color += vec3(0.3, 0.6, 1.0) * pow(edgeFactor, 3.0) * u_energy * 0.5;

  // Depth fog toward black
  color = mix(color, vec3(0.0), clamp(v_depth, 0.0, 0.95));

  fragColor = vec4(color, 1.0);
}
`,it=`#version 300 es
precision highp float;

in vec3 a_position;
in vec3 a_color;
in float a_size;

uniform mat4 u_viewProj;
uniform float u_time;
uniform float u_pointScale;

out vec3 v_color;

void main() {
  vec4 pos = u_viewProj * vec4(a_position, 1.0);
  gl_Position = pos;
  gl_PointSize = clamp(a_size * u_pointScale / pos.w, 1.0, 64.0);
  v_color = a_color;
}
`,st=`#version 300 es
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
`;function N(e,r){const o=t.createShader(e);return t.shaderSource(o,r),t.compileShader(o),t.getShaderParameter(o,t.COMPILE_STATUS)?o:(console.error(t.getShaderInfoLog(o)),t.deleteShader(o),null)}function W(e,r,o){const i=N(t.VERTEX_SHADER,e),a=N(t.FRAGMENT_SHADER,r),s=t.createProgram();return t.attachShader(s,i),t.attachShader(s,a),t.linkProgram(s),t.getProgramParameter(s,t.LINK_STATUS)||console.error(t.getProgramInfoLog(s)),s}const m=W(at,nt),u={a_position:t.getAttribLocation(m,"a_position"),a_uv:t.getAttribLocation(m,"a_uv"),a_normal:t.getAttribLocation(m,"a_normal"),a_model:t.getAttribLocation(m,"a_model"),a_brightness:t.getAttribLocation(m,"a_brightness"),a_hueShift:t.getAttribLocation(m,"a_hueShift"),u_viewProj:t.getUniformLocation(m,"u_viewProj"),u_cameraTexture:t.getUniformLocation(m,"u_cameraTexture"),u_time:t.getUniformLocation(m,"u_time"),u_bass:t.getUniformLocation(m,"u_bass"),u_energy:t.getUniformLocation(m,"u_energy")},w=W(it,st),b={a_position:t.getAttribLocation(w,"a_position"),a_color:t.getAttribLocation(w,"a_color"),a_size:t.getAttribLocation(w,"a_size"),u_viewProj:t.getUniformLocation(w,"u_viewProj"),u_time:t.getUniformLocation(w,"u_time"),u_pointScale:t.getUniformLocation(w,"u_pointScale")},ct=new Float32Array([-.5,-.5,.5,0,0,0,0,1,.5,-.5,.5,1,0,0,0,1,.5,.5,.5,1,1,0,0,1,-.5,.5,.5,0,1,0,0,1,.5,-.5,-.5,0,0,0,0,-1,-.5,-.5,-.5,1,0,0,0,-1,-.5,.5,-.5,1,1,0,0,-1,.5,.5,-.5,0,1,0,0,-1,-.5,.5,.5,0,0,0,1,0,.5,.5,.5,1,0,0,1,0,.5,.5,-.5,1,1,0,1,0,-.5,.5,-.5,0,1,0,1,0,-.5,-.5,-.5,0,0,0,-1,0,.5,-.5,-.5,1,0,0,-1,0,.5,-.5,.5,1,1,0,-1,0,-.5,-.5,.5,0,1,0,-1,0,.5,-.5,.5,0,0,1,0,0,.5,-.5,-.5,1,0,1,0,0,.5,.5,-.5,1,1,1,0,0,.5,.5,.5,0,1,1,0,0,-.5,-.5,-.5,0,0,-1,0,0,-.5,-.5,.5,1,0,-1,0,0,-.5,.5,.5,1,1,-1,0,0,-.5,.5,-.5,0,1,-1,0,0]),lt=new Uint16Array([0,1,2,0,2,3,4,5,6,4,6,7,8,9,10,8,10,11,12,13,14,12,14,15,16,17,18,16,18,19,20,21,22,20,22,23]),k=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,k);t.bufferData(t.ARRAY_BUFFER,ct,t.STATIC_DRAW);const H=t.createBuffer();t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,H);t.bufferData(t.ELEMENT_ARRAY_BUFFER,lt,t.STATIC_DRAW);const C=500,F=18,x=new Float32Array(C*F),q=t.createBuffer(),$=t.createVertexArray();t.bindVertexArray($);t.bindBuffer(t.ARRAY_BUFFER,k);t.enableVertexAttribArray(u.a_position);t.vertexAttribPointer(u.a_position,3,t.FLOAT,!1,32,0);t.enableVertexAttribArray(u.a_uv);t.vertexAttribPointer(u.a_uv,2,t.FLOAT,!1,32,12);t.enableVertexAttribArray(u.a_normal);t.vertexAttribPointer(u.a_normal,3,t.FLOAT,!1,32,20);t.bindBuffer(t.ARRAY_BUFFER,q);const V=F*4;for(let e=0;e<4;e++){const r=u.a_model+e;t.enableVertexAttribArray(r),t.vertexAttribPointer(r,4,t.FLOAT,!1,V,e*16),t.vertexAttribDivisor(r,1)}t.enableVertexAttribArray(u.a_brightness);t.vertexAttribPointer(u.a_brightness,1,t.FLOAT,!1,V,64);t.vertexAttribDivisor(u.a_brightness,1);t.enableVertexAttribArray(u.a_hueShift);t.vertexAttribPointer(u.a_hueShift,1,t.FLOAT,!1,V,68);t.vertexAttribDivisor(u.a_hueShift,1);t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,H);t.bindVertexArray(null);const K=5e4,E=new Float32Array(K*7),Z=t.createBuffer(),J=t.createVertexArray();t.bindVertexArray(J);t.bindBuffer(t.ARRAY_BUFFER,Z);t.enableVertexAttribArray(b.a_position);t.vertexAttribPointer(b.a_position,3,t.FLOAT,!1,28,0);t.enableVertexAttribArray(b.a_color);t.vertexAttribPointer(b.a_color,3,t.FLOAT,!1,28,12);t.enableVertexAttribArray(b.a_size);t.vertexAttribPointer(b.a_size,1,t.FLOAT,!1,28,24);t.bindVertexArray(null);const I=t.createTexture();t.bindTexture(t.TEXTURE_2D,I);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE);t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);t.texImage2D(t.TEXTURE_2D,0,t.RGBA,1,1,0,t.RGBA,t.UNSIGNED_BYTE,new Uint8Array([128,128,128,255]));let D=null,p=null,S=new Uint8Array(128),O=!1;async function ut(){try{D=new(window.AudioContext||window.webkitAudioContext);const e=await navigator.mediaDevices.getUserMedia({audio:!0}),r=D.createMediaStreamSource(e);p=D.createAnalyser(),p.fftSize=256,p.smoothingTimeConstant=.8,r.connect(p),S=new Uint8Array(p.frequencyBinCount),O=!0}catch(e){console.warn("Audio unavailable:",e),O=!1}}function ft(){if(!O||!p)return{bass:0,mid:0,high:0,energy:0};p.getByteFrequencyData(S);const e=S.length;let r=0,o=0,i=0;for(let a=0;a<e*.15;a++)r+=S[a];for(let a=Math.floor(e*.15);a<e*.5;a++)o+=S[a];for(let a=Math.floor(e*.5);a<e;a++)i+=S[a];return r=r/(e*.15)/255,o=o/(e*.35)/255,i=i/(e*.5)/255,{bass:r,mid:o,high:i,energy:(r+o+i)/3}}let L=!1;const R=document.createElement("video");R.playsInline=!0;R.muted=!0;async function _t(){try{const e=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:512},height:{ideal:512}}});R.srcObject=e,await R.play(),L=!0,console.log("Camera started:",R.videoWidth,"x",R.videoHeight)}catch(e){console.warn("Camera unavailable:",e),L=!1}}function ht(e,r,o,i){const a=1/Math.tan(e/2),s=1/(o-i);return new Float32Array([a/r,0,0,0,0,a,0,0,0,0,(i+o)*s,-1,0,0,2*i*o*s,0])}function mt(e,r,o){const i=e[0]-r[0],a=e[1]-r[1],s=e[2]-r[2];let c=1/Math.sqrt(i*i+a*a+s*s);const n=[i*c,a*c,s*c],f=o[1]*n[2]-o[2]*n[1],h=o[2]*n[0]-o[0]*n[2],_=o[0]*n[1]-o[1]*n[0];c=1/Math.sqrt(f*f+h*h+_*_);const l=[f*c,h*c,_*c],A=[n[1]*l[2]-n[2]*l[1],n[2]*l[0]-n[0]*l[2],n[0]*l[1]-n[1]*l[0]];return new Float32Array([l[0],A[0],n[0],0,l[1],A[1],n[1],0,l[2],A[2],n[2],0,-(l[0]*e[0]+l[1]*e[1]+l[2]*e[2]),-(A[0]*e[0]+A[1]*e[1]+A[2]*e[2]),-(n[0]*e[0]+n[1]*e[1]+n[2]*e[2]),1])}function T(e,r){const o=new Float32Array(16);for(let i=0;i<4;i++)for(let a=0;a<4;a++)o[a*4+i]=e[i]*r[a*4]+e[i+4]*r[a*4+1]+e[i+8]*r[a*4+2]+e[i+12]*r[a*4+3];return o}function z(e,r,o){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,e,r,o,1])}function X(e){return new Float32Array([e,0,0,0,0,e,0,0,0,0,e,0,0,0,0,1])}function Y(e){const r=Math.cos(e),o=Math.sin(e);return new Float32Array([1,0,0,0,0,r,o,0,0,-o,r,0,0,0,0,1])}function j(e){const r=Math.cos(e),o=Math.sin(e);return new Float32Array([r,0,-o,0,0,1,0,0,o,0,r,0,0,0,0,1])}function At(e){const r=Math.cos(e),o=Math.sin(e);return new Float32Array([r,o,0,0,-o,r,0,0,0,0,1,0,0,0,0,1])}function dt(e,r){let o=0;const i=4,a=30;for(let s=0;s<i;s++){const c=s/i*Math.PI*2;for(let n=0;n<a&&!(o>=C);n++){const f=n/a,h=c+n*(Math.PI*2/(rt*3)),_=.3+f*4,l=Math.cos(h)*_,A=Math.sin(h)*_,M=-20+f*22,B=.15+f*.8,P=.3+r.bass*.5,v=e*P*(.5+n*.1)+n*.3,tt=e*P*(.3+n*.15)+s,et=e*P*.2;let g=z(l,A,M);g=T(g,Y(v)),g=T(g,j(tt)),g=T(g,At(et)),g=T(g,X(B));const U=o*F;for(let y=0;y<16;y++)x[U+y]=g[y];const ot=(.3+f*.7)*(1+r.bass*.5);x[U+16]=ot,x[U+17]=r.mid*.3,o++}}if(o<C){const s=o*F;let c=z(0,0,2);const n=e*.1+r.bass*.3,f=e*.15;c=T(c,Y(n)),c=T(c,j(f));const h=1.2+r.bass*.3;c=T(c,X(h));for(let _=0;_<16;_++)x[s+_]=c[_];x[s+16]=1.5,x[s+17]=r.mid*.2,o++}return o}function vt(e,r){let o=0;const i=3e4;for(let a=0;a<i&&o<K;a++){const s=a/i,c=s*Math.PI*20+e*.2,n=.5+s*6,f=-25+s*28,h=Math.cos(c)*n*(.5+Math.random()*.5),_=Math.sin(c)*n*(.5+Math.random()*.5),l=s+r.mid*.3,A=.3+Math.sin(l*6.28)*.3+r.bass*.3,M=.4+Math.sin(l*6.28+2.09)*.3,B=.7+Math.sin(l*6.28+4.18)*.3+r.high*.3,P=(.02+Math.random()*.04)*(1+r.energy*.5),v=o*7;E[v]=h,E[v+1]=_,E[v+2]=f,E[v+3]=A,E[v+4]=M,E[v+5]=B,E[v+6]=P,o++}return o}const gt=performance.now(),G=document.getElementById("hud");function Q(){requestAnimationFrame(Q);const r=(performance.now()-gt)*.001,o=ft();L&&R.readyState>=2&&(t.bindTexture(t.TEXTURE_2D,I),t.texImage2D(t.TEXTURE_2D,0,t.RGBA,t.RGBA,t.UNSIGNED_BYTE,R));const i=d.width/d.height,a=ht(70*Math.PI/180,i,.1,100),s=mt([0,0,5],[0,0,-10],[0,1,0]),c=T(a,s);t.viewport(0,0,d.width,d.height),t.clearColor(.02,.02,.05,1),t.clear(t.COLOR_BUFFER_BIT|t.DEPTH_BUFFER_BIT),t.enable(t.DEPTH_TEST);const n=dt(r,o);t.bindBuffer(t.ARRAY_BUFFER,q),t.bufferData(t.ARRAY_BUFFER,x,t.DYNAMIC_DRAW),t.useProgram(m),t.uniformMatrix4fv(u.u_viewProj,!1,c),t.uniform1i(u.u_cameraTexture,0),t.uniform1f(u.u_time,r),t.uniform1f(u.u_bass,o.bass),t.uniform1f(u.u_energy,o.energy),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,I),t.bindVertexArray($),t.drawElementsInstanced(t.TRIANGLES,36,t.UNSIGNED_SHORT,0,n);const f=vt(r,o);if(t.bindBuffer(t.ARRAY_BUFFER,Z),t.bufferData(t.ARRAY_BUFFER,E,t.DYNAMIC_DRAW),t.enable(t.BLEND),t.blendFunc(t.SRC_ALPHA,t.ONE),t.depthMask(!1),t.useProgram(w),t.uniformMatrix4fv(b.u_viewProj,!1,c),t.uniform1f(b.u_time,r),t.uniform1f(b.u_pointScale,d.height*.5),t.bindVertexArray(J),t.drawArrays(t.POINTS,0,f),t.depthMask(!0),t.disable(t.BLEND),t.bindVertexArray(null),G){const h=L?"CAM ON":"NO CAM";G.textContent=`${n} cubes | ${(f/1e3).toFixed(0)}K particles | ${h} | bass:${(o.bass*100).toFixed(0)}`}}document.getElementById("startBtn").addEventListener("click",async()=>{document.getElementById("startOverlay").classList.add("hidden"),await Promise.all([_t(),ut()]),requestAnimationFrame(Q)});
