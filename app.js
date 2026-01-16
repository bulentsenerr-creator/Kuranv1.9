/* Kur'an PWA v1.9.3
  v1.9.x tüm özellikler korunur.

  v1.9.3 ekleri (Android Chrome):
  - Offline ses indirirken daha net teşhis: kaç URL cache'e yazıldı? cache adı? örnek key?
  - Origin/URL değişimi uyarısı: Cache'ler origin'e bağlıdır.
  - İndirme: CORS başarısızsa no-cors (opaque) kabul + cache.put(url)
  - İndirme sonunda cache entry sayısı doğrulanır.
*/

const API = "https://api.alquran.cloud/v1";

const store = {
  get(key, fallback){
    try{ const v = localStorage.getItem(key); return v==null ? fallback : JSON.parse(v); }catch{ return fallback; }
  },
  set(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
};

const DB_NAME='quran_pwa';
const DB_VER=10; // v1.9.3

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded=()=>{
      const db=req.result;
      const stores=[
        ['kv',{keyPath:'key'}],
        ['bookmarks',{keyPath:'id'}],
        ['searchCache',{keyPath:'edition'}],
        ['textPacks',{keyPath:'id'}],
        ['sizeCache',{keyPath:'key'}],
        ['quotaCache',{keyPath:'key'}],
        ['jobs',{keyPath:'id'}]
      ];
      for (const [name,opt] of stores){
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name,opt);
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

async function dbPut(storeName, value){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(storeName,'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}
async function dbGet(storeName, key){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(storeName,'readonly');
    const req=tx.objectStore(storeName).get(key);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function dbGetAll(storeName){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(storeName,'readonly');
    const req=tx.objectStore(storeName).getAll();
    req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=()=>reject(req.error);
  });
}
async function dbDelete(storeName, key){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(storeName,'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}
async function dbClear(storeName){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(storeName,'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}

const state={
  surahs:[],
  currentSurah: store.get('currentSurah',1),
  viewMode: store.get('viewMode','ayah'),
  currentPage:null,
  arabicEdition:'quran-uthmani',
  translationEdition: store.get('translationEdition', null),
  audioEdition: store.get('audioEdition','ar.alafasy'),
  translationList:[],
  reciterList:[],
  data:{ arabicAyahs:[], trAyahs:[], audioAyahs:[] },
  searchScope: store.get('searchScope','surah'),
  search:'',
  audio: new Audio(),
  playingKey:null,
  downloadingAudio:false,
  downloadingText:false,
  downloadingAllText:false,
  repeat:{ running:false, cancelToken:0 },
  bookmarks:new Map(),
  lastRead:null,
  highlightAyah:null,
  sizeCalcRunning:false,
  textPackFilter: store.get('textPackFilter','all'),
  selectedJuz: store.get('selectedJuz',30),
  autoResumeJobs: store.get('autoResumeJobs', false),
  wifiOnlyDownloads: store.get('wifiOnlyDownloads', false),
  lastNetworkWasOffline: store.get('lastNetworkWasOffline', false),
  maxConcurrentDownloads: store.get('maxConcurrentDownloads', 2),
  jobRunnerActive:false,
  _blobUrl:null,
  secureOk:true
};

const el={
  secureWarn: document.getElementById('secureWarn'),
  debugWarn: document.getElementById('debugWarn'),
  status:document.getElementById('status'),
  list:document.getElementById('list'),
  surahSelect:document.getElementById('surahSelect'),
  viewAyah:document.getElementById('viewAyah'),
  viewPage:document.getElementById('viewPage'),
  pageField:document.getElementById('pageField'),
  pageSelect:document.getElementById('pageSelect'),
  prevPage:document.getElementById('prevPage'),
  nextPage:document.getElementById('nextPage'),
  translationSelect:document.getElementById('translationSelect'),
  reciterSelect:document.getElementById('reciterSelect'),
  packWarning:document.getElementById('packWarning'),
  searchScope:document.getElementById('searchScope'),
  searchInput:document.getElementById('searchInput'),
  searchHint:document.getElementById('searchHint'),
  fontSize:document.getElementById('fontSize'),
  btnTheme:document.getElementById('btnTheme'),
  btnAbout:document.getElementById('btnAbout'),
  aboutDialog:document.getElementById('aboutDialog'),
  closeAbout:document.getElementById('closeAbout'),

  btnDownloadAudio:document.getElementById('btnDownloadAudio'),
  btnClearAudio:document.getElementById('btnClearAudio'),
  btnDownloadText:document.getElementById('btnDownloadText'),
  btnClearText:document.getElementById('btnClearText'),
  btnDownloadAllText:document.getElementById('btnDownloadAllText'),
  btnCancelAllText:document.getElementById('btnCancelAllText'),
  btnClearAllText:document.getElementById('btnClearAllText'),

  btnDownloadAllAudio:document.getElementById('btnDownloadAllAudio'),
  btnPauseAllAudio:document.getElementById('btnPauseAllAudio'),
  btnResumeAllAudio:document.getElementById('btnResumeAllAudio'),
  btnCancelAllAudio:document.getElementById('btnCancelAllAudio'),
  btnClearAllAudio:document.getElementById('btnClearAllAudio'),

  juzSelect:document.getElementById('juzSelect'),
  btnDownloadJuzAudio:document.getElementById('btnDownloadJuzAudio'),
  btnPauseJuzAudio:document.getElementById('btnPauseJuzAudio'),
  btnResumeJuzAudio:document.getElementById('btnResumeJuzAudio'),
  btnCancelJuzAudio:document.getElementById('btnCancelJuzAudio'),
  btnClearJuzAudio:document.getElementById('btnClearJuzAudio'),

  btnEnqueueAllJuzAudio:document.getElementById('btnEnqueueAllJuzAudio'),
  btnCancelAllJuzJobs:document.getElementById('btnCancelAllJuzJobs'),
  allJuzSummary:document.getElementById('allJuzSummary'),

  dlStatus:document.getElementById('dlStatus'),
  dlBar:document.getElementById('dlBar'),
  dlText:document.getElementById('dlText'),
  txtStatus:document.getElementById('txtStatus'),
  txtBar:document.getElementById('txtBar'),
  txtText:document.getElementById('txtText'),
  allTxtStatus:document.getElementById('allTxtStatus'),
  allTxtBar:document.getElementById('allTxtBar'),
  allTxtText:document.getElementById('allTxtText'),
  allAudStatus:document.getElementById('allAudStatus'),
  allAudBar:document.getElementById('allAudBar'),
  allAudText:document.getElementById('allAudText'),
  juzAudStatus:document.getElementById('juzAudStatus'),
  juzAudBar:document.getElementById('juzAudBar'),
  juzAudText:document.getElementById('juzAudText'),
  offlineBadge:document.getElementById('offlineBadge'),

  repStart:document.getElementById('repStart'),
  repEnd:document.getElementById('repEnd'),
  repCount:document.getElementById('repCount'),
  repDelay:document.getElementById('repDelay'),
  btnRepeat:document.getElementById('btnRepeat'),
  btnStop:document.getElementById('btnStop'),
  hideTr:document.getElementById('hideTr'),
  hideAr:document.getElementById('hideAr'),

  btnBookmarks:document.getElementById('btnBookmarks'),
  btnContinue:document.getElementById('btnContinue'),
  btnOfflineMgr:document.getElementById('btnOfflineMgr'),

  bmDialog:document.getElementById('bmDialog'),
  closeBm:document.getElementById('closeBm'),
  bmList:document.getElementById('bmList'),

  offDialog:document.getElementById('offDialog'),
  closeOff:document.getElementById('closeOff'),
  offAudioList:document.getElementById('offAudioList'),
  offTextList:document.getElementById('offTextList'),
  jobList:document.getElementById('jobList'),
  textPackFilter:document.getElementById('textPackFilter'),
  btnRefreshSizes:document.getElementById('btnRefreshSizes'),
  btnRefreshQuota:document.getElementById('btnRefreshQuota'),
  btnClearAllOfflineAudio:document.getElementById('btnClearAllOfflineAudio'),
  btnClearAllOfflineText:document.getElementById('btnClearAllOfflineText'),
  sizeSummary:document.getElementById('sizeSummary'),
  quotaSummary:document.getElementById('quotaSummary'),
  autoResumeJobs:document.getElementById('autoResumeJobs'),
  wifiOnlyDownloads:document.getElementById('wifiOnlyDownloads'),
  maxConcurrentDownloads:document.getElementById('maxConcurrentDownloads'),

  dlQDialog:document.getElementById('dlQDialog'),
  closeDlQ:document.getElementById('closeDlQ'),
  qBar:document.getElementById('qBar'),
  qText:document.getElementById('qText')
};

init();

async function init(){
  wireUI();
  registerSW();
  setupNetworkListeners();
  checkSecureAndOrigin();

  await loadBookmarksAndLastRead();
  await normalizeJobsOnStartup();

  setStatus('Süreler yükleniyor…');
  await loadSurahList();
  setStatus('Türkçe meal listesi…');
  await loadTranslationList();
  setStatus('Kâri listesi…');
  await loadReciterList();

  if (!state.translationEdition){
    state.translationEdition = pickDefaultTranslation();
    store.set('translationEdition', state.translationEdition);
  }

  populateTranslationSelect();
  populateReciterSelect();
  populateJuzSelect();

  el.searchScope.value = state.searchScope;
  el.searchHint.hidden = (state.searchScope !== 'all');

  const hideTr = store.get('hideTr', false);
  const hideAr = store.get('hideAr', false);
  el.hideTr.checked = hideTr;
  el.hideAr.checked = hideAr;
  document.body.classList.toggle('hide-tr', hideTr);
  document.body.classList.toggle('hide-ar', hideAr);

  el.autoResumeJobs.checked = !!state.autoResumeJobs;
  el.wifiOnlyDownloads.checked = !!state.wifiOnlyDownloads;
  el.maxConcurrentDownloads.value = String(state.maxConcurrentDownloads || 2);

  setStatus(`Sure ${state.currentSurah} yükleniyor…`);
  await loadSurah(state.currentSurah);

  setStatus('');
  applyViewMode(state.viewMode);
  initRepeatDefaults();
  await updateOfflineIndicators();
  await syncBulkAudioButtons();
  await syncJuzAudioButtons();
  await render();

  startReadTracker();
}

function checkSecureAndOrigin(){
  const ok = (window.isSecureContext === true) && ('caches' in window);
  state.secureOk = ok;
  if (!ok){
    el.secureWarn.hidden = false;
    el.secureWarn.textContent = '⚠️ Offline indirme çalışmayabilir: Bu sayfa güvenli bağlamda değil. Android Chrome’da HTTPS üzerinden yayınlayın veya PWA olarak kurun.';
  } else {
    el.secureWarn.hidden = true;
  }

  const lastOrigin = store.get('lastOrigin', null);
  const nowOrigin = location.origin;
  if (lastOrigin && lastOrigin !== nowOrigin){
    el.debugWarn.hidden = false;
    el.debugWarn.textContent = `⚠️ Dikkat: Uygulama farklı bir adresten açıldı. Önceki offline paketler ${lastOrigin} adresinde kaldı. Şu an: ${nowOrigin}. Aynı URL ile açın veya PWA kurun.`;
  } else {
    el.debugWarn.hidden = true;
  }
  store.set('lastOrigin', nowOrigin);
}

function wireUI(){
  el.viewAyah.addEventListener('click', ()=>setViewMode('ayah'));
  el.viewPage.addEventListener('click', ()=>setViewMode('page'));

  el.surahSelect.addEventListener('change', async (e)=>{
    state.currentSurah = Number(e.target.value);
    store.set('currentSurah', state.currentSurah);
    await loadSurah(state.currentSurah);
    initRepeatDefaults();
    await updateOfflineIndicators();
    await render();
  });

  el.pageSelect.addEventListener('change', async (e)=>{ state.currentPage = Number(e.target.value); await render(); });
  el.prevPage.addEventListener('click', async ()=>{ shiftPage(-1); await render(); });
  el.nextPage.addEventListener('click', async ()=>{ shiftPage(1); await render(); });

  el.translationSelect.addEventListener('change', async (e)=>{
    state.translationEdition = e.target.value;
    store.set('translationEdition', state.translationEdition);
    await loadSurah(state.currentSurah);
    initRepeatDefaults();
    await updateOfflineIndicators();
    await render();
  });

  el.reciterSelect.addEventListener('change', async (e)=>{
    state.audioEdition = e.target.value;
    store.set('audioEdition', state.audioEdition);
    await loadSurah(state.currentSurah);
    await updateOfflineIndicators();
    await syncBulkAudioButtons();
    await syncJuzAudioButtons();
    await render();
  });

  el.searchScope.addEventListener('change', async (e)=>{
    state.searchScope = e.target.value;
    store.set('searchScope', state.searchScope);
    el.searchHint.hidden = (state.searchScope !== 'all');
    state.search='';
    el.searchInput.value='';
    await render();
  });

  el.searchInput.addEventListener('input', async (e)=>{
    state.search = (e.target.value||'').trim().toLowerCase();
    await render();
  });

  el.fontSize.addEventListener('input', (e)=>{
    document.documentElement.style.setProperty('--ayah-ar-size', `${Number(e.target.value)}px`);
  });

  el.btnTheme.addEventListener('click', toggleTheme);
  el.btnAbout.addEventListener('click', ()=>el.aboutDialog.showModal());
  el.closeAbout.addEventListener('click', ()=>el.aboutDialog.close());

  el.btnDownloadAudio.addEventListener('click', downloadCurrentSurahAudioOffline);
  el.btnClearAudio.addEventListener('click', clearAudioForCurrent);
  el.btnDownloadText.addEventListener('click', downloadCurrentSurahTextOffline);
  el.btnClearText.addEventListener('click', clearTextForCurrent);

  el.btnDownloadAllText.addEventListener('click', downloadAllTextOffline);
  el.btnCancelAllText.addEventListener('click', cancelAllTextDownload);
  el.btnClearAllText.addEventListener('click', clearAllOfflineText);

  el.btnDownloadAllAudio.addEventListener('click', startBulkAudioDownload);
  el.btnPauseAllAudio.addEventListener('click', ()=>pauseJob(bulkAudioJobId()));
  el.btnResumeAllAudio.addEventListener('click', ()=>resumeJob(bulkAudioJobId()));
  el.btnCancelAllAudio.addEventListener('click', ()=>cancelJob(bulkAudioJobId()));
  el.btnClearAllAudio.addEventListener('click', clearAllAudioForReciter);

  el.juzSelect.addEventListener('change', async (e)=>{ state.selectedJuz=Number(e.target.value); store.set('selectedJuz', state.selectedJuz); await syncJuzAudioButtons(); });
  el.btnDownloadJuzAudio.addEventListener('click', ()=>startJuzAudioDownload(state.selectedJuz));
  el.btnPauseJuzAudio.addEventListener('click', ()=>pauseJob(juzAudioJobId(state.selectedJuz)));
  el.btnResumeJuzAudio.addEventListener('click', ()=>resumeJob(juzAudioJobId(state.selectedJuz)));
  el.btnCancelJuzAudio.addEventListener('click', ()=>cancelJob(juzAudioJobId(state.selectedJuz)));
  el.btnClearJuzAudio.addEventListener('click', ()=>clearJuzAudio(state.selectedJuz));

  el.btnEnqueueAllJuzAudio.addEventListener('click', enqueueAllJuzAudioJobs);
  el.btnCancelAllJuzJobs.addEventListener('click', cancelAllJuzJobs);

  el.btnRepeat.addEventListener('click', startRepeat);
  el.btnStop.addEventListener('click', stopRepeat);

  el.hideTr.addEventListener('change', ()=>{ const v=!!el.hideTr.checked; document.body.classList.toggle('hide-tr', v); store.set('hideTr', v); });
  el.hideAr.addEventListener('change', ()=>{ const v=!!el.hideAr.checked; document.body.classList.toggle('hide-ar', v); store.set('hideAr', v); });

  el.btnBookmarks.addEventListener('click', openBookmarks);
  el.btnContinue.addEventListener('click', continueLastRead);
  el.btnOfflineMgr.addEventListener('click', openOfflineManager);
  el.closeBm.addEventListener('click', ()=>el.bmDialog.close());
  el.closeOff.addEventListener('click', ()=>el.offDialog.close());

  el.textPackFilter.addEventListener('change', async (e)=>{ state.textPackFilter=e.target.value; store.set('textPackFilter', state.textPackFilter); await renderOfflineLists(); });
  el.btnRefreshSizes.addEventListener('click', async ()=>{ await refreshSizeSummary(true); await renderOfflineLists(); });
  el.btnRefreshQuota.addEventListener('click', async ()=>{ await refreshQuotaSummary(true); });
  el.btnClearAllOfflineAudio.addEventListener('click', clearAllOfflineAudio);
  el.btnClearAllOfflineText.addEventListener('click', clearAllOfflineText);
  el.closeDlQ.addEventListener('click', ()=>el.dlQDialog.close());

  el.autoResumeJobs.addEventListener('change', ()=>{ state.autoResumeJobs=!!el.autoResumeJobs.checked; store.set('autoResumeJobs', state.autoResumeJobs); });
  el.wifiOnlyDownloads.addEventListener('change', ()=>{ state.wifiOnlyDownloads=!!el.wifiOnlyDownloads.checked; store.set('wifiOnlyDownloads', state.wifiOnlyDownloads); });
  el.maxConcurrentDownloads.addEventListener('change', ()=>{ const v=Math.max(1,Math.min(3,Number(el.maxConcurrentDownloads.value||2))); state.maxConcurrentDownloads=v; store.set('maxConcurrentDownloads', v); });

  state.audio.addEventListener('ended', ()=>{ state.playingKey=null; render(); });
}

function toggleTheme(){
  const root=document.documentElement;
  const isLight=root.getAttribute('data-theme')==='light';
  root.setAttribute('data-theme', isLight?'':'light');
  el.btnTheme.textContent = isLight ? '🌙' : '☀️';
}

function setViewMode(mode){
  state.viewMode=mode;
  store.set('viewMode', mode);
  applyViewMode(mode);
  render();
}

function applyViewMode(mode){
  el.viewAyah.classList.toggle('active', mode==='ayah');
  el.viewPage.classList.toggle('active', mode==='page');
  el.pageField.hidden = (mode!=='page');
  if (mode==='page' && state.currentPage==null){
    const pages=getPages();
    state.currentPage=pages[0]??null;
    populatePageSelect();
  }
}

function shiftPage(delta){
  const pages=getPages();
  if (!pages.length) return;
  const i=pages.indexOf(state.currentPage);
  state.currentPage=pages[Math.min(pages.length-1, Math.max(0, i+delta))];
  el.pageSelect.value=String(state.currentPage);
}

function setStatus(msg){
  el.status.textContent = msg || '';
  el.status.style.display = msg ? 'block' : 'none';
}

function escapeHTML(s){
  return (s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

async function fetchJSON(url){
  const res=await fetch(url, { headers:{'Accept':'application/json'} });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function registerSW(){
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
}

function isWifiConnection(){
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return null;
  if (conn.type){
    const t=String(conn.type).toLowerCase();
    if (t.includes('wifi') || t.includes('ethernet')) return true;
    if (t.includes('cellular') || t.includes('none')) return false;
  }
  return null;
}

function warnIfNotWifi(){
  const isWifi=isWifiConnection();
  if (isWifi===null) return true;
  if (isWifi) return true;
  if (state.wifiOnlyDownloads){
    alert('Wi‑Fi zorunlu modu açık. Büyük indirmeler için Wi‑Fi bağlantısına geçin.');
    return false;
  }
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const type = (conn?.type || conn?.effectiveType || '').toLowerCase();
  return confirm(`Wi‑Fi dışı bir bağlantı algılandı (${type}). Büyük indirmeler kotanızı tüketebilir. Devam edilsin mi?`);
}

async function fetchForCache(url){
  try {
    return await fetch(url, { mode:'cors' });
  } catch {
    try { return await fetch(url, { mode:'no-cors' }); } catch { return null; }
  }
}

function canCacheResponse(res){
  return !!res && (res.ok || res.type==='opaque');
}

// Data load
async function loadSurahList(){
  const res=await fetchJSON(`${API}/surah`);
  state.surahs=res.data||[];
  el.surahSelect.innerHTML = state.surahs.map(s=>`<option value="${s.number}">${s.number}. ${s.englishName} (${s.name})</option>`).join('');
  el.surahSelect.value=String(state.currentSurah);
}

async function loadTranslationList(){
  try{
    const r=await fetchJSON(`${API}/edition?language=tr&type=translation`);
    state.translationList=(r.data||[]).sort((a,b)=>(a.englishName||'').localeCompare(b.englishName||''));
  } catch {
    state.translationList=[{identifier:'tr.diyanet', englishName:'Diyanet'}];
  }
}

function pickDefaultTranslation(){
  const preferred=['tr.diyanet','tr.yazir','tr.ates','tr.ozturk'];
  for (const id of preferred) if (state.translationList.some(x=>x.identifier===id)) return id;
  return state.translationList[0]?.identifier || 'tr.diyanet';
}

function populateTranslationSelect(){
  el.translationSelect.innerHTML = state.translationList.map(x=>`<option value="${x.identifier}">${escapeHTML(x.englishName||x.name||x.identifier)}</option>`).join('');
  el.translationSelect.value=state.translationEdition;
}

async function loadReciterList(){
  try{
    const r=await fetchJSON(`${API}/edition?format=audio&type=versebyverse&language=ar`);
    const list=r.data||[];
    state.reciterList=list.filter(x=>(x.identifier||'').startsWith('ar.')).sort((a,b)=>(a.englishName||'').localeCompare(b.englishName||''));
    if (!state.reciterList.some(x=>x.identifier===state.audioEdition)){
      state.audioEdition=state.reciterList[0]?.identifier||'ar.alafasy';
      store.set('audioEdition', state.audioEdition);
    }
  } catch {
    state.reciterList=[{identifier:'ar.alafasy', englishName:'Alafasy'}];
  }
}

function populateReciterSelect(){
  el.reciterSelect.innerHTML = state.reciterList.map(x=>`<option value="${x.identifier}">${escapeHTML(x.englishName||x.name||x.identifier)}</option>`).join('');
  el.reciterSelect.value=state.audioEdition;
}

function populateJuzSelect(){
  el.juzSelect.innerHTML = Array.from({length:30},(_,i)=>`<option value="${i+1}">Cüz ${i+1}</option>`).join('');
  el.juzSelect.value=String(state.selectedJuz);
}

function textPackId(surah){
  return `text-${state.arabicEdition}__${state.translationEdition}__s${surah}`;
}

async function saveTextPack(id, surah, arabicAyahs, trAyahs){
  const bytesApprox = approximateJsonBytes({arabicAyahs, trAyahs});
  await dbPut('textPacks', { id, surah, arabicEdition: state.arabicEdition, translationEdition: state.translationEdition, ts: Date.now(), bytesApprox, arabicAyahs, trAyahs });
  await dbDelete('sizeCache', `summary:${state.arabicEdition}`);
}

async function loadSurah(surahNumber){
  setStatus(`Sure ${surahNumber} yükleniyor…`);
  const pid=textPackId(surahNumber);
  try{
    const [ar,tr,au]=await Promise.all([
      fetchJSON(`${API}/surah/${surahNumber}/${state.arabicEdition}`),
      fetchJSON(`${API}/surah/${surahNumber}/${state.translationEdition}`),
      fetchJSON(`${API}/surah/${surahNumber}/${state.audioEdition}`)
    ]);
    state.data.arabicAyahs = ar.data?.ayahs || [];
    state.data.trAyahs = tr.data?.ayahs || [];
    state.data.audioAyahs = au.data?.ayahs || [];
    await saveTextPack(pid, surahNumber, state.data.arabicAyahs, state.data.trAyahs);
    setStatus('');
  } catch {
    const cached=await dbGet('textPacks', pid);
    if (cached?.arabicAyahs?.length){
      state.data.arabicAyahs=cached.arabicAyahs;
      state.data.trAyahs=cached.trAyahs||[];
      setStatus('Offline: Metin+Meal cihazdan yüklendi.');
      setTimeout(()=>setStatus(''), 1200);
    } else {
      setStatus('İnternet yok ve bu sure için offline metin+meal bulunamadı.');
    }
  }
  populatePageSelect(true);
  if (state.lastRead?.surah === state.currentSurah) state.highlightAyah=state.lastRead.ayah;
}

function getPages(){
  return [...new Set((state.data.arabicAyahs||[]).map(a=>a.page).filter(Boolean))].sort((a,b)=>a-b);
}

function populatePageSelect(resetToFirst=false){
  const pages=getPages();
  el.pageSelect.innerHTML = pages.map(p=>`<option value="${p}">${p}</option>`).join('');
  if (resetToFirst || state.currentPage==null) state.currentPage=pages[0]??null;
  if (state.currentPage!=null) el.pageSelect.value=String(state.currentPage);
}

function buildMergedAyahs(){
  const trByNo=new Map((state.data.trAyahs||[]).map(a=>[a.numberInSurah, a.text]));
  const auByNo=new Map((state.data.audioAyahs||[]).map(a=>[a.numberInSurah, a.audio]));
  return (state.data.arabicAyahs||[]).map(a=>({
    no:a.numberInSurah,
    page:a.page,
    ar:a.text,
    tr:trByNo.get(a.numberInSurah)||'',
    audio:auByNo.get(a.numberInSurah)||null
  }));
}

// Render
async function render(){
  const merged=buildMergedAyahs();
  if (merged.length){
    el.repStart.max=String(merged.length);
    el.repEnd.max=String(merged.length);
  }
  if (state.searchScope==='all' && state.search){
    await renderGlobalSearch();
    return;
  }
  let filtered=merged;
  if (state.viewMode==='page' && state.currentPage!=null) filtered=filtered.filter(x=>x.page===state.currentPage);
  if (state.search) filtered=filtered.filter(x=>(x.tr||'').toLowerCase().includes(state.search));
  if (!filtered.length){
    el.list.innerHTML = `<div class="ayah"><div class="tr">Sonuç bulunamadı.</div></div>`;
    return;
  }
  el.list.innerHTML = filtered.map(ayahCardHTML).join('');
  document.querySelectorAll('[data-play]').forEach(btn=>btn.addEventListener('click', ()=>onPlayClicked(btn.dataset.play)));
  document.querySelectorAll('[data-bm]').forEach(btn=>btn.addEventListener('click', ()=>toggleBookmark(btn.dataset.bm)));
}

function ayahCardHTML(x){
  const key=`${state.currentSurah}:${x.no}`;
  const isPlaying=state.playingKey===key;
  const isBm=state.bookmarks.has(key);
  return `
  <article class="ayah ${state.highlightAyah===x.no?'highlight':''}" id="a-${x.no}">
    <div class="ayahHead">
      <div class="badge">Ayet ${x.no} • Sayfa ${x.page ?? '-'}</div>
      <div class="tools">
        <button class="btn small star" data-bm="${key}">${isBm?'★':'☆'} Yer imi</button>
        <button class="btn small play" data-play="${key}">${isPlaying?'⏸ Duraklat':'▶ Dinle'}</button>
      </div>
    </div>
    <div class="ar" dir="rtl" lang="ar">${escapeHTML(x.ar)}</div>
    <div class="tr">${escapeHTML(x.tr)}</div>
  </article>`;
}

// Bookmarks & last read
async function loadBookmarksAndLastRead(){
  const bms=await dbGetAll('bookmarks');
  state.bookmarks=new Map(bms.map(b=>[b.id,b]));
  const lr=await dbGet('kv','lastRead');
  state.lastRead=lr?.value||null;
}

async function toggleBookmark(id){
  if (state.bookmarks.has(id)){
    state.bookmarks.delete(id);
    await dbDelete('bookmarks', id);
  } else {
    const [surah,ayah]=id.split(':').map(Number);
    const bm={id,surah,ayah,ts:Date.now(),edition:state.translationEdition};
    state.bookmarks.set(id,bm);
    await dbPut('bookmarks', bm);
  }
  await render();
}

async function openBookmarks(){
  const all=[...state.bookmarks.values()].sort((a,b)=>b.ts-a.ts);
  if (!all.length){
    el.bmList.innerHTML=`<div class="ayah"><div class="tr">Henüz yer imi yok.</div></div>`;
  } else {
    el.bmList.innerHTML=all.map(b=>`<div class="ayah"><div class="ayahHead"><div class="badge">Sure ${b.surah} • Ayet ${b.ayah}</div><div class="tools"><button class="btn small" data-go="${b.id}">Git</button><button class="btn small ghost" data-del="${b.id}">Sil</button></div></div><div class="tr muted">${new Date(b.ts).toLocaleString('tr-TR')}</div></div>`).join('');
    el.bmList.querySelectorAll('[data-go]').forEach(btn=>btn.addEventListener('click', async()=>{ await goToAyahId(btn.dataset.go,true); el.bmDialog.close(); }));
    el.bmList.querySelectorAll('[data-del]').forEach(btn=>btn.addEventListener('click', async()=>{ const id=btn.dataset.del; state.bookmarks.delete(id); await dbDelete('bookmarks', id); await openBookmarks(); await render(); }));
  }
  el.bmDialog.showModal();
}

async function continueLastRead(){
  if (!state.lastRead) return alert("Kayıtlı bir 'kaldığın yer' bulunamadı.");
  await goToAyahId(`${state.lastRead.surah}:${state.lastRead.ayah}`, true);
}

async function goToAyahId(id, scroll=true){
  const [surah,ayah]=id.split(':').map(Number);
  if (state.currentSurah!==surah){
    state.currentSurah=surah;
    store.set('currentSurah', surah);
    el.surahSelect.value=String(surah);
    await loadSurah(surah);
    initRepeatDefaults();
    await updateOfflineIndicators();
    await syncBulkAudioButtons();
    await syncJuzAudioButtons();
  }
  state.highlightAyah=ayah;
  await render();
  if (scroll) requestAnimationFrame(()=>document.getElementById(`a-${ayah}`)?.scrollIntoView({behavior:'smooth',block:'start'}));
}

function startReadTracker(){
  let timer=null;
  window.addEventListener('scroll', ()=>{ if (timer) clearTimeout(timer); timer=setTimeout(captureReadingPosition, 180); }, {passive:true});
  setTimeout(captureReadingPosition, 400);
}

async function captureReadingPosition(){
  const cards=[...document.querySelectorAll(".ayah[id^='a-']")];
  if (!cards.length) return;
  const vh=window.innerHeight||800;
  let best=null;
  for (const c of cards){
    const r=c.getBoundingClientRect();
    if (r.bottom>80 && r.top<vh*0.6){ best=c; break; }
  }
  if (!best) return;
  const ayah=Number((best.id||'').replace('a-',''));
  if (!ayah) return;
  const lr={surah:state.currentSurah, ayah, ts:Date.now()};
  state.lastRead=lr;
  await dbPut('kv', { key:'lastRead', value: lr });
}

// Offline audio fallback play
async function playFromCacheFallback(url){
  try{
    const res = await caches.match(url);
    if (!res) return false;
    let blob;
    try { blob = await res.blob(); } catch { return false; }
    const objUrl = URL.createObjectURL(blob);
    if (state._blobUrl){ try{ URL.revokeObjectURL(state._blobUrl); }catch{} }
    state._blobUrl=objUrl;
    state.audio.src=objUrl;
    await state.audio.play();
    return true;
  } catch { return false; }
}

function initRepeatDefaults(){
  const max=buildMergedAyahs().length||7;
  const base=(state.lastRead?.surah===state.currentSurah)?state.lastRead.ayah:1;
  el.repStart.value=String(Math.max(1,Math.min(max,base)));
  el.repEnd.value=String(Math.max(1,Math.min(max,base+2)));
}

function stopRepeat(){
  if (!state.repeat.running) return;
  state.repeat.cancelToken++;
  state.repeat.running=false;
  try{ state.audio.pause(); }catch{}
  state.playingKey=null;
}

async function startRepeat(){
  stopRepeat();
  const merged=buildMergedAyahs();
  const max=merged.length;
  if (!max) return;
  let start=Number(el.repStart.value||1);
  let end=Number(el.repEnd.value||start);
  let count=Number(el.repCount.value||1);
  let delay=Number(el.repDelay.value||0);
  start=Math.max(1,Math.min(max,start));
  end=Math.max(1,Math.min(max,end));
  if (end<start) [start,end]=[end,start];
  count=Math.max(1,Math.min(50,count));
  delay=Math.max(0,Math.min(10,delay));
  const token=++state.repeat.cancelToken;
  state.repeat.running=true;
  for (let rep=1; rep<=count; rep++){
    for (let a=start; a<=end; a++){
      if (token!==state.repeat.cancelToken) return;
      const item=merged.find(x=>x.no===a);
      if (!item?.audio) continue;
      state.playingKey=`${state.currentSurah}:${a}`;
      state.highlightAyah=a;
      await render();
      await playAudio(item.audio);
      if (token!==state.repeat.cancelToken) return;
      if (delay) await sleep(delay*1000, token);
    }
  }
  state.repeat.running=false;
  state.playingKey=null;
  await render();
}

function onPlayClicked(key){
  stopRepeat();
  if (state.playingKey===key && !state.audio.paused){
    state.audio.pause();
    state.playingKey=null;
    render();
    return;
  }
  const ayahNo=Number(key.split(':')[1]);
  const item=buildMergedAyahs().find(x=>x.no===ayahNo);
  if (!item?.audio) return alert('Bu ayet için ses bulunamadı (offline olabilir).');
  state.audio.src=item.audio;
  state.audio.onerror = async ()=>{ if (!navigator.onLine) await playFromCacheFallback(item.audio); };
  state.audio.play().catch(async ()=>{ if (!navigator.onLine) await playFromCacheFallback(item.audio); });
  state.playingKey=key;
  state.highlightAyah=ayahNo;
  render();
}

function playAudio(url){
  return new Promise((resolve)=>{
    try{
      state.audio.onended=()=>resolve();
      state.audio.onerror=async ()=>{ if (!navigator.onLine) await playFromCacheFallback(url); resolve(); };
      state.audio.src=url;
      const p=state.audio.play();
      if (p && p.catch) p.catch(async ()=>{ if (!navigator.onLine) await playFromCacheFallback(url); resolve(); });
    }catch{ resolve(); }
  });
}

function sleep(ms, token){
  return new Promise((resolve)=>{
    const t=setTimeout(resolve, ms);
    const check=()=>{ if (token!==state.repeat.cancelToken){ clearTimeout(t); resolve(); } else requestAnimationFrame(check); };
    requestAnimationFrame(check);
  });
}

// Offline caches
function audioCacheName(surah=state.currentSurah, reciter=state.audioEdition){
  return `quran-offline-${reciter}-s${surah}`;
}

async function downloadCurrentSurahAudioOffline(){
  if (state.downloadingAudio) return;
  if (!warnIfNotWifi()) return;
  if (!('caches' in window)){
    alert('Bu tarayıcıda Cache API yok. Offline indirme yapılamaz.');
    return;
  }
  stopRepeat();
  const urls=buildMergedAyahs().map(x=>x.audio).filter(Boolean);
  if (!urls.length) return alert('Bu sure için ses bulunamadı.');

  state.downloadingAudio=true;
  el.dlStatus.hidden=false;
  el.dlBar.style.width='0%';
  el.dlText.textContent='İndiriliyor…';
  el.btnDownloadAudio.disabled=true;

  const cn=audioCacheName();
  const cache=await caches.open(cn);
  let ok=0, fail=0;
  let lastErr='';

  for (let i=0;i<urls.length;i++){
    const url=urls[i];
    el.dlBar.style.width=`${Math.round((i/urls.length)*100)}%`;
    el.dlText.textContent=`İndiriliyor: ${i+1}/${urls.length}`;
    try{
      const existing=await cache.match(url);
      if (existing){ ok++; continue; }
      const res=await fetchForCache(url);
      if (canCacheResponse(res)){
        await cache.put(url, res.clone());
        ok++;
      } else {
        fail++; lastErr = `cachelenemedi (res yok/ok değil): ${url}`;
      }
    } catch (e){
      fail++; lastErr = String(e||'hata');
    }
  }

  // verify cache entries count
  let entryCount = null;
  try{
    const keys = await cache.keys();
    entryCount = keys.length;
  }catch{}

  // Save debug info to kv
  try{
    await dbPut('kv', { key:`lastAudioDl:${location.origin}`, value:{ cache: cn, ok, total: urls.length, fail, entryCount, lastErr, ts:Date.now() } });
  }catch{}

  el.dlBar.style.width='100%';
  el.dlText.textContent=`Tamamlandı. Cache: ${cn} • Offline ses: ${ok}/${urls.length}` + (entryCount!=null?` • Kayıt: ${entryCount}`:'') + (fail?` • Hata: ${fail}`:'');

  state.downloadingAudio=false;
  el.btnDownloadAudio.disabled=false;
  await dbDelete('sizeCache', `audio:${cn}`);
  await updateOfflineIndicators();
}

async function clearAudioForCurrent(){
  const cn=audioCacheName();
  await caches.delete(cn);
  await dbDelete('sizeCache', `audio:${cn}`);
  alert('Seçili sure offline ses paketi silindi.');
  await updateOfflineIndicators();
}

// Offline text
async function downloadCurrentSurahTextOffline(){
  if (state.downloadingText) return;
  state.downloadingText=true;
  el.txtStatus.hidden=false;
  el.txtBar.style.width='0%';
  el.txtText.textContent='İndiriliyor…';
  el.btnDownloadText.disabled=true;
  const surah=state.currentSurah;
  const pid=textPackId(surah);
  try{
    const [ar,tr]=await Promise.all([
      fetchJSON(`${API}/surah/${surah}/${state.arabicEdition}`),
      fetchJSON(`${API}/surah/${surah}/${state.translationEdition}`)
    ]);
    el.txtBar.style.width='60%';
    el.txtText.textContent='Kaydediliyor…';
    await saveTextPack(pid, surah, ar.data?.ayahs||[], tr.data?.ayahs||[]);
    el.txtBar.style.width='100%';
    el.txtText.textContent='Tamamlandı. Offline okuma hazır.';
  }catch{ el.txtText.textContent='Hata: Metin+Meal indirilemedi.'; }
  state.downloadingText=false;
  el.btnDownloadText.disabled=false;
  await updateOfflineIndicators();
}

async function clearTextForCurrent(){
  await dbDelete('textPacks', textPackId(state.currentSurah));
  alert('Seçili sure offline metin+meal paketi silindi.');
  await updateOfflineIndicators();
}

async function downloadAllTextOffline(){
  if (state.downloadingAllText) return;
  if (!confirm('Bu işlem seçili meal için tüm Kur’ân metin+meal verisini indirir (büyük olabilir). Devam edilsin mi?')) return;
  state.downloadingAllText=true;
  el.btnCancelAllText.disabled=false;
  el.allTxtStatus.hidden=false;
  el.allTxtBar.style.width='0%';
  el.allTxtText.textContent='İndiriliyor…';
  el.btnDownloadAllText.disabled=true;
  const token=Date.now();
  await dbPut('kv', { key:'allTextDownloadToken', value: token });
  try{
    const [qar,qtr]=await Promise.all([
      fetchJSON(`${API}/quran/${state.arabicEdition}`),
      fetchJSON(`${API}/quran/${state.translationEdition}`)
    ]);
    const arabicSurahs=qar.data?.surahs||[];
    const trSurahs=qtr.data?.surahs||[];
    const trMap=new Map(trSurahs.map(s=>[s.number, s.ayahs||[]]));
    for (let i=0;i<arabicSurahs.length;i++){
      const saved=(await dbGet('kv','allTextDownloadToken'))?.value;
      if (saved!==token) throw new Error('cancelled');
      const s=arabicSurahs[i];
      const surahNo=s.number;
      el.allTxtBar.style.width=`${Math.round((i/arabicSurahs.length)*100)}%`;
      el.allTxtText.textContent=`Kaydediliyor… Sure ${surahNo}/114`;
      await saveTextPack(textPackId(surahNo), surahNo, s.ayahs||[], trMap.get(surahNo)||[]);
      if (i%6===0) await new Promise(r=>setTimeout(r,0));
    }
    el.allTxtBar.style.width='100%';
    el.allTxtText.textContent='Tamamlandı. Tüm Kur’ân offline okuma hazır.';
  }catch(e){
    el.allTxtText.textContent=String(e).includes('cancelled')?'İptal edildi.':'Hata: Tüm Kur’ân indirilemedi.';
  }
  state.downloadingAllText=false;
  el.btnCancelAllText.disabled=true;
  el.btnDownloadAllText.disabled=false;
  await updateOfflineIndicators();
}

async function cancelAllTextDownload(){
  await dbPut('kv', { key:'allTextDownloadToken', value: -1 });
  el.allTxtText.textContent='İptal isteği gönderildi…';
  el.btnCancelAllText.disabled=true;
}

async function clearAllOfflineText(){
  if (!confirm('Tüm offline OKUMA paketleri silinsin mi?')) return;
  await dbClear('textPacks');
  await dbClear('sizeCache');
  alert('Tüm offline okuma paketleri silindi.');
  await updateOfflineIndicators();
  if (el.offDialog.open) await openOfflineManager();
}

async function clearAllOfflineAudio(){
  if (!confirm('Tüm offline SES paketleri silinsin mi?')) return;
  const keys=(await caches.keys()).filter(k=>k.startsWith('quran-offline-'));
  await Promise.all(keys.map(k=>caches.delete(k)));
  const sc=await dbGetAll('sizeCache');
  await Promise.all(sc.filter(x=>(x.key||'').startsWith('audio:')).map(x=>dbDelete('sizeCache', x.key)));
  alert('Tüm offline ses paketleri silindi.');
  await updateOfflineIndicators();
  if (el.offDialog.open) await openOfflineManager();
}

// Job system - kept (minimal UI sync)
function bulkAudioJobId(reciter=state.audioEdition){ return `job:bulkAudio:${reciter}`; }
function juzAudioJobId(juz, reciter=state.audioEdition){ return `job:juzAudio:${reciter}:j${juz}`; }
function bulkAudioCachePrefix(reciter=state.audioEdition){ return `quran-offline-${reciter}-s`; }
function juzAudioCacheName(juz, reciter=state.audioEdition){ return `quran-offline-${reciter}-j${juz}`; }

async function normalizeJobsOnStartup(){
  const jobs=await dbGetAll('jobs');
  for (const j of jobs){
    if (j.status==='running'){
      j.status='paused';
      j.updatedAt=Date.now();
      j.message='Uygulama yeniden açıldı: duraklatıldı.';
      await dbPut('jobs', j);
    }
  }
}

async function startBulkAudioDownload(){
  if (!warnIfNotWifi()) return;
  const reciter=state.audioEdition;
  if (!confirm(`Seçili kâri (${reciter}) için tüm Kur’ân sesini indirmek büyük olabilir. Devam edilsin mi?`)) return;
  const id=bulkAudioJobId(reciter);
  const existing=await dbGet('jobs', id);
  if (existing && (existing.status==='running'||existing.status==='paused')){ await resumeJob(id); return; }
  const job={id,type:'bulkAudio',reciter,priority:10,status:'running',progress:{surah:1,ayahIndex:0,doneAyahs:0,totalAyahs:6236,bytesDone:0,startedAt:Date.now()},createdAt:Date.now(),updatedAt:Date.now(),message:'Başlıyor…'};
  await dbPut('jobs', job);
  await syncBulkAudioButtons();
  await runJobRunner();
}

async function startJuzAudioDownload(juz){
  if (!warnIfNotWifi()) return;
  const reciter=state.audioEdition;
  const id=juzAudioJobId(juz, reciter);
  const existing=await dbGet('jobs', id);
  if (existing && (existing.status==='running'||existing.status==='paused')){ await resumeJob(id); return; }
  const job={id,type:'juzAudio',reciter,juz,priority:20+Number(juz||0),status:'running',progress:{ayahIndex:0,doneAyahs:0,totalAyahs:0,bytesDone:0,startedAt:Date.now()},createdAt:Date.now(),updatedAt:Date.now(),message:`Başlıyor… (Cüz ${juz})`};
  await dbPut('jobs', job);
  await syncJuzAudioButtons();
  await runJobRunner();
}

async function enqueueAllJuzAudioJobs(){
  if (!warnIfNotWifi()) return;
  const reciter=state.audioEdition;
  if (!confirm(`Seçili kâri (${reciter}) için 30 cüz ses indirmesi kuyruğa eklenecek. Devam edilsin mi?`)) return;
  for (let j=1;j<=30;j++){
    const id=juzAudioJobId(j, reciter);
    const ex=await dbGet('jobs', id);
    if (ex) continue;
    const job={id,type:'juzAudio',reciter,juz:j,priority:20+j,status:'paused',progress:{ayahIndex:0,doneAyahs:0,totalAyahs:0,bytesDone:0,startedAt:null},createdAt:Date.now(),updatedAt:Date.now(),message:`Kuyruğa eklendi (Cüz ${j}).`};
    await dbPut('jobs', job);
  }
  await startNextJobIfIdle();
  await renderJobList();
  await updateAllJuzSummary();
}

async function cancelAllJuzJobs(){
  const reciter=state.audioEdition;
  if (!confirm(`Seçili kâri (${reciter}) için tüm cüz indirme işleri iptal edilsin mi?`)) return;
  const jobs=await dbGetAll('jobs');
  for (const j of jobs){
    if (j.type==='juzAudio' && j.reciter===reciter && (j.status==='running'||j.status==='paused')){
      j.status='cancelled';
      j.updatedAt=Date.now();
      j.message='Toplu iptal edildi.';
      await dbPut('jobs', j);
    }
  }
  await renderJobList();
  await syncJuzAudioButtons();
  await updateAllJuzSummary();
}

async function pauseJob(id){
  const job=await dbGet('jobs', id);
  if (!job) return;
  if (job.status==='running'){
    job.status='paused';
    job.updatedAt=Date.now();
    job.message='Duraklatıldı.';
    await dbPut('jobs', job);
    await syncBulkAudioButtons();
    await syncJuzAudioButtons();
    await renderJobList();
  }
}

async function resumeJob(id){
  const job=await dbGet('jobs', id);
  if (!job) return;
  job.status='running';
  job.updatedAt=Date.now();
  job.message='Devam ediyor…';
  if (!job.progress) job.progress={};
  if (!job.progress.startedAt) job.progress.startedAt=Date.now();
  await dbPut('jobs', job);
  await syncBulkAudioButtons();
  await syncJuzAudioButtons();
  await runJobRunner();
}

async function cancelJob(id){
  const job=await dbGet('jobs', id);
  if (!job) return;
  job.status='cancelled';
  job.updatedAt=Date.now();
  job.message='İptal edildi.';
  await dbPut('jobs', job);
  await syncBulkAudioButtons();
  await syncJuzAudioButtons();
  await renderJobList();
}

async function deleteJob(id){
  await dbDelete('jobs', id);
  await syncBulkAudioButtons();
  await syncJuzAudioButtons();
  await renderJobList();
}

async function bumpJobPriority(id, dir){
  const job=await dbGet('jobs', id);
  if (!job) return;
  if (job.priority==null) job.priority=50;
  job.priority=Math.max(0, job.priority + (dir<0?-1:+1));
  job.updatedAt=Date.now();
  await dbPut('jobs', job);
}

async function startNextJobIfIdle(){
  const all=await dbGetAll('jobs');
  const maxN=Math.max(1,Math.min(3,state.maxConcurrentDownloads||2));
  const running=all.filter(j=>j.status==='running' && (j.type==='bulkAudio'||j.type==='juzAudio'));
  if (running.length>=maxN) return;
  const paused=all.filter(j=>j.status==='paused' && (j.type==='bulkAudio'||j.type==='juzAudio'))
    .sort((a,b)=>(a.priority??999)-(b.priority??999) || (a.createdAt||0)-(b.createdAt||0));
  if (!paused.length) return;
  paused[0].status='running';
  paused[0].updatedAt=Date.now();
  paused[0].message='Devam ediyor…';
  if (!paused[0].progress) paused[0].progress={};
  if (!paused[0].progress.startedAt) paused[0].progress.startedAt=Date.now();
  await dbPut('jobs', paused[0]);
  await runJobRunner();
}

async function runJobRunner(){
  if (state.jobRunnerActive) return;
  state.jobRunnerActive=true;
  try{
    while (true){
      const allJobs=await dbGetAll('jobs');
      const maxN=Math.max(1,Math.min(3,state.maxConcurrentDownloads||2));
      let running=allJobs.filter(j=>j.status==='running' && (j.type==='bulkAudio'||j.type==='juzAudio'))
        .sort((a,b)=>(a.priority??999)-(b.priority??999) || (a.createdAt||0)-(b.createdAt||0));
      if (running.length<maxN){
        const paused=allJobs.filter(j=>j.status==='paused' && (j.type==='bulkAudio'||j.type==='juzAudio'))
          .sort((a,b)=>(a.priority??999)-(b.priority??999) || (a.createdAt||0)-(b.createdAt||0));
        for (const p of paused){
          if (running.length>=maxN) break;
          p.status='running';
          p.updatedAt=Date.now();
          p.message='Devam ediyor…';
          if (!p.progress) p.progress={};
          if (!p.progress.startedAt) p.progress.startedAt=Date.now();
          await dbPut('jobs', p);
          running.push(p);
        }
      }
      if (!running.length) break;
      let progressed=false;
      for (const job of running.slice(0,maxN)){
        if (job.type==='bulkAudio') progressed = (await processBulkAudioJob(job, 6)) || progressed;
        if (job.type==='juzAudio') progressed = (await processJuzAudioJob(job, 10)) || progressed;
      }
      await syncBulkAudioButtons();
      await syncJuzAudioButtons();
      if (el.offDialog.open){
        await renderJobList();
        await updateAllJuzSummary();
      }
      if (!progressed) break;
      await new Promise(r=>setTimeout(r,0));
    }
  } finally {
    state.jobRunnerActive=false;
    await syncBulkAudioButtons();
    await syncJuzAudioButtons();
    await renderJobList();
    await updateAllJuzSummary();
  }
}

async function processBulkAudioJob(job, stepLimit=6){
  let steps=0;
  const reciter=job.reciter;
  const totalAyahs=job.progress?.totalAyahs || 6236;
  for (let s=job.progress.surah||1; s<=114; s++){
    const fresh=await dbGet('jobs', job.id);
    if (!fresh || fresh.status!=='running') return steps>0;
    let surahData;
    try{ surahData=(await fetchJSON(`${API}/surah/${s}/${reciter}`)).data; }
    catch{ fresh.status='paused'; fresh.message='Ağ hatası. Duraklatıldı.'; fresh.updatedAt=Date.now(); await dbPut('jobs', fresh); return steps>0; }
    const ayahs=surahData?.ayahs||[];
    const cacheName=audioCacheName(s, reciter);
    const cache=await caches.open(cacheName);
    let iStart=(s===(job.progress.surah||1)) ? (job.progress.ayahIndex||0) : 0;
    for (let i=iStart; i<ayahs.length; i++){
      const fresh2=await dbGet('jobs', job.id);
      if (!fresh2 || fresh2.status!=='running') return steps>0;
      const url=ayahs[i].audio;
      if (url){
        try{
          const existing=await cache.match(url);
          if (!existing){
            const r=await fetchForCache(url);
            if (canCacheResponse(r)){
              const cl=r.headers?.get?.('content-length');
              if (cl) job.progress.bytesDone=(job.progress.bytesDone||0)+Number(cl);
              await cache.put(url, r.clone());
            }
          }
        }catch{}
      }
      job.progress.surah=s;
      job.progress.ayahIndex=i+1;
      job.progress.doneAyahs=Math.min(totalAyahs, (job.progress.doneAyahs||0)+1);
      job.progress.totalAyahs=totalAyahs;
      job.message=`İndiriliyor… Sure ${s}/114, Ayet ${i+1}/${ayahs.length}`;
      job.updatedAt=Date.now();
      await dbPut('jobs', job);
      steps++;
      if (steps>=stepLimit) return true;
    }
    job.progress.surah=s+1;
    job.progress.ayahIndex=0;
    job.message=`Sure ${s} tamamlandı.`;
    job.updatedAt=Date.now();
    await dbPut('jobs', job);
    await dbDelete('sizeCache', `audio:${cacheName}`);
  }
  job.status='completed';
  job.message='Tamamlandı.';
  job.updatedAt=Date.now();
  await dbPut('jobs', job);
  return true;
}

async function processJuzAudioJob(job, stepLimit=10){
  let steps=0;
  const reciter=job.reciter;
  const juz=job.juz;
  const cacheName=juzAudioCacheName(juz, reciter);
  const cache=await caches.open(cacheName);
  let juzData;
  try{ juzData=(await fetchJSON(`${API}/juz/${juz}/${reciter}`)).data; }
  catch{ job.status='paused'; job.message='Ağ hatası. Duraklatıldı.'; job.updatedAt=Date.now(); await dbPut('jobs', job); return steps>0; }
  const ayahs=juzData?.ayahs||[];
  if (!job.progress.totalAyahs) job.progress.totalAyahs=ayahs.length;
  let start=job.progress.ayahIndex||0;
  for (let i=start; i<ayahs.length; i++){
    const fresh=await dbGet('jobs', job.id);
    if (!fresh || fresh.status!=='running') return steps>0;
    const url=ayahs[i].audio;
    if (url){
      try{
        const existing=await cache.match(url);
        if (!existing){
          const r=await fetchForCache(url);
          if (canCacheResponse(r)){
            const cl=r.headers?.get?.('content-length');
            if (cl) job.progress.bytesDone=(job.progress.bytesDone||0)+Number(cl);
            await cache.put(url, r.clone());
          }
        }
      }catch{}
    }
    job.progress.ayahIndex=i+1;
    job.progress.doneAyahs=(job.progress.doneAyahs||0)+1;
    job.message=`İndiriliyor… Cüz ${juz}, Ayet ${i+1}/${ayahs.length}`;
    job.updatedAt=Date.now();
    await dbPut('jobs', job);
    steps++;
    if (steps>=stepLimit) return true;
  }
  job.status='completed';
  job.message=`Cüz ${juz} tamamlandı.`;
  job.updatedAt=Date.now();
  await dbPut('jobs', job);
  await dbDelete('sizeCache', `audio:${cacheName}`);
  return true;
}

async function clearAllAudioForReciter(){
  const reciter=state.audioEdition;
  if (!confirm(`Seçili kâri (${reciter}) için tüm offline ses paketleri silinsin mi?`)) return;
  const prefix=bulkAudioCachePrefix(reciter);
  const keys=(await caches.keys()).filter(k=>k.startsWith(prefix) || k.startsWith(`quran-offline-${reciter}-j`));
  await Promise.all(keys.map(k=>caches.delete(k)));
  const sc=await dbGetAll('sizeCache');
  await Promise.all(sc.filter(x=>(x.key||'').startsWith('audio:') && x.key.includes(reciter)).map(x=>dbDelete('sizeCache', x.key)));
  alert('Seçili kâri için offline ses paketleri silindi.');
}

async function clearJuzAudio(juz){
  const cn=juzAudioCacheName(juz, state.audioEdition);
  await caches.delete(cn);
  await dbDelete('sizeCache', `audio:${cn}`);
  alert(`Cüz ${juz} için offline ses paketi silindi.`);
  await syncJuzAudioButtons();
}

// Network auto pause
function setupNetworkListeners(){
  window.addEventListener('offline', async ()=>{
    state.lastNetworkWasOffline=true;
    store.set('lastNetworkWasOffline', true);
    await pauseAllRunningJobs('Bağlantı yok. Duraklatıldı.');
  });
  window.addEventListener('online', async ()=>{
    const wasOffline=!!state.lastNetworkWasOffline;
    state.lastNetworkWasOffline=false;
    store.set('lastNetworkWasOffline', false);
    if (wasOffline && state.autoResumeJobs){
      if (!warnIfNotWifi()) return;
      await startNextJobIfIdle();
    }
  });
}

async function pauseAllRunningJobs(message){
  const jobs=await dbGetAll('jobs');
  let any=false;
  for (const j of jobs){
    if (j.status==='running'){
      j.status='paused';
      j.updatedAt=Date.now();
      j.message=message||'Duraklatıldı.';
      await dbPut('jobs', j);
      any=true;
    }
  }
  if (any){
    await syncBulkAudioButtons();
    await syncJuzAudioButtons();
    await renderJobList();
    await updateAllJuzSummary();
  }
}

// Indicators
async function updateOfflineIndicators(){
  const hasAudio=('caches' in window) ? (await caches.keys()).includes(audioCacheName()) : false;
  const pack=await dbGet('textPacks', textPackId(state.currentSurah));
  const hasText=!!(pack?.arabicAyahs?.length);
  el.packWarning.hidden = hasText;
  if (hasAudio || hasText){
    el.offlineBadge.hidden=false;
    el.offlineBadge.textContent=`Offline hazır: ${hasText?'Okuma':''}${hasText&&hasAudio?' + ':''}${hasAudio?'Ses':''}`;
  } else {
    el.offlineBadge.hidden=true;
    el.offlineBadge.textContent='';
  }
}

async function openOfflineManager(){
  await populateTextPackFilter();
  await renderOfflineLists();
  await refreshSizeSummary(false);
  await refreshQuotaSummary(false);
  await renderJobList();
  await updateAllJuzSummary();
  // show last debug
  const dbg=await dbGet('kv', `lastAudioDl:${location.origin}`);
  if (dbg?.value && el.debugWarn){
    el.debugWarn.hidden=false;
    el.debugWarn.textContent = `🧪 Son ses indirme: cache=${dbg.value.cache} ok=${dbg.value.ok}/${dbg.value.total} kayıt=${dbg.value.entryCount ?? '?'} hata=${dbg.value.fail} ${dbg.value.lastErr?('• '+dbg.value.lastErr):''}`;
  }
  el.offDialog.showModal();
}

async function populateTextPackFilter(){
  const packs=await dbGetAll('textPacks');
  const editions=[...new Set(packs.map(p=>p.translationEdition).filter(Boolean))].sort();
  const opts=[{v:'all',t:'Tümü'},{v:'current',t:`Sadece seçili meal (${state.translationEdition})`}].concat(editions.map(ed=>({v:ed,t:ed})));
  el.textPackFilter.innerHTML=opts.map(o=>`<option value="${escapeHTML(o.v)}">${escapeHTML(o.t)}</option>`).join('');
  if (!opts.some(o=>o.v===state.textPackFilter)) state.textPackFilter='all';
  el.textPackFilter.value=state.textPackFilter;
}

function groupAudioKeys(keys){
  const surah=[], juz=[], other=[];
  for (const k of keys){
    if (/^quran-offline-.+-s\d+$/.test(k)) surah.push(k);
    else if (/^quran-offline-.+-j\d+$/.test(k)) juz.push(k);
    else other.push(k);
  }
  return {surah,juz,other};
}

function parseAudioKey(k){
  const m1=/^quran-offline-(.+)-s(\d+)$/.exec(k);
  if (m1) return {label:`Sure ${m1[2]} • ${m1[1]}`};
  const m2=/^quran-offline-(.+)-j(\d+)$/.exec(k);
  if (m2) return {label:`Cüz ${m2[2]} • ${m2[1]}`};
  return {label:k};
}

async function renderOfflineLists(){
  if (!('caches' in window)){
    el.offAudioList.innerHTML = `<div class="ayah"><div class="tr">Bu bağlamda Cache API yok (HTTPS/PWA gerekli).</div></div>`;
  } else {
    const audioKeys=(await caches.keys()).filter(k=>k.startsWith('quran-offline-'));
    if (!audioKeys.length){
      el.offAudioList.innerHTML=`<div class="ayah"><div class="tr">Offline ses paketi yok.</div></div>`;
    } else {
      const sizeEntries=await dbGetAll('sizeCache');
      const sizeMap=new Map(sizeEntries.filter(e=>(e.key||'').startsWith('audio:')).map(e=>[e.key.replace('audio:',''), e.bytes]));
      const {surah,juz,other}=groupAudioKeys(audioKeys);
      const renderGroup=(title, keys)=>{
        if (!keys.length) return '';
        return `<div class="ayah"><div class="tr muted"><b>${escapeHTML(title)}</b></div></div>` + keys.map(k=>{
          const parsed=parseAudioKey(k);
          const sz=sizeMap.get(k);
          return `<div class="ayah"><div class="ayahHead"><div class="badge">${escapeHTML(k)}</div><div class="tools"><span class="muted tiny">${sz!=null?formatBytes(sz):'Boyut: ?'}</span><button class="btn small ghost" data-auddel="${escapeHTML(k)}">Sil</button></div></div><div class="tr muted">${escapeHTML(parsed.label)}</div></div>`;
        }).join('');
      };
      el.offAudioList.innerHTML = renderGroup('Sure Ses Paketleri', surah) + renderGroup('Cüz Ses Paketleri', juz) + renderGroup('Diğer', other);
      el.offAudioList.querySelectorAll('[data-auddel]').forEach(btn=>btn.addEventListener('click', async()=>{
        const k=btn.dataset.auddel;
        await caches.delete(k);
        await dbDelete('sizeCache', `audio:${k}`);
        await renderOfflineLists();
        await refreshSizeSummary(false);
        await updateOfflineIndicators();
      }));
    }
  }

  let packs=(await dbGetAll('textPacks')).sort((a,b)=>(b.ts||0)-(a.ts||0));
  const filter=state.textPackFilter;
  if (filter==='current') packs=packs.filter(p=>p.translationEdition===state.translationEdition);
  else if (filter!=='all') packs=packs.filter(p=>p.translationEdition===filter);
  if (!packs.length){
    el.offTextList.innerHTML=`<div class="ayah"><div class="tr">Offline okuma paketi yok (filtreye göre).</div></div>`;
  } else {
    el.offTextList.innerHTML=packs.map(p=>`<div class="ayah"><div class="ayahHead"><div class="badge">Sure ${p.surah} • ${escapeHTML(p.translationEdition)}</div><div class="tools"><span class="muted tiny">${p.bytesApprox?formatBytes(p.bytesApprox):'Boyut: ?'}</span><button class="btn small ghost" data-txtdel="${escapeHTML(p.id)}">Sil</button></div></div><div class="tr muted">${escapeHTML(p.id)}</div></div>`).join('');
    el.offTextList.querySelectorAll('[data-txtdel]').forEach(btn=>btn.addEventListener('click', async()=>{
      await dbDelete('textPacks', btn.dataset.txtdel);
      await populateTextPackFilter();
      await renderOfflineLists();
      await refreshSizeSummary(false);
      await updateOfflineIndicators();
    }));
  }
}

async function updateAllJuzSummary(){
  const reciter=state.audioEdition;
  const jobs=(await dbGetAll('jobs')).filter(j=>j.type==='juzAudio' && j.reciter===reciter);
  if (!jobs.length){ el.allJuzSummary.hidden=true; el.allJuzSummary.textContent=''; return; }
  const completed=jobs.filter(j=>j.status==='completed').length;
  const running=jobs.filter(j=>j.status==='running').length;
  const paused=jobs.filter(j=>j.status==='paused').length;
  const cancelled=jobs.filter(j=>j.status==='cancelled').length;
  el.allJuzSummary.hidden=false;
  el.allJuzSummary.textContent=`Cüz işleri: ${completed}/30 tamamlandı • ${running} çalışıyor • ${paused} bekliyor • ${cancelled} iptal`;
}

function computeEtaAndSpeed(job){
  const startedAt=job.progress?.startedAt || job.createdAt || Date.now();
  const dt=Math.max(1,(Date.now()-startedAt)/1000);
  const done=job.progress?.doneAyahs||0;
  const total=job.progress?.totalAyahs||0;
  const bdone=job.progress?.bytesDone||0;
  const bytesPerSec=bdone/dt;
  const perSec=done/dt;
  const remain=Math.max(0,total-done);
  const etaSec = perSec>0 ? (remain/perSec) : null;
  return {bytesPerSec,etaSec,done,total};
}

function fmtEta(sec){
  if (sec==null || !isFinite(sec)) return 'ETA: ?';
  sec=Math.max(0,Math.round(sec));
  const h=Math.floor(sec/3600); sec%=3600;
  const m=Math.floor(sec/60); const s=sec%60;
  if (h>0) return `ETA: ${h}sa ${m}dk`;
  if (m>0) return `ETA: ${m}dk ${s}sn`;
  return `ETA: ${s}sn`;
}

async function syncBulkAudioButtons(){
  const job=await dbGet('jobs', bulkAudioJobId(state.audioEdition));
  el.btnPauseAllAudio.disabled=true;
  el.btnResumeAllAudio.disabled=true;
  el.btnCancelAllAudio.disabled=true;
  if (!job){ el.allAudStatus.hidden=true; return; }
  el.allAudStatus.hidden=false;
  const {bytesPerSec,etaSec,done,total}=computeEtaAndSpeed(job);
  const pct=total?Math.round((done/total)*100):0;
  el.allAudBar.style.width=`${pct}%`;
  el.allAudText.textContent=`${job.message||job.status} • ${pct}% • ${formatBytes(bytesPerSec)}/sn • ${fmtEta(etaSec)} • Sure ${job.progress?.surah||1}/114`;
  if (job.status==='running'){ el.btnPauseAllAudio.disabled=false; el.btnCancelAllAudio.disabled=false; }
  else if (job.status==='paused'){ el.btnResumeAllAudio.disabled=false; el.btnCancelAllAudio.disabled=false; }
  else if (job.status==='cancelled'){ el.btnResumeAllAudio.disabled=false; }
}

async function syncJuzAudioButtons(){
  const id=juzAudioJobId(state.selectedJuz, state.audioEdition);
  const job=await dbGet('jobs', id);
  el.btnPauseJuzAudio.disabled=true;
  el.btnResumeJuzAudio.disabled=true;
  el.btnCancelJuzAudio.disabled=true;
  if (!job){ el.juzAudStatus.hidden=true; return; }
  el.juzAudStatus.hidden=false;
  const {bytesPerSec,etaSec,done,total}=computeEtaAndSpeed(job);
  const pct=total?Math.round((done/total)*100):0;
  el.juzAudBar.style.width=`${pct}%`;
  el.juzAudText.textContent=`${job.message||job.status} • ${pct}% • ${formatBytes(bytesPerSec)}/sn • ${fmtEta(etaSec)} • Cüz ${state.selectedJuz}`;
  if (job.status==='running'){ el.btnPauseJuzAudio.disabled=false; el.btnCancelJuzAudio.disabled=false; }
  else if (job.status==='paused'){ el.btnResumeJuzAudio.disabled=false; el.btnCancelJuzAudio.disabled=false; }
  else if (job.status==='cancelled'){ el.btnResumeJuzAudio.disabled=false; }
}

async function renderJobList(){
  const jobs=(await dbGetAll('jobs')).sort((a,b)=>(a.priority??999)-(b.priority??999) || (b.updatedAt||0)-(a.updatedAt||0));
  if (!jobs.length){ el.jobList.innerHTML=`<div class="ayah"><div class="tr">Kuyruk boş.</div></div>`; return; }
  el.jobList.innerHTML = jobs.map(j=>{
    const {bytesPerSec,etaSec,done,total}=computeEtaAndSpeed(j);
    const pct=total?Math.round((done/total)*100):0;
    const badge=`${j.type} • ${j.status} • ${pct}% • p=${j.priority??'?'} `;
    const extra=`${formatBytes(bytesPerSec)}/sn • ${fmtEta(etaSec)}`;
    return `<div class="ayah"><div class="ayahHead"><div class="badge">${escapeHTML(badge)}</div><div class="tools"><span class="muted tiny">${escapeHTML(extra)}</span><button class="btn small" data-act="resume" data-id="${escapeHTML(j.id)}">▶</button><button class="btn small ghost" data-act="pause" data-id="${escapeHTML(j.id)}">⏸</button><button class="btn small ghost" data-act="cancel" data-id="${escapeHTML(j.id)}">✋</button><button class="btn small ghost" data-act="up" data-id="${escapeHTML(j.id)}">⬆</button><button class="btn small ghost" data-act="down" data-id="${escapeHTML(j.id)}">⬇</button><button class="btn small ghost" data-act="delete" data-id="${escapeHTML(j.id)}">🗑</button></div></div><div class="tr muted">${escapeHTML(j.message||'')}</div></div>`;
  }).join('');
  el.jobList.querySelectorAll('[data-act]').forEach(btn=>btn.addEventListener('click', async()=>{
    const act=btn.dataset.act, id=btn.dataset.id;
    if (act==='resume') await resumeJob(id);
    if (act==='pause') await pauseJob(id);
    if (act==='cancel') await cancelJob(id);
    if (act==='up') await bumpJobPriority(id, -1);
    if (act==='down') await bumpJobPriority(id, +1);
    if (act==='delete') await deleteJob(id);
    await renderJobList();
    await syncBulkAudioButtons();
    await syncJuzAudioButtons();
    await updateAllJuzSummary();
  }));
}

async function refreshSizeSummary(force){
  const key=`summary:${state.arabicEdition}`;
  const cached=await dbGet('sizeCache', key);
  if (cached && !force){ el.sizeSummary.hidden=false; el.sizeSummary.textContent=cached.text; return; }
  if (state.sizeCalcRunning) return;
  state.sizeCalcRunning=true;
  el.sizeSummary.hidden=false;
  el.sizeSummary.textContent='Boyutlar hesaplanıyor…';
  const audioKeys=('caches' in window) ? (await caches.keys()).filter(k=>k.startsWith('quran-offline-')) : [];
  let audioTotal=0;
  for (const k of audioKeys){
    let entry=await dbGet('sizeCache', `audio:${k}`);
    if (!entry || force){
      const bytes=await estimateCacheSizeBytes(k);
      await dbPut('sizeCache', { key:`audio:${k}`, bytes, ts:Date.now() });
      entry={bytes};
    }
    audioTotal += entry.bytes||0;
  }
  const packs=await dbGetAll('textPacks');
  let textTotal=0;
  for (const p of packs) textTotal += (p.bytesApprox || approximateJsonBytes({arabicAyahs:p.arabicAyahs, trAyahs:p.trAyahs}));
  const msg=`Toplam yaklaşık depolama: Okuma ${formatBytes(textTotal)} • Ses ${formatBytes(audioTotal)} • Genel ${formatBytes(textTotal+audioTotal)}`;
  await dbPut('sizeCache', { key, text: msg, ts: Date.now() });
  el.sizeSummary.textContent=msg;
  state.sizeCalcRunning=false;
}

async function estimateCacheSizeBytes(cacheName){
  try{
    const cache=await caches.open(cacheName);
    const reqs=await cache.keys();
    let sum=0;
    for (let i=0;i<reqs.length;i++){
      const res=await cache.match(reqs[i]);
      if (!res) continue;
      const cl=res.headers?.get?.('content-length');
      if (cl) sum+=Number(cl);
      else {
        try{ const buf=await res.clone().arrayBuffer(); sum+=buf.byteLength; }catch{}
      }
      if (i%10===0) await new Promise(r=>setTimeout(r,0));
    }
    return sum;
  } catch { return 0; }
}

function approximateJsonBytes(obj){
  try{ return JSON.stringify(obj).length*2; }catch{ return 0; }
}

function formatBytes(bytes){
  if (bytes==null) return '?';
  const units=['B','KB','MB','GB'];
  let b=bytes, u=0;
  while (b>=1024 && u<units.length-1){ b/=1024; u++; }
  return `${b.toFixed(u===0?0:1)} ${units[u]}`;
}

async function refreshQuotaSummary(force){
  const key='quota:default';
  const cached=await dbGet('quotaCache', key);
  if (cached && !force){ el.quotaSummary.hidden=false; el.quotaSummary.textContent=cached.text; return; }
  if (!navigator.storage || !navigator.storage.estimate){
    const msg='Depolama kotası: Bu tarayıcı estimate API’yi desteklemiyor.';
    el.quotaSummary.hidden=false;
    el.quotaSummary.textContent=msg;
    await dbPut('quotaCache', { key, text: msg, ts: Date.now() });
    return;
  }
  try{
    const est=await navigator.storage.estimate();
    const usage=est.usage ?? null;
    const quota=est.quota ?? null;
    const free=(usage!=null && quota!=null) ? Math.max(0, quota-usage) : null;
    const msg=`Tarayıcı depolama: Kullanılan ${formatBytes(usage)} • Kota ${formatBytes(quota)} • Boş ${formatBytes(free)}`;
    el.quotaSummary.hidden=false;
    el.quotaSummary.textContent=msg;
    await dbPut('quotaCache', { key, text: msg, ts: Date.now() });
  } catch {
    const msg='Depolama kotası: Hesaplanamadı.';
    el.quotaSummary.hidden=false;
    el.quotaSummary.textContent=msg;
    await dbPut('quotaCache', { key, text: msg, ts: Date.now() });
  }
}

// Global search cache (same)
async function ensureGlobalSearchCache(){
  const edition=state.translationEdition;
  const cached=await dbGet('searchCache', edition);
  if (cached?.items?.length) return cached.items;
  el.dlQDialog.showModal();
  el.qBar.style.width='0%';
  el.qText.textContent='İndiriliyor…';
  const res=await fetchJSON(`${API}/quran/${edition}`);
  const surahs=res.data?.surahs||[];
  const items=[];
  let total=0;
  for (const s of surahs) total += (s.ayahs||[]).length;
  let done=0;
  for (const s of surahs){
    for (const a of (s.ayahs||[])){
      items.push({ surah:s.number, ayah:a.numberInSurah, text:a.text });
      done++;
      if (done%350===0){
        const pct=Math.round((done/total)*100);
        el.qBar.style.width=`${pct}%`;
        el.qText.textContent=`Kaydediliyor… ${done}/${total}`;
        await new Promise(r=>setTimeout(r,0));
      }
    }
  }
  await dbPut('searchCache', { edition, items, ts: Date.now() });
  el.qBar.style.width='100%';
  el.qText.textContent=`Hazır. ${items.length} ayet indekslendi.`;
  setTimeout(()=>{ try{ el.dlQDialog.close(); }catch{} }, 500);
  return items;
}

async function renderGlobalSearch(){
  const q=state.search;
  if (!q){ el.list.innerHTML=''; return; }
  setStatus('Tüm Kur’ân araması…');
  const items=await ensureGlobalSearchCache();
  const matches=[];
  const ql=q.toLowerCase();
  for (const it of items){
    if ((it.text||'').toLowerCase().includes(ql)){
      matches.push(it);
      if (matches.length>=120) break;
    }
  }
  setStatus('');
  if (!matches.length){
    el.list.innerHTML=`<div class="ayah"><div class="tr">Sonuç bulunamadı.</div></div>`;
    return;
  }
  el.list.innerHTML = matches.map(m=>`<div class="ayah"><div class="ayahHead"><div class="badge">Sure ${m.surah} • Ayet ${m.ayah}</div><div class="tools"><button class="btn small" data-go="${m.surah}:${m.ayah}">Git</button></div></div><div class="tr">${escapeHTML(m.text)}</div></div>`).join('');
  el.list.querySelectorAll('[data-go]').forEach(btn=>btn.addEventListener('click', async()=>{
    const id=btn.dataset.go;
    await goToAyahId(id, true);
    state.searchScope='surah';
    el.searchScope.value='surah';
    store.set('searchScope','surah');
    state.search='';
    el.searchInput.value='';
    await render();
  }));
}
