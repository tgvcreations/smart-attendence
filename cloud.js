'use strict';
const CLOUD_URL = 'https://zrkpyboeworyvpqmokmu.supabase.co';
const CLOUD_KEY = 'sb_publishable_EKDreBLKv-eFwcQFmFM9fw_EKgWr_VL';
let cloudSession = null, cloudMember = null, cloudRefresh = null, cloudSync = null;
let accountGeneration = 0, punching = false;
try { cloudSession = JSON.parse(localStorage.getItem('fa_session') || 'null'); } catch {}
function accountMessage(message){document.getElementById('account-message').textContent=message;}
function storeSession(session){ cloudSession=session; if(session)localStorage.setItem('fa_session',JSON.stringify(session));else localStorage.removeItem('fa_session'); }
async function authRequest(path,body){
 const res=await fetch(CLOUD_URL+'/auth/v1/'+path,{method:'POST',headers:{apikey:CLOUD_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await res.json(); if(!res.ok)throw new Error(data.msg||data.error_description||data.message||'Account request failed');
 if(data.access_token)data.expires_at=Date.now()+data.expires_in*1000;
 return data;
}
async function sessionToken(){
 if(!cloudSession)throw new Error('Sign in first.');
 if(cloudSession.expires_at>Date.now()+60000)return cloudSession.access_token;
 if(!cloudRefresh){const generation=accountGeneration;cloudRefresh=authRequest('token?grant_type=refresh_token',{refresh_token:cloudSession.refresh_token}).then(s=>{if(generation!==accountGeneration)throw new Error('Account changed');storeSession(s);return s.access_token;}).finally(()=>{cloudRefresh=null;});}
 return cloudRefresh;
}
async function cloudRequest(path,options={}){
 const token=await sessionToken();
 const res=await fetch(CLOUD_URL+'/rest/v1/'+path,{...options,headers:{apikey:CLOUD_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'return=representation',...options.headers}});
 const body=await res.text();let data;try{data=body?JSON.parse(body):null;}catch{throw new Error('Unexpected database response');}
 if(!res.ok)throw new Error(data?.message||'Database request failed ('+res.status+')');return data;
}
async function cloudSignIn(event){
 event?.preventDefault();accountMessage('Signing in…');
 try{storeSession(await authRequest('token?grant_type=password',{email:document.getElementById('account-email').value.trim(),password:document.getElementById('account-password').value}));accountGeneration++;document.getElementById('account-password').value='';await syncWithCloud(true);}catch(e){accountMessage(e.message);}
}
async function cloudSignUp(){
 const email=document.getElementById('account-email'), password=document.getElementById('account-password');
 if(!email.reportValidity()||!password.reportValidity())return;
 accountMessage('Creating account…');
 try{const session=await authRequest('signup',{email:email.value.trim(),password:password.value});
 if(session.access_token){storeSession(session);accountGeneration++;await syncWithCloud(true);}else accountMessage('Check your email and confirm your account. Then return to this website and sign in. If the confirmation link ends on an unavailable page, return here after confirming.');
 }catch(e){accountMessage(e.message);}
}
async function cloudSignOut(){
 const token=cloudSession?.access_token; accountGeneration++;storeSession(null);cloudMember=null;
 stopCam('att');stopCam('reg');people=[];records=[];buildMatcher();renderDashboard();renderPeople();renderRecords();renderMarkedToday();renderRecentlyRegistered();
 document.getElementById('members-list').replaceChildren();document.getElementById('admin-members').style.display='none';
 document.getElementById('account-gate').style.display='flex';accountMessage('Signed out.');
 if(token)fetch(CLOUD_URL+'/auth/v1/logout',{method:'POST',headers:{apikey:CLOUD_KEY,Authorization:'Bearer '+token}}).catch(()=>{});
}
function syncWithCloud(notify=false){
 if(cloudSync)return cloudSync;
 if(!cloudSession)return Promise.resolve();
 const generation=accountGeneration;
 cloudSync=(async()=>{
  try{
   const membership=await cloudRequest('attendance_members?user_id=eq.'+cloudSession.user.id+'&select=*');
   if(generation!==accountGeneration)return;
   cloudMember=membership[0];
   if(!cloudMember?.approved){people=[];records=[];buildMatcher();stopCam('att');stopCam('reg');document.getElementById('account-gate').style.display='flex';accountMessage('Your account is waiting for administrator approval. This page checks automatically.');return;}
   const [sharedPeople,sharedRecords]=await Promise.all([cloudRequest('attendance_people?select=*&order=created_at.asc'),cloudRequest('attendance_records?select=*&order=punched_in_at.desc')]);
   if(generation!==accountGeneration)return;
   people=sharedPeople.map(p=>({...p,empId:p.emp_id,createdAt:p.created_at}));
   records=sharedRecords.map(r=>{const p=people.find(p=>p.id===r.person_id);const hours=r.punched_out_at?(new Date(r.punched_out_at)-new Date(r.punched_in_at))/3600000:0;
    const time=v=>new Date(v).toLocaleTimeString('en-US',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',second:'2-digit'});
    return {id:r.id,personId:r.person_id,name:p?.name||'Removed person',role:p?.role||'',date:r.attendance_date,time:time(r.punched_in_at),punchOut:r.punched_out_at?time(r.punched_out_at):null,hours:Math.round(hours*100)/100,method:'Face Recognition',status:r.punched_out_at?getAttendanceStatus(hours).label:'In Progress'};
   });
   buildMatcher();updateSidebarStats();renderDashboard();renderPeople();renderRecords();renderMarkedToday();renderRecentlyRegistered();
   document.getElementById('account-gate').style.display='none';document.getElementById('cloud-status').textContent='Connected • '+cloudMember.email+' • Times shown in India Standard Time';
   document.getElementById('admin-members').style.display=cloudMember.is_admin?'block':'none';
   if(cloudMember.is_admin)await renderMembers();
   if(notify)toast('Shared data is up to date.','success');
  }catch(e){document.getElementById('cloud-status').textContent='Sync failed: '+e.message;if(notify){accountMessage(e.message);toast(e.message,'error');}}
 })().finally(()=>cloudSync=null);
 return cloudSync;
}
async function renderMembers(){
 const generation=accountGeneration;const members=await cloudRequest('attendance_members?select=*&order=created_at.desc');if(generation!==accountGeneration)return;
 const container=document.getElementById('members-list');container.replaceChildren();
 for(const member of members){const row=document.createElement('div');row.style.padding='10px 0';const label=document.createElement('span');label.textContent=member.email+' — '+(member.is_admin?'Administrator':member.approved?'Approved':'Pending');row.append(label);
 if(!member.is_admin){const button=document.createElement('button');button.className='btn btn-ghost';button.textContent=member.approved?'Revoke':'Approve';button.onclick=async()=>{button.disabled=true;try{await cloudRequest('attendance_members?user_id=eq.'+member.user_id,{method:'PATCH',body:JSON.stringify({approved:!member.approved})});await renderMembers();}catch(e){toast(e.message,'error');button.disabled=false;}};row.append(button);}container.append(row);}
}
// Any approved account can operate a shared attendance station.
async function markAttendance(personId,person){
 if(!person||!cloudMember?.approved||records.some(r=>r.personId===personId&&r.date===todayStr()))return;
 await punchCloud('in',person);
}
async function manualPunch(direction){
 const person=people.find(p=>p.id===recognizedPersonId);
 if(!attRunning||!person||!cloudMember?.approved){toast('Show a registered face while signed in to an approved account.','error');return;}
 await punchCloud(direction,person);
}
async function punchCloud(direction,person){
 if(punching||!cloudMember?.approved)return;punching=true;
 try{await cloudRequest('rpc/attendance_punch',{method:'POST',body:JSON.stringify({p_direction:direction,p_person_id:person.id})});await syncWithCloud();toast((direction==='in'?'Punch-in':'Punch-out')+' saved for '+person.name,'success');}catch(e){toast(e.message,'error');}finally{punching=false;}
}
async function captureAndRegister(){
 const name=document.getElementById('reg-name').value.trim();const status=document.getElementById('capture-status');const button=document.getElementById('btn-capture');
 if(!name||!regRunning||!cloudMember?.approved){toast('Sign in, enter your name and start the camera.','error');return;}
 if(people.some(p=>p.user_id===cloudSession.user.id)){toast('Your face is already registered. It is available on your other devices.','info');return;}
 const generation=accountGeneration;button.disabled=true;status.textContent='Detecting your face…';
 try{
  const faces=await faceapi.detectAllFaces(document.getElementById('reg-video'),new faceapi.SsdMobilenetv1Options({minConfidence:0.5})).withFaceLandmarks().withFaceDescriptors();
  if(generation!==accountGeneration||!regRunning)return;
  if(faces.length!==1)throw new Error('Keep exactly one face in the camera.');
  if(faceMatcher?.findBestMatch(faces[0].descriptor).label!=='unknown'&&faceMatcher)throw new Error('This face is already registered. Sign in to its original account.');
  await cloudRequest('attendance_people',{method:'POST',body:JSON.stringify({user_id:cloudSession.user.id,name,role:document.getElementById('reg-role').value.trim(),emp_id:document.getElementById('reg-id').value.trim(),descriptor:Array.from(faces[0].descriptor)})});
  await syncWithCloud();status.textContent='Registration saved to the shared database.';toast('Registered successfully. You can now sign in on another device.','success');
 }catch(e){status.textContent=e.message;toast(e.message,'error');}finally{button.disabled=!regRunning;}
}
async function deletePerson(id){
 if(!cloudMember?.is_admin){toast('Only the administrator can remove registrations.','error');return;}
 if(!confirm('Remove this shared registration and its attendance records from every device?'))return;
 try{await cloudRequest('attendance_people?id=eq.'+encodeURIComponent(id),{method:'DELETE'});await syncWithCloud();toast('Registration removed.','success');}catch(e){toast(e.message,'error');}
}
function todayStr(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
setInterval(()=>{if(cloudSession)syncWithCloud();},10000);
window.addEventListener('online',()=>syncWithCloud());
syncWithCloud(true);
