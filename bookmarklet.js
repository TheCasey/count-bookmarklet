// Smart Subtraction Bookmarklet (All Features Integrated)
(function(){
const groups={"Wake Word Usage":["\"alexa","\"hey alexa","\"echo","\"hey echo","\"ziggy","\"hey ziggy","\"computer","\"hey computer"]};
let scrollCheck,data={},dateData={},startDate=null,endDate=null,subtractions={singleWord:{},replacement:{},total:0};

function getEasternOffsetDiff(a,b){
  const l=new Date(a+" "+b),u=new Date(l.toLocaleString("en-US",{timeZone:"UTC"})),e=new Date(l.toLocaleString("en-US",{timeZone:"America/New_York"}));
  return(e.getTime()-u.getTime())/60000;
}

function setFilterDates(){
  const s=document.querySelector("#date-start"),e=document.querySelector("#date-end");
  if(!s||!e)return alert("Could not find filter range on page.");
  const t=new Date().getFullYear(),i=s.value.length<10?s.value+"/"+t:s.value,n=e.value.length<10?e.value+"/"+t:e.value;
  startDate=new Date(new Date(i+" 20:00:00").toLocaleString("en-US",{timeZone:"America/New_York"}));
  endDate=new Date(new Date(n+" 18:00:00").toLocaleString("en-US",{timeZone:"America/New_York"}));
  ui();
}

function autoScrollAndLoad(cb){
  const p=500,m=6,x=200;
  let l=0,s=0,a=0,b=document.createElement("button");
  b.textContent="Stop Scrolling";
  b.style="position:fixed;top:10px;right:10px;padding:10px;z-index:999999;background:red;color:#fff;border-radius:5px;cursor:pointer;";
  b.onclick=()=>{clearInterval(scrollCheck),b.remove(),setTimeout(setFilterDates,1000)};
  document.body.appendChild(b);
  scrollCheck=setInterval(()=>{
    a++;
    let r=document.querySelector(".full-width-message");
    r?r.scrollIntoView({behavior:"smooth",block:"center"}):window.scrollBy({top:innerHeight,behavior:"smooth"});
    let h=document.body.scrollHeight;
    s=h===l?s+1:0,l=h;
    if(s>=m||a>=x){
      if(r&&r.innerText.match(/loading more/i))s=m-2;
      else{clearInterval(scrollCheck);b.remove();setTimeout(setFilterDates,1500)}
    }
  },p)
}

function isSingleWord(phrase){
  const words=phrase.trim().toLowerCase().split(/\s+/);
  const wake=["alexa","echo","computer","ziggy"];
  return words.length===1 || (words.length===2 && wake.includes(words[0]));
}

function proc(){
  data={},dateData={},subtractions={singleWord:{},replacement:{},total:0};
  let t="",lastValidTime=null,firstValidTime=null;
  document.querySelectorAll(".apd-content-box.with-activity-page").forEach(e=>{
    let dElem=e.querySelector(".device-name"),
        tElem=e.querySelector(".customer-transcript")||e.querySelector(".replacement-text"),
        isReplacement=!!e.querySelector(".replacement-text"),
        items=e.querySelectorAll(".record-info .item");

    if(dElem&&tElem&&items.length>=2){
      let D=dElem.innerText.trim(),
          T=tElem.innerText.trim(),
          TLower=T.toLowerCase(),
          dateStr=items[0].innerText.trim(),
          timeStr=items[1].innerText.trim(),
          fullDateStr=dateStr+" "+timeStr,
          dateObj=new Date(fullDateStr);
      if(startDate&&endDate&&(dateObj<startDate||dateObj>endDate))return;
      data[D]=data[D]||{},data[D]._utteranceCount=(data[D]._utteranceCount||0)+1;
      dateData[dateStr]=(dateData[dateStr]||0)+1;
      (!firstValidTime||dateObj<firstValidTime)&&(firstValidTime=dateObj);
      (!lastValidTime||dateObj>lastValidTime)&&(lastValidTime=dateObj,t=fullDateStr);

      if(isReplacement){
        subtractions.replacement[T]=(subtractions.replacement[T]||0)+1;
        subtractions.total++;
      } else if(isSingleWord(TLower)){
        subtractions.singleWord[TLower]=(subtractions.singleWord[TLower]||0)+1;
        subtractions.total++;
      }

      groups["Wake Word Usage"].forEach(term=>{
        let R=new RegExp(term.replace(/[\^$*+?.()|[\]{}\\]/g,"\\$&"),"gi"),
            C=(TLower.match(R)||[]).length;
        C&&(data[D][term]=(data[D][term]||0)+C);
      });
    }
  });
  dateData.firstValid=firstValidTime?firstValidTime.toLocaleString("en-US",{timeZone:"America/New_York"}):"N/A";
  dateData.lastValid=lastValidTime?lastValidTime.toLocaleString("en-US",{timeZone:"America/New_York"}):"N/A";
}

function showPopup(title,obj){
  const popup=document.createElement("div");
  popup.style="position:fixed;top:50px;left:50px;width:300px;max-height:400px;overflow:auto;background:#fff;border:1px solid #000;padding:10px;z-index:9999999;border-radius:10px;box-shadow:0 0 10px #000;";
  popup.innerHTML=`<b>${title}</b><br><hr>`+Object.entries(obj).map(([k,v])=>`${k}: ${v}`).join("<br>");
  const close=document.createElement("button");
  close.textContent="Close",close.style="margin-top:10px;padding:5px;width:100%;cursor:pointer;";
  close.onclick=()=>popup.remove();
  popup.appendChild(close);
  document.body.appendChild(popup);
}

function copyDevices(){
  let out="Device Overview:\n";
  for(let d in data)out+=d+": "+(data[d]._utteranceCount||0)+"\n";
  return out;
}

function copyDates(){
  let txt=`First Valid: ${dateData.firstValid||"N/A"}\nLast Valid: ${dateData.lastValid||"N/A"} ET\n\nDaily Work:\n`;
  for(let dt in dateData){"firstValid"!==dt&&"lastValid"!==dt&&(txt+=dt+": "+dateData[dt]+"\n")}
  return txt;
}

function copySection(section,filterDevice){
  let output=section+":\n";
  groups[section].forEach(term=>{
    let count=0;
    if(filterDevice==="All Devices"){for(let d in data)count+=(data[d][term]||0)}
    else count=data[filterDevice]?.[term]||0;
    if(count>0)output+=`  ${term}: ${count}\n`;
  });
  let total=output.match(/: (\d+)/g)?.reduce((sum,m)=>sum+parseInt(m.split(": ")[1]),0)||0;
  return output+=`  Total: ${total}`;
}

function copySubtractions(){
  let txt="Subtractions:\n";
  txt+="Single Word:\n";
  Object.entries(subtractions.singleWord).forEach(([k,v])=>{txt+=`  ${k}: ${v}\n`});
  txt+="System Replacement:\n";
  Object.entries(subtractions.replacement).forEach(([k,v])=>{txt+=`  ${k}: ${v}\n`});
  txt+=`Total: ${subtractions.total}`;
  return txt;
}

function copyFullAudit(){
  return copyDevices()+"\n\n"+copySection("Wake Word Usage","All Devices")+"\n\n"+copySubtractions()+"\n\n"+copyDates();
}

function ui(){
  proc();
  let dailyWork=document.createElement("div");
  dailyWork.style="position:fixed;top:250px;right:350px;width:200px;max-height:80%;overflow:auto;padding:10px;background:#efe;z-index:99997;border-radius:5px;box-shadow:0 0 10px rgba(0,0,0,0.3);";
  dailyWork.innerHTML=`<b style="text-align:center;display:block;">First Valid: ${dateData.firstValid||"N/A"}<br>Last Valid: ${dateData.lastValid||"N/A"} ET</b><hr>`;
  Object.keys(dateData).forEach(dt=>{"firstValid"!==dt&&"lastValid"!==dt&&(dailyWork.innerHTML+=dt+": "+dateData[dt]+"<br>")});
  document.body.appendChild(dailyWork);

  let P=document.createElement("div");
  P.style="position:fixed;top:10px;right:10px;width:320px;max-height:80%;overflow:auto;padding:10px;background:#f9f9f9;z-index:99999;border-radius:5px;box-shadow:0 0 10px rgba(0,0,0,0.3);";
  P.innerHTML='<b style="display:block;text-align:center;">Audit Results</b><hr>';

  let F=document.createElement("select");
  F.style="width:100%;margin-bottom:10px;";
  F.innerHTML=["All Devices",...Object.keys(data)].map(d=>`<option>${d}</option>`).join("");
  P.appendChild(F);

  const R=document.createElement("div");
  P.appendChild(R);

  function render(dev){
    R.innerHTML="";
    Object.keys(groups).forEach(grp=>{
      let html=`<b>${grp}</b><br>`;
      groups[grp].forEach(term=>{
        let count=0;
        if(dev==="All Devices"){for(let d in data)count+=(data[d][term]||0)}
        else count=data[dev][term]||0;
        html+=`<input type="checkbox" ${count?"checked":""}> ${term}: ${count}<br>`;
      });
      R.innerHTML+=html+"<hr>";
    });
    const subSummary=document.createElement("div");
    const sw=document.createElement("div");
    const swBtn=document.createElement("button");
    const swCount=Object.values(subtractions.singleWord).reduce((a,b)=>a+b,0);
    sw.textContent=`Single Word: ${swCount} `;
    swBtn.textContent="(view)",swBtn.onclick=()=>showPopup("Single Word Utterances",subtractions.singleWord);
    sw.appendChild(swBtn);

    const sr=document.createElement("div");
    const srBtn=document.createElement("button");
    const srCount=Object.values(subtractions.replacement).reduce((a,b)=>a+b,0);
    sr.textContent=`System Replacement: ${srCount} `;
    srBtn.textContent="(view)",srBtn.onclick=()=>showPopup("System Replacements",subtractions.replacement);
    sr.appendChild(srBtn);

    subSummary.appendChild(document.createElement("b")).textContent="Subtractions";
    subSummary.appendChild(sw);
    subSummary.appendChild(sr);
    subSummary.appendChild(document.createTextNode(`Total: ${subtractions.total}`));
    R.appendChild(subSummary);
  }

  F.onchange=()=>render(F.value);
  render("All Devices");

  ["Wake Word Usage","Subtractions","Both"].forEach(label=>{
    const btn=document.createElement("button");
    btn.textContent=`Copy ${label}`;
    btn.style="width:100%;padding:5px;margin-top:4px;cursor:pointer;";
    btn.onclick=()=>{
      let result="",dev=F.value;
      result=label==="Both" ? copySection("Wake Word Usage",dev)+"\n\n"+copySubtractions() : (label==="Subtractions"?copySubtractions():copySection(label,dev));
      navigator.clipboard.writeText(result).then(()=>alert("Copied!"));
    };
    P.appendChild(btn);
  });

  let close=document.createElement("button");
  close.textContent="Close",close.style="width:100%;padding:5px;margin-top:5px;cursor:pointer;";
  close.onclick=()=>{P.remove(),document.getElementById("deviceOverviewPanel")?.remove(),dailyWork.remove()};
  P.appendChild(close);

  let D=document.createElement("div");
  D.id="deviceOverviewPanel";
  D.style="position:fixed;top:10px;right:350px;width:200px;max-height:80%;overflow:auto;padding:10px;background:#eef;z-index:99998;border-radius:5px;box-shadow:0 0 10px rgba(0,0,0,0.3);";
  D.innerHTML='<b style="text-align:center;display:block;">Device Overview</b><hr>'+Object.keys(data).map(d=>`<li>${d}: ${data[d]._utteranceCount||0}</li>`).join("");

  const devCopy=document.createElement("button");
  devCopy.textContent="Copy Devices";
  devCopy.style="width:100%;padding:5px;margin-top:5px;cursor:pointer;";
  devCopy.onclick=()=>{navigator.clipboard.writeText(copyDevices()).then(()=>alert("Copied Devices!"))};
  D.appendChild(devCopy);

  const fullReport=document.createElement("button");
  fullReport.textContent="Copy Full Report";
  fullReport.style="width:100%;padding:5px;margin-top:5px;cursor:pointer;";
  fullReport.onclick=()=>{navigator.clipboard.writeText(copyFullAudit()).then(()=>alert("Copied Full Report!"))};
  D.appendChild(fullReport);

  document.body.appendChild(D);
  document.body.appendChild(P);
}

autoScrollAndLoad(setFilterDates);
})();

