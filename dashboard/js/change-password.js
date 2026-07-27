    window.addEventListener('DOMContentLoaded', function(){
      window.submitChangePassword = function(){
        var oldp=document.getElementById('cpwOld').value, np=document.getElementById('cpwNew').value, cp=document.getElementById('cpwConfirm').value;
        var msg=document.getElementById('cpwMsg'), btn=document.getElementById('cpwSubmitBtn');
        function show(t,good){ msg.style.display='block'; msg.textContent=t; msg.style.background=good?'rgba(52,211,153,.12)':'rgba(248,113,113,.1)'; msg.style.color=good?'var(--green)':'var(--red)'; }
        if(!np||np.length<6){ show('New password must be at least 6 characters',false); return; }
        if(np!==cp){ show('Passwords do not match',false); return; }
        btn.disabled=true; btn.textContent='Updating…';
        fetch('/api/auth/change-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:localStorage.getItem('app_session'),oldPassword:oldp,newPassword:np})})
          .then(function(r){return r.json();}).then(function(d){
            btn.disabled=false; btn.textContent='Update Password';
            if(d&&d.ok){ show('✅ Password updated!',true); document.getElementById('cpwOld').value=''; document.getElementById('cpwNew').value=''; document.getElementById('cpwConfirm').value=''; }
            else show((d&&d.error)||'Update failed',false);
          }).catch(function(){ btn.disabled=false; btn.textContent='Update Password'; show('Connection error',false); });
      };
    });
