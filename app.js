  // ---------- nav ----------
  const navItems = document.querySelectorAll('.nav-item[data-view]');
  const views = document.querySelectorAll('.view');
  const titles = {
    dashboard:['Dashboard','Your CrydenSync deployment, at a glance'],
    users:['Users','Search, inspect, and manage accounts'],
    oauth:['OAuth Providers','Configured identity providers and their health'],
    mfa:['MFA & Passkeys','Two-factor adoption across your users'],
    email:['Email & Magic Link','Delivery health and templates for verification and passwordless login'],
    'password-policy':['Password Policy','Complexity rules, breached-password protection, and hasher migration'],
    sessions:['Sessions','Active sessions across every device and location'],
    anomalies:['Anomalies','Unusual logins and credential-stuffing signals'],
    audit:['Audit Log','Every security-relevant event, searchable'],
    ai:['AI Assistant','Ask questions about your deployment — read-only, always'],
    apikeys:['API Keys','Long-lived credentials for server-to-server access'],
    webhooks:['Webhooks','Notify your own backend when things happen here'],
    jwtclaims:['JWT Claims','Custom fields attached to every access token'],
    logging:['Cloud Logging','Ship structured logs to your observability provider'],
    aiwidget:['Ask-AI Widget','A read-only assistant your end users can embed in your app'],
    digest:['Weekly Digest','A plain-English summary of the week, delivered automatically'],
    supportassist:['Support Assistant','Read-only answers for support tickets — it can explain, never act'],
    configadvisor:['Config Advisor','Suggests configuration changes — it never applies them for you'],
    llmprovider:['LLM Provider','The model backend shared by every AI feature in this console'],
    dbprovider:['Database Provider','Your primary data store and the read-only role AI features use'],
    settings:['Settings & Secrets','Console operators and deployment credentials'],
  };
  navItems.forEach(btn=>{
    btn.addEventListener('click',()=>{
      navItems.forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const key=btn.dataset.view;
      views.forEach(v=>v.classList.remove('active'));
      document.getElementById('view-'+key).classList.add('active');
      document.getElementById('pageTitle').textContent=titles[key][0];
      document.getElementById('pageSub').textContent=titles[key][1];
      if(window.innerWidth<=880) document.getElementById('sidebar').classList.remove('open');
    });
  });
  document.getElementById('menuToggle').addEventListener('click',()=>{
    document.getElementById('sidebar').classList.toggle('open');
  });

  // ---------- toasts ----------
  function toast(msg){
    const stack=document.getElementById('toastStack');
    const el=document.createElement('div');
    el.className='toast';
    el.innerHTML='<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>'+msg+'</span>';
    stack.appendChild(el);
    setTimeout(()=>{el.style.transition='opacity .3s ease';el.style.opacity='0';setTimeout(()=>el.remove(),300);},2600);
  }
  function copySecret(btn){
    const row=btn.closest('.secret-row');
    const val=row.querySelector('.secret-val');
    if(val.classList.contains('masked')){toast('Unlock secrets first');return;}
    navigator.clipboard && navigator.clipboard.writeText(val.dataset.real).catch(()=>{});
    toast('Copied to clipboard');
  }

  // ---------- sessions ----------
  function revokeSession(btn){
    const row=btn.closest('tr');
    row.style.transition='opacity .3s ease';
    row.style.opacity='0.35';
    btn.textContent='Revoked';
    btn.disabled=true;
    toast('Session revoked — prototype only');
    const badge=document.getElementById('sessionsBadge');
    const tbody=document.getElementById('sessionsTbody');
    const remaining=[...tbody.querySelectorAll('tr')].filter(r=>r.style.opacity!=='0.35').length;
    if(badge) badge.textContent=remaining;
  }

  // ---------- email templates ----------
  const templateContent = {
    verify: {
      subject: 'Confirm your email for {{app_name}}',
      body: '<p>Hi there,</p>\n<p>Click below to confirm your email for <strong>{{app_name}}</strong>. This link expires in {{expires_in}}.</p>\n<a href="{{action_url}}" class="button">Confirm email</a>\n<p>If you didn\'t request this, you can ignore this email.</p>',
      preview: '<p style="margin:0 0 10px;">Hi there,</p><p style="margin:0 0 10px;">Click below to confirm your email for <strong>typebook</strong>. This link expires in 15 minutes.</p><a class="btn-fake" href="#">Confirm email</a><p style="margin:14px 0 0;color:#666;font-size:12px;">If you didn\'t request this, you can ignore this email.</p>'
    },
    magic: {
      subject: 'Your login link for {{app_name}}',
      body: '<p>Hi {{user_email}},</p>\n<p>Click below to log in to <strong>{{app_name}}</strong>. This link works once and expires in {{expires_in}}.</p>\n<a href="{{action_url}}" class="button">Log in</a>\n<p>Didn\'t request this? You can safely ignore it.</p>',
      preview: '<p style="margin:0 0 10px;">Hi priya@example.com,</p><p style="margin:0 0 10px;">Click below to log in to <strong>typebook</strong>. This link works once and expires in 15 minutes.</p><a class="btn-fake" href="#">Log in</a><p style="margin:14px 0 0;color:#666;font-size:12px;">Didn\'t request this? You can safely ignore it.</p>'
    },
    reset: {
      subject: 'Reset your password for {{app_name}}',
      body: '<p>Hi {{user_email}},</p>\n<p>Click below to choose a new password for <strong>{{app_name}}</strong>. This link expires in {{expires_in}}.</p>\n<a href="{{action_url}}" class="button">Reset password</a>\n<p>If you didn\'t request this, your password is still safe — you can ignore this email.</p>',
      preview: '<p style="margin:0 0 10px;">Hi daniel@example.com,</p><p style="margin:0 0 10px;">Click below to choose a new password for <strong>typebook</strong>. This link expires in 15 minutes.</p><a class="btn-fake" href="#">Reset password</a><p style="margin:14px 0 0;color:#666;font-size:12px;">If you didn\'t request this, your password is still safe — you can ignore this email.</p>'
    },
    change: {
      subject: 'Confirm your new email for {{app_name}}',
      body: '<p>Hi there,</p>\n<p>Confirm this new email address for your <strong>{{app_name}}</strong> account. This link expires in {{expires_in}}.</p>\n<a href="{{action_url}}" class="button">Confirm new email</a>\n<p>If you didn\'t request this change, contact support immediately.</p>',
      preview: '<p style="margin:0 0 10px;">Hi there,</p><p style="margin:0 0 10px;">Confirm this new email address for your <strong>typebook</strong> account. This link expires in 15 minutes.</p><a class="btn-fake" href="#">Confirm new email</a><p style="margin:14px 0 0;color:#666;font-size:12px;">If you didn\'t request this change, contact support immediately.</p>'
    }
  };
  document.querySelectorAll('.template-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      document.querySelectorAll('.template-tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      const t = templateContent[tab.dataset.tpl];
      document.getElementById('tplSubject').value = t.subject;
      document.getElementById('tplBody').value = t.body;
      document.getElementById('tplPreview').innerHTML = t.preview;
    });
  });
  function insertVar(v){
    const ta = document.getElementById('tplBody');
    const start = ta.selectionStart, end = ta.selectionEnd;
    ta.value = ta.value.slice(0,start) + v + ta.value.slice(end);
    ta.focus();
  }

  // ---------- JWT claims ----------
  function addClaimRow(){
    const body = document.getElementById('claimsBody').parentElement;
    const row = document.createElement('div');
    row.className = 'kv-row';
    row.innerHTML =
      '<input placeholder="claim_key" class="mono">'+
      '<input placeholder="user.metadata.field" class="mono">'+
      '<button class="icon-btn" onclick="this.closest(\'.kv-row\').remove()"><svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>';
    body.appendChild(row);
  }

  // ---------- AI chat (prototype canned responses) ----------
  const aiCanned=[
    {
      match:/(session|revoke)/i,
      html:'Sessions get revoked either by an operator from the Sessions tab, or automatically on a password change. In the last 24 hours there was one manual revoke, by raymond@crydensync.dev.<span class="cite">audit_events · 1 row</span>'
    },
    {
      match:/(mfa|passkey|2fa|totp)/i,
      html:'MFA adoption is at 41% of eligible users — 1,017 on TOTP and 203 on passkeys. Passkey registrations have grown the fastest this month, up from 140 four weeks ago.<span class="cite">mfa_enrollments · aggregate</span>'
    },
    {
      match:/(oauth|provider|google|github|microsoft|discord|apple)/i,
      html:'Five OAuth providers are configured. Microsoft is currently degraded — its token endpoint has timed out twice in the last hour. Google, GitHub, Discord, and Apple are all reachable.<span class="cite">oauth_endpoint_checks · 5 rows</span>'
    },
    {
      match:/(lock|lockout)/i,
      html:'Three lockouts this week, all self-resolved within the hour. The current threshold is 3 failed attempts, which is catching some real users along with attackers — worth considering a higher threshold.<span class="cite">audit_events · 7d scan</span>'
    },
    {
      match:/(anomaly|anomalies|suspicious|flag)/i,
      html:'Two anomalies this week: a new-country login for priya@example.com (reviewed, confirmed real) and one for efe@example.com from Warsaw, PL that\u2019s still awaiting review.<span class="cite">anomaly_signals · 2 rows</span>'
    }
  ];
  function sendAi(){
    const input=document.getElementById('aiInput');
    const q=input.value.trim();
    if(!q) return;
    const body=document.getElementById('aiBody');
    const userMsg=document.createElement('div');
    userMsg.className='ai-msg user';
    userMsg.textContent=q;
    body.appendChild(userMsg);
    input.value='';
    body.scrollTop=body.scrollHeight;
    setTimeout(()=>{
      const reply=document.createElement('div');
      reply.className='ai-msg assistant';
      const hit=aiCanned.find(c=>c.match.test(q));
      reply.innerHTML=hit ? hit.html : 'This is a prototype — in the real console this would run an allowlisted, read-only query against your audit log via the same safety boundary <code>csax ai ask</code> already uses, and answer grounded in the actual result.<span class="cite">prototype response</span>';
      body.appendChild(reply);
      body.scrollTop=body.scrollHeight;
    },500);
  }

  // ---------- Support Assistant chat (prototype canned responses) ----------
  const supportCanned=[
    {
      match:/(daniel|log ?in|can'?t log in|login)/i,
      html:'That account auto-locked after 3 failed password attempts, all from the same IP. The lockout window has since expired, so they should be able to try again \u2014 if they\u2019re still stuck, it\u2019s most likely just a wrong password, not a system issue.<span class="cite">audit_events · 3 rows</span>'
    },
    {
      match:/(suspend|suspended|banned)/i,
      html:'One account matching that description was suspended by an operator for a policy violation, which also revokes every active session immediately. Lifting a suspension needs a human decision \u2014 I\u2019d escalate this one rather than tell the user to just log back in.<span class="cite">audit_events · 1 row</span>'
    },
    {
      match:/(mfa|passkey|2fa|totp|second factor)/i,
      html:'This user has TOTP enrolled but no passkey. If they\u2019ve lost their authenticator, the safe path is an operator-initiated MFA reset from the Users tab \u2014 I can\u2019t trigger that myself, only flag that it\u2019s needed.<span class="cite">mfa_enrollments · 1 row</span>'
    },
    {
      match:/(session|signed out|logged out)/i,
      html:'Their sessions were revoked automatically after a password change earlier today \u2014 that\u2019s expected behavior, not a bug. They\u2019ll get a fresh session on their next successful login.<span class="cite">audit_events · 1 row</span>'
    }
  ];
  function sendSupportAi(){
    const input=document.getElementById('supportAiInput');
    const q=input.value.trim();
    if(!q) return;
    const body=document.getElementById('supportAiBody');
    const userMsg=document.createElement('div');
    userMsg.className='ai-msg user';
    userMsg.textContent=q;
    body.appendChild(userMsg);
    input.value='';
    body.scrollTop=body.scrollHeight;
    setTimeout(()=>{
      const reply=document.createElement('div');
      reply.className='ai-msg assistant';
      const hit=supportCanned.find(c=>c.match.test(q));
      reply.innerHTML=hit ? hit.html : 'This is a prototype \u2014 in the real console this would run the same read-only, allowlisted lookup as the internal AI Assistant, scoped to the single user in the ticket, and answer grounded in what it actually finds. Anything it can\u2019t resolve gets escalated rather than guessed at.<span class="cite">prototype response</span>';
      body.appendChild(reply);
      body.scrollTop=body.scrollHeight;
    },500);
  }

  // ---------- Config Advisor (suggest, never auto-apply) ----------
  function applySuggestion(btn){
    const card=btn.closest('.card');
    card.style.transition='opacity .3s ease';
    card.style.opacity='0.45';
    const actions=btn.parentElement;
    actions.innerHTML='<span class="pill green">applied</span>';
    toast('Config updated \u2014 prototype only, nothing persisted');
  }
  function dismissSuggestion(btn){
    const card=btn.closest('.card');
    card.style.transition='opacity .3s ease, transform .3s ease';
    card.style.opacity='0';
    card.style.transform='translateX(8px)';
    setTimeout(()=>card.remove(),300);
    toast('Suggestion dismissed');
  }

  // ---------- biometric flow (shared by reveal / edit / delete / add) ----------
  // Every mutating secret action routes through here too, gated exactly like
  // viewing — arguably it matters more for edit/delete than for reveal,
  // since those are destructive rather than just informational.
  let unlockTimer=null;
  function secretsAreLocked(){
    const first=document.querySelector('.secret-val');
    return first ? first.classList.contains('masked') : false;
  }
  async function requestBiometric(onVerified, actionLabel){
    actionLabel = actionLabel || 'reveal deployment secrets';
    document.getElementById('modalOverlay').classList.add('show');
    document.getElementById('scanRingWrap').classList.add('pulsing');
    document.getElementById('fpIcon').classList.remove('success');
    document.getElementById('modalTitle').textContent="Verify it's you";
    document.getElementById('modalText').textContent="Use your device passkey, fingerprint, or Face ID to "+actionLabel+".";

    // Attempt a REAL WebAuthn prompt if the platform supports it. There is no
    // registered credential behind this prototype, so this will almost
    // always be rejected by the browser/OS — that's expected and fine, we
    // still show the real OS-level prompt when available, then continue
    // into the styled confirmation animation either way, since this is a
    // visual prototype, not a real auth check.
    try{
      if(window.PublicKeyCredential){
        const challenge=new Uint8Array(32);
        crypto.getRandomValues(challenge);
        await navigator.credentials.get({
          publicKey:{ challenge, timeout:4000, userVerification:'required' },
          mediation:'optional'
        });
      }
    }catch(e){ /* expected in a prototype with no real registered credential */ }

    setTimeout(()=>{
      document.getElementById('scanRingWrap').classList.remove('pulsing');
      document.getElementById('fpIcon').classList.add('success');
      document.getElementById('modalTitle').textContent="Verified";
      document.getElementById('modalText').textContent="Continuing…";
      setTimeout(closeBiometric,600);
      if(typeof onVerified==='function') onVerified();
    },1500);
  }
  function closeBiometric(){
    document.getElementById('modalOverlay').classList.remove('show');
  }
  function revealSecrets(){
    document.querySelectorAll('.secret-val').forEach(el=>{
      el.classList.remove('masked');
      el.textContent=el.dataset.real;
    });
    document.getElementById('lockStatus').style.display='flex';
    startRemaskCountdown();
  }
  function startRemaskCountdown(){
    let remaining=20;
    document.getElementById('lockText').textContent='Re-masking in '+remaining+'s';
    clearInterval(unlockTimer);
    unlockTimer=setInterval(()=>{
      remaining--;
      if(remaining<=0){
        clearInterval(unlockTimer);
        maskSecrets();
        return;
      }
      document.getElementById('lockText').textContent='Re-masking in '+remaining+'s';
    },1000);
  }
  function maskSecrets(){
    document.querySelectorAll('.secret-val').forEach(el=>{
      if(!el.querySelector('input')){ // don't stomp a row mid-edit
        el.classList.add('masked');
        el.textContent='••••••••••••••••••••••••••••••••••••••••';
      }
    });
    document.getElementById('lockStatus').style.display='none';
    toast('Secrets re-masked');
  }

  // ---------- edit / delete / add secrets ----------
  function editSecret(btn){
    const row=btn.closest('.secret-row');
    const doEdit=()=>{
      const val=row.querySelector('.secret-val');
      val.classList.remove('masked');
      const current=val.dataset.real;
      val.innerHTML='';
      const input=document.createElement('input');
      input.className='edit-input';
      input.value=current;
      val.appendChild(input);
      input.focus();
      const actions=row.querySelector('.secret-actions');
      actions.dataset.prevHtml=actions.innerHTML;
      actions.innerHTML=
        '<button class="icon-btn" title="Save" onclick="saveSecretEdit(this)"><svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'+
        '<button class="icon-btn" title="Cancel" onclick="cancelSecretEdit(this)"><svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>';
      clearInterval(unlockTimer);
      document.getElementById('lockStatus').style.display='none';
    };
    if(secretsAreLocked()){ requestBiometric(doEdit,'edit this secret'); } else { doEdit(); }
  }
  function saveSecretEdit(btn){
    const row=btn.closest('.secret-row');
    const val=row.querySelector('.secret-val');
    const input=val.querySelector('input');
    const newVal=input.value.trim() || val.dataset.real;
    val.dataset.real=newVal;
    val.textContent=newVal;
    restoreSecretActions(row);
    toast('Secret updated — prototype only, nothing persisted');
    startRemaskCountdown();
    document.getElementById('lockStatus').style.display='flex';
  }
  function cancelSecretEdit(btn){
    const row=btn.closest('.secret-row');
    const val=row.querySelector('.secret-val');
    val.textContent=val.dataset.real;
    restoreSecretActions(row);
  }
  function restoreSecretActions(row){
    const actions=row.querySelector('.secret-actions');
    actions.innerHTML=actions.dataset.prevHtml;
  }
  function deleteSecret(btn){
    const row=btn.closest('.secret-row');
    const label=row.querySelector('.secret-key').firstChild.textContent.trim();
    const doDelete=()=>{
      row.style.transition='opacity .3s ease, max-height .3s ease, padding .3s ease';
      row.style.opacity='0';
      setTimeout(()=>row.remove(),300);
      toast(label+' deleted — prototype only, nothing persisted');
    };
    if(secretsAreLocked()){ requestBiometric(doDelete,'delete '+label); } else { doDelete(); }
  }
  function addSecret(){
    const doAdd=()=>{
      const key=prompt('New secret name (e.g. STRIPE_API_KEY):');
      if(!key) return;
      const value=prompt('Value:') || '';
      const list=document.getElementById('secretsList');
      const row=document.createElement('div');
      row.className='secret-row';
      row.innerHTML=
        '<div class="secret-key">'+key.toUpperCase()+'<span class="tag">added just now</span></div>'+
        '<div class="secret-val" data-real="'+value.replace(/"/g,'&quot;')+'">'+value+'</div>'+
        '<div class="secret-actions">'+
          '<button class="icon-btn" onclick="copySecret(this)" title="Copy"><svg viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M4 16V6a2 2 0 0 1 2-2h10" stroke="currentColor" stroke-width="1.5"/></svg></button>'+
          '<button class="icon-btn" onclick="editSecret(this)" title="Edit"><svg viewBox="0 0 24 24" fill="none"><path d="M4 20l1-4L16.5 4.5a1.5 1.5 0 0 1 2 0l1 1a1.5 1.5 0 0 1 0 2L8 19l-4 1Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></button>'+
          '<button class="icon-btn" onclick="deleteSecret(this)" title="Delete"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'+
        '</div>';
      list.appendChild(row);
      toast('Secret added — prototype only, nothing persisted');
    };
    if(secretsAreLocked()){ requestBiometric(doAdd,'add a new secret'); } else { doAdd(); }
  }
