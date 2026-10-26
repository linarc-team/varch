const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const toast=$('#toast'),panel=$('#panel-backdrop'),panelContent=$('#panel-content'),panelTitle=$('#panel-title'),
tabbar=$('.tabbar'),plusTab=$('.plus-tab'),searchInput=$('#search-input'),addressInput=$('#address-input');
let toastTimer,tabCount=1,visitHistory=[],visitIndex=-1;
let settingsLoadTimer;
let tabDrag=null,suppressTabClickUntil=0;
const tabStates=new WeakMap();
function getTabState(tab){
  if(!tab)return{};
  if(!tabStates.has(tab))tabStates.set(tab,{view:tab.dataset.view||'home',search:'',address:'',history:[],visitIndex:-1,city:'',weather:null,results:[],reader:null,searchRequest:0});
  return tabStates.get(tab);
}

const saved={accent:'violet',motion:true,compact:false,language:'en'};
let lastWeather=null;
try{localStorage.removeItem('varch-settings');localStorage.removeItem('varch-motion-restored-v1')}catch{}

const copy={
  en:{back:'Back',forward:'Forward',reload:'Reload',privacy:'Privacy settings',address:'Enter an address or search...',addressLabel:'Address or search',home:'Home',dashboard:'Dashboard',search:'Search or enter an address...',settings:'Settings',close:'Close settings',loading:'Loading your privacy settings…',privacyHeading:'Privacy protections',privacyDescription:'Preferences apply only to this session and reset when Varch closes.',browserLanguage:'Browser language',languageHint:'Choose the language used across Varch.',torRequired:'Tor is mandatory for anonymous browsing',torNotice:'Search, interactive pages, and weather requests use the Tor transport built into the app. If Tor cannot connect, the request stops and no direct connection is made.',protectionLimit:'Varch does not request your location or save browsing history. In the Windows app, web pages can run JavaScript in a browser view routed through Tor. Camera and microphone access are always denied. In other environments, pages use the text-only reader.',trackers:'Block trackers',trackersHint:'Blocks known tracking domains',thirdParty:'Block third-party cookies',thirdPartyHint:'Prevents cookies from external domains',fingerprint:'Anti-fingerprinting protection',isolate:'Isolate site data',isolateHint:'Separate cookies and storage for each site',webrtc:'WebRTC leak protection',https:'Prefer secure HTTPS connections',clear:'Clear data on close',tab:'Tab',closeTab:'Close tab',newTab:'New tab',newTabReady:'New tab is ready to search.',refreshed:'Page refreshed.',dashTitle:'Your world, in focus.',dashSubtitle:'Weather and useful information, for the place you choose.',cityPlaceholder:'Enter a city…',cityLabel:'Enter a city to check the weather',weatherSearch:'Search',currentWeather:'Current weather',chooseCity:'Choose a city',enterCity:'Enter a city to see the forecast',noAutoLocation:'Your location is never detected automatically',weatherCredit:'Forecast by Open-Meteo',privacyCard:'You choose the location',privacyCopy:'No GPS or IP-based location lookup. Enter a city to see its weather.',conditions:'Current conditions',waitingCity:'Waiting for a city',feels:'Feels like',humidity:'Humidity',wind:'Wind',precipitation:'Precipitation',hours:'Next hours',localForecast:'Local forecast',hoursEmpty:'Hourly weather will appear here after you search for a city.',days:'Next days',fiveDays:'5-day forecast',daysEmpty:'Enter a city to load the forecast.',searching:'Searching forecast…',loadingHours:'Loading hourly forecast…',loadingDays:'Loading the next days…',updated:'Updated at',notUpdated:'Could not update',noCity:'I couldn’t find that city. Try adding a state or country.',fetchError:'Could not load the forecast right now. Please try again.',retry:'Check the city name and try again.',weatherConditions:['Clear sky','Mostly clear','Partly cloudy','Overcast','Fog','Drizzle','Rain','Snow','Thunderstorms','Variable conditions'],today:'Today',now:'Now'},
  'pt-BR':{back:'Voltar',forward:'Avançar',reload:'Recarregar',privacy:'Configurações de privacidade',address:'Digite um endereço ou pesquise...',addressLabel:'Endereço ou pesquisa',home:'Início',dashboard:'Dashboard',search:'Pesquise ou digite um endereço...',settings:'Configurações',close:'Fechar configurações',loading:'Carregando suas configurações de privacidade…',privacyHeading:'Proteções de privacidade',privacyDescription:'As preferências valem apenas nesta sessão e são redefinidas ao fechar o Varch.',browserLanguage:'Idioma do navegador',languageHint:'Escolha o idioma usado em toda a Varch.',torRequired:'Tor é obrigatório para navegação anônima',torNotice:'Buscas, páginas interativas e consultas de clima usam o transporte Tor integrado ao app. Se o Tor não conectar, a solicitação é interrompida e nenhuma conexão direta é feita.',protectionLimit:'O Varch não solicita sua localização nem salva o histórico de navegação. No app para Windows, páginas podem executar JavaScript em uma janela de navegador roteada pelo Tor. O acesso à câmera e ao microfone é sempre negado. Em outros ambientes, as páginas usam o leitor de texto.',trackers:'Bloquear rastreadores',trackersHint:'Bloqueia domínios conhecidos por rastreamento',thirdParty:'Bloquear cookies de terceiros',thirdPartyHint:'Impede cookies de domínios externos',fingerprint:'Proteção contra identificação',isolate:'Isolar dados entre sites',isolateHint:'Separa cookies e armazenamento por site',webrtc:'Proteção contra vazamentos WebRTC',https:'Preferir conexões HTTPS seguras',clear:'Apagar dados ao fechar',tab:'Guia',closeTab:'Fechar guia',newTab:'Nova guia',newTabReady:'Nova guia pronta para pesquisar.',refreshed:'Página atualizada.',dashTitle:'Seu mundo, em foco.',dashSubtitle:'Clima e informações úteis, no lugar que você escolher.',cityPlaceholder:'Digite uma cidade…',cityLabel:'Digite uma cidade para consultar o clima',weatherSearch:'Buscar',currentWeather:'Clima agora',chooseCity:'Escolha sua cidade',enterCity:'Digite uma cidade para ver a previsão',noAutoLocation:'Sua localização nunca é detectada automaticamente',weatherCredit:'Previsão por Open-Meteo',privacyCard:'Você escolhe o local',privacyCopy:'Sem GPS ou localização estimada por IP. Digite uma cidade para ver o clima.',conditions:'Condições atuais',waitingCity:'Aguardando uma cidade',feels:'Sensação térmica',humidity:'Umidade',wind:'Vento',precipitation:'Precipitação',hours:'Próximas horas',localForecast:'Previsão local',hoursEmpty:'A previsão por hora aparecerá aqui após buscar uma cidade.',days:'Próximos dias',fiveDays:'Previsão para 5 dias',daysEmpty:'Informe uma cidade para carregar a previsão.',searching:'Buscando previsão…',loadingHours:'Carregando previsão por hora…',loadingDays:'Carregando próximos dias…',updated:'Atualizado às',notUpdated:'Não foi possível atualizar',noCity:'Não encontrei essa cidade. Tente informar também o estado ou o país.',fetchError:'Não foi possível carregar a previsão agora. Tente novamente.',retry:'Confira o nome da cidade e tente novamente.',weatherConditions:['Ensolarado','Predominantemente limpo','Parcialmente nublado','Nublado','Neblina','Garoa','Chuva','Neve','Trovoadas','Condição variável'],today:'Hoje',now:'Agora'}
};
copy.en.privacy='About privacy';copy['pt-BR'].privacy='Sobre a privacidade';
copy.en.settings='About privacy';copy['pt-BR'].settings='Sobre a privacidade';
copy.en.close='Close privacy information';copy['pt-BR'].close='Fechar informações de privacidade';
copy.en.loading='Preparing the privacy overview…';copy['pt-BR'].loading='Preparando o resumo de privacidade…';
function applyLanguage(language=saved.language){
  saved.language=copy[language]?language:'en';const t=copy[saved.language];
  document.documentElement.lang=saved.language;document.title=saved.language==='en'?'Varch':'Varch';
  const attr=(selector,name,value)=>{const element=$(selector);if(element)element.setAttribute(name,value)};
  for(const [id,value] of [['back',t.back],['forward',t.forward],['reload',t.reload],['privacy',t.privacy]]){attr(`#${id}`,'aria-label',value);attr(`#${id}`,'title',value)}
  $('#address-input').placeholder=t.address;attr('#address-input','aria-label',t.addressLabel);
  attr('[data-p="home"]','aria-label',t.home);attr('[data-p="home"]','title',t.home);attr('[data-p="dashboard"]','aria-label',t.dashboard);attr('[data-p="dashboard"]','title',t.dashboard);
  attr('.plus-tab','aria-label',t.newTab);attr('.plus-tab','title',t.newTab);
  $('#search-input').placeholder=t.search;attr('#search-input','aria-label',t.search);
  $$('.tab').forEach((tab,index)=>{tab.querySelector('span').textContent=`${t.tab} ${index+1}`;attrIn(tab.querySelector('button'),'aria-label',`${t.closeTab} ${index+1}`);attrIn(tab.querySelector('button'),'title',t.closeTab)});
  const set=(selector,value)=>{const element=$(selector);if(element)element.textContent=value};
  set('#panel-title',t.settings);attr('#panel-close','aria-label',t.close);
  set('#dash-title',t.dashTitle);set('#dash-subtitle',t.dashSubtitle);$('#city-input').placeholder=t.cityPlaceholder;attr('#city-input','aria-label',t.cityLabel);set('#city-submit',t.weatherSearch);
  set('#weather-label',t.currentWeather);set('#weather-city',t.chooseCity);set('#weather-condition',t.enterCity);set('#weather-feels',t.noAutoLocation);set('#weather-credit',t.weatherCredit);
  set('#privacy-card-title',t.privacyCard);set('#privacy-card-copy',t.privacyCopy);set('#conditions-title',t.conditions);set('#weather-updated',t.waitingCity);
  set('#feels-label',t.feels);set('#humidity-label',t.humidity);set('#wind-label',t.wind);set('#rain-label',t.precipitation);
  set('#hours-title',t.hours);set('#hours-caption',t.localForecast);set('#hours-empty',t.hoursEmpty);set('#days-title',t.days);set('#days-caption',t.fiveDays);set('#days-empty',t.daysEmpty);
  if(lastWeather)renderWeather(lastWeather.data,lastWeather.place);
}
function attrIn(element,name,value){if(element)element.setAttribute(name,value)}

function announce(msg){toast.textContent=msg;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2200)}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function isAddress(value){return /^https:\/\//i.test(value)||/^[\w-]+(\.[\w-]+)+([/?#].*)?$/i.test(value)}
function normalizeAddress(value){try{const url=new URL(/^https:\/\//i.test(value)?value:`https://${value}`);if(url.protocol!=='https:'||!url.hostname||url.username||url.password)return null;return url.href}catch{return null}}
function setSearchView(view){$('main').classList.toggle('search-open',view!=='home');$('main').classList.toggle('search-fullscreen',view==='results');const keepBrowser=view==='reader'&&getTabState($('.tab.active')).reader?.browser;$('main').classList.toggle('browser-view',Boolean(keepBrowser));$('#search-results').hidden=view!=='results';$('#reader-page').hidden=view!=='reader';if(!keepBrowser)window.__TAURI__?.core?.invoke('tor_browser_hide').catch(()=>{})}
function showSearchState(tab,view){if($('.tab.active')!==tab)return;const state=getTabState(tab);setSearchView(view);if(view==='results')renderResults(state);if(view==='reader'&&state.reader)renderReader(state.reader)}
function renderSearchLoading(){
  const list=$('#search-list');
  list.replaceChildren();
  const loading=document.createElement('div');
  loading.className='search-loading-state';
  loading.setAttribute('role','status');
  const spinner=document.createElement('span');
  spinner.className='search-loader';
  spinner.setAttribute('aria-hidden','true');
  const label=document.createElement('span');
  label.textContent=saved.language==='en'?'Searching privately…':'Pesquisando…';
  loading.append(spinner,label);
  list.append(loading);
}
function createErrorCard(title,message){
  const card=document.createElement('section');card.className='request-error-card';
  const emblem=document.createElement('div');emblem.className='error-mark';emblem.setAttribute('aria-hidden','true');emblem.textContent='!';
  const heading=document.createElement('h3');heading.textContent=title;
  const detail=document.createElement('p');detail.textContent=message;
  card.append(emblem,heading,detail);
  return card;
}
function renderResults(state){
  const list=$('#search-list');
  list.replaceChildren();$('#search-heading').textContent=state.search||'';$('#search-mode').textContent=state.searchMode||'';$('#search-warning').hidden=!state.warning;$('#search-warning').textContent=state.warning||'';
  list.classList.toggle('has-error',Boolean(state.searchError));
  if(state.searchError){
    const card=createErrorCard(saved.language==='en'?'Search could not be completed':'Não foi possível concluir a busca',state.searchError);
    list.append(card);return;
  }
  if(!state.results?.length){const empty=document.createElement('p');empty.className='search-empty';empty.textContent=saved.language==='en'?'No results were found.':'Nenhum resultado encontrado.';list.append(empty);return}
  for(const item of state.results){const article=document.createElement('article');article.className='search-result';const link=document.createElement('button');link.type='button';link.className='result-title';link.textContent=item.title;link.addEventListener('click',()=>openPage(item.url,$('.tab.active')));const url=document.createElement('div');url.className='result-url';url.textContent=item.url;const snippet=document.createElement('p');snippet.className='result-snippet';snippet.textContent=item.snippet||'';article.append(link,url,snippet);list.append(article)}
}
function renderReader(page){
  const section=$('#reader-page'),content=$('#reader-content');
  $('#reader-title').textContent=page.title||page.url;$('#reader-url').textContent=page.url;
  $('#reader-warning').hidden=true;$('#reader-warning').textContent='';
  section.classList.toggle('reader-error',Boolean(page.error));content.replaceChildren();
  content.hidden=false;$('main').classList.toggle('browser-view',Boolean(page.browser));
  if(page.browser){const rect=$('main').getBoundingClientRect();window.__TAURI__?.core?.invoke('tor_open_interactive_page',{url:page.url,x:rect.x,y:rect.y,width:rect.width,height:rect.height}).catch(error=>{if(getTabState($('.tab.active')).reader!==page)return;page.error=true;page.browser=false;page.content=error.message||'Page unavailable';renderReader(page);saveTabState($('.tab.active'))})}
  else if(page.error){const card=createErrorCard(saved.language==='en'?'Page could not be opened':'Não foi possível abrir a página',page.content||'');content.append(card)}else content.textContent=page.content||''
}
async function runSearch(value,tab=$('.tab.active')){const query=value.trim();if(!query||!tab)return;const state=getTabState(tab);state.search=query;state.address=query;state.reader=null;state.searchError=null;state.results=[];state.warning='';state.searchMode=saved.language==='en'?'CONNECTING THROUGH TOR':'CONECTANDO PELO TOR';searchInput.value=query;addressInput.value=query;const request=++state.searchRequest;showSearchState(tab,'results');if($('.tab.active')===tab){$('#search-heading').textContent=query;$('#search-mode').textContent=state.searchMode;renderSearchLoading();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))}try{if(!window.__TAURI__?.core?.invoke)throw new Error(saved.language==='en'?'Tor browsing is available in the installed Varch app.':'A navegação pelo Tor está disponível no app Varch instalado.');const response=await window.__TAURI__.core.invoke('tor_search',{query});if(state.searchRequest!==request)return;state.results=Array.isArray(response.results)?response.results:[];state.searchMode=saved.language==='en'?'DUCKDUCKGO OVER TOR':'DUCKDUCKGO PELO TOR'}catch(error){if(state.searchRequest!==request)return;state.searchError=error.message||'Tor search unavailable';state.searchMode=saved.language==='en'?'TOR UNAVAILABLE':'TOR INDISPONÍVEL'}if($('.tab.active')===tab)renderResults(state);saveTabState(tab)}
async function openPage(value,tab=$('.tab.active')){const url=normalizeAddress(value);if(!url){announce(saved.language==='en'?'Only public HTTPS pages can be opened.':'Só é possível abrir páginas HTTPS públicas.');return}const state=getTabState(tab);state.address=url;state.search=url;state.reader=null;state.searchRequest++;showSearchState(tab,'reader');if($('.tab.active')===tab){$('#reader-title').textContent=saved.language==='en'?'Connecting through Tor…':'Conectando pelo Tor…';$('#reader-url').textContent=url;$('#reader-content').textContent='';$('#reader-content').hidden=false;$('#reader-warning').hidden=true}try{if(!window.__TAURI__?.core?.invoke)throw new Error(saved.language==='en'?'Tor page reading is available in the installed Varch app.':'A leitura de páginas pelo Tor está disponível no app Varch instalado.');const interactive=await window.__TAURI__.core.invoke('tor_browser_javascript_enabled');const page=interactive?{url,title:url,content:'',browser:true}:await window.__TAURI__.core.invoke('tor_open_page',{url});state.reader=page;if($('.tab.active')===tab)renderReader(page)}catch(error){state.searchError=error.message||'Page unavailable';state.reader={url,title:saved.language==='en'?'Unable to open page':'Não foi possível abrir a página',content:state.searchError,error:true};if($('.tab.active')===tab)renderReader(state.reader)}saveTabState(tab)}
function openVisit(value,tab=$('.tab.active')){return isAddress(value)?openPage(value,tab):runSearch(value,tab)}
function updateHistoryButtons(){const state=getTabState($('.tab.active'));if(state.reader?.browser){$('#back').disabled=false;$('#forward').disabled=false;return}$('#back').disabled=(state.visitIndex??-1)<=0;$('#forward').disabled=(state.visitIndex??-1)<0||(state.visitIndex??-1)>=(state.history||[]).length-1}
function navigate(value){const q=value.trim();if(!q)return;const tab=$('.tab.active'),state=getTabState(tab);state.history.splice(state.visitIndex+1);if(state.history[state.history.length-1]!==q){state.history.push(q);state.visitIndex=state.history.length-1}visitHistory=state.history;visitIndex=state.visitIndex;updateHistoryButtons();openVisit(q,tab)}
$('#address-form').addEventListener('submit',e=>{e.preventDefault();navigate(addressInput.value)});
$('#search-form').addEventListener('submit',e=>{e.preventDefault();navigate(searchInput.value)});
$('#reader-back').addEventListener('click',()=>{const tab=$('.tab.active');getTabState(tab).reader=null;showSearchState(tab,'results')});
$('#privacy').addEventListener('click',renderSettings);


function syncMotion(){
  const animated=$$('.glow');
  animated.forEach(el=>el.getAnimations().forEach(animation=>animation.cancel()));
  if(!saved.motion)return;
  $$('.glow').forEach((glow,index)=>glow.animate([{opacity:.72},{opacity:1}],{duration:5600+index*800,iterations:Infinity,direction:'alternate',easing:'ease-in-out'}));
}
function applySettings(){document.documentElement.dataset.accent=saved.accent;document.body.classList.toggle('no-motion',!saved.motion);document.body.classList.toggle('compact',saved.compact);syncMotion();applyLanguage()}

applySettings();


function openPanel(title,html){clearTimeout(settingsLoadTimer);panelTitle.textContent=title;panelContent.innerHTML=html;panel.hidden=false;const sheet=$('.settings-panel');sheet.getAnimations().forEach(animation=>animation.cancel());if(saved.motion)sheet.animate([{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}],{duration:420,easing:'cubic-bezier(.2,.75,.2,1)'});$('#panel-close').focus()}
function resumeBrowserPage(){const state=getTabState($('.tab.active'));if(state.reader?.browser&&$('.tab.active')?.dataset.view!=='dashboard')renderReader(state.reader)}
function closePanel(){const sheet=$('.settings-panel');if(panel.hidden)return;sheet.getAnimations().forEach(animation=>animation.cancel());if(saved.motion){const animation=sheet.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(10px)'},{opacity:0,transform:'translateY(10px)'}],{duration:520,easing:'cubic-bezier(.2,.75,.2,1)',fill:'forwards'});animation.onfinish=()=>{panel.hidden=true;sheet.style.removeProperty('opacity');sheet.style.removeProperty('transform');resumeBrowserPage()}}else{panel.hidden=true;resumeBrowserPage()}}
function renderSettings(){
  $('main').classList.remove('browser-view');window.__TAURI__?.core?.invoke('tor_browser_hide').catch(()=>{});
  openPanel(copy[saved.language].settings,`<div class="settings-loader-wrap"><span class="settings-loader" aria-hidden="true"></span><span>${copy[saved.language].loading}</span></div>`);
  settingsLoadTimer=window.setTimeout(()=>{if(!panel.hidden)renderSettingsCategory()},520);
}
function renderSettingsCategory(){
  panelContent.getAnimations().forEach(animation=>animation.cancel());
  const en=saved.language==='en';
  const nativeTransport=Boolean(window.__TAURI__?.core?.invoke);
  panelTitle.textContent=en?'About privacy':'Sobre a privacidade';
  const text=en?{
    profile:'PRIVACY OVERVIEW',levelHeading:'Anonymity level',level:nativeTransport?'Tor transport':'Tor unavailable',levelDetail:nativeTransport?'Search, page reading, and weather requests use Varch’s Tor transport. If Tor cannot connect, the request stops without a direct fallback.':'Tor transport is unavailable in this environment. External requests stop and are never sent directly.',levelLimit:'The search provider can still read and process the words you search for.',vpnTitle:'VPN recommendation',vpnBody:'For an additional privacy layer, we recommend using a trusted VPN alongside Varch.',
    benefits:'What Varch does for you',benefitsIntro:'Protections built into the app and applied automatically to its requests.',
    torTitle:'Routes requests through Tor',torBody:nativeTransport?'Search, interactive pages, and weather requests use Varch’s Tor transport. If Tor is unavailable, the requests stop and are never sent over a direct connection.':'Tor is unavailable. External requests stop and are never sent over a direct connection.',
    historyTitle:'Does not save browsing history',historyBody:'Queries, tabs, and navigation state stay in memory for the current session and are not saved as persistent Varch history.',
    readerTitle:'Runs pages through Tor',readerBody:'The Windows app can load interactive websites through the integrated Tor connection. Camera and microphone permissions are denied.',
    locationTitle:'Never detects your location automatically',locationBody:'Varch does not request GPS or infer a city from your IP. Weather is looked up only for a city you enter.',
    httpsTitle:'Uses encrypted HTTPS destinations',httpsBody:'Requests to the search provider, weather service, and pages use HTTPS in addition to Tor routing in the installed app.',
    limits:'Limits to keep in mind',limitBody:'The search provider can process your search terms, and websites can read information you choose to submit. If Tor cannot connect, Varch stops the request without switching to a direct connection.',
    language:'Interface language',languageHint:'Choose the language used across Varch.'
  }:{
    profile:'VISÃO GERAL DA PRIVACIDADE',levelHeading:'Nível de anonimato',level:nativeTransport?'Transporte Tor':'Tor indisponível',levelDetail:nativeTransport?'Buscas, leitura de páginas e clima usam o transporte Tor do Varch. Se o Tor não conectar, a solicitação é interrompida sem conexão direta.':'O transporte Tor não está disponível neste ambiente. Solicitações externas são interrompidas e nunca são enviadas diretamente.',levelLimit:'O buscador ainda pode ler e processar os termos pesquisados.',vpnTitle:'Recomendação de VPN',vpnBody:'Para adicionar uma camada de privacidade, recomendamos usar uma VPN confiável junto com o Varch.',
    benefits:'O que o Varch faz por você',benefitsIntro:'Proteções integradas ao app e aplicadas automaticamente às solicitações dele.',
    torTitle:'Roteia solicitações pelo Tor',torBody:nativeTransport?'Buscas, páginas interativas e consultas de clima usam o transporte Tor do Varch. Se o Tor estiver indisponível, as solicitações são interrompidas sem conexão direta.':'O Tor está indisponível. Solicitações externas são interrompidas e nunca são enviadas por uma conexão direta.',
    historyTitle:'Não salva histórico de navegação',historyBody:'Pesquisas, guias e estado da navegação ficam na memória durante a sessão e não são gravados como histórico persistente do Varch.',
    readerTitle:'Carrega páginas pelo Tor',readerBody:'O app para Windows pode carregar sites interativos pela conexão Tor integrada. As permissões de câmera e microfone são negadas.',
    locationTitle:'Não detecta sua localização automaticamente',locationBody:'O Varch não solicita GPS nem deduz uma cidade pelo IP. A consulta de clima só acontece para uma cidade digitada por você.',
    httpsTitle:'Usa destinos HTTPS criptografados',httpsBody:'As solicitações ao buscador, ao serviço de clima e às páginas usam HTTPS, além do roteamento Tor no app instalado.',
    limits:'Limites importantes',limitBody:'O buscador pode processar os termos pesquisados, e os sites podem ler as informações que você decidir enviar. Se o Tor não conectar, o Varch interrompe a solicitação sem trocar para uma conexão direta.',
    language:'Idioma da interface',languageHint:'Escolha o idioma usado em todo o Varch.'
  };
  panelContent.innerHTML=`<div class="privacy-overview">
    <section class="privacy-level-card"><div class="privacy-card-top"><div><span class="privacy-kicker">${text.profile}</span><h3>${text.levelHeading}</h3></div><span class="privacy-level-badge">${text.level}</span></div><p>${text.levelDetail}</p><p class="privacy-level-limit">${text.levelLimit}</p></section>
    <aside class="privacy-vpn-note"><span aria-hidden="true">VPN</span><div><h3>${text.vpnTitle}</h3><p>${text.vpnBody}</p></div></aside>
    <div class="privacy-benefits-heading"><h3>${text.benefits}</h3><p>${text.benefitsIntro}</p></div>
    <div class="privacy-benefit-grid">
      <article class="privacy-benefit"><span>01</span><div><h4>${text.torTitle}</h4><p>${text.torBody}</p></div></article>
      <article class="privacy-benefit"><span>02</span><div><h4>${text.historyTitle}</h4><p>${text.historyBody}</p></div></article>
      <article class="privacy-benefit"><span>03</span><div><h4>${text.readerTitle}</h4><p>${text.readerBody}</p></div></article>
      <article class="privacy-benefit"><span>04</span><div><h4>${text.locationTitle}</h4><p>${text.locationBody}</p></div></article>
      <article class="privacy-benefit"><span>05</span><div><h4>${text.httpsTitle}</h4><p>${text.httpsBody}</p></div></article>
    </div>
    <section class="privacy-limits"><h3>${text.limits}</h3><p>${text.limitBody}</p></section>
    <label class="privacy-language-row"><span>${text.language}<small>${text.languageHint}</small></span><select id="language-select" aria-label="${text.language}"><option value="en">English</option><option value="pt-BR">Português (Brasil)</option></select></label>
  </div>`;
  const languageSelect=$('#language-select');languageSelect.value=saved.language;
  languageSelect.addEventListener('change',()=>{saved.language=languageSelect.value;applyLanguage();renderSettingsCategory()});
  if(saved.motion)panelContent.animate([{opacity:.25,transform:'translateY(9px)'},{opacity:1,transform:'translateY(0)'}],{duration:400,easing:'cubic-bezier(.2,.75,.2,1)'});
}
$('#panel-close').addEventListener('click',closePanel);
panel.addEventListener('click',e=>{if(e.target===panel)closePanel()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closePanel()});

$$('.win-actions button').forEach((button,index)=>button.addEventListener('click',async()=>{
  const nativeWindow=window.__TAURI__?.window?.getCurrentWindow?.();
  if(!nativeWindow){announce('Controles da janela disponíveis no app instalado.');return}
  try{if(index===0)await nativeWindow.minimize();else if(index===1){if(await nativeWindow.isMaximized())await nativeWindow.unmaximize();else await nativeWindow.maximize()}else await nativeWindow.close()}catch{announce('Não foi possível controlar a janela.')}
}));


function animateDashboardEntry(){
  if(!saved.motion)return;
  const page=$('#dashboard-page');
  [page.querySelector('.dash-header'),...page.querySelectorAll('.weather-card,.privacy-card,.weather-stat,.forecast-card,.day-item')].filter(Boolean).forEach((item,index)=>{
    item.getAnimations().forEach(animation=>animation.cancel());
    item.animate([{opacity:0,transform:'translateY(16px)'},{opacity:1,transform:'translateY(0)'}],{duration:760,easing:'cubic-bezier(.16,1,.3,1)',delay:Math.min(index*55,440)});
  });
}
function showTabView(tab,animate=false){
  if(!tab)return;
  const state=getTabState(tab);
  const showDashboard=tab.dataset.view==='dashboard';
  $('main').classList.toggle('dashboard-view',showDashboard);
  $$('.sb').forEach(button=>button.classList.toggle('active',button.dataset.p===(showDashboard?'dashboard':'home')));
  searchInput.value=state.search||'';addressInput.value=state.address||'';
  visitHistory=[...(state.history||[])];visitIndex=state.visitIndex??-1;updateHistoryButtons();
  if(!showDashboard){if(state.reader)showSearchState(tab,'reader');else if(state.visitIndex>=0)showSearchState(tab,'results');else setSearchView('home')}else{$('main').classList.remove('search-open','search-fullscreen','browser-view');window.__TAURI__?.core?.invoke('tor_browser_hide').catch(()=>{})}
  lastWeather=state.weather||null;
  cityInput.value=state.city||'';
  if(showDashboard){
    if(lastWeather)renderWeather(lastWeather.data,lastWeather.place);else{resetDashboardWeather();if(state.weatherError){$('#weather-condition').textContent=state.weatherError;$('#weather-feels').textContent=copy[saved.language].retry;$('#weather-updated').textContent=copy[saved.language].notUpdated}}
  }
  if(showDashboard&&animate)animateDashboardEntry();
  if(!showDashboard&&animate)searchInput.focus();
}
function saveTabState(tab){
  if(!tab)return;
  const state=getTabState(tab);state.view=tab.dataset.view||'home';state.search=searchInput.value;state.address=addressInput.value;
  state.history=[...visitHistory];state.visitIndex=visitIndex;
  state.city=cityInput.value;
  if(state.view==='dashboard')state.weather=lastWeather;
}
$$('.sb').forEach(btn=>btn.addEventListener('click',()=>{
  const showDashboard=btn.dataset.p==='dashboard';
  const activeTab=$('.tab.active');
  if(activeTab){saveTabState(activeTab);activeTab.dataset.view=showDashboard?'dashboard':'home'}
  showTabView(activeTab,true);
  closePanel();
}));


const cityForm=$('#city-form'),cityInput=$('#city-input');
async function requestWeather(url){
  if(window.__TAURI__?.core?.invoke)return window.__TAURI__.core.invoke('tor_fetch_json',{url:url.href});
  throw new Error(saved.language==='en'?'Tor weather requests are available in the installed Varch app.':'As consultas de clima pelo Tor estão disponíveis no app Varch instalado.');
}
const weatherInfo=code=>{
  let index=9,icon='🌥️';
  if(code===0){index=0;icon='☀️'}else if(code===1){index=1;icon='🌤️'}else if(code===2){index=2;icon='⛅'}else if(code===3){index=3;icon='☁️'}
  else if([45,48].includes(code)){index=4;icon='🌫️'}else if([51,53,55,56,57].includes(code)){index=5;icon='🌦️'}
  else if([61,63,65,66,67,80,81,82].includes(code)){index=6;icon='🌧️'}else if([71,73,75,77,85,86].includes(code)){index=7;icon='🌨️'}
  else if([95,96,99].includes(code)){index=8;icon='⛈️'}
  return[copy[saved.language].weatherConditions[index],icon];
};
const setWeatherStat=(id,value,unit)=>{$(`#${id}`).innerHTML=`${value}<span class="stat-unit">${unit}</span>`};
function resetDashboardWeather(){
  const t=copy[saved.language];
  $('#weather-label').textContent=t.currentWeather;$('#weather-city').textContent=t.chooseCity;$('#weather-icon').textContent='✧';
  $('#weather-temp').innerHTML='—<sup>°C</sup>';$('#weather-condition').textContent=t.enterCity;$('#weather-feels').textContent=t.noAutoLocation;
  setWeatherStat('stat-feels','—','°C');setWeatherStat('stat-humidity','—','%');setWeatherStat('stat-wind','—','km/h');setWeatherStat('stat-rain','—','mm');
  $('#weather-updated').textContent=t.waitingCity;$('#hourly-list').innerHTML=`<div class="weather-empty">${t.hoursEmpty}</div>`;$('#week-grid').innerHTML=`<div class="weather-empty">${t.daysEmpty}</div>`;
}
function renderWeather(data,place){
  lastWeather={data,place};
  const activeTab=$('.tab.active');if(activeTab){const state=getTabState(activeTab);state.weather=lastWeather;state.city=cityInput.value}
  const current=data.current,condition=weatherInfo(current.weather_code),t=copy[saved.language];
  $('#weather-city').textContent=[place.name,place.admin1,place.country].filter(Boolean).join(' · ');
  $('#weather-label').textContent=t.currentWeather;$('#weather-icon').textContent=condition[1];
  $('#weather-temp').innerHTML=`${Math.round(current.temperature_2m)}<sup>°C</sup>`;
  $('#weather-condition').textContent=condition[0];
  $('#weather-feels').textContent=`${t.feels} ${Math.round(current.apparent_temperature)}°C`;
  setWeatherStat('stat-feels',Math.round(current.apparent_temperature),'°C');
  setWeatherStat('stat-humidity',Math.round(current.relative_humidity_2m),'%');
  setWeatherStat('stat-wind',Math.round(current.wind_speed_10m),'km/h');
  setWeatherStat('stat-rain',Number(current.precipitation||0).toLocaleString(saved.language,{maximumFractionDigits:1}),'mm');
  $('#weather-updated').textContent=`${copy[saved.language].updated} ${String(current.time||'').slice(11,16)}`;
  const hourly=data.hourly,start=Math.max(0,hourly.time.findIndex(time=>time>=current.time));
  $('#hourly-list').innerHTML=Array.from({length:6},(_,offset)=>{
    const i=start+offset;if(i>=hourly.time.length)return'';
    const info=weatherInfo(hourly.weather_code[i]);
    return `<div class="hour-item"><span>${offset===0?copy[saved.language].now:escapeHtml(hourly.time[i].slice(11,16))}</span><span class="hour-icon">${info[1]}</span><strong>${Math.round(hourly.temperature_2m[i])}°</strong></div>`;
  }).join('');
  const days=data.daily;
  $('#week-grid').innerHTML=days.time.slice(0,5).map((date,i)=>{
    const day=new Date(`${date}T12:00:00Z`);
    const label=i===0?copy[saved.language].today:new Intl.DateTimeFormat(saved.language,{weekday:'short',timeZone:'UTC'}).format(day).replace('.','');
    const info=weatherInfo(days.weather_code[i]);
    return `<div class="day-item"><span>${label}</span><span class="day-icon">${info[1]}</span><strong>${info[0]}</strong><span class="day-range"><span>${Math.round(days.temperature_2m_max[i])}°</span><span>${Math.round(days.temperature_2m_min[i])}°</span></span></div>`;
  }).join('');
}
cityForm.addEventListener('submit',async event=>{
  event.preventDefault();const city=cityInput.value.trim();if(!city)return;
  const t=copy[saved.language],requestTab=$('.tab.active'),state=getTabState(requestTab);
  state.weatherController?.abort();state.weatherController=new AbortController();const {signal}=state.weatherController;
  state.city=city;state.weather=null;state.weatherError=null;
  $('#weather-city').textContent=city;$('#weather-condition').textContent=t.searching;$('#weather-icon').textContent='✧';$('#weather-updated').textContent=t.searching;
  $('#hourly-list').innerHTML=`<div class="weather-empty dash-loading">${t.loadingHours}</div>`;
  $('#week-grid').innerHTML=`<div class="weather-empty dash-loading">${t.loadingDays}</div>`;
  try{
    const geocodeUrl=new URL('https://geocoding-api.open-meteo.com/v1/search');
    geocodeUrl.search=new URLSearchParams({name:city,count:'1',language:saved.language==='en'?'en':'pt',format:'json'});
    const geocodeData=await requestWeather(geocodeUrl);
    const places=geocodeData.results;
    if(!places?.length)throw new Error(t.noCity);
    const place=places[0],forecastUrl=new URL('https://api.open-meteo.com/v1/forecast');
    forecastUrl.search=new URLSearchParams({latitude:String(place.latitude),longitude:String(place.longitude),current:'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',hourly:'temperature_2m,weather_code',daily:'weather_code,temperature_2m_max,temperature_2m_min',forecast_days:'5',timezone:'auto'});
    const data=await requestWeather(forecastUrl);state.weather={data,place};
    if($('.tab.active')===requestTab)renderWeather(data,place);
  }catch(error){
    if(error.name==='AbortError')return;
    state.weatherError=error.message||t.fetchError;
    if($('.tab.active')===requestTab){
      $('#weather-condition').textContent=state.weatherError;$('#weather-feels').textContent=t.retry;$('#weather-updated').textContent=t.notUpdated;
      $('#hourly-list').innerHTML=`<div class="weather-empty">${t.hoursEmpty}</div>`;$('#week-grid').innerHTML=`<div class="weather-empty">${t.retry}</div>`;
    }
  }
});


const closeIcon='<svg class="i" width="16" height="16"><use href="#x"/></svg>';
function activate(tab){
  const previous=$('.tab.active');if(previous&&previous!==tab)saveTabState(previous);
  $$('.tab').forEach(item=>item.classList.remove('active'));tab.classList.add('active');
  closePanel();showTabView(tab,true);
}
function finishTabDrag(){
  if(!tabDrag)return;
  const drag=tabDrag;tabDrag=null;drag.tab.classList.remove('dragging');document.body.style.removeProperty('user-select');
  if(!drag.moved)return;
  suppressTabClickUntil=performance.now()+450;
  drag.positions.forEach((oldLeft,item)=>{if(!item.isConnected)return;const offset=oldLeft-item.getBoundingClientRect().left;if(offset)item.animate([{transform:`translateX(${offset}px)`},{transform:'translateX(0)'}],{duration:250,easing:'ease-out'})});
}
function wireTab(tab){
  tab.addEventListener('click',e=>{if(performance.now()<suppressTabClickUntil){e.preventDefault();e.stopPropagation();return}activate(tab)});
  tab.addEventListener('pointerdown',e=>{
    if(e.button!==0||e.target.closest('button'))return;
    tabDrag={tab,pointerId:e.pointerId,startX:e.clientX,moved:false,positions:new Map($$('.tab').map(item=>[item,item.getBoundingClientRect().left]))};
    tab.setPointerCapture(e.pointerId);
  });
  tab.querySelector('button').addEventListener('click',e=>{
    e.stopPropagation();
    const wasActive=tab.classList.contains('active');
    const removeTab=()=>{
      const positions=new Map($$('.tab').filter(item=>item!==tab).map(item=>[item,item.getBoundingClientRect().left]));
      const plusBefore=plusTab.getBoundingClientRect().left;
      tab.remove();
      const rest=$$('.tab');
      if(saved.motion){
        rest.forEach(item=>{const oldLeft=positions.get(item),newLeft=item.getBoundingClientRect().left,offset=oldLeft-newLeft;if(offset) item.animate([{transform:`translateX(${offset}px)`},{transform:'translateX(0)'}],{duration:460,easing:'cubic-bezier(.2,.75,.2,1)'})});
        const plusOffset=plusBefore-plusTab.getBoundingClientRect().left;
        if(rest.length&&plusOffset)plusTab.animate([{transform:`translateX(${plusOffset}px)`},{transform:'translateX(0)'}],{duration:460,easing:'cubic-bezier(.2,.75,.2,1)'});
      }
      if(!rest.length)plusTab.click();
      else if(wasActive)activate(rest[rest.length-1]);
    };
    if(saved.motion){const closing=tab.animate([{opacity:1,transform:'translateX(0) scale(1)'},{opacity:0,transform:'translateX(-28px) scale(.96)'}],{duration:260,easing:'ease-in',fill:'forwards'});closing.onfinish=removeTab}
    else removeTab();
  });
}
tabbar.addEventListener('pointermove',e=>{
  if(!tabDrag||tabDrag.pointerId!==e.pointerId)return;
  if(!tabDrag.moved&&Math.abs(e.clientX-tabDrag.startX)<4)return;
  tabDrag.moved=true;tabDrag.tab.classList.add('dragging');document.body.style.userSelect='none';e.preventDefault();
  const tabs=$$('.tab'),oldLeft=new Map(tabs.map(item=>[item,item.getBoundingClientRect().left]));
  const peers=tabs.filter(item=>item!==tabDrag.tab);
  const before=peers.find(item=>e.clientX<item.getBoundingClientRect().left+item.getBoundingClientRect().width/2);
  tabbar.insertBefore(tabDrag.tab,before||plusTab);
  tabs.filter(item=>item!==tabDrag.tab).forEach(item=>{
    const offset=oldLeft.get(item)-item.getBoundingClientRect().left;
    if(offset)item.animate([{transform:`translateX(${offset}px)`},{transform:'translateX(0)'}],{duration:220,easing:'cubic-bezier(.2,.75,.2,1)'});
  });
});
tabbar.addEventListener('pointerup',finishTabDrag);
tabbar.addEventListener('pointercancel',finishTabDrag);
wireTab($('.tab'));
plusTab.addEventListener('click',()=>{
  const plusBefore=plusTab.getBoundingClientRect().left;
  tabCount++;
  const tab=document.createElement('div');
  tab.className='tab';tab.dataset.view='home';
  getTabState(tab);
  tab.innerHTML=`<span>${copy[saved.language].tab} ${tabCount}</span><button aria-label="${copy[saved.language].closeTab} ${tabCount}" title="${copy[saved.language].closeTab}">${closeIcon}</button>`;
  tabbar.insertBefore(tab,plusTab);wireTab(tab);activate(tab);
  if(saved.motion){
    const plusDistance=plusTab.getBoundingClientRect().left-plusBefore;
    tab.animate([{opacity:0,transform:'translateX(-42px) scale(.96)'},{opacity:1,transform:'translateX(0) scale(1)'}],{duration:620,easing:'cubic-bezier(.2,.75,.2,1)'});
    if(plusDistance>0)plusTab.animate([{transform:`translateX(${-plusDistance}px)`},{transform:'translateX(0)'}],{duration:620,easing:'cubic-bezier(.2,.75,.2,1)'});
  }
  announce(copy[saved.language].newTabReady);
});


function moveHistory(direction){
  const tab=$('.tab.active'),state=getTabState(tab),next=state.visitIndex+direction;
  if(state.reader?.browser){window.__TAURI__?.core?.invoke('tor_browser_control',{action:direction<0?'back':'forward'}).catch(error=>announce(error.message));return}
  if(next<0||next>=state.history.length)return;
  state.visitIndex=next;visitHistory=state.history;visitIndex=next;openVisit(state.history[next],tab);updateHistoryButtons();
  const icon=direction<0?$('#back svg'):$('#forward svg');
  if(saved.motion)icon.animate([{transform:'translateX(0)'},{transform:`translateX(${direction<0?-4:4}px)`},{transform:'translateX(0)'}],{duration:360,easing:'ease-out'});
}
$('#back').addEventListener('click',()=>moveHistory(-1));
$('#forward').addEventListener('click',()=>moveHistory(1));
updateHistoryButtons();
let lastReloadActivation=0;
function reloadActiveTab(){
  const now=performance.now();if(now-lastReloadActivation<120)return;lastReloadActivation=now;
  const tab=$('.tab.active');if(!tab)return;
  const state=getTabState(tab),current=state.history?.[state.visitIndex];
  if(state.reader?.browser){window.__TAURI__?.core?.invoke('tor_browser_control',{action:'reload'}).catch(error=>announce(error.message))}
  else if(tab.dataset.view==='dashboard'){
    if(cityInput.value.trim())cityForm.requestSubmit();else animateDashboardEntry();
  }
  else if(current)openVisit(current,tab);
  else if(state.reader?.url)openPage(state.reader.url,tab);
  else if(state.search)runSearch(state.search,tab);
  else{setSearchView('home');searchInput.value='';addressInput.value='';searchInput.focus();if(saved.motion)$('.home').animate([{opacity:.65,transform:'scale(.985)'},{opacity:1,transform:'scale(1)'}],{duration:500,easing:'ease-out'})}
  announce(copy[saved.language].refreshed);
  const icon=$('#reload svg');icon.getAnimations().forEach(animation=>animation.cancel());
  if(saved.motion)icon.animate([{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}],{duration:760,easing:'cubic-bezier(.4,0,.2,1)'});
}
window.addEventListener('resize',()=>{const state=getTabState($('.tab.active'));if(!state.reader?.browser||!$('main').classList.contains('browser-view'))return;const rect=$('main').getBoundingClientRect();window.__TAURI__?.core?.invoke('tor_browser_set_bounds',{x:rect.x,y:rect.y,width:rect.width,height:rect.height}).catch(()=>{})});
const reloadButton=$('#reload');
reloadButton.type='button';
reloadButton.addEventListener('pointerup',event=>{if(event.button===0)reloadActiveTab()});
reloadButton.addEventListener('click',event=>{if(event.detail===0)reloadActiveTab()});
