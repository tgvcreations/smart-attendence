'use strict';
// Browser-side eye-blink challenge; not server-verified anti-spoofing.
class FaceChallenge {
 constructor(){this.reset();}
 reset(message='Show one registered face to begin the camera challenge.'){
  this.personId=null;this.startedAt=0;this.lastSeen=0;this.validUntil=0;this.phase='neutral';this.samples=[];this.heldSince=null;this.hits=0;this.message=message;
 }
 hold(ok,now,duration=450){if(!ok){this.advance();return false;}if(this.heldSince===null)this.heldSince=now;this.hits++;return this.hits>=2&&now-this.heldSince>=duration;}
 advance(){this.heldSince=null;this.hits=0;}
 measure(landmarks){
  const p=landmarks?.positions;if(!p||p.length!==68||p.slice(36,48).some(v=>!Number.isFinite(v.x)||!Number.isFinite(v.y)))return null;
  const d=(a,b)=>Math.hypot(p[a].x-p[b].x,p[a].y-p[b].y);
  const left=(d(37,41)+d(38,40))/(2*d(36,39)),right=(d(43,47)+d(44,46))/(2*d(42,45));
  return [left,right].every(Number.isFinite)?{left,right}:null;
 }
 observe(personId,landmarks,now=performance.now()){
  const m=this.measure(landmarks);if(!personId||!m){this.reset('Face landmarks unclear. Face the camera in good light.');return false;}
  if(this.personId!==personId||now-this.lastSeen>3000||now-this.startedAt>30000||(this.phase==='passed'&&now>this.validUntil)){
   this.reset();this.personId=personId;this.startedAt=now;
  }
  this.lastSeen=now;if(this.phase==='passed')return true;
  if(this.phase==='neutral'){
   this.message='Look straight ahead with both eyes open. Hold still.';
   const neutral=m.left>0.18&&m.right>0.18;
   if(!neutral)this.samples=[];else this.samples.push(m);
   if(this.hold(neutral,now)){
    this.baseline={left:this.samples.reduce((a,v)=>a+v.left,0)/this.samples.length,right:this.samples.reduce((a,v)=>a+v.right,0)/this.samples.length};this.phase='action';this.advance();
   }
  }else{
   const open=m.left>this.baseline.left*0.8&&m.right>this.baseline.right*0.8;
   if(this.phase==='action'){
    this.message='Blink slowly: close both eyes until the instruction changes.';
    const performed=m.left<this.baseline.left*0.55&&m.right<this.baseline.right*0.55;
    if(this.hold(performed,now,150)){this.phase='return';this.advance();}
   }else{
    this.message='Open both eyes again and face the camera.';
    if(this.hold(open,now,150)){
     this.advance();this.phase='passed';this.validUntil=now+5000;this.message='Eye-blink challenge passed. Attendance controls are ready.';return true;
    }
   }
  }
  return false;
 }
 ready(personId,now=performance.now()){return this.phase==='passed'&&this.personId===personId&&now<=this.validUntil&&now-this.lastSeen<=1500;}
 consume(personId,now=performance.now()){if(!this.ready(personId,now))return false;this.reset('Attendance submitted. Complete a new challenge for another action.');return true;}
}
const attendanceChallenge=new FaceChallenge();
function renderCameraChallenge(){
 const el=document.getElementById('liveness-status');if(el)el.textContent=attendanceChallenge.message;
 const ready=typeof attRunning!=='undefined'&&attRunning&&attendanceChallenge.ready(recognizedPersonId);
 for(const id of ['btn-punch-in','btn-punch-out']){const button=document.getElementById(id);if(button)button.disabled=!ready;}
}
function resetCameraChallenge(message){attendanceChallenge.reset(message);renderCameraChallenge();}
document.addEventListener('visibilitychange',()=>{if(document.hidden)resetCameraChallenge('Return to the camera and complete a new challenge.');});
