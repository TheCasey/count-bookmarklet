javascript:(function(){
  // Global variables
  let data = {}, dateData = {}, utterances = [];
  let startDate = null, endDate = null, firstValidTime = null, lastValidTime = null;
  let scrollCheck;
  let textInputDevices = {}; // deviceName -> true if marked as text input

  // Classify an utterance based on its transcript element and device
  function classifyUtterance(device, tElem) {
    let text = tElem ? tElem.innerText : "";
    let lowerText = text.toLowerCase().trim();
    let category = null;
    // System Replacements: missing transcript or known system phrases
    if (!text.trim() || lowerText.includes("no text stored") || lowerText.includes("audio was not intended") || lowerText.includes("audio could not be understood")) {
      category = "System Replacements";
    } else {
      let words = lowerText.split(/\s+/);
      if (words.length === 1) {
        category = "Subtractions";
      } else if (words.length === 2 && ["alexa","echo","ziggy","computer"].includes(words[0])) {
        category = "Subtractions";
      }
      // Tap / routine utterances: if they include "tap /"
      if (lowerText.includes("tap /")) {
        if (device.toLowerCase().includes("echo")) {
          category = "Subtractions";
        } else {
          if (textInputDevices[device]) {
            // For text input devices, don't count tap/routine as subtraction
            if(category==="Subtractions") category = null;
          } else {
            if (!category) category = "Subtractions";
          }
        }
      }
    }
    return { text, lowerText, category };
  }

  // Auto-scroll until the history page is fully loaded
  function autoScrollAndLoad(cb) {
    const p = 500, m = 6, x = 200;
    let lastScrollHeight = 0, sameCount = 0, attempts = 0;
    let stopBtn = document.createElement("button");
    stopBtn.textContent = "Stop Scrolling";
    stopBtn.style = "position:fixed;top:10px;right:10px;padding:10px;z-index:999999;background:red;color:#fff;border-radius:5px;cursor:pointer;";
    stopBtn.onclick = () => { clearInterval(scrollCheck); stopBtn.remove(); setTimeout(setFilterDates, 1000); };
    document.body.appendChild(stopBtn);
    scrollCheck = setInterval(() => {
      attempts++;
      let loadingElem = document.querySelector(".full-width-message");
      if (loadingElem) {
        loadingElem.scrollIntoView({ behavior:"smooth", block:"center" });
      } else {
        window.scrollBy({ top: innerHeight, behavior:"smooth" });
      }
      let newScrollHeight = document.body.scrollHeight;
      if (newScrollHeight === lastScrollHeight) {
        sameCount++;
      } else {
        sameCount = 0;
      }
      lastScrollHeight = newScrollHeight;
      if (sameCount >= m || attempts >= x) {
        if (loadingElem && loadingElem.innerText.match(/loading more/i)) {
          sameCount = m - 2;
        } else {
          clearInterval(scrollCheck);
          stopBtn.remove();
          setTimeout(setFilterDates, 1500);
        }
      }
    }, p);
  }

  // Read date filters then trigger UI
  function setFilterDates() {
    const s = document.querySelector("#date-start"), e = document.querySelector("#date-end");
    let currentYear = new Date().getFullYear();
    let startInput = s ? (s.value.length < 10 ? s.value + "/" + currentYear : s.value) : "";
    let endInput = e ? (e.value.length < 10 ? e.value + "/" + currentYear : e.value) : "";
    startDate = startInput ? new Date(new Date(startInput + " 20:00:00").toLocaleString("en-US",{timeZone:"America/New_York"})) : null;
    endDate = endInput ? new Date(new Date(endInput + " 18:00:00").toLocaleString("en-US",{timeZone:"America/New_York"})) : null;
    ui();
  }

  // Process each Alexa history entry: build utterance list and device tallies
  function proc() {
    data = {}; dateData = {}; utterances = [];
    firstValidTime = null; lastValidTime = null;
    let wakeVariants = ["hey alexa","alexa","hey echo","echo","hey ziggy","ziggy","hey computer","computer"];
    document.querySelectorAll(".apd-content-box.with-activity-page").forEach(e => {
      let dElem = e.querySelector(".device-name"),
          tElem = e.querySelector(".customer-transcript") || e.querySelector(".replacement-text"),
          items = e.querySelectorAll(".record-info .item");
      if (dElem && tElem && items.length >= 2) {
        let device = dElem.innerText.trim(),
            dateStr = items[0].innerText.trim(),
            timeStr = items[1].innerText.trim(),
            fullDateStr = dateStr + " " + timeStr,
            dateObj = new Date(fullDateStr);
        if (startDate && endDate && (dateObj < startDate || dateObj > endDate)) return;
        let classification = classifyUtterance(device, tElem);
        let utt = {
          device: device,
          text: classification.text,
          lowerText: classification.lowerText,
          timestamp: dateObj,
          category: classification.category, // "Subtractions" or "System Replacements" or null
          includeInReport: true
        };
        // Normalize text by stripping any leading quotes
        let normalized = utt.lowerText.replace(/^["']+/, '');
        for (let variant of wakeVariants) {
          if (normalized.startsWith(variant)) {
            utt.wakeWord = variant;
            break;
          }
        }
        utterances.push(utt);
        if (!data[device]) {
          data[device] = { _utteranceCount: 0, "Subtractions": 0, "System Replacements": 0, "Wake Word Usage": {} };
        }
        data[device]._utteranceCount++;
        if (utt.category === "Subtractions") {
          if (!(utt.lowerText.includes("tap /") && textInputDevices[device])) {
            data[device]["Subtractions"]++;
          }
        }
        if (utt.category === "System Replacements") data[device]["System Replacements"]++;
        if (utt.wakeWord) {
          data[device]["Wake Word Usage"][utt.wakeWord] = (data[device]["Wake Word Usage"][utt.wakeWord] || 0) + 1;
        }
        dateData[dateStr] = (dateData[dateStr] || 0) + 1;
        if (!firstValidTime || dateObj < firstValidTime) firstValidTime = dateObj;
        if (!lastValidTime || dateObj > lastValidTime) lastValidTime = dateObj;
      }
    });
    dateData.firstValid = firstValidTime ? firstValidTime.toLocaleString("en-US",{timeZone:"America/New_York"}) : "N/A";
    dateData.lastValid = lastValidTime ? lastValidTime.toLocaleString("en-US",{timeZone:"America/New_York"}) : "N/A";
  }

  // Build text report for a given category (aggregated by phrase)
  function copyCategory(category, filterDevice) {
    let output = category + ":\n";
    let filtered = utterances.filter(u =>
      u.category === category && (filterDevice === "All Devices" || u.device === filterDevice) && u.includeInReport
    );
    if (category === "Subtractions") {
      // Exclude tap/routine utterances for text input devices
      filtered = filtered.filter(u => !(u.lowerText.includes("tap /") && textInputDevices[u.device]));
    }
    let counts = {};
    filtered.forEach(u => { counts[u.text] = (counts[u.text] || 0) + 1; });
    for (let key in counts) { output += `\`${key}: ${counts[key]}\n\``; }
    let total = Object.values(counts).reduce((a, b) => a + b, 0);
    output += `\`Total: ${total}\n\``;
    return output;
  }

  // Aggregate wake word usage counts by variant.
  function copyWakeWordUsage(filterDevice) {
    let output = "Wake Word Usage:\n";
    let filtered;
    if(filterDevice === "All Devices"){
      let agg = {};
      for(let dev in data){
        let usage = data[dev]["Wake Word Usage"] || {};
        for(let variant in usage){
          agg[variant] = (agg[variant] || 0) + usage[variant];
        }
      }
      for(let variant in agg){
        output += `\`${variant}: ${agg[variant]}\n\``;
      }
      let totalAll = Object.values(data).reduce((sum, d) => sum + (d._utteranceCount || 0), 0);
      let totalWake = Object.values(agg).reduce((sum, count) => sum + count, 0);
      output += `\`Total: ${totalWake} (${ totalAll ? ((totalWake/totalAll)*100).toFixed(1) : 0 }% of utterances)\n\``;
    } else {
      let usage = data[filterDevice]["Wake Word Usage"] || {};
      for(let variant in usage){
        output += `\`${variant}: ${usage[variant]}\n\``;
      }
      let totalUtter = data[filterDevice]._utteranceCount || 0;
      let totalWake = Object.values(usage).reduce((sum, count) => sum + count, 0);
      output += `\`Total: ${totalWake} (${ totalUtter ? ((totalWake/totalUtter)*100).toFixed(1) : 0 }% of utterances)\n\``;
    }
    return output;
  }

  function copyDevices() {
    let out = "Device Overview:\n";
    for (let d in data) out += d + ": " + (data[d]._utteranceCount || 0) + "\n";
    return out;
  }

  function copyDates() {
    let txt = `\`First Valid: ${dateData.firstValid || "N/A"}\nLast Valid: ${dateData.lastValid || "N/A"} ET\n\nDaily Work:\n\``;
    for (let dt in dateData) { if (dt !== "firstValid" && dt !== "lastValid") txt += dt + ": " + dateData[dt] + "\n"; }
    return txt;
  }

  function copyFullAudit() {
    let out = copyDevices() + "\n\n";
    out += copyWakeWordUsage("All Devices") + "\n\n";
    out += copyCategory("Subtractions", "All Devices") + "\n\n";
    out += copyCategory("System Replacements", "All Devices") + "\n\n";
    out += "Per-Device Wake Word Usage:\n";
    for (let d in data) {
      let usage = "";
      for (let variant in data[d]["Wake Word Usage"]) {
        usage += `\`${variant}: ${data[d]["Wake Word Usage"][variant]}\n\``;
      }
      if (usage) out += `\`\n${d}:\n\`\n` + usage + "\n";
    }
    out += "\nPer-Device Subtractions:\n";
    for (let d in data) {
      let sub = copyCategory("Subtractions", d);
      if (sub.includes(":")) out += `\`\n${d}:\n\`\n` + sub + "\n";
    }
    out += "\nPer-Device System Replacements:\n";
    for (let d in data) {
      let sys = copyCategory("System Replacements", d);
      if (sys.includes(":")) out += `\`\n${d}:\n\`\n` + sys + "\n";
    }
    out += "\n" + copyDates();
    return out;
  }

  // New: View Wake Word Usage panel that aggregates counts and shows percentage
  function viewWakeWord(filterDevice) {
    let panel = document.createElement("div");
    panel.style = "position:fixed;top:100px;left:50px;width:400px;max-height:80%;overflow:auto;padding:10px;background:#fff;z-index:100000;border:2px solid #000;border-radius:5px;";
    let header = "";
    let aggregatedUsage = {};
    let totalWakeUsage = 0, totalUtterances = 0;
    if(filterDevice === "All Devices"){
      header = "Wake Word Usage for All Devices";
      for(let dev in data){
        totalUtterances += data[dev]._utteranceCount;
        let usage = data[dev]["Wake Word Usage"] || {};
        for(let variant in usage){
          aggregatedUsage[variant] = (aggregatedUsage[variant] || 0) + usage[variant];
          totalWakeUsage += usage[variant];
        }
      }
    } else {
      header = `Wake Word Usage for ${filterDevice}`;
      totalUtterances = data[filterDevice]._utteranceCount || 0;
      let usage = data[filterDevice]["Wake Word Usage"] || {};
      for(let variant in usage){
        aggregatedUsage[variant] = usage[variant];
        totalWakeUsage += usage[variant];
      }
    }
    let percentage = totalUtterances ? ((totalWakeUsage / totalUtterances)*100).toFixed(1) : "0";
    panel.innerHTML = `<b>${header}</b><hr>`;
    for(let variant in aggregatedUsage){
      panel.innerHTML += `${variant} - ${aggregatedUsage[variant]}<br>`;
    }
    panel.innerHTML += `<br>Total: ${totalWakeUsage} (${percentage}% of utterances)<br>`;
    let closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.style = "width:100%;padding:5px;margin-top:5px;cursor:pointer;";
    closeBtn.onclick = () => panel.remove();
    panel.appendChild(closeBtn);
    document.body.appendChild(panel);
  }

  // Panel to view utterances for a given subtraction category
  function viewSubtractions(category, filterDevice) {
    let panel = document.createElement("div");
    panel.style = "position:fixed;top:100px;left:50px;width:400px;max-height:80%;overflow:auto;padding:10px;background:#fff;z-index:100000;border:2px solid #000;border-radius:5px;";
    panel.innerHTML = `<b>${category} for ${filterDevice}</b><hr>`;
    let list = utterances.filter(u => u.category === category && (filterDevice === "All Devices" || u.device === filterDevice));
    list.forEach(u => {
      let div = document.createElement("div");
      let checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = u.includeInReport;
      checkbox.onchange = ()=>{ u.includeInReport = checkbox.checked; renderCategoryCounts(); };
      div.appendChild(checkbox);
      let span = document.createElement("span");
      span.textContent = ` [${u.device}] ${u.text}`;
      div.appendChild(span);
      panel.appendChild(div);
    });
    let closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.style = "width:100%;padding:5px;margin-top:5px;cursor:pointer;";
    closeBtn.onclick = () => panel.remove();
    panel.appendChild(closeBtn);
    document.body.appendChild(panel);
  }

  // Expose view functions for inline onclick calls using proper escaping
  window.viewWakeWord = viewWakeWord;
  window.viewSubtractions = viewSubtractions;

  // Render the main UI counts – displays a per-device header and inline view links.
  function renderCategoryCounts() {
    let container = document.getElementById("categoryCounts");
    if(container) {
      container.innerHTML = "";
      let device = document.getElementById("deviceFilter").value;
      container.innerHTML += `<b>Device: ${device}</b><br><br>`;
      let wakeCount = utterances.filter(u => u.wakeWord && (device==="All Devices" || u.device===device)).length;
      container.innerHTML += `<b>Wake Word Usage:</b> ${wakeCount} <small style="color:blue;cursor:pointer;" onclick="viewWakeWord(${JSON.stringify(device)})">(view)</small><br>`;
      let singleCount = utterances.filter(u =>
         u.category==="Subtractions" && (device==="All Devices" || u.device===device) &&
         !(u.lowerText.includes("tap /") && textInputDevices[u.device]) && u.includeInReport
      ).length;
      let sysCount = utterances.filter(u =>
         u.category==="System Replacements" && (device==="All Devices" || u.device===device) && u.includeInReport
      ).length;
      container.innerHTML += `<b>Subtractions:</b><br>`;
      container.innerHTML += `&nbsp;&nbsp;Single word - ${singleCount} <small style="color:blue;cursor:pointer;" onclick="viewSubtractions('Subtractions', ${JSON.stringify(device)})">(view)</small><br>`;
      container.innerHTML += `&nbsp;&nbsp;System Replacements - ${sysCount} <small style="color:blue;cursor:pointer;" onclick="viewSubtractions('System Replacements', ${JSON.stringify(device)})">(view)</small><br>`;
    }
  }

  // Main UI panel – includes device selector, counts, copy buttons, and device overview with text input checkboxes.
  function ui() {
    proc();
    let dailyWork = document.createElement("div");
    dailyWork.style = "position:fixed;top:250px;right:350px;width:200px;max-height:80%;overflow:auto;padding:10px;background:#efe;z-index:99997;border-radius:5px;box-shadow:0 0 10px rgba(0,0,0,0.3);";
    dailyWork.innerHTML = `<b style="text-align:center;display:block;">First Valid: ${dateData.firstValid||"N/A"}<br>Last Valid: ${dateData.lastValid||"N/A"} ET</b><hr>`;
    for(let dt in dateData) {
      if(dt!=="firstValid" && dt!=="lastValid")
         dailyWork.innerHTML += dt+": "+dateData[dt]+"<br>";
    }
    document.body.appendChild(dailyWork);

    let P = document.createElement("div");
    P.style = "position:fixed;top:10px;right:10px;width:320px;max-height:80%;overflow:auto;padding:10px;background:#f9f9f9;z-index:99999;border-radius:5px;box-shadow:0 0 10px rgba(0,0,0,0.3);";
    P.innerHTML = '<b style="display:block;text-align:center;">Audit Results</b><hr>';
    let F = document.createElement("select");
    F.style = "width:100%;margin-bottom:10px;";
    let options = ["All Devices", ...Object.keys(data)].map(d => `<option>${d}</option>`).join("");
    F.innerHTML = options;
    F.id = "deviceFilter";
    F.onchange = () => renderCategoryCounts();
    P.appendChild(F);

    let catDiv = document.createElement("div");
    catDiv.id = "categoryCounts";
    P.appendChild(catDiv);
    renderCategoryCounts();

    let btnCopyFull = document.createElement("button");
    btnCopyFull.textContent = "Copy Full Report";
    btnCopyFull.style = "width:100%;padding:5px;margin-top:4px;cursor:pointer;";
    btnCopyFull.onclick = () => {
      let report = copyFullAudit();
      navigator.clipboard.writeText(report).then(() => alert("Copied Full Report!"));
    };
    P.appendChild(btnCopyFull);

    let btnClose = document.createElement("button");
    btnClose.textContent = "Close";
    btnClose.style = "width:100%;padding:5px;margin-top:5px;cursor:pointer;";
    btnClose.onclick = () => {
      P.remove();
      document.getElementById("deviceOverviewPanel")?.remove();
      dailyWork.remove();
    };
    P.appendChild(btnClose);
    document.body.appendChild(P);

    // Device Overview panel with text-input device checkboxes.
    let D = document.createElement("div");
    D.id = "deviceOverviewPanel";
    D.style = "position:fixed;top:10px;right:350px;width:200px;max-height:80%;overflow:auto;padding:10px;background:#eef;z-index:99998;border-radius:5px;box-shadow:0 0 10px rgba(0,0,0,0.3);";
    let header = document.createElement("b");
    header.style.textAlign = "center";
    header.style.display = "block";
    header.textContent = "Device Overview";
    D.appendChild(header);
    let ul = document.createElement("ul");
    for(let d in data) {
      let li = document.createElement("li");
      let checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = textInputDevices[d] === true;
      checkbox.onchange = function() {
        textInputDevices[d] = checkbox.checked;
        renderCategoryCounts();
      };
      li.appendChild(checkbox);
      let span = document.createElement("span");
      span.textContent = ` ${d}: ${data[d]._utteranceCount || 0}`;
      li.appendChild(span);
      ul.appendChild(li);
    }
    D.appendChild(ul);
    let devCopy = document.createElement("button");
    devCopy.textContent = "Copy Devices";
    devCopy.style = "width:100%;padding:5px;margin-top:5px;cursor:pointer;";
    devCopy.onclick = () => { navigator.clipboard.writeText(copyDevices()).then(() => alert("Copied Devices!")); };
    D.appendChild(devCopy);
    document.body.appendChild(D);
  }

  autoScrollAndLoad(setFilterDates);
})();
