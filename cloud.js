'use strict';
const CLOUD_URL = 'https://zrkpyboeworyvpqmokmu.supabase.co';
const CLOUD_KEY = 'sb_publishable_EKDreBLKv-eFwcQFmFM9fw_EKgWr_VL';
const ATTENDANCE_OWNER_ID = '688d9d01-4e80-4d72-a5df-cebd8a234f05';
let cloudSession = null, cloudMember = null, cloudRefresh = null, cloudSync = null;
let cloudSyncGeneration;
let accountGeneration = 0, punching = false;
let geofenceDirty = false;
let sharedHours={fullDayHours:8,halfDayHours:4};
function setAccountGate(visible){
 const opening = !visible && !document.body.classList.contains('attendance-signed-in');
 document.getElementById('account-gate').style.display=visible?'flex':'none';
 document.body.classList.toggle('attendance-signed-in',!visible);
 if(opening)restoreWorkspacePage(cloudMember.user_id);
 const activePage=document.querySelector('.nav-item.active')?.dataset.page;
 document.title=visible?'Attendance workspace | FaceAttend':(pageTitles[activePage]||'Attendance workspace')+' | FaceAttend';
}
function isAttendanceAdmin(){return !!(cloudMember?.approved && cloudMember?.is_admin);}
function applyAdminAccess(){
 document.body.classList.toggle('attendance-admin',isAttendanceAdmin());
 if(!isAttendanceAdmin()){
  records=[];
  if([...adminPages].some(p=>document.getElementById('page-'+p).classList.contains('active')))navigate('attendance');
 }
}
function getSettings(){return sharedHours;}
async function saveSettings(){
 if(!isAttendanceAdmin()){toast('Only the administrator can change working hours.','error');return;}
 const fd=Number(document.getElementById('cfg-fullday').value),hd=Number(document.getElementById('cfg-halfday').value);
 if(!Number.isFinite(fd)||!Number.isFinite(hd)||hd<=0||fd>24||hd>=fd){toast('Enter valid hours: half day must be greater than zero and below full day (maximum 24).','error');return;}
 try{const rows=await cloudRequest('attendance_settings?id=eq.1',{method:'PATCH',body:JSON.stringify({full_day_hours:fd,half_day_hours:hd})});if(!rows?.length)throw new Error('Settings update was not authorized.');sharedHours={fullDayHours:fd,halfDayHours:hd};renderRecords();toast('Shared working hours saved.','success');}catch(e){toast(e.message,'error');}
}
try { cloudSession = JSON.parse(localStorage.getItem('fa_session') || 'null'); } catch {}
function accountMessage(message){document.getElementById('account-message').textContent=message;}
function storeSession(session){ cloudSession=session; if(session)localStorage.setItem('fa_session',JSON.stringify(session));else localStorage.removeItem('fa_session'); }
async function authRequest(path,body,{method='POST',token}={}){
 const headers={apikey:CLOUD_KEY,'Content-Type':'application/json'};
 if(token)headers.Authorization='Bearer '+token;
 const res=await fetch(CLOUD_URL+'/auth/v1/'+path,{method,headers,body:JSON.stringify(body)});
 const data=await res.json();
 if(!res.ok){
  const error=new Error(data.msg||data.error_description||data.message||'Account request failed');
  error.code=data.error_code||data.code;
  error.status=res.status;
  throw error;
 }
 if(data.access_token && Number.isFinite(data.expires_in))data.expires_at=Date.now()+data.expires_in*1000;
 return data;
}
async function sessionToken(){
 if(!cloudSession)throw new Error('Sign in first.');
 if(cloudSession.expires_at>Date.now()+60000)return cloudSession.access_token;
 const refreshToken=cloudSession.refresh_token;
 if(!refreshToken){
  await cloudSignOut('Your session expired. Sign in again.',null);
  throw new Error('Your session expired. Sign in again.');
 }
 if(!cloudRefresh){
  const generation=accountGeneration;
  const refresh=authRequest('token?grant_type=refresh_token',{refresh_token:refreshToken}).then(session=>{
   if(generation!==accountGeneration)throw new Error('Account changed.');
   storeSession(session);
   return session.access_token;
  }).catch(async error=>{
   if(generation===accountGeneration && (['refresh_token_not_found','refresh_token_already_used','session_not_found','session_expired'].includes(error.code) ||
      (error.status===400 && /invalid refresh token/i.test(error.message)))){
    await cloudSignOut('Your session expired. Sign in again.',null);
   }
   throw error;
  }).finally(()=>{if(cloudRefresh===refresh)cloudRefresh=null;});
  cloudRefresh=refresh;
 }
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
 try{storeSession(await authRequest('token?grant_type=password',{email:document.getElementById('account-email').value.trim(),password:document.getElementById('account-password').value}));cloudRefresh=null;accountGeneration++;document.getElementById('account-password').value='';await syncWithCloud(true);}catch(e){accountMessage(e.message);}
}
async function cloudSignUp(){
 const email=document.getElementById('account-email'), password=document.getElementById('account-password');
 if(!email.reportValidity()||!password.reportValidity())return;
 accountMessage('Creating account…');
 try{const session=await authRequest('signup',{email:email.value.trim(),password:password.value});
 if(session.access_token){storeSession(session);cloudRefresh=null;accountGeneration++;await syncWithCloud(true);}else accountMessage('Check your email and confirm your account. Then return to this website and sign in. If the confirmation link ends on an unavailable page, return here after confirming.');
 }catch(e){accountMessage(e.message);}
}
function revokeAuthSession(token,scope){
 if(!token)return;
 const query=scope ? '?scope='+scope : '';
 fetch(CLOUD_URL+'/auth/v1/logout'+query,{method:'POST',headers:{apikey:CLOUD_KEY,Authorization:'Bearer '+token}}).catch(()=>{});
}

async function cloudSignOut(message='Signed out.',token=cloudSession?.access_token){
 document.getElementById('password-form').reset();
 document.getElementById('password-status').textContent='';
 cloudRefresh=null;
 geofenceDirty = false;
 document.getElementById('geofence-form').reset();
 document.getElementById('geofence-fields').disabled = true;
 document.getElementById('geofence-status').textContent = 'Loading geofence settings…';
 storeWorkspacePage(null);
 accountGeneration++;
 if(ownershipDialog.open)ownershipDialog.close();
 storeSession(null);cloudMember=null;applyAdminAccess();
 stopCam('att');stopCam('reg');people=[];records=[];buildMatcher();renderDashboard();renderPeople();renderRecords();renderMarkedToday();renderRecentlyRegistered();
 document.getElementById('members-list').replaceChildren();
 setAccountGate(true);accountMessage(message);
 revokeAuthSession(token);
}
async function changeAccountPassword(event){
 event.preventDefault();
 if(!cloudSession?.user?.email || !cloudMember?.approved)return;
 const form=event.currentTarget;
 const fields=form.querySelector('fieldset');
 if(fields.disabled)return;
 const status=document.getElementById('password-status');
 const current=document.getElementById('current-password').value;
 const password=document.getElementById('new-password').value;
 const confirmation=document.getElementById('confirm-password').value;
 if(password.length<8){status.textContent='Use at least eight characters for the new password.';return;}
 if(password!==confirmation){status.textContent='The new passwords do not match.';return;}
 if(password===current){status.textContent='Choose a different password.';return;}
 const generation=accountGeneration;
 const {id,email}=cloudSession.user;
 let verified;
 fields.disabled=true;
 status.textContent='Changing password…';
 try{
  verified=await authRequest('token?grant_type=password',{email,password:current});
  if(generation!==accountGeneration)return;
  if(verified.user?.id!==id || !verified.access_token)throw new Error('Could not verify your account.');
  await authRequest('user',{password,current_password:current},{method:'PUT',token:verified.access_token});
  if(generation!==accountGeneration)return;
  await cloudSignOut('Password changed. Sign in with your new password.',verified.access_token);
  verified=null;
 }catch(error){
  if(generation===accountGeneration)status.textContent=error.code==='invalid_credentials' ? 'The current password is incorrect.' : error.message;
 }finally{
  if(verified?.access_token)revokeAuthSession(verified.access_token,'local');
  fields.disabled=false;
 }
}

function syncWithCloud(notify=false){
 if(cloudSync && cloudSyncGeneration===accountGeneration)return cloudSync;
 if(!cloudSession)return Promise.resolve();
 const generation=accountGeneration;
 cloudSyncGeneration=generation;
 const sync=(async()=>{
  try{
   const membership=await cloudRequest('attendance_members?user_id=eq.'+cloudSession.user.id+'&select=*');
   if(generation!==accountGeneration)return;
   cloudMember=membership[0];applyAdminAccess();
   if(!cloudMember?.approved){people=[];records=[];buildMatcher();stopCam('att');stopCam('reg');setAccountGate(true);accountMessage('Your account is waiting for administrator approval. This page checks automatically.');return;}
   const [sharedPeople,sharedRecords]=await Promise.all([cloudRequest('attendance_people?select=*&order=created_at.asc'),cloudMember.is_admin?cloudRequest('attendance_records?select=*&order=punched_in_at.desc'):Promise.resolve([])]);
   if(generation!==accountGeneration)return;
   people=sharedPeople.map(p=>({...p,empId:p.emp_id,createdAt:p.created_at}));
   records=sharedRecords.map(r=>{const p=people.find(p=>p.id===r.person_id);const hours=r.punched_out_at?(new Date(r.punched_out_at)-new Date(r.punched_in_at))/3600000:0;
    const time=v=>new Date(v).toLocaleTimeString('en-US',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',second:'2-digit'});
    return {id:r.id,personId:r.person_id,name:p?.name||'Removed person',role:p?.role||'',date:r.attendance_date,time:time(r.punched_in_at),punchOut:r.punched_out_at?time(r.punched_out_at):null,hours:Math.round(hours*100)/100,method:'Face Recognition',status:r.punched_out_at?getAttendanceStatus(hours).label:'In Progress'};
   });
   buildMatcher();updateSidebarStats();renderDashboard();renderPeople();renderRecords();renderMarkedToday();renderRecentlyRegistered();
   setAccountGate(false);
   if(cloudMember.is_admin){
    await renderMembers();
    const hours=await cloudRequest('attendance_settings?id=eq.1&select=*');
    if(generation!==accountGeneration)return;
    if(hours[0]){renderGeofence(hours[0]);sharedHours={fullDayHours:Number(hours[0].full_day_hours),halfDayHours:Number(hours[0].half_day_hours)};document.getElementById('cfg-fullday').value=sharedHours.fullDayHours;document.getElementById('cfg-halfday').value=sharedHours.halfDayHours;renderRecords();}
   }
   if(notify)toast('Shared data is up to date.','success');
  }catch(e){if(generation!==accountGeneration)return;if(notify){accountMessage(e.message);toast(e.message,'error');}}
 })().finally(()=>{if(cloudSync===sync)cloudSync=null;});
 cloudSync=sync;
 return sync;
}
const geofenceForm = document.getElementById('geofence-form');
geofenceForm.addEventListener('input',()=>{geofenceDirty=true;});

function renderGeofence(settings){
 if(geofenceDirty)return;
 document.getElementById('geofence-enabled').checked = settings.geofence_enabled === true;
 document.getElementById('geofence-latitude').value = settings.geofence_latitude ?? '';
 document.getElementById('geofence-longitude').value = settings.geofence_longitude ?? '';
 document.getElementById('geofence-radius').value = settings.geofence_radius_m ?? '';
 document.getElementById('geofence-fields').disabled = false;
 const status = settings.geofence_enabled ? 'Geofence enabled.' : 'Geofence disabled.';
 const message = document.getElementById('geofence-status');
 if(message.textContent!==status)message.textContent=status;
}

function getAttendanceLocation(){
 return new Promise((resolve,reject)=>{
  if(!navigator.geolocation){reject(new Error('Location is unavailable. Open FaceAttend over HTTPS on a device with location services.'));return;}
  navigator.geolocation.getCurrentPosition(({coords})=>resolve(coords),error=>{
   const message = error.code === 1 ? 'Allow location access in your browser and try again.'
    : 'Could not get your location. Check your device location settings and try again.';
   reject(new Error(message));
  },{enableHighAccuracy:true,maximumAge:0,timeout:12000});
 });
}

async function useCurrentGeofenceLocation(button){
 if(!isAttendanceAdmin())return;
 const generation=accountGeneration;
 const status=document.getElementById('geofence-status');
 button.disabled=true;
 status.textContent='Getting your location…';
 try{
  const {latitude,longitude,accuracy}=await getAttendanceLocation();
  if(generation!==accountGeneration)return;
  document.getElementById('geofence-latitude').value=latitude.toFixed(6);
  document.getElementById('geofence-longitude').value=longitude.toFixed(6);
  geofenceDirty=true;
  status.textContent='Center filled in. Location accuracy is about '+Math.ceil(accuracy)+' m. Set the radius and save.';
 }catch(error){
  if(generation===accountGeneration)status.textContent=error.message;
 }finally{button.disabled=false;}
}

async function saveGeofence(event){
 event.preventDefault();
 if(!isAttendanceAdmin())return;
 const fields=document.getElementById('geofence-fields');
 const status=document.getElementById('geofence-status');
 const enabled=document.getElementById('geofence-enabled').checked;
 const values=['latitude','longitude','radius'].map(key=>document.getElementById('geofence-'+key).value);
 if(enabled && values.some(value=>value==='')){
  status.textContent='Enter a center latitude, longitude, and radius before enabling the geofence.';
  return;
 }
 const [latitude,longitude,radius]=values.map(value=>value===''?null:Number(value));
 const generation=accountGeneration;
 geofenceDirty=true;
 fields.disabled=true;
 status.textContent='Saving geofence…';
 try{
  const rows=await cloudRequest('attendance_settings?id=eq.1',{method:'PATCH',body:JSON.stringify({
   geofence_enabled:enabled,geofence_latitude:latitude,geofence_longitude:longitude,geofence_radius_m:radius
  })});
  if(generation!==accountGeneration)return;
  if(!rows?.length)throw new Error('Geofence settings could not be saved.');
  geofenceDirty=false;
  renderGeofence(rows[0]);
 }catch(error){
  if(generation===accountGeneration)status.textContent=error.message;
 }finally{
  if(generation===accountGeneration)fields.disabled=false;
 }
}

function roleButton(label, action){
 const button = document.createElement('button');
 button.type = 'button';
 button.className = 'btn btn-ghost';
 button.textContent = label;
 button.onclick = action;
 return button;
}

async function renderMembers(){
 const generation = accountGeneration;
 const members = await cloudRequest('attendance_members?select=*&order=created_at.desc');
 if(generation !== accountGeneration)return;
 const container = document.getElementById('members-list');
 const primaryOwner = isAttendanceAdmin() && cloudMember.user_id === ATTENDANCE_OWNER_ID;
 const owner = isAttendanceAdmin() && (primaryOwner || cloudMember.is_owner);
 const rows = members.map(member=>{
  const row = document.createElement('div');
  row.className = 'member-row';

  const label = document.createElement('span');
  const status = member.user_id === ATTENDANCE_OWNER_ID ? 'Primary owner'
    : member.is_owner ? 'Owner' : member.is_admin ? 'Administrator' : member.approved ? 'Approved' : 'Pending';
  label.textContent = member.email + ' — ' + status;
  row.append(label);

  const actions = document.createElement('div');
  actions.className = 'member-actions';
  if(member.user_id !== ATTENDANCE_OWNER_ID){
   if(!member.is_admin){
    actions.append(roleButton(member.approved ? 'Revoke approval' : 'Approve',
     ()=>updateMemberAccess(member.user_id,{approved:!member.approved},actions)));
    if(primaryOwner)actions.append(roleButton('Make administrator',()=>{
     if(confirm('Grant administrator access to '+member.email+'?'))
      return updateMemberAccess(member.user_id,{approved:true,is_admin:true},actions);
    }));
   }else if(owner && !member.is_owner){
    actions.append(roleButton('Revoke administrator',()=>{
     if(confirm('Remove administrator access for '+member.email+'?'))
      return updateMemberAccess(member.user_id,{is_admin:false},actions);
    }));
   }
   if(primaryOwner){
    actions.append(member.is_owner
     ? roleButton('Revoke ownership',()=>openOwnershipDialog(member,false))
     : roleButton('Make owner',()=>openOwnershipDialog(member,true)));
   }
  }
  if(actions.childElementCount)row.append(actions);
  return row;
 });
 container.replaceChildren(...rows);
}

const ownershipDialog = document.getElementById('ownership-dialog');
const ownershipForm = document.getElementById('ownership-form');
let ownershipChange;

function openOwnershipDialog(member,makeOwner){
 ownershipChange = {targetId:member.user_id,makeOwner};
 ownershipForm.reset();
 document.getElementById('ownership-title').textContent = makeOwner ? 'Make owner' : 'Revoke ownership';
 document.getElementById('ownership-submit').textContent = makeOwner ? 'Grant ownership' : 'Revoke ownership';
 document.getElementById('ownership-member').textContent = makeOwner ? member.email : member.email + ' will keep administrator access.';
 document.getElementById('ownership-message').textContent = '';
 ownershipDialog.showModal();
}

ownershipDialog.addEventListener('close',()=>{
 ownershipChange = undefined;
 ownershipForm.reset();
});

async function requestOwnership(targetId, makeOwner, pin){
 const result = await cloudRequest('rpc/attendance_change_ownership',{
  method:'POST',body:JSON.stringify({target_id:targetId,make_owner:makeOwner,pin})
 });
 if(result==='ok')return;
 const messages = {
  invalid_pin:'The PIN is incorrect.',
  locked:'Too many attempts. Try again in 15 minutes.',
  not_found:'This account has already changed. Refresh the account list.'
 };
 throw new Error(messages[result] ?? 'Ownership could not be updated.');
}

ownershipForm.addEventListener('submit',async event=>{
 event.preventDefault();
 const change = ownershipChange;
 if(!change || ownershipForm.querySelector('fieldset').disabled)return;
 const generation = accountGeneration;
 const message = document.getElementById('ownership-message');
 const fieldset = ownershipForm.querySelector('fieldset');
 const input = document.getElementById('ownership-pin');
 const pin = input.value;
 input.value = '';
 fieldset.disabled = true;
 try{
  await requestOwnership(change.targetId,change.makeOwner,pin);
  if(generation!==accountGeneration)return;
  ownershipDialog.close();
  await renderMembers();
  toast(change.makeOwner ? 'Ownership granted.' : 'Ownership revoked.','success');
 }catch(error){
  if(generation===accountGeneration)message.textContent=error.message;
 }finally{fieldset.disabled=false;}
});

async function updateMemberAccess(userId, changes, actions){
 const generation = accountGeneration;
 const buttons = actions.querySelectorAll('button');
 buttons.forEach(button=>button.disabled=true);
 try{
  const updated = await cloudRequest('attendance_members?user_id=eq.'+encodeURIComponent(userId), {
   method:'PATCH',body:JSON.stringify(changes)
  });
  if(generation !== accountGeneration)return;
  if(!updated?.length)throw new Error('The account could not be updated.');
  await renderMembers();
  if(generation === accountGeneration && changes.is_admin)toast('Administrator access granted.','success');
 }catch(error){
  if(generation === accountGeneration)toast(error.message,'error');
 }finally{
  buttons.forEach(button=>button.disabled=false);
 }
}
async function punchCloud(direction,person){
 if(punching || !cloudMember?.approved || direction!==attendanceDirection)return;
 if(!attRunning||recognizedPersonId!==person?.id||document.hidden||!attendanceChallenge.consume(person.id)){
  toast('Complete the camera challenge for this person first.','error');renderCameraChallenge();return;
 }
 renderCameraChallenge();
 punching=true;
 const generation=accountGeneration;
 const cameraGeneration=attCameraGeneration;
 const status=document.getElementById('rec-status');
 let message;
 try{
  const locationRequired=await cloudRequest('rpc/attendance_geofence_required');
  if(generation!==accountGeneration || cameraGeneration!==attCameraGeneration)return;
  const payload={p_direction:direction,p_person_id:person.id,p_latitude:null,p_longitude:null,p_accuracy_m:null};
  if(locationRequired){
   status.textContent='Checking your location…';
   const {latitude,longitude,accuracy}=await getAttendanceLocation();
   Object.assign(payload,{p_latitude:latitude,p_longitude:longitude,p_accuracy_m:accuracy});
  }
  if(generation!==accountGeneration || cameraGeneration!==attCameraGeneration ||
     !attRunning || recognizedPersonId!==person.id || document.hidden)return;
  await cloudRequest('rpc/attendance_punch',{method:'POST',body:JSON.stringify(payload)});
  if(generation!==accountGeneration)return;
  message=(direction==='in'?'Punch-in':'Punch-out')+' saved for '+person.name+'.';
  toast(message,'success');
  void syncWithCloud();
 }catch(error){
  if(generation===accountGeneration && cameraGeneration===attCameraGeneration){
   message=error.message;
   toast(message,'error');
  }
 }finally{
  punching=false;
  if(cameraGeneration===attCameraGeneration){
   stopCam('att');
   if(message)status.textContent=message;
  }else renderAttendanceControls();
 }
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
applyAdminAccess();
syncWithCloud(true);
