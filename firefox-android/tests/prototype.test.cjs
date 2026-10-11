const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {Script}=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
test('Firefox Android manifest is self-contained MV2 with mobile declaration',()=>{
  assert.equal(manifest.manifest_version,2);
  assert.ok(manifest.browser_specific_settings.gecko.id);
  assert.ok(manifest.browser_specific_settings.gecko_android);
  assert.ok(manifest.browser_action);
  assert.ok(!manifest.permissions.includes('tabCapture'));
  assert.ok(!manifest.permissions.includes('offscreen'));
});
test('AMO release compatibility: name and data consent require Firefox Android 142+',()=>{
  assert.ok(manifest.name.length <= 45, 'AMO limits manifest name to 45 characters');
  assert.equal(manifest.version, '1.6.3');
  assert.doesNotMatch(manifest.name, /\b(?:mozilla|firefox)\b/i, 'Mozilla trademarks cannot appear in add-on names');
  assert.ok(Number.parseInt(manifest.browser_specific_settings.gecko.strict_min_version,10) >= 140);
  assert.ok(Number.parseInt(manifest.browser_specific_settings.gecko_android.strict_min_version,10) >= 142);
  assert.ok(manifest.browser_specific_settings.gecko.data_collection_permissions.required.length > 0);
});
test('all JavaScript files compile',()=>{
  for(const name of ['background.js','firefox-content.js','pcm-worklet.js','options.js']) {
    assert.doesNotThrow(()=>new Script(fs.readFileSync(path.join(root,name),'utf8'),{filename:name}));
  }
});
test('frontend and background contain capture and Live bridge paths',()=>{
  const content=fs.readFileSync(path.join(root,'firefox-content.js'),'utf8');
  const bg=fs.readFileSync(path.join(root,'background.js'),'utf8');
  assert.match(content,/captureStream\|\|media\.mozCaptureStream/);
  assert.match(content,/firefox-pcm/);
  assert.match(bg,/BidiGenerateContent/);
  assert.match(bg,/setupComplete/);
  assert.match(bg,/binaryType = 'arraybuffer'/);
  assert.match(bg,/firefox-audio/);
  assert.match(content,/s\.media\.muted=s\.wasMuted/);
});
