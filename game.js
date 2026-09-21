import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x021119);
scene.fog = new THREE.FogExp2(0x03151d, 0.035);

const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.05, 150);
camera.position.set(0, 1.55, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.xr.enabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const enter = document.querySelector('#enter-vr');
const vrButton = VRButton.createButton(renderer);
vrButton.style.display = 'none';
document.body.appendChild(vrButton);
enter.onclick = () => vrButton.click();
renderer.xr.addEventListener('sessionstart', () => document.body.classList.add('vr'));
renderer.xr.addEventListener('sessionend', () => document.body.classList.remove('vr'));

const chargeEl = document.querySelector('#charge');
const chargeValue = document.querySelector('#charge-value');
const message = document.querySelector('#message');
const clock = new THREE.Clock();
const keys = {};
let battery = 100;
let recharge = 0;
let yaw = 0;
let rightHeld = false;
let leftHeld = false;
let dynamoHeld = false;
let dynamoController = null;
let previousCrankAngle = null;
let desktopCharging = false;
const velocity = new THREE.Vector3();
const player = new THREE.Group();
scene.add(player);
player.add(camera);
camera.position.set(0, 1.55, 0);

function material(color, roughness = .7, metalness = .1) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function box(parent, size, position, color, emissive = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color));
  m.position.set(...position); m.castShadow = m.receiveShadow = true;
  if (emissive) { m.material.emissive.setHex(color); m.material.emissiveIntensity = emissive; }
  parent.add(m); return m;
}
function label(text, width = 256, height = 64) {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  const x = c.getContext('2d'); x.fillStyle = '#1b160c'; x.fillRect(0,0,width,height);
  x.strokeStyle = '#dca33f'; x.lineWidth = 3; x.strokeRect(2,2,width-4,height-4);
  x.fillStyle = '#ffe4ac'; x.font = `bold ${Math.floor(height*.36)}px monospace`; x.textAlign='center'; x.textBaseline='middle'; x.fillText(text,width/2,height/2);
  return new THREE.CanvasTexture(c);
}

// Ocean lighting and seabed
scene.add(new THREE.HemisphereLight(0x154256, 0x021008, 0.6));
const oceanLight = new THREE.DirectionalLight(0x4a93a8, 0.5); oceanLight.position.set(0, 15, -20); scene.add(oceanLight);
const seabed = new THREE.Mesh(new THREE.PlaneGeometry(180, 180, 40, 40), material(0x0d2d2b, 1));
seabed.rotation.x = -Math.PI / 2; seabed.position.y = -8; seabed.receiveShadow = true;
const p = seabed.geometry.attributes.position;
for (let i=0;i<p.count;i++) p.setZ(i, Math.sin(p.getX(i)*.18)*.8 + Math.cos(p.getY(i)*.22)*.65);
p.needsUpdate = true; scene.add(seabed);
for (let i=0; i<130; i++) {
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(.25 + Math.random()*1.2, 0), material(0x16413a, .95));
  rock.position.set((Math.random()-.5)*110, -7 + Math.random()*1.5, -10 - Math.random()*100);
  rock.rotation.set(Math.random(),Math.random(),Math.random()); rock.scale.y = .45 + Math.random()*.6; scene.add(rock);
}
const particles = new THREE.BufferGeometry(); const positions = [];
for(let i=0;i<1000;i++) positions.push((Math.random()-.5)*90, Math.random()*30-9, -Math.random()*110+10);
particles.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
const dust = new THREE.Points(particles, new THREE.PointsMaterial({color:0x6eaeb6,size:.04,transparent:true,opacity:.45})); scene.add(dust);

// Cockpit attached to the vehicle, with a genuine opening in the front bulkhead.
const cabin = new THREE.Group(); player.add(cabin);
// Compact dimensions: controls sit within a relaxed seated reach in a Quest play space.
cabin.scale.setScalar(.55);
cabin.position.y=.3;
const yellow = 0xc68122, darkYellow = 0x5b3510;
// Fully enclosed rectangular pressure cabin. The only opening is the round porthole below.
box(cabin,[6,.16,6],[0,-.05,-1.5],darkYellow);
box(cabin,[6,.16,6],[0,3.4,-1.5],darkYellow);
box(cabin,[.16,3.6,6],[-3,1.7,-1.5],yellow);
box(cabin,[.16,3.6,6],[3,1.7,-1.5],yellow);
box(cabin,[6,3.6,.16],[0,1.7,1.5],yellow);
// front wall with circular porthole hole
const wall = new THREE.Shape(); wall.moveTo(-3,-.1); wall.lineTo(3,-.1); wall.lineTo(3,3.4); wall.lineTo(-3,3.4); wall.closePath();
const hole = new THREE.Path(); hole.absarc(0,1.7,1.18,0,Math.PI*2,true); wall.holes.push(hole);
const front = new THREE.Mesh(new THREE.ShapeGeometry(wall), material(yellow)); front.position.z=-2.3; front.receiveShadow=true; cabin.add(front);
const rim = new THREE.Mesh(new THREE.TorusGeometry(1.25,.16,12,40), material(0xd6a13c,.45,.45)); rim.position.set(0,1.7,-2.25); cabin.add(rim);
const glass = new THREE.Mesh(new THREE.CircleGeometry(1.13,40), new THREE.MeshPhysicalMaterial({color:0x8ccbd3,transparent:true,opacity:.08,roughness:.05,metalness:.1,side:THREE.DoubleSide})); glass.position.set(0,1.7,-2.22); cabin.add(glass);

// warm practical lamps
for (const pos of [[-2.3,2.85,-1.5],[2.3,2.85,-1.5],[-2.4,1.2,.2],[2.4,1.2,.2]]) {
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.12,12,8), new THREE.MeshStandardMaterial({color:0xffbd4d,emissive:0xff8a18,emissiveIntensity:1})); bulb.position.set(...pos); cabin.add(bulb);
  const l = new THREE.PointLight(0xffa834,1.05,5,2); l.position.set(...pos); cabin.add(l);
}
const interactables = [];
function makeLever(name, position, side) {
  const g = new THREE.Group(); g.position.set(...position); cabin.add(g);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.18,.24,.12,20),material(0x263235,.5,.5)); g.add(base);
  const arm = new THREE.Group(); arm.position.y=.06; g.add(arm);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(.052,.065,.75,12),material(0x1a2020,.4,.7)); rod.position.y=.375; arm.add(rod);
  const grip = new THREE.Mesh(new THREE.SphereGeometry(.14,16,12),material(0xc84e27,.55,.2)); grip.position.y=.8; arm.add(grip);
  grip.userData = { kind:'lever', side, arm, name }; interactables.push(grip); return grip;
}
// +X is the player's right when looking through the forward porthole.
const rightLever = makeLever('ХОД',[.78,.06,-1.15],'right');
const leftLever = makeLever('ГЛУБИНА', [-.78,.06,-1.15],'left');

// Parked beside the right shoulder. Turning right in the seat presents the wheel face-on.
const dynamo = new THREE.Group(); dynamo.position.set(1.65,1.45,-.05); dynamo.rotation.y=-Math.PI/2; cabin.add(dynamo);
box(dynamo,[.52,.62,.38],[0,0,0],0x314044);
// The wheel is mounted on the face aimed at the seated player, not on the far side of the casing.
const axle = new THREE.Group(); axle.position.set(0,.05,.33); dynamo.add(axle);
const wheel = new THREE.Mesh(new THREE.TorusGeometry(.37,.05,10,24),material(0x8d9590,.35,.65)); axle.add(wheel);
// A transparent, wide hit surface makes every part of the wheel a valid grab point.
const wheelGrab = new THREE.Mesh(
  new THREE.CircleGeometry(.48, 32),
  new THREE.MeshBasicMaterial({transparent:true, opacity:.015, depthWrite:false})
);
wheelGrab.position.z=.025; wheelGrab.userData={kind:'dynamo',axle}; axle.add(wheelGrab); interactables.push(wheelGrab);
for(let i=0;i<4;i++){ const spoke=box(axle,[.06,.62,.05],[0,0,0],0x8d9590); spoke.rotation.z=i*Math.PI/2; }
const crank = box(axle,[.35,.05,.05],[.28,-.2,.03],0xc84e27);
const dynLabel = new THREE.Mesh(new THREE.PlaneGeometry(.82,.18),new THREE.MeshBasicMaterial({map:label('ДИНАМО',256,56)})); dynLabel.position.set(0,.52,.23); dynamo.add(dynLabel);

// A small, low status strip: kept below the porthole so it never covers the view.
const energyLabel = new THREE.Mesh(new THREE.PlaneGeometry(.72,.13),new THREE.MeshBasicMaterial({map:label('ЭНЕРГИЯ',220,48)}));
energyLabel.position.set(0,.34,-2.215); cabin.add(energyLabel);
const energyBack = new THREE.Mesh(new THREE.PlaneGeometry(1.18,.1),new THREE.MeshBasicMaterial({color:0x221607}));
energyBack.position.set(0,.17,-2.215); cabin.add(energyBack);
const energyFill = new THREE.Mesh(new THREE.PlaneGeometry(1.08,.06),new THREE.MeshBasicMaterial({color:0xffcf56}));
energyFill.position.set(0,.17,-2.22); energyFill.userData.fullWidth=1.08; cabin.add(energyFill);

const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();
const controllers = {};
const controllerList = [];
function attachController(index) {
  const c = renderer.xr.getController(index); c.userData.hand=''; controllerList.push(c); player.add(c);
  const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,-3)]),new THREE.LineBasicMaterial({color:0xffd382})); ray.name='ray'; ray.scale.z=.6; c.add(ray);
  c.addEventListener('connected', event => { c.userData.hand=event.data.handedness; c.userData.inputSource=event.data; controllers[event.data.handedness]=c; });
  c.addEventListener('disconnected', () => { release(c); c.userData.inputSource=null; });
}
attachController(0); attachController(1);
function select(controller, includeDynamo = true) {
  tempMatrix.identity().extractRotation(controller.matrixWorld); raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld); raycaster.ray.direction.set(0,0,-1).applyMatrix4(tempMatrix);
  const candidates=includeDynamo ? interactables : interactables.filter(object => object.userData.kind !== 'dynamo');
  let hit=raycaster.intersectObjects(candidates,false)[0];
  // Seated VR is more comfortable with a generous reach volume than precision ray targeting.
  const hand=controller.getWorldPosition(new THREE.Vector3());
  let nearest=null, nearestDistance=.62;
  for (const object of candidates) {
    const distance=hand.distanceTo(object.getWorldPosition(new THREE.Vector3()));
    if (distance<nearestDistance) { nearest={object}; nearestDistance=distance; }
  }
  if (nearest) hit=nearest;
  if (!hit) return;
  controller.userData.held=hit.object.userData.kind;
  controller.userData.heldSide=hit.object.userData.side;
  if(hit.object.userData.kind==='lever') { if(hit.object.userData.side==='right') rightHeld=true; else leftHeld=true; }
  if(hit.object.userData.kind==='dynamo') { dynamoHeld=true; dynamoController=controller; previousCrankAngle=null; }
}
function release(controller) { const held=controller.userData.held; if(held==='lever'){ if(controller.userData.heldSide==='right')rightHeld=false; else leftHeld=false; } if(held==='dynamo'){dynamoHeld=false; dynamoController=null; previousCrankAngle=null;} controller.userData.held=null; }
function updateThumbGrabs() {
  for (const controller of controllerList) {
    const buttons=controller.userData.inputSource?.gamepad?.buttons || [];
    // [3] is the standard thumbstick click. Other thumb-operated buttons work as a fallback.
    const thumbPressed=buttons.slice(2).some(button => Boolean(button?.pressed || button?.value > .5));
    // A control is never auto-grabbed: each hand must hold its own thumb button.
    if (!controller.userData.held && thumbPressed) select(controller, true);
    if (!thumbPressed && controller.userData.held) release(controller);
    controller.userData.thumbWasPressed=thumbPressed;
  }
}
function stick(hand) {
  const session=renderer.xr.getSession(); if(!session) return [0,0];
  const source=[...session.inputSources].find(s=>s.handedness===hand && s.gamepad);
  if(!source) return [0,0]; const a=source.gamepad.axes; return a.length>=2?[a[a.length-2]||0,a[a.length-1]||0]:[0,0];
}

function updateUI(moving) {
  chargeEl.style.width=`${battery}%`; chargeValue.textContent=`${Math.round(battery)}%`;
  const amount=Math.max(.01,battery/100);
  energyFill.scale.x=amount;
  energyFill.position.x=-(energyFill.userData.fullWidth*(1-amount))/2;
  energyFill.material.color.setHSL(amount*.16,.9,.55);
  if (dynamoHeld || desktopCharging) message.textContent='Двигайте ручку динамо по кругу, чтобы зарядить батарею.';
  else if (rightHeld || leftHeld) message.textContent=moving?'Батискаф движется. Энергия расходуется.':'Рычаг удерживается. Используйте стик.';
  else message.textContent='Наведите контроллер на рычаг и нажмите стик большим пальцем.';
}
function animate() {
  const dt=Math.min(clock.getDelta(),.05); const t=clock.elapsedTime;
  updateThumbGrabs();
  dust.position.y = Math.sin(t*.2)*.08;
  let moveX=0,moveZ=0,moveY=0,turn=0;
  if(rightHeld){ const [x,y]=stick('right'); moveX=x; moveZ=y; }
  if(leftHeld){ const [x,y]=stick('left'); turn=x; moveY=-y; }
  if(keys.KeyA)moveX=-1; if(keys.KeyD)moveX=1; if(keys.KeyW)moveZ=-1; if(keys.KeyS)moveZ=1;
  if(keys.KeyR)moveY=1; if(keys.KeyF)moveY=-1; if(keys.KeyQ)turn=1; if(keys.KeyE)turn=-1;
  const moving=(Math.abs(moveX)+Math.abs(moveZ)+Math.abs(moveY)+Math.abs(turn))>.08 && battery>.05;
  if(moving){
    yaw-=turn*dt*.75; player.rotation.y=yaw;
    const local=new THREE.Vector3(moveX,0,moveZ).multiplyScalar(dt*1.3); local.applyAxisAngle(new THREE.Vector3(0,1,0),yaw); player.position.add(local);
    player.position.y=THREE.MathUtils.clamp(player.position.y+moveY*dt*1.05,-5.5,4); battery=Math.max(0,battery-dt*.48);
  }
  let generated=0;
  if (dynamoHeld && dynamoController) {
    const handPosition=dynamoController.getWorldPosition(new THREE.Vector3());
    const crankSpace=axle.worldToLocal(handPosition);
    const crankAngle=Math.atan2(crankSpace.y,crankSpace.x);
    if (previousCrankAngle !== null) {
      let delta=crankAngle-previousCrankAngle;
      if(delta>Math.PI)delta-=Math.PI*2; if(delta<-Math.PI)delta+=Math.PI*2;
      if(Math.abs(delta)<.8) { axle.rotation.z+=delta; generated=Math.abs(delta)*2.2; }
    }
    previousCrankAngle=crankAngle;
  }
  const charging=desktopCharging || generated>0;
  if(charging && battery<100){ recharge+=generated || dt*4.5; battery=Math.min(100,battery+(generated || dt*4.5)); }
  else axle.rotation.z=Math.sin(t*1.2)*.03;
  const [rx,ry]=stick('right'); const [lx,ly]=stick('left');
  // Both stick axes physically deflect the matching floor lever.
  rightLever.userData.arm.rotation.z=rightHeld ? -rx*.32 : 0;
  rightLever.userData.arm.rotation.x=rightHeld ? ry*.32 : 0;
  leftLever.userData.arm.rotation.z=leftHeld ? -lx*.32 : 0;
  leftLever.userData.arm.rotation.x=leftHeld ? ly*.32 : 0;
  updateUI(moving);
  renderer.render(scene,camera);
}
window.addEventListener('keydown',e=>{keys[e.code]=true; if(e.code==='KeyC')desktopCharging=true;});
window.addEventListener('keyup',e=>{keys[e.code]=false; if(e.code==='KeyC')desktopCharging=false;});
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
renderer.setAnimationLoop(animate);
