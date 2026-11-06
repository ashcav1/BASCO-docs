/* Offline search. Kept independent of the DOM so ranking is checked with Node. */
((root) => {
  'use strict';
  const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const words = value => normalize(String(value || '').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/([a-z\d])([A-Z])/g, '$1 $2')).match(/[a-z0-9]+/g) || [];
  const stopwords = new Set(('a an and are as at be can could do does for from how i in into is it me my of on or please the their this to use using want what when where which with would your').split(' '));
  const forms = {
    bodies:'body', masses:'mass', shapes:'shape', parameters:'parameter', settings:'setting',
    moments:'moment', harmonics:'harmonic', coefficients:'coefficient', degrees:'degree',
    priors:'prior', rates:'rate', cases:'case', uncertainties:'uncertainty',
    estimated:'estimate', estimating:'estimate', estimation:'estimate',
    changed:'change', changing:'change', customized:'custom', customize:'custom', customizing:'custom',
    tumbling:'tumble', tumbles:'tumble', rotations:'rotation', rotational:'rotation', rotating:'rotation',
    propagated:'propagate', propagating:'propagate', propagation:'propagate',
  };
  const stem = term => Object.hasOwn(forms,term) ? forms[term] : term;
  // Small domain vocabulary; alternatives are weaker than the user's own term.
  // "Kahler" is a common mistaken query for the documented Kaula prior.
  const synonymGroups = [
    ['one','single','minimal'], ['change','modify','adjust','edit','custom','own'],
    ['spin','rotation','angular','omega'], ['rate','velocity','speed'],
    ['uncertainty','covariance'], ['prior','constraint'], ['shape','mesh','geometry'],
    ['kaula','kahler','kehler'], ['degree','order'], ['run','execute'],
  ];
  const synonyms = new Map();
  for (const group of synonymGroups) for (const term of group) synonyms.set(term, group);
  const identifier = value => normalize(value).trim().replace(/\(\s*\)$/, '').replace(/^bc\./, 'basco.');
  const compact = value => words(value).map(stem).join('');

  // Bounded Damerau-Levenshtein: one edit for 5–8 letters, two for longer words.
  // Short API names and numbers never receive typo correction.
  function distance(a, b, bound) {
    if (Math.abs(a.length-b.length)>bound) return bound+1;
    let older, previous=Array.from({length:b.length+1},(_,i)=>i);
    for (let i=1;i<=a.length;i++) {
      const row=[i]; let best=i;
      for(let j=1;j<=b.length;j++) {
        row[j]=Math.min(row[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
        if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1]) row[j]=Math.min(row[j],older[j-2]+1);
        best=Math.min(best,row[j]);
      }
      if(best>bound) return bound+1;
      older=previous;previous=row;
    }
    return previous[b.length];
  }

  function snippet(item, matches) {
    const clean = value => String(value || '').replace(/\s+/g,' ').trim();
    let source=clean(item.summary || item.description || item.text);
    const searchable=normalize(source);
    let at=Infinity;
    for(const term of matches) {
      const found=searchable.indexOf(term);
      if(found>=0) at=Math.min(at,found);
    }
    let start=Number.isFinite(at)?Math.max(0,at-65):0;
    if(start>0) {const space=source.indexOf(' ',start);if(space>=0)start=space+1;}
    let end=Math.min(source.length,start+205);
    if(end<source.length) {const space=source.lastIndexOf(' ',end);if(space>start+100)end=space;}
    return (start?'…':'')+source.slice(start,end)+(end<source.length?'…':'');
  }

  function create(index) {
    const vocabulary=new Map();
    const documents=(index || []).map((item,id)=>{
      const weights=new Map();
      for(const [field,weight] of [['title',20],['aliases',18],['description',8],['chapter',5],['text',2]]) {
        for(const raw of words(item[field])) {
          for(const term of new Set([raw,stem(raw)])) {
            weights.set(term,Math.max(weights.get(term)||0,weight));
            if(!vocabulary.has(term))vocabulary.set(term,new Set());
            vocabulary.get(term).add(id);
          }
        }
      }
      const names=[item.title,...String(item.aliases || '').split(/\s+/)].filter(Boolean).map(identifier);
      return {item,weights,names,shortNames:names.map(name=>name.split('.').pop()),titleWords:new Set(words(item.title).map(stem))};
    });
    const vocabularyWords=[...vocabulary.keys()];
    const queryCache=new Map();
    function termsFor(raw) {
      if(queryCache.has(raw))return queryCache.get(raw);
      const term=stem(raw), options=new Map([[raw,1],[term,1]]);
      for(const alternative of synonyms.get(term)||[]) if(!options.has(alternative))options.set(alternative,.78);
      // Prefix completion is useful during typing, but cannot replace a complete term.
      if(!vocabulary.has(raw)&&raw.length>=3) {
        for(const candidate of vocabularyWords) if(candidate.startsWith(raw))options.set(candidate,.68);
      }
      if(!vocabulary.has(raw)&&raw.length>=5&&/^[a-z]+$/.test(raw)) {
        const bound=raw.length>=9?2:1;
        for(const candidate of vocabularyWords) {
          if(!/^[a-z]+$/.test(candidate)||Math.abs(candidate.length-raw.length)>bound)continue;
          const edits=distance(raw,candidate,bound);
          if(edits<=bound&&!options.has(candidate))options.set(candidate,edits===1?.6:.45);
        }
      }
      if(queryCache.size>100)queryCache.clear();
      queryCache.set(raw,options);return options;
    }
    function search(query,{limit=24}={}) {
      const exact=identifier(query), rawWords=[...new Set(words(String(query || '').trim().replace(/^bc\./i,'basco.')).filter(w=>!stopwords.has(w)))];
      if(!exact||!rawWords.length) return documents.filter(d=>d.item.type==='Guide'&&!d.item.section).slice(0,8).map(d=>({...d.item,score:0,snippet:snippet(d.item,[])}));
      const groups=rawWords.map(termsFor);
      // Intersect candidate sets rather than scanning the entire body of every entry.
      let candidates;
      for(const options of groups) {
        const matching=new Set();
        for(const term of options.keys())for(const id of vocabulary.get(term)||[])matching.add(id);
        candidates=candidates?new Set([...candidates].filter(id=>matching.has(id))):matching;
        if(!candidates.size)break;
      }
      const ranked=[];
      for(const id of candidates || []) {
        const doc=documents[id], item=doc.item, matched=[];
        let score=0,titleMatches=0;
        for(const options of groups) {
          let best=0,chosen='';
          for(const [term,quality] of options) {
            const value=(doc.weights.get(term)||0)*quality;
            if(value>best){best=value;chosen=term;}
          }
          score+=best;matched.push(chosen);
          if(doc.titleWords.has(stem(chosen))&&options.get(chosen)===1)titleMatches++;
        }
        const api=item.type!=='Guide';
        if(api&&doc.names.includes(exact)) score+=10000;
        else if(api&&doc.shortNames.includes(exact))score+=5000;
        else if(api&&/[._]/.test(query)&&doc.shortNames.some(name=>compact(name)===compact(query)))score+=1500;
        if(normalize(item.title).includes(normalize(query).trim()))score+=65;
        score+=titleMatches*9+(titleMatches===groups.length?35:0);
        score+=16*titleMatches/Math.max(doc.titleWords.size,1);
        if(item.type==='Guide')score+=30+(item.section?15:0);
        if(item.tier==='public')score+=6;
        if(item.tier==='internal')score-=15;
        if(item.tier==='legacy'||/\.(?:_legacy|legacy)\./.test(item.title))score-=60;
        ranked.push({...item,score,snippet:snippet(item,matched)});
      }
      ranked.sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title)||a.url.localeCompare(b.url));
      // Keep the best section(s) visible instead of filling the dialog with one chapter.
      const perPage=new Map(),seen=new Set(),result=[];
      for(const item of ranked) {
        if(seen.has(item.url))continue;
        const page=item.url.split('#')[0], count=perPage.get(page)||0;
        if(item.type==='Guide'&&count>=2)continue;
        seen.add(item.url);if(item.type==='Guide')perPage.set(page,count+1);
        result.push(item);if(result.length>=limit)break;
      }
      return result;
    }
    return {search};
  }
  root.BASCO_SEARCH_ENGINE={create};
})(typeof window==='undefined'?globalThis:window);
