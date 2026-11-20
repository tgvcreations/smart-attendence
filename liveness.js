'use strict';
// Browser-side hand movement challenge; not proof that the recognized face is live.
class FaceChallenge {
 constructor(){this.reset();}
 reset(message='Face the camera with your hands lowered to begin.'){
  this.personId=null;this.startedAt=0;this.lastSeen=0;this.validUntil=0;this.phase='lowered';this.heldSince=null;this.hits=0;this.message=message;
 }
 hold(ok,now){if(!ok){this.heldSince=null;this.hits=0;return false;}if(this.heldSince===null)this.heldSince=now;this.hits++;return this.hits>=2&&now-this.heldSince>=450;}
 observe(personId,observation,now=performance.now()){
  if(!personId||!observation?.valid){this.reset('Hand detection unavailable. Keep your face and hand in good light.');return false;}
  if(this.personId!==personId||now-this.lastSeen>3000||now-this.startedAt>30000||(this.phase==='passed'&&now>this.validUntil)){
   this.reset();this.personId=personId;this.startedAt=now;
  }
  this.lastSeen=now;if(this.phase==='passed')return true;
  if(this.phase==='lowered'){
   this.message='Keep your hands lowered, then wait for the raise-hand instruction.';
   if(this.hold(!observation.raised,now)){this.phase='raise';this.heldSince=null;this.hits=0;this.message='Raise either hand beside your face, with your palm toward the camera. Hold it there.';}
  }else{
   this.message='Raise either hand beside your face, with your palm toward the camera. Hold it there.';
   if(this.hold(observation.raised,now)){this.phase='passed';this.validUntil=now+5000;this.message='Raise-hand challenge passed. Attendance controls are ready.';return true;}
  }
  return false;
 }
 ready(personId,now=performance.now()){return this.phase==='passed'&&this.personId===personId&&now<=this.validUntil&&now-this.lastSeen<=1500;}
 consume(personId,now=performance.now()){if(!this.ready(personId,now))return false;this.reset('Attendance submitted. Lower your hand before another challenge.');return true;}
}
const HAND_MODEL_BASE='https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/';
const cameraScripts = new Map();
function loadCameraScript(url){
 if(!cameraScripts.has(url)){
  cameraScripts.set(url,new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src=url;
   script.crossOrigin='anonymous';
   script.onload=resolve;
   script.onerror=()=>{
    script.remove();
    cameraScripts.delete(url);
    reject(new Error('Could not load a camera library. Check your connection and try again.'));
   };
   document.head.append(script);
  }));
 }
 return cameraScripts.get(url);
}
let handTracker=null,handTrackerFailure=null,handResults=null;
function raisedHandObservation(results,face,width,height){
 if(!results||!Array.isArray(results.multiHandLandmarks)||!face||width<=0||height<=0)return {valid:false,raised:false};
 const raised=results.multiHandLandmarks.some(hand=>{
  if(hand.length!==21||hand.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return false;
  const wrist=hand[0],palm=hand[9];
  // Require the palm near face height and within reach of the recognized face.
  const palmY=palm.y*height,palmX=palm.x*width;
  const besideFace=Math.abs(palmX-(face.x+face.width/2))<face.width*2.5;
  const atFaceHeight=palmY<face.y+face.height*.85&&palmY>face.y-face.height;
  const fingersUp=[8,12,16,20].filter(i=>hand[i].y<wrist.y-.04).length>=3;
  return besideFace&&atFaceHeight&&fingersUp&&Math.hypot(palm.x-wrist.x,palm.y-wrist.y)>.025;
 });
 return {valid:true,raised};
}
async function detectRaisedHand(video,face){
 if(handTrackerFailure)throw new Error(handTrackerFailure);
 try{
  if(!handTracker){
   await loadCameraScript(HAND_MODEL_BASE+'hands.js');
   if(typeof Hands!=='function')throw new Error('Hand model did not load. Check your internet connection and reload.');
   handTracker=new Hands({locateFile:file=>HAND_MODEL_BASE+file});
   handTracker.setOptions({maxNumHands:2,modelComplexity:0,minDetectionConfidence:.7,minTrackingConfidence:.7});
   handTracker.onResults(results=>{handResults=results;});
  }
  handResults=null;await handTracker.send({image:video});
  return raisedHandObservation(handResults,face,video.videoWidth,video.videoHeight);
 }catch(e){handTrackerFailure='Hand detection failed. Check your connection and reload the page.';throw e;}
}
const attendanceChallenge=new FaceChallenge();
function renderCameraChallenge(){
 const el=document.getElementById('liveness-status');if(el)el.textContent=attendanceChallenge.message;
 const ready=typeof attRunning!=='undefined'&&attRunning&&attendanceChallenge.ready(recognizedPersonId);
 for(const id of ['btn-punch-in','btn-punch-out']){const button=document.getElementById(id);if(button)button.disabled=!ready;}
}
function resetCameraChallenge(message){attendanceChallenge.reset(message);renderCameraChallenge();}
document.addEventListener('visibilitychange',()=>{if(document.hidden)resetCameraChallenge('Return to the camera and complete a new challenge.');});
