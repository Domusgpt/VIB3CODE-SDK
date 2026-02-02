const m=document.getElementById("gl"),e=m.getContext("webgl2",{antialias:!0,alpha:!1});if(!e)throw alert("WebGL 2 not supported"),new Error("no webgl2");function z(){const t=Math.min(devicePixelRatio,2);m.width=innerWidth*t,m.height=innerHeight*t,e.viewport(0,0,m.width,m.height)}addEventListener("resize",z);z();const oe=`#version 300 es
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
`,ae=`#version 300 es
precision highp float;

in vec3 v_normal;
in vec2 v_uv;
in vec3 v_worldPos;
in float v_depth;

uniform sampler2D u_camTex;
uniform float u_time;
uniform float u_alpha;
uniform float u_ghostFade;   // 0 = lead cube, 1 = oldest clone
uniform float u_cubeIndex;   // index in the spiral
uniform float u_totalCubes;  // total clones

out vec4 fragColor;

// chromatic aberration on the camera feed
vec4 sampleCam(vec2 uv, float spread) {
  float r = texture(u_camTex, uv + vec2(spread, 0.0)).r;
  float g = texture(u_camTex, uv).g;
  float b = texture(u_camTex, uv - vec2(spread, 0.0)).b;
  return vec4(r, g, b, 1.0);
}

void main() {
  vec3 N = normalize(v_normal);
  float facing = abs(dot(N, vec3(0.0, 0.0, 1.0)));

  // Tile the UV to create a fract pattern across each face
  float tiles = 3.0;
  vec2 tiled = fract(v_uv * tiles);

  // slight angle offset per tile for the "repeating angled" look
  float tileId = floor(v_uv.x * tiles) + floor(v_uv.y * tiles) * tiles;
  float ang = tileId * 0.15 + u_time * 0.1;
  float ca = cos(ang), sa = sin(ang);
  vec2 centered = tiled - 0.5;
  vec2 rotUV = vec2(ca * centered.x - sa * centered.y,
                     sa * centered.x + ca * centered.y) + 0.5;
  rotUV = clamp(rotUV, 0.01, 0.99);

  // mirror X for selfie-style
  rotUV.x = 1.0 - rotUV.x;

  float aberr = 0.003 + 0.002 * sin(u_time + u_cubeIndex * 0.5);
  vec4 cam = sampleCam(rotUV, aberr);

  // Subtle edge glow on each tile
  vec2 edgeDist = smoothstep(vec2(0.0), vec2(0.04), tiled)
                * smoothstep(vec2(0.0), vec2(0.04), 1.0 - tiled);
  float edgeMask = edgeDist.x * edgeDist.y;

  // Lighting: soft directional + ambient
  float diff = max(dot(N, normalize(vec3(0.5, 1.0, 0.8))), 0.0);
  float light = 0.35 + 0.65 * diff;

  // Ghost colour shift for clones
  float hueShift = u_cubeIndex * 0.12;
  vec3 col = cam.rgb * light;
  // Shift toward magenta/cyan for older clones
  col.r += hueShift * 0.15;
  col.b += hueShift * 0.2;

  // Edge wireframe glow
  float wire = 1.0 - edgeMask;
  vec3 wireCol = vec3(0.0, 1.0, 1.0) * wire * 0.3 * (1.0 - u_ghostFade * 0.7);

  col = col * edgeMask + wireCol;

  // Fade out older clones
  float alpha = u_alpha * (1.0 - u_ghostFade * 0.65);

  // Vignette on the cube based on depth
  float vig = smoothstep(0.98, 0.5, abs(v_depth));
  alpha *= mix(1.0, vig, 0.3);

  fragColor = vec4(col, alpha);
}
`,re=`#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`,ne=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform float u_time;
uniform vec2 u_res;
out vec4 fragColor;

void main() {
  vec2 uv = v_uv;
  vec2 center = vec2(0.5);
  float dist = length(uv - center);

  // Spiral pattern
  float angle = atan(uv.y - 0.5, uv.x - 0.5);
  float spiral = sin(angle * 3.0 - dist * 12.0 + u_time * 0.4) * 0.5 + 0.5;

  // Dark vortex
  float vortex = smoothstep(0.7, 0.0, dist);
  vec3 col = mix(
    vec3(0.02, 0.02, 0.06),
    vec3(0.06, 0.02, 0.1),
    spiral * 0.3
  );
  // Edge glow
  float edgeGlow = smoothstep(0.3, 0.8, dist) * 0.15;
  col += vec3(0.0, edgeGlow * 0.5, edgeGlow);

  // Vignette
  float vig = 1.0 - smoothstep(0.2, 0.85, dist);
  col *= 0.4 + vig * 0.6;

  fragColor = vec4(col, 1.0);
}
`;function w(t,o){const r=e.createShader(o);return e.shaderSource(r,t),e.compileShader(r),e.getShaderParameter(r,e.COMPILE_STATUS)?r:(console.error(e.getShaderInfoLog(r)),e.deleteShader(r),null)}function O(t,o,r){const a=e.createProgram();return e.attachShader(a,t),e.attachShader(a,o),r&&r.forEach((n,c)=>e.bindAttribLocation(a,c,n)),e.linkProgram(a),e.getProgramParameter(a,e.LINK_STATUS)?a:(console.error(e.getProgramInfoLog(a)),null)}function k(t,o){const r={};for(const a of o)r[a]=e.getUniformLocation(t,a);return r}const ie=w(oe,e.VERTEX_SHADER),se=w(ae,e.FRAGMENT_SHADER),H=O(ie,se,["a_pos","a_normal","a_uv"]),_=k(H,["u_proj","u_view","u_model","u_camTex","u_time","u_alpha","u_ghostFade","u_cubeIndex","u_totalCubes"]),ce=w(re,e.VERTEX_SHADER),le=w(ne,e.FRAGMENT_SHADER),W=O(ce,le,["a_pos"]),N=k(W,["u_time","u_res"]);function ue(){const t=[{n:[0,0,1],verts:[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]},{n:[0,0,-1],verts:[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]]},{n:[1,0,0],verts:[[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]]},{n:[-1,0,0],verts:[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]]},{n:[0,1,0],verts:[[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]]},{n:[0,-1,0],verts:[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]}],o=[[0,0],[1,0],[1,1],[0,1]],r=[0,1,2,0,2,3],a=[],n=[],c=[],l=[];let i=0;for(const M of t){for(let p=0;p<4;p++)a.push(...M.verts[p]),n.push(...M.n),c.push(...o[p]);for(const p of r)l.push(p+i);i+=4}const f=e.createVertexArray();e.bindVertexArray(f);const v=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,v),e.bufferData(e.ARRAY_BUFFER,new Float32Array(a),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,3,e.FLOAT,!1,0,0);const h=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,h),e.bufferData(e.ARRAY_BUFFER,new Float32Array(n),e.STATIC_DRAW),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,3,e.FLOAT,!1,0,0);const u=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,u),e.bufferData(e.ARRAY_BUFFER,new Float32Array(c),e.STATIC_DRAW),e.enableVertexAttribArray(2),e.vertexAttribPointer(2,2,e.FLOAT,!1,0,0);const d=e.createBuffer();return e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,d),e.bufferData(e.ELEMENT_ARRAY_BUFFER,new Uint16Array(l),e.STATIC_DRAW),e.bindVertexArray(null),{vao:f,count:l.length}}function fe(){const t=e.createVertexArray();e.bindVertexArray(t);const o=e.createBuffer();return e.bindBuffer(e.ARRAY_BUFFER,o),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0),e.bindVertexArray(null),t}const U=ue(),de=fe();let I=!1;const R=document.createElement("video");R.playsInline=!0;R.muted=!0;const F=e.createTexture();e.bindTexture(e.TEXTURE_2D,F);e.texImage2D(e.TEXTURE_2D,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,new Uint8Array([80,80,80,255]));e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR);e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR);e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE);e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE);async function me(){try{const t=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:640},height:{ideal:480}}});R.srcObject=t,await R.play(),I=!0}catch(t){console.warn("Camera not available, using procedural texture fallback",t);const o=256,r=new Uint8Array(o*o*4);for(let a=0;a<o;a++)for(let n=0;n<o;n++){const c=(a*o+n)*4,l=n/o-.5,i=a/o-.5,f=Math.sqrt(l*l+i*i),v=Math.sin(f*30)*.5+.5;r[c]=v*180+60|0,r[c+1]=v*100+80|0,r[c+2]=v*200+55|0,r[c+3]=255}e.bindTexture(e.TEXTURE_2D,F),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,o,o,0,e.RGBA,e.UNSIGNED_BYTE,r),I=!1}}function ve(){!I||R.readyState<2||(e.bindTexture(e.TEXTURE_2D,F),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,R))}function _e(t,o,r,a){const n=1/Math.tan(t/2),c=1/(r-a);return new Float32Array([n/o,0,0,0,0,n,0,0,0,0,(a+r)*c,-1,0,0,2*a*r*c,0])}function he(t,o,r){const a=t[0]-o[0],n=t[1]-o[1],c=t[2]-o[2];let l=1/Math.sqrt(a*a+n*n+c*c);const i=[a*l,n*l,c*l],f=r[1]*i[2]-r[2]*i[1],v=r[2]*i[0]-r[0]*i[2],h=r[0]*i[1]-r[1]*i[0];l=1/Math.sqrt(f*f+v*v+h*h);const u=[f*l,v*l,h*l],d=[i[1]*u[2]-i[2]*u[1],i[2]*u[0]-i[0]*u[2],i[0]*u[1]-i[1]*u[0]];return new Float32Array([u[0],d[0],i[0],0,u[1],d[1],i[1],0,u[2],d[2],i[2],0,-(u[0]*t[0]+u[1]*t[1]+u[2]*t[2]),-(d[0]*t[0]+d[1]*t[1]+d[2]*t[2]),-(i[0]*t[0]+i[1]*t[1]+i[2]*t[2]),1])}function E(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])}function x(t,o){const r=new Float32Array(16);for(let a=0;a<4;a++)for(let n=0;n<4;n++){let c=0;for(let l=0;l<4;l++)c+=t[l*4+n]*o[a*4+l];r[a*4+n]=c}return r}function P(t,o,r){const a=E();return a[12]=t,a[13]=o,a[14]=r,a}function ge(t){const o=E();return o[0]=t,o[5]=t,o[10]=t,o}function j(t){const o=Math.cos(t),r=Math.sin(t),a=E();return a[5]=o,a[6]=r,a[9]=-r,a[10]=o,a}function q(t){const o=Math.cos(t),r=Math.sin(t),a=E();return a[0]=o,a[2]=-r,a[8]=r,a[10]=o,a}function Z(t){const o=Math.cos(t),r=Math.sin(t),a=E();return a[0]=o,a[1]=r,a[4]=-r,a[5]=o,a}const $=Math.PI/2,K=[{axis:"z",sign:-1,edge:[0,-1,0],move:[2,0,0]},{axis:"x",sign:1,edge:[0,-1,0],move:[0,0,2]},{axis:"z",sign:1,edge:[0,-1,0],move:[-2,0,0]},{axis:"x",sign:-1,edge:[0,-1,0],move:[0,0,-2]}];function pe(t){const o=[];let r=0,a=1,n=0,c=0;for(let l=0;l<t;l++)o.push(r%4),n++,n>=a&&(n=0,r++,c++,c>=2&&(c=0,a++));return o}const Q=80,Ee=.55,Te=.12,g=[],s={pos:[0,0,0],baseRot:E(),tumbleProgress:0,spiralStep:0,paused:!1,pauseTimer:0},B=pe(Q+20);function J(t){const o=K[B[s.spiralStep]%4],r=s.tumbleProgress,n=(r<.5?2*r*r:1-Math.pow(-2*r+2,2)/2)*$*o.sign,c=s.pos[0]+o.move[0]*.5,l=s.pos[1]+o.edge[1],i=s.pos[2]+o.move[2]*.5,f=P(-c,-l,-i),v=P(c,l,i);let h;o.axis==="x"?h=j(n):o.axis==="z"?h=Z(n):h=q(n);const u=P(s.pos[0],s.pos[1],s.pos[2]);let d=x(u,s.baseRot);return d=x(f,d),d=x(h,d),d=x(v,d),d}function Ae(t){if(s.paused){s.pauseTimer-=t,s.pauseTimer<=0&&(s.paused=!1);return}if(s.tumbleProgress+=t/Ee,s.tumbleProgress>=1){s.tumbleProgress=1;const o=J();g.length>=Q&&g.shift(),g.push({modelMatrix:o,birthTime:performance.now()/1e3,spiralIndex:s.spiralStep});const r=K[B[s.spiralStep]%4];let a;const n=$*r.sign;r.axis==="x"?a=j(n):r.axis==="z"?a=Z(n):a=q(n),s.baseRot=x(a,s.baseRot),s.pos[0]+=r.move[0],s.pos[1]+=0,s.pos[2]+=r.move[2],s.spiralStep++,s.tumbleProgress=0,s.paused=!0,s.pauseTimer=Te,s.spiralStep>=B.length-1&&(s.spiralStep=0,s.pos=[0,0,0],s.baseRot=E(),g.length=0)}}let b=.4,T=.5,A=18,ee=b,y=T,L=A,C=!1,S=[0,0];m.addEventListener("pointerdown",t=>{C=!0,S=[t.clientX,t.clientY],m.setPointerCapture(t.pointerId)});m.addEventListener("pointermove",t=>{if(!C)return;const o=t.clientX-S[0],r=t.clientY-S[1];S=[t.clientX,t.clientY],ee+=o*.005,y=Math.max(-1.2,Math.min(1.2,y+r*.005))});m.addEventListener("pointerup",()=>{C=!1});m.addEventListener("wheel",t=>{L=Math.max(5,Math.min(60,L+t.deltaY*.03)),t.preventDefault()},{passive:!1});function xe(){b+=(ee-b)*.08,T+=(y-T)*.08,A+=(L-A)*.08;const t=s.pos[0]*.3,o=s.pos[2]*.3,r=t+Math.cos(b)*Math.cos(T)*A,a=Math.sin(T)*A+4,n=o+Math.sin(b)*Math.cos(T)*A,c=m.width/m.height,l=_e(Math.PI/4,c,.5,200),i=he([r,a,n],[t,0,o],[0,1,0]);return{proj:l,view:i}}let G=0;const V=document.getElementById("hud");let D=0,X=0,Y=0;function te(t){requestAnimationFrame(te);const o=t/1e3,r=Math.min(o-G,.1);G=o,D++,o-X>1&&(Y=D,D=0,X=o),ve(),Ae(r);const{proj:a,view:n}=xe();e.clearColor(.02,.02,.06,1),e.clear(e.COLOR_BUFFER_BIT|e.DEPTH_BUFFER_BIT),e.disable(e.DEPTH_TEST),e.useProgram(W),e.uniform1f(N.u_time,o),e.uniform2f(N.u_res,m.width,m.height),e.bindVertexArray(de),e.drawArrays(e.TRIANGLES,0,6),e.enable(e.DEPTH_TEST),e.enable(e.BLEND),e.blendFunc(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA),e.useProgram(H),e.uniformMatrix4fv(_.u_proj,!1,a),e.uniformMatrix4fv(_.u_view,!1,n),e.uniform1f(_.u_time,o),e.uniform1i(_.u_camTex,0),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,F),e.bindVertexArray(U.vao);const c=g.length+1;e.uniform1f(_.u_totalCubes,c);for(let i=0;i<g.length;i++){const f=g[i],v=o-f.birthTime,h=Math.min(v*3,1),u=i/Math.max(g.length,1),M=1+Math.sqrt(f.modelMatrix[12]*f.modelMatrix[12]+f.modelMatrix[14]*f.modelMatrix[14])*.04,p=x(f.modelMatrix,ge(M));e.uniformMatrix4fv(_.u_model,!1,p),e.uniform1f(_.u_alpha,h*.85),e.uniform1f(_.u_ghostFade,u),e.uniform1f(_.u_cubeIndex,i),e.drawElements(e.TRIANGLES,U.count,e.UNSIGNED_SHORT,0)}const l=J();e.uniformMatrix4fv(_.u_model,!1,l),e.uniform1f(_.u_alpha,1),e.uniform1f(_.u_ghostFade,0),e.uniform1f(_.u_cubeIndex,g.length),e.drawElements(e.TRIANGLES,U.count,e.UNSIGNED_SHORT,0),e.disable(e.BLEND),e.bindVertexArray(null),V&&(V.textContent=`${Y} fps | ${c} cubes | step ${s.spiralStep}`)}const Re=document.getElementById("startBtn"),be=document.getElementById("startOverlay");Re.addEventListener("click",async()=>{be.classList.add("hidden"),await me(),requestAnimationFrame(te)});
