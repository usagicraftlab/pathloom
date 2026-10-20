import {explainOperationError} from './operation-feedback.js';

// Temporary authoring UI lives beside graph nodes, never in the saved definition.
export function createAiCanvasCard({world,viewport,composePosition,onComplete}) {
  const card=document.createElement('article');card.className='ai-component-card';card.hidden=true;card.setAttribute('aria-label','AI Component');
  card.innerHTML=`<header><strong>✦ New Component</strong><button type="button" class="ai-card-close" aria-label="Close AI Component">×</button></header>
    <form><textarea rows="4" maxlength="6000" placeholder="どんなComponentを作りますか？\n例：入力した曲線を、指定した高さまでねじりながら積層する" aria-label="Component instructions"></textarea>
    <div class="ai-card-status" role="status" aria-live="polite"><span class="ai-card-spinner" aria-hidden="true"></span><span class="ai-card-message"></span><span class="ai-card-elapsed"></span></div>
    <p class="ai-card-hint"></p><details class="ai-card-error" hidden><summary>エラーの詳細</summary><pre></pre></details>
    <footer><button type="button" class="ai-card-settings">AI設定</button><button type="button" class="ai-card-cancel" hidden>中断</button><button type="submit" class="primary">生成する</button></footer></form>`;
  world.append(card);
  const textarea=card.querySelector('textarea'),submit=card.querySelector('[type=submit]'),cancel=card.querySelector('.ai-card-cancel'),message=card.querySelector('.ai-card-message'),elapsed=card.querySelector('.ai-card-elapsed'),hint=card.querySelector('.ai-card-hint'),details=card.querySelector('details');
  let ticket=null,targetId=null,position=null,busy=false,started=0,timer=null,completionTimer=null,draftKey=null;const drafts=new Map();
  function rememberDraft(){if(draftKey&&textarea.value.trim())drafts.set(draftKey,textarea.value);else if(draftKey)drafts.delete(draftKey);while(drafts.size>30)drafts.delete(drafts.keys().next().value)}
  const emit=(name,detail)=>document.dispatchEvent(new CustomEvent(name,{detail}));
  function stopTimer(){clearInterval(timer);timer=null;elapsed.textContent=''}
  function close(){rememberDraft();if(busy)emit('pathloom:ai-cancel',{ticket});card.hidden=true;stopTimer();clearTimeout(completionTimer)}
  function open(options={}) {
    if(busy){textarea.focus();return}
    rememberDraft();clearTimeout(completionTimer);stopTimer();ticket=crypto.randomUUID();targetId=options.targetId||null;draftKey=`${window.PathloomCad?.liveContext?.()||'workspace'}:${targetId||'$new'}`;position=options.position||composePosition(targetId);
    card.style.left=position.x+'px';card.style.top=position.y+'px';card.hidden=false;card.dataset.phase='idle';
    card.querySelector('strong').textContent=targetId?`✦ ${options.label||'Component'} を編集`:'✦ New Component';
    textarea.value=options.request??drafts.get(draftKey)??'';textarea.disabled=false;submit.disabled=false;submit.textContent='生成する';cancel.hidden=true;message.textContent='指示を書いて生成';hint.textContent='⌘ / Ctrl + Enterで生成 · 生成後にポートを接続できます';details.hidden=true;details.open=false;
    requestAnimationFrame(()=>{
      const bounds=viewport.getBoundingClientRect(),rect=card.getBoundingClientRect(),scale=world.getBoundingClientRect().width/world.offsetWidth||1;
      const dx=rect.right>bounds.right-8?bounds.right-8-rect.right:rect.left<bounds.left+8?bounds.left+8-rect.left:0;
      const dy=rect.bottom>bounds.bottom-8?bounds.bottom-8-rect.bottom:rect.top<bounds.top+8?bounds.top+8-rect.top:0;
      card.style.left=position.x+dx/scale+'px';card.style.top=position.y+dy/scale+'px';textarea.focus();
    });
  }
  card.querySelector('.ai-card-close').addEventListener('click',close);
  card.querySelector('.ai-card-settings').addEventListener('click',()=>emit('pathloom:ai-settings'));
  cancel.addEventListener('click',()=>emit('pathloom:ai-cancel',{ticket}));
  card.querySelector('form').addEventListener('submit',event=>{event.preventDefault();const request=textarea.value.trim();if(!request||busy)return;ticket=crypto.randomUUID();emit('pathloom:ai-submit',{ticket,request,targetId,position:{...position},createComponent:!targetId})});
  textarea.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();card.querySelector('form').requestSubmit()}else if(event.key==='Escape'&&!busy){event.preventDefault();event.stopPropagation();close()}});
  for(const event of ['pointerdown','click','dblclick','contextmenu','wheel'])card.addEventListener(event,e=>e.stopPropagation());
  document.addEventListener('pathloom:ai-compose',event=>open(event.detail));
  document.addEventListener('pathloom:ai-dismiss',close);
  document.addEventListener('pathloom:ai-state',event=>{
    const state=event.detail;if(state.ticket!==ticket)return;
    const wasBusy=busy;busy=['connecting','generating','validating','repairing','applying'].includes(state.phase);
    card.dataset.phase=state.phase;card.setAttribute('aria-busy',String(busy));textarea.disabled=busy;submit.disabled=busy;cancel.hidden=!busy;details.hidden=true;
    if(busy&&!wasBusy){started=Date.now();timer=setInterval(()=>{elapsed.textContent=`${Math.floor((Date.now()-started)/1000)}s`},1000)}
    if(!busy)stopTimer();
    const messages={connecting:'AIに接続しています…',generating:'Componentを生成しています…',validating:'生成結果を検証しています…',repairing:'エラーを修正して再生成しています…',applying:'モデルに反映しています…',done:'✓ Componentができました',cancelled:'生成を中断しました'};
    message.textContent=messages[state.phase]||state.message||'';
    hint.textContent=busy?'このカードで進行状況を確認できます。中断しても指示は残ります。':state.phase==='done'?'ポートを接続して使えます。ダブルクリックでパラメータを調整できます。':'指示を編集してもう一度生成できます。';
    submit.textContent=state.phase==='error'||state.phase==='cancelled'?'再生成する':'生成する';
    if(state.phase==='error'){const error=explainOperationError(state.error);message.textContent=error.title;hint.textContent=error.hint;details.hidden=false;details.open=true;details.querySelector('pre').textContent=error.details;requestAnimationFrame(()=>textarea.focus())}
    if(state.phase==='done'){drafts.delete(draftKey);draftKey=null;message.textContent=state.updated?'✓ Componentを更新しました':'✓ Componentができました';if(state.warning){hint.textContent='Componentは作成済みですが、Libraryへの保存を確認してください。';details.hidden=false;details.open=true;details.querySelector('pre').textContent=state.warning}else completionTimer=setTimeout(()=>{if(card.dataset.phase==='done')card.hidden=true},1800);onComplete?.(state)}
  });
  return {open,close,setZoom(zoom){card.style.transform=`scale(${1/zoom})`},contains:node=>card.contains(node),get visible(){return !card.hidden}};
}
