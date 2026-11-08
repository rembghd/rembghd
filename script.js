/* Rembghd — Codex design + live remover logic.
   Free tier: on-device AI (@imgly/background-removal), 3/day, max 512 px.
   HD Pro: Bria RMBG-2.0 via the rembghd-api Worker, $12/month, 100 HD images.
   No API key ever lives in this file. */
const API = "https://rembghd-api.qs62765.workers.dev";
const CDN = "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.3/+esm";
const FREE_LIMIT = 3, LOWRES_MAX = 512;
const HD_PRICE = "$12/month", HD_LIMIT = 100;

const $ = (id) => document.getElementById(id);
const $$ = (s, root) => [...(root || document).querySelectorAll(s)];
const workspace = $("workspace"), dropZone = $("dropZone"), imageInput = $("imageInput"),
      processing = $("processing"), resultBox = $("result"),
      barInner = $("barInner"), statusText = $("statusText"), statusHint = $("statusHint"),
      errorBox = $("errorBox"), stage = $("compareStage"),
      origLayer = $("originalImage"), topWrap = $("compareBefore"),
      resultCanvas = $("resultCanvas"), compareRange = $("compareRange"),
      compareLine = $("compareLine"), metaLine = $("metaLine"), queueBox = $("queue"),
      processRow = $("processRow"), processBtn = $("processBtn");

// ---- header / toast (Codex design) ---------------------------------------
$("year").textContent = new Date().getFullYear();
function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}
$("menuToggle").addEventListener("click", () => {
    const btn = $("menuToggle"), nav = document.querySelector(".desktop-nav");
    const opened = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!opened));
    if (!opened) {
        nav.style.display = "flex"; nav.style.position = "absolute"; nav.style.top = "64px";
        nav.style.left = "0"; nav.style.right = "0"; nav.style.padding = "18px 22px";
        nav.style.background = "#fff"; nav.style.borderBottom = "1px solid #edf0f4";
        nav.style.flexDirection = "column"; nav.style.gap = "18px";
    } else nav.removeAttribute("style");
});

// ---- state ---------------------------------------------------------------
let items = [];            // {id, file, name, thumbURL, origURL, status, tier, resultBlob, resultURL, restoreImg, error}
let currentId = null;
let chosenTier = "free";   // 'free' | 'hd'
let hdAvailable = false;
let freeRemaining = FREE_LIMIT;
let paidInfo = null;       // {active, used, remaining}
let licenceKey = localStorage.getItem("rembghd_licence") || "";
let chosenBg = "transparent";
let bgImageURL = null;
let brushMode = "erase";
let drawing = false, lastPt = null;
let seq = 0;

// ---- on-device engine (free tier) ----------------------------------------
let removeBackgroundFn = null, preloadFn = null, enginePromise = null;
const progressMap = new Map();
let lastProgressAt = 0;

function loadEngine() {
    if (!enginePromise) {
        enginePromise = import(CDN).then((ns) => {
            removeBackgroundFn = ns.removeBackground || ns.default || (ns.default && ns.default.removeBackground);
            preloadFn = ns.preload || (ns.default && ns.default.preload);
            if (!removeBackgroundFn) throw new Error("engine export missing");
            return true;
        });
    }
    return enginePromise;
}
["pointerdown", "dragover"].forEach(ev =>
    window.addEventListener(ev, () => { loadEngine().then(() => preloadFn && preloadFn(config("isnet_fp16"))).catch(() => {}); }, { once: true }));

function config(modelName) {
    return {
        model: modelName,
        output: { format: "image/png" },
        progress: (key, current, total) => {
            if (total > 0) progressMap.set(key, current / total);
            lastProgressAt = Date.now();
            let sum = 0; progressMap.forEach(v => sum += v);
            const pct = Math.round(100 * sum / Math.max(progressMap.size, 1));
            barInner.classList.remove("indet");
            barInner.style.width = pct + "%";
            statusText.textContent = "Downloading AI engine — " + pct + "%";
            statusHint.textContent = "First time only. After this, removals are fast and fully offline-capable.";
        }
    };
}

async function transparentShare(blob) {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, 256 / bmp.width);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * scale));
    c.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let transparent = 0, total = 0;
    for (let i = 3; i < data.length; i += 16) { total++; if (data[i] < 10) transparent++; }
    return total ? transparent / total : 0;
}

async function cleanAlpha(blob) {
    try {
        const bmp = await createImageBitmap(blob);
        const c = document.createElement("canvas");
        c.width = bmp.width; c.height = bmp.height;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(bmp, 0, 0);
        const img = ctx.getImageData(0, 0, c.width, c.height);
        const d = img.data;
        for (let i = 3; i < d.length; i += 4) {
            const a = d[i];
            if (a < 28) d[i] = 0;
            else if (a > 227) d[i] = 255;
            else d[i] = Math.round((a - 28) / 199 * 255);
        }
        ctx.putImageData(img, 0, 0);
        const out = await new Promise(r => c.toBlob(r, "image/png"));
        return out || blob;
    } catch (e) { return blob; }
}

async function runRemoval(file) {
    const modes = ["isnet_fp16", "isnet_quint8", "small", undefined];
    let lastErr = null;
    for (let i = 0; i < modes.length; i++) {
        try {
            if (i > 0) { statusText.textContent = "Trying a more compatible mode…"; progressMap.clear(); }
            const raw = await removeBackgroundFn(file, config(modes[i]));
            const share = await transparentShare(raw);
            if (share > 0.02 && share < 0.98) return await cleanAlpha(raw);
            lastErr = new Error("empty mask from mode " + modes[i]);
        } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("removal failed");
}

// Downscale to the free low-res ceiling (max 512 px long side).
async function downscaleImage(file, maxDim) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    if (scale >= 1) return file;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext("2d");
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, "image/png"));
}

function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }

// ---- server status / free counter / licence -------------------------------
function localFreeKey() { return "rembghd_free_" + new Date().toISOString().slice(0, 10); }
function localFreeUsed() { return parseInt(localStorage.getItem(localFreeKey()) || "0", 10) || 0; }
function bumpLocalFree() { localStorage.setItem(localFreeKey(), String(localFreeUsed() + 1)); }

function updateCounter() {
    const el = $("freeCounter");
    if (paidInfo && paidInfo.active) {
        el.textContent = "⭐ Pro active — " + paidInfo.remaining + " of " + HD_LIMIT + " HD images left this month";
    } else if (freeRemaining > 0) {
        el.textContent = "Free today: " + freeRemaining + " of " + FREE_LIMIT + " low-res removals left";
    } else {
        el.textContent = "You have used today's " + FREE_LIMIT + " free removals — come back tomorrow, or get Pro (" + HD_PRICE + ", " + HD_LIMIT + " HD images).";
    }
}

async function loadStatus() {
    try {
        const q = licenceKey ? "?licence=" + encodeURIComponent(licenceKey) : "";
        const res = await fetch(API + "/api/status" + q);
        if (!res.ok) throw new Error("status " + res.status);
        const j = await res.json();
        hdAvailable = !!j.hdAvailable;
        freeRemaining = Math.max(0, Math.min(j.free.remaining, FREE_LIMIT - localFreeUsed()));
        paidInfo = j.paid;
    } catch (e) {
        hdAvailable = false;
        freeRemaining = Math.max(0, FREE_LIMIT - localFreeUsed());
        paidInfo = null;
    }
    const pill = $("hdPill");
    if (hdAvailable) { pill.textContent = "READY"; pill.classList.add("ok"); }
    else { pill.textContent = "SET UP"; pill.classList.remove("ok"); }
    if (licenceKey) { $("licenceBox").style.display = "block"; $("licenceInput").value = licenceKey; }
    updateCounter();
    refreshHdNotice();
}

function refreshHdNotice() {
    const n = $("hdNotice");
    if (chosenTier === "hd" && !hdAvailable) {
        n.style.display = "block";
        n.textContent = "⏳ HD removal is being set up — the server key is being connected. Free low-res works right now; HD unlocks as soon as setup finishes.";
    } else if (chosenTier === "hd" && hdAvailable && !(paidInfo && paidInfo.active)) {
        n.style.display = "block";
        n.textContent = "🔑 HD is a Pro feature (" + HD_PRICE + ", " + HD_LIMIT + " HD images/month). Paste your licence key below, or buy Pro and we will email you one.";
    } else {
        n.style.display = "none";
    }
}

async function reportFreeUse() {
    try {
        const res = await fetch(API + "/api/free-use", { method: "POST" });
        if (res.ok) { const j = await res.json(); freeRemaining = j.remaining; updateCounter(); return true; }
        if (res.status === 429) { freeRemaining = 0; updateCounter(); return false; }
    } catch (e) { /* offline: local counter below */ }
    bumpLocalFree();
    freeRemaining = Math.max(0, FREE_LIMIT - localFreeUsed());
    updateCounter();
    return freeRemaining >= 0;
}

async function serverRemove(file) {
    const fd = new FormData();
    fd.append("image", file);
    fd.append("licence", licenceKey);
    const res = await fetch(API + "/api/remove", { method: "POST", body: fd });
    if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || ("HD removal failed (" + res.status + ")"));
    }
    const used = res.headers.get("X-HD-Remaining");
    if (used !== null && paidInfo) { paidInfo.remaining = parseInt(used, 10); updateCounter(); }
    return await res.blob();
}

// ---- queue -----------------------------------------------------------------
function showError(msg) {
    processing.style.display = "none";
    errorBox.style.display = "block";
    errorBox.textContent = "❌ " + msg;
}

function addFiles(files) {
    let added = 0;
    for (const f of files) {
        if (!/^image\//.test(f.type)) continue;
        if (f.size > 25 * 1024 * 1024) { toast("Please choose an image smaller than 25 MB."); continue; }
        const id = ++seq;
        items.push({ id, file: f, name: f.name, thumbURL: URL.createObjectURL(f),
            origURL: URL.createObjectURL(f), status: "queued", tier: chosenTier,
            resultBlob: null, resultURL: null, restoreImg: null, error: null });
        added++;
    }
    if (added) {
        renderQueue();
        processRow.hidden = false;
        if (workspace.hidden) {
            workspace.hidden = false;
            workspace.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }
}

function renderQueue() {
    queueBox.innerHTML = "";
    for (const it of items) {
        const row = document.createElement("div");
        row.className = "q-row" + (it.id === currentId ? " sel" : "");
        row.onclick = () => { if (it.status === "done") showItem(it.id); };
        const stCls = it.status === "done" ? "done" : it.status === "error" ? "err" : (it.status === "busy" ? "busy" : "");
        const stTxt = it.status === "done" ? "Done ✓" : it.status === "error" ? "Failed" : it.status === "busy" ? "Working…" : "Queued";
        row.innerHTML = '<img alt=""><div class="nm"><b></b><span></span></div><span class="st ' + stCls + '">' + stTxt + '</span>' +
            (it.status === "done" ? '<button class="mini">Download</button>' : '');
        row.querySelector("img").src = it.thumbURL;
        row.querySelector("b").textContent = it.name;
        row.querySelector("span").textContent = (it.tier === "hd" ? "HD Pro" : "Free low-res") + (it.resultBlob ? " · " + Math.round(it.resultBlob.size / 1024) + " KB" : "");
        const dl = row.querySelector(".mini");
        if (dl) dl.onclick = (e) => { e.stopPropagation(); downloadItem(it); };
        queueBox.appendChild(row);
    }
}

async function processQueue() {
    errorBox.style.display = "none";
    const todo = items.filter(i => i.status === "queued");
    if (!todo.length) return;
    if (chosenTier === "hd") {
        if (!hdAvailable) { showError("HD removal is being set up — the server key is being connected. Switch to Free low-res for now, or try HD again later."); return; }
        if (!(paidInfo && paidInfo.active)) {
            showError("HD needs an active Pro licence. Paste your licence key in the Pro licence box below, or buy Pro (" + HD_PRICE + ").");
            $("licenceBox").style.display = "block";
            $("licenceBox").scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }
    }
    const freeNeeded = todo.filter(i => i.tier === "free").length;
    if (freeNeeded > freeRemaining) {
        showError("You have " + freeRemaining + " free removal" + (freeRemaining === 1 ? "" : "s") + " left today, but " + freeNeeded + " image" + (freeNeeded === 1 ? " is" : "s are") + " queued. Remove some, come back tomorrow, or get Pro (" + HD_PRICE + ").");
        return;
    }
    for (const it of todo) {
        it.status = "busy"; renderQueue();
        try {
            await processItem(it);
            it.status = "done";
        } catch (err) {
            console.error(err);
            it.status = "error"; it.error = err.message || String(err);
        }
        renderQueue();
    }
    processing.style.display = "none";
    const done = items.filter(i => i.status === "done");
    if (done.length) showItem(done[done.length - 1].id);
    else showError("Nothing could be processed. Please try again.");
}

async function processItem(it) {
    processing.style.display = "block";
    resultBox.style.display = "none";
    progressMap.clear();
    barInner.style.width = "0%";
    barInner.classList.remove("indet");
    $("procThumb").src = it.thumbURL;
    origLayer.src = it.origURL;
    const probe = new Image();
    probe.onload = () => { stage.style.aspectRatio = probe.naturalWidth + " / " + probe.naturalHeight; };
    probe.src = it.origURL;
    lastProgressAt = 0;
    const watcher = setInterval(() => {
        if (lastProgressAt && Date.now() - lastProgressAt > 1600 && processing.style.display === "block") {
            barInner.classList.add("indet");
            statusText.textContent = "Removing background…";
            statusHint.textContent = it.tier === "hd" ? "Server AI is working — full resolution." : "AI is working on your device — big photos can take a little while.";
        }
    }, 700);
    try {
        let blob;
        if (it.tier === "hd") {
            statusText.textContent = "Removing background in HD…";
            statusHint.textContent = "Server AI (Bria RMBG-2.0) — full resolution.";
            blob = await serverRemove(it.file);
            it.restoreImg = await loadImg(it.origURL);
        } else {
            statusText.textContent = "Loading AI engine…";
            statusHint.textContent = "";
            await loadEngine();
            const small = await downscaleImage(it.file, LOWRES_MAX);
            it.restoreImg = await loadImg(URL.createObjectURL(small));
            blob = await runRemoval(small);
            await reportFreeUse();
        }
        clearInterval(watcher);
        it.resultBlob = blob;
        if (it.resultURL) URL.revokeObjectURL(it.resultURL);
        it.resultURL = URL.createObjectURL(blob);
    } catch (err) {
        clearInterval(watcher);
        throw err;
    }
}

function showItem(id) {
    const it = items.find(i => i.id === id);
    if (!it || !it.resultBlob) return;
    currentId = id;
    processing.style.display = "none";
    errorBox.style.display = "none";
    const img = new Image();
    img.onload = () => {
        resultCanvas.width = img.naturalWidth;
        resultCanvas.height = img.naturalHeight;
        const ctx = resultCanvas.getContext("2d");
        ctx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
        ctx.drawImage(img, 0, 0);
        stage.style.aspectRatio = img.naturalWidth + " / " + img.naturalHeight;
        origLayer.src = it.origURL;
        compareRange.value = 100;
        applyCompare();
        setBg("transparent");
        metaLine.textContent = "Output: " + img.naturalWidth + " × " + img.naturalHeight + " px · " +
            (it.resultBlob.size / 1024).toFixed(0) + " KB PNG · " + (it.tier === "hd" ? "HD Pro" : "Free low-res (max 512 px)");
        $("downloadBtn").textContent = it.tier === "hd" ? "⬇️ Download HD PNG" : "⬇️ Download low-res PNG";
    };
    img.src = it.resultURL;
    resultBox.style.display = "block";
    renderQueue();
}

// ---- compare + background --------------------------------------------------
// Range 100 = After (result fully visible, before overlay width 0).
function applyCompare() {
    const v = Number(compareRange.value);
    topWrap.style.width = (100 - v) + "%";
    compareLine.style.left = (100 - v) + "%";
}
compareRange.addEventListener("input", applyCompare);

function setBg(kind, value) {
    chosenBg = kind === "image" ? "image" : (value || "transparent");
    $$(".swatch[data-bg]").forEach(s => s.classList.toggle("active", s.dataset.bg === chosenBg));
    if (chosenBg === "transparent") {
        stage.classList.add("checkerboard");
        stage.style.backgroundImage = ""; stage.style.backgroundColor = "";
    } else if (chosenBg === "image") {
        stage.classList.remove("checkerboard");
        stage.style.backgroundImage = "url(" + bgImageURL + ")";
        stage.style.backgroundSize = "cover"; stage.style.backgroundPosition = "center";
        stage.style.backgroundColor = "";
    } else {
        stage.classList.remove("checkerboard");
        stage.style.backgroundImage = "none"; stage.style.backgroundColor = chosenBg;
    }
}
$("swatches").addEventListener("click", (e) => {
    const b = e.target.closest(".swatch[data-bg]");
    if (b) setBg("color", b.dataset.bg);
});
$("customColor").addEventListener("input", (e) => setBg("color", e.target.value));
$("bgImgBtn").addEventListener("click", () => $("bgInput").click());
$("bgInput").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (bgImageURL) URL.revokeObjectURL(bgImageURL);
    bgImageURL = URL.createObjectURL(f);
    setBg("image");
});

// ---- erase / restore brush ---------------------------------------------------
function brushPos(e) {
    const r = resultCanvas.getBoundingClientRect();
    return {
        x: (e.clientX - r.left) * (resultCanvas.width / r.width),
        y: (e.clientY - r.top) * (resultCanvas.height / r.height),
    };
}
function brushStamp(p) {
    const it = items.find(i => i.id === currentId);
    if (!it) return;
    const ctx = resultCanvas.getContext("2d");
    const r = Number($("brushSize").value) * (resultCanvas.width / Math.max(resultCanvas.getBoundingClientRect().width, 1));
    if (brushMode === "erase") {
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    } else if (it.restoreImg) {
        ctx.save();
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(it.restoreImg, 0, 0, resultCanvas.width, resultCanvas.height);
        ctx.restore();
    }
}
function brushLine(a, b) {
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const r = Number($("brushSize").value);
    const steps = Math.max(1, Math.ceil(dist / (r / 2)));
    for (let i = 0; i <= steps; i++) {
        brushStamp({ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps });
    }
}
resultCanvas.addEventListener("pointerdown", (e) => {
    if (!currentId) return;
    drawing = true; lastPt = brushPos(e);
    resultCanvas.setPointerCapture(e.pointerId);
    brushStamp(lastPt);
    e.preventDefault();
});
resultCanvas.addEventListener("pointermove", (e) => {
    if (!drawing || !lastPt) return;
    const p = brushPos(e);
    brushLine(lastPt, p);
    lastPt = p;
});
["pointerup", "pointercancel", "pointerleave"].forEach(ev =>
    resultCanvas.addEventListener(ev, () => { drawing = false; lastPt = null; }));
$("brushSize").addEventListener("input", (e) => { $("brushValue").textContent = e.target.value + " px"; });
$$(".tool-tab").forEach(btn => btn.addEventListener("click", () => {
    $$(".tool-tab").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    brushMode = btn.dataset.tool;
    toast(brushMode === "erase" ? "Erase brush selected" : "Restore brush selected");
}));

// ---- download ----------------------------------------------------------------
function canvasBlob(canvas) { return new Promise(r => canvas.toBlob(r, "image/png")); }
function triggerDownload(url, name) { const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }

async function downloadItem(it) {
    if (!it || !it.resultBlob) return;
    const base = it.name.replace(/\.[^.]+$/, "") || "image";
    const suffix = it.tier === "hd" ? "-no-bg-hd.png" : "-no-bg.png";
    // Re-read the (possibly brush-edited) canvas when this is the shown item.
    let fgURL = it.resultURL, fgW = 0, fgH = 0;
    if (it.id === currentId) {
        const b = await canvasBlob(resultCanvas);
        if (b) { fgURL = URL.createObjectURL(b); fgW = resultCanvas.width; fgH = resultCanvas.height; }
    } else {
        const img = await loadImg(it.resultURL);
        fgW = img.naturalWidth; fgH = img.naturalHeight;
    }
    if (chosenBg === "transparent" && it.id === currentId) {
        const b = await canvasBlob(resultCanvas);
        triggerDownload(URL.createObjectURL(b), base + suffix);
        return;
    }
    if (chosenBg === "transparent") { triggerDownload(it.resultURL, base + suffix); return; }
    const fg = await loadImg(fgURL);
    const canvas = document.createElement("canvas");
    canvas.width = fg.naturalWidth; canvas.height = fg.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (chosenBg === "image") {
        const bg = await loadImg(bgImageURL);
        const scale = Math.max(canvas.width / bg.naturalWidth, canvas.height / bg.naturalHeight);
        const w = bg.naturalWidth * scale, h = bg.naturalHeight * scale;
        ctx.drawImage(bg, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    } else {
        ctx.fillStyle = chosenBg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(fg, 0, 0);
    canvas.toBlob((b) => triggerDownload(URL.createObjectURL(b), base + suffix), "image/png");
}
$("downloadBtn").addEventListener("click", () => downloadItem(items.find(i => i.id === currentId)));

$("againBtn").addEventListener("click", () => {
    resultBox.style.display = "none";
    errorBox.style.display = "none";
    imageInput.value = "";
    $("upload").scrollIntoView({ behavior: "smooth", block: "start" });
});

// ---- tier pick + licence -------------------------------------------------------
function selectTier(t) {
    chosenTier = t;
    $("tierFree").classList.toggle("sel", t === "free");
    $("tierHd").classList.toggle("sel", t === "hd");
    $("licenceBox").style.display = (t === "hd") ? "block" : (licenceKey ? "block" : "none");
    refreshHdNotice();
}
$("tierFree").addEventListener("click", () => selectTier("free"));
$("tierHd").addEventListener("click", () => selectTier("hd"));
$("activateBtn").addEventListener("click", async () => {
    const key = $("licenceInput").value.trim();
    if (!key) { $("licenceStatus").textContent = "Paste your licence key first."; return; }
    $("licenceStatus").textContent = "Checking…";
    try {
        const res = await fetch(API + "/api/licence-check", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ licence: key }),
        });
        const j = await res.json();
        if (j.active) {
            licenceKey = key;
            localStorage.setItem("rembghd_licence", key);
            paidInfo = j;
            $("licenceStatus").textContent = "✅ Pro active — " + j.remaining + " of " + HD_LIMIT + " HD images left this month.";
            $("licenceStatus").style.color = "#399b7c";
            updateCounter();
            refreshHdNotice();
        } else {
            $("licenceStatus").textContent = "❌ That licence key is not valid. Check it and try again, or buy Pro.";
            $("licenceStatus").style.color = "#d92d20";
        }
    } catch (e) {
        $("licenceStatus").textContent = "Could not reach the server. Check your connection and try again.";
    }
});

// ---- input wiring ----------------------------------------------------------------
processBtn.addEventListener("click", processQueue);
$("clearBtn").addEventListener("click", () => {
    items = []; currentId = null;
    queueBox.innerHTML = "";
    processRow.hidden = true;
    resultBox.style.display = "none";
});
function openPicker() { imageInput.click(); }
$("chooseBtn").addEventListener("click", openPicker);
$("browseBtn").addEventListener("click", openPicker);
$("newImageBtn").addEventListener("click", openPicker);
dropZone.addEventListener("click", (e) => { if (e.target.closest("button,input")) return; openPicker(); });
dropZone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPicker(); } });
imageInput.addEventListener("change", () => { addFiles(imageInput.files); imageInput.value = ""; });
["dragover", "dragenter"].forEach(ev => dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add("dragover"); }));
["dragleave", "drop"].forEach(ev => dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove("dragover"); }));
dropZone.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
$("batchInput").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
document.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData || {}).items || []].filter(i => /^image\//.test(i.type)).map(i => i.getAsFile());
    if (files.length) addFiles(files);
});

loadStatus();
