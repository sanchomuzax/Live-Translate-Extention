const fields=['apiKey','targetLanguageCode','bufferMode','echoTargetLanguage','filterFillers','originalAudioDucking','duckingLevel'];
(async()=>{
  const config=await browser.storage.local.get(fields);
  for(const id of fields){
    const el=document.getElementById(id);
    if (el.type==='checkbox') el.checked=!!config[id];
    else el.value=String(config[id] ?? ({targetLanguageCode:'hu',bufferMode:'balanced',duckingLevel:0.15}[id] ?? ''));
  }
})();
document.getElementById('save').addEventListener('click',async()=>{
  const data={};
  for(const id of fields){const el=document.getElementById(id);data[id]=el.type==='checkbox'?el.checked:el.value;}
  data.apiKey=data.apiKey.trim();
  data.duckingLevel=Number(data.duckingLevel);
  await browser.storage.local.set(data);
  document.getElementById('result').textContent='Saved. Open a page playing HTML5 video/audio and tap the extension icon.';
});
