window.zconfirm=function(msg,onYes,opts){
  opts=opts||{};
  var ov=document.getElementById('zconfirmOverlay');
  document.getElementById('zconfirmMsg').innerHTML=msg;            // callers escape dynamic parts
  document.getElementById('zconfirmIc').textContent=opts.icon||'⚠️';
  var yes=document.getElementById('zconfirmYes'), no=document.getElementById('zconfirmNo');
  yes.textContent=opts.yesText||'Confirm'; no.textContent=opts.noText||'Cancel';
  ov.style.display='flex';
  function close(){ ov.style.display='none'; yes.onclick=null; no.onclick=null; }
  yes.onclick=function(){ close(); if(onYes) onYes(); };
  no.onclick=close;
};
