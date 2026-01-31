/**
 * VIB3+ Hybrid Render Pipeline — Self-Contained Bundle
 *
 * All dependencies inlined for GitHub Pages deployment (no external imports).
 * Contains: encodeGaussianSeeds, GaussianSplatRenderer, MeshRenderer,
 * EdgeInscriptionLayer, HybridRenderPipeline, TextureToSplatConverter,
 * plus the demo application code.
 */

/* ================================================================== */
/*  encodeGaussianSeeds (from GaussianSeedBuffer.js)                   */
/* ================================================================== */

const GAUSSIAN_SEED_STRIDE = 12;

function encodeGaussianSeeds(seeds) {
    const buffer = new Float32Array(seeds.length * GAUSSIAN_SEED_STRIDE);
    seeds.forEach((seed, index) => {
        const offset = index * GAUSSIAN_SEED_STRIDE;
        const position = seed.position ?? [0, 0, 0];
        const orientation = seed.orientation ?? [1, 0, 0, 0];
        const color = seed.color ?? [1, 1, 1];
        const scale = seed.scale ?? 1;
        const depth = seed.depth ?? 0;
        buffer[offset]     = position[0] ?? 0;
        buffer[offset + 1] = position[1] ?? 0;
        buffer[offset + 2] = position[2] ?? 0;
        buffer[offset + 3] = scale;
        buffer[offset + 4] = orientation[0] ?? 1;
        buffer[offset + 5] = orientation[1] ?? 0;
        buffer[offset + 6] = orientation[2] ?? 0;
        buffer[offset + 7] = orientation[3] ?? 0;
        buffer[offset + 8]  = color[0] ?? 1;
        buffer[offset + 9]  = color[1] ?? 1;
        buffer[offset + 10] = color[2] ?? 1;
        buffer[offset + 11] = depth;
    });
    return buffer;
}

/* ================================================================== */
/*  GaussianSplatRenderer (from GaussianSplatRenderer.js)              */
/* ================================================================== */

const SPLAT_IDENTITY = new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);

const SPLAT_VERTEX = `#version 300 es
precision highp float;
in vec3 a_position; in float a_scale; in vec4 a_orientation; in vec3 a_color; in float a_depth;
uniform float u_pointScale,u_time,u_animate,u_intensity,u_chromatic; uniform mat4 u_viewProjection;
flat out vec3 v_color; flat out float v_depth; flat out vec2 v_axisU,v_axisV; flat out float v_hash,v_bloom;
void main(){
    float h1=fract(sin(dot(a_position.xy,vec2(12.9898,78.233)))*43758.5453);
    float h2=fract(sin(dot(a_position.yz,vec2(45.164,93.721)))*23456.789);
    float h3=fract(sin(dot(a_position.xz,vec2(63.7264,10.873)))*65432.123);
    v_hash=h1;
    float animAmp=a_depth*u_animate*0.06,animSpd=0.4+h1*0.6;
    float breathe=sin(u_time*0.15+h3*6.2832)*0.02*u_animate;
    vec3 pos=a_position+vec3(sin(u_time*animSpd+h1*6.2832)*animAmp,cos(u_time*animSpd*0.7+h2*6.2832)*animAmp*0.4+breathe,cos(u_time*animSpd+h1*6.2832)*animAmp);
    vec4 cp=u_viewProjection*vec4(pos,1.0); gl_Position=cp;
    float pd=max(0.5,cp.w),pulse=1.0+sin(u_time*1.5+h1*6.2832)*0.12*min(1.0,a_depth)*u_animate;
    float ib=1.0+(u_intensity-1.0)*0.15,df=1.0/(1.0+a_depth*0.15*(1.0-u_animate));
    gl_PointSize=clamp(a_scale*pulse*ib*u_pointScale*df/pd,1.0,2048.0);
    v_bloom=smoothstep(0.5,1.0,dot(a_color,vec3(0.2126,0.7152,0.0722)))*u_intensity;
    float qw=a_orientation.x,qx=a_orientation.y,qy=a_orientation.z,qz=a_orientation.w;
    float sinA=2.0*(qw*qz+qx*qy),cosA=1.0-2.0*(qy*qy+qz*qz);
    float il=inversesqrt(max(1e-12,sinA*sinA+cosA*cosA)); sinA*=il; cosA*=il;
    float asp=1.0+abs(2.0*(qw*qx+qy*qz))*0.6;
    v_axisU=vec2(cosA,sinA)*asp; v_axisV=vec2(-sinA,cosA);
    v_color=a_color; v_depth=a_depth;
}`;

const SPLAT_FRAGMENT = `#version 300 es
precision highp float;
flat in vec3 v_color; flat in float v_depth; flat in vec2 v_axisU,v_axisV; flat in float v_hash,v_bloom;
uniform float u_time,u_animate,u_intensity,u_chromatic;
out vec4 outColor;
void main(){
    vec2 d=gl_PointCoord-vec2(0.5); float u=dot(d,v_axisU),v=dot(d,v_axisV);
    float r2=u*u+v*v,sigma=0.20,gauss=exp(-0.5*r2/(sigma*sigma));
    float bs=0.35,bg=exp(-0.5*r2/(bs*bs)),be=v_bloom*0.3;
    float t1=sin(u_time*3.0+v_hash*6.2832)*0.5+0.5,t2=sin(u_time*7.1+v_hash*3.1416)*0.5+0.5;
    float tw=mix(1.0,0.75+0.25*mix(t1,t2,0.3),u_animate*min(1.0,v_depth));
    float da=1.0/(1.0+v_depth*0.25*(1.0-u_animate));
    float ca=gauss*da*tw,ta=ca+bg*be; if(ta<0.003)discard;
    vec3 c=v_color;
    if(u_chromatic>0.01&&v_bloom>0.1){float cs=u_chromatic*0.015*v_bloom;
    c.r+=exp(-0.5*((u-cs)*(u-cs)+v*v)/(bs*bs))*be*0.4;
    c.b+=exp(-0.5*((u+cs)*(u+cs)+v*v)/(bs*bs))*be*0.4;}
    c*=(0.5+u_intensity*0.5); outColor=vec4(c*ta,ta);
}`;

class GaussianSplatRenderer {
    constructor(gl, { pointScale=14, blendMode='premultiplied', animate=false, intensity=1.0, chromatic=0.0 }={}) {
        this.gl=gl; this.pointScale=pointScale; this.blendMode=blendMode;
        this.animate=animate; this.intensity=intensity; this.chromatic=chromatic;
        this.program=null; this.vao=null; this.buffer=null; this.count=0; this.uniforms={};
        this._init();
    }
    _init(){
        const gl=this.gl, p=gl.createProgram();
        const vs=this._cs(gl.VERTEX_SHADER,SPLAT_VERTEX), fs=this._cs(gl.FRAGMENT_SHADER,SPLAT_FRAGMENT);
        gl.attachShader(p,vs); gl.attachShader(p,fs); gl.linkProgram(p);
        if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        this.program=p; this.vao=gl.createVertexArray(); gl.bindVertexArray(this.vao);
        this.buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
        const S=GAUSSIAN_SEED_STRIDE*4;
        const attr=(n,sz,off)=>{const l=gl.getAttribLocation(p,n);gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,sz,gl.FLOAT,false,S,off*4);};
        attr('a_position',3,0); attr('a_scale',1,3); attr('a_orientation',4,4); attr('a_color',3,8); attr('a_depth',1,11);
        gl.bindVertexArray(null);
        const u=n=>gl.getUniformLocation(p,n);
        this.uniforms={pointScale:u('u_pointScale'),viewProjection:u('u_viewProjection'),time:u('u_time'),animate:u('u_animate'),intensity:u('u_intensity'),chromatic:u('u_chromatic')};
    }
    _cs(t,s){const gl=this.gl,sh=gl.createShader(t);gl.shaderSource(sh,s);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(sh));return sh;}
    updateSeeds(buffer,count){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,buffer,gl.DYNAMIC_DRAW);this.count=count;}
    render(viewProjection,time=0){
        const gl=this.gl; if(!this.count)return;
        gl.viewport(0,0,gl.canvas.width,gl.canvas.height);
        gl.clearColor(0.012,0.02,0.05,1.0); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
        gl.enable(gl.BLEND);
        if(this.blendMode==='additive')gl.blendFunc(gl.ONE,gl.ONE);else gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(this.program); gl.bindVertexArray(this.vao);
        gl.uniform1f(this.uniforms.pointScale,this.pointScale); gl.uniform1f(this.uniforms.time,time);
        gl.uniform1f(this.uniforms.animate,this.animate?1.0:0.0); gl.uniform1f(this.uniforms.intensity,this.intensity);
        gl.uniform1f(this.uniforms.chromatic,this.chromatic);
        gl.uniformMatrix4fv(this.uniforms.viewProjection,false,viewProjection||SPLAT_IDENTITY);
        gl.drawArrays(gl.POINTS,0,this.count);
        gl.bindVertexArray(null); gl.depthMask(true); gl.disable(gl.BLEND);
    }
}

/* ================================================================== */
/*  MeshRenderer (from MeshRenderer.js)                                */
/* ================================================================== */

const MESH_VERTEX = `#version 300 es
precision highp float;
in vec3 a_position; in vec3 a_normal; in vec2 a_uv; in vec4 a_color;
uniform mat4 u_modelView,u_projection,u_normalMatrix,u_rotation4D;
uniform float u_projDistance,u_use4D;
out vec3 v_position,v_normal; out vec2 v_uv; out vec4 v_color; out float v_depth;
void main(){
    vec3 pos=a_position,nrm=a_normal;
    if(u_use4D>0.5){vec4 p4=u_rotation4D*vec4(a_position,0.0);float w=u_projDistance-p4.w;if(abs(w)<0.0001)w=0.0001;pos=p4.xyz/w;vec4 n4=u_rotation4D*vec4(a_normal,0.0);nrm=normalize(n4.xyz);}
    vec4 vp=u_modelView*vec4(pos,1.0); v_position=vp.xyz; v_normal=normalize((u_normalMatrix*vec4(nrm,0.0)).xyz);
    v_uv=a_uv; v_color=a_color; v_depth=-vp.z; gl_Position=u_projection*vp;
}`;

const MESH_FRAGMENT = `#version 300 es
precision highp float;
in vec3 v_position,v_normal; in vec2 v_uv; in vec4 v_color; in float v_depth;
uniform sampler2D u_diffuseMap; uniform float u_hasTexture;
uniform vec3 u_lightDir,u_lightColor,u_ambientColor; uniform float u_specularPower,u_opacity;
layout(location=0)out vec4 outColor; layout(location=1)out vec4 outNormal;
void main(){
    vec4 bc=v_color; if(u_hasTexture>0.5)bc*=texture(u_diffuseMap,v_uv);
    vec3 N=normalize(v_normal),L=normalize(u_lightDir),V=normalize(-v_position),H=normalize(L+V);
    float NdL=max(dot(N,L),0.0),NdH=max(dot(N,H),0.0),sp=pow(NdH,u_specularPower);
    vec3 fc=bc.rgb*(u_ambientColor+u_lightColor*NdL)+u_lightColor*sp*0.3;
    outColor=vec4(fc,bc.a*u_opacity); outNormal=vec4(N*0.5+0.5,v_depth/100.0);
}`;

function createGBuffer(gl, w, h) {
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const colorTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, colorTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);
    const normalTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, normalTex);
    let nf = gl.RGBA8, nt = gl.UNSIGNED_BYTE;
    if (gl.getExtension('EXT_color_buffer_half_float')) { nf = gl.RGBA16F; nt = gl.HALF_FLOAT; }
    gl.texImage2D(gl.TEXTURE_2D, 0, nf, w, h, 0, gl.RGBA, nt, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, normalTex, 0);
    const drb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, drb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, drb);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { framebuffer: fb, colorTexture: colorTex, normalTexture: normalTex, depthRenderbuffer: drb, width: w, height: h };
}

function destroyGBuffer(gl, gb) { gl.deleteFramebuffer(gb.framebuffer); gl.deleteTexture(gb.colorTexture); gl.deleteTexture(gb.normalTexture); gl.deleteRenderbuffer(gb.depthRenderbuffer); }

class MeshRenderer {
    constructor(gl, { lightDir=[0.4,0.8,0.3], lightColor=[1.0,0.98,0.95], ambientColor=[0.12,0.12,0.18], specularPower=32 }={}) {
        this.gl=gl; this.lightDir=lightDir; this.lightColor=lightColor; this.ambientColor=ambientColor; this.specularPower=specularPower; this.opacity=1.0;
        this._program=null; this._vao=null; this._posBuf=null; this._nrmBuf=null; this._uvBuf=null; this._colBuf=null; this._idxBuf=null;
        this._indexCount=0; this._vertexCount=0; this._diffuseTexture=null; this._hasTexture=false;
        this._gbuffer=null; this._gbufferWidth=0; this._gbufferHeight=0; this._uniforms={}; this._init();
    }
    _init(){
        const gl=this.gl; this._program=this._cp(MESH_VERTEX,MESH_FRAGMENT);
        const u=n=>gl.getUniformLocation(this._program,n);
        this._uniforms={modelView:u('u_modelView'),projection:u('u_projection'),normalMatrix:u('u_normalMatrix'),rotation4D:u('u_rotation4D'),projDistance:u('u_projDistance'),use4D:u('u_use4D'),diffuseMap:u('u_diffuseMap'),hasTexture:u('u_hasTexture'),lightDir:u('u_lightDir'),lightColor:u('u_lightColor'),ambientColor:u('u_ambientColor'),specularPower:u('u_specularPower'),opacity:u('u_opacity')};
        this._vao=gl.createVertexArray(); gl.bindVertexArray(this._vao);
        const mkBuf=(name,sz)=>{const b=gl.createBuffer();const l=gl.getAttribLocation(this._program,name);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,sz,gl.FLOAT,false,0,0);return b;};
        this._posBuf=mkBuf('a_position',3); this._nrmBuf=mkBuf('a_normal',3); this._uvBuf=mkBuf('a_uv',2); this._colBuf=mkBuf('a_color',4);
        this._idxBuf=gl.createBuffer(); gl.bindVertexArray(null);
    }
    uploadGeometry({positions,normals,uvs,colors,indices}){
        const gl=this.gl,vc=positions.length/3; this._vertexCount=vc;
        gl.bindBuffer(gl.ARRAY_BUFFER,this._posBuf); gl.bufferData(gl.ARRAY_BUFFER,positions,gl.STATIC_DRAW);
        if(normals){gl.bindBuffer(gl.ARRAY_BUFFER,this._nrmBuf);gl.bufferData(gl.ARRAY_BUFFER,normals,gl.STATIC_DRAW);}
        else{const d=new Float32Array(vc*3);for(let i=0;i<vc;i++)d[i*3+1]=1;gl.bindBuffer(gl.ARRAY_BUFFER,this._nrmBuf);gl.bufferData(gl.ARRAY_BUFFER,d,gl.STATIC_DRAW);}
        if(uvs){gl.bindBuffer(gl.ARRAY_BUFFER,this._uvBuf);gl.bufferData(gl.ARRAY_BUFFER,uvs,gl.STATIC_DRAW);}
        else{gl.bindBuffer(gl.ARRAY_BUFFER,this._uvBuf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vc*2),gl.STATIC_DRAW);}
        if(colors){gl.bindBuffer(gl.ARRAY_BUFFER,this._colBuf);gl.bufferData(gl.ARRAY_BUFFER,colors,gl.STATIC_DRAW);}
        else{const w=new Float32Array(vc*4);for(let i=0;i<vc;i++){w[i*4]=1;w[i*4+1]=1;w[i*4+2]=1;w[i*4+3]=1;}gl.bindBuffer(gl.ARRAY_BUFFER,this._colBuf);gl.bufferData(gl.ARRAY_BUFFER,w,gl.STATIC_DRAW);}
        if(indices){gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this._idxBuf);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);this._indexCount=indices.length;}else{this._indexCount=0;}
    }
    uploadTexture(source){
        const gl=this.gl; if(!this._diffuseTexture)this._diffuseTexture=gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D,this._diffuseTexture);
        if(source instanceof ImageData)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,source.width,source.height,0,gl.RGBA,gl.UNSIGNED_BYTE,source.data);
        else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
        gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
        this._hasTexture=true;
    }
    _ensureGBuffer(w,h){if(this._gbuffer&&this._gbufferWidth===w&&this._gbufferHeight===h)return;if(this._gbuffer)destroyGBuffer(this.gl,this._gbuffer);this._gbuffer=createGBuffer(this.gl,w,h);this._gbufferWidth=w;this._gbufferHeight=h;}
    get gbuffer(){return this._gbuffer;}
    render(modelView,projection,{rotation4D=null,projDistance=2.0,width=0,height=0}={}){
        const gl=this.gl,w=width||gl.canvas.width,h=height||gl.canvas.height; this._ensureGBuffer(w,h);
        gl.bindFramebuffer(gl.FRAMEBUFFER,this._gbuffer.framebuffer); gl.viewport(0,0,w,h);
        gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        if(this._vertexCount===0&&this._indexCount===0){gl.bindFramebuffer(gl.FRAMEBUFFER,null);return this._gbuffer;}
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.disable(gl.BLEND);
        gl.useProgram(this._program); gl.bindVertexArray(this._vao);
        if(this._indexCount>0)gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this._idxBuf);
        const u=this._uniforms, ID=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
        gl.uniformMatrix4fv(u.modelView,false,modelView||ID); gl.uniformMatrix4fv(u.projection,false,projection||ID);
        gl.uniformMatrix4fv(u.normalMatrix,false,modelView||ID); gl.uniformMatrix4fv(u.rotation4D,false,rotation4D||ID);
        gl.uniform1f(u.projDistance,projDistance); gl.uniform1f(u.use4D,rotation4D?1.0:0.0);
        gl.uniform3fv(u.lightDir,this.lightDir); gl.uniform3fv(u.lightColor,this.lightColor); gl.uniform3fv(u.ambientColor,this.ambientColor);
        gl.uniform1f(u.specularPower,this.specularPower); gl.uniform1f(u.opacity,this.opacity);
        if(this._hasTexture&&this._diffuseTexture){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this._diffuseTexture);gl.uniform1i(u.diffuseMap,0);gl.uniform1f(u.hasTexture,1.0);}else{gl.uniform1f(u.hasTexture,0.0);}
        if(this._indexCount>0)gl.drawElements(gl.TRIANGLES,this._indexCount,gl.UNSIGNED_SHORT,0);else gl.drawArrays(gl.TRIANGLES,0,this._vertexCount);
        gl.bindVertexArray(null); gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.disable(gl.CULL_FACE);
        return this._gbuffer;
    }
    _cp(v,f){const gl=this.gl,p=gl.createProgram();gl.attachShader(p,this._cc(gl.VERTEX_SHADER,v));gl.attachShader(p,this._cc(gl.FRAGMENT_SHADER,f));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('MeshRenderer: '+gl.getProgramInfoLog(p));return p;}
    _cc(t,s){const gl=this.gl,sh=gl.createShader(t);gl.shaderSource(sh,s);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw new Error('MeshRenderer: '+gl.getShaderInfoLog(sh));return sh;}
    dispose(){const gl=this.gl;gl.deleteProgram(this._program);gl.deleteVertexArray(this._vao);gl.deleteBuffer(this._posBuf);gl.deleteBuffer(this._nrmBuf);gl.deleteBuffer(this._uvBuf);gl.deleteBuffer(this._colBuf);gl.deleteBuffer(this._idxBuf);if(this._diffuseTexture)gl.deleteTexture(this._diffuseTexture);if(this._gbuffer)destroyGBuffer(gl,this._gbuffer);}
}

/* ================================================================== */
/*  EdgeInscriptionLayer (from EdgeInscriptionLayer.js)                */
/* ================================================================== */

const FS_VERT = `#version 300 es
precision highp float; out vec2 v_uv;
void main(){float x=float((gl_VertexID&1)<<2)-1.0;float y=float((gl_VertexID&2)<<1)-1.0;v_uv=vec2(x,y)*0.5+0.5;gl_Position=vec4(x,y,0.0,1.0);}`;

const EDGE_FRAG = `#version 300 es
precision highp float; in vec2 v_uv;
uniform sampler2D u_normalDepth; uniform vec2 u_texelSize; uniform float u_depthSensitivity,u_normalSensitivity;
out vec4 outEdge;
float sd(vec2 uv){return texture(u_normalDepth,uv).a;}
vec3 sn(vec2 uv){return texture(u_normalDepth,uv).rgb*2.0-1.0;}
void main(){
    vec2 ts=u_texelSize;
    float d00=sd(v_uv+vec2(-ts.x,-ts.y)),d10=sd(v_uv+vec2(0,-ts.y)),d20=sd(v_uv+vec2(ts.x,-ts.y));
    float d01=sd(v_uv+vec2(-ts.x,0)),d21=sd(v_uv+vec2(ts.x,0));
    float d02=sd(v_uv+vec2(-ts.x,ts.y)),d12=sd(v_uv+vec2(0,ts.y)),d22=sd(v_uv+vec2(ts.x,ts.y));
    float sx=-d00+d20-2.0*d01+2.0*d21-d02+d22,sy=-d00-2.0*d10-d20+d02+2.0*d12+d22;
    float de=sqrt(sx*sx+sy*sy)*u_depthSensitivity;
    vec3 nc=sn(v_uv); float ne=0.0;
    ne+=1.0-max(0.0,dot(nc,sn(v_uv+vec2(ts.x,0))));ne+=1.0-max(0.0,dot(nc,sn(v_uv+vec2(-ts.x,0))));
    ne+=1.0-max(0.0,dot(nc,sn(v_uv+vec2(0,ts.y))));ne+=1.0-max(0.0,dot(nc,sn(v_uv+vec2(0,-ts.y))));
    ne*=u_normalSensitivity*0.25; outEdge=vec4(clamp(de+ne,0.0,1.0),de,ne,1.0);
}`;

const INSC_FRAG = `#version 300 es
precision highp float; in vec2 v_uv;
uniform sampler2D u_edgeMap,u_normalDepth;
uniform float u_time,u_geometry,u_layerIndex,u_layerCount,u_thickness,u_opacity,u_patternScale,u_patternSpeed;
uniform vec3 u_layerColor; uniform vec2 u_resolution;
uniform float u_rot4dXY,u_rot4dXZ,u_rot4dYZ,u_rot4dXW,u_rot4dYW,u_rot4dZW;
out vec4 outColor;
mat4 rXY(float a){float c=cos(a),s=sin(a);return mat4(c,-s,0,0,s,c,0,0,0,0,1,0,0,0,0,1);}
mat4 rXZ(float a){float c=cos(a),s=sin(a);return mat4(c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1);}
mat4 rYZ(float a){float c=cos(a),s=sin(a);return mat4(1,0,0,0,0,c,-s,0,0,s,c,0,0,0,0,1);}
mat4 rXW(float a){float c=cos(a),s=sin(a);return mat4(c,0,0,-s,0,1,0,0,0,0,1,0,s,0,0,c);}
mat4 rYW(float a){float c=cos(a),s=sin(a);return mat4(1,0,0,0,0,c,0,-s,0,0,1,0,0,s,0,c);}
mat4 rZW(float a){float c=cos(a),s=sin(a);return mat4(1,0,0,0,0,1,0,0,0,0,c,-s,0,0,s,c);}
mat4 r4D(){return rXY(u_rot4dXY)*rXZ(u_rot4dXZ)*rYZ(u_rot4dYZ)*rXW(u_rot4dXW)*rYW(u_rot4dYW)*rZW(u_rot4dZW);}
float sdTorus(vec3 p,float R,float r){vec2 q=vec2(length(p.xz)-R,p.y);return length(q)-r;}
float sdBox(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0);}
float getPat(vec3 p,float g){
    float t=u_time*u_patternSpeed,b=mod(g,8.0),pat=0.0;
    if(b<0.5){pat=abs(max(abs(p.x+p.y)-p.z,abs(p.x-p.y)+p.z)*0.5-0.2);}
    else if(b<1.5){vec3 q=fract(p*4.0+t*0.1)-0.5;pat=sdBox(q,vec3(0.3));}
    else if(b<2.5){float r=length(p),th=atan(p.y,p.x)+t*0.3,ph=acos(clamp(p.z/max(r,0.001),-1.0,1.0));pat=abs(sin(th*3.0)*sin(ph*4.0+t));}
    else if(b<3.5){pat=abs(sdTorus(p,0.5,0.15+sin(t)*0.05));}
    else if(b<4.5){float a=atan(p.y,p.x)+t*0.2;pat=abs(sin(a*3.0+p.z*5.0+t));}
    else if(b<5.5){vec3 q=p*2.0;float s=1.0;for(int i=0;i<4;i++){q=abs(q)-1.0;q*=2.0;s*=2.0;q-=1.0;}pat=length(q)/s;}
    else if(b<6.5){pat=abs(sin(p.x*8.0+t)*sin(p.y*8.0+t*0.7)*sin(p.z*8.0+t*1.3));}
    else{vec3 q=abs(fract(p*3.0+t*0.05)-0.5);pat=min(min(q.x,q.y),q.z);}
    if(g>=8.0&&g<16.0){pat*=smoothstep(0.0,1.0,1.0-abs(length(p)-0.5));}
    else if(g>=16.0){pat*=smoothstep(0.2,0.0,abs(max(abs(p.x+p.y)-p.z,abs(p.x-p.y)+p.z)*0.5));}
    return clamp(pat,0.0,1.0);
}
void main(){
    vec4 ed=texture(u_edgeMap,v_uv); float edge=ed.r;
    float lt=u_layerIndex/max(1.0,u_layerCount-1.0),it=lt*u_thickness,ot=(lt+1.0/u_layerCount)*u_thickness;
    float mask=smoothstep(it,it+0.02,edge)*(1.0-smoothstep(ot,ot+0.02,edge));
    if(mask<0.001){outColor=vec4(0);return;}
    vec2 asp=vec2(1.0,u_resolution.y/u_resolution.x);
    vec3 pp=vec3((v_uv*2.0-1.0)*asp*u_patternScale,u_layerIndex*0.5);
    vec4 p4=r4D()*vec4(pp,0.0); vec3 proj=p4.xyz/(2.0-p4.w);
    float pat=getPat(proj,u_geometry);
    float hs=lt*0.3+u_time*0.05; vec3 ic=u_layerColor;
    ic.r*=0.8+0.2*sin(hs*6.2832); ic.g*=0.8+0.2*sin(hs*6.2832+2.094); ic.b*=0.8+0.2*sin(hs*6.2832+4.189);
    float alpha=mask*pat*u_opacity; vec3 c=ic*(0.6+pat*0.4)+vec3(smoothstep(0.3,0.8,edge)*pat*0.5)*u_layerColor;
    outColor=vec4(c*alpha,alpha);
}`;

const BLIT_FRAG = `#version 300 es
precision highp float; in vec2 v_uv; uniform sampler2D u_texture; uniform float u_opacity; out vec4 outColor;
void main(){vec4 c=texture(u_texture,v_uv);outColor=vec4(c.rgb,c.a*u_opacity);}`;

function createFBO(gl,w,h){
    const tex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    const fb=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null); return{framebuffer:fb,texture:tex,width:w,height:h};
}
function destroyFBO(gl,f){gl.deleteFramebuffer(f.framebuffer);gl.deleteTexture(f.texture);}

class EdgeInscriptionLayer {
    constructor(gl,{layerCount=4,geometry=3,thickness=0.6,patternScale=3.0,patternSpeed=0.3,depthSensitivity=8.0,normalSensitivity=2.0,baseColor=[0.3,0.7,1.0],opacity=0.8}={}){
        this.gl=gl; this.layerCount=layerCount; this.geometry=geometry; this.thickness=thickness;
        this.patternScale=patternScale; this.patternSpeed=patternSpeed; this.depthSensitivity=depthSensitivity;
        this.normalSensitivity=normalSensitivity; this.baseColor=baseColor; this.opacity=opacity;
        this.rot4dXY=0;this.rot4dXZ=0;this.rot4dYZ=0;this.rot4dXW=0;this.rot4dYW=0;this.rot4dZW=0;
        this.layerColors=[[0.2,0.6,1.0],[0.8,0.3,1.0],[1.0,0.5,0.2],[0.3,1.0,0.6]];
        this.layerOpacities=[0.9,0.7,0.5,0.3];
        this._edgeProg=null;this._inscProg=null;this._blitProg=null;this._qv=null;
        this._edgeFBO=null;this._layerFBO=null;this._compFBO=null;this._w=0;this._h=0;
        this._init();
    }
    _init(){const gl=this.gl;this._edgeProg=this._cp(FS_VERT,EDGE_FRAG);this._inscProg=this._cp(FS_VERT,INSC_FRAG);this._blitProg=this._cp(FS_VERT,BLIT_FRAG);this._qv=gl.createVertexArray();}
    _ensureFBOs(w,h){if(this._w===w&&this._h===h)return;const gl=this.gl;if(this._edgeFBO)destroyFBO(gl,this._edgeFBO);if(this._layerFBO)destroyFBO(gl,this._layerFBO);if(this._compFBO)destroyFBO(gl,this._compFBO);this._edgeFBO=createFBO(gl,w,h);this._layerFBO=createFBO(gl,w,h);this._compFBO=createFBO(gl,w,h);this._w=w;this._h=h;}
    render(normalDepthTexture,time,{width=0,height=0}={}){
        const gl=this.gl,w=width||gl.canvas.width,h=height||gl.canvas.height; this._ensureFBOs(w,h);
        gl.bindFramebuffer(gl.FRAMEBUFFER,this._edgeFBO.framebuffer);gl.viewport(0,0,w,h);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
        gl.useProgram(this._edgeProg);gl.bindVertexArray(this._qv);
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,normalDepthTexture);
        gl.uniform1i(gl.getUniformLocation(this._edgeProg,'u_normalDepth'),0);
        gl.uniform2f(gl.getUniformLocation(this._edgeProg,'u_texelSize'),1/w,1/h);
        gl.uniform1f(gl.getUniformLocation(this._edgeProg,'u_depthSensitivity'),this.depthSensitivity);
        gl.uniform1f(gl.getUniformLocation(this._edgeProg,'u_normalSensitivity'),this.normalSensitivity);
        gl.drawArrays(gl.TRIANGLES,0,3);
        gl.bindFramebuffer(gl.FRAMEBUFFER,this._compFBO.framebuffer);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
        for(let layer=0;layer<this.layerCount;layer++){
            gl.bindFramebuffer(gl.FRAMEBUFFER,this._layerFBO.framebuffer);gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.disable(gl.BLEND);
            gl.useProgram(this._inscProg);gl.bindVertexArray(this._qv);
            gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this._edgeFBO.texture);gl.uniform1i(gl.getUniformLocation(this._inscProg,'u_edgeMap'),0);
            gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,normalDepthTexture);gl.uniform1i(gl.getUniformLocation(this._inscProg,'u_normalDepth'),1);
            const p=this._inscProg,ul=(n,v)=>gl.uniform1f(gl.getUniformLocation(p,n),v);
            ul('u_time',time);ul('u_geometry',this.geometry);ul('u_layerIndex',layer);ul('u_layerCount',this.layerCount);
            ul('u_thickness',this.thickness);ul('u_opacity',this.layerOpacities[layer]!==undefined?this.layerOpacities[layer]:this.opacity);
            ul('u_patternScale',this.patternScale);ul('u_patternSpeed',this.patternSpeed);
            gl.uniform2f(gl.getUniformLocation(p,'u_resolution'),w,h);
            const lc=this.layerColors[layer]||this.baseColor;gl.uniform3fv(gl.getUniformLocation(p,'u_layerColor'),lc);
            ul('u_rot4dXY',this.rot4dXY);ul('u_rot4dXZ',this.rot4dXZ);ul('u_rot4dYZ',this.rot4dYZ);
            ul('u_rot4dXW',this.rot4dXW);ul('u_rot4dYW',this.rot4dYW);ul('u_rot4dZW',this.rot4dZW);
            gl.drawArrays(gl.TRIANGLES,0,3);
            gl.bindFramebuffer(gl.FRAMEBUFFER,this._compFBO.framebuffer);gl.viewport(0,0,w,h);
            gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);
            gl.useProgram(this._blitProg);gl.bindVertexArray(this._qv);
            gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this._layerFBO.texture);
            gl.uniform1i(gl.getUniformLocation(this._blitProg,'u_texture'),0);gl.uniform1f(gl.getUniformLocation(this._blitProg,'u_opacity'),1.0);
            gl.drawArrays(gl.TRIANGLES,0,3);
        }
        gl.disable(gl.BLEND);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return this._compFBO;
    }
    get edgeTexture(){return this._edgeFBO?this._edgeFBO.texture:null;}
    get compositeTexture(){return this._compFBO?this._compFBO.texture:null;}
    _cp(v,f){const gl=this.gl,p=gl.createProgram();gl.attachShader(p,this._cc(gl.VERTEX_SHADER,v));gl.attachShader(p,this._cc(gl.FRAGMENT_SHADER,f));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('EdgeInscription: '+gl.getProgramInfoLog(p));return p;}
    _cc(t,s){const gl=this.gl,sh=gl.createShader(t);gl.shaderSource(sh,s);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw new Error('EdgeInscription: '+gl.getShaderInfoLog(sh));return sh;}
    dispose(){const gl=this.gl;gl.deleteProgram(this._edgeProg);gl.deleteProgram(this._inscProg);gl.deleteProgram(this._blitProg);gl.deleteVertexArray(this._qv);if(this._edgeFBO)destroyFBO(gl,this._edgeFBO);if(this._layerFBO)destroyFBO(gl,this._layerFBO);if(this._compFBO)destroyFBO(gl,this._compFBO);}
}

/* ================================================================== */
/*  HybridRenderPipeline (from HybridRenderPipeline.js)                */
/* ================================================================== */

const COMP_FRAG = `#version 300 es
precision highp float; in vec2 v_uv;
uniform sampler2D u_meshLayer,u_splatLayer,u_proceduralLayer,u_inscriptionLayer;
uniform float u_meshOpacity,u_splatOpacity,u_proceduralOpacity,u_inscriptionOpacity;
uniform float u_meshEnabled,u_splatEnabled,u_proceduralEnabled,u_inscriptionEnabled;
uniform float u_meshBlend,u_splatBlend,u_proceduralBlend,u_inscriptionBlend;
uniform float u_exposure,u_gamma;
out vec4 outColor;
vec3 bl(vec3 base,vec4 l,float m){vec3 c=l.rgb;float a=l.a;if(a<0.001)return base;
if(m<0.5)return mix(base,c,a);else if(m<1.5)return base+c*a;else if(m<2.5)return mix(base,base*c,a);else return mix(base,1.0-(1.0-base)*(1.0-c),a);}
void main(){
    vec3 c=vec3(0.012,0.02,0.05);
    if(u_meshEnabled>0.5){vec4 m=texture(u_meshLayer,v_uv);m.a*=u_meshOpacity;c=bl(c,m,u_meshBlend);}
    if(u_splatEnabled>0.5){vec4 s=texture(u_splatLayer,v_uv);s.a*=u_splatOpacity;c=bl(c,s,u_splatBlend);}
    if(u_proceduralEnabled>0.5){vec4 p=texture(u_proceduralLayer,v_uv);p.a*=u_proceduralOpacity;c=bl(c,p,u_proceduralBlend);}
    if(u_inscriptionEnabled>0.5){vec4 i=texture(u_inscriptionLayer,v_uv);i.a*=u_inscriptionOpacity;c=bl(c,i,u_inscriptionBlend);}
    c*=u_exposure;c=c/(c+vec3(1.0));c=pow(c,vec3(1.0/u_gamma));outColor=vec4(c,1.0);
}`;

const BlendModes = Object.freeze({ ALPHA:0, ADDITIVE:1, MULTIPLY:2, SCREEN:3 });
function defaultLC(o={}){return{enabled:true,opacity:1.0,blendMode:BlendModes.ALPHA,...o};}

function createFBOd(gl,w,h){
    const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    const drb=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,drb);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,w,h);
    const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,drb);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);return{framebuffer:fb,texture:tex,depthRb:drb,width:w,height:h};
}
function destroyFBOd(gl,f){gl.deleteFramebuffer(f.framebuffer);gl.deleteTexture(f.texture);gl.deleteRenderbuffer(f.depthRb);}

class HybridRenderPipeline {
    constructor(gl,{exposure=1.2,gamma=2.2}={}){
        this.gl=gl;this.exposure=exposure;this.gamma=gamma;
        this._meshRenderer=null;this._splatRenderer=null;this._proceduralRenderer=null;this._edgeInscription=null;
        this.meshLayer=defaultLC();this.splatLayer=defaultLC({blendMode:BlendModes.ADDITIVE,opacity:0.9});
        this.proceduralLayer=defaultLC({blendMode:BlendModes.SCREEN,opacity:0.5});
        this.inscriptionLayer=defaultLC({blendMode:BlendModes.ADDITIVE,opacity:0.8});
        this._compProg=null;this._blitProg=null;this._qv=null;this._splatFBO=null;this._procFBO=null;this._w=0;this._h=0;this._blackTex=null;
        this._init();
    }
    _init(){
        const gl=this.gl;this._compProg=this._cp(FS_VERT,COMP_FRAG);this._blitProg=this._cp(FS_VERT,BLIT_FRAG);this._qv=gl.createVertexArray();
        this._blackTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this._blackTex);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,0]));
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    }
    _ensureFBOs(w,h){if(this._w===w&&this._h===h)return;const gl=this.gl;if(this._splatFBO)destroyFBOd(gl,this._splatFBO);if(this._procFBO)destroyFBOd(gl,this._procFBO);this._splatFBO=createFBOd(gl,w,h);this._procFBO=createFBOd(gl,w,h);this._w=w;this._h=h;}
    setMeshRenderer(r){this._meshRenderer=r;} setSplatRenderer(r){this._splatRenderer=r;} setProceduralRenderer(cb){this._proceduralRenderer=cb;} setEdgeInscription(l){this._edgeInscription=l;}
    render(time,modelView,projection,{viewProjection=null,rotation4D=null,projDistance=2.0}={}){
        const gl=this.gl,w=gl.canvas.width,h=gl.canvas.height;this._ensureFBOs(w,h);
        const stats={meshRendered:false,splatRendered:false,proceduralRendered:false,inscriptionRendered:false,layersComposited:0};
        let meshTex=this._blackTex,splatTex=this._blackTex,procTex=this._blackTex,inscTex=this._blackTex,ndTex=null;
        if(this._meshRenderer&&this.meshLayer.enabled){const gb=this._meshRenderer.render(modelView,projection,{rotation4D,projDistance,width:w,height:h});meshTex=gb.colorTexture;ndTex=gb.normalTexture;stats.meshRendered=true;}
        if(this._splatRenderer&&this.splatLayer.enabled){
            gl.bindFramebuffer(gl.FRAMEBUFFER,this._splatFBO.framebuffer);gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
            if(stats.meshRendered&&this._meshRenderer.gbuffer){gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this._meshRenderer.gbuffer.framebuffer);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,this._splatFBO.framebuffer);gl.blitFramebuffer(0,0,w,h,0,0,w,h,gl.DEPTH_BUFFER_BIT,gl.NEAREST);gl.bindFramebuffer(gl.FRAMEBUFFER,this._splatFBO.framebuffer);}
            const vp=viewProjection||new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
            gl.bindFramebuffer(gl.FRAMEBUFFER,this._splatFBO.framebuffer);gl.viewport(0,0,w,h);
            if(this._splatRenderer.render)this._splatRenderer.render(vp,time);
            splatTex=this._splatFBO.texture;stats.splatRendered=true;
        }
        if(this._proceduralRenderer&&this.proceduralLayer.enabled){gl.bindFramebuffer(gl.FRAMEBUFFER,this._procFBO.framebuffer);gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);this._proceduralRenderer(this._procFBO,time);procTex=this._procFBO.texture;stats.proceduralRendered=true;}
        if(this._edgeInscription&&this.inscriptionLayer.enabled&&ndTex){const r=this._edgeInscription.render(ndTex,time,{width:w,height:h});inscTex=r.texture;stats.inscriptionRendered=true;}
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
        gl.useProgram(this._compProg);gl.bindVertexArray(this._qv);const p=this._compProg;
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,meshTex);gl.uniform1i(gl.getUniformLocation(p,'u_meshLayer'),0);
        gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,splatTex);gl.uniform1i(gl.getUniformLocation(p,'u_splatLayer'),1);
        gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,procTex);gl.uniform1i(gl.getUniformLocation(p,'u_proceduralLayer'),2);
        gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,inscTex);gl.uniform1i(gl.getUniformLocation(p,'u_inscriptionLayer'),3);
        const ul=(n,v)=>gl.uniform1f(gl.getUniformLocation(p,n),v);
        ul('u_meshOpacity',this.meshLayer.opacity);ul('u_splatOpacity',this.splatLayer.opacity);ul('u_proceduralOpacity',this.proceduralLayer.opacity);ul('u_inscriptionOpacity',this.inscriptionLayer.opacity);
        ul('u_meshEnabled',this.meshLayer.enabled&&stats.meshRendered?1:0);ul('u_splatEnabled',this.splatLayer.enabled&&stats.splatRendered?1:0);
        ul('u_proceduralEnabled',this.proceduralLayer.enabled&&stats.proceduralRendered?1:0);ul('u_inscriptionEnabled',this.inscriptionLayer.enabled&&stats.inscriptionRendered?1:0);
        ul('u_meshBlend',this.meshLayer.blendMode);ul('u_splatBlend',this.splatLayer.blendMode);ul('u_proceduralBlend',this.proceduralLayer.blendMode);ul('u_inscriptionBlend',this.inscriptionLayer.blendMode);
        ul('u_exposure',this.exposure);ul('u_gamma',this.gamma);
        gl.drawArrays(gl.TRIANGLES,0,3);
        stats.layersComposited=(stats.meshRendered?1:0)+(stats.splatRendered?1:0)+(stats.proceduralRendered?1:0)+(stats.inscriptionRendered?1:0);
        return stats;
    }
    _cp(v,f){const gl=this.gl,p=gl.createProgram();gl.attachShader(p,this._cc(gl.VERTEX_SHADER,v));gl.attachShader(p,this._cc(gl.FRAGMENT_SHADER,f));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('HybridPipeline: '+gl.getProgramInfoLog(p));return p;}
    _cc(t,s){const gl=this.gl,sh=gl.createShader(t);gl.shaderSource(sh,s);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw new Error('HybridPipeline: '+gl.getShaderInfoLog(sh));return sh;}
    dispose(){const gl=this.gl;gl.deleteProgram(this._compProg);gl.deleteProgram(this._blitProg);gl.deleteVertexArray(this._qv);gl.deleteTexture(this._blackTex);if(this._splatFBO)destroyFBOd(gl,this._splatFBO);if(this._procFBO)destroyFBOd(gl,this._procFBO);}
}

/* ================================================================== */
/*  TextureToSplatConverter (simplified for demo)                      */
/* ================================================================== */

function luminance(r,g,b){return 0.2126*r+0.7152*g+0.0722*b;}
function sobelMag(buf,w,h,x,y){const g=(dx,dy)=>{const cx=Math.min(w-1,Math.max(0,x+dx)),cy=Math.min(h-1,Math.max(0,y+dy));return buf[cy*w+cx];};const gx=-g(-1,-1)+g(1,-1)-2*g(-1,0)+2*g(1,0)-g(-1,1)+g(1,1);const gy=-g(-1,-1)-2*g(0,-1)-g(1,-1)+g(-1,1)+2*g(0,1)+g(1,1);return Math.sqrt(gx*gx+gy*gy);}
function baryLerp3(a,b,c,u,v){const w=1-u-v;return[a[0]*w+b[0]*u+c[0]*v,a[1]*w+b[1]*u+c[1]*v,a[2]*w+b[2]*u+c[2]*v];}
function baryLerp2(a,b,c,u,v){const w=1-u-v;return[a[0]*w+b[0]*u+c[0]*v,a[1]*w+b[1]*u+c[1]*v];}
function sampleTex(px,w,h,u,v){u=u-Math.floor(u);v=v-Math.floor(v);const fx=u*(w-1),fy=v*(h-1),x0=Math.floor(fx),y0=Math.floor(fy),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1),dx=fx-x0,dy=fy-y0;const idx=(a,b)=>(b*w+a)*4;const i00=idx(x0,y0),i10=idx(x1,y0),i01=idx(x0,y1),i11=idx(x1,y1);return[(px[i00]*(1-dx)*(1-dy)+px[i10]*dx*(1-dy)+px[i01]*(1-dx)*dy+px[i11]*dx*dy)/255,(px[i00+1]*(1-dx)*(1-dy)+px[i10+1]*dx*(1-dy)+px[i01+1]*(1-dx)*dy+px[i11+1]*dx*dy)/255,(px[i00+2]*(1-dx)*(1-dy)+px[i10+2]*dx*(1-dy)+px[i01+2]*(1-dx)*dy+px[i11+2]*dx*dy)/255,(px[i00+3]*(1-dx)*(1-dy)+px[i10+3]*dx*(1-dy)+px[i01+3]*(1-dx)*dy+px[i11+3]*dx*dy)/255];}
function normalize3(v){const l=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);if(l>1e-8){v[0]/=l;v[1]/=l;v[2]/=l;}return v;}
function cross3(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}

class TextureToSplatConverter {
    constructor(){this.samplesPerTriangle=6;this.edgeBoostFactor=3;this.edgeThreshold=0.10;this.baseScale=0.03;this.jitter=0.3;this.alphaThreshold=0.1;}
    convert({positions,normals,uvs,indices,diffusePixels,diffuseWidth,diffuseHeight}){
        const lumBuf=new Float32Array(diffuseWidth*diffuseHeight);
        for(let i=0;i<diffuseWidth*diffuseHeight;i++)lumBuf[i]=luminance(diffusePixels[i*4]/255,diffusePixels[i*4+1]/255,diffusePixels[i*4+2]/255);
        const edgeMap=new Float32Array(diffuseWidth*diffuseHeight);
        for(let y=0;y<diffuseHeight;y++)for(let x=0;x<diffuseWidth;x++)edgeMap[y*diffuseWidth+x]=sobelMag(lumBuf,diffuseWidth,diffuseHeight,x,y);
        const seeds=[],triCount=indices.length/3;
        for(let t=0;t<triCount;t++){
            const i0=indices[t*3],i1=indices[t*3+1],i2=indices[t*3+2];
            const p0=[positions[i0*3],positions[i0*3+1],positions[i0*3+2]],p1=[positions[i1*3],positions[i1*3+1],positions[i1*3+2]],p2=[positions[i2*3],positions[i2*3+1],positions[i2*3+2]];
            const n0=[normals[i0*3],normals[i0*3+1],normals[i0*3+2]],n1=[normals[i1*3],normals[i1*3+1],normals[i1*3+2]],n2=[normals[i2*3],normals[i2*3+1],normals[i2*3+2]];
            const uv0=[uvs[i0*2],uvs[i0*2+1]],uv1=[uvs[i1*2],uvs[i1*2+1]],uv2=[uvs[i2*2],uvs[i2*2+1]];
            const e1=[p1[0]-p0[0],p1[1]-p0[1],p1[2]-p0[2]],e2=[p2[0]-p0[0],p2[1]-p0[1],p2[2]-p0[2]];
            const cx=cross3(e1,e2),area=0.5*Math.sqrt(cx[0]*cx[0]+cx[1]*cx[1]+cx[2]*cx[2]);
            const areaSamples=Math.max(1,Math.round(this.samplesPerTriangle*Math.sqrt(area)));
            const cuv=baryLerp2(uv0,uv1,uv2,1/3,1/3);
            const tx=Math.min(diffuseWidth-1,Math.max(0,Math.floor(cuv[0]*diffuseWidth))),ty=Math.min(diffuseHeight-1,Math.max(0,Math.floor(cuv[1]*diffuseHeight)));
            const es=edgeMap[ty*diffuseWidth+tx];
            const extra=es>this.edgeThreshold?Math.round(this.edgeBoostFactor*(es/1.0)):0;
            for(let s=0;s<areaSamples+extra;s++){
                let bu=Math.random(),bv=Math.random();if(bu+bv>1){bu=1-bu;bv=1-bv;}
                bu=Math.max(0,Math.min(1,bu+(Math.random()-0.5)*this.jitter*0.1));bv=Math.max(0,Math.min(1-bu,bv+(Math.random()-0.5)*this.jitter*0.1));
                const pos=baryLerp3(p0,p1,p2,bu,bv),nrm=normalize3(baryLerp3(n0,n1,n2,bu,bv)),uv=baryLerp2(uv0,uv1,uv2,bu,bv);
                const[dr,dg,db,da]=sampleTex(diffusePixels,diffuseWidth,diffuseHeight,uv[0],uv[1]);
                if(da<this.alphaThreshold)continue;
                const lum=luminance(dr,dg,db);
                const edgeAt=sobelMag(lumBuf,diffuseWidth,diffuseHeight,Math.floor(uv[0]*diffuseWidth)%diffuseWidth,Math.floor(uv[1]*diffuseHeight)%diffuseHeight);
                const eScale=1-Math.min(1,edgeAt*2),scale=this.baseScale*(0.5+lum*0.5)*(0.4+eScale*0.6);
                const off=scale*0.1;
                seeds.push({position:[pos[0]+nrm[0]*off,pos[1]+nrm[1]*off,pos[2]+nrm[2]*off],orientation:[1,0,0,0],scale,color:[dr,dg,db],depth:0});
            }
        }
        return seeds;
    }
}

/* ================================================================== */
/*  PROCEDURAL MESH GENERATORS                                         */
/* ================================================================== */

function generateTorus(R,r,segments,rings){const p=[],n=[],u=[],idx=[];for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2,b=j/rings*Math.PI*2;p.push((R+r*Math.cos(b))*Math.cos(a),r*Math.sin(b),(R+r*Math.cos(b))*Math.sin(a));n.push(Math.cos(b)*Math.cos(a),Math.sin(b),Math.cos(b)*Math.sin(a));u.push(i/segments,j/rings);}for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;idx.push(a,b,a+1,b,b+1,a+1);}return{positions:new Float32Array(p),normals:new Float32Array(n),uvs:new Float32Array(u),indices:new Uint16Array(idx),triCount:idx.length/3};}

function generateSphere(radius,ws,hs){const p=[],n=[],u=[],idx=[];for(let y=0;y<=hs;y++)for(let x=0;x<=ws;x++){const a=x/ws,b=y/hs,th=a*Math.PI*2,ph=b*Math.PI;const px=-radius*Math.cos(th)*Math.sin(ph),py=radius*Math.cos(ph),pz=radius*Math.sin(th)*Math.sin(ph);const l=Math.sqrt(px*px+py*py+pz*pz)||1;p.push(px,py,pz);n.push(px/l,py/l,pz/l);u.push(a,b);}for(let y=0;y<hs;y++)for(let x=0;x<ws;x++){const a=y*(ws+1)+x,b=a+ws+1;idx.push(a,b,a+1,b,b+1,a+1);}return{positions:new Float32Array(p),normals:new Float32Array(n),uvs:new Float32Array(u),indices:new Uint16Array(idx),triCount:idx.length/3};}

function generateCube(size){const s=size/2;const P=[-s,-s,s,s,-s,s,s,s,s,-s,s,s,s,-s,-s,-s,-s,-s,-s,s,-s,s,s,-s,-s,s,s,s,s,s,s,s,-s,-s,s,-s,-s,-s,-s,s,-s,-s,s,-s,s,-s,-s,s,s,-s,s,s,-s,-s,s,s,-s,s,s,s,-s,-s,-s,-s,-s,s,-s,s,s,-s,s,-s];const N=[0,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0];const U=[0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1];const I=[];for(let f=0;f<6;f++){const o=f*4;I.push(o,o+1,o+2,o,o+2,o+3);}return{positions:new Float32Array(P),normals:new Float32Array(N),uvs:new Float32Array(U),indices:new Uint16Array(I),triCount:I.length/3};}

function generateTrefoilKnot(radius,tube,ts,rs){const p=[],n=[],u=[],idx=[];function kp(t){t*=Math.PI*2;return[( Math.sin(t)+2*Math.sin(2*t))*radius,(Math.cos(t)-2*Math.cos(2*t))*radius,-Math.sin(3*t)*radius];}for(let j=0;j<=rs;j++)for(let i=0;i<=ts;i++){const a=i/ts,v=j/rs*Math.PI*2;const pt=kp(a),p1=kp(a+0.001);const T=[p1[0]-pt[0],p1[1]-pt[1],p1[2]-pt[2]];const tl=Math.sqrt(T[0]*T[0]+T[1]*T[1]+T[2]*T[2])||1;T[0]/=tl;T[1]/=tl;T[2]/=tl;let N0=[0,1,0];if(Math.abs(T[1])>0.99)N0=[1,0,0];const B=[T[1]*N0[2]-T[2]*N0[1],T[2]*N0[0]-T[0]*N0[2],T[0]*N0[1]-T[1]*N0[0]];const bl=Math.sqrt(B[0]*B[0]+B[1]*B[1]+B[2]*B[2])||1;B[0]/=bl;B[1]/=bl;B[2]/=bl;const Nv=[B[1]*T[2]-B[2]*T[1],B[2]*T[0]-B[0]*T[2],B[0]*T[1]-B[1]*T[0]];const cx=Math.cos(v),sx=Math.sin(v);const nx=cx*Nv[0]+sx*B[0],ny=cx*Nv[1]+sx*B[1],nz=cx*Nv[2]+sx*B[2];p.push(pt[0]+tube*nx,pt[1]+tube*ny,pt[2]+tube*nz);n.push(nx,ny,nz);u.push(a,j/rs);}for(let j=0;j<rs;j++)for(let i=0;i<ts;i++){const a=j*(ts+1)+i,b=a+ts+1;idx.push(a,b,a+1,b,b+1,a+1);}return{positions:new Float32Array(p),normals:new Float32Array(n),uvs:new Float32Array(u),indices:new Uint16Array(idx),triCount:idx.length/3};}

/* ================================================================== */
/*  PROCEDURAL TEXTURE                                                 */
/* ================================================================== */

function generateCheckerTexture(size){const c=document.createElement('canvas');c.width=size;c.height=size;const ctx=c.getContext('2d');const grd=ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size*0.5);grd.addColorStop(0,'#ff6b35');grd.addColorStop(0.35,'#d63384');grd.addColorStop(0.65,'#6f42c1');grd.addColorStop(1,'#0d6efd');ctx.fillStyle=grd;ctx.fillRect(0,0,size,size);ctx.globalCompositeOperation='multiply';const cells=8,cs=size/cells;for(let r=0;r<cells;r++)for(let cl=0;cl<cells;cl++){ctx.fillStyle=(r+cl)%2===0?'rgba(255,255,255,0.85)':'rgba(60,60,80,0.85)';ctx.fillRect(cl*cs,r*cs,cs,cs);}ctx.globalCompositeOperation='screen';for(let i=1;i<=6;i++){ctx.beginPath();ctx.arc(size/2,size/2,i*size*0.07,0,Math.PI*2);ctx.lineWidth=2;ctx.strokeStyle=`hsla(${i*50},80%,70%,0.4)`;ctx.stroke();}ctx.globalCompositeOperation='source-over';return ctx.getImageData(0,0,size,size);}

/* ================================================================== */
/*  VIB3 PROCEDURAL SHADER (for Layer 2)                               */
/* ================================================================== */

const PROC_VERT = FS_VERT;
const PROC_FRAG = `#version 300 es
precision highp float; in vec2 v_uv; uniform float u_time,u_geometry; uniform vec2 u_resolution; out vec4 outColor;
mat4 rXW(float a){float c=cos(a),s=sin(a);return mat4(c,0,0,-s,0,1,0,0,0,0,1,0,s,0,0,c);}
mat4 rYW(float a){float c=cos(a),s=sin(a);return mat4(1,0,0,0,0,c,0,-s,0,0,1,0,0,s,0,c);}
mat4 rZW(float a){float c=cos(a),s=sin(a);return mat4(1,0,0,0,0,1,0,0,0,0,c,-s,0,0,s,c);}
void main(){
    vec2 uv=(v_uv*2.0-1.0)*vec2(u_resolution.x/u_resolution.y,1.0); float t=u_time*0.3;
    vec4 p=rXW(t*0.4)*rYW(t*0.3)*rZW(t*0.2)*vec4(uv,0,0); vec3 pos=p.xyz/(2.0-p.w);
    float b=mod(u_geometry,8.0),pat=0.0;
    if(b<0.5)pat=abs(sin(pos.x*6.0+t)*sin(pos.y*6.0-t));
    else if(b<1.5){vec3 q=fract(pos*4.0)-0.5;pat=1.0-smoothstep(0.2,0.3,length(max(abs(q)-0.2,0.0)));}
    else if(b<2.5){pat=1.0-smoothstep(0.3,0.5,length(pos));pat*=abs(sin(atan(pos.y,pos.x)*5.0+t*2.0));}
    else if(b<3.5){float r=length(pos.xy);pat=abs(sin((r-0.35)*30.0+t*2.0))*smoothstep(0.5,0.3,abs(r-0.35));}
    else if(b<4.5){float a=atan(pos.y,pos.x)+t;pat=abs(sin(a*3.0+pos.x*5.0));}
    else if(b<5.5){vec2 q=pos.xy*3.0;for(int i=0;i<4;i++){q=abs(q)-1.0;q*=1.5;}pat=1.0-smoothstep(0.0,0.2,length(q)*0.1);}
    else if(b<6.5){pat=sin(pos.x*10.0+t)*sin(pos.y*10.0+t*0.7);pat=pat*0.5+0.5;}
    else{vec2 q=abs(fract(pos.xy*4.0)-0.5);pat=1.0-smoothstep(0.0,0.05,min(q.x,q.y));}
    if(u_geometry>=8.0&&u_geometry<16.0)pat*=smoothstep(0.6,0.3,length(pos));
    else if(u_geometry>=16.0)pat*=smoothstep(0.5,0.2,abs(max(abs(pos.x+pos.y)-pos.x,abs(pos.x-pos.y)+pos.x)*0.5));
    vec3 col=vec3(0.2,0.5,1.0)*pat+vec3(0.8,0.2,0.5)*(1.0-pat)*0.3; col*=pat;
    outColor=vec4(col,pat*0.7);
}`;

/* ================================================================== */
/*  CAMERA                                                             */
/* ================================================================== */

function mat4Multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
function mat4Perspective(fov,aspect,near,far){const f=1/Math.tan(fov*0.5),ri=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*ri,-1,0,0,2*far*near*ri,0]);}
function mat4LookAt(eye,tgt,up){let zx=eye[0]-tgt[0],zy=eye[1]-tgt[1],zz=eye[2]-tgt[2];let l=Math.hypot(zx,zy,zz)||1;zx/=l;zy/=l;zz/=l;let xx=up[1]*zz-up[2]*zy,xy=up[2]*zx-up[0]*zz,xz=up[0]*zy-up[1]*zx;l=Math.hypot(xx,xy,xz)||1;xx/=l;xy/=l;xz/=l;const yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;return new Float32Array([xx,yx,zx,0,xy,yy,zy,0,xz,yz,zz,0,-(xx*eye[0]+xy*eye[1]+xz*eye[2]),-(yx*eye[0]+yy*eye[1]+yz*eye[2]),-(zx*eye[0]+zy*eye[1]+zz*eye[2]),1]);}

class OrbitCamera{
    constructor(canvas){this.distance=5;this.azimuth=0.5;this.elevation=0.35;this.fov=Math.PI/4;this.near=0.1;this.far=100;this.target=[0,0,0];this.canvas=canvas;this._dragging=false;this._lastX=0;this._lastY=0;
    canvas.addEventListener('pointerdown',e=>{this._dragging=true;this._lastX=e.clientX;this._lastY=e.clientY;canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!this._dragging)return;this.azimuth+=(e.clientX-this._lastX)*0.005;this.elevation+=(e.clientY-this._lastY)*0.005;this.elevation=Math.max(-1.5,Math.min(1.5,this.elevation));this._lastX=e.clientX;this._lastY=e.clientY;});
    canvas.addEventListener('pointerup',()=>{this._dragging=false;});
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.distance*=1+e.deltaY*0.001;this.distance=Math.max(1,Math.min(30,this.distance));},{passive:false});}
    get isDragging(){return this._dragging;}
    get eye(){const ce=Math.cos(this.elevation),se=Math.sin(this.elevation),ca=Math.cos(this.azimuth),sa=Math.sin(this.azimuth);return[this.target[0]+this.distance*ce*sa,this.target[1]+this.distance*se,this.target[2]+this.distance*ce*ca];}
    get aspect(){return this.canvas.width/this.canvas.height;}
    get viewMatrix(){return mat4LookAt(this.eye,this.target,[0,1,0]);}
    get projectionMatrix(){return mat4Perspective(this.fov,this.aspect,this.near,this.far);}
    get viewProjection(){return mat4Multiply(this.projectionMatrix,this.viewMatrix);}
}

/* ================================================================== */
/*  v2: InscriptionChannel (semantic state → inscription mapping)      */
/* ================================================================== */

const STATE_PRESETS={idle:{priority:0,opacityMultiplier:0.3,thicknessMultiplier:0.5,speedMultiplier:0.5,glowIntensity:0.1,colorShift:[0,0,0],rotationSpeed:0.1,patternOverride:null},active:{priority:1,opacityMultiplier:0.8,thicknessMultiplier:1.0,speedMultiplier:1.0,glowIntensity:0.5,colorShift:[0.1,0.1,0.2],rotationSpeed:0.3,patternOverride:null},selected:{priority:2,opacityMultiplier:1.0,thicknessMultiplier:1.2,speedMultiplier:0.8,glowIntensity:0.8,colorShift:[0,0.2,0.3],rotationSpeed:0.5,patternOverride:7},powered:{priority:2,opacityMultiplier:1.0,thicknessMultiplier:1.5,speedMultiplier:1.5,glowIntensity:1.0,colorShift:[0.3,0,0.5],rotationSpeed:1.0,patternOverride:6},damaged:{priority:3,opacityMultiplier:0.9,thicknessMultiplier:0.8,speedMultiplier:2.0,glowIntensity:0.7,colorShift:[0.5,-0.2,-0.2],rotationSpeed:2.0,patternOverride:5},destroyed:{priority:4,opacityMultiplier:0.4,thicknessMultiplier:2.0,speedMultiplier:3.0,glowIntensity:0.3,colorShift:[0.3,-0.1,-0.3],rotationSpeed:3.0,patternOverride:5}};

const AUDIO_MAPPINGS={bass:{rot4dXW:0.5,thickness:0.3,glow:0.4},mid:{rot4dYW:0.3,speed:0.5,opacity:0.2},high:{rot4dZW:0.6,patternScale:0.3,hueShift:30},energy:{allRotation:0.3,intensity:0.5,glow:0.3}};

function generateIdentityConfig(objectID,layerCount=4){const hash=(s)=>{let h=s*2654435761;h=((h>>>16)^h)*2246822507;h=((h>>>16)^h)*3266489909;h=(h>>>16)^h;return(h&0x7FFFFFFF)/0x7FFFFFFF;};const layers=[];for(let i=0;i<layerCount;i++){const s=objectID*1000+i;layers.push({geometry:Math.floor(hash(s)*24),thickness:0.3+hash(s+100)*0.4,opacity:0.7+hash(s+200)*0.3,color:[0.3+hash(s+300)*0.7,0.3+hash(s+400)*0.7,0.3+hash(s+500)*0.7],patternScale:2+hash(s+600)*4,patternSpeed:0.2+hash(s+700)*0.4,rotOffset:hash(s+800)*Math.PI*2});}return{layers,baseRotationSpeed:hash(objectID*31)*0.5,baseHue:hash(objectID*47)*360};}

class InscriptionChannel{
constructor({layerCount=4,transitionDuration=0.5}={}){this.layerCount=layerCount;this.transitionDuration=transitionDuration;this._objectStates=new Map();this._audio={bass:0,mid:0,high:0,energy:0};this._time=0;}
registerObject(id,state='idle'){const identity=generateIdentityConfig(id,this.layerCount);const preset=STATE_PRESETS[state]||STATE_PRESETS.idle;this._objectStates.set(id,{currentState:state,targetState:state,transitionProgress:1.0,currentPreset:{...preset},targetPreset:{...preset},identity});}
setObjectState(id,state){let obj=this._objectStates.get(id);if(!obj){this.registerObject(id,state);return;}if(obj.targetState===state)return;const preset=STATE_PRESETS[state];if(!preset)return;obj.currentPreset=this._interp(obj.currentPreset,obj.targetPreset,obj.transitionProgress);obj.targetPreset={...preset};obj.currentState=obj.targetState;obj.targetState=state;obj.transitionProgress=0;}
setAudio(b,m,h,e){this._audio.bass=Math.max(0,Math.min(1,b||0));this._audio.mid=Math.max(0,Math.min(1,m||0));this._audio.high=Math.max(0,Math.min(1,h||0));this._audio.energy=Math.max(0,Math.min(1,e||0));}
update(dt){this._time+=dt;for(const obj of this._objectStates.values())if(obj.transitionProgress<1)obj.transitionProgress=Math.min(1,obj.transitionProgress+dt/this.transitionDuration);}
getInscriptionConfig(id){let obj=this._objectStates.get(id);if(!obj){this.registerObject(id);obj=this._objectStates.get(id);}const preset=this._interp(obj.currentPreset,obj.targetPreset,obj.transitionProgress);const identity=obj.identity;const audio=this._audio;const layers=[];for(let i=0;i<this.layerCount;i++){const bl=identity.layers[i];const geom=preset.patternOverride!==null?preset.patternOverride:bl.geometry;const opacity=bl.opacity*preset.opacityMultiplier+audio.energy*AUDIO_MAPPINGS.energy.intensity*0.3;const thickness=bl.thickness*preset.thicknessMultiplier+audio.bass*AUDIO_MAPPINGS.bass.thickness;const speed=bl.patternSpeed*preset.speedMultiplier+audio.mid*AUDIO_MAPPINGS.mid.speed;const hs=audio.high*AUDIO_MAPPINGS.high.hueShift/360;const color=[Math.min(1,Math.max(0,bl.color[0]+preset.colorShift[0]+hs*0.5)),Math.min(1,Math.max(0,bl.color[1]+preset.colorShift[1]+hs*0.3)),Math.min(1,Math.max(0,bl.color[2]+preset.colorShift[2]+hs))];layers.push({geometry:geom,thickness:Math.min(1,Math.max(0,thickness)),opacity:Math.min(1,Math.max(0,opacity)),color,patternScale:bl.patternScale+audio.high*AUDIO_MAPPINGS.high.patternScale,patternSpeed:speed,rotOffset:bl.rotOffset+this._time*(identity.baseRotationSpeed+preset.rotationSpeed*0.5)});}return{layers,rot4dXW:audio.bass*AUDIO_MAPPINGS.bass.rot4dXW+audio.energy*AUDIO_MAPPINGS.energy.allRotation,rot4dYW:audio.mid*AUDIO_MAPPINGS.mid.rot4dYW+audio.energy*AUDIO_MAPPINGS.energy.allRotation,rot4dZW:audio.high*AUDIO_MAPPINGS.high.rot4dZW+audio.energy*AUDIO_MAPPINGS.energy.allRotation,globalThickness:0.6*preset.thicknessMultiplier+audio.bass*0.2,glowIntensity:preset.glowIntensity+audio.energy*AUDIO_MAPPINGS.energy.glow,bass:audio.bass,mid:audio.mid,high:audio.high,energy:audio.energy};}
applyToLayer(layer,id){const cfg=this.getInscriptionConfig(id);layer.rot4dXW=cfg.rot4dXW;layer.rot4dYW=cfg.rot4dYW;layer.rot4dZW=cfg.rot4dZW;layer.globalThickness=cfg.globalThickness;if(layer.setAudio)layer.setAudio(cfg.bass,cfg.mid,cfg.high,cfg.energy);for(let i=0;i<cfg.layers.length&&i<layer.layerCount;i++)if(layer.setLayerConfig)layer.setLayerConfig(i,cfg.layers[i]);}
get registeredObjects(){return Array.from(this._objectStates.keys());}
get stateNames(){return Object.keys(STATE_PRESETS);}
_interp(a,b,t){const st=t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2;return{priority:b.priority,opacityMultiplier:a.opacityMultiplier+(b.opacityMultiplier-a.opacityMultiplier)*st,thicknessMultiplier:a.thicknessMultiplier+(b.thicknessMultiplier-a.thicknessMultiplier)*st,speedMultiplier:a.speedMultiplier+(b.speedMultiplier-a.speedMultiplier)*st,glowIntensity:a.glowIntensity+(b.glowIntensity-a.glowIntensity)*st,colorShift:[a.colorShift[0]+(b.colorShift[0]-a.colorShift[0])*st,a.colorShift[1]+(b.colorShift[1]-a.colorShift[1])*st,a.colorShift[2]+(b.colorShift[2]-a.colorShift[2])*st],rotationSpeed:a.rotationSpeed+(b.rotationSpeed-a.rotationSpeed)*st,patternOverride:st>0.5?b.patternOverride:a.patternOverride};}
dispose(){this._objectStates.clear();}
}

/* ================================================================== */
/*  SETUP                                                              */
/* ================================================================== */

const canvas = document.getElementById('canvas');
canvas.width = window.innerWidth * devicePixelRatio;
canvas.height = window.innerHeight * devicePixelRatio;

const gl = canvas.getContext('webgl2', { depth:true, antialias:false, preserveDrawingBuffer:false });
if(!gl){document.body.innerHTML='<h2 style="color:#fff;text-align:center;margin-top:40vh">WebGL2 required</h2>';throw new Error('WebGL2 required');}
gl.getExtension('EXT_color_buffer_half_float');

const camera = new OrbitCamera(canvas);
window.addEventListener('resize',()=>{canvas.width=window.innerWidth*devicePixelRatio;canvas.height=window.innerHeight*devicePixelRatio;});

/* ================================================================== */
/*  INIT RENDERERS                                                     */
/* ================================================================== */

const meshRenderer = new MeshRenderer(gl,{lightDir:[0.5,0.8,0.3],lightColor:[1.0,0.98,0.95],ambientColor:[0.15,0.15,0.22],specularPower:48});
const splatRenderer = new GaussianSplatRenderer(gl,{pointScale:canvas.height/(2*Math.tan(Math.PI/8)),blendMode:'additive',animate:true,intensity:1.0,chromatic:0.4});
const edgeInscription = new EdgeInscriptionLayer(gl,{layerCount:4,geometry:3,thickness:0.6,patternScale:3.0,patternSpeed:0.3,depthSensitivity:8.0,normalSensitivity:2.0,opacity:0.8});
const pipeline = new HybridRenderPipeline(gl,{exposure:1.2,gamma:2.2});
pipeline.setMeshRenderer(meshRenderer); pipeline.setSplatRenderer(splatRenderer); pipeline.setEdgeInscription(edgeInscription);
if(pipeline.setDPR)pipeline.setDPR(devicePixelRatio);

// v2: InscriptionChannel
const inscriptionChannel = new InscriptionChannel({layerCount:4,transitionDuration:0.5});
inscriptionChannel.registerObject(1,'active');
if(pipeline.setInscriptionChannel)pipeline.setInscriptionChannel(inscriptionChannel);
let audioSimLevel=0;

// Procedural shader (Layer 2)
let procProgram=null,procQuadVao=null,procGeometry=3;
{const vs=gl.createShader(gl.VERTEX_SHADER);gl.shaderSource(vs,PROC_VERT);gl.compileShader(vs);
const fs=gl.createShader(gl.FRAGMENT_SHADER);gl.shaderSource(fs,PROC_FRAG);gl.compileShader(fs);
if(gl.getShaderParameter(vs,gl.COMPILE_STATUS)&&gl.getShaderParameter(fs,gl.COMPILE_STATUS)){procProgram=gl.createProgram();gl.attachShader(procProgram,vs);gl.attachShader(procProgram,fs);gl.linkProgram(procProgram);if(!gl.getProgramParameter(procProgram,gl.LINK_STATUS))procProgram=null;else procQuadVao=gl.createVertexArray();}}
pipeline.setProceduralRenderer((fbo,time)=>{if(!procProgram)return;gl.useProgram(procProgram);gl.bindVertexArray(procQuadVao);gl.uniform1f(gl.getUniformLocation(procProgram,'u_time'),time);gl.uniform1f(gl.getUniformLocation(procProgram,'u_geometry'),procGeometry);gl.uniform2f(gl.getUniformLocation(procProgram,'u_resolution'),fbo.width,fbo.height);gl.drawArrays(gl.TRIANGLES,0,3);});

/* ================================================================== */
/*  MESH + TEXTURE + SPLAT SETUP                                       */
/* ================================================================== */

const MESHES={torus:()=>generateTorus(1,0.4,64,32),sphere:()=>generateSphere(1.2,48,32),cube:()=>generateCube(1.8),knot:()=>generateTrefoilKnot(0.35,0.12,128,24)};
let currentMeshKey='torus',currentMesh=null,textureSplats=[];
const textureConverter=new TextureToSplatConverter();
const textureData=generateCheckerTexture(256);

function loadMesh(key){
    currentMeshKey=key;const gen=MESHES[key];if(!gen)return;currentMesh=gen();meshRenderer.uploadGeometry(currentMesh);meshRenderer.uploadTexture(textureData);
    textureSplats=textureConverter.convert({positions:currentMesh.positions,normals:currentMesh.normals,uvs:currentMesh.uvs,indices:currentMesh.indices,diffusePixels:textureData.data,diffuseWidth:textureData.width,diffuseHeight:textureData.height});
    splatRenderer.updateSeeds(encodeGaussianSeeds(textureSplats),textureSplats.length);
    document.getElementById('meshTris').textContent=currentMesh.triCount.toLocaleString();
    document.getElementById('splatCount').textContent=textureSplats.length.toLocaleString();
    document.querySelectorAll('.mesh-btn').forEach(b=>b.classList.toggle('active',b.dataset.mesh===key));
}

/* ================================================================== */
/*  TABS                                                               */
/* ================================================================== */

let currentTab='hybrid';
const TAB_CFGS={'hybrid':{m:true,s:true,p:true,i:true,l:'Hybrid'},'mesh-inscribe':{m:true,s:false,p:false,i:true,l:'Mesh+Insc'},'mesh-splat':{m:true,s:true,p:false,i:false,l:'Mesh+Splat'},'splat-proc':{m:false,s:true,p:true,i:false,l:'Splat+Proc'},'multi-scene':{m:true,s:false,p:false,i:true,l:'MultiObj'},'benchmark':{m:true,s:true,p:true,i:true,l:'Benchmark'}};

function switchTab(tab){
    currentTab=tab;const c=TAB_CFGS[tab];if(!c)return;
    pipeline.meshLayer.enabled=c.m;pipeline.splatLayer.enabled=c.s;pipeline.proceduralLayer.enabled=c.p;pipeline.inscriptionLayer.enabled=c.i;
    document.getElementById('toggleMesh').checked=c.m;document.getElementById('toggleSplat').checked=c.s;document.getElementById('toggleProcedural').checked=c.p;document.getElementById('toggleInscription').checked=c.i;
    document.getElementById('compositorMode').textContent=c.l;
    document.getElementById('benchmarkPanel').classList.toggle('hidden',tab!=='benchmark');
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
}

/* ================================================================== */
/*  CONTROLS WIRING                                                    */
/* ================================================================== */

document.querySelectorAll('.tab-btn').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
document.querySelectorAll('.mesh-btn').forEach(b=>b.addEventListener('click',()=>loadMesh(b.dataset.mesh)));
const ctrlToggle=document.getElementById('controlsToggle'),ctrlPanel=document.getElementById('controls');
ctrlToggle.addEventListener('click',()=>{const c=ctrlPanel.classList.toggle('collapsed');ctrlToggle.classList.toggle('active',!c);});
document.getElementById('toggleMesh').addEventListener('change',e=>pipeline.meshLayer.enabled=e.target.checked);
document.getElementById('toggleSplat').addEventListener('change',e=>pipeline.splatLayer.enabled=e.target.checked);
document.getElementById('toggleProcedural').addEventListener('change',e=>pipeline.proceduralLayer.enabled=e.target.checked);
document.getElementById('toggleInscription').addEventListener('change',e=>pipeline.inscriptionLayer.enabled=e.target.checked);
function wireSlider(sid,vid,cb){const s=document.getElementById(sid),v=document.getElementById(vid);s.addEventListener('input',()=>{const val=s.value/100;v.textContent=val.toFixed(2);cb(val);});}
wireSlider('sliderMeshOpacity','valMeshOpacity',v=>pipeline.meshLayer.opacity=v);
wireSlider('sliderSplatOpacity','valSplatOpacity',v=>pipeline.splatLayer.opacity=v);
wireSlider('sliderProcOpacity','valProcOpacity',v=>pipeline.proceduralLayer.opacity=v);
wireSlider('sliderInscOpacity','valInscOpacity',v=>pipeline.inscriptionLayer.opacity=v);
document.getElementById('selectMeshBlend').addEventListener('change',e=>pipeline.meshLayer.blendMode=parseInt(e.target.value));
document.getElementById('selectSplatBlend').addEventListener('change',e=>pipeline.splatLayer.blendMode=parseInt(e.target.value));
document.getElementById('selectProcBlend').addEventListener('change',e=>pipeline.proceduralLayer.blendMode=parseInt(e.target.value));
const slT=document.getElementById('sliderThickness'),vlT=document.getElementById('valThickness');slT.addEventListener('input',()=>{const v=slT.value/100;vlT.textContent=v.toFixed(2);edgeInscription.thickness=v;});
const slP=document.getElementById('sliderPattern'),vlP=document.getElementById('valPattern');slP.addEventListener('input',()=>{vlP.textContent=slP.value;edgeInscription.geometry=parseInt(slP.value);});
const slLC=document.getElementById('sliderLayerCount'),vlLC=document.getElementById('valLayerCount');slLC.addEventListener('input',()=>{vlLC.textContent=slLC.value;edgeInscription.layerCount=parseInt(slLC.value);document.getElementById('inscLayers').textContent=slLC.value;});
const slG=document.getElementById('sliderGeometry'),vlG=document.getElementById('valGeometry');slG.addEventListener('input',()=>{vlG.textContent=slG.value;procGeometry=parseInt(slG.value);});
const slE=document.getElementById('sliderExposure'),vlE=document.getElementById('valExposure');slE.addEventListener('input',()=>{const v=slE.value/100;vlE.textContent=v.toFixed(2);pipeline.exposure=v;});
function wire4D(sid,vid,prop){const s=document.getElementById(sid),v=document.getElementById(vid);s.addEventListener('input',()=>{const val=s.value/100;v.textContent=val.toFixed(2);edgeInscription[prop]=val;});}
wire4D('slider4DXW','val4DXW','rot4dXW');wire4D('slider4DYW','val4DYW','rot4dYW');wire4D('slider4DZW','val4DZW','rot4dZW');
// v2: Semantic state + audio sim
const elState=document.getElementById('selectState');if(elState)elState.addEventListener('change',e=>{inscriptionChannel.setObjectState(1,e.target.value);const cs=document.getElementById('currentState');if(cs)cs.textContent=e.target.value;});
const elMorph=document.getElementById('sliderMorph'),elMorphV=document.getElementById('valMorph');if(elMorph)elMorph.addEventListener('input',()=>{const v=elMorph.value/100;if(elMorphV)elMorphV.textContent=v.toFixed(2);meshRenderer.morphWeight=v;});
const elAudioS=document.getElementById('sliderAudioSim'),elAudioSV=document.getElementById('valAudioSim');if(elAudioS)elAudioS.addEventListener('input',()=>{const v=elAudioS.value/100;if(elAudioSV)elAudioSV.textContent=v.toFixed(2);audioSimLevel=v;});
document.getElementById('selectSplatSource').addEventListener('change',e=>{const src=e.target.value;if(src==='texture'){loadMesh(currentMeshKey);}else{const seeds=[];const count=src==='galaxy'?200000:150000;for(let i=0;i<count;i++){const t=Math.random()*Math.PI*2,r=Math.pow(Math.random(),0.5)*3;if(src==='galaxy'){const arm=Math.floor(Math.random()*3)*(Math.PI*2/3),sp=t*0.5;seeds.push({position:[r*Math.cos(t+arm+sp)+(Math.random()-0.5)*0.3,(Math.random()-0.5)*0.2*(1-r/3),r*Math.sin(t+arm+sp)+(Math.random()-0.5)*0.3],orientation:[1,0,0,0],scale:0.015+Math.random()*0.02,color:[0.6+Math.random()*0.4,0.4+Math.random()*0.4,0.8+Math.random()*0.2],depth:r*0.3});}else{const phi=(Math.random()-0.5)*Math.PI;seeds.push({position:[r*Math.cos(t)*Math.cos(phi),r*Math.sin(phi)*0.6,r*Math.sin(t)*Math.cos(phi)],orientation:[1,0,0,0],scale:0.02+Math.random()*0.03,color:[0.8+Math.random()*0.2,0.2+Math.random()*0.3,0.5+Math.random()*0.5],depth:r*0.2});}}splatRenderer.updateSeeds(encodeGaussianSeeds(seeds),seeds.length);document.getElementById('splatCount').textContent=seeds.length.toLocaleString();}});

/* ================================================================== */
/*  BENCHMARK                                                          */
/* ================================================================== */

async function runBenchmark(){
    const btn=document.getElementById('runBenchmark'),res=document.getElementById('benchResults');btn.disabled=true;btn.textContent='Running...';res.innerHTML='';
    const cfgs=[{name:'Mesh Only',m:true,s:false,p:false,i:false},{name:'Splat Only',m:false,s:true,p:false,i:false},{name:'Procedural Only',m:false,s:false,p:true,i:false},{name:'Mesh + Inscription',m:true,s:false,p:false,i:true},{name:'Mesh + Splat',m:true,s:true,p:false,i:false},{name:'Full Hybrid',m:true,s:true,p:true,i:true}];
    const FRAMES=60,results=[];
    for(const cfg of cfgs){
        pipeline.meshLayer.enabled=cfg.m;pipeline.splatLayer.enabled=cfg.s;pipeline.proceduralLayer.enabled=cfg.p;pipeline.inscriptionLayer.enabled=cfg.i;
        for(let i=0;i<5;i++){const t=performance.now()*0.001;pipeline.render(t,camera.viewMatrix,camera.projectionMatrix,{viewProjection:camera.viewProjection});}gl.finish();
        const start=performance.now();for(let i=0;i<FRAMES;i++){const t=performance.now()*0.001;pipeline.render(t,camera.viewMatrix,camera.projectionMatrix,{viewProjection:camera.viewProjection});}gl.finish();
        const elapsed=performance.now()-start,avgMs=elapsed/FRAMES,fps=1000/avgMs;results.push({name:cfg.name,avgMs,fps});await new Promise(r=>setTimeout(r,10));
    }
    switchTab(currentTab);const maxMs=Math.max(...results.map(r=>r.avgMs));
    let html='<div class="bench-row bench-header"><span>Configuration</span><span>ms/frame</span><span>FPS</span></div>';
    for(const r of results){const bw=Math.round((r.avgMs/maxMs)*100);const isT=r.name==='Full Hybrid';
    html+=`<div class="bench-row ${isT?'bench-total':''}"><span class="bench-label">${r.name}</span><span class="bench-value">${r.avgMs.toFixed(2)}</span><span class="bench-value">${Math.round(r.fps)}</span></div><div class="bench-bar" style="width:${bw}%;${isT?'background:rgba(200,100,255,0.5)':''}"></div>`;}
    res.innerHTML=html;btn.disabled=false;btn.textContent='Run Benchmark';
}
document.getElementById('runBenchmark').addEventListener('click',runBenchmark);

/* ================================================================== */
/*  STATS + RENDER LOOP                                                */
/* ================================================================== */

let frameCount=0,lastFpsTime=performance.now(),autoOrbit=true,startTime=performance.now(),lastTime=0;
const elFps=document.getElementById('fps'),elFT=document.getElementById('frameTime'),elAL=document.getElementById('activeLayers');
canvas.addEventListener('pointerdown',()=>{autoOrbit=false;});canvas.addEventListener('pointerup',()=>{setTimeout(()=>{autoOrbit=true;},3000);});

function tick(){
    const fs=performance.now(),time=(performance.now()-startTime)*0.001;
    const deltaTime=time-lastTime;lastTime=time;
    if(autoOrbit&&!camera.isDragging)camera.azimuth+=0.003;
    edgeInscription.rot4dXY=time*0.1;edgeInscription.rot4dYZ=time*0.07;
    // v2: Update inscription channel
    inscriptionChannel.update(deltaTime);
    if(audioSimLevel>0){const bass=audioSimLevel*(0.5+0.5*Math.sin(time*2.1)),mid=audioSimLevel*(0.5+0.5*Math.sin(time*3.7)),high=audioSimLevel*(0.5+0.5*Math.sin(time*5.3)),energy=audioSimLevel*(0.6+0.4*Math.sin(time*1.3));inscriptionChannel.setAudio(bass,mid,high,energy);if(edgeInscription.setAudio)edgeInscription.setAudio(bass,mid,high,energy);}
    const stats=pipeline.render(time,camera.viewMatrix,camera.projectionMatrix,{viewProjection:camera.viewProjection});
    frameCount++;const now=performance.now();
    if(now-lastFpsTime>500){elFps.textContent=Math.round(frameCount/((now-lastFpsTime)/1000));elFT.textContent=(now-fs).toFixed(1)+' ms';frameCount=0;lastFpsTime=now;}
    if(stats)elAL.textContent=stats.layersComposited;
    requestAnimationFrame(tick);
}

loadMesh('torus');switchTab('hybrid');tick();
