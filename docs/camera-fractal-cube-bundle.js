const I=1.3247179572447458,_=document.getElementById("gl"),e=_.getContext("webgl2",{antialias:!0,alpha:!1});if(!e)throw alert("WebGL 2 not supported"),new Error("no webgl2");function P(){const t=Math.min(devicePixelRatio,2);_.width=innerWidth*t,_.height=innerHeight*t,e.viewport(0,0,_.width,_.height)}addEventListener("resize",P);P();const z=`#version 300 es
precision highp float;

layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_normal;
layout(location=2) in vec2 a_uv;

uniform mat4 u_proj;
uniform mat4 u_view;
uniform mat4 u_model;

out vec3 v_normal;
out vec2 v_uv;
out vec3 v_worldPos;
out float v_depth;

void main() {
  vec4 world = u_model * vec4(a_pos, 1.0);
  v_worldPos = world.xyz;
  v_normal = mat3(u_model) * a_normal;
  v_uv = a_uv;
  vec4 clip = u_proj * u_view * world;
  v_depth = clip.z / clip.w;
  gl_Position = clip;
}
`,X=`#version 300 es
precision highp float;

in vec3 v_normal;
in vec2 v_uv;
in vec3 v_worldPos;
in float v_depth;

uniform sampler2D u_camTex;
uniform float u_time;
uniform float u_alpha;
uniform float u_spiralIndex;  // which cube in the spiral (0 = center)
uniform float u_armIndex;     // which arm (0-3)

out vec4 fragColor;

void main() {
  vec3 N = normalize(v_normal);

  // Single camera image per face (mirror X for selfie)
  vec2 uv = v_uv;
  uv.x = 1.0 - uv.x;
  uv.y = 1.0 - uv.y;

  // Sample camera texture
  vec4 cam = texture(u_camTex, uv);

  // Soft lighting
  vec3 lightDir = normalize(vec3(0.3, 0.8, 0.5));
  float diff = max(dot(N, lightDir), 0.0);
  float light = 0.4 + 0.6 * diff;

  // Color tint based on spiral arm (subtle rainbow)
  float hueShift = u_armIndex * 0.25;
  vec3 tint = vec3(
    0.5 + 0.5 * cos(hueShift * 6.2832),
    0.5 + 0.5 * cos(hueShift * 6.2832 + 2.094),
    0.5 + 0.5 * cos(hueShift * 6.2832 + 4.188)
  );

  vec3 col = cam.rgb * light;
  col = mix(col, col * tint, 0.15 + u_spiralIndex * 0.02);

  // Edge glow (subtle wireframe effect)
  vec2 edgeDist = smoothstep(vec2(0.0), vec2(0.03), v_uv)
                * smoothstep(vec2(0.0), vec2(0.03), 1.0 - v_uv);
  float edgeMask = edgeDist.x * edgeDist.y;
  float edge = 1.0 - edgeMask;
  vec3 edgeCol = vec3(0.0, 1.0, 1.0) * edge * 0.25;

  col = col * edgeMask + edgeCol;

  // Depth-based fade for far cubes (disable to keep cubes visible on mobile GPUs)
  float depthFade = 1.0;
  float alpha = u_alpha * depthFade;

  // Ensure some emissive visibility even with dark camera frames
  col = max(col, vec3(0.08));

  fragColor = vec4(col, alpha);
}
`,V=`#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`,k=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform float u_time;
out vec4 fragColor;

void main() {
  vec2 center = vec2(0.5);
  vec2 uv = v_uv - center;
  float dist = length(uv);
  float angle = atan(uv.y, uv.x);

  // Spiral vortex pattern
  float spiral = sin(angle * 4.0 - dist * 15.0 + u_time * 0.3) * 0.5 + 0.5;

  // Radial gradient (dark center, slightly brighter edges)
  float vignette = 1.0 - smoothstep(0.0, 0.8, dist);

  // Dark space colors
  vec3 col = mix(
    vec3(0.01, 0.01, 0.03),  // near black
    vec3(0.04, 0.02, 0.06),  // dark purple
    spiral * 0.3
  );

  // Subtle edge glow
  float edgeGlow = smoothstep(0.4, 0.9, dist) * 0.08;
  col += vec3(0.0, edgeGlow * 0.5, edgeGlow);

  col *= 0.5 + vignette * 0.5;

  fragColor = vec4(col, 1.0);
}
`;function p(t,n){const r=e.createShader(n);return e.shaderSource(r,t),e.compileShader(r),e.getShaderParameter(r,e.COMPILE_STATUS)?r:(console.error(e.getShaderInfoLog(r)),e.deleteShader(r),null)}function U(t,n){const r=e.createProgram();return e.attachShader(r,t),e.attachShader(r,n),e.linkProgram(r),e.getProgramParameter(r,e.LINK_STATUS)?r:(console.error(e.getProgramInfoLog(r)),null)}function y(t,n){const r={};for(const o of n)r[o]=e.getUniformLocation(t,o);return r}const Y=p(z,e.VERTEX_SHADER),O=p(X,e.FRAGMENT_SHADER),C=U(Y,O),d=y(C,["u_proj","u_view","u_model","u_camTex","u_time","u_alpha","u_spiralIndex","u_armIndex"]),H=p(V,e.VERTEX_SHADER),W=p(k,e.FRAGMENT_SHADER),L=U(H,W),j=y(L,["u_time"]);function q(){const t=[{n:[0,0,1],verts:[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]},{n:[0,0,-1],verts:[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]]},{n:[1,0,0],verts:[[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]]},{n:[-1,0,0],verts:[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]]},{n:[0,1,0],verts:[[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]]},{n:[0,-1,0],verts:[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]}],n=[[0,0],[1,0],[1,1],[0,1]],r=[0,1,2,0,2,3],o=[],s=[],a=[],c=[];let i=0;for(const T of t){for(let h=0;h<4;h++)o.push(...T.verts[h]),s.push(...T.n),a.push(...n[h]);for(const h of r)c.push(h+i);i+=4}const l=e.createVertexArray();e.bindVertexArray(l);const m=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,m),e.bufferData(e.ARRAY_BUFFER,new Float32Array(o),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,3,e.FLOAT,!1,0,0);const v=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,v),e.bufferData(e.ARRAY_BUFFER,new Float32Array(s),e.STATIC_DRAW),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,3,e.FLOAT,!1,0,0);const u=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,u),e.bufferData(e.ARRAY_BUFFER,new Float32Array(a),e.STATIC_DRAW),e.enableVertexAttribArray(2),e.vertexAttribPointer(2,2,e.FLOAT,!1,0,0);const f=e.createBuffer();return e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,f),e.bufferData(e.ELEMENT_ARRAY_BUFFER,new Uint16Array(c),e.STATIC_DRAW),e.bindVertexArray(null),{vao:l,count:c.length}}function Z(){const t=e.createVertexArray();e.bindVertexArray(t);const n=e.createBuffer();return e.bindBuffer(e.ARRAY_BUFFER,n),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null),t}const S=q(),$=Z();let N=!1;const A=document.createElement("video");A.playsInline=!0;A.muted=!0;const x=e.createTexture();e.bindTexture(e.TEXTURE_2D,x);e.texImage2D(e.TEXTURE_2D,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,new Uint8Array([128,128,128,255]));e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR);e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR);e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE);e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE);async function K(){try{const t=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:640},height:{ideal:480}}});A.srcObject=t,await A.play(),N=!0}catch(t){console.warn("Camera not available, using procedural fallback",t),Q()}}function Q(){const n=new Uint8Array(262144);for(let r=0;r<256;r++)for(let o=0;o<256;o++){const s=(r*256+o)*4,a=o/256-.5,c=r/256-.5,i=Math.sqrt(a*a+c*c),l=Math.sin(i*20)*.5+.5;n[s]=l*150+80|0,n[s+1]=l*100+100|0,n[s+2]=l*180+75|0,n[s+3]=255}e.bindTexture(e.TEXTURE_2D,x),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,256,256,0,e.RGBA,e.UNSIGNED_BYTE,n)}function J(){!N||A.readyState<2||(e.bindTexture(e.TEXTURE_2D,x),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,A))}function ee(t,n,r,o){const s=1/Math.tan(t/2),a=1/(r-o);return new Float32Array([s/n,0,0,0,0,s,0,0,0,0,(o+r)*a,-1,0,0,2*o*r*a,0])}function te(t,n,r){const o=t[0]-n[0],s=t[1]-n[1],a=t[2]-n[2];let c=1/Math.sqrt(o*o+s*s+a*a);const i=[o*c,s*c,a*c],l=r[1]*i[2]-r[2]*i[1],m=r[2]*i[0]-r[0]*i[2],v=r[0]*i[1]-r[1]*i[0];c=1/Math.sqrt(l*l+m*m+v*v);const u=[l*c,m*c,v*c],f=[i[1]*u[2]-i[2]*u[1],i[2]*u[0]-i[0]*u[2],i[0]*u[1]-i[1]*u[0]];return new Float32Array([u[0],f[0],i[0],0,u[1],f[1],i[1],0,u[2],f[2],i[2],0,-(u[0]*t[0]+u[1]*t[1]+u[2]*t[2]),-(f[0]*t[0]+f[1]*t[1]+f[2]*t[2]),-(i[0]*t[0]+i[1]*t[1]+i[2]*t[2]),1])}function E(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])}function R(t,n){const r=new Float32Array(16);for(let o=0;o<4;o++)for(let s=0;s<4;s++){let a=0;for(let c=0;c<4;c++)a+=t[c*4+s]*n[o*4+c];r[o*4+s]=a}return r}function oe(t,n,r){const o=E();return o[12]=t,o[13]=n,o[14]=r,o}function re(t){const n=E();return n[0]=t,n[5]=t,n[10]=t,n}function ne(t){const n=Math.cos(t),r=Math.sin(t),o=E();return o[5]=n,o[6]=r,o[9]=-r,o[10]=n,o}function ae(t){const n=Math.cos(t),r=Math.sin(t),o=E();return o[0]=n,o[2]=-r,o[8]=r,o[10]=n,o}function ie(t){const n=Math.cos(t),r=Math.sin(t),o=E();return o[0]=n,o[1]=r,o[4]=-r,o[5]=n,o}const F=4,D=8,g=9,w=.24,se=.32,ce=.12;function le(){const t=[];t.push({pos:[0,0,-g],scale:w,rotation:[0,0,0],armIndex:-1,spiralIndex:0});for(let n=0;n<F;n++){const r=n/F*Math.PI*2;for(let o=0;o<D;o++){const s=(o+1)/D,a=w*Math.pow(I,o+1),c=r+s*Math.PI*se*(n%2===0?1:-1),i=1.5*Math.pow(I,o*.7),l=-g+s*(g-2),m=Math.cos(c)*i,v=Math.sin(c)*i*.6+Math.sin(s*Math.PI)*ce*i,u=c+Math.PI*.1,f=-s*.2,T=n*.1;t.push({pos:[m,v,l],scale:a,rotation:[f,u,T],armIndex:n,spiralIndex:o+1})}}return t}const B=le();function ue(){const t=[0,0,6.5],n=[0,0,-g],r=_.width/_.height,o=ee(Math.PI/3.5,r,.1,100),s=te(t,n,[0,1,0]);return{proj:o,view:s}}let b=0;const M=document.getElementById("hud");function G(t){requestAnimationFrame(G),b||(b=t);const n=(t-b)/1e3;J();const{proj:r,view:o}=ue();e.clearColor(.01,.01,.03,1),e.clear(e.COLOR_BUFFER_BIT|e.DEPTH_BUFFER_BIT),e.disable(e.DEPTH_TEST),e.useProgram(L),e.uniform1f(j.u_time,n),e.bindVertexArray($),e.drawArrays(e.TRIANGLES,0,6),e.enable(e.DEPTH_TEST),e.enable(e.BLEND),e.blendFunc(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA),e.useProgram(C),e.uniformMatrix4fv(d.u_proj,!1,r),e.uniformMatrix4fv(d.u_view,!1,o),e.uniform1f(d.u_time,n),e.uniform1i(d.u_camTex,0),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,x),e.bindVertexArray(S.vao);const s=[...B].sort((a,c)=>a.pos[2]-c.pos[2]);for(const a of s){const c=a.rotation[1]+n*.1*(a.armIndex>=0?1:.3),i=a.rotation[0]+Math.sin(n*.5+a.spiralIndex)*.05;let l=oe(a.pos[0],a.pos[1],a.pos[2]);l=R(l,ae(c)),l=R(l,ne(i)),l=R(l,ie(a.rotation[2])),l=R(l,re(a.scale)),e.uniformMatrix4fv(d.u_model,!1,l),e.uniform1f(d.u_alpha,a.armIndex<0?1:.92),e.uniform1f(d.u_spiralIndex,a.spiralIndex),e.uniform1f(d.u_armIndex,Math.max(0,a.armIndex)),e.drawElements(e.TRIANGLES,S.count,e.UNSIGNED_SHORT,0)}e.disable(e.BLEND),e.bindVertexArray(null),M&&(M.textContent=`${B.length} cubes | plastic ratio: ${I.toFixed(4)}`)}const fe=document.getElementById("startBtn"),de=document.getElementById("startOverlay");let he=!1,me=!1;const ve=()=>{he||(he=!0,Q(),requestAnimationFrame(G))},pe=()=>{me||(me=!0,de.classList.add("hidden"),K())};ve(),fe.addEventListener("click",pe);
