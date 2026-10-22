/**
 * W5-J: the «Capturar vacante» bookmarklet. Its code is generated here and served inside cv-app's own page (the link
 * the person drags to the bookmarks bar); it loads nothing from anywhere, so the job site's CSP has nothing to block
 * and cv's CSP is untouched (clicking the link ON cv-app does nothing: `javascript:` URLs are blocked there).
 *
 * When clicked on a job page it reads, from that page only: JSON-LD blocks that mention JobPosting (≤ 5), og:/twitter:/
 * description meta tags (≤ 40), the JobPosting microdata element's HTML (≤ 60 000 characters), the visible text of
 * <main>/<article>/<body> (≤ 50 000), the title, the address and the canonical link. It never reads cookies, storage,
 * form fields or other tabs, and sends nothing anywhere: it opens cv-app's capture page with the data in the URL
 * fragment (capture.ts explains why the fragment), where the person reviews it before anything is saved.
 */

function source(target: string, failMessage: string): string {
  return [
    '(function(){',
    `var T=${JSON.stringify(target)};`,
    'try{',
    'var d=document,i,s,ld=[],m={},n=0;',
    's=d.querySelectorAll(\'script[type="application/ld+json"]\');',
    "for(i=0;i<s.length&&ld.length<5;i++){var t=s[i].textContent||'';if(t.indexOf('JobPosting')>-1&&t.length<150000)ld.push(t)}",
    's=d.querySelectorAll(\'meta[property^="og:"],meta[name="description"],meta[name^="twitter:"]\');',
    "for(i=0;i<s.length&&n<40;i++){var k=s[i].getAttribute('property')||s[i].getAttribute('name'),v=s[i].getAttribute('content');if(k&&v){m[k.slice(0,100)]=v.slice(0,4000);n++}}",
    'var md=d.querySelector(\'[itemtype*="schema.org/JobPosting"]\');',
    "var r=d.querySelector('main')||d.querySelector('article')||d.body;",
    'var c=d.querySelector(\'link[rel="canonical"]\');',
    "var p={v:1,url:String(location.href).slice(0,2000),canonical:c&&c.href?String(c.href).slice(0,2000):null,title:String(d.title||'').slice(0,500),jsonLd:ld,meta:m,microdata:md?md.outerHTML.slice(0,60000):'',text:String(r&&r.innerText||'').slice(0,50000)};",
    'var j=new TextEncoder().encode(JSON.stringify(p));',
    "var b=function(u){var x='',q;for(q=0;q<u.length;q+=32768)x+=String.fromCharCode.apply(null,u.subarray(q,q+32768));return btoa(x).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'')};",
    "var go=function(f){var w=window.open(T+'#'+f,'_blank');if(!w)location.href=T+'#'+f};",
    "if(window.CompressionStream){new Response(new Blob([j]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer().then(function(a){go('z.'+b(new Uint8Array(a)))},function(){go('j.'+b(j))})}else{go('j.'+b(j))}",
    `}catch(e){alert(${JSON.stringify(failMessage)})}`,
    '})();',
  ].join('');
}

/** The `javascript:` URL of the bookmark; `target` is the absolute capture page URL on cv-app (https in production). */
export function bookmarkletHref(target: string, failMessage: string): string {
  return `javascript:${encodeURIComponent(source(target, failMessage))}`;
}

/** The plain code (for the «copy» box on phones, where bookmarks cannot be dragged). */
export function bookmarkletCode(target: string, failMessage: string): string {
  return `javascript:${source(target, failMessage)}`;
}
